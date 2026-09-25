/**
 * POST /api/awards/submit, verify a voter's authorization and relay their
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
	readFirstBallotFor,
	releaseBallot,
	reserveBallot,
	settlePendingBallot,
} from "@/lib/awards/record";
import { loadRoundResult } from "@/lib/awards/round";
import {
	AWARDS_NETWORK_PASSPHRASE,
	fetchTestnetAccount,
	relayKeypair,
	submitFromRelay,
	testnetExplorerTxUrl,
} from "@/lib/awards/stellar";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
// The relay may wait on Horizon's 30s submission timeout and poll after it;
// the default function limit would cut that off with the reservation open.
export const maxDuration = 60;

/** One-op authorization is ~600 chars signed; anything huge is not one. */
const MAX_XDR_CHARS = 8_192;

export async function POST(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/awards/submit",
		// See ballot-xdr: one venue IP for the whole room. The whitelist and
		// the one-ballot gate are what actually bound this route. 600, not 200:
		// a relay_busy answer makes the page resubmit the same signed ballot up
		// to four times, so 76 Pilots in one ten-minute burst can be 300 calls.
		limit: 600,
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

	const read = await loadRoundResult(
		typeof body.round === "string" ? body.round : null,
	);
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
	// fine, an account with no footprint signs at sequence 1 and its only
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
					"Could not reach testnet to check this account. Nothing was submitted. Try again in a moment.",
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

	// One ballot per voter, checked here, behind the signature (this is the
	// ONLY place the server says already_voted: unsigned, that answer is a
	// participation oracle), then RESERVED before the relay writes, because a
	// gate checked now and written later is a race.
	const first = await readFirstBallotFor(loaded.round.slug, verdict.source);
	if (first === null) {
		return NextResponse.json(
			{
				error: "ballot_status_unavailable",
				message:
					"We can't confirm whether this address has already voted right now. Nothing was submitted. Try again in a moment.",
			},
			{ status: 503, headers: rateLimitHeaders(limit) },
		);
	}
	const alreadyVoted = () =>
		NextResponse.json(
			{
				error: "already_voted",
				message:
					"This address has already cast its ballot for this round. The first ballot is the one that counts, so it can't be replaced.",
			},
			{ status: 409, headers: rateLimitHeaders(limit) },
		);
	if (first.voted) return alreadyVoted();
	if (first.pending) {
		// A reservation the relay never confirmed: that earlier write is still
		// in flight, or landed and the confirmation was lost, or never happened.
		// Settle it against the relay now rather than lock the voter out until
		// the daily reconcile.
		const settled = await settlePendingBallot(
			loaded.round.slug,
			first.pending,
			relayKeypair()?.publicKey() ?? null,
		);
		if (settled === "confirmed") return alreadyVoted();
		if (settled !== "released") {
			return NextResponse.json(
				{
					error: "ballot_pending",
					message:
						settled === "in-flight"
							? "Your earlier ballot is still being written. Nothing to sign again. Wait a couple of minutes, then try once more."
							: "We can't tell yet whether your earlier ballot landed. Nothing was submitted. Try again in a few minutes.",
				},
				{
					status: settled === "in-flight" ? 409 : 503,
					headers: rateLimitHeaders(limit),
				},
			);
		}
		// released: the earlier write never landed and no longer can
	}
	const ballotId = newBallotId();
	const reserved = await reserveBallot({
		roundSlug: loaded.round.slug,
		address: verdict.source,
		ballotId,
		selections: validated.selections,
		authorization: signedXdr,
	});
	if (!reserved.ok) {
		const dup = reserved.reason === "already_voted";
		return NextResponse.json(
			{
				error: dup ? "already_voted" : "ballot_status_unavailable",
				message: dup
					? "This address has already cast its ballot for this round."
					: `Could not record the ballot (${reserved.reason}). Nothing was submitted. Try again in a moment.`,
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
		if (result.pending) {
			// Horizon took the transaction but did not see it land in time. It
			// may still land (until its 120s time bound), so the reservation
			// STAYS: releasing it here is exactly how one voter ends up with two
			// ballots. The voter's next attempt settles it against the relay.
			return NextResponse.json(
				{
					error: "ballot_pending",
					message:
						"Your ballot reached the network but was not confirmed in time. Do not sign again right away: wait three minutes and try once more. If it landed, the page will say so; if not, the retry goes through.",
				},
				{ status: 503, headers: rateLimitHeaders(limit) },
			);
		}
		await releaseBallot(reserved.id);
		// both mean "another ballot was being written at that moment": the
		// relay already retried; the voter can simply submit again
		const busy =
			result.resultCodes.includes("tx_bad_seq") ||
			result.resultCodes.includes("try_again_later");
		return NextResponse.json(
			{
				error: busy ? "relay_busy" : "relay_failed",
				message: busy
					? "The relay is busy. Try again in a few seconds; nothing was recorded."
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
