/**
 * GET /api/awards/eligibility?address=G...[&round=<slug>]
 *
 * Is this address on the round's voter list, and is voting open? Nothing
 * else. This endpoint is unauthenticated and the ballot is anonymous, so it
 * must never answer "has this address voted" or "what did it vote", it used
 * to do both, which made it a participation-and-choice oracle for the whole
 * electorate. Whether an address has voted is learned only behind the
 * owner's signature: /api/awards/ballot-status answers a signed check, and
 * /api/awards/submit answers already_voted; the page locks on either.
 *
 * No funding here any more either. Ballots are written by the relay, which
 * pays; a voter's account never needs to exist on-chain.
 *
 * Membership itself is public information (the list derives from the public
 * SCF voting contract), so answering it is not a leak.
 */

import { StrKey } from "@stellar/stellar-sdk";
import { type NextRequest, NextResponse } from "next/server";
import { roundOpenState } from "@/lib/awards/ballot";
import { loadRoundResult } from "@/lib/awards/round";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/awards/eligibility",
		// Per-IP, and the whole room shares one NAT at the venue: see ballot-xdr.
		limit: 300,
		windowMs: 5 * 60 * 1000,
	});
	if (!limit.allowed) {
		return NextResponse.json(
			{ error: "rate limit exceeded" },
			{ status: 429, headers: rateLimitHeaders(limit) },
		);
	}
	const address = (req.nextUrl.searchParams.get("address") ?? "")
		.trim()
		.toUpperCase();
	if (!StrKey.isValidEd25519PublicKey(address)) {
		return NextResponse.json(
			{ error: "provide a valid Stellar address as ?address=" },
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}
	const read = await loadRoundResult(req.nextUrl.searchParams.get("round"));
	if (!read.ok) {
		return NextResponse.json(
			{
				error: "round_unavailable",
				message:
					"The round could not be read right now. Nothing was changed. Try again in a moment.",
			},
			{ status: 503, headers: rateLimitHeaders(limit) },
		);
	}
	const loaded = read.loaded;
	if (!loaded) {
		return NextResponse.json(
			{ error: "no award round exists" },
			{ status: 404, headers: rateLimitHeaders(limit) },
		);
	}
	return NextResponse.json(
		{
			round: loaded.round.slug,
			whitelisted: loaded.whitelist.has(address),
			voting: roundOpenState(loaded.round),
		},
		{ headers: rateLimitHeaders(limit) },
	);
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
