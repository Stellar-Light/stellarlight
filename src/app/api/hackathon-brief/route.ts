/**
 * Hackathon brief — the one-call version of the skill's "Hackathon Build
 * Brief" workflow.
 *
 *   GET /api/hackathon-brief?q=confidential%20token%20payroll
 *
 * A two-day team's first-hour questions, joined server-side: is it already
 * built (vet), what should we fork (startFrom — trust summaries), what is
 * live on mainnet to build against (liveContracts), is there money after
 * (funding — live SCF round + funded peers), and what must the demo not
 * claim (whatNotToClaim — derived from this brief's own facts). Composed
 * from the existing composites; no new data, no verdicts, every block keeps
 * its basis. Trimmed to sit inside an agent's result budget — startFrom
 * carries a trust SUMMARY and links the full /api/repos/trust report.
 *
 * Unknown query params 400 (never silently ignored).
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { buildHackathonBrief } from "@/lib/hackathon-brief";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getAppUrl } from "@/lib/utils/app-url";

export const dynamic = "force-dynamic";

const VALID_PARAMS = ["q"];

export async function GET(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/hackathon-brief",
		limit: 30,
		windowMs: 60_000,
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
	const unknown = [...sp.keys()].filter((k) => !VALID_PARAMS.includes(k));
	if (unknown.length) {
		return NextResponse.json(
			{
				error: `Unknown query param(s): ${unknown.join(", ")}`,
				validParams: VALID_PARAMS,
			},
			{ status: 400 },
		);
	}

	const q = sp.get("q")?.trim() ?? "";
	if (q.length < 3 || q.length > 200) {
		return NextResponse.json(
			{
				error:
					"Pass ?q= a short idea description, 3-200 chars (e.g. 'lending protocol for RWAs').",
			},
			{ status: 400 },
		);
	}

	const payload = await getPayloadSafe();
	if (!payload) {
		return NextResponse.json(
			{ error: "index unavailable" },
			{ status: 503, headers: rateLimitHeaders(limit) },
		);
	}

	const report = await buildHackathonBrief(payload, q);

	logApiHit({ req, endpoint: "/api/hackathon-brief", query: q, filters: {} });

	return NextResponse.json(
		{
			meta: {
				source: `${getAppUrl()}/api/hackathon-brief`,
				generatedAt: new Date().toISOString(),
				note: "One-call hackathon brief. vet = same computation as /api/vet-idea (gap is SUPPLY-side coverage, not demand; maturity absence = no evidence on record). startFrom = the top non-archived competitor repos with a trust SUMMARY — signals is a closed vocabulary of facts, not a score; full contractInterface at fullReport. liveContracts is evidence-gated: an empty list is 'no verified contract on record', never 'nothing on mainnet'. funding.round never asserts a negative on fetch failure. whatNotToClaim is derived from this brief's own facts. Rails (stablecoins/partners) and open RFPs are deliberately NOT bundled — call /api/stablecoins, /api/partners, /api/rfps when the demo needs them.",
			},
			report,
		},
		{ headers: rateLimitHeaders(limit) },
	);
}

export const POST = methodNotAllowed(["GET"]);
