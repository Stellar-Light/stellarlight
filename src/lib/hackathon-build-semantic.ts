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
		const payload = await getPayloadSafe();
		// biome-ignore lint/suspicious/noExplicitAny: payload.db internals
		const coll = (payload?.db as any)?.connection?.db?.collection(
			"hackathon-builds",
		);
		if (!coll) return null;
		const queryVector = await embed(q);
		const raw: Array<{ buildId: string; score: number }> =
			await withReadTimeout(
				coll
					.aggregate([
						{
							$vectorSearch: {
								index: "hackathon_build_vector_index",
								path: "embedding",
								queryVector,
								// Candidates well above the limit, for recall at the
								// larger limits counting asks for.
								numCandidates: Math.min(
									2_000,
									Math.max(300, (opts.limit ?? 50) * 4),
								),
								limit: opts.limit ?? 50,
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
			);
		return new Map(
			raw
				.filter((r) => (r.score ?? 0) >= BUILD_SEMANTIC_FLOOR)
				.map((r) => [r.buildId, r.score]),
		);
	} catch {
		return null;
	}
}
