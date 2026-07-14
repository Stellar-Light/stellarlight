/**
 * POST /api/awards/ballot-xdr — build the unsigned TESTNET ballot.
 *
 *   { "address": "G...", "selections": { "impact": "decaf", ... },
 *     "round": "i3-2026-test" (optional — defaults to the open round) }
 *
 * Validates round-open + whitelist + selections (one nominee per category,
 * every nominee real), pulls the voter's current sequence from testnet
 * Horizon, and returns the unsigned XDR the wallet signs. The transaction
 * is a plain (fee-bump-friendly) tx of manageData ops only — see
 * src/lib/awards/ballot.ts for the encoding.
 *
 * Unfunded testnet account → 409 with a friendbot link so the UI can offer
 * a one-tap "fund on testnet" (test mode only — this whole feature is
 * hardwired to testnet).
 */

import { StrKey } from "@stellar/stellar-sdk";
import { type NextRequest, NextResponse } from "next/server";
import {
	buildBallotTx,
	roundOpenState,
	validateSelections,
} from "@/lib/awards/ballot";
import { loadRound } from "@/lib/awards/round";
import {
	AWARDS_NETWORK_PASSPHRASE,
	fetchTestnetAccount,
	friendbotFundUrl,
} from "@/lib/awards/stellar";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/awards/ballot-xdr",
		limit: 30,
		windowMs: 10 * 60 * 1000,
	});
	if (!limit.allowed) {
		return NextResponse.json(
			{ error: "rate limit exceeded" },
			{ status: 429, headers: rateLimitHeaders(limit) },
		);
	}

	let body: {
		address?: unknown;
		selections?: unknown;
		round?: unknown;
	};
	try {
		body = await req.json();
	} catch {
		return NextResponse.json(
			{ error: "invalid JSON" },
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	const address = String(body.address ?? "")
		.trim()
		.toUpperCase();
	if (!StrKey.isValidEd25519PublicKey(address)) {
		return NextResponse.json(
			{ error: "provide a valid Stellar address" },
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	const loaded = await loadRound(
		typeof body.round === "string" ? body.round : null,
	);
	if (!loaded) {
		return NextResponse.json(
			{ error: "no award round exists" },
			{ status: 404, headers: rateLimitHeaders(limit) },
		);
	}

	const openState = roundOpenState(loaded.round);
	if (!openState.open) {
		return NextResponse.json(
			{ error: `voting is not open: ${openState.reason}` },
			{ status: 409, headers: rateLimitHeaders(limit) },
		);
	}

	if (!loaded.whitelist.has(address)) {
		return NextResponse.json(
			{ error: "this address is not on the voter whitelist for this round" },
			{ status: 403, headers: rateLimitHeaders(limit) },
		);
	}

	const validated = validateSelections(
		loaded.round,
		loaded.nominees,
		body.selections,
	);
	if (!validated.ok) {
		return NextResponse.json(
			{ error: "invalid selections", details: validated.errors },
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	const account = await fetchTestnetAccount(address);
	if (account.funded === null) {
		return NextResponse.json(
			{ error: `could not reach testnet Horizon: ${account.error}` },
			{ status: 502, headers: rateLimitHeaders(limit) },
		);
	}
	if (account.funded === false) {
		return NextResponse.json(
			{
				error: "account_unfunded",
				message:
					"This testnet account has no on-chain footprint yet. Fund it via friendbot, then request the ballot again.",
				friendbot: friendbotFundUrl(address),
			},
			{ status: 409, headers: rateLimitHeaders(limit) },
		);
	}

	const tx = buildBallotTx({
		round: loaded.round,
		address,
		sequence: account.account.sequence,
		selections: validated.selections,
	});

	return NextResponse.json(
		{
			xdr: tx.toXDR(),
			networkPassphrase: AWARDS_NETWORK_PASSPHRASE,
			round: loaded.round.slug,
			selections: validated.selections,
			expiresInSeconds: 300,
		},
		{ headers: rateLimitHeaders(limit) },
	);
}

export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
