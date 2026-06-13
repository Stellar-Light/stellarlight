/**
 * Public read-only projects search — find existing Stellar projects.
 * Powers Stellar Scout's "has anyone built this?" / competitor-lookup
 * questions.
 *
 *   GET /api/projects/search?q=stablecoin
 *   GET /api/projects/search?category=Protocol/Contract&scfAwarded=1
 *   GET /api/projects/search?hackathon=stellar-hacks-agents
 *
 * Full-text-ish search across name + short description + category. Not a
 * proper vector search — that's Phase 2. This is keyword overlap, scored
 * by how many query tokens hit each project.
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { projectConfidence } from "@/lib/confidence";
import { embed } from "@/lib/embed";
import { getPayloadSafe } from "@/lib/payload-client";

/**
 * Semantic project search via Atlas $vectorSearch over project embeddings
 * (voyage-3, populated by scripts/embed-projects.ts). Used as the
 * keyword→semantic rung: when a keyword search comes back thin, this finds
 * conceptually-related projects the literal `like` match misses (the
 * x402-class question: "charge AI agents per API call" → agentic-payments
 * projects, even with no literal term overlap). Returns [] and never throws
 * past the caller's try/catch if the index isn't READY yet or VOYAGE_API_KEY
 * is unset — so the route degrades gracefully to keyword-only.
 */
async function semanticProjectRows(
	// biome-ignore lint/suspicious/noExplicitAny: payload.db internals
	payload: any,
	q: string,
	limit: number,
) {
	const queryEmbedding = await embed(q);
	const db = payload.db?.connection?.db;
	const collection = db?.collection("projects");
	if (!collection) return [];
	const pipeline = [
		{
			$vectorSearch: {
				index: "project_vector_index",
				path: "embedding",
				queryVector: queryEmbedding,
				numCandidates: Math.max(200, limit * 15),
				limit: limit * 3,
			},
		},
		{ $match: { status: { $in: ["Development", "Pre-Release", "Live"] } } },
		{
			$project: {
				_id: 1,
				name: 1,
				slug: 1,
				category: 1,
				shortDescription: 1,
				status: 1,
				logo: 1,
				scf: 1,
				hackathonPlacement: 1,
				score: { $meta: "vectorSearchScore" },
			},
		},
	];
	// biome-ignore lint/suspicious/noExplicitAny: aggregate result shape
	const raw: any[] = await collection.aggregate(pipeline).toArray();
	// Relevance floor: $vectorSearch always returns the nearest neighbours,
	// however far — so an off-distribution query ("reentrancy vulnerability",
	// which is a research/audit concept, not a project) would otherwise pull in
	// noise. Drop anything below a cosine threshold; if nothing clears it, return
	// [] and let the caller's /api/research advisory take over. Tunable.
	const SCORE_FLOOR = 0.55;
	const docs = raw.filter((p) => (p.score ?? 0) >= SCORE_FLOOR);
	if (docs.length === 0) return []; // no genuinely-close match (or index unbuilt)
	const max = docs.reduce((m, p) => Math.max(m, p.score ?? 0), 0) || 1;
	return docs.map((p) => {
		let logoUrl: string | null = null;
		if (p.logo && typeof p.logo === "object") {
			if (p.logo.url) logoUrl = p.logo.url;
			else if (p.logo.filename) logoUrl = `/api/media/file/${p.logo.filename}`;
		}
		return {
			id: String(p._id),
			name: p.name,
			slug: p.slug,
			category: p.category,
			shortDescription: p.shortDescription ?? null,
			status: p.status,
			logoUrl,
			scfAwarded: !!p.scf?.awarded,
			scfTotalAwardedUSD: p.scf?.totalAwarded ?? null,
			hackathon: null,
			hackathonPlacement: p.hackathonPlacement ?? null,
			hackathonPrize: null,
			hackathonPrizeTrack: null,
			score: p.score ?? 0,
			via: "semantic" as const,
			url: `https://stellarlight.xyz/project/${p.slug}`,
			confidence: projectConfidence({
				score: p.score ?? 0,
				maxScore: max,
				status: p.status,
				scfAwarded: !!p.scf?.awarded,
				hackathonPlacement: p.hackathonPlacement,
			}),
		};
	});
}

export const dynamic = "force-dynamic";
export const revalidate = 60;

