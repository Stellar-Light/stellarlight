/**
 * Contract gate — makes silent API-contract drift unmergeable.
 *
 *   pnpm contract:write   # regenerate specs/openapi.json + api-client/src/schema.ts
 *   pnpm contract:check   # CI mode: fail if either committed artifact is stale
 *
 * The class this closes (2026-07-08): the spec drifted from the live contract
 * (#353 deleted a live field; getPartners was untyped) and a DOWNSTREAM
 * consumer's drift detector caught it before we did, while the hand-mirrored
 * api-client types rotted separately (getPartners: Record<string, never>).
 * The fix is contract-as-code:
 *
 *   src/lib/openapi-spec.ts             (the source of truth — a pure object)
 *        │  snapshot
 *        ▼
 *   specs/openapi.json                 (committed; PR diff SHOWS contract changes)
 *        │  openapi-typescript
 *        ▼
 *   api-client/src/schema.ts           (generated; mirror-drift impossible)
 *
 * CI (contract-gate.yml) runs --check on every PR: a spec edit without the
 * regenerated snapshot+types fails, and a snapshot change without a changelog
 * entry fails (checked in the workflow). The daily live checks
 * (check-api-drift.ts field coverage) remain the backstop for data/deploy
 * drift that PR-time can't see.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spec } from "../../src/lib/openapi-spec";

const ROOT = join(import.meta.dirname, "..", "..");
const SNAPSHOT = join(ROOT, "specs", "openapi.json");
const SCHEMA_TS = join(ROOT, "api-client", "src", "schema.ts");
const CHECK = process.argv.includes("--check");

const GENERATED_HEADER = `/**
 * GENERATED FILE — do not edit by hand.
 * Source of truth: src/lib/openapi-spec.ts → specs/openapi.json.
 * Regenerate with \`pnpm contract:write\` (CI enforces freshness via
 * \`pnpm contract:check\` in .github/workflows/contract-gate.yml).
 */
`;

function buildSnapshot(): string {
	// Deterministic, pretty-printed (stable key order comes from the object
	// literal itself), trailing newline for clean diffs.
	return `${JSON.stringify(spec, null, "\t")}\n`;
}

function buildSchemaTs(snapshotPath: string): string {
	// openapi-typescript CLI over the snapshot. Kept as an exec (not a lib
	// import) so the generated output matches exactly what any consumer
	// pointing the same tool at /api/openapi.json would get.
	const out = execFileSync(
		"pnpm",
		["exec", "openapi-typescript", snapshotPath, "--export-type=false"],
		{ cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
	);
	return GENERATED_HEADER + out;
}

function main() {
	const nextSnapshot = buildSnapshot();

	if (CHECK) {
		const stale: string[] = [];
		const haveSnapshot = existsSync(SNAPSHOT)
			? readFileSync(SNAPSHOT, "utf8")
			: "";
		if (haveSnapshot !== nextSnapshot) stale.push("specs/openapi.json");

		// Generate types from the CURRENT spec (via a temp write only when the
		// snapshot itself is stale, so the comparison is still against truth).
		const tmp = join(ROOT, "specs", ".openapi.check.json");
		writeFileSync(tmp, nextSnapshot);
		const nextSchema = buildSchemaTs(tmp);
		execFileSync("rm", ["-f", tmp]);
		const haveSchema = existsSync(SCHEMA_TS)
			? readFileSync(SCHEMA_TS, "utf8")
			: "";
		if (haveSchema !== nextSchema) stale.push("api-client/src/schema.ts");

		if (stale.length) {
			console.error(
				`✗ Contract artifacts are STALE: ${stale.join(", ")}\n` +
					"  The API spec changed without regenerating the committed contract.\n" +
					"  Fix: run `pnpm contract:write`, commit the result, and add a\n" +
					"  changelog entry (src/lib/changelog.ts) describing the change.",
			);
			process.exit(1);
		}
		console.log("✓ contract artifacts are fresh (snapshot + generated types)");
		return;
	}

	mkdirSync(dirname(SNAPSHOT), { recursive: true });
	writeFileSync(SNAPSHOT, nextSnapshot);
	console.log(`wrote specs/openapi.json (${nextSnapshot.length} bytes)`);
	const schema = buildSchemaTs(SNAPSHOT);
	writeFileSync(SCHEMA_TS, schema);
	console.log(`wrote api-client/src/schema.ts (${schema.length} bytes)`);
	console.log(
		"\nIf the diff shows contract changes: add a changelog entry (src/lib/changelog.ts) — CI requires it.",
	);
}

main();
