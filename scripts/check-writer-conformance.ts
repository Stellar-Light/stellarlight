/**
 * Writer-conformance guard — conventions enforced by CI, not memory
 * (improvements/ideas/idea-writer-conformance-guard.md; the grandfather
 * problem: every write-path incident of 2026-08 happened on a writer that
 * predated a convention the newer writers follow).
 *
 * Four checks, all pure file reads (CI-safe, no DB/network):
 *   C1 every recurring DB writer imports the read-back verifier OR carries a
 *      dated exemption here;
 *   C2 no workflow step pipes through `| tee` without `shell: bash` —
 *      GitHub's default `bash -e` has NO pipefail, so tee masks every red
 *      (the mute-alarm class: 14 workflows, the red-issue path never fired);
 *   C3 no `process.exit(0)` in a script that also sets `process.exitCode`
 *      (the exit-stomp class, three occurrences to date);
 *   C4 every field the scanner's write-shape emits is watched by a
 *      field-population probe or allowlisted here with a dated reason
 *      (the advertised-but-never-persisted class: sdkCapabilities computed
 *      for a month, never persisted, no probe to notice).
 *
 *   pnpm exec tsx scripts/check-writer-conformance.ts
 *
 * Exits 1 on any violation. Wired into the contract CI job — a new writer
 * or workflow fails closed until it conforms.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let failures = 0;
const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => {
	failures++;
	console.log(`  ✗ ${m}`);
};

// ── C1: recurring writers carry read-back or a dated exemption ──────────
console.log("◆ C1 writers → read-back verification");
const WRITERS: Record<string, "read-back" | string> = {
	"scripts/enrich-repos.ts": "read-back",
	"scripts/enrich-from-scf.ts":
		"exemption 2026-08-12: writes verified by self-audit band-lock + " +
		"record-completeness sweeps (full-corpus, nightly) — stronger than " +
		"per-run read-back for this writer's failure mode (matcher identity)",
	"scripts/data/curate-projects.ts":
		"exemption 2026-08-12: equality-guard skips in-sync rows by design; " +
		"SCF_FIX values verified by self-audit locks (sls-043) nightly",
	"scripts/sync-lumenloop.ts":
		"exemption 2026-08-12: zero-files/item-error exit-1 shipped #776; " +
		"statusBasis floor verified corpus-wide by record-completeness S2",
	"scripts/scan/scan-repo-code.ts":
		"exemption 2026-08-12: writes ONLY through signalsToWrite (CI-asserted " +
		"write-path gate) + C4 below guards its field set end-to-end",
	"scripts/data/fix-scf-rounds.ts":
		"exemption 2026-08-12: surgical Action (dry-run default, allowlist " +
		"clears); every execute is live-verified in the run log",
};
for (const [file, expectation] of Object.entries(WRITERS)) {
	let src = "";
	try {
		src = read(file);
	} catch {
		bad(`${file} listed as a writer but missing — update WRITERS`);
		continue;
	}
	if (expectation === "read-back") {
		if (
			/from "\.\.\/src\/lib\/utils\/read-back"|from "@\/lib\/utils\/read-back"/.test(
				src,
			)
		)
			ok(`${file} imports read-back`);
		else
			bad(
				`${file} must import the read-back verifier (or document an exemption)`,
			);
	} else {
		ok(`${file} exempt: ${expectation.slice(0, 60)}…`);
	}
}

// ── C2: `| tee` without pipefail in workflows ───────────────────────────
console.log("◆ C2 workflows → no tee-muted exits");
const wfDir = join(ROOT, ".github/workflows");
for (const f of readdirSync(wfDir).filter((f) => f.endsWith(".yml"))) {
	const src = readFileSync(join(wfDir, f), "utf8");
	if (!src.includes("| tee")) continue;
	// Steps begin at a "- name:"/"- uses:"/"- run:" item; a step whose run
	// pipes through tee must declare `shell: bash` (=> pipefail) itself.
	const steps = src.split(/\n(?=\s{4,8}- )/);
	const offending = steps.filter(
		(s) => s.includes("| tee") && !/^\s*shell: bash\s*$/m.test(s),
	);
	if (offending.length)
		bad(
			`${f}: ${offending.length} step(s) pipe through tee without shell: bash`,
		);
	else ok(`${f}: all tee steps declare shell: bash`);
}

// ── C3: exit(0) stomping exitCode ───────────────────────────────────────
console.log("◆ C3 scripts → no process.exit(0) after exitCode");
const walk = (dir: string): string[] =>
	readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
		e.isDirectory()
			? walk(join(dir, e.name))
			: e.name.endsWith(".ts")
				? [join(dir, e.name)]
				: [],
	);
let c3bad = 0;
for (const f of walk("scripts")) {
	if (f.endsWith("check-writer-conformance.ts")) continue; // self: strings below
	const src = read(f);
	// statement-position only — a comment quoting the pattern is not a stomp
	if (
		src.includes("process.exitCode") &&
		/^\s*process\.exit\(0\);/m.test(src)
	) {
		bad(
			`${f} sets process.exitCode AND calls process.exit(0) — the stomp class`,
		);
		c3bad++;
	}
}
if (!c3bad) ok("no exit-stomps in scripts/");

// ── C4: scanner write-shape fields are probe-watched ────────────────────
console.log("◆ C4 write-shape fields → population probes");
/** Fields verifiably empty/irrelevant for pinned probing, each with a dated
 * reason. Growth here needs a reason, not a shrug. */
