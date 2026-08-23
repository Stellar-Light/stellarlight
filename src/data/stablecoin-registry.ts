/**
 * The verified Stellar stablecoin registry — 23 assets, each with a
 * hand-checked mainnet issuer.
 *
 * Migrated 2026-08-18 from the Replit-hosted snapshot service
 * (stablecoin.stellarlight.xyz) that /api/stablecoins proxied. That host is
 * being shut down, so the curated knowledge lives here now: the issuer
 * addresses are the whole point — a stablecoin's identity is (code, issuer),
 * and getting one wrong attributes another company's supply to the wrong
 * name.
 *
 * The list is CURATED, not discovered. That is a deliberate coverage
 * boundary, and /api/stablecoins says so in meta.coverage: an asset absent
 * here is untracked, never "does not exist on Stellar" (sls-066). Add a row
 * when a real issuer ships one; never infer.
 */

export type StablecoinPeg =
	| "USD"
	| "EUR"
	| "JPY"
	| "CHF"
	| "BRL"
	| "ARS"
	| "GBP"
	| "AUD"
	| "ZAR"
	| "MXN"
	| "PEN"
	| "NGN"
	| "CLP"
	| "UAH";

export interface StablecoinAsset {
	/** Stellar asset code as issued on mainnet. */
	code: string;
	/** Mainnet issuer account — the asset's real identity. */
	issuer: string;
	/** Home domain serving the stellar.toml we read the logo from. */
	domain: string;
	/** Issuing company, as it should be attributed. */
	company: string;
	peg: StablecoinPeg;
	/** Logo when the domain's TOML has none (or serves a broken one). */
	fallbackImageUrl?: string;
	/** Use the peg's country flag instead of a logo. */
	useCountryFlag?: boolean;
	/** Extra qualifier — e.g. USDY is yield-bearing, not a pure peg. */
	assetType?: string;
	/**
	 * Horizon's /assets index omits a few live assets. Skipping validation
	 * keeps a real asset in the list rather than dropping it on a false
	 * negative — the Replit service learned this the hard way with AUDD.
	 */
	skipHorizonValidation?: boolean;
	/**
	 * Last-resort figures for an asset no public API reports correctly.
	 * Carried over verbatim; these are STALE by construction and the row is
	 * marked so downstream can say when it was last human-checked.
	 */
	hardcodedData?: { supply: number; holders: number; checkedAt: string };
	/** Stellar Expert path suffix when the asset needs a disambiguator. */
	stellarExpertSuffix?: string;
}

