/**
 * Vet-idea — the "I want to build X on Stellar" composite.
 *
 *   GET /api/vet-idea?q=cross-border%20payments%20app
 *
 * One call joining competitors (repos + active directory projects), their
 * maturity from verified evidence (audit registry, live on-chain usage),
 * hackathon prior art from our own corpus (dead prior art is a signal),
 * the vertical's supply-side gap verdict, and SCF funding presence. No
 * verdict synthesis — every block carries its basis, and the consumer
 * weighs crowded-vs-absent against their own thesis.
 *
 * Unknown query params 400 (never silently ignored).
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getAppUrl } from "@/lib/utils/app-url";
import { buildVetIdea } from "@/lib/vet-idea";

export const dynamic = "force-dynamic";

const VALID_PARAMS = ["q"];

export async function GET(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/vet-idea",
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

	const report = await buildVetIdea(payload, q);

	logApiHit({ req, endpoint: "/api/vet-idea", query: q, filters: {} });

	return NextResponse.json(
		{
			meta: {
				source: `${getAppUrl()}/api/vet-idea`,
				generatedAt: new Date().toISOString(),
				note: "Evidence-grounded composite; every block carries its basis. gap is SUPPLY-side coverage (a gap is not demand); maturity absence means no evidence on record, not a negative claim; priorArt covers judged-hackathon repos in our index (builds without surviving repos live on /api/hackathons/builds). vertical=null means the idea doesn't map onto the measurable vertical axis, not that no market exists.",
			},
			report,
		},
		{ headers: rateLimitHeaders(limit) },
	);
}

export const POST = methodNotAllowed(["GET"]);
