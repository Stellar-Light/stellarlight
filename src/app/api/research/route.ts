/**
 * Public read-only research endpoint backed by the ResearchDocs corpus.
 *
 *   GET /api/research?q={query}&limit=N&source={src}
 *
 * Embeds the query via Voyage AI, runs MongoDB Atlas $vectorSearch over
 * the ResearchDocs.embedding field, and returns the top-K chunks with
 * source attribution. Used by Stellar Scout for thesis-grounded answers
 * — when the agent needs primary-source citations, not just structured
 * facts.
 *
 * If the corpus is empty or vector search isn't available (e.g. the
 * Atlas index hasn't been created yet, or we're on local dev with a
 * Mongo that doesn't support $vectorSearch), we fall back to a coarse
 * keyword search over `title + content` so the endpoint stays useful.
 *
 * Rate limited: 60 req/min per IP (these queries cost Voyage credits).
 */

import { type NextRequest, NextResponse } from "next/server";
import { embed, EMBEDDING_MODEL } from "@/lib/embed";
import { getPayloadSafe } from "@/lib/payload-client";
import { logApiHit } from "@/lib/api-usage";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 60;

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

interface ResearchRow {
	id: string;
	source: string;
	title: string;
	section: string | null;
	url: string;
	content: string;
	chunkIndex: number;
	publishedAt: string | null;
	score?: number;
}

export async function GET(req: NextRequest) {
	// Rate-limit first so abusers don't even reach the embedding call.
	const limit = rateLimit(req, {
		endpoint: "/api/research",
		limit: RATE_LIMIT_MAX,
		windowMs: RATE_LIMIT_WINDOW_MS,
	});
	if (!limit.allowed) {
		return NextResponse.json(
			{
				error: "rate limit exceeded",
				retryAfterSeconds: Math.ceil((limit.resetAt - Date.now()) / 1000),
			},
			{
				status: 429,
				headers: {
					...rateLimitHeaders(limit),
					"Retry-After": String(
						Math.ceil((limit.resetAt - Date.now()) / 1000),
					),
				},
			},
		);
	}

	const sp = req.nextUrl.searchParams;
	const q = sp.get("q")?.trim() ?? "";
	const sourceFilter = sp.get("source");
	const limitParam = Math.min(Number(sp.get("limit") || "8") || 8, 25);

	if (!q) {
		return NextResponse.json(
			{
				error:
					"missing required `q` parameter (e.g. /api/research?q=soroban+authorization)",
				validSources: [
					"sdf-blog",
					"scf-handbook",
					"sep",
					"dev-docs",
					"paper",
					"scf-proposal",
					"lumenloop",
				],
			},
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	const payload = await getPayloadSafe();
	if (!payload) {
		return NextResponse.json(
			{ error: "payload unavailable" },
			{ status: 503, headers: rateLimitHeaders(limit) },
		);
	}

	let mode: "vector" | "keyword" = "vector";
	let chunks: ResearchRow[] = [];

	// Try vector search first. If Atlas vector search isn't configured
	// or the corpus is empty, fall back to keyword.
	try {
		const queryEmbedding = await embed(q);

		// We use the underlying mongoose connection to run the $vectorSearch
		// aggregation since Payload's `find()` doesn't expose vector ops.
		// biome-ignore lint/suspicious/noExplicitAny: payload.db internals
		const db = (payload.db as any)?.connection?.db;
		const collection = db?.collection("research-docs");
		if (!collection) throw new Error("research-docs collection unavailable");

		const pipeline: Record<string, unknown>[] = [
			{
				$vectorSearch: {
					index: "research_vector_index",
					path: "embedding",
					queryVector: queryEmbedding,
					numCandidates: 200,
					limit: limitParam,
					...(sourceFilter ? { filter: { source: sourceFilter } } : {}),
				},
			},
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
					score: { $meta: "vectorSearchScore" },
				},
			},
		];

		const docs = await collection.aggregate(pipeline).toArray();
		// If Atlas Vector Search index isn't created yet, $vectorSearch
		// silently returns []. Force-fall-through to keyword in that case so
		// the endpoint stays useful before the index is set up.
		if (docs.length === 0) {
			throw new Error("vector search returned 0 results — falling back");
		}
		chunks = docs.map(
			(d: {
				_id: string;
				source: string;
				title: string;
				section?: string;
				url: string;
				content: string;
				chunkIndex: number;
				publishedAt?: string;
				score?: number;
			}) => ({
				id: String(d._id),
				source: d.source,
				title: d.title,
				section: d.section ?? null,
				url: d.url,
				content: d.content,
				chunkIndex: d.chunkIndex,
				publishedAt: d.publishedAt ?? null,
				score: d.score,
			}),
		);
	} catch {
		// Fall back to keyword search using Payload's standard find.
		mode = "keyword";
		try {
			const tokens = q
				.toLowerCase()
				.split(/\s+/)
				.filter((t) => t.length > 1);

			// biome-ignore lint/suspicious/noExplicitAny: Payload Where is awkward
			const where: any = {};
			if (sourceFilter) where.source = { equals: sourceFilter };
			if (tokens.length) {
				where.or = tokens.map((t) => ({
					or: [
						{ title: { contains: t } },
						{ content: { contains: t } },
					],
				}));
			}

			const result = await payload.find({
				collection: "research-docs",
				where,
				limit: 50,
				depth: 0,
			});

			chunks = (
				result.docs as unknown as Array<{
					id: string;
					source: string;
					title: string;
					section?: string;
					url: string;
					content: string;
					chunkIndex: number;
					publishedAt?: string;
				}>
			)
				.map((d) => {
					const hay = `${d.title} ${d.content}`.toLowerCase();
					const score = tokens.length
						? tokens.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0)
						: 1;
					return {
						id: String(d.id),
						source: d.source,
						title: d.title,
						section: d.section ?? null,
						url: d.url,
						content: d.content,
						chunkIndex: d.chunkIndex,
						publishedAt: d.publishedAt ?? null,
						score,
					};
				})
				.filter((d) => (d.score ?? 0) > 0)
				.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
				.slice(0, limitParam);
		} catch {
			chunks = [];
		}
	}

	logApiHit({
		req,
		endpoint: "/api/research",
		query: q,
		filters: { source: sourceFilter, limit: limitParam, mode },
	});

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/api/research",
				generatedAt: new Date().toISOString(),
				query: q,
				mode,
				model: mode === "vector" ? EMBEDDING_MODEL : null,
				filters: { source: sourceFilter, limit: limitParam },
				counts: { returned: chunks.length },
			},
			results: chunks,
		},
		{
			headers: {
				...rateLimitHeaders(limit),
				// Don't aggressively cache — query strings vary by user
				"Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
			},
		},
	);
}