export const STABLECOIN_REGISTRY: StablecoinAsset[] = [
	{
		code: "USDC",
		issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
		domain: "circle.com",
		company: "Circle",
		peg: "USD",
	},
	{
		code: "PYUSD",
		issuer: "GDQE7IXJ4HUHV6RQHIUPRJSEZE4DRS5WY577O2FY6YQ5LVWZ7JZTU2V5",
		domain: "paxos.com",
		company: "PayPal / Paxos",
		peg: "USD",
		fallbackImageUrl:
			"https://stellar.myfilebase.com/ipfs/QmaUjqTKqqzmQB1M2XDycVBcerzNYGQjoG2UUnbLdm1vgB",
	},
	{
		code: "EURC",
		issuer: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2",
		domain: "circle.com",
		company: "Circle",
		peg: "EUR",
	},
	{
		code: "ZUSD",
		issuer: "GDF6VOEGRWLOZ64PQQGKD2IYWA22RLT37GJKS2EJXZHT2VLAGWLC5TOB",
		domain: "stablecoin.z.com",
		company: "GMO Trust",
		peg: "USD",
	},
	{
		code: "GYEN",
		issuer: "GDF6VOEGRWLOZ64PQQGKD2IYWA22RLT37GJKS2EJXZHT2VLAGWLC5TOB",
		domain: "stablecoin.z.com",
		company: "GMO Trust",
		peg: "JPY",
	},
	{
		code: "EURS",
		issuer: "GC5FGCDEOGOGSNWCCNKS3OMEVDHTE3Q5A5FEQWQKV3AXA7N6KDQ2CUZJ",
		domain: "stasis.net",
		company: "Stasis",
		peg: "EUR",
	},
	{
		code: "AUDD",
		issuer: "GDC7X2MXTYSAKUUGAIQ7J7RPEIM7GXSAIWFYWWWH4GLNFECQVJJLB2EEU",
		domain: "audd.digital",
		company: "Novatti Group",
		peg: "AUD",
		skipHorizonValidation: true,
		// Carried from the Replit service. Approximate + undated there; dated
		// here so a consumer can see how old the human check is.
		hardcodedData: { supply: 6962786, holders: 100, checkedAt: "2026-08-18" },
	},
	{
		code: "USDGLO",
		issuer: "GBBS25EGYQPGEZCGCFBKG4OAGFXU6DSOQBGTHELLJT3HZXZJ34HWS6XV",
		domain: "glodollar.org",
		company: "Glo Foundation",
		peg: "USD",
		fallbackImageUrl: "https://app.glodollar.org/glo-logo.png",
	},
	{
		code: "VEUR",
		issuer: "GDXLSLCOPPHTWOQXLLKSVN4VN3G67WD2ENU7UMVAROEYVJLSPSEWXIZN",
		domain: "vnx.li",
		company: "VNX",
		peg: "EUR",
	},
	{
		code: "VCHF",
		issuer: "GDXLSLCOPPHTWOQXLLKSVN4VN3G67WD2ENU7UMVAROEYVJLSPSEWXIZN",
		domain: "vnx.li",
		company: "VNX",
		peg: "CHF",
	},
	{
		code: "BRLT",
		issuer: "GCHQ3F2BF5P74DMDNOOGHT5DUCKC773AW5DTOFINC26W4KGYFPYDPRSO",
		domain: "settlenetwork.com",
		company: "Settle Network",
		peg: "BRL",
		useCountryFlag: true,
	},
	{
		code: "ARST",
		issuer: "GCSAZVWXZKWS4XS223M5F54H2B6XPIIXZZGP7KEAIU6YSL5HDRGCI3DG",
		domain: "settlenetwork.com",
		company: "Settle Network",
		peg: "ARS",
		useCountryFlag: true,
	},
	{
		code: "mZAR",
		issuer: "GCBNWTCCMC32UHZ5OCC2PNMFDGXRVPA7MFFBFFTCVW77SX5PMRB7Q4BY",
		domain: "mesh.trade",
		company: "Mesh Trade",
		peg: "ZAR",
		// Was a Replit-local /attached_assets path — dead once that host is
		// gone. Falls through to the domain's TOML logo instead.
	},
	{
		code: "SBC",
		issuer: "GCQCNWT22JDLENQAVIE6DRJGHWAQ6EX2H5ABGPV55EJUPPZM5UA7KHZR",
		domain: "brale.xyz",
		company: "Brale",
		peg: "USD",
	},
	{
		code: "MXNe",
		issuer: "GCQCNWT22JDLENQAVIE6DRJGHWAQ6EX2H5ABGPV55EJUPPZM5UA7KHZR",
		domain: "brale.xyz",
		company: "Brale",
		peg: "MXN",
	},
	{
		// Same ticker as Circle's EURC, different issuer — they are DIFFERENT
		// assets and must never be merged. Identity is (code, issuer).
		code: "EURC",
		issuer: "GAQRF3UGHBT6JYQZ7YSUYCIYWAF4T2SAA5237Q5LIQYJOHHFAWDXZ7NM",
		domain: "mykobo.co",
		company: "MyKobo",
		peg: "EUR",
	},
	{
		code: "PEN",
		issuer: "GA4TDPNUCZPTOHB3TKUYMDCRVATXKEADH7ZEYEBWJKQKE2UBFCYNBPEN",
		domain: "anclap.com",
		company: "Anclap",
		peg: "PEN",
	},
	{
		code: "ARS",
		issuer: "GCYE7C77EB5AWAA25R5XMWNI2EDOKTTFTTPZKM2SR5DI4B4WFD52DARS",
		domain: "anclap.com",
		company: "Anclap",
		peg: "ARS",
	},
	{
		code: "NGNC",
		issuer: "GASBV6W7GGED66MXEVC7YZHTWWYMSVYEY35USF2HJZBLABLYIFQGXZY6",
		domain: "ngnc.online",
		company: "LINK.IO LTD.",
		peg: "NGN",
		fallbackImageUrl:
			"https://stellar.myfilebase.com/ipfs/QmWcALoB3itEx487drMWRjseqKR837NLhSsQcMAGBVeBxt",
	},
	{
		code: "USDY",
		issuer: "GAJMPX5NBOG6TQFPQGRABJEEB2YE7RFRLUKJDZAZGAD5GFX4J7TADAZ6",
		domain: "ondo.finance",
		company: "Ondo Finance",
		peg: "USD",
		assetType: "Yield Stablecoin",
	},
	// ── Coverage audit 2026-08-22 ──────────────────────────────────────────
	// Found by checking Horizon, CoinGecko's stablecoin category and every
	// partner stellar.toml we hold against this list. Each issuer below comes
	// from the partner's OWN SEP-1 file, and each was confirmed on Horizon the
	// same day (code + issuer + authorized holders + authorized supply).
	// Absence here reads to an agent as "not on Stellar" (sls-066); these are
	// demonstrably on it, one of them more widely held than anything we had.
	//
	// NOT added, deliberately: BRZ (Transfero, stellar.brztoken.io) shows
	// 2,000,000,000 authorized across 85 holders — real issuer, but minted
	// supply at that scale next to 85 holders would rank it second by market
	// cap on a page about circulating value. It needs a circulating-supply
	// source before it can sit beside USDC. EURCV / USDM1 / EURAU are Soroban
	// CONTRACT tokens (no classic issuer), which this registry cannot express
	// yet. KTB, MEX, NZDSC, CETESZ are live but effectively unissued (<40
	// holders, ~0 supply).
	{
		// 181,426 holders · 6,405,270 ZARZ authorized (Horizon, 2026-08-22).
		// Issuer from zeam-money's own stellar.toml.
		code: "ZARZ",
		issuer: "GAROH4EV3WVVTRQKEY43GZK3XSRBEYETRVZ7SVG5LHWOAANSMCTJBB3U",
		domain: "zeam.money",
		company: "Zeam",
		peg: "ZAR",
	},
	{
		// 5,795 holders · 14,389,575 CLPX authorized (Horizon, 2026-08-22).
		// Issuer from clpx's own stellar.toml.
		code: "CLPX",
		issuer: "GDYSPBVZHPQTYMGSYNOHRZQNLB3ZWFVQ2F7EP7YBOLRGD42XIC3QUX5G",
		domain: "clpx.finance",
		company: "CLPX",
		peg: "CLP",
	},
	{
		// 6,993 holders · 84,984 BRL authorized (Horizon, 2026-08-22).
		// Issuer from ntokens's own stellar.toml.
		code: "BRL",
		issuer: "GDVKY2GU2DRXWTBEYJJWSFXIGBZV6AZNBVVSUHEPZI54LIS6BA7DVVSP",
		domain: "ntokens.com",
		company: "nTokens",
		peg: "BRL",
	},
	{
		// 1,801 holders · 161,220,533 APSUSDM authorized (Horizon, 2026-08-22).
		// Issuer from aps-money's own stellar.toml.
		code: "APSUSDM",
		issuer: "GB7OUO5NY5WQKXJJ7PFFZEJOKN4BA7IOEN3Z6SWAY26LGTREJJYZH2ZT",
		domain: "aps.money",
		company: "APS Money",
		peg: "USD",
	},
	{
		// 362 holders · 27,885,917 APSEURM authorized (Horizon, 2026-08-22).
		// Issuer from aps-money's own stellar.toml.
		code: "APSEURM",
		issuer: "GB7OUO5NY5WQKXJJ7PFFZEJOKN4BA7IOEN3Z6SWAY26LGTREJJYZH2ZT",
		domain: "aps.money",
		company: "APS Money",
		peg: "EUR",
	},
	{
		// 831 holders · 330,238 UAH authorized (Horizon, 2026-08-22).
		// Issuer from transparent-network's own stellar.toml.
		code: "UAH",
		issuer: "GCJI3CP2NL6NWSCHM36XBQYCBHOTVVZWEXZALWON34KAYUGF6GEVNRTS",
		domain: "prozora.network",
		company: "Transparent Network",
		peg: "UAH",
	},
	{
		// 69 holders · 98,859 GBPZ authorized (Horizon, 2026-08-22).
		// Issuer from zeam-money's own stellar.toml.
		code: "GBPZ",
		issuer: "GCTG4YT2ZTYRODK5JCXFJ6V7P6HMQ62L27PPG5UGK57VUFDJ7DFDGBPZ",
		domain: "zeam.money",
		company: "Zeam",
		peg: "GBP",
	},
];

/** Stable identity for an asset: code + first 8 of the issuer. */
export function stablecoinId(a: Pick<StablecoinAsset, "code" | "issuer">) {
	return `${a.code}-${a.issuer.slice(0, 8)}`;
}

/** ISO-3166 alpha-2 for the peg's home, for flag rendering. */
export const PEG_COUNTRY: Record<string, string> = {
	USD: "US",
	EUR: "EU",
	JPY: "JP",
	CHF: "CH",
	BRL: "BR",
	ARS: "AR",
	GBP: "GB",
	AUD: "AU",
	ZAR: "ZA",
	MXN: "MX",
	PEN: "PE",
	NGN: "NG",
};
