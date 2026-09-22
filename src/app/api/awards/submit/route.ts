/**
 * POST /api/awards/submit — verify a voter's authorization and relay their
 * ballot ANONYMOUSLY.
 *
 *   { "signedXdr": "AAAA...", "selections": { ... }, "round": "i3-2026" }
 *
 * THIS IS NOT AN OPEN RELAY. Before anything is written: the round is open;
 * the picks are a full, valid slate; the signed authorization's source is on
 * the whitelist; its signature verifies for a key that controls that account
 * over the TESTNET hash (a mainnet-signed payload structurally fails); its
 * memo commits to exactly these picks; it is unusable on-chain and unexpired;
 * and the address has not voted. Then the relay reserves the record row,
 * writes the ballot to its own account under a random id, and confirms the
 * row with the hash. The chain never learns the address.
 */

import { Memo, TransactionBuilder } from "@stellar/stellar-sdk";
import { type NextRequest, NextResponse } from "next/server";
import {
	BALLOT_FEE_PER_OP,
	ballotSourceOf,
	newBallotId,
	relayBallotOps,
	roundOpenState,
	TEST_BALLOT_MEMO,
	validateSelections,
	verifyAuthorization,
} from "@/lib/awards/ballot";
import {
	confirmBallot,
	hasMirroredBallot,
	releaseBallot,
	reserveBallot,
} from "@/lib/awards/record";
import { loadRound } from "@/lib/awards/round";
import {
	AWARDS_NETWORK_PASSPHRASE,
	fetchTestnetAccount,
	submitFromRelay,
	testnetExplorerTxUrl,
} from "@/lib/awards/stellar";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** One-op authorization is ~600 chars signed; anything huge is not one. */
const MAX_XDR_CHARS = 8_192;

export async function POST(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/awards/submit",
		// See ballot-xdr: one venue IP for the whole room. The whitelist and
		// the one-ballot gate are what actually bound this route.
		limit: 200,
		windowMs: 10 * 60 * 1000,
	});
	if (!limit.allowed) {
		return NextResponse.json(
			{ error: "rate limit exceeded" },
			{ status: 429, headers: rateLimitHeaders(limit) },
		);
	}

	let body: { signedXdr?: unknown; round?: unknown; selections?: unknown };
	try {
		body = await req.json();
	} catch {
		return NextResponse.json(
			{ error: "invalid JSON" },
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}
	const signedXdr = typeof body.signedXdr === "string" ? body.signedXdr : "";
	if (!signedXdr || signedXdr.length > MAX_XDR_CHARS) {
		return NextResponse.json(
			{ error: "provide the signed authorization as `signedXdr`" },
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

	// The account is read for its signer set and current sequence. 404 is
	// fine — an account with no footprint signs at sequence 1 and its only
	// signer is its master key. Only Horizon being down blocks.
	const claimedSource = ballotSourceOf(signedXdr);
	const account = claimedSource
		? await fetchTestnetAccount(claimedSource)
		: null;
	if (account?.funded === null) {
		return NextResponse.json(
			{
				error: "ballot_status_unavailable",
				message:
					"Could not reach testnet to check this account. Nothing was submitted — try again in a moment.",
			},
			{ status: 503, headers: rateLimitHeaders(limit) },
		);
	}
	const verdict = verifyAuthorization(signedXdr, {
		round: loaded.round,
		whitelist: loaded.whitelist,
		selections: validated.selections,
		sequence: account?.funded === true ? account.account.sequence : null,
		signers: account?.funded === true ? account.account.signers : undefined,
	});
	if (!verdict.ok) {
		return NextResponse.json(
			{ error: "authorization rejected", details: verdict.errors },
			{ status: 422, headers: rateLimitHeaders(limit) },
		);
	}

	// One ballot per voter, re-checked here, then RESERVED before the relay
	// writes — a gate checked now and written later is a race.
	const mirrored = await hasMirroredBallot(loaded.round.slug, verdict.source);
	if (mirrored === null) {
		return NextResponse.json(
			{
				error: "ballot_status_unavailable",
				message:
					"We can't confirm whether this address has already voted right now. Nothing was submitted — try again in a moment.",
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
	const ballotId = newBallotId();
	const reserved = await reserveBallot({
		roundSlug: loaded.round.slug,
		address: verdict.source,
		ballotId,
		selections: validated.selections,
	});
	if (!reserved.ok) {
		const dup = reserved.reason === "already_voted";
		return NextResponse.json(
			{
				error: dup ? "already_voted" : "ballot_status_unavailable",
				message: dup
					? "This address has already cast its ballot for this round."
					: `Could not record the ballot (${reserved.reason}). Nothing was submitted — try again in a moment.`,
			},
			{ status: dup ? 409 : 503, headers: rateLimitHeaders(limit) },
		);
	}

	const result = await submitFromRelay((relay) => {
		const b = new TransactionBuilder(relay, {
			fee: BALLOT_FEE_PER_OP,
			networkPassphrase: AWARDS_NETWORK_PASSPHRASE,
			// a test round's ballots self-identify on the relay, as before
			...(loaded.round.testMode ? { memo: Memo.text(TEST_BALLOT_MEMO) } : {}),
		});
		for (const op of relayBallotOps(
			loaded.round,
			ballotId,
			validated.selections,
		)) {
			b.addOperation(op);
		}
		return b.setTimeout(120).build();
	});
	if (!result.ok) {
		await releaseBallot(reserved.id);
		const busy = result.resultCodes.includes("tx_bad_seq");
		return NextResponse.json(
			{
				error: busy ? "relay_busy" : "relay_failed",
				message: busy
					? "The relay is busy — try again in a few seconds. Nothing was recorded."
					: `The relay could not write the ballot: ${result.error}. Nothing was recorded.`,
				resultCodes: result.resultCodes,
			},
			{ status: busy ? 409 : 502, headers: rateLimitHeaders(limit) },
		);
	}
	await confirmBallot(reserved.id, result.hash);

	return NextResponse.json(
		{
			ballotId,
			hash: result.hash,
			explorerUrl: testnetExplorerTxUrl(result.hash),
			round: loaded.round.slug,
			selections: validated.selections,
			closesAt: loaded.round.closesAt ?? null,
			note: "This is your ballot for the round. It was written anonymously by the relay under the id above; nothing on chain links it to your address. The first ballot cast is the one that counts.",
		},
		{ headers: rateLimitHeaders(limit) },
	);
}

export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
