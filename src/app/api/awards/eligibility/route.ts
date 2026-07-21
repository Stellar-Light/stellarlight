/**
 * GET /api/awards/eligibility?address=G...[&round=<slug>]
 *
 * Called when a wallet connects on /awards: is this address on the round's
 * whitelist, is the testnet account funded, and what has it already voted
 * for (so a returning voter sees their current ballot pre-selected —
 * "you can change your vote until closesAt" needs the current vote).
 *
 * Only the QUERIED address's own votes are returned — the same data anyone
 * can read from public testnet Horizon for that account. The aggregate
 * results endpoint never exposes address→choice; this one requires you to
 * name the address you're asking about.
 */

import { StrKey } from "@stellar/stellar-sdk";
import { type NextRequest, NextResponse } from "next/server";
import { decodeAccountVotes, roundOpenState } from "@/lib/awards/ballot";
import { loadRound } from "@/lib/awards/round";
import { fetchTestnetAccount, friendbotFundUrl } from "@/lib/awards/stellar";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/awards/eligibility",
		limit: 60,
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
			{ error: "provide a valid Stellar address (?address=G...)" },
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	const loaded = await loadRound(req.nextUrl.searchParams.get("round"));
	if (!loaded) {
		return NextResponse.json(
			{ error: "no award round exists" },
			{ status: 404, headers: rateLimitHeaders(limit) },
		);
	}

	const whitelisted = loaded.whitelist.has(address);
	if (!whitelisted) {
		// Not on the list → read-only mode. No Horizon lookup needed.
		return NextResponse.json(
			{
				round: loaded.round.slug,
				whitelisted: false,
				funded: null,
				votes: null,
				voting: roundOpenState(loaded.round),
			},
			{ headers: rateLimitHeaders(limit) },
		);
	}

	const result = await fetchTestnetAccount(address);
	if (result.funded === null) {
		return NextResponse.json(
			{ error: `could not reach testnet Horizon: ${result.error}` },
			{ status: 502, headers: rateLimitHeaders(limit) },
		);
	}
	if (result.funded === false) {
		return NextResponse.json(
			{
				round: loaded.round.slug,
				whitelisted: true,
				funded: false,
				votes: null,
				voting: roundOpenState(loaded.round),
				friendbot: friendbotFundUrl(address),
				note: "This testnet account isn't funded yet — hit friendbot, then vote.",
			},
			{ headers: rateLimitHeaders(limit) },
		);
	}

	const votes = decodeAccountVotes(
		loaded.round,
		loaded.nominees,
		result.account.data,
	);
	return NextResponse.json(
		{
			round: loaded.round.slug,
			whitelisted: true,
			funded: true,
			votes: Object.keys(votes).length > 0 ? votes : null,
			voting: roundOpenState(loaded.round),
		},
		{ headers: rateLimitHeaders(limit) },
	);
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
