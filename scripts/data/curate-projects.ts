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

/** Launch-status corrections (boxy 2026-07-09: "some are in process of
 * launching while allbridge has launched"). Each row is grounded in the
 * project's OWN current materials — never a staleness heuristic:
 *  - helix: helixlabs.org homepage — "Helix is not live on any chain other
 *    than Canton"; Stellar listed under "Next rails — roadmap targets, not
 *    live" (docs plan Soroban TESTNET in phase 1).
 *  - warpdrive: warp-drive.xyz has no app/mainnet claim; GitHub milestone
 *    language ("Preparation for bringing WarpDrive to Stellar — Milestone 1").
 * Writes only when the stored status matches the WRONG value, so a later
 * manual correction is never clobbered; rows retire once applied. */
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
};

const STATUS_FIX: Record<
	string,
	{
		from: string;
		to: string;
		note?: string;
		/** sls-024: optional label provenance, written alongside the status flip. */
		asOf?: string;
		sourceUrl?: string;
		basis?:
			| "operator-announcement"
			| "site-liveness"
			| "onchain-activity"
			| "human-verified"
			| "source-inherited";
	}
> = {
	// sls-023 (the DTCC class: entity Live ≠ Stellar product deployed).
	// DTCC's own announcement — mirrored by SDF's case study — says the DTC
	// tokenization service's Stellar connection is EXPECTED H1 2027 (SEC
	// no-action letter Dec 2025; announced 2026-05-27). Our record's own
	// description says "availability expected in H1 2027", so a Live label
	// let consumers turn a live organization into a false claim of a
	// currently live Stellar-issued RWA. Development = announced/building,
	// not deployed. Provenance rides the flip via the sls-024 fields.
	dtcc: {
		from: "Live",
		to: "Development",
		asOf: "2026-07-11",
		sourceUrl: "https://stellar.org/case-studies/dtcc",
		basis: "operator-announcement",
	},
	// 2026-07-11 audit DATA-TRUTH cell: venalabs.com now serves a crypto
	// airdrop-farming product; zero mentions of Stellar/Soroban/courses on
	// the live page. The described Stellar-education product no longer
	// exists at the listed URL.
	// boxy-confirmed dead 2026-07-11 (surfaced by the #414 bridge-corridor
	// tail: Bridge-typed, empty networks, product gone).
	apay: {
		from: "Live",
		to: "Inactive",
		note: "Product dead (human-confirmed 2026-07-11).",
	},
	// sls-028: domains REPURPOSED to unrelated gambling content (dual-lane
	// verified 2026-07-10) — a Live row pointing there is unsafe navigation.
	"the-blue-marble": {
		from: "Live",
		to: "Inactive",
		note: "Domain repurposed to unrelated content (verified 2026-07-10) — the recorded NFT product is gone; do not follow the historical link.",
	},
	octoplace: {
		from: "Live",
		to: "Inactive",
		note: "Domain repurposed to unrelated content (verified 2026-07-10) — the recorded NFT product is gone; do not follow the historical link.",
	},
	// sls-030: standalone venue stale; implementation lives on embedded as
	// Blend's 80/20 BLND:USDC backstop pool. Historical funded project.
	comet: {
		from: "Live",
		to: "Inactive",
		note: "Standalone Comet venue is no longer maintained; its weighted-pool implementation runs embedded as Blend's 80/20 BLND:USDC backstop (verified on mainnet 2026-07-10).",
	},
	venalabs: {
		from: "Live",
		to: "Inactive",
		note: "Pivoted away from Stellar education to an airdrop-farming platform (site verified 2026-07-11 — no Stellar/Soroban/course content remains).",
	},
	helix: { from: "Live", to: "Development" },
	warpdrive: { from: "Live", to: "Development" },
	// boxy 2026-07-09 (human-confirmed dead) + hard evidence: DefiLlama TVL
	// $93 (a LENDING protocol), repo eq-lab/slender last push 2025-10-03.
	// Site still resolves — zombie, not offline; status is the honest signal.
	slender: { from: "Live", to: "Inactive" },
	// ── Liveness wave (boxy-approved 2026-07-10, improvements/liveness-
	// triage-2026-07-10.md): 38 confirmed-dead flips. Each verdict required
	// POSITIVE evidence (shutdown notice, parked/unregistered domain, or a
	// fully abandoned footprint) from the per-project research pass; the
	// per-row note becomes lifecycle.note so the record is ecosystem memory
	// ("X WAS a live Y that shut down"), not silence. From-guarded: a later
	// manual correction is never clobbered; rows retire once applied. ──
	aerochain: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): Parent company site wingleet.com is live (\u00a9 2026) but pivoted to aircraft redelivery/compliance intelligence with zero mention of Aerochain, blockchain, or Stellar; aerochain.wingleet.com no longer\u2026",
	},
	arcturus: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): The GPT backend domain arcturus-gpt.com is unresolvable and github.com/Soneso/Arcturus was last pushed 2024-03; the ChatGPT plugin platform it targeted was discontinued and Soneso's otherwise-activ\u2026",
	},
	b4b: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): Primary brand domain parked for sale ('b4b.world for sale | Spaceship.com'), b4b.app serves invalid TLS only, newest footprint is 2022-23 hackathon submissions.",
	},
	benkiko: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): benkiko.xyz has no DNS record, GitHub org benkikodao has zero public repos, newest footprint is 2021 press + passive SCF/LinkedIn listings.",
	},
	blip: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): Owner deliberately archived all four repos in the blipmonitor GitHub org (last push 2024-12, all archived=true) and blip.watch is unregistered; no relaunch found.",
	},
	borderdollar: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): borderdollar.co 404, borderdollar.com parked lander, founder's GitHub pushes only unrelated personal repos, Tracxn profile reports the company no longer active.",
	},
	brl: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): nTokens' own live site announces the BRL-on-Stellar anchor service was discontinued during 2024 ('Servi\u00e7o de Real Virtual \u2026 ser\u00e1 descontinuado ao longo de 2024') with fiat withdrawals not guarantee\u2026",
	},
	canfy: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): canfy.net NXDOMAIN with no Wayback snapshot, no GitHub org, zero product mentions via search \u2014 entire footprint gone.",
	},
	chaincred: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): Recorded landing page prince29chouhan.github.io/chaincred_landing 404s, author has no chaincred repo left, and search found no footprint at all \u2014 hackathon-grade project.",
	},
	cosmiclink: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): cosmic.link is NXDOMAIN, sibling cosmic.plus redirects to an expired-domain sale listing, and the cosmic-plus GitHub org's last real push was 2023-09.",
	},
	cosmicvote: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): cosmic.vote NXDOMAIN (last Wayback Nov 2023), parent cosmic.plus expired \u2192 domain-sale redirect, GitHub untouched since 2023-09 \u2014 footprint abandoned ~3 years.",
	},
	cryptocannoneer: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): blockshangerous.com unregistered (last indexed blog post 2021-04), GitHub org last push 2022-11; no newer footprint found.",
	},
	"ea-kazi": {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): biotlabs.africa NXDOMAIN (last archived 2024-08), org stale since 2023-03, eakazi.com broken TLS, .io/.org NXDOMAIN; last sign of life is a ~2023/24 pivot post to ICP with no working product since.",
	},
	equilibre: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): equilibre.io unresolvable, cosmic-plus GitHub org idle since 2023-09, parent domain cosmic.plus now serves a domain-sales/parking page \u2014 entire footprint abandoned.",
	},
	forge: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): forgerpc.com is unresolvable, no GitHub org, and no footprint found via searches for 'Forge forgerpc Stellar Horizon Soroban RPC node deployment' \u2014 no mention of the product or a relaunch anywhere.",
	},
	"gecko-fuzz": {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): Recorded website github.com/jjjutla/geckofuzz returns 404 \u2014 repo deleted (absent from the author's repo list) \u2014 and searches for 'geckofuzz' find no relaunch or other footprint.",
	},
	lumenaut: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): The pool's sole function was eliminated when Stellar removed protocol inflation (Protocol 12, Oct 2019 \u2014 coinmetrics: 'the end of inflation also means the end of the Lumenaut inflation pool'); lume\u2026",
	},
	"lumens-for-charity": {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): lumensforcharity.tech unregistered; only footprint is SCF Round 3 material from January 2020 (galactictalk.org); no activity since.",
	},
	mimoto: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): Only recorded footprint github.com/nkoorty/mimoto returns 404 and is absent from the owner's repo list; search found no footprint anywhere else.",
	},
	mxlet: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): xlet.io no longer resolves and the wallet repo github.com/MattPearce/xlet last pushed 2020-06; the author's 2026 GitHub activity is entirely unrelated projects.",
	},
	opensolar: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): openx.solar NXDOMAIN, YaleOpenLab repos untouched since Jan 2023, Yale OpenLab's own page frames the effort as concluded/absorbed into Open Earth Foundation \u2014 the Stellar crowdfunding platform no l\u2026",
	},
	pactta: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): pactta.com fully unregistered (no NS/A records) and searches found no footprint newer than the 2023 Techstars class announcement.",
	},
	"paygo-crypto": {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): paygocrypto.io unregistered (no NS/A records); no current footprint found via searches \u2014 only unrelated or archival results.",
	},
	quidroo: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): quidroo.com unresolvable; only stale directory entries (communityfund.stellar.org/projects/quidroo, F6S, Crunchbase); no product activity since ~2021 DFS Lab/Stellar cohort coverage.",
	},
	rigel: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): rigel.link has no DNS record; only footprint is the ~2019 SCF #5 listing/forum thread; recent 'Rigel' hits are an unrelated affiliate tool.",
	},
	"scam-flagging-system": {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): Recorded website (a Google Sheet) returns 404 and searches for 'Stellar Scam Flagging System' surface nothing beyond the SCF listing at https://communityfund.stellar.org/projects/scam-flagging-syst\u2026",
	},
	skeeper: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): skeeper.xyz has no DNS records; only footprint is the SCF-23 recap and a stale search-index entry \u2014 no GitHub org or newer activity anywhere.",
	},
	snnac: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): snnac.me unregistered, BlockShangerous GitHub org last push 2022-11, only 2022-era SCF#11 material found; no relaunch.",
	},
	"soroban-assistant": {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): Heroku app gone (404), no GitHub org, no footprint via search \u2014 hackathon-grade project with zero remaining presence.",
	},
	sorobanide: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): sorobanide.com unresolvable and the only traced repo (omeganetwork-tech/sorobanide) also deleted (GitHub API 404); no other footprint via search.",
	},
	sorobuilder: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): sorobuilder.com returns 404, no footprint via search, author's related repo github.com/luisao8/Soroban-code-AIssistant untouched since 2024-06 (his 2026 pushes are unrelated AI projects).",
	},
	sorosorcerer: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): sorosorcerer.com NXDOMAIN, org has no sorosorcerer repo (recent pushes unrelated), only dated footprint is a 2023 SDF community-tooling blog mention; no relaunch.",
	},
	sorscan: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): sorscan.org/.com/.io all unresolvable, no GitHub presence, nothing newer than the SCF #20 (2023) listing at communityfund.stellar.org/project/sorscan-svd.",
	},
	"stellar-update": {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): Domain taken over by an unrelated party \u2014 stellarupdate.com now serves a Chinese admin system ('\u667a\u7acb\u65b9\u7ba1\u7406\u7cfb\u7edf', verified via curl) \u2014 and no trace of the Stellar blog operating elsewhere.",
	},
	stellarstrides: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): stellarstrides.xyz has no DNS record; only footprint is the SCF #22 recap on medium.com/stellar-community \u2014 no site, socials, or repos anywhere newer.",
	},
	typiqo: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): typiqo.it has no DNS record, typiqo.com redirects to a domain-for-sale listing (brandbucket), newest footprint is 2021 press.",
	},
	vitreous: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): vitreous.co unregistered (no NS/A records); only footprint is a years-old SCF profile piece on stellar.org/blog with nothing newer anywhere.",
	},
	whalestack: {
		from: "Live",
		to: "Inactive",
		note: "Confirmed defunct 2026-07-10 (liveness triage): whalestack.com has 303-redirected to btcpayserver.org since at least 2025-09 (Wayback CDX), site now refuses connections, coinqvest.com broken TLS, the WordPress coinqvest plugin delisted, GitHub s\u2026",
	},
};

