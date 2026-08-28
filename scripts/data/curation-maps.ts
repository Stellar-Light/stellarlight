/** Shared curated-data maps — the single source of truth for owner-reviewed
 * status flips, website corrections and directory seeds.
 *
 * Extracted verbatim from scripts/data/curate-projects.ts (which applies them)
 * so that scripts/data/backfill-status-provenance.ts can DERIVE status
 * provenance (statusBasis/statusAsOf/statusSourceUrl, sls-024) from the same
 * evidence without importing a script whose module body runs main().
 * No data changed in the move; edit rows HERE and both consumers see them.
 */

export type StatusBasis =
	| "operator-announcement"
	| "site-liveness"
	| "onchain-activity"
	| "human-verified"
	| "source-inherited";

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
export const STATUS_FIX: Record<
	string,
	{
		from: string;
		to: string;
		note?: string;
		/** sls-024: optional label provenance, written alongside the status flip. */
		asOf?: string;
		sourceUrl?: string;
		basis?: StatusBasis;
	}
> = {
	// sls-073 (2026-08-25): Zenex's STATUS is already right (Pre-Release) — this
	// entry does not move it. What it fixes is the PROVENANCE: it was resting on
	// `site-liveness`, so the next sweep could have churned it off a mere 200.
	// Verified today at docs.zenex.trade/deployments/contract-addresses — the
	// page still lists contract addresses as TBD, i.e. nothing is deployed for
	// users yet. from === to, so the from-guard makes this a no-op on status
	// and writes only the dated evidence.
	// User report 2026-08-27 ("laina is not live, testnet"): confirmed against
	// the code itself — src/lib/horizon.ts hardcodes horizon-testnet.stellar.org
	// and Networks.TESTNET; the only other branch is localhost. No mainnet path
	// exists. The row's Live rested on site-liveness (a 200 from laina-de.fi's
	// Astro landing page — a page is not a protocol). Repo laina-defi/laina
	// last pushed 2026-08-11, so the project is alive as a PROJECT, just not
	// launched: Pre-Release, not Inactive.
	// User report 2026-08-29 ("hoops is not live, testnet") — and a lesson
	// re-learned the same week it was written: the previous entry here
	// stamped Live evidence off a 200 WITHOUT reading the page. The page
	// itself says it: products are labelled TESTNET ("Incentivized liquidity
	// pools ... TESTNET", "Hoops Vaults ... TESTNET") and the hero says
	// "JOIN THE WAITLIST". Testnet products + waitlist = the noether class:
	// a real, active project that has NOT launched. Pre-Release, not Live,
	// not Inactive.
	// receipt: improvements/receipts/hoops-2026-08-28.json
	hoops: {
		from: "Live",
		to: "Pre-Release",
		note: "DeFi savings/pools platform for Stellar; site is live but its products are labelled TESTNET and the hero is a waitlist — pre-launch.",
		asOf: "2026-08-29",
		sourceUrl: "https://hoops.finance/",
		basis: "human-verified",
	},
	// receipt: improvements/receipts/laina-2026-08-28.json
	laina: {
		from: "Live",
		to: "Pre-Release",
		note: "Single-token lending pools on Soroban; app targets TESTNET only (horizon.ts pins horizon-testnet + Networks.TESTNET; no mainnet branch).",
		asOf: "2026-08-27",
		sourceUrl:
			"https://github.com/laina-defi/laina/blob/main/src/lib/horizon.ts",
		basis: "human-verified",
	},
	// receipt: improvements/receipts/zenex-2026-08-28.json
	zenex: {
		from: "Pre-Release",
		to: "Pre-Release",
		note: "Perpetual (leveraged) trading exchange on Stellar/Soroban, formerly Hermes; pre-launch — its deployments page still lists every contract address as TBD.",
		asOf: "2026-08-25",
		sourceUrl: "https://docs.zenex.trade/deployments/contract-addresses",
		basis: "human-verified",
	},
	// sls-073 (2026-08-25): Noether was Live on `site-liveness` — the weakest
	// basis we have, and the same "a 200 is not a business" class as kulipa
	// below. Its own site says the opposite of Live: "funds are not real",
	// "Trade on testnet -> Join the mainnet waitlist", and "Noether's mainnet
	// contracts are being audited. Mainnet opens when the audit completes."
	// Repo shape agrees — NoetherDEX/noether is 3 stars, last commit
	// 2026-07-11, alongside a Discord webhook and a scratch repo. SCF-funded
	// and genuinely being built, so this is Pre-Release, NOT Inactive: the
	// product is coming, it just is not tradeable with real funds yet.
	// Flip back to Live when the mainnet contracts are published.
	// receipt: improvements/receipts/noether-2026-08-28.json
	noether: {
		from: "Live",
		to: "Pre-Release",
		note: "Perpetual futures DEX on Stellar/Soroban, running on PUBLIC TESTNET only — its own site states funds are not real and mainnet opens after the in-progress audit.",
		asOf: "2026-08-25",
		sourceUrl: "https://noether.exchange/",
		basis: "human-verified",
	},
	// Raven #39 (elizabethli-sdf, 2026-08-21): Raven recommended Kulipa FIRST
	// for "what card services can I integrate on Stellar". Kulipa shut down on
	// 2026-07-29 (insolvency) — ~20 wallet partners lost card service and
	// ~120,000 cards were disabled overnight. Six independent reports
	// (coinalertnews 07-31, btctiming 08-02, bydfi, guavy, startupfortune,
	// bleap). kulipa.xyz still answers 200 with a "Kulipa is changing home /
	// join our waitlist" placeholder, which is why site-liveness kept it Live:
	// a 200 is not a business. SCF-funded; the record stays, the label moves.
	kulipa: {
		from: "Live",
		to: "Inactive",
		note: "Stablecoin card-issuing infrastructure (settlement on Stellar) that shut down on 2026-07-29 citing insolvency; ~20 wallet partners and ~120,000 cards went dark. The domain serves a 'changing home' placeholder.",
		asOf: "2026-08-21",
		sourceUrl:
			"https://coinalertnews.com/news/2026/07/31/kulipa-shuts-down-after-funding",
		basis: "human-verified",
	},
	// Raven #39: GetBlockCard was Ternio's BlockCard, which became Unbanked
	// (ternio.io 301s → unbanked.com; Republic: "Unbanked, formerly Ternio
	// BlockCard"). Unbanked wound down in 2023 (Cointelegraph: "exhausted all
	// options", citing the US regulatory environment). The recorded domain
	// getblockcard.com has since lapsed and now serves an Indonesian lottery-
	// spam page — which answers HTTP 200, so site-liveness called it Live. The
	// boss-pay class (lapsed apex re-registered by strangers), except here the
	// product is gone too, so this is Inactive rather than a website fix.
	getblockcard: {
		from: "Live",
		to: "Inactive",
		note: "Ternio's BlockCard crypto card platform, rebranded Unbanked, which wound down in 2023. The recorded domain getblockcard.com has lapsed and now serves unrelated lottery-spam content.",
		asOf: "2026-08-21",
		sourceUrl:
			"https://cointelegraph.com/news/unbanked-to-wind-down-citing-regulatory-enviroment",
		basis: "human-verified",
	},
	// Provenance REFRESH (Live → Live), not a flip: the Raven cold-agent runs
	// (2026-07-20) flagged blend serving statusAsOf 2025-12-17
	// source-inherited while its TVL refreshed same-day — status freshness
	// lagged fact freshness on the most-consumed DeFi row. Verified live:
	// mainnet.blend.capital serves the functional app (200, IPFS-backed).
	blend: {
		from: "Live",
		to: "Live",
		asOf: "2026-07-20",
		sourceUrl: "https://mainnet.blend.capital/",
		basis: "site-liveness",
	},
	// Same refresh class, found 2026-07-23 by sweeping SCF-awarded projects for
	// "Live but no commit in 500+ days". All three came back as quiet repos, NOT
	// dead products — which is the whole reason we never mark defunct on repo
	// staleness. Each site checked directly and serving real content; the labels
	// were right, the provenance was source-inherited from the 2025-12-17 seed
	// and had never been verified by anyone.
	//
	// Worth noting WHY the repo signal misleads on these: lumenswap/swap-contract,
	// decafteam/.github and wombat-exchange/v1-core are the only repos we have
	// linked, and a contract repo or a .github profile repo goes quiet precisely
	// BECAUSE the thing shipped and stabilised.
	lumenswap: {
		from: "Live",
		to: "Live",
		asOf: "2026-07-23",
		sourceUrl: "https://lumenswap.io/",
		basis: "site-liveness",
		note: "Site serves the DEX (title: 'Lumenswap | Decentralized Exchange on Stellar'); linked repo last touched 2024, product is not.",
	},
	decaf: {
		from: "Live",
		to: "Live",
		asOf: "2026-07-23",
		sourceUrl: "https://decaf.so/",
		basis: "site-liveness",
		note: "decaf.so serves the live app; our only linked repo is decafteam/.github, a profile repo, so repo recency says nothing about the product.",
	},
	wombat: {
		from: "Live",
		to: "Live",
		asOf: "2026-07-23",
		sourceUrl: "https://wombat.exchange/",
		basis: "site-liveness",
		note: "wombat.exchange serves the live app; v1-core is a stable contract repo.",
	},
	// Same refresh class: vesseo's row asserted basis source-inherited with
	// no sourceUrl. vesseoapp.com verified live 2026-07-20 (product landing,
	// app links, AR/MX/BR/US pages).
	vesseo: {
		from: "Live",
		to: "Live",
		asOf: "2026-07-20",
		sourceUrl: "https://vesseoapp.com/",
		basis: "site-liveness",
	},
	// boxy 2026-07-20 (evidence reviewed, approved flip): up-but-abandoned.
	// eascrow.xyz serves 200 but the bundle froze 2025-03-06 (Last-Modified);
	// dapp.eascrow.xyz froze 2025-06-25 — the EXACT day of the org's last
	// GitHub commit (Eascrow/Eascrow, its only repo). Zero product mentions
	// anywhere in 2025-26. SCF-funded ~$147,950; the note keeps the history.
	eascrow: {
		from: "Live",
		to: "Inactive",
		note: "Was a Soroban escrow dapp (SCF-funded ~$148K). Every mutable surface froze in H1 2025 — site bundle 2025-03-06, dapp bundle and last GitHub commit both 2025-06-25 — with no public signal since; the pages still serve but are abandoned static exports.",
		asOf: "2026-07-20",
		sourceUrl: "https://eascrow.xyz/",
		basis: "human-verified",
	},
	// SCOPE removal, NOT a defunct call (boxy 2026-07-15). lobster (the
	// LP-optimizer / on-chain-market-making-as-a-service for DEXs — distinct
	// from the lobstr wallet) is an SCF #36 grantee ($109K,
	// communityfund.stellar.org/project/lobster-vzw) with an active
	// `stellar-integrations` repo, so it is NOT defunct. But its product is
	// EVM-primary (Solidity `contracts` + EVM AMM/calldata bot toolbox; the
	// Stellar repos are side integrations) and the owner scoped it out of the
	// Stellar projects directory. Inactive is used only as the hide-from-
	// directory lever here; the note keeps the data honest ("active, scoped
	// out" — not "dead").
	lobster: {
		from: "Live",
		to: "Inactive",
		asOf: "2026-07-15",
		basis: "human-verified",
		sourceUrl: "https://github.com/lobster-protocol",
		note: "Scoped out of the Stellar directory 2026-07-15 (owner curation) — NOT defunct. Lobster is a multichain on-chain-market-making / LP-optimization service for DEXs (SCF #36 grantee, $109K; active stellar-integrations repo) whose product is EVM-primary; removed from the Stellar projects directory as out of scope. Distinct from the lobstr wallet.",
	},
	// Dead-project pass (boxy 2026-07-15). Each verified defunct by adversarial
	// web-check (dead/parked domain + no moved site + no recent activity + no
	// product presence) — NOT a staleness heuristic. High-confidence only; the
	// medium/uncertain candidates were held for human review.
	swplug: {
		from: "Live",
		to: "Inactive",
		asOf: "2026-07-15",
		basis: "human-verified",
		note: "Defunct: swplug.com dead (ECONNREFUSED, dead IBM Cloud IP); no WordPress.org plugin listing, no repo; all content 2019-2021. Supported tokens (MOBI/SLT/RMT) are themselves defunct.",
	},
	// (The sls-033 wallet-verification workflow (2026-07-15) also flagged mxlet
	// and equilibre as dead-domain "wallets" — both were already retired in the
	// 2026-07-10 liveness triage below, so no new STATUS_FIX rows are needed.)
	plutus: {
		from: "Live",
		to: "Inactive",
		asOf: "2026-07-15",
		basis: "human-verified",
		sourceUrl: "https://expireddomains.com/domain/plutus.rentals",
		note: "Defunct: plutus.rentals 301s to an expired-domain/for-sale marketplace; the plutus.property rebrand domain is NXDOMAIN. No live product or repo.",
	},
	"soroban-learn": {
		from: "Live",
		to: "Inactive",
		asOf: "2026-07-15",
		basis: "human-verified",
		sourceUrl: "https://github.com/Soroban-Learn/soroban-learn",
		note: "Defunct: sorobanlearn.com down (ECONNREFUSED); sole GitHub repo is a public ARCHIVE (archived Nov 2023, last commit Jun 2023). SCF awards all pre-2024; the IDE/course never shipped a live site.",
	},
	localcoin: {
		from: "Live",
		to: "Inactive",
		asOf: "2026-07-15",
		basis: "human-verified",
		note: "Defunct: builder UrbanChange Foundation formally announced shutdown ('UrbanChange Foundation and App Closing', May 5 2024 — their last post ever); urbanchange.com now parked (HugeDomains); localcoin.us serves only an empty Loading SPA shell.",
	},
	stex: {
		from: "Live",
		to: "Inactive",
		asOf: "2026-07-15",
		basis: "human-verified",
		sourceUrl: "https://github.com/xycloo",
		note: "Defunct: stex.xycloo.com DNS gone. Builder Xycloo Labs is alive but fully pivoted to Soroban DeFi/infra (Mercury/Zephyr) — no sTeX repo or mention in years; the 2021 LaTeX-editor product is abandoned.",
	},
	"blue-orion": {
		from: "Live",
		to: "Inactive",
		asOf: "2026-07-15",
		basis: "human-verified",
		sourceUrl: "https://github.com/blueorionblockchain",
		note: "Defunct: blueorion.cc dead (all variants fail). GitHub org last push 2020-02-08; repo still advertises a Feb-2020 meetup. SCF participation was 2019. No activity in 5+ years.",
	},
	// Directory-quality engine verify pass (2026-07-15).
	nebula: {
		from: "Live",
		to: "Inactive",
		asOf: "2026-07-15",
		basis: "human-verified",
		sourceUrl: "https://github.com/eigerco/nebula",
		note: "Defunct: Eiger merged into Equilibrium Labs — eiger.co 308-redirects to equilibrium.co; the nebula.eiger.co frontend 404s; eigerco/nebula last release v0.2.0 (Nov 2023), README says 'production usage is discouraged'. No moved Stellar product. (Also mistagged — retyped SDK; it's a Soroban contract library, not an oracle.)",
	},
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
	// sls-024 recurrence (#533 batch): the Live label was source-inherited
	// (never verified) while every checkable surface is dead \u2014 live-verified
	// 2026-07-13.
	centaurus: {
		from: "Live",
		to: "Inactive",
		asOf: "2026-07-13",
		sourceUrl: "https://github.com/centaurus-project/centaurus",
		basis: "human-verified",
		note: "Confirmed inactive 2026-07-13 (sls-024 recheck): the centaurus-project repos have had no activity since January 2022 (centaurus last push 2022-01-05; centaurus-ban-extension 2020-05-18), the recorded website is the GitHub org itself (no product surface exists), and no current deployment evidence was located. The previous Live label was source-inherited, never verified.",
	},
	// Keybase: owner-confirmed 2026-08-17 ("shouldn't be there, not really
	// active"). Acquired by Zoom in 2020; the Stellar wallet integration is
	// legacy and unmaintained while keybase/client itself still gets chat-client
	// commits and holds 9k+ stars, which is exactly how it rode to #1 on the
	// homepage Top Repositories. It was on mark-inactive-projects.ts's curated
	// list (marked Jul 2 + Jul 5) but that script writes status without
	// registering ownership here, so the nightly lumenloop sync flipped it back
	// to Live every time. This row makes `status` curated-owned for the slug.
	keybase: {
		from: "Live",
		to: "Inactive",
		asOf: "2026-08-17",
		sourceUrl: "https://github.com/keybase/client",
		basis: "human-verified",
		note: "Keybase was a Stellar wallet integration (2018-2020). Zoom acquired Keybase in May 2020; the Stellar features are legacy and unmaintained. The keybase/client repo remains active for the chat client only. Marked Inactive on owner review 2026-08-17.",
	},
};

