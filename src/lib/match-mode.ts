/**
 * The shared match-mode vocabulary for SIMPLE list/filter operations —
 * paying the honesty-layer debt (specs/honesty-baseline.json) with ONE
 * vocabulary instead of eight per-op inventions.
 *
 * The tiered directory search keeps its richer ladder (strict/loose-1/
 * majority/corrected/semantic — projects) and the scorer keeps scored/weak
 * (partners, vetIdea). This module covers ops whose matching is a filter,
 * an expansion, or a vector lookup. The label must state the MECHANISM
 * actually used — sls-076's lesson: the lie was the label, not the match.
 */
export type SimpleMatchMode =
	| "all" // no text query — the full set (structured filters only)
	| "filtered" // returned rows contain the query terms literally
	| "expanded" // matched via synonym/stem expansion of the query terms
	| "keyword" // coarse keyword fallback (vector search unavailable)
	| "vector"; // vector-similarity ranking — conceptual, not literal

export const SIMPLE_MATCH_LABEL: Record<SimpleMatchMode, string> = {
	all: "no text query — full set (structured filters only)",
	filtered: "rows contain the query terms literally",
	expanded:
		"matched via synonym/stem expansion of the query terms — verify relevance for niche terms",
	keyword:
		"vector search unavailable — coarse keyword match over title and content",
	vector:
		"vector-similarity ranking — conceptually related, not literal keyword truth (verify before relying)",
};

/** Spread into a response's meta: `...matchModeMeta(q ? "filtered" : "all")` */
export function matchModeMeta(mode: SimpleMatchMode): {
	matchMode: SimpleMatchMode;
	matchModeLabel: string;
} {
	return { matchMode: mode, matchModeLabel: SIMPLE_MATCH_LABEL[mode] };
}
