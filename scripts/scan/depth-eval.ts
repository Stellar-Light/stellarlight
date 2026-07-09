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
import { computeJsDepth } from "../../src/lib/js-depth";
import {
	DEEP,
	DEEP_FRONTIER,
	GATE,
	JS_DEEP,
	JS_DEEP_FRONTIER,
	JS_GATE,
	JS_SHALLOW,
	SHALLOW,
	SHALLOW_FRONTIER,
} from "./depth-labels";
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

	// ── FRONTIER scoreboard (non-gating) ─────────────────────────────────
	// Externally-TRUE labels the current scorer can't separate yet (see
	// depth-labels.ts). Printed every run so progress/regression on the
	// scorer's known blind spots is visible; graduating a row into the gated
	// bands is scorer-v3 work. Never fails the gate.
	if (DEEP_FRONTIER.length || SHALLOW_FRONTIER.length) {
		console.log(
			`\n── frontier (non-gating): ${DEEP_FRONTIER.length} deep + ${SHALLOW_FRONTIER.length} shallow scorer blind spots ──`,
		);
		const fd = await scoreBand("DEEP", DEEP_FRONTIER);
		const fs = await scoreBand("SHALLOW", SHALLOW_FRONTIER);
		let separated = 0;
		for (const r of [...fd.rows, ...fs.rows].sort(
			(a, b) => b.depth - a.depth,
		)) {
			const wouldPass =
				r.band === "DEEP"
					? r.depth >= GATE.deepMin
					: r.depth <= GATE.shallowMax;
			if (wouldPass) separated++;
			console.log(
				`${r.band.padEnd(8)} ${r.depth.toFixed(3)}  ${wouldPass ? "✓ would graduate" : "· blind spot"}  ${r.fullName}`,
			);
		}
		if (separated > 0)
			console.log(
				`  → ${separated} frontier repo(s) now separate — graduate them into the gated bands (move rows in depth-labels.ts).`,
			);
	}

	// ── JS/TS dapp-depth gate (gist gap 1 phase 2) ──────────────────────────
	if (JS_DEEP.length || JS_SHALLOW.length) {
		console.log(
			`\n── JS gate: DEEP ≥ ${JS_GATE.deepMin} · SHALLOW ≤ ${JS_GATE.shallowMax} · margin ≥ ${JS_GATE.marginMin} ──`,
		);
		const scoreJs = async (
			band: "DEEP" | "SHALLOW",
			list: { fullName: string; why: string }[],
		) => {
			const rows: Row[] = [];
			const failed: string[] = [];
			for (const { fullName, why } of list) {
				try {
					const r = await fetchRepoCode(gh, fullName);
					if (!r) {
						failed.push(fullName);
						continue;
					}
					const d = computeJsDepth({
						fullName,
						blobs: r.depthInput.blobs,
						stellarJsDep: r.facts.stellarJsDep,
						scalars: {
							isFork: r.meta.isFork,
							tagCount: r.meta.tagCount,
							readmeText: r.depthInput.scalars.readmeText,
							topics: r.depthInput.scalars.topics ?? [],
							nameLooksTemplate: r.meta.nameLooksTemplate,
						},
					});
					rows.push({ fullName, band, depth: d.jsDepth, why });
				} catch (e) {
					console.error(`  ! ${fullName}: ${(e as Error).message}`);
					failed.push(fullName);
				}
			}
			return { rows, failed };
		};
		const jd = await scoreJs("DEEP", JS_DEEP);
		const js = await scoreJs("SHALLOW", JS_SHALLOW);
		for (const r of [...jd.rows, ...js.rows].sort((a, b) =>
			a.band === b.band ? b.depth - a.depth : a.band < b.band ? -1 : 1,
		)) {
			const ok =
				r.band === "DEEP"
					? r.depth >= JS_GATE.deepMin
					: r.depth <= JS_GATE.shallowMax;
			if (!ok)
				violations.push(
					`JS ${r.band} ${r.fullName} scored ${r.depth.toFixed(3)} (${r.why})`,
				);
			console.log(
				`JS ${r.band.padEnd(8)} ${r.depth.toFixed(3)}  ${ok ? "✓ " : "✗ "} ${r.fullName}`,
			);
		}
		for (const [band, got, want, misses] of [
			["JS_DEEP", jd.rows.length, JS_DEEP.length, jd.failed],
			["JS_SHALLOW", js.rows.length, JS_SHALLOW.length, js.failed],
		] as const) {
			if (want > 0 && got / want < JS_GATE.minCoverage)
				violations.push(
					`${band} coverage ${got}/${want} below ${JS_GATE.minCoverage * 100}% (unfetched: ${misses.join(", ")})`,
				);
		}
		if (JS_DEEP_FRONTIER.length) {
			console.log(
				`── JS frontier (non-gating): ${JS_DEEP_FRONTIER.length} scorer blind spots ──`,
			);
			const jf = await scoreJs("DEEP", JS_DEEP_FRONTIER);
			for (const r of jf.rows.sort((a, b) => b.depth - a.depth)) {
				const grad = r.depth >= JS_GATE.deepMin;
				console.log(
					`JS ${r.depth.toFixed(3)}  ${grad ? "✓ would graduate" : "· blind spot"}  ${r.fullName}`,
				);
			}
		}
		if (jd.rows.length && js.rows.length) {
			const m =
				Math.min(...jd.rows.map((r) => r.depth)) -
				Math.max(...js.rows.map((r) => r.depth));
			console.log(
				`min(JS_DEEP)=${Math.min(...jd.rows.map((r) => r.depth)).toFixed(3)}  max(JS_SHALLOW)=${Math.max(...js.rows.map((r) => r.depth)).toFixed(3)}  margin=${m.toFixed(3)}`,
			);
			if (m < JS_GATE.marginMin)
				violations.push(
					`JS band margin ${m.toFixed(3)} below ${JS_GATE.marginMin}`,
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
