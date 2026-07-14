/**
 * POST /api/awards/submit — validate a signed ballot and relay it to
 * TESTNET Horizon.
 *
 *   { "signedXdr": "AAAA..." }
 *
 * THIS IS NOT AN OPEN RELAY. validateSignedBallot re-checks everything
 * server-side before a byte reaches Horizon: manageData-only operations
 * under this round's exact `i3.<round>.` key prefix, source account on the
 * voter whitelist, round open, one vote per category, every value a real
 * nominee, no memo, and a source signature that verifies over the
 * TESTNET-passphrase hash (structurally refusing mainnet-signed payloads).
 * Anything else is rejected with the reasons.
 */

import { type NextRequest, NextResponse } from "next/server";
import { validateSignedBallot } from "@/lib/awards/ballot";
import { loadRound } from "@/lib/awards/round";
import {
	submitToTestnetHorizon,
	testnetExplorerTxUrl,
} from "@/lib/awards/stellar";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** A 3-op manageData tx is ~1KB signed; anything huge is not a ballot. */
const MAX_XDR_CHARS = 8_192;

export async function POST(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/awards/submit",
		limit: 15,
		windowMs: 10 * 60 * 1000,
	});
	if (!limit.allowed) {
		return NextResponse.json(
			{ error: "rate limit exceeded" },
			{ status: 429, headers: rateLimitHeaders(limit) },
		);
	}

	let body: { signedXdr?: unknown; round?: unknown };
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
			{ error: "provide the signed ballot as `signedXdr`" },
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

	const verdict = validateSignedBallot(signedXdr, {
		round: loaded.round,
		nominees: loaded.nominees,
		whitelist: loaded.whitelist,
	});
	if (!verdict.ok) {
		return NextResponse.json(
			{ error: "ballot rejected", details: verdict.errors },
			{ status: 422, headers: rateLimitHeaders(limit) },
		);
	}

	const result = await submitToTestnetHorizon(signedXdr);
	if (!result.ok) {
		// Friendlier mapping for the errors a real voter can hit.
		const seqStale = result.resultCodes.includes("tx_bad_seq");
		const underfunded = result.resultCodes.includes("tx_insufficient_balance");
		return NextResponse.json(
			{
				error: seqStale
					? "ballot expired or out of date — request a fresh one and sign again"
					: underfunded
						? "the voting account doesn't have enough testnet XLM — fund it via friendbot and retry"
						: "testnet Horizon rejected the transaction",
				resultCodes: result.resultCodes,
				detail: result.detail,
			},
			{ status: seqStale || underfunded ? 409 : 502 },
		);
	}

	return NextResponse.json(
		{
			hash: result.hash,
			explorerUrl: testnetExplorerTxUrl(result.hash),
			round: loaded.round.slug,
			selections: verdict.selections,
			closesAt: loaded.round.closesAt ?? null,
			note: "You can change your vote any time before the round closes — just submit a new ballot.",
		},
		{ headers: rateLimitHeaders(limit) },
	);
}

export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
