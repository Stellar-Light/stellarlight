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

import type { StablecoinAssetType } from "@/lib/stablecoins";

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
	/**
	 * The brand the asset is marketed under, as a reader knows it ("Novatti
	 * Group" for AUDD, "Currency One" for the C1 rows). NOT the legal issuer:
	 * the pipeline reads the issuer of record from the ORG_NAME in the stellar
	 * toml at the issuer account's home_domain, never from this field.
	 */
	company: string;
	/** Display name from the issuer's own toml, when it differs from the code. */
	name?: string;
	peg: StablecoinPeg;
	/** Logo when the domain's TOML has none (or serves a broken one). */
	fallbackImageUrl?: string;
	/**
	 * Serve fallbackImageUrl even though the TOML carries an image — for a
	 * TOML image that is an IPFS-gateway URL, which resolves for our refresh
	 * runner but not reliably in a reader's browser (USDT0, 2026-09-05: the
	 * asset page rendered no logo at all). Our own copy wins; logoSource says
	 * "fallback" so nobody mistakes it for the issuer's file.
	 */
	preferFallbackLogo?: boolean;
	/** Use the peg's country flag instead of a logo. */
	useCountryFlag?: boolean;
	/**
	 * The row's class (the closed vocabulary Stablecoin.assetType defines in
	 * the spec), read by hand from the issuer's own statement of what backs
	 * the unit. Unclassified only where no such statement could be found.
	 * Never taken from a toml's anchor fields: read 2026-11-11, they disagree
	 * with the issuers' own words (C1 declares is_asset_anchored false, USDZ
	 * declares crypto, YLDS declares fiat).
	 */
	assetType: StablecoinAssetType;
	/**
	 * What the class rests on, served beside it: the issuer's own page or
	 * document (`url`), the day it was read (`checkedOn`), and what it states
	 * in short (`note`). For an Unclassified row `url` is null and `note`
	 * says what was checked and why it names no class.
	 */
	assetTypeSource: { url: string | null; checkedOn: string; note: string };
	/**
	 * A standing caveat, dated where it is our check: the operator's own
	 * words, or what we found when its sources could not be read (BRLT).
	 * Surfaces on the row's `note` field after (never instead of) an urgent
	 * measurement note.
	 */
	note?: string;
	/**
	 * Served as the issuer-of-record reason, after "the issuer account sets
	 * no home_domain", while that is why no issuer of record is named: what
	 * the account's missing home_domain leaves unconfirmed, with the URL and
	 * day checked (USDT0). Never an issuer of record itself.
	 */
	noHomeDomainNote?: string;
	/**
	 * Horizon's /assets index omits a few live assets. Skipping validation
	 * keeps a real asset in the list rather than dropping it on a false
	 * negative — the Replit service learned this the hard way with AUDD.
	 */
	skipHorizonValidation?: boolean;
	/**
	 * Where one unit's USD price comes from when the PEG IS NOT THE PRICE.
	 *
	 * Default for every row is the peg: a stablecoin claims 1 unit = 1 unit of
	 * its peg, so pricing at the live peg FX rate is the honest read. That is
	 * WRONG for a unit whose value accrues or trades away from par — Ondo's
	 * USDY is a share of a Treasury portfolio that was $1.14 on 2026-09-09,
	 * and pricing it at $1.00 understated the asset by ~$65M (14%) on our own
	 * dashboard. Set this on any row whose unit is not 1:1 with its peg (a
	 * test requires it on every Treasury-Backed and Yield Stablecoin row whose
	 * issuer does not redeem the unit 1:1 at par), and the pipeline prices
	 * from the market instead, marking the row `priceBasis: "measured-market"`.
	 *
	 * `id` is the CoinGecko coin id. The price is the TOKEN's, not one chain's
	 * venue print: these are multi-chain issuances of one claim (USDY on 8
	 * chains, USDM1 on 3 incl. Stellar), redeemed against the same reserve, so
	 * the coin-level price is the right number for the Stellar supply.
	 */
	marketPrice?: { source: "coingecko"; id: string };

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
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://mgusd.moneygram.com/.well-known/stellar.toml",
			checkedOn: "2026-11-11",
			note: "The issuer's stellar.toml calls MGUSD a USD-backed stablecoin issued by Bridge on behalf of MoneyGram. Its product page, mgusd.moneygram.com, refused automated reads (HTTP 403).",
		},
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
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://currency.one/documents/C1Suite_Whitepaper.pdf",
			checkedOn: "2026-11-11",
			note: "The C1Suite whitepaper, linked from currency.one, says each token is backed by a reserve of cash and cash equivalents held apart from the issuer's funds, redeemable for its fiat currency under the suite's terms.",
		},
	},
	{
		code: "C1GBP",
		issuer: "GBH6CRMD6ROENY43SOVZFEYJVFVCVFN6HM3DRLLUT3EKMVBBO2I5ASSE",
		domain: "currency.one",
		company: "Currency One",
		peg: "GBP",
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://currency.one/documents/C1Suite_Whitepaper.pdf",
			checkedOn: "2026-11-11",
			note: "The C1Suite whitepaper, linked from currency.one, says each token is backed by a reserve of cash and cash equivalents held apart from the issuer's funds, redeemable for its fiat currency under the suite's terms.",
		},
	},
	{
		code: "C1EUR",
		issuer: "GCCMR4S7PMLKM2UXJDHXTK6WBJLSB2NAO4SQNWB4YMXL5JXS5U67GX3O",
		domain: "currency.one",
		company: "Currency One",
		peg: "EUR",
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://currency.one/documents/C1Suite_Whitepaper.pdf",
			checkedOn: "2026-11-11",
			note: "The C1Suite whitepaper, linked from currency.one, says each token is backed by a reserve of cash and cash equivalents held apart from the issuer's funds, redeemable for its fiat currency under the suite's terms.",
		},
	},
	{
		code: "C1AUD",
		issuer: "GDG3E67KFAFKNVLQ4N46C2T6X2T3LKUYLOROY6KB3ZGXDXUPGRA6ZRLK",
		domain: "currency.one",
		company: "Currency One",
		peg: "AUD",
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://currency.one/documents/C1Suite_Whitepaper.pdf",
			checkedOn: "2026-11-11",
			note: "The C1Suite whitepaper, linked from currency.one, says each token is backed by a reserve of cash and cash equivalents held apart from the issuer's funds, redeemable for its fiat currency under the suite's terms.",
		},
	},
	{
		code: "C1CAD",
		issuer: "GDJNFIHUZR63TXP4EVVC7XRK3F4N4WEVIZSK35GUUVNTHDBOM6J2VLOE",
		domain: "currency.one",
		company: "Currency One",
		peg: "CAD",
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://currency.one/documents/C1Suite_Whitepaper.pdf",
			checkedOn: "2026-11-11",
			note: "The C1Suite whitepaper, linked from currency.one, says each token is backed by a reserve of cash and cash equivalents held apart from the issuer's funds, redeemable for its fiat currency under the suite's terms.",
		},
	},
	{
		code: "C1CHF",
		issuer: "GDVQ56KPS6WZJKTDI3BQOKOQXIPMQ4FSIVDOJBI36HBZHZDVW6FHYYOA",
		domain: "currency.one",
		company: "Currency One",
		peg: "CHF",
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://currency.one/documents/C1Suite_Whitepaper.pdf",
			checkedOn: "2026-11-11",
			note: "The C1Suite whitepaper, linked from currency.one, says each token is backed by a reserve of cash and cash equivalents held apart from the issuer's funds, redeemable for its fiat currency under the suite's terms.",
		},
	},
	{
		code: "C1AED",
		issuer: "GD7VYLR62RQDXIJ7OYYQAS7663PNUI7X3MWB442S2L7YCDE3A7Q6TKCQ",
		domain: "currency.one",
		company: "Currency One",
		peg: "AED",
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://currency.one/documents/C1Suite_Whitepaper.pdf",
			checkedOn: "2026-11-11",
			note: "The C1Suite whitepaper, linked from currency.one, says each token is backed by a reserve of cash and cash equivalents held apart from the issuer's funds, redeemable for its fiat currency under the suite's terms.",
		},
	},
	{
		code: "C1SGD",
		issuer: "GB6CWDUN7IQTPHFMV2ZL5WLWXKCGXETRKO5NQLHJ7YIJYBV5N5I2DGHP",
		domain: "currency.one",
		company: "Currency One",
		peg: "SGD",
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://currency.one/documents/C1Suite_Whitepaper.pdf",
			checkedOn: "2026-11-11",
			note: "The C1Suite whitepaper, linked from currency.one, says each token is backed by a reserve of cash and cash equivalents held apart from the issuer's funds, redeemable for its fiat currency under the suite's terms.",
		},
	},
	{
		code: "USDC",
		issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
		domain: "circle.com",
		company: "Circle",
		peg: "USD",
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://www.circle.com/usdc",
			checkedOn: "2026-11-11",
			note: "Circle states USDC is backed 100% by highly liquid cash and cash-equivalent assets and redeemable 1:1 for US dollars; most of the reserve is in the Circle Reserve Fund, a government money market fund.",
		},
		// Circle's toml serves no usable currency image, so the API served
		// logoUrl: null for the biggest coin on the page. The explorer already
		// covers it client-side with a bundled mark; this pins the same mark so
		// API consumers get it too. Verified 200 image/png.
		fallbackImageUrl: "https://stellarlight.xyz/stablecoins/logos/usdc.png",
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
		assetType: "Crypto-Backed",
		assetTypeSource: {
			url: "https://docs.usdt0.to",
			checkedOn: "2026-11-11",
			note: "The USDT0 documentation says each USDT0 is minted 1:1 against USDT locked on Ethereum and redeemed by burning it to unlock that USDT.",
		},
		noHomeDomainNote:
			"usdt0.to's stellar.toml (https://usdt0.to/.well-known/stellar.toml, read 2026-11-11) names ORG_NAME Everdawn Labs Limited and lists this account as the USDT0 issuer, but the account sets no home_domain pointing to it, so the link cannot be confirmed from the account side",
		// The toml's CURRENCIES image is an ipfs.io gateway URL that does not load
		// reliably in browsers; the 512×512 mark below is the official asset mark.
		fallbackImageUrl: "https://stellarlight.xyz/stablecoins/logos/usdt0.png",
		preferFallbackLogo: true,
	},
	{
		code: "PYUSD",
		issuer: "GDQE7IXJ4HUHV6RQHIUPRJSEZE4DRS5WY577O2FY6YQ5LVWZ7JZTU2V5",
		domain: "paxos.com",
		company: "PayPal / Paxos",
		peg: "USD",
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://www.paxos.com/assets/pyusd",
			checkedOn: "2026-11-11",
			note: "Paxos states PYUSD reserves are held 100% in US dollar deposits, US Treasuries and cash equivalents, available for 1:1 redemption with Paxos.",
		},
		fallbackImageUrl:
			"https://stellar.myfilebase.com/ipfs/QmaUjqTKqqzmQB1M2XDycVBcerzNYGQjoG2UUnbLdm1vgB",
	},
	{
		code: "EURC",
		issuer: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2",
		domain: "circle.com",
		company: "Circle",
		peg: "EUR",
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://www.circle.com/eurc",
			checkedOn: "2026-11-11",
			note: "Circle states EURC is backed 100% by euro held at regulated financial institutions in the EEA and redeemable 1:1 for euro.",
		},
		// Circle's toml serves no usable currency image, so the API served
		// logoUrl: null for the biggest coin on the page. The explorer already
		// covers it client-side with a bundled mark; this pins the same mark so
		// API consumers get it too. Verified 200 image/png.
		fallbackImageUrl: "https://stellarlight.xyz/stablecoins/logos/eurc.png",
	},
	// ZUSD and GYEN (GMO-Z.com Trust Company): REMOVED 2026-11-11, on the
	// issuer's own notice. Its stellar.toml (stablecoin.z.com, read
	// 2026-11-11) says issuance of each "has been wound down" and that the
	// initial 1:1 redemption period with GMO Trust "runs from 15 May to 11
	// November 2026", with the terms at support.stablecoin.z.com (article
	// 57881757618969). A stablecoin its own issuer has wound down, its
	// initial redemption period ending on 11 November 2026, is not one this
	// registry should carry: the rule that retired BRL and UAH. Dropping
	// the entries stops the measurement; the next refresh stamps
	// `retiredAt`, which keeps the history.
	{
		code: "EURS",
		issuer: "GC5FGCDEOGOGSNWCCNKS3OMEVDHTE3Q5A5FEQWQKV3AXA7N6KDQ2CUZJ",
		domain: "stasis.net",
		company: "Stasis",
		peg: "EUR",
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://stasis.net/transparency",
			checkedOn: "2026-11-11",
			note: "STASIS states EURS is backed by 100% EUR liquid balances held in central bank accounts.",
		},
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
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://www.audd.digital",
			checkedOn: "2026-11-11",
			note: "AUDC states AUDD is 1:1 backed by Australian dollars, through cash or cash equivalents, held in Australian financial institution accounts.",
		},
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
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://brale.xyz/assets/reports/USDGLO-Glo-Dollar-Reserve-Attestation-Report-09-2026.pdf",
			checkedOn: "2026-11-11",
			note: "Brale's USDGLO reserve report for 30 September 2026, linked from the reserve page the Glo Dollar toml names (brale.xyz/stablecoins/USDGLO), lists $923,605 in cash and cash equivalents and $64,451 in US government backed debt against 988,057 USDGLO issued; it is Brale management's assertion. That page says USDGLO is always redeemable 1:1 for US dollars.",
		},
		fallbackImageUrl: "https://app.glodollar.org/glo-logo.png",
	},
	// VEUR (VNX): REMOVED 2026-11-11. What VNX's own statements support, read
	// 2026-11-11 (vnx.li/blog, one page of expandable posts with no
	// per-post links): VNX no longer offers exchange services for VEUR and
	// no longer lists it among its stablecoins. VNX Commodities AG's notice
	// of 2026-04-22 says "exchange services of VEUR by VNX Commodities AG
	// will be fully discontinued", holders to settle "by May 22nd, 2026".
	// VNX's platform notice of 2026-06-19 suspends exchange operations from
	// 30 June 2026 and names VNXAU, VCHF and VGBP, not VEUR, for later
	// withdrawals. VNX Global Ltd., the ORG_NAME of the issuing account's
	// toml, lists only VCHF and VGBP on its stablecoins page and does not
	// declare VEUR in that toml. A notice of 2026-05-11 still called VEUR
	// "currently live on 14 blockchains": a statement about network support
	// made before the settlement date, not an offer to redeem. No VNX
	// entity offers to exchange or redeem VEUR now, so the BRL and UAH rule
	// holds. Dropping the entry stops the measurement; the next refresh
	// stamps `retiredAt`, which keeps the history. (VCHF, issued from the
	// same account, stays.)
	{
		code: "VCHF",
		issuer: "GDXLSLCOPPHTWOQXLLKSVN4VN3G67WD2ENU7UMVAROEYVJLSPSEWXIZN",
		domain: "vnx.li",
		company: "VNX",
		peg: "CHF",
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://vnx.gitbook.io/vnx-global/institutional/products/stablecoins",
			checkedOn: "2026-11-11",
			note: "VNX states VCHF is fully backed by fiat in segregated fiduciary accounts and redeemable 1:1 for Swiss francs. VNX's platform notice of 2026-06-19 suspended exchange operations on vnx.li from 30 June 2026.",
		},
	},
	{
		code: "BRLT",
		issuer: "GCHQ3F2BF5P74DMDNOOGHT5DUCKC773AW5DTOFINC26W4KGYFPYDPRSO",
		domain: "settlenetwork.com",
		company: "Settle Network",
		peg: "BRL",
		assetType: "Unclassified",
		assetTypeSource: {
			url: null,
			checkedOn: "2026-11-11",
			note: "Checked 2026-11-11: the issuer account's home_domain, sep.stablex.cloud, does not resolve, so its stellar.toml cannot be read, and Settle Network's site names BRLT without saying what backs it.",
		},
		note: "The issuer account's home_domain, sep.stablex.cloud, did not resolve when checked on 2026-11-11, so its stellar.toml cannot be read: neither the issuer of record nor the toml's listing of the account can be checked.",
		useCountryFlag: true,
	},
	{
		code: "ARST",
		issuer: "GCSAZVWXZKWS4XS223M5F54H2B6XPIIXZZGP7KEAIU6YSL5HDRGCI3DG",
		domain: "settlenetwork.com",
		company: "Settle Network",
		peg: "ARS",
		assetType: "Unclassified",
		assetTypeSource: {
			url: null,
			checkedOn: "2026-11-11",
			note: "Checked 2026-11-11: the issuer's stellar.toml says ARST displays transactions in Argentine pesos and names no backing, the reserve audit it links (anchors.relay.vision/audits/ARST-Audit-No-1.pdf) redirects to itself and cannot be read, and Settle Network's site names ARST without saying what backs it.",
		},
		useCountryFlag: true,
	},
	{
		code: "mZAR",
		issuer: "GCBNWTCCMC32UHZ5OCC2PNMFDGXRVPA7MFFBFFTCVW77SX5PMRB7Q4BY",
		domain: "mesh.trade",
		company: "Mesh Trade",
		peg: "ZAR",
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://mzar.co.za/",
			checkedOn: "2026-11-11",
			note: "Mesh states mZAR is backed by South African rand, minted 1:1 against ZAR held in a segregated account at its partner bank, with monthly third-party audits.",
		},
		// Was a Replit-local /attached_assets path — dead once that host is
		// gone. Falls through to the domain's TOML logo instead.
	},
	{
		code: "SBC",
		issuer: "GCQCNWT22JDLENQAVIE6DRJGHWAQ6EX2H5ABGPV55EJUPPZM5UA7KHZR",
		domain: "brale.xyz",
		company: "Brale",
		peg: "USD",
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://brale.xyz/stablecoins/SBC",
			checkedOn: "2026-11-11",
			note: "Brale states SBC is fully backed by cash, cash equivalents and short-duration US Treasuries and always redeemable 1:1 for US dollars.",
		},
	},
	{
		code: "MXNe",
		issuer: "GCQCNWT22JDLENQAVIE6DRJGHWAQ6EX2H5ABGPV55EJUPPZM5UA7KHZR",
		domain: "brale.xyz",
		company: "Brale",
		peg: "MXN",
		assetType: "Unclassified",
		assetTypeSource: {
			url: null,
			checkedOn: "2026-11-11",
			note: "Checked 2026-11-11: Brale's MXNe page (brale.xyz/stablecoins/MXNe) speaks of decentralized pegging and names MXN as the reserve currency without saying what the reserve holds, and its launch post (brale.xyz/blog/introducing-mxne) says MXNe is minted and redeemed 1:1 against USDC or USDP.",
		},
	},
	{
		// Same ticker as Circle's EURC, different issuer — they are DIFFERENT
		// assets and must never be merged. Identity is (code, issuer).
		code: "EURC",
		issuer: "GAQRF3UGHBT6JYQZ7YSUYCIYWAF4T2SAA5237Q5LIQYJOHHFAWDXZ7NM",
		domain: "mykobo.co",
		company: "MyKobo",
		peg: "EUR",
		assetType: "Unclassified",
		assetTypeSource: {
			url: null,
			checkedOn: "2026-11-11",
			note: "Checked 2026-11-11: the issuer's stellar.toml calls it an asset-backed token pegged 1:1 to the euro without naming the asset, the attestations page it links (www.mykobo.co/attestations/) answers 404, and mykobo.co describes euro ramps, not this token's reserve.",
		},
	},
	{
		code: "PEN",
		issuer: "GA4TDPNUCZPTOHB3TKUYMDCRVATXKEADH7ZEYEBWJKQKE2UBFCYNBPEN",
		domain: "anclap.com",
		company: "Anclap",
		peg: "PEN",
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://home.anclap.com/",
			checkedOn: "2026-11-11",
			note: "Anclap states its tokens are backed 1 to 1 with the local currency, one unit of it deposited in a financial institution for each token in circulation.",
		},
	},
	{
		code: "ARS",
		issuer: "GCYE7C77EB5AWAA25R5XMWNI2EDOKTTFTTPZKM2SR5DI4B4WFD52DARS",
		domain: "anclap.com",
		company: "Anclap",
		peg: "ARS",
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://home.anclap.com/",
			checkedOn: "2026-11-11",
			note: "Anclap states its tokens are backed 1 to 1 with the local currency, one unit of it deposited in a financial institution for each token in circulation.",
		},
	},
	{
		code: "NGNC",
		issuer: "GASBV6W7GGED66MXEVC7YZHTWWYMSVYEY35USF2HJZBLABLYIFQGXZY6",
		domain: "ngnc.online",
		company: "LINK.IO LTD.",
		peg: "NGN",
		assetType: "Unclassified",
		assetTypeSource: {
			url: null,
			checkedOn: "2026-11-11",
			note: "Checked 2026-11-11: the issuer's stellar.toml calls NGNC an asset-backed token pegged 1:1 to the naira without naming the asset, www.linkio.africa failed its TLS handshake, and ngnc.online served an app shell with no text.",
		},
		fallbackImageUrl:
			"https://stellar.myfilebase.com/ipfs/QmWcALoB3itEx487drMWRjseqKR837NLhSsQcMAGBVeBxt",
	},
	{
		// Found by the DeFiLlama reconciliation (2026-09-03) — they carried it
		// and we did not. Chain closes: issuer home_domain = www.ylds.com, and
		// that toml declares this exact code+issuer under ORG_NAME "Figure
		// Certificate Company", is_asset_anchored with anchor_asset_type
		// "fiat". Its own description: "the first SEC-registered,
		// yield-bearing stablecoin". Same shape as USDY below — a yield
		// instrument rather than a pure peg — and labelled as such.
		//
		// TWO DECOYS on this code, both rejected: a second YLDS issuer
		// (GBAQLB2Z…) claims 8.6 BILLION supply on 2 trustlines with
		// home_domain stellarxlm.online — a fake-issuer farm, the same pattern
		// that got WisdomTree and Spiko excluded. Identity here is (code,
		// issuer); the ticker alone would have picked the wrong one.
		code: "YLDS",
		issuer: "GAC7MOPTQLQUM3KC24AW4GHS3RLF72LPEZO54AH7EZ6TSMGRB5SOAVH3",
		domain: "www.ylds.com",
		company: "Figure Certificate Company",
		peg: "USD",
		assetType: "Yield Stablecoin",
		assetTypeSource: {
			url: "https://www.ylds.com",
			checkedOn: "2026-11-11",
			note: "Figure states YLDS is a yield-bearing stablecoin that accrues a variable yield daily.",
		},
		// The mark the owner chose (2026-09-03) is the same one the toml
		// declares — Figure's purple circle icon. The toml path resolves it
		// locally, but the first live refresh served no logo for this row, so
		// it is pinned here too: the toml still wins when it loads, and this
		// guarantees the mark when that fetch fails on the runner. Verified
		// 200 image/svg+xml with the pipeline's own user agent.
		fallbackImageUrl:
			"https://cdn.figure.com/frontend-markets/apps/ylds-marketing/ylds-circle-icon.svg",
		// Yield is paid out rather than accrued into the unit, so this prints
		// at ~par today. Declared anyway: what makes the price measurable is
		// that the unit is not a plain peg, not that it currently drifts.
		marketPrice: { source: "coingecko", id: "ylds" },
	},
	{
		code: "USDY",
		issuer: "GAJMPX5NBOG6TQFPQGRABJEEB2YE7RFRLUKJDZAZGAD5GFX4J7TADAZ6",
		domain: "ondo.finance",
		company: "Ondo Finance",
		peg: "USD",
		assetType: "Yield Stablecoin",
		assetTypeSource: {
			url: "https://ondo.finance/usdy",
			checkedOn: "2026-11-11",
			note: "Ondo states USDY is a yield-bearing token secured by US Treasuries that accrues yield daily.",
		},
		// Accrual token: one unit buys into a Treasury portfolio and its NAV
		// climbs. $1.14 on 2026-09-09 — pricing it at the peg was a 14% miss.
		marketPrice: { source: "coingecko", id: "ondo-us-dollar-yield" },
	},
	{
		// Owner-requested twice, and it belongs here for consistency: this is
		// the same SHAPE as USDY directly above — a token backed by short-dated
		// US Treasuries rather than a fiat reserve — and we already carry that
		// one. (The 2026-09-02 sweep excluded it as "a bond, not a peg" while
		// USDY sat in the roster; that was the inconsistency, not this row.)
		//
		// What it is: the Republic of the Marshall Islands' own token, issued
		// for a basic-income programme, backed 1:1 by short-dated US Treasuries
		// per SDF's launch announcement.
		//
		// Domain corrected 2026-09-03: the row first shipped with "usdm.io",
		// which I had not checked — it does not resolve at all. The real site
		// is usdm1.com, which describes the instrument in its own words as a
		// "sovereign-issued, US dollar-denominated, Treasury-backed financial
		// instrument", a Brady-style bond under New York law, serving as the
		// disbursement channel for a nationwide basic-income programme. It
		// serves NO stellar.toml (404), so the logo below is their own
		// brandmark from that site rather than a toml-declared image.
		//
		// TWO THINGS A READER SHOULD KNOW, both verified 2026-09-02 and both
		// the reason it is labelled rather than presented as a plain
		// stablecoin. First, the issuer account publishes NO `home_domain`, so
		// the toml→Horizon→home_domain reversal every other row here passes
		// cannot be run: identity rests on SDF's published announcement naming
		// this exact issuer, which is weaker evidence than a self-declared
		// toml, and `domain` below is the programme's site rather than a
		// verified anchor. Second, it is small and concentrated: ~1.11M issued
		// across 28 trustlines, with a single account holding ~995k of it
		// (90%). Both facts stay true of the row until re-measured.
		//
		// The first no longer holds: on 2026-10-22 the issuer account set its
		// home_domain to usdm1.com, whose stellar.toml (read 2026-11-11) lists
		// the account under ORG_NAME "Republic of the Marshall Islands". The
		// issuer of record is read from there like every other row's, and the
		// note below no longer says the toml is missing.
		code: "USDM1",
		issuer: "GDM5QWWXCMDTQMZAKMYTCI52LA7FWBHAZMU5NJLMIFHDJISJRP2ZWPKC",
		domain: "usdm1.com",
		company: "Republic of the Marshall Islands",
		peg: "USD",
		assetType: "Treasury-Backed",
		assetTypeSource: {
			url: "https://usdm1.com",
			checkedOn: "2026-11-11",
			note: "The issuer's site describes USDM1 as a sovereign US dollar bond secured 1:1 by US Treasury instruments in bankruptcy-remote custody, with par redemption and a sovereign coupon, and says it is not a stablecoin.",
		},
		fallbackImageUrl:
			"https://cdn.prod.website-files.com/68d09a463613af43eb102966/6a69289f7e793aeb116fdd79_usdm1-brandmark-avatar.png",
		note: "Sovereign token for a basic-income programme, backed by short-dated US Treasuries; its own site calls it a sovereign Brady-style bond under New York law, not a fiat-redemption claim. ~1.11M issued across 28 trustlines with one account holding ~90% (verified 2026-09-02).",
		// A bond issued at par, not a redemption-at-$1 claim; it trades above
		// par as it accrues ($1.016 on 2026-09-09).
		marketPrice: { source: "coingecko", id: "usdm1" },
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
		// Zeam's USD sibling to the ZARZ row already here. toml status
		// "live"; redeemable for fiat USD via the Zeam app (checked
		// 2026-09-02: 181,060 trustlines, ~310,000 issued).
		code: "USDZ",
		issuer: "GAKTLPC4ZV37SSCITQ5IS5AQ4WPF4CF4VZJQPPAROSGXMYOATF5U6XPR",
		domain: "zeam.money",
		company: "Zeam",
		peg: "USD",
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://zeam.money/.well-known/stellar.toml",
			checkedOn: "2026-11-11",
			note: "Zeam's stellar.toml says USDZ is 1:1 backed by fiat and redeemable for fiat USD from the Zeam app. Its transparency page, zeam.money/transparency, refused automated reads (HTTP 403), and the toml's anchor fields, which say crypto, are not used.",
		},
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
		assetType: "Multi-Asset-Backed",
		assetTypeSource: {
			url: "https://montelibero.org/eurmtl_offer/",
			checkedOn: "2026-11-11",
			note: "The EURMTL offer says the issuer holds reserves of at least 150% of issuance in euro cash, cryptocurrencies and other liquid assets, and exchanges EURMTL 1:1 for euro cash in Montenegro within 48 hours.",
		},
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
		assetType: "Yield Stablecoin",
		assetTypeSource: {
			url: "https://montelibero.org/2023/05/12/usdm_token_public_offer/",
			checkedOn: "2026-11-11",
			note: "The USDM public offer says the issuer exchanges USDM 1:1 for Circle's USDC on Stellar and invests the proceeds in short-term projects, paying part of the income to holders at least monthly.",
		},
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
		assetType: "Multi-Asset-Backed",
		assetTypeSource: {
			url: "https://valtorum.com/",
			checkedOn: "2026-11-11",
			note: "Valtorum calls USDV a synthetic stable dollar backed by a diversified reserve of stablecoins, gold, government bonds, tokenized Treasuries and crypto collateral.",
		},
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
	// source before it can sit beside USDC. EURAU is a Soroban CONTRACT token
	// (no classic issuer), which this registry cannot express yet.
	//
	// EURCV — re-checked 2026-09-03 after DeFiLlama's list showed them
	// carrying it. The earlier "Soroban contract" reasoning was wrong: there
	// are THREE classic EURCV issuers on Stellar, and the problem is telling
	// them apart. The largest claims 2.99 BILLION euro on 18 trustlines with
	// home_domain xmintstellar.org (a domain that does not resolve) — a
	// fake-issuer farm. A third holds zero. The plausible one (GCEYGIVO…,
	// ~15.03M, close to DeFiLlama's figure) publishes NO home_domain, and SG
	// Forge's own site does not mention Stellar or publish any issuer address,
	// so nothing ties that account to Société Générale except a third party's
	// say-so. Carrying it would mean asserting an identity we cannot check on
	// a code that demonstrably has impostors — exactly the failure the
	// (code, issuer) rule exists to prevent. Stays out until SG Forge (or an
	// SDF announcement) publishes the address.
	// KTB, MEX, NZDSC, CETESZ are live but effectively unissued (<40 holders,
	// ~0 supply).
	//
	// USDM1: NOW CARRIED (see its row above). This block used to exclude it
	// as "a bond, not a fiat peg" — but USDY, a Treasury-backed yield token
	// of the same shape, was already in the roster, so the rule was being
	// applied to one and not the other. The row above carries it WITH the two
	// facts that make it unusual: no home_domain published by the issuer, and
	// ~90% of supply in a single account.
	{
		// 181,426 holders · 6,405,270 ZARZ authorized (Horizon, 2026-08-22).
		// Issuer from zeam-money's own stellar.toml.
		code: "ZARZ",
		issuer: "GAROH4EV3WVVTRQKEY43GZK3XSRBEYETRVZ7SVG5LHWOAANSMCTJBB3U",
		domain: "zeam.money",
		company: "Zeam",
		peg: "ZAR",
		assetType: "Fiat-Backed",
		assetTypeSource: {
			url: "https://zeam.money/.well-known/stellar.toml",
			checkedOn: "2026-11-11",
			note: "Zeam's stellar.toml says ZARZ is a 1:1 fiat-backed rand stablecoin redeemable for fiat ZAR from the Zeam app. Its transparency page, zeam.money/transparency, refused automated reads (HTTP 403).",
		},
	},
	{
		// 5,795 holders · 14,389,575 CLPX authorized (Horizon, 2026-08-22).
		// Issuer from clpx's own stellar.toml.
		code: "CLPX",
		issuer: "GDYSPBVZHPQTYMGSYNOHRZQNLB3ZWFVQ2F7EP7YBOLRGD42XIC3QUX5G",
		domain: "clpx.finance",
		company: "CLPX",
		peg: "CLP",
		assetType: "Crypto-Backed",
		assetTypeSource: {
			url: "https://clpx.finance",
			checkedOn: "2026-11-11",
			note: "CLPX states it is backed 1 to 1 by the dollar stablecoin USDC. Its page also says 'Trade with stable tokens and earn daily interest on your balance'. It names no rate, payer or mechanism and does not say the interest accrues to or is paid on CLPX, which it pegs 1 to 1 to the Chilean peso, so the class records the backing, not yield.",
		},
	},
	// BRL (nTokens) — REMOVED 2026-09-03, on the issuer's own notice. Their
	// site now leads with "Critical Information: BRL Discontinued": per terms
	// set at issuance in 2019 and restated since June 2024, withdrawal to
	// fiat reais is "not ensured after Jan 1st 2026" and remaining balances
	// on Stellar are "subject to administrative costs, clawbacks and
	// unilateral" action. An asset its own issuer has discontinued, and will
	// not redeem, is not a stablecoin this registry should carry — the same
	// rule that retired UAH. Dropping the entry stops the measurement; the
	// next refresh stamps `retiredAt`, which keeps the history.
	// (Settle Network's BRLT, a different issuer, is unaffected.)
	{
		// 1,801 holders · 161,220,533 APSUSDM authorized (Horizon, 2026-08-22).
		// Issuer from aps-money's own stellar.toml.
		code: "APSUSDM",
		issuer: "GB7OUO5NY5WQKXJJ7PFFZEJOKN4BA7IOEN3Z6SWAY26LGTREJJYZH2ZT",
		domain: "aps.money",
		company: "APS Money",
		peg: "USD",
		assetType: "Unclassified",
		assetTypeSource: {
			url: null,
			checkedOn: "2026-11-11",
			note: "Checked 2026-11-11: the issuer's stellar.toml calls it fully collateralized without naming the collateral, and aps.money says nothing about what backs it.",
		},
	},
	{
		// 362 holders · 27,885,917 APSEURM authorized (Horizon, 2026-08-22).
		// Issuer from aps-money's own stellar.toml.
		code: "APSEURM",
		issuer: "GB7OUO5NY5WQKXJJ7PFFZEJOKN4BA7IOEN3Z6SWAY26LGTREJJYZH2ZT",
		domain: "aps.money",
		company: "APS Money",
		peg: "EUR",
		assetType: "Unclassified",
		assetTypeSource: {
			url: null,
			checkedOn: "2026-11-11",
			note: "Checked 2026-11-11: the issuer's stellar.toml calls it fully collateralized without naming the collateral, and aps.money says nothing about what backs it.",
		},
	},
	// UAH — REMOVED 2026-09-02 (owner decision), and the reason is the
	// operator's own words rather than our judgement. Transparent Network's
	// toml at dcm.systems says of this asset: "UAH is not a stablecoin; the
	// token is not tradable and is available only for authorized accounts of
	// participating financial institutions." A registry of fiat-pegged
	// stablecoins should not carry an asset whose issuer says it is neither
	// a stablecoin nor tradable — the same rule that keeps out wrappers,
	// synthetics and bonds. Dropping it here stops the measurement; the next
	// refresh stamps `retiredAt` on the stored row, which preserves its
	// history and never claims the issuer stopped issuing it.
	// GBPZ (Zeam): REMOVED 2026-11-11, on the issuer's own words. Zeam's
	// stellar.toml (zeam.money, read 2026-11-11) calls it a "Zeam Pound
	// Stirling Derivative" and says "GBPZ is not redeemable for fiat": a
	// synthetic with no redemption claim, which this registry keeps out
	// (sUSD, 2026-09-02; UAH). Dropping the entry stops the measurement; the
	// next refresh stamps `retiredAt`, which keeps the history.
];

