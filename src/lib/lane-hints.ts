/**
 * F7 (audit root #8): cross-lane signposting. 8/12 wrong-lane probes returned
 * confident-looking, on-keyword but off-question results with zero pointer to
 * the lane that answers. Served in meta when results are EMPTY or WEAK
 * (relaxed match tier) — never on healthy strict results, so routine queries
 * stay clean. Builders' empty-state advisory is the model; endpoint paths are
 * the REST-native callable vocabulary (PR raven#1 lesson: no tool-name jargon).
 */

export type Lane = "projects" | "repos" | "research" | "partners";

const HINTS: Record<Lane, string[]> = {
	projects: [
		"Looking for code or implementations → /api/repos/search",
		"How-tos, SEPs, docs, audits, or ecosystem knowledge → /api/research",
		"Service providers (audit firms, anchors, on/off-ramps, agencies) → /api/partners",
		"The people building → /api/builders",
	],
	repos: [
		"Products/companies and their live status → /api/projects/search",
		"Deep internals of a specific repo ('where is X defined') → /api/repos/explain",
		"Concepts, SEPs, and how-to knowledge → /api/research",
	],
	research: [
		"Products/companies and their live status → /api/projects/search",
		"Source code and implementations → /api/repos/search",
		"Live SCF round state and sponsor briefs → /api/rfps",
	],
	partners: [
		"Products that were BUILT (vs service providers) → /api/projects/search",
		"AI-matched shortlist for a concrete integration need → POST /api/partners/match",
	],
};

/** Hints when a lane's answer is empty or weak — undefined otherwise. */
export function laneHints(
	lane: Lane,
	opts: { empty: boolean; weakMatch?: boolean },
): string[] | undefined {
	return opts.empty || opts.weakMatch ? HINTS[lane] : undefined;
}

/** F8 (audit root #8b): superlative queries can't be answered by result
 * order — say so instead of letting agents read rank as an answer. */
const SUPERLATIVE_RE =
	/\b(biggest|largest|best|top|leading|most(?:\s+(?:used|popular|active|liquid))?|cheapest|fastest|#1|number\s*one|highest|lowest\s+fee)\b/i;

export function superlativeNote(q: string): string | undefined {
	if (!SUPERLATIVE_RE.test(q)) return undefined;
	return "Superlative detected: result ORDER here reflects relevance + curated prominence + liveness — NOT a ranking by size, usage, or fees. Where DefiLlama tracks a protocol, rows carry tvlUSD/tvlAsOf (null = not tracked, not zero). Ecosystem aggregates → /api/analyze.";
}
