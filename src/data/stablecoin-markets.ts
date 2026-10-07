/**
 * Curated liquidity venues per stablecoin, shown on /stablecoins/[assetId]
 * as "Markets". Keyed by `${code}-${issuer}` — a ticker alone is not an
 * identity. Every entry says how WE verified the pool holds this asset; a
 * link nobody verified does not belong here (the DEX indexers we read for
 * TVL do not cover every venue, so this list is hand-kept).
 */
export interface StablecoinMarket {
	venue: string;
	label: string;
	url: string;
	/** How we know — never "the operator said so". */
	verified: string;
	asOf: string;
}

export const STABLECOIN_MARKETS: Record<string, StablecoinMarket[]> = {
	"USDT0-GATISXX6BZ6NC7IKQBY37CJD4SOZL3CYZJWXEDG6JVIY4WBS6KXJHN6Q": [
		{
			venue: "Sushi",
			label: "USDT0 / USDC, 0.05% fee tier",
			url: "https://www.sushi.com/stellar/pool/CBVHBZSZOS6KRDJ4D44FU2YLIENOVSSLM3UGKW6XQMVIFUAMWIWCVH2U",
			verified:
				"pool contract storage read over Soroban RPC: token0 = the USDT0 SAC (CBSJZEIO…), token1 = the USDC SAC (CCW67TSZ…), fee 500 (0.05%), ~2.55M on each side",
			asOf: "2026-09-02",
		},
	],
};
