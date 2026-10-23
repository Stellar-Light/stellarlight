/**
 * The per-consumer report built from the api-usage log
 * (scripts/consumer-report.ts writes it to improvements/consumers/, which is
 * public). Query texts are what agents sent on someone's behalf, so the
 * report never publishes one: it lists single terms asked in at least
 * `minTermCount` calls, after dropping stopwords and tokens shaped like keys,
 * hashes or addresses, and grades the live replay of the top queries as
 * counts only.
 */

import { isContentStopword } from "./repo-search";

export interface UsageRow {
	endpoint?: string;
	query?: string;
	resultCount?: number | null;
	matchMode?: string | null;
	scoutVersion?: string | null;
	createdAt?: string;
}

export interface ReplayResult {
	/**
	 * ok        rows returned at healthy confidence
	 * advisory  zero rows, but the response answered honestly out of scope (a
	 *           concrete advisory record or a scope note with tryInstead);
	 *           counts as ok
	 * empty     zero rows and no advisory handling: a real miss
	 * weak      rows, but top confidence below the "low" line
	 */
	status: "ok" | "advisory" | "empty" | "weak";
	returned: number;
	matchMode: string | null;
	topConfidence: number | null;
}

/** Long, or mixing letters and digits at length 12+: a key, address or hash. */
const keyShaped = (t: string) =>
	t.length > 24 || (t.length >= 12 && /\d/.test(t) && /[a-z]/.test(t));

/** Distinct content terms of a query, in order. */
export function queryTerms(q: string): string[] {
	const terms = q
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length >= 2 && !isContentStopword(t) && !keyShaped(t));
	return [...new Set(terms)];
}

/**
 * The most-asked distinct queries on replayable endpoints, for the live
 * replay. In memory only: the texts never go into the report.
 */
export function topDemand(
	rows: UsageRow[],
	replayable: Set<string>,
	top: number,
) {
	const demand = new Map<
		string,
		{ endpoint: string; query: string; hits: number; lastSeen: string }
	>();
	for (const r of rows) {
		const ep = r.endpoint ?? "?";
		const q = (r.query ?? "").trim();
		if (!q || !replayable.has(ep)) continue;
		const key = `${ep} ${q.toLowerCase()}`;
		const d = demand.get(key) ?? {
			endpoint: ep,
			query: q,
			hits: 0,
			lastSeen: "",
		};
		d.hits += 1;
		if (r.createdAt && r.createdAt > d.lastSeen) d.lastSeen = r.createdAt;
		demand.set(key, d);
	}
	return [...demand.values()]
		.sort((a, b) => b.hits - a.hits || (a.lastSeen < b.lastSeen ? 1 : -1))
		.slice(0, top);
}

export interface ConsumerReportInput {
	consumer: string;
	meta: { label: string; buckets: string[]; caveat: string };
	rows: UsageRow[];
	replayed: Array<{ endpoint: string; replay: ReplayResult | null }>;
	changelog: Array<{
		date?: string;
		version?: string;
		type?: string;
		summary?: string;
	}>;
	now: Date;
	since: Date;
	days: number;
	base: string;
	minTermCount: number;
	topTerms: number;
}

