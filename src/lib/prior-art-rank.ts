/**
 * Prior art for an idea among judged hackathon repos, ranked by how much of
 * the idea a repo is about: the idea's content words found as whole words in
 * the repo's name and description, each weighted by its rarity across the
 * candidates (pass the whole judged set, so "app" weighs nothing). A repo
 * must match two of the idea's words that occur in the set and cover half of
 * their weight; an idea with fewer than two such words gets none, because
 * one shared word is not prior art. Ties go to hackathon winners, then to
 * recent commits.
 *
 * Before this (2026-10-20), one word found as a substring was enough and the
 * most recently pushed judged repos won, so the same three repos answered
 * remittance, insurance, QR payments and subscription ideas alike.
 */

export interface PriorArtCandidate {
	fullName: string;
	description?: string | null;
	hackathonWinner?: boolean | null;
	lastCommitAt?: string | null;
}

/** A word's stem for matching: lowercase, a plural "s" dropped. */
const stem = (w: string) => (w.length > 3 ? w.replace(/(?<!s)s$/, "") : w);

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

export function rankPriorArt<T extends PriorArtCandidate>(
	tokens: string[],
	candidates: T[],
	limit = 5,
	minCoverage = 0.5,
): T[] {
	// Hyphenated tokens arrive with their parts as tokens too.
	const terms = [
		...new Set(
			tokens.filter((t) => !t.includes("-")).map((t) => stem(t.toLowerCase())),
		),
	];
	const docs = candidates.map((c) => ({
		c,
		words: wordsOf(
			`${c.fullName.replace(/[/_.-]/g, " ")} ${c.description ?? ""}`,
		),
	}));
	const n = docs.length;
	const idf = new Map(
		terms.map((t) => {
			const df = docs.filter((d) => d.words.has(t)).length;
			return [t, df ? Math.log((n + 1) / (df + 0.5)) : 0] as const;
		}),
	);
	// Words no candidate uses cannot match; they do not count for or against.
	const present = terms.filter((t) => (idf.get(t) ?? 0) > 0);
	if (present.length < 2) return [];
	const total = present.reduce((s, t) => s + (idf.get(t) ?? 0), 0);
	return docs
		.map((d) => {
			const hit = terms.filter((t) => d.words.has(t));
			return {
				c: d.c,
				matched: hit.length,
				score: hit.reduce((s, t) => s + (idf.get(t) ?? 0), 0),
			};
		})
		.filter((d) => d.matched >= 2 && d.score >= total * minCoverage)
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
