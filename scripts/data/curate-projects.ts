/** READ-ONLY by default. Targeted, owner-reviewed edits to project records —
 * the projects counterpart to curate-partners.ts. Only touches the exact slugs
 * listed below; never bulk-edits.
 *
 *   pnpm exec tsx scripts/data/curate-projects.ts            # dry run
 *   pnpm exec tsx scripts/data/curate-projects.ts --execute  # writes
 *
 * DESCRIPTION_FIXES — overwrite shortDescription for a specific slug. Used to
 * close directory-omission findings where a record's prose is stale/incomplete
 * (e.g. sls-017: LOBSTR's record omitted its XRP Ledger support, so a consumer
 * synthesizing from directory data alone concluded "Stellar-only" by omission).
 * Every value is grounded in the provider's own current site copy — no
 * fabrication.
 */
import { getPayload } from "payload";
import configPromise from "../../src/payload.config";
import { SEEDS, STATUS_FIX, WEBSITE_FIXES } from "./curation-maps";

const EXECUTE = process.argv.includes("--execute");

const DESCRIPTION_FIXES: Record<string, string> = {
	// sls-030: represent the funded-historical + embedded-implementation truth.
	comet:
		"Comet was a Balancer-style weighted-pool AMM on Soroban, SCF-funded in rounds 13 and 18 ($291K). The standalone venue is no longer maintained; its weighted-pool implementation lives on embedded as Blend's 80/20 BLND:USDC backstop pool on mainnet.",
	// S1 prose⇄structure divergence (2026-07-11 engine run): these two
	// descriptions asserted chains the records' CURATED supportedNetworks
	// (verified from primary sources 2026-07-09) do not carry. The prose was
	// the overclaiming side — fixed here rather than adding unverified
	// networks (precision over recall).
	helix:
		"Institutional staking infrastructure by Helix Labs. The protocol is currently live only on Canton — Stellar integration is on the roadmap, not launched. Helix Labs separately operates validator infrastructure across major L1 ecosystems.",
	"templar-protocol":
		"Templar is a decentralized 'cypher lending' protocol that lets Stellar users borrow USDC against XLM collateral directly from their Stellar wallets, without bridges or wrapped tokens. It uses NEAR's multi-party-computation (MPC) network and Chain Signatures to custody deposits and settle cross-chain. On Stellar the collateral asset is XLM; Bitcoin-collateral and Ethereum/NEAR markets exist on its other deployments. The Stellar integration was announced November 2025.",
	// boxy 2026-07-09: CCTP entry read like a bridge product; it's the RAIL.
	// An agent answering "how do I bridge USDC to Stellar" should name CCTP
	// as the mechanism and a bridge built on it as the actionable route.
	"circle-cctp-cross-chain-transfer-protocol":
		"Circle's Cross-Chain Transfer Protocol (CCTP), live on Stellar since May 2026. Moves native USDC between Stellar and 23+ chains (Ethereum, Solana, Base, Arbitrum, Optimism) via a 1:1 burn-and-mint model rather than wrapped or locked assets, settling in seconds. CCTP is bridging INFRASTRUCTURE, not a user-facing bridge: there is no Circle-hosted bridge app — builders integrate it (and pass execution metadata via Hooks), and end-users move USDC through bridges built on it, e.g. Rozo's Intent Bridge on Stellar.",
	// sls-017: lobstr.co self-describes as a "Stellar & XRPL Wallet" (by Ultra
	// Stellar); the record previously said "Stellar wallet" only.
	lobstr:
		"LOBSTR is a widely used non-custodial wallet for the Stellar and XRP Ledger (XRPL) networks, by Ultra Stellar, on iOS, Android, web and a browser extension. Users hold, send, receive, buy and swap XLM, USDC, XRP and network assets, make peer-to-peer payments, trade on the DEX/SDEX, use fiat on/off-ramps, and claim a federation address (username*lobstr.co). LOBSTR Vault adds multisig.",
	// raven#8 / sls-018 (data half): the record described only the flagship
	// Stablebonds product; Etherfuse FX — their Mexico USDC↔MXN on/off-ramp
	// API (etherfuse/ramp-api-example; wholesale bps-level pricing per their
	// public docs) — was invisible prose-wise. Multi-product companies get
	// BOTH products named so neither is hidden behind the dominant one.
	etherfuse:
		"Etherfuse is a multi-product company on Stellar: it issues Stablebonds — tokenized government treasury bonds (Mexican CETES, US Treasuries and others) that give yield-bearing onchain exposure to sovereign debt and underpin treasury-management apps such as Bando — and operates Etherfuse FX, a Mexico fiat on/off-ramp API for programmatic USDC↔MXN conversion at wholesale bps-level pricing, built for wallets and apps to integrate.",
	// raven#18 (mmazco, 2026-07-09): Alchemy's Stellar Data API is now LIVE
	// but the record predated it (RPC-only prose). Grounded in Alchemy's own
	// docs (alchemy.com/docs/reference/stellar-api-quickstart + stellar-data-
	// api-overview) and SDF's indexers-page language (stellar-docs PR #2573).
	// Tier-1 validator: boxy-confirmed 2026-07-10 + Alchemy's own blog
	// ("Alchemy expands support on Stellar with Data APIs and Tier-1
	// validation … Alchemy is now a tier-1 validator on Stellar", announced
	// x.com/Alchemy/status/2074907730129883195, 2026-07-08) + listed on the
	// official tier-1-orgs docs page and the node explorer (boxy-verified —
	// an earlier note here claimed the docs page lacked them; that was a
	// false negative from a text-strip curl of a data-rendered page).
	alchemy:
		"Alchemy is an enterprise-grade Web3 developer platform live on Stellar and a tier-1 validator on the network (per Alchemy's own announcement, mid-2026). Two products for builders: managed Stellar/Soroban JSON-RPC (mainnet + testnet endpoints, Horizon access, dedicated nodes; listed on the official developers.stellar.org RPC providers page) and the Stellar Data API — indexed transfer history, account balances, and NFT holdings across native, Stellar Classic, and Soroban assets, so builders can query portfolio-style data without running their own indexer.",
	// sls-024 recurrence (#533 batch): the record claimed "iOS and Android
	// mobile apps" while neither store lists the app — the Play listing for
	// app.xbull.mobile (the applicationId in Creit-Tech/xBull-Wallet's own
	// capacitor.config.ts / android build.gradle) returns 404 and an App
	// Store bundleId lookup returns 0 results (both checked 2026-07-13).
	// The product IS live: xbull.app (web wallet, HTTP 200) and the Chrome
	// Web Store extension (HTTP 200), both verified 2026-07-13 — so the
	// stale platform claim is removed instead of the status.
	xbull:
		"xBull is an open-source, non-custodial Stellar wallet by Creit Tech, available as a browser extension and web app. Users hold, send, receive, and swap XLM and Stellar assets, manage multiple accounts, and sign Stellar and Soroban dApp transactions. Widely integrated as a wallet-connect option across Stellar dApps. Its formerly listed iOS and Android store apps are no longer available on either app store (store listings checked 2026-07-13).",
};

// Docs pointers (fill-if-empty links.docs). Policy answer to raven#18's
// "should the data layer ingest partner docs?": NO — provider reference
// docs are agent-readable at SOURCE (Alchemy ships llms.txt) and a corpus
// copy would go stale (the class-19 hazard) while duplicating what the
// provider already serves agents. Our differentiated role is the STRUCTURED
// record (who provides what, freshness, confidence) + a first-class pointer
// so consumers hop straight to the living source.
const DOCS_LINKS: Record<string, string> = {
	alchemy: "https://www.alchemy.com/docs/reference/stellar-api-quickstart",
};

// sls-025: ADDITIVE `github.repos` rows (owner/name) for records whose
// links.github points at a BIG org — enrich-repos keyword-gates large orgs
// (only repo names matching "stellar" survive), so a Stellar-relevant repo
// with a non-stellar name is invisible to discovery even though its org is
// linked. Merges missing pairs, never removes; enrich-repos indexes them on
// its next sweep. Each row is hand-verified against the repo's own README.
const GITHUB_REPOS_ADD: Record<
	string,
	Array<{ owner: string; name: string }>
> = {
	// GT-18 x402 probe list names relayer-plugin-x402-facilitator; the repo's
	// README (verified 2026-07-13) is Stellar-first: "x402 facilitator API
	// implemented as a Relayer plugin (Stellar support today)", networks
	// stellar:testnet, type "stellar" (current support). The openzeppelin
	// record links github.com/openzeppelin (org, >>20 repos → keyword gate),
	// and the repo name lacks "stellar" — hence the recall zero.
	openzeppelin: [
		{ owner: "OpenZeppelin", name: "relayer-plugin-x402-facilitator" },
	],
};

