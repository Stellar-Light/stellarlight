/**
 * Post-retrieval ranking stage for /api/research — shared by the vector and
 * keyword paths. Turns the raw over-fetched chunk pool into the returned list:
 *
 *   1. drop low-value chunks (nav cards, breadcrumb stubs) — same rule the
 *      ingester uses (unchanged, moved here from the route)
 *   2. collapse to the best chunk per DOCUMENT (url): two chunks of the same
 *      post tell a synthesizer nothing twice, and duplicate chunks were
 *      crowding real answers out of the top-K (the EVM→Stellar bridging miss:
 *      Starbridge chunks ×2 + Spectra audit ×2 filled 4 of 5 slots)
 *   3. rank by the SAME confidence signal we attach to every row (relevance +
 *      freshness + authority) instead of raw retrieval score. The meta note
 *      has always told agents "sort by confidence for trust-ranked results" —
 *      now the server order agrees with its own advice. This is the general
 *      mechanism that lets a current doc (CCTP live on Stellar, 2026) compete
 *      with a semantically-closer but stale research protocol (Starbridge,
 *      2022, never productionized) on consumer-intent queries: staleness is
 *      already priced into confidence, it just never affected order before.
 *   4. graceful degrade: if per-doc collapse leaves fewer than `limit` docs,
 *      refill with the next-best leftover chunks so thin corpora still fill
 *      the page (a niche query matching one long doc keeps returning chunks).
 *
 * Pure function — no I/O — so the ranking policy is unit-testable and the
 * golden eval exercises the same code path production serves.
 */

import { type Confidence, researchConfidence } from "@/lib/confidence";
import { isLowValueChunk } from "@/lib/research-ingest";

export interface RankableChunk {
	url: string;
	content: string;
	source: string;
	publishedAt: string | null;
	score?: number;
}

export function rankResearchChunks<T extends RankableChunk>(
	pool: T[],
	opts: { limit: number; mode: "vector" | "keyword"; now?: number },
): Array<T & { confidence: Confidence }> {
	const now = opts.now ?? Date.now();
	const filtered = pool.filter((c) => !isLowValueChunk(c.content));

	// Keyword-mode relevance normalizes against the pool max (not the sliced
	// page max, as before — the pool is the honest denominator).
	const maxScore = filtered.reduce((m, c) => Math.max(m, c.score ?? 0), 0);

	const scored = filtered
		.map((c) => ({
			...c,
			confidence: researchConfidence({
				score: c.score,
				source: c.source,
				mode: opts.mode,
				maxScore,
				publishedAt: c.publishedAt,
				now,
			}),
		}))
		// Confidence order; raw retrieval score breaks ties (confidence rounds
		// to 2dp, so near-equals happen).
		.sort(
			(a, b) =>
				b.confidence.score - a.confidence.score ||
				(b.score ?? 0) - (a.score ?? 0),
		);

	// Best chunk per document first…
	const seen = new Set<string>();
	const primary: typeof scored = [];
	const leftovers: typeof scored = [];
	for (const c of scored) {
		if (seen.has(c.url)) leftovers.push(c);
		else {
			seen.add(c.url);
			primary.push(c);
		}
	}
	// …then refill from leftovers only if distinct docs can't fill the page.
	return [...primary, ...leftovers].slice(0, opts.limit);
}
