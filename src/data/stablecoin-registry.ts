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
	| "UAH"
	| "SGD"
	| "AED"
	| "CAD";

export interface StablecoinAsset {
	/** Stellar asset code as issued on mainnet. */
	code: string;
	/** Mainnet issuer account — the asset's real identity. */
	issuer: string;
	/** Home domain serving the stellar.toml we read the logo from. */
	domain: string;
	/** Issuing company, as it should be attributed. */
	company: string;
	/** Display name from the issuer's own toml, when it differs from the code. */
	name?: string;
	peg: StablecoinPeg;
	/** Logo when the domain's TOML has none (or serves a broken one). */
	fallbackImageUrl?: string;
	/** Use the peg's country flag instead of a logo. */
	useCountryFlag?: boolean;
	/** Extra qualifier — e.g. USDY is yield-bearing, not a pure peg. */
	assetType?: string;
	/**
	 * A caveat the operator states about itself, carried verbatim from their
	 * own toml/docs — never our inference. Surfaces on the row's `note` field
	 * alongside (not instead of) a measurement problem, which still wins if
	 * the fetch itself failed.
	 */
	note?: string;
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
	// ── Coverage audit 2026-09-02 (vs Allium's Stellar stablecoin dashboard) ──
	// Allium names assets in its by-asset charts that this registry did not
	// carry. Each was put through the same full chain as every row here: the
	// operator's own SEP-1 toml declares code + issuer, the ISSUER account's
	// home_domain points back at that domain, and Stellar Expert reports live
	// supply. Two of Allium's names FAILED that chain and are deliberately
	// absent: EURCV (issuer home_domain xmintstellar.org does not resolve —
	// the fake-issuer-farm pattern; SocGen's real EURCV is not on Stellar) and
	// BRZ (issuer home_domain stellar.brztoken.io serves 530/TLS errors, so
	// the chain could not be closed today — 2B supply against 86 trustlines
	// stays unverified rather than published).
	{
		// MoneyGram's own USD token, distinct from the USDC it settles in.
		// toml ORG_NAME "MoneyGram Payment Systems, Inc."; 351 trustlines,
		// ~25.2M issued, 45 lifetime payments (checked 2026-09-02).
		code: "MGUSD",
		issuer: "GAIUGZZZSL47BKH27SUDZESZELFJDPE2UM52RACOSFJ7BIVBGKUEJSUZ",
		domain: "mgusd.moneygram.com",
		company: "MoneyGram",
		peg: "USD",
	},
	// Currency One (toml ORG_NAME "Kinesis Money Panama S.A.", currency.one) —
	// eight fiat tokens declared in one toml, each issuer's home_domain
	// pointing back at currency.one. Supply is real but holders are few (4-43
	// trustlines each, ~296M units total): institutional issuance, not retail
	// float. The rows carry their own holder counts, so the reader sees that.
	{
		code: "C1USD",
		issuer: "GDCDFF6ZZP3HVODSVJYAN6IRNGWGPLVFKH23RY2OFHFGGVCGBXSDPKTU",
		domain: "currency.one",
		company: "Currency One",
		peg: "USD",
	},
	{
		code: "C1GBP",
		issuer: "GBH6CRMD6ROENY43SOVZFEYJVFVCVFN6HM3DRLLUT3EKMVBBO2I5ASSE",
		domain: "currency.one",
		company: "Currency One",
		peg: "GBP",
	},
	{
		code: "C1EUR",
		issuer: "GCCMR4S7PMLKM2UXJDHXTK6WBJLSB2NAO4SQNWB4YMXL5JXS5U67GX3O",
		domain: "currency.one",
		company: "Currency One",
		peg: "EUR",
	},
	{
		code: "C1AUD",
		issuer: "GDG3E67KFAFKNVLQ4N46C2T6X2T3LKUYLOROY6KB3ZGXDXUPGRA6ZRLK",
		domain: "currency.one",
		company: "Currency One",
		peg: "AUD",
	},
	{
		code: "C1CAD",
		issuer: "GDJNFIHUZR63TXP4EVVC7XRK3F4N4WEVIZSK35GUUVNTHDBOM6J2VLOE",
		domain: "currency.one",
		company: "Currency One",
		peg: "CAD",
	},
	{
		code: "C1CHF",
		issuer: "GDVQ56KPS6WZJKTDI3BQOKOQXIPMQ4FSIVDOJBI36HBZHZDVW6FHYYOA",
		domain: "currency.one",
		company: "Currency One",
		peg: "CHF",
	},
	{
		code: "C1AED",
		issuer: "GD7VYLR62RQDXIJ7OYYQAS7663PNUI7X3MWB442S2L7YCDE3A7Q6TKCQ",
		domain: "currency.one",
		company: "Currency One",
		peg: "AED",
	},
	{
		code: "C1SGD",
		issuer: "GB6CWDUN7IQTPHFMV2ZL5WLWXKCGXETRKO5NQLHJ7YIJYBV5N5I2DGHP",
		domain: "currency.one",
		company: "Currency One",
		peg: "SGD",
	},
	{
		code: "USDC",
		issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
		domain: "circle.com",
		company: "Circle",
		peg: "USD",
	},
	{
		// Tether's omnichain USDT (LayerZero OFT burn-and-mint, 1:1 backed).
		// On-chain since 2026-08 (Horizon-verified 2026-08-29: 5,434 authorized
		// trustlines, ~52,140 issued); officially launched 2026-09-02 (SDF
		// announcement + developers.stellar.org/launch/usdt0: SAC CBSJZEIO…,
		// OFT CBOWOLFS…). Since launch day usdt0.to serves a SEP-1 toml
		// (ORG Everdawn Labs Limited) whose currency image is the round coin
		// on IPFS — that wins the logo when it loads; the fallback below is
		// the owner-supplied square mark bundled with the site.
		code: "USDT0",
		issuer: "GATISXX6BZ6NC7IKQBY37CJD4SOZL3CYZJWXEDG6JVIY4WBS6KXJHN6Q",
		domain: "usdt0.to",
		company: "Tether (USDT0)",
		peg: "USD",
		fallbackImageUrl: "https://stellarlight.xyz/stablecoins/logos/usdt0.png",
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
		// 2026-08-28: this string carried an extra W since import (57 chars,
		// Horizon rejects it as invalid) — corrected against audd.digital's own
		// stellar.toml, the asset's on-chain existence, and the issuer account's
		// home_domain pointing back at audd.digital.
		issuer: "GDC7X2MXTYSAKUUGAIQ7J7RPEIM7GXSAIWFYWWH4GLNFECQVJJLB2EEU",
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
	// ── Coverage sweep 2026-09-02 (Stellar Expert fiat-code sweep) ─────────
	// A follow-up sweep of Stellar Expert for fiat-coded assets not yet
	// carried here, run through the same chain as the Allium audit above:
	// operator's own SEP-1 toml declares code + issuer, the ISSUER account's
	// home_domain points back at that domain, Stellar Expert reports live
	// supply + trustlines. 4 of 14 candidates passed; the other 10 did not,
	// for four different reasons:
	//
	// SELF-DECLARED TEST: kbtrading.org's own toml marks IDRT, KRW and XCHF
	// status="test" (its ORG_DESCRIPTION calls IDRT/XCHF "pilot mode" and
	// doesn't mention KRW at all) — domain and issuer both check out, but the
	// operator does not represent these as production.
	//
	// NOT A FIAT-PEG STABLECOIN: USTRY is Etherfuse's tokenized US Treasury
	// Notes "Stablebond" (toml anchor_asset_type="bond") — a yield-bearing
	// bond, not a reserve claim on fiat. sUSD's own toml says it is "not
	// redeemable or directly asset-backed, instead it tracks the price of
	// USD" — synthetic, no reserve claim. yUSDC's own toml calls it "an
	// interest earning USDC tethered token" redeemable 1:1 for USDC — a
	// yield wrapper on an asset already carried here (USDC), not an
	// independent stablecoin.
	//
	// CHAIN DID NOT CLOSE: EURT's issuer sets home_domain to eurt.exchange,
	// which does not resolve (no DNS). USD (the 100B-supply/98,918-trustline
	// one — distinct from AnchorUSD's much smaller "USD") sets no
	// home_domain at all. USDCAllow's issuer sets home_domain to circle.com,
	// but circle.com's own stellar.toml does not declare this issuer or
	// code — it has nothing to do with the real Circle USDC/EURC issuer
	// already in this registry.
	//
	// NOT A STABLECOIN: SCOP (scopuly.com) is Scopuly's exchange/utility
	// token — a regex false positive from "COP" matching inside "SCOP", not
	// a fiat peg.
	{
		// Zeam's USD sibling to the ZARZ/GBPZ rows already here. toml status
		// "live"; redeemable for fiat USD via the Zeam app (checked
		// 2026-09-02: 181,060 trustlines, ~310,000 issued).
		code: "USDZ",
		issuer: "GAKTLPC4ZV37SSCITQ5IS5AQ4WPF4CF4VZJQPPAROSGXMYOATF5U6XPR",
		domain: "zeam.money",
		company: "Zeam",
		peg: "USD",
	},
	{
		// 100%-reserve EUR token; MTL Foundation undertakes 1:1 redemption to
		// bearers in Montenegro (checked 2026-09-02: 4,676 trustlines,
		// ~3.31M issued).
		code: "EURMTL",
		issuer: "GACKTN5DAZGWXRWB2WLM6OPBDHAMT6SJNGLJZPQMEZBUR4JUGBX2UK7V",
		domain: "mtl.montelibero.org",
		company: "Montelibero",
		peg: "EUR",
	},
	{
		// Montelibero's USD stablecoin — issuer commits to redeem 1:1 for
		// USDC within 24h of a request, rather than direct bank fiat. A
		// different asset from Mountain Protocol's Ethereum "USDM"; identity
		// here is this issuer (checked 2026-09-02: 2,563 trustlines, ~255.7k
		// issued).
		code: "USDM",
		issuer: "GDHDC4GBNPMENZAOBB4NCQ25TGZPDRK6ZGWUGSI22TVFATOLRPSUUSDM",
		domain: "mtl.montelibero.org",
		company: "Montelibero",
		peg: "USD",
	},
	{
		// Permissioned reserve-backed USD token for institutions; toml
		// declares anchor_asset_type "fiat" and status "live". A DIFFERENT
		// USDV (Velo Labs, velo.org, ~2.2M supply/128 trustlines) also
		// exists — this row is the valtorum.com one, matched on domain as
		// well as code (checked 2026-09-02: 18 trustlines, 1.1M issued).
		code: "USDV",
		issuer: "GBLAJOKBIIT7P32BJQFCSRJVOE2SXHI4D5ZGLFJ4DLMFJXI2NN6R37G5",
		domain: "valtorum.com",
		company: "Valtorum",
		peg: "USD",
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
	// source before it can sit beside USDC. EURCV / EURAU are Soroban CONTRACT
	// tokens (no classic issuer), which this registry cannot express yet.
	// KTB, MEX, NZDSC, CETESZ are live but effectively unissued (<40 holders,
	// ~0 supply).
	//
	// USDM1 (GDM5QWWXCMDTQMZAKMYTCI52LA7FWBHAZMU5NJLMIFHDJISJRP2ZWPKC):
	// re-checked 2026-09-02, and the "Soroban contract, no classic issuer"
	// reasoning above does NOT apply to it — it IS a normal classic asset
	// (Horizon returns an ordinary G-account; Stellar Expert's classic
	// asset/{code}-{issuer} endpoint reports it fully: supply, 28 trustlines,
	// 512 funded). Excluded anyway, for two independent reasons: (1) the
	// issuer account sets NO home_domain on Horizon at all, so the
	// toml-reversal chain every other row here passes has nothing to check
	// against; (2) the operator itself — the Republic of the Marshall
	// Islands, per Stellar's own press release — describes it as "the first
	// digital sovereign debt instrument issued natively on a blockchain," a
	// dollar-denominated sovereign bond "backed one-to-one by short-dated
	// U.S. Treasuries" for a Universal Basic Income disbursement (SDF +
	// Crossmint, live Nov 2025). That is the same NOT-A-FIAT-PEG-STABLECOIN
	// shape as USTRY above (Coverage sweep 2026-09-02) — a yield-bearing bond,
	// not a reserve claim on fiat — so it stays out on both the chain and the
	// inclusion rule, same as every other candidate in this block.
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
		//
		// Researched 2026-09-02 against primary sources: the issuer account's
		// own `home_domain` on Horizon is dcm.systems, NOT prozora.network —
		// prozora.network (the ORG_URL / public brand site) serves no toml at
		// all (its /.well-known/stellar.toml 404s), while dcm.systems/.well-
		// known/stellar.toml is live and declares this exact code + issuer.
		// `domain` corrected to the host that actually passes the same
		// home_domain-reversal check every other row here is held to; this
		// also gives the row a real logo instead of the flag fallback, since
		// that toml's CURRENCIES block carries one.
		//
		// name and note are that toml's own words, not our inference. Its
		// ORG_NAME confirms "Transparent Network" (no change). Its CURRENCIES
		// entry: name="TPN UAH"; desc says UAH "is a digital representation
		// (identifier) of the hryvnia on the bank accounts in transactions
		// between network financial institutions and customers" and, in the
		// operator's own words, "UAH is not a stablecoin; the token is not
		// tradable and is available only for authorized accounts of
		// participating financial institutions and customer's accounts."
		// No reserve/backing claim beyond that is made anywhere in the toml,
		// so none is recorded here.
		code: "UAH",
		issuer: "GCJI3CP2NL6NWSCHM36XBQYCBHOTVVZWEXZALWON34KAYUGF6GEVNRTS",
		domain: "dcm.systems",
		company: "Transparent Network",
		name: "TPN UAH",
		peg: "UAH",
		note: `Operator's own toml: "UAH is not a stablecoin; the token is not tradable and is available only for authorized accounts of participating financial institutions and customer's accounts." It represents hryvnia held in participating banks' accounts, for interbank/institutional settlement — not a retail-redeemable reserve token.`,
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

/**
 * ISO-3166 alpha-2 for the peg's home, for flag rendering.
 *
 * Every member of `StablecoinPeg` above must have an entry here, or a real
 * row silently renders the "Global" globe instead of its own flag (sls: CLP
 * and UAH both did this — 2026-09-02). Add the country the same time you add
 * the peg to the union, not after.
 */
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
	CLP: "CL",
	UAH: "UA",
	SGD: "SG",
	AED: "AE",
	CAD: "CA",
};
