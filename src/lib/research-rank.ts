/**
 * Post-retrieval ranking stage for /api/research — shared by the vector and
 * keyword paths. Turns the raw over-fetched chunk pool into the returned list:
 *
 *   1. drop low-value chunks (nav cards, breadcrumb stubs) — same rule the
 *      ingester uses (unchanged, moved here from the route) — and junk URLs
 *      (author archives, pagination mirrors) still present in the corpus
 *      from pre-F5a ingests
 *   2. reclassify dated meeting recaps (/meetings/YYYY/MM/DD) from "dev-docs"
 *      to "meeting-notes" so confidence scores them with recap authority and
 *      real (URL-dated) freshness instead of canonical-doc authority +
 *      evergreen freshness
 *   3. collapse to the best chunk per DOCUMENT (url) AND drop exact-duplicate
 *      content across different URLs (the same recap mirrored on several
 *      index pages must not fill several slots)
 *   4. rank by the SAME confidence signal we attach to every row (relevance +
 *      freshness + authority) instead of raw retrieval score. Relevance folds
 *      in a title-match signal: a doc whose title IS the question is direct
 *      evidence the retrieval score under-weights. This is the general
 *      mechanism that lets a current doc (CCTP live on Stellar, 2026) compete
 *      with a semantically-closer but stale research protocol (Starbridge,
 *      2022, never productionized) on consumer-intent queries: staleness is
 *      already priced into confidence, it just never affected order before.
 *   5. graceful degrade: if per-doc collapse leaves fewer than `limit` docs,
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
	title?: string | null;
	/** Named-protocol field (audit rows) — joins the title-match haystack. */
	protocol?: string | null;
	score?: number;
}

// Crawl artifacts that survived earlier ingests (author archives, pagination
// mirrors, tag/date indexes). The ingester excludes them going forward (F5a
// JUNK_URL); this drops rows already in the corpus at serve time — audit R2:
// /meetings/authors/*/page/2-3 mirrors served the same chunk 3× in one page.
export const JUNK_URL_RE =
	/\/(authors|tags)\/|\/page\/\d+|\/meetings\/?$|\/meetings\/archive/i;

// Dated meeting recaps (developers.stellar.org/meetings/YYYY/MM/DD). Stored
// as source "dev-docs", which hands them 0.95 authority + evergreen
// freshness — audit R2's top junk class: one-paragraph recaps with bare-date
// titles outranked the canonical docs/CAPs they mention. Reclassified at rank
// time (works on the existing corpus, no re-ingest): confidence scores them
// as "meeting-notes" and their date comes from their own URL.
const MEETING_URL_RE = /\/meetings\/(\d{4})\/(\d{2})\/(\d{2})/;

function meetingReclass(c: RankableChunk): {
	source: string;
	publishedAt: string | null;
} {
	const m = c.url.match(MEETING_URL_RE);
	if (!m) return { source: c.source, publishedAt: c.publishedAt };
	return {
		source: "meeting-notes",
		publishedAt: c.publishedAt ?? `${m[1]}-${m[2]}-${m[3]}`,
	};
}

/** Fraction of query tokens present in title (+ named-protocol field). */
function titleMatchFraction(c: RankableChunk, query: string): number {
	// A named-protocol hit is a full match: the user asked about THIS record
	// by name. Without it, "hiyield audit" scored HiYield (protocol match)
	// and xycloans (the generic word 'audit' in its title) the same 0.5 —
	// the off-protocol audit kept the top on a 0.01 cosine edge.
	const proto = (c.protocol ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
	if (
		proto.length >= 4 &&
		query
			.toLowerCase()
			.replace(/[^a-z0-9]/g, "")
			.includes(proto)
	)
		return 1;
	const tokens = [
		...new Set(
			query
				.toLowerCase()
				.split(/[^a-z0-9]+/)
				.filter((t) => t.length > 1),
		),
	];
	if (!tokens.length) return 0;
	const hay = `${c.title ?? ""} ${c.protocol ?? ""}`.toLowerCase();
	return tokens.filter((t) => hay.includes(t)).length / tokens.length;
}

export function rankResearchChunks<T extends RankableChunk>(
	pool: T[],
	opts: {
		limit: number;
		mode: "vector" | "keyword";
		query?: string;
		now?: number;
	},
): Array<T & { confidence: Confidence }> {
	const now = opts.now ?? Date.now();
	const filtered = pool.filter(
		(c) => !isLowValueChunk(c.content) && !JUNK_URL_RE.test(c.url),
	);

	// Keyword-mode relevance normalizes against the pool max (not the sliced
	// page max, as before — the pool is the honest denominator).
	const maxScore = filtered.reduce((m, c) => Math.max(m, c.score ?? 0), 0);

	const scored = filtered
		.map((c) => {
			const eff = meetingReclass(c);
			return {
				...c,
				// Serve the URL-derived date on meeting rows too — the row must
				// not say publishedAt:null while its confidence prices in age.
				publishedAt: eff.publishedAt,
				confidence: researchConfidence({
					score: c.score,
					source: eff.source,
					mode: opts.mode,
					maxScore,
					publishedAt: eff.publishedAt,
					titleMatch: opts.query ? titleMatchFraction(c, opts.query) : 0,
					now,
				}),
			};
		})
		// Confidence order; raw retrieval score breaks ties (confidence rounds
		// to 2dp, so near-equals happen).
		.sort(
			(a, b) =>
				b.confidence.score - a.confidence.score ||
				(b.score ?? 0) - (a.score ?? 0),
		);

	// Best chunk per document first — also collapsing exact-duplicate content
	// served under different URLs (index-page mirrors of the same recap).
	const seenUrl = new Set<string>();
	const seenContent = new Set<string>();
	const primary: typeof scored = [];
	const leftovers: typeof scored = [];
	for (const c of scored) {
		const contentKey = c.content.trim();
		if (seenContent.has(contentKey)) continue; // mirror — never serve twice
		seenContent.add(contentKey);
		if (seenUrl.has(c.url)) leftovers.push(c);
		else {
			seenUrl.add(c.url);
			primary.push(c);
		}
	}
	// …then refill from leftovers only if distinct docs can't fill the page.
	return [...primary, ...leftovers].slice(0, opts.limit);
}
