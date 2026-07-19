/**
 * Confidence scoring for research results.
 *
 * Tyler/SDF's forward-deployed agent depends on its data layers "scoring and
 * ensuring the information remains accurate" — a raw cosine score isn't enough
 * for an agent to decide what to trust. This blends three transparent signals
 * into one 0–1 confidence + a label, and returns the components so a consumer
 * can see WHY:
 *
 *   relevance  — how well the chunk matches the query (the retrieval score,
 *                normalized to a comparable 0–1 across vector/keyword modes)
 *   freshness  — source-aware recency. Canonical references (SEPs, dev docs,
 *                audits) don't decay; time-sensitive sources (blog, research,
 *                EC reports) decay with age. Directly addresses the "stale
 *                Okashi project still surfacing" failure the team flagged.
 *   authority  — how authoritative the source is (a SEP > a community blog)
 *
 * Deterministic + versioned (SCORE_MODEL_VERSION) so agentic workflows get
 * stable, explainable numbers. Pure function — no I/O.
 */

export type ScoreMode = "vector" | "keyword";

export const SCORE_MODEL_VERSION = "research-confidence-1";

/** Per-source trust weight (0–1). Canonical specs/docs rank highest. */
const AUTHORITY: Record<string, number> = {
	sep: 1.0,
	// Core protocol proposals — same canonical-spec tier as SEPs.
	cap: 1.0,
	"dev-docs": 0.95,
	paper: 0.92,
	audit: 0.9,
	// A real exploit/incident is the single most safety-relevant signal for a
	// "is it safe to build on?" question — at least as authoritative as an audit.
	incident: 0.9,
	// SDF's controlling bug-bounty / vulnerability-disclosure policy (the
	// HackerOne program page + curated supersession records). Policy-grade —
	// same tier as audits/incidents. NOT evergreen: which program is current
	// is exactly the kind of claim that goes stale (sls-020).
	"security-program": 0.9,
	// Canonical stellar.org organizational pages (sls-055): SDF's own
	// first-party statements of its legal structure, mandate, fund scope,
	// and leadership. For org/legal claims these ARE the controlling source
	// — same policy-grade tier as security-program. NOT evergreen: the
	// mandate and fund figures are current-state claims that move.
	"sdf-org": 0.9,
	"scf-handbook": 0.85,
	"ec-developer-report": 0.8,
	"scf-proposal": 0.72,
	"sdf-blog": 0.7,
	"lumenloop-research": 0.62,
	lumenloop: 0.6,
	// Dated protocol/dev meeting recaps (developers.stellar.org/meetings/…).
	// Legit primary sources, but a one-paragraph recap must not outrank the
	// canonical doc/CAP it mentions — audit R2: meeting notes rode dev-docs'
	// 0.95 authority + evergreen freshness to the top of concept queries.
	// They're also time-sensitive (freshness decays), unlike reference docs.
	"meeting-notes": 0.5,
};
const DEFAULT_AUTHORITY = 0.6;

/**
 * Sources whose value does not decay with age: canonical specs (SEPs), the
 * continuously re-ingested dev docs, foundational papers, and point-in-time
 * but still-authoritative audit findings. Everything else is time-sensitive.
 */
const EVERGREEN = new Set([
	"sep",
	"cap",
	"dev-docs",
	"paper",
	"audit",
	// A past incident is a durable historical fact — "a YieldBlox Blend V2
	// pool was drained via oracle misconfiguration on 2026-02-22" stays true
	// and stays relevant to safety due-diligence, so it shouldn't decay out
	// of confidence over time.
	"incident",
	"scf-handbook",
]);
const FRESHNESS_HALF_LIFE_DAYS = 540; // ~18mo: a 1.5y-old blog post → 0.5

function clamp01(n: number): number {
	return Math.max(0, Math.min(1, n));
}
function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

/** Normalize a raw retrieval score to a 0–1 relevance, mode-aware. */
function relevanceFrom(
	score: number,
	mode: ScoreMode,
	maxScore: number,
): number {
	if (mode === "vector") {
		// Atlas cosine vectorSearchScore clusters roughly 0.55 (weak) … 0.85
		// (strong) for our normalized embeddings; rescale that band to 0–1 so
		// confidence actually discriminates instead of hugging the top.
		return clamp01((score - 0.55) / 0.3);
	}
	// keyword (BM25-lite): scores are arbitrary magnitudes — normalize to the
	// best result in this set.
	return maxScore > 0 ? clamp01(score / maxScore) : 0;
}

function freshnessFrom(
	source: string,
	publishedAt: string | null | undefined,
	now: number,
): { freshness: number; ageDays: number | null } {
	if (EVERGREEN.has(source)) return { freshness: 1, ageDays: null };
	if (!publishedAt) return { freshness: 0.6, ageDays: null }; // unknown → neutral
	const ts = new Date(publishedAt).getTime();
	if (!Number.isFinite(ts)) return { freshness: 0.6, ageDays: null };
	const ageDays = Math.max(0, Math.round((now - ts) / 86_400_000));
	const freshness = clamp01(2 ** (-ageDays / FRESHNESS_HALF_LIFE_DAYS));
	return { freshness, ageDays };
}

