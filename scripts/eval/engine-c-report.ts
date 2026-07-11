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

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [aPath, bPath, dPath, corpusPath, scfPath, goldenPath, ePath] =
	positional;
// --prev=<dir>: last successful run's evidence artifact (a.json/b.json/
// d.json/corpus.json) — enables week-over-week deltas. Absent on the first
// run or when the artifact expired; the report degrades to absolute values.
const prevDir = process.argv
	.find((a) => a.startsWith("--prev="))
	?.slice("--prev=".length);
if (!aPath || !bPath) {
	console.error(
		"usage: engine-c-report.ts <engine-a.json> <engine-b.json> [engine-d.json] [corpus.json] [scf.json] [golden.json] [engine-e.json] [--prev=dir]",
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
const prev = {
	a: prevDir ? readJson(`${prevDir}/a.json`) : null,
	b: prevDir ? readJson(`${prevDir}/b.json`) : null,
	d: prevDir ? readJson(`${prevDir}/d.json`) : null,
};
const delta = (now?: number | null, before?: number | null): string => {
	if (typeof now !== "number" || typeof before !== "number") return "";
	const d = Math.round((now - before) * 10) / 10;
	if (d === 0) return " (=)";
	return d > 0 ? ` (▲${d})` : ` (▼${Math.abs(d)})`;
};
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
	const prevRates = new Map<string, number>(
		Array.isArray(prev.a?.board)
			? prev.a.board.map((r: { bucket: string; rate: number }) => [
					r.bucket,
					r.rate,
				])
			: [],
	);
	lines.push("| bucket | recall | Δ wk | floor | status |");
	lines.push("|---|---|---|---|---|");
	for (const row of a.board) {
		if (row.status === "RED") red = true;
		lines.push(
			`| ${row.bucket} | ${row.rate}% | ${delta(row.rate, prevRates.get(row.bucket)) || "—"} | ${row.floor}% | ${row.status === "RED" ? "🔴 BELOW FLOOR" : "🟢"} |`,
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
	const s3b = b.s3b_domain_duplicates;
	if (s3b?.count)
		lines.push(
			`- **Domain-keyed duplicates (NEW, names differ):** ${s3b.count} — ${s3b.groups
				.slice(0, 3)
				.map(
					(g: { apex: string; records: Array<{ slug: string }> }) =>
						`${g.apex} (${g.records.map((r) => r.slug).join("/")})`,
				)
				.join("; ")}`,
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
		const missKey = (m: { endpoint: string; query: string }) =>
			`${m.endpoint} ${m.query}`;
		const prevMisses = new Set(
			(
				(prev.d?.misses ?? []) as Array<{ endpoint: string; query: string }>
			).map(missKey),
		);
		const nowMisses = new Set(
			((d.misses ?? []) as Array<{ endpoint: string; query: string }>).map(
				missKey,
			),
		);
		const newMisses = [...nowMisses].filter((k) => !prevMisses.has(k)).length;
		const resolved = [...prevMisses].filter((k) => !nowMisses.has(k)).length;
		lines.push(
			`Window ${d.windowDays}d: ${d.frame.realHits} real-consumer hits, ${d.frame.distinctQueries} distinct queries, top ${d.frame.replayed} replayed. **OK rate on real demand: ${d.okRate}%${delta(d.okRate, prev.d?.okRate)}.**${prev.d?.misses ? ` Misses: +${newMisses} new / −${resolved} resolved vs last run.` : ""}`,
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

// ── Corpus sweeps: research-docs consistency (R2 classes as guards) ──
if (corpusPath) {
	const c = readJson(corpusPath);
	lines.push("");
	lines.push("### Corpus sweeps — research-docs (S5–S8)");
	if (c && !c._error && c.frame) {
		lines.push(`Frame: ${c.frame.chunks} chunks / ${c.frame.docs} docs.`);
		lines.push(
			`- **S5 junk URLs (must be 0):** ${c.s5_junk_urls?.count ?? "?"}${c.s5_junk_urls?.count ? " 🔴 crawl regression" : " 🟢"}`,
		);
		lines.push(
			`- **S6 bad titles:** ${c.s6_bad_titles?.count ?? "?"} docs (${Object.entries(
				c.s6_bad_titles?.byIssue ?? {},
			)
				.map(([k, v]) => `${k}: ${v}`)
				.join(", ")})`,
		);
		const stalled = c.s7_stalled ?? [];
		const undated = Object.entries(
			(c.s7_coverage ?? {}) as Record<string, { undated?: boolean }>,
		)
			.filter(([, v]) => v.undated)
			.map(([s]) => s);
		lines.push(
			`- **S7 ingest freshness:** ${stalled.length ? `⚠ STALLED: ${stalled.join(", ")}` : "all time-sensitive sources advancing 🟢"}${undated.length ? ` · undated sources (publishedAt never extracted — unmeasurable): ${undated.join(", ")}` : ""}`,
		);
		lines.push(
			`- **S8 mirrored chunks (same content, >1 URL):** ${c.s8_mirrors?.count ?? "?"}`,
		);
	} else {
		lines.push(
			`⚠ Corpus sweep output unreadable: ${c?._error ?? "empty"} (DB secrets missing on the step?)`,
		);
	}
}

// ── SCF status cross-check: our scfAwarded vs communityfund ground truth ──
if (scfPath) {
	const s = readJson(scfPath);
	lines.push("");
	lines.push("### SCF status cross-check (scfAwarded vs communityfund)");
	if (s && !s._error && s.frame) {
		const over = (s.overstated ?? []).length;
		const under = (s.understated ?? []).length;
		if (over > 0 || under > 0) red = true;
		lines.push(
			`${s.frame.matched} high-precision matches. **Overstated (we claim, source denies): ${over}${over ? " 🔴" : " 🟢"} · Understated (source confirms, we deny): ${under}${under ? " 🔴" : " 🟢"}.**`,
		);
		for (const o of (s.overstated ?? []).slice(0, 8))
			lines.push(`- OVERSTATED \`${o.slug}\` — ${o.url}`);
		for (const u of (s.understated ?? []).slice(0, 8))
			lines.push(
				`- UNDERSTATED \`${u.slug}\` — SCF ${(u.scfRounds ?? []).map((r: string) => `#${r}`).join(" ")} — ${u.url}`,
			);
		if (over === 0 && under === 0)
			lines.push("Our SCF-awarded data agrees with the source. ✅");
		// Round MEMBERSHIP (the phoenix class): totals right, round set wrong.
		// A round the source affirmatively marks "Not Awarded" reds the run
		// exactly like an overstated boolean — we're claiming an award the
		// source denies, just at round granularity.
		if (Array.isArray(s.roundsOverstated)) {
			const rOver = s.roundsOverstated.length;
			const rUnv = (s.roundsUnverifiable ?? []).length;
			if (rOver > 0) red = true;
			lines.push(
				`Round membership (${s.frame.roundsChecked ?? "?"} awarded records checked): **rounds-overstated ${rOver}${rOver ? " 🔴" : " 🟢"}** · unverifiable ${rUnv} (review by hand, never accused).`,
			);
			for (const r of s.roundsOverstated.slice(0, 8))
				lines.push(
					`- ROUNDS-OVERSTATED \`${r.slug}\` ours [${(r.ourRounds ?? []).map((x: string) => `#${x}`).join(" ")}] vs official awarded [${(r.officialAwardedRounds ?? []).map((x: string) => `#${x}`).join(" ")}] — ${r.url}`,
				);
		}
	} else {
		lines.push(`⚠ SCF cross-check output unreadable: ${s?._error ?? "empty"}`);
	}
}

// ── Engine E: contract honesty (spec ⇄ live params + fields) ──
if (ePath) {
	const e = readJson(ePath);
	lines.push("");
	lines.push("### Engine E — contract honesty (spec ⇄ live)");
	if (e && !e._error && e.frame) {
		const silent = (e.silentParams ?? []).length;
		const invalid = (e.invalidAccepted ?? []).length;
		const missing = (e.missingFields ?? []).length;
		const undoc = (e.undocumentedFields ?? []).length;
		// A silently-ignored documented param is a correctness lie to every
		// consumer that sets it (the sls-033/040 class) — red, like overstated.
		if (silent > 0) red = true;
		lines.push(
			`Frame: ${e.frame.ops} ops · ${e.frame.paramsProbed} params probed · ${e.frame.fieldsChecked} fields checked. **Silent params: ${silent}${silent ? " 🔴" : " 🟢"} · invalid-accepted: ${invalid} · doc-but-absent fields: ${missing} · live-but-undocumented fields: ${undoc}.**`,
		);
		for (const f of (e.silentParams ?? []).slice(0, 6))
			lines.push(`- SILENT \`${f.op}\` param \`${f.param}\` — ${f.evidence}`);
		for (const f of (e.invalidAccepted ?? []).slice(0, 6))
			lines.push(`- INVALID-ACCEPTED \`${f.op}\` \`${f.param}\``);
	} else {
		lines.push(`⚠ Engine E output unreadable: ${e?._error ?? "empty"}`);
	}
}

// ── Golden retrieval eval: correctness classes on the curated question set ──
if (goldenPath) {
	const g = readJson(goldenPath);
	lines.push("");
	lines.push("### Golden retrieval eval (correctness classes)");
	if (g && !g._error && Array.isArray(g.graded)) {
		const scored = g.graded.filter(
			(r: { status: string }) => r.status !== "N/A",
		);
		const passed = scored.filter(
			(r: { status: string }) => r.status === "PASS",
		).length;
		const forbidden = scored.filter(
			(r: { forbiddenHits?: string[] }) => r.forbiddenHits?.length,
		).length;
		const junk = scored.reduce(
			(s: number, r: { junk?: number }) => s + (r.junk ?? 0),
			0,
		);
		const badTitle = scored.reduce(
			(s: number, r: { badTitle?: number }) => s + (r.badTitle ?? 0),
			0,
		);
		// Forbidden hits are CORRECTNESS failures (a wrong/stale fact served) —
		// they red the run. Recall-grade misses are the fix queue, not a red.
		if (forbidden > 0) red = true;
		lines.push(
			`**${passed}/${scored.length} pass · forbidden-hits ${forbidden}${forbidden ? " 🔴" : " 🟢"} · junk ${junk} · bad-titles ${badTitle}.**`,
		);
		const misses = g.graded.filter(
			(r: { status: string }) => r.status === "FAIL",
		);
		for (const m of misses.slice(0, 6))
			lines.push(`- MISS \`${m.id ?? m.question ?? "?"}\``);
	} else {
		lines.push(`⚠ Golden output unreadable: ${g?._error ?? "empty"}`);
	}
}

lines.push("");
lines.push("### The loop");
lines.push(
	"Fix targets the worst bucket → next week's run measures the delta here. Data sweeps feed the human-verified Part-3 waves (report → owner review → curated fix, never bulk). See `improvements/engine/full-surface-coverage-plan.md`.",
);

console.log(lines.join("\n"));
process.exit(red ? 1 : 0);
