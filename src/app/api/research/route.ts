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
import { logApiHit } from "@/lib/api-usage";
import { researchConfidence, SCORE_MODEL_VERSION } from "@/lib/confidence";
import { EMBEDDING_MODEL, embed } from "@/lib/embed";
import { clampLimit } from "@/lib/http-params";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { isLowValueChunk } from "@/lib/research-ingest";

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
	// Audit-specific (only present when source === "audit")
	auditor?: string | null;
	protocol?: string | null;
	severity?: string | null;
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
					"Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)),
				},
			},
		);
	}

	const sp = req.nextUrl.searchParams;
	// Accept query/keyword/search as aliases for q — agents often send the term
	// under `query`, and an unrecognized param silently drops it.
	const q =
		(
			sp.get("q") ??
			sp.get("query") ??
			sp.get("keyword") ??
			sp.get("search")
		)?.trim() ?? "";
	const sourceFilter = sp.get("source");
	const limitParam = clampLimit(sp.get("limit"), 8, 25);

	// Single source of truth for valid `source` values. Kept in sync with
	// the ResearchSource type in src/lib/research-ingest.ts.
	const VALID_SOURCES = [
		"sdf-blog",
		"scf-handbook",
		"sep",
		"dev-docs",
		"paper",
		"scf-proposal",
		"lumenloop",
		"lumenloop-research",
		"audit",
		"incident",
		"ec-developer-report",
	] as const;

	if (!q) {
		return NextResponse.json(
			{
				error:
					"missing required `q` parameter (e.g. /api/research?q=soroban+authorization)",
				validSources: VALID_SOURCES,
			},
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	// Reject unknown source values with a helpful error rather than silently
	// returning 0 results. Agents otherwise can't tell whether a 0-result
	// response means "wrong source name" or "no matching content in the
	// real source" — surface the distinction.
	if (sourceFilter && !VALID_SOURCES.includes(sourceFilter as never)) {
		return NextResponse.json(
			{
				error: `unknown source: '${sourceFilter}'`,
				hint: "see validSources for the full list",
				validSources: VALID_SOURCES,
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

		// NOTE: source filter is applied as a post-pipeline $match rather
		// than $vectorSearch.filter. The latter requires `source` to be
		// declared as a filter field in the vector index definition, which
		// our minimal index doesn't have. We over-fetch (3x) and post-filter
		// instead so callers can use ?source= without an index rebuild.
		// Over-fetch generously: low-value chunks (nav cards, breadcrumb stubs)
		// are filtered out of the results below, so we need headroom to still
		// return `limitParam` real chunks. The early $limit is dropped for the
		// same reason — trimming happens after the low-value filter.
		const overfetch = Math.max(limitParam * 4, 24);
		const pipeline: Record<string, unknown>[] = [
			{
				$vectorSearch: {
					index: "research_vector_index",
					path: "embedding",
					queryVector: queryEmbedding,
					numCandidates: Math.max(200, overfetch * 10),
					limit: overfetch,
				},
			},
			...(sourceFilter ? [{ $match: { source: sourceFilter } }] : []),
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
				auditor?: string;
				protocol?: string;
				severity?: string;
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
				auditor: d.auditor ?? null,
				protocol: d.protocol ?? null,
				severity: d.severity ?? null,
				score: d.score,
			}),
		);
	} catch {
		// Fall back to keyword search using Payload's standard find.
		// Ranking is BM25-lite: term frequency × field-position weight,
		// with length normalization and a phrase-proximity bonus.
		//
		// The previous scoring just counted unique tokens appearing AT
		// LEAST ONCE in title+content — so a chunk mentioning "oracle"
		// 50 times got the same score as one mentioning it incidentally.
		// That made vector-fallback retrieval near-random, which is
		// exactly what production exhibits when VOYAGE_API_KEY is unset.
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
					or: [{ title: { contains: t } }, { content: { contains: t } }],
				}));
			}

			// Pull a wider candidate pool (200) so ranking has room to
			// surface high-relevance chunks past position 50 — Mongo
			// returns matches in storage order, not relevance order.
			const result = await payload.find({
				collection: "research-docs",
				where,
				limit: 200,
				depth: 0,
			});

			const allDocs = result.docs as unknown as Array<{
				id: string;
				source: string;
				title: string;
				section?: string;
				url: string;
				content: string;
				chunkIndex: number;
				publishedAt?: string;
				auditor?: string;
				protocol?: string;
				severity?: string;
			}>;

			// Compute mean content length for length-normalization
			const meanLen = allDocs.length
				? allDocs.reduce((s, d) => s + d.content.length, 0) / allDocs.length
				: 1;

			function escapeRe(s: string) {
				return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			}

			function score(d: { title: string; section?: string; content: string }) {
				if (!tokens.length) return 1;
				const title = d.title.toLowerCase();
				const section = (d.section ?? "").toLowerCase();
				const body = d.content.toLowerCase();

				let s = 0;
				let matchedTokens = 0;
				for (const t of tokens) {
					const re = new RegExp(`\\b${escapeRe(t)}\\b`, "g");
					const tfTitle = (title.match(re) || []).length;
					const tfSection = (section.match(re) || []).length;
					const tfBody = (body.match(re) || []).length;
					const tfTotal = tfTitle + tfSection + tfBody;
					if (tfTotal === 0) continue;
					matchedTokens += 1;
					// log(1+tf) avoids one mega-frequent token swamping
					// everything; field weights: title 3×, section 2×, body 1×.
					s +=
						Math.log(1 + tfBody) +
						2 * Math.log(1 + tfSection) +
						3 * Math.log(1 + tfTitle);
				}
				if (matchedTokens === 0) return 0;
				// All-tokens-matched bonus (favors strict over partial)
				if (matchedTokens === tokens.length) s *= 1.5;
				// Phrase-proximity bonus: full query as a substring is a
				// strong signal — bump 1.8× when present in body
				if (tokens.length >= 2) {
					const phrase = tokens.join(" ");
					if (body.includes(phrase)) s *= 1.8;
				}
				// Length normalization: penalize chunks much longer than
				// the mean so a 6000-char chunk doesn't dominate over a
				// 1500-char chunk just by surface area.
				const lenPenalty = 1 / Math.sqrt(d.content.length / meanLen);
				return s * lenPenalty;
			}

			chunks = allDocs
				.map((d) => ({
					id: String(d.id),
					source: d.source,
					title: d.title,
					section: d.section ?? null,
					url: d.url,
					content: d.content,
					chunkIndex: d.chunkIndex,
					publishedAt: d.publishedAt ?? null,
					auditor: d.auditor ?? null,
					protocol: d.protocol ?? null,
					severity: d.severity ?? null,
					score: score(d),
				}))
				.filter((d) => (d.score ?? 0) > 0)
				.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
				.slice(0, Math.max(limitParam * 4, 24));
		} catch {
			chunks = [];
		}
	}

	// Drop low-value chunks (Docusaurus nav cards, breadcrumb/date stubs) that
	// either path may surface on a stray token match — the SAME rule the
	// ingester uses. Applied at read time so chunks embedded before the filter
	// existed never reach a caller, WITHOUT a destructive corpus delete: the
	// rows stay in Atlas, fully reversible. Both paths over-fetch above, so we
	// still return up to `limitParam` real results after trimming.
	chunks = chunks
		.filter((c) => !isLowValueChunk(c.content))
		.slice(0, limitParam);

	// Attach a confidence signal to every result so a consuming agent can tell
	// a strong, fresh, authoritative hit from a weak/stale one — not just read
	// the raw cosine. Keyword mode needs the set max to normalize relevance.
	const now = Date.now();
	const maxScore = chunks.reduce((m, c) => Math.max(m, c.score ?? 0), 0);
	const results = chunks.map((c) => ({
		...c,
		confidence: researchConfidence({
			score: c.score,
			source: c.source,
			mode,
			maxScore,
			publishedAt: c.publishedAt,
			now,
		}),
	}));

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
				counts: { returned: results.length },
				// Per-result `confidence`: a 0–1 score + label (high/medium/low)
				// blending relevance, source-aware freshness, and source
				// authority. Deterministic + versioned so agents can rely on it.
				scoreModel: {
					version: SCORE_MODEL_VERSION,
					fields: ["relevance", "freshness", "authority"],
					note: "confidence.score = 0.65·relevance + 0.15·freshness + 0.20·authority (relevance-floored). Sort by it for trust-ranked results.",
				},
			},
			results,
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

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