export interface Confidence {
	/** Composite 0–1. */
	score: number;
	label: "high" | "medium" | "low";
	relevance: number;
	freshness: number;
	authority: number;
	/** Age of the source doc in days, when known and time-sensitive. */
	ageDays: number | null;
}

export interface ConfidenceInput {
	score: number | null | undefined;
	source: string;
	mode: ScoreMode;
	/** Max raw score in the result set — used to normalize keyword mode. */
	maxScore: number;
	publishedAt?: string | null;
	/**
	 * 0–1 fraction of query tokens found in the doc's title (+ named-protocol
	 * field where present). A title that IS the question is direct relevance
	 * evidence the retrieval score under-weights — audit R2: the doc titled
	 * 'Install the CLI' ranked 16 for q="install stellar cli" while meeting
	 * recaps filled the top. Folded into relevance (not a separate axis) so
	 * the composite stays explainable as relevance+freshness+authority.
	 */
	titleMatch?: number;
	/**
	 * The query names THIS document by its canonical identifier (CAP-0038,
	 * SEP-0010). An exact-key hit is the strongest relevance evidence there is
	 * — and precisely the signal cosine similarity can't encode (sls-019: the
	 * named CAP ranked 23rd for its own ID) — so relevance is floored at 0.9
	 * rather than left to the retrieval score.
	 */
	exactIdMatch?: boolean;
	/**
	 * This document is a curated vertical ANCHOR for the query's intent class
	 * (RESEARCH_ANCHORS in research-rank.ts — e.g. the canonical CCTP
	 * cross-chain-transfers doc for consumer bridge intent). Registry-asserted
	 * relevance the embedding demonstrably under-measures (the CCTP how-to
	 * scored below rank 40 for "bridge assets from EVM to Stellar"), so
	 * relevance is floored at 0.85 — just under the exact-ID floor: a curated
	 * intent match is strong evidence, but weaker than the user naming the
	 * document by its own key.
	 */
	anchorMatch?: boolean;
	/**
	 * EVERY query token appears verbatim in the chunk (title+section+content) —
	 * lookup-grade lexical evidence cosine demonstrably under-measures for
	 * brand/proper-noun queries: "Alchemy Stellar Data API transfers balances"
	 * ranked the chunk that literally documents Alchemy's Data API below
	 * top-15, and bare q=Alchemy returned 0 (2026-07-16 live probes). Floored
	 * at 0.8 — under anchors (curated assertion) and exact IDs (the user named
	 * the document): full token coverage is strong but circumstantial, so
	 * genuinely-closer embeddings still win. Raw cosine orders full-coverage
	 * peers among themselves.
	 */
	fullLexicalMatch?: boolean;
	/** Injectable clock so callers/tests are deterministic. Defaults to now. */
	now?: number;
}

/**
 * Shared blend for relevance-ranked results (research, projects): relevance
 * dominates (a result must actually match), with freshness + authority
 * adjusting trust. One scale + label set across endpoints so an agent reads
 * confidence the same way everywhere.
 */
export function composeConfidence(
	relevance: number,
	freshness: number,
	authority: number,
	ageDays: number | null,
): Confidence {
	let composite = 0.65 * relevance + 0.15 * freshness + 0.2 * authority;
	// Guardrail: a barely-relevant result can't be "trustworthy" no matter how
	// authoritative/fresh its source — cap it.
	if (relevance < 0.2) composite = Math.min(composite, 0.4);
	composite = clamp01(composite);
	const label =
		composite >= 0.75 ? "high" : composite >= 0.45 ? "medium" : "low";
	return {
		score: round2(composite),
		label,
		relevance: round2(relevance),
		freshness: round2(freshness),
		authority: round2(authority),
		ageDays,
	};
}

export function researchConfidence(input: ConfidenceInput): Confidence {
	const now = input.now ?? Date.now();
	let relevance = clamp01(
		relevanceFrom(input.score ?? 0, input.mode, input.maxScore) +
			0.15 * clamp01(input.titleMatch ?? 0),
	);
	if (input.exactIdMatch) relevance = Math.max(relevance, 0.9);
	else if (input.anchorMatch) relevance = Math.max(relevance, 0.85);
	else if (input.fullLexicalMatch) relevance = Math.max(relevance, 0.8);
	const authority = AUTHORITY[input.source] ?? DEFAULT_AUTHORITY;
	const { freshness, ageDays } = freshnessFrom(
		input.source,
		input.publishedAt,
		now,
	);
	return composeConfidence(relevance, freshness, authority, ageDays);
}

/**
 * Confidence for a project search result. Same blend as research, but the
 * signals are project-appropriate: keyword relevance, lifecycle status as a
 * freshness proxy (Live > Pre-Release > Development), and third-party vetting
 * (SCF award, hackathon placement) as authority. The directory already
 * excludes abandoned projects, so status is a reasonable currency proxy.
 */
const PROJECT_STATUS_FRESHNESS: Record<string, number> = {
	Live: 1,
	"Pre-Release": 0.85,
	Development: 0.7,
	"Pre-Development": 0.55,
};

