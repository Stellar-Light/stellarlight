/**
 * DeFi context for one stablecoin: its Soroban asset contract, whether Blend
 * lists it, and how much AMM liquidity it has.
 *
 * Three sources with very different reliability, so each is reported
 * separately and an outage in one never blanks the others:
 *
 *   contract   derived locally from (code, issuer) — deterministic, no network
 *   blend      a committed pool registry — a link and a pool name, no fetch
 *   liquidity  Horizon's own liquidity-pool index — first-party and keyless,
 *              so it does not vanish the way a third-party pool index can
 *
 * `liquidity: null` therefore means NOT KNOWN, never "no liquidity". The
 * difference matters: telling someone an asset has no pools when the pool
 * index was simply unreachable is the same class of lie as a missing row
 * reading as a delisting.
 */

import { Asset, Networks } from "@stellar/stellar-sdk";

/**
 * The Stellar Asset Contract id for a classic asset. Deterministic — derived
 * from (code, issuer) and the network passphrase, so it needs no lookup and
 * is correct even for an asset nobody has wrapped yet.
 */
export function sacContractId(code: string, issuer: string): string | null {
	try {
		return new Asset(code, issuer).contractId(Networks.PUBLIC);
	} catch {
		return null;
	}
}

interface BlendPool {
	poolId: string;
	name: string;
	assets: Record<string, string>;
}

/**
 * Blend's mainnet pools and the asset contracts they list, carried over from
 * the explorer. Committed rather than discovered: it is a short, slow-moving
 * list, and a wrong "Blend supports this" is worse than a missing one.
 */
const BLEND_POOLS: BlendPool[] = [
	{
		poolId: "CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS",
		name: "YieldBlox Pool",
		assets: {
			USDC: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
			EURC: "CCLZD7VBOC2URNA27BVJPB35F2MHTFDWBMV3HP3EIJVLUXM3UJKZL3VV",
			PYUSD: "CCCRWH6Q3FNP3I2I57BDLM5AFAT7O6OF6GKQOC6SSJNDAVRZ57SPHGU2",
			USDGLO: "CB226ZOEYXTBPD3QEGABTJYSKZVBP2PASEISLG3SBMTN5CE4QZUVZ3CE",
		},
	},
];

export interface BlendListing {
	poolName: string;
	poolUrl: string;
	/** Percent, e.g. 4.31. Null = the pool state could not be read, NOT 0%. */
	supplyAPY: number | null;
	borrowAPY: number | null;
}

/** The pool that lists a ticker, plus that ticker's reserve contract. */
function poolFor(ticker: string) {
	for (const pool of BLEND_POOLS) {
		const assetId = pool.assets[ticker];
		if (assetId) return { pool, assetId };
	}
	return null;
}

/** Daily compounding, the convention Blend's own UI quotes. */
function aprToApy(apr: number): number {
	return (1 + apr / 365) ** 365 - 1;
}

/**
 * Blend's listing for a ticker, or null when no pool lists it.
 *
 * Reads live reserve state over Soroban RPC. The rates are the part that can
 * fail — an RPC hiccup leaves them null while the pool name and link still
 * render, because "Blend lists this asset" stays true regardless. A null rate
 * is never rendered as 0%: "we could not read the pool" and "this pool pays
 * nothing" are opposite claims.
 */
export async function blendListing(
	ticker: string,
): Promise<BlendListing | null> {
	const match = poolFor(ticker);
	if (!match) return null;
	const { pool, assetId } = match;

	const listing: BlendListing = {
		poolName: pool.name,
		poolUrl: `https://blend.xlm.sh/supply/?poolId=${pool.poolId}&assetId=${assetId}`,
		supplyAPY: null,
		borrowAPY: null,
	};

	try {
		const { PoolV2 } = await import("@blend-capital/blend-sdk");
		const loaded = await PoolV2.load(
			{
				rpc: "https://mainnet.sorobanrpc.com",
				passphrase: "Public Global Stellar Network ; September 2015",
				opts: undefined,
			},
			pool.poolId,
		);
		const reserve = loaded.reserves.get(assetId) as
			| {
					estSupplyApy?: number;
					estBorrowApy?: number;
					supplyApr?: number;
					borrowApr?: number;
			  }
			| undefined;
		if (!reserve) return listing;

		// The SDK exposes an estimated APY directly on newer pools; older ones
		// only carry an APR, which has to be compounded before it is an APY.
		if (reserve.estSupplyApy !== undefined)
			listing.supplyAPY = Number(reserve.estSupplyApy) * 100;
		else if (reserve.supplyApr !== undefined)
			listing.supplyAPY = aprToApy(Number(reserve.supplyApr)) * 100;

		if (reserve.estBorrowApy !== undefined)
			listing.borrowAPY = Number(reserve.estBorrowApy) * 100;
		else if (reserve.borrowApr !== undefined)
			listing.borrowAPY = aprToApy(Number(reserve.borrowApr)) * 100;

		// A NaN out of the SDK must not reach the wire looking like a rate.
		if (!Number.isFinite(listing.supplyAPY as number)) listing.supplyAPY = null;
		if (!Number.isFinite(listing.borrowAPY as number)) listing.borrowAPY = null;
	} catch {
		// Pool unreadable — the listing still stands, the rates stay null.
	}
	return listing;
}