// raven#8 / sls-018 (data half): multi-product projects are indexable under
// EVERY capability they demonstrably have, not a single dominant category.
// ADDITIVE — merges into `types`, never removes. Grounded in the provider's
// own products (Etherfuse FX = a live Mexico on/off-ramp API).
const TYPES_ADD: Record<string, string[]> = {
	etherfuse: ["Anchor"],
	// boxy 2026-07-09: Rozo's Intent Bridge is a LAUNCHED product ("USDC and
	// USDT across Base, Stellar, Solana, Ethereum, BNB" — rozo.ai homepage,
	// linked not coming-soon; Hacken audit of ROZO Intents in our corpus).
	// Typed Payments-only, so every bridge/EVM query missed it — the same
	// multi-product secondary-capability class as etherfuse (sls-018).
	rozo: ["Bridge"],
	// boxy 2026-07-09: CCTP is bridging INFRA (burn-and-mint rail bridge
	// builders integrate), not a user-facing bridge app. Keep Bridge so
	// corridor queries still learn it exists; add the taxonomy truth.
	"circle-cctp-cross-chain-transfer-protocol": ["Infrastructure"],
	// raven#18: the Stellar Data API is a portfolio/indexer product (SDF's own
	// indexers page classifies it there) — RPC-only typing hid it from every
	// indexer/portfolio-API query. Same multi-product class as etherfuse.
	alchemy: ["Indexer"],
};

/** EXACT-SYNC types for curated slugs — the corrective sibling of TYPES_ADD.
 * Use when a record carries a WRONG type (self-audit #414: 12 records typed
 * Bridge with empty supportedNetworks — most were mis-typed oracles/wallets/
 * security tools, so "Bridge" broke the bridge-corridor ground-truth check
 * and polluted Bridge browses). Each row = the record's full verified types. */
/** SCF fact corrections vs the OFFICIAL communityfund project pages (sls-027/
 * sls-030, dual-lane verified by our consumer 2026-07-10). Overwrites the scf
 * group for listed slugs — the official page is the source of truth. */
const SCF_FIX: Record<
	string,
	{ awarded: boolean; totalAwarded: number; awardedRounds: number[] }
> = {
	// sls-027: official page shows 7 submissions, 4 AWARDED (#16 $150K, #20
	// $100K, #25 $94.5K + Q1-2024 Liquidity $50K); #18/#24 explicitly NOT
	// awarded. Total was right, membership wasn't.
	phoenix: { awarded: true, totalAwarded: 394500, awardedRounds: [16, 20, 25] },
	// sls-026: live said $391K + rounds [17,23,27,30]; official = $291K PAID,
	// round 30 marked Ineligible. Paid awards only.
	aquarius: {
		awarded: true,
		totalAwarded: 291000,
		awardedRounds: [17, 23, 27],
	},
	// sls-030: official pages show $150K (r13) + $141K (r18); record said false.
	comet: { awarded: true, totalAwarded: 291000, awardedRounds: [13, 18] },
	// sls-043: the canonical band row claimed SCF #41 / $100K while the alias
	// row (band-protocol, merged 2026-07-10 S3b wave) carried the OFFICIAL
	// facts. communityfund.stellar.org/project/band-protocol-2ob (read
	// 2026-07-11): ONE awarded submission — "Band Protocol Oracle Solution,
	// SCF #16, $60.0K, Legacy v4.0 Award, Awarded"; Total awarded $60.0K.
	// No round-41 award exists on the official record, so the canonical row's
	// #41/$100K had no source and contradicted its own shadow.
	band: { awarded: true, totalAwarded: 60000, awardedRounds: [16] },
	// ── ambiguous-13 wave (2026-07-11, scf-membership-postwave
	// roundsOverstated) ── each record claimed rounds whose submissions the
	// official page marks with NEGATIVE verdicts the fix-wave parser doesn't
	// read ("Prescreen Failed" / "Rejected - timeout" / "Panel Review Failed"
	// / "Ineligible") — hand-verified per record against the page's RENDERED
	// submission cards AND the official SCF round recaps
	// (medium.com/stellar-community, full awardee lists). Every total below
	// equals the already-stored value AND reconciles exactly with the
	// per-round recap amounts — these rows change ROUNDS only.
	// page grantfox-4zq: #40 Awarded, #38 Not Awarded, #37 Prescreen Failed;
	// SCF #40 recap lists "Grant Fox — $60,000" = page total $60.0K; absent
	// from the #37 recap's full 19-project list.
	grantfox: { awarded: true, totalAwarded: 60000, awardedRounds: [40] },
	// page cartwey-aku: #38 Awarded, #35 Prescreen Failed, #34 Not Awarded;
	// #38 recap lists Cartwey $60,000 = page total $60.0K; absent from the
	// #35 recap's full 21-project list.
	cartwey: { awarded: true, totalAwarded: 60000, awardedRounds: [38] },
	// page freedom-pay-wallet-umi: #38 Awarded, #30/#31 Prescreen Failed,
	// #22 Not Awarded (Kickstart #9 card is non-numeric "Information
	// Collection"); #38 recap lists Freedom Pay Wallet $150,000 = page total;
	// absent from the #30 and #31 recaps' full 22-project lists.
	"freedom-pay-wallet": {
		awarded: true,
		totalAwarded: 150000,
		awardedRounds: [38],
	},
	// page alternun-16y: #27 Awarded (card: Legacy v5.0 Activation Award,
	// budget 32000 = page total $32.0K), #30 Prescreen Failed, #37 Not
	// Awarded, #40 "Rejected - timeout" (same verdict on its own
	// communityfund awards-record page); absent from the #30/#37/#40 recap
	// full lists.
	alternun: { awarded: true, totalAwarded: 32000, awardedRounds: [27] },
	// page nobak-ncp: #23 Awarded, #31 Not Awarded, and NO #8 card at all;
	// the official "Announcing the winners of SCF#8" post (11 winners) does
	// NOT include Nobak; #23 recap: "Nobak: Custodial Wallet Signer —
	// $34,500" = page total $34.5K.
	nobak: { awarded: true, totalAwarded: 34500, awardedRounds: [23] },
	// page sorobanhooks-slr: Awarded ONLY #33 ($25.0K) + #37 ($30.0K) = page
	// total $55.0K; #31(x2)/#32/#41/#42 Not Awarded or Prescreen Failed, #39
	// Prescreen Failed; recap amounts match (#33 $25,000 + #37 $30,000) and
	// it is absent from the #31/#32/#39/#41/#42 recap full lists.
	sorobanhooks: { awarded: true, totalAwarded: 55000, awardedRounds: [33, 37] },
	// identity: our surgepay (surgepay.tech) = page surgepay-e9w (site
	// www.surgepay.tech); the other listing match (surge-pay-jze) is a
	// different zero-award record (only a Kickstart #10 "Information
	// Collection" card). Page: #41 Awarded, #38/#40 Not Awarded, #36
	// Prescreen Failed; #41 recap lists SurgePay $115,000 = page total;
	// absent from the #36/#38/#40 recap full lists.
	surgepay: { awarded: true, totalAwarded: 115000, awardedRounds: [41] },
	// page joonapay-ego: #41 Awarded, #32/#35 Not Awarded, #30/#31 Prescreen
	// Failed; #41 recap lists JoonaPay $90,000 = page total $90.0K; absent
	// from the #30/#31/#32/#35 recap full lists.
	"joona-pay": { awarded: true, totalAwarded: 90000, awardedRounds: [41] },
	// page airgap-3ht: #35 Awarded, #34 Not Awarded, #44 Prescreen Failed
	// (no #44 recap published yet — the page verdict is the negative);
	// #35 recap lists AirGap $60,000 = page total $60.0K.
	airgap: { awarded: true, totalAwarded: 60000, awardedRounds: [35] },
	// page peerpesa-tjf: #33 Awarded only; #32 Not Awarded, #37/#39/#42/#44
	// Prescreen Failed, #43 Panel Review Failed; #33 recap lists PeerPesa
	// $45,000 = page total $45.0K; absent from the #37/#39/#42/#43 recap
	// full lists (no #44 recap published yet — page verdict).
	peerpesa: { awarded: true, totalAwarded: 45000, awardedRounds: [33] },
	// page sytemap-c7p: #29 Awarded only; #30/#31/#33/#39 Not Awarded,
	// #36/#37 Prescreen Failed; #29 recap lists "HouseAfrica's Sytemap"
	// $35,000 = page total $35.0K; absent from the #30/#31/#33/#36/#37/#39
	// recap full lists.
	sytemap: { awarded: true, totalAwarded: 35000, awardedRounds: [29] },
	// page venerez-bvc: #36 Awarded, #34/#35 Not Awarded, #30 Prescreen
	// Failed (Kickstart #9 card is non-numeric); #36 recap lists Venerez
	// $99,675 = page total $99.7K; absent from the #30/#35 recap full lists.
	venerez: { awarded: true, totalAwarded: 99675, awardedRounds: [36] },
	// page abroad-lxb: #32 + #35 Awarded, #31 Not Awarded, #40 Ineligible
	// (the aquarius paid-awards-only precedent); #32 recap $56,120 + #35
	// recap $93,700 = page total $149,820 EXACTLY; absent from the #40
	// recap's full 24-project list.
	abroad: { awarded: true, totalAwarded: 149820, awardedRounds: [32, 35] },
};

// sls-050: rename continuity — served as the `identity` block and matched as
// exact-name in search. Exact-sync per slug (source-verified renames only).
const IDENTITY_FIX: Record<
	string,
	{ aliases: string[]; renamedAt?: string; renameSourceUrl?: string }
> = {
	// Vesseo is SDF-subsidiary Sunship's consumer USDC wallet, formerly
	// Vibrant (the record's own description + vesseoapp.com; Tyler's P4 H3
	// primary-source extraction cites current material as "the Vesseo app").
	vesseo: {
		aliases: ["Vibrant"],
		renameSourceUrl: "https://vesseoapp.com/",
	},
};

