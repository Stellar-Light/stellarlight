/**
 * DeFi context for one stablecoin.
 *
 *   GET /api/stablecoins/defi?code=USDC&issuer=GA5Z…&price=1
 *
 * Three independent facts, each reported separately so an outage in one never
 * blanks the others:
 *   contract   the Soroban asset contract, derived locally from (code, issuer)
 *   blend      whether a Blend pool lists it, and where
 *   liquidity  AMM pools holding it, from Horizon's own index
 *
 * `liquidity: null` means the index was unreachable — NOT that the asset has
 * no pools. An agent must not turn "we could not look" into "there is none".
 */

import { type NextRequest, NextResponse } from "next/server";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import {
	blendListing,
	fetchLiquidity,
	sacContractId,
	tradeLinks,
} from "@/lib/stablecoin-defi";

export const dynamic = "force-dynamic";
export const revalidate = 900;

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const code = sp.get("code")?.trim();
	const issuer = sp.get("issuer")?.trim();
	if (!code || !issuer) {
		return NextResponse.json(
			{
				error:
					"Both `code` and `issuer` are required — a stablecoin's identity is (code, issuer), and two live assets can share a ticker.",
			},
			{ status: 400, headers: CORS },
		);
	}

	const priceRaw = sp.get("price");
	const price = priceRaw ? Number.parseFloat(priceRaw) : null;
	const priceUSD = price != null && Number.isFinite(price) ? price : null;

	// Independent sources — one being slow or down must not blank the other.
	const [liquidity, blend] = await Promise.all([
		fetchLiquidity(code, issuer, priceUSD),
		blendListing(code),
	]);

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/api/stablecoins/defi",
				generatedAt: new Date().toISOString(),
				asset: { code, issuer },
				methodology:
					"contract is the Stellar Asset Contract id derived deterministically from (code, issuer) on the public network — no lookup, correct even if nobody has wrapped the asset yet. blend is a committed pool registry — presence means a Blend pool lists the asset — with supply/borrow APY read live from the pool's reserve over Soroban RPC, as a percent (4.31 = 4.31%). A null APY means the pool state could not be read, NEVER that the rate is zero; the listing itself still stands. liquidity counts Stellar AMM pools holding this exact asset from Horizon's liquidity-pool index; `assetPooled` is units of THIS asset (its own peg) and `assetPooledUSD` values only that side — it is NOT whole-pool TVL, because the counter-asset of each pool has no price we measure. liquidity: null means Horizon was unreachable, NEVER that the asset has no pools.",
			},
			contract: sacContractId(code, issuer),
			blend,
			liquidity,
			tradeLinks: tradeLinks(code, issuer),
		},
		{
			headers: {
				...CORS,
				"Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
			},
		},
	);
}

export function OPTIONS() {
	return new NextResponse(null, {
		headers: { ...CORS, "Access-Control-Allow-Headers": "Content-Type" },
	});
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
