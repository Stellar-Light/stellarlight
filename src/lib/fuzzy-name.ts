/**
 * Fuzzy project-name recovery — "did you mean Blend?" for a one-character typo.
 *
 * Why this exists: the keyword ladder is exact-token based, so a single wrong
 * character drops every tier at once and the query falls through to the vector
 * rung. That rung cannot rescue it either — the embedding of a MISSPELLED
 * proper noun sits near arbitrary short tokens, not near the correct project.
 * Measured on prod 2026-07-26: `blendd` returned TZS/BRZ/BRL, `soroswapp`
 * returned Sorosan, `aquarious` returned gYEN, `reflecter` returned Ping. In
 * every case we hold the project and answer it perfectly when spelled right.
 *
 * The whole difficulty is FALSE POSITIVES, so the rules below are deliberately
 * strict. A wrong correction is worse than no correction: it answers a question
 * the user didn't ask while looking completely confident.
 *
 * Pure and dependency-free so it can be unit-tested against the real failure
 * set without a DB or a network.
 */

/** A project we could correct toward — name + slug as stored. */
export interface NameCandidate {
	name: string;
	slug: string;
}

export interface FuzzyMatch {
	/** The candidate's stored name, for re-querying and for telling the user. */
	name: string;
	slug: string;
	/** Edit distance from the query to whichever of name/slug matched best. */
	distance: number;
}

/** Lowercase alphanumeric — folds "Hito Wallet", "hito-wallet", "HitoWallet". */
export function normalizeName(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Damerau-Levenshtein distance (optimal string alignment).
 *
 * Plain Levenshtein charges 2 for a transposition, which is the single most
 * common human typo — `aquarious`/`teh`/`recieve`. Counting it as 1 is what
 * lets a tight budget still catch real mistakes.
 *
 * Short-circuits once the running minimum exceeds `max`, so scanning a few
 * hundred candidates per miss stays cheap.
 */
export function editDistance(
	a: string,
	b: string,
	max = Number.MAX_SAFE_INTEGER,
): number {
	if (a === b) return 0;
	if (Math.abs(a.length - b.length) > max) return max + 1;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	let prevPrev: number[] = [];
	let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
	let curr: number[] = new Array(b.length + 1);

	for (let i = 1; i <= a.length; i++) {
		curr[0] = i;
		let rowMin = curr[0];
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let v = Math.min(
				curr[j - 1] + 1, // insertion
				prev[j] + 1, // deletion
				prev[j - 1] + cost, // substitution
			);
			// transposition of two adjacent characters
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				v = Math.min(v, prevPrev[j - 2] + 1);
			}
			curr[j] = v;
			if (v < rowMin) rowMin = v;
		}
		// Every remaining row can only grow, so we can stop early.
		if (rowMin > max) return max + 1;
		prevPrev = prev;
		prev = curr;
		curr = new Array(b.length + 1);
	}
	return prev[b.length];
}

/**
 * How many edits we tolerate against a target of this length.
 *
 * Scaled by length because collision risk is not uniform. The directory is full
 * of 3–4 character asset tickers — KES, ARS, BRL, gYEN, EURx — that sit one
 * edit from each other and from plenty of noise, so at those lengths ANY
 * tolerance turns a typo into a confident wrong answer. Above that, a single
 * edit against an 8+ character proper noun is almost never coincidence.
 */
export function distanceBudget(targetLength: number): number {
	if (targetLength <= 4) return 0; // tickers: exact or nothing
	if (targetLength <= 7) return 1;
	return 2;
}

/** Queries we refuse to fuzzy-correct at all (see findNameMatch). */
const MAX_QUERY_TOKENS = 2;

/**
 * Find the one project a misspelled query most likely meant, or null.
 *
 * Guards, each of which exists to stop a specific way this goes wrong:
 *
 *  - **Short queries only** (≤2 tokens). A sentence that matched nothing is a
 *    coverage question, not a typo; "correcting" one word of it would answer
 *    something the user never asked.
 *  - **Length-scaled budget** (see distanceBudget) — no fuzzing of tickers.
 *  - **Unique winner required.** If two candidates tie at the best distance we
 *    return null rather than pick one. An ambiguous correction is a guess, and
 *    this function's whole job is to not guess.
 *  - **Distance 0 is not our business.** An exact match would have been caught
 *    by the keyword ladder; seeing one here means the caller misused us, so we
 *    decline rather than silently duplicate that path.
 */
export function findNameMatch(
	query: string,
	candidates: readonly NameCandidate[],
): FuzzyMatch | null {
	const tokens = query.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0 || tokens.length > MAX_QUERY_TOKENS) return null;

	const q = normalizeName(query);
	if (q.length < 4) return null; // too short to correct safely

	let best: FuzzyMatch | null = null;
	let bestTied = false;

	for (const c of candidates) {
		for (const form of [c.name, c.slug]) {
			if (!form) continue;
			const target = normalizeName(form);
			if (!target) continue;
			const budget = distanceBudget(target.length);
			if (budget === 0) continue;
			const d = editDistance(q, target, budget);
			if (d === 0 || d > budget) continue;

			if (!best || d < best.distance) {
				best = { name: c.name, slug: c.slug, distance: d };
				bestTied = false;
			} else if (d === best.distance && c.slug !== best.slug) {
				bestTied = true;
			}
		}
	}

	return best && !bestTied ? best : null;
}
