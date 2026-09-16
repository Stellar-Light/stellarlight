/**
 * GET /api/awards/eligibility?address=G...[&round=<slug>]
 *
 * Called when a wallet connects on /awards: is this address on the round's
 * whitelist, is the testnet account funded, and has it already voted (and for
 * what, so a returning voter sees their ballot rather than an empty form).
 *
 * `hasVoted` is the union of chain and mirror, and it is what locks the form:
 * one ballot per voter, the first one counts. It stays true after a testnet
 * reset has wiped `votes` — the mirror still holds the ballot, so offering a
 * fresh vote would be offering one that doesn't count. `null` means we could
 * not check; the UI treats that as "can't vote right now", not "go ahead".
 *
 * A whitelisted address that is NOT funded gets funded here, server-side,
 * through friendbot — the voter's experience is connect → sign, and "fund on
 * testnet" is not a step they should have to know about. Only whitelisted
 * addresses are ever funded (the list gates it, not the caller). If friendbot
 * fails the old path remains: `funded:false` + a friendbot link the UI turns
 * into a one-tap button.
 *
 * Only the QUERIED address's own votes are returned — the same data anyone
 * can read from public testnet Horizon for that account. The aggregate
 * results endpoint never exposes address→choice; this one requires you to
 * name the address you're asking about.
 */

import { StrKey } from "@stellar/stellar-sdk";
import { type NextRequest, NextResponse } from "next/server";
import { decodeAccountVotes, roundOpenState } from "@/lib/awards/ballot";
import { hasMirroredBallot } from "@/lib/awards/record";
import { loadRound } from "@/lib/awards/round";
import {
	fetchTestnetAccount,
	friendbotFundUrl,
	fundViaFriendbot,
} from "@/lib/awards/stellar";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// One friendbot attempt per address per minute per instance: a failing
// friendbot (rate limit, outage) must not turn every reconnect into a 20s
// wait. The manual button stays available in between.
const FUND_RETRY_MS = 60_000;
const fundAttempts = new Map<string, number>();

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

	let result = await fetchTestnetAccount(address);
	if (
		result.funded === false &&
		Date.now() - (fundAttempts.get(address) ?? 0) > FUND_RETRY_MS
	) {
		fundAttempts.set(address, Date.now());
		const fund = await fundViaFriendbot(address);
		if (fund.ok) {
			result = await fetchTestnetAccount(address);
			if (result.funded === false) {
				// Horizon can trail friendbot by a ledger.
				await new Promise((r) => setTimeout(r, 2500));
				result = await fetchTestnetAccount(address);
			}
		}
	}
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
				hasVoted: await hasMirroredBallot(loaded.round.slug, address),
				voting: roundOpenState(loaded.round),
				friendbot: friendbotFundUrl(address),
				note: "This testnet account couldn't be funded automatically — hit friendbot, then vote.",
			},
			{ headers: rateLimitHeaders(limit) },
		);
	}

	const votes = decodeAccountVotes(
		loaded.round,
		loaded.nominees,
		result.account.data,
	);
	const onChain = Object.values(votes).some((picks) => picks.length > 0);
	return NextResponse.json(
		{
			round: loaded.round.slug,
			whitelisted: true,
			funded: true,
			votes: onChain ? votes : null,
			// chain OR mirror — the mirror outlives a reset that clears `votes`
			hasVoted: onChain
				? true
				: await hasMirroredBallot(loaded.round.slug, address),
			voting: roundOpenState(loaded.round),
		},
		{ headers: rateLimitHeaders(limit) },
	);
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
