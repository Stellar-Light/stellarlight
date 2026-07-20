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
// Known-wrong-fact corrections (serve-time guard): a chunk whose URL matches
// urlRe AND whose content matches wrongRe is SUPPRESSED until the upstream
// source is corrected and re-ingested. The fact-level sibling of the
// CANONICAL_PAGES registry: we cannot edit other people's articles, but we
// can refuse to serve renderings we have verified to be wrong. Each entry
// documents the verified truth. Remove entries once the source re-ingests
// clean (the golden forbiddenRegex lock stays as the permanent guard).
export const FACT_CORRECTIONS: Array<{
	urlRe: RegExp;
	wrongRe: RegExp;
	note: string;
}> = [
	{
		// lumenloop weekly roundups (week-1 AND week-15 confirmed 2026-07-14)
		// mis-state the Blend/YieldBlox incident as "May 2026, attempted &
		// contained, $61M". Verified truth (Blockaid/BlockSec): 2026-02-22,
		// COMPLETED drain of 61,249,278 XLM ≈ $10.2M, pool-operator oracle
		// misconfiguration; ~48M XLM quarantined.
		urlRe: /lumenloop\.com\/research\/stellar-weekly-roundup/i,
		wrongRe: /\$61 ?m|61 million dollars|may 2026.{0,60}(attempted|contained)/i,
		note: "Blend/YieldBlox incident facts mis-stated upstream",
	},
];

export const JUNK_URL_RE =
	/\/(authors|tags)\/|\/page\/\d+|\/meetings\/?$|\/meetings\/archive/i;

// Dated meeting recaps (developers.stellar.org/meetings/YYYY/MM/DD). Stored
// as source "dev-docs", which hands them 0.95 authority + evergreen
// freshness — audit R2's top junk class: one-paragraph recaps with bare-date
// titles outranked the canonical docs/CAPs they mention. Reclassified at rank
// time (works on the existing corpus, no re-ingest): confidence scores them
// as "meeting-notes" and their date comes from their own URL.
const MEETING_URL_RE = /\/meetings\/(\d{4})\/(\d{2})\/(\d{2})/;

// A bare-date or placeholder title is not a citation an agent can quote.
// The meeting pages' <title> AND <h1> are both the bare date, so ingest
// can't copy a better one — synthesize from what the row knows. Date comes
// from the URL (the h1 date is TZ-drifted +1 day vs the URL/byline).
const JUNK_MEETING_TITLE_RE = /^(\d{4}-\d{2}-\d{2}|meeting notes)$/i;

function meetingReclass(c: RankableChunk): {
	source: string;
	publishedAt: string | null;
	title: string | null | undefined;
} {
	const m = c.url.match(MEETING_URL_RE);
	if (!m) {
		return { source: c.source, publishedAt: c.publishedAt, title: c.title };
	}
	let title = c.title;
	const t = (title ?? "").trim();
	if (!t || JUNK_MEETING_TITLE_RE.test(t)) {
		// "Protocol Meeting" only when the chunk itself says so; otherwise the
		// neutral truth (every /meetings/ page is a developer meeting recap).
		const kind = /\bprotocol meeting\b/i.test(c.content)
			? "Protocol Meeting"
			: "Developer Meeting";
		title = `Stellar ${kind} ${m[1]}-${m[2]}-${m[3]}`;
	}
	return {
		source: "meeting-notes",
		publishedAt: c.publishedAt ?? `${m[1]}-${m[2]}-${m[3]}`,
		title,
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

// ── full lexical coverage: every query token present verbatim ──
// Brand/proper-noun queries are lookups cosine under-measures: for "Alchemy
// Stellar Data API transfers balances" the chunk that literally documents
// Alchemy's Data API ranked below top-15 behind pages merely TITLED
// "Balances"/"Token Transfers", and bare q=Alchemy served 0 (its lone-word
// embedding's nearest neighbours were all low-value chunks). A chunk carrying
// EVERY query token verbatim gets a relevance floor (0.8 — under anchors and
// exact IDs; see fullLexicalMatch in confidence.ts). Guards: 1–8 tokens
// (longer NL questions are genuinely semantic, and a degenerate token list
// would make coverage meaningless), tokens ≥2 chars (same tokenization as the
// keyword fallback), and — critically — the floor applies only when coverage
// is DISCRIMINATING: at most 5 chunks in the pool carry it. First deploy
// skipped that gate and golden regressed 3 cases ("SCF handbook link" served
// seven uniform-floored lumenloop tool pages that merely contain the words
// scf/handbook/link, crowding out the actual handbook root; "latest soroban
// release" floored generic evergreen version pages over the dated Zipper
// post). When many chunks cover the tokens, the tokens are generic and
// coverage carries no lookup signal — floor nothing and let cosine decide.
const FULL_LEXICAL_MAX_TOKENS = 8;
const FULL_LEXICAL_DISCRIMINATING_MAX = 5;

export function queryLexTokens(query: string | undefined): string[] {
	if (!query) return [];
	const tokens = [
		...new Set(
			query
				.toLowerCase()
				.split(/[^a-z0-9]+/)
				.filter((t) => t.length > 1)
				// Trailing-s de-plural (len>3): the query said "transfers" but the
				// chunk says "transfer history" — substring matching on the stem
				// covers both forms in the coverage check AND the supplement's
				// `contains` fetch ("transfer" matches transfer/transfers).
				.map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t)),
		),
	];
	return tokens.length >= 1 && tokens.length <= FULL_LEXICAL_MAX_TOKENS
		? tokens
		: [];
}