const TYPES_SET: Record<string, string[]> = {
	// #414 bridge-corridor failure: 9 of 12 Bridge-typed/empty-network records
	// were MIS-TYPED (verified against each's own site/docs/GitHub 2026-07-11;
	// evidence per row). Bridge removed; remaining types verified.
	orally: ["Infrastructure", "AI", "SDK", "Security"], // orally.network: oracle service (data feeds/automation), not an asset bridge
	tezoro: ["Lending"], // tezoro.io: yield aggregator over Ethereum lending protocols
	"soroban-optimistic-oracle": ["Infrastructure"], // github stackman27/soo: optimistic-oracle/dispute engine — serves bridges, isn't one
	"unstoppable-wallet": ["Wallet"], // unstoppable.money: multichain wallet; swaps via DEXes, no own bridge
	sorobanhooks: ["Infrastructure", "Analytics", "SDK"], // sorobanhooks.xyz: webhook/notification tooling; moves no assets
	range: ["Security", "Analytics"], // range.org: risk/compliance monitoring — monitors bridges, doesn't move assets
	perun: ["Infrastructure", "SDK"], // polycry.pt: state-channel framework (go-perun + perun-stellar-backend)
	"peridot-finance": ["Lending"], // peridot.finance: cross-chain lending platform — product is lending
	// batch 2 (self-audit re-run surfaced 8 more, mostly 07-10 seeds):
	"volta-circuit": ["Security", "Wallet"], // voltacircuit.com: multi-sig wallet security/controls product
	upwealth: ["AI", "Analytics"], // upwealth.io: AI investment/advisory platform for wealth managers
	swiftex: ["Wallet", "DEX"], // SwiftExWallet README: multichain wallet; bridging via third-party Allbridge
	"stellar-metamask": ["Wallet", "SDK"], // MetaMask Snaps listing: Stellar wallet snap + dapp API
	cyvers: ["Security", "AI"], // cyvers.ai: real-time threat detection platform
	cobo: ["Infrastructure", "Wallet"], // cobo.com: institutional omni-custody / wallet-as-a-service platform — custody, not a bridge
	// sls-035 DEX-taxonomy wave (2026-07-11): the types=DEX cluster mixed real
	// trading venues with aggregators/routers/analytics platforms that run no
	// venue of their own — polluting DEX browses and venue ground-truth checks
	// (the amm→rango class). Each row below is re-typed from the project's OWN
	// primary source (quoted); actual venues and SDEX trading clients were left
	// untouched. Cross-chain swap aggregators keep/carry Bridge — the
	// user-meaningful corridor capability (the rubic #414 precedent) —
	// Stellar-only routers/services go Infrastructure.
	stellarbroker: ["Infrastructure"], // stellar.broker: "Multi-source liquidity swap router for Stellar, providing access to AMMs and Stellar DEX" — routes across venues, runs none
	wowmax: ["Bridge"], // wowmax.exchange: "combines a powerful DEX aggregator with an on-chain copy-trading protocol… trade crypto at the best possible prices across multiple decentralized exchanges" — aggregator, not a venue
	rango: ["Bridge"], // rango.exchange: "a new layer on top of all Bridges and DEXs, working as a Bridge Aggregator and DEX Aggregator at the same time" — router, not a venue
	houdiniswap: ["Bridge"], // houdiniswap.com: "non-custodial liquidity aggregator… sources swap routes from vetted, compliant exchange partners"; explicitly does not pool assets
	rubic: ["Bridge"], // rubic.exchange: "an aggregator of Bridges, Dexs, Intent Protocols, & Private Solutions" (340+ integrations) — routing layer, no own pools
	"dex-tools": ["Analytics"], // dextools.io + info.dextools.io: DeFi charting/pair-explorer/portfolio "data hub"; connects existing wallets, holds no liquidity
	"mobula-labs": ["Analytics", "AI", "SDK"], // mobula.io: "Stream-based, modular & blazing fast APIs powering the best onchain products" — data/API provider, not a venue
	spinach: ["Infrastructure"], // spinach.fi: "Liquidity Competitions — projects earn daily rewards for integrating and growing liquidity" — incentive-campaign platform, not a venue
	// sls-033 (#519) wallet product-kind wave (2026-07-13): the record's own
	// description already says WalletConnect "is not a wallet itself" but an
	// "open connection protocol … a natively supported Stellar Wallets Kit
	// module" — yet types was EMPTY, so the connectivity-protocol-vs-wallet
	// distinction #519 demands existed only in prose (the prose-only-facts bug
	// class) and the record was invisible to every type filter. Typed to the
	// taxonomy truth we have today; the richer per-record productKind enum is
	// a batch-D field.
	walletconnect: ["Infrastructure"], // walletconnect.network: wallet↔dApp connectivity protocol/network — not a wallet product
	// Bridge-cluster mistags (boxy 2026-07-15: "templar is a lending protocol, why
	// is it a bridge"). #414 wave left non-bridge records Bridge-typed. Re-typed
	// from each record's OWN primary source; deliberate aggregators (rubic/rango/
	// houdiniswap/wowmax — routing layers whose corridor capability IS the point)
	// stay Bridge. Frontend /directory reads the same projects.types as the API,
	// so this fixes both surfaces at once.
	"templar-protocol": ["Lending"], // templarfi.org: "the first cypher lending protocol — borrow dollars against Bitcoin"; BTC-collateralized lending, bridgeless (NEAR chain sigs). NOT a bridge.
	pyth: [], // pyth.network: decentralized price-feed ORACLE. Matches the oracle convention (band/reflector/lightecho/dia all carry types=[] + category=Infrastructure); "Bridge" was plain wrong.
	nethermind: ["Infrastructure"], // nethermind.io: blockchain research + engineering firm building core infrastructure — not a bridge.
	"vanna-finance": ["Lending"], // vanna.finance: "composable credit infrastructure — borrow up to 10x undercollateralized credit"; a lending/margin protocol (routes into Soroswap/Aquarius/Blend). NOT a bridge.
	warpdrive: ["Infrastructure"], // warp-drive.xyz: "off-chain execution of bots, oracles, and automation for Stellar/Soroban" — an infra/execution framework (Eigenlayer-backed). NOT a bridge.
};

/** sls-033 (#519): productKind — WHAT KIND of wallet-landscape product each row
 * is, so a consumer can tell an end-user wallet from adjacent tooling (Tyler's
 * exact ask: distinguish hardware wallets, connectivity protocols, wallet SDKs,
 * integration kits, and passkey/smart-account tooling). Enum matches
 * Projects.ts productKind options EXACTLY. Fill-if-different (single value,
 * equality-guarded). Each row grounded in the project's OWN curated description
 * (which is itself primary-source-derived). A slug left OFF this map keeps
 * productKind null = "not yet classified" (NOT "not a wallet") — precision over
 * recall: DEX/DeFi-platform/portfolio-tool/pure-B2B-infra rows (swiftex,
 * hedgepay, equilibre, cobo, openxswitch, lumexo, pakananet, stellarfolio) and
 * the ambiguous hardware-card arculus are deliberately unclassified rather than
 * asserted. */
const PRODUCT_KIND: Record<string, string> = {
	// hardware-wallet — description literally says "hardware wallet"
	ledger: "hardware-wallet", // "Ledger is a hardware wallet designed to securely store…"
	trezor: "hardware-wallet", // "Trezor is a hardware wallet…"
	onekey: "hardware-wallet", // "Open-source hardware and software wallet with Stellar support"
	// wallet-sdk — a library/builder for BUILDING wallets
	spatium: "wallet-sdk", // "open-source Web3 Wallet Builder for businesses"
	// integration-kit — integrating existing wallets into dApps / host wallets
	"simple-signer": "integration-kit", // "in-browser transaction signer that supports different stellar wallets"
	"stellar-metamask": "integration-kit", // "Stellar Integration on MetaMask… MetaMask Snaps Platform" — a snap adding Stellar to an existing wallet
	// smart-account-tooling — passkey / smart-account infrastructure
	"stellar-passport": "smart-account-tooling", // "passkey-secured identity and participation layer"
	"volta-circuit": "smart-account-tooling", // "smart contract-based security protocol… automated asset protection, recovery"
	humantech: "smart-account-tooling", // "keys, wallets, and identity infrastructure for personhood, self-custody"
	// end-user-wallet — a consumer/institutional app users hold funds in
	lobstr: "end-user-wallet",
	xbull: "end-user-wallet",
	freighter: "end-user-wallet",
	hana: "end-user-wallet",
	beans: "end-user-wallet",
	albedo: "end-user-wallet",
	rabet: "end-user-wallet",
	vesseo: "end-user-wallet",
	"solar-wallet": "end-user-wallet",
	"hot-wallet": "end-user-wallet",
	"bitget-wallet": "end-user-wallet",
	klever: "end-user-wallet",
	mpcvault: "end-user-wallet",
	"unstoppable-wallet": "end-user-wallet",
	sollpay: "end-user-wallet",
	sentit: "end-user-wallet",
	freelii: "end-user-wallet",
	"freedom-pay-wallet": "end-user-wallet",
	coca: "end-user-wallet",
	bousol: "end-user-wallet",
	"ben-wallet": "end-user-wallet",
	peer: "end-user-wallet",
	meru: "end-user-wallet",
	lemon: "end-user-wallet",
	"kotani-pay": "end-user-wallet",
	bebop: "end-user-wallet",
	blaze: "end-user-wallet",
	cypher: "end-user-wallet",
	scopuly: "end-user-wallet",
	"neon-wallet": "end-user-wallet",
	bexo: "end-user-wallet",
	akuna: "end-user-wallet",
	stellarport: "end-user-wallet",
	interstellar: "end-user-wallet",
	empowch: "end-user-wallet",
	elsa: "end-user-wallet",
	"boss-revolution": "end-user-wallet",
	"tago-cash": "end-user-wallet",
	ripio: "end-user-wallet",
	emigro: "end-user-wallet",
	nemorixpay: "end-user-wallet",
	airgap: "end-user-wallet", // "turn a spare smartphone into a fully offline cold wallet" — end-user cold wallet app (software, not a hardware product)
};

