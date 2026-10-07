/**
 * Stablecoin row shaping + ranking for GET /api/stablecoins.
 *
 * Rows come from OUR OWN `stablecoins` collection, written every 6h by
 * scripts/refresh-stablecoins.ts. Until 2026-08-19 this module parsed
 * display-formatted strings ("$275.94M", "2,284,095") out of a Replit-hosted
 * sibling service; that host is being retired and the parser went with it.
 * Values now arrive as raw numbers, so the only shaping left is renaming
 * store fields to their public names.
 *
 * WHY ranking is by USD market cap (2026-07-21, boxy review of getLeaderboard
 * sort=supply): raw circulating supply is NOT comparable across pegs. GYEN
 * shows 100.87M supply but is YEN — ~$676K in USD; ARST 243M is Argentine
 * pesos — ~$243K. Ranking whole-asset units treated USD, JPY, and ARS as the
 * same unit, so "biggest stablecoin by supply" mis-ranked a yen coin above
 * real USD stablecoins AND missed USDY (Ondo, $467.5M — the actual largest).
 * marketCapUSD (supply × USD price) is the comparable metric; it is the
 * default order, and every row carries its `peg` so denomination is explicit.
 */

/** One row as our `stablecoins` collection stores it. */
export interface StoreRow {
	assetId?: string | null;
	code?: string | null;
	issuer?: string | null;
	name?: string | null;
	company?: string | null;
	domain?: string | null;
	website?: string | null;
	peg?: string | null;
	country?: string | null;
	assetType?: string | null;
	supply?: number | null;
	priceUSD?: number | null;
	priceBasis?: string | null;
	marketCapUSD?: number | null;
	holders?: number | null;
	volume24hUSD?: number | null;
	paymentsCount24h?: number | null;
	supplyChange7d?: number | null;
	logoUrl?: string | null;
	logoSource?: string | null;
	basis?: string | null;
	measuredAt?: string | null;
	note?: string | null;
	retiredAt?: string | null;
}

/** Our normalized, agent-facing row — raw numbers + explicit peg + provenance. */
export interface StablecoinRow {
	/** `CODE-<issuer[0:8]>` — the stable natural key. Identity is (code, issuer):
	 *  Circle's EURC and MyKobo's EURC share a ticker and are DIFFERENT assets. */
	assetId: string | null;
	ticker: string;
	name: string | null;
	/** Full mainnet issuer account (G…) — the universal join key. */
	issuer: string | null;
	issuerDomain: string | null;
	company: string | null;
	website: string | null;
	/** Fiat the asset tracks (USD, JPY, ARS, …). supply is in THIS unit; only
	 *  marketCapUSD is comparable across rows. */
	peg: string | null;
	country: string | null;
	/** Qualifier where the asset is not a pure peg (e.g. "Yield Stablecoin"). */
	assetType: string | null;
	/** Circulating supply in whole asset units of its OWN peg — NOT USD, NOT
	 *  comparable across pegs. Null = not measured, never zero. */
	supply: number | null;
	/** Circulating supply valued in USD (supply × USD price). THE comparable
	 *  ranking metric. Null if unpriced. */
	marketCapUSD: number | null;
	/** USD price of one unit. At the peg for a par-redeemable asset (≈1 for
	 *  USD, ≈0.0067 for JPY); the token's own market price where the unit is
	 *  not 1:1 with its peg. `priceBasis` says which. */
	priceUSD: number | null;
	/** How priceUSD was obtained — assumed-peg (peg FX, deviation NOT measured)
	 *  or measured-market (the unit's own price, for accrual/above-par units
	 *  like USDY). Null exactly when priceUSD is null. */
	priceBasis: PriceBasis | null;
	/** Trustline holder count. */
	holders: number | null;
	/** 24h on-chain TRADE volume in USD (SDEX) — falls back to a 7-day average
	 *  when the 24h figure is absent. NOT payment/transfer volume; see
	 *  paymentsCount24h for the payments-side signal we can actually measure. */
	volume24hUSD: number | null;
	/** Count (not a dollar amount) of payment operations in the last ~24h —
	 *  mint, redemption and peer-to-peer payments undifferentiated, and NOT
	 *  adjusted for CEX/DeFi/infrastructure activity. Stellar Expert's
	 *  lifetime payments counter, diffed against our own snapshot from ~1 day
	 *  back. Null until that history exists, same rule as supplyChange7d. */
	paymentsCount24h: number | null;
	/** Percent change in supply vs our snapshot ~7 days back. Null until two
	 *  snapshots exist — never 0 for "no data". Was a display string ("-5.80%")
	 *  while proxying the retired service; a number since 2026-08-19. */
	supplyChange7d: number | null;
	/** The issuer's own mark, when one resolves. Null = render your own
	 *  fallback (e.g. a peg flag) — absence here is not itself an error. */
	logoUrl: string | null;
	/** Provenance of `logoUrl`: toml = the issuer's own per-currency image;
	 *  toml-org = the same toml's org-level mark, used when no per-currency
	 *  image exists; fallback = a hand-curated override; country-flag = the
	 *  peg's flag is the intended mark, not a stand-in; none = nothing
	 *  resolved. Null only when logoUrl itself is null for a pre-migration
	 *  row. */
	logoSource: string | null;
	/** How these numbers were obtained. Never present curated-static or
	 *  unmeasured as a live measurement. */
	basis: "live" | "curated-static" | "unmeasured" | null;
	/** Why a row is unmeasured or static, in plain words. */
	note: string | null;
	/** True by construction: every issuer in the registry is hand-verified
	 *  against the issuer's own domain. It does NOT discriminate between rows
	 *  and is not a quality signal; retained for response-shape compatibility. */
	verified: boolean;
	/** When these figures were taken (ISO) — dated-metrics rule. Always cite it. */
	updatedAt: string | null;
}