export function hasFullLexicalCoverage(
	c: { title?: string | null; section?: string | null; content: string },
	tokens: string[],
): boolean {
	if (!tokens.length) return false;
	const hay = `${c.title ?? ""} ${c.section ?? ""} ${c.content}`.toLowerCase();
	return tokens.every((t) => hay.includes(t));
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

// Sources whose publishedAt is a MAINTENANCE date, not a publication date.
// dev-docs rows derive publishedAt from the page's "Last updated on …" footer
// (ingest-developers-docs.ts, added for data honesty with the explicit note
// "dev-docs remain evergreen for freshness"). A lastmod proves the page was
// recently EDITED — it says nothing about whether the CONTENT answers a
// "latest/recent" question. Counting it as publication evidence re-created
// the exact failure the recency re-sort was built for: lastmod-fresh generic
// guides (Hardhat migration, edited 8 days ago) outranked the actual dated
// Protocol 27 (Zipper) announcement for "latest soroban release". In the
// recency re-sort these sources score like undated (0.35); their lastmod
// still serves on the row so consumers see the true page age.
const LASTMOD_DATED_SOURCES = new Set(["dev-docs"]);

function datedFreshness(
	publishedAt: string | null,
	now: number,
	source?: string,
): number {
	if (!publishedAt) return 0.35; // undated can't prove currency
	if (source && LASTMOD_DATED_SOURCES.has(source)) return 0.35; // lastmod ≠ publication
	const ts = new Date(publishedAt).getTime();
	if (!Number.isFinite(ts)) return 0.35;
	const ageDays = Math.max(0, (now - ts) / 86_400_000);
	return 2 ** (-ageDays / RECENCY_HALF_LIFE_DAYS);
}

// ── Recency pool supplement (fetch-stage sibling of the re-sort above) ──
// The re-sort can only promote what the vector pool FETCHED. For "latest
// soroban release" the Protocol 27 (Zipper) announcement never entered the
// 48-chunk pool (cosine can't encode publishedAt any more than it can encode
// a CAP number — same class as the sls-019 identifier direct-fetch), so no
// rank-stage logic could serve it. When recency intent fires, the route
// supplements the pool with the corpus's most-recent PUBLICATION-dated chunks
// that share ≥1 content token with the query, scored with their real stored-
// embedding cosine (no invented relevance — an off-topic-but-fresh chunk
// still ranks by its true similarity). Selection is pure and unit-tested
// here; the DB fetch + cosine live in the route / research-pipeline.
export const RECENCY_SUPPLEMENT_WINDOW_DAYS = 120;
export const RECENCY_SUPPLEMENT_MAX = 15;
export const RECENCY_SUPPLEMENT_PER_DOC_CAP = 3;
/** Publication-dated sources eligible for the supplement fetch. Excluded:
 * dev-docs (lastmod-dated, see LASTMOD_DATED_SOURCES), sep/cap/scf-handbook
 * (undated — the date filter would drop them anyway). */
export const RECENCY_SUPPLEMENT_SOURCES = [
	"sdf-blog",
	"lumenloop-research",
	"lumenloop",
	"ec-developer-report",
	"scf-proposal",
	"incident",
	"audit",
	"security-program",
	"sdf-org",
	"paper",
];

// Query words that express the recency ASK rather than the topic — they must
// not count as content overlap ("latest" appearing in a chunk is not evidence
// the chunk is about soroban releases). Closed-class stopwords + the recency
// vocabulary + bare years.
const RECENCY_STOP = new Set([
	"the",
	"a",
	"an",
	"and",
	"or",
	"of",
	"to",
	"in",
	"on",
	"for",
	"with",
	"by",
	"is",
	"are",
	"was",
	"what",
	"which",
	"how",
	"latest",
	"newest",
	"most",
	"recent",
	"recently",
	"current",
	"currently",
	"this",
	"year",
	"month",
	"week",
	"today",
	"new",
]);

/** Topic tokens of a recency query — the words the supplement must overlap. */
export function recencyContentTokens(query: string | undefined): string[] {
	if (!query) return [];
	return [
		...new Set(
			query
				.toLowerCase()
				.split(/[^a-z0-9]+/)
				.filter(
					(t) => t.length > 2 && !RECENCY_STOP.has(t) && !/^20\d\d$/.test(t),
				),
		),
	];
}

/**
 * Pure selection stage for the recency supplement: from `candidates` (chunk
 * rows the route fetched by publishedAt desc), keep rows that (a) carry a
 * date within the window, (b) share ≥1 content token with the query in
 * title+content (all rows qualify when the query is a pure recency ask with
 * no topic tokens), capped per document so one heavily-chunked roundup can't
 * consume the whole budget, newest first.
 */
export function selectRecencySupplement<
	T extends {
		url: string;
		content: string;
		title?: string | null;
		publishedAt?: string | null;
	},
>(
	candidates: T[],
	query: string | undefined,
	opts: { now?: number; max?: number; perDocCap?: number } = {},
): T[] {
	const now = opts.now ?? Date.now();
	const max = opts.max ?? RECENCY_SUPPLEMENT_MAX;
	const perDocCap = opts.perDocCap ?? RECENCY_SUPPLEMENT_PER_DOC_CAP;
	const cutoff = now - RECENCY_SUPPLEMENT_WINDOW_DAYS * 86_400_000;
	const tokens = recencyContentTokens(query);

	const dated = candidates.filter((c) => {
		if (!c.publishedAt) return false;
		const ts = new Date(c.publishedAt).getTime();
		if (!Number.isFinite(ts) || ts < cutoff || ts > now + 86_400_000)
			return false;
		if (!tokens.length) return true;
		const hay = `${c.title ?? ""} ${c.content}`.toLowerCase();
		return tokens.some((t) => hay.includes(t));
	});

	dated.sort(
		(a, b) =>
			new Date(b.publishedAt ?? 0).getTime() -
			new Date(a.publishedAt ?? 0).getTime(),
	);

	const perDoc = new Map<string, number>();
	const out: T[] = [];
	for (const c of dated) {
		const n = perDoc.get(c.url) ?? 0;
		if (n >= perDocCap) continue;
		perDoc.set(c.url, n + 1);
		out.push(c);
		if (out.length >= max) break;
	}
	return out;
}

// ── Curated vertical ANCHOR docs (research sibling of the repos lane's ──
// VERTICAL_FLAGSHIPS). For a recognized consumer-intent class, the corpus's
// curated canonical answer docs get their relevance FLOORED (confidence.ts
// anchorMatch, 0.85) so embedding myopia can't bury them — and the route
// direct-fetches them into the pool when the vector stage missed them
// entirely (same inclusion-not-just-ranking principle as sls-018/019).
// The bridge case is the archetype (golden bridge-evm-to-stellar, the
// 2026-07-09 demo miss): "bridge assets from EVM to Stellar" embeds next to
// EVM CONTRACT-MIGRATION docs, so the canonical CCTP cross-chain-transfers
// how-to sat below rank 40 and the corpus's authoritative Allbridge-on-
// Stellar record (its Quarkslab bridge audit — the only Allbridge doc any of
// our sources carry) sat at 11-16, while the top-5 answered a question the
// user didn't ask. Discipline mirrors VERTICAL_FLAGSHIPS: every URL verified
// present in the corpus at registry-write time; add a vertical ONLY for a
// demonstrated embedding-myopia class with human-verified canonical docs —
// never to make an eval green.
export const RESEARCH_ANCHORS: Array<{
	id: string;
	/** Intent word — the verb/noun naming the vertical. */
	intent: RegExp;
	/** Context word — asset-movement vocabulary that separates consumer
	 *  "move my assets" intent from e.g. "the starbridge paper" or
	 *  "tricorn bridge audit findings". Both must hit. */
	context: RegExp;
	urls: string[];
}> = [
	{
		id: "bridge-assets",
		intent: /\bbridg(?:e|es|ing)\b|\bcross[\s-]?chain\b/i,
		context:
			/\b(?:assets?|tokens?|usdc|usdt|xlm|stablecoins?|funds?|money|transfer|move|send|swap|from|to|into|onto|evm|ethereum|eth|solana|polygon|arbitrum|base|bnb|avalanche|tron)\b/i,
		urls: [
			// Verified in-corpus 2026-07-14 (cosine 0.82 for a direct CCTP query):
			// the canonical dev-docs how-to for moving assets into Stellar.
			"https://developers.stellar.org/docs/tokens/cross-chain-transfers",
			// Verified in-corpus 2026-07-14: Quarkslab's Allbridge Core Soroban
			// bridge audit — the corpus's authoritative record that Allbridge
			// (the general-asset EVM↔Stellar route) runs on Stellar.
			"https://stellarsecurityportal.com/report/4",
		],
	},
];

/** Anchor-doc URLs for a query — empty unless an intent class fires. */
export function anchorDocUrls(query: string | undefined): string[] {
	if (!query) return [];
	const out: string[] = [];
	for (const a of RESEARCH_ANCHORS) {
		if (a.intent.test(query) && a.context.test(query))
			for (const u of a.urls) if (!out.includes(u)) out.push(u);
	}
	return out;
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
		(c) =>
			!isLowValueChunk(c.content) &&
			!JUNK_URL_RE.test(c.url) &&
			!FACT_CORRECTIONS.some(
				(fc) => fc.urlRe.test(c.url) && fc.wrongRe.test(c.content),
			),
	);

	// Keyword-mode relevance normalizes against the pool max (not the sliced
	// page max, as before — the pool is the honest denominator).
	const maxScore = filtered.reduce((m, c) => Math.max(m, c.score ?? 0), 0);

	// Exact CAP/SEP identifier pin (sls-019): the named document must rank
	// ahead of vector order — an exact-ID query is a lookup, not a search.
	const targets = identifierTargets(opts.query);
	const pinned = (c: RankableChunk) =>
		targets.length > 0 && matchesTarget(c.url, targets);

	// Curated vertical anchors (see RESEARCH_ANCHORS): relevance floor, not a
	// hard pin — identifier lookups and genuinely-stronger matches stay ahead.
	const anchors = anchorDocUrls(opts.query);
	const anchored = (c: RankableChunk) => anchors.includes(c.url);

	// Full lexical coverage (brand/lookup queries): every query token verbatim
	// in the chunk → relevance floor 0.8 — but ONLY while coverage is
	// discriminating (≤ FULL_LEXICAL_DISCRIMINATING_MAX chunks carry it); a
	// widely-covered token set is generic vocabulary, not a lookup key.
	const lexTokens = queryLexTokens(opts.query);
	const coveredIds = new Set<RankableChunk>();
	if (lexTokens.length) {
		for (const c of filtered) {
			if (hasFullLexicalCoverage(c, lexTokens)) coveredIds.add(c);
		}
	}
	// Recency-intent queries ("latest soroban release", "recent mainnet
	// upgrade") are time-anchored, not lookups: covering the words latest/
	// release/upgrade is noise by construction, and the floored evergreen rows
	// (Software Versions, Network Status — conf 0.86, undated) displaced the
	// dated Protocol-27 posts the recency blend exists to serve (golden
	// protocol-currency cases, 2026-07-16). The floor never applies here —
	// dated freshness stays the ranking signal.
	const lexFloorActive =
		!recencyIntent(opts.query) &&
		coveredIds.size >= 1 &&
		coveredIds.size <= FULL_LEXICAL_DISCRIMINATING_MAX;

	const scored = filtered
		.map((c) => {
			const eff = meetingReclass(c);
			const isPinned = pinned(c);
			return {
				...c,
				// Serve the URL-derived date on meeting rows too — the row must
				// not say publishedAt:null while its confidence prices in age.
				publishedAt: eff.publishedAt,
				// Bare-date meeting titles become quotable citations (BAD-TITLE).
				title: eff.title,
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
					anchorMatch: anchored(c),
					fullLexicalMatch: lexFloorActive && coveredIds.has(c),
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
	// can't hijack the page. Identifier pins still take precedence. Dated
	// freshness is source-aware: a lastmod-dated source (dev-docs) can't
	// spend its edit date as publication evidence, while meeting recaps'
	// URL-derived dates (reclassified above) still count.
	if (recencyIntent(opts.query)) {
		const key = (c: (typeof scored)[number]) =>
			0.6 * c.confidence.score +
			0.4 * datedFreshness(c.publishedAt, now, meetingReclass(c).source);
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
