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
	issuerOfRecord?: string | null;
	issuerOfRecordCheck?: string | null;
	issuerOfRecordSourceUrl?: string | null;
	issuerOfRecordAsOf?: string | null;
	issuerOfRecordNote?: string | null;
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
	/** The asset's web domain as the registry curates it (where the logo is
	 *  read). Not always the issuer account's on-chain home_domain. */
	issuerDomain: string | null;
	/** The brand the asset is marketed under, as the registry curates it
	 *  ("Novatti Group" for AUDD). NOT the legal issuer: see issuerOfRecord. */
	company: string | null;
	/** ORG_NAME in the stellar.toml at the issuer account's home_domain, when
	 *  the stored check named one (issuerOfRecordCheck "named"). Never derived
	 *  from `company`. */
	issuerOfRecord: string | null;
	/** What the stored check found: named, not-named (read, and no issuer of
	 *  record named; issuerOfRecordNote says why), or null (never read). */
	issuerOfRecordCheck: IssuerOfRecordCheck | null;
	/** The toml URL the stored check read (after same-host redirects). */
	issuerOfRecordSourceUrl: string | null;
	/** When the stored check was made (ISO). A failed read does not move it. */
	issuerOfRecordAsOf: string | null;
	/** Named: the toml's desc for this currency, quoted, when it names another
	 *  issuing party (MGUSD: Bridge). Not named: why. */
	issuerOfRecordNote: string | null;
	website: string | null;
	/** Fiat the asset tracks (USD, JPY, ARS, …). supply is in THIS unit; only
	 *  marketCapUSD is comparable across rows. */
	peg: string | null;
	/** Home country code of the PEG currency (US for USD, EU for EUR) or
	 *  "Global", for flag display. Not the issuer's jurisdiction. */
	country: string | null;
	/** Recorded where the registry found the unit is not 1:1 with its peg.
	 *  Null = no qualifier recorded (unclassified), not a verified plain peg. */
	assetType: StablecoinAssetType | null;
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

/** What the stored issuer-of-record check found. A read that could not be
 *  made is not a check: it leaves the stored one as it was. */
export const ISSUER_OF_RECORD_CHECKS = ["named", "not-named"] as const;
export type IssuerOfRecordCheck = (typeof ISSUER_OF_RECORD_CHECKS)[number];

/** The query parameters GET /api/stablecoins reads; anything else is a 400. */
export const STABLECOIN_QUERY_PARAMS = [
	"peg",
	"sort",
	"assetType",
	"limit",
] as const;

/**
 * The qualifiers the registry records on a row whose unit is not 1:1 with its
 * peg (such rows are priced from the market, priceBasis measured-market). A
 * row without one was not classified: null is unknown, never "plain peg".
 */
export const STABLECOIN_ASSET_TYPES = [
	"Yield Stablecoin",
	"Treasury-Backed",
] as const;
export type StablecoinAssetType = (typeof STABLECOIN_ASSET_TYPES)[number];

/** What ?assetType= accepts: a qualifier, or `none` for the rows with none. */
export const STABLECOIN_ASSET_TYPE_FILTERS = [
	...STABLECOIN_ASSET_TYPES,
	"none",
] as const;
export type StablecoinAssetTypeFilter =
	(typeof STABLECOIN_ASSET_TYPE_FILTERS)[number];

/** An ?assetType= value in its canonical spelling (case-insensitive), or
 *  undefined when it is not one the filter accepts. */
export function assetTypeFilter(
	raw: string,
): StablecoinAssetTypeFilter | undefined {
	const want = raw.trim().toLowerCase();
	return STABLECOIN_ASSET_TYPE_FILTERS.find((v) => v.toLowerCase() === want);
}

/** The rows an ?assetType= filter keeps. A qualifier keeps the rows recorded
 *  with it; `none` keeps the rows with no qualifier recorded. A null row is
 *  unclassified, so it never matches a qualifier, and `none` selects it
 *  without calling it par. */
