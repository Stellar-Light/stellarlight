/**
 * Append the latest Engine A recall run to the north-star series.
 *
 * The series (improvements/audits/north-star-series.json) is what /quality
 * shows as the programme's headline number, and it was hand-maintained: the
 * engine ran weekly and wrote its own artifact, and nothing carried the result
 * across. On 2026-09-07 the board reported the north star "measured 10 days
 * ago" while the engine had run the day before. A detector nobody consumes,
 * one more time.
 *
 *   pnpm exec tsx scripts/quality/append-north-star.ts [--execute]
 *
 * Runs as a step of engine-c-health, right after that job commits the weekly
 * evidence it reads. It used to run in generated-recall about two hours
 * before that commit, so every append picked up the previous week's run and
 * the newest week was always missing (2026-11-08 was never appended).
 *
 * Rules:
 *  - one point per date: a date already in the series is never appended
 *    again, and an artifact older than the last point is not appended, so
 *    re-runs are idempotent;
 *  - carry the engine's OWN date and numbers, never today's clock;
 *  - the aggregate is the sum of the board's buckets, which is the same
 *    denominator the engine prints, and the point records it so a later reader
 *    can see what was compared.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const EXECUTE = process.argv.includes("--execute");
const SERIES = join(
	process.cwd(),
	"improvements/audits/north-star-series.json",
);
const ENGINE = join(
	process.cwd(),
	"improvements/engine/weekly/engine-a-recall-latest.json",
);

export type Point = {
	date: string;
	label: string;
	okRate: number;
	ok: number;
	probes: number;
	evidence: string;
};
export type Engine = {
	generatedAt?: string;
	board?: Array<{ bucket: string; ok: number; total: number }>;
};

/** The point to append, or why there is none. `inconclusive` = the artifact
 *  cannot support a point; `skip` = the series already holds this run. */
export function planAppend(
	series: readonly Point[],
	engine: Engine,
): { point: Point } | { skip: string } | { inconclusive: string } {
	const board = engine.board ?? [];
	if (!board.length)
		return {
			inconclusive:
				"the engine artifact carries no board: nothing to append, and an empty run is not a 100% run.",
		};
	const date = String(engine.generatedAt ?? "").slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
		return { inconclusive: "the engine artifact has no usable generatedAt." };
	// One point per date. Comparing with the last point alone let an
	// out-of-order series take a second point for a date it already held.
	if (series.some((p) => p.date === date))
		return { skip: `the series already has a point dated ${date}.` };
	const last = series[series.length - 1];
	if (last && last.date > date)
		return {
			skip: `the engine ran ${date}, older than the last point ${last.date}.`,
		};
	const ok = board.reduce((a, b) => a + b.ok, 0);
	const probes = board.reduce((a, b) => a + b.total, 0);
	return {
		point: {
			date,
			label: `Engine A full matrix (${board.length} buckets)`,
			okRate: Math.round((ok / probes) * 100),
			ok,
			probes,
			evidence: "improvements/engine/weekly/engine-a-recall-latest.json",
		},
	};
}

function main() {
	const engine = JSON.parse(readFileSync(ENGINE, "utf8")) as Engine;
	const series = JSON.parse(readFileSync(SERIES, "utf8")) as {
		target: number;
		series: Point[];
	};
	const plan = planAppend(series.series, engine);
	if ("inconclusive" in plan) {
		console.error(`INCONCLUSIVE: ${plan.inconclusive}`);
		process.exit(2);
	}
	if ("skip" in plan) {
		console.log(`nothing to append: ${plan.skip}`);
		process.exit(0);
	}
	const { point } = plan;
	console.log(
		`append ${point.date}: ${point.ok}/${point.probes} = ${point.okRate}% (last point ${series.series.at(-1)?.date ?? "none"})`,
	);
	if (!EXECUTE) {
		console.log("DRY RUN: pass --execute to write.");
		process.exit(0);
	}
	series.series.push(point);
	writeFileSync(SERIES, `${JSON.stringify(series, null, "\t")}\n`);
	console.log(`wrote ${SERIES}`);
}

if (process.argv[1]?.includes("append-north-star")) main();
