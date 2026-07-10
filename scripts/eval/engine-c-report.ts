/**
 * Engine C — the weekly self-improvement loop (plan Part 2, engine #2).
 *
 *   pnpm exec tsx scripts/eval/engine-c-report.ts <engine-a.json> <engine-b.json>
 *
 * Reads the JSON output of Engine A (generated recall matrix) and Engine B
 * (data-consistency sweeps), and emits a single markdown health report to
 * stdout. The workflow upserts that report into ONE rolling "Retrieval health"
 * tracker issue (edit-if-exists, so the issue IS the week-over-week state) and
 * the report headlines the worst buckets as the current fix queue.
 *
 * Exit code: 1 if any Engine A bucket is below its floor (regression → red
 * run), else 0. Pure reporter — no writes, no issue API (the gh upsert lives
 * in the workflow where GITHUB_TOKEN naturally is).
 */
import { readFileSync } from "node:fs";

const [, , aPath, bPath, dPath] = process.argv;
if (!aPath || !bPath) {
	console.error(
		"usage: engine-c-report.ts <engine-a.json> <engine-b.json> [engine-d.json]",
	);
	process.exit(2);
}

function readJson(p: string): any {
	try {
		return JSON.parse(readFileSync(p, "utf8"));
	} catch (e) {
		return { _error: String(e) };
	}
}

const a = readJson(aPath);
const b = readJson(bPath);
const lines: string[] = [];
let red = false;

lines.push("## Retrieval health — weekly (Engine C)");
lines.push("");
lines.push(
	"_Auto-generated from Engine A (recall matrix) + Engine B (data sweeps). This issue is rolling — edited each run; the history is in its edit log. Do not close; it tracks the north-star._",
);
lines.push("");

// ── Engine A: recall scoreboard ──
lines.push("### Engine A — generated recall (per-bucket)");
if (Array.isArray(a.board)) {
	lines.push("| bucket | recall | floor | status |");
	lines.push("|---|---|---|---|");
	for (const row of a.board) {
		if (row.status === "RED") red = true;
		lines.push(
			`| ${row.bucket} | ${row.rate}% | ${row.floor}% | ${row.status === "RED" ? "🔴 BELOW FLOOR" : "🟢"} |`,
		);
	}
	const fails = (a.failures ?? []).length;
	lines.push("");
	lines.push(
		`${fails} probe failure(s). Worst below-floor buckets are the fix queue:`,
	);
	// group failures by bucket, list worst
	const byBucket: Record<string, any[]> = {};
	for (const f of a.failures ?? []) (byBucket[f.bucket] ??= []).push(f);
	for (const [bucket, fs] of Object.entries(byBucket)
		.sort((x, y) => y[1].length - x[1].length)
		.slice(0, 4)) {
		lines.push("");
		lines.push(`- **${bucket}** (${fs.length}):`);
		for (const f of fs.slice(0, 3))
			lines.push(`  - \`${f.probe}\` — ${f.expected}`);
	}
} else {
	lines.push(`⚠ Engine A output unreadable: ${a._error ?? "no board"}`);
	red = true;
}

// ── Engine B: data-consistency headlines ──
lines.push("");
lines.push("### Engine B — data consistency");
if (b && !b._error) {
	const s1 = b.s1_prose_structure_divergence;
	const s3 = b.s3_duplicates;
	const s4 = b.s4_staleness;
	if (s1)
		lines.push(
			`- **Prose⇄structure divergence:** ${s1.count} records name a chain/country/SEP their structured fields lack`,
		);
	if (s3)
		lines.push(
			`- **Duplicate slug pairs:** ${s3.count} (canonicalSlug unset → split funding/stats)`,
		);
	if (s4)
		lines.push(
			`- **Staleness:** ${s4.liveNoDatedSignal} Live with NO dated signal, ${s4.liveStale365} Live stale >365d (liveness-wave pool)`,
		);
	// worst field-population cells
	if (b.s2_field_population) {
		const worst: Array<[string, string, number]> = [];
		for (const [cat, fields] of Object.entries<any>(b.s2_field_population))
			for (const [field, pct] of Object.entries<string>(fields)) {
				const n = Number.parseInt(pct, 10);
				const total = Number.parseInt(pct.split("/")[1] ?? "0", 10);
				if (total >= 20 && n < 50) worst.push([`${cat}·${field}`, pct, n]);
			}
		worst.sort((x, y) => x[2] - y[2]);
		if (worst.length) {
			lines.push(`- **Field-population gaps (<50%, ≥20 records):**`);
			for (const [k, pct] of worst.slice(0, 6)) lines.push(`  - ${k}: ${pct}`);
		}
	}
} else {
	lines.push(`⚠ Engine B output unreadable: ${b?._error ?? "empty"}`);
}

// ── Engine D: demand-side misses (real consumer queries, replayed) ──
if (dPath) {
	const d = readJson(dPath);
	lines.push("");
	lines.push("### Engine D — demand-side misses (real queries, replayed)");
	if (d && !d._error && d.frame) {
		lines.push(
			`Window ${d.windowDays}d: ${d.frame.realHits} real-consumer hits, ${d.frame.distinctQueries} distinct queries, top ${d.frame.replayed} replayed. **OK rate on real demand: ${d.okRate}%.**`,
		);
		const misses = (d.misses ?? []) as Array<{
			class: string;
			endpoint: string;
			query: string;
			hits: number;
			evidence: string;
		}>;
		if (misses.length) {
			lines.push("");
			lines.push(
				"Worst misses by demand (these ARE the fix queue — a real consumer asked and we failed):",
			);
			for (const m of misses.slice(0, 12))
				lines.push(
					`- **${m.class}** \`${m.query}\` on ${m.endpoint} (${m.hits} hit${m.hits > 1 ? "s" : ""}) — ${m.evidence}`,
				);
			if (misses.length > 12)
				lines.push(`- …and ${misses.length - 12} more (see run artifact)`);
		} else {
			lines.push("");
			lines.push("No misses on replayed real demand this week. 🟢");
		}
	} else {
		lines.push(
			`⚠ Engine D output unreadable: ${d?._error ?? "empty"} (DB secrets missing on the step?)`,
		);
	}
}

lines.push("");
lines.push("### The loop");
lines.push(
	"Fix targets the worst bucket → next week's run measures the delta here. Data sweeps feed the human-verified Part-3 waves (report → owner review → curated fix, never bulk). See `improvements/full-surface-coverage-plan.md`.",
);

console.log(lines.join("\n"));
process.exit(red ? 1 : 0);