export function buildConsumerReport(input: ConsumerReportInput) {
	const { consumer, meta, rows, replayed, changelog, now, since, days, base } =
		input;
	const runDate = now.toISOString().slice(0, 10);
	const sinceDay = since.toISOString().slice(0, 10);

	const byEndpoint = new Map<
		string,
		{
			calls: number;
			zero: number;
			withCount: number;
			sumCount: number;
			termBasis: number;
			terms: Map<string, number>;
		}
	>();
	const activeDays = new Set<string>();
	for (const r of rows) {
		const ep = r.endpoint ?? "?";
		const e = byEndpoint.get(ep) ?? {
			calls: 0,
			zero: 0,
			withCount: 0,
			sumCount: 0,
			termBasis: 0,
			terms: new Map(),
		};
		e.calls += 1;
		if (typeof r.resultCount === "number") {
			e.withCount += 1;
			e.sumCount += r.resultCount;
			if (r.resultCount === 0) e.zero += 1;
		}
		const q = (r.query ?? "").trim();
		if (q) {
			e.termBasis += 1;
			for (const t of queryTerms(q)) e.terms.set(t, (e.terms.get(t) ?? 0) + 1);
		}
		byEndpoint.set(ep, e);
		if (r.createdAt) activeDays.add(r.createdAt.slice(0, 10));
	}

	const replayBy = new Map<
		string,
		{
			graded: number;
			ok: number;
			advisory: number;
			empty: number;
			weak: number;
			failed: number;
		}
	>();
	for (const r of replayed) {
		const e = replayBy.get(r.endpoint) ?? {
			graded: 0,
			ok: 0,
			advisory: 0,
			empty: 0,
			weak: 0,
			failed: 0,
		};
		if (r.replay) {
			e.graded += 1;
			e[r.replay.status] += 1;
		} else e.failed += 1;
		replayBy.set(r.endpoint, e);
	}
	const replayByEndpoint = [...replayBy.entries()]
		.map(([endpoint, e]) => ({ endpoint, ...e }))
		.sort((a, b) => b.graded - a.graded);
	// "advisory" counts as ok: the consumer got an honest, concrete handling.
	const replayOk = replayByEndpoint.reduce((s, e) => s + e.ok + e.advisory, 0);
	const replayGraded = replayByEndpoint.reduce((s, e) => s + e.graded, 0);
	const misses = replayByEndpoint.reduce((s, e) => s + e.empty + e.weak, 0);

	const termsByEndpoint = [...byEndpoint.entries()]
		.filter(([, e]) => e.termBasis > 0)
		.map(([endpoint, e]) => ({
			endpoint,
			termBasis: e.termBasis,
			terms: [...e.terms.entries()]
				.filter(([, n]) => n >= input.minTermCount)
				.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
				.slice(0, input.topTerms)
				.map(([term, calls]) => ({ term, calls })),
		}))
		.sort((a, b) => b.termBasis - a.termBasis);

	const report = {
		consumer,
		label: meta.label,
		buckets: meta.buckets,
		caveat: meta.caveat,
		generatedAt: now.toISOString(),
		window: { since: since.toISOString(), days },
		totals: {
			calls: rows.length,
			activeDays: activeDays.size,
			endpoints: byEndpoint.size,
		},
		byEndpoint: [...byEndpoint.entries()]
			.map(([endpoint, e]) => ({
				endpoint,
				calls: e.calls,
				zeroResultCalls: e.zero,
				avgResultCount: e.withCount
					? Math.round((e.sumCount / e.withCount) * 10) / 10
					: null,
			}))
			.sort((a, b) => b.calls - a.calls),
		queryTerms: {
			basis: `single terms asked in at least ${input.minTermCount} calls per endpoint, top ${input.topTerms}; stopwords and key, hash or address shaped tokens dropped; no query text is published`,
			minTermCount: input.minTermCount,
			byEndpoint: termsByEndpoint,
		},
		replayByEndpoint,
		replaySummary: {
			graded: replayGraded,
			ok: replayOk,
			okRate: replayGraded ? Math.round((replayOk / replayGraded) * 100) : null,
			misses,
		},
		contractChangesInWindow: changelog.length,
	};

	const termRows = termsByEndpoint.flatMap((e) =>
		e.terms.map((t) => `| \`${e.endpoint}\` | ${t.term} | ${t.calls} |`),
	);
	const md = `# ${meta.label}: workload quality report, ${runDate}

Window: last ${days} days (from ${sinceDay}). Consumer bucket: \`${meta.buckets.join("`, `")}\`.
> ${meta.caveat}

## Headline

- **${rows.length} calls** across **${byEndpoint.size} endpoints** on **${activeDays.size} active days**
- Top ${replayGraded} distinct queries replayed against the live API **today**: **${replayOk}/${replayGraded} ok**${report.replaySummary.okRate !== null ? ` (${report.replaySummary.okRate}%)` : ""}
- **${changelog.length} contract changes** shipped during the window ([changelog](${base}/api/changelog?since=${sinceDay}))

## What you asked (by endpoint)

| Endpoint | Calls | Zero-result calls | Avg rows |
|---|---|---|---|
${report.byEndpoint.map((e) => `| \`${e.endpoint}\` | ${e.calls} | ${e.zeroResultCalls} | ${e.avgResultCount ?? "n/a"} |`).join("\n")}

## What you asked about (query terms)

Single terms asked in at least ${input.minTermCount} calls on an endpoint (top ${input.topTerms} per endpoint). Query texts are not published: stopwords and tokens shaped like keys, hashes or addresses are dropped before counting.

${termRows.length ? `| Endpoint | Term | Calls |\n|---|---|---|\n${termRows.join("\n")}` : "No term reached the minimum."}

## Do your top queries work today?

The ${replayed.length} most-asked distinct queries were replayed against the live API. Counts only; a miss fixed since the query was sent does not count, a live miss does. Advisory means zero rows but an honest out-of-scope answer, and counts as ok.

| Endpoint | Graded | Ok | Advisory | Empty | Weak | Replay failed |
|---|---|---|---|---|---|---|
${replayByEndpoint.map((e) => `| \`${e.endpoint}\` | ${e.graded} | ${e.ok} | ${e.advisory} | ${e.empty} | ${e.weak} | ${e.failed} |`).join("\n")}

Open misses: ${misses}.

## What changed for you this window

${changelog.length === 0 ? "No contract changes in the window." : changelog.map((c) => `- ${c.date} \`${c.version ?? ""}\` **[${c.type}]** ${c.summary}`).join("\n")}

---
*Generated by \`scripts/consumer-report.ts\` from the api-usage log and a live replay. JSON twin: \`${consumer}-${runDate}.json\`.*
`;
	return { report, md };
}