/** sls-033 (#519): per-platform app availability — DATED, store-checked facts,
 * deliberately separate from lifecycle `status` (a Live project can have a dead
 * store listing — Tyler's own xBull evidence). Shape matches Projects.ts
 * availability{platform,state,storeUrl,checkedAt,note}. EXACT-SYNC for listed
 * slugs. Every `available` row below was curl-verified live on 2026-07-14 (200
 * on the exact surface URL); the xBull ios/android `unavailable` rows carry
 * Tyler's own 2026-07-13 re-check date + note (the evidence the issue cited).
 * Seeded for the flagship set only — a wallet left off keeps availability empty
 * = "not yet curated", never "unavailable": each platform row is a claim we
 * only make once the surface is checked. checkedAt dates it; re-verify before
 * relying. */
interface AvailabilityRow {
	platform: string;
	state: string;
	storeUrl?: string;
	checkedAt: string;
	note?: string;
}
const AVAILABILITY_SET: Record<string, AvailabilityRow[]> = {
	xbull: [
		{
			platform: "web",
			state: "available",
			storeUrl: "https://xbull.app",
			checkedAt: "2026-07-14",
		},
		{
			platform: "browser-extension",
			state: "available",
			storeUrl:
				"https://chromewebstore.google.com/detail/xbull-wallet/omajpeaffjgmlpmhbfdjepdejoemifpe",
			checkedAt: "2026-07-14",
		},
		{
			platform: "ios",
			state: "unavailable",
			checkedAt: "2026-07-13",
			note: "formerly-listed iOS app not reachable (sls-033 #519 re-check) — web + Chrome extension remain live",
		},
		{
			platform: "android",
			state: "unavailable",
			checkedAt: "2026-07-13",
			note: "formerly-listed Play app not reachable (sls-033 #519 re-check) — web + Chrome extension remain live",
		},
	],
	freighter: [
		{
			platform: "browser-extension",
			state: "available",
			storeUrl:
				"https://chromewebstore.google.com/detail/freighter/bcacfldlkkdogcmkkibnjlakofdplcbk",
			checkedAt: "2026-07-14",
		},
	],
	ledger: [
		{
			platform: "hardware-device",
			state: "available",
			storeUrl: "https://shop.ledger.com",
			checkedAt: "2026-07-14",
		},
	],
	lobstr: [
		{
			platform: "web",
			state: "available",
			storeUrl: "https://lobstr.co",
			checkedAt: "2026-07-14",
		},
	],
};

/** Rebrands — name, website, and description move together so both the old
 * and new brand stay searchable. Equality no-ops keep reruns clean. */
const REBRANDS: Record<
	string,
	{ name: string; website: string; description: string }
> = {
	// boxy 2026-07-09: "tricorn is live (as) utexo" — human-confirmed live.
	// tricorn.network 301s → bridge.utexo.com → mint.utexo.com. Coinspect
	// audited the Stellar/Soroban integration (stellarsecurityportal.com/report/31).
	tricorn: {
		name: "Utexo",
		website: "https://mint.utexo.com",
		description:
			"Utexo (formerly Tricorn) is a live cross-chain bridge supporting EVM and non-EVM chains, moving assets to and from Stellar. Its Stellar/Soroban bridge integration was audited by Coinspect. Rebranded from tricorn.network to utexo.com.",
	},
};

/** Review finding 27 one-shot corrections — OVERWRITES coverage.countries for
 * rows the 2026-07-07 sync mis-wrote with the partner's incorporation country.
 * Grounding per row: [] = the corridor is regional/global (the partner record's
 * `regions` carries it; a wrong single country is worse than honest absence).
 * bitso's corridors are proven by its own CNBV/GFSC compliance currencies
 * (MXN/BRL/ARS/COP). Rows retire (no-op) once applied — equality-checked. */
const COVERAGE_COUNTRY_FIX: Record<string, string[]> = {
	"boss-pay": [], // HQ=US; corridors = Africa/LatAm remittance (regions field)
	"ripe-money": [], // HQ=Singapore; "off-ramp for Asia"
	"coca-wallet": [], // HQ=UAE; global wallet
	"blox-global": [], // HQ=US; "stablecoins globally"
	bitso: ["Mexico", "Brazil", "Argentina", "Colombia"],
};

// sls-017 (durable half): chains a project supports, lowercase. Fill-if-empty —
// so omission ≠ negation on wallet/multichain records.
const SUPPORTED_NETWORKS: Record<string, string[]> = {
	lobstr: ["stellar", "xrpl"],
	"ultra-stellar": ["stellar", "xrpl"],
	// Bridge corridor matrix (boxy 2026-07-09: "same issue for Solana?" — yes).
	// Every row below verified from PRIMARY sources on 2026-07-09 (vendor
	// docs/APIs, quotes in the PR): the original Beacon-Q3 seeds were
	// [stellar, evm] only, hiding real Solana/Tron/XRPL/... corridors.
	// "evm" is the umbrella users' chain-names map onto via the search
	// synonym layer (ethereum/polygon/base/bnb/arbitrum → evm).
	// This list is EXACT-SYNC for its slugs (see apply loop): the canonical
	// place to update a listed project's networks is HERE, not the admin.
	allbridge: ["stellar", "evm", "solana", "tron", "sui"], // docs-core.allbridge.io + live SRB USDC pool on core API
	"circle-cctp-cross-chain-transfer-protocol": [
		"stellar", // CCTP V2 domain 27 (standard transfer)
		"evm",
		"solana",
		"sui",
		"aptos",
		"noble",
		"starknet",
	], // developers.circle.com/cctp/concepts/supported-chains-and-domains
	axelar: ["stellar", "evm", "solana", "sui", "xrpl"], // axelar-chains-config mainnet.json: stellar mainnet contracts deployed
	rozo: ["stellar", "evm", "solana"], // rozo.ai/llms.txt: pay-in/out Ethereum/Arbitrum/Base/BSC/Polygon/Solana/Stellar; "Stellar CCTP V2 is live on ROZO"
	spacewalk: ["stellar", "polkadot", "kusama"], // pendulumchain.org: Pendulum (Polkadot) + Amplitude (Kusama), launched
	stronghold: ["stellar", "evm", "xrpl"], // gateway.stronghold.co/bridge (SHx-only: Stellar⇄Ethereum + XRPL leg live)
	"templar-protocol": ["stellar", "bitcoin", "evm", "near"], // templarfi.org/blog/stellar launch post; bridgeless (NEAR chain sigs)
	warpdrive: ["stellar", "evm"], // warp-drive.xyz targets Base/Ethereum/Optimism/BNB — NOT yet launched (see STATUS_FIX)
	tricorn: ["stellar", "evm"], // Coinspect-audited Stellar⇄EVM bridge; live as Utexo (boxy-confirmed 2026-07-09)
	helix: ["canton"], // helixlabs.org: "not live on any chain other than Canton"; Stellar = roadmap (see STATUS_FIX)
	zkcross: ["stellar", "evm"],
	// #414 real bridges (verified 2026-07-11):
	rubic: [
		"stellar",
		"evm",
		"solana",
		"bitcoin",
		"tron",
		"near",
		"polkadot",
		"cosmos",
		"sui",
		"aptos",
		"xrpl",
		"ton",
	], // Rubic's own chains API (api-v2.rubic.exchange/api/info/chains): 101 chains incl. STELLAR + dedicated rubic_stellar_api provider
	"via-labs": ["evm"], // docs.vialabs.io omnichain messaging/bridging; public chain registry is exclusively EVM chain IDs — only evm verifiable
	transfuse: ["stellar", "evm"], // github transfuselabs/transfuse-bridge: Stellar⇄Ethereum USDC/USDT bridge (testnet-only per README)
	"bim-exchange": ["evm"], // bim.finance: swap/bridge interface aggregating Kyberswap/Bungee — EVM aggregator stacks; no non-EVM chain named
	"usdc-swap": ["stellar", "evm", "solana"], // usdcswap.com sitemap: STE↔ETH/ARB/OPT/BASE/POL/AVA/SOL routes; Circle CCTP + horizon in app bundle
	houdiniswap: ["stellar", "evm", "solana", "bitcoin", "tron"], // app.houdiniswap.com token picker: XLM/USDC-on-Stellar verified live; BTC/ETH/SOL/TRON named
	estrela: ["stellar", "evm", "solana", "tron", "sui"], // Estrela = Allbridge Core (SCF #22; links → allbridge.io); docs-core.allbridge.io chain list
	rarible: ["evm"], // sls-037 precision fix: SCF award + Rarible STELLAR schema enum establish the RELATIONSHIP, but public Stellar support is not verifiable on Rarible's live API/UI (Tyler GT-19 blind lane + our recheck) — evm only until it is; the award/integration story lives in prose+statusSourceUrl, not the deployment field
	// sls-029 oracle network evidence (Live oracles with EMPTY networks made
	// materially different deployment claims look equivalent). Both rows below
	// verified from PRIMARY sources 2026-07-11:
	band: ["stellar", "evm", "xrpl", "cosmos"], // stellar: developers.stellar.org/docs/data/oracles/oracle-providers lists Band's deployed MAINNET contract CCQXWMZVM3KRTXTUPTN53YHL272QGKF32L7XEDNZ2S6OSUFK3NFBGG5M (+ bandprotocol/band-std-reference-contracts-soroban + Band's own integration post); evm/xrpl/cosmos: docs.bandchain.org supported-blockchains MAINNET table (Astar/Celo/Cronos/Harmony/Sonic/Xlayer/... → evm umbrella; XRPL named; Secret/Nibiru → cosmos). That Band table LAGS — Stellar is absent from it despite the deployed, actively-relaying mainnet contract (sls-029 live reads 2026-07-10).
	lightecho: ["stellar"], // github.com/bp-ventures/lightecho-stellar-oracle README: deployed MAINNET contract CDOR3QD27WAAF4TK4MO33TGQXR6RPNANNVLOY277W2XVV6ZVJ6X6X42T (+ testnet CA335...); Stellar-only Soroban oracle (BP Ventures). Deployment evidence, NOT freshness — sls-029's probe observed its mainnet price state ~4 months stale (2026-07-10).
};