/** Website corrections (liveness triage 2026-07-10, boxy-approved): the
 * PRODUCT is verifiably alive but the recorded URL is dead (lapsed apex,
 * rebrand, or move). Overwrites links.website; equality no-ops keep reruns
 * clean. Status stays Live — these were false positives on the death list. */
const WEBSITE_FIXES: Record<string, string> = {
	// Afriex operates today at afriex.com (200; afriexapp.com www even redirects there) with active App Store/Google Play listings; only the recorded afriexapp.com…
	afriex: "https://www.afriex.com/",
	// ARST Argentine-peso stablecoin has a live dedicated site (arst.finance/en, 'ARST — The Argentine Peso Stablecoin', deployed on Stellar among other chains); r…
	arst: "https://www.arst.finance/en",
	// Product site live at https://www.bravepay.net/ (wallet/POS/payments content), help.bravepay.net 200; only the recorded apex bravepay.net DNS record is broken.
	bravepay: "https://www.bravepay.net/",
	// BRZ stablecoin actively offered by issuer Transfero, live at transfero.com featuring BRZ; recorded brztoken.io returns 404.
	brz: "https://www.transfero.com/",
	// Old domain depayapp.com serves the rebranded live site depay.us (200, 'infraestructura de pagos cross-border', same org per hreflang); old domain's TLS cert …
	depay: "https://depay.us/",
	// Rebranded to Choppaddi and live at choppaddi.com (200, food-delivery content still referencing FastBuka), while fastbuka.com returns 503.
	fastbuka: "https://choppaddi.com/",
	// Recorded 'website' was a now-broken Google Slides link; freshly awarded SCF #37 build ($135k, Build phase) per communityfund.stellar.org, named among active …
	lumenshade:
		"https://communityfund.stellar.org/project/lumenshade-privacy-pools-hnp",
	// Meria operates today: live staking platform at meria.com/en/staking + stake.meria.com, Feb 2026 Taurus partnership announcement; recorded defi.meria.com subd…
	"meria-defi": "https://www.meria.com/",
	// Securrency was acquired by DTCC (closed Dec 2023) and rebranded DTCC Digital Assets, active with 2026 announcements (dtcc.com/news/2026/may/04 tokenization s…
	securrency: "https://www.dtcc.com/digital-assets",
	// Live: sfxchange.co 302s to www.sfxchange.co returning 200 titled 'SFx Money App'; only the recorded /en deep link 404s.
	sfx: "https://www.sfxchange.co/",
	// The Stellar MetaMask snap is listed and installable on the official Snaps directory (snaps.metamask.io/snap/npm/stellar-snap; bogus-slug control 404s), npm s…
	"stellar-metamask": "https://snaps.metamask.io/snap/npm/stellar-snap/",
	// Continues as OBSRVR Radar: radar.withobsrvr.com live ('Stellar Network Explorer | OBSRVR Radar'), github.com/withObsrvr/stellarbeat pushed 2026-07-09; stella…
	stellarbeat: "https://radar.withobsrvr.com/",
	// xycLoans WebApp live at https://main.xycloans.app/ with docs.xycloans.app live and the xycloo GitHub org pushing as recently as 2026-07; only the recorded ap…
	xycloans: "https://main.xycloans.app/",
};