/** Website corrections (liveness triage 2026-07-10, boxy-approved): the
 * PRODUCT is verifiably alive but the recorded URL is dead (lapsed apex,
 * rebrand, or move). Overwrites links.website; equality no-ops keep reruns
 * clean. Status stays Live — these were false positives on the death list. */
/** Name corrections. The lumenloop mapper writes `name`, so a rename that is
 * not registered here is reverted by the next nightly sync — the class that
 * silently undid curation for weeks (#730). Equality no-ops keep reruns clean.
 * Pair with IDENTITY_FIX (curate-projects.ts) so the old name stays an alias. */
export const NAME_FIXES: Record<string, string> = {
	// Raven #39: the Stellar Playbook lists "Wirex" (wirexapp.com). Our row
	// was named for the Wirex Pay product; wirexpaychain.com now 301s to
	// wirexapp.com. The company is the entity; Wirex Pay stays as an alias.
	"wirex-pay": "Wirex",
};

/** Editorial search-ranking boost (Projects.prominence, 0–100; 90 = the
 * canonical pick for its category, 70 = established, 50 = notable, 0 =
 * default). Exact-sync per slug. Not mapped by the feed sync, so no
 * ownership entry is needed. Each row names the fact behind the number. */
export const PROMINENCE_SET: Record<string, number> = {
	// Playbook battery 2026-08-21: 14 exchanges seeded the same day tied on
	// score, so CEX.IO and Coinone led "which exchanges list XLM" while
	// Binance and Coinbase came last. Tiered by CoinGecko 24h XLM volume
	// read 2026-08-21 (Binance $47.8M, Upbit $36.2M, Coinbase $32.9M,
	// Bithumb $13.7M, WhiteBIT $11.6M, Kraken $8.3M, Bybit $8.0M, KuCoin
	// $7.1M, Gate $4.9M, Bitstamp $2.5M, Coinone $1.6M, HTX $0.7M,
	// Crypto.com $0.6M, CEX.IO $19k).
	binance: 70,
	coinbase: 70,
	upbit: 60,
	kraken: 60,
	bithumb: 50,
	whitebit: 50,
	bybit: 50,
	kucoin: 50,
	"gate-io": 40,
	bitstamp: 40,
	coinone: 30,
	htx: 30,
	"crypto-com": 30,
	"cex-io": 20,
};

