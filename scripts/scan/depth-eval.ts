/**
 * codeDepth regression gate — CI-enforced separation on the ground-truth key.
 *
 * Runs the SHIPPED code-depth formula over the labeled DEEP/SHALLOW repos
 * (scripts/scan/depth-labels.ts) through the SAME fetch/selection unit
 * production uses (fetch-repo-code.ts — the fixture≡production anti-drift
 * guard), then asserts the separation that makes codeDepth trustworthy:
 *
 *   1. every fetched DEEP repo scores ≥ GATE.deepMin
 *   2. every fetched SHALLOW repo scores ≤ GATE.shallowMax
 *   3. min(DEEP) − max(SHALLOW) ≥ GATE.marginMin
 *   4. ≥ GATE.minCoverage of each band actually fetched (else the run is
 *      inconclusive, which is also a failure — a gate that silently skipped
 *      the key proves nothing)
 *
 * Exit 0 = separation holds. Exit 1 = a scoring change (or upstream repo
 * drift) broke it — the table printed shows exactly which repo crossed.
 * Read-only: GitHub fetches only, no DB, no writes.
 *
 *   GITHUB_TOKEN=… npx tsx scripts/scan/depth-eval.ts
 */
import { computeCodeDepth } from "../../src/lib/code-depth";
import { DEEP, GATE, SHALLOW } from "./depth-labels";
import { createGh, fetchRepoCode } from "./fetch-repo-code";

const GH = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
if (!GH) {
	console.error("Set GITHUB_TOKEN.");
	process.exit(1);
}
const gh = createGh(GH);

interface Row {
	fullName: string;
	band: "DEEP" | "SHALLOW";
	depth: number;
	why: string;
}

async function scoreBand(
	band: "DEEP" | "SHALLOW",
	list: { fullName: string; why: string }[],
): Promise<{ rows: Row[]; failed: string[] }> {
	const rows: Row[] = [];
	const failed: string[] = [];
	for (const { fullName, why } of list) {
		try {
			const r = await fetchRepoCode(gh, fullName);
			if (!r) {
				failed.push(fullName);
				continue;
			}
			const d = computeCodeDepth(r.depthInput);
			rows.push({ fullName, band, depth: d.codeDepth, why });
		} catch (e) {
			console.error(`  ! ${fullName}: ${(e as Error).message}`);
			failed.push(fullName);
		}
	}
	return { rows, failed };
}

async function main() {
	console.log(
		`depth-eval — gate: DEEP ≥ ${GATE.deepMin} · SHALLOW ≤ ${GATE.shallowMax} · margin ≥ ${GATE.marginMin} · coverage ≥ ${GATE.minCoverage * 100}%\n`,
	);

	const deep = await scoreBand("DEEP", DEEP);
	const shallow = await scoreBand("SHALLOW", SHALLOW);
	const rows = [...deep.rows, ...shallow.rows];

	const violations: string[] = [];

	console.log("band     depth   ok  repo");
	for (const r of rows.sort((a, b) =>
		a.band === b.band ? b.depth - a.depth : a.band < b.band ? -1 : 1,
	)) {
		const ok =
			r.band === "DEEP" ? r.depth >= GATE.deepMin : r.depth <= GATE.shallowMax;
		if (!ok)
			violations.push(
				`${r.band} ${r.fullName} scored ${r.depth.toFixed(3)} (${r.why})`,
			);
		console.log(
			`${r.band.padEnd(8)} ${r.depth.toFixed(3)}  ${ok ? "✓ " : "✗ "} ${r.fullName}`,
		);
	}

	// Coverage: an eval that couldn't fetch the key is inconclusive → fail.
	for (const [band, got, want, misses] of [
		["DEEP", deep.rows.length, DEEP.length, deep.failed],
		["SHALLOW", shallow.rows.length, SHALLOW.length, shallow.failed],
	] as const) {
		if (got / want < GATE.minCoverage) {
			violations.push(
				`${band} coverage ${got}/${want} below ${GATE.minCoverage * 100}% (unfetched: ${misses.join(", ")})`,
			);
		} else if (misses.length) {
			console.log(
				`  (note: ${band} unfetched, within tolerance: ${misses.join(", ")})`,
			);
		}
	}

	// Band margin.
	const deepScores = deep.rows.map((r) => r.depth);
	const shallowScores = shallow.rows.map((r) => r.depth);
	if (deepScores.length && shallowScores.length) {
		const minDeep = Math.min(...deepScores);
		const maxShallow = Math.max(...shallowScores);
		const margin = minDeep - maxShallow;
		console.log(
			`\nmin(DEEP)=${minDeep.toFixed(3)}  max(SHALLOW)=${maxShallow.toFixed(3)}  margin=${margin.toFixed(3)}`,
		);
		if (margin < GATE.marginMin) {
			violations.push(
				`band margin ${margin.toFixed(3)} below required ${GATE.marginMin}`,
			);
		}
	}

	if (violations.length) {
		console.error(`\n❌ GATE FAILED — ${violations.length} violation(s):`);
		for (const v of violations) console.error(`  - ${v}`);
		process.exit(1);
	}
	console.log("\n✅ separation holds — codeDepth gate passed.");
	process.exit(0);
}

main().catch((e) => {
	console.error("FATAL", e);
	process.exit(1);
});
