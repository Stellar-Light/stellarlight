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
 * entry fails (checked in the workflow). --check also holds the consumer
 * safety promises (consumer-safety.ts): every non-GET operation declares
 * x-side-effecting, and no operationId on the base branch disappears unless
 * the changelog marks it BREAKING. The daily live checks
 * (check-api-drift.ts field coverage) remain the backstop for data/deploy
 * drift that PR-time can't see.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CHANGELOG } from "../../src/lib/changelog";
import { spec } from "../../src/lib/openapi-spec";
import { API_VERSION } from "../../src/lib/version";
import {
	operationIds,
	sideEffectingProblems,
	unannouncedRemovals,
} from "./consumer-safety";

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

/** The snapshot committed where this branch forks from its base branch: the
 * operationIds consumers have today. CONTRACT_BASE overrides the base ref. */
function baseSnapshot(): { at: string; spec: object } {
	const ref =
		process.env.CONTRACT_BASE ??
		`origin/${process.env.GITHUB_BASE_REF || "main"}`;
	const git = (args: string[]) =>
		execFileSync("git", args, {
			cwd: ROOT,
			encoding: "utf8",
			maxBuffer: 64 * 1024 * 1024,
			stdio: ["ignore", "pipe", "pipe"],
		});
	const base = git(["merge-base", "HEAD", ref]).trim();
	return {
		at: `${ref} (${base.slice(0, 8)})`,
		spec: JSON.parse(git(["show", `${base}:specs/openapi.json`])),
	};
}

function consumerSafetyProblems(): { problems: string[]; base?: string } {
	const problems = sideEffectingProblems(spec);
	let base: ReturnType<typeof baseSnapshot>;
	try {
		base = baseSnapshot();
	} catch (e) {
		const why = String((e as { stderr?: unknown }).stderr || e).trim();
		problems.push(
			`could not read the base branch's specs/openapi.json to compare operationIds (${why.split("\n")[0]}): fetch origin/main, or set CONTRACT_BASE to the ref this branch merges into`,
		);
		return { problems };
	}
	for (const id of unannouncedRemovals(
		operationIds(base.spec),
		operationIds(spec),
		CHANGELOG,
		API_VERSION,
	))
		problems.push(
			`operationId ${id} is in ${base.at} and not in this spec: a removal or rename breaks every consumer keyed on it. Keep it, or add a changelog entry at spec@${API_VERSION} that names ${id} and says BREAKING`,
		);
	return { problems, base: base.at };
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
		const { problems, base } = consumerSafetyProblems();
		if (problems.length) {
			console.error(`✗ consumer safety: ${problems.length} problem(s)`);
			for (const p of problems) console.error(`   ${p}`);
			process.exit(1);
		}
		console.log(
			`✓ consumer safety: every non-GET operation declares x-side-effecting; every operationId in ${base} is served or announced BREAKING`,
		);
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