interface ProjectRow {
	id: string;
	name: string;
	slug: string;
	category: string;
	shortDescription: string | null;
	status: string;
	logoUrl: string | null;
	scfAwarded: boolean;
	scfTotalAwardedUSD: number | null;
	hackathon: { id: string; name: string; slug: string } | null;
	hackathonPlacement: string | null;
	hackathonPrize: number | null;
	hackathonPrizeTrack: string | null;
	score: number;
	url: string;
}

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const q = sp.get("q")?.trim() ?? "";
	const category = sp.get("category");
	const hackathonSlug = sp.get("hackathon");
	const scfAwardedOnly = sp.get("scfAwarded") === "1";
	const limit = Math.min(Number(sp.get("limit") || "20") || 20, 100);
	const offset = Math.max(Number(sp.get("offset") || "0") || 0, 0);

	const payload = await getPayloadSafe();
	let totalMatching = 0;
	let projects: ProjectRow[] = [];
	let matchMode: "strict" | "loose-1" | "majority" | "all" = "all";

	if (payload) {
		try {
			// biome-ignore lint/suspicious/noExplicitAny: Payload Where type is awkward
			const where: any = {
				status: { in: ["Development", "Pre-Release", "Live"] },
			};
			if (category) {
				where.category = { equals: category };
			}
			if (hackathonSlug) {
				// Resolve hackathon slug → id first
				const hk = await payload.find({
					collection: "hackathons",
					where: { slug: { equals: hackathonSlug } },
					limit: 1,
					depth: 0,
				});
				const hkId = hk.docs[0]?.id;
				if (hkId) where.hackathon = { equals: hkId };
			}
			if (scfAwardedOnly) {
				where["scf.awarded"] = { equals: true };
			}

			const tokens = q
				.toLowerCase()
				.split(/\s+/)
				.filter((t) => t.length > 1);

			// Push the keyword match INTO the DB query (OR over tokens) so EVERY
			// matching project is a candidate — not just whichever 500 load first
			// by default sort. Without this, search fetched the first 500 docs and
			// scored them in memory, leaving the tail (older seed records like
			// Soroswap/Aquarius) permanently unsearchable once the directory grew
			// past 500. The in-memory tiering below still ranks the candidates.
			if (tokens.length) {
				where.or = tokens.flatMap((t) => [
					{ name: { like: t } },
					{ shortDescription: { like: t } },
					{ category: { like: t } },
				]);
			}

			const result = await payload.find({
				collection: "projects",
				where,
				limit: 500,
				depth: 1,
			});

			projects = (
				result.docs as Array<{
					id: string;
					name: string;
					slug: string;
					category: string;
					shortDescription?: string;
					status: string;
					logo?: { url?: string; filename?: string } | string | null;
					scf?: { awarded?: boolean; totalAwarded?: number };
					hackathon?:
						| { id: string; name: string; slug: string }
						| string
						| null;
					hackathonPlacement?: string;
					hackathonPrize?: number;
					hackathonPrizeTrack?: string;
				}>
			).map((p) => {
				const hay =
					`${p.name} ${p.shortDescription ?? ""} ${p.category}`.toLowerCase();
				const score = tokens.length
					? tokens.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0)
					: 1;
				const hk =
					p.hackathon && typeof p.hackathon === "object"
						? {
								id: String(p.hackathon.id),
								name: p.hackathon.name,
								slug: p.hackathon.slug,
							}
						: null;
				// Resolve logo URL: prefer Payload's .url (S3/R2 storage adapter
				// resolves it automatically), fall back to /media/{filename}
				// for legacy or local-filesystem uploads.
				let logoUrl: string | null = null;
				if (p.logo && typeof p.logo === "object") {
					if (p.logo.url) logoUrl = p.logo.url;
					else if (p.logo.filename)
						logoUrl = `/api/media/file/${p.logo.filename}`;
				}
				return {
					id: String(p.id),
					name: p.name,
					slug: p.slug,
					category: p.category,
					shortDescription: p.shortDescription ?? null,
					status: p.status,
					logoUrl,
					scfAwarded: !!p.scf?.awarded,
					scfTotalAwardedUSD: p.scf?.totalAwarded ?? null,
					hackathon: hk,
					hackathonPlacement: p.hackathonPlacement ?? null,
					hackathonPrize: p.hackathonPrize ?? null,
					hackathonPrizeTrack: p.hackathonPrizeTrack ?? null,
					score,
					url: `https://stellarlight.xyz/project/${p.slug}`,
				};
			});

			// Tiered match modes. Strict AND first (avoids false positives
			// from common words like "stablecoin" matching every payments
			// project). If a strict AND query yields 0 hits we relax in two
			// stages so multi-word natural queries don't dead-end:
			//
			//   strict   = all N tokens must match (default for ≤2 tokens)
			//   loose-1  = N-1 of N tokens match (only kicks in for 3+ tokens)
			//   majority = ⌈N/2⌉ tokens match (last resort)
			//
			// The .meta.matchMode field tells the caller which tier returned
			// the results so they can convey relevance honestly to the user.
			if (tokens.length) {
				matchMode = "strict";
				let filtered = projects.filter((p) => p.score >= tokens.length);
				if (filtered.length === 0 && tokens.length >= 3) {
					matchMode = "loose-1";
					filtered = projects.filter((p) => p.score >= tokens.length - 1);
				}
				if (filtered.length === 0 && tokens.length >= 2) {
					matchMode = "majority";
					const need = Math.ceil(tokens.length / 2);
					filtered = projects.filter((p) => p.score >= need);
				}
				// Primary rank = keyword-match count. Tiebreak by composite
				// confidence (status-freshness + SCF/hackathon authority) so on a
				// broad query like "swap" the flagship audited/funded DEXes lead
				// instead of falling back to arbitrary DB order behind same-score
				// newcomers. Precompute once (O(n)) to avoid re-scoring in compare.
				const fMax = filtered.reduce((m, p) => Math.max(m, p.score ?? 0), 0);
				const confByName = new Map(
					filtered.map((p) => [
						p.id,
						projectConfidence({
							score: p.score,
							maxScore: fMax,
							status: p.status,
							scfAwarded: p.scfAwarded,
							hackathonPlacement: p.hackathonPlacement,
						}).score,
					]),
				);
				filtered.sort(
					(a, b) =>
						b.score - a.score ||
						(confByName.get(b.id) ?? 0) - (confByName.get(a.id) ?? 0),
				);
				projects = filtered;
			} else {
				matchMode = "all";
				projects.sort((a, b) => Number(b.scfAwarded) - Number(a.scfAwarded));
			}

			totalMatching = projects.length;
			projects = projects.slice(offset, offset + limit);
		} catch {
			// fall through
		}
	}

	// Attach a confidence signal to each result — same trust scale as
	// /api/research, with project-appropriate signals (keyword relevance,
	// lifecycle status as freshness, SCF/hackathon vetting as authority).
	const projMax = projects.reduce((m, p) => Math.max(m, p.score ?? 0), 0);
	const scored = projects.map((p) => ({
		...p,
		via: "keyword" as const,
		confidence: projectConfidence({
			score: p.score,
			maxScore: projMax,
			status: p.status,
			scfAwarded: p.scfAwarded,
			hackathonPlacement: p.hackathonPlacement,
		}),
	}));

	// Keyword→semantic rung: when the keyword pass came back thin (didn't fill
	// the page), augment with semantic $vectorSearch matches the literal `like`
	// missed — conceptually-related projects (the x402-class question).
	// First page + query only. Fault-tolerant: if the index isn't READY yet or
	// VOYAGE_API_KEY is unset, semanticProjectRows yields nothing / throws and
	// we silently keep keyword-only.
	let semanticAdds: Awaited<ReturnType<typeof semanticProjectRows>> = [];
	if (q && offset === 0 && scored.length < limit && payload) {
		try {
			const sem = await semanticProjectRows(payload, q, limit);
			const have = new Set(scored.map((r) => r.id));
			semanticAdds = sem
				.filter((r) => !have.has(r.id))
				.slice(0, limit - scored.length);
		} catch {
			// index not ready / no embedding key — degrade to keyword-only
		}
	}
	const usedSemantic = semanticAdds.length > 0;

	logApiHit({
		req,
		endpoint: "/api/projects/search",
		query: q,
		filters: {
			category,
			hackathon: hackathonSlug,
			scfAwarded: scfAwardedOnly,
			limit,
		},
	});

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/directory",
				generatedAt: new Date().toISOString(),
				filters: {
					q,
					category,
					hackathon: hackathonSlug,
					scfAwardedOnly,
					limit,
					offset,
				},
				matchMode,
				// Hint to the caller (agent) so they can frame results honestly:
				//   strict   → "every keyword matched"
				//   loose-1  → "all but one keyword matched"
				//   majority → "most of your keywords matched — broader interpretation"
				//   all      → no keyword query was supplied
				matchModeLabel: {
					strict: "all keywords matched",
					"loose-1": "all but one keyword matched",
					majority: "majority of keywords matched (broader scope)",
					all: "no keyword filter",
				}[matchMode],
				// total = matches before offset/limit slicing — lets paging
				// consumers know when they've seen everything.
				counts: {
					returned: projects.length + semanticAdds.length,
					total: totalMatching + semanticAdds.length,
				},
				// `semantic: true` means the keyword pass was thin and we filled
				// the page with vector-search matches the literal filter missed
				// (each such row is tagged `via: "semantic"`).
				semantic: usedSemantic,
				// When BOTH keyword and semantic came back empty, point the agent
				// at thesis-level retrieval. Project search can't answer "is x402
				// possible on Stellar?" — /api/research can.
				...(projects.length === 0 && semanticAdds.length === 0 && q
					? {
							advisory: {
								summary: `No projects match '${q}' even after broadening the search. This could be a real gap, a naming/tag mismatch, or a thesis-level question that's better answered against the research corpus.`,
								suggestions: [
									{
										action: "research-corpus",
										url: `/api/research?q=${encodeURIComponent(q)}&limit=5`,
										why: "If the question is design / feasibility / 'has this concept been discussed', /api/research surfaces SEPs, papers, audit findings, SCF Handbook chunks — content the project directory doesn't index.",
									},
									{
										action: "synonym-retry",
										why: `Try a single-word category or technology synonym (e.g. 'oracle' instead of 'price feed', 'soroban' instead of 'smart contract') — projects tend to be tagged by category, not by application descriptions.`,
									},
								],
							},
						}
					: {}),
			},
			projects: [...scored, ...semanticAdds],
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
			},
		},
	);
}
