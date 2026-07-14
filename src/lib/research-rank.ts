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

// ── sls-019: exact CAP/SEP identifiers are retrieval KEYS, not hints ──
// Vector embeddings can't key on proposal numbers: for q=CAP-0038 the
// cross-referencing CAPs outrank the named document (live sweep 2026-07-13:
// rank 23; five of seven exact IDs missed top-5 — upstream issue #510).
// Detection normalizes every form (CAP-38, cap 0038, sep#10, SEP-0024) to the
// canonical zero-padded slug; ranking pins the identified document(s) above
// vector order and floors their relevance (see exactIdMatch in confidence.ts).
const IDENTIFIER_RE = /\b(cap|sep)[\s\-_#]*(\d{1,4})\b/gi;
// "Sep 24, 2025" / "24 Sep 2026" are DATES, not SEP-0024. When the query
// carries a date-shaped 'sep', skip its space/bare-separated matches; the
// hyphen/hash forms (sep-24, sep#24) still count as identifiers.
const SEP_DATE_RE =
	/\b(?:\d{1,2}(?:st|nd|rd|th)?\s+sep\b|sep\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+(?:19|20)\d{2})/i;

/**
 * Canonical proposal slugs named by the query (e.g. "cap-0038", "sep-0010"),
 * deduped, in mention order. Empty when the query names none.
 */
export function identifierTargets(query: string | undefined): string[] {
	if (!query) return [];
	const sepLooksLikeDate = SEP_DATE_RE.test(query);
	const out: string[] = [];
	for (const m of query.matchAll(IDENTIFIER_RE)) {
		const kind = m[1].toLowerCase();
		// Space/bare-separated "sep 24" inside a date-shaped query is a month.
		if (kind === "sep" && sepLooksLikeDate && !/[-#_]/.test(m[0])) continue;
		const id = `${kind}-${String(Number.parseInt(m[2], 10)).padStart(4, "0")}`;
		if (!out.includes(id)) out.push(id);
	}
	return out;
}

/** Does this chunk belong to one of the identifier-named documents? */
function matchesTarget(url: string, targets: string[]): boolean {
	return targets.some((id) =>
		new RegExp(`/${id}\\.md(?:$|[#?])`, "i").test(url),
	);
}

// Recency INTENT — the query literally asks for what's newest ("latest
// soroban release", "recent mainnet upgrade", "stellar news 2026"). The
// standard confidence blend scores canonical docs EVERGREEN (freshness=1,
// no decay), which is right for "what is sep-10" but inverts these queries:
// the 2026-07-11 audit showed "latest soroban release" serving the undated
// Protocol 20 section of software-versions at full freshness while the
// dated Protocol 27 (Zipper) content sat lower. When intent is detected we
// re-sort with DATED freshness (short half-life, evergreen NOT exempt:
// undated → 0.35) blended with confidence — structured truth (publishedAt)
// must drive ranking for the query that asks for it.
const RECENCY_INTENT_RE =
	/\b(latest|newest|most recent|recent(ly)?|current(ly)?|this (year|month|week)|today|new in|202[5-9])\b/i;
const RECENCY_HALF_LIFE_DAYS = 120;

export function recencyIntent(query: string | undefined): boolean {
	return !!query && RECENCY_INTENT_RE.test(query);
}

function datedFreshness(publishedAt: string | null, now: number): number {
	if (!publishedAt) return 0.35; // undated can't prove currency
	const ts = new Date(publishedAt).getTime();
	if (!Number.isFinite(ts)) return 0.35;
	const ageDays = Math.max(0, (now - ts) / 86_400_000);
	return 2 ** (-ageDays / RECENCY_HALF_LIFE_DAYS);
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

	// Exact CAP/SEP identifier pin (sls-019): the named document must rank
	// ahead of vector order — an exact-ID query is a lookup, not a search.
	const targets = identifierTargets(opts.query);
	const pinned = (c: RankableChunk) =>
		targets.length > 0 && matchesTarget(c.url, targets);

	const scored = filtered
		.map((c) => {
			const eff = meetingReclass(c);
			const isPinned = pinned(c);
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
					// An identifier hit is a full title match: the user asked about
					// THIS document by its canonical ID (same rule as protocol hits).
					titleMatch: isPinned
						? 1
						: opts.query
							? titleMatchFraction(c, opts.query)
							: 0,
					exactIdMatch: isPinned,
					now,
				}),
			};
		})
		// Identifier-named docs first; then confidence order; raw retrieval
		// score breaks ties (confidence rounds to 2dp, so near-equals happen).
		.sort(
			(a, b) =>
				Number(pinned(b)) - Number(pinned(a)) ||
				b.confidence.score - a.confidence.score ||
				(b.score ?? 0) - (a.score ?? 0),
		);

	// Recency-intent re-sort (see RECENCY_INTENT_RE above): blend confidence
	// with dated freshness so provably-current chunks top "latest/recent"
	// queries. Confidence still carries 60% — a fresh-but-irrelevant chunk
	// can't hijack the page. Identifier pins still take precedence.
	if (recencyIntent(opts.query)) {
		const key = (c: (typeof scored)[number]) =>
			0.6 * c.confidence.score + 0.4 * datedFreshness(c.publishedAt, now);
		scored.sort(
			(a, b) => Number(pinned(b)) - Number(pinned(a)) || key(b) - key(a),
		);
	}

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
