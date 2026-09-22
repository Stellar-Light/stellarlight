/**
 * POST /api/awards/ballot-xdr — build the voter's AUTHORIZATION.
 *
 *   { "address": "G...", "selections": { "impact": "decaf", ... },
 *     "round": "i3-2026-test" (optional — defaults to the open round) }
 *
 * Ballots are anonymous: they are written to a relay account under a random
 * id, never to the voter's own account. So what the voter signs is not a
 * ballot transaction but an authorization — a transaction that can never be
 * submitted (its sequence is already consumed, and it expires in ten minutes)
 * whose memo commits to exactly these picks. The relay verifies that
 * signature at /api/awards/submit and does the writing itself.
 *
 * Validates round-open + whitelist + selections (a full slate in every
 * category, every nominee real), reads the voter's current sequence from
 * Horizon if the account exists — an unfunded account is fine, it signs at
 * sequence 1 — and returns the unsigned XDR the wallet signs. No funding step
 * exists any more; the relay pays.
 */

import { StrKey } from "@stellar/stellar-sdk";
import { type NextRequest, NextResponse } from "next/server";
import {
	buildAuthorizationTx,
	roundOpenState,
	validateSelections,
} from "@/lib/awards/ballot";
import { hasMirroredBallot } from "@/lib/awards/record";
import { loadRound } from "@/lib/awards/round";
import {
	AWARDS_NETWORK_PASSPHRASE,
	fetchTestnetAccount,
} from "@/lib/awards/stellar";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/awards/ballot-xdr",
		// Per-IP, and Pilots vote from shared laptops at the venue — that is ONE
		// NAT egress IP for the whole room. At 30 the 31st person in ten minutes
		// is told "rate limit exceeded" and simply cannot vote. The real controls
		// here are the whitelist and one-ballot-per-voter (a round has ~98
		// eligible addresses, each able to vote once), so this only needs to stop
		// floods, not meter a queue.
		limit: 300,
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

	// The voter's current sequence, if the account exists. 404 is not a
	// problem any more: an account with no on-chain footprint signs at
	// sequence 1, which is just as unsubmittable. Only Horizon being down is.
	const account = await fetchTestnetAccount(address);
	if (account.funded === null) {
		return NextResponse.json(
			{ error: `could not reach testnet Horizon: ${account.error}` },
			{ status: 502, headers: rateLimitHeaders(limit) },
		);
	}

	// ── one ballot per voter ──
	// The record is the only place a ballot meets an address now (the chain
	// shows ballots by id), so it is the gate — and the relay reserves the row
	// BEFORE it writes, so two attempts cannot both get past this.
	const mirrored = await hasMirroredBallot(loaded.round.slug, address);
	if (mirrored === null) {
		// Trinary: null is "could not check", never "no".
		return NextResponse.json(
			{
				error: "ballot_status_unavailable",
				message:
					"We can't confirm whether this address has already voted right now. Nothing was signed — try again in a moment.",
			},
			{ status: 503, headers: rateLimitHeaders(limit) },
		);
	}
	if (mirrored) {
		return NextResponse.json(
			{
				error: "already_voted",
				message:
					"This address has already cast its ballot for this round. The first ballot is the one that counts, so it can't be replaced.",
			},
			{ status: 409, headers: rateLimitHeaders(limit) },
		);
	}

	const tx = buildAuthorizationTx({
		round: loaded.round,
		address,
		sequence: account.funded ? account.account.sequence : null,
		selections: validated.selections,
	});

	return NextResponse.json(
		{
			xdr: tx.toXDR(),
			networkPassphrase: AWARDS_NETWORK_PASSPHRASE,
			round: loaded.round.slug,
			selections: validated.selections,
			expiresInSeconds: 600,
			// what the wallet will show: one self-describing op, nothing on-chain
			note: "This signature authorizes your ballot. It is not a transaction you pay for and it never touches your account; the relay writes the ballot anonymously.",
		},
		{ headers: rateLimitHeaders(limit) },
	);
}

export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
