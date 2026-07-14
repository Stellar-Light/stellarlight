/**
 * GET /api/awards/round[?round=<slug>] — current i³ Awards round + nominees.
 *
 * Backend for the hidden /awards page (NOT part of the public Scout data
 * API: deliberately absent from the OpenAPI spec, /api/status.endpoints
 * and next.config publicApi[]). Returns the open round by default, or a
 * specific round by slug so closed rounds still render their state.
 *
 * The voter whitelist is loaded server-side but never serialized here.
 */

import { type NextRequest, NextResponse } from "next/server";
import { roundOpenState } from "@/lib/awards/ballot";
import { loadRound, toPublicRound } from "@/lib/awards/round";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/awards/round",
		limit: 120,
		windowMs: 5 * 60 * 1000,
	});
	if (!limit.allowed) {
		return NextResponse.json(
			{ error: "rate limit exceeded" },
			{ status: 429, headers: rateLimitHeaders(limit) },
		);
	}

	const slug = req.nextUrl.searchParams.get("round");
	const loaded = await loadRound(slug);
	if (!loaded) {
		return NextResponse.json(
			{ round: null, nominees: [], note: "no award round exists yet" },
			{ headers: rateLimitHeaders(limit) },
		);
	}
	const openState = roundOpenState(loaded.round);
	return NextResponse.json(
		{
			...toPublicRound(loaded),
			voting: { open: openState.open, reason: openState.reason },
			network: "testnet",
		},
		{ headers: rateLimitHeaders(limit) },
	);
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
