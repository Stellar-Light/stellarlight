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
import { logApiHit } from "@/lib/api-usage";
import {
	clampLimit,
	parseFields,
	pickFields,
	unknownParamWarning,
} from "@/lib/http-params";
import { laneHints } from "@/lib/lane-hints";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { searchRepos } from "@/lib/repo-search";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	// Say when a param was dropped (the projects/search treatment, 2026-07-11
	// audit): a filter we never read returns an unfiltered list the caller
	// reads as filtered. Warned, not 400'd — the contract is additive-only.
	const paramWarning = unknownParamWarning(
		sp,
		[
			"q",
			"query",
			"keyword",
			"search",
			"language",
			"minScore",
			"limit",
			"offset",
			"fields",
		],
		{
			advertise: ["q", "language", "minScore", "limit", "offset", "fields"],
			hint: "Repo search matches name/description/topics/symbols from q — put language or framework terms in q if the dedicated filter doesn't cover them.",
		},
	);
	// Accept query/keyword/search as aliases for q — agents often send the term
	// under `query`, and an unrecognized param silently drops it.
	const q =
		(
			sp.get("q") ??
			sp.get("query") ??
			sp.get("keyword") ??
			sp.get("search")
		)?.trim() ?? "";
	const language = sp.get("language")?.trim().toLowerCase() ?? "";
	const minScore = Number(sp.get("minScore") || "0") || 0;
	const limit = clampLimit(sp.get("limit"), 20, 100);
	const fieldsWanted = parseFields(sp.get("fields"));
	const offset = Math.max(Number(sp.get("offset") || "0") || 0, 0);

	const payload = await getPayloadSafe();
	const { repos, total, canonical, searched } = await searchRepos(payload, q, {
		limit,
		offset,
		language,
		minScore,
	});

	logApiHit({
		req,
		endpoint: "/api/repos/search",
		query: q,
		filters: { language, minScore, limit },
		resultCount: repos.length,
	});

	return NextResponse.json(
		{
			meta: {
				...(laneHints("repos", { empty: repos.length === 0 })
					? { hints: laneHints("repos", { empty: repos.length === 0 }) }
					: {}),
				source: "https://stellarlight.xyz/directory",
				generatedAt: new Date().toISOString(),
				...(paramWarning ? { warnings: [paramWarning] } : {}),
				filters: { q, language: language || null, minScore, limit, offset },
				note: "Code references graded by repoScore (0-100) = freshness + traction + hackathon/SCF/builder authority. Lead with high-score repos as the strongest existing references; cite each repo's url/homepage. Each repo carries a `deepWikiUrl` — hand off there for deep 'where/how' questions about a repo's internals (e.g. error codes, consensus).",
				canonical:
					canonical.length > 0
						? {
								repos: canonical,
								note: "Curated canonical Stellar repos for this infra/protocol query, floated to the top (e.g. error codes → stellar-core/Horizon/SDKs; Horizon lives in stellar/go). Recommend these as the authoritative sources, and chain to their deepWikiUrl for internals.",
							}
						: null,
				// sls-025: a zero-result page says exactly what WAS searched, so an
				// empty answer can't silently read as "this repo/standard doesn't
				// exist" when the real cause is an alias form or an index-coverage gap.
				...(q && repos.length === 0
					? {
							searched: {
								tokens: searched.tokens,
								expandedTerms: searched.expandedTerms,
								fields: [
									"fullName (owner + repo name, raw and hyphen/slash/underscore-insensitive)",
									"description",
									"topics",
									"codeSymbols",
								],
								note: "0 indexed repos matched. The tokens above (with their synonym/alias expansions) were searched across the listed fields, including owner names and separator-insensitive forms of the query. The index covers curated Stellar-ecosystem repos and can lag or miss new/renamed ones — an empty result is NOT evidence that the repo, standard, or implementation doesn't exist. Try the bare repo name, the owner name alone, or a broader vertical term; if the repo exists publicly but is missing here, report it via POST /api/feedback.",
							},
						}
					: {}),
				counts: { returned: repos.length, total },
			},
			repos: repos.map((r) => pickFields(r, fieldsWanted)),
		},
		{
			headers: {
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