/** sls-032 (#516): curated route-level bridge evidence — the first rows of
 * the `routes` field on Projects. EXACT-SYNC for listed slugs (the canonical
 * place to update a listed project's routes is HERE). Every row is grounded
 * in the provider's OWN docs/APIs, re-using the #414-wave primary-source
 * evidence recorded on SUPPORTED_NETWORKS above; chain names re-use the same
 * vocabulary ("evm" umbrella). Rules:
 *   - assetRepresentation states what the DESTINATION asset is (canonical =
 *     issuer-native, e.g. Circle-issued USDC via CCTP burn-mint).
 *   - Quote-time facts (fees, availability, current quotes) are NOT encoded.
 *   - rubic deliberately gets NO route rows: its verified #414 evidence is
 *     chain-level integration (its own chains API), not per-pair/per-asset
 *     route evidence — an aggregator's asset outcome is quote-time, which is
 *     exactly the sls-032 caveat. Its chain matrix stays on supportedNetworks.
 */
interface CuratedRoute {
	fromChain: string;
	toChain: string;
	direction: "one-way" | "bidirectional";
	assets: string[];
	assetRepresentation:
		| "canonical"
		| "wrapped"
		| "bridged"
		| "interchain"
		| null;
	mechanism: string;
	sourceUrl: string;
	asOf: string;
}
/** Fan a common route template out over destination chains (all rows here are
 * Stellar-anchored: fromChain stellar, direction covers the reverse leg). */
const stellarRoutes = (
	toChains: string[],
	base: Omit<CuratedRoute, "fromChain" | "toChain">,
): CuratedRoute[] =>
	toChains.map((toChain) => ({ fromChain: "stellar", toChain, ...base }));

const ROUTES_SET: Record<string, CuratedRoute[]> = {
	// usdcswap.com sitemap enumerates STE↔ETH/ARB/OPT/BASE/POL/AVA/SOL routes;
	// Circle CCTP + horizon shipped in the app bundle (verified 2026-07-11,
	// #414 wave). All seven destinations are CCTP domains → burn-mint canonical
	// Circle USDC, both directions.
	"usdc-swap": stellarRoutes(
		[
			"ethereum",
			"arbitrum",
			"optimism",
			"base",
			"polygon",
			"avalanche",
			"solana",
		],
		{
			direction: "bidirectional",
			assets: ["USDC"],
			assetRepresentation: "canonical",
			mechanism: "cctp-burn-mint",
			sourceUrl: "https://usdcswap.com",
			asOf: "2026-07-11",
		},
	),
	// docs-core.allbridge.io chain list + live SRB (Soroban) USDC pool on the
	// core API (verified 2026-07-09). Allbridge Core swaps between NATIVE-asset
	// liquidity pools on each chain — destination USDC is the chain's canonical
	// issue, which is also what the sls-032 quote-time audit observed.
	allbridge: stellarRoutes(["evm", "solana", "tron", "sui"], {
		direction: "bidirectional",
		assets: ["USDC"],
		assetRepresentation: "canonical",
		mechanism: "native-liquidity-pool",
		sourceUrl: "https://docs-core.allbridge.io",
		asOf: "2026-07-09",
	}),
	// Estrela = Allbridge Core (SCF #22; its links resolve to allbridge.io) —
	// same verified route matrix as allbridge above.
	estrela: stellarRoutes(["evm", "solana", "tron", "sui"], {
		direction: "bidirectional",
		assets: ["USDC"],
		assetRepresentation: "canonical",
		mechanism: "native-liquidity-pool",
		sourceUrl: "https://docs-core.allbridge.io",
		asOf: "2026-07-09",
	}),
	// developers.circle.com/cctp/concepts/supported-chains-and-domains: Stellar
	// is CCTP V2 domain 27 (verified 2026-07-09, #414 wave). CCTP is the RAIL
	// (see its description): burn-and-mint of Circle-issued canonical USDC —
	// the positive half of the sls-032 canonical-vs-USDC.axl regression.
	"circle-cctp-cross-chain-transfer-protocol": stellarRoutes(
		["evm", "solana", "sui", "aptos", "noble", "starknet"],
		{
			direction: "bidirectional",
			assets: ["USDC"],
			assetRepresentation: "canonical",
			mechanism: "cctp-burn-mint",
			sourceUrl:
				"https://developers.circle.com/cctp/concepts/supported-chains-and-domains",
			asOf: "2026-07-09",
		},
	),
};

/** sls-035 (#517): DEX-landscape role for the clearest records — makes the
 * venue/aggregator/UI distinction data instead of prose, so a DEX cluster
 * count stops reading as a competitor count. EXACT-SYNC for listed slugs.
 * Only unambiguous assignments (one-line evidence each); ambiguous records
 * (hoops, normal, lumenswap, multi-role platforms) stay null = unclassified. */
const VENUE_ROLE: Record<string, string> = {
	soroswap: "amm", // soroswap.finance: AMM protocol on Soroban running its own pools; DefiLlama `soroswap` TVL row
	aquarius: "amm", // aqua.network: AMM pools + liquidity-incentive voting on Stellar; DefiLlama `aquarius-stellar` TVL row
	phoenix: "amm", // Phoenix DeFi Hub: constant-product + stableswap pools (PHO) on Soroban — runs its own liquidity
	sushi: "amm", // Sushi's Stellar deployment runs its own AMM pools; DefiLlama `sushi-stellar` TVL row
	comet: "amm", // WAS a Balancer-style weighted-pool AMM on Soroban (record Inactive — status carries liveness; role is the taxonomy fact)
	stellarterm: "trading-ui", // stellarterm.com: open-source trading client for the native Stellar DEX — hosts no liquidity of its own
	stellarx: "trading-ui", // stellarx.com: trading interface over Stellar's native orderbook — no own pools
	lobstr: "wallet-integrated", // lobstr.co: wallet with in-app swap/SDEX trading — venue access inside a wallet, not an independent venue
	scopuly: "wallet-integrated", // scopuly.com: wallet + SDEX trading app (typed Wallet/DEX)
	stellarbroker: "aggregator-router", // stellar.broker: "multi-source liquidity swap router … access to AMMs and Stellar DEX" — routes across venues, runs none
};

/** Duplicate-record merges (lessons class 10; Engine B S3's 12 groups,
 * identity-verified 2026-07-10 — every pair shares the same website, so these
 * are the same entity twice, not name collisions (class 21 check done).
 * Recurring shape: an SCF-derived record (funding, empty desc) + a
 * lumenloop-enriched record (desc/GitHub, no funding) split one project's
 * facts across two rows.
 *
 * Per merge: the CANONICAL record absorbs the dupe's complementary facts
 * (fill-if-empty only — desc/github verbatim from the dupe's own record);
 * the DUPE gets canonicalSlug → canonical + status Inactive (the documented
 * suppress-from-active-listings mechanism) + a lifecycle note. Nothing is
 * deleted. `copyScf` is for the rename case (ultra-swap → usdc-swap) where
 * the award sits on the stale-named record: awarded/rounds copy to the
 * canonical only when the canonical carries no award of its own. */
