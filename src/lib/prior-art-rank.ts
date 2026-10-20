/**
 * Prior art for an idea among judged hackathon repos, ranked by how much of
 * the idea a repo is about: the idea's content words found as whole words in
 * the repo's name and description, each weighted by its rarity across the
 * candidates (pass the whole judged set, so "app" weighs little). A repo
 * must match two of the idea's words that occur in the set, cover half of
 * their weight, and include at least one rare word (in no more than a tenth
 * of the set, or in at most two repos); an idea with fewer than two words
 * the set uses gets none, because one shared word is not prior art. Ties go to hackathon
 * winners, then to recent commits.
 *
 * Before this (2026-10-20), one word found as a substring was enough and the
 * most recently pushed judged repos won, so four repos filled the prior art
 * for 9 of 16 test ideas: remittance, insurance, QR payments and more.
 */

export interface PriorArtCandidate {
	fullName: string;
	description?: string | null;
	hackathonWinner?: boolean | null;
	lastCommitAt?: string | null;
}

/** A word's stem for matching, the same on both sides, so it need not be a
 * word: plurals meet their singular ("libraries" and "library" at "librari",
 * "movies" and "movie" at "movi", "tries" and "try" at "tri", "repos" and
 * "repo" at "repo"). */
const stem = (w: string) => {
	if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}i`;
	if (w.length > 3 && w.endsWith("ie")) return w.slice(0, -1);
	if (w.length > 2 && /[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}i`;
	return w.length > 3 ? w.replace(/(?<!s)s$/, "") : w;
};

function wordsOf(text: string): Set<string> {
	return new Set(
		text
			.replace(/([a-z])([A-Z])/g, "$1 $2")
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter(Boolean)
			.map(stem),
	);
}

/** A word in more than this share of the candidates is too common to show
 * a repo is about the idea on its own. */
const MAX_COMMON_SHARE = 0.1;

export function rankPriorArt<T extends PriorArtCandidate>(
	tokens: string[],
	candidates: T[],
	limit = 5,
	minCoverage = 0.5,
): T[] {
	// Every word of the idea, split the way repo text is: the tokenizer keeps
	// punctuation ("(rosca," for "savings circle (ROSCA, tanda)"), and a
	// hyphenated token arrives with its parts as tokens too.
	const terms = [
		...new Set(
			tokens
				.flatMap((t) => t.toLowerCase().split(/[^a-z0-9]+/))
				.filter(Boolean)
				.map(stem),
		),
	];
	const docs = candidates.map((c) => ({
		c,
		words: wordsOf(
			`${c.fullName.replace(/[/_.-]/g, " ")} ${c.description ?? ""}`,
		),
	}));
	const n = docs.length;
	const df = new Map(
		terms.map((t) => [t, docs.filter((d) => d.words.has(t)).length] as const),
	);
	// Words no candidate uses cannot match; they do not count for or against
	// (weighting them most hid real matches for ideas with one unusual word).
	const present = terms.filter((t) => (df.get(t) ?? 0) > 0);
	if (present.length < 2) return [];
	const idf = new Map(
		present.map(
			(t) => [t, Math.log((n + 1) / ((df.get(t) ?? 0) + 0.5))] as const,
		),
	);
	const total = present.reduce((s, t) => s + (idf.get(t) ?? 0), 0);
	// A word in more than a tenth of the set ("app", "stellar") says nothing
	// about the idea, so a match needs at least one rarer word: common words
	// alone covered whole ideas whose specific words no repo uses (outside
	// review, 2026-10-20). An idea made only of common words therefore gets no
	// repo prior art; the builds path still answers it. A word in two repos
	// always counts as rare, so a small set is not all common.
	// ponytail: one fixed share; tune it with the labels.
	const specific = new Set(
		present.filter(
			(t) => (df.get(t) ?? 0) <= Math.max(2, n * MAX_COMMON_SHARE),
		),
	);
	return docs
		.map((d) => {
			const hit = present.filter((t) => d.words.has(t));
			return {
				c: d.c,
				matched: hit.length,
				specific: hit.some((t) => specific.has(t)),
				score: hit.reduce((s, t) => s + (idf.get(t) ?? 0), 0),
			};
		})
		.filter(
			(d) => d.matched >= 2 && d.specific && d.score >= total * minCoverage,
		)
		.sort(
			(a, b) =>
				b.score - a.score ||
				Number(!!b.c.hackathonWinner) - Number(!!a.c.hackathonWinner) ||
				String(b.c.lastCommitAt ?? "").localeCompare(
					String(a.c.lastCommitAt ?? ""),
				) ||
				a.c.fullName.localeCompare(b.c.fullName),
		)
		.slice(0, limit)
		.map((d) => d.c);
}

/**
 * Whether a build from hybrid search counts as prior art: its meaning score
 * clears PRIOR_ART_MIN_SIMILARITY, or it matched two of the idea's words. On
 * the 40-idea labeled set (2026-10-20, top 5 per idea) this kept all 56
 * same-idea builds found, cut wrong builds from 22% to 18%, and cut builds
 * shown for ideas with no real match from 60 to 47. With search by meaning
 * down there is no score, so only two-word matches count.
 * ponytail: one fixed floor tuned on draft labels; re-measure it when the
 * embedding model or the labels change.
 */
export const PRIOR_ART_MIN_SIMILARITY = 0.7;

export function isPriorArtEvidence(s: {
	similarity?: number;
	matched: string[];
}): boolean {
	return (
		(s.similarity ?? 0) >= PRIOR_ART_MIN_SIMILARITY || s.matched.length >= 2
	);
}

/**
 * The builds of a ranked list's top `k` that count as prior art. The window
 * is cut before filtering, so a weak build leaves its slot empty rather than
 * pulling in one ranked below the window: what the labeled measurement scored
 * (outside review, 2026-10-20).
 */
export function priorArtTop<
	T extends { similarity?: number; matched: string[] },
>(ranked: T[], k = 5): T[] {
	return ranked.slice(0, k).filter(isPriorArtEvidence);
}
