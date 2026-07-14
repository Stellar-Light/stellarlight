/**
 * $vectorSearch pipeline builder for /api/research — pure function so the
 * pool-sizing policy is unit-testable (the route itself needs Atlas).
 *
 * The sls-019 dedup leak lived here: `?source=` is applied as a post-pipeline
 * $match (our minimal vector index has no `source` filter field), so a
 * source-filtered query kept only the cap/sep/… rows that happened to be in
 * the generic top-`overfetch` pool. For q=Asset Clawback&source=cap that left
 * 7 distinct CAP documents feeding a 25-slot page — rankResearchChunks'
 * per-document collapse then legitimately refilled the page with duplicate
 * chunks of those same 7 docs (cap-0035 served 9×) even though 70+ CAP docs
 * exist in the corpus. The advertised "best chunk per document" contract can
 * only hold when the pool has enough DISTINCT in-source documents.
 *
 * Fix at the root: when a source filter is present, widen the $vectorSearch
 * stage (more candidates retained BEFORE the $match) and re-trim to
 * `overfetch` AFTER it — the $limit sits between $match and $project, so the
 * wire payload stays the same size as an unfiltered query.
 */

export const VECTOR_INDEX = "research_vector_index";

/** Chunk pool handed to the ranking stage (unchanged from pre-fix). */
export function researchOverfetch(limit: number): number {
	// 8× (was 4×): per-doc collapse needs DISTINCT documents — audit R2
	// found pages of 10 with only 6 docs because the 40-chunk pool was
	// dominated by multi-chunk hits on the same few documents.
	return Math.max(limit * 8, 48);
}

export function buildResearchVectorPipeline(opts: {
	queryEmbedding: number[];
	limit: number;
	sourceFilter?: string | null;
}): Record<string, unknown>[] {
	const overfetch = researchOverfetch(opts.limit);
	// Source-filtered queries survey a much deeper vector pool: the post-match
	// survivors of a narrow source are a small fraction of the generic top-K.
	// 6× (capped) keeps worst-case numCandidates well under Atlas' 10k limit
	// while comfortably covering the corpus' per-source document counts.
	const vsLimit = opts.sourceFilter ? Math.min(overfetch * 6, 1200) : overfetch;
	return [
		{
			$vectorSearch: {
				index: VECTOR_INDEX,
				path: "embedding",
				queryVector: opts.queryEmbedding,
				numCandidates: Math.min(Math.max(200, vsLimit * 5), 10_000),
				limit: vsLimit,
			},
		},
		...(opts.sourceFilter
			? [{ $match: { source: opts.sourceFilter } }, { $limit: overfetch }]
			: []),
		{
			$project: {
				_id: 1,
				source: 1,
				title: 1,
				section: 1,
				url: 1,
				content: 1,
				chunkIndex: 1,
				publishedAt: 1,
				auditor: 1,
				protocol: 1,
				severity: 1,
				score: { $meta: "vectorSearchScore" },
			},
		},
	];
}
