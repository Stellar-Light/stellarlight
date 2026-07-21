/**
 * Stablecoin snapshot normalization for GET /api/stablecoins.
 *
 * The authoritative Stellar stablecoin dataset lives in the sibling service
 * stablecoin.stellarlight.xyz (23 issuers, USD market cap, peg, holders,
 * dated). This module is the PURE half — parsing its display-formatted values
 * into raw numbers and ranking them — so the ranking rules are unit testable;
 * the route proxies the snapshot and calls these.
 *
 * WHY this endpoint exists (2026-07-21, boxy review of getLeaderboard
 * sort=supply): raw circulating supply is NOT comparable across pegs. GYEN
 * shows 100.87M supply but is YEN — ~$676K in USD; ARST 243M is Argentine
 * pesos — ~$243K. Ranking whole-asset units treated USD, JPY, and ARS as the
 * same unit, so "biggest stablecoin by supply" mis-ranked a yen coin above
 * real USD stablecoins AND missed USDY (Ondo, $467.5M — the actual largest).
 * The comparable metric is USD MARKET CAP (supply × USD price), which the
 * snapshot already computes; this endpoint ranks by it and carries the peg so
 * denomination is always explicit.
 */

/** The sibling service's public snapshot feed (our own infra, no auth). */
export const STABLECOIN_SNAPSHOT_URL =
	"https://stablecoin.stellarlight.xyz/api/snapshots/stablecoins";

/** One row exactly as the snapshot feed serves it (display-formatted). */
export interface SnapshotRow {
	id?: string;
	ticker?: string;
	name?: string;
	issuerCode?: string;
	issuerDomain?: string;
	supply?: string;
	marketCap?: string;
	holders?: string;
	volume24h?: string;
	volume24hRaw?: string;
	country?: string;
	peg?: string;
	price?: string;
	cachedPriceUSD?: string;
	supplyChange7d?: string;
	verified?: boolean;
	company?: string;
	website?: string;
	updatedAt?: string;
}

/** Our normalized, agent-facing row — raw numbers + explicit peg. */
export interface StablecoinRow {
	ticker: string;
	name: string | null;
	/** Stellar issuer account (G…) — the universal join key. */
	issuer: string | null;
	issuerDomain: string | null;
	company: string | null;
	website: string | null;
	/** Fiat the asset tracks (USD, JPY, ARS, …). supply is in THIS unit; only
	 *  marketCapUSD is comparable across rows. */
	peg: string | null;
	country: string | null;
	/** Circulating supply in whole asset units of its OWN peg — NOT USD, NOT
	 *  comparable across pegs. Null if the feed didn't report it. */
	supply: number | null;
	/** Circulating supply valued in USD (supply × USD price). THE comparable
	 *  ranking metric. Null if unpriced. */
	marketCapUSD: number | null;
	/** USD price of one unit (≈1 for USD pegs, ≈0.0067 for JPY, …). */
	priceUSD: number | null;
	/** Trustline holder count. */
	holders: number | null;
	/** 24h transfer volume in USD. */
	volume24hUSD: number | null;
	/** 7-day supply change as the feed's display string (e.g. "-5.80%"). */
	supplyChange7d: string | null;
	verified: boolean;
	/** When the snapshot row was refreshed (ISO) — dated-metrics rule. */
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
 * Parse the feed's display numbers into a raw number.
 * Handles "$275.94M", "275.94M", "$243.12K", "2,284,095", "146.00", "$552.14".
 * Returns null for null/empty/unparseable so a missing value never becomes 0
 * (0 would rank an unpriced asset as "zero supply", the class-3 trap).
 */
export function parseAbbrevNumber(s: string | null | undefined): number | null {
	if (s === null || s === undefined) return null;
	let t = String(s).trim();
	if (!t) return null;
	t = t.replace(/\$/g, "").replace(/,/g, "").trim();
	let mult = 1;
	const suffix = t.slice(-1).toUpperCase();
	if (suffix === "K") mult = 1e3;
	else if (suffix === "M") mult = 1e6;
	else if (suffix === "B") mult = 1e9;
	else if (suffix === "T") mult = 1e12;
	if (mult !== 1) t = t.slice(0, -1);
	const n = Number.parseFloat(t);
	return Number.isFinite(n) ? n * mult : null;
}

/** Normalize one snapshot row into our raw-number shape. */
export function normalizeSnapshotRow(raw: SnapshotRow): StablecoinRow {
	const supply = parseAbbrevNumber(raw.supply);
	const priceUSD = parseAbbrevNumber(raw.cachedPriceUSD ?? raw.price);
	// Prefer the feed's own computed market cap; fall back to supply × price
	// when the feed didn't format one but we can derive it.
	let marketCapUSD = parseAbbrevNumber(raw.marketCap);
	if (marketCapUSD === null && supply !== null && priceUSD !== null)
		marketCapUSD = supply * priceUSD;
	const volume24hUSD =
		raw.volume24hRaw != null && raw.volume24hRaw !== ""
			? Number.parseFloat(raw.volume24hRaw)
			: parseAbbrevNumber(raw.volume24h);
	return {
		ticker: raw.ticker ?? "",
		name: raw.name ?? null,
		issuer: raw.issuerCode ?? null,
		issuerDomain: raw.issuerDomain ?? null,
		company: raw.company ?? null,
		website: raw.website ?? null,
		peg: raw.peg ?? null,
		country: raw.country ?? null,
		supply,
		marketCapUSD,
		priceUSD,
		holders: parseAbbrevNumber(raw.holders),
		volume24hUSD:
			volume24hUSD !== null && Number.isFinite(volume24hUSD)
				? volume24hUSD
				: null,
		supplyChange7d: raw.supplyChange7d ?? null,
		verified: !!raw.verified,
		updatedAt: raw.updatedAt ?? null,
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
 * unpriced/untracked asset is not "the smallest"). Default sort=marketcap is
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
