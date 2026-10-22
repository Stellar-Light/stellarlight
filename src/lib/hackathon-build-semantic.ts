/**
 * Search by meaning over stored hackathon submissions: the query embedded
 * with voyage-3 (src/lib/embed.ts) against hackathon_build_vector_index,
 * which the sync lane fills and keeps in place.
 */
import { overlayWinnerOf, WINNER_OVERLAY } from "@/data/winner-overlay";
import { withReadTimeout } from "@/lib/degraded-read";
import { embed } from "@/lib/embed";
import { getPayloadSafe } from "@/lib/payload-client";

/** Events whose winners a page off DoraHacks names (src/data/winner-overlay.ts):
 * the store does not flag those winners, so the vector index cannot. */
const OVERLAY_EVENTS = [...new Set(WINNER_OVERLAY.map((e) => e.hackathonSlug))];

/** The winners-only part of the $vectorSearch filter. Every row of an event
 * the overlay names passes it, and vectorBuildScores keeps only that event's
 * named winners. hackathonSlug and isWinner are filter fields of
 * hackathon_build_vector_index (the sync's VECTOR_INDEX). All stored winners
 * and those events' rows stay well under the 300 neighbours a search reads,
 * and a winners-only search returns every neighbour it reads, so no winner
 * is crowded out. */
export function winnersOnlyFilter(overlayEvents: readonly string[]) {
	return overlayEvents.length
		? {
				$or: [
					{ isWinner: true },
					{ hackathonSlug: { $in: [...overlayEvents] } },
				],
			}
		: { isWinner: true };
}

/** Same starting floor as project search, calibrated on voyage-3 scores
 * there (real matches 0.69 to 0.80, concept noise up to 0.68). Every row
 * carries its score so the floor can be re-measured on submissions. */
export const BUILD_SEMANTIC_FLOOR = 0.68;

/**
 * buildId -> similarity for submissions close in meaning to `q`, best first.
 * null = could not check (no key, store or index unavailable, timeout); an
 * empty map = checked, nothing cleared the floor. Callers must keep the two
 * apart.
 */
export async function semanticBuildScores(
	q: string,
	opts: { winnersOnly?: boolean; limit?: number } = {},
): Promise<Map<string, number> | null> {
	if (!process.env.VOYAGE_API_KEY) return null;
	try {
		return await vectorBuildScores(await embed(q), opts);
	} catch {
		return null;
	}
}

/** The hackathon-builds collection, raw, for $vectorSearch and the stored
 * vectors; null when the store is unavailable. */
async function buildsCollection() {
	const payload = await getPayloadSafe();
	// biome-ignore lint/suspicious/noExplicitAny: payload.db internals
	return ((payload?.db as any)?.connection?.db?.collection(
		"hackathon-builds",
	) ?? null) as {
		aggregate: (p: unknown[]) => { toArray: () => Promise<unknown[]> };
		findOne: (q: unknown, o?: unknown) => Promise<unknown>;
	} | null;
}

/** Same contract as semanticBuildScores, for a vector already in hand. */
export async function vectorBuildScores(
	queryVector: number[],
	opts: { winnersOnly?: boolean; limit?: number; excludeId?: string } = {},
): Promise<Map<string, number> | null> {
	try {
		const coll = await buildsCollection();
		if (!coll) return null;
		// Candidates well above the limit, for recall at the larger limits
		// counting asks for.
		const numCandidates = Math.min(
			2_000,
			Math.max(300, (opts.limit ?? 50) * 4),
		);
		const raw = (await withReadTimeout(
			coll
				.aggregate([
					{
						$vectorSearch: {
							index: "hackathon_build_vector_index",
							path: "embedding",
							queryVector,
							numCandidates,
							// Winners only reads every candidate: the overlay events'
							// other rows pass the filter and are dropped below, so a
							// smaller limit would let them take winners' places.
							// Otherwise slack for the excluded submission, which has
							// a row per event it entered (sls-092).
							limit: opts.winnersOnly
								? numCandidates
								: (opts.limit ?? 50) + (opts.excludeId ? 5 : 0),
							filter: {
								hiddenUpstream: { $ne: true },
								...(opts.winnersOnly ? winnersOnlyFilter(OVERLAY_EVENTS) : {}),
							},
						},
					},
					{
						$project: {
							_id: 0,
							buildId: 1,
							hackathonSlug: 1,
							isWinner: 1,
							score: { $meta: "vectorSearchScore" },
						},
					},
				])
				.toArray(),
			4_000,
		)) as Array<{
			buildId: string;
			hackathonSlug?: string;
			isWinner?: boolean;
			score: number;
		}>;
		// Rows arrive best first; a submission entered in several events has a
		// row per event and keeps its best score (sls-092).
		const scores = new Map<string, number>();
		for (const r of raw) {
			if ((r.score ?? 0) < BUILD_SEMANTIC_FLOOR || r.buildId === opts.excludeId)
				continue;
			// The winners filter let the overlay events' other rows through.
			if (
				opts.winnersOnly &&
				!r.isWinner &&
				!overlayWinnerOf(r.buildId, r.hackathonSlug ?? "")
			)
				continue;
			if (!scores.has(r.buildId)) scores.set(r.buildId, r.score);
		}
		return new Map([...scores].slice(0, opts.limit ?? 50));
	} catch {
		return null;
	}
}

/** Submissions closest in meaning to a stored one, by its own embedding
 * (no query text, no embedding call). null = could not check. */
export async function similarToBuild(
	buildId: string,
	opts: { winnersOnly?: boolean; limit?: number } = {},
): Promise<Map<string, number> | null> {
	try {
		const coll = await buildsCollection();
		if (!coll) return null;
		const doc = (await withReadTimeout(
			coll.findOne({ buildId }, { projection: { embedding: 1 } }),
			4_000,
		)) as { embedding?: unknown } | null;
		if (!Array.isArray(doc?.embedding)) return null;
		return await vectorBuildScores(doc.embedding as number[], {
			...opts,
			excludeId: buildId,
		});
	} catch {
		return null;
	}
}