const DUPE_MERGES: Array<{
	dupe: string;
	canonical: string;
	fill?: { shortDescription?: string; github?: string };
	copyScf?: boolean;
}> = [
	{ dupe: "stellarexpert", canonical: "stellar-expert" },
	{
		dupe: "sorobanpulse",
		canonical: "soroban-pulse",
		fill: {
			shortDescription:
				"SorobanPulse showcases Soroban's true potential through data and metrics from real world problem-solving dApps.",
			github: "https://github.com/crosschainlabs-stellar/sorobanpulse-webapp",
		},
	},
	{
		dupe: "sorobanhub",
		canonical: "soroban-hub",
		fill: {
			shortDescription:
				"Manage, monitor and interact with your deployed contracts from a single and free to use desktop app.",
		},
	},
	{ dupe: "passport", canonical: "stellar-passport" },
	{
		dupe: "givecredit",
		canonical: "give-credit",
		fill: {
			shortDescription:
				"Offset carbon emissions with tax-deductible XLM donations - automated by Soroban.",
			github: "https://github.com/collaborativeeconomics/give-credit",
		},
	},
	{
		dupe: "stellarcarbon",
		canonical: "stellar-carbon",
		fill: {
			shortDescription:
				"Stellarcarbon offers transparent, nature-based carbon offsetting by registering offsets on both the Stellar blockchain and the Verra Registry, enabling users to voluntarily offset their carbon footprint through on-chain and off-chain records.",
			github: "https://github.com/stellarcarbon",
		},
	},
	{ dupe: "ultra-swap", canonical: "usdc-swap", copyScf: true },
	{ dupe: "honeycoin", canonical: "honey-coin" },
	{ dupe: "coinsph", canonical: "coins-ph" },
	{ dupe: "cashabroad", canonical: "cash-abroad" },
	{ dupe: "arka-fund", canonical: "arkafund" },
	// Liveness triage 2026-07-10: 13th pair — same project, different
	// spellings ("ChainsAtlas"/"ChainAtlas"), missed by the S3 name
	// normalization. Canonical = chainsatlas (SCF-funded, gh org).
	{ dupe: "chainatlas", canonical: "chainsatlas" },
	// ── S3b domain-keyed dupes wave (boxy "run it" 2026-07-10): 26 pairs
	// found by the new same-website-apex sweep, identity verified per pair
	// (shared apex = shared entity; canonical = SCF-funded record, else the
	// richer one; org product-families went to the sweep ALLOWLIST instead,
	// never merged). Decision matrix in scratchpad s3b-triage.json. ──
	{ dupe: "band-protocol", canonical: "band" }, // sls-043: the "$100k/#41" on the canonical was unsourced — official record (project/band-protocol-2ob) shows ONE award, SCF #16 $60K; SCF_FIX aligns the canonical to it, shadow already agreed
	{ dupe: "gateway", canonical: "gatewayfm" },
	{ dupe: "reclaim-protocol", canonical: "reclaim" },
	{ dupe: "volta", canonical: "volta-circuit" },
	{ dupe: "diameter", canonical: "diameter-pay" },
	{ dupe: "baf-nework", canonical: "baf" }, // typo'd slug ("nework")
	{ dupe: "blockeden", canonical: "blockedenxyz" },
	{ dupe: "ortege-ai", canonical: "ortege" },
	{ dupe: "aha-labs", canonical: "the-aha-company" }, // same org, two namings; canonical = the richer record (5 repos)
	// The sorobansecurity.com → stellarsecurityportal.com rebrand (sls-003
	// URL migration): current brand = canonical, absorbs the SCF award —
	// the ultra-swap→usdc-swap pattern.
	{
		dupe: "soroban-security-portal",
		canonical: "stellar-security-portal",
		copyScf: true,
	},
	{
		dupe: "expand",
		canonical: "expand-network",
		fill: {
			shortDescription:
				"Expand.network offers a unified API that connects developers to over 100 decentralized finance (DeFi) endpoints across more than 40 blockchains and protocols, including both EVM and non-EVM platforms.",
			github: "https://github.com/expand-network",
		},
	},
	{ dupe: "digibank-sdp", canonical: "digibank" }, // the SDP row is a submission-title variant of the same company (award amount None — no numeric loss)
	{ dupe: "trace-finance", canonical: "trace" },
	{ dupe: "ripe-money", canonical: "ripe" },
	{ dupe: "pakana", canonical: "pakananet" }, // pakananet carries the $45.2k SCF award
	{ dupe: "meria", canonical: "meria-defi" },
	{ dupe: "coca-wallet", canonical: "coca" },
	{ dupe: "alfred-pay", canonical: "alfred" },
	{ dupe: "blue-marble", canonical: "the-blue-marble" },
	{ dupe: "mica-rent", canonical: "mica" },
	{ dupe: "elroy-app", canonical: "elroy" },
	{ dupe: "blox-global", canonical: "blox" },
	{ dupe: "huma-finance", canonical: "huma" },
	{ dupe: "bim", canonical: "bim-exchange" },
	{ dupe: "normal-finance", canonical: "normal" }, // shadow has 5 linked repos vs canonical's 1 — repos.projectSlug repoint is a known follow-up
	{ dupe: "liqvid", canonical: "liqvidxyz" },
	{
		dupe: "balanced",
		canonical: "balanced-network",
		fill: {
			shortDescription:
				"Balanced is a cross-chain DEX and stablecoin that enables native cross-chain DeFi primitives for any ecosystem.",
			github: "https://github.com/balancednetwork",
		},
	},
];

const ASOF = new Date().toISOString().slice(0, 10);
const csv = (s?: string | null): string[] =>
	s
		? String(s)
				.split(",")
				.map((x) => x.trim())
				.filter(Boolean)
		: [];

