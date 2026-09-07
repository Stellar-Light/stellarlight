/**
 * Repo-ranking answer key (P2/P4). Grades the LIVE index against written
 * ordering claims in improvements/evals/repo-ranking-answer-key.json.
 *
 *   pnpm exec tsx scripts/check-repo-ranking.ts [--json]
 *
 * Why a key rather than a formula test: repoScore blends several mechanisms
 * (own merit, inherited authority, a hackathon review, code depth, relevance-
 * weighted traction), and every future tuning pass changes their balance. Unit
 * tests pin the formula's behaviour on synthetic inputs; this pins the OUTCOME
 * on the real index, where a changed note, a re-scan or a stale field can
 * invert a pair without the formula moving at all.
 *
 * Trinary: holds / inverted / could-not-check (a repo missing from the index is
 * never a pass). Exit 1 on an inversion, 2 when more than half the pairs are
 * unreadable — a run that could not look must not read as a run that found
 * nothing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.BASE_URL || "https://stellarlight.xyz").replace(/\/$/, "");
const KEY = join(process.cwd(), "improvements/evals/repo-ranking-answer-key.json");
const OUT = join(process.cwd(), "improvements/audits/repo-ranking-latest.json");
const JSON_OUT = process.argv.includes("--json");

type Pair = { higher: string; lower: string; why: string };

async function scoreOf(fullName: string): Promise<number | null> {
	const url = `${BASE}/api/repos?where%5BfullName%5D%5Bequals%5D=${encodeURIComponent(fullName)}&limit=1&depth=0`;
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
		if (!res.ok) return null;
		const body = (await res.json()) as { docs?: Array<{ repoScore?: number }> };
		const s = body.docs?.[0]?.repoScore;
		return typeof s === "number" ? s : null;
	} catch {
		return null;
	}
}

async function main() {
	const key = JSON.parse(readFileSync(KEY, "utf8")) as { pairs: Pair[] };
	const rows: Array<Pair & { higherScore: number | null; lowerScore: number | null; verdict: string }> = [];
	for (const p of key.pairs) {
		const [hs, ls] = await Promise.all([scoreOf(p.higher), scoreOf(p.lower)]);
		const verdict =
			hs === null || ls === null
				? "could-not-check"
				: hs > ls
					? "holds"
					: "INVERTED";
		rows.push({ ...p, higherScore: hs, lowerScore: ls, verdict });
	}
	const holds = rows.filter((r) => r.verdict === "holds").length;
	const inverted = rows.filter((r) => r.verdict === "INVERTED");
	const blind = rows.filter((r) => r.verdict === "could-not-check").length;
	const report = {
		generatedAt: new Date().toISOString(),
		source: "scripts/check-repo-ranking.ts",
		rule: "Written ordering claims about repoScore, graded against the live index. An inversion is a finding for a human; a missing repo is never a pass.",
		tally: { pairs: rows.length, holds, inverted: inverted.length, couldNotCheck: blind },
		rows,
	};
	writeFileSync(OUT, `${JSON.stringify(report, null, "\t")}\n`);
	if (JSON_OUT) console.log(JSON.stringify(report, null, "\t"));
	else
		for (const r of rows)
			console.log(
				`  ${r.verdict === "holds" ? "✓" : r.verdict === "could-not-check" ? "?" : "✗"} ${String(r.higherScore ?? "-").padStart(3)} ${r.higher.padEnd(32)} > ${String(r.lowerScore ?? "-").padStart(3)} ${r.lower}`,
			);
	for (const r of inverted) console.log(`\n  INVERTED: ${r.higher} (${r.higherScore}) should outrank ${r.lower} (${r.lowerScore}) — ${r.why}`);
	console.log(
		`\n${inverted.length ? "RED" : blind * 2 > rows.length ? "BLIND" : "GREEN"}: ${holds} hold · ${inverted.length} inverted · ${blind} could-not-check (of ${rows.length})`,
	);
	process.exit(blind * 2 > rows.length ? 2 : inverted.length ? 1 : 0);
}

main().catch((e) => {
	console.error("INCONCLUSIVE (ranking check did not complete):", e?.message ?? e);
	process.exit(2);
});
