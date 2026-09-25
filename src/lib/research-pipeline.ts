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

/**
 * Atlas-equivalent vector score for a chunk fetched OUTSIDE $vectorSearch
 * (recency pool supplement — see research-rank.ts). The index is declared
 * with `similarity: "cosine"` (scripts/create-vector-index.ts), for which
 * Atlas reports vectorSearchScore = (1 + cosine) / 2 — computing the same
 * quantity locally keeps supplemented chunks on the identical score scale
 * as the pool, so ranking never has to special-case where a chunk came
 * from and no chunk gets invented relevance. Returns null when either
 * vector is missing/degenerate (caller should skip the chunk).
 */
export function cosineVectorScore(
	query: number[],
	doc: number[] | null | undefined,
): number | null {
	if (!doc || doc.length !== query.length || query.length === 0) return null;
	let dot = 0;
	let qn = 0;
	let dn = 0;
	for (let i = 0; i < query.length; i++) {
		dot += query[i] * doc[i];
		qn += query[i] * query[i];
		dn += doc[i] * doc[i];
	}
	if (qn === 0 || dn === 0) return null;
	return (1 + dot / Math.sqrt(qn * dn)) / 2;
}

/** Chunk pool handed to the ranking stage (unchanged from pre-fix). */
export function researchOverfetch(limit: number): number {
	// 8× (was 4×): per-doc collapse needs DISTINCT documents — audit R2
	// found pages of 10 with only 6 docs because the 40-chunk pool was
	// dominated by multi-chunk hits on the same few documents.
	return Math.max(limit * 8, 48);
}

/** Atlas' ceiling for `numCandidates` on $vectorSearch. */
export const VECTOR_NUM_CANDIDATES_MAX = 10_000;
/**
 * The deep pass's pool. Every $vectorSearch hit is a full document fetch on
 * mongod (the embedding alone is 8 KB), so this is a bounded survey for the
 * interim, not the whole index: once `source` is a filter field of the index
 * the filter runs inside the index and no deep pass is needed.
 */
export const VECTOR_DEEP_LIMIT = 4_000;

/** The definition the index is expected to carry (scripts/create-vector-index.ts writes it). */
export const VECTOR_INDEX_FIELDS = [
	{
		type: "vector",
		path: "embedding",
		numDimensions: 1024,
		similarity: "cosine",
	},
	{ type: "filter", path: "source" },
] as const;

/**
 * Which paths the live vector index can filter on. Read once per instance
 * (a listSearchIndexes call) and re-read every ten minutes, so an instance
 * that started before the index gained `source` picks it up without a
 * deploy. Unreadable (an Atlas blip, an older tier) reads as "none": the
 * pool path still works, only slower for small sources.
 */
let filterPathsCache: { at: number; paths: Set<string> } | null = null;
const FILTER_PATHS_TTL_MS = 10 * 60 * 1000;
export async function vectorIndexFilterPaths(collection: {
	listSearchIndexes: () => { toArray: () => Promise<unknown[]> };
}): Promise<Set<string>> {
	const now = Date.now();
	if (filterPathsCache && now - filterPathsCache.at < FILTER_PATHS_TTL_MS) {
		return filterPathsCache.paths;
	}
	const paths = new Set<string>();
	try {
		const all = (await collection.listSearchIndexes().toArray()) as Array<{
			name?: string;
			queryable?: boolean;
			status?: string;
			latestDefinition?: { fields?: Array<{ type?: string; path?: string }> };
		}>;
		const idx = all.find((i) => i.name === VECTOR_INDEX);
		// the definition Atlas is SERVING, not one still building
		if (idx && idx.queryable !== false && idx.status !== "PENDING") {
			for (const f of idx.latestDefinition?.fields ?? []) {
				if (f.type === "filter" && f.path) paths.add(f.path);
			}
		}
	} catch {
		// unreadable: the pool path
	}
	filterPathsCache = { at: now, paths };
	return paths;
}

export function buildResearchVectorPipeline(opts: {
	queryEmbedding: number[];
	limit: number;
	sourceFilter?: string | null;
	/**
	 * Survey a much deeper pool. A small source (paper, incident, lumenloop…)
	 * can be absent from the generic top-1,200 entirely, which read as
	 * "vector unavailable" and fell to keyword on every query; the route
	 * takes this pass once when the pool pass returns nothing for a source
	 * and the index cannot filter on `source` itself.
	 */
	deep?: boolean;
	/**
	 * The index carries `source` as a filter field: filter INSIDE
	 * $vectorSearch, so the pool is that source's own nearest chunks and no
	 * widening or deep pass is needed. See vectorIndexFilterPaths.
	 */
	indexFilter?: boolean;
}): Record<string, unknown>[] {
	const overfetch = researchOverfetch(opts.limit);
	const inIndex = Boolean(opts.sourceFilter && opts.indexFilter);
	// Source-filtered queries without an index filter survey a much deeper
	// vector pool: the post-match survivors of a narrow source are a small
	// fraction of the generic top-K. 6× (capped) keeps worst-case
	// numCandidates well under Atlas' 10k limit while comfortably covering
	// the corpus' per-source document counts.
	const vsLimit = inIndex
		? overfetch
		: opts.deep
			? VECTOR_DEEP_LIMIT
			: opts.sourceFilter
				? Math.min(overfetch * 6, 1200)
				: overfetch;
	return [
		{
			$vectorSearch: {
				index: VECTOR_INDEX,
				path: "embedding",
				queryVector: opts.queryEmbedding,
				numCandidates: Math.min(
					Math.max(200, vsLimit * 5),
					VECTOR_NUM_CANDIDATES_MAX,
				),
				limit: vsLimit,
				...(inIndex ? { filter: { source: { $eq: opts.sourceFilter } } } : {}),
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
				observedAt: 1,
				auditor: 1,
				protocol: 1,
				severity: 1,
				// #778 final root cause: the DB rows carried capStatus all along —
				// this $project silently dropped them before the route mapper ran
				// (the mapper's `?? null` then read as "never stamped"). Keyword
				// path was never affected (no select).
				capStatus: 1,
				capProtocolVersion: 1,
				score: { $meta: "vectorSearchScore" },
			},
		},
	];
}