/** Curated seeds — create-if-missing directory entries with human-verified
 * provenance. Never updates an existing row (slug match = skip), so a seed
 * can't clobber later edits. Keep this list SHORT and evidence-quoted. */
const SEEDS: Array<{
	slug: string;
	name: string;
	category: string;
	status: string;
	types: string[];
	supportedNetworks: string[];
	shortDescription: string;
	links: { website?: string; github?: string };
	provenance: { source: "LumenloopSeed" | "UserSubmitted" | "AdminEdit" };
}> = [
	// 2026-07-11 audit: kalepail/passkey-kit — THE ecosystem passkey smart-
	// wallet kit (named in our own STELLAR_SIGNAL regex and depth answer key)
	// — was missing from the repo index entirely because discovery is
	// project-seeded and no record linked it. Precedent for SDK/tooling
	// records: javascript-stellar-sdk, stellar-cli.
	{
		slug: "passkey-kit",
		name: "Passkey Kit",
		category: "Tooling",
		status: "Live",
		types: ["SDK"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"TypeScript SDK for building Stellar smart wallets secured by passkeys (WebAuthn/secp256r1) — client, server and Soroban contract components for signing with device biometrics instead of seed phrases. By kalepail (Tyler van der Hoeven).",
		links: {
			website: "https://github.com/kalepail/passkey-kit",
			github: "https://github.com/kalepail/passkey-kit",
		},
		provenance: { source: "AdminEdit" },
	},
	// boxy 2026-07-09: the launching-vs-launched contrast needs the launching
	// side represented. Identity verified via the Certora audit PDF (Certora/
	// SecurityReports 06_10_2026_Certora_SpectraBridge_AuditReport.pdf), whose
	// scope links resolve to github.com/perspectivefi/audit-bridge-stellar —
	// perspectivefi = "Perspective" (perspective.fi), the org behind
	// spectra.finance. Their own site lists EVM chains only (no Stellar yet)
	// → Development, not Live.
	{
		slug: "spectra-finance",
		name: "Spectra Finance",
		category: "Protocol/Contract",
		status: "Development",
		types: ["Bridge"],
		supportedNetworks: ["stellar", "evm"],
		shortDescription:
			"Spectra (by Perspective, spectra.finance) is an interest-rate derivatives protocol live on EVM chains — fixed-rate yield via Principal/Yield Tokens. Its Spectra Bridge, an EVM⇄Stellar bridge bringing Spectra assets to Soroban, is in development: Certora audited the Stellar bridge contracts in May 2026 (perspectivefi/audit-bridge-stellar). Not yet launched on Stellar.",
		links: {
			website: "https://www.spectra.finance",
			github: "https://github.com/perspectivefi",
		},
		// provenance.source is required; AdminEdit = curated by us.
		provenance: { source: "AdminEdit" },
	},
	// ── SCF-awardee seed wave (boxy 2026-07-10 "lets do that"): projects
	// found on communityfund.stellar.org with an award badge but NO directory
	// record (scf-absence-diff.ts). Each was researched (6-agent fan-out) for a
	// LIVE footprint and deduped against the directory (19 of 50 candidates
	// already existed under different slugs → dropped). These 31 have a verified
	// site/repo; went-nowhere submissions were SKIPped. AdminEdit provenance;
	// create-if-missing so a slug collision safely no-ops. Evidence + skip list:
	// improvements/waves/scf-seed-wave-2026-07-10.md.
	{
		slug: "forestio",
		name: "Forestio",
		category: "User-Facing App",
		status: "Live",
		types: ["Social Impact"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Forestio uses satellite imagery and machine learning to verify tree planting and estimate carbon footprints, with plans to tokenize verified forestry data on-chain.",
		links: {
			website: "https://forestio.ai/",
			github: "https://github.com/forest-io/ForestConsumerWeb",
		},
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "nemorixpay",
		name: "NemorixPay",
		category: "User-Facing App",
		status: "Development",
		types: ["Wallet", "Payments"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"NemorixPay is an in-development Flutter mobile wallet for cross-border remittances between the U.S. and Latin America using Stellar stablecoins (USDC/XLM).",
		links: {
			website: "https://nemorixpay.com/",
			github: "https://github.com/nemorixpay",
		},
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "trustline",
		name: "Trustline",
		category: "Infrastructure",
		status: "Development",
		types: ["Security", "Infrastructure"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Trustline provides a security SDK and smart-contract insurance for institutional on-chain finance, offering a free sandbox tier and TVL-based pricing.",
		links: { website: "https://www.trustline.id" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "troqpay",
		name: "TroqPay",
		category: "User-Facing App",
		status: "Live",
		types: ["Payments", "Stablecoin"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"TroqPay lets Brazilian merchants accept Pix via checkout, links, or API and settle in BRL or stablecoins, using Stellar as a digital-dollar settlement layer.",
		links: { website: "https://troqpay.com" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "bluechip",
		name: "Bluechip",
		category: "Tooling",
		status: "Live",
		types: ["Analytics", "Stablecoin"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Bluechip is an independent stablecoin rating agency publishing letter-grade economic-safety ratings for 15+ stablecoins using its SMIDGE framework.",
		links: { website: "https://bluechip.org/en" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "tokenpad",
		name: "Tokenpad",
		category: "User-Facing App",
		status: "Live",
		types: ["Analytics"],
		supportedNetworks: ["stellar", "evm"],
		shortDescription:
			"Cross-chain crypto and DeFi portfolio-tracker mobile app (iOS/Android, 100k+ downloads) by 57blocks, funded via SCF to add Stellar support.",
		links: { website: "https://tokenpad.io" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "fuul",
		name: "Fuul",
		category: "Tooling",
		status: "Live",
		types: ["Analytics", "Infrastructure"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Fuul is an incentives, affiliate and referral engine for crypto apps (clients include Coinbase, dYdX), funded by SCF to deploy natively on Stellar via Soroban.",
		links: { website: "https://www.fuul.xyz" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "prism",
		name: "Prism",
		category: "User-Facing App",
		status: "Live",
		types: ["DEX", "Payments"],
		supportedNetworks: ["stellar", "evm"],
		shortDescription:
			"Prism is a multi-chain crypto financial hub (DEX liquidity pools, trading, payments, yield) funded by SCF #44 to expand onto Stellar.",
		links: { website: "https://prismfi.cc" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "escala",
		name: "Escala",
		category: "User-Facing App",
		status: "Development",
		types: ["Payments", "RWA"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Escala is a B2B embedded-finance platform (LatAm) building collective-investment products on Soroban with USDC escrows and milestone-based fund releases.",
		links: { website: "https://escalahq.com" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "safu-protocol",
		name: "SAFU Protocol",
		category: "Protocol/Contract",
		status: "Development",
		types: ["Security", "Infrastructure"],
		supportedNetworks: ["stellar", "evm"],
		shortDescription:
			"SAFU is an audited stake-backed wallet-drain insurance protocol (deposit to earn yield plus automated payout coverage) on Ethereum, funded by SCF #44 to launch community pools on Stellar.",
		links: { website: "https://safustaking.com" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "the-strategists",
		name: "The Strategists",
		category: "Protocol/Contract",
		status: "Development",
		types: ["Lending", "SDK"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"PaltaLabs' The Strategists builds reusable Soroban smart-contract modules for DeFi yield optimization (tied to their DeFindex product), funded by SCF #42.",
		links: {
			website: "https://paltalabs.io",
			github: "https://github.com/paltalabs",
		},
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "gameduk",
		name: "Gameduk",
		category: "User-Facing App",
		status: "Live",
		types: ["Education", "Gaming"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Gamified learning platform where users complete educational challenges to earn XP, badges and certificates; its SCF-funded MVP rewarded learners with Stellar XLM.",
		links: { website: "https://www.gameduk.com" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "tokeshare",
		name: "Tokeshare",
		category: "User-Facing App",
		status: "Live",
		types: ["RWA", "Stablecoin"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Tokenized real-world-asset investment platform (real estate, commodities, index funds) with a Stellar proof-of-concept for tokenized real estate and USDC rent distribution.",
		links: { website: "https://tokeshare.co" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "scopuly",
		name: "Scopuly",
		category: "User-Facing App",
		status: "Live",
		types: ["Wallet", "DEX"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Non-custodial Stellar wallet and SDEX across iOS, Android, macOS, Telegram and web supporting payments, multisig, asset issuance, swaps and DEX trading.",
		links: { website: "https://scopuly.com" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "elementpay",
		name: "ElementPay",
		category: "User-Facing App",
		status: "Live",
		types: ["Payments", "Stablecoin", "Anchor"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Cross-border USDC stablecoin payment infrastructure for Africa connecting mobile money and USSD to stablecoin rails for invoicing, collections and payouts.",
		links: { website: "https://www.elementpay.net" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "hermes",
		name: "Hermes",
		category: "Protocol/Contract",
		status: "Development",
		types: ["DEX"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Decentralized perpetual (leveraged) exchange on Stellar/Soroban using liquidity pools and oracles, built by the Zenith Protocols team.",
		links: {
			website: "https://github.com/zenith-protocols/hermes",
			github: "https://github.com/zenith-protocols/hermes",
		},
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "feeprime",
		name: "FeePrime",
		category: "User-Facing App",
		status: "Live",
		types: ["Payments"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"FeePrime is a business-management platform for African SMEs (POS, invoicing, CRM, accounting, payroll); its SCF pitch was a Stellar-USDC invoicing and payroll tool for freelancers.",
		links: { website: "https://feeprime.com" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "openxswitch",
		name: "OpenXSwitch",
		category: "Infrastructure",
		status: "Live",
		types: ["Wallet", "Payments", "Infrastructure"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"OpenXSwitch is a Lagos financial-infrastructure-as-a-service platform offering wallet-as-a-service, a trading/swap API, and stablecoin/smart-account infra for African fintechs; its SCF pitch added Stellar interchain and gasless APIs.",
		links: { website: "https://openxswitch.com" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "verso",
		name: "VERSO",
		category: "Anchor",
		status: "Live",
		types: ["Anchor", "Payments", "Stablecoin"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"VERSO/Versotek is an SBS-regulated Peruvian stablecoin exchange building Peru's first compliant Stellar anchor for PEN/USD/USDC on- and off-ramps via the SDF Anchor Platform.",
		links: { website: "https://www.versotek.io" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "mydatacoin",
		name: "MyDataCoin",
		category: "Infrastructure",
		status: "Development",
		types: ["Security", "Lending"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"MyDataCoin builds privacy-preserving DeFi lending and KYC compliance on Stellar using zero-knowledge proofs and self-sovereign identity, with an 'Atria' dashboard suite.",
		links: {
			website: "https://mydatacoin.io",
			github: "https://github.com/MyDataCoin",
		},
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "neftwerk",
		name: "Neftwerk",
		category: "User-Facing App",
		status: "Live",
		types: ["NFT", "RWA"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Blockchain platform for contemporary-art transactions and real-world-asset tokenization of artworks, including the MyPocket Gallery tool and the Neftwerk Protocol.",
		links: {
			website: "https://www.neftwerk.com",
			github: "https://github.com/Neftwerk/Neftwerk",
		},
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "stellar-command-insights",
		name: "Stellar Command Insights",
		category: "Tooling",
		status: "Development",
		types: ["Analytics", "Infrastructure"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Real-time monitoring and visualization tool for Soroban CLI commands and on-chain events, built on the ELK stack with Kibana dashboards and Telegram/Slack alerts.",
		links: {
			website: "https://github.com/bytemaster333/Soroban-ELK",
			github: "https://github.com/bytemaster333/Soroban-ELK",
		},
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "lucent",
		name: "Lucent",
		category: "Protocol/Contract",
		status: "Development",
		types: ["Stablecoin", "Lending"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Stellar-native Liquity-v2-style CDP protocol where users deposit XLM collateral to mint the overcollateralized stablecoin starUSD and earn yield.",
		links: { website: "https://starusd.xyz/" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "zilt",
		name: "Zilt",
		category: "Anchor",
		status: "Live",
		types: ["Anchor", "Payments", "Stablecoin"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Mobile-money on-ramp converting M-Pesa and other mobile-money balances into USDC on Stellar to onboard unbanked users in the global south.",
		links: {
			website: "https://zilt.vercel.app/",
			github: "https://github.com/tomrowbo/zilt",
		},
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "d-fct",
		name: "d-FCT",
		category: "User-Facing App",
		status: "Development",
		types: ["Social Impact"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"A decentralized fact-checking toolkit for transparent content verification, provenance, governance, and reward-driven community contributions.",
		links: { website: "https://dfc.to", github: "https://github.com/mobr-ai" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "soroban-decompiler",
		name: "Soroban Decompiler",
		category: "Tooling",
		status: "Development",
		types: ["Security"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"An open-source tool that reverse-engineers Soroban (WASM) smart contracts into human-readable form for auditing and debugging.",
		links: {
			website: "https://github.com/salaheldinsoliman/soroban-decompiler",
			github: "https://github.com/salaheldinsoliman/soroban-decompiler",
		},
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "lumagg",
		name: "LumAgg",
		category: "User-Facing App",
		status: "Development",
		types: ["DEX"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"A liquidity aggregator for Stellar Soroban DEXes (Soroswap, Aquarius, Phoenix, Comet, Classic) finding optimal swap routes and splitting orders across venues in one transaction.",
		links: { website: "https://www.lumagg.xyz" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "soroban-payout-token-suite",
		name: "Soroban Payout & Token Suite",
		category: "User-Facing App",
		status: "Development",
		types: ["RWA", "Payments"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"A Soroban-based Asset Manager for issuing, selling, and redeeming tokens with investor onboarding, KYC, and automated payout distribution.",
		links: { website: "https://floris3.com" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "octarine",
		name: "Octarine",
		category: "Protocol/Contract",
		status: "Development",
		types: ["RWA", "DEX"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"An RFQ-based liquidity protocol for tokenized real-world assets on Stellar where liquidity providers compete to offer executable prices for instant onchain settlement.",
		links: { website: "https://octarine.finance" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "lusty-finance",
		name: "Lusty Finance",
		category: "User-Facing App",
		status: "Live",
		types: ["DEX"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"A DeFi options-yield venue on Stellar where users sell covered calls and cash-secured puts on XLM to earn premium upfront, with Black-Scholes pricing and automated settlement.",
		links: {
			website: "https://lusty.finance",
			github: "https://github.com/utkurock/Lusty",
		},
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "sunereum-labs",
		name: "Sunereum Labs",
		category: "Infrastructure",
		status: "Development",
		types: ["RWA", "Analytics"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Combines IoT-driven data collection with Soroban smart contracts for renewable-energy asset monitoring, parametric insurance, and stablecoin-based energy transactions.",
		links: {
			website: "https://sunereum.com",
			github: "https://github.com/Sunereum-Labs",
		},
		provenance: { source: "AdminEdit" },
	},
];

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
	rarible: ["stellar", "evm"], // sls-037: rarible.com multichain NFT marketplace (Ethereum-origin, EVM chains) + announced Stellar integration — deployment basis for its Live status
	// sls-029 oracle network evidence (Live oracles with EMPTY networks made
	// materially different deployment claims look equivalent). Both rows below
	// verified from PRIMARY sources 2026-07-11:
	band: ["stellar", "evm", "xrpl", "cosmos"], // stellar: developers.stellar.org/docs/data/oracles/oracle-providers lists Band's deployed MAINNET contract CCQXWMZVM3KRTXTUPTN53YHL272QGKF32L7XEDNZ2S6OSUFK3NFBGG5M (+ bandprotocol/band-std-reference-contracts-soroban + Band's own integration post); evm/xrpl/cosmos: docs.bandchain.org supported-blockchains MAINNET table (Astar/Celo/Cronos/Harmony/Sonic/Xlayer/... → evm umbrella; XRPL named; Secret/Nibiru → cosmos). That Band table LAGS — Stellar is absent from it despite the deployed, actively-relaying mainnet contract (sls-029 live reads 2026-07-10).
	lightecho: ["stellar"], // github.com/bp-ventures/lightecho-stellar-oracle README: deployed MAINNET contract CDOR3QD27WAAF4TK4MO33TGQXR6RPNANNVLOY277W2XVV6ZVJ6X6X42T (+ testnet CA335...); Stellar-only Soroban oracle (BP Ventures). Deployment evidence, NOT freshness — sls-029's probe observed its mainnet price state ~4 months stale (2026-07-10).
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
	{ dupe: "band-protocol", canonical: "band" }, // both SCF ($100k/$60k) — shadow keeps its own award facts, lineage note explains the split
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