// A row whose anchor tokens hit only mid-prose ("mentions custody") may not
// read as a high-trust match for the thing itself — cap just under the
// "high" threshold, same honesty rule as the semantic-fallback cap.
const MENTION_CONFIDENCE_CAP = 0.7;

export function projectConfidence(input: {
	score: number;
	maxScore: number;
	status?: string | null;
	scfAwarded?: boolean;
	hackathonPlacement?: string | null;
	/**
	 * Where the query's anchor (non-generic) tokens hit this record:
	 * "identity" = name/category/types/coverage/description-lead — the record
	 * IS the anchor thing (relevance floored: missing a secondary token must
	 * not bury it under prose-mentioners); "mention" = mid-prose only
	 * (relevance halved + composite capped below "high"); null/undefined =
	 * rule not applicable (no anchors, or no query).
	 */
	anchorPlacement?: "identity" | "mention" | null;
}): Confidence {
	let relevance =
		input.maxScore > 0 ? clamp01(input.score / input.maxScore) : 0;
	if (input.anchorPlacement === "identity") {
		relevance = Math.max(relevance, 0.75);
	} else if (input.anchorPlacement === "mention") {
		relevance = relevance * 0.5;
	}
	const freshness = PROJECT_STATUS_FRESHNESS[input.status ?? ""] ?? 0.5;
	let authority = 0.6;
	if (input.scfAwarded) authority += 0.25; // SCF-vetted
	if (input.hackathonPlacement) authority += 0.1; // placed in a hackathon
	const c = composeConfidence(
		relevance,
		clamp01(freshness),
		clamp01(authority),
		null,
	);
	if (input.anchorPlacement === "mention" && c.score > MENTION_CONFIDENCE_CAP)
		return { ...c, score: MENTION_CONFIDENCE_CAP, label: "medium" };
	return c;
}

/**
 * Confidence for a SEMANTIC (vector-fallback) project row. Two honesty rules
 * separate it from keyword `projectConfidence`:
 *
 *   1. Relevance comes from the ABSOLUTE cosine band (same 0.55–0.85 → 0–1
 *      rescale as research vector mode), not normalization against the
 *      semantic set's own max — set-max made the top guess read
 *      relevance≈1.0 no matter how weak the whole set was.
 *   2. The composite is capped below the "high" threshold. A vector guess
 *      served because keywords found nothing (or too little) must never
 *      claim the same trust as a literal match — the audit's R1 root:
 *      off-topic fallback rows at 0.9+ "high" become confident wrong
 *      answers for agent consumers.
 */
const SEMANTIC_CONFIDENCE_CAP = 0.7; // just under the 0.75 "high" threshold

export function semanticProjectConfidence(input: {
	/** Raw Atlas vectorSearchScore (cosine), NOT set-normalized. */
	score: number;
	status?: string | null;
	scfAwarded?: boolean;
	hackathonPlacement?: string | null;
}): Confidence {
	const relevance = relevanceFrom(input.score ?? 0, "vector", 1);
	const freshness = PROJECT_STATUS_FRESHNESS[input.status ?? ""] ?? 0.5;
	let authority = 0.6;
	if (input.scfAwarded) authority += 0.25;
	if (input.hackathonPlacement) authority += 0.1;
	const c = composeConfidence(
		relevance,
		clamp01(freshness),
		clamp01(authority),
		null,
	);
	if (c.score > SEMANTIC_CONFIDENCE_CAP)
		return { ...c, score: SEMANTIC_CONFIDENCE_CAP, label: "medium" };
	return c;
}

/**
 * Trust score for a PARTNER profile. Unlike search results there's no query
 * relevance — a directory entry's trustworthiness is about how current the
 * profile is (freshness loop) and how much of it is system-verified (on-chain
 * activity, recent commits, SCF involvement). Directly serves the "don't
 * recommend a partner whose profile went stale" goal.
 */
const PARTNER_FRESHNESS: Record<string, number> = {
	fresh: 1,
	aging: 0.6,
	stale: 0.3,
	archived: 0.1,
};

export interface PartnerTrust {
	score: number;
	label: "high" | "medium" | "low";
	freshness: number;
	verification: number;
}

export function partnerTrust(input: {
	freshnessStatus?: string | null;
	verified?: {
		onchainActive?: boolean | null;
		githubCommits90d?: number | null;
		scfInvolvement?: string | null;
	} | null;
}): PartnerTrust {
	const freshness = PARTNER_FRESHNESS[input.freshnessStatus ?? "fresh"] ?? 0.5;
	const v = input.verified ?? {};
	let verification = 0.25; // base: profile exists
	if (v.onchainActive) verification += 0.25;
	if ((v.githubCommits90d ?? 0) > 0) verification += 0.25;
	if (v.scfInvolvement) verification += 0.25;
	verification = clamp01(verification);
	const score = clamp01(0.6 * freshness + 0.4 * verification);
	const label = score >= 0.7 ? "high" : score >= 0.45 ? "medium" : "low";
	return {
		score: round2(score),
		label,
		freshness: round2(freshness),
		verification: round2(verification),
	};
}
