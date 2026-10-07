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
 * Rules:
 *  - append only when the engine artifact is NEWER than the last point, so
 *    re-runs are idempotent;
 *  - carry the engine's OWN date and numbers, never today's clock;
 *  - the aggregate is the sum of the board's buckets, which is the same
 *    denominator the engine prints, and the point records it so a later reader
 *    can see what was compared.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const EXECUTE = process.argv.includes("--execute");
const SERIES = join(process.cwd(), "improvements/audits/north-star-series.json");
const ENGINE = join(
	process.cwd(),
	"improvements/engine/weekly/engine-a-recall-latest.json",
);

type Point = {
	date: string;
	label: string;
	okRate: number;
	ok: number;
	probes: number;
	evidence: string;
};

const engine = JSON.parse(readFileSync(ENGINE, "utf8")) as {
	generatedAt?: string;
	board?: Array<{ bucket: string; ok: number; total: number }>;
};
const series = JSON.parse(readFileSync(SERIES, "utf8")) as {
	target: number;
	series: Point[];
};

const board = engine.board ?? [];
if (!board.length) {
	console.error(
		"INCONCLUSIVE: the engine artifact carries no board — nothing to append, and an empty run is not a 100% run.",
	);
	process.exit(2);
}
const date = String(engine.generatedAt ?? "").slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
	console.error("INCONCLUSIVE: the engine artifact has no usable generatedAt.");
	process.exit(2);
}

const ok = board.reduce((a, b) => a + b.ok, 0);
const probes = board.reduce((a, b) => a + b.total, 0);
const last = series.series[series.series.length - 1];

if (last && last.date >= date) {
	console.log(
		`up to date: last point ${last.date}, engine ran ${date} — nothing to append.`,
	);
	process.exit(0);
}

const point: Point = {
	date,
	label: `Engine A full matrix (${board.length} buckets)`,
	okRate: Math.round((ok / probes) * 100),
	ok,
	probes,
	evidence: "improvements/engine/weekly/engine-a-recall-latest.json",
};

console.log(
	`append ${point.date}: ${point.ok}/${point.probes} = ${point.okRate}% (last point ${last?.date ?? "none"})`,
);
if (!EXECUTE) {
	console.log("DRY RUN — pass --execute to write.");
	process.exit(0);
}
series.series.push(point);
writeFileSync(SERIES, `${JSON.stringify(series, null, "\t")}\n`);
console.log(`wrote ${SERIES}`);
