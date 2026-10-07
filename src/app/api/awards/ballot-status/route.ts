/**
 * POST /api/awards/ballot-status
 *
 * "Have I voted, and what did I pick?", answered only to the address owner.
 *
 * The page keeps a receipt in the browser that cast the ballot; on any other
 * browser it has nothing, and /api/awards/eligibility deliberately refuses
 * the unsigned question (it would be a participation oracle for the whole
 * electorate). This route answers it behind a signature: connecting a wallet
 * hands the page an address, which anyone could type in; a signed status
 * check proves the asker controls it.
 *
 * Two calls, same shape as the ballot:
 *   { address, round }    → the status transaction to sign (unsubmittable,
 *                           ten minutes, memo commits to the round only)
 *   { signedXdr, round }  → { voted, selections, ballotId, txHash }
 *
 * Nothing is written and nothing is logged.
 */

import { StrKey } from "@stellar/stellar-sdk";
import { type NextRequest, NextResponse } from "next/server";
import {
	ballotSourceOf,
	buildStatusTx,
	verifyStatusCheck,
} from "@/lib/awards/ballot";
import { readFirstBallotFor } from "@/lib/awards/record";
import { loadRoundResult } from "@/lib/awards/round";
import {
	AWARDS_NETWORK_PASSPHRASE,
	fetchTestnetAccount,
} from "@/lib/awards/stellar";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_XDR_CHARS = 8_192;

export async function POST(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/awards/ballot-status",
		// one venue IP for the whole room, two calls per connect
		limit: 600,
		windowMs: 10 * 60 * 1000,
	});
	const headers = rateLimitHeaders(limit);
	if (!limit.allowed) {
		return NextResponse.json(
			{ error: "rate limit exceeded" },
			{ status: 429, headers },
		);
	}
	let body: { address?: unknown; signedXdr?: unknown; round?: unknown };
	try {
		body = await req.json();
	} catch {
		return NextResponse.json(
			{ error: "invalid JSON" },
			{ status: 400, headers },
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
			{ status: 503, headers: { ...headers, "Retry-After": "2" } },
		);
	}
	const loaded = read.loaded;
	if (!loaded) {
		return NextResponse.json(
			{ error: "no award round exists" },
			{ status: 404, headers },
		);
	}

	const signedXdr = typeof body.signedXdr === "string" ? body.signedXdr : "";
	if (!signedXdr) {
		// step 1: the transaction to sign
		const address = String(body.address ?? "")
			.trim()
			.toUpperCase();
		if (!StrKey.isValidEd25519PublicKey(address)) {
			return NextResponse.json(
				{ error: "provide a valid Stellar address" },
				{ status: 400, headers },
			);
		}
		if (!loaded.whitelist.has(address)) {
			return NextResponse.json(
				{ error: "this address is not on the voter whitelist for this round" },
				{ status: 403, headers },
			);
		}
		const account = await fetchTestnetAccount(address);
		if (account.funded === null) {
			return NextResponse.json(
				{ error: `could not reach testnet Horizon: ${account.error}` },
				{ status: 502, headers },
			);
		}
		const tx = buildStatusTx({
			round: loaded.round,
			address,
			sequence: account.funded ? account.account.sequence : null,
		});
		return NextResponse.json(
			{
				xdr: tx.toXDR(),
				networkPassphrase: AWARDS_NETWORK_PASSPHRASE,
				round: loaded.round.slug,
				note: "This signature only proves you own this address, so the page can show you your own ballot. It is not a transaction and never touches your account.",
			},
			{ headers },
		);
	}

	// step 2: the signed check
	if (signedXdr.length > MAX_XDR_CHARS) {
		return NextResponse.json(
			{ error: "status check is too large" },
			{ status: 400, headers },
		);
	}
	const claimedSource = ballotSourceOf(signedXdr);
	const account = claimedSource
		? await fetchTestnetAccount(claimedSource)
		: null;
	if (account && account.funded === null) {
		return NextResponse.json(
			{ error: `could not reach testnet Horizon: ${account.error}` },
			{ status: 502, headers },
		);
	}
	const verdict = verifyStatusCheck(signedXdr, {
		round: loaded.round,
		whitelist: loaded.whitelist,
		sequence: account?.funded === true ? account.account.sequence : null,
		signers: account?.funded === true ? account.account.signers : undefined,
	});
	if (!verdict.ok) {
		return NextResponse.json(
			{ error: "status check rejected", details: verdict.errors },
			{ status: 422, headers },
		);
	}
	const first = await readFirstBallotFor(loaded.round.slug, verdict.source);
	if (first === null) {
		return NextResponse.json(
			{
				error: "ballot_status_unavailable",
				message:
					"We can't read your ballot status right now. Try again in a moment.",
			},
			{ status: 503, headers: { ...headers, "Retry-After": "2" } },
		);
	}
	return NextResponse.json(
		first.voted
			? {
					voted: true,
					selections: first.selections,
					ballotId: first.ballotId,
					txHash: first.txHash,
				}
			: { voted: false },
		{ headers },
	);
}

export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
