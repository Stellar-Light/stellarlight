/**
 * Code-reference search — find existing Stellar ecosystem GitHub repos by tech.
 * Answers the "has anyone built X / show me zk repos" question project search
 * can't: it indexes GitHub topics + description + language + README, expands
 * synonyms (zk→zero-knowledge/snark...), and ranks by a quality grade
 * (repoScore = freshness + traction + hackathon/SCF/builder authority).
 *
 *   GET /api/repos/search?q=zk
 *   GET /api/repos/search?q=oracle&language=Rust&minScore=40
 *
 * The same graded repos are also injected inline into /api/projects/search as
 * `codeReferences`, so consumers that only call project search pick them up.
 * Shared implementation in src/lib/repo-search.ts.
 */
import { type NextRequest, NextResponse } from "next/server";
import { clampLimit } from "@/lib/http-params";
import { logApiHit } from "@/lib/api-usage";
import { getPayloadSafe } from "@/lib/payload-client";
import { searchRepos } from "@/lib/repo-search";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	// Accept query/keyword/search as aliases for q — agents often send the term
	// under `query`, and an unrecognized param silently drops it.
	const q =
		(sp.get("q") ?? sp.get("query") ?? sp.get("keyword") ?? sp.get("search"))?.trim() ?? "";
	const language = sp.get("language")?.trim().toLowerCase() ?? "";
	const minScore = Number(sp.get("minScore") || "0") || 0;
	const limit = clampLimit(sp.get("limit"), 20, 100);
	const offset = Math.max(Number(sp.get("offset") || "0") || 0, 0);

	const payload = await getPayloadSafe();
	const { repos, total, canonical } = await searchRepos(payload, q, {
		limit,
		offset,
		language,
		minScore,
	});

	logApiHit({ req, endpoint: "/api/repos/search", query: q, filters: { language, minScore, limit } });

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/directory",
				generatedAt: new Date().toISOString(),
				filters: { q, language: language || null, minScore, limit, offset },
				note: "Code references graded by repoScore (0-100) = freshness + traction + hackathon/SCF/builder authority. Lead with high-score repos as the strongest existing references; cite each repo's url/homepage. Each repo carries a `deepWikiUrl` — hand off there for deep 'where/how' questions about a repo's internals (e.g. error codes, consensus).",
				canonical:
					canonical.length > 0
						? {
								repos: canonical,
								note: "Curated canonical Stellar repos for this infra/protocol query, floated to the top (e.g. error codes → stellar-core/Horizon/SDKs; Horizon lives in stellar/go). Recommend these as the authoritative sources, and chain to their deepWikiUrl for internals.",
							}
						: null,
				counts: { returned: repos.length, total },
			},
			repos,
		},
		{ headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
	);
}
