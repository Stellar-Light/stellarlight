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
};

/** Website corrections (liveness triage 2026-07-10, boxy-approved): the
 * PRODUCT is verifiably alive but the recorded URL is dead (lapsed apex,
 * rebrand, or move). Overwrites links.website; equality no-ops keep reruns
 * clean. Status stays Live — these were false positives on the death list. */
export const WEBSITE_FIXES: Record<string, string> = {
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
];