export interface LiquiditySummary {
	/** Pools holding this asset. Capped — see `capped`. */
	poolCount: number;
	/** Units of THIS asset pooled across them (its own peg, not USD). */
	assetPooled: number;
	/** assetPooled × the asset's USD price. Null when we have no price. */
	assetPooledUSD: number | null;
	/** The largest pools, biggest asset-side first. */
	topPools: Array<{
		id: string;
		counterAsset: string;
		assetAmount: number;
		trustlines: number;
	}>;
	/** True when the asset is in more pools than one page could return. */
	capped: boolean;
}

const HORIZON = "https://horizon.stellar.org";

/** "CODE:ISSUER" → "CODE", and "native" → "XLM". */
function shortAsset(a: string): string {
	if (!a || a === "native") return "XLM";
	return a.split(":")[0];
}

/**
 * AMM liquidity from Horizon's own liquidity-pool index, filtered to pools
 * that hold this exact (code, issuer).
 *
 * WHAT THIS MEASURES, precisely: the amount of THIS asset sitting in Stellar
 * AMM pools, and that amount valued at this asset's own USD price. It is NOT
 * whole-pool TVL — the other side of each pool is some arbitrary token we
 * have no price for, and inventing one to double the figure would be a guess
 * presented as a measurement. Under-stating with a stated basis beats
 * over-stating with a hidden assumption.
 *
 * Horizon is first-party and keyless, so unlike a third-party pool index it
 * does not disappear. Null still means unreachable, never "no pools".
 */
export async function fetchLiquidity(
	code: string,
	issuer: string,
	priceUSD: number | null,
): Promise<LiquiditySummary | null> {
	const reserve = `${code}:${issuer}`;
	try {
		const res = await fetch(
			`${HORIZON}/liquidity_pools?reserves=${encodeURIComponent(reserve)}&limit=200`,
			{
				headers: { accept: "application/json" },
				signal: AbortSignal.timeout(12_000),
				next: { revalidate: 900 },
			},
		);
		if (!res.ok) return null;
		const body = await res.json();
		const records: Array<{
			id: string;
			total_trustlines?: string;
			reserves?: Array<{ asset: string; amount: string }>;
		}> = body?._embedded?.records ?? [];

		let assetPooled = 0;
		const pools: LiquiditySummary["topPools"] = [];
		for (const r of records) {
			const mine = r.reserves?.find((x) => x.asset === reserve);
			if (!mine) continue;
			const amount = Number.parseFloat(mine.amount);
			if (!Number.isFinite(amount)) continue;
			assetPooled += amount;
			const other = r.reserves?.find((x) => x.asset !== reserve);
			pools.push({
				id: r.id,
				counterAsset: shortAsset(other?.asset ?? ""),
				assetAmount: amount,
				trustlines: Number.parseInt(r.total_trustlines ?? "0", 10) || 0,
			});
		}
		pools.sort((a, b) => b.assetAmount - a.assetAmount);

		return {
			poolCount: pools.length,
			assetPooled,
			assetPooledUSD:
				priceUSD != null && Number.isFinite(priceUSD)
					? assetPooled * priceUSD
					: null,
			topPools: pools.slice(0, 5),
			capped: records.length >= 200,
		};
	} catch {
		return null;
	}
}

/** Where to go to trade or pool this asset. */
export function tradeLinks(code: string, issuer: string) {
	return [
		{
			name: "StellarX",
			url: `https://stellarx.com/amm/analytics/${code}-${issuer}`,
		},
		{
			name: "StellarTerm",
			url: `https://stellarterm.com/exchange/${code}-${issuer}/XLM-native`,
		},
		{ name: "Aqua", url: `https://aqua.network/pools?search=${code}` },
		{ name: "Soroswap", url: "https://app.soroswap.finance/pools" },
	];
}
