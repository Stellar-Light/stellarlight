/**
 * A rerank stage over hackathon build search: the hybrid ranking's top
 * RERANK_TOP reordered by a cross-encoder (the embedding provider's rerank
 * model, same key), which reads the query and each build's name and one-line
 * summary together. Word coverage and voyage-3 meaning scores found
 * same-idea builds but did not order them: on 27 labeled working ideas the
 * hybrid matched list held 103 of the 107 same-idea builds and its top 5 held
 * 45 (grades as of 2026-10-23, the rerank round's blind grades included;
 * before them, 95 of 99 and 45), and meaning scores of 0.70 to 0.80 covered
 * wrong and right builds alike. Measured on 140 labeled ideas replayed over
 * every stored submission (improvements/audits/2026-10-23-rerank/).
 *
 * A separate stage after searchHackathonBuilds, so the scorer is untouched.
 * When the reranker fails or is slow, today's order serves and the caller
 * says so; it never fails a request.
 */

const VOYAGE_RERANK_URL = "https://api.voyageai.com/v1/rerank";
/** rerank-2 ordered 80.3% of differently graded labeled pairs on working
 * ideas, rerank-2-lite 78.5%, the hybrid order 74.7%. */
export const RERANK_MODEL = "rerank-2";
/** How many of the hybrid ranking's first builds are reordered. Of the 99
 * working same-idea builds labeled before the round, 89 sit in the first 50. */
export const RERANK_TOP = 50;
/** vetIdea lists a reranked top-five build when it scores at least this:
 * the highest 0.01 step that kept every same-idea build of the working
 * ideas' reranked top 5 (the lowest scored 0.4563).
 * ponytail: one floor tuned on draft labels; re-measure when the model, the
 * document text or the labels change. */
export const RERANK_FLOOR = 0.45;
/** A rerank call never holds a request longer than this (the 167 measured
 * calls over up to 78 builds averaged under half a second). */
export const RERANK_TIMEOUT_MS = 2_000;
/** queryBuilds skips the rerank when search by meaning has already taken
 * longer than this, so a slow embedding or vector read is not followed by
 * another call of up to RERANK_TIMEOUT_MS. Live on 1.9.96 (2026-10-23, six
 * ideas), meaning added 0.10 to 0.26 s to the builds route's server time
 * (hybrid 0.20 to 0.36 s, keyword 0.05 to 0.19 s), and a whole vetIdea
 * request took 1.4 to 2.8 s; 3 s is above both, so a healthy request never
 * skips, and the rerank never pushes the wait past about 5 s. */
export const RERANK_SKIP_AFTER_MS = 3_000;

/** What the reranker reads for a build: its name and one-line summary, the
 * fields every index row holds (the measured document). */
export const rerankDocument = (b: {
	name: string;
	description?: string | null;
}): string =>
	b.description?.trim() ? `${b.name}. ${b.description.trim()}` : b.name;

// ponytail: per-instance cache, lost on a cold start and not shared across
// instances; move it to a shared store if repeat questions miss it.
const CACHE_MAX = 200;
const cache = new Map<string, Map<string, number>>();

type Rankable = {
	b: { id: string; name: string; description?: string | null };
};

/**
 * `ranked` with its first RERANK_TOP reordered by the reranker's score (a tie
 * keeps the hybrid order), the rest unchanged. `scores`: build id to score
 * when the reranker ran; null when it failed or timed out (`ranked` is then
 * the input order); undefined when it was not attempted (no key, or nothing
 * to rerank).
 */
export async function rerankBuilds<T extends Rankable>(
	q: string,
	ranked: T[],
): Promise<{ ranked: T[]; scores: Map<string, number> | null | undefined }> {
	const key = process.env.VOYAGE_API_KEY;
	const top = ranked.slice(0, RERANK_TOP);
	if (!key || !top.length) return { ranked, scores: undefined };
	const cacheKey = JSON.stringify([q, top.map((s) => s.b.id)]);
	let scores = cache.get(cacheKey) ?? null;
	if (!scores) {
		scores = await scoreBuilds(key, q, top).catch(() => null);
		if (!scores) return { ranked, scores: null };
		cache.set(cacheKey, scores);
		if (cache.size > CACHE_MAX) {
			const oldest = cache.keys().next().value;
			if (oldest !== undefined) cache.delete(oldest);
		}
	}
	const s = scores;
	const order = top
		.map((x, r) => ({ x, r }))
		.sort(
			(a, b) => (s.get(b.x.b.id) ?? 0) - (s.get(a.x.b.id) ?? 0) || a.r - b.r,
		)
		.map(({ x }) => x);
	return { ranked: [...order, ...ranked.slice(RERANK_TOP)], scores };
}

/** One call; null unless every candidate came back with exactly one finite
 * score. */
async function scoreBuilds(
	key: string,
	q: string,
	top: Rankable[],
): Promise<Map<string, number> | null> {
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), RERANK_TIMEOUT_MS);
	try {
		const res = await fetch(VOYAGE_RERANK_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${key}`,
			},
			body: JSON.stringify({
				model: RERANK_MODEL,
				query: q,
				documents: top.map((s) => rerankDocument(s.b)),
				truncation: true,
			}),
			signal: ctl.signal,
		});
		if (!res.ok) return null;
		const body = (await res.json()) as {
			data?: { index: unknown; relevance_score: unknown }[];
		};
		const scores = new Map<string, number>();
		for (const d of Array.isArray(body?.data) ? body.data : []) {
			const s = Number.isInteger(d?.index) ? top[d.index as number] : undefined;
			const score = d?.relevance_score;
			if (!s || typeof score !== "number" || !Number.isFinite(score))
				return null;
			if (scores.has(s.b.id)) return null;
			scores.set(s.b.id, score);
		}
		return scores.size === top.length ? scores : null;
	} finally {
		clearTimeout(timer);
	}
}
