/**
 * codeDepth v2 calibration probe — read-only, no DB, no writes.
 *
 * Runs the shipped code-depth v2 formula over a fixed DEEP/SHALLOW answer key of
 * REAL repos and prints the scores + separation margin, so a change to the
 * scoring can be sanity-checked against ground truth before shipping.
 *
 * Uses the SHARED fetch/selection (scripts/scan/fetch-repo-code.ts) — the SAME
 * unit the production scanner uses — so this probe can never score a different
 * input than production (the fixture≡production anti-drift guard).
 *
 *   GITHUB_TOKEN=… npx tsx scripts/scan/depth-probe.ts
 *   … npx tsx scripts/scan/depth-probe.ts owner/name owner/name   # ad-hoc repos
 */
import { computeCodeDepth } from "../../src/lib/code-depth";
// The answer key lives in depth-labels.ts — ONE key shared with the CI gate
// (depth-eval.ts), so the probe and the gate can never diverge.
import { DEEP as DEEP_LABELS, SHALLOW as SHALLOW_LABELS } from "./depth-labels";
import { createGh, fetchRepoCode } from "./fetch-repo-code";

const GH = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
if (!GH) {
	console.error("Set GITHUB_TOKEN.");
	process.exit(1);
}
const gh = createGh(GH);

const DEEP = DEEP_LABELS.map((l) => l.fullName);
const SHALLOW = SHALLOW_LABELS.map((l) => l.fullName);

async function main() {
	const argv = process.argv.slice(2);
	const deep = argv.length ? argv : DEEP;
	const shallow = argv.length ? [] : SHALLOW;
	const rows: {
		full: string;
		band: string;
		depth: number;
		nt: number;
		crates: number;
		sloc: number;
		m: number;
		proof: string;
	}[] = [];

	for (const [band, list] of [
		["DEEP", deep],
		["SHALLOW", shallow],
	] as const) {
		for (const full of list) {
			try {
				const r = await fetchRepoCode(gh, full);
				if (!r) {
					console.error(`  ! ${full}: no tree`);
					continue;
				}
				const d = computeCodeDepth(r.depthInput);
				rows.push({
					full,
					band,
					depth: d.codeDepth,
					nt: d.nonTrivialFns,
					crates: d.contractCrates,
					sloc: d.rustSloc,
					m: d.cloneMultiplier,
					proof: r.proof,
				});
			} catch (e) {
				console.error(`  ! ${full}: ${(e as Error).message}`);
			}
		}
	}

	console.log(
		"\nband     codeDepth  nonTriv  crates  rustSloc  cloneM  proof            repo",
	);
	for (const r of rows.sort((a, b) =>
		a.band === b.band ? b.depth - a.depth : a.band < b.band ? -1 : 1,
	)) {
		console.log(
			`${r.band.padEnd(7)} ${r.depth.toFixed(3).padStart(8)} ${String(r.nt).padStart(7)} ${String(r.crates).padStart(6)} ${String(r.sloc).padStart(8)} ${r.m.toFixed(2).padStart(6)}  ${r.proof.padEnd(15)} ${r.full}`,
		);
	}
	const deepScores = rows.filter((r) => r.band === "DEEP").map((r) => r.depth);
	const shallowScores = rows
		.filter((r) => r.band === "SHALLOW")
		.map((r) => r.depth);
	if (deepScores.length && shallowScores.length) {
		const minDeep = Math.min(...deepScores);
		const maxShallow = Math.max(...shallowScores);
		console.log(
			`\nmin(deep)=${minDeep.toFixed(3)}  max(shallow)=${maxShallow.toFixed(3)}  margin=${(minDeep - maxShallow).toFixed(3)}`,
		);
		console.log(
			`deep clears 0.6 gate: ${deepScores.filter((s) => s >= 0.6).length}/${deepScores.length}  shallow below: ${shallowScores.filter((s) => s < 0.6).length}/${shallowScores.length}`,
		);
	}
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FATAL", e);
		process.exit(1);
	});