export const WEBSITE_FIXES: Record<string, string> = {
	// Liveness sweep 2026-08-21: sorobansecurity.com 301s to
	// stellarsecurityportal.com (the host move the research corpus was
	// migrated to in sls-003); the project row still pointed at the old host.
	"stellar-security-portal": "https://stellarsecurityportal.com/",
	// Raven #39: the recorded rain.com is "Rain — a licensed crypto exchange in
	// Bahrain" (its own <title>), a different company. The Stellar card-program
	// provider is rain.xyz ("Stablecoin payments platform for enterprise |
	// Rain"), which is the URL the Stellar Playbook debit-cards page links.
	// NOT the lapsed-domain class: rain.com is alive, it is simply not Rain.
	rain: "https://www.rain.xyz/",
	// Afriex operates today at afriex.com (200; afriexapp.com www even redirects there) with active App Store/Google Play listings; only the recorded afriexapp.com…
	afriex: "https://www.afriex.com/",
	// ARST Argentine-peso stablecoin has a live dedicated site (arst.finance/en, 'ARST — The Argentine Peso Stablecoin', deployed on Stellar among other chains); r…
	arst: "https://www.arst.finance/en",
	// boss-pay's recorded bossmoney.africa lapsed and was re-registered by
	// strangers (2026-07-06: 301 → Turkish gambling site; 2026-07-20: 301 →
	// drakorindo.live streaming site). The live product is IDT Corporation's
	// bossmoney.com (NMLS 935577; Stellar per idt.net + stellar.org blog). The
	// PARTNER side was corrected in curate-partners URL_CORRECTIONS on 07-06;
	// this fixes the PROJECT row that kept serving the hijacked domain.
	"boss-pay": "https://www.bossmoney.com/",
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
/** Additive type tags for EXISTING rows (truth battery guard D, 2026-08-27):
 * the Oracle vertical had no enum member, so every oracle provider carried
 * types:[] and the whole category was invisible to type browse. Each row's
 * evidence is its own already-sourced description (identity, not liveness —
 * status/provenance untouched). ADD-only: never removes or replaces types.
 * Excluded on mention-vs-identity grounds: stellar-oracle-shield (oracle
 * MONITORING tool), mpcvault (wallet whose prose mentions oracles). */
export const TYPE_ADD: Record<string, string[]> = {
	reflector: ["Oracle"], // "decentralized price oracle and data-feed network for Stellar"
	dia: ["Oracle"], // "cross-chain oracle provider live on Stellar/Soroban"
	band: ["Oracle"], // "cross-chain data oracle live on Stellar/Soroban"
	lightecho: ["Oracle"], // "price oracle for Stellar Soroban smart contracts"
	"redstone-finance": ["Oracle"], // "Modular price oracle live on Stellar/Soroban mainnet"
	pyth: ["Oracle"], // "decentralized oracle that delivers real-time price feeds"
	quasar: ["Oracle"], // "price feed oracle grid for Stellar DeFi" (keeps SDK)
	nebula: ["Oracle"], // same grid family, Inactive — type is identity, not liveness
	orally: ["Oracle"], // "On-chain oracles with cross-chain capabilities"
	"soroban-optimistic-oracle": ["Oracle"], // optimistic/arbitration oracle (keeps Infrastructure)
	// Battery F-row rotation 2026-08-29: prominent row with types:[] — it is
	// the Go SDK for Stellar (stellar/go-stellar-sdk, repo verified live).
	"go-stellar-sdk": ["SDK"],
};

export const SEEDS: Array<{
	slug: string;
	name: string;
	category: string;
	status: string;
	types: string[];
	supportedNetworks: string[];
	shortDescription: string;
	links: { website?: string; github?: string };
	provenance: { source: "LumenloopSeed" | "UserSubmitted" | "AdminEdit" };
	// sls-024: freshly web-verified seeds carry their own status provenance on
	// create (passed straight through `data: seed`), so a brand-new Live record
	// isn't left for the source-inherited backfill floor to stamp. Optional.
	statusAsOf?: string;
	statusSourceUrl?: string;
	statusBasis?:
		| "operator-announcement"
		| "site-liveness"
		| "onchain-activity"
		| "human-verified"
		| "source-inherited";
}> = [
	{
		// Playbook CEX directory + CoinGecko XLM tickers read 2026-08-21:
		// 8 live XLM market(s), last trade <24h, 24h volume ≈ $47,848,168.
		slug: "binance",
		name: "Binance",
		category: "User-Facing App",
		status: "Live",
		types: ["Exchange"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Binance is a centralized exchange that lists XLM — 8 live XLM market(s) on CoinGecko as of 2026-08-21 (24h volume ≈ $47,848,168). Listed on the Stellar Playbook's centralized-exchanges directory.",
		links: { website: "https://www.binance.com/" },
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-08-21",
		statusSourceUrl: "https://www.coingecko.com/en/coins/stellar#markets",
		statusBasis: "human-verified",
	},
	{
		// Playbook CEX directory + CoinGecko XLM tickers read 2026-08-21:
		// 4 live XLM market(s), last trade <24h, 24h volume ≈ $32,904,928.
		slug: "coinbase",
		name: "Coinbase",
		category: "User-Facing App",
		status: "Live",
		types: ["Exchange"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Coinbase is a centralized exchange that lists XLM — 4 live XLM market(s) on CoinGecko as of 2026-08-21 (24h volume ≈ $32,904,928). Listed on the Stellar Playbook's centralized-exchanges directory.",
		links: { website: "https://www.coinbase.com/" },
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-08-21",
		statusSourceUrl: "https://www.coingecko.com/en/coins/stellar#markets",
		statusBasis: "human-verified",
	},
	{
		// Playbook CEX directory + CoinGecko XLM tickers read 2026-08-21:
		// 4 live XLM market(s), last trade <24h, 24h volume ≈ $8,339,968.
		slug: "kraken",
		name: "Kraken",
		category: "User-Facing App",
		status: "Live",
		types: ["Exchange"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Kraken is a centralized exchange that lists XLM — 4 live XLM market(s) on CoinGecko as of 2026-08-21 (24h volume ≈ $8,339,968). Listed on the Stellar Playbook's centralized-exchanges directory.",
		links: { website: "https://www.kraken.com/" },
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-08-21",
		statusSourceUrl: "https://www.coingecko.com/en/coins/stellar#markets",
		statusBasis: "human-verified",
	},
	{
		// Playbook CEX directory + CoinGecko XLM tickers read 2026-08-21:
		// 3 live XLM market(s), last trade <24h, 24h volume ≈ $36,178,325.
		slug: "upbit",
		name: "Upbit",
		category: "User-Facing App",
		status: "Live",
		types: ["Exchange"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Upbit is a centralized exchange that lists XLM — 3 live XLM market(s) on CoinGecko as of 2026-08-21 (24h volume ≈ $36,178,325). Listed on the Stellar Playbook's centralized-exchanges directory.",
		links: { website: "https://upbit.com/" },
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-08-21",
		statusSourceUrl: "https://www.coingecko.com/en/coins/stellar#markets",
		statusBasis: "human-verified",
	},
	{
		// Playbook CEX directory + CoinGecko XLM tickers read 2026-08-21:
		// 1 live XLM market(s), last trade <24h, 24h volume ≈ $13,709,333.
		slug: "bithumb",
		name: "Bithumb",
		category: "User-Facing App",
		status: "Live",
		types: ["Exchange"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Bithumb is a centralized exchange that lists XLM — 1 live XLM market(s) on CoinGecko as of 2026-08-21 (24h volume ≈ $13,709,333). Listed on the Stellar Playbook's centralized-exchanges directory.",
		links: { website: "https://www.bithumb.com/" },
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-08-21",
		statusSourceUrl: "https://www.coingecko.com/en/coins/stellar#markets",
		statusBasis: "human-verified",
	},
	{
		// Playbook CEX directory + CoinGecko XLM tickers read 2026-08-21:
		// 3 live XLM market(s), last trade <24h, 24h volume ≈ $8,020,043.
		slug: "bybit",
		name: "Bybit",
		category: "User-Facing App",
		status: "Live",
		types: ["Exchange"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Bybit is a centralized exchange that lists XLM — 3 live XLM market(s) on CoinGecko as of 2026-08-21 (24h volume ≈ $8,020,043). Listed on the Stellar Playbook's centralized-exchanges directory.",
		links: { website: "https://www.bybit.com/" },
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-08-21",
		statusSourceUrl: "https://www.coingecko.com/en/coins/stellar#markets",
		statusBasis: "human-verified",
	},
	{
		// Playbook CEX directory + CoinGecko XLM tickers read 2026-08-21:
		// 4 live XLM market(s), last trade <24h, 24h volume ≈ $7,089,229.
		slug: "kucoin",
		name: "KuCoin",
		category: "User-Facing App",
		status: "Live",
		types: ["Exchange"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"KuCoin is a centralized exchange that lists XLM — 4 live XLM market(s) on CoinGecko as of 2026-08-21 (24h volume ≈ $7,089,229). Listed on the Stellar Playbook's centralized-exchanges directory.",
		links: { website: "https://www.kucoin.com/" },
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-08-21",
		statusSourceUrl: "https://www.coingecko.com/en/coins/stellar#markets",
		statusBasis: "human-verified",
	},
	{
		// Playbook CEX directory + CoinGecko XLM tickers read 2026-08-21:
		// 2 live XLM market(s), last trade <24h, 24h volume ≈ $4,900,173.
		slug: "gate-io",
		name: "Gate",
		category: "User-Facing App",
		status: "Live",
		types: ["Exchange"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Gate is a centralized exchange that lists XLM — 2 live XLM market(s) on CoinGecko as of 2026-08-21 (24h volume ≈ $4,900,173). Listed on the Stellar Playbook's centralized-exchanges directory.",
		links: { website: "https://www.gate.io/" },
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-08-21",
		statusSourceUrl: "https://www.coingecko.com/en/coins/stellar#markets",
		statusBasis: "human-verified",
	},
	{
		// Playbook CEX directory + CoinGecko XLM tickers read 2026-08-21:
		// 2 live XLM market(s), last trade <24h, 24h volume ≈ $2,471,901.
		slug: "bitstamp",
		name: "Bitstamp",
		category: "User-Facing App",
		status: "Live",
		types: ["Exchange"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Bitstamp is a centralized exchange that lists XLM — 2 live XLM market(s) on CoinGecko as of 2026-08-21 (24h volume ≈ $2,471,901). Listed on the Stellar Playbook's centralized-exchanges directory.",
		links: { website: "https://www.bitstamp.net/" },
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-08-21",
		statusSourceUrl: "https://www.coingecko.com/en/coins/stellar#markets",
		statusBasis: "human-verified",
	},
	{
		// Playbook CEX directory + CoinGecko XLM tickers read 2026-08-21:
		// 1 live XLM market(s), last trade <24h, 24h volume ≈ $710,606.
		slug: "htx",
		name: "HTX (Huobi)",
		category: "User-Facing App",
		status: "Live",
		types: ["Exchange"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"HTX (Huobi) is a centralized exchange that lists XLM — 1 live XLM market(s) on CoinGecko as of 2026-08-21 (24h volume ≈ $710,606). Listed on the Stellar Playbook's centralized-exchanges directory.",
		links: { website: "https://www.htx.com/" },
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-08-21",
		statusSourceUrl: "https://www.coingecko.com/en/coins/stellar#markets",
		statusBasis: "human-verified",
	},
	{
		// Playbook CEX directory + CoinGecko XLM tickers read 2026-08-21:
		// 7 live XLM market(s), last trade <24h, 24h volume ≈ $11,625,624.
		slug: "whitebit",
		name: "WhiteBIT",
		category: "User-Facing App",
		status: "Live",
		types: ["Exchange"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"WhiteBIT is a centralized exchange that lists XLM — 7 live XLM market(s) on CoinGecko as of 2026-08-21 (24h volume ≈ $11,625,624). Listed on the Stellar Playbook's centralized-exchanges directory.",
		links: { website: "https://whitebit.com/" },
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-08-21",
		statusSourceUrl: "https://www.coingecko.com/en/coins/stellar#markets",
		statusBasis: "human-verified",
	},
	{
		// Playbook CEX directory + CoinGecko XLM tickers read 2026-08-21:
		// 2 live XLM market(s), last trade <24h, 24h volume ≈ $614,865.
		slug: "crypto-com",
		name: "Crypto.com",
		category: "User-Facing App",
		status: "Live",
		types: ["Exchange"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Crypto.com is a centralized exchange that lists XLM — 2 live XLM market(s) on CoinGecko as of 2026-08-21 (24h volume ≈ $614,865). Listed on the Stellar Playbook's centralized-exchanges directory.",
		links: { website: "https://crypto.com/" },
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-08-21",
		statusSourceUrl: "https://www.coingecko.com/en/coins/stellar#markets",
		statusBasis: "human-verified",
	},
	{
		// Playbook CEX directory + CoinGecko XLM tickers read 2026-08-21:
		// 1 live XLM market(s), last trade <24h, 24h volume ≈ $1,600,934.
		slug: "coinone",
		name: "Coinone",
		category: "User-Facing App",
		status: "Live",
		types: ["Exchange"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Coinone is a centralized exchange that lists XLM — 1 live XLM market(s) on CoinGecko as of 2026-08-21 (24h volume ≈ $1,600,934). Listed on the Stellar Playbook's centralized-exchanges directory.",
		links: { website: "https://coinone.co.kr/" },
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-08-21",
		statusSourceUrl: "https://www.coingecko.com/en/coins/stellar#markets",
		statusBasis: "human-verified",
	},
	{
		// Playbook CEX directory + CoinGecko XLM tickers read 2026-08-21:
		// 4 live XLM market(s), last trade <24h, 24h volume ≈ $19,169.
		slug: "cex-io",
		name: "CEX.IO",
		category: "User-Facing App",
		status: "Live",
		types: ["Exchange"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"CEX.IO is a centralized exchange that lists XLM — 4 live XLM market(s) on CoinGecko as of 2026-08-21 (24h volume ≈ $19,169). Listed on the Stellar Playbook's centralized-exchanges directory.",
		links: { website: "https://cex.io/" },
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-08-21",
		statusSourceUrl: "https://www.coingecko.com/en/coins/stellar#markets",
		statusBasis: "human-verified",
	},
	{
		// Playbook ramps directory; the ONE of 20 missing ramps with first-party
		// Stellar evidence on 2026-08-21: moonpay.com/stellar (dedicated XLM page).
		// The other 19 showed no stellar.toml and no Stellar mention on any
		// docs/assets page — not imported; listed-in-the-Playbook is not evidence.
		slug: "moonpay",
		name: "MoonPay",
		category: "User-Facing App",
		status: "Live",
		types: ["Payments"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"MoonPay is a fiat on/off-ramp (card, bank transfer, Apple/Google Pay) with a dedicated Stellar page for buying XLM. Listed on the Stellar Playbook's ramps directory.",
		links: { website: "https://www.moonpay.com/stellar" },
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-08-21",
		statusSourceUrl: "https://www.moonpay.com/stellar",
		statusBasis: "human-verified",
	},
	// PG-award recon 2026-07-20: Soneso's BASE Flutter SDK is a CSV-confirmed
	// Public Goods Award recipient (Q4'25+Q1'26) with NO directory record —
	// only the sibling stellar_wallet_flutter_sdk was indexed
	// (flutter-wallet-sdk). Verified same day: repo pushed 2026-07-20,
	// pub.dev v3.4.0 published 2026-07-20, ~1.97k weekly downloads.
	{
		slug: "flutter-stellar-sdk",
		name: "Stellar Flutter SDK",
		category: "Tooling",
		status: "Live",
		types: ["SDK"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Soneso's open-source Stellar SDK for Flutter/Dart — build and sign transactions, query Horizon, and interact with Soroban smart contracts via RPC, with support for 18 SEPs.",
		links: {
			website: "https://pub.dev/packages/stellar_flutter_sdk",
			github: "https://github.com/Soneso/stellar_flutter_sdk",
		},
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-07-20",
		statusSourceUrl: "https://pub.dev/packages/stellar_flutter_sdk",
		statusBasis: "site-liveness",
	},
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
	// sls-025 residual (rec=3, GT-56 2026-07-11 + upstream #512 family):
	// kalepail/smart-account-kit was ABSENT from the repo index while sibling
	// kalepail repos are indexed — same class as passkey-kit above (discovery
	// is project-seeded; no record linked it). Verified 2026-07-13: repo
	// exists, non-archived, non-fork, pushed 2026-07-13, 15 stars. Description
	// is the repo's own line verbatim; README: "The kit is a client for the
	// OpenZeppelin stellar-contracts smart-account contract." Also the
	// sls-033 (#519) "passkey/smart-account tooling ≠ wallet product"
	// distinction: typed SDK, not Wallet.
	{
		slug: "smart-account-kit",
		name: "Smart Account Kit",
		category: "Tooling",
		status: "Live",
		types: ["SDK"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"TypeScript SDK for deploying and managing OpenZeppelin smart account contracts on Stellar with WebAuthn passkey authentication — passkey/Ed25519/delegated signers, context rules, typed policy clients, fee sponsoring. A client for the OpenZeppelin stellar-contracts smart-account contract, by kalepail (Tyler van der Hoeven). Smart-account TOOLING for developers, not an end-user wallet.",
		links: {
			website: "https://github.com/kalepail/smart-account-kit",
			github: "https://github.com/kalepail/smart-account-kit",
		},
		provenance: { source: "AdminEdit" },
	},
	// sls-025 (GT-18 x402 family): RouteDock is named in Tyler's probe list but
	// exact q=RouteDock returned only noise — winsznx/routedock was never
	// indexed (no record linked it). Verified 2026-07-13: repo exists,
	// non-archived, non-fork, pushed 2026-07-09; routedock.xyz returns 200;
	// published on npm as @routedock/routedock (0.1.2). Description grounded
	// in the repo's own README ("Unified payment execution layer for
	// autonomous agents on Stellar" — x402 / MPP charge / MPP session behind
	// one client.pay() call, mode selected from the provider's routedock.json
	// manifest).
	{
		slug: "routedock",
		name: "RouteDock",
		category: "Tooling",
		status: "Live",
		types: ["SDK", "Payments"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"RouteDock is a unified payment execution layer for autonomous agents on Stellar: one SDK (@routedock/routedock on npm) whose single client.pay() call routes across the three Stellar agent-payment protocols — x402 (Coinbase), MPP charge, and MPP session channels — selecting the mode from the provider's routedock.json manifest. Supports Stellar testnet and mainnet.",
		links: {
			website: "https://routedock.xyz",
			github: "https://github.com/winsznx/routedock",
		},
		provenance: { source: "AdminEdit" },
	},
	// sls-033 (#519): a useful wallet comparison "must distinguish … Creit-Tech
	// Wallets Kit" from end-user wallet products — but the kit had NO directory
	// record at all (only its repo, creit-tech/Stellar-Wallets-Kit, was
	// indexed), so kit-vs-wallet was indistinguishable at the project layer.
	// Verified 2026-07-13: stellarwalletskit.dev returns 200; the repo's own
	// self-description is "A kit to handle all Stellar Wallets at once".
	// Typed SDK (integration kit), NOT Wallet — the distinction #519 asks for,
	// expressed in the taxonomy we have today.
	{
		slug: "stellar-wallets-kit",
		name: "Stellar Wallets Kit",
		category: "Tooling",
		status: "Live",
		types: ["SDK"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Stellar Wallets Kit (by Creit Tech) is a single TypeScript library that handles integration with all major Stellar ecosystem wallets at once — xBull, Freighter, Albedo, Rabet, Ledger, Trezor, WalletConnect, HOT Wallet and more behind one interface, so dApps integrate every wallet without shipping per-wallet code. An INTEGRATION KIT for developers, not an end-user wallet product.",
		links: {
			website: "https://stellarwalletskit.dev",
			github: "https://github.com/Creit-Tech/Stellar-Wallets-Kit",
		},
		provenance: { source: "AdminEdit" },
	},
	// sls-034 (#518): exact-asset lookup for USDY returned only the Ondo
	// ORGANIZATION row — no separate asset record (the issue's remaining gap
	// after PYUSD/EURAU/MGUSD/YLDS landed). USDY-on-Stellar verified on
	// PRIMARY sources 2026-07-13: ondo.finance/.well-known/stellar.toml lists
	// code=USDY issuer=GAJMPX5NBOG6TQFPQGRABJEEB2YE7RFRLUKJDZAZGAD5GFX4J7TADAZ6
	// ("Ondo US Dollar Yield", attestation_of_reserve=ondo.finance/usdy,
	// redemption via app.ondo.finance); stellar.expert shows that asset live
	// with ~35k payments / ~2.4k trustlines and Ondo's domain binding. Typed
	// Stablecoin+RWA (the YLDS yield-bearing precedent); the toml's own desc
	// notes the price appreciates as yield accrues — a yield-bearing
	// instrument, not a payment stablecoin (product-class field is batch D).
	{
		slug: "usdy",
		name: "USDY",
		category: "Asset",
		status: "Live",
		types: ["Stablecoin", "RWA"],
		supportedNetworks: ["stellar", "evm", "solana"],
		shortDescription:
			"USDY (Ondo US Dollar Yield) is Ondo Finance's yield-bearing tokenized US-dollar asset, backed by short-term US Treasuries and bank deposits, issued natively on Stellar (issuer GAJMPX…DAZ6, published in ondo.finance's stellar.toml with attestation of reserve and redemption via app.ondo.finance). Unlike a payment stablecoin its price appreciates as yield accrues to holders. Also issued on Ethereum, Solana and other networks.",
		links: {
			website: "https://ondo.finance/usdy",
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
	// ── sls-034 stablecoin-coverage wave (2026-07-11): four major stablecoins
	// verifiably LIVE on Stellar had no Asset row — EURAU/YLDS fully absent
	// (semantic-only search fallback), PYUSD/MGUSD present only as prose
	// mentions inside OTHER records (usdc/redstone-finance/rosen;
	// moneygram/bridge) — so stablecoin-coverage queries omitted them. Each
	// entry is grounded in the issuer's/SDF's own launch materials (cited per
	// row); slugs follow the directory's asset-code convention (usdc, eurc,
	// glousd, audd). ──
	{
		slug: "eurau",
		name: "EURAU",
		category: "Asset",
		status: "Live",
		types: ["Stablecoin"],
		supportedNetworks: ["stellar", "evm"],
		shortDescription:
			"EURAU is a fully-reserved euro stablecoin issued by AllUnity — the DWS, Flow Traders and Galaxy joint venture, a BaFin-licensed e-money institution — under the EU's MiCAR framework (Germany's first MiCAR-compliant EUR stablecoin, launched on Ethereum July 2025). Live on Stellar since April 2026 (stellar.org press: 'EURAU Launches on the Stellar Network') for regulated euro payments, payouts and remittances; early Stellar-ecosystem adopters include PwC DE, Noumena and Crossmint, and a June 2026 AllUnity–Zebec pilot streams payroll and employee benefits in EURAU on Stellar.",
		links: { website: "https://allunity.com" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "ylds",
		name: "YLDS",
		category: "Asset",
		status: "Live",
		types: ["Stablecoin", "RWA"],
		supportedNetworks: ["stellar", "provenance", "solana"],
		shortDescription:
			"YLDS is an SEC-registered, yield-bearing US-dollar stablecoin issued by Figure Certificate Company (an affiliate of Figure Technology Solutions, Nasdaq: FIGR). Holders earn interest at roughly SOFR minus 0.50%, accrued daily and paid monthly — stablecoin liquidity with money-market-style earning. Launched on Provenance (Feb 2025) and Solana (Nov 2025), YLDS went live on Stellar in May 2026 (stellar.org press: 'Figure Announces Launch of YLDS on Stellar Network') as the network's first regulated yield-bearing dollar product, aimed at fintechs and neobanks offering compliant on-chain dollar savings, notably in Argentina and Brazil.",
		links: { website: "https://www.ylds.com" },
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "pyusd",
		name: "PYUSD",
		category: "Asset",
		status: "Live",
		types: ["Stablecoin"],
		supportedNetworks: ["stellar", "evm", "solana"],
		shortDescription:
			"PayPal USD (PYUSD) is PayPal's US-dollar stablecoin, issued by Paxos Trust Company (regulated by the New York State Department of Financial Services) and fully backed 1:1 by USD deposits, US Treasuries and cash equivalents. Live on Stellar since September 18, 2025 (stellar.org press: 'PayPal USD is Now Available on Stellar'), extending PYUSD beyond Ethereum and Solana into Stellar wallets and platforms including LOBSTR, Bitcoin.com, Chipper Cash, Decaf, Arculus, Meru, CiNKO and COCA — for everyday payments and real-time SMB working capital ('PayFi') on Stellar rails.",
		links: {
			website:
				"https://www.paypal.com/us/digital-wallet/manage-money/crypto/pyusd",
		},
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "mgusd",
		name: "MGUSD",
		category: "Asset",
		status: "Live",
		types: ["Stablecoin"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"MGUSD is MoneyGram's US-dollar stablecoin, launched June 2, 2026 and native to Stellar — the first dollar token issued by a global cash-payments network on a public chain. Bridge (a Stripe company) is the regulated, GENIUS Act-ready issuer; tokens are minted and burned on M0's smart-contract infrastructure with Fireblocks providing wallet infrastructure. MGUSD is embedded in the MoneyGram app as a self-custodial dollar balance, launching US-first with planned global rollout across MoneyGram's ~60M customers and ~500K retail locations.",
		links: {
			website:
				"https://www.prnewswire.com/news-releases/moneygram-launches-mgusd-a-stablecoin-to-power-its-own-global-network-302787799.html",
		},
		provenance: { source: "AdminEdit" },
	},
	// 2026-07-15 (boxy): two just-launched Stellar DeFi records, both absent
	// from the directory (no strict match on /api/projects/search). Grounded in
	// the Sentora launch post (medium.com/sentora/sentora-launches-vaults-on-the-
	// stellar-network...) + each product's own site. Web-verified live today, so
	// they carry site-liveness provenance on create (not the source-inherited
	// backfill floor).
	{
		slug: "stellar-defi-hub",
		name: "Stellar DeFi Hub",
		category: "User-Facing App",
		status: "Live",
		// Aggregator/portal — a unified access point across DeFi primitives, not
		// itself a single-function venue. No enum type captures "DeFi hub", so
		// types stay empty (the oracle/aggregator convention: don't mistag a
		// primary function it doesn't have) and category carries it.
		types: [],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Stellar DeFi Hub is a unified access point for DeFi activity on the Stellar network — operated by Ultrastellar (a Stellar ecosystem participant since 2014). Its launch surface is Sentora's curated non-custodial vaults on Stellar (also reachable via yield.xyz), with a roadmap spanning additional vault strategies across DeFi and real-world assets (RWAs).",
		links: { website: "https://stellardefihub.com/" },
		provenance: { source: "UserSubmitted" },
		statusAsOf: "2026-07-15",
		statusSourceUrl:
			"https://medium.com/sentora/sentora-launches-vaults-on-the-stellar-network-accessible-via-stellar-defi-hub-2b09749cd789",
		statusBasis: "site-liveness",
	},
	{
		slug: "sentora",
		name: "Sentora",
		category: "Infrastructure",
		status: "Live",
		// Institutional DeFi vault infrastructure + risk models; roadmap/products
		// span tokenized real-world assets (the STEY tokenized-equity product).
		types: ["Infrastructure", "RWA"],
		// Multichain platform ($3B+ deployed); Stellar is its first Stellar
		// integration (curated vaults) — listed here for the Stellar corridor.
		supportedNetworks: ["stellar"],
		shortDescription:
			"Sentora is an institutional DeFi platform (formed from the merger of IntoTheBlock and Trident Digital) providing curated non-custodial vaults, risk management and capital-deployment tools for professional allocators, DAOs, treasuries and fintechs. In its first Stellar integration it launched curated vaults on the Stellar network, accessible via Stellar DeFi Hub and yield.xyz.",
		links: { website: "https://sentora.com/" },
		provenance: { source: "UserSubmitted" },
		statusAsOf: "2026-07-15",
		statusSourceUrl:
			"https://medium.com/sentora/sentora-launches-vaults-on-the-stellar-network-accessible-via-stellar-defi-hub-2b09749cd789",
		statusBasis: "site-liveness",
	},
	// Coverage-gap report, first curation pass (2026-07-16): the two verified
	// DefiLlama misses. Both measured by llama's STELLAR-chain adapter
	// (chainTvls.Stellar — on-chain TVL, not the cross-chain headline), which is
	// the inclusion bar after boxy caught NEAR Intents ($92M total, $11.5k on
	// Stellar) as not-a-Stellar-gap. TVL wiring in scripts/enrich-tvl.ts
	// LLAMA_MAP; dated figures below are point-in-time context, not live data.
	{
		slug: "gami-labs",
		name: "Gami Labs",
		category: "Infrastructure",
		status: "Live",
		// Risk curator (Gauntlet-class): curates + dynamically rebalances vaults
		// on other protocols' venues; runs no venue itself → Infrastructure.
		types: ["Infrastructure"],
		// llama chain breakdown 2026-07-16: Ethereum $22.5M, Stellar $19.7M
		// (its 2nd-largest chain), Flare $4.3M, Base $2.5M, Avalanche $2.0M.
		supportedNetworks: ["stellar", "evm"],
		shortDescription:
			"Gami Labs runs institutional-grade curated DeFi vaults with active on-chain curation and dynamic risk management (a professional 'risk curator'). Stellar is one of its largest deployments — roughly $19.7M of curated TVL on Stellar as of 2026-07-16 (DefiLlama) — alongside Ethereum, Base, Avalanche and Flare.",
		links: { website: "https://gamilabs.io/" },
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-07-16",
		statusSourceUrl: "https://defillama.com/protocol/gami-labs",
		statusBasis: "onchain-activity",
	},
	{
		slug: "defa-invoicemate",
		name: "DeFa by InvoiceMate",
		category: "Protocol/Contract",
		status: "Live",
		// Receivables financing = credit/lending against RWA (the indentura
		// convention: Lending + RWA).
		types: ["Lending", "RWA"],
		// llama lists Stellar first (Stellar $4.0M of $7.2M total, 2026-07-16);
		// also on ZIGChain and Starknet — only the verified Stellar deployment
		// is asserted here (precision over recall).
		supportedNetworks: ["stellar"],
		shortDescription:
			"DeFa by InvoiceMate is on-chain Liquidity-as-a-Service infrastructure that tokenizes verified trade receivables and payment settlements, letting stablecoin liquidity finance real-world economic activity (invoice financing, PayFi settlement, growth capital). Private mainnet is live with gated early access; Stellar is its primary deployment (~$4M TVL on Stellar as of 2026-07-16 per DefiLlama).",
		links: { website: "https://imdefa.com/" },
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-07-16",
		statusSourceUrl: "https://defillama.com/protocol/defa-by-invoicemate",
		statusBasis: "onchain-activity",
	},
	// 2026-07-31 (boxy): Colibri — fazzatti's TypeScript toolkit for Stellar/
	// Soroban apps. Verified same day: repo pushed 2026-07-30, published on JSR
	// (@colibri/core), docs live at fifo-docs.gitbook.io/colibri, MIT, CI +
	// coverage badges green. Personal-account SDK with no directory record —
	// same precedent as passkey-kit above. fazzatti has 39 public repos (over
	// the small-org sweep threshold), so the two Stellar repos are attached
	// explicitly via GITHUB_REPOS_ADD rather than an org sweep.
	{
		slug: "colibri",
		name: "Colibri",
		category: "Tooling",
		status: "Live",
		types: ["SDK"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"TypeScript-first toolkit for building Stellar and Soroban applications — deterministic error handling, composable workflows, and an extensible plugin architecture. Published on JSR as @colibri, with a companion examples repo. By fazzatti (Fabricius Zatti / Fifo).",
		links: {
			website: "https://fifo-docs.gitbook.io/colibri",
			github: "https://github.com/fazzatti/colibri",
		},
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-07-31",
		statusSourceUrl: "https://jsr.io/@colibri/core",
		statusBasis: "site-liveness",
	},
	// 2026-08-01 (boxy): Stellar Indexer — earrietadev's (Creit-Tech / xBull)
	// indexing service, raised in the SDF Discord (kalepail + Raph thread on
	// making Raven discover its per-protocol extensions). Verified same day:
	// SDK repo pushed 2026-07-31, published on JSR, protocol extensions live
	// for Blend / Reflector / Axis Markets with more coming (Zenex). Service
	// is token-gated beta → Pre-Release, not Live. Creit-Tech's 20 public
	// repos are already swept in (small-org rule); the explicit attach below
	// links the SDK repo to THIS project rather than the org-sweep path.
	{
		slug: "stellar-indexer",
		name: "Stellar Indexer",
		category: "Infrastructure",
		status: "Pre-Release",
		types: ["Indexer"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Indexing service for Stellar smart-contract data — live contract state through a single endpoint, with per-protocol extensions (Blend, Reflector, Axis Markets; more in progress). TypeScript SDK for Node, Deno and Bun published on JSR as @stellar-indexer/stellar-indexer-sdk. In token-gated beta. By earrietadev (Creit-Tech, the xBull team).",
		links: {
			website: "https://jsr.io/@stellar-indexer/stellar-indexer-sdk",
			github: "https://github.com/Creit-Tech/Stellar-Indexer-SDK",
		},
		provenance: { source: "AdminEdit" },
		statusAsOf: "2026-08-01",
		statusSourceUrl: "https://jsr.io/@stellar-indexer/stellar-indexer-sdk",
		statusBasis: "site-liveness",
	},
	// 2026-08-08 (boxy): agent-economy batch from trionlabs/awesome-stellar-ai
	// (community-curated list; we're on it ourselves). 15 projects verified
	// MISSING against all 918 directory rows by GitHub-URL + normalized-name
	// diff. Statuses follow the list's own evidence standard: 🟢 mainnet proof
	// → Live (statusBasis onchain-activity, statusSourceUrl = the proof),
	// 🟢 testnet → Pre-Release, unmarked/no deployment claim → Development.
	// Skipped: RouteDock (exists), Prism (name-collides with our metadata-less
	// `prism` row — needs human disambiguation before seeding).
	{
		slug: "stellar-mpp-sdk",
		name: "Stellar MPP SDK",
		category: "Tooling",
		status: "Live",
		types: ["SDK", "Payments"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Official SDK implementing the Stellar payment method for MPP (Machine Payments Protocol) charge payments and off-chain payment channels with on-chain settlement. The reference building block for agent payment flows on Stellar.",
		links: {
			website: "https://developers.stellar.org/docs/build/agentic-payments",
			github: "https://github.com/stellar/stellar-mpp-sdk",
		},
		provenance: { source: "AdminEdit" },
		statusSourceUrl: "https://github.com/stellar/stellar-mpp-sdk",
		statusBasis: "site-liveness",
	},
	{
		slug: "stellar-8004",
		name: "Stellar 8004",
		category: "Protocol/Contract",
		status: "Live",
		types: ["Infrastructure"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Mainnet Soroban implementation of ERC-8004 identity, reputation, and validation registries for AI agents, with a TypeScript SDK, an indexer, and an explorer. By Trion Labs (maintainers of the awesome-stellar-ai list).",
		links: {
			website: "https://github.com/trionlabs/stellar-8004",
			github: "https://github.com/trionlabs/stellar-8004",
		},
		provenance: { source: "AdminEdit" },
		statusSourceUrl:
			"https://stellar.expert/explorer/public/contract/CBGPDCJIHQ32G42BE7F2CIT3YW6XRN5ED6GQJHCRZSNAYH6TGMCL6X35",
		statusBasis: "onchain-activity",
	},
	{
		slug: "x402",
		name: "x402",
		category: "Protocol/Contract",
		status: "Live",
		types: ["Payments"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Open HTTP payment protocol (402 Payment Required) with native Stellar support through the @x402/stellar package — the standard used by most Stellar agent-payment projects for per-call USDC payments.",
		links: {
			website: "https://www.x402.org",
			github: "https://github.com/x402-foundation/x402",
		},
		provenance: { source: "AdminEdit" },
		statusSourceUrl: "https://www.npmjs.com/package/@x402/stellar",
		statusBasis: "site-liveness",
	},
	{
		slug: "stellar-agent-search",
		name: "Stellar Agent Search",
		category: "Tooling",
		status: "Live",
		types: ["Infrastructure"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Read-only MCP server and CLI for discovering, ranking, and vetting AI agents registered with Stellar 8004. Local package released on npm; hosted transport pending.",
		links: {
			website: "https://www.npmjs.com/package/stellar-agent-search",
			github: "https://github.com/berkingurcan/stellar-agent-search",
		},
		provenance: { source: "AdminEdit" },
		statusSourceUrl: "https://registry.npmjs.org/stellar-agent-search/latest",
		statusBasis: "site-liveness",
	},
	{
		slug: "mpp-router",
		name: "MPP Router",
		category: "Infrastructure",
		status: "Live",
		types: ["Payments"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Open-source router by Rozo for reaching paid MPP services from Stellar-funded clients through a stable API, live on mainnet.",
		links: {
			website: "https://apiserver.mpprouter.dev/health",
			github: "https://github.com/mpprouter/rozo-mpprouter",
		},
		provenance: { source: "AdminEdit" },
		statusSourceUrl:
			"https://stellar.expert/explorer/public/account/GDK3AVW3YE6UL3J4WLNKBMP65KSY32YPUKIOC6PXW65XJ3LEG3YIDXXB",
		statusBasis: "onchain-activity",
	},
	{
		slug: "tollpay",
		name: "TollPay",
		category: "Tooling",
		status: "Live",
		types: ["Payments", "SDK"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Middleware and SDKs for monetizing MCP tools with per-call USDC payments on Stellar mainnet. Winner at the Stellar Hacks: Agents hackathon (x402/MPP).",
		links: {
			github: "https://github.com/rajkaria/toll",
		},
		provenance: { source: "AdminEdit" },
		statusSourceUrl:
			"https://stellar.expert/explorer/public/tx/015ef6bacf0520d567fa3cac44a7135ff4152fda79ee72d2e49a1f8670081099",
		statusBasis: "onchain-activity",
	},
	{
		slug: "x402-mcp-stellar-template",
		name: "x402 MCP Stellar Template",
		category: "Tooling",
		status: "Live",
		types: ["SDK", "Payments"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Node.js, Python, and Go templates for building paid MCP servers with x402 on Stellar — wallet provisioning, spending limits, mainnet-proven. Winner at the Stellar Hacks: Agents hackathon.",
		links: {
			github: "https://github.com/ffarinas/x402-mcp-stellar-template",
		},
		provenance: { source: "AdminEdit" },
		statusSourceUrl:
			"https://stellar.expert/explorer/public/tx/af4d17dd8a5c33004365ae4d5c66c82d25cadbabe6af5a63c2450c0fd64fe58a",
		statusBasis: "onchain-activity",
	},
	{
		slug: "stellar-agent-wallet-skill",
		name: "Stellar Agent Wallet Skill",
		category: "Tooling",
		status: "Development",
		types: ["Wallet", "Payments"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Agent skill for Stellar USDC balances, transfers, swaps, trustlines, and payments to x402 or MPP-gated services. By the MPP Router (Rozo) team.",
		links: {
			github: "https://github.com/mpprouter/stellar-agent-wallet-skill",
		},
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "pulsar-mcp",
		name: "Pulsar",
		category: "Tooling",
		status: "Development",
		types: ["Infrastructure"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"MCP server for Stellar and Soroban development: account queries, transaction simulation, contract deployment, and transaction submission from agent workflows.",
		links: {
			github: "https://github.com/benelabs/pulsar",
		},
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "ai-net",
		name: "AI-Net",
		category: "Infrastructure",
		status: "Development",
		types: ["Payments", "Infrastructure"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Experimental coordination network where specialized AI agents discover one another, delegate work, and settle payments on Stellar.",
		links: {
			github: "https://github.com/Epta-Node/ai-net",
		},
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "clevercon",
		name: "CleverCon",
		category: "Infrastructure",
		status: "Pre-Release",
		types: ["Payments", "Infrastructure"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Service marketplace and orchestrator that decomposes tasks, hires specialist agents, and pays them through x402 or MPP — on Stellar testnet. Winner at the Stellar Hacks: Agents hackathon.",
		links: {
			github: "https://github.com/clevercon-protocol/clevercon",
		},
		provenance: { source: "AdminEdit" },
		statusSourceUrl:
			"https://stellar.expert/explorer/testnet/contract/CDFLEJ2HFPK3WKFTWB4CKP2JHEYNAUWKXGEJRYW4YMMGDSQSQ7D4LRTE",
		statusBasis: "onchain-activity",
	},
	{
		slug: "talos",
		name: "Talos",
		category: "Infrastructure",
		status: "Development",
		types: ["Payments", "Infrastructure"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Framework for autonomous agent corporations that register services and earn USDC through x402 payments on Stellar.",
		links: {
			github: "https://github.com/enliven17/talos-stellar",
		},
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "asgcard",
		name: "ASGCard",
		category: "User-Facing App",
		status: "Development",
		types: ["Payments"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Virtual Mastercard integration for AI agents funded with USDC through x402 on Stellar.",
		links: {
			github: "https://github.com/ASGCompute/asgcard-public",
		},
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "cards402",
		name: "Cards402",
		category: "Tooling",
		status: "Development",
		types: ["Payments", "SDK"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"SDK, CLI, and MCP server for issuing virtual Visa cards to AI agents after payment in USDC or XLM. Winner at the Stellar Hacks: Agents hackathon (x402/MPP).",
		links: {
			github: "https://github.com/CTX-com/Cards402",
		},
		provenance: { source: "AdminEdit" },
	},
	{
		slug: "nulucre-agents",
		name: "Nulucre Agents",
		category: "User-Facing App",
		status: "Pre-Release",
		types: ["Analytics", "Payments"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Wallet reputation and DeFi fact-verification agents that accept x402 micropayments on Stellar and Base.",
		links: {
			github: "https://github.com/vjshaw/nulucre-agents",
		},
		provenance: { source: "AdminEdit" },
		statusSourceUrl:
			"https://stellar.expert/explorer/public/account/GCRUBFDANV52JP3URUJ7EZGPZKFEESBTW7T3FV2SJXZZGB6HDNRBWV24",
		statusBasis: "onchain-activity",
	},
	{
		slug: "rendergate",
		name: "RenderGate",
		category: "Infrastructure",
		status: "Pre-Release",
		types: ["Infrastructure", "Payments"],
		supportedNetworks: ["stellar"],
		shortDescription:
			"Pay-per-render browser service for AI agents with a live endpoint and x402 payments on Stellar testnet. Winner at the Stellar Hacks: Agents hackathon.",
		links: {
			github: "https://github.com/tantk/rendergate",
		},
		provenance: { source: "AdminEdit" },
		statusSourceUrl:
			"https://stellar.expert/explorer/testnet/tx/5c898eb489265c142baee086d502e25b87a5536e4386e5ccdf69edc2515c0ef6",
		statusBasis: "onchain-activity",
	},
];

// ─────────────────────────────────────────────────────────────────────────────
// Moved verbatim from curate-projects.ts (2026-07-26, lessons class 32). These
// registries own fields that scripts/sync-lumenloop.ts also writes, so the sync
// has to be able to import them to know what NOT to overwrite — and it cannot
// import curate-projects.ts, whose module body runs main(). Same reason
// STATUS_FIX/WEBSITE_FIXES/SEEDS live here. No rows changed in the move.
// ─────────────────────────────────────────────────────────────────────────────

export const DESCRIPTION_FIXES: Record<string, string> = {
	// Raven #39: Bridge is on the Stellar Playbook's debit-cards page, yet no
	// card query ever fetched it — the row said stablecoin infra and MGUSD,
	// never cards. bridge.xyz leads with "Stablecoin-backed cards are now
	// integrated with Stripe Issuing" and lists Cards as a product line
	// (read 2026-08-21). Kept the existing verified facts verbatim.
	bridge:
		"Bridge is a stablecoin infrastructure company (co-founded 2022 by Zach Abrams and Sean Yu), acquired by Stripe for ~$1.1B (announced October 2024, closed February 4, 2025). Its card-issuing product lets a platform issue stablecoin-backed Visa cards to users, integrated with Stripe Issuing — the card-program provider the Stellar Playbook lists for debit cards. On Stellar, Bridge issues MGUSD, MoneyGram's U.S.-dollar-backed stablecoin native to the Stellar blockchain, with tokens minted/burned via M0's smart-contract infrastructure.",
	// Raven #39: the row still carried the 2023 SCF pitch ("the team would
	// like to support Stellar too") eight months after Wirex and Stellar went
	// LIVE with dual-stablecoin Visa settlement in USDC and EURC for 7M+
	// users (PR Newswire, 2025-11-18, via lumenloop.com/news). wirexpaychain
	// .com now 301s to wirexapp.com — the entity the Playbook lists.
	"wirex-pay":
		"Wirex is a crypto wallet and payments platform (7M+ users) whose Visa card programme settles in USDC and EURC on Stellar — live since November 2025, when Wirex and the Stellar Development Foundation announced dual-stablecoin Visa settlement. Wirex Pay, its self-custodial card and account product built on smart accounts, is the programme's on-chain layer. SCF-funded (Wirex–Vottun Stellar SDK).",
	// gyen had NO description. The issuer's own stellar.toml
	// (stablecoin.z.com/.well-known/stellar.toml, read 2026-07-20) states
	// issuance is wound down with a 1:1 redemption window through Nov 11
	// 2026 — material lifecycle truth an agent must see on the row.
	gyen: "GYEN is a regulated Japanese-yen stablecoin (with sister USD token ZUSD) issued on Stellar by GMO-Z.com Trust Company. Per the issuer's own stellar.toml (July 2026), new issuance is wound down; 1:1 redemption remains open through November 11, 2026.",
	// 2026-07-16: SDF announced MoneyGram, Figure and Range as new Tier 1
	// validator organizations (Tier 1 set: 7 → 10 orgs). Source: stellar.org/
	// press/moneygram-figure-markets-and-range-to-help-secure-the-stellar-
	// network-by-joining-as-tier-1-validators. The fact is recorded on each
	// record (dated) since /press pages are not in the research corpus.
	moneygram:
		"MoneyGram Access (MoneyGram Ramps) is a fiat on- and off-ramp anchor on Stellar. Via the SEP-24 standard, users deposit and withdraw cash to and from USDC at ~500K retail locations across 170+ cash-out countries, with no bank account required. In June 2026 MoneyGram launched MGUSD, a self-custodial USD stablecoin issued by Bridge on Stellar. In July 2026 MoneyGram joined Stellar's Tier 1 validator set — the core organizations whose quorum secures network consensus.",
	figure:
		"Figure is America's #1 non-bank HELOC lender, building the future of capital markets on blockchain. Built on Provenance Blockchain, Figure also issues YLDS — a yield-bearing stablecoin deployed on Stellar — enabling compliance-first real-world asset access for a global audience. In July 2026 Figure (Figure Markets) joined Stellar's Tier 1 validator set, bringing a regulated capital-markets operator into network consensus.",
	// range's old description was raw SCF-proposal prose ("This proposal seeks
	// to build a Steller Bridge Explorer…", typo included) — rewritten to
	// describe the product.
	range:
		"Range is a cross-chain security and intelligence platform: real-time transaction monitoring, forensic tracing (Range Trail), and a cross-chain explorer covering Stellar among other ecosystems, including Stellar bridge-explorer integration. In July 2026 Range joined Stellar's Tier 1 validator set as a blockchain-security validator organization.",
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
export const DOCS_LINKS: Record<string, string> = {
	alchemy: "https://www.alchemy.com/docs/reference/stellar-api-quickstart",
};

// sls-025: ADDITIVE `github.repos` rows (owner/name) for records whose
// links.github points at a BIG org — enrich-repos keyword-gates large orgs
// (only repo names matching "stellar" survive), so a Stellar-relevant repo
// with a non-stellar name is invisible to discovery even though its org is
// linked. Merges missing pairs, never removes; enrich-repos indexes them on
// its next sweep. Each row is hand-verified against the repo's own README.
export const GITHUB_REPOS_ADD: Record<
	string,
	Array<{ owner: string; name: string }>
> = {
	// Colibri's two repos, attached explicitly (see the seed's rationale —
	// fazzatti's 39-repo personal account is over the org-sweep threshold, and
	// the examples repo carries no topics so relevance filters would miss it).
	colibri: [
		{ owner: "fazzatti", name: "colibri" },
		{ owner: "fazzatti", name: "colibri-examples" },
	],
	"stellar-indexer": [{ owner: "Creit-Tech", name: "Stellar-Indexer-SDK" }],
	// GT-18 x402 probe list names relayer-plugin-x402-facilitator; the repo's
	// README (verified 2026-07-13) is Stellar-first: "x402 facilitator API
	// implemented as a Relayer plugin (Stellar support today)", networks
	// stellar:testnet, type "stellar" (current support). The openzeppelin
	// record links github.com/openzeppelin (org, >>20 repos → keyword gate),
	// and the repo name lacks "stellar" — hence the recall zero.
	openzeppelin: [
		{ owner: "OpenZeppelin", name: "relayer-plugin-x402-facilitator" },
	],
	// Q2 cold-agent run (2026-07-20): aquarius had NO repo commit data, so it
	// never entered activity leaderboards. Cause: the org renamed
	// AquaToken→AquariusDeFi (old link is an empty shell; repo API 301s).
	// These four are Aquarius-owned and active this month (dao web app,
	// voting tracker, governance, bribes). The audited AMM contracts repo
	// (AquaToken/soroban-amm) went private/deleted — cannot be linked.
	aquarius: [
		{ owner: "AquariusDeFi", name: "dao-aquarius-soroban" },
		{ owner: "AquariusDeFi", name: "aqua-voting-tracker" },
		{ owner: "AquariusDeFi", name: "aqua-governance" },
		{ owner: "AquariusDeFi", name: "aqua-bribes" },
	],
	// PG recon 2026-07-20: the registry split out of theahaco/scaffold-stellar
	// into its own org ~2026-05-19 (proof chain: proposal PR #65 →
	// scaffold-stellar docs → cargo install --git stellar-registry/cli;
	// oz-combined-wasms homepage = rgstry.xyz closes the loop).
	"stellar-registry": [
		{ owner: "stellar-registry", name: "contracts" },
		{ owner: "stellar-registry", name: "cli" },
	],
};

export const TYPES_ADD: Record<string, string[]> = {
	// Raven #39 (2026-08-21): the Stellar Playbook's debit-cards page lists
	// Bridge, Kulipa, Rain and Wirex as card ISSUERS a builder integrates.
	// "Card Issuing" is that category — card-program infrastructure, not a
	// consumer app that happens to have a card (Figo, COCA, Chipper, Peer are
	// deliberately NOT typed). Inactive rows keep the type: what they WERE is
	// still true; status carries whether they still are.
	bridge: ["Card Issuing"], // bridge.xyz: stablecoin-backed cards via Stripe Issuing (read 2026-08-21)
	rain: ["Card Issuing"], // rain.xyz + playbook; row description: "Enables companies on Stellar… to launch branded cards"
	"wirex-pay": ["Card Issuing"], // PR Newswire 2025-11-18: Visa settlement in USDC/EURC on Stellar
	kulipa: ["Card Issuing"], // was a stablecoin card issuer (settlement on Stellar); Inactive since 2026-07-29
	getblockcard: ["Card Issuing"], // was Ternio BlockCard; Inactive (Unbanked wound down 2023)
	cards402: ["Card Issuing"], // own description: SDK/CLI/MCP for issuing virtual Visa cards to AI agents; Development
	// Stablecoin appended per boxy triage 2026-07-20 (issued-asset + sectors
	// axes both fired — domain-matched stellar.expert issuance).
	etherfuse: ["Anchor", "Stablecoin"],
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
	// boxy triage 2026-07-20 of the capability-mismatch sweep's first report
	// (25 candidates): the anchor axis batch, approved "all except benji"
	// (FT's benji is a tokenized fund; the anchor is FT-the-company — held).
	// Each partner here is an operating anchor in the anchors directory whose
	// project row never carried the type — the exact Etherfuse class.
	gyen: ["Anchor"],
	brl: ["Anchor"],
	audd: ["Anchor"],
	blox: ["Anchor"],
	coca: ["Anchor"],
	elroy: ["Anchor"],
	ripe: ["Anchor"],
	alfred: ["Anchor"],
	trace: ["Anchor"],
	// boxy triage 2026-07-20, issued-asset axis: domain-matched on-chain
	// issuance (stellar.expert, issuer domain == partner domain). etherfuse
	// fired on TWO independent axes (sectors + issuance); anclap issues
	// ARS/PEN anchored tokens. Payments-on-wallets (hana/xbull/lobstr) was
	// explicitly DECLINED — wallets stay wallets; the sweep keeps reporting.
	// (etherfuse Anchor already added above; this appends Stablecoin.)
	anclap: ["Stablecoin"],
};

export const TYPES_SET: Record<string, string[]> = {
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
	stellarbroker: ["Infrastructure", "SDK"], // stellar.broker: Stellar-only multi-source liquidity swap ROUTER/aggregator — best routing across AMMs + Stellar DEX, runs no venue (so NOT a DEX venue; the verifier's DEX call was wrong), and it's integrable by other apps/wallets (boxy 2026-07-15) → +SDK.
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
	nethermind: ["Infrastructure", "Security"], // nethermind.io: research/engineering firm + Nethermind Security (audits, formal verification, ZK); Stellar work = RISC Zero zkVM verifier + private-payments. Verifier-confirmed 2026-07-15.
	"vanna-finance": ["Lending"], // vanna.finance: "composable credit infrastructure — borrow up to 10x undercollateralized credit"; a lending/margin protocol (routes into Soroswap/Aquarius/Blend). NOT a bridge.
	warpdrive: ["Infrastructure"], // warp-drive.xyz: "off-chain execution of bots, oracles, and automation for Stellar/Soroban" — an infra/execution framework (Eigenlayer-backed). NOT a bridge.
	// Directory-quality engine — verifier-confirmed re-tags (2026-07-15). Each
	// agent-verified from the product's own live site (evidence in the
	// directory-quality-verify run). Auto-apply tier (high confidence).
	"cactus-link": ["Wallet"], // mycactus.com + Chrome Web Store: institutional browser-extension wallet (Cactus Custody). A wallet's security is a property, not its category.
	"hito-wallet": ["Wallet"], // hito.xyz: NFC thin hardware crypto wallet (for sale). Hardware wallet = Wallet, not Security.
	keystone: ["Wallet"], // keyst.one: hardware wallet.
	mxlet: ["Wallet"], // xlet.io: open Stellar hardware wallet.
	decaf: ["Wallet", "Payments"], // decaf.so: non-custodial wallet for cross-border money movement — Wallet + Payments, not Payments alone.
	reclaim: ["Security", "SDK"], // reclaimprotocol.org: zkTLS credential/proof-of-personhood protocol + zkFetch SDK (Soroban example). Security + the developer SDK.
	trustline: ["Security", "SDK", "Infrastructure"], // trustline.id: security SDK + smart-contract insurance. Adds the SDK it ships.
	trustful: ["Infrastructure"], // trustful-stellar.vercel.app: reputation/attestation system (badges + on-chain data) — infra primitive, not security tooling.
	paychant: ["Anchor", "Payments"], // paychant.com: fiat on/off-ramp gateway — an anchor + payments, not payments alone.
	"yellow-card": ["Anchor", "Payments"], // yellowcard.io: licensed African stablecoin on/off-ramp anchor + payments.
	defindex: ["Infrastructure", "SDK"], // defindex.io (PaltaLabs): yield infrastructure — non-custodial tokenized vaults + SDK for wallets/neobanks. Yield infra, not a lending venue.
	xoxno: ["Lending"], // xoxno.com: "enterprise-grade decentralized lending protocol on Soroban" — Lending, not RWA.
	nebula: ["SDK"], // eigerco/nebula: Soroban Rust contract library + code-gen wizard = SDK. NOT an oracle; drops the unsupported Indexer tag. (Also defunct — see STATUS_FIX.)
	// Held-queue resolutions after a closer look (boxy 2026-07-15).
	elsa: ["Wallet", "Payments"], // elsa.care: "a wallet for Filipinos to receive, spend and earn from remittances" — the verifier wrongly dropped Wallet; it IS a remittance wallet + payments.
	legasi: ["Lending", "RWA"], // legasi.io: "on-chain Lombard LENDING infrastructure — collateralized borrowing against tokenized RWA" — Lending against RWA, not RWA alone.
	indentura: ["Lending", "RWA"], // thawdigital.com: "on-chain CREDIT infrastructure — trade credit and receivables financing" — credit/lending against RWA receivables.
	// sls-033 (2026-07-15): mis-typed as Wallet — web-verified NOT wallets, so an
	// exact type=Wallet enumeration wrongly returned them (the StellarTerm-in-the-
	// wallet-list class the finding names). Drop Wallet; keep their real types.
	pakananet: ["Payments", "AI", "RWA", "Security"], // pakana.net: private ZK payments/compliance infrastructure, not a wallet (multisig-escrow is one feature)
	stellarfolio: ["Analytics"], // stellarfolio.app: read-only portfolio viewer — enter ANY public address to view its assets; holds no keys
	equilibre: ["Analytics"], // equilibre.io: portfolio rebalancer / DEX trading tool, wallet-independent (also already defunct — see STATUS_FIX)
};

// ─────────────────────────────────────────────────────────────────────────────
// Curated-field ownership (lessons class 32)
// ─────────────────────────────────────────────────────────────────────────────
/** Project fields that a curation registry owns for a given slug.
 *
 * Why this exists: `scripts/sync-lumenloop.ts` re-updates LumenloopSeed /
 * Unverified records daily with a whole-record spread from the upstream feed.
 * Every field the feed maps was therefore overwritten within 24h of any curate
 * run — 13 verified TYPES_SET rows from #414 (2026-07-11) sat reverted for two
 * weeks while both jobs logged success (see improvements/lessons class 32).
 *
 * Ownership is DERIVED from the registries rather than stored on the record, so
 * that adding a row here protects the field immediately, retroactively, and
 * without a backfill or a marker field that can itself drift.
 *
 * Only fields the lumenloop mapper actually writes need to appear here — the
 * sync cannot clobber what it does not map. Keep this in sync with
 * `mapLumenloopEntry` (src/lib/utils/lumenloop-mapper.ts): today that is
 * name, shortDescription, category, types, status, verificationLevel,
 * provenance, links, github, onchain.
 */
export function curatedFieldsFor(slug: string): Set<string> {
	const owned = new Set<string>();
	if (slug in DESCRIPTION_FIXES) owned.add("shortDescription");
	if (slug in TYPES_SET || slug in TYPES_ADD) owned.add("types");
	if (slug in STATUS_FIX) owned.add("status");
	if (slug in NAME_FIXES) owned.add("name");
	if (slug in WEBSITE_FIXES) owned.add("links.website");
	if (slug in DOCS_LINKS) owned.add("links.docs");
	if (slug in GITHUB_REPOS_ADD) owned.add("github");
	return owned;
}

/** Every slug any ownership-bearing registry names — lets a detector enumerate
 * what to read back off the live API without re-deriving the union each time. */
export function curatedSlugs(): string[] {
	return [
		...new Set([
			...Object.keys(DESCRIPTION_FIXES),
			...Object.keys(BUILT_BY_FIXES),
			...Object.keys(TYPES_SET),
			...Object.keys(TYPES_ADD),
			...Object.keys(STATUS_FIX),
			...Object.keys(NAME_FIXES),
			...Object.keys(WEBSITE_FIXES),
			...Object.keys(DOCS_LINKS),
			...Object.keys(GITHUB_REPOS_ADD),
		]),
	].sort();
}

// ── sls-064 analog B: builtBy — RESOLVED WITHOUT A CURATED MAP ─────────────
// A BUILT_BY_FIXES lane briefly lived here (2026-08-14). Post-execute
// read-back exposed it as a write-to-nowhere: `builtBy` is NOT a field on
// the Projects collection, so payload.update() silently dropped it while
// reporting success (the #615/C1 class), and every curate run re-"fixed"
// it forever. The truth: served builtBy derives from the ENTITIES
// collection at query time (entity name/slug per linked project) and is
// contract-correct — builtBy.slug resolves at /entities/{slug}. Fix
// builtBy data by fixing the entity record/links; the nightly S0 lane
// asserts every served builtBy slug resolves in the entity namespace.