async function main() {
	if (
		Object.keys(DESCRIPTION_FIXES).length === 0 &&
		Object.keys(SUPPORTED_NETWORKS).length === 0
	) {
		console.error("Nothing to do — no fixes configured.");
		process.exit(1);
	}
	const payload = await getPayload({ config: await configPromise });
	console.log(
		`Mode: ${EXECUTE ? "EXECUTE (writes)" : "DRY RUN (read-only)"}\n`,
	);

	const writes: Array<{
		id: string;
		slug: string;
		data: Record<string, unknown>;
	}> = [];

	console.log("── Description fixes (overwrite shortDescription) ──");
	for (const [slug, desc] of Object.entries(DESCRIPTION_FIXES)) {
		const res = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = res.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project with slug "${slug}" — skipped`);
			continue;
		}
		if (d.shortDescription === desc) {
			console.log(`  ${slug}: already up to date, skip`);
			continue;
		}
		console.log(`  ${slug}:`);
		console.log(`    old: ${d.shortDescription ?? "(none)"}`);
		console.log(`    new: ${desc}`);
		writes.push({ id: d.id, slug, data: { shortDescription: desc } });
	}

	// ── sls-012: structured anchor coverage, synced from the partner record ──
	// The partner directory already carries structured seps / currencies /
	// country; project rows (searchProjects category=Anchor) only had prose.
	// Copy them onto the matching project (fill-if-empty), dated with asOf.
	console.log("\n── Coverage from partner records (fill-if-empty) ──");
	const partnersRes = await payload.find({
		collection: "partner-accounts",
		where: { status: { equals: "published" } },
		limit: 300,
		depth: 0,
		overrideAccess: true,
	});
	// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
	for (const pt of partnersRes.docs as any[]) {
		const seps: string[] = pt.seps ?? [];
		const currencies = csv(pt.compliance?.currencies);
		// Review 2026-07-08 finding 27: pt.country is the partner's primary
		// JURISDICTION (incorporation/HQ), NOT its fiat corridor — copying it
		// wrote "United States" as boss-pay's corridor (its corridors are
		// Africa/LatAm) and "Singapore" for ripe-money (Asia off-ramp). Corridor
		// countries now come ONLY from the explicit grounded map below; the sync
		// carries currencies (compliance-grounded) + SEPs (toml-grounded), which
		// ARE corridor facts.
		const countries: string[] = [];
		if (!seps.length && !currencies.length && !countries.length) continue;
		// Partner slug is often `anchor-<name>`; the project slug is `<name>`.
		const candidates = [pt.slug, String(pt.slug).replace(/^anchor-/, "")];
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		let proj: any = null;
		for (const slug of candidates) {
			const r = await payload.find({
				collection: "projects",
				where: { slug: { equals: slug } },
				limit: 1,
				depth: 0,
				overrideAccess: true,
			});
			if (r.docs[0]) {
				proj = r.docs[0];
				break;
			}
		}
		if (!proj) continue;
		const ex = proj.coverage ?? {};
		if (ex.countries?.length || ex.currencies?.length || ex.seps?.length) {
			console.log(`  ${proj.slug}: coverage already set, skip`);
			continue;
		}
		console.log(
			`  ${proj.slug} ← ${pt.slug}: seps=${seps.join("/") || "-"} ccy=${currencies.join("/") || "-"} countries=${countries.join("/") || "-"}`,
		);
		writes.push({
			id: proj.id,
			slug: proj.slug,
			data: { coverage: { countries, currencies, seps, asOf: ASOF } },
		});
	}

	// ── raven#8 / sls-018: additive types for multi-product projects ──
	console.log("\n── Types add (merge, never remove) ──");
	for (const [slug, addTypes] of Object.entries(TYPES_ADD)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const existing: string[] = Array.isArray(d.types) ? d.types : [];
		const missing = addTypes.filter((t) => !existing.includes(t));
		if (!missing.length) {
			console.log(
				`  ${slug}: types already include ${addTypes.join("/")}, skip`,
			);
			continue;
		}
		const next = [...existing, ...missing];
		console.log(
			`  ${slug}: types [${existing.join(", ")}] → [${next.join(", ")}]`,
		);
		writes.push({ id: d.id, slug, data: { types: next } });
	}

	// ── sls-025: additive github.repos rows (merge, never remove) ──
	console.log("\n── GitHub repos add (merge, never remove) ──");
	for (const [slug, addRepos] of Object.entries(GITHUB_REPOS_ADD)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const existing: Array<{ owner?: string; name?: string }> =
			d.github?.repos ?? [];
		const key = (o?: string, n?: string) =>
			`${(o ?? "").toLowerCase()}/${(n ?? "").toLowerCase()}`;
		const have = new Set(existing.map((e) => key(e.owner, e.name)));
		const missing = addRepos.filter((a) => !have.has(key(a.owner, a.name)));
		if (!missing.length) {
			console.log(`  ${slug}: github.repos already include all rows, skip`);
			continue;
		}
		console.log(
			`  ${slug}: github.repos +${missing.map((m) => `${m.owner}/${m.name}`).join(", ")}`,
		);
		writes.push({
			id: d.id,
			slug,
			data: {
				github: {
					...(d.github ?? {}),
					repos: [
						...existing.map((e) => ({ owner: e.owner, name: e.name })),
						...missing,
					],
				},
			},
		});
	}

	// ── raven#8 sweep (REPORT-ONLY): other dual-identity ramp providers ──
	// Partners with anchor type / ramp capability whose matching PROJECT record
	// lacks the Anchor type — the same pattern that hid Etherfuse. Prints
	// candidates for owner review; add confirmed ones to TYPES_ADD. Never writes.
	console.log("\n── Dual-identity sweep (report-only, no writes) ──");
	{
		const anchorsRes = await payload.find({
			collection: "partner-accounts",
			where: { status: { equals: "published" } },
			limit: 300,
			depth: 0,
			overrideAccess: true,
		});
		let candidates = 0;
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		for (const pt of anchorsRes.docs as any[]) {
			const isRampCapable =
				pt.partnerType === "anchor" ||
				(Array.isArray(pt.rampTypes) && pt.rampTypes.length > 0);
			if (!isRampCapable) continue;
			const slugCands = [pt.slug, String(pt.slug).replace(/^anchor-/, "")];
			// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
			let proj: any = null;
			for (const slug of slugCands) {
				const r = await payload.find({
					collection: "projects",
					where: { slug: { equals: slug } },
					limit: 1,
					depth: 0,
					overrideAccess: true,
				});
				if (r.docs[0]) {
					proj = r.docs[0];
					break;
				}
			}
			if (!proj) continue;
			const types: string[] = Array.isArray(proj.types) ? proj.types : [];
			if (types.includes("Anchor") || proj.category === "Anchor") continue;
			candidates++;
			console.log(
				`  CANDIDATE ${proj.slug}: category=${proj.category} types=[${types.join(", ")}] ← partner ${pt.slug} (type=${pt.partnerType}, ramps=${(pt.rampTypes ?? []).join("/") || "-"})`,
			);
		}
		if (!candidates)
			console.log(
				"  (none — all ramp-capable partners' projects carry Anchor)",
			);
	}

	// ── finding 27: corridor-country corrections (OVERWRITE, equality-guarded) ──
	console.log("\n── Coverage country corrections (finding 27) ──");
	for (const [slug, fix] of Object.entries(COVERAGE_COUNTRY_FIX)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const cur: string[] = d.coverage?.countries ?? [];
		if (JSON.stringify(cur) === JSON.stringify(fix)) {
			console.log(`  ${slug}: already corrected, skip`);
			continue;
		}
		console.log(
			`  ${slug}: countries [${cur.join(", ")}] → [${fix.join(", ")}]`,
		);
		writes.push({
			id: d.id,
			slug,
			data: { coverage: { ...(d.coverage ?? {}), countries: fix, asOf: ASOF } },
		});
	}

	// ── sls-017 (durable): supportedNetworks (fill-if-empty) ──
	// ── curated seeds (create-if-missing, never update) ──
	console.log("\n── Seeds (create-if-missing) ──");
	for (const seed of SEEDS) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: seed.slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		if (r.docs[0]) {
			console.log(`  ${seed.slug}: exists, skip`);
			continue;
		}
		console.log(
			`  ${seed.slug}: CREATE (${seed.status}, ${seed.types.join("/")})`,
		);
		if (EXECUTE) {
			try {
				await payload.create({
					collection: "projects",
					data: seed,
					overrideAccess: true,
				});
				console.log(`  created: ${seed.slug}`);
			} catch (err) {
				console.error(`  CREATE FAILED: ${seed.slug} — ${String(err)}`);
				process.exitCode = 1;
			}
		}
	}

	// ── rebrands (name + website + description together) ──
	console.log("\n── Rebrands ──");
	for (const [slug, rb] of Object.entries(REBRANDS)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		// biome-ignore lint/suspicious/noExplicitAny: partial update payload
		const data: any = {};
		if (d.name !== rb.name) data.name = rb.name;
		if (d.shortDescription !== rb.description)
			data.shortDescription = rb.description;
		const normUrl = (u: string) => u.replace(/\/+$/, "");
		if (normUrl(d.links?.website ?? "") !== normUrl(rb.website))
			data.links = { ...(d.links ?? {}), website: rb.website };
		if (!Object.keys(data).length) {
			console.log(`  ${slug}: already rebranded, skip`);
			continue;
		}
		console.log(
			`  ${slug}: ${d.name} → ${rb.name} (${Object.keys(data).join(", ")})`,
		);
		writes.push({ id: d.id, slug, data });
	}

	// ── launch-status corrections (from-guarded, retire once applied) ──
	console.log("\n── Status fixes (from-guarded) ──");
	for (const [slug, fix] of Object.entries(STATUS_FIX)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		if (d.status !== fix.from) {
			console.log(
				`  ${slug}: status '${d.status}' ≠ '${fix.from}', skip (retired or manually set)`,
			);
			continue;
		}
		console.log(`  ${slug}: status ${fix.from} → ${fix.to}`);
		// biome-ignore lint/suspicious/noExplicitAny: partial update payload
		const data: any = { status: fix.to };
		// Inactive flips carry their evidence as ecosystem memory (fill-if-
		// empty): "X WAS a live Y that shut down" beats silence for consumers.
		if (fix.note && !d.lifecycle?.note)
			data.lifecycle = { ...(d.lifecycle ?? {}), note: fix.note };
		// sls-024: date + source + kind-of-evidence ride the same write, so the
		// served label stops being an unprovenanced bare string.
		if (fix.asOf) data.statusAsOf = fix.asOf;
		if (fix.sourceUrl) data.statusSourceUrl = fix.sourceUrl;
		if (fix.basis) data.statusBasis = fix.basis;
		writes.push({ id: d.id, slug, data });
	}

	console.log("\n── Website fixes (dead recorded URL → verified live URL) ──");
	for (const [slug, website] of Object.entries(WEBSITE_FIXES)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		// Payload normalizes stored URLs (strips www.) — compare both sides
		// normalized or these rows re-plan forever (caught on the S3b dry-run:
		// 7 already-applied website fixes re-planned as writes).
		const norm = (u: string) =>
			(u ?? "").replace(/^(https?:\/\/)www\./, "$1").replace(/\/+$/, "");
		if (norm(d.links?.website) === norm(website)) {
			console.log(`  ${slug}: website already current, skip`);
			continue;
		}
		console.log(
			`  ${slug}: website ${d.links?.website ?? "(none)"} → ${website}`,
		);
		writes.push({
			id: d.id,
			slug,
			data: { links: { ...(d.links ?? {}), website } },
		});
	}

	console.log("\n── Supported networks (fill-if-empty) ──");
	for (const [slug, fix] of Object.entries(IDENTITY_FIX)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: raw Payload doc
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" for IDENTITY_FIX — skipped`);
			continue;
		}
		const cur: string[] = Array.isArray(d.aliases) ? d.aliases : [];
		if (
			cur.join(",") === fix.aliases.join(",") &&
			(d.renameSourceUrl ?? undefined) === fix.renameSourceUrl &&
			(d.renamedAt ?? undefined) === fix.renamedAt
		) {
			console.log(`  ${slug}: identity already in sync, skip`);
			continue;
		}
		console.log(
			`  ${slug}: identity aliases=[${cur.join(", ")}] → [${fix.aliases.join(", ")}]`,
		);
		writes.push({
			id: d.id,
			slug,
			data: {
				aliases: fix.aliases,
				...(fix.renamedAt ? { renamedAt: fix.renamedAt } : {}),
				...(fix.renameSourceUrl
					? { renameSourceUrl: fix.renameSourceUrl }
					: {}),
			},
		});
	}

	for (const [slug, fix] of Object.entries(SCF_FIX)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const cur = d.scf ?? {};
		if (
			cur.awarded === fix.awarded &&
			cur.totalAwarded === fix.totalAwarded &&
			(cur.awardedRounds ?? []).join(",") === fix.awardedRounds.join(",")
		) {
			console.log(`  ${slug}: scf already in sync, skip`);
			continue;
		}
		console.log(
			`  ${slug}: scf awarded=${cur.awarded}→${fix.awarded} total=${cur.totalAwarded}→${fix.totalAwarded} rounds=[${(cur.awardedRounds ?? []).join(",")}]→[${fix.awardedRounds.join(",")}]`,
		);
		writes.push({ id: d.id, slug, data: { scf: { ...cur, ...fix } } });
	}

	for (const [slug, want] of Object.entries(TYPES_SET)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const cur: string[] = Array.isArray(d.types) ? d.types : [];
		if (cur.join(",") === want.join(",")) {
			console.log(`  ${slug}: types already in sync, skip`);
			continue;
		}
		console.log(`  ${slug}: types [${cur.join(", ")}] → [${want.join(", ")}]`);
		writes.push({ id: d.id, slug, data: { types: want } });
	}

	for (const [slug, nets] of Object.entries(SUPPORTED_NETWORKS)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const cur: string[] = Array.isArray(d.supportedNetworks)
			? d.supportedNetworks
			: [];
		// EXACT-SYNC for curated slugs: the matrix above is the source of
		// truth (primary-source-verified). Equality no-ops keep reruns clean.
		if (cur.join(",") === nets.join(",")) {
			console.log(`  ${slug}: already in sync, skip`);
			continue;
		}
		console.log(`  ${slug}: [${cur.join(", ")}] → [${nets.join(", ")}]`);
		writes.push({ id: d.id, slug, data: { supportedNetworks: nets } });
	}

	console.log("\n── Wallet productKind (sls-033 #519, fill-if-different) ──");
	for (const [slug, want] of Object.entries(PRODUCT_KIND)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		if (d.productKind === want) {
			console.log(`  ${slug}: productKind already ${want}, skip`);
			continue;
		}
		console.log(`  ${slug}: productKind ${d.productKind ?? "null"} → ${want}`);
		writes.push({ id: d.id, slug, data: { productKind: want } });
	}

	console.log("\n── Wallet availability (sls-033 #519, EXACT-SYNC) ──");
	// Normalize to the curated shape (drop Payload row ids) so reruns no-op.
	// biome-ignore lint/suspicious/noExplicitAny: Payload array-field row shape
	const normAvail = (rows: any): string =>
		JSON.stringify(
			(Array.isArray(rows) ? rows : []).map((r) => ({
				platform: r.platform ?? null,
				state: r.state ?? null,
				storeUrl: r.storeUrl ?? null,
				checkedAt: r.checkedAt ?? null,
				note: r.note ?? null,
			})),
		);
	for (const [slug, avail] of Object.entries(AVAILABILITY_SET)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const want = avail.map((a) => ({
			platform: a.platform,
			state: a.state,
			storeUrl: a.storeUrl ?? null,
			checkedAt: a.checkedAt,
			note: a.note ?? null,
		}));
		if (normAvail(d.availability) === normAvail(want)) {
			console.log(`  ${slug}: availability already in sync, skip`);
			continue;
		}
		console.log(`  ${slug}: availability → ${want.length} platform row(s)`);
		writes.push({ id: d.id, slug, data: { availability: want } });
	}

	console.log("\n── Bridge routes (sls-032 #516, EXACT-SYNC) ──");
	// Normalize to the curated shape (drop Payload row ids) so reruns no-op.
	// biome-ignore lint/suspicious/noExplicitAny: Payload array-field row shape
	const normRoutes = (rows: any): string =>
		JSON.stringify(
			(Array.isArray(rows) ? rows : []).map((r) => ({
				fromChain: r.fromChain ?? null,
				toChain: r.toChain ?? null,
				direction: r.direction ?? null,
				assets: Array.isArray(r.assets) ? r.assets : [],
				assetRepresentation: r.assetRepresentation ?? null,
				mechanism: r.mechanism ?? null,
				sourceUrl: r.sourceUrl ?? null,
				asOf: r.asOf ?? null,
			})),
		);
	for (const [slug, routes] of Object.entries(ROUTES_SET)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		if (normRoutes(d.routes) === normRoutes(routes)) {
			console.log(`  ${slug}: routes already in sync, skip`);
			continue;
		}
		console.log(
			`  ${slug}: routes ← ${routes.length} row(s) (${routes
				.map((rt) => `${rt.fromChain}↔${rt.toChain}`)
				.join(", ")})`,
		);
		writes.push({ id: d.id, slug, data: { routes } });
	}

	console.log("\n── DEX venue roles (sls-035 #517, EXACT-SYNC) ──");
	for (const [slug, role] of Object.entries(VENUE_ROLE)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		if (d.venueRole === role) {
			console.log(`  ${slug}: venueRole already '${role}', skip`);
			continue;
		}
		console.log(`  ${slug}: venueRole ${d.venueRole ?? "null"} → ${role}`);
		writes.push({ id: d.id, slug, data: { venueRole: role } });
	}

	console.log("\n── Duplicate merges (canonicalSlug lineage, class 10) ──");
	for (const m of DUPE_MERGES) {
		const [rc, rd] = await Promise.all(
			[m.canonical, m.dupe].map((slug) =>
				payload.find({
					collection: "projects",
					where: { slug: { equals: slug } },
					limit: 1,
					depth: 0,
					overrideAccess: true,
				}),
			),
		);
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const canon = rc.docs[0] as any;
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const dupe = rd.docs[0] as any;
		if (!canon || !dupe) {
			console.log(`  WARN: ${m.canonical}/${m.dupe} — record missing, skipped`);
			continue;
		}
		if (canon.canonicalSlug) {
			console.log(
				`  WARN: canonical ${m.canonical} itself points at '${canon.canonicalSlug}' — review, skipped`,
			);
			continue;
		}

		// canonical absorbs complementary facts (fill-if-empty only)
		// biome-ignore lint/suspicious/noExplicitAny: partial update payload
		const cData: any = {};
		if (m.fill?.shortDescription && !canon.shortDescription?.trim())
			cData.shortDescription = m.fill.shortDescription;
		if (m.fill?.github && !canon.links?.github)
			cData.links = { ...(canon.links ?? {}), github: m.fill.github };
		if (m.copyScf && !canon.scf?.awarded && dupe.scf?.awarded) {
			cData.scf = {
				...(canon.scf ?? {}),
				awarded: true,
				totalAwarded: dupe.scf.totalAwarded ?? null,
				awardedRounds: dupe.scf.awardedRounds ?? [],
			};
		}
		if (Object.keys(cData).length) {
			console.log(
				`  ${m.canonical}: absorb from ${m.dupe} (${Object.keys(cData).join(", ")})`,
			);
			writes.push({ id: canon.id, slug: m.canonical, data: cData });
		}

		// dupe becomes a lineage shadow (guarded; never deleted)
		// biome-ignore lint/suspicious/noExplicitAny: partial update payload
		const dData: any = {};
		if (!dupe.canonicalSlug) dData.canonicalSlug = m.canonical;
		else if (dupe.canonicalSlug !== m.canonical) {
			console.log(
				`  WARN: ${m.dupe} already points at '${dupe.canonicalSlug}' ≠ '${m.canonical}' — review, skipped`,
			);
			continue;
		}
		if (dupe.status !== "Inactive") dData.status = "Inactive";
		if (!dupe.lifecycle?.note)
			dData.lifecycle = {
				...(dupe.lifecycle ?? {}),
				note: `Duplicate record of '${m.canonical}' (same project, split entry) — funding, status and repos live on the canonical record. Merged ${ASOF}.`,
			};
		if (Object.keys(dData).length) {
			console.log(
				`  ${m.dupe}: → shadow of ${m.canonical} (${Object.keys(dData).join(", ")}; status was '${dupe.status}')`,
			);
			writes.push({ id: dupe.id, slug: m.dupe, data: dData });
		} else {
			console.log(`  ${m.dupe}: already linked + Inactive, skip`);
		}
	}

	console.log("\n── Docs links (fill-if-empty) ──");
	for (const [slug, docsUrl] of Object.entries(DOCS_LINKS)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		if (d.links?.docs) {
			console.log(`  ${slug}: links.docs already set, skip`);
			continue;
		}
		console.log(`  ${slug}: links.docs → ${docsUrl}`);
		writes.push({
			id: d.id,
			slug,
			data: { links: { ...(d.links ?? {}), docs: docsUrl } },
		});
	}

	console.log(`\n${writes.length} write(s) planned.`);
	if (!EXECUTE) {
		console.log("DRY RUN — none applied.");
		// honor exitCode set by failed writes/creates (a bare exit(0) was
		// stomping it — the 2026-07-09 seed failure ran green).
		process.exit(process.exitCode ?? 0);
	}
	// Per-write isolation (2026-07-09 incident: one ValidationError — an
	// enum value missing from the Types options — aborted the whole batch,
	// losing 12 valid writes). A bad row fails loudly; the rest still land.
	let failed = 0;
	for (const w of writes) {
		try {
			await payload.update({
				collection: "projects",
				id: w.id,
				data: w.data,
				overrideAccess: true,
			});
			console.log(`  wrote: ${w.slug}`);
		} catch (err) {
			failed++;
			console.error(`  FAILED: ${w.slug} — ${String(err)}`);
		}
	}
	if (failed) {
		console.error(`\n${failed} write(s) FAILED — fix and re-run.`);
		process.exitCode = 1;
	}
	console.log(`\nDONE: ${writes.length} write(s) applied.`);
	process.exit(0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