/**
 * Why each asset the registry stopped tracking left it, keyed by
 * stablecoinId: the issuer's own words in short, where they were read and
 * the day the entry was dropped. The refresh stamps `retiredAt` on the
 * stored row; the API stops serving it from deploy, and its page says why.
 */
export const STABLECOIN_RETIREMENTS: Record<
	string,
	{ retiredOn: string; reason: string; sourceUrl: string }
> = {
	"UAH-GCJI3CP2": {
		retiredOn: "2026-09-02",
		reason:
			"Its issuer's stellar.toml says UAH is not a stablecoin, is not tradable and is available only to authorized accounts of participating financial institutions.",
		sourceUrl: "https://dcm.systems/.well-known/stellar.toml",
	},
	"BRL-GDVKY2GU": {
		retiredOn: "2026-09-03",
		reason:
			"Its issuer's site announced BRL discontinued: withdrawal to fiat reais is not ensured after 1 January 2026.",
		sourceUrl: "https://ntokens.com",
	},
	"ZUSD-GDF6VOEG": {
		retiredOn: "2026-11-11",
		reason:
			"Its issuer, GMO-Z.com Trust Company, has wound down issuance; its stellar.toml says the initial 1:1 redemption period ran from 15 May to 11 November 2026.",
		sourceUrl: "https://stablecoin.z.com/.well-known/stellar.toml",
	},
	"GYEN-GDF6VOEG": {
		retiredOn: "2026-11-11",
		reason:
			"Its issuer, GMO-Z.com Trust Company, has wound down issuance; its stellar.toml says the initial 1:1 redemption period ran from 15 May to 11 November 2026.",
		sourceUrl: "https://stablecoin.z.com/.well-known/stellar.toml",
	},
	"VEUR-GDXLSLCO": {
		retiredOn: "2026-11-11",
		reason:
			"VNX no longer offers exchange services for VEUR and no longer lists it among its stablecoins: VNX Commodities AG's notice of 2026-04-22 said its exchange services of VEUR 'will be fully discontinued', with holders to settle by 22 May 2026, and VNX's stablecoins page (read 2026-11-11) lists only VCHF and VGBP.",
		sourceUrl: "https://vnx.li/blog",
	},
	"GBPZ-GCTG4YT2": {
		retiredOn: "2026-11-11",
		reason:
			"Its issuer's stellar.toml calls GBPZ a pound sterling derivative that is not redeemable for fiat, a synthetic this registry does not carry.",
		sourceUrl: "https://zeam.money/.well-known/stellar.toml",
	},
};

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
