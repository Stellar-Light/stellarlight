// Candidate evidence rules over one window build. Each reads only the
// window row, so each can only remove builds the current rule lists from the
// same top five (filter-only). Fixed before the holdout was read.
import type { WordHit } from "./lib.mts";

export type W = {
	id: string;
	name: string;
	similarity?: number;
	/** Live matchedTerms: idea words hit anywhere, synonyms included. */
	matched: string[];
	textShare?: number;
	words: WordHit[];
	/** The idea's total word weight and the corpus size. */
	total: number;
	n: number;
};
const FLOOR = 0.7;
export const sim = (w: W) => (w.similarity ?? 0) >= FLOOR;
export const share = (w: W, pick: (x: WordHit) => boolean) =>
	w.words.filter(pick).reduce((s, x) => s + x.w, 0) / w.total;
export const count = (w: W, pick: (x: WordHit) => boolean) =>
	w.words.filter(pick).length;
export const oneWord = (w: W) => (w.textShare ?? 0) >= 1;
export const twoWords = (w: W) => w.matched.length >= 2;

/** Which condition of the current rule admits a build. */
export const why = (w: W) =>
	[
		sim(w) ? "similarity" : "",
		twoWords(w) ? "two words" : "",
		oneWord(w) ? "every word in own text" : "",
	]
		.filter(Boolean)
		.join("+");

export const CANDIDATES: Record<string, (w: W) => boolean> = {
	// isPriorArtEvidence on main (1.9.91).
	current: (w) => sim(w) || twoWords(w) || oneWord(w),
	// A: the word path weighed by rarity, as rankPriorArt does: two matched
	// words that also cover half the idea's weight.
	"A cov>=0.5": (w) =>
		sim(w) || (twoWords(w) && share(w, (x) => x.any) >= 0.5) || oneWord(w),
	// B: A plus one matched word in no more than a tenth of the corpus (or in
	// two builds), rankPriorArt's rare-word condition.
	"B cov>=0.5+rare": (w) =>
		sim(w) ||
		(twoWords(w) &&
			share(w, (x) => x.any) >= 0.5 &&
			w.words.some((x) => x.any && x.df <= Math.max(2, w.n * 0.1))) ||
		oneWord(w),
	// C: two words counted only in the build's own name or description
	// (synonyms allowed; track and award text not).
	"C own2": (w) => sim(w) || count(w, (x) => x.text) >= 2 || oneWord(w),
	// D: C without synonyms (the words as typed).
	"D typed2": (w) => sim(w) || count(w, (x) => x.typed) >= 2 || oneWord(w),
	// E: C weighed by rarity: own-text words covering half the weight.
	"E own2 cov>=0.5": (w) =>
		sim(w) ||
		(count(w, (x) => x.text) >= 2 && share(w, (x) => x.text) >= 0.5) ||
		oneWord(w),
	// M: a build no word path admits needs a higher meaning score.
	...Object.fromEntries(
		[0.72, 0.73, 0.735, 0.74, 0.745, 0.75].map((f) => [
			`M meaning-only>=${f}`,
			(w: W) => twoWords(w) || oneWord(w) || (w.similarity ?? 0) >= f,
		]),
	),
	// N: the higher floor only for a build that matched no word at all.
	...Object.fromEntries(
		[0.735, 0.74, 0.745].map((f) => [
			`N no-word>=${f}`,
			(w: W) =>
				twoWords(w) ||
				oneWord(w) ||
				(w.similarity ?? 0) >= (w.matched.length ? FLOOR : f),
		]),
	),
};