const C4_ALLOW: Record<string, string> = {
	codeSymbols:
		"stored as codeSymbols, served as codeVerified.symbols — probed via the rozo pin (2026-08-12)",
	codeScanState: "scan-state bookkeeping, not a served fact (2026-08-12)",
	codeScanNote: "scan-state bookkeeping (2026-08-12)",
	codeScannedAt:
		"served as scannedAt; probed via codeConfidence pin (2026-08-12)",
	contractMacroCount: "internal fact feeding isDeployableContract (2026-08-12)",
	hasAuthPatterns:
		"internal boolean fact, not individually served (2026-08-12)",
	hasStoragePatterns: "internal boolean fact (2026-08-12)",
	hasEvents: "internal boolean fact (2026-08-12)",
	usesNoStd: "internal boolean fact (2026-08-12)",
	ciPresent:
		"presence fact served on repo rows; probe once weekly re-scans populate the corpus (2026-08-13)",
	testsPresent:
		"presence fact served on repo rows; probe once weekly re-scans populate the corpus (2026-08-13)",
	stellarJsDep: "internal fact feeding proof/jsDepth (2026-08-12)",
	farmFlags: "diagnostic list; farmScore is the served judgment (2026-08-12)",
	farmScore:
		"score component of repoGrade, probed via repoScore surfaces (2026-08-12)",
	codeDepth:
		"probed implicitly: repoScore + explain both carry it (2026-08-12)",
	stellarProof:
		"every scanned row has one by construction (write gate) (2026-08-12)",
	sorobanSdkVersion:
		"legitimately null on non-Rust repos; versionStatus probed on Rust pins (2026-08-12)",
	versionStatus:
		"enum with honest 'unknown'; blend pin exercises it via protocolCaps (2026-08-12)",
	mainnetContractId: "verified-on-chain only, sparse by design (2026-08-12)",
};
const writeShape = read("scripts/scan/write-shape.ts");
const okStart = writeShape.indexOf(
	"return {",
	writeShape.indexOf('outcome !== "ok"') + 50,
);
const okBranch = writeShape.slice(
	okStart,
	writeShape.indexOf("\n\t};", okStart),
);
const emitted = [...okBranch.matchAll(/^\t\t(\w+):/gm)].map((m) => m[1]);
const probes = read("scripts/check-field-population.ts");
for (const field of emitted) {
	if (probes.includes(field)) ok(`${field} → probed`);
	else if (C4_ALLOW[field])
		ok(`${field} → allowlisted: ${C4_ALLOW[field].slice(0, 50)}…`);
	else
		bad(
			`${field} emitted by write-shape but neither probed nor allowlisted — the sdkCapabilities class`,
		);
}

console.log(
	failures
		? `\n✗ FAIL — ${failures} conformance violation(s)`
		: "\n✓ all writers conform",
);
process.exit(failures ? 1 : 0);