export type StablecoinSort = "marketcap" | "supply" | "holders" | "volume";
export const STABLECOIN_SORTS: StablecoinSort[] = [
	"marketcap",
	"supply",
	"holders",
	"volume",
];

/**
 * How `priceUSD` was obtained.
 *
 * assumed-peg — the asset claims 1 unit = 1 unit of its peg and we priced the
 * peg (live FX). Right for a redemption-at-par stablecoin; peg deviation is
 * still not measured.
 * measured-market — the unit is NOT 1:1 with its peg (it accrues, or trades
 * above par), so the price is the token's own market price. Ondo's USDY was
 * $1.14 while we priced it at $1.00, understating it by ~$65M.
 */
export const PRICE_BASES = ["assumed-peg", "measured-market"] as const;
export type PriceBasis = (typeof PRICE_BASES)[number];

const BASES = new Set(["live", "curated-static", "unmeasured"]);
const PRICE_BASIS_SET = new Set<string>(PRICE_BASES);

/** A finite number, or null. Guards against a stored NaN reaching the wire. */
function num(v: unknown): number | null {
	return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Map one stored row onto the public shape. */
export function storeRowToApi(d: StoreRow): StablecoinRow {
	const basis = d.basis && BASES.has(d.basis) ? d.basis : null;
	const price = num(d.priceUSD);
	// priceBasis names how priceUSD was obtained, so it is null exactly when
	// there is no price to describe — a stored basis on a null price would
	// claim a measurement that never happened.
	const priceBasis =
		price != null && d.priceBasis && PRICE_BASIS_SET.has(d.priceBasis)
			? (d.priceBasis as PriceBasis)
			: null;
	return {
		assetId: d.assetId ?? null,
		ticker: d.code ?? "",
		name: d.name ?? null,
		issuer: d.issuer ?? null,
		issuerDomain: d.domain ?? null,
		company: d.company ?? null,
		website: d.website ?? null,
		peg: d.peg ?? null,
		country: d.country ?? null,
		assetType: d.assetType ?? null,
		supply: num(d.supply),
		marketCapUSD: num(d.marketCapUSD),
		priceUSD: price,
		priceBasis,
		holders: num(d.holders),
		volume24hUSD: num(d.volume24hUSD),
		paymentsCount24h: num(d.paymentsCount24h),
		supplyChange7d: num(d.supplyChange7d),
		logoUrl: d.logoUrl ?? null,
		logoSource: d.logoSource ?? null,
		basis: basis as StablecoinRow["basis"],
		note: d.note ?? null,
		verified: true,
		updatedAt: d.measuredAt ?? null,
	};
}

/** The numeric key a sort ranks on. */
function sortValue(r: StablecoinRow, sort: StablecoinSort): number | null {
	switch (sort) {
		case "marketcap":
			return r.marketCapUSD;
		case "supply":
			return r.supply;
		case "holders":
			return r.holders;
		case "volume":
			return r.volume24hUSD;
	}
}

/**
 * Rank rows, descending, with nulls ALWAYS last (never treated as 0 — an
 * unpriced/unmeasured asset is not "the smallest"). Default sort=marketcap is
 * the only USD-comparable order; sort=supply ranks raw peg units and is
 * meaningful only within a single peg.
 */
export function rankStablecoins(
	rows: StablecoinRow[],
	sort: StablecoinSort = "marketcap",
): StablecoinRow[] {
	return [...rows].sort((a, b) => {
		const av = sortValue(a, sort);
		const bv = sortValue(b, sort);
		if (av === null && bv === null) return 0;
		if (av === null) return 1;
		if (bv === null) return -1;
		return bv - av;
	});
}