export function filterByAssetType(
	rows: StablecoinRow[],
	f: StablecoinAssetTypeFilter,
): StablecoinRow[] {
	return rows.filter((r) =>
		f === "none" ? r.assetType == null : r.assetType === f,
	);
}

/** Legal-form words a company name can end in ("AUDC PTY LTD", "Brale
 *  Inc.", "Grupo Anchor S.A."), lowercased with the dots dropped. */
const LEGAL_FORMS = new Set([
	"ab",
	"ag",
	"as",
	"bv",
	"co",
	"company",
	"corp",
	"corporation",
	"gmbh",
	"inc",
	"incorporated",
	"kk",
	"limited",
	"llc",
	"llp",
	"lp",
	"ltd",
	"nv",
	"oy",
	"plc",
	"pte",
	"pty",
	"sa",
	"sarl",
	"sas",
	"sl",
	"spa",
	"srl",
]);

/** A company name as the words that name it: lowercased, dots dropped (S.A.
 *  is SA), other punctuation a break, a leading "the" and any run of trailing
 *  legal-form words removed. "Zeam Mint (Pty) Ltd" is [zeam, mint]. */
export function partyWords(name: string): string[] {
	const words = name
		.toLowerCase()
		.replace(/\./g, "")
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
	if (words[0] === "the") words.shift();
	while (words.length && LEGAL_FORMS.has(words[words.length - 1])) words.pop();
	return words;
}

/** True when two names are the same name once case, punctuation, spacing and
 *  legal-form suffixes are set aside ("Brale" and "Brale Inc.", "MyKobo" and
 *  "MYKOBO"). Whole names only: a bare suffix ("Ltd"), a fragment ("A",
 *  "Bridge" inside "Cambridge") or a shorter name ("Novatti" for "Novatti
 *  Group") never matches. */
export function sameParty(a: string, b: string): boolean {
	const x = partyWords(a).join("");
	return x !== "" && x === partyWords(b).join("");
}

/**
 * The party a currency desc says issues the asset: the words after "issued
 * by", up to "on behalf of" or the end of the clause ("issued by Bridge on
 * behalf of MoneyGram" is Bridge). Null when the text names none.
 *
 * ponytail: one phrasing ("issued by X") is read; "X issues", "minted by" and
 * the like are not, so a party named those ways adds no note. Widen the
 * pattern when an issuer's toml is found phrasing it so.
 */
export function namedIssuingParty(
	text: string | null | undefined,
): string | null {
	const m = text?.match(
		// A dot ends the clause only when a space or the end follows it, so
		// "GMO-Z.com" and "S.A." stay whole.
		/\bissued\s+by\s+(.+?)(?=\s+on\s+behalf\s+of\b|[,;]|\.(?:\s|$)|$)/i,
	);
	return m?.[1].trim() || null;
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
const ASSET_TYPE_SET = new Set<string>(STABLECOIN_ASSET_TYPES);
const CHECK_SET = new Set<string>(ISSUER_OF_RECORD_CHECKS);

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
		issuerOfRecord: d.issuerOfRecord ?? null,
		issuerOfRecordCheck:
			d.issuerOfRecordCheck && CHECK_SET.has(d.issuerOfRecordCheck)
				? (d.issuerOfRecordCheck as IssuerOfRecordCheck)
				: null,
		issuerOfRecordSourceUrl: d.issuerOfRecordSourceUrl ?? null,
		issuerOfRecordAsOf: d.issuerOfRecordAsOf ?? null,
		issuerOfRecordNote: d.issuerOfRecordNote ?? null,
		website: d.website ?? null,
		peg: d.peg ?? null,
		country: d.country ?? null,
		// A stored qualifier outside the vocabulary is served as null (no
		// qualifier recorded), never passed through as an enum value the spec
		// does not list.
		assetType:
			d.assetType && ASSET_TYPE_SET.has(d.assetType)
				? (d.assetType as StablecoinAssetType)
				: null,
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
