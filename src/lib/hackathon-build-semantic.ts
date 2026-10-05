/**
 * Search by meaning over stored hackathon submissions: the query embedded
 * with voyage-3 (src/lib/embed.ts) against hackathon_build_vector_index,
 * which the sync lane fills and keeps in place.
 */
import { withReadTimeout } from "@/lib/degraded-read";
import { embed } from "@/lib/embed";
import { getPayloadSafe } from "@/lib/payload-client";

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
		const raw = (await withReadTimeout(
			coll
				.aggregate([
					{
						$vectorSearch: {
							index: "hackathon_build_vector_index",
							path: "embedding",
							queryVector,
							numCandidates: 300,
							limit: (opts.limit ?? 50) + (opts.excludeId ? 1 : 0),
							filter: {
								hiddenUpstream: { $ne: true },
								...(opts.winnersOnly ? { isWinner: true } : {}),
							},
						},
					},
					{
						$project: {
							_id: 0,
							buildId: 1,
							score: { $meta: "vectorSearchScore" },
						},
					},
				])
				.toArray(),
			4_000,
		)) as Array<{ buildId: string; score: number }>;
		return new Map(
			raw
				.filter(
					(r) =>
						(r.score ?? 0) >= BUILD_SEMANTIC_FLOOR &&
						r.buildId !== opts.excludeId,
				)
				.map((r) => [r.buildId, r.score]),
		);
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
