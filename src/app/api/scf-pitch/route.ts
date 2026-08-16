/**
 * SCF-pitch — the "help me prep a Stellar Community Fund pitch" composite.
 *
 *   GET /api/scf-pitch?q=lending%20protocol%20for%20rwas
 *
 * Joins the LIVE round state (open submissions + deadline), the vertical's
 * already-funded peers with recorded award totals, the vet-idea view
 * (competitors, supply-side gap, prior art), and deterministic pitch angles
 * that each name the fact they stand on. No prose generation. Unknown query
 * params 400 (never silently ignored).
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { getAppUrl } from "@/lib/utils/app-url";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { buildScfPitch } from "@/lib/scf-pitch";

export const dynamic = "force-dynamic";

const VALID_PARAMS = ["q"];

export async function GET(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/scf-pitch",
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

	const report = await buildScfPitch(payload, q);

	logApiHit({ req, endpoint: "/api/scf-pitch", query: q, filters: {} });

	return NextResponse.json(
		{
			meta: {
				source: `${getAppUrl()}/api/scf-pitch`,
				generatedAt: new Date().toISOString(),
				note: "Evidence-grounded pitch prep; every block carries its basis. round never asserts a negative on fetch failure (source: unavailable = verify yourself). fundedPeers/fundingBar are recorded SCF awards on ACTIVE directory projects — absence of a record is not proof of no award. angles are deterministic derivations from the served facts, not judgments.",
			},
			report,
		},
		{ headers: rateLimitHeaders(limit) },
	);
}

export const POST = methodNotAllowed(["GET"]);
