/**
 * Per-repo knowledge notes (repo-intel slice 3) — dated FACTS with sources,
 * never LLM summaries (the audit-corpus SURFACE-don't-summarize doctrine).
 *
 * Two sources, merged by enrich on every pass (so curation is self-healing —
 * the map below is the truth and reapplies weekly):
 *   curated  — hand-verified facts about what a repo IS that no signal can
 *              derive (doc maps, packaging, companion repos). Promote-only
 *              discipline: only add what you verified, date it.
 *   derived:audit — the repo's owning project has verified security-audit
 *              reports in our registry (EXACT projectSlug join, never fuzzy).
 */

export interface KnowledgeNote {
	note: string;
	/** "curated" | "derived:audit" — where this fact came from. */
	source: string;
	/** When the fact was verified/derived (YYYY-MM-DD). */
	asOf: string;
	/**
	 * "public" (default when absent) serves on every surface. "internal"
	 * NEVER leaves the DB — it's triage memory for the long tail (most of
	 * the ~12k EC-taxonomy repos don't merit deep indexing; an internal
	 * note records the judgment — junk/farm/irrelevant/dupe-of — so
	 * curators and wave-prioritization remember WHY without publishing
	 * verdicts about someone's repo). Serve-side filters enforce this.
	 */
	visibility?: "public" | "internal";
	/**
	 * Hand-authored natural-language trigger phrases (sls-080 round 2: the
	 * upstream monitor asks "…highest supported protocol version…" — no
	 * code-shaped identifier, so the identifier path can never fire for it).
	 * A trigger fires when EVERY one of its words appears as a whole word in
	 * the question. Authoring discipline: ≥2 words, distinctive of THIS fact
	 * — never a phrase some other question about the repo would contain.
	 */
	triggers?: string[];
}

/**
 * Curated per-repo facts, keyed by lowercase fullName. DISCIPLINE: every entry
 * verified against the repo's own docs/registry pages on the asOf date.
 */
export const REPO_KNOWLEDGE_NOTES: Record<string, KnowledgeNote[]> = {
	// The three Accelar siblings. The warning belongs on EACH of them, not
	// only on accelar-studio: a reader who lands here needs to know this
	// README is not about this repo.
	"Accelar-labs/accelar-frontend-frax": [
		{
			note: 'README (read 2026-09-07) is the "Accelar Studio — installation and dev environment" text, verbatim the same file as Accelar-labs/accelar-studio and the other two frontends. It does NOT describe this repo; the name ("frax") is the only thing distinguishing it, so nothing here can be quoted as evidence about this particular surface. TypeScript, last commit February 2026. SCF #26, $33,000 to the project. https://github.com/Accelar-labs/accelar-frontend-frax',
			triggers: ["accelar frontends", "accelar shared readme"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"Accelar-labs/accelar-plataform-frontend": [
		{
			note: 'README (read 2026-09-07) is the "Accelar Studio — installation and dev environment" text, verbatim the same file as Accelar-labs/accelar-studio and the other two frontends. It does NOT describe this repo; the name ("plataform") is the only thing distinguishing it, so nothing here can be quoted as evidence about this particular surface. TypeScript, last commit February 2026. SCF #26, $33,000 to the project. https://github.com/Accelar-labs/accelar-plataform-frontend',
			triggers: ["accelar frontends", "accelar shared readme"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"Accelar-labs/educhain-accelar-frontend": [
		{
			note: 'README (read 2026-09-07) is the "Accelar Studio — installation and dev environment" text, verbatim the same file as Accelar-labs/accelar-studio and the other two frontends. It does NOT describe this repo; the name ("educhain") is the only thing distinguishing it, so nothing here can be quoted as evidence about this particular surface. TypeScript, last commit February 2026. SCF #26, $33,000 to the project. https://github.com/Accelar-labs/educhain-accelar-frontend',
			triggers: ["accelar frontends", "accelar shared readme"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	// ── 2026-09-07, third batch: the tail of the board's named gap. Three are
	// internal triage (an empty README states nothing; a withdrawn row is a
	// judgment, not a published fact about someone's repo).
	"AssetDesk/Smart-Contracts": [
		{
			note: 'README (read 2026-09-07): "This repository contains the smart contracts for an implementation of the AssetDesk. AssetDesk is a decentralized non-custodial liquidity protocol." The contracts live here; AssetDesk/front is the interface. Rust, last commit 2024-02-16, and assetdesk.xyz resolves but answers nothing. https://github.com/AssetDesk/Smart-Contracts',
			triggers: ["assetdesk contracts", "assetdesk liquidity protocol"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"CollaborativeEconomics/give-credit": [
		{
			note: 'README (read 2026-09-07): "GIVE-CREDIT — donations app in Stellar network … donate to causes you believe in with XLM, save the world retiring carbon credits." GitHub description: "Donate to offset carbon credits." https://github.com/CollaborativeEconomics/give-credit',
			triggers: ["carbon credit donations stellar", "give credit xlm"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"EduNodeOrg/edunode-governance": [
		{
			note: 'README (read 2026-09-07): "edunode.org – Phase IV: Decentralized Governance & Certification Ecosystem for a MOOC Platform", an R&D project. One phase of a larger platform, not the platform. https://github.com/EduNodeOrg/edunode-governance',
			triggers: ["edunode governance", "mooc certification stellar"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"Glo-Foundation/glo-wallet": [
		{
			note: 'README (read 2026-09-07): "The Glo Wallet is a web3 dApp created by the Glo Foundation" for glodollar.org. Glo Dollar is a multi-chain stablecoin, so this repo is not Stellar-specific work. https://github.com/Glo-Foundation/glo-wallet',
			triggers: ["glo dollar wallet", "glodollar dapp"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"Lobster-Protocol/stellar": [
		{
			note: 'README (read 2026-09-07): "A comprehensive Automated Market Maker (AMM) aggregation and analytics platform for the Stellar/Soroban ecosystem." An aggregator over other venues rather than an AMM of its own. https://github.com/Lobster-Protocol/stellar',
			triggers: ["amm aggregator stellar", "lobster protocol analytics"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"NibrasD/stellar-transaction-visualizer": [
		{
			note: 'README (read 2026-09-07): "A powerful visualization tool and SDK for Stellar blockchain transactions with advanced Soroban smart contract support." Same author as the SCF #44 VRF work. https://github.com/NibrasD/stellar-transaction-visualizer',
			triggers: ["stellar transaction visualizer", "soroban transaction sdk"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"authentication-labs/0xauth-stellar": [
		{
			note: 'README (read 2026-09-07): "0xAuth Stellar Contracts" with a single "identity" contract in the standard Soroban layout. The project\'s own domain 0xauth.co no longer resolves (NXDOMAIN on 1.1.1.1 and 8.8.8.8, 2026-09-07), so this repo is the only surface left. https://github.com/authentication-labs/0xauth-stellar',
			triggers: ["0xauth identity contract", "stellar identity soroban"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"freelii/freelii-core": [
		{
			note: 'README (read 2026-09-07): "Freelii is a non-custodial crypto wallet built on the Stellar blockchain, designed for remittances, P2P payments." GitHub description adds "USDC Business Bank Account". https://github.com/freelii/freelii-core',
			triggers: ["freelii wallet remittances", "non-custodial stellar wallet"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"keizai-tools/keizai-api": [
		{
			note: 'GitHub description (read 2026-09-07): "Keizai is a postman-like Soroban contract testing platform." This repo is the API half; the product is the platform. SCF #21 and #28, $84,000. https://github.com/keizai-tools/keizai-api',
			triggers: ["keizai soroban testing", "postman for soroban"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"paltalabs/soroban-toolkit": [
		{
			note: 'README (read 2026-09-07): "Soroban Toolkit is a powerful library designed to simplify interactions with Stellar\'s Soroban smart contracts." One of several paltalabs libraries; distinct from paltalabs/stellar-react, which is the React binding. https://github.com/paltalabs/soroban-toolkit',
			triggers: ["soroban toolkit library", "paltalabs soroban helpers"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"paltalabs/stellar-react": [
		{
			note: 'README (read 2026-09-07): "soroban-react with stellar wallets kit" — the React binding layered on the Stellar Wallets Kit, and the successor line to paltalabs/soroban-react. https://github.com/paltalabs/stellar-react',
			triggers: ["soroban react hooks", "stellar wallets kit react"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"siborg-ads/stellar-client": [
		{
			note: 'README (read 2026-09-07): "Siborg is a decentralized platform for managing and sponsoring advertising spaces as NFTs on the Stellar blockchain." https://github.com/siborg-ads/stellar-client',
			triggers: ["advertising nft stellar", "siborg ad spaces"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"skyhitz/skyhitz": [
		{
			note: 'README (read 2026-09-07): "Skyhitz is a music and media platform with blockchain integration, allowing creators to tokenize and monetize their content." GitHub description: "Crypto music chart". https://github.com/skyhitz/skyhitz',
			triggers: ["music tokenization stellar", "skyhitz platform"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"tupui/soroban-pumpit": [
		{
			note: 'README (read 2026-09-07): "The goal of this project is to explore with IOT and Soroban." The author\'s own framing is exploration, not a product. Same author as tansu. https://github.com/tupui/soroban-pumpit',
			triggers: ["iot soroban experiment", "pumpit stellar"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"tupui/tansu-vault": [
		{
			note: "README (read 2026-09-07) is two lines: the vault at vault.tansu.dev, and a pointer to the tansu project's treasury page. The code is here; the explanation is in tansu. https://github.com/tupui/tansu-vault",
			triggers: ["tansu vault", "tansu treasury"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"Alkeops/It-s-not-another-package": [
		{
			note: 'README (read 2026-09-07) opens with the author\'s own warning: ":warning: Preliminary development stage. Not for production use. Be careful!" Carried rather than smoothed away. https://github.com/Alkeops/It-s-not-another-package',
			triggers: ["alkeops package", "stellar decorators library"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"Wadzzo2023/brand-wadzzo": [
		{
			note: 'README (read 2026-09-07): "Wadzzo Full Ecosystem" with an "AI-powered chat assistant that provides information about brands, locations". The brand-facing half of the Wadzzo product. https://github.com/Wadzzo2023/brand-wadzzo',
			triggers: ["wadzzo brand app", "wadzzo ecosystem"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"Accelar-labs/accelar-studio": [
		{
			note: 'README (read 2026-09-07): "Accelar Studio — installation and dev environment", and the same text appears verbatim in accelar-frontend-frax, accelar-plataform-frontend and educhain-accelar-frontend. Four repos, one README: the names are the only thing telling them apart, so none of them can be quoted as evidence about a specific surface. SCF #26, $33,000. https://github.com/Accelar-labs/accelar-studio',
			triggers: ["accelar studio", "accelar frontends"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"damzylance/bigiftyxsoroban": [
		{
			note: 'GitHub description (read 2026-09-07): "Lightweight Bitgifty Dapp on Soroban". The README is unmodified create-next-app boilerplate, so the description is the only fact this repo states about itself. https://github.com/damzylance/bigiftyxsoroban',
			triggers: ["bitgifty soroban dapp"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"yripper/stellar-tools": [
		{
			note: 'GitHub description (read 2026-09-07): "Stellar tools". The README is unmodified create-next-app boilerplate. Distinct from payrouteshq/stellartools and joaquinsoza/stellar-tools, which are different products with near-identical names. https://github.com/yripper/stellar-tools',
			triggers: ["stellar tools yripper"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"AssetDesk/front": [
		{
			note: "Triage 2026-09-07: empty README, no GitHub description. The contracts repo AssetDesk/Smart-Contracts carries the product's own description; nothing here states a durable fact. Re-examine if it gains a package or a deployment. https://github.com/AssetDesk/front",
			source: "curated",
			asOf: "2026-09-07",
			visibility: "internal",
		},
	],
	"GRMarkkes/ArtCC": [
		{
			note: "Triage 2026-09-07: empty README, no GitHub description. The project row (art-club, SCF #26 $40,000) is the only source of context; the repo states nothing about itself. https://github.com/GRMarkkes/ArtCC",
			source: "curated",
			asOf: "2026-09-07",
			visibility: "internal",
		},
	],
	"jamiels/ramm.ai": [
		{
			note: 'Triage 2026-09-07: the directory row was WITHDRAWN by the owner ("RAMM is not related to stellar"). The repo does hold Soroban contracts under soroban/factory and soroban/pool with a @stellar/stellar-sdk UI, but every network reference is FUTURENET and the last commit is 2024-04-16; ramm.ai now sells an unrelated AI marketspace. Kept so a future attribution pass does not re-add it. https://github.com/jamiels/ramm.ai',
			source: "curated",
			asOf: "2026-09-07",
			visibility: "internal",
		},
	],
	// ── 2026-09-07 batch: the /quality board named 49 curated-pool repos with
	// no note. These are the ones whose own text carries a fact worth
	// keeping — most often a correction: a package that announces its own
	// deprecation, a multi-chain compiler where Stellar is one backend of
	// three, a README belonging to a different project, a "general" utility
	// that is specific to one contract. Two are internal triage flags rather
	// than published facts about someone's repo.
	"Sorosan/sorosan-client": [
		{
			note: 'README (read 2026-09-07) opens with its own retirement: "Note this will be deprecated in use for sorosan-sdk/core. This package is now outdated and deprecated. Please update to the latest version." So @sorosan-client/core is the OLD package and Sorosan/sorosan-sdk is its successor — the two repos otherwise read almost identically. Last commit 2023-12-24. https://github.com/Sorosan/sorosan-client#readme',
			triggers: ["sorosan client deprecated", "sorosan-sdk successor"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"BuilderOSS/nouns-builder": [
		{
			note: 'Triage 2026-09-07: README is "Nouns Builder front-end website and subgraph mono-repo", deployed on "Mainnet" and "Sepolia testnet" — Ethereum, not Stellar. Kept as a flag so an attribution pass does not read it as Stellar evidence. https://github.com/BuilderOSS/nouns-builder',
			source: "curated",
			asOf: "2026-09-07",
			visibility: "internal",
		},
	],
	"stellar-chef/stellar-chef": [
		{
			note: "Triage 2026-09-07: the README is an unmodified \"Salvia-kit Dashboard v4 Svelte-kit\" template — a different project's starter docs, not this one's. The deployed tool at stellar-chef.github.io/stellar-chef IS real (recipes, faucet, calculators, testnet) and was read in a browser 2026-09-06; the repo's own text just describes something else. Do not quote this README as a fact about Stellar Chef. https://github.com/stellar-chef/stellar-chef",
			source: "curated",
			asOf: "2026-09-07",
			visibility: "internal",
		},
	],
	"luanlabs/stellar-extend-entry-ttl": [
		{
			note: "README (read 2026-09-07): \"Fluxity Extend Entry TTL — a long-running daemon that keeps the Fluxity Soroban contract's storage entries alive on the Stellar network.\" The repo name reads like a general-purpose TTL utility; it is specific to Fluxity's contract. https://github.com/luanlabs/stellar-extend-entry-ttl",
			triggers: ["soroban ttl daemon", "fluxity storage entries"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"paltalabs/available-xlm": [
		{
			note: 'GitHub description (read 2026-09-07): "A repo to experiment with maximum available XLM when..."; README: "intended to test and understand the Minimum Balance needed for an account to be able to perform transactions." An experiment, not a library — nothing here is published or importable. https://github.com/paltalabs/available-xlm',
			triggers: ["stellar minimum balance experiment"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"Raum-Network/raum-raumfi-v3": [
		{
			note: 'README (read 2026-09-07): "Concentrated-liquidity exchange stack for Stellar Soroban" — one repository holding the contract workspace AND a Next.js frontend, so it answers both "where are the RaumFi contracts" and "where is the app". GitHub description calls it the "CLMM implementation of RaumFi DEX". https://github.com/Raum-Network/raum-raumfi-v3',
			triggers: ["raumfi clmm contracts", "concentrated liquidity soroban"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"constellation-protocol/constellation-protocol": [
		{
			note: 'README (read 2026-09-07): "Constellation Protocol is an open protocol for Index Funds on Stellar/Soroban." SCF #19 and #23, $210,000. https://github.com/constellation-protocol/constellation-protocol',
			triggers: ["index funds soroban", "constellation protocol contracts"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"MoonBite-GmbH/soroban-multisig-contracts": [
		{
			note: 'GitHub description (read 2026-09-07): "A simple multisig contract allowing to configure a r[equired quorum]"; the README calls itself "an attempt to create a smart contract allowing to initialize a multisig with a configurable quorum" — the authors\' own hedge, worth carrying rather than presenting it as a finished product. https://github.com/MoonBite-GmbH/soroban-multisig-contracts',
			triggers: ["soroban multisig contract", "configurable quorum stellar"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"perun-network/perun-stellar-backend": [
		{
			note: 'README (read 2026-09-07): "the Stellar backend for the go-perun channel library" — peer-to-peer payment channels. The product is go-perun; this repo is its Stellar adapter, so it answers "does Perun support Stellar", not "what is Perun". https://github.com/perun-network/perun-stellar-backend',
			triggers: ["perun payment channels stellar", "go-perun stellar backend"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"sorobanhooks/stellar-wallet-sdk": [
		{
			note: 'GitHub description (read 2026-09-07): "Minimal, non-custodial Stellar wallet SDK with encrypted local key storage and session-based signing." Distinct from the SDF-published @stellar/typescript-wallet-sdk despite the near-identical name — different org, different package. https://github.com/sorobanhooks/stellar-wallet-sdk',
			triggers: ["non-custodial wallet sdk stellar", "sorobanhooks wallet sdk"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"sorobanhooks/stellar-logos": [
		{
			note: 'README (read 2026-09-07): "A collection of high-quality logos and assets for the Stellar ecosystem." An asset repository — no code, so repo activity here says nothing about a product. https://github.com/sorobanhooks/stellar-logos',
			triggers: ["stellar ecosystem logos"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"Tellus-Cooperative/sorobounty.xyz": [
		{
			note: 'GitHub description (read 2026-09-07): "An open-source bounty hunting platform where users c[an create and participate in bounties]", README confirms the same. https://github.com/Tellus-Cooperative/sorobounty.xyz',
			triggers: ["soroban bounty platform", "sorobounty"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"bp-ventures/stellar-payment-api": [
		{
			note: 'README (read 2026-09-07) is documentation, not a service: "Overview of Stellar Anchors and integration examples", with sections on issuance, deposits and withdrawals and the SEPs involved. The repo name reads like a deployable API; it is a written guide. https://github.com/bp-ventures/stellar-payment-api',
			triggers: [
				"stellar anchor integration guide",
				"seps deposits withdrawals",
			],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"bp-ventures/retail-wallet": [
		{
			note: 'GitHub description (read 2026-09-07): "A reference implementation of a Stellar Retail Wallet and Investment Dashboard built using Next.js, branded for the CLPX Stellar asset." A reference implementation branded for one asset, not a shipped consumer wallet. https://github.com/bp-ventures/retail-wallet',
			triggers: ["stellar retail wallet reference", "clpx wallet"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"lumenlater/lumen-later": [
		{
			note: 'README (read 2026-09-07): "LumenLater BNPL Protocol — decentralized Buy-Now-Pay-Later system built on Stellar\'s Soroban smart contract platform." https://github.com/lumenlater/lumen-later',
			triggers: ["buy now pay later stellar", "bnpl soroban"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"alternun-development/alternunV2-Stellar-POC": [
		{
			note: 'README (read 2026-09-07): "Alternun POC — Gold-Backed Tokenization on Stellar. Complete proof-of-concept for tokenizing underground gold reserves." The repo says of itself that it is a proof of concept; do not read it as a deployed product. https://github.com/alternun-development/alternunV2-Stellar-POC',
			triggers: ["gold backed token stellar poc", "alternun tokenization"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"Epta-Node/ai-net": [
		{
			note: 'GitHub description (read 2026-09-07): "AI-Net is a decentralized agent coordination network"; README: "the network where AI agents discover, hire, and pay each other." https://github.com/Epta-Node/ai-net',
			triggers: [
				"agent coordination network stellar",
				"ai agents pay each other",
			],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"paulfears/StellarSnap": [
		{
			note: 'README (read 2026-09-07): integrating "Stellar wallet functionalities into MetaMask Snaps" — the surface is MetaMask, not a standalone wallet. https://github.com/paulfears/StellarSnap',
			triggers: ["stellar metamask snap", "metamask stellar wallet"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"expand-network/sdk-nodejs": [
		{
			note: 'GitHub description (read 2026-09-07): "SDK for node.js" from expand.network, a multi-chain API provider — Stellar is one supported network among many, so activity here is not Stellar-specific. https://github.com/expand-network/sdk-nodejs',
			triggers: ["expand network sdk", "multi-chain api sdk"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	// ── 2026-09-06 batch: multi-repo projects, where the repo NAME does not say
	// which half of the product it is. A consumer asking "where are the Blend
	// contracts" must not be handed a frontend. Each fact is quoted from the
	// repo's own README, read 2026-09-06; the two siblings I looked at whose
	// READMEs are unmodified create-next-app boilerplate (Bond-Hive/interface,
	// zenith-protocols/vault-ui) got NO note — "this repo has no description"
	// is not a fact worth publishing.
	"AquariusDeFi/dao-aquarius-soroban": [
		{
			note: "GitHub description (read 2026-09-06): 'V1 DAO Aquarius web app — public frontend source for aqua.network (governance, voting, A…'. README: 'DAO Aquarius — Aquarius protocol is governed by…'. This is the FRONTEND for Aquarius governance, not the AMM or the Soroban contracts, despite the -soroban suffix. TypeScript, MIT, last commit 2026-07-03. https://github.com/AquariusDeFi/dao-aquarius-soroban",
			triggers: ["aquarius dao frontend", "aqua.network governance app"],
			source: "curated",
			asOf: "2026-09-06",
		},
	],
	"eq-lab/slender-ui": [
		{
			note: "README (read 2026-09-06): 'Slender is the first noncustodial Lending protocol on Stellar Soroban. Slender allows users to lend and borrow any crypto asset which supported by the Soroban network.' App at app.slender.fi, landing at slender.fi. This repo is the UI only; TypeScript, last commit 2025-11-25. https://github.com/eq-lab/slender-ui",
			triggers: ["slender lending ui", "slender.fi app source"],
			source: "curated",
			asOf: "2026-09-06",
		},
	],
	"blend-capital/blend-bootstrapper-ui": [
		{
			note: "README (read 2026-09-06): 'The Blend Bootstrapper UI is a dApp that allows individuals to interact with Bootstrapper based contracts on the Soroban network' — the contracts live in blend-capital/backstop-bootstrapper, which the README links. So this repo answers 'the bootstrapper interface', never 'the bootstrapper contract'. TypeScript, last commit 2025-05-13. https://github.com/blend-capital/blend-bootstrapper-ui",
			triggers: [
				"blend bootstrapper ui",
				"blend backstop bootstrapper contracts",
			],
			source: "curated",
			asOf: "2026-09-06",
		},
	],
	"Sorosan/sorosan-sdk": [
		{
			note: "README (read 2026-09-06): 'Sorosan SDK … your gateway to a seamless Stellar network development experience.' Package @sorosan-sdk/core; the sibling repo Sorosan/sorosan-client publishes @sorosan-client/core with near-identical wording, so the two are told apart by package name, not by README. Both dormant: last commits 2024-02-22 (sdk) and 2023-12-24 (client), and sorosan-dapp.vercel.app serves an unmodified create-next-app template as of 2026-09-06. SCF #20, $29,000. https://github.com/Sorosan/sorosan-sdk",
			triggers: ["sorosan sdk vs client", "sorosan core package"],
			source: "curated",
			asOf: "2026-09-06",
		},
	],
	"blockdaemon/solana-accountsdb-plugin-kafka": [
		{
			// internal: a judgment about attribution, not a published fact about
			// someone's repo. See the visibility contract on KnowledgeNote.
			note: "Triage 2026-09-06: GitHub description 'Solana geyser plugin implementing a Kafka publisher', topics [kafka, solana], Rust, no Stellar reference. Our index carries stellarProof 'none' for it, yet it is attributed to the Stellar project row 'blockdaemon' — org-wide attribution pulling in a sibling-chain repo. It is already excluded from leaderboard activity (that lane skips stellarProof none, spec 1.9.47); flagged here so a future attribution pass does not read it as Stellar evidence. https://github.com/blockdaemon/solana-accountsdb-plugin-kafka",
			source: "curated",
			asOf: "2026-09-06",
			visibility: "internal",
		},
	],
	// ── P5 batch 10 (2026-09-05): the 62 never-examined pool rows — 47 repos /
	// 47 notes, 15 internal triage verdicts (BATCH_10_TRIAGE_2026_09_05).
	// Registry identities that link back (@kyvernlabs/pulse+mcp, @dfns/sdk,
	// @idos-network/client), README-published MAINNET IDs confirmed on
	// stellar.expert with creation dates (arka.fund factory/registry, Nirium's
	// client-owned DeFindex vault), release schemes (Moonlight soroban-core,
	// sorocarbon per-contract tags, quilltip), Cargo-pinned soroban-sdk versions
	// (25.3.0 / 25 / 26.1.0 / 22 / 21.0.1-preview.3 / 25.1.0), an SCF audit-bank
	// freeze tag (nectar), three renames resolved by 301 (Query402, RizoDAO,
	// NUUP — REPO_SUPERSESSIONS carries them), one dated 404. The 29 identity
	// notes are for rows with NO GitHub description — the README's own tagline,
	// its named hackathon, and its stated network, dated by the README commit.
	// Held to the bar: orbitkit-fun/stellar-agent-kit's four npm packages list a
	// repository that 404s (triage, not a note). ~250 GitHub API calls.
	"dogstarapps/arka.fund": [
		{
			note: "README (2026-07-04): 'Arka.fund is a non-custodial asset-management protocol for Stellar/Soroban' — managers create configurable vaults ('Arkas'). Mainnet: 'Mainnet release gate: passed on 2026-06-13'; 'deployed contract WASM hashes match the manifest as of 2026-07-03'; canonical IDs in deployments.mainnet.json — Arka Factory CAIVP3OKEPRAXCN5GRMNOZCVCF6VLI6DDDZ4X5NOIUUC73I5EGLG4CYK and Arka Registry CCMCYADNUESGFRIJRZ2AOHUZBIPMRLVZCHB3BVIPHZCKGWFJSSJQBXAY, both created on the public network 2026-06-11 by GBHIT7TX… (stellar.expert, read 2026-09-05); also Router CCZNPW4X…, Venue Registry CAR5IEPA…, OracleGuard CDHSFLLD…, Aquarius Adapter CAOJRRH3…. App app.arka.fund; no tags or releases. https://github.com/dogstarapps/arka.fund#readme",
			triggers: ["arka fund contracts", "arka fund mainnet"],
			source: "curated",
			asOf: "2026-07-04",
		},
	],
	"shariqazeem/kyvernlabs": [
		{
			note: "npm @kyvernlabs/pulse — 0.2.0 (2026-04-08; 2 versions since 2026-04-03; repository → this repo; MIT): 'x402 analytics middleware — multi-chain (Base, Stellar, Solana), blockchain-verified'; companion @kyvernlabs/mcp 0.2.0 (2026-04-04), 'MCP server for KyvernLabs Pulse — 17 tools'. README 'Pulse by KyvernLabs': Stellar verification via @stellar/stellar-sdk v15 on mainnet (horizon.stellar.org) + testnet, USDC; dashboard at kyvernlabs.com/pulse/dashboard. No tags or releases. https://www.npmjs.com/package/@kyvernlabs/pulse",
			triggers: ["kyvernlabs pulse npm", "x402 revenue analytics stellar"],
			source: "curated",
			asOf: "2026-04-08",
		},
	],
	"dfns/dfns-sdk-ts": [
		{
			note: "npm @dfns/sdk — 0.8.29 (2026-09-03; 185 versions since 2023-06-13; repository → this repo; MIT), the Dfns TypeScript SDK; GitHub release 0.8.29 the same day (README install `npm i @dfns/sdk`, Node 18+). Dfns' docs list Stellar among supported networks (docs.dfns.co/networks/stellar — Stellar wallets, sign and broadcast). https://www.npmjs.com/package/@dfns/sdk",
			triggers: ["dfns typescript sdk", "dfns sdk npm"],
			source: "curated",
			asOf: "2026-09-03",
		},
	],
	"idos-network/idos-sdk-js": [
		{
			note: "npm @idos-network/client — 1.5.0 (2026-08-11; 9 versions since 2025-05-22; repository → this repo; MIT), 'idOS Client JavaScript SDK for browser environments'; the client README lists \"stellar\" among wallet types ('Multi-Chain Wallet Support — Works with EVM, NEAR, XRPL, and Stellar wallet types'), with Stellar signature verification under packages/kwil-infra. Monorepo: all @idos-network/* packages are versioned together via Changesets; tags are per package (e.g. @idos-network/issuer-sdk-js@0.0.4). https://www.npmjs.com/package/@idos-network/client",
			triggers: ["idos javascript sdk", "idos stellar wallet"],
			source: "curated",
			asOf: "2026-08-11",
		},
	],
	"moonlight-protocol/soroban-core": [
		{
			note: "GitHub releases v0.5.0 (2026-07-20), v0.4.0 (2026-06-23), v0.3.0 (2026-06-17); 5 tags. Cargo workspace version 0.5.0 pins soroban-sdk =25.3.0 (Cargo.toml at HEAD). README: 'Moonlight: the missing privacy layer, for any blockchain, built on Stellar' — 'the core smart contracts and modules for the Moonlight Protocol on Soroban' (moonlightprotocol.io); the v0.5.0 notes declare the wasm32v1-none target in rust-toolchain.toml. https://github.com/Moonlight-Protocol/soroban-core/releases",
			triggers: [
				"moonlight soroban core release",
				"moonlight protocol contracts",
			],
			source: "curated",
			asOf: "2026-07-20",
		},
	],
	"nectar-network/nectar": [
		{
			note: "README (2026-08-16): 'Multi-operator keeper infrastructure for Soroban DeFi. Distributed liquidation network for Blend Protocol on Stellar'; 'Canonical repository: github.com/Nectar-Network/nectar — other mirrors may lag'; contracts 'frozen at tag audit-freeze-v1 for the SCF Soroban Security Audit Bank' (tag dated 2026-08-15; earlier v0.3.0-audit 2026-07-25; no releases). Testnet only: 'Tranche 3 hardened deploy settling in Circle testnet USDC, 2026-07-22' — KeeperRegistry CD33A7IG…, NectarVault CDOGQY7N… on Soroban testnet; the nectar-vault crate targets soroban-sdk 22.0.0. Companion: Nectar-Network/keeper-sdk; site nectarnetwork.fun. https://github.com/Nectar-Network/nectar#readme",
			triggers: [
				"nectar network audit freeze",
				"nectar keeper blend liquidation",
			],
			source: "curated",
			asOf: "2026-08-16",
		},
	],
	"stellarcarbon/sorocarbon": [
		{
			note: "GitHub releases are per-contract tags carrying the stellar-cli version — latest v0.4.5_contracts_sink_carbon_sink-carbon_cli22.8.1 (2025-11-13; a plain v0.4.5 tag the same day; v0.4.4 2025-11-13, v0.4.3 2025-11-03). The workspace targets soroban-sdk 22 (Cargo.toml at HEAD). README: 'Home of Stellarcarbon's Soroban smart contracts' — contracts/sink_carbon; the documented deploy path is testnet ('To deploy the latest release to testnet, first download it from GitHub'), showing a testnet sink contract CBDWJLGQ…. https://github.com/stellarcarbon/sorocarbon/releases",
			triggers: ["sorocarbon release", "stellarcarbon sink contract"],
			source: "curated",
			asOf: "2025-11-13",
		},
	],
	"pragya-shar/quilltip": [
		{
			note: "GitHub releases v1.2.0 (2026-08-25), v1.1.0 (2026-06-22), v1.0.0 (2026-05-08); 4 tags. README 'Quilltip - Decentralized Publishing Platform' (quilltip.me, MIT): micro-tipping for authors on Stellar — 'Network: Stellar Testnet' ('testnet practice today'); the Tipping Contract badge links a testnet contract (CC7Q3HDX…), documented in docs/tipping-contract-testnet-deploy.md. https://github.com/pragya-shar/quilltip/releases",
			triggers: ["quilltip release", "quilltip tipping contract"],
			source: "curated",
			asOf: "2026-08-25",
		},
	],
	"eras256/nirium": [
		{
			note: "README (2026-09-04): 'Nirium's own NiriumVault treasury contract remains on Stellar Testnet, audit-gated' (testnet CBTWMZCG…; NiriumProtocol CC2TU5BD…); 'The autonomous treasury node runs on mainnet over a DeFindex vault the client owns: a third-party contract audited by OtterSec, not ours' — that vault is CAMDXG6L4LXLXXV675KZSHM3BMSETZ4NVMC7JYIQCZ2JTG54OMSK57MH, created on the public network 2026-08-06 (stellar.expert token name 'DeFindex-Vault-Nirium Treasury', read 2026-09-05); 'Mainnet is invite-only'. Badges claim 'SCF Instaward #1 & #2 Delivered'; Apache-2.0; tags showroom-stable (2026-03-27) and deploy-1, no releases. https://github.com/Eras256/Nirium#readme",
			triggers: ["nirium vault mainnet", "nirium treasury contract"],
			source: "curated",
			asOf: "2026-09-04",
		},
	],
	"xccy-labs/xccy-soroban": [
		{
			note: "Only tag oraclehub-v0.1.0-soroban (commit 2026-05-06; no releases); workspace version 0.1.0 targets soroban-sdk 25 (Cargo.toml comment: 'soroban-sdk 25.3 transitively'). README 'Status: early. The OracleHub module is the only thing shipped so far. Hub + 5 adapters are deployed and live on Stellar testnet' — OracleHub v2 CDYX3GID…, ReflectorPrice v2 CACERBYE…, BlendRate CCHP47YX… (testnet); 'Mainnet readiness: security audit, parameter calibration, observability' is an open checkbox. https://github.com/XCCY-Labs/xccy-soroban#readme",
			triggers: ["xccy soroban oraclehub", "xccy interest rate swap soroban"],
			source: "curated",
			asOf: "2026-05-07",
		},
	],
	"cushyon/stellar_migration": [
		{
			note: "README 'CushionStellar' (2026-07-05): 'Capital-protected strategy vaults on Stellar' — a Next.js frontend plus one Soroban contract, 'SEP-41 token + SEP-56 vault with on-chain strategy safety checks'; the strategy-vault crate (0.1.0) targets soroban-sdk 26.1.0 with the wasm32v1-none target (Cargo.toml at HEAD). The repo description 'Migrate the smart contract logic to Stellar' predates this; deploy instructions are testnet; no tags or releases. https://github.com/cushyon/Stellar_migration#readme",
			triggers: ["cushionstellar vault", "cushion stellar strategy vault"],
			source: "curated",
			asOf: "2026-07-05",
		},
	],
	"towa-hi/stellarunitydevtoolkit": [
		{
			note: "README (2026-04-06): 'a set of tools that allows Unity developers to interface with the Stellar smart contract platform (formerly known as Soroban) through RPC' — 'Distributed as a Unity Package Manager package (com.scryingstone.stellar-sdk), targeting Unity 2022.3+'; the manifest at StellarDevToolkit/Packages/com.scryingstone.stellar-sdk/package.json is version 0.1.0, displayName 'Stellar Development Toolkit for Unity' (unity field 6000.0), beside a com.scryingstone.stellar-wallet package. No description, tags, releases or registry listing. https://github.com/towa-hi/StellarUnityDevToolkit#readme",
			triggers: ["unity stellar sdk", "stellar unity toolkit"],
			source: "curated",
			asOf: "2026-04-06",
		},
	],
	"stellarchain/soroban-auditor": [
		{
			note: "README (2026-02-11): 'Decompiler for Soroban WASM contracts -> source-like Rust (focus: reverse engineering, not perfect recompilation)' — binaries soroban-auditor and sdk-analyze; the Cargo package soroban-auditor 2.5.1 at HEAD depends on soroban-sdk 25.1.0 and is NOT on crates.io ('crate soroban-auditor does not exist', 2026-09-05) — build from source with `cargo build`. MIT; no tags or releases. https://github.com/stellarchain/soroban-auditor#readme",
			triggers: ["soroban wasm decompiler", "soroban auditor decompile"],
			source: "curated",
			asOf: "2026-02-11",
		},
	],
	"airswiftio/scf": [
		{
			note: "Soroban contracts only — soroban/contract_deployer, soroban/scf_pool and soroban/scf_soroban, built with `make` and deployed/bumped by per-contract deploy.sh and bump.sh scripts against the network named in a `network_name` file (README, 2024-03-12; it never says what SCF stands for). The pool crate pins soroban-sdk 21.0.1-preview.3 (Cargo.toml at HEAD); the README's setup links point at the retired soroban.stellar.org docs. No description, tags or releases; last push 2025-02-27. https://github.com/Airswiftio/SCF#readme",
			source: "curated",
			asOf: "2024-03-12",
		},
	],
	"emrekayat/query402": [
		{
			note: "RENAMED: this path redirects to github.com/Query402/Query402 (HTTP 301, 2026-09-05). README (2026-08-31): 'Query402 participates in the Stellar Wave program. This public repository is the canonical workspace for Wave issues and contributions'; 'Agentic pay-per-query internet access on Stellar with x402' — a 'hackathon-ready' router for search/news/scrape on stellar:testnet (facilitator keys from channels.openzeppelin.com/testnet); MIT; no tags or releases. https://github.com/Query402/Query402",
			triggers: ["query402 repo", "query402 stellar wave"],
			source: "curated",
			asOf: "2026-09-05",
		},
	],
	"nallely-lopez/rizodao": [
		{
			note: "RENAMED: this path redirects to github.com/RizoDAO/RizoDAO (HTTP 301, 2026-09-05). README 'RIZO — Web3 Beauty Platform for the Latin Curly Hair Community' (2026-04-22): 'Payments: USDC on Stellar Testnet', a $RIZO loyalty token 'Soroban contract deployed' (testnet), 'Phase 2 — Mainnet (Q2 2026)' still a roadmap item; live at rizo-dao.vercel.app; no tags or releases. https://github.com/RizoDAO/RizoDAO",
			triggers: ["rizo dao repo", "rizodao stellar"],
			source: "curated",
			asOf: "2026-09-05",
		},
	],
	"elegidokawai2/hackaton--ajolote-en-ingles-": [
		{
			note: "RENAMED: this path redirects to github.com/Ander-tsx/NUUP (HTTP 301, 2026-09-05). README 'NUUP — ProofWork' (2026-04-26, Spanish): 'Plataforma gamificada de freelancers con reputación on-chain sobre la red Stellar' — four Soroban contracts deployed to testnet by the repo's script ('Red: Testnet Stellar | Token de pago: MXNe (SAC)'); the original path records its hackathon origin ('Hackaton Ajolote'); no tags or releases. https://github.com/Ander-tsx/NUUP",
			triggers: ["nuup proofwork repo", "hackaton ajolote stellar"],
			source: "curated",
			asOf: "2026-09-05",
		},
	],
	"gatogrozero/devengo": [
		{
			note: "No longer accessible: github.com/GatoGroZero/devengo returns 404 with no redirect (HTML page, git ls-remote and the GitHub API all agree, 2026-09-05) — deleted or made private. https://github.com/GatoGroZero/devengo",
			source: "curated",
			asOf: "2026-09-05",
		},
	],
	"0xyudz/magentix": [
		{
			note: "README 'MagentiX — Autonomous AI Agents with x402 Payments on Stellar' (2026-04-13): 'Built for the Stellar Hacks 2026 hackathon' — a marketplace where 'Service Providers register AI tools' and agents pay per call via x402 with a '60/40' provider/platform split, demo at magenti-x-app-frontend-hyr5.vercel.app; Stellar testnet; no description, license, tags or releases. https://github.com/0xyudz/MagentiX#readme",
			triggers: ["magentix repo"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"7maylord/erebus": [
		{
			note: "README 'Erebus' (2026-04-12): 'Privacy-preserving payment pool for AI agents on Stellar × x402' — agents fund a shared pool and queue payouts so only Pool → Payee appears on-chain; 'Built for the Stellar Agents x402 + Stripe MPP Hackathon'; 'Network: Stellar Testnet', USDC, pool address GBP642BQ…; AGPL-3.0; frontend erebus-x.vercel.app; no tags or releases. https://github.com/7maylord/erebus#readme",
			triggers: ["erebus payment pool", "erebus x402 privacy"],
			source: "curated",
			asOf: "2026-04-12",
		},
	],
	"ella0victor/sentryx402": [
		{
			note: "README 'Sentryx402' (2026-04-13): 'a payment-native agent runner built for the Stellar x402 hackathon' — an autonomous research agent with 'a real wallet, a hard spending budget, a receipt trail', paying per query 'on Stellar testnet using x402' (Freighter on stellar:testnet); sentryx402.vercel.app; no description, license, tags or releases. https://github.com/ELLA0VICTOR/sentryx402#readme",
			triggers: ["sentryx402 repo"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"glayzz/agentmarket-pro": [
		{
			note: "README 'AgentMarket Pro' (2026-04-12): 'A live AI agent economy where autonomous agents hire each other and pay in real USDC via the x402 protocol on Stellar' — 'Built for Stellar Hacks: Agents — x402 + Stripe MPP Track' (DoraHacks stellar-agents-x402-stripe-mpp), a solo project; 'real USDC transaction on Stellar testnet'; demo agentmarket-pro.vercel.app; no description, license, tags or releases. https://github.com/Glayzz/agentmarket-pro#readme",
			triggers: ["agentmarket pro repo"],
			source: "curated",
			asOf: "2026-04-12",
		},
	],
	"jwattjr/x4tella-mvp": [
		{
			note: "README 'x4tella — Stellar Spend Guardrails for AI Agents' (2026-04-13): 'a Stellar-native controlled spend layer for autonomous AI agents' handling HTTP 402 challenges under maxPerRequest / totalBudget policies; 'Payments are settled in USDC on the Stellar Testnet'; a 'Project Notes & Hackathon Status' section marks it a hackathon build; no description, license, tags or releases. https://github.com/JWattjr/x4tella-mvp#readme",
			triggers: ["x4tella spend guardrails"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"jennivarl/autox420": [
		{
			note: "README 'AutoX420 — On-Chain API Paywall with x402 on Stellar' (2026-04-13): 'An AI agent that autonomously buys real API data using x402 micropayments on Stellar' — five paid endpoints bought every 45 seconds, 'Real USDC transactions on Stellar testnet'; live at auto402-production.up.railway.app; a 'Hackathon Requirements Met' table marks it a hackathon build; sibling Jennivarl/underworld; no description, license, tags or releases. https://github.com/Jennivarl/AutoX420#readme",
			triggers: ["autox420 repo"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"jennivarl/underworld": [
		{
			note: "README 'UNDERWORLD — AI Research Marketplace on Stellar' (2026-04-13): 'Three AI agents that autonomously buy and sell deep research intelligence' — client, orchestrator (Gemini 2.5 Flash) and specialists paid via x402, '$0.10 USDC' per request; 'Built for the Stellar Agents Hackathon'; 'Real Stellar testnet transactions — USDC verified by x402 facilitator'; sibling Jennivarl/AutoX420; no description, license, tags or releases. https://github.com/Jennivarl/underworld#readme",
			triggers: ["underworld research marketplace"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"unique-coder/stellarbrief": [
		{
			note: "README 'StellarBrief' (2026-04-13): 'A two-sided x402 trading intelligence market on Stellar' — six paid endpoints (crypto/forex prices, news, Claude summaries) at $0.01 USDC per call; 'Built for Stellar Hacks: Agents — April 2026'; 'a complete x402 product on Stellar testnet' (USDC SAC on testnet); no description, license, tags or releases. https://github.com/Unique-coder/stellarbrief#readme",
			triggers: ["stellarbrief repo"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"techkeyy/the-signaler": [
		{
			note: "README 'The Signaler' (2026-04-11): 'Autonomous Signal Acquisition Network' — seller agents post encrypted crypto-price signals, buyers (Python + stellar-sdk + Gemini) pay 'via x402-inspired protocol on Stellar'; 'Built for Stellar Hacks: Agents on DoraHacks'; 'Real Stellar testnet XLM payments per acquisition' ('Testnet-only transfers'); live at the-signaler-production.up.railway.app; no description, license, tags or releases. https://github.com/Techkeyy/the-signaler#readme",
			triggers: ["the signaler repo"],
			source: "curated",
			asOf: "2026-04-11",
		},
	],
	"aliveevie/sentinelmesh": [
		{
			note: "README 'SentinelMesh — Autonomous DeFi Threat Detection Network on Stellar' (2026-04-04): 'Built for the Agents on Stellar Hackathon — April 2026' (DoraHacks agents-on-stellar); 'Two Rust contracts deployed to Stellar testnet, built with soroban-sdk 21.7.6' — Circuit Breaker CDX4AAQT… and Reputation Registry CBGMETPT… (testnet), four sentinel agents paid over x402 (stellar:testnet); no description, license, tags or releases. https://github.com/aliveevie/sentinelmesh#readme",
			triggers: ["sentinelmesh repo", "sentinelmesh circuit breaker"],
			source: "curated",
			asOf: "2026-04-04",
		},
	],
	"chinesepowered/hack-stellaragents": [
		{
			note: "README 'Stellar Security Audit Agent' (2026-04-11): 'AI-powered smart contract auditor that verifies deployed code, finds vulnerabilities, and stores immutable audit results on Stellar' — compares deployed WASM against source and writes results to a Soroban audit-registry contract (submit_audit); 'Built for the Stellar Agents Hackathon'; Stellar testnet ('The pre-compiled Soroban WASM is included — deploy to testnet'); no description, license, tags or releases. https://github.com/chinesepowered/hack-stellaragents#readme",
			triggers: ["stellar security audit agent"],
			source: "curated",
			asOf: "2026-04-11",
		},
	],
	"comzzy-comzzy/datavend": [
		{
			note: "README 'DataVend — AI-Powered Stellar Data Agent' (2026-04-11): 'An autonomous AI agent that sells on-chain Stellar wallet data per query using the x402 payment protocol on Stellar mainnet' — '$0.01 USDC on Stellar mainnet', verified 'via OpenZeppelin facilitator'; 'Competition: Stellar Hacks: Agents — DoraHacks'; live at datavend.tech / datavend-three.vercel.app; no description, license, tags or releases. https://github.com/comzzy-comzzy/datavend#readme",
			triggers: ["datavend repo", "datavend x402"],
			source: "curated",
			asOf: "2026-04-11",
		},
	],
	"divineudoka12/zerixs": [
		{
			note: "README 'Zerixs' (2026-04-13): 'Goal-based autonomous financial agent network on Stellar' — an orchestrator that pays specialist agents 'through x402 on Stellar testnet' (Groq as the AI provider); its 'Submission Snapshot' and 'Why This Fits The Hackathon' sections mark it a hackathon submission; no description, license, tags or releases. https://github.com/divineudoka12/Zerixs#readme",
			triggers: ["zerixs repo"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"emdevelopa/stellar_payment_api": [
		{
			note: "README 'PLUTO — Agentic Payment Infrastructure on Stellar' (2026-04-13): 'a dual-mode payment infrastructure' — Freighter checkouts for humans plus an x402Middleware for agents; 'All Stellar interactions use actual testnet transactions' (USDC issuer GBBD47IF… on testnet); the 'Hackathon Notes & Judging Criteria' section lists areas unfinished 'due to hackathon time constraints'; live at stellar-payment-api.vercel.app; no description, license, tags or releases. https://github.com/emdevelopa/Stellar_Payment_API#readme",
			triggers: ["pluto agentic payment", "stellar payment api pluto"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"nice-bills/stipend": [
		{
			note: "README 'Stipend' (2026-04-12): 'Autonomous agent payment sidecar — intercepts HTTP 402 Payment Required responses and pays via Stellar automatically'; 'cross-submitted to two awesome hackathons simultaneously: the Stellar Hacks Hackathon and the OKX Build X Hackathon' with routing between Stellar and OKX X Layer; 'Testnet: Uses XLM (not USDC) on testnet'; @stellar/stellar-sdk; no description, license, tags or releases. https://github.com/nice-bills/stipend#readme",
			triggers: ["stipend payment sidecar"],
			source: "curated",
			asOf: "2026-04-12",
		},
	],
	"rtomas/soundstake": [
		{
			note: "README 'SoundStake' (2026-04-13): 'The first music catalog where AI agents pay musicians directly' — musicians register songs and price tiers on a Soroban contract, buyers pay per use via x402 in USDC; 'Hackathon: Stellar Agents x402 + Stripe MPP'; 'Blockchain: Stellar testnet → mainnet' (deploy steps are testnet, wasm32v1-none); live at soundstake-ten.vercel.app; no description, license, tags or releases. https://github.com/rtomas/soundstake#readme",
			triggers: ["soundstake repo"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"oscargauss/fan-match": [
		{
			note: "README 'FanForge' (2026-04-13): 'a Massively Multiplayer Online Stadium built for the Stellar Agents x402 Stripe MPP Hackathon' (DoraHacks) — two Claude-powered agents play foosball while fans fund them 'with USDC on Stellar testnet' via x402 micropayments (@stellar/stellar-sdk, Pollar keys); live at fan-forge.ogauss.io; no tags or releases. https://github.com/OscarGauss/fan-match#readme",
			triggers: ["fanforge stadium", "fan match repo"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"gabrululu/propulsor": [
		{
			note: "README 'Hackathon Context' (2026-08-21): 'Propulsor was originally built for She Ships 2026, a 48-hour global hackathon celebrating International Women's Day (March 6–8, 2026)', then 'extended for the Stellar Agentic Payments Hackathon' (x402 agent) 'and again for Stellar Hacks — Real-World ZK' (Groth16/BLS12-381 and RISC Zero proofs). SplitProtocol and TimeVault Soroban contracts are 'Deployed Testnet'; 'Stellar Mainnet — Post-hackathon'; app propulsor.lovable.app; no tags or releases. https://github.com/Gabrululu/Propulsor#readme",
			triggers: ["propulsor hackathon", "propulsor split protocol"],
			source: "curated",
			asOf: "2026-08-21",
		},
	],
	"penguinpecker/ko402": [
		{
			note: "README 'KO402 — Pay-Per-Move AI Fighting Game on Stellar' (2026-04-06): 'a turn-based fighting game where autonomous AI agents battle each other using real Stellar micropayments' — each move is a USDC payment and the pot (0.2 USDC) settles to the winner; 'Stellar Hacks: Agents — DoraHacks'; 'Stellar Testnet, USDC payments via Horizon SDK' (escrow account GCRRX5XD…); ko402.vercel.app; no description, license, tags or releases. https://github.com/penguinpecker/ko402#readme",
			triggers: ["ko402 fighting game"],
			source: "curated",
			asOf: "2026-04-06",
		},
	],
	"zzzbedream/cortex402": [
		{
			note: "README 'Cortex402' (2026-04-13): 'AI-native payment middleware for the x402 protocol on Stellar' — server-side 402 lifecycle plus typed agent tools (sign_stellar_transaction, check_payment_status) with single-use memo_hash replay protection; Horizon on Stellar Testnet with testnet USDC by default; the repo description is just the name; no license, tags or releases. https://github.com/zzzbedream/Cortex402#readme",
			triggers: ["cortex402 middleware"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"marxmad/agenticx402": [
		{
			note: "README 'PumaX402 — Agentic Services Hub on Stellar' (2026-04-13): 'A unified catalog and access layer for x402 and MPP services on Stellar: discover, pay per request, and consume APIs' — live hub at agenticx402-production.up.railway.app; stellar-sdk + stellar-cli + Soroban (Rust); MIT (Node ≥20); no description, tags or releases. https://github.com/MarxMad/Agenticx402#readme",
			triggers: ["pumax402 hub", "agenticx402 repo"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"panditdhamdhere/payflow": [
		{
			note: "README 'Payflow Agent Tools' (2026-04-12): 'Pay-per-call HTTP tools for AI agents on Stellar, using x402' — Express + @x402/express + @x402/stellar (exact scheme) with a Vite/React UI and Freighter; prices in 'testnet USDC' (issuer GBBD47IF…), flow 'matches the Stellar x402 quickstart'; written as a submission ('put the live URL at the top of your submission'); MIT; no description, tags or releases. https://github.com/panditdhamdhere/Payflow#readme",
			triggers: ["payflow agent tools"],
			source: "curated",
			asOf: "2026-04-12",
		},
	],
	"isaac-richie/stellarpulse": [
		{
			note: "README 'StellarPulse' (2026-04-13): 'a pay-per-insight intelligence terminal built on Stellar' — Polymarket/Kalshi signals turned into briefs, premium analysis 'behind Stellar x402 payment verification' for humans and agents; needs a 'Stellar testnet account' for payment testing; API at stellarpulse-api.vercel.app; no description, license, tags or releases. https://github.com/isaac-richie/stellarpulse#readme",
			triggers: ["stellarpulse repo"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"methu-ship/toll": [
		{
			note: "README 'toll: The Stellar Agentic API Marketplace' (2026-04-10): 'a decentralized, autonomous marketplace where AI agents buy and sell data and services using the X402 payment protocol on the Stellar Network' — a seller agent registers price/swap/FX feeds, a buyer agent scores and purchases them; 'Stellar Testnet' with Friendbot funding; no description, license, tags or releases. https://github.com/methu-ship/toll#readme",
			triggers: ["toll agentic api marketplace"],
			source: "curated",
			asOf: "2026-04-10",
		},
	],
	"shivraigithub/genesis402": [
		{
			note: "README 'Genesis402 - Stellar x402 Gateway' (2026-04-11): 'a no-code monetization layer that wraps existing APIs with pay-per-request enforcement using x402 on Stellar' — Express/TypeScript backend, Next.js frontend, x402Version 2 challenges; no description, license, tags or releases. https://github.com/ShivRaiGithub/Genesis402#readme",
			triggers: ["genesis402 gateway"],
			source: "curated",
			asOf: "2026-04-11",
		},
	],
	"godbrand0/argent": [
		{
			note: "README 'Argen: Agentic Liquidation Protocol' (2026-04-12): 'an autonomous lending protocol on Stellar that leverages ZK-Proofs and x402 payments' — 'Deployed Contracts (Stellar Testnet)': Vault CBNXMW4Q…, vUSDC CDEMATCS…, ZK Verifier CDGYLCFD… (all testnet); Apache-2.0; argent-mu.vercel.app; no description, tags or releases. https://github.com/Godbrand0/argent#readme",
			triggers: ["argen liquidation protocol", "argent repo stellar"],
			source: "curated",
			asOf: "2026-04-12",
		},
	],
	"soomtochukwu/tradeflow": [
		{
			note: "README 'TradeFlow' (2026-05-15): 'a decentralized, enterprise-grade Trade Finance (TradeFi) platform built on the Stellar network' digitizing Letters of Credit with 'Trustless Work Smart Contract Primitives' (multi-release escrow); 'Built for the Boundless Hackathon'; NEXT_PUBLIC_USE_MAINNET=false by default; trade--flow.vercel.app; no description, license, tags or releases. https://github.com/soomtochukwu/TradeFlow#readme",
			triggers: ["tradeflow letter of credit"],
			source: "curated",
			asOf: "2026-05-15",
		},
	],
	"dpinones/liars-dice": [
		{
			note: "README 'Liar's Dice — Bluffing with ZK Proofs on Stellar' (2026-02-23): 'a PvP bluffing game on Stellar where two players secretly roll dice' with zero-knowledge proofs keeping hands hidden; demo video on YouTube; MIT; no description, tags or releases. https://github.com/dpinones/liars-dice#readme",
			triggers: ["liars dice zk stellar"],
			source: "curated",
			asOf: "2026-02-23",
		},
	],
	"warp-driver/phoenix-blend-pool": [
		{
			note: "README 'phoenix-blend-pool' (2026-06-01): 'WarpDrive-driven rebalance automation for the Phoenix XLM-USDC blended pool variant' — a circuit subscribes to the blended pool's events, WarpDrive operators sign, an aggregator submits at quorum and an automation-handler contract on Stellar verifies; the Rebalance action moves USDC between the pool and Blend; GPL-3.0; no description, tags or releases. https://github.com/warp-driver/Phoenix-Blend-Pool#readme",
			triggers: [
				"phoenix blend pool rebalance",
				"warpdrive phoenix automation",
			],
			source: "curated",
			asOf: "2026-06-01",
		},
	],
	// ── P5 batch 9 (2026-09-02): 26 repos / 27 notes — the 40–49 band (181
	// curated-index rows, 96 examined after registry keys, earlier rejects and
	// rows already carrying a derived audit note). Registry identities that
	// link back (NuGet stellar-dotnet-sdk, hex stellar_sdk/stellar_base, Go
	// firehose-stellar, xBull wallet-connect, BlindPay's node/mcp/go/swift
	// SDKs, asgcard, dfns-sdk-python), Ledger's app-stellar release scheme,
	// four renames resolved by 301, an in-repo Halborn audit PDF confirmed via
	// the API, products whose GitHub releases are the download channel, two
	// dated 404s. Held to the bar: four repos whose only registry identity
	// does NOT link back to the repo (hot-dao/omni-sdk, tenk-dao/smartdeploy,
	// xycloo/rs-zephyr-toolkit, lockb0x-llc/pakana-…) are recorded as triage
	// verdicts instead. Every README contract ID in this band was checked on
	// stellar.expert — none is a mainnet deployment. 66 further repos yielded
	// nothing durable (26 not Stellar at all; 19 README-only; 17 hackathon /
	// testnet / fork) and sit in BAND_40_49_TRIAGE_2026_09_02. 3 API calls.
	"ledgerhq/app-stellar": [
		{
			note: "The Ledger hardware-wallet app for Stellar — Cargo package `stellar` 6.0.3 at HEAD; README: transaction signing on Nano X, Nano S+, Nano Gen5, Stax and Flex (ledger_app.toml devices: nanox, nanos+, stax, flex, apex_p). Releases are per-device tags carrying the app version: stax_1.10.0_6.0.3_sdk_v26.0.2 and flex_1.6.0_6.0.3_sdk_v26.0.2 (2026-04-22), nanox_2.7.0_6.0.3_sdk_v26.0.2 (2026-04-21); 388 tags. https://github.com/LedgerHQ/app-stellar/releases",
			triggers: ["ledger stellar app version", "ledger nano stellar app"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"beans-bv/dotnet-stellar-sdk": [
		{
			note: "NuGet stellar-dotnet-sdk — 15.1.0 (2026-06-07; 95 versions since 2.0.0 on 2018-05-31; the current 15.x entries list this repo as project URL while the 2021 7.2.x entries list elucidsoft/dotnet-stellar-sdk); companion package stellar-dotnet-sdk-xdr 15.1.0. README: 'Stellar API SDK for .NET', a port of the Java SDK (lightsail-network) with SEPs ported from Soneso's Flutter SDK; latest pre-release 16.0.0-beta (2026-06-25). https://www.nuget.org/packages/stellar-dotnet-sdk",
			triggers: ["dotnet stellar sdk nuget", "stellar dotnet sdk"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"kommitters/stellar_sdk": [
		{
			note: "Hex stellar_sdk — 0.23.0 (2026-06-03; 45 releases since 2021-08-18; GitHub link → this repo; MIT), the Elixir SDK for Stellar. CHANGELOG 0.23.0 (02.06.2026): Protocol 22/23/26 support, stellar_base ~> 0.17.0, CreateContractArgsV2 (CAP-0058); the previous release 0.22.0 was 2024-08-16. Low-level XDR companion: kommitters/stellar_base. https://hex.pm/packages/stellar_sdk",
			triggers: ["elixir stellar sdk", "stellar sdk hex package"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"kommitters/stellar_base": [
		{
			note: "Hex stellar_base — 0.17.0 (2026-06-03; 42 releases since 2021-08-12; GitHub link → this repo; MIT): 'low-level elixir library to read, write, hash, and sign XDR primitive constructs'. CHANGELOG 0.17.0 (02.06.2026): Protocol 22/23/26, TransactionMetaV4, Quorum Freeze (CAP-0077), contract constructors (CAP-0058), muxed SCAddress (CAP-0079); the previous release 0.16.0 was 2024-07-23. Consumed by kommitters/stellar_sdk. https://hex.pm/packages/stellar_base",
			triggers: ["elixir stellar xdr library"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"streamingfast/firehose-stellar": [
		{
			note: "Go module github.com/streamingfast/firehose-stellar — v1.2.1 (2026-08-28; 10 tags; Go proxy origin → this repo). CHANGELOG: v1.2.1 requires stellar-core >= 28.0.1-3508 (SDF's fix for the August 2026 critical security advisory); v1.2.0 (2026-08-25) Protocol 28 (CAP-0083/CAP-0085); v1.1.0 (2026-06-18) Protocol 27 + the captive-core fetcher. A release is a tag push built by release.yml (binaries, images, Homebrew formula). https://github.com/streamingfast/firehose-stellar/blob/HEAD/CHANGELOG.md",
			triggers: ["firehose stellar release", "firehose stellar version"],
			source: "curated",
			asOf: "2026-09-02",
		},
		{
			note: "README (2026-09-02): 'Captive-core is the supported backend going forward. The RPC poller is kept for compatibility but is no longer actively developed — new deployments should use captive-core.' `firestellar fetch captive-core` is the recommended path; `firestellar fetch rpc` (Stellar RPC endpoint) is legacy, maintenance-only. https://github.com/streamingfast/firehose-stellar#readme",
			triggers: [
				"firehose stellar backend",
				"firehose stellar captive core",
				"firehose stellar rpc poller",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"creit-tech/xbull-wallet-connect": [
		{
			note: "npm @creit.tech/xbull-wallet-connect — 0.4.0 (2025-08-13; 2 versions since 2024-09-15; repository → this repo): 'connect your website with xBull Wallet in both extension and webapp version'. The README's install line is `npm i --save @creit.tech/xbull-wallet-connect` but it recommends installing from GitHub by version tag ('we use Github instead of NPM'); GitHub releases 0.1.0…0.4.0 (4 tags; 0.4.0 on 2025-08-13). https://www.npmjs.com/package/@creit.tech/xbull-wallet-connect",
			triggers: [
				"xbull wallet connect package",
				"connect website xbull wallet",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"lobstrco/stellar-identicon-js": [
		{
			note: "npm stellar-identicon-js — 1.0.0 (2019-09-19; 2 versions since 2019-09-18; repository → this repo; ISC): canvas identicons derived from a Stellar public key. README: the Python twin Lobstrco/stellar-identicon-py yields the same image for the same address by default, and LOBSTR's hosted service id.lobstr.co/<G…>.png serves 210×210 PNGs generated by the Python version behind CloudFront. No tags. https://www.npmjs.com/package/stellar-identicon-js",
			triggers: ["stellar identicon library", "identicon from stellar address"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"beans-bv/beans-merchant-sdk-javascript": [
		{
			note: "npm beans-merchant-sdk — 5.0.0 (2025-10-29; 11 versions since 2024-01-30; MIT; repository → github.com/Beans-BV/merchant_sdk_javascript, which redirects here — HTTP 301, 2026-09-02). README 'Beans Merchant JavaScript SDK': QR-code payment requests and on/off-ramp integration with the Beans app on Stellar; GitHub releases 1.0.0…5.0.0 (20 tags; 3.0.0–5.0.0 all published 2025-10-29). Sibling SDK: Beans-BV/beans-merchant-sdk-dart. https://www.npmjs.com/package/beans-merchant-sdk",
			triggers: ["beans merchant sdk npm", "beans merchant javascript"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"xcapit/openzktool": [
		{
			note: "RENAMED: github.com/xcapit/stellar-privacy-poc — the path in this repo's package.json (npm name stellar-privacy-sdk 0.1.0-poc) — redirects here (HTTP 301, 2026-09-02); the README badges still point at fboiero/stellar-privacy-poc, which returns 404. README 'OpenZKTool — Privacy infrastructure for Stellar Soroban using Zero-Knowledge Proofs', Status: Proof of Concept (Groth16/BN254 verifier for Soroban), AGPL-3.0; no tags or releases. https://github.com/xcapit/openzktool",
			triggers: ["openzktool repo renamed", "stellar privacy poc repo"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"sorobanhooks/freighter": [
		{
			note: "RENAMED: this path redirects to github.com/sorobanhooks/aptopia-wallet (HTTP 301, 2026-09-02), a fork of stellar/freighter (GitHub 'forked from' banner). README 'Aptopia': 'non-custodial smart wallet on the Stellar testnet' built as a Freighter fork with yield vaults, a trading agent, x402 pay-per-call data and an OpenZeppelin Smart Account — 'Mainnet is gated on audit + funding — this codebase targets Stellar testnet only.' No tags. https://github.com/sorobanhooks/aptopia-wallet",
			triggers: ["aptopia wallet repo", "sorobanhooks freighter fork"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"coinfabrik/scout-soroban": [
		{
			note: "README install line `cargo install cargo-scout-audit` — crates.io cargo-scout-audit 0.3.16 (2026-02-13; 39 versions since 2023-06-30) lists repository github.com/coinfabrik/scout-audit, not this repo: the maintained analyzer (ink!, Soroban, Substrate) lives in CoinFabrik/scout-audit; this Soroban-specific repo (last push 2024-07-31; no tags) hosts the docs site. Companions: VS Code extension CoinFabrik.scout-audit, GitHub Action coinfabrik/scout-actions@v3; SCF-funded. https://crates.io/crates/cargo-scout-audit",
			triggers: [
				"scout soroban install",
				"soroban static analysis tool",
				"scout audit crate",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"coinfabrik/scout-actions": [
		{
			note: "GitHub Marketplace action 'Run Scout Action' (`uses: coinfabrik/scout-actions@v3`; action.yml name 'Scout Security Analysis' — 'Runs Scout security analysis on Rust projects and reports findings'); latest release v3.2 (2025-01-31; 22 tags). README: Scout assists ink!, Soroban and Substrate developers; the analyzer itself is CoinFabrik/scout-audit (crate cargo-scout-audit). https://github.com/marketplace/actions/run-scout-action",
			triggers: ["scout github action", "soroban security github action"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"dfns/dfns-sdk-python": [
		{
			note: "PyPI dfns-sdk — 0.0.4 (2026-09-08; 6 releases since 2026-01-12; Repository → this repo), the Dfns Python SDK. Dfns' docs list Stellar among supported networks — 'Network-specific features, signature kinds, supported assets, and integration requirements for Stellar wallets on the DFNS platform' (docs.dfns.co/networks/stellar), with Stellar sign and broadcast API references. https://pypi.org/project/dfns-sdk/",
			triggers: ["dfns python sdk", "dfns stellar wallets"],
			source: "curated",
			asOf: "2026-09-13",
		},
	],
	"blindpaylabs/blindpay-node": [
		{
			note: "npm @blindpay/node — 5.3.1 (2026-08-07; 42 versions since 2025-09-27; repository → this repo; MIT), 'Official Node.js SDK for Blindpay API - Stablecoin API for global payments'; GitHub release v5.3.1 the same day (8 tags). BlindPay's own changelog dates its 'Stellar Integration' to 2025-05-09 and a 'Stellar Wallet Rotation and Testnet USDB Fix' to 2026-05-15. https://www.npmjs.com/package/@blindpay/node",
			triggers: ["blindpay node sdk", "blindpay stellar integration"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"blindpaylabs/blindpay-mcp": [
		{
			note: "npm @blindpay/mcp — 1.7.1 (2026-08-08; 16 versions since 2026-01-05; repository → this repo; MIT), 'Official MCP Server for BlindPay API - Stablecoin API for global payments'; GitHub release v1.7.1 the same day (13 tags). Stellar is one of BlindPay's rails per its changelog ('Stellar Integration', 2025-05-09). https://www.npmjs.com/package/@blindpay/mcp",
			triggers: ["blindpay mcp server"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"blindpaylabs/blindpay-go": [
		{
			note: "Go module github.com/blindpaylabs/blindpay-go — v1.19.0 (2026-08-04; Go proxy origin → this repo; 20 tags, four of them cut on 2026-08-04), 'Blindpay's Golang SDK'. Stellar is one of BlindPay's rails per its changelog ('Stellar Integration', 2025-05-09). https://pkg.go.dev/github.com/blindpaylabs/blindpay-go",
			triggers: ["blindpay go sdk"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"blindpaylabs/blindpay-swift": [
		{
			note: "Swift package distributed by git tag (Package.swift: package blindpay-swift, product BlindPay) — latest release v4.5.1 (2026-08-07; 27 tags; v4.4.0 and v4.5.0 on 2026-08-04), 'BlindPay's Swift SDK'. Stellar is one of BlindPay's rails per its changelog ('Stellar Integration', 2025-05-09). https://github.com/blindpaylabs/blindpay-swift/releases",
			triggers: ["blindpay swift sdk"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"asgcompute/asgcard-public": [
		{
			note: "npm @asgcard/sdk 1.1.5, @asgcard/cli 0.7.8 and @asgcard/mcp-server 0.6.3 (all 2026-04-08; 15/26/14 versions since 2026-03-10/13; MIT) each list repository → this repo. README 'ASG Card': agent-first virtual MasterCards paid 'via Stellar x402 (USDC) or Stripe Machine Payments Protocol', hosted at asgcard.dev; the README's license link points at ASGCompute/asgcard, which returns 404 (private). No tags. https://www.npmjs.com/package/@asgcard/sdk",
			triggers: ["asg card sdk", "asgcard npm packages"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"normalfinance/normal-stellar-amm": [
		{
			note: "GitHub releases: v1.0.0 (2025-11-06) plus per-contract tags of the same day (e.g. v1.0.0_contracts_pool_plane_pool-plane_cli22.8.1; 11 tags). README 'Audits': 'Summer 2025 x Halborn' — audits/ holds 'Normal x Halborn - Summer 2025 Audit.pdf' and THREAT.MD (GitHub API, 2026-09-02). Cargo workspace contracts/* + modules/*; sibling protocol repo normalfinance/stellar-v1 (renamed from lsp). https://github.com/normalfinance/normal-stellar-amm/releases",
			triggers: ["normal stellar amm audit", "normal amm halborn"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"satoshipay/solar": [
		{
			note: "Solar Wallet — README: 'User-friendly Stellar wallet, featuring multi-signature, custom assets management and more. Runs on Mac OS, Windows, Linux, Android and iOS'; binaries ship via GitHub releases — latest v0.28.1 (2022-06-03; 85 tags; v0.28.0 2021-10-27); keys encrypted with PBKDF2-SHA256 + xsalsa20-poly1305; solarwallet.io still links these downloads (2026-09-02). Last push 2022-06-03. https://github.com/satoshipay/solar/releases",
			triggers: ["solar wallet release", "satoshipay solar wallet"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellarterm/stellarterm-desktop-client": [
		{
			note: "README: 'the StellarTerm client now in a desktop app format' — downloads via GitHub releases; latest 'StellarTerm Desktop Client v2220' (2023-02-21; 20 tags; previous v1956 2021-06-22, v1768 2020-05-29). The web client is the sibling stellarterm/stellarterm. https://github.com/stellarterm/stellarterm-desktop-client/releases",
			triggers: ["stellarterm desktop download", "stellarterm desktop release"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"lobstrco/vault-ios": [
		{
			note: "Source of the LOBSTR Vault iOS app — README links App Store id1452248529 ('LOBSTR Vault - Multi-signature security on the Stellar network'; local key storage; signs for one or more Stellar accounts; N-of-N across devices); single GitHub release 1.3.2 (2020-05-07; 2 tags); last push 2025-02-12. Android sibling: Lobstrco/vault-android. https://apps.apple.com/app/lobstr-vault/id1452248529",
			triggers: ["lobstr vault ios source", "lobstr vault app store"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"bigger-tech/simple-stellar-signer": [
		{
			note: "MOVED: github.com/PlutoDAO/simple-stellar-signer — the path the README's docs links still use — redirects here (HTTP 301, 2026-09-02). README 'Simple Signer': embeddable login + transaction signing for Stellar supporting xBull, Albedo, Freighter, Rabet, WalletConnect, LOBSTR and Ledger, with hosted instances named as sign.bigger.systems (+ -testnet, -futurenet). No tags; last push 2025-03-14. https://github.com/bigger-tech/simple-stellar-signer",
			triggers: ["simple stellar signer repo", "plutodao simple signer"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"devasignhq/apps": [
		{
			note: "No longer accessible: github.com/devasignhq/apps returns 404 with no redirect (HTML page, git ls-remote and the GitHub API all agree, 2026-09-02) — deleted or made private; our index last saw a push on 2026-07-31 (description: monorepo of the DevAsign Maintainer and Contributor apps, app.devasign.com). The owner's public escrow repo is devasignhq/bounty-escrow. https://github.com/devasignhq/apps",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"devasignhq/devasign-api": [
		{
			note: "No longer accessible: github.com/devasignhq/devasign-api returns 404 with no redirect (HTML page, git ls-remote and the GitHub API all agree, 2026-09-02) — deleted or made private; our index last saw a push on 2026-06-19 and a release v1.1.0 dated 2026-06-26. The owner's public escrow repo is devasignhq/bounty-escrow. https://github.com/devasignhq/devasign-api",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stanbar/stellot": [
		{
			note: "GitHub releases: 0.0.1 'Draft for SCF' (2020-03-21), 0.1.0 'IEEE Access' (2020-09-22), 0.2.0 'draft' (2023-10-27; 3 tags). README 'Stellot† on Soroban': a PhD-thesis proof-of-concept of the Stellot† receipt-free e-voting protocol (Feldman VSS/DKG, Shamir threshold decryption, hash nullifiers) with the election contract in contracts/election; live at stellot.com ('Threshold E-Voting on Soroban', 2026-09-02). https://github.com/stanbar/stellot/releases",
			triggers: ["stellot voting soroban", "stellot releases"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	// ── P5 batch 8 (2026-09-02): 18 repos / 21 notes — the band BELOW the pool,
	// curated-index repos with repoScore 50–59 (156 in the band; 98 examined
	// after registry keys, earlier rejects and rows already carrying notes).
	// Registry identities that link back (@x402/stellar + PyPI x402,
	// @lobstrco/signer-extension-api, @x402xlm/start, a Docker Hub image),
	// README-published MAINNET contract IDs confirmed on stellar.expert with
	// creation dates (hitz-gravity, contracts-acta, stellar8004, a2a-protocol),
	// one archive dated only by GitHub's banner (soroswap/frontend), three
	// path moves resolved by 301, one hosted product with releases, five dated
	// 404s. The other 80 yielded nothing durable and are recorded as internal
	// triage verdicts (BAND_50_59_TRIAGE_2026_09_02) so the board can tell
	// judged from unexamined when the pool widens to this band: 46 hackathon
	// demos / ZK games, 15 testnet-only or registry-less products, 5 not
	// Stellar repos, 5 with a registry identity but no Stellar fact in their
	// docs, 5 README-claimed packages unpublished or not linking back, 4
	// tag-only. Research used 16 GitHub API calls.
	"x402-foundation/x402": [
		{
			note: "npm @x402/stellar — the 'x402 Payment Protocol Stellar Implementation', Apache-2.0, repository → this repo, published since 2026-03-10. Depends on @stellar/stellar-sdk ^16 and @x402/core; the README's SDK install line lists it among the chain packages next to @x402/core. Git tags are per package (npm-@x402/stellar@v<version>). Read the current version from npm — this package releases continuously (three publishes in a day, 2026-09-04) and a version pinned here would be a stale mirror rather than knowledge. https://www.npmjs.com/package/@x402/stellar",
			triggers: ["x402 stellar npm", "x402 stellar package"],
			source: "curated",
			asOf: "2026-09-02",
		},
		{
			note: "PyPI x402 is the Python SDK (MIT; Repository → this repo; tags are per package, pypi-x402@v<version>); npm @x402/core (published since 2025-12-10) and the older unscoped npm x402 (since 2025-02-20, superseded by the scoped packages) both link back here. There is NO single latest GitHub release for this repo — it carries hundreds of per-package tags, so a plain 'latest release' lookup answers the wrong question. Read current versions from PyPI/npm rather than from here; this project publishes several releases a day. https://pypi.org/project/x402/",
			triggers: ["x402 python sdk"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"soroswap/frontend": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Jul 24, 2026' (read 2026-09-02; the same day as soroswap/spacewalk-implementation and phoenix-zephyr-indexer). Repo description: 'OLD Soroswap.Finance Frontend for Soroswap AMM, Soroswap Aggregator & Spacewalk Bridge Implementation'; last push 2025-08-24; no tags or releases; the README still points at soroswap.finance. https://github.com/soroswap/frontend",
			triggers: ["soroswap frontend archived"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"lobstrco/lobstr-browser-extension": [
		{
			note: "npm @lobstrco/signer-extension-api — 2.1.0 (2026-07-24; 3 versions since 2024-03-27; repository → this repo; Apache-2.0), the client SDK in this monorepo's @lobstrco/signer-extension-api workspace (same 2.1.0 at HEAD). README: the LOBSTR signer extension lets dapps connect to the Stellar network and sign with the LOBSTR mobile wallet. No tags or releases. https://www.npmjs.com/package/@lobstrco/signer-extension-api",
			triggers: ["lobstr signer extension npm", "lobstr extension api package"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"community-exchange-network/komunitin": [
		{
			note: "MOVED: github.com/komunitin/komunitin — the clone URL in this repo's own README — redirects here (HTTP 301, 2026-09-02). README: Komunitin 'Open System for Exchange Communities'; its accounting service is 'the decentralized backend for the accounting API based on the Stellar blockchain' (accounting/); live demo at demo.komunitin.org, docs at docs.komunitin.org. No tags. https://github.com/community-exchange-network/komunitin",
			triggers: ["komunitin repo moved", "komunitin accounting stellar"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"skyhitz/hitz-gravity": [
		{
			note: "README 'Mainnet': HITZ Gravity Token (Soroban SEP-41, soroban-sdk 25) at CBAPZAZNNB4X3VPXV2LYA5RMV7XHXIVREES2GG7R5GUXDZ4R4CKOY4EU, WASM hash befa64d9…5b08, max supply 100,000,000 HITZ — stellar.expert (public) shows the contract created 2026-04-25 with the same wasm prefix; the 'Validated Source' is GitHub release v1.0.0 (2026-04-29). Powers skyhitz.io. https://stellar.expert/explorer/public/contract/CBAPZAZNNB4X3VPXV2LYA5RMV7XHXIVREES2GG7R5GUXDZ4R4CKOY4EU",
			triggers: ["hitz token contract", "skyhitz gravity token"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"acta-team/contracts-acta": [
		{
			note: "README 'Mainnet Deployments' + docs/deployments/mainnet.md (deployed 2026-06-30): did-stellar-registry 0.2.0 = CD6LSWW5ZSXOO5WAIHKQLQ262TW7BPI37PNEVMMA273BAPC65NN2AYXQ; vc-vault-factory 0.1.0 = CCWNZ6UMUXCDOVP2TWOPVLI4KP4VY4YF7VKPN6XLYVHNFAT24NDB33CX (vc-vault 0.4.0 instances are deployed by the factory from template WASM 2bd0323a…); factory fee 1 USDC per credential. Both IDs exist on stellar.expert (public), created 2026-06-30. https://github.com/ACTA-Team/contracts-acta#mainnet-deployments",
			triggers: ["acta mainnet contracts", "acta vault factory contract"],
			source: "curated",
			asOf: "2026-09-02",
		},
		{
			note: "Latest GitHub release mainnet-v1.0.0 'Mainnet launch - 2026-06-30' (2026-06-30); contract releases are per-crate tags (vc-vault-v0.4.0 2026-06-23, did-stellar-registry-v0.2.0, vc-vault-factory-v0.1.0; 7 tags). Cargo workspace 0.21.0 with repository → this repo. The did:stellar TypeScript resolver/SDK is the sibling acta-team/did-stellar. https://github.com/ACTA-Team/contracts-acta/releases",
			triggers: ["acta contracts release"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"rohan911438/a2a-protocol": [
		{
			note: "README 'Mainnet': escrow contract CADGOK3EO3F5IJAD2JVG4V65N2GXHAWEY5QERK66BZI7UBEQPQJLKRL3 on Stellar Mainnet (Public) — stellar.expert (public) shows it created 2026-08-08. The README self-describes as 'a hackathon project' (Team Brotherhood) with a live frontend at a2aprotocol.netlify.app; the A2AT token is 'Proposed, Not Yet Implemented'. No tags or releases. https://stellar.expert/explorer/public/contract/CADGOK3EO3F5IJAD2JVG4V65N2GXHAWEY5QERK66BZI7UBEQPQJLKRL3",
			triggers: ["a2a protocol escrow contract"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"progax01/stellar8004": [
		{
			note: "AgenticOcean — README 'Smart Contracts — Mainnet': VaultFactory CAXYXFBO26RSBU2HRNPDWOQ7M2WITX67E7PI543WHDDMM5F7U4WQOUXM, AgentRegistry CDKHR3UUKCKXJ6CRKWKUZI3SKWAAKJMU6TGHRBM2VJJBCKEO6ETH55AU, ReputationRegistry CB6B4EBQ3JXLGUWF5WGMQV63PL3K2WQP5LMEL2BZDIDTEPCIC5BDH6ZB, ValidationRegistry CDX65CKW2NZQZK5U7DQRK6KVOBI4PTLQVGHYAEQ7OPPY2KRCDUAS2AL5 — all four on stellar.expert (public), created 2026-02-23 by one deployer. Live demo agenticocean.solbinary.com. https://github.com/progax01/stellar8004#smart-contracts--mainnet",
			triggers: ["agenticocean contracts", "agenticocean mainnet"],
			source: "curated",
			asOf: "2026-09-02",
		},
		{
			note: "README 'Published SDKs' names npm @agenticocean/vault 0.1.1, @agenticocean/x402-stellar 1.0.1 and @agenticocean/defi-agent 0.3.1 (all 2026-02-23) — but none of the three registry entries points at this repo (vault and defi-agent carry no repository field; x402-stellar names a different path, stellaragent402/stellaragent402), so cite this README, not npm, for identity. https://www.npmjs.com/package/@agenticocean/vault",
			triggers: ["agenticocean npm"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"asgcompute/xlmx402earn": [
		{
			note: "npm @x402xlm/start — 1.3.3 (2026-04-11; 7 versions since 2026-04-09; repository → this repo; Apache-2.0), the `npx @x402xlm/start` quick-start skill the README badges ('Quick-start skill for AI agents to earn XLM on the Stellar testnet'); GitHub release v1.0.0 'Hackathon Submission' (2026-04-10; Stellar Hacks: Agents); hosted at stellar-agent-earn.vercel.app. Testnet product. https://www.npmjs.com/package/@x402xlm/start",
			triggers: ["x402xlm start package"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"inferara/soroban-security-portal": [
		{
			note: "README 'Container Images': Docker Hub georgii4inferara/soroban-security-portal (API — the hub description is this repo's URL), soroban-security-portal-ui and sorobansecurityportal (Helm), all tagged 1.0.129 on 2026-08-26. The portal is hosted at stellarsecurityportal.com, listed on Tansu (project 'securityportal') and funded by the SCF + Stellar Public Good Program (README badge). No tags. https://hub.docker.com/r/georgii4inferara/soroban-security-portal",
			triggers: [
				"security portal docker image",
				"stellar security portal hosted",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"litemint/litemint": [
		{
			note: "README: app.litemint.com is 'a bespoke, open-source, non-custodial Stellar wallet built for gamers and digital collectors' (BIP-39, SLIP-0010/SEP-0005 derivation, SDEX trading, NFTs); its build guide downloads source from GitHub releases — latest v1.3.2 (2021-01-28; 9 tags). The npm package litemint (1.0.1, 2018) points at github.com/FredericRezeau/litemint, a separate repo, not this one. https://github.com/litemint/litemint/releases",
			triggers: ["litemint wallet release", "litemint web wallet"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"normalfinance/stellar-v1": [
		{
			note: "RENAMED: github.com/normalfinance/lsp — the path still in this repo's package.json repository field — redirects here (HTTP 301, 2026-09-02). README 'Normal Stellar v1': USDC-backed synthetic-asset protocol (Cargo workspace 1.0.0, contracts/* + modules/*); git tags 1.0.0 (2026-01-26) and pre-fee-change, no GitHub releases (API, 2026-09-02); docs at docs.normalfinance.io. https://github.com/normalfinance/stellar-v1",
			triggers: ["normal finance lsp repo", "normal stellar v1 renamed"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"devasignhq/bounty-escrow": [
		{
			note: "Current path of devasignhq/soroban-contract (old path → HTTP 301 here, 2026-09-02; the README's badges still name soroban-contract; the registry also carries that old key). Single GitHub release v1.0.0 'Initial Release' (2026-06-05; 1 tag); Cargo package devasign_task_escrow 0.1.0; README deploy flow targets testnet and derives the mainnet USDC SAC from Circle's issuer GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN. https://github.com/devasignhq/bounty-escrow",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"devasignhq/soroban-escrow": [
		{
			note: "No longer accessible: github.com/devasignhq/soroban-escrow returns 404 with no redirect (HTML page, git ls-remote and the GitHub API all agree, 2026-09-02) — deleted or made private; our index last saw a push on 2026-07-21. The owner's public escrow contract repo is devasignhq/bounty-escrow (see that note). https://github.com/devasignhq/soroban-escrow",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"0xbhoomi/agentmesh": [
		{
			note: "No longer accessible: github.com/0xbhoomi/agentmesh returns 404 with no redirect (HTML page, git ls-remote and the GitHub API all agree, 2026-09-02) — deleted or made private; our index last saw a push on 2026-04-12 (an April-2026 agents-hackathon row). https://github.com/0xbhoomi/agentmesh",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"gdalabs/autorepay-stellar": [
		{
			note: "No longer accessible: github.com/gdalabs/autorepay-stellar returns 404 with no redirect (HTML page, git ls-remote and the GitHub API all agree, 2026-09-02) — deleted or made private; our index last saw a push on 2026-04-11 (an April-2026 agents-hackathon row). https://github.com/gdalabs/autorepay-stellar",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"thesupermanish/superpage-stellar": [
		{
			note: "No longer accessible: github.com/TheSupermanish/superpage-stellar returns 404 with no redirect (HTML page, git ls-remote and the GitHub API all agree, 2026-09-02) — deleted or made private; our index last saw a push on 2026-04-13 (an April-2026 agents-hackathon row). https://github.com/TheSupermanish/superpage-stellar",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"yieldback-cash/amm": [
		{
			note: "No longer accessible: github.com/yieldback-cash/amm returns 404 with no redirect (HTML page, git ls-remote and the GitHub API all agree, 2026-09-02) — deleted or made private; our index last saw a push on 2026-04-10. Sibling yieldback-cash/* rows were triaged in batch 5. https://github.com/yieldback-cash/amm",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	// ── P5 batch 7 (2026-09-02): 34 repos / 35 notes — the first batch aimed at
	// the board's notes POOL itself (curated-index repos with repoScore ≥ 60
	// and no note; entities.json → repos.coverage.knowledgeNotes.missing),
	// not at "the next tier by repoScore". All 149 pool repos were worked:
	// 34 carry a durable fact (registry identities that link back — Soneso
	// PHP SDK, @airgap/stellar, Keybase, Noir, Rango; README-published
	// mainnet contract IDs confirmed on stellar.expert; hosted products; six
	// path moves resolved through the API; three repos that now return 404,
	// dated; one author-declared shutdown). The other 115 yielded nothing
	// durable and are named with reasons in the batch notes: 72 hackathon
	// demos with tags only, 16 stub READMEs, 10 README-claimed packages that
	// are unpublished or do not link back, 10 with no registry or tags, 5
	// testnet-only products, 2 not Stellar repos at all — roughly half the
	// un-noted pool is April-2026 x402/MPP and ZK-gaming hackathon output
	// and is un-curatable by design. No rename or archive date is claimed;
	// no pool repo carries GitHub's archive banner. Research used 9 API calls.
	"soneso/stellar-php-sdk": [
		{
			note: "Packagist package soneso/stellar-php-sdk — 1.13.0 (2026-08-24; 87 versions since 0.0.1 on 2021-12-29; repository → this repo; Apache-2.0), matching GitHub release 1.13.0 'v1.13.0 Protocol 28 (CAP-85) support and ADDRESS_V2 defaults' (2026-08-24). README install: `composer require soneso/stellar-php-sdk`, PHP 8.0+. https://packagist.org/packages/soneso/stellar-php-sdk",
			triggers: ["php sdk composer", "stellar php sdk install"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"airgap-it/airgap-coin-lib": [
		{
			note: "npm @airgap/stellar — 0.13.47 (2026-07-28; 46 versions since 2025-05-15; repository → this monorepo; MIT), the Stellar protocol module of AirGap's coinlib, published alongside @airgap/coinlib-core 0.13.47 (541 versions since 2020-12-17, same repo). 0.13.47 is also the newest of 82 git tags; no GitHub releases. https://www.npmjs.com/package/@airgap/stellar",
			triggers: ["airgap stellar npm", "airgap coinlib stellar module"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"airgap-it/airgap-vault": [
		{
			note: "Latest GitHub release v3.34.4 (2026-03-26; 71 tags). package.json at HEAD depends on @airgap/stellar 0.13.46 — the Stellar module published from sibling airgap-it/airgap-coin-lib. README 'Download': Google Play id it.airgap.vault and App Store id1417126841; the offline key-holder half of the pair with airgap-it/airgap-wallet. https://github.com/airgap-it/airgap-vault/releases/tag/v3.34.4",
			triggers: ["airgap vault release", "airgap vault stellar support"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"airgap-it/airgap-wallet": [
		{
			note: "Latest GitHub release v3.34.4 (2026-03-26; 97 tags), cut the same day as airgap-vault v3.34.4. package.json at HEAD depends on @airgap/stellar 0.13.46 (from sibling airgap-it/airgap-coin-lib). README 'Download': Google Play id it.airgap.wallet and App Store id1420996542; the online, public-data half of the AirGap pair. https://github.com/airgap-it/airgap-wallet/releases/tag/v3.34.4",
			triggers: ["airgap wallet release", "airgap wallet stellar"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"keybase/client": [
		{
			note: "Latest GitHub release v6.6.3 (2026-06-03; 190 tags). Docker Hub image keybaseio/client ('Official Keybase CLI client distribution'; last updated 2026-06-05; nightly-* tags; standard/slim/alpine/node/python variants defined in packaging/linux/docker/README.md, which names this repo for issues). Stellar wallet code lives under go/stellar (https://github.com/keybase/client/tree/master/go/stellar). https://hub.docker.com/r/keybaseio/client",
			triggers: ["keybase docker image", "keybase stellar wallet code"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"noir-lang/noir": [
		{
			note: "npm @noir-lang/noir_js 1.0.0-rc.1 (2026-09-09; 665 versions since 2023-09-15, nightlies included; repository → this repo, directory tooling/noir_js; MIT OR Apache-2.0) and @noir-lang/noir_wasm 1.0.0-rc.1 (755 versions; compiler/wasm) — the line moved from beta to its first release candidate. Latest non-nightly GitHub release v1.0.0-beta.26 (2026-07-30); a nightly-YYYY-MM-DD release is cut daily (nightly-2026-09-01); Cargo workspace version 1.0.0-beta.26. https://www.npmjs.com/package/@noir-lang/noir_js",
			triggers: ["noir latest version", "noir js npm"],
			source: "curated",
			asOf: "2026-09-13",
		},
		{
			note: "55 published GitHub security advisories (unique GHSA ids across the six advisory pages, read 2026-09-02); newest GHSA-v2q4-prvf-7h73 'Incorrect conditional mutable reference assignment in Brillig' (Moderate, 2026-06-09); a batch of eight on 2026-05-19 incl. High GHSA-j4p3-qjx6-rmvx 'Load Store Forwarding incorrectly eliminates stores'. https://github.com/noir-lang/noir/security/advisories",
			triggers: ["noir security advisories", "noir compiler vulnerabilities"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"rango-exchange/rango-sdk": [
		{
			note: "npm rango-sdk 0.5.0 and rango-sdk-basic 0.5.0 (both 2026-05-18; 109 / 110 versions since 2022-02-10 / 2022-05-08; repository → this monorepo; GPL-3.0), matching GitHub release rango-sdk-basic@0.5.0 (2026-05-18); releases are per-package tags (rango-sdk@, rango-sdk-basic@, rango-types@). README install: `npm install rango-sdk-basic --save` or `npm install rango-sdk --save`. https://www.npmjs.com/package/rango-sdk",
			triggers: ["rango sdk npm", "rango sdk install"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"rango-exchange/rango-client": [
		{
			note: "Monorepo of the Rango widget and wallets library (README: wallets/, queue-manager/, widget/); releases are per-package tags — widget-embedded@0.63.0 and provider-freighter@0.4.0 both on 2026-08-18 (3,386 tags). Stellar support is the wallets/provider-freighter package (package.json name @rango-dev/provider-freighter; Freighter wallet). https://github.com/rango-exchange/rango-client/releases/tag/provider-freighter%400.4.0",
			triggers: ["rango freighter provider", "rango widget release"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"akanimoh12/stellar-ipredict": [
		{
			note: "README 'Deployed Contracts (Stellar Mainnet)': Prediction Market CDGNPRYTFDXJLWZE4YDKZXW4IEN2RLPSE4N7VM5HJ7NLPL2QC45GIXI5, IPREDICT Token CAYL4TKNRMXAX5ZLQGFEZ6XOC2QHTCTN5QC2SB5BEEHLVO6SDU2UBLRH, Referral Registry CAGJVX6EXMCKKWDJCQFIEJ34CZTHZOGLWJM6KQTGDEXEO723CJZ5773H, Leaderboard CCWWOQSDSO3XXLCMA6A2HYRUFYVNUJZ2HPAMFQSPOB4JWYIBY2HWVTOB — all four exist on pubnet per stellar.expert (created 2026-06-02). Frontend https://ipredict-stellar.vercel.app (200 on 2026-09-02). https://github.com/Akanimoh12/Stellar-iPredict",
			triggers: ["ipredict contract address", "ipredict mainnet"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"sandragcarrillo/nexus4agents": [
		{
			note: "README 'Deployed Contracts — Mainnet': NexusRegistry CCR4Y2DLRJCQPGQJ2UNVZEOFANZEJC5NK6X6VGLP7PCVYTAQ54G4XSL2 and NexusPool CAWAYAYBUJUTTBTNLFOZ5S7AF3COO526WAZXJ6EHR45NJ6ZQ546K4B6O (both exist on pubnet per stellar.expert, created 2026-04-11), plus a testnet pair; one backend serves both networks (mainnet under a /mainnet/ prefix). Live app https://nexus4agents.vercel.app/ (200 on 2026-09-02). https://github.com/sandragcarrillo/nexus4agents",
			triggers: ["nexus registry contract", "nexus4agents mainnet"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"vinaystwt/xmpp": [
		{
			note: "npm @vinaystwt/xmpp-core 0.2.0 and @vinaystwt/xmpp-mcp 0.2.0 (both 2026-04-04; 3 versions each; repository → this repo; MIT) — the README's 'Public Packages' (`npm install @vinaystwt/xmpp-core @vinaystwt/xmpp-mcp`): gateway client / route planning, and an MCP server factory. README links its DoraHacks submission (Stellar Agents x402 + Stripe MPP hackathon). https://www.npmjs.com/package/@vinaystwt/xmpp-core",
			triggers: ["xmpp npm package", "xmpp core mcp install"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"martinvibes/sentinelshield": [
		{
			note: "npm sentinelshield-stellar — 0.1.0 (2026-04-11; single version; repository → this repo; MIT; bins sentinelshield and sentinelshield-stellar), the README's `npm install sentinelshield-stellar`. README banner: 'currently live on Stellar Testnet while we finish a security audit … Mainnet is coming'; 'Built for the Stellar agentic payments hackathon'. https://www.npmjs.com/package/sentinelshield-stellar",
			triggers: ["sentinelshield npm", "sentinelshield mainnet"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"daraijaola/runbox": [
		{
			note: "npm runbox-client — 1.0.0 (2026-04-11; single version; repository → this repo; MIT), the README's `npm install runbox-client` SDK; GitHub release v1.0.0 the same day (the only tag). README also documents an MCP server (`npm install -g runbox-mcp`) and a Soroban spending-cap contract on testnet. https://www.npmjs.com/package/runbox-client",
			triggers: ["runbox client npm", "runbox sdk install"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"fxjrin/defi-copilot": [
		{
			note: "npm defi-copilot-mcp — 1.3.1 (2026-04-12; 7 versions since 2026-04-11; repository → this repo; MIT; bin defi-copilot-mcp), the README's MCP server: `claude mcp add defi-copilot -- npx -y defi-copilot-mcp` (default STELLAR_NETWORK=testnet). The repo's package.json is named defi-copilot; the published npm name is defi-copilot-mcp. GitHub tags v1.0.0–v1.1.1. https://www.npmjs.com/package/defi-copilot-mcp",
			triggers: ["defi copilot mcp", "defi copilot npm"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"ggoldani/agent-passport": [
		{
			note: "npm @ggoldani/agent-passport-sdk 0.1.0 and @ggoldani/agent-passport-mcp 0.1.0 (both 2026-05-06; single versions; repository → this repo; MIT; MCP bin agent-passport-mcp) — the README's two install paths (app SDK vs MCP for Claude/Cursor); README examples target Soroban testnet RPC. https://www.npmjs.com/package/@ggoldani/agent-passport-sdk",
			triggers: ["agent passport sdk", "agentpassport mcp install"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"lumenwipe/lumenwipe": [
		{
			note: "README: non-custodial web app to close a Stellar account and recover locked XLM (API builds unsigned txs, the browser signs), hosted at https://lumenwipe.com with docs at https://docs.lumenwipe.com (both 200 on 2026-09-02); status line: 'the classic account wind-down runs today on testnet and mainnet. Soroban & DeFi protocol exits … are in active development'. Apache-2.0. https://github.com/LumenWipe/lumenwipe",
			triggers: ["lumenwipe close account", "lumenwipe hosted app"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"bytemaster333/account-demolisher": [
		{
			note: "README: 'Live at https://demolisher.app/' (200 on 2026-09-02) — closes Stellar accounts: classic entries, Soroban DeFi positions on Blend, Aquarius, Soroswap and FxDAO, balance conversion to XLM, CEX destinations via a mediator account, multisig signature collection, and a SEP-41 allowance viewer; security model at https://docs.demolisher.app/docs/developers/security/model (200). Node 22. https://github.com/bytemaster333/account-demolisher",
			triggers: ["account demolisher app", "demolisher close stellar account"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"carstenjacobsen/x402-testing-tool": [
		{
			note: "README: hosted at https://x402test.org (200 on 2026-09-02) — a Server Simulator (create a simulated x402-paywalled endpoint: method, path, network e.g. Stellar Testnet, asset, amount, receiving address) and a Client Simulator (send a request, get 402, build the payment, resubmit); wallet support 'currently only the Freighter wallet'. https://github.com/carstenjacobsen/x402-testing-tool",
			triggers: ["x402 testing tool", "x402test simulator"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"lobster-protocol/stellar-integrations": [
		{
			note: "README: React dashboard for the Soroban contracts of sibling https://github.com/Lobster-Protocol/Stellar ('our 2025 Build Award'; 200 on 2026-09-02), deployed on testnet; live at https://stellar-instit.lobster-protocol.com (200). Routing proofs run on mainnet through Stellar Broker (@stellar-broker/client), custody via DFNS, wallets via @creit-tech/stellar-wallets-kit v2 from JSR. https://github.com/Lobster-Protocol/stellar-integrations",
			triggers: ["lobster stellar dashboard", "lobster protocol build award"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"lum-agg/stellar-dex-agg": [
		{
			note: "GitHub releases 'LumAgg 0.2.1' (tag swap-api-v0.2.1, 2026-08-07) and 'LumAgg 0.2.0' (2026-08-02); four swap-api-v* tags; Apache-2.0. README: routes swaps across Soroswap, Aquarius (xy=k, stable, CLMM), Phoenix, Sushi V3 and Comet, with optional comparison against Classic DEX path payments; docs/scf-resubmission-budget.md is described as 'SCF #44 resubmission — $80k tranche deliverables'. https://github.com/Lum-Agg/stellar-dex-agg/releases",
			triggers: ["lumagg release", "lumagg dex sources"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"moonlight-protocol/local-dev": [
		{
			note: "README 'Repos' names the Moonlight stack as nine sibling repos under github.com/Moonlight-Protocol — provider-platform, provider-console, council-platform, council-console, pay-platform, moonlight-pay, network-dashboard-platform, network-dashboard, ui (five spot-checked, all 200 on 2026-09-02) — run together by up.sh on a local Stellar network via Docker. Single release stellar-cli-v0.1.0 (2026-03-10). https://github.com/Moonlight-Protocol/local-dev",
			triggers: ["moonlight repos", "moonlight local stack"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"kindfi-org/kindfi": [
		{
			note: "README monorepo map: apps/web (Next.js), apps/contract (Soroban, Rust), apps/indexer (SubQuery), services/supabase, services/ai, packages/lib, packages/drizzle; developer guide (architecture, code-style, OSS contribution guide) at https://kindfis-organization.gitbook.io/development (200 on 2026-09-02); escrows via Trustless Work. No releases or tags. https://github.com/kindfi-org/kindfi",
			triggers: ["kindfi developer guide", "kindfi monorepo layout"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"sentinelfi/sentinel_soroban_v3": [
		{
			note: "README: parametric flight-delay insurance on Soroban; documentation at https://sentinelfi.github.io/sentinel_soroban_v3/ and a testnet playground at https://sentinel-soroban-v3.vercel.app/ (both 200 on 2026-09-02); six contracts deployed on Stellar TESTNET with addresses in deployments/testnet.json (`make deploy-testnet`); governance jobs on Supabase. https://github.com/SentinelFi/sentinel_soroban_v3",
			triggers: [
				"sentinel flight insurance docs",
				"sentinelfi testnet playground",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"gladiusclub/gladius-backend": [
		{
			note: "README: Firebase / Cloud Firestore backend with custodial Stellar wallets (keys in Google Cloud KMS); its docs link https://gladius-2.gitbook.io/backend redirects to https://gladiusclub.gitbook.io/docs/backend (200 on 2026-09-02). package.json is named gladius-contracts and points at sibling https://github.com/GladiusClub/gladius-contracts (200). https://github.com/GladiusClub/gladius-backend",
			triggers: ["gladius backend docs", "gladius contracts repo"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"midasbal/lumina-scan": [
		{
			note: "README headline (read 2026-09-02): 'shutting this down. built it for a hackathon, no real future for it. maybe later' — the author's own status for this x402/MPP security-scanner submission (testnet USDC; demo at lumina-scan.vercel.app). No releases or tags. https://github.com/midasbal/lumina-scan",
			triggers: ["lumina scan status", "lumina scan shut down"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"ebubechi-ihediwa/verix": [
		{
			note: "MOVED: github.com/ebubechi-ihediwa/Verix redirects to github.com/verixhq/Verix (HTTP 301; GitHub API resolves the old path, 2026-09-02). Releases v0.1.0-foundation (2026-06-24) and v0.2.0-beta-ready (2026-06-26). README status table: 'Soroban Contracts (code) — Written, deployment pending', 'On-Chain Receipt Anchoring — Stub'; cites a 'Best Technical Integration' hackathon award. https://github.com/verixhq/Verix",
			triggers: ["verix repo moved", "verix soroban status"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"leomanza/near-shade-coordination": [
		{
			note: "RENAMED: github.com/leomanza/near-shade-coordination redirects to github.com/leomanza/delibera.xyz (HTTP 301; GitHub API resolves the old path, 2026-09-02). README: 'Delibera — Privacy-Preserving Multi-Agent DAO Coordination on NEAR'; the Stellar part is a 'Stellar Hacks: Agents hackathon entry' — x402 USDC payments on Stellar for a deliberation oracle settled on NEAR. https://github.com/leomanza/delibera.xyz",
			triggers: ["delibera repo renamed", "near shade coordination stellar"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"leojay-net/stellar-agent-flow": [
		{
			note: "MOVED: github.com/leojay-net/Stellar-Agent-Flow redirects to github.com/Pridex-Org/Stellar-Agent-Flow (HTTP 301; GitHub API resolves the old path, 2026-09-02). README: 'AgentFlow (Stellar Edition)' — a node-canvas orchestrator for Stellar agents (Next.js + React Flow); package.json name agentflow, private; no releases or tags. https://github.com/Pridex-Org/Stellar-Agent-Flow",
			triggers: ["agentflow stellar repo moved"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"t0k1dev/vendly": [
		{
			note: "MOVED: github.com/t0k1dev/vendly redirects to github.com/tokidev-ai/vendly (HTTP 301; GitHub API resolves the old path, 2026-09-02). The README at the new path is the unmodified create-next-app boilerplate; package.json name web 0.1.0, private; no releases or tags. https://github.com/tokidev-ai/vendly",
			triggers: ["vendly repo moved"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"treblelegacy/x402-agents-stellar-project": [
		{
			note: "MOVED: github.com/TrebleLegacy/x402-agents-stellar-project redirects to github.com/pwsaragossy/x402-agents-stellar-project (HTTP 301; GitHub API resolves the old path, 2026-09-02). README: 'x402 Agentic Payments — Stellar Hackathon Submission' with a 'Project Status & Mocked Data (Hackathon Transparency)' section listing what is simulated; no releases or tags. https://github.com/pwsaragossy/x402-agents-stellar-project",
			triggers: ["x402 agents stellar project moved"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"trustless-oss/trustless-oss": [
		{
			note: "MOVED here: github.com/ryzen-xp/Trustless-OSS redirects to github.com/Trustless-OSS/Trustless-OSS (HTTP 301; GitHub API resolves the old path, 2026-09-02; repo created 2026-05-10) — the README's CI badges and clone URL still name ryzen-xp/Trustless-OSS. README: on-chain bounties for OSS contributors — fund a Stellar USDC escrow, attach rewards to issues, pay out when the linked PR merges. https://github.com/Trustless-OSS/Trustless-OSS",
			triggers: ["trustless oss repo moved", "trustless oss bounties"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"nsuccess/agentmarket": [
		{
			note: "Repo no longer accessible: https://github.com/Nsuccess/AgentMarket returns HTTP 404 (deleted or made private; the GitHub API answers 404 as well) as of 2026-09-02; census metadata is the surviving record.",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"big14way/stellar-agent-gateway": [
		{
			note: "Repo no longer accessible: https://github.com/big14way/stellar-agent-gateway returns HTTP 404 (deleted or made private; the GitHub API answers 404 as well) as of 2026-09-02; census metadata is the surviving record.",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"envexx/lument-trust": [
		{
			note: "Repo no longer accessible: https://github.com/envexx/Lument-Trust returns HTTP 404 (deleted or made private; the GitHub API answers 404 as well) as of 2026-09-02; census metadata is the surviving record.",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	// ── P5 batch 6 (2026-09-02): 36 repos / 39 notes — the tier below batch 5.
	// 877 unseen repos were screened, ~70 had any signal beyond metadata, and
	// these are the ones with a durable, registry- or banner-backed fact:
	// Albedo, stellar-scaffold, Loam (7 crates, frontend now redirects to
	// stellar-scaffold/ui), lightsail contract-bindings + strledger,
	// OpenZeppelin monitor / keystore / adapters / upgrader plugin, the quorum
	// analyzer, eight ARCHIVED repos dated only by GitHub's banner with old
	// stellar/ paths resolved by redirect, and a handful of live products
	// with full mainnet contract IDs (stellar-8004, ohloss). Kept out:
	// pendulum-chain/vortex (Stellar mentioned once in an SDK README), and
	// two "X is not on npm / host answered 522 today" clauses — negatives
	// and transients age badly. ~45 further candidates yielded nothing
	// durable and are named in the batch notes (several are not Stellar
	// projects at all: StellarStation satellites, an EVM indexer, Pi
	// Network). Research used 0 GitHub API calls.
	"stellar-expert/albedo": [
		{
			note: "npm package @albedo-link/intent — 0.13.0 (2025-06-13; 17 versions since 2020-07-14; repository field → stellar-expert/albedo; MIT), built from this monorepo's intent/ directory; the README (README.MD, uppercase, on default branch master) installs it with `npm i -S @albedo-link/intent`. No GitHub releases. https://www.npmjs.com/package/@albedo-link/intent",
			triggers: ["albedo npm package", "albedo intent library"],
			source: "curated",
			asOf: "2026-09-02",
		},
		{
			note: "README: the frontend/ directory is the albedo.link site and browser-extension UI; hosted at https://albedo.link (200 on 2026-09-02) with a demo playground at https://albedo.link/demo and a no-code payment-request generator at https://albedo.link/playground#payment-request; SEP-0007 'web+stellar' links are handled automatically. https://github.com/stellar-expert/albedo",
			triggers: ["albedo hosted url", "albedo demo playground"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellar-scaffold/cli": [
		{
			note: "crates.io stellar-scaffold-cli — 0.0.27 (2026-08-13; 30 versions since 2025-05-12; repository → this repo's crates/stellar-scaffold-cli) plus stellar-build 0.0.7 (2026-06-30; 8 versions; same repo). README install: `cargo install --locked stellar-scaffold-cli`. Latest GitHub release stellar-scaffold-cli-v0.0.27 (2026-08-13); workspace pins soroban-sdk 27.0.0-rc.1 and stellar-xdr =27.0.0. https://crates.io/crates/stellar-scaffold-cli",
			triggers: ["scaffold stellar install", "stellar scaffold crate"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"loambuild/loam": [
		{
			note: "crates.io: loam-cli 0.14.4, loam-sdk 0.6.16, loam-soroban-sdk 0.6.16, loam-sdk-macro 0.8.6, loam-subcontract-core 0.7.9, loam-subcontract-ft 0.7.2 (all last published 2025-01-22) and loam-build 0.7.3 (2024-08-05); each entry links back to this repo's crates/ tree. Latest GitHub release loam-subcontract-ft-v0.7.2 (2025-01-22); workspace pins soroban-sdk 22.0.0-rc.3; not archived. https://crates.io/crates/loam-cli",
			triggers: ["loam sdk crates", "loam cli crate"],
			source: "curated",
			asOf: "2026-09-02",
		},
		{
			note: "README names a third component, 'Loam Frontend' at github.com/loambuild/frontend — that path now 301-redirects to github.com/stellar-scaffold/ui (checked 2026-09-02), the Scaffold Stellar UI repo; the README itself never mentions Scaffold Stellar and no rename date is stated anywhere we read. https://github.com/loambuild/loam",
			triggers: ["loam frontend repo", "loam scaffold stellar"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"lightsail-network/stellar-contract-bindings": [
		{
			note: "PyPI package stellar-contract-bindings — 0.6.0b0 (2026-09-02; all releases betas; project URLs point here). README: `pip install stellar-contract-bindings`; generates Soroban bindings for Python, Java, Flutter/Dart, PHP, Swift/iOS and Kotlin Multiplatform (TypeScript/Rust are left to stellar-cli); hosted generator https://stellar-contract-bindings.fly.dev/ (200 on 2026-09-02). https://pypi.org/project/stellar-contract-bindings/",
			triggers: [
				"contract bindings python",
				"soroban bindings java flutter",
				"generate bindings kotlin swift",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"lightsail-network/strledger": [
		{
			note: "PyPI package strledger — 0.10.1 (2025-09-01; 19 releases; homepage/repository fields point here), matching GitHub release v0.10.1 (2025-09-01). README: `pip install -U strledger`; Python bindings + CLI for the Ledger hardware-wallet Stellar app (get-address, app-info, signing), pairing with the StellarCN py-stellar-base SDK. https://pypi.org/project/strledger/",
			triggers: ["ledger stellar python", "strledger install"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"openzeppelin/openzeppelin-monitor": [
		{
			note: "Docker image openzeppelin/openzeppelin-monitor (Docker Hub, registered 2025-04-04): tags v1.6.0 / 1.6.0 / latest pushed 2026-07-16, matching GitHub release v1.6.0 (2026-07-15) and Cargo.toml 1.6.0; not on crates.io. README 'Supported Networks': EVM-compatible, Stellar, Solana, Midnight (partial); depends on stellar-xdr 23.0.0. Sibling of openzeppelin-relayer. https://hub.docker.com/r/openzeppelin/openzeppelin-monitor",
			triggers: [
				"openzeppelin monitor docker",
				"openzeppelin monitor stellar support",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"openzeppelin/oz-keystore": [
		{
			note: "crates.io oz-keystore — 0.1.4 (2025-05-01; 5 versions since 2025-01-20; repository → this repo). README: unified keystore library — encrypted-JSON local keystore and HashiCorp Vault backends — for EVM, Stellar and Solana keys, with examples local-keystore-to-stellar-wallet and hashicorp-vault-to-stellar-wallet. No GitHub releases. https://crates.io/crates/oz-keystore",
			triggers: ["openzeppelin keystore crate", "oz keystore stellar"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"openzeppelin/openzeppelin-adapters": [
		{
			note: "npm @openzeppelin/adapter-stellar — 6.0.0 (2026-09-09; 13 versions since 2026-03-24 — two majors in three weeks, 4.0.1 → 6.0.0; repository → this monorepo, directory packages/adapter-stellar; AGPL-3.0). README: full Soroban adapter for Stellar public/test networks, wallet integration via Stellar Wallets Kit, SAC detection. Releases are per-package tags, e.g. @openzeppelin/adapter-stellar@6.0.0. https://www.npmjs.com/package/@openzeppelin/adapter-stellar",
			triggers: ["openzeppelin adapter stellar", "openzeppelin adapters npm"],
			source: "curated",
			asOf: "2026-09-13",
		},
	],
	"openzeppelin/stellar-upgrader-cli": [
		{
			note: "Stellar CLI plugin installed from source only — README: git clone, `cargo install --path .`, then binary `stellar-upgrader` shows in `stellar plugins --list`; Cargo.toml (stellar-upgrader 0.1.0) still has the placeholder repository 'github.com/your-username/stellar-upgrader'. The crates.io crate stellar-upgrader (1.1.4, publisher interoplabs-ci, no repository field) is a different project. https://github.com/OpenZeppelin/stellar-upgrader-cli",
			triggers: [
				"stellar upgrader plugin install",
				"openzeppelin upgrader cli",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellar/stellar-quorum-analyzer": [
		{
			note: "SAT-solver library for FBAS quorum-intersection checks (SCP); README: 'Primary: Integrated with stellar-core'. stellar-core consumes it as a git dependency — src/rust/Cargo.toml has [dependencies.stellar-quorum-analyzer] version 0.1.0, git = this repo, rev 502a354eb9a31cf86098be84aa1b3081767fa3c7 (read 2026-09-02); not on crates.io, no releases; pins stellar-xdr =27.0.0. https://github.com/stellar/stellar-quorum-analyzer",
			triggers: ["quorum analyzer stellar core", "quorum intersection library"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellar/stellar-turrets": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Jan 8, 2026' (read 2026-09-02). README: Stellar Turrets reference implementation (Cloudflare Workers + AWS Lambda); its API-docs link https://tyvdh.github.io/stellar-turrets/ returns 404. The original tyvdh/stellar-turrets path now redirects to kalepail/stellar-turrets, itself archived ('Jan 15, 2022'). https://github.com/stellar/stellar-turrets",
			triggers: [
				"stellar turrets archived",
				"turrets reference implementation",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellar-deprecated/transfer-server-validator": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Dec 15, 2021' (read 2026-09-02); github.com/stellar/transfer-server-validator redirects here. README: Jest suite for SEP-6/24/31 transfer servers at https://anchor-validator.stellar.org — now a 301 to https://anchor-tests.stellar.org/ (the stellar/stellar-anchor-tests UI; no HTTP response on 2026-09-02). https://github.com/stellar-deprecated/transfer-server-validator",
			triggers: ["transfer server validator", "anchor validator deprecated"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellar-deprecated/sep24-demo-client": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Nov 7, 2023' (read 2026-09-02); github.com/stellar/sep24-demo-client redirects here. README: 'Stellar SEP24 Demo Client has been deprecated' — functionality integrated into https://github.com/stellar/stellar-demo-wallet, use https://demo-wallet.stellar.org/ (200 on 2026-09-02). package.json name is sep6-demo-client. https://github.com/stellar-deprecated/sep24-demo-client",
			triggers: ["sep24 demo client", "sep-24 demo deprecated"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellar-deprecated/sep31-demo-client": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Nov 7, 2023' (read 2026-09-02); github.com/stellar/sep31-demo-client redirects here. README: 'Stellar SEP31 Demo Client is now Deprecated' — integrated into https://github.com/stellar/stellar-demo-wallet, use https://demo-wallet.stellar.org/ (200 on 2026-09-02). package.json name is sep6-demo-client, the same as the SEP-24 client's. https://github.com/stellar-deprecated/sep31-demo-client",
			triggers: ["sep31 demo client", "sep-31 demo deprecated"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellar-deprecated/auth-required-tokens-manager": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Jul 1, 2024' (read 2026-09-02); github.com/stellar/auth-required-tokens-manager redirects here. README: web app to manage TESTNET auth-required tokens and generate SEP-7 QR codes for payment / path-payment operations; package.json name is stellar-react-starter. https://github.com/stellar-deprecated/auth-required-tokens-manager",
			triggers: ["auth required tokens manager"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellar-deprecated/network-explorer": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Nov 16, 2019' (read 2026-09-02); github.com/stellar/network-explorer redirects here. README line 1: 'This tool is no longer maintained. Take a look at the laboratory instead' (github.com/stellar/laboratory, live). https://github.com/stellar-deprecated/network-explorer",
			triggers: ["stellar network explorer archived"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellar/core-node-admin-panel": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Jun 6, 2024' (read 2026-09-02). README 'Proposal': a UI admin toolset for validator operators to judge node health and risks, run as a proxy server + front-end against a stellar-core instance (`npm run dev`); package.json name stellar-node-admin, private. https://github.com/stellar/core-node-admin-panel",
			triggers: ["core node admin panel"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"lobstrco/stellar-core-parallel-catchup-py": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Jun 22, 2026' (read 2026-09-02). readme.md (lowercase filename): 'Fast Stellar Core Catch Up' — Python scripts that run a full validator's history catch-up as parallel ledger-range jobs ('less than a day' on a powerful server vs. 'more than a month' serially); CircleCI badge. https://github.com/Lobstrco/stellar-core-parallel-catchup-py",
			triggers: ["parallel catchup stellar core", "lobstr catchup script"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"justmert/soropass": [
		{
			note: "npm @soropass/core — 0.3.1 (2026-09-01; 6 versions since 2026-08-10) and @soropass/ui 0.3.0 (2026-09-01; 1 version), both with repository → justmert/soropass; peer dependency @stellar/stellar-sdk. All contract addresses in the README are testnet. https://www.npmjs.com/package/@soropass/core",
			triggers: ["soropass npm", "soropass passkey package"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"sergical/blockchain-wallet-validator": [
		{
			note: "npm blockchain-wallet-validator — 1.2.1 (2025-12-23; 7 versions since 2024-12-17; repository → sergical/blockchain-wallet-validator), matching GitHub release v1.2.1. README lists Stellar among validated networks (Base32 G… public keys, e.g. GBQMXVTR5HQNRGXPR4ZPBOZR7VQXOQMEQMZWIVLIW2MYBXC2HQWZZ4VJ) and says releases go out via npm trusted publishers (GitHub Actions OIDC). https://www.npmjs.com/package/blockchain-wallet-validator",
			triggers: [
				"validate stellar address library",
				"wallet address validator npm",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"raceeyxo/use-stellar": [
		{
			note: "npm use-stellar — 0.1.5 (2026-08-24; 4 versions since 2026-06-03). The registry's repository field names github.com/israelolrunfemi/use-stellar, which 301-redirects to RaceeyXo/use-stellar (checked 2026-09-02). README: React hooks for wallet connection, balances and tx submission; @stellar/stellar-sdk is bundled as a regular dependency, not a peer dependency. https://www.npmjs.com/package/use-stellar",
			triggers: ["use-stellar react hooks", "stellar react hooks package"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"defarm-repo/defarm-sdk-ts": [
		{
			note: "npm @defarm/sdk — 0.2.1 (2026-08-22; 9 versions since 2026-02-22; repository → defarm-repo/defarm-sdk-ts; ships a `defarm` CLI bin; MIT). README: client-side sealing ('blind envelopes') for DeFarm livestock/item records, each DFID 'anchored on a public network (Stellar) + IPFS'; the pure-crypto core (src/core) is the auditable surface. No GitHub releases. https://www.npmjs.com/package/@defarm/sdk",
			triggers: ["defarm sdk npm"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"trionlabs/stellar-8004": [
		{
			note: "README 'Contracts' table, MAINNET: Identity Registry CBGPDCJIHQ32G42BE7F2CIT3YW6XRN5ED6GQJHCRZSNAYH6TGMCL6X35, Reputation Registry CBOIAIMMWAXI57OATLX6BWVDQLCC4YU55HV6MZXFRP6CBSGAMXSTEPPA, Validation Registry CBT6WWEVEPT2UFGFGVJJ7ELYGLQAGRYSVGDTGMCJTRWXOH27MWUO7UJG ('single source of truth': webapp/packages/sdk/src/core/config.ts). Explorer https://stellar8004.com (200 on 2026-09-02). https://github.com/trionlabs/stellar-8004",
			triggers: [
				"8004 mainnet contract addresses",
				"stellar 8004 identity registry",
				"agent registry stellar mainnet",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
		{
			note: "npm @trionlabs/stellar8004 — 0.0.11 (2026-04-13; 2 versions; repository → trionlabs/stellar-8004): the TypeScript SDK for the three 8004 registries (identity, reputation, validation). No GitHub releases; workspace pins soroban-sdk 25. https://www.npmjs.com/package/@trionlabs/stellar8004",
			triggers: ["stellar8004 npm", "8004 sdk package"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"kalepail/ohloss": [
		{
			note: "README 'Mainnet Deployment' — 'Status: Live on mainnet'; current contract CBOM2KGQDK4TMTIULH2UJWNLWEIXG47IM2RND4UDGM7KK5EQUQDFOVAY (CHITSHEET.md marks it NEW; the OLD contract was CAHPLVEDW2HWY2EOTCTECDK5ZRHAB5FLER3WGHQ5OPFMBMMFJSTBRJZU). Workspace pins soroban-sdk 23.1.0; no releases or tags. https://github.com/kalepail/ohloss",
			triggers: ["ohloss contract address", "ohloss mainnet"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"xoxno/rs-lending-xlm": [
		{
			note: "README: over-collateralized money market on Soroban (central pool, per-market accounting, spokes as risk regimes, timelocked governance), licensed PolyForm Noncommercial 1.0.0 — 'Commercial use requires a written agreement with XOXNO'. Workspace pins soroban-sdk =27.0.6; no releases or tags; the README lists no deployed addresses ('resolve deployed addresses from the active network configuration'). https://github.com/XOXNO/rs-lending-xlm",
			triggers: ["xoxno lending license", "xoxno lending stellar"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"kalepail/superpeach": [
		{
			note: "README: passkey-powered multi-signer Stellar smart-wallet example — two sites in one repo (a 'Super Signer' site and an example dapp); demos hosted at https://superpeach.xyz/ plus https://minipeach-a.pages.dev/ and minipeach-b.pages.dev (superpeach.xyz and minipeach-a returned 200 on 2026-09-02). package.json is private; no releases. https://github.com/kalepail/superpeach",
			triggers: ["superpeach demo", "super peach passkey wallet"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"jamesbachini/soroban-playground": [
		{
			note: "README: online IDE for Soroban contracts, 'Available at https://soropg.com'; builds and tests run in a sandboxed Docker container behind a Rust app; ships soroban-sdk, sep-41-token and the OpenZeppelin stellar-* crates by default. Cargo package Soroban-Playground 0.8.1; no releases. https://github.com/jamesbachini/Soroban-Playground",
			triggers: ["soroban playground online ide", "soroban playground hosted"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"brozorec/smart-account-sign": [
		{
			note: "README: two Stellar CLI plugins for OpenZeppelin smart accounts — stellar-smart-account and stellar-passkey — installed from source (`cargo install --locked --path stellar-smart-account` / `--path stellar-passkey`, then `stellar plugins --list`); neither crate is on crates.io (2026-09-02). Stated limitation: Delegated signers are not supported (External signers only). https://github.com/brozorec/smart-account-sign",
			triggers: ["smart account cli plugin", "stellar passkey plugin install"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"script3/fee-vault": [
		{
			note: "Blend fee-vault contract. Latest GitHub release v1.0.0_fee-vault_cli22.0.1 (2025-05-06; 3 tags on the page); Cargo `publish = false` (not on crates.io); pins soroban-sdk 22.0.7. A separate repo script3/fee-vault-v2 exists (ERC4626-like share vault with optional signer gating and take / capped / fixed-rate configs; no releases as of 2026-09-02). https://github.com/script3/fee-vault/releases",
			triggers: ["blend fee vault release", "fee vault v2 repo"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"script3/fee-vault-v2": [
		{
			note: "README: Blend fee vault as an ERC4626-like share vault holding a pool's b_tokens, optional `signer` gating on entry, three admin configurations (take rate, capped rate, fixed rate). Cargo fee-vault-v2 1.0.0 `publish = false`, soroban-sdk 22.0.8; NO releases or tags as of 2026-09-02 (the V1 repo script3/fee-vault has v1.0.0_fee-vault_cli22.0.1, 2025-05-06). https://github.com/script3/fee-vault-v2",
			triggers: ["fee vault v2 configurations", "blend fee vault signer"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"soroswap/spacewalk-implementation": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Jul 24, 2026' (read 2026-09-02). README (114 bytes): 'Implementation of the Skywalk bridge between Pendulum (Polkadot) and Stellar / Soroban' (sic — the repo name says Spacewalk); no manifest, releases or tags. https://github.com/soroswap/spacewalk-implementation",
			triggers: ["soroswap spacewalk archived"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"soroswap/phoenix-zephyr-indexer": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Jul 24, 2026' (read 2026-09-02). No README; Cargo package zephyr-phoenix 0.1.0 pinning soroban-sdk 20.2.0 — a Zephyr indexer program for Phoenix; no releases or tags. https://github.com/soroswap/phoenix-zephyr-indexer",
			triggers: ["phoenix zephyr indexer archived"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"bp-ventures/sep30-docs": [
		{
			note: "README: documentation for BP Ventures' SEP-30 (recovery signer) implementation, with a hosted playground at https://sep30-demo.bpventures.us/ and API docs at https://sep30-demo.bpventures.us/docs#/ (both 200 on 2026-09-02); links the SEP-30 spec and SDF's recoverysigner blog post. Docs-only repo: no code, releases or packages. https://github.com/bp-ventures/sep30-docs",
			triggers: ["bp ventures sep-30 playground", "sep30 recovery signer demo"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"yripper/stellarpay": [
		{
			note: "npm @stellarpay-sdk/core, @stellarpay-sdk/client and @stellarpay-sdk/mcp — all 0.1.0 (2026-08-04; a single version each; repository → yripper/stellarpay). README: built for the Stellar hackathon (Agentic Payments track) and 'everything below is testnet' — one middleware for x402 + MPP charge/channel paywalls. https://www.npmjs.com/package/@stellarpay-sdk/core",
			triggers: ["stellarpay sdk npm"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"berkingurcan/stellar-agent-search": [
		{
			note: "npm stellar-agent-search — 0.1.0 (2026-07-30; 2 versions; repository → berkingurcan/stellar-agent-search; bin stellar-agent-search). README: read-only MCP server + CLI over the trionlabs/stellar-8004 registry contracts on mainnet, pinning the @trionlabs/stellar8004 SDK for signed writes; 'adds no contracts'. https://www.npmjs.com/package/stellar-agent-search",
			triggers: ["stellar agent search mcp", "8004 agent discovery mcp"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"zenith-protocols/zenith-sdk": [
		{
			note: "npm @zenith-protocols/zenith-sdk — 0.0.1 (2025-10-21; the only published version; repository → zenith-protocols/zenith-sdk), while package.json at HEAD says 2.0.0 (unpublished as of 2026-09-02). README: `npm install @zenith-protocols/zenith-sdk`; testnet + mainnet network constants for the Zenith vault/trading contracts. https://www.npmjs.com/package/@zenith-protocols/zenith-sdk",
			triggers: ["zenith sdk npm"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	// ── P5 batch 5 (2026-09-01): 46 repos / 49 notes, next tier by repoScore —
	// DeFi/infra contract suites (OpenZeppelin stellar-contracts + relayer,
	// Soroswap, Phoenix, Blend V2, Rozo, DOB, SEP-41, Perun), SDKs and
	// registries (Blend SDK, Blux, hd-wallet, Creit-Tech JSR packages, HOT,
	// Allbridge, Lightecho, StellarGuard, FxDAO, Mercury), eight ARCHIVED
	// repos dated only by GitHub's own banner, three renames resolved by a
	// redirecting fetch (stellar-expert, bluxcc/react, stellar-deprecated/
	// horizon), and SDF misc (dev-skill, ledger-data-indexer, account-tools,
	// x402-stellar, sep45-reference). Every fact verified live on the asOf
	// date; no rename or archive DATE is claimed anywhere. Kept out on
	// purpose: axelarnetwork/axelar-amplifier-stellar (crates.io carries no
	// repository field for its crates — indirect link, same bar as batch 4).
	// ~60 further candidates yielded nothing durable and are named in the
	// batch notes — headline: Templar-Protocol/contracts has no Stellar or
	// Soroban code at all.
	"openzeppelin/stellar-contracts": [
		{
			note: "Published as seven crates on crates.io, all at 0.7.2 (2026-06-09), each registry entry linking back to this repo: stellar-tokens, stellar-access, stellar-accounts, stellar-contract-utils, stellar-fee-abstraction, stellar-governance, stellar-macros (README 'Published Crates'). Latest stable tag v0.7.2; v0.8.0-rc.3 (2026-06-16) is a prerelease. Docs: https://docs.openzeppelin.com/stellar-contracts",
			triggers: [
				"openzeppelin stellar crates",
				"openzeppelin soroban crate names",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: 'README opens with \'[!Warning] This is experimental software and is provided on an "as is" and "as available" basis\'; the workspace at HEAD pins soroban-sdk 27.0.2 (2026-09-01) and ships audit reports under audits/. https://github.com/OpenZeppelin/stellar-contracts',
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"openzeppelin/openzeppelin-relayer": [
		{
			note: "Docker image openzeppelin/openzeppelin-relayer (Docker Hub, registered 2025-04-04): tags v1.8.0 / 1.8.0 / latest pushed 2026-08-19, matching GitHub release v1.8.0 (2026-08-19) and Cargo.toml 1.8.0; not on crates.io. README 'Supported networks': Solana, EVM, Stellar, with an examples/stellar-gcp-kms-signer sample; AGPL-3.0. https://hub.docker.com/r/openzeppelin/openzeppelin-relayer",
			triggers: [
				"openzeppelin relayer docker",
				"openzeppelin relayer stellar support",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"soroswap/core": [
		{
			note: "README: Soroswap is live on Mainnet — SoroswapFactory CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2, SoroswapRouter CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH, deployer GAYPUMZFDKUEUJ4LPTHVXVG2GD5B6AV5GGLYDMSZXCSI4QILQKSY25JI; the OtterSec audit is in-repo at audits/2024-02-22_soroswap_ottersec_audit.pdf (fetches 200). https://github.com/soroswap/core",
			triggers: [
				"soroswap router address",
				"soroswap factory address",
				"soroswap audit report",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "The npm packages are built from sibling repos, not this one: @soroswap/sdk 0.5.0 (2026-08-11; repository soroswap/sdk) and soroswap-router-sdk 1.4.6 (2024-10-08), whose repository field names soroswap/soroswap-router-sdk — a path that returns 404 on GitHub as of 2026-09-01. Docs: https://docs.soroswap.finance/",
			triggers: ["soroswap sdk npm", "soroswap router sdk package"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"phoenix-protocol-group/phoenix-contracts": [
		{
			note: "Latest release v2.0.0 (2025-06-07; tags run v0.8.0 → v1.0.0 → v1.1.0 → v2.0.0). The workspace at HEAD is version 2.0.0 and pins soroban-sdk 22.0.7 (2026-09-01); contracts live under contracts/*, shared crates under packages/*. No GitHub security advisories published. https://github.com/Phoenix-Protocol-Group/phoenix-contracts/releases",
			triggers: ["phoenix dex contracts release", "phoenix contracts version"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"blend-capital/blend-contracts-v2": [
		{
			note: "Blend V2 (pool, backstop, pool-factory). Release v2.0.0 with per-contract tags v2.0.0_pool_cli22.0.1, v2.0.0_backstop_cli22.0.1, v2.0.0_pool-factory_cli22.0.1 (newest 2025-04-14). Workspace pins soroban-sdk 22.0.7, blend-contract-sdk 1.22.0, sep-40-oracle 1.2.0 and sep-41-token 1.2.0 (2026-09-01). https://github.com/blend-capital/blend-contracts-v2/releases",
			triggers: ["blend v2 contracts release", "blend v2 soroban sdk version"],
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Audit PDFs ship in-repo under audits/ (README 'Audits'): 'Code4rena x Blend V2 audit report', 'Script3 - Certora - Blend v2 - Security Assessment Draft v3 Report - April 2025' and 'Script3 - Certora - Blend v2 - Formal Verification Draft v2 Report - June 2025'. https://github.com/blend-capital/blend-contracts-v2/tree/main/audits",
			triggers: ["blend v2 audit", "blend v2 certora"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"blend-capital/blend-sdk-js": [
		{
			note: "npm name is @blend-capital/blend-sdk — 3.3.0 (2026-06-19; 52 versions since 2023-10-24; repository field points here; GitHub release v3.3.0 the same day). README install: npm install @blend-capital/blend-sdk. https://www.npmjs.com/package/@blend-capital/blend-sdk",
			triggers: ["blend sdk npm", "blend javascript sdk package"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar-expert/stellar-expert-explorer": [
		{
			note: "Current home of the explorer source: github.com/orbitlens/stellar-expert-explorer returns HTTP 301 to this path (2026-09-01). Hosted at https://stellar.expert with a public OpenAPI description at https://stellar.expert/openapi (README 'Links'); no GitHub releases or tags; root package ui.stellar.expert is private. https://github.com/stellar-expert/stellar-expert-explorer",
			triggers: [
				"stellar expert source code",
				"stellar expert openapi",
				"orbitlens stellar expert",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"bluxcc/react": [
		{
			note: "npm @bluxcc/react — published since 2025-02-03. Its npm repository field still names github.com/bluxcc/blux, which returns HTTP 301 to bluxcc/react (2026-09-01) — this repo is the current home of that path. README install: npm i @bluxcc/react; docs https://docs.blux.cc/. Read the current version from npm; this package ships several releases a week. https://www.npmjs.com/package/@bluxcc/react",
			triggers: ["blux react package", "bluxcc blux repo moved"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"chatch/stellar-hd-wallet": [
		{
			note: "npm stellar-hd-wallet — 1.0.2 (2025-04-27; 13 versions since 2017-12-25; GitHub release v1.0.2 same day; repository field points here). SEP-0005 key derivation for Stellar; README says every SEP-0005 test case is exercised in its tests. A Deno/browser port that drops the Node-only deps is @creit-tech/stellar-sep-0005 on JSR. https://www.npmjs.com/package/stellar-hd-wallet",
			triggers: ["stellar hd wallet npm", "mnemonic key derivation javascript"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"creit-tech/stellar-sep-0005-js": [
		{
			note: "Published on JSR, not npm: @creit-tech/stellar-sep-0005 — 0.2.0 (2025-08-17; JSR links the package to this repo). README: a SEP-0005 key-derivation port of chatch/stellar-hd-wallet, written because that library uses Node-only features; install `npx jsr add @creit-tech/stellar-sep-0005` or `deno add jsr:@creit-tech/stellar-sep-0005`. https://jsr.io/@creit-tech/stellar-sep-0005",
			triggers: ["sep 0005 deno", "creit sep 0005 jsr"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"creit-tech/stellar-sep-0040-js": [
		{
			note: "Published on JSR, not npm: @creit-tech/stellar-sep-0040 — 0.1.0 (2025-11-05; JSR links the package to this repo). README: a small client for calling SEP-0040 oracle methods; install `npx jsr add @creit-tech/stellar-sep-0040` or `deno add jsr:@creit-tech/stellar-sep-0040`. https://jsr.io/@creit-tech/stellar-sep-0040",
			triggers: ["sep 0040 oracle client javascript", "sep 40 jsr package"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/js-soroban-client": [
		{
			note: "ARCHIVED — GitHub's banner reads 'archived by the owner on Mar 11, 2025' (read 2026-09-01). README 'Deprecation Notice': deprecated in favor of stellar/js-stellar-sdk, migration guide at https://gist.github.com/Shaptic/5ce4f16d9cce7118f391fbde398c2f30; npm soroban-client is deprecated and frozen at 1.0.1 (2024-01-03; 33 versions since 2022-10-11). https://github.com/stellar/js-soroban-client",
			triggers: [
				"soroban client deprecated",
				"migrate from soroban-client",
				"soroban client archived",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/django-polaris": [
		{
			note: "ARCHIVED — GitHub's banner reads 'archived by the owner on May 23, 2025' (read 2026-09-01). PyPI django-polaris is frozen at 2.6.0 (2025-02-13; 75 releases; GitHub release v2.6.0 same day); README.rst: SDF's extendable Django app for SEP implementations; docs still served at https://django-polaris.readthedocs.io/en/stable. https://pypi.org/project/django-polaris/",
			triggers: [
				"django polaris archived",
				"polaris still maintained",
				"django polaris pypi",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar-deprecated/horizon": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Jan 22, 2020'; github.com/stellar/horizon returns HTTP 301 here (2026-09-01). README: 'This repository has moved to the go monorepo' (stellar/go/tree/master/services/horizon) — and stellar/go is itself archived, with Horizon now developed in stellar/stellar-horizon. https://github.com/stellar-deprecated/horizon",
			triggers: ["old horizon repo", "stellar horizon repository moved"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar-deprecated/horizon-importer": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Nov 16, 2019' (read 2026-09-01). README: 'This project is not in active development anymore. Please use https://github.com/stellar/horizon' — a path that now redirects to stellar-deprecated/horizon (itself archived; Horizon lives in stellar/stellar-horizon). https://github.com/stellar-deprecated/horizon-importer",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar-deprecated/bridge-server": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Sep 12, 2019' (read 2026-09-01). README describes two Go apps: bridge (builds, submits and monitors Stellar transactions) and compliance (helper for the pre-SEP compliance protocol); the README names no successor. https://github.com/stellar-deprecated/bridge-server",
			triggers: ["bridge server archived", "stellar bridge server compliance"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/sep-smart-wallet": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Jan 30, 2026' (read 2026-09-01). README: a passkey-based smart wallet exercising SEP-10c (alpha) and SEP-24, under a '[!WARNING] … for demonstration purposes only and has not been audited. Do not use it to store, protect, or secure assets' notice. https://github.com/stellar/sep-smart-wallet",
			triggers: ["sep-10c smart wallet demo", "sep smart wallet archived"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/amm-reference-ui": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on May 1, 2025' (read 2026-09-01). README: a reference implementation for setting up a UI for AMMs, explicitly 'not a recommendation or prescribed way to set up a UI'. https://github.com/stellar/amm-reference-ui",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/recoverysigner-demo-client": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Mar 26, 2025' (read 2026-09-01). README: a limited-feature demo client for a SEP-30 recoverysigner server (registration and recovery of an account), plain HTML/JS with no build step. https://github.com/stellar/recoverysigner-demo-client",
			triggers: ["sep-30 demo client", "recoverysigner demo"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-dev-skill": [
		{
			note: "SDF's Agent-Skills package; latest release v1.2.0 (2026-06-29, the only tag). README 'Installing': Claude Code `/plugin marketplace add stellar/stellar-dev-skill` + `/plugin install stellar-dev@stellar-dev`; Codex via git clone into ~/.codex/skills; or `npx skills add https://github.com/stellar/stellar-dev-skill`. README says it was AI-generated, under manual review. https://skills.stellar.org/",
			triggers: ["stellar dev skill install", "stellar skill claude code"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-ledger-data-indexer": [
		{
			note: "Go module github.com/stellar/stellar-ledger-data-indexer (go 1.25); Docker image stellar/stellar-ledger-data-indexer on Docker Hub (registered 2026-01-16; `latest` pushed 2026-09-08; README's quick start runs it via docker run). No GitHub releases or tags as of 2026-09-13. https://hub.docker.com/r/stellar/stellar-ledger-data-indexer",
			triggers: [
				"ledger data indexer docker",
				"stellar ledger data indexer image",
			],
			source: "curated",
			asOf: "2026-09-13",
		},
	],
	"stellar/stellar-account-tools": [
		{
			note: "Live app at https://stellar.github.io/stellar-account-tools/ (README 'Live app'; HTTP 200 on 2026-09-01). README: an SDF-built web app for managing Stellar accounts whose headline tool is 'Emergency SDP Host Access Revocation' — revoking a Stellar Disbursement Platform host's access to your distribution account. No releases; package version 0.0.0. https://github.com/stellar/stellar-account-tools",
			triggers: ["revoke sdp host access", "stellar account tools app"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/x402-stellar": [
		{
			note: "Publishes no package as of 2026-09-01: root package.json is private with no version; no tags or releases. Holds examples/facilitator (Stellar facilitator service) and examples/simple-paywall plus a Dockerfile (README; Node 22+, pnpm 10+). The npm package named x402-stellar (0.2.0, 2025-12-05) belongs to a different repo, mertkaradayi/stellar-x402. https://github.com/stellar/x402-stellar",
			triggers: [
				"x402 stellar npm package",
				"stellar x402 facilitator example",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/sep45-reference": [
		{
			note: "Reference implementation of SEP-45, web authentication for contract accounts (README links https://stellar.org/protocol/sep-45). TypeScript + Rust per GitHub's language stats; single release v0.1.3 (2026-01-14); no package.json or Cargo.toml at the repo root, so no npm/crates identity. https://github.com/stellar/sep45-reference/releases",
			triggers: [
				"sep-45 reference implementation",
				"sep 45 contract account auth",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"withobsrvr/stellarbeat": [
		{
			note: "README title: 'OBSRVR Radar (formerly Stellarbeat)' — a monitoring and analytics platform for the Stellar network's validators and organizations; the root package is named radar (private, 0.1.0). No releases or tags as of 2026-09-01. https://github.com/withObsrvr/stellarbeat",
			triggers: ["stellarbeat renamed", "obsrvr radar stellarbeat"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"hot-dao/kit": [
		{
			note: "npm @hot-labs/kit — 1.6.4 (2026-02-20; 85 versions since 2025-12-07; no repository field on npm; the repo's package.json is 1.6.5). README: a multi-chain connector implementing NEAR Intents for NEAR, EVM, Solana, TON, Stellar and Cosmos; install `yarn add @hot-labs/kit react react-dom`; docs https://hot-labs.gitbook.io/hot-protocol/hot-kit. https://www.npmjs.com/package/@hot-labs/kit",
			triggers: ["hot kit stellar", "near intents stellar connector"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"hot-dao/hot-sdk-js": [
		{
			note: "npm @hot-wallet/sdk — 1.0.11 (2025-02-20; 46 versions since 2024-07-26; no repository field on npm; no GitHub releases). README has a 'Stellar Connect' section (stellar:getAddress / signTransaction / signAuthEntry / signMessage requests) described as compatible with Creit-Tech/Stellar-Wallets-Kit. https://www.npmjs.com/package/@hot-wallet/sdk",
			triggers: ["hot wallet stellar sdk", "hot wallet wallets kit module"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"allbridge-io/allbridge-core-js-sdk": [
		{
			note: "npm @allbridge/bridge-core-sdk — 3.35.0 (2026-09-09; 336 versions since 2022-10-07). Its repository field names allbridge-public/allbridge-core-js-sdk; that copy and this one share the identical HEAD 20b0d81c54169c3c5d8e366ef6f6ee56f60ee542 (2026-09-01) and neither redirects. README links Stellar docs at documentation/browser/stellar.md. https://www.npmjs.com/package/@allbridge/bridge-core-sdk",
			triggers: ["allbridge core sdk npm", "allbridge sdk stellar"],
			source: "curated",
			asOf: "2026-09-13",
		},
	],
	"allbridge-io/allbridge-core-rest-api": [
		{
			note: "Docker image allbridge/io.allbridge.rest-api (Docker Hub, registered 2024-03-01): newest version tag 3.32.0 (2026-06-26) while `latest` was last pushed 2026-01-30 with 3.29.1 — pin a version. README's network list includes 'Stellar (STLR) & Soroban (SRB)', configured with STLR_NODE_URL plus SRB_NODE_URL (both required). https://hub.docker.com/r/allbridge/io.allbridge.rest-api",
			triggers: ["allbridge rest api docker", "allbridge rest api stellar"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"allbridge-io/local-signer-mcp": [
		{
			note: "Shipped as the Docker image allbridge/local-signer-mcp (Docker Hub, registered 2026-04-22, last pushed 2026-04-25; README links it); package.json is private, so not on npm. README: a local MCP layer that signs and optionally broadcasts fully formed transactions; 'Soroban / Stellar' is a supported chain (env LOCAL_SIGNER_SRB_PRIVATE_KEY etc.). https://github.com/allbridge-io/local-signer-mcp",
			triggers: [
				"allbridge local signer mcp",
				"mcp transaction signer stellar docker",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"bp-ventures/lightecho-stellar-oracle": [
		{
			note: "PyPI lightecho-stellar-oracle — 2.0.0 (2024-08-15; 41 releases; PyPI homepage points to oracle-sdk/python in this repo). README lists the PRODUCTION SEP-40 oracle contract for base XLM as CDOR3QD27WAAF4TK4MO33TGQXR6RPNANNVLOY277W2XVV6ZVJ6X6X42T and dates the production pilot launch to March 5 2024; a Python CLI lives at oracle-onchain/sep40/cli. https://pypi.org/project/lightecho-stellar-oracle/",
			triggers: ["lightecho oracle contract address", "lightecho python sdk"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"rozoai/rozo-intents-contracts": [
		{
			note: "README 'Audits' table cites a Hacken audit of V2 (March 2026) at https://hacken.io/audits/rozo/sca-rozo-sdf-audit-mar2026/ and its deployment table gives the Stellar Mainnet contract CAC5SKP5FJT2ZZ7YLV4UCOM6Z5SQCCVPZWHLLLVQNQG2RWWOOSP3IYRL. Single GitHub release, tag v1.0.0_v1_stellar_payment_payment_pkg0.1.0_cli22.8.1 (2026-02-13). https://github.com/RozoAI/rozo-intents-contracts",
			triggers: ["rozo intents audit", "rozo stellar mainnet contract"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"dobprotocol/stellar-distribution-contracts": [
		{
			note: "README's 'Status: Audited - Safe for Production' rests on in-repo reviews headed 'Auditor: Internal Review' (docs/SECURITY_REVIEW.md v1.2.1, docs/SECURITY_REVIEW_V2.md v2.0.0, both January 2026); no third-party auditor is named. README 'Mainnet' table: Splitter WASM hash 67848b7ab5a32ea5b0410d16393b5d4e79f68266571272a3aff4edf5ec67483c. https://github.com/Dobprotocol/stellar-distribution-contracts",
			triggers: [
				"dob protocol splitter audit",
				"stellar distribution contracts audited",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"script3/sep-41-token": [
		{
			note: "crates.io sep-41-token — 1.4.0 (2026-01-26; 9 versions since 2023-10-20; release v1.4.0 same day): SEP-0041 trait, client and mock contract (members sep-41, mock-sep-41). Its repository field (sep-41/Cargo.toml) names script3/sep-40-oracle, so crates.io links it to that sibling repo. Companion crates: sep-40-oracle 1.4.0, soroban-fixed-point-math 1.5.0. https://crates.io/crates/sep-41-token",
			triggers: ["sep-41 token crate", "sep 41 trait rust"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar-fox/redshift": [
		{
			note: "README 'SECURITY WARNING': 'The domain stellarfox.net is no longer affiliated with this project or its original creators.' npm @stellar-fox/redshift is frozen at 1.0.2 (2018-12-21; 14 versions since 2018-07-25) while the in-repo library/package.json is 1.1.0 (unpublished); implements BIP39/BIP32/BIP44 and SEP-0005. https://github.com/stellar-fox/redshift",
			triggers: [
				"stellarfox domain warning",
				"redshift stellar mnemonic library",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellarguard/stellar-uri": [
		{
			note: "npm @stellarguard/stellar-uri — 3.0.1 (2021-05-29; 16 versions since 2018-10-25; repository field points here; repo not archived as of 2026-09-01). TypeScript implementation of SEP-0007 web+stellar: URIs for browser or Node; README notes TransactionStellarUri can replace transaction parts addressed by SEP-0011 txrep path. https://www.npmjs.com/package/@stellarguard/stellar-uri",
			triggers: ["sep-0007 uri javascript", "web stellar uri library"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellarguard/txrep": [
		{
			note: "npm @stellarguard/txrep — 2.0.0 (2020-05-18; 10 versions since 2019-11-30; repository field points here; repo not archived as of 2026-09-01). TypeScript implementation of SEP-0011 txrep, the human-readable Stellar transaction representation. https://www.npmjs.com/package/@stellarguard/txrep",
			triggers: ["sep-0011 txrep javascript", "txrep library npm"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"tupui/stellar-stratum": [
		{
			note: "Hosted at https://stellar-stratum.xyz (README; HTTP 200 on 2026-09-01): a multi-signature wallet dApp for Stellar accounts with custom thresholds, switchable between mainnet and testnet. Root package stellar-stratum 0.1.0 is private; no releases. https://github.com/tupui/stellar-stratum",
			triggers: ["stellar stratum multisig", "stratum wallet dapp"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"paltalabs/mercury-client": [
		{
			note: "Not the SDK: README titles it 'Mercury Sandbox', a Node/Axios sample that subscribes an address and runs 7 Soroban transactions against Mercury (mercurydata.app). The npm package mercury-sdk (1.0.0, 2024-11-11; 31 versions since 2023-11-29) is built from paltalabs/mercury-sdk, whose GitHub banner reads 'archived by the owner on Sep 3, 2025'. https://github.com/paltalabs/mercury-client",
			triggers: ["mercury sdk npm", "mercury sdk archived"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"perun-network/perun-soroban-contract": [
		{
			note: "Soroban payment-channel contract for go-perun's Stellar backend; README: it must be used with the companion perun-network/perun-stellar-backend (exists, HEAD verified 2026-09-01). Latest GitHub release v0.7.0 (2025-04-08) while Cargo.toml still says version 0.2.0; not on crates.io; pins soroban-sdk 20.5.0. https://github.com/perun-network/perun-soroban-contract",
			triggers: ["perun stellar backend", "perun payment channel soroban"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"fxdao/fxdao-sdk-js": [
		{
			note: "npm @fxdao/fxdao-sdk-js — 0.9.3 (2025-09-03; 8 versions since 2024-01-12; the npm repository field points here). The README is a bare title, so the npm page is the only documentation surface. https://www.npmjs.com/package/@fxdao/fxdao-sdk-js",
			triggers: ["fxdao sdk npm"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar-scaffold/ui": [
		{
			note: "README: the frontend half of Stellar Scaffold, 'under active development'; the entry point is the companion github.com/stellar-scaffold/cli (exists, HEAD verified 2026-09-01). Root workspace @stellar-scaffold/ui is private; its only GitHub release is a CI artifact tag, main_contracts_guess_the_number_guess-the-number_pkg0.0.2_cli27.0.0 (2026-08-05). https://github.com/stellar-scaffold/ui",
			triggers: ["stellar scaffold ui", "stellar scaffold cli repo"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"payrouteshq/stellartools": [
		{
			note: "Hosted at https://stellartools.dev with docs at https://docs.stellartools.dev (README; both HTTP 200 on 2026-09-01). README: 'An OSS payment infrastructure built on the Stellar blockchain, by Payroutes' (payroutes.sh), listed in the Vercel OSS Program. Root package stellartools 0.1.0 is private; not on npm. https://github.com/payrouteshq/stellartools",
			triggers: ["stellartools payroutes", "stellar tools dev site"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"kalepail/soroban-passkey": [
		{
			note: "SoroPass — README: demo at https://passkey.sorobanbyexample.org/ (HTTP 200 on 2026-09-01) and write-up at https://kalepail.com/blockchain/the-passkey-powered-future-of-web3; a pnpm app with no releases or tags; repo not archived. https://github.com/kalepail/soroban-passkey",
			triggers: ["soropass demo", "soroban passkey demo"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"suncewallet/sunce": [
		{
			note: "Desktop and mobile Stellar wallet (Mac, Windows, Linux, Android, iOS per README) distributed as binaries on GitHub Releases (README 'Download'). Latest stable release v1.10.0 (2026-05-24); newest tag v1.11.0-beta1 (2026-06-05, prerelease). https://github.com/SunceWallet/sunce/releases",
			triggers: ["sunce wallet download", "sunce wallet release"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/basic-payment-app": [
		{
			note: "BasicPay — companion code for the SDF Example Application Tutorial; README links https://developers.stellar.org/docs/building-apps/example-application-tutorial/overview (301 to /docs/build/apps/example-application-tutorial/overview, 200 on 2026-09-01). README '[!CAUTION]': educational, not for production or Mainnet. Private package (bpa 0.0.1), no releases. https://github.com/stellar/basic-payment-app",
			triggers: ["basicpay tutorial", "example application tutorial code"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// ── P5 batch 4 (2026-09-01): 40 repos / 42 notes, next tier by repoScore —
	// SDKs across languages (KMP, iOS/macOS, Flutter, Java Android SPI, PHP
	// anchor, Swift wallet, web/android kits), XDR/RPC crates, SDF infra images
	// and apt packages, protocol/docs repos, wallets, and archived/renamed
	// paths (kotlin-wallet-sdk, wallet-backend-client, kalepail/*,
	// devasignhq/soroban-contract). Every fact verified live on the asOf date
	// against the registry / API / README the note cites; no rename or
	// archive DATE is claimed anywhere. Kept out on purpose: our own
	// stellar-light/stellar-pay (self-curation is an owner call) and
	// xycloo/rs-zephyr-toolkit (crates.io carries no repository field for
	// zephyr-sdk — the registry↔repo link is indirect). ~43 further
	// candidates yielded nothing durable and are absent by name in the
	// batch notes.
	"soneso/kmp-stellar-sdk": [
		{
			note: 'Kotlin Multiplatform SDK on Maven Central as com.soneso.stellar:stellar-sdk — 1.12.0 (GitHub release v1.12.0, 2026-08-26; the Maven entry links back to this repo; Apache-2.0). README install: implementation("com.soneso.stellar:stellar-sdk:1.12.0"), Gradle 9.0+. https://central.sonatype.com/artifact/com.soneso.stellar/stellar-sdk',
			triggers: ["kotlin multiplatform sdk maven", "kmp sdk maven coordinates"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"soneso/stellar-ios-mac-sdk": [
		{
			note: 'Install is Swift Package Manager only per README (product name stellarsdk): .package(name: "stellarsdk", url: "git@github.com:Soneso/stellar-ios-mac-sdk.git", from: "3.10.0"); requires iOS 15+, macOS 12+, Xcode 16+ (Swift 6 toolchain; Swift 5 or 6 language mode). Latest release 3.10.0 (2026-08-25), after 3.9.0 and 3.8.1. https://github.com/Soneso/stellar-ios-mac-sdk/releases',
			triggers: ["ios sdk swift package", "stellarsdk swift package"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"soneso/stellar_flutter_sdk": [
		{
			note: "pub.dev package stellar_flutter_sdk — 3.6.0 (2026-08-24; 118 versions since 0.7.8 on 2020-06-23; the pub.dev homepage points at this repo; MIT). Requires Dart SDK >=3.8.0 <4.0.0 and Flutter >=3.32.0; iOS deployment target 15.0+ (smart-account passkey calls need iOS 16 at runtime, else return not-supported). https://pub.dev/packages/stellar_flutter_sdk",
			triggers: ["flutter sdk pub package", "flutter sdk dart version"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/kotlin-wallet-sdk": [
		{
			note: "ARCHIVED (GitHub API archived:true, 2026-09-01) and deprecated — README banner: 'This SDK is deprecated and no longer maintained… There is no direct Kotlin/Java successor.' Maven Central org.stellar:wallet-sdk is frozen at 3.0.0 (GitHub release 2026-04-28) with the same DEPRECATED notice; README sends JVM users to the lower-level Java SDK (implement SEP-1/10/12/24/30 yourself) and wallet-SDK users to TypeScript, Flutter (Soneso/stellar_wallet_flutter_sdk) or Swift. https://github.com/stellar/kotlin-wallet-sdk",
			triggers: [
				"kotlin wallet sdk deprecated",
				"kotlin wallet sdk archived",
				"kotlin wallet sdk successor",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/wallet-backend-client": [
		{
			note: "ARCHIVED (GitHub API archived:true, 2026-09-01) and never published: the README's `npm install @stellar/wallet-backend-client` does not resolve — registry.npmjs.org returns Not found for that name (2026-09-01). README also declares the repo 'not currently under active development' and out of scope for Stellar's HackerOne program. https://github.com/stellar/wallet-backend-client",
			triggers: ["wallet backend client npm", "wallet backend client archived"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"lightsail-network/java-stellar-sdk-android-spi": [
		{
			note: "Android companion of lightsail-network/java-stellar-sdk: Maven Central network.lightsail:stellar-sdk-android-spi — 5.0.0 (published 2026-09-01, same day as the SDK's 5.0.0; Apache-2.0; the Maven entry links back to this repo). Versions track the SDK (tags 4.0.0, 4.0.1, 5.0.0). https://central.sonatype.com/artifact/network.lightsail/stellar-sdk-android-spi",
			triggers: ["android spi maven", "java sdk android spi"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"argo-navis-dev/php-anchor-sdk": [
		{
			note: "Packagist name argonavis/php-anchor-sdk (from composer.json) — 0.10.0 (2025-11-09; 11 versions since 0.1.0 on 2023-12-25; Packagist source points at this repo; Apache-2.0). Latest GitHub release 0.10.0 (2025-11-09); repo last pushed 2026-03-29. https://packagist.org/packages/argonavis/php-anchor-sdk",
			triggers: ["php anchor sdk composer", "php anchor sdk packagist"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/js-xdr": [
		{
			note: "npm name is @stellar/js-xdr — 5.0.0 (2026-08-20; scoped package first published 2023-11-20). The old unscoped js-xdr is deprecated on npm ('This package has moved to @stellar/js-xdr!') and frozen at 3.1.2 (2024-07-18). It is a runtime XDR codec, not a generator: the SDK's bindings are produced by tools/xdrgen/generate.mjs in stellar/js-stellar-sdk. https://www.npmjs.com/package/@stellar/js-xdr",
			triggers: ["js xdr deprecated", "xdr npm package"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/rs-stellar-xdr": [
		{
			note: "crates.io name stellar-xdr — 28.0.0 (2026-07-30; first published 2022-07-29; 41 versions; ~2.15M downloads; crate repository field points here). Support policy (README): only the most recent major gets bug fixes and features; critical security backports to older majors are best-effort. CLI build: `cargo install --locked stellar-xdr --version ... --features cli`. https://crates.io/crates/stellar-xdr",
			triggers: ["stellar xdr crate", "rust xdr crate"],
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Security advisory (as of 2026-09-01 — re-check the live feed, this is dated): CVE-2026-29795 / GHSA-x57h-xx53-v53w, medium, published 2026-03-04 — StringM::from_str bypasses max length validation; affects stellar-xdr <= 25.0.0, patched in 25.0.1. https://github.com/stellar/rs-stellar-xdr/security/advisories/GHSA-x57h-xx53-v53w",
			triggers: ["stellar xdr advisory", "stellar xdr cve"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/rs-stellar-rpc-client": [
		{
			note: "crates.io name stellar-rpc-client (first published 2024-03-05; 30 versions; ~225k downloads; repository field points here). On 2026-09-01 the newest upload is pre-release 28.0.0-rc.1 (2026-08-25) while max stable is 27.0.0 — matching the latest non-prerelease GitHub release v27.0.0 (2026-06-17). README is a 4-line stub pointing at developers.stellar.org/docs. https://crates.io/crates/stellar-rpc-client",
			triggers: ["stellar rpc client crate", "rust rpc client crate"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/xdrgen": [
		{
			note: "README notice (2026-09-01): 'Generators are no longer maintained in this repository' — the Python, Java and Rust generators moved out next to the XDR libraries they generate (PRs #221, #226); C#, Elixir and Ruby generators were deleted and survive only at commit 2efacde612445d97e0548131ed699e8130bdeb7b; the Go generator still lives here. New generators should use xdrgen as a library. RubyGems xdrgen is frozen at 0.1.1 (2021-08-20; 3 versions since 2020-01-23). https://github.com/stellar/xdrgen#readme",
			triggers: ["xdrgen generators moved", "xdrgen gem"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-xdr": [
		{
			note: "Canonical .x XDR definitions; one GitHub release per protocol — v28.0 (2026-08-27), v27.0, v26.0. Branch model (README): all changes land on main; curr = current protocol, next = definitions that only take effect at the next protocol boundary, wrapped in per-feature #ifdef flags (e.g. CAP73_SAC_CREATE_ACCOUNTS); 'when in doubt just make the changes only in the next branch'. https://github.com/stellar/stellar-xdr#making-modifications",
			triggers: ["xdr curr next", "xdr next branch"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-cli-docker": [
		{
			note: 'Source of Docker Hub image docker.io/stellar/stellar-cli (~39.8k pulls, 2026-09-01): version tags plus pinned-toolchain manifest tags like 28.0.0-rust1.98.0-slim-trixie with -amd64/-arm64 per-arch variants and a -0 build suffix; :latest updated 2026-08-26; GitHub release v28.0.0-0 (2026-08-26). Doubles as a SEP-58 reproducible-build image: `docker run --rm -v "$PWD:/source" docker.io/stellar/stellar-cli:latest contract build --locked`. https://hub.docker.com/r/stellar/stellar-cli/tags',
			triggers: [
				"stellar cli docker image",
				"stellar cli docker tag",
				"sep 58 image",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-galexie": [
		{
			note: "Split out of the stellar/go monorepo (see the go-stellar-sdk note); releases are tagged galexie-vX — galexie-v28.0.1 (2026-08-27), galexie-v28.0.0 (2026-08-14). Docker Hub image stellar/stellar-galexie (tags 28.0.1, 28.0.0, latest; ~3.5k pulls, 2026-09-01). The README's docs link developers.stellar.org/docs/data/galexie now redirects to /docs/data/indexers/build-your-own/galexie. https://hub.docker.com/r/stellar/stellar-galexie/tags",
			triggers: ["galexie docker image", "galexie release"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-etl": [
		{
			note: "Runs from Docker Hub image stellar/stellar-etl (README: `docker pull stellar/stellar-etl:latest`; ~138.6k pulls). Hub tags are commit SHAs and :latest was last updated 2026-03-10 although the repo was pushed 2026-08-27 — pin by SHA or build from source (Go 1.23+; captive-core needs stellar-core v20.0.0+). GitHub releases run to v2.8.23 (2026-06-23). https://hub.docker.com/r/stellar/stellar-etl/tags",
			triggers: ["stellar etl docker", "stellar etl image"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-anchor-tests": [
		{
			note: "npm package is @stellar/anchor-tests (the monorepo's @stellar/anchor-tests workspace) — 0.6.22 (2026-06-05; 46 versions since 2021-06-11; repository points here). The README's hosted UI anchor-tests.stellar.org did NOT resolve on 2026-09-01 (DNS NXDOMAIN, checked twice; stellar-demo-wallet's README links it too) — run the CLI/UI locally. https://www.npmjs.com/package/@stellar/anchor-tests",
			triggers: [
				"anchor tests npm",
				"anchor tests hosted",
				"anchor validator site",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-protocol": [
		{
			note: "Home of CAPs and SEPs: accepted CAPs live in core/ as cap-XXXX.md (process in core/README.md), accepted SEPs in ecosystem/ as sep-XXXX.md (process in ecosystem/README.md), media under contents/{cap|sep}-XXXX/, templates cap-template.md and sep-template.md at the root; default branch master, e.g. https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md. No releases or tags — cite by path + commit. https://github.com/stellar/stellar-protocol#repository-structure",
			triggers: [
				"where are seps",
				"cap sep repository",
				"sep markdown location",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-docs": [
		{
			note: "Source of developers.stellar.org (Docusaurus; Node 24+, pnpm). Agent-facing bundles are live: https://developers.stellar.org/llms.txt is a hand-curated static/llms.txt (docusaurus.config.ts sets generateLLMsTxt:false — 'keep our curated static/llms.txt untouched'; ~15 KB) and llms-full.txt is generated by docusaurus-plugin-llms (~4.4 MB on 2026-09-01) — point AI tools there instead of crawling the MDX. https://github.com/stellar/stellar-docs/blob/main/docusaurus.config.ts",
			triggers: ["stellar docs llms", "developer docs llms", "docs llms txt"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/packages": [
		{
			note: "SDF's Debian/Ubuntu repo: https://apt.stellar.org (key A136B5A6 at https://apt.stellar.org/SDF.asc; `deb https://apt.stellar.org $(lsb_release -cs) stable` or testing; Ubuntu LTS only). Verified 2026-09-01: noble stable carries stellar-core 28.0.1-3508.947aad841.noble, stellar-horizon 28.0.1-561, stellar-rpc, stellar-archivist(-rs), stellar-core-postgres/-prometheus-exporter/-utils; jammy adds stellar-soroban-rpc. The README's 'Ubuntu 16.04' line is stale. https://github.com/stellar/packages/blob/master/docs/adding-the-sdf-stable-repository-to-your-system.md",
			triggers: [
				"apt stellar core",
				"debian package stellar core",
				"ubuntu package horizon",
				"apt stellar org",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"chatch/stellarexplorer": [
		{
			note: "Hosted at https://steexp.com (public), https://testnet.steexp.com and https://futurenet.steexp.com (README; steexp.com answered 200 on 2026-09-01). Releases are tagged vX.Y.Z-app — latest v3.1.3-app (2026-07-06). The npm package `stellarexplorer` (1.0.8, 2018-08-13) is deprecated by its author as 'not a library to be shared but a site' — do not install it. https://github.com/chatch/stellarexplorer/releases",
			triggers: ["steexp source code", "stellarexplorer npm"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"rabetofficial/rabet-extension": [
		{
			note: "Browser-extension wallet (GPL-3.0; site rabet.io). Latest GitHub release V1.8.0 (2025-12-23; package.json version 1.8.0); repo last pushed 2025-12-23. The repo's homepage field is the Chrome Web Store listing https://chrome.google.com/webstore/detail/rabet/hgmoaheomcjnaheggkfafnjilfcefbmo. https://github.com/rabetofficial/rabet-extension/releases",
			triggers: [
				"rabet latest version",
				"rabet chrome web store",
				"rabet extension release",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"lobstrco/vault-android": [
		{
			note: "Android source of LOBSTR Vault (multisig signer app; GPL-3.0; Kotlin). No GitHub releases or tags — builds ship through the stores the README links: Google Play id com.lobstr.stellar.vault (https://play.google.com/store/apps/details?id=com.lobstr.stellar.vault) and App Store id1452248529 (https://itunes.apple.com/app/lobstr-vault/id1452248529). Repo last pushed 2026-07-15. https://github.com/Lobstrco/vault-android",
			triggers: [
				"lobstr vault play store",
				"lobstr vault app store",
				"lobstr vault source",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"daccred/attestprotocol": [
		{
			note: "npm packages @attestprotocol/sdk, @attestprotocol/stellar-sdk and @attestprotocol/cli — all 2.0.2, last published 2025-11-09; their repository field names github.com/daccred/attest.so, which the GitHub API resolves to daccred/attestprotocol (renamed). The monorepo's packages/ already carry unpublished 2.0.3 / 3.0.0, so npm lags the repo. https://www.npmjs.com/package/@attestprotocol/stellar-sdk",
			triggers: ["attest protocol npm", "attestprotocol package"],
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Deployed Stellar contract IDs per README (2026-09-01): mainnet Protocol v2 (current) CAMZUXDEMJ4BDEA2FCTXPRQW3VPEJLFOV5IB3NKKJB2G4CV7ANHNSF2N, v1 (legacy) CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI; testnet v2 CA2QET2KOUGAECEVYQEQT3SLDDZRUMAQHI7MMDTFVJY62WTHUTERAUCD, v1 CBFE5YSUHCRYEYEOLNN2RJAWMQ2PW525KTJ6TPWPNS5XLIREZQ3NA4KP. https://github.com/daccred/attestprotocol#readme",
			triggers: [
				"attestprotocol contract id",
				"attest protocol contract address",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"kalepail/passkey-kit": [
		{
			note: "ARCHIVED (GitHub API archived:true; last push 2026-07-31; 496 stars) — README: 'This repository has moved… Development of passkey-kit now happens at stellar/passkey-kit… all tags were carried over.' Resolve every passkey-kit question to stellar/passkey-kit; npm passkey-kit's repository field already points there. https://github.com/stellar/passkey-kit",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"kalepail/smart-account-kit": [
		{
			note: "ARCHIVED (GitHub API archived:true; last push 2026-07-31) — README: 'This repository has moved. Development continues at github.com/stellar/smart-account-kit… no further commits, releases, issues, or pull requests will be accepted.' Resolve to stellar/smart-account-kit (npm smart-account-kit). https://github.com/stellar/smart-account-kit",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"blend-capital/blend-contract-sdk": [
		{
			note: "Companion of blend-capital/blend-contracts: crates.io blend-contract-sdk (WASM exports of the Blend contracts for use with soroban-sdk) — 2.25.0 (2026-01-26; 11 versions since 0.1.0 on 2024-04-09; ~27k downloads; crate repository points here; MIT). Latest GitHub release v2.25.0 (2026-01-26). https://crates.io/crates/blend-contract-sdk",
			triggers: ["blend contract sdk crate", "blend sdk crates"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"devasignhq/soroban-contract": [
		{
			note: "RENAMED: github.com/devasignhq/soroban-contract redirects to devasignhq/bounty-escrow (GitHub API resolves the old path, 2026-09-01; the README's license badge still names soroban-contract). Bounty-escrow Soroban contract; single release v1.0.0 (2026-06-05); README deploy flow targets testnet. https://github.com/devasignhq/bounty-escrow",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-design-system": [
		{
			note: "npm @stellar/design-system — 4.0.2 (2026-07-28; 76 versions since 2020-12-09; repository points here). Releases are cut by publishing a GitHub release whose tag matches the npm version (v4.0.2 latest); README documents the bump → tag → release workflow. https://www.npmjs.com/package/@stellar/design-system",
			triggers: ["design system npm", "stellar design system package"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"trezor/trezor-firmware": [
		{
			note: "Stellar support lives in two places in the monorepo (2026-09-01): Trezor Core at core/src/apps/stellar (README: all operations except Inflation; files incl. sign_tx.py and sign_soroban_authorization.py, which handles the StellarSignSorobanAuthorization message) and legacy firmware at legacy/firmware/stellar.c (no Soroban code). No Stellar-specific releases — firmware tags cover the whole repo. https://github.com/trezor/trezor-firmware/tree/main/core/src/apps/stellar",
			triggers: ["trezor soroban", "trezor stellar support"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/wallet-backend": [
		{
			note: "No GitHub releases or tags (2026-09-01). Docker Hub image stellar/wallet-backend exists but is stale: only `testing` / testing-2025-05-13-fde7cfa tags, last updated 2025-05-13, while the repo was pushed 2026-09-01 — build from source or use the README's docker compose quickstart (`docker compose up db stellar-rpc-testnet api-testnet ingest-testnet`). https://hub.docker.com/r/stellar/wallet-backend/tags",
			triggers: ["wallet backend docker image"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-disbursement-platform-frontend": [
		{
			note: "Companion UI of stellar/stellar-disbursement-platform-backend; releases follow the SDP version — 7.0.0 (2026-08-19), 6.6.0, 6.5.0. Docker Hub image stellar/stellar-disbursement-platform-frontend (~16.2k pulls; last updated 2026-09-04). Docs: developers.stellar.org/docs/platforms/stellar-disbursement-platform. https://hub.docker.com/r/stellar/stellar-disbursement-platform-frontend",
			triggers: [
				"sdp frontend docker",
				"disbursement platform frontend release",
			],
			source: "curated",
			asOf: "2026-09-04",
		},
	],
	"stellar/soroban-examples": [
		{
			note: "Release tags track the soroban-sdk major they build against: v23.0.0 (2025-09-08, 'Update examples to use SDK v23'), v22.0.1 (2024-12-09), v22.0.0, v21.6.0 — no v24+ tag as of 2026-09-01 although the repo is still pushed (2026-08-30). Contracts build to target/wasm32v1-none/release/*.wasm with the Stellar CLI. https://github.com/stellar/soroban-examples/releases",
			triggers: ["soroban examples sdk version", "soroban examples release"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"bluxcc/core": [
		{
			note: "npm @bluxcc/core — published since 2025-09-23; repository points here. Licensed BUSL on npm (README section 'License & Usage Restrictions') — the fact worth knowing before depending on it; install `npm i @bluxcc/core`; site blux.cc. Read the current version from npm; this package ships several releases a week. https://www.npmjs.com/package/@bluxcc/core",
			triggers: ["blux npm package", "blux core license"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellar-broker/client": [
		{
			note: "npm @stellar-broker/client — 0.7.0 (2026-07-16; 22 versions since 2024-08-15; repository points here; MIT); companion contract repo stellar-broker/router-contract; service site stellar.broker. https://www.npmjs.com/package/@stellar-broker/client",
			triggers: ["stellarbroker client npm", "stellar broker npm"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"rahul-soshte/rs-soroban-client": [
		{
			note: 'Community (non-SDF) Rust client for Stellar RPC: crates.io soroban-client — 0.6.0 (2026-09-05; 47 versions since 0.1.0 on 2023-06-25; crate repository points here; Apache-2.0). The README dependency line still reads soroban-client = "0.5.9", one minor behind what the crate publishes. Not the same as SDF\'s stellar-rpc-client crate. https://crates.io/crates/soroban-client',
			triggers: ["soroban client crate", "soroban client rust"],
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"ericmt-98/micopay-mvp": [
		{
			note: "Same repo as ericmt-98/micopay-protocol: github.com/ericmt-98/micopay-mvp redirects to Micopay/micopay-protocol (GitHub API, 2026-09-01) — treat both old paths as one project and cite the Micopay org. https://github.com/Micopay/micopay-protocol",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"soneso/stellar-swift-wallet-sdk": [
		{
			note: "Swift wallet SDK layered on Soneso/stellar-ios-mac-sdk (adding it via Xcode's Add Package Dependencies pulls both stellar-wallet-sdk and stellarsdk; `import stellar_wallet_sdk`). Latest release 0.9.4 (2026-08-25); still pre-1.0. README lists SEP-1/6/7/9/10/12/24/30 support. https://github.com/Soneso/stellar-swift-wallet-sdk/releases",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"horizontalsystems/stellar-web-sdk": [
		{
			note: "npm stellar-web-sdk — 0.2.0 (2026-09-07; 4 versions, the first three all 2026-08-12; repository points here; MIT). README install: `npm install stellar-web-sdk @stellar/stellar-sdk` (peer dependency on @stellar/stellar-sdk). No GitHub releases or tags. https://www.npmjs.com/package/stellar-web-sdk",
			source: "curated",
			asOf: "2026-09-07",
		},
	],
	"horizontalsystems/stellar-kit-android": [
		{
			note: "Not on Maven Central — distributed via JitPack as com.github.horizontalsystems:stellar-kit-android:<version> where <version> is the first 7 characters of a commit hash (README; JitPack's build list confirms hash builds). No GitHub releases or tags; Android 8.0+/Kotlin 2.0+; the client used by Unstoppable Wallet (horizontalsystems/unstoppable-wallet-android). https://github.com/horizontalsystems/stellar-kit-android#installation",
			triggers: ["stellarkit android jitpack", "stellar kit android install"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"reflector-network/reflector-subscription-contract": [
		{
			note: "Companion of reflector-network/reflector-contract (Soroban contract for Reflector subscriptions management; crate name reflector-subscriptions, NOT published to crates.io). Latest release v1.0.2 (2024-11-19; tag v1.0.2_reflector-subscriptions_cli22.0.0); repo last pushed 2025-10-20. https://github.com/reflector-network/reflector-subscription-contract/releases",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// ── P5 batch 3 (2026-09-01): 25 repos / 34 notes, next tier by repoScore
	// (SDKs, tooling, core infra, widely-used contracts first) — every fact
	// verified live on the asOf date against the registry / API / README the
	// note cites. Six repos here are the CURRENT home of a renamed or moved
	// path (soroban-tools, soroban-cli, soroban-rpc, kalepail/passkey-kit,
	// stellar/java-stellar-sdk, ericmt-98/micopay-protocol): each redirect was
	// resolved through the GitHub API, not assumed. Rename DATES are not
	// stated anywhere we read, so no note claims one. 13 further candidates
	// (hackathon demos with only tags, plus the allbridge-io / allbridge-public
	// same-named pair) yielded nothing durable and are deliberately absent.
	"stellar/js-stellar-base": [
		{
			note: "DEPRECATED on npm: every version of @stellar/stellar-base (24 versions, last 15.0.0 on 2026-03-30) carries the deprecation 'This package is now rolled into @stellar/stellar-sdk'; the README (2026-09) says future updates incl. protocol releases ship only in @stellar/stellar-sdk, which re-exports this package's full API — switch the dependency. https://www.npmjs.com/package/@stellar/stellar-base",
			triggers: ["stellar base deprecated", "stellar base still maintained"],
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Repo is NOT archived (still pushed 2026-08-31) but its last tagged release is v15.0.0 (2026-03-30); the SDK absorbed it at @stellar/stellar-sdk v16.0.0 (see the stellar/js-stellar-sdk note) — resolve base-library questions to stellar/js-stellar-sdk. https://github.com/stellar/js-stellar-base/releases",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/typescript-wallet-sdk": [
		{
			note: "Monorepo publishing THREE npm packages, all at 4.0.1 (2026-08-21): @stellar/typescript-wallet-sdk (first published 2023-05-18), @stellar/typescript-wallet-sdk-km (key manager, 2024-03-26) and @stellar/typescript-wallet-sdk-soroban (2024-05-20); names verified in the repo's @stellar/*/package.json (the npm entries carry no repository field). https://www.npmjs.com/package/@stellar/typescript-wallet-sdk",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "v4.0.0 (2026-08-13) is a breaking major: @stellar/stellar-sdk 15.0.1 → 16.2.0 and the Node minimum raised 20 → 22 (engines node>=22); every pre-4.0.0 version is marked deprecated on npm ('Versions below 4.0.0 are no longer maintained. Please upgrade to v4.0.0+'). https://github.com/stellar/typescript-wallet-sdk/releases/tag/v4.0.0",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"lightsail-network/java-stellar-sdk": [
		{
			note: "Moved out of the stellar org: github.com/stellar/java-stellar-sdk redirects here (GitHub API resolves the old path to lightsail-network/java-stellar-sdk, 2026-09-01). Maven Central coordinates network.lightsail:stellar-sdk — 34 versions from 0.43.1 (2024-03-31) to 5.0.0 (2026-09-01); Javadoc at javadoc.io/doc/network.lightsail/stellar-sdk. https://central.sonatype.com/artifact/network.lightsail/stellar-sdk",
			triggers: ["java stellar sdk moved", "java sdk maven coordinates"],
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "5.0.0 (2026-09-01) is the Protocol 28 major with a breaking auth default: CAP-71 ADDRESS_V2 credentials on build and simulate (opt-outs: credentialsType SOROBAN_CREDENTIALS_ADDRESS, useUpgradedAuth=false); adds CAP-85 external executable refs. Android needs companion lightsail-network/java-stellar-sdk-android-spi (also 5.0.0). https://github.com/lightsail-network/java-stellar-sdk/releases/tag/5.0.0",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-cli": [
		{
			note: "Two old GitHub paths redirect here — stellar/soroban-tools and stellar/soroban-cli both resolve to stellar/stellar-cli (GitHub API, 2026-09-01). On crates.io it ships as BOTH stellar-cli (28.0.0, 2026-08-26; first published 2023-10-26) and legacy-named soroban-cli (same 28.0.0; since 2022-07-28, ~174k downloads), both with repository = this repo. https://crates.io/crates/stellar-cli",
			triggers: ["soroban cli renamed", "soroban tools renamed"],
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Install paths per README: install.sh (`curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh`; --install-deps adds the Rust toolchain + wasm32v1-none target), Homebrew `brew install stellar-cli` (formula at 28.0.0), or `cargo install --locked stellar-cli`; latest release v28.0.0 (2026-08-26). https://github.com/stellar/stellar-cli/releases",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-rpc": [
		{
			note: "Renamed from stellar/soroban-rpc — the old GitHub path redirects here (API resolves it to stellar/stellar-rpc, 2026-09-01); the Docker Hub image moved too: stellar/stellar-rpc (updated 2026-08-27) is current while stellar/soroban-rpc is frozen at 2025-01-31. Latest release v28.0.1 (2026-08-27); v28.0.0 2026-08-17, v27.0.0 2026-06-11. https://github.com/stellar/stellar-rpc/releases",
			triggers: ["soroban rpc renamed", "soroban rpc docker image"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/quickstart": [
		{
			note: "Docker Hub image stellar/quickstart (~1.11M pulls, 2026-09-01); no GitHub releases — floating tags latest (mainnet-stable), testing (RCs, mainnet+testnet), futurenet, nightly, nightly-next, plus an immutable per-commit tag v<version>-b<build>.<attempt>-<tag>. README marks it development-only, not for production. https://github.com/stellar/quickstart#tags",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Bundles stellar-core, stellar-rpc, stellar-horizon, friendbot, Lab and galexie behind one port (Horizon :8000/, RPC /rpc, Lab /lab, Friendbot /friendbot); run via `stellar container start` (stellar-cli), `docker run -p 8000:8000 stellar/quickstart --local`, or as a GitHub Action `uses: stellar/quickstart@main` (action.yml in repo root). https://github.com/stellar/quickstart",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-core": [
		{
			note: "Release train (2026-09-01): v28.0.1 2026-09-01, v28.0.0 2026-08-13, v27.1.0 2026-06-25, v27.0.0 2026-06-05, v26.1.0 2026-05-15; Docker Hub image stellar/stellar-core (~1.22M pulls). https://github.com/stellar/stellar-core/releases",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Two repository security advisories (as of 2026-09-01; re-check the live feed): GHSA-mgx8-frjx-x33m / CVE-2024-32985, medium, 2024-05-09 — remote P2P crash, fixed in v20.4.0; GHSA-3p8h-7v82-ffvq, low, 2025-01-29 — memo mutability with Soroban auth signatures (auth entries not bound to the tx memo), fixed in 22.0.0. https://github.com/stellar/stellar-core/security/advisories",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/rs-soroban-env": [
		{
			note: "Ships on crates.io as soroban-env-host and soroban-env-common (both 28.0.2, 2026-08-17; first published 2022-07-28; ~1.67M downloads each), repository = this repo. Recent tags: v28.0.0 2026-07-31, v27.0.1 and v26.1.4 2026-07-20. https://crates.io/crates/soroban-env-host",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "One repository advisory (as of 2026-09-01): GHSA-pm4j-7r4q-ccg8, low, 2026-03-06 — the muxed-address<->ScVal conversion flag could stick after a failed storage-key conversion, causing spurious contract failures (transaction rolls back; no state corruption); soroban-env-host <26.0.0 affected, fixed in 26.0.0. https://github.com/stellar/rs-soroban-env/security/advisories/GHSA-pm4j-7r4q-ccg8",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/passkey-kit": [
		{
			note: "Moved from kalepail/passkey-kit (496 stars there; archived; README 'This repository has moved… all tags were carried over'); stellar/passkey-kit was created 2026-07-30, so its own star count understates adoption. npm passkey-kit (0.18.3, 2026-09-09; first published 2024-06-06; 133 versions) now points its repository at stellar/passkey-kit. https://www.npmjs.com/package/passkey-kit",
			triggers: ["passkey kit moved", "kalepail passkey kit"],
			source: "curated",
			asOf: "2026-09-13",
		},
		{
			note: "README security status (relay it): unaudited — the smart-wallet contract, SDKs and relayer proxy have had no independent audit; for context rules, thresholds and spending limits it points to the sibling stellar/smart-account-kit built on the audited OpenZeppelin stellar-contracts. Exports PasskeyKit (browser) and PasskeyServer (holds the relayer secret). https://github.com/stellar/passkey-kit",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"creit-tech/stellar-wallets-kit": [
		{
			note: "Published under two scopes: npm @creit.tech/stellar-wallets-kit (2.6.0, 2026-08-28; first published 2024-01-12) and JSR @creit-tech/stellar-wallets-kit (2.6.0; on JSR since 2024-11-02, linked to this repo) — the README's install path is now the JSR one (`npx jsr add @creit-tech/stellar-wallets-kit`). Docs at stellarwalletskit.dev; MIT. https://jsr.io/@creit-tech/stellar-wallets-kit",
			triggers: ["wallets kit package", "wallets kit jsr", "wallets kit npm"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"blend-capital/blend-contracts": [
		{
			note: "This is the Blend V1 contract repo — last release v1.0.0 (2024-05-01; per-contract wasm: pool, pool-factory, backstop, emitter), last push 2024-07-29, not archived. V2 contracts live in the separate repo blend-capital/blend-contracts-v2 (v2.0.0, 2025-04-14) with docs in blend-capital/docs-v2; companions blend-sdk-js, blend-utils, blend-contract-sdk. AGPL-3.0. https://github.com/blend-capital/blend-contracts-v2",
			triggers: ["blend v2 contracts"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"coinfabrik/scout-audit": [
		{
			note: "Crate name differs from the repo: cargo-scout-audit (0.3.16, 2026-02-13; first published 2023-06-30; ~36k downloads; repository = this repo) — `cargo install cargo-scout-audit`, then `cargo scout-audit` (html/md/pdf/json/sarif output). GitHub Releases are stale (latest v0.2.10, 2024-04-25; tags reach v0.2.19) — read the version from crates.io. https://crates.io/crates/cargo-scout-audit",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Soroban-specific detector docs live in the companion repo CoinFabrik/scout-soroban (last push 2024-11-07), which installs the same cargo-scout-audit crate; the README lists a VS Code extension (CoinFabrik.scout-audit) and a GitHub Action. This repo last pushed 2026-04-24. https://github.com/CoinFabrik/scout-soroban",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/go": [
		{
			note: "ARCHIVED (GitHub archived:true; last push 2025-12-10). README header: 'REPOSITORY DEPRECATED — This repository has been moved to github.com/stellar/go-stellar-sdk', migration guide MIGRATION.md; services split to stellar/stellar-horizon, stellar/stellar-galexie and stellar/friendbot (see the stellar/go-stellar-sdk note). https://github.com/stellar/go",
			triggers: ["stellar go archived", "stellar go monorepo"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: gh api repos/stellar/go → archived:true, pushed_at 2025-12-10; raw README.md master lines 13-17.
	"stellar/freighter-mobile": [
		{
			note: "Shipped to both stores — Google Play id org.stellar.freighterwallet and App Store id6743947720 (README badges); tagged releases every 1–3 weeks (v1.19.27 2026-06-17, v1.22.27 2026-08-10, v1.24.28 2026-08-29, v1.25.28 2026-09-01). Dev prerequisites Node ≥22.12 (stellar-sdk 17 ESM), Yarn 4.10. https://github.com/stellar/freighter-mobile/releases",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: gh api releases?per_page=6; raw README.md main lines 2-3 (store URLs) and prerequisites block.
	"stellar/stellar-mpp-sdk": [
		{
			note: "npm name is @stellar/mpp (0.7.1, 2026-07-02; first published 2026-03-30; repository = this repo; Node ≥22, ESM). Stellar method for the Machine Payments Protocol (mpp.dev): 'charge' mode implements draft-stellar-charge-00 via SEP-41 transfers, plus optional one-way payment channels; v0.7 migration guide at docs/migrating-to-v0.7.md. https://www.npmjs.com/package/@stellar/mpp",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: raw package.json main (name @stellar/mpp, engines node>=22, type module); registry.npmjs.org/@stellar%2Fmpp; README head.
	"reflector-network/reflector-contract": [
		{
			note: "Cargo workspace of three crates (oracle, pulse-contract, beam-contract); per-contract releases: v6.0.1 for ReflectorPulse and ReflectorBeam (2026-07-23), v6.0.0 (2026-03-09), older v4.x reflector-oracle wasm (2024-05). Audit PDFs in audits/ (OtterSec 2024 public feed; Code4rena 2025 beam+pulse). README: Pulse = free 5-minute feeds, Beam = paid, faster. https://github.com/reflector-network/reflector-contract/releases",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: default branch master; raw Cargo.toml members; gh api releases?per_page=6; gh api contents/audits; README lines 29-30.
	"stellar/anchor-platform": [
		{
			note: "Releases every 1–3 weeks: 4.7.1 (2026-08-26), 4.7.0 (2026-08-20), 4.6.2 (2026-08-03), 4.6.1 (2026-07-20). Published as the Docker Hub image stellar/anchor-platform; the image is rebuilt with each release and between them, so read its current tag from Docker Hub rather than from here. https://github.com/stellar/anchor-platform/releases",
			source: "curated",
			asOf: "2026-09-05",
		},
	],
	// verified: gh api releases?per_page=4; hub.docker.com/v2/repositories/stellar/anchor-platform/ (pull_count 936473).
	"stellar/stellar-disbursement-platform-backend": [
		{
			note: "On the 7.x release line since 7.0.0 (2026-08-19); prior minors 6.6.1 (2026-06-24), 6.6.0 (2026-06-18), 6.5.0 (2026-05-05). Published as the Docker Hub image stellar/stellar-disbursement-platform-backend (~34.6k pulls); the image is rebuilt frequently, so read its current tag from Docker Hub rather than from here. The UI is the companion repo stellar/stellar-disbursement-platform-frontend. https://github.com/stellar/stellar-disbursement-platform-backend/releases",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: gh api releases?per_page=4; hub.docker.com pull_count 34584; frontend repo present in the census list (score 50).
	"tupui/soroban-cli-python": [
		{
			note: "PyPI name is simply `soroban` (`pip install soroban`): 0.9.1 uploaded 2024-11-12, first release 0.1.0 2024-02-25, 15 releases, Python ≥3.10, project URLs point at this repo. The repo has commits after the last PyPI upload (pushed 2026-08-01) with no newer tag (latest tag v0.9.1). BSD-3-Clause. https://pypi.org/project/soroban/",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: pypi.org/pypi/soroban/json (version, releases, requires_python, project_urls); gh api tags; README `pip install soroban`.
	"acta-team/did-stellar": [
		{
			note: "npm @acta-team/did-stellar (0.1.2, 2026-07-27; first published 2026-05-26; repository = this repo, directory packages/resolver) — did:stellar v0.1 TypeScript SDK (DIF did-resolver compatible) plus a hosted resolver at did.acta.build; repo tag v0.1.3 exists with no matching npm version or GitHub release as of 2026-09-01. https://www.npmjs.com/package/@acta-team/did-stellar",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: registry.npmjs.org/@acta-team%2Fdid-stellar; gh api tags (v0.1.3,v0.1.2,v0.1.0) + releases (v0.1.2, v0.1.0); repo homepage did.acta.build.
	"sentinelfi/stellar-metamask-snap": [
		{
			note: "Published to npm 2026-08-27 as two packages, both 0.1.0 with repository = this repo: stellar-soroban-snap (the MetaMask Snap) and stellar-soroban-snap-connector; root package.json: SEP-0005 key derivation + SEP-43 signing API + companion dapp. Tags v0.1.0, pre-audit, phase-5-prep; repo has an audits/ dir and SECURITY.md. https://www.npmjs.com/package/stellar-soroban-snap",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: packages/{snap,connector}/package.json names; registry.npmjs.org for both (created 2026-08-27T16:17Z); gh api contents/ + tags.
	"kalepail/kale-sc": [
		{
			note: "README publishes the live addresses — MAINNET contract CDL74RF5BLYR2YBLCCI7F5FB6TPSCLKEJUBSD2RSVWZ4YHF3VMFAIGWA (the same README table carries the asset issuer, the SAC and the TESTNET equivalents) — and states the contract is unaudited ('a meme coin'). README parameters: 500 KALE/minute, 5% emission decay per ~30 days, ~500M cap; site kalefarm.xyz; no tagged releases. https://github.com/kalepail/KALE-sc",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: raw README.md main (table + CAUTION block); gh api repos (homepage kalefarm.xyz, releases/latest 404).
	"consulting-manao/tansu": [
		{
			note: "Repo description says development happens on Radicle (radicle.network node rad:zssaAF91kxuquZmZCV2SiK2FNX6s), not GitHub. README publishes the MAINNET contract CDXINK2T3P46M4LWK35FVIXXHJ2XHAS4FOVCGVPJ63YV5OVTM24IY5BI (TESTNET address in the same README), plus an SCF 28/30/41 badge; latest contracts release v2.0.2 (2026-05-12); site tansu.dev. https://github.com/Consulting-Manao/tansu",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: gh api repos (description, homepage); raw README.md main badges; gh api releases?per_page=3.
	"ericmt-98/micopay-protocol": [
		{
			note: "Repo moved: ericmt-98/micopay-protocol now lives at Micopay/micopay-protocol (old path redirects; GitHub API resolves it, 2026-09-01) — cite the new org. MIT; app at app.micopay.xyz. https://github.com/Micopay/micopay-protocol",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: gh api repos/ericmt-98/micopay-protocol → full_name Micopay/micopay-protocol, license MIT, homepage app.micopay.xyz.
	"stellar/laboratory": [
		{
			note: "No tags or GitHub releases; the main branch deploys continuously to lab.stellar.org (README: the deployed commit hash is shown bottom-right of the landing page). Next.js; Node ≥22.22.0, pnpm ≥10.15.1. https://github.com/stellar/laboratory",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: gh api tags (empty) + releases/latest 404; README Overview + Prerequisites.
	// ── P5 batch 2 (2026-09-01): next tier by repoScore, same discipline —
	// every fact verified live on the asOf date; the stellar/go archive +
	// go-stellar-sdk succession re-verified independently before landing
	// (gh api: archived:true / successor pushed same-day). Three dead-link
	// repos are recorded as exactly that — a 404 verified today is a dated
	// fact, not a verdict about the project.
	"stellar/go-stellar-sdk": [
		{
			note: "Successor of the stellar/go monorepo: since October 2025 it holds only SDK packages (txnbuild, horizonclient, rpcclient, ingest, xdr); stellar/go is archived and redirects here (https://github.com/stellar/go). Module path github.com/stellar/go-stellar-sdk \u2014 rename imports from github.com/stellar/go/.., no breaking API changes (https://github.com/stellar/go/blob/master/MIGRATION.md).",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Services were split out of this repo: Horizon -> stellar/stellar-horizon, Galexie -> stellar/stellar-galexie, Friendbot -> stellar/friendbot; Ticker, Keystore and Federation Server were deprecated and removed at tag stellar-go-2025-10-29_10-56-50 (README 'Relocated'/'Deprecated Services': https://github.com/stellar/go-stellar-sdk#relocated).",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Versioning reset to Go module semver: v0.1.0 (2025-12-11) through v0.7.3 (2026-08-24); the last monorepo-style tag was horizonclient-v24.0.0 (2025-10-21). Pre-1.0, so minor bumps may break (https://github.com/stellar/go-stellar-sdk/releases).",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"hyperledger-solang/solang": [
		{
			note: 'README (read 2026-09-07): "solang - Solidity Compiler for Solana, Polkadot and Soroban", written in Rust on LLVM. Stellar/Soroban is ONE backend of three, so activity here is not Stellar-specific work and the repo answers "can I write Soroban contracts in Solidity", never "what is built on Stellar". https://github.com/hyperledger-solang/solang',
			triggers: ["solidity on soroban", "solang stellar backend"],
			source: "curated",
			asOf: "2026-09-07",
		},
		{
			note: "Org moved twice: hyperledger-labs/solang -> hyperledger/solang -> hyperledger-solang/solang; both old GitHub paths redirect to the current repo (https://github.com/hyperledger/solang resolves to hyperledger-solang/solang as of 2026-09).",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Soroban/Stellar target landed in v0.3.4 (2025-06-29): SAC support, cross-contract calls, Soroban authorization framework and storage types; latest release v0.3.5 (2026-07-07) (https://github.com/hyperledger-solang/solang/releases/tag/v0.3.4).",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Distribution: bundled in the Solana Tools Suite v1.16.3+ (no separate install for Solana) and a Brew cask `brew install hyperledger/solang/solang`; companion crate solang-parser on crates.io (0.3.5, ~8.1M downloads) (https://crates.io/crates/solang-parser).",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/freighter-backend": [
		{
			note: "TypeScript indexer/backend for the Freighter wallet extension. A next-generation Go rewrite exists at stellar/freighter-backend-v2 ('Freighter's next generation of backend system written in Go', active but no tagged releases as of 2026-09), while this v1 still ships releases (v1.9.1, 2026-05-11) (https://github.com/stellar/freighter-backend-v2).",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"diadata-org/soroban-oracle-feeders": [
		{
			note: "Off-chain half of DIA's Soroban oracle stack: a Turborepo monorepo of data-feeder scripts (Node 20/Yarn, docker-compose deploy) that push prices to DIA's on-chain Soroban oracle contracts kept in the companion repo diadata-org/soroban-oracles (contracts last pushed 2024-08-09) (https://github.com/diadata-org/soroban-oracles).",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar-light/confidential-agent-commerce": [
		{
			note: "Repo transferred out of the Stellar-Light org: it now lives at theboycoder/confidential-agent-commerce and the old Stellar-Light URL redirects there (GitHub API resolves the old path to the new full_name as of 2026-09-01) (https://github.com/theboycoder/confidential-agent-commerce).",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"solomonadzape95/tilt": [
		{
			note: "Repo renamed: solomonadzape95/tilt is now solomonadzape95/crypt (old URL redirects). Project is branded 'API Safety Net' \u2014 a parametric SLA escrow on Soroban paying USDC to subscribers on API downtime, built for the Boundless x Trustless Work Hackathon (https://github.com/solomonadzape95/crypt).",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"blockchain-oracle/xlmtools": [
		{
			note: "Published on npm as two packages: @xlmtools/mcp (single-bin MCP stdio server, 0.1.0-0.1.5, first published 2026-04-12) and @xlmtools/cli (bin `xlm`, exports createMcpServer(), up to 0.2.3, first published 2026-04-11) (https://www.npmjs.com/package/@xlmtools/mcp, https://www.npmjs.com/package/@xlmtools/cli).",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"e1eng/agentboard": [
		{
			note: "Repo name is not the project name: agentBoard ships 'Signal Vault', an x402 puzzle arena where agents pay USDC per guess to crack a hidden 8-integer vector on Stellar testnet; live at signalvault.eleng.xyz (README: https://github.com/E1eng/agentBoard).",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"noetherdex/noether": [
		{
			note: "Repo no longer accessible: https://github.com/NoetherDEX/noether returns HTTP 404 (deleted or made private) as of 2026-09-01; census metadata is the surviving record.",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"0xnana/searchpay": [
		{
			note: "Repo no longer accessible: https://github.com/0xNana/SearchPay returns HTTP 404 (deleted or made private) as of 2026-09-01; census metadata is the surviving record.",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"alfa117/mongliagent": [
		{
			note: "Repo no longer accessible: https://github.com/ALFA117/MongliAgent returns HTTP 404 (deleted or made private) as of 2026-09-01; census metadata is the surviving record.",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// ── P5 batch (2026-09-01): 17 facts across 12 repos, each verified
	// live against npm/PyPI registries, gh releases/advisories APIs, or the
	// repo's own README on the asOf date (agent-researched, human-reviewed).
	// 13 further candidates honestly yielded nothing durable (testnet-only
	// hackathon demos) and are deliberately absent.
	"stellar/js-stellar-sdk": [
		{
			note: "npm name is @stellar/stellar-sdk (17.1.0, 2026-09-14). Three older packages are deprecated on npm in its favor: stellar-sdk (frozen at 13.3.0), soroban-client (frozen at 1.0.1), and @stellar/stellar-base (rolled into the SDK at v16.0.0, 2026-06-15) \u2014 resolve docs/code importing any of those to @stellar/stellar-sdk. https://www.npmjs.com/package/@stellar/stellar-sdk",
			source: "curated",
			asOf: "2026-09-14",
		},
		{
			note: "v17.0.0 (2026-08-20) is the Protocol 28 major: Node >=22.12.0 required (require() fails with ERR_REQUIRE_ESM on Node 22.0-22.11) and React Native no longer needs a Buffer polyfill; the v16 line still gets maintenance releases (v16.3.0 backported Protocol 28 XDR, 2026-08-28). Breaking changes are marked per release: https://github.com/stellar/js-stellar-sdk/releases",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Publishes agent-facing docs bundles \u2014 llms.txt (index) and llms-full.txt (full corpus + changelog) at https://stellar.github.io/js-stellar-sdk/llms.txt \u2014 point AI tools there instead of scraping the repo; the generated bundles are not committed to the repo itself.",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellarcn/py-stellar-base": [
		{
			note: "Repo name is not the package name: published on PyPI as stellar-sdk (docs: stellar-sdk.readthedocs.io); Python 3.10+, async via the [aiohttp] extra. Companion repos to cite together: lightsail-network/stellar-contract-bindings (Python bindings for Soroban contracts) and StellarCN/stellar-model (Horizon JSON to models). https://pypi.org/project/stellar-sdk/",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "16.0.0 (2026-08-28) is the Protocol 28 major with a breaking auth default: authorize_invocation and simulate_transaction now use CAP-71 ADDRESS_V2 credentials (legacy opt-outs: credentials_type=SOROBAN_CREDENTIALS_ADDRESS, use_upgraded_auth=False); 15.0.0 (2026-07-04) was the Protocol 27 major. Pin the major version. https://github.com/StellarCN/py-stellar-base/releases/tag/16.0.0",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/freighter": [
		{
			note: "Monorepo: the browser extension (5.47.0, 2026-08-31) plus the site-integration npm SDK @stellar/freighter-api (6.0.1, 2025-12-03). The extension is configured against TWO backend repos \u2014 stellar/freighter-backend (V1) and stellar/freighter-backend-v2 (V2), both wired via INDEXER_URL/INDEXER_V2_URL; the mobile app is the separate repo stellar/freighter-mobile.",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "One advisory in the GitHub Advisory Database: GHSA-vqr6-hwg2-775w (high, 2023-08-23) \u2014 mnemonic phrase readable by JavaScript through a private API, fixed in extension 5.3.1. Long patched; only relevant to forks/builds pinned below 5.3.1. https://github.com/stellar/freighter/security/advisories/GHSA-vqr6-hwg2-775w",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/smart-account-kit": [
		{
			note: "npm package is the unscoped smart-account-kit (0.8.0, 2026-09-08) \u2014 TypeScript client for the OpenZeppelin/stellar-contracts smart-account contract (passkeys, multi-signers, policies, fee sponsoring). Repo created 2026-07-30; Protocol 27 deployment artifacts are versioned in docs/deployments-protocol-27-2026-07-09.md. https://www.npmjs.com/package/smart-account-kit",
			source: "curated",
			asOf: "2026-09-13",
		},
		{
			note: "README security status (verify before recommending): the SDK, demo, relayer proxy and integration code have NOT had an independent audit; the underlying OZ contracts' audit (rc v0.7.0) has different scope and the deployed artifacts use a later source revision. Breaking changes at v0.4.0 are listed in docs/migration-v0.4.0.md. https://github.com/stellar/smart-account-kit",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"creit-tech/xbull-wallet": [
		{
			note: "For app integration the repo itself points at Stellar Wallets Kit (Creit-Tech/Stellar-Wallets-Kit, npm @creit.tech/stellar-wallets-kit 2.6.0, 2026-08-28) \u2014 one library covering xBull plus other Stellar wallets; the in-page xBullSDK is the older direct path. Latest wallet release v1.40.0 (2025-08-12): SEP-0053 message signing, protocol-23 SDK. AGPLv3. https://github.com/Creit-Tech/xBull-Wallet",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellarterm/stellarterm": [
		{
			note: "Web trading client for stellarterm.com; the markets API is the companion repo stellarterm/stellarterm-api (api.stellarterm.com, last push 2024-01). The README's deploy pointer stellarterm/stellarterm.github.io is an archived repo (last push 2018) \u2014 don't cite it as the live deploy path. Testnet mode via stellarterm.com/#testnet. https://github.com/stellarterm/stellarterm",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"shamba-records-limited/microvault": [
		{
			note: "SEP-0056 tokenized-vault engine for microlending; TESTNET deployment \u2014 vault CDZVKARL\u2026 and governance CAL3RYRW\u2026 contract addresses are published in the README (stellar.expert testnet links). v1.1.2 (2026-08-31) added MoneyGram cash-in for repayments and YellowCard collections. AGPL-3.0 with CLA-based dual licensing (commercial license offered). https://github.com/Shamba-Records-Limited/microvault",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"fredericrezeau/xray-games": [
		{
			note: "Engine behind the live arcade xray.games: Soroban contracts plus ZK circuits in BOTH Noir (Poseidon2) and Circom 2.1.9, verified on-chain via Protocol 25 (X-Ray) BN254 Groth16. Three MAINNET contracts are published in the README (Chain Slicer CD4XBH\u2026, Chain Snooker CBLPDJ\u2026, Chain Runner CATJOA\u2026); optional kalepail/ohloss faction integration. MIT. https://github.com/FredericRezeau/xray-games",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"bosun-josh121/clevercon": [
		{
			note: "Repo moved: now lives at clevercon-protocol/clevercon (old Bosun-Josh121 URL redirects; verified 2026-09-01) \u2014 cite the new org. Agent-payment rail + service marketplace on Stellar TESTNET (CleverVault contract CC4QX7\u2026); placed 2nd in the Stellar Agents hackathon; the privacy roadmap builds on companion repo Bosun-Josh121/ciphermit. https://github.com/clevercon-protocol/clevercon",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"ritik4ever/lodestar": [
		{
			note: "Repo moved: now lives at Stellar-Ecosystem/lodestar (old ritik4ever URL redirects; verified 2026-09-01). x402 service-discovery registry + agent credit scoring, two Soroban contracts on TESTNET (registry CAKZALA\u2026, agents CCT4FUTW\u2026); its own README status section says early-stage, demo-ready, not production-grade \u2014 relay that framing. https://github.com/Stellar-Ecosystem/lodestar",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"xaviersharwin10/soroban_node_0": [
		{
			note: "Despite the placeholder repo name, this is the Soroban Security Auditor agent from Stellar Hacks: Agents (April 2026), published on npm as auditor-mcp (0.1.8, 2026-04-12) \u2014 an MCP server whose agent audits Soroban .rs contracts and self-pays 0.15 USDC per audit via x402/Stripe MPP on testnet. Resolve auditor-mcp questions to this repo. https://www.npmjs.com/package/auditor-mcp",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"davidmaronio/stellarpay402": [
		{
			note: "Published on npm twice: @davidmaronio/stellarpay402-mcp (MCP server, 0.1.1, 2026-04-08) and stellarpay402 (CLI, 0.1.1, 2026-04-13) \u2014 agent-to-agent API marketplace with a Soroban registry contract on TESTNET (CCCCETOW\u2026), built for the April 2026 Stellar x402 hackathon. https://www.npmjs.com/package/stellarpay402",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// Verified 2026-09-01 from source at BOTH master and the scanned ref
	// (raw.githubusercontent.com, internal/ingest/main.go:38) — the constant
	// the #1 consumer's sls-080 probe reads. Horizon SPLIT out of stellar/go;
	// the monorepo's frozen copy answers with pre-split values (DeepWiki said
	// 22–25), which is exactly why this dated fact must lead the answer.
	"stellar/stellar-horizon": [
		{
			note: "Horizon's protocol ceiling: MaxSupportedProtocolVersion = 28 (a uint32 constant defined in internal/ingest/main.go) (verified 2026-09-01 at master AND at scanned ref 82660510 — https://github.com/stellar/stellar-horizon/blob/master/internal/ingest/main.go). Horizon split out of the stellar/go monorepo; the monorepo's frozen copy still carries pre-split values, so cite THIS repo for current Horizon constants.",
			triggers: [
				"max supported protocol version",
				"maximum supported protocol version",
				"highest supported protocol version",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// Verified 2026-08-31 against the GitHub Advisory Database (gh api
	// /advisories/<ghsa>): three repository advisories, severities and patched
	// versions confirmed from the records themselves. Dated facts, not a
	// permanent list — the note says to re-check the live feed.
	"stellar/rs-soroban-sdk": [
		{
			note: "Security advisories (as of 2026-08-31, check the live advisory feed — this list is dated, not permanent): CVE-2026-24889 / GHSA-96xm-fv9w-pf3f, medium — overflow in Bytes::slice, Vec::slice, GenRange::gen_range (soroban-sdk; fixed in 25.0.2 / 23.5.1 / 22.0.9); CVE-2026-26267 / GHSA-4chv-4c6w-w254, high — #[contractimpl] macro calls inherent function instead of trait (soroban-sdk-macros; fixed in 25.1.1 / 23.5.2 / 22.0.10); CVE-2026-32322 / GHSA-x2hw-px52-wp4m, medium — Fr scalar field equality bypasses modular reduction (soroban-sdk; fixed in 25.3.0 / 23.5.3 / 22.0.11). Impact conditions differ per advisory; upgrade to a patched supported branch and recompile affected deployed code.",
			source: "curated",
			asOf: "2026-08-31",
		},
	],
	// Verified 2026-08-01 (SDF Discord thread with earrietadev + our indexing
	// work): per-protocol extension docs live in subdirectory READMEs.
	"creit-tech/stellar-indexer-sdk": [
		{
			note: "Ships per-protocol extensions with their own docs under src/protocols/ (Blend, Reflector, Axis Markets; more in progress) — the root README is the map. Service is token-gated beta; SDK published on JSR as @stellar-indexer/stellar-indexer-sdk.",
			source: "curated",
			asOf: "2026-08-01",
		},
	],
	// Deep-read 2026-08-15 (full tree + package READMEs): architecture,
	// package map, SEP coverage, and the in-repo contract fleet — every fact
	// below verified against source, not README prose alone.
	"fazzatti/colibri": [
		{
			note: "Published on JSR as @colibri/core; fazzatti/colibri-examples is the companion worked-examples repo — cite both together for how-to questions.",
			source: "curated",
			asOf: "2026-07-31",
		},
		{
			note: "TypeScript-first Stellar/Soroban toolkit built on a pipeline/process/step architecture with a plugin system and deterministic error handling — including decoding contract errors out of failed simulation responses (core/common/helpers/contract-error-from-failed-simulation-response).",
			source: "curated",
			asOf: "2026-08-15",
		},
		{
			note: "Monorepo of six JSR packages: @colibri/core (pipelines + Stellar/Soroban utilities), @colibri/webauth (unified SEP-10 + SEP-45 web auth), @colibri/plugin-fee-bump (fee sponsorship via fee-bump wrapping), @colibri/plugin-channel-accounts (sponsored channel-account reuse), @colibri/rpc-streamer (live Soroban event streaming), @colibri/test-tooling.",
			source: "curated",
			asOf: "2026-08-15",
		},
		{
			note: "@colibri/webauth implements unified SEP-10 AND SEP-45 web authentication with deterministic account routing, strict challenge verification, and enforced Soroban simulation — one of the few SEP-45 (contract-account auth) implementations in the ecosystem.",
			source: "curated",
			asOf: "2026-08-15",
		},
		{
			note: "Ships a working smart-account reference fleet as in-repo Soroban contracts (_internal/contracts): passkey-account, delegated-asset-account, recursive-delegate-account, signatureless-account, web-auth — built to compiled wasm with sha256-pinned fixtures and tested against; the code-symbols layer (PasskeyAccount, DelegatedAssetAccount) comes from here.",
			source: "curated",
			asOf: "2026-08-15",
		},
		{
			note: "Engineering rigor above ecosystem norm for its size: Deno-first, co-located unit + integration tests across core modules, codecov coverage gate, custom lint rules, and an AGENTS.md carrying agent-facing contribution instructions.",
			source: "curated",
			asOf: "2026-08-15",
		},
	],
	// Verified 2026-08-15 (stored scan signals + owner confirmation): the EVM
	// giant's Stellar integration is real code in this monorepo.
	"sushi-labs/sushiswap": [
		{
			note: "SushiSwap is live on Stellar: this monorepo carries real Stellar integration code (deps @creit.tech/stellar-wallets-kit + @stellar/stellar-sdk, scanned capabilities contract-invoke + signing) — swap execution against Soroban with wallet-kit signing. Its codeDomains stay interface-derived (the Stellar side is TS integration, not contracts), so it deliberately does NOT carry defi-amm; cite this note for 'is Sushi on Stellar' questions.",
			source: "curated",
			asOf: "2026-08-15",
		},
	],
	"fazzatti/colibri-examples": [
		{
			note: "Companion worked-examples repo for @colibri (Deno runtime): getting-started/ carries the newcomer walkthroughs, examples/ the per-feature recipes, each with its own README — the practical entry point before reading colibri core.",
			source: "curated",
			asOf: "2026-08-15",
		},
	],
	// ── P5 wave 4 (2026-09-14): the curated-pool repos (repoScore ≥ 50) that
	// carried no note; every fact read from the repo / registry that day.
	"theahaco/contract-explorer": [
		{
			note: "npm @theahaco/contract-explorer 1.4.0 (2026-08-19; repo tag v1.4.0 the same day): a React ContractExplorer component + loadContracts utility to browse, simulate and invoke Soroban contracts from inside a dApp, with hot-reloading contract docs in development; built for Scaffold Stellar (scaffoldstellar.org) but configurable for any React app (README read 2026-09-14; Apache-2.0; last push 2026-08-19).",
			triggers: [
				"contract explorer scaffold",
				"explore soroban contracts dapp",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"duraznito16/stellar-memory": [
		{
			note: "A `stellar memory` CLI plugin: scans a Soroban repo, links contracts in the tree to what is actually deployed (testnet/mainnet; flags rows 'out of sync with local source') and stores the result as a knowledge graph for humans and AI agents to query (README read 2026-09-14; TypeScript; no releases, 0 stars; last push 2026-08-06).",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"fxjrin/stellar-contracts-kit": [
		{
			note: "npm stellar-contracts-kit 0.1.1 (2026-06-05; = repo tag v0.1.1): TypeScript SDK for Soroban — `npx sck` generates typed contract clients from any live contract spec, a built-in wallet modal (Freighter, Cyphras, Lobstr), auto / read-only / force-invoke call modes, spec caching and one-call contract restore for expired state (README read 2026-09-14; MIT; last push 2026-06-05 — nothing since the 0.1.1 release).",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/stellar-dbt-public": [
		{
			note: "SDF's public dbt project — the data-transformation models behind its analytics datasets; releases track a semver stream (v1.15.59 on 2026-09-10) and branches are named major/minor/patch by change type (README read 2026-09-14; Python; last push 2026-09-11).",
			triggers: ["stellar dbt models", "sdf analytics dbt"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"lightsail-network/crossmesh-ingress-contracts": [
		{
			note: "Solidity (Foundry) contracts for a trustless EVM → Stellar USDC deposit forwarder: every deposit address is a CREATE2 contract whose only fund-moving action bridges its USDC via Circle CCTP to the Stellar recipient committed inside the address, so no key or admin can divert principal and depositors can self-recover if the operator goes offline (README read 2026-09-14; MIT; no releases; last push 2026-07-03).",
			triggers: [
				"evm to stellar usdc deposit",
				"cctp deposit forwarder stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/stellar-demo-wallet": [
		{
			note: "SDF's Stellar Demo Wallet, hosted at demo-wallet.stellar.org — a front end for interactively testing anchor SEP interoperability (automated anchor testing lives in stellar/stellar-anchor-tests); defaults to testnet, mainnet via HORIZON_PASSPHRASE/HORIZON_URL in env-config.js; latest release v3.0.0 (2025-09-10); the 'Build a Stellar Wallet' tutorial it was created for moved to stellar/docs-wallet (README read 2026-09-14; Apache-2.0; last push 2026-09-09).",
			triggers: ["demo wallet anchor testing", "test anchor sep flows"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"NethermindEth/stellar-private-payments": [
		{
			note: "Nethermind's privacy-pools reference implementation for Stellar — WIP and not audited per its README: Groth16 (BN254) proofs from Circom circuits, browser-side WASM proving, Soroban contracts, SEP-0043 wallet signing, and Association Set Providers (ASPs) as the compliance control; demo at nethermindeth.github.io/stellar-private-payments; npm stellar-private-payments 0.1.0 (2026-09-03); repo tag circuits-v0.3 (2026-09-01) (README read 2026-09-14; Rust; Apache-2.0; last push 2026-09-12).",
			triggers: [
				"privacy pools stellar",
				"private payments zero knowledge stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/friendbot": [
		{
			note: "Friendbot, the testnet/futurenet XLM faucet: one REST endpoint (GET|POST / with addr=) that creates and funds accounts and — when configured with fund_contract_addresses + rpc_url — contract C… addresses; hosted at friendbot.stellar.org (testnet) and friendbot-futurenet.stellar.org; Quickstart serves it at localhost:8000/friendbot; merges to main deploy to testnet immediately (README read 2026-09-14; Go; Apache-2.0; no tagged releases; last push 2026-08-28).",
			triggers: [
				"testnet faucet",
				"fund a testnet account",
				"friendbot contract address",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/freighter-backend-v2": [
		{
			note: "Freighter's next-generation backend, written in Go, PostgreSQL-backed; the TypeScript stellar/freighter-backend (indexer integration layer) is still active alongside it (last push 2026-09-04). Releases are Docker images cut by a two-step prerelease → promote GitHub Actions flow into an internal registry — no GitHub releases (README read 2026-09-14; last push 2026-09-08).",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"gateway-fm/oz-policy-builder": [
		{
			note: "OpenZeppelin Accounts Policy Builder for Soroban: record a transaction (on-chain by hash or locally simulated) and synthesize a minimum-permission context rule plus a validated policy composition as human-readable Rust implementing the OpenZeppelin Policy trait — deterministic, fail-closed, nothing deployed automatically. An SCF-funded project; its Tranche 1 surface (recorder → PolicySpec → synthesizer → codegen, a reference evaluator and MCP ops) shipped as v0.1.0 on 2026-09-03 (README read 2026-09-14; Rust; Apache-2.0; last push 2026-09-08).",
			triggers: [
				"openzeppelin policy builder",
				"smart account policy from transaction",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Scopuly/x402-stellar-guard": [
		{
			note: "npm @scopuly/x402-stellar-guard 0.1.0 (2026-08-13; public preview, not audited per its README): the wallet-side safety layer for x402 v2 payments on Stellar — strict PAYMENT-REQUIRED parsing, HTTPS origin binding, network / SEP-41 asset / recipient / amount / fee-sponsorship policy, exact CAP-71 transfer decoding and byte-level binding of the authorization entry to the reviewed intent; scoped to Stellar 'exact' payments with explicit user approval (README read 2026-09-14; Apache-2.0; last push 2026-09-13).",
			triggers: ["x402 wallet safety", "x402 payment policy stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Smart-Treasury-Account-STA/sdk": [
		{
			note: "npm sta-sdk 0.2.1 (2026-09-10): TypeScript SDK for the Smart Treasury Account Soroban contracts — smart_account custom-authorization (Entry A / Entry B) construction, prepare → simulate → sign → submit → poll, typed #[contractevent] parsing and typed state reads (policy version, replay nonce, recovery state); targets the live testnet and mainnet deployments; peer dependency @stellar/stellar-sdk >= 16 (README read 2026-09-14; MIT; no GitHub releases; last push 2026-09-10).",
			triggers: ["smart treasury account sdk", "sta sdk soroban"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Fundable-Protocol/fundable-sdk": [
		{
			note: "npm @fundable/sdk 0.2.3 (2026-09-14; the repo's last tag v0.1.0 of 2026-07-26 lags npm): multichain TypeScript SDK for Fundable token streams and distributions — Stellar is the first implemented chain adapter and the public domain types deliberately carry no Soroban-specific values; 0.x API, docs on GitBook (README read 2026-09-14; MIT; last push 2026-09-13).",
			triggers: ["fundable token streams", "fundable sdk stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"aguilar1x/stellar-confidential-token-sdk": [
		{
			note: "npm stellar-confidential-token-sdk 0.1.9 (2026-08-06; = repo tag v0.1.9): TypeScript client for OpenZeppelin Confidential Tokens on Stellar (OpenZeppelin/stellar-contracts) plus a verifiable archive; its README reports the conformance suite reproduces all 17 of OpenZeppelin's published fixtures byte-for-byte and that building it surfaced three defects, all closed; live demo and docs on Vercel (README read 2026-09-14; Apache-2.0; last push 2026-08-08).",
			triggers: [
				"confidential tokens client",
				"confidential token sdk stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/rs-stellar-archivist": [
		{
			note: "crates.io stellar-archivist 28.0.0 (2026-08-21; = repo tag v28.0.0): SDF's Rust tools to scan, mirror and repair Stellar History Archives over HTTP(S) or the filesystem; requires Rust 1.91+ (README read 2026-09-14; Apache-2.0; last push 2026-08-28).",
			triggers: ["history archive mirror", "stellar archivist"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/rs-stellar-strkey": [
		{
			note: "crates.io stellar-strkey 0.0.18 (2026-06-18; = repo tag v0.0.18): Rust library + CLI for encoding and decoding Stellar strkeys; the README still carries the 'early development, API unstable, breaking changes frequently' banner (read 2026-09-14; Apache-2.0; last push 2026-08-30).",
			triggers: ["strkey rust", "decode strkey"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/dashboard": [
		{
			note: "Source of dashboard.stellar.org, SDF's network dashboard — a JavaScript app on Node 22 with no tagged releases (README read 2026-09-14; 238 stars; last push 2026-09-03).",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"runtimeverification/komet": [
		{
			note: "Runtime Verification's fuzzing + formal-verification framework for Soroban contracts: property tests written in Rust, fuzzing over randomized inputs and symbolic execution to prove properties across all inputs; frequent tagged releases (v0.1.89 on 2026-08-20) (README read 2026-09-14; BSD-3-Clause; 35 stars; last push 2026-08-20).",
			triggers: ["fuzz soroban contracts", "formal verification soroban"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"subquery/stellar-subql-starter": [
		{
			note: "SubQuery's starter/example indexer project for Stellar and Soroban (bootstrap with `npm i -g @subql/cli` and `subql init`; works across Stellar's networks) — a template, not a maintained product: no releases, last push 2026-01-22 (README read 2026-09-14).",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Inferara/soroban-ret": [
		{
			note: "Soroban smart-contract reverse-engineering tool from Inferara, listed under the Stellar Security Portal dev tools: a five-stage pipeline decompiling contract WASM to Rust that compiles back for wasm32v1-none; its README (read 2026-09-14) states 38 of 39 fixtures round-trip and large mainnet contracts recover correct interfaces but only partial bodies — 'read the output as a reconstruction, not as the original source'; repo tag v0.0.4 (2026-07-26); Apache-2.0; last push 2026-08-06.",
			triggers: ["decompile soroban wasm", "soroban reverse engineering"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"eq-lab/pipeline": [
		{
			note: "Examined 2026-09-14: no README, no description, no topics; a v0.0.2 tag (2026-09-10) exists. Nothing durable to state publicly — revisit if a README lands.",
			visibility: "internal",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	// ── P5 wave 5 (2026-09-14): next 12 of the curated-pool repos without a note.
	"OpenZeppelin/role-manager": [
		{
			note: "OpenZeppelin's Role Manager (rolemanager.openzeppelin.com): an access-control management interface for OpenZeppelin Access Control contracts across chains — visualize roles and permissions and execute administrative actions; latest release v3.0.0 (2026-08-25); the README marks the project 'currently in development' (read 2026-09-14; TypeScript; AGPL-3.0; 9 stars; last push 2026-09-01).",
			triggers: ["openzeppelin role manager"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"xcapit/shelter": [
		{
			note: "Shelter: humanitarian-aid disbursement on smart contracts — donors fund a Shelter with tokens such as USDC and stewards (NGOs, community partners) control who can access aid, when and how; the README marks it Work in Progress; last release ltw_service-v1.2.0 (2025-09-10) and last push 2025-09-19 — no activity for a year (read 2026-09-14; TypeScript; AGPL-3.0; 17 stars).",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"JosueBrenes/stellar-agent-pay": [
		{
			note: "npm stellar-agent-pay 0.1.1 (2026-08-03; = repo tag v0.1.1): a Stellar CLI plugin (`stellar agent-pay unlock <url>`) that lets an AI agent pay x402 402-gated HTTP resources in USDC under a user-controlled spending policy with a readable audit trail; the README walkthrough runs on stellar:testnet (read 2026-09-14; MIT; last push 2026-09-14).",
			triggers: ["agent pay x402 cli", "ai agent pay usdc stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellarchain/io.stellarkey": [
		{
			note: "StellarKey (stellarkey.io): an open-source, backend-free self-custodial Stellar wallet and local-first point of sale — Next.js 16, React 19, @stellar/stellar-sdk 17, shipped as a static export so keys, wallet records and merchant data stay on the user's device; v1.0.2 (2026-09-14) (README read 2026-09-14; AGPL-3.0; last push 2026-09-14).",
			triggers: ["stellarkey wallet", "self-custodial wallet point of sale"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"untangledfinance/oz-policy-builder": [
		{
			note: "npm @crediolabs/policy-synth 1.3.0 (2026-09-01): records a Soroban transaction and synthesizes the minimal policy an OpenZeppelin Stellar smart account then enforces on every call ('this key may only call transfer on USDC, never more than 50 at a time, only to these addresses') — an off-chain synthesizer plus the on-chain predicate. Not the same project as gateway-fm/oz-policy-builder (Rust, SCF Tranche 1), which shares the name and the goal (README read 2026-09-14; TypeScript; MIT; no GitHub releases; last push 2026-09-01).",
			triggers: ["policy synth openzeppelin", "crediolabs policy"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"perspectivefi/spectra-core-stellar-public": [
		{
			note: "Public clone of Spectra's Soroban yield-tokenization core contracts; the README states the production contracts correspond to the audited source revision documented in the included Certora audit (audit/README.md); Rust, builds to wasm32v1-none, sibling contracts embedded via include_bytes! (README read 2026-09-14; license NOASSERTION; no releases; last push 2026-08-10).",
			triggers: ["spectra stellar contracts", "yield tokenization soroban"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Stellar-Light/stellarlight": [
		{
			note: "The source of stellarlight.xyz — the Stellar ecosystem data layer (projects, repos, builders, hackathons, a research corpus) served to people and to agents through /api/* with an OpenAPI spec at /api/openapi.json; Next.js 16 + Payload CMS on MongoDB; ARCHITECTURE.md documents the code-verified mechanics (README read 2026-09-14; MIT; no tagged releases; last push 2026-09-14).",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/supercluster": [
		{
			note: "Stellar Supercluster (SSC): SDF's stellar-core integration-test automation — runs containerized core nodes in self-contained simulated networks on Kubernetes and drives traffic or core's internal load generation; the second-generation tool that replaced the retired Stellar Core Commander (SCC) (README read 2026-09-14; F#; no releases; last push 2026-09-08).",
			triggers: ["stellar core integration testing", "supercluster"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"axis-markets/js-client": [
		{
			note: "npm @axis-markets/client 0.5.0 (2026-09-13): JavaScript SDK for the AXIS Stellar DEX — AxisContractClient wraps the on-chain AXIS contract (sign and send, read orders) and AxisApiClient is a dependency-free HTTP client for the aggregator/indexer REST API (quotes, orderbook depth, candles, ticker, market/order/trade data) (README read 2026-09-14; MIT; no GitHub releases; last push 2026-09-13).",
			triggers: ["axis dex sdk", "axis markets client"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Creit-Tech/sorobandomains-sdk-js": [
		{
			note: "@creit-tech/sorobandomains-sdk is published on JSR, not npm (jsr latest 1.0.4 = repo tag v1.0.4, 2026-01-09; installed with `npx jsr add`): an SDK to search registered domains in the SorobanDomains registry contract (sorobandomains.org) (README read 2026-09-14; TypeScript; MIT; last push 2026-01-09).",
			triggers: ["soroban domains sdk", "sorobandomains lookup"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"blend-capital/blend-utils": [
		{
			note: "Deployment and utility scripts for the Blend Protocol — deploying the contracts and setting up mock environments; no releases, last push 2025-12-18 (README read 2026-09-14; TypeScript; MIT).",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"script3/soroban-governor": [
		{
			note: "Soroban Governor: a Governor-style DAO governance framework for Soroban modeled on the OpenZeppelin Governance system, with its audits in the repo's audits/ folder; last release v1.1.1 (2024-07-09) and no push since 2024-07-09 — the contracts are dormant while the sibling repos moved on (script3/soroban-governor-ui last push 2026-05-17, soroban-governor-js-sdk 2025-07-18) (README read 2026-09-14; Rust; MIT; 17 stars).",
			triggers: ["soroban governor dao", "governance framework soroban"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	// ── P5 wave 6 (2026-09-14): the last 18 curated-pool repos without a note.
	"DcentWallet/dcent-web-connector": [
		{
			note: "npm dcent-web-connector 2.0.0 (2026-08-27; = repo tag v2.0.0): the connector for integrating the D'CENT biometric hardware wallet into web apps through a popup served from v2bridge.dcentwallet.com; v2 developer guide at dev-docs.dcentwallet.com and a v1 (0.16.x) → v2 migration guide in the repo (README read 2026-09-14; MIT; 14 stars; last push 2026-09-11).",
			triggers: ["dcent hardware wallet connector"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"HelixLabsDev/helix-mongolian-spring": [
		{
			note: "Helix Stellar — Soroban core contracts for cross-chain LST-collateral lending on Stellar; an SCF #41 Build Award project per its README; no releases, no license file, last push 2026-05-15 (read 2026-09-14; Rust).",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"TrustLine-id/stellar-validation-engine": [
		{
			note: "Trustline's Validation Engine for Stellar: a set of Soroban contracts for compliance and validation solutions, integrating Trustline's oracle with multiple on-chain data sources; developed with Stellar Community Fund support per its README; trust model, key custody and replay protection documented in SECURITY.md (read 2026-09-14; Rust; GPL-2.0; no releases; last push 2026-09-03).",
			triggers: ["trustline validation engine"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"zenith-protocols/vault-ui": [
		{
			note: "Examined 2026-09-14: the README is the unmodified create-next-app template, no description, no releases, last push 2025-07-22 — nothing durable to state publicly.",
			visibility: "internal",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Gabrielpatrola/stellar-x402-middleware": [
		{
			note: "npm stellar-x402-middleware 0.4.0 (2026-08-14; = repo tag v0.4.0): Express and Hono middleware that adds x402-paywalled API routes settled on Stellar — `stellarPaywall({ payTo, price })` (README read 2026-09-14; last push 2026-08-14).",
			triggers: ["x402 middleware express", "paywall api routes stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"perspectivefi/spectra-stellar-bridge-public": [
		{
			note: "Spectra's Principal Token bridge between EVM chains and Stellar (BUSL-1.1), powered by Axelar GMP with a LayerZero V2 adapter available: lock PTs on EVM → wrapped PTs on Stellar, burn wrapped → unlock, and native Stellar PTs → wrapped ERC20s on EVM (Solidity; README read 2026-09-14; no releases; last push 2026-08-03).",
			triggers: ["spectra bridge stellar", "principal token bridge"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/stellar-community-fund-contracts": [
		{
			note: "Neural Quorum Governance contracts — the on-chain voting used by the Stellar Community Fund, plus the Rust 'neurons' modules that feed it; the README states the code is unaudited and under development; last release v1.0.3 (governance pkg 0.1.0, 2026-07-24) (read 2026-09-14; Rust; 12 stars; last push 2026-09-14).",
			triggers: ["neural quorum governance", "scf voting contracts"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/helm-charts": [
		{
			note: "SDF's Helm charts (`helm repo add stellar https://helm.stellar.org/charts`) — the README lists the Horizon API server chart; the last tagged chart release, 0.3.97, dates from 2023-08-09 while the repo still receives pushes (last 2026-09-11) (read 2026-09-14; Go Template; 3 stars).",
			triggers: ["horizon helm chart"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Gabrielpatrola/agent-pay-stellar": [
		{
			note: "npm agent-pay-stellar 1.0.0 (2026-08-09; = repo tag v1.0.0): a CLI + TypeScript library for agents and shell workflows to inspect and pay Stellar x402-gated URLs (request → 402 → inspect → enforce policy → authorize → sign → retry → unlock), built on the official @x402/fetch and @x402/stellar lifecycle with a safety/automation layer around it (README read 2026-09-14; last push 2026-08-09).",
			triggers: ["agent pay stellar cli"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"soroswap/aggregator": [
		{
			note: "Soroswap Aggregator — Soroban contracts that aggregate liquidity across Soroban AMMs through adapters (Soroswap, Phoenix); audited by Runtime Verification (report dated 2024-08-31 in audits/); mainnet addresses published in public/mainnet.json; last push 2025-12-22 (README read 2026-09-14; Rust; Apache-2.0; 6 stars).",
			triggers: ["soroswap aggregator", "dex aggregator soroban"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/streamhash": [
		{
			note: "StreamHash: SDF's Go library for building and querying Minimal Perfect Hash Function indexes over billions of keys with bounded RAM (1B+ keys in roughly 1–75 MB) and streaming, parallel construction; v0.1.0 (2026-08-04) (README read 2026-09-14; Apache-2.0; last push 2026-09-09).",
			triggers: ["minimal perfect hash stellar", "streamhash"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Creit-Tech/Stellar-Router-SDK": [
		{
			note: "Stellar Router: a Soroban contract plus SDK to execute several contract calls in one transaction — Soroban allows a single operation per transaction, the router batches the calls; the SDK is published on JSR as @creit-tech/stellar-router-sdk (0.3.0 latest) (README read 2026-09-14; TypeScript; MIT; 6 stars; no GitHub releases; last push 2026-08-23).",
			triggers: ["batch soroban calls one transaction", "stellar router sdk"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"eq-lab/slender": [
		{
			note: "Slender: a pool-based lending protocol on Soroban — suppliers receive interest-accruing sTokens; no releases; last push 2025-10-03 (README read 2026-09-14; Rust; MIT; 7 stars).",
			triggers: ["slender lending soroban"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/freighter-developer-docs": [
		{
			note: "Source of Freighter's developer documentation (Freighter is SDF's non-custodial wallet: browser extension + mobile app) — connecting a dapp with a single call, signing authorization entries for contract calls and arbitrary messages; no releases; last push 2026-06-04 (read 2026-09-14).",
			triggers: ["freighter developer docs", "integrate freighter dapp"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"karagozemin/QuietBook": [
		{
			note: "QuietBook: confidential bookbuilding rounds for tokenized RWAs on Stellar — issuers run a round without exposing investor bids or balances; live demo on Vercel, with a judge runbook and testnet evidence under docs/ (a hackathon-style deliverable) (README read 2026-09-14; TypeScript; 2 stars; no releases; last push 2026-08-07).",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/freighter-protocol-icons": [
		{
			note: "The icon set Freighter shows for supported protocols — PNG icons at 96×96 plus background images, contributed by pull request under the README's image specs (read 2026-09-14; last push 2026-09-02).",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/product-conventions": [
		{
			note: "SDF's frontend product conventions — the goals, scope and ethos its product team applies to Stellar user interfaces; last release v2.3.0 (2024-03-13); last push 2026-07-01 (read 2026-09-14; JavaScript; 10 stars).",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"CometDEX/comet-contracts-v1": [
		{
			note: "Comet's Soroban contracts (AGPL-3.0); latest release v1.1.0 (factory pkg 1.0.0, 2026-09-11); the README is a build-and-test stub (read 2026-09-14; Rust; 10 stars; last push 2026-09-11).",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	// ── P5 wave 7 (2026-09-14): repoScore 40–49 band, top 30 without a note.
	"stellar/laboratory-backend": [
		{
			note: "Contract Data API — SDF's Node.js REST API for managing contract data (Express.js 5 + Prisma ORM on PostgreSQL, TypeScript, pnpm); its API design doc lives in stellar/platform-design-docs (contract-data-api branch) per the README; no license file, no releases (README read 2026-09-14; 1 star; last push 2026-08-27).",
			triggers: ["contract data api", "laboratory backend"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/freighter-website": [
		{
			note: "Examined 2026-09-14: the README is the unmodified create-next-app template; GitHub description 'Freighter website'; no license, no releases; last push 2026-07-01 — nothing durable to state publicly.",
			visibility: "internal",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Templar-Protocol/contracts": [
		{
			note: "Templar Protocol's core repository — an overcollateralized lending protocol (templarfi.org): a Rust workspace holding the deployable contracts, shared protocol logic, off-chain services and bots, operator CLI tools, client libraries, fuzz targets and an audits/ directory of auditor-facing notes; the README carries Test, Kani and Codecov workflow badges; releases are per-crate via release-plz — latest templar-liquidator-v0.1.7 (2026-09-01); tag v1.3.0 (2026-02-11) (README read 2026-09-14; GPL-3.0; 10 stars; last push 2026-09-14).",
			triggers: ["templar lending protocol", "templar contracts"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-expert/tx-meta-effects-parser": [
		{
			note: "npm @stellar-expert/tx-meta-effects-parser 10.1.1 (2026-08-28): StellarExpert's low-level effects parser — `parseTxOperationsMeta({network, tx, result, meta, …})` derives the atomic ledger state changes directly from a transaction's result and meta XDR instead of Horizon's /effects, with options for Soroban system events, SAC mapping, failed-op effects and contract metrics (README read 2026-09-14; MIT; last push 2026-08-28).",
			triggers: ["tx meta effects parser", "effects from transaction meta"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"armandocodecr/latam-ramp-kit": [
		{
			note: "LATAM Ramp Kit — SDK + React components for adding fiat on/off-ramps to apps in Latin America, built for the Stellar 'Brazil Ramps and Regional Kits' sub-lane per its README, which documents BRL in via PIX and out again on Stellar testnet through the Etherfuse sandbox; npm @ramp-kit/core 0.1.7, @ramp-kit/react 0.1.6, @ramp-kit/server 0.1.5 and @ramp-kit/mcp 0.1.9 (all published 2026-08-21), the last an MCP server also listed in the MCP Registry (README read 2026-09-14; MIT; no releases; last push 2026-08-21).",
			triggers: [
				"latam ramp kit",
				"fiat ramp latin america",
				"brazil pix stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-expert/stellar-tx-signers-inspector": [
		{
			note: "npm @stellar-expert/tx-signers-inspector 2.0.0 (2026-08-30): StellarExpert's library to discover the required signers and weights for a Stellar transaction or account and build an optimal signature schema — `inspectTransactionSigners(tx)` / `inspectAccountSigners(…)`, with `getAllPotentialSigners()` listing every signer across the source accounts (README read 2026-09-14; MIT; 5 stars; last push 2026-08-30).",
			triggers: ["required signers transaction", "signers inspector"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"lightsail-network/stellar-inspect": [
		{
			note: "npm stellar-inspect 0.1.0 (2026-09-09; = repo tag v0.1.0): Lightsail's library that finds the Stellar Asset Contracts (SACs) referenced by a transaction or by Soroban authorization entries and reports which asset each wraps — `findSacs(input, { networkPassphrase })` walks the invoked contracts, Address-typed arguments, the auth tree, the footprint and createContract ops; ES modules, installed alongside @stellar/stellar-sdk (README read 2026-09-14; MIT; last push 2026-09-09).",
			triggers: ["find sacs transaction", "stellar inspect"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"TrustLine-id/stellar-sdk": [
		{
			note: "Trustline Stellar SDK — crates.io trustline-sdk 0.1.0 (2026-09-03; = repo tag v0.1.0): a Rust/Soroban SDK for guarding contracts against unauthorized access — a contract calls `require_trustline(…)` before sensitive operations against a deployed Validation Engine instance (transaction validation, on-chain sanctions checks, address verification), with Payment Forwarder and Firewall gateway examples; an SCF #44 project per its README (README read 2026-09-14; MIT; last push 2026-09-03).",
			triggers: ["trustline sdk", "sanctions check soroban"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"mpprouter/rozo-mpprouter": [
		{
			note: "MPP Router — a Cloudflare Worker exposing a stable public API for paid services over a Stellar-based (USDC) payment flow, with idempotent automatic refunds on non-delivery and an on-chain escape hatch for channel funders to recover an unused channel balance without the Router; v0.2.2 (2026-09-14) made it a multi-operator router with self-serve provider onboarding, direct settlement to providers' own Stellar keys and a HackenProof security review attached to the release (README read 2026-09-14; BSD-2-Clause; last push 2026-09-14).",
			triggers: ["mpp router"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"AquariusDeFi/aqua-governance": [
		{
			note: "Backend API for the Aquarius DAO (gov.aqua.network): a Python 3.10 / Django 3.2 + DRF + Celery service running the proposal lifecycle — creation, discussion, weekly voting-slot booking, on-chain voting via AQUA / governICE / gdICE claimable balances sent to per-proposal accounts, quorum-checked tallying, and Soroban asset-registry execution for asset proposals; reads Horizon and Soroban RPC (README read 2026-09-14; BUSL-1.1; 2 stars; no releases; last push 2026-09-03).",
			triggers: ["aquarius governance backend", "aqua dao voting"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Phoenix-Protocol-Group/phoenix-nft-marketplace": [
		{
			note: "Examined 2026-09-14: no README; GitHub description 'NFT marketplace with auctions and collections interface'; a Rust workspace (contracts/, helpers/), GPL-3.0, no releases or tags; last push 2026-04-11 — nothing durable to state publicly.",
			visibility: "internal",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"CometDEX/frontend-v1": [
		{
			note: "Examined 2026-09-14: the README is a two-line stub ('Comet Pool Frontend — frontend to be able to interact with the soroban contracts'); no description, no license, no releases; last push 2023-08-13 — nothing durable to state publicly.",
			visibility: "internal",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-broker/router-contract": [
		{
			note: "StellarBroker's router contract (Rust/Soroban): executes the multi-hop swaps prepared by the StellarBroker Router service (stellar.broker) across Stellar liquidity-pool protocols — Aquarius, Soroswap, Comet, Phoenix and SushiSwap per its README; audits/ holds a Runtime Verification report dated 2025-04-28; no releases (README read 2026-09-14; MIT; last push 2026-07-26).",
			triggers: ["stellarbroker router contract", "stellar broker swap router"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-broker/ui": [
		{
			note: "Examined 2026-09-14: no README; GitHub description 'Website UI for StellarBroker service' (stellar.broker); JavaScript/webpack, MIT, no releases; last push 2026-03-11 — nothing durable to state publicly.",
			visibility: "internal",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Trustless-Work/trustlesswork-indexer-go": [
		{
			note: "Trustless Work's official indexer (Go 1.25+): follows the Stellar ledger stream over RPC, detects activity on Trustless Work escrow contracts (events, deposits, state changes; escrow discovery by approved WASM hash) and publishes versioned envelopes to RabbitMQ for the core API — with an ordered multi-RPC failover pool, a durable cursor + watchlist, gap evidence for skipped ranges and at-least-once delivery under deterministic message ids; no license file, no releases (README read 2026-09-14; 4 stars; last push 2026-09-04).",
			triggers: ["trustless work indexer", "escrow indexer stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"untangledfinance/untangled-web": [
		{
			note: "npm untangled-web 1.0.134 (2025-12-26; = repo tag 1.0.134): Untangled Finance's TypeScript backend framework for its platform — a Bun.serve HTTP server with decorator-based IoC (@Module / @Controller / @Bean), filters, CORS, MongoDB and PostgreSQL connectors, Redis caching and queues, cron jobs and JWT auth with RBAC; nothing Stellar-specific in the framework itself (README read 2026-09-14; no license file; no GitHub releases; last push 2026-08-27).",
			triggers: ["untangled web framework"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"soroswap/docs": [
		{
			note: "Source of docs.soroswap.finance — a Mintlify site (docs.json, tabs Documentation / API / Smart Contracts) covering, per its GitHub description, the Soroswap AMM, the Soroswap Aggregator and the Spacewalk bridge implementation; content directories getting-started, amm, aggregator, api, concepts, tutorials and resources; no README, no license file (read 2026-09-14; MDX; 2 stars; last push 2026-09-06).",
			triggers: ["soroswap docs", "soroswap documentation"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"reflector-network/reflector-subscription-encryption": [
		{
			note: "Examined 2026-09-14: no README; GitHub description 'Encryption primitives for Reflector subscriptions'; JavaScript, no license, tags to v1.1.0 (2024-07-18); last push 2024-07-24 — nothing durable to state publicly.",
			visibility: "internal",
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"reflector-network/reflector-stellar-connector": [
		{
			note: "@reflector/stellar-connector — the Stellar asset price-feed connector for the Reflector oracle backend: `aggregateTrades({rpcUrl, baseAsset, assets, from, period, limit})` aggregates trades per period from a Soroban RPC that has getTransactions and getLatestLedger enabled; not on npm — the README installs it as a GitHub dependency pinned to a tag; tags reach v4.1.7 (2026-08-27) and v4.2.0-rc2 (2026-09-10) (README read 2026-09-14; MIT; last push 2026-09-10).",
			triggers: [
				"reflector stellar connector",
				"reflector price feed connector",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"kunaldrall29/policywright": [
		{
			note: "Policywright turns a transaction a user already performed (or simulated) into the least-privilege OpenZeppelin smart-account authorization that permits exactly that flow — a context rule scoped to the observed (contract, function) pairs plus minimal spending-limit and frequency-limit policies — emitted as spec.json, an installable context-rule.json, a summary and an illustrative Rust policy, with a dry-run simulator; the worked example is a Blend emissions claim followed by a Soroswap BLND→USDC swap; hosted at policywright.lemmalabs.space (README read 2026-09-14; TypeScript; MIT; no releases; last push 2026-09-11).",
			triggers: ["policywright smart account", "least privilege smart account"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-expert/contract-wasm-interface-parser": [
		{
			note: "npm @stellar-expert/contract-wasm-interface-parser 6.0.1 (2026-08-29): StellarExpert's lightweight parser that reads a Soroban contract's interface metadata straight from its binary WASM — `parseContractMetadata(Buffer)` returns the parsed interface (the README's example shows unions and structs with their cases and fields) (README read 2026-09-14; MIT; last push 2026-08-29).",
			triggers: ["parse contract interface wasm", "wasm interface parser"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/actions": [
		{
			note: "SDF's shared GitHub Actions and reusable workflows for @stellar repositories (`uses: stellar/actions/<dir>@main`) — rust-cache, rust-set-rust-version, rust-check-git-rev-deps, rust-bump-version, rust-publish and rust-publish-dry-run(-v2), disk-cleanup, sdf-ecr-login and sdf-pr-preview, plus a README-rust-release guide; the README warns they are not suitable outside @stellar repos and not safe under pull_request_target (README read 2026-09-14; Apache-2.0; 4 stars; no releases; last push 2026-08-30).",
			triggers: ["stellar github actions", "reusable workflows stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"theahaco/rs-sep5": [
		{
			note: "crates.io sep5 0.1.0 (2026-04-10; = GitHub release v0.1.0): a Rust implementation of SEP-0005, Key Derivation Methods for Stellar Keys (the crate's repository URL still uses the repo's former ahalabs/ path, which redirects here) (README read 2026-09-14; Apache-2.0; last push 2026-07-27).",
			triggers: ["key derivation rust", "sep 5 rust"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"honti0078-code/Hatiin": [
		{
			note: "Hatiin (Tagalog for 'to split') — a bill-splitting app on Stellar: a Next.js frontend with a Soroban SplitEscrow contract, live at hatiin-stellar.vercel.app on mainnet (contract and explorer links in the README) alongside a testnet deployment; the README is a program submission checklist (50-user proof, feedback log, pitch deck); v1.0.0 (2026-08-10) (README read 2026-09-14; TypeScript; MIT; last push 2026-08-27).",
			triggers: ["hatiin bill split"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"meokhay-ai/Tabungan": [
		{
			note: "Tabungan — a Stellar app built around a FamilyVault Soroban contract: a Next.js frontend live at tabungan-stellar.vercel.app; the README is a program submission checklist ('Level 5' evidence, 50-user cohort) whose on-chain proof references the testnet contract, with a mainnet deployment recorded in contracts/DEPLOYMENT.md; v1.0.0 (2026-08-10) (README read 2026-09-14; TypeScript; MIT; 1 star; last push 2026-08-27).",
			triggers: ["tabungan family vault"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"RozoAI/rozo-checkout-skill": [
		{
			note: "npm @rozoai/checkout 0.1.10 (2026-08-11): `npx @rozoai/checkout pay <coinbase-link>` pays an OpenRouter Coinbase Payment Link (which itself accepts only USDC on Base) with BTC over Lightning or USDT/USDC on Solana, BNB Chain, Ethereum, Polygon, Base or Stellar (usdc-stellar, MEMO_TEXT required) by routing through a bridge and a funder wallet — no account, API key or private key; also packaged as a Claude Code skill (SKILL.md); GitHub release v0.1.6 (2026-08-11) (README read 2026-09-14; MIT; last push 2026-08-28).",
			triggers: ["pay openrouter coinbase link", "rozo checkout"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Scopuly/scopuly-browser-extension": [
		{
			note: "Scopuly's Manifest V3 browser extension connecting Stellar dApps to a paired Scopuly signer (iOS/Android via QR pairing, or Scopuly for Mac): it injects `window.scopuly`, reviews transaction, message, Soroban authorization, submit and x402 receipt requests in the browser, forwards them to the signer and verifies the returned result before answering the dApp — secret keys never enter the extension; provider protocol 0.3.0; listed in the Chrome Web Store, Microsoft Edge Add-ons and Firefox Add-ons (the README names 0.3.2 as the store version); latest GitHub release v0.3.4 (2026-08-18) (README read 2026-09-14; TypeScript; MIT; last push 2026-08-18).",
			triggers: ["scopuly extension", "scopuly browser signer"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"zenith-protocols/relayer-plugin-zenex": [
		{
			note: "npm @zenith-protocols/relayer-plugin-zenex 0.1.1 (2026-08-01): an OpenZeppelin Relayer plugin for the Zenex transaction relay — prepares and submits router transactions (auth discovery, Chainlink Data Streams report injection, fee enforcement) and delegates final submission to the embedded @openzeppelin/relayer-plugin-channels handler in-process; ships a typed ZenexClient; requires OpenZeppelin Relayer v1.4.0+ with a Stellar network config and Chainlink Data Streams credentials (README read 2026-09-14; MIT; no releases; last push 2026-09-10).",
			triggers: ["zenex relayer plugin", "chainlink data streams relayer"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"idos-network/nitro-enclave-experiment": [
		{
			note: "idOS's AWS Nitro Enclave experiment — its Trusted Execution Environments: a facesign-service built on the FaceTec SDK and an entropy-service, built as enclave images (EIF) on an EC2 instance provisioned with Terraform, with an operator runbook and an open TODO list in the README; no license, no releases (README read 2026-09-14; TypeScript; last push 2026-09-10).",
			triggers: ["idos nitro enclave", "idos tee"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"winsznx/routedock": [
		{
			note: "RouteDock — a unified payment execution layer for agents on Stellar: `client.pay(url)` selects x402, MPP charge or MPP session channels (incl. WebSocket) from the provider's routedock.json manifest, so one SDK covers the three agent-payment protocols; npm @routedock/routedock 0.1.2 (2026-04-13) while the monorepo keeps moving (last push 2026-09-14); homepage routedock.xyz (README read 2026-09-14; TypeScript; MIT; 7 stars; no releases).",
			triggers: [
				"routedock payment",
				"x402 mpp one call",
				"unified agent payments stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	// ── P5 wave 8 (2026-09-14) — the next 25 curated-pool repos with no entry,
	// best-scoring first (pool: source != ec-taxonomy, repoScore >= 30, not
	// archived; 524 of 1,093 carried none). Every fact below was read on
	// 2026-09-14 from the repo's own GitHub metadata, its README, its releases,
	// or a package registry whose `repository` points back at that repo.
	"axelarnetwork/axelar-amplifier-stellar": [
		{
			note: "Axelar's cross-chain gateway protocol (CGP) implemented in Soroban for Stellar — the README points at axelarnetwork/cgp-spec for the reference Solidity contracts, publishes workspace rustdocs at axelarnetwork.github.io/axelar-amplifier-stellar, and pins `cargo install --locked stellar-cli --version 25.2.0` for deployment; newest tag stellar-axelar-example-v1.0.10 (2026-06-15) (README read 2026-09-14; Apache-2.0; 11 stars; last push 2026-09-09).",
			triggers: [
				"axelar stellar gateway",
				"cross-chain gateway soroban",
				"axelar amplifier stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Trustless-Work/trustlesswork-smart-contract-stellar": [
		{
			note: "The Soroban escrow contracts behind Trustless Work (trustlesswork.com): a platform integrates escrows into its own user flow and funds are held until milestones are approved by the client, denominated in stablecoins such as USDC; the README links an API reference (docs.trustlesswork.com) and an on-chain contract reference at docs/CONTRACT_REFERENCE.md (README read 2026-09-14; no license file; 25 stars; no releases; last push 2026-09-09).",
			triggers: [
				"trustless work escrow",
				"milestone escrow stellar",
				"permissionless escrow soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"reflector-network/reflector-dao-contract": [
		{
			note: "The DAO contract of the Reflector oracle network (reflector.network). Its README documents the whole interface: `config(e, ContractConfig)` at deployment, `unlock(e, developer, operators)` which releases the weekly token distribution to the developer organisation and operators and requires admin, `available(e, claimant) -> i128`, and a claim entry point; newest tag v1.1.0_reflector-dao-contract_cli22.0.1 (2024-12-11) (README read 2026-09-14; MIT; last push 2025-10-20).",
			triggers: [
				"reflector dao contract",
				"reflector token unlock",
				"dao weekly unlock stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"reflector-network/contract-client-js": [
		{
			note: "npm @reflector/contract-client 2.2.0 (published 2026-09-11; the package's repository field points back at this repo): the JavaScript client for Reflector's contracts — the Pulse and Beam price oracles, DAO governance and Flare price subscriptions. Every client takes the same parameters (publicKey, rpcUrl, a signTransaction callback for writes, contractId) and it declares a peer dependency on @stellar/stellar-sdk >= v17 (README read 2026-09-14; MIT; last push 2026-09-13).",
			triggers: [
				"reflector contract client",
				"pulse beam oracle client",
				"reflector javascript client",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"reflector-network/dao-client": [
		{
			note: "Client for the Reflector DAO contract (GitHub repo description; the README is empty and no package is published under this name as of 2026-09-14) — the DAO contract itself is reflector-network/reflector-dao-contract (metadata read 2026-09-14; MIT; last push 2026-09-04).",
			triggers: ["reflector dao client"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"reflector-network/reflector-node": [
		{
			note: "The node server each operator runs in the Reflector cluster, the decentralized Stellar price-feed oracle. Its README states the operating requirements: deploy the Reflector Oracle contract first, then protect it with a multisig account whose every signer is a distinct cluster node and whose master weight is 0, and give the node an app.config.json in its home directory; architecture is documented in docs/how-it-works.md. Newest release v0.12.9 (2026-08-27); nothing is published on npm under @reflector/reflector-node (README read 2026-09-14; MIT; last push 2026-08-27).",
			triggers: [
				"reflector node operator",
				"reflector cluster multisig",
				"price feed oracle node stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Tellus-Cooperative/stellar-paylink": [
		{
			note: "Non-custodial payment links for Stellar, published by Tellus Cooperative — a recipient names an amount and asset, shares a link or QR code, and the payer approves the transaction in their own wallet, with server-side on-chain verification. The README calls the product Stellar HareLink (the repository is named stellar-paylink) and badges it Stellar Testnet at v0.1.0-rc.1, its newest release (2026-09-12); demo at stellar-paylink-lac.vercel.app (README read 2026-09-14; MIT; last push 2026-09-12).",
			triggers: [
				"stellar payment link",
				"payment qr stellar",
				"harelink paylink",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"lumenbro/lumenjoule-sdk": [
		{
			note: "npm lumenjoule-sdk 1.2.0 (published 2026-03-13; the package's repository field points back at this repo): an x402 client SDK that gives an AI agent a self-custodial Stellar wallet with on-chain spend limits — the agent calls any x402-enabled API, the SDK detects the 402, signs a payment from the smart wallet and retries. The README states the signing key stays on the caller's device (Secure Enclave, encrypted file, or a Stellar keypair) and the server only wraps transactions for gas sponsorship, contrasting this with MPC wallets that hold key shards (README read 2026-09-14; MIT; last push 2026-03-17).",
			triggers: [
				"lumenjoule sdk",
				"agent spend limits stellar",
				"x402 self-custodial agent wallet",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"OpenZeppelin/relayer-plugin-x402-facilitator": [
		{
			note: "An OpenZeppelin Relayer plugin that implements the x402 facilitator API, exposing /verify, /settle and /supported under the Relayer's plugin router so an operator can serve x402 payments from a Relayer instance; the README states it works with the Coinbase x402 ecosystem (for example @x402/express) and that this version implements x402 v2, with v1 support only in earlier releases. Newest release v0.5.0 (2026-09-10) (README read 2026-09-14; AGPL-3.0; 3 stars; last push 2026-09-10).",
			triggers: [
				"x402 facilitator plugin",
				"openzeppelin relayer x402",
				"verify settle supported endpoints",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"OpenZeppelin/ui-builder": [
		{
			note: "OpenZeppelin's UI Builder (builder.openzeppelin.com): pick a contract function and it generates a React interface with wallet connect and multi-network support that can be exported as a complete app; its GitHub topics list stellar alongside evm, solana and midnight, and the README marks the project as still in development. Newest release v2.0.0 (2026-08-25) (README read 2026-09-14; AGPL-3.0; 48 stars; last push 2026-09-10).",
			triggers: [
				"ui builder contract",
				"generate contract frontend",
				"openzeppelin ui builder",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"soroswap/sdk": [
		{
			note: "npm @soroswap/sdk 0.5.0 (published 2026-08-11; the package's repository field points back at this repo): the official TypeScript SDK for Soroswap.Finance, which the README describes as the first DEX and exchange aggregator built on Stellar with contracts on Soroban. It authenticates with an API key and covers quotes, building transactions, sending them to the network, and liquidity management (README read 2026-09-14; README badges MIT, GitHub reports no license file; last push 2026-09-06).",
			triggers: [
				"soroswap sdk",
				"dex aggregator sdk stellar",
				"soroswap quote api",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"xycloo/xycloans": [
		{
			note: "XycLoans, a flash-loan and liquidity protocol for the Soroban VM by xyclooLabs (xycloo.com), which its README and GitHub description advertise as zero-fee borrowing with a liquidity side where investors earn yield; topics defi, lending, smart-contracts, soroban. No release has ever been published and the last push was 2024-12-09, so anything here describes the 2024 state of the protocol (README read 2026-09-14; no license file; 11 stars).",
			triggers: [
				"xycloans flash loan",
				"flash loans soroban",
				"zero fee flash loan",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"NibrasD/Stellar-VRF": [
		{
			note: "A verifiable-random-function oracle for Soroban built on BLS12-381 and the drand distributed randomness beacon: the README lays the workspace out as soroban-contract/ (the on-chain VRF oracle in Rust), oracle-worker/ (an off-chain TypeScript node), consumer-example/ and docs/, and describes on-chain verification through CAP-0059's `bls12_381_pairing_check` and `bls12_381_hash_to_g1`, drand quicknet binding with a round offset of at least 2 so only future rounds count, and storage TTL extension. No release, no GitHub description and 0 stars as of the read (README read 2026-09-14; no license file; last push 2026-09-14).",
			triggers: [
				"verifiable random function stellar",
				"vrf oracle soroban",
				"drand randomness stellar",
				"bls12-381 pairing soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-experimental/stellar-raven": [
		{
			note: "Stellar Raven (raven.stellar.org): a remote MCP server on Cloudflare Workers that exposes exactly two tools, `search` and `execute`, over a unified catalog of Stellar ecosystem services and skills. An agent discovers a capability with search, then calls execute with JavaScript that runs in a Dynamic Worker isolate with NO network access — every service call goes through a host-side adapter — and the server instructions carry a generated source-family micro-map so an agent can pick the grounding family before searching; design notes in PLAN.md (README read 2026-09-14; Apache-2.0; 7 stars; no releases; last push 2026-09-11).",
			triggers: [
				"stellar raven mcp",
				"raven search execute",
				"stellar mcp server agents",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"jadonamite/Chessify": [
		{
			note: "Chessify (playchessify.xyz): a free-to-play chess protocol where players stake free-to-mint CHESS tokens, the game is validated off-chain, and escrow, payout and Elo rating all live in one Soroban contract designed against SEP-41 assets. The README is explicit that the live deployments today are Stacks, Celo and Base and that Stellar is where the protocol is headed, so treat Stellar support as stated intent rather than a shipped deployment; the only tag is `stacks` (2026-03-22) (README read 2026-09-14; no license file; 1 star; last push 2026-09-03).",
			triggers: [
				"chessify chess wager",
				"chess elo contract soroban",
				"onchain chess stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"blend-capital/blend-ui": [
		{
			note: "The open-source web interface for the Blend lending protocol. Its README documents network-specific builds that all export to out/ — `.env.testnet` with `npm run build:testnet`, `.env.production` with `npm run build:mainnet`, and a standalone configuration — so a self-hosted Blend front end is a config choice, not a fork. Newest release v2.5.3 (2026-08-27) (README read 2026-09-14; MIT; last push 2026-08-27).",
			triggers: [
				"blend ui interface",
				"blend frontend selfhost",
				"blend protocol interface",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"reflector-network/admin-dashboard": [
		{
			note: "The admin dashboard interface for Reflector nodes (@reflector/admin-dashboard); the README is a single title line and nothing is published on npm under that name as of the read, so the repo itself is the only distribution (README read 2026-09-14; MIT; last push 2026-09-11).",
			triggers: ["reflector admin dashboard"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"reflector-network/reflector-subscription-client": [
		{
			note: "npm @reflector/subscription-client 0.5.3 (published 2025-08-15; the package's repository field points back at this repo): the client for Reflector's subscriptions service. Its README shows `getAvailableReflectorTickers('pubnet')` and `('exchanges')` for the quotable ticker lists and a SubscriptionClient that creates a subscription with a caller-supplied signing callback over @stellar/stellar-sdk (README read 2026-09-14; MIT; last push 2025-08-15).",
			triggers: [
				"reflector subscription client",
				"reflector tickers list",
				"price subscription stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"salazarsebas/stellar-agentgate": [
		{
			note: "stellar-agentgate: a `stellar-cli` plugin that puts a policy gate between an agent and a contract — the README's own diagram is Agent / MCP → Smart Wallet → agent-policy → target contract — and it records 2nd place in the 'CLI Plugins for Agents' bounty at Stellar Summit São Paulo; docs at acachete.mintlify.site. Newest release v0.2.0 (2026-08-06) (README read 2026-09-14; Apache-2.0; last push 2026-09-07).",
			triggers: [
				"agentgate policy plugin",
				"stellar cli plugin agents",
				"agent policy smart wallet",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"untangledfinance/credio-agents": [
		{
			note: "The Untangled OctoPos Agent (the README's name for this repo, which GitHub names credio-agents and leaves without a description): an autonomous agent that polls the Octopos RMS API at octopos.untangled.finance for risk assessments of Blend lending positions on Stellar and, when a position reaches EMERGENCY risk, builds and broadcasts the close transaction on-chain; it caches pre-signed close transactions and re-signs them every 5 minutes, and runs on Bun with the untangled-web framework (README read 2026-09-14; no license file; no releases; last push 2026-04-13).",
			triggers: [
				"octopos risk agent",
				"auto close blend position",
				"emergency risk blend stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"RozoAI/rozo-rewards-miniapp": [
		{
			note: "Rozo Rewards (rewards.rozo.ai), the merchant discovery and cashback surface of Rozo: the README describes it as a stablecoin payment platform for merchants built on Base, where a user discovers merchants and pays with USDC across multiple chains or through the Rozo Wallet on Stellar — so Stellar appears here as one payment path, not as the app's own chain (README read 2026-09-14; no license file; topics cashback, cryptopayments; no releases; last push 2026-09-14).",
			triggers: [
				"rozo rewards cashback",
				"rozo merchant discovery",
				"rozo wallet stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"soroswap/v2-frontend": [
		{
			note: "The Soroswap application front end at app.soroswap.finance: a Next.js 15 / React 19 app (Node >= 22) that provides swaps and liquidity pools through the Soroswap SDK and Stellar Wallets Kit, adds earning and farming through the @defindex/sdk integration, and routes cross-chain bridging through Rozo.ai (README read 2026-09-14; no license file; no releases; last push 2026-09-06).",
			triggers: [
				"soroswap frontend app",
				"soroswap liquidity pools ui",
				"stellar wallets kit dex",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-experimental/meridian-pay-sdp-backend": [
		{
			note: "A Meridian Pay fork of stellar/stellar-disbursement-platform-backend (the GitHub description states exactly that). Its README is the upstream Stellar Disbursement Platform README unchanged — badges, Swagger link and CI all still point at the stellar/ repository — so nothing in this repo describes what the fork itself changes; read the upstream project for SDP behaviour and the commit history here for the divergence (metadata and README read 2026-09-14; Apache-2.0; no releases; last push 2026-08-13).",
			triggers: ["meridian pay sdp", "disbursement platform fork"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"reflector-network/reflector-shared": [
		{
			note: "Triage 2026-09-14: empty README, no GitHub description, no published package and no releases — the repo states nothing durable about itself. It sits in the reflector-network org beside reflector-node and the client packages, so the name suggests shared internals, but that is an inference the repo does not support. Re-examine if it gains a package, a README or a release. https://github.com/reflector-network/reflector-shared",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"gateway-fm/lez-atomic-swaps": [
		{
			note: "Triage 2026-09-14: NOT a Stellar repo — a curation error to correct, not a note to publish. The README describes atomic swaps between native Bitcoin and LEZ using Taproot/MuSig2 adaptor signatures, witnessed escrow on LEZ, offer discovery over Logos Delivery and negotiation over Logos Chat; a GitHub code search for `stellar` across the repository returns 0 hits, and neither the description, the topics nor the release notes mention Stellar or Soroban. It is in the curated pool at repoScore 47 on the strength of the word `swap` alone. https://github.com/gateway-fm/lez-atomic-swaps",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	// ── P5 wave 9 (2026-09-14) — the next 25 curated-pool repos with no entry
	// (499 remained after wave 8). Same discipline: every fact read on
	// 2026-09-14 from the repo's own metadata, README, releases, or a registry
	// whose `repository` points back at it.
	"stellar/smart-wallet-demo-app": [
		{
			note: "SDF's smart-wallet demo app. Its README opens with a security policy that matters more than the demo: the repository is OUT OF SCOPE for the Stellar HackerOne program, is no longer actively maintained, receives no security patches, and vulnerability reports against it are closed as informational — so it is a reference to read, never a base to fork for production. The walkthrough wires the Stellar Disbursement Platform (create an API key with write permissions) to the wallet (README read 2026-09-14; no license file; 46 stars; no releases; last push 2026-08-26).",
			triggers: [
				"smart wallet demo",
				"passkey wallet demo stellar",
				"smart wallet demo maintained",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/soroban-quest": [
		{
			note: "Soroban Quest (quest.stellar.org/soroban): SDF's gamified Soroban course, where each quest is a Rust exercise completed in a GitHub Codespace and rewarded on completion; the README opens the repo directly in Codespaces and points learners at Discord when stuck. Series 5 art is in the README header; no release has been published (README read 2026-09-14; no license file; 9 stars; last push 2026-08-25).",
			triggers: [
				"soroban quest learn",
				"learn soroban course",
				"stellar quest soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/binaries": [
		{
			note: "The @stellar org's binary cache: this repo precompiles tools and stores them in GitHub Releases for the org's CI jobs, consumed as `uses: stellar/binaries@v10` with a `name` (for example cargo-set-rust-version) where the tag identifies the release to download from. The README states plainly that these binaries are NOT recommended for general-purpose use and exist only to support @stellar CI. Newest tag v86 (2026-08-20) (README read 2026-09-14; no license file; 3 stars; last push 2026-09-07).",
			triggers: ["stellar binaries action", "precompiled binaries ci stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/crate-git-revision": [
		{
			note: "A build-time helper from the @stellar org that embeds a crate's git revision into its build: it reads the revision either from the `.cargo_vcs_info.json` file inside a published crate or from the git repository of an unpublished build, and injects a `GIT_REVISION` environment variable carrying the full revision with a `-dirty` suffix when the working directory is dirty — which is how Stellar's Rust binaries report the commit they were built from. Newest release v0.0.9 (2026-05-28) (README read 2026-09-14; Apache-2.0; 3 stars; last push 2026-08-24).",
			triggers: [
				"git revision crate",
				"embed git revision rust",
				"GIT_REVISION build",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Soneso/stellar_wallet_flutter_sdk": [
		{
			note: "pub.dev stellar_wallet_flutter_sdk 1.1.4 (published 2026-08-25; the package's repository points back at this repo): Soneso's Flutter/Dart wallet SDK for building Stellar wallet applications, the Dart counterpart to their stellar_flutter_sdk. Newest GitHub release v1.1.4 (2026-08-25), coverage reported through codecov (README read 2026-09-14; MIT; 6 stars; last push 2026-08-25).",
			triggers: [
				"flutter wallet sdk stellar",
				"dart wallet sdk",
				"stellar wallet flutter",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ACTA-Team/acta-credentials": [
		{
			note: "npm @acta-team/credentials 1.1.10 (published 2026-08-22; the package's repository points back at this repo): a React/TypeScript SDK for ACTA (acta.build) that issues, stores, verifies and revokes verifiable credentials on Stellar through single-tenant vaults, with non-custodial wallet signing and automatic `did:stellar` issuer onboarding; docs at docs.acta.build. The newest GitHub tag is v1.1.2 (2026-06-30), so npm leads the repo's tags (README read 2026-09-14; MIT; last push 2026-08-22).",
			triggers: [
				"acta credentials sdk",
				"verifiable credentials stellar",
				"did:stellar issuer",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"57blocks/stellar-resource-usage-report": [
		{
			note: "npm @57block/stellar-resource-usage 0.0.4 (published 2025-12-23; the package's repository points back at this repo): a tool for Stellar developers that monitors and analyses the resources a smart contract consumes during execution, so a contract's CPU/memory footprint can be inspected before it meets mainnet limits; the README links a CHANGELOG for the version history (README read 2026-09-14; MIT; 4 stars; no GitHub releases; last push 2025-12-23).",
			triggers: [
				"resource usage report soroban",
				"contract resource consumption stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"xycloo/zephyr-vm": [
		{
			note: "The Zephyr VM by Xycloo Labs (mercurydata.app/zephyr-vm): a wasmi-based virtual machine for cloud computing over blockchain data — indexing, monitoring and automation — and the execution core of Mercury, though the README states it can also be built and run locally. Docs at docs.mercurydata.app (README read 2026-09-14; MPL-2.0; 3 stars; no releases; last push 2026-09-03).",
			triggers: [
				"zephyr vm mercury",
				"blockchain data vm stellar",
				"mercury indexing engine",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"xycloo/rs-ingest": [
		{
			note: "crates.io `ingest` 0.1.1 (updated 2024-09-27; the crate's repository points back at this repo): Xycloo's Rust ingestion library offering single- and multi-threaded, online and offline ingestion of Stellar ledger data. Read the scope before reaching for it — the README is written for FUTURENET, the network SDF has since retired, and the newest GitHub tag is 0.0.3 (2023-10-04) (README read 2026-09-14; Apache-2.0; 3 stars; last push 2026-08-27).",
			triggers: [
				"rs-ingest futurenet",
				"rust ledger ingestion stellar",
				"ingest crate stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"soroswap/token-list": [
		{
			note: "The official Soroswap token list: the curated set of Stellar assets and Soroban tokens that validates swap paths on the Soroswap AMM, which is why an unlisted token can be untradeable through the protocol's own routing. The README documents the entry structure a token must follow and asks contributors to open a PR and then reach out on Discord (README read 2026-09-14; GPL-3.0; 12 stars; no releases; last push 2026-09-06).",
			triggers: [
				"soroswap token list",
				"trusted token list soroban",
				"add token soroswap",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"blend-capital/docs-v2": [
		{
			note: "The source of the Blend v2 documentation at docs.blend.capital — user documentation for Blend's lending pools and a separate pool-creator guide for deploying one. Blend is described here as a liquidity protocol primitive on Stellar (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-07-27).",
			triggers: ["blend v2 docs", "blend pool creator guide"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"reflector-network/oracle-client": [
		{
			note: "Client bindings for the Reflector oracle contract (GitHub repo description; the README is empty and nothing is published under this name as of 2026-09-14) — the richer, published client for Reflector's Pulse and Beam oracles is @reflector/contract-client from reflector-network/contract-client-js (metadata read 2026-09-14; MIT; last push 2026-08-27).",
			triggers: ["reflector oracle client bindings"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"AquariusDeFi/aqua-voting-tracker": [
		{
			note: "The Aquarius voting tracker (Python): the service behind AQUA holders locking tokens to vote for market pairs, with the votes recorded on Stellar itself; the README's own links point at the AquaToken/aqua-voting-tracker path rather than this AquariusDeFi one, so the canonical home is worth confirming before citing a path (README read 2026-09-14; license NOASSERTION; 1 star; no releases; last push 2026-08-04).",
			triggers: ["aqua voting tracker", "aqua vote market pairs"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"AquariusDeFi/aqua-marketkeys-tracker": [
		{
			note: "The Aquarius market-keys tracker (Python), sibling of aqua-voting-tracker: it tracks the market-key accounts that AQUA votes are cast against, so a pair's votes can be attributed to a specific Stellar market. As with its sibling, the README's badges and logo link resolve to the AquaToken org rather than AquariusDeFi (README read 2026-09-14; license NOASSERTION; no releases; last push 2026-08-04).",
			triggers: ["aqua market keys", "marketkeys tracker aquarius"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"utkurock/Lusty": [
		{
			note: "Lusty (lusty.finance): a DeFi options protocol where a user sells covered calls and cash-secured puts on XLM and receives the premium at deposit, with settlement at expiry against an oracle price. The README states the network is Stellar TESTNET and links a two-minute walkthrough, so treat it as a testnet product until a mainnet deployment is cited (README read 2026-09-14; no license file; 3 stars; no releases; last push 2026-09-13).",
			triggers: [
				"lusty options xlm",
				"covered calls stellar",
				"cash secured puts xlm",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Foryield/soroban-yield-vault": [
		{
			note: "ForYield's open-source Soroban YieldVault contract, submitted for an SCF Build Award and written against EU regulatory requirements. The README is unusually explicit about scope: ForYield is not an authorised crypto-asset service provider, nothing there is an offer of a financial service, and the deployments named are TESTNET only; Tranche 1 covers asset deposit with proportional share minting (shares = amount × total_shares / total_assets) (README read 2026-09-14; MIT; no releases; last push 2026-08-31).",
			triggers: [
				"foryield yield vault",
				"soroban yield vault scf",
				"eu regulated vault stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ayazabbas/dark-fleet": [
		{
			note: "Dark Fleet (darkfleet.ayazabbas.com): a zero-knowledge battleship game built for the Stellar Hacks: ZK Gaming hackathon — two players connect Freighter wallets, commit hidden board states with Pedersen hash commitments, and prove shot results with ZK proofs on-chain without revealing ship positions. Newest release v1.0.0 (2026-02-23) (README read 2026-09-14; no license file; last push 2026-04-15).",
			triggers: [
				"dark fleet battleship",
				"zk gaming stellar",
				"pedersen commitment game soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Financial-Empowerment-Partners/impala": [
		{
			note: "Payala-Impala: a bridge between the Payala OFFLINE payment system and Stellar, so value that moved offline through Payala's network can cross on-chain when a user wants the wider ecosystem. The README describes Soroban contracts plus hardware-protected cryptographic primitives on a JavaCard smartcard and Android bindings — an unusual combination worth citing when the question is offline or smartcard payments on Stellar (README read 2026-09-14; no license file; no releases; last push 2026-09-08).",
			triggers: [
				"payala impala offline",
				"offline payments stellar",
				"javacard smartcard stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"The-Brookes-Project/soroban-sc": [
		{
			note: "Verseprop's Soroban security-token contract: a regulatory-compliant security token whose README lists issuance with configurable parameters, built-in KYC/AML verification and status tracking, multi-admin administration and authorization controls for trading — the compliance-gated end of the token spectrum rather than a plain SEP-41 asset (README read 2026-09-14; no license file; no releases; last push 2025-12-05).",
			triggers: [
				"verseprop security token",
				"compliant security token soroban",
				"kyc token contract stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Mael-wnb/dig-stellar": [
		{
			note: "Dig Stellar (dig-stellar-web.vercel.app): an analytics and portfolio-monitoring module for Stellar DeFi — protocol analytics, pool-level monitoring, multi-wallet portfolio tracking and normalised on-chain data pipelines, with alerts and non-custodial action flows described as future work rather than shipped features (README read 2026-09-14; MIT; no releases; last push 2026-09-05).",
			triggers: [
				"dig stellar analytics",
				"multi wallet portfolio stellar",
				"pool monitoring stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"luong0928472-maker/Komunitas": [
		{
			note: "Komunitas (komunitas-rho.vercel.app): a community treasury dapp where members pool value into one on-chain treasury, propose spending and release funds by open vote rather than through a treasurer, with every contribution, proposal, vote and disbursement made as a Soroban contract call. Topics mark it testnet; newest tag v1.0.0 (2026-08-10) (README read 2026-09-14; MIT; last push 2026-08-27).",
			triggers: [
				"komunitas treasury vote",
				"community treasury soroban",
				"onchain treasury dapp stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"lumtum02-oss/Agos": [
		{
			note: 'Agos (agos-stellar.vercel.app), tagline "Payday is every second": a Soroban streaming-payroll dapp where an employer opens a stream and the recipient accrues continuously. The README is written as a hackathon submission checklist — public repo, 20+ commits, live deployment, pitch deck and demo video — so read it as a submission artifact; topics mark it testnet and the newest tag is v1.0.0 (2026-08-10) (README read 2026-09-14; MIT; last push 2026-08-29).',
			triggers: [
				"agos payroll stream",
				"streaming payroll soroban",
				"payday every second",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"allbridge-io/allbridge-core-soroban-contracts": [
		{
			note: "The Soroban contract set of Allbridge Core, the cross-chain bridge's Stellar side (repo name and org; Allbridge Core's JS SDK is allbridge-io/allbridge-core-js-sdk). The README states only `make` to build and `make test` to run tests, and there is no description, release or published package, so nothing here documents the contracts' interface — read the deployed contract metadata instead (README read 2026-09-14; no license file; last push 2026-08-25).",
			triggers: [
				"allbridge core soroban contracts",
				"allbridge stellar bridge contracts",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"gateway-fm/loadgenerator": [
		{
			note: "Triage 2026-09-14: NOT a Stellar repo. GasStorm Load Generator — a high-throughput transaction load generator for benchmarking blockchain sequencers and execution layers, shipped as the Docker image gatewayfm/loadgenerator and the Go module github.com/gateway-fm/loadgenerator, used by gateway-fm/gasstorm. A GitHub code search for `stellar` across the repository returns 0 hits. It is in the index because the whole gateway-fm org was swept in behind the curated gatewayfm project (a genuine Stellar RPC provider) by the small-org rule. https://github.com/gateway-fm/loadgenerator",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"gateway-fm/ops-indexer": [
		{
			note: "Triage 2026-09-14: NOT a Stellar repo. A standalone EVM chain indexer with a gRPC read API — it polls an EVM node, writes to a private postgres and serves blocks, transactions, logs, tokens, gas stats and OP-Stack deposits to Open Privacy Suite and ops-explorer. A GitHub code search for `stellar` across the repository returns 0 hits. Same cause as gateway-fm/loadgenerator and gateway-fm/lez-atomic-swaps: the org was swept in behind the curated gatewayfm project. https://github.com/gateway-fm/ops-indexer",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	// ── P5 wave 10 (2026-09-14) — 50 curated-pool repos with no entry (474
	// remained after wave 9). Read 2026-09-14 from each repo's own metadata,
	// README, releases, or a registry whose `repository` points back at it.
	"orbitlens/stellar-expert-explorer": [
		{
			note: "The source of StellarExpert (stellar.expert) itself — the block explorer and analytics platform most Stellar answers end up citing. The README links its Open API documentation at stellar.expert/openapi.html and states the Open Directory API data is publicly available to developers free of charge, which is why it is a legitimate citation target rather than a scraped one (README read 2026-09-14; MIT; 81 stars; no releases; last push 2026-09-11).",
			triggers: [
				"stellar expert explorer",
				"stellarexpert open api",
				"block explorer analytics stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"MetaMask/snap-stellar-wallet": [
		{
			note: "MetaMask's Stellar Wallet Snap monorepo — READ THE HEADER BEFORE USING IT: the README states in a boxed warning that the package has been migrated to MetaMask's `internal-snaps` monorepo, that this repository has been archived, and that all future development and feature releases happen there. GitHub's own `archived` flag still reads false and the last push is 2026-08-20, so the repo is readable but the README says it is not where the work lives (README and metadata read 2026-09-14; no license file; 4 stars; no releases).",
			triggers: [
				"metamask stellar snap",
				"stellar wallet snap",
				"snap stellar migrated",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"pendulum-chain/spacewalk": [
		{
			note: "Spacewalk: a trustless, vault-based bridge between Stellar and Substrate/Polkadot parachains with ON-CHAIN VERIFICATION OF STELLAR CONSENSUS — the repo holds the pallets plus a standalone chain configured to run and test the bridge. Newest release v1.0.18 (2025-06-11) and last push 2026-03-19, so cite it as the bridge's implementation rather than as currently-moving work (README read 2026-09-14; Apache-2.0; 34 stars).",
			triggers: [
				"spacewalk bridge stellar",
				"stellar polkadot bridge",
				"stellar consensus verification substrate",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-registry/contracts": [
		{
			note: 'The on-chain Stellar Registry contracts, which the README describes as the infrastructure layer between "I wrote a smart contract" and "the ecosystem can safely use my smart contract" — Wasm publication and named contract deployment on Soroban. Newest tag main_contracts_registry_registry_pkg0.6.4_cli25.1.0 (2026-09-09) (README read 2026-09-14; Apache-2.0; last push 2026-09-09).',
			triggers: [
				"stellar registry contracts",
				"named contract deployment soroban",
				"wasm publication registry",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-registry/cli": [
		{
			note: "crates.io stellar-registry-cli 0.1.1 (updated 2026-09-11; the crate's repository points back at this repo): the Stellar CLI plugin for publishing, deploying and installing contracts through the on-chain Stellar Registry (stellar-registry/contracts). Newest tag stellar-registry-cli-v0.1.1 (2026-09-11) (README read 2026-09-14; Apache-2.0; last push 2026-09-11).",
			triggers: [
				"stellar registry cli",
				"publish contract registry",
				"deploy named contract cli",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/rs-soroban-poseidon": [
		{
			note: "crates.io soroban-poseidon 27.0.0 (updated 2026-07-08; the crate's repository points back at this repo): SDF's Poseidon and Poseidon2 hash functions for Soroban contracts — the README states the sponge construction matches circom's circomlib implementation, that BN254 parameters match circomlib, and that the BLS12-381 parameters are self-generated to match poseidon-bls12381-circom, which is exactly what a ZK integration needs to know before trusting cross-system proofs. Newest tag v27.0.0 (README read 2026-09-14; Apache-2.0; last push 2026-08-28).",
			triggers: [
				"poseidon hash soroban",
				"poseidon2 stellar",
				"circomlib compatible hash soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/go-stellar-xdr-json": [
		{
			note: "SDF's Go library for converting Stellar XDR to and from JSON — the repository combines Rust code with Go bindings, so a consumer builds the archive with `make build-libs` rather than relying on pure Go. Newest tag 26.0.0 (2026-05-05), which tracks the protocol line rather than a semantic version of its own (README read 2026-09-14; Apache-2.0; last push 2026-08-31).",
			triggers: ["xdr to json go", "go xdr json stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/account-viewer-v2": [
		{
			note: "SDF's Account Viewer 2.0 — the simple tool for viewing a Stellar account and sending transactions from it, which the README states replaces the original Account Viewer with an updated framework and design; built with create-react-app and yarn. Newest release v1.6.1 (2026-03-23) (README read 2026-09-14; no license file; 43 stars; last push 2026-09-03).",
			triggers: ["account viewer stellar", "view stellar account tool"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/scf-handbook": [
		{
			note: "The SCF Handbook, which its own front matter calls a SOURCE OF TRUTH document for the Stellar Community Fund — how the programs work, which one to apply to and how to apply. When a question is about SCF process rather than a specific award, this is the citable document (README read 2026-09-14; no license file; 13 stars; no releases; last push 2026-09-08).",
			triggers: [
				"scf handbook",
				"stellar community fund apply",
				"scf program guide",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/ecosystem-resources": [
		{
			note: "SDF's à-la-carte menu of workshop, tutorial and developer-activation material for in-person events and hackathons — the README's framing is that an organiser running a training does not have to reinvent the wheel and can select from what is already there (README read 2026-09-14; no license file; 3 stars; no releases; last push 2026-09-09).",
			triggers: [
				"stellar workshop resources",
				"hackathon activation material stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/wallets-discord-bot": [
		{
			note: "A small SDF operations bot that forwards wallet-related messages from Discord into one central Slack channel for wallet developers; Node >= 20 and yarn. Internal tooling rather than anything a wallet integrates (README read 2026-09-14; no license file; no releases; last push 2026-07-30).",
			triggers: ["wallets discord bot stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-experimental/stellar-contract-verify-plugin": [
		{
			note: "A Stellar CLI plugin that verifies a contract's WASM reproduces from the build metadata it records, per SEP-58. Its README opens with an IMPORTANT box: it should not be used in production, exists for experimentation and testing, is not maintained, and may be removed at any time — so cite it as evidence that reproducible-build verification is being prototyped, never as a tool to depend on (README read 2026-09-14; Apache-2.0; topic stellar-cli-plugin; no releases; last push 2026-08-27).",
			triggers: [
				"contract verify plugin",
				"sep-58 reproducible build",
				"verify wasm reproduces stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"BlaineHeffron/soroban-sdk-tools": [
		{
			note: "crates.io soroban-sdk-tools 0.1.3 (updated 2026-06-26; the crate's repository points back at this repo): proc macros for Soroban contract authors that streamline storage and error handling with compile-time unique keys, documented on docs.rs. Newest tag soroban-sdk-tools-v0.1.3 (2026-06-26) (README read 2026-09-14; Apache-2.0; 2 stars).",
			triggers: [
				"soroban sdk tools macros",
				"soroban storage macros",
				"compile-time storage keys soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"bandprotocol/band-std-reference-contracts-soroban": [
		{
			note: "Band Protocol's StandardReference oracle contract for Soroban, in Rust: relayers update reference data for supported symbols and consumers query prices sourced from BandChain. The last push was 2024-02-29 and no release has been published, so this documents Band's 2024 Soroban integration rather than a currently-maintained feed (README read 2026-09-14; Apache-2.0; 4 stars).",
			triggers: [
				"band protocol oracle soroban",
				"band standard reference stellar",
				"bandchain price feed stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"runtimeverification/komet-node": [
		{
			note: "Komet Node: a LOCAL Stellar testnet node built on Runtime Verification's K formal semantics of Soroban — the runnable companion to their komet semantics, installed through kup. It is the formal-methods path to testing a contract against a semantics rather than against an implementation (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-08-20).",
			triggers: [
				"komet node semantics",
				"formal semantics soroban",
				"k framework stellar testnet",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"withObsrvr/prism": [
		{
			note: "Prism, a Soroban-first block explorer for Stellar by Obsrvr (withobsrvr.com), powered by Obsrvr Lake. The README is unusually explicit about the architecture — a server-rendered Go application on Go 1.26 with Cobra/Viper, net/http and templates, htmx for interactivity, and deliberately no SPA, no React and no client-side router (README read 2026-09-14; no license file; no releases; last push 2026-08-05).",
			triggers: [
				"prism block explorer",
				"obsrvr explorer stellar",
				"soroban first explorer",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"fxjrin/soroscan": [
		{
			note: "Soroscan (soroscan.io): a Stellar block explorer covering Mainnet, Testnet and Futurenet with its own indexer. The README labels its status plainly as early and moving fast. Newest release v0.4.0 (2026-09-03) (README read 2026-09-14; MIT; 3 stars; topics block-explorer, soroban, stellar; last push 2026-09-03).",
			triggers: ["soroscan explorer", "stellar explorer futurenet"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"tryoutbounder/anchor-go": [
		{
			note: "anchor-go: a Go client library for the Stellar Ecosystem Proposals an anchor implements, starting with SEP-1 — fetching and parsing a `stellar.toml`, the first point of contact any client has with an anchor. Last push 2025-11-29 and no release, so treat coverage beyond SEP-1 as unverified (README read 2026-09-14; no license file).",
			triggers: [
				"anchor go client",
				"sep-1 stellar toml go",
				"anchor protocol api client",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"theahaco/authline": [
		{
			note: "Authline (theahaco.github.io/authline): an asset and trustline management dApp built on Ahaco's Scaffold Stellar toolkit — Vite, React, TypeScript with auto-generated contract clients — and its README is still Scaffold Stellar's own, marked under active development. Newest release v0.8.1 (2026-09-08) (README read 2026-09-14; Apache-2.0; last push 2026-09-08).",
			triggers: [
				"authline trustline manager",
				"trustline management dapp",
				"scaffold stellar frontend",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"miguelnietoa/recall": [
		{
			note: "Recall (recall-stellar.vercel.app): a toolkit for Stellar Confidential Tokens that lets a wallet ship confidential payments WITHOUT writing a circuit, and keeps the event history balances are rebuilt from — the README's reason for that indexer is concrete and worth citing: Stellar's RPC retains only SEVEN DAYS of event history. Six builds are described, all running (README read 2026-09-14; MIT; no releases; last push 2026-08-06).",
			triggers: [
				"recall confidential tokens",
				"confidential payments toolkit stellar",
				"rpc seven days events",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"yripper/openzeppelin-stellar-privacy-wallet": [
		{
			note: "Privacy Wallet (privacywallet.coderipper.xyz, testnet): a passkey-secured smart wallet for Stellar with two privacy rails — confidential transfers and a shielded pool whose idle liquidity earns yield in DeFindex — with zero-knowledge proofs generated client-side and no seed phrase or browser extension. Built for a Stellar privacy hackathon; no release published (README read 2026-09-14; no license file; 3 stars; last push 2026-08-21).",
			triggers: [
				"privacy wallet passkey stellar",
				"shielded pool stellar",
				"confidential transfers wallet",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"leocagli/open-stellar-passport": [
		{
			note: 'open-stellar-passport: a zero-knowledge "passport" in Circom that lets an autonomous agent prove it is human-backed, anti-Sybil and solvent WITHOUT revealing its owner or its balance — built for the Stellar Hacks: Real-World ZK hackathon as the trust layer for agent commerce on Stellar (README read 2026-09-14; license NOASSERTION; no releases; last push 2026-09-14).',
			triggers: [
				"zk passport agent",
				"anti-sybil proof stellar",
				"agent solvency proof",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"pedro-pelicioni/stellarsight": [
		{
			note: "StellarSight (stellarsight.xyz): a facilitator-side Bazaar discovery layer for x402 on Stellar, which its README claims is the piece missing from public code today, with the whole payment loop around it running end to end on Stellar TESTNET. Topics name agentic-payments, bazaar, discovery, mcp, x402 (README read 2026-09-14; Apache-2.0; 6 stars; no releases; last push 2026-09-14).",
			triggers: [
				"stellarsight bazaar discovery",
				"x402 discovery layer stellar",
				"facilitator bazaar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"blaze-xyz/cli": [
		{
			note: "npm @blaze-money/cli 1.5.0 (published 2026-07-29; the package's repository points back at this repo): Blaze's payments SDK, CLI and MCP server, pitched as giving an AI agent the ability to manage payments, analyse spending and automate financial operations; docs at docs.blaze.money. The README does not name Stellar — read it as agent-payments infrastructure whose Stellar relationship must be established elsewhere (README read 2026-09-14; MIT; last push 2026-06-24).",
			triggers: ["blaze payments cli", "agent payments mcp server"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"SCF-Public-Goods-Maintenance/pg-atlas-ts-sdk": [
		{
			note: "The PG Atlas TypeScript SDK: programmatic access to Stellar Public Goods ecosystem health, dependency subgraphs and award-round data, generated from the PG Atlas OpenAPI specification by @hey-api/openapi-ts so every operation function and type tracks the contract. Newest release v0.7.0 (2026-09-14); nothing is published on npm under this name as of the read, so consume it from the repository (README read 2026-09-14; MIT; last push 2026-09-14).",
			triggers: [
				"pg atlas sdk",
				"public goods dependency subgraph",
				"award round data stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Trustless-Work/privacy-poc": [
		{
			note: "Trustless Work's privacy proof of concept (privacy-poc-app.vercel.app): milestone escrow on Stellar TESTNET using Confidential Tokens with USDC as the underlying SEP-41 asset, demonstrated as a privacy-preserving marketplace order where the escrow releases the payment privately after delivery (README read 2026-09-14; MIT; 1 star; no releases; last push 2026-08-04).",
			triggers: [
				"trustless work privacy poc",
				"confidential escrow usdc",
				"private milestone release",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Trustless-Work/trustlesswork-clonable-backoffice": [
		{
			note: "The Trustless Work backoffice: a clonable administrative console for the full lifecycle of Trustless Work escrows — deployment, monitoring, operation, milestone updates and funding — intended to be cloned for fast escrow initialisation rather than used as a hosted product (README read 2026-09-14; no license file; 3 stars; no releases; last push 2026-05-09).",
			triggers: ["trustless work backoffice", "escrow admin console stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Trustless-Work/trustlesswork-spikes": [
		{
			note: "Trustless Work's product documentation and discussion repository — the org's own framing of itself as \"the Escrow Ecosystem for Stellar\", building tools to integrate escrows into any payment flow with Soroban contracts and stablecoins such as USDC. Spikes and discussion rather than shipped code (README read 2026-09-14; no license file; 5 stars; no releases; last push 2026-06-29).",
			triggers: ["trustless work spikes", "escrow ecosystem stellar docs"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Zerie5/lulpay-campaign-contract": [
		{
			note: "LulPay's Soroban crowdfunding campaign contract: each campaign is deployed as its own contract instance from this WASM template, and contributions, withdrawals and refunds move a configured Stellar Asset Contract token — USDC on testnet. Built with soroban-sdk 23, locked at 23.2.1 in Cargo.lock to match the public testnet deployment (README read 2026-09-14; no license file; no releases; last push 2026-07-27).",
			triggers: [
				"lulpay campaign contract",
				"crowdfunding contract soroban",
				"one instance per campaign",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"paltalabs/defindex-distributor": [
		{
			note: "The DeFindex Distributor by PaltaLabs: a Soroban contract plus CLI that batch-deposits campaign funds into a DeFindex vault and distributes the minted dfTokens to recipients from a CSV of asset, vault, user and amount — as if each user had deposited directly. Newest tag main_defindex-distributor_pkg0.0.1_cli22.8.1 (2026-02-27) (README read 2026-09-14; no license file; last push 2026-02-27).",
			triggers: [
				"defindex distributor",
				"batch deposit vault stellar",
				"dftoken distribution",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"soroswap/faucet": [
		{
			note: "The Soroswap testnet faucet (soroswap-faucet.vercel.app): a web app for minting Stellar testnet tokens so developers can exercise Soroswap without hunting for test assets (README read 2026-09-14; no license file; no releases; last push 2026-09-06).",
			triggers: ["soroswap faucet testnet", "mint testnet tokens stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"normalfinance/normal-v1-interface": [
		{
			note: "The open-source interface for the Normal protocol (normalfinance.io), whose GitHub topics name amm, defi, investing and stellar. The README itself is the project's badge-and-logo header and does not describe the Stellar integration, so the topic list and the project's own site are the grounding for that claim (README read 2026-09-14; Apache-2.0; 3 stars; no releases; last push 2026-09-14).",
			triggers: ["normal protocol interface", "normal finance amm"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"nirvana-labs/nirvana-typescript": [
		{
			note: "npm @nirvana-labs/nirvana 2.0.1 (published 2026-09-11; the package's repository points back at this repo): the official TypeScript client for the Nirvana Labs REST API. Neither the README nor a GitHub code search of the repository mentions Stellar or Soroban (0 hits, searched 2026-09-14), so it is indexed through its owner's project rather than through Stellar-specific code — do not cite it as a Stellar library. Newest release v2.0.1 (README read 2026-09-14; Apache-2.0).",
			triggers: ["nirvana labs typescript"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"dfns/dfns-sdk-java": [
		{
			note: "The Dfns Java SDK (dfns.co): the custody provider's Java client, requiring Java 17+ and published to Maven Central as co.dfns:dfns-sdk-java. Its Stellar relevance is narrow but real — a GitHub code search finds 7 occurrences of `stellar` in the repository (searched 2026-09-14) — so treat it as a custody SDK with Stellar support, not a Stellar SDK (README read 2026-09-14; MIT; no releases; last push 2026-09-11).",
			triggers: ["dfns java sdk", "dfns custody stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"dappradar/tokens": [
		{
			note: "DappRadar's community-maintained token metadata collection, used by DappRadar's Portfolio Tracker and other products; contributions are made by pull request under published guidelines. It spans many chains — a code search finds 9 occurrences of `stellar` in the repository (searched 2026-09-14) — so it is a multi-chain token list that includes Stellar, not a Stellar registry (README read 2026-09-14; no license file; 37 stars; last push 2025-12-12).",
			triggers: ["dappradar token list", "multichain token metadata"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"idos-network/docs": [
		{
			note: "The idOS documentation site (docs.idos.network, Docusaurus): idOS is described there as an identity operating system — a decentralised storage and access-management network for user data that brings portable identity to the stablecoin economy, letting users onboard to stablecoin apps and share data as easily as moving money, on- and off-chain (README read 2026-09-14; no license file; no releases; last push 2026-09-09).",
			triggers: [
				"idos documentation",
				"portable identity stablecoin",
				"idos storage network",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"idos-network/contracts": [
		{
			note: "idOS's EVM-side contracts — the repo's own description names the CCA, the $IDOS ERC20 token and the node staking contract, it builds with Foundry, and it carries an audit report PDF (NM0731-FINAL_IDOS.pdf) covering a subset of the contracts at commit f0ba57e. A GitHub code search finds 0 occurrences of `stellar` (searched 2026-09-14), so this is NOT the Stellar side of idOS; use it only for questions about the token and staking contracts (README read 2026-09-14; no license file; 3 stars; last push 2026-03-06).",
			triggers: [
				"idos erc20 contract",
				"idos staking contract",
				"idos audit report",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"AquariusDeFi/aqua-bribes": [
		{
			note: "The Aquarius bribes service (Python), third of the AquariusDeFi trackers: bribes let voters earn incentives simply for voting, without placing funds at risk inside an AMM. As with aqua-voting-tracker and aqua-marketkeys-tracker, the README's own links resolve to the AquaToken org rather than AquariusDeFi (README read 2026-09-14; license NOASSERTION; no releases; last push 2026-08-20).",
			triggers: ["aqua bribes voting", "vote incentives aquarius"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"reflector-network/reflector-exchanges-connector": [
		{
			note: "The CEX and DEX data source for the Reflector backend (GitHub repo description; the README is empty as of 2026-09-14) — the component that feeds exchange prices into the Reflector oracle's node (reflector-network/reflector-node) (metadata read 2026-09-14; MIT; no releases; last push 2026-04-10).",
			triggers: ["reflector exchanges connector"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"reflector-network/reflector-fx-connector": [
		{
			note: "The foreign-exchange rates data source for the Reflector backend (GitHub repo description; the README is empty as of 2026-09-14) — the FX counterpart to the exchanges connector, which is how Reflector's non-crypto pairs are sourced (metadata read 2026-09-14; MIT; no releases; last push 2026-05-26).",
			triggers: ["reflector fx connector", "forex rates oracle stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"reflector-network/reflector-website": [
		{
			note: "The website with general information about the Reflector protocol (GitHub repo description; the README is empty as of 2026-09-14) — the source of reflector.network rather than any part of the oracle itself (metadata read 2026-09-14; no license file; no releases; last push 2026-09-07).",
			triggers: ["reflector website source"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"therealjhay/stellargive": [
		{
			note: "StellarGive: a donation project on Stellar aimed at people in crisis. This copy is a GitHub FORK — its README's CI badges all point at Feyisara2108/stellargive, the upstream — so cite the upstream repository for the project's state (README and metadata read 2026-09-14; MIT; no releases; last push 2026-07-28).",
			triggers: ["stellargive donations"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"marwen-abid/stellar-disbursement-platform-backend": [
		{
			note: "A personal GitHub FORK of stellar/stellar-disbursement-platform-backend whose README is upstream's unchanged, badges and Swagger link included. Nothing here documents a divergence from SDP; read the upstream project, and the commit history of this fork for whatever it changes (README and metadata read 2026-09-14; Apache-2.0; no releases; last push 2026-05-05).",
			triggers: ["sdp backend fork"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"devasignhq/website": [
		{
			note: "DevAsign's marketing and documentation site. Its README is a useful map of the product's split: this repository is the PUBLIC WEBSITE only — landing, pricing, docs and bounty pages — while the code-review app lives at devasign.ai; DevAsign itself is described as a multimodal, goal-aware AI code reviewer that reviews a pull request against what was asked and pays bounties to the contributors who ship the work (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-09-02).",
			triggers: ["devasign website", "ai code reviewer bounty"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"LiquidsFi/liquidsfi-contracts": [
		{
			note: "Triage 2026-09-14: empty README, no GitHub description, no release, no published package — the repo states nothing durable about itself beyond the name suggesting LiquidsFi's contracts. Re-examine if it gains a README, a release or a deployment. https://github.com/LiquidsFi/liquidsfi-contracts",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"devasignhq/mobile-app": [
		{
			note: "Triage 2026-09-14: GONE — `gh api repos/devasignhq/mobile-app` returns 404, so the repository has been deleted or made private since it was indexed. The row should be retired or re-resolved rather than served; its sibling devasignhq/website is live and noted. https://github.com/devasignhq/mobile-app",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	// The monthly-submission cohort (2026-09-14). Six repos in the curated pool
	// share ONE README template — "## Submission Checklist / ### Delivery /
	// ### Proof / ### Feedback survey / ### Monthly submission" — the same
	// GitHub description shape ("<Name> — Stellar/Soroban project"), the same
	// topic list (blockchain, dapp, soroban, stellar, testnet, web3), and the
	// same tag v1.0.0 dated 2026-08-10. Four of them never say what the product
	// does, so they get an internal triage note; Agos and Komunitas describe a
	// real product in their own words and carry public notes above. Stating the
	// pattern, not a verdict: a templated submission is not a fake project
	// (feedback: a named repo is a probe, and staleness is not death).
	"ngaongoc934-maker/Ipon": [
		{
			note: 'Triage 2026-09-14: monthly-submission cohort template. The README is the shared checklist — repo link, 20+ commits, live app (https://ipon-dun.vercel.app), pitch deck, demo video, feedback survey, monthly submission link — and never states what Ipon does; the GitHub description is the cohort\'s generic "Ipon — Stellar/Soroban project", topics mark it testnet, tag v1.0.0 (2026-08-10). Nothing durable to publish until the repo describes its own product. https://github.com/ngaongoc934-maker/Ipon',
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"hatdong359-star/Sahod": [
		{
			note: 'Triage 2026-09-14: monthly-submission cohort template (same shared README as Ipon, Tulong and Liwanag). Live app https://sahod-sandy.vercel.app, described in the checklist as testnet-pinned; description "Sahod — Stellar/Soroban project", tag v1.0.0 (2026-08-10). The README never states what Sahod does. https://github.com/hatdong359-star/Sahod',
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"m4741890/Tulong": [
		{
			note: 'Triage 2026-09-14: monthly-submission cohort template (same shared README as Ipon, Sahod and Liwanag). Live app https://tulong-beta.vercel.app; description "Tulong — Stellar/Soroban project", tag v1.0.0 (2026-08-10). The README never states what Tulong does. https://github.com/m4741890/Tulong',
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"q1956299-art/Liwanag": [
		{
			note: 'Triage 2026-09-14: monthly-submission cohort template (same shared README as Ipon, Sahod and Tulong). Live app https://liwanag-rho.vercel.app; description "Liwanag — Stellar/Soroban project", tag v1.0.0 (2026-08-10). The README never states what Liwanag does. https://github.com/q1956299-art/Liwanag',
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	// ── P5 wave 11 (2026-09-14) — 50 more curated-pool repos with no entry
	// (424 remained after wave 10). Read 2026-09-14 from each repo's own
	// metadata, README, releases, or a registry that points back at it.
	"mericcintosun/lumenia": [
		{
			note: "Lumenia (getlumenia.com): send or request USDC by link, where the recipient claims it walletless and seedless and pays no gas — the README's own badge says Stellar testnet plus a CAPPED MAINNET PILOT, and its topics name the primitives it rides on: claimable-balances, sponsored-reserves and fee-bump. Newest release v0.1.0 (README read 2026-09-14; MIT; last push 2026-09-12).",
			triggers: [
				"lumenia usdc link",
				"walletless claim usdc",
				"claimable balance payment link",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"mpprouter/stellar-agent-wallet-skill": [
		{
			note: "stellar-agent-wallet (clawhub.ai/plugins/stellar-agent-wallet): Rozo's agent-side Stellar USDC wallet skill — it pays 402-gated APIs through x402 or the MPP Router, checks balances, adds USDC trustlines, swaps XLM→USDC on the DEX, and sends or bridges USDC to EVM, Solana or back to Stellar via Rozo, with file-based secret storage, a sponsored mode and both networks. Newest tag v1.8.2; nothing is published on npm under `stellar-agent-wallet` as of the read (README read 2026-09-14; no license file; last push 2026-09-04).",
			triggers: [
				"stellar agent wallet skill",
				"pay 402 api agent",
				"mpp router wallet",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"karagozemin/Solvent": [
		{
			note: "Solvent (solvent-web.vercel.app): zero-knowledge proof-of-reserves on Stellar — the README's claim is specific enough to cite, that a holder proves a bank balance clears a threshold FROM A REAL DKIM-SIGNED EMAIL and a Soroban contract verifies it, so the reserve claim rests on the bank's own signature rather than on a screenshot. Newest release v0.1.0 (README read 2026-09-14; no license file; last push 2026-07-04).",
			triggers: [
				"solvent proof of reserves",
				"dkim email proof stellar",
				"zk proof of reserves soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"runtimeverification/stellar-debugger": [
		{
			note: "Runtime Verification's Stellar Debugger: time-travel debugging for Soroban contracts inside the editor — set a breakpoint in a Rust contract and step FORWARD AND BACKWARD through what it did, line by line, instead of redeploy-and-guess. The companion piece to their K-semantics work (komet-node) (README read 2026-09-14; BSD-3-Clause; 1 star; no releases; last push 2026-09-13).",
			triggers: [
				"stellar debugger breakpoint",
				"time travel debugging soroban",
				"step backward contract",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-expert/refractor": [
		{
			note: "Refractor (refractor.stellar.expert): StellarExpert's multisig aggregator and pending-transaction storage for Stellar — where a transaction waits while its signers collect. The README is empty; the GitHub description is the durable statement (metadata read 2026-09-14; MIT; 5 stars; no releases; last push 2026-07-23).",
			triggers: [
				"refractor multisig",
				"pending transaction storage stellar",
				"collect signatures stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellarchain/v4": [
		{
			note: "The Stellarchain V4 frontend (stellarchain.io): a Next.js App Router application for exploring Stellar and Soroban data — ledgers, transactions, operations and effects, accounts and labels, markets, assets and liquidity pools, and Soroban contracts with their events, metadata and verification (README read 2026-09-14; no license file; no releases; last push 2026-09-03).",
			triggers: [
				"stellarchain explorer",
				"soroban contract verification explorer",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/mcp-stellar-xdr": [
		{
			note: "SDF's MCP server for Stellar XDR: it exposes XDR-JSON and JSON Schema as tools so an agent can understand what a piece of XDR means, modify its values, and construct new XDR — the canonical answer when an agent needs to read or build XDR without a local SDK (README read 2026-09-14; Apache-2.0; no releases; last push 2026-08-28). A sibling of the same name lives in stellar-experimental.",
			triggers: ["mcp stellar xdr", "xdr json mcp server", "agent build xdr"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-experimental/mcp-stellar-xdr": [
		{
			note: "The stellar-experimental copy of SDF's XDR MCP server — same README and same purpose as stellar/mcp-stellar-xdr (XDR-JSON and JSON Schema as agent tools), 2 stars and last pushed 2026-09-03, six days after the stellar/ copy. Cite the stellar/ repository unless a question is specifically about the experimental org (README read 2026-09-14; Apache-2.0; no releases).",
			triggers: ["experimental mcp xdr"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/research": [
		{
			note: "The sources of the SDF research website — the README is one line naming exactly that, and the repository is where the published research pages come from rather than the research itself (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-09-11).",
			triggers: ["sdf research website"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/security-tools": [
		{
			note: "SDF's repository for PUBLIC security tooling, in Rust — the README states only that, so the contents are the documentation; worth checking directly when a question is about Stellar security tooling published by the foundation (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-07-28).",
			triggers: ["stellar security tools sdf"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"blend-capital/oracle-aggregator": [
		{
			note: "Blend's example Oracle Aggregator: one contract that lets a single Blend pool reach MULTIPLE oracle price sources through one `lastprice` method, with the README stating the assumptions it makes about those oracles. Newest tag v2.0.0_oracle-aggregator_cli22.0.1; last push 2025-04-11, so it documents the pattern rather than a maintained deployment (README read 2026-09-14; MIT; 2 stars).",
			triggers: [
				"blend oracle aggregator",
				"multiple oracle sources pool",
				"lastprice aggregator soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"kaankacar/stellar-wallet-gallery": [
		{
			note: 'Stellar Wallet Gallery: the SAME tiny app built six times, once per wallet kit — Stellar Wallets Kit, Blux, Privy, Para, Passkey Kit and Smart Accounts — with an identical flow and identical UI from a shared package, made for side-by-side comparison at a Stellar Developers Meeting. The most direct answer available to "which wallet kit should I use", because the differences are isolated by construction (README read 2026-09-14; no license file; 3 stars; no releases; last push 2026-08-20).',
			triggers: [
				"wallet kit comparison stellar",
				"stellar wallets kit vs blux",
				"passkey kit comparison",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Dione-b/caatinga": [
		{
			note: "npm @caatinga/cli 3.9.2 (published 2026-08-13; the package's repository points back at this repo): Caatinga builds, deploys, versions and interacts with Soroban contracts through one TypeScript experience, with docs at docs-caatinga.netlify.app (README read 2026-09-14; MIT; 7 stars; no GitHub releases; last push 2026-09-08).",
			triggers: ["caatinga cli soroban", "typescript contract deploy tool"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"alexanderkoh/bookee": [
		{
			note: "Bookee: LOCAL-FIRST, read-only bookkeeping for Stellar accounts — a Tauri desktop app over SQLite that turns an account's on-chain history into readable books with no wallet connection, no private keys and no backend, which is what makes it safe to point at a treasury account. Newest release v0.1.4 (README read 2026-09-14; Apache-2.0; 4 stars; last push 2026-09-14).",
			triggers: [
				"bookee bookkeeping stellar",
				"local first accounting stellar",
				"read only ledger books",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Creit-Tech/SorobanHub-app": [
		{
			note: "SorobanHub (sorobanhub.com) by Creit Tech: a UI for managing and monitoring Soroban contracts so an operator does not need scripts or a terminal to interact with them. The README states the app is still in early development and that bugs and unfinished functionality are expected. Newest release v0.7.4; last push 2025-09-04 (README read 2026-09-14; no license file; topics smart-contracts, soroban, stellar).",
			triggers: ["sorobanhub contract manager", "manage soroban contracts ui"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"clevercon-protocol/clevercon": [
		{
			note: "CleverCon (clevercon-dashboard.vercel.app): a non-custodial spending-control layer for AI agents on Stellar — fund a vault, set PRIVATE spending rules, and the agent spends within them with the limits enforced on-chain. The same problem space as agent wallets with spend caps, solved at the vault rather than in the client (README read 2026-09-14; MIT; 3 stars; no releases; last push 2026-09-13).",
			triggers: [
				"clevercon spending control",
				"agent vault spending rules",
				"private spending limits stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"enliven17/talos-stellar": [
		{
			note: "Talos Protocol (talos-stellar.vercel.app): autonomous agent corporations on Stellar, where agents register on-chain, sell services and earn USDC via x402 — an agent-commerce design that treats the agent as an economic entity with its own registry entry (README read 2026-09-14; AGPL-3.0; 5 stars; no releases; last push 2026-09-04).",
			triggers: [
				"talos agent corporations",
				"agents earn usdc x402",
				"onchain agent registry stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"CaBsCrypto/stellar-bazaar-x402": [
		{
			note: "Stellar Bazaar x402: Stellar-native discovery for paid HTTP APIs and MCP tools using x402 — machine-readable discovery plus atomic micropayments, published bilingually (English and Spanish READMEs). Live at stellar-bazaar-x402.vercel.app (README read 2026-09-14; license NOASSERTION; 1 star; no releases; last push 2026-09-03).",
			triggers: [
				"stellar bazaar x402",
				"discovery paid apis stellar",
				"mcp tool discovery x402",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"CaBsCrypto/ficha-onchain": [
		{
			note: "TrustLeaf (trustleaf-demo.vercel.app): patient-owned medical records on Stellar — the README describes doctor and patient portals over two Soroban contracts with Privy and SPONSORED FEES, keeping the hash on-chain and the data off it, consent-gated. Topics name healthcare, mcp and self-sovereign-identity (README read 2026-09-14; no license file; no releases; last push 2026-09-14).",
			triggers: [
				"trustleaf medical records",
				"patient owned records stellar",
				"prescriptions soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"defarm-repo/defarm-mcp": [
		{
			note: "npm @defarm/mcp 0.1.0 (published 2026-08-22; the package's repository points back at this repo): an MCP server for DeFarm (defarm.net) that lets an agent seal, open, verify and ingest verifiable agri-traceability data by description, built on @defarm/sdk with sealed fields encrypted client-side (README read 2026-09-14; MIT; no GitHub releases; last push 2026-08-22).",
			triggers: [
				"defarm mcp traceability",
				"agri traceability stellar",
				"sealed fields encrypted mcp",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Rehoboth-Finance/easy-escrow": [
		{
			note: "npm @rehobothfinance/easy-escrow-sdk 0.1.2 (published 2026-04-03; the package's repository points back at this repo): Rehoboth's official TypeScript SDK for EasyEscrow (README read 2026-09-14; the README badges Apache-2.0 while GitHub reports no license file; no GitHub releases; last push 2026-04-30).",
			triggers: ["easy escrow sdk", "rehoboth escrow stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"axis-markets/json-storage": [
		{
			note: "npm @axis-markets/json-storage 0.2.0 (published 2026-06-21; the package's repository points back at this repo): a JSON-file-backed `HistoryStorage` for the AXIS indexer that implements the same interface as the reference `InMemoryHistoryStorage` and adds durable persistence to a single file — intended for testing and local use, which the README says plainly (README read 2026-09-14; MIT; last push 2026-06-21).",
			triggers: ["axis indexer storage", "json history storage indexer"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"bluxcc/demo": [
		{
			note: "The demo site for the Blux wallet kit (demo.blux.cc) — it exercises @bluxcc/react, whose published package (npm 0.3.7, 2026-09-13) lives in the separate bluxcc/blux repository, so this repo is the showcase and not the library (README read 2026-09-14; no license file; topics blux, stellar-wallet; no releases; last push 2026-09-03).",
			triggers: ["blux demo wallet kit"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Socket-Fi/socketfi-react-integration-reference": [
		{
			note: "SocketFi's official React integration reference for its embedded smart accounts on Stellar (socket.fi) — React 19, TypeScript 5 and Vite 7 examples; topics name passkey, sdk, smart, soroban, stellar and wallet. Reference implementations rather than the SDK itself (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-07-05).",
			triggers: [
				"socketfi embedded smart accounts",
				"socketfi react integration",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"reclaimprotocol/stellar-sdk-onchain-integration": [
		{
			note: "Reclaim Protocol's Soroban contract for on-chain verification of its cryptographic proofs using WITNESS-BASED EPOCHS — the Stellar end of Reclaim's zkTLS-style attestations, which is what lets a contract act on a claim about off-chain web data (README read 2026-09-14; no license file; no releases; last push 2026-01-27).",
			triggers: [
				"reclaim protocol stellar",
				"witness epoch verification soroban",
				"onchain proof verification reclaim",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"mystic-finance/Stellar-RFQ": [
		{
			note: "Octarine Settlement: a duration-priced RFQ settlement contract in Soroban for real-world assets whose value is a function of TIME TO REDEMPTION — the README tabulates three order types settling through one contract, each with its own price source, signer and custody model (README read 2026-09-14; no license file; no releases; last push 2026-09-01).",
			triggers: [
				"octarine rfq settlement",
				"duration priced rwa soroban",
				"rfq contract stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"untangledfinance/soroban-vault-contract": [
		{
			note: "Untangled's Soroban token vault contract: users store tokens, create offers for token trading, and manage redemption requests through one contract, with deposits and withdrawals as the base operations. No description, no release, last push 2026-01-28, so the README is the whole record (README read 2026-09-14; no license file).",
			triggers: ["untangled vault contract", "token vault redemption soroban"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Phoenix-Protocol-Group/whitelist-claim": [
		{
			note: "Phoenix's whitelist-claim contract: approved users claim airdropped tokens from a claimable balance with multiple claimants, each claiming their portion ONCE, with multiple deposits combining claimants and only the admin able to deposit. Last push 2025-05-23, no release (README read 2026-09-14; GPL-3.0).",
			triggers: [
				"whitelist claim airdrop",
				"claimable balance multiple claimants",
				"phoenix airdrop contract",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Trustless-Work/trustlesswork-backoffice": [
		{
			note: "The Trustless Work backoffice at dapp.trustlesswork.com — the INTERNAL admin console for managing the full escrow lifecycle, as distinct from trustlesswork-clonable-backoffice, which is the version meant to be cloned. The most-starred repo in the org at 18 stars (README read 2026-09-14; no license file; no releases; last push 2026-09-11).",
			triggers: ["trustless work dapp backoffice"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ACTA-Team/products-acta": [
		{
			note: "ACTA's product monorepo (products-acta.vercel.app): the apps built on top of ACTA's trust-minimised verifiable credentials on Stellar/Soroban — a products catalog and landing at apps/web plus a portable credit-history app for financial inclusion at apps/credit-history (README read 2026-09-14; MIT; no releases; last push 2026-08-28).",
			triggers: ["acta products monorepo", "portable credit history stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"SCF-Public-Goods-Maintenance/pg-atlas-backend": [
		{
			note: "The PG Atlas backend (pgatlas.xyz): the ingestion pipeline, storage, metric computation and REST API behind the SCF Public Goods ecosystem-health data that the pg-atlas-ts-sdk consumes. Newest release v0.7.0 (2026-09-14), the same day as the SDK's (README read 2026-09-14; license NOASSERTION; 3 stars; last push 2026-09-14).",
			triggers: ["pg atlas backend", "public goods metrics api stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"SCF-Public-Goods-Maintenance/scf-public-goods-maintenance.github.io": [
		{
			note: "The documentation site for the SCF Public Goods Maintenance process and tooling (scf-public-goods-maintenance.github.io) — the written process behind PG Atlas, licensed CC-BY-4.0 with an SPDX header, 9 stars (README read 2026-09-14; no releases; last push 2026-09-01).",
			triggers: ["public goods maintenance process", "scf public goods docs"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellarcarbon/sc-audit": [
		{
			note: "Stellarcarbon's audit database: a stand-alone tool with a command-line interface for monitoring and auditing Stellarcarbon accounts, which the README recommends running through Docker rather than managing a Python environment. Newest release v0.14.1 (README read 2026-09-14; MIT; 4 stars; last push 2026-04-14).",
			triggers: ["stellarcarbon audit db", "carbon account audit stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellarcarbon/sc-website": [
		{
			note: "The source of stellarcarbon.io, a Next.js site with a published staging environment at test.stellarcarbon.io — useful to know when verifying what Stellarcarbon states about itself, because the staging host is the project's own (README read 2026-09-14; GPL-3.0; 4 stars; no releases; last push 2026-07-23).",
			triggers: ["stellarcarbon website source"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"boundlessfi/builders": [
		{
			note: "Boundless Builders: a DISPLAY-ONLY sub-app of the Boundless platform served at its own builders subdomain — the read-only surface of the project's bounty and builder data rather than the platform itself. 10 stars (README read 2026-09-14; no license file; no releases; last push 2026-09-01).",
			triggers: ["boundless builders app"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"wmendes/stellar-album-2026": [
		{
			note: "stellar-album: an educational sticker-album dApp on Soroban built to teach the FULL SPECTRUM OF FUNGIBILITY in one coherent collectible game — from a purely fungible coin to a purely non-fungible, soulbound album. A teaching artefact for SEP-41 and NFT semantics rather than a product (README read 2026-09-14; no license file; 7 stars; no releases; last push 2026-07-01).",
			triggers: [
				"stellar album fungibility",
				"soulbound album soroban",
				"teach token standards stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"danielfsha/Card-RPG": [
		{
			note: "A card-RPG template from the Stellar Game Studio collection — ecosystem-ready game templates and examples meant to be scaffolded into a builder's own workflow, with the collection's entry point at jamesbachini.github.io/Stellar-Game-Studio. The repo has no description of its own; the README is the Game Studio's (README read 2026-09-14; MIT; no releases; last push 2026-02-22).",
			triggers: ["stellar game studio template", "card rpg stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"jairoamayac/yield-bounty": [
		{
			note: "tesouro.pix: a BRL balance held in TESOURO — Brazilian sovereign debt tokenised by Etherfuse, which the README quotes at 12.76% a year — that is sold ONLY at the moment of a PIX payment and only in the amount that payment needs, so the holder earns up to the second they pay. Cite the yield figure as the README's claim on the read date, not as a current rate (README read 2026-09-14; no license file; no releases; last push 2026-08-05).",
			triggers: [
				"tesouro pix yield",
				"brazilian treasury stablebond stellar",
				"etherfuse tesouro",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"beto-rocha-blockchain/energypay-tesouro-yield": [
		{
			note: "A Brazil-first stablebond yield app built for the Stellar Builder Summit São Paulo 2026 whose premise is separating REAL YIELD FROM FX — the README states every number in it was produced by running the repo's code against live networks and that nothing is simulated, which is a checkable claim rather than a pitch (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-08-06).",
			triggers: [
				"energypay tesouro yield",
				"real yield versus fx brazil",
				"stablebond yield stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"polsalarm/PadaLock": [
		{
			note: "PadaLock (padalock.vercel.app): purpose-locked remittance on Stellar for overseas Filipino workers — money sent home that can only be spent the way it was meant to, which is the spending-control idea applied to remittance rather than to agents (README read 2026-09-14; no license file; no releases; last push 2026-09-14).",
			triggers: [
				"padalock remittance",
				"purpose locked remittance stellar",
				"ofw remittance stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"karagozemin/sub-rosa-issue": [
		{
			note: "Sub Rosa's ecosystem-contribution workspace (sub-rosa-web.vercel.app), created specifically for the Stellar Wave program — the README states in a note box that THE MAIN SUB ROSA REPOSITORY IS MAINTAINED SEPARATELY, so this repo is the contribution surface and not the product's source (README read 2026-09-14; MIT; 6 stars; no releases; last push 2026-09-10).",
			triggers: ["sub rosa stellar wave", "sub rosa contribution workspace"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"CopperxHQ/countries": [
		{
			note: "npm @koshmoney/countries 1.0.1-beta.1 (published 2026-01-10; the package's repository points back at this repo): a lookup library for ISO-3166-2 subdivisions from Copperx/Kosh. It is general geographic reference data with no Stellar-specific content — useful for an anchor's address forms, not a Stellar library (README read 2026-09-14; MIT; 2 stars; no releases; last push 2026-06-05).",
			triggers: ["iso 3166-2 subdivisions lookup"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"idos-network/idos-sdk-kotlin": [
		{
			note: "The idOS Kotlin SDK, released as v0.0.10 on GitHub and badged for Maven Central under org.idos:idos-sdk-kotlin — the Maven Central search API returned no artifact for that coordinate on 2026-09-14, so the badge's availability is unconfirmed and the GitHub release is the reliable source (README read 2026-09-14; MIT; last push 2026-07-20).",
			triggers: ["idos kotlin sdk"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"idos-network/staking-app": [
		{
			note: "The standalone frontend for the $IDOS staking contract (portal.idos.network). Read the prerequisites before assuming a Stellar path: the README asks for a Web3 wallet such as MetaMask or Rabby and access to ARBITRUM Sepolia or Arbitrum mainnet, so this app is the EVM side of idOS (README read 2026-09-14; MIT; no releases; last push 2026-07-08).",
			triggers: ["idos staking app", "idos token staking arbitrum"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"idos-network/supply": [
		{
			note: "The $IDOS supply calculator at supply.idos.network: a small Vercel API that reports circulating supply by querying on-chain IDOS balances of known locked wallets and vesting contracts and subtracting them from the fixed total — on ARBITRUM, which the README states, so it is not a Stellar-side figure (README read 2026-09-14; MIT; no releases; last push 2026-05-14).",
			triggers: ["idos circulating supply", "idos supply calculator"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"TrustLine-id/evmsdk": [
		{
			note: "Trustline's EVM SDK: a SOLIDITY library that protects EVM contracts from unauthorised access and malicious transactions by integrating Trustline's oracle with multiple on-chain data sources. It is the EVM counterpart to Trustline's Stellar work (TrustLine-id/stellar-sdk, TrustLine-id/stellar-validation-engine) — do not cite it for Stellar behaviour (README read 2026-09-14; MIT; no releases; last push 2026-07-03).",
			triggers: ["trustline evm sdk", "trustline oracle solidity"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Xoulomon/Stellar-Spend": [
		{
			note: "A GitHub FORK of whiteghost0001/Stellar-Spend — the README's CI badge points at the upstream repository, and the fork carries no description or release of its own, so read the upstream for the project's state (README and metadata read 2026-09-14; MIT; last push 2026-04-27).",
			triggers: ["stellar spend fork"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"gateway-fm/gasstorm": [
		{
			note: "Triage 2026-09-14: NOT a Stellar repo. GasStorm is a local devnet and stress-testing toolkit for EVM SEQUENCERS — it spins up an L1/L2 stack, a block builder and a load generator with a dashboard for throughput, latency and gas. Fourth gateway-fm repo triaged this way (with lez-atomic-swaps, loadgenerator and ops-indexer): the org was swept into the pool behind the curated gatewayfm project, a genuine Stellar RPC provider. https://github.com/gateway-fm/gasstorm",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"gateway-fm/midenscan-indexer": [
		{
			note: "Triage 2026-09-14: NOT a Stellar repo. The Miden Indexer — a blockchain data indexing service for the Miden ecosystem that probes a Miden Node for new blocks and powers Midenscan (newest release v0.16.1). Fifth gateway-fm repo triaged this way; see gasstorm for the cause. https://github.com/gateway-fm/midenscan-indexer",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"idos-network/.github": [
		{
			note: "Triage 2026-09-14: GitHub's org profile repository (\"Github Readme Page\"), empty README, no releases. It holds the org's profile card, not code. https://github.com/idos-network/.github",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	// ── P5 wave 12 (2026-09-14) — 50 more curated-pool repos with no entry
	// (374 remained after wave 11). Read 2026-09-14.
	"Stellar-Light/stellar-scout": [
		{
			note: "Stellar Scout (stellarlight.xyz/scout): the AI skill that turns a coding agent into a Stellar ecosystem analyst — prior art, hackathon results and SCF history before you build — installable into any agent that loads skills. This is Stellar Light's own published skill (README read 2026-09-14; MIT; no releases; last push 2026-09-08).",
			triggers: ["stellar scout skill", "prior art before building stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Socket-Fi/socketfi-smart-account": [
		{
			note: "SocketFi's smart-account contracts for Soroban (socket.fi): modular, embedded self-custodial accounts with PASSKEYS, both Stellar and EVM signers, guardian-assisted recovery, programmable sessions and native account features. The contract side of socketfi-react-integration-reference (README read 2026-09-14; Apache-2.0; topics passkeys, webauthn, smart-account; no releases; last push 2026-09-14).",
			triggers: [
				"socketfi smart account",
				"passkey smart account soroban",
				"guardian recovery stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"NethermindEth/stellar-risc0-verifier": [
		{
			note: "Nethermind's RISC Zero verifier for Stellar — Groth16 verification of RISC0 receipts in Soroban, the piece a zkVM proof needs to be checked on Stellar. Its README opens with an IMPORTANT box stating the project has NOT BEEN AUDITED, which must travel with any citation. 10 stars, topics groth16, risc0, zk (README read 2026-09-14; Apache-2.0; no releases; last push 2026-04-11).",
			triggers: [
				"risc0 verifier stellar",
				"groth16 verification soroban",
				"zkvm proof stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"perspectivefi/spectra-oracles-stellar-public": [
		{
			note: "Spectra's Stellar oracle contracts: deterministic Principal Token prices from a ZERO-COUPON-BOND MODEL exposed through the SEP-40 oracle interface — given an implied APY, a maturity and a future PT value the oracle returns the price, so the number is derived rather than polled from a market (README read 2026-09-14; license NOASSERTION; topics defi, oracle, soroban; no releases; last push 2026-08-09).",
			triggers: [
				"spectra principal token oracle",
				"zero coupon bond oracle stellar",
				"sep-40 pt price",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"zenith-protocols/orbit-contracts": [
		{
			note: "The OrbitCDP contracts: a decentralised stablecoin system on Stellar where users mint fiat-pegged stablecoins against overcollateralised debt positions. Newest tag v2.0_bridge-oracle_pkg1.0.0_cli22.8.1; last push 2026-01-23 (README read 2026-09-14; no license file).",
			triggers: [
				"orbitcdp contracts",
				"overcollateralized stablecoin stellar",
				"cdp mint stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"zenith-protocols/soroban-vault": [
		{
			note: "Zenith's Strategy Vault: an ERC-4626-compliant tokenised vault built on OpenZeppelin's Stellar Contracts, with DEPOSIT-BASED LOCKING — a depositor waits out a configured lock time — plus strategy integration. Notable as a concrete case of the ERC-4626 shape being carried onto Soroban (README read 2026-09-14; no license file; no releases; last push 2026-01-22).",
			triggers: [
				"erc-4626 vault soroban",
				"strategy vault stellar",
				"deposit lock vault",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"zenith-protocols/orbit-utils": [
		{
			note: "Deployment scripts for the Orbit protocol: interactive CLI tooling for initialising, deploying and managing the OrbitCDP contracts. Operations tooling rather than protocol code; last push 2025-04-22 (README read 2026-09-14; MIT; no releases).",
			triggers: ["orbit deployment scripts"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"lumenbro/soroban-policies": [
		{
			note: "LumenBro's Soroban signer policies, built on the `SmartAccountPolicy` trait from AhaLabs' stellar-smart-account — an agent spend policy among them, with VERIFIED BUILDS through the Stellar CLI. Newest tag v2.0.0_agent-spend-policy_pkg1.0.0_cli22.8.1 (README read 2026-09-14; MIT; last push 2026-03-11).",
			triggers: [
				"soroban signer policy",
				"agent spend policy contract",
				"smart account policy trait",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"boundlessfi/boundless-contract": [
		{
			note: "The Soroban contracts anchoring the Boundless platform: two contracts in one workspace, `boundless-events` under contracts/events and its sibling, documented in a table in the README. Newest release v1.1.0 (README read 2026-09-14; no license file; 3 stars; last push 2026-08-18).",
			triggers: ["boundless contracts stellar", "boundless events contract"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"LFGBanditLabs/quipay-contracts": [
		{
			note: "Quipay's Soroban contracts: autonomous payroll streaming on Stellar — the contract side of payroll-on-autopilot, a design that keeps recurring. Compare with Agos (streaming payroll) and mercurial payout contracts (README read 2026-09-14; Apache-2.0; no releases; last push 2026-07-17).",
			triggers: ["quipay payroll contracts", "payroll streaming soroban"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Grainlify/Stellar-Contracts": [
		{
			note: "Grainlify's GrainHack escrow for Soroban: MERKLE CLAIM ROOTS with PULL-ONLY CLAIMS, and the contract-side protocol is documented in docs/MERKLE_LEAF_FORMAT.md, which the README says is self-contained and uses contracts/grainhack-escrow/src/lib.rs as its source of truth — a rare case where the leaf format is published rather than implied (README read 2026-09-14; no license file; no releases; last push 2026-08-30).",
			triggers: [
				"grainhack escrow merkle",
				"merkle claim root soroban",
				"pull claim escrow",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"warp-driver/warpdrive-contracts": [
		{
			note: "WarpDrive's Soroban contracts (warp-drive.xyz): Project Root, Security (proof-of-authority) and Verification modules for enterprise-grade VERIFIABLE OFF-CHAIN COMPUTE on Stellar; the README names this repository as the deliverable for Milestone 2 of that work. Newest tag v0.3.0-rc.1 (README read 2026-09-14; no license file; last push 2026-06-04).",
			triggers: [
				"warpdrive contracts",
				"verifiable offchain compute stellar",
				"proof of authority soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ALIPHATICHYD/Soroban-Registry": [
		{
			note: "Soroban Registry (soroban-registry.vercel.app): a package manager and contract registry letting developers publish, discover and verify Soroban contracts across Stellar networks, explicitly modelled on npm and crates.io. 8 stars; note the separate, SDF-adjacent stellar-registry/contracts and stellar-registry/cli solve the same problem on-chain (README read 2026-09-14; no license file; no releases; last push 2026-09-11).",
			triggers: [
				"soroban registry package manager",
				"publish discover contracts stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"luanlabs/fluxity-api": [
		{
			note: "The backend for Fluxity (fluxity.finance), a token-streaming and lockup platform on Soroban: a REST API for token and lockup data that MIRRORS ON-CHAIN LOCKUP CONTRACT EVENTS into MongoDB — the indexing half of a streaming product, which is where the queryable history lives (README read 2026-09-14; no license file; no releases; last push 2026-08-14).",
			triggers: [
				"fluxity api streaming",
				"token lockup events indexer stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Trustless-Work/trustlesswork-sdk-react": [
		{
			note: "Trustless Work's open-source React library for integrating its escrows. Read the package identity carefully: the README links npm @trustless-work/escrow, whose published package (3.0.5, 2026-01-02) declares its repository as Trustless-Work/react-library-trustless-work, NOT this repo — so this repository and the published package are not the same source as of 2026-09-14 (README and npm read 2026-09-14; no license file; last push 2026-08-14).",
			triggers: ["trustless work react sdk", "escrow react library stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Trustless-Work/trustlesswork-skill": [
		{
			note: 'Trustless Work\'s AI development skill for agents — the README states it documents the PRODUCTION V1 INTEGRATION and pins "Protocol version: V1", which is the kind of version anchor an agent needs before generating integration code (README read 2026-09-14; license NOASSERTION; 1 star; no releases; last push 2026-09-12).',
			triggers: ["trustless work skill agents", "escrow integration skill"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Trustless-Work/cminds-coastal": [
		{
			note: "The CMinds coastal-communities escrow pilot: a role-based USDC funding platform for community-led coastal conservation tasks, built by CMinds (cminds.org) on Trustless Work. A concrete deployment of the escrow protocol into conservation funding rather than a demo (README read 2026-09-14; no license file; no releases; last push 2026-07-18).",
			triggers: [
				"cminds coastal escrow",
				"conservation funding stellar",
				"role based usdc escrow",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Bond-Hive/soroban_contracts": [
		{
			note: "BondHive's Soroban contracts: the platform issues crypto bonds using DELIVERY FUTURES from centralised exchanges to lock in yield, and these are the on-chain contracts for that. Last push 2024-10-25 with no release, so this documents BondHive's 2024 Soroban work (README read 2026-09-14; no license file).",
			triggers: ["bondhive crypto bonds", "delivery futures yield stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"BreadchainCoop/coopstable-client": [
		{
			note: "The client for CoopStable, a yield-bearing stablecoin project funded by a Stellar kickstarter grant (the GitHub description states both). The README itself is the unmodified create-next-app scaffold, so the description is the only durable statement this repository makes about the product (README read 2026-09-14; no license file; no releases; last push 2026-04-07).",
			triggers: ["coopstable client", "breadchain stellar grant"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"CTX-com/Cards402": [
		{
			note: "Cards402 (cards402.com, API at api.cards402.com): virtual Visa cards for AI agents — pay USDC or XLM on Stellar and receive a card number, which the README times at about 33 seconds. The bridge between on-chain agent funds and ordinary card rails (README read 2026-09-14; no license file; 6 stars; no releases; last push 2026-07-26).",
			triggers: [
				"cards402 virtual card",
				"visa card for agents stellar",
				"usdc to card number",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"jamesbachini/x402-mcp-stellar": [
		{
			note: "A local stdio MCP server that calls x402-protected HTTP resources and pays automatically in Stellar USDC, configured for `stellar:testnet` by default and mainnet-ready through environment variables (`stellar:pubnet`) — the smallest working example of an agent paying a 402 on Stellar (README read 2026-09-14; MIT; 2 stars; no releases; last push 2026-04-21).",
			triggers: ["x402 mcp stellar", "mcp pay 402 usdc", "stdio mcp x402"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"RozoAI/rozo-intents-skills": [
		{
			note: "rozo-intents: Rozo's cross-chain payment skill for agents — send USDC/USDT across Ethereum, Arbitrum, Base, BSC, Polygon, Solana and Stellar by describing the intent in plain language, with Rozo handling wallet detection and token selection; distributed through ClawHub. Newest tag v1.0.4 (README read 2026-09-14; MIT-0; last push 2026-08-11).",
			triggers: [
				"rozo intents skill",
				"cross chain usdc agent",
				"bridge stablecoin plain language",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"RozoAI/rozo-deeplink": [
		{
			note: "Rozo Deeplink: a universal deeplink and QR-code parser for web3 applications — a monorepo with the parsing core, a React QR-scanning component and a demo (rozo-deeplink-demo.vercel.app). Newest release v1.1.0 (README read 2026-09-14; no license file; last push 2026-09-13).",
			triggers: ["rozo deeplink parser", "qr code parser web3"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"theboycoder/confidential-agent-commerce": [
		{
			note: "Confidential Agent Commerce (confidential-agent-commerce.vercel.app): two AI agents buy and sell from each other on Stellar testnet with the AMOUNT ENCRYPTED ON-CHAIN — anyone can see a payment happened, and only the buyer, the seller and a REGISTERED AUDITOR can see how much. The auditor role is the part worth citing when confidential payments meet compliance (README read 2026-09-14; no license file; no releases; last push 2026-09-14).",
			triggers: [
				"confidential agent commerce",
				"encrypted amount stellar",
				"registered auditor confidential",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"0xdevcollins/stellar-dvn": [
		{
			note: "An independent LayerZero V2 Decentralized Verifier Network for Stellar — a Soroban contract plus an off-chain verifier. The README is refreshingly plain that it was built for the fun of it, not for a client or a launch, to answer whether a working DVN on Stellar was possible; read it as a feasibility artefact, not a service (README read 2026-09-14; no license file; no releases; last push 2026-08-13).",
			triggers: [
				"layerzero dvn stellar",
				"decentralized verifier network soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"NebulaVRF/vrf-contract": [
		{
			note: "NebulaVRF's testnet contract: verifiable on-chain randomness on Soroban using BLS12-381 with a COMMIT–REVEAL scheme, shipped with integration docs. A second, independent VRF design alongside NibrasD/Stellar-VRF, which instead binds to the drand beacon — worth knowing both exist when randomness comes up (README read 2026-09-14; MIT; 1 star; no releases; last push 2026-02-14).",
			triggers: [
				"nebulavrf randomness",
				"commit reveal randomness soroban",
				"bls12-381 vrf stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"davedumto/veil": [
		{
			note: "Veil (veil-kohl-zeta.vercel.app): provably honest AI predictions anchored on Stellar — a predictor proves a forecast was genuinely computed by a real model WITHOUT REVEALING THE MODEL'S WEIGHTS, commits it on-chain BEFORE the event and reveals afterwards, on Soroban testnet. A clean statement of the commit-before-reveal pattern applied to model outputs (README read 2026-09-14; no license file; no releases; last push 2026-06-29).",
			triggers: [
				"veil ai predictions",
				"prove model inference stellar",
				"commit before reveal forecast",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"leocagli/stellar-rwa-holder-cap": [
		{
			note: "A holder-count compliance module for OpenZeppelin RWA tokens on Stellar that enforces a cap on the number of holders — the Reg D / Section-style constraint an issuer must keep to, implemented as a token module rather than off-chain bookkeeping. Newest release v0.1.0 (README read 2026-09-14; MIT; last push 2026-08-06).",
			triggers: [
				"holder cap compliance stellar",
				"reg d holder limit token",
				"rwa compliance module soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"kaankacar/tr-mock-anchor": [
		{
			note: "TR Mock Anchor: a mock Turkish TRY⇄USDC on/off-ramp on Stellar testnet for builders who need a TRY ramp before a production anchor exists, exposed through the standard PORTABLE SEP PATH — SEP-1, SEP-10, SEP-6, SEP-12 and SEP-38 — so an integration written against it moves to a real anchor unchanged (README read 2026-09-14; MIT; no releases; last push 2026-09-08).",
			triggers: [
				"mock anchor try usdc",
				"sep-6 sep-38 test anchor",
				"turkish lira ramp stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"kaankacar/sepolia-to-stellar-usdc": [
		{
			note: "A one-page bridge demo: swap testnet ETH for CIRCLE-ISSUED USDC on Uniswap v3 (Ethereum Sepolia), then burn it through CCTP V2 with a hook that routes it to a Stellar testnet account — a concrete, readable example of the CCTP path onto Stellar (README read 2026-09-14; no license file; no releases; last push 2026-08-25).",
			triggers: [
				"cctp bridge stellar testnet",
				"sepolia usdc to stellar",
				"circle cctp v2 hook",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"mrnetwork0001/Nexa": [
		{
			note: "Nexa (nexa-ai-bridge.vercel.app): an autonomous AI payment bridge built for an Agents on Stellar hackathon, demonstrating Stellar as settlement infrastructure for the agent economy (README read 2026-09-14; no license file; no releases; last push 2026-04-11).",
			triggers: ["nexa ai payment bridge"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"0xZyrick/fog-of-chess": [
		{
			note: "Lantern Chess (the repo is named fog-of-chess): fog-of-war chess on Stellar where every move is verified by a zero-knowledge proof — an opponent learns that something moved but never what. Live at lanternchess.vercel.app; topics zk-proof, soroban (README read 2026-09-14; MIT; no releases; last push 2026-03-04).",
			triggers: [
				"lantern chess zk",
				"fog of war chess stellar",
				"hidden move proof soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"gmanjuns027/Poison-Game": [
		{
			note: "Poison Game (poison-game-one.vercel.app): a zero-knowledge battleship-style game on Soroban whose proofs are written in NOIR — a different proving stack from Dark Fleet's Pedersen commitments, useful when the question is which ZK toolchains have actually been used on Stellar (README read 2026-09-14; no license file; no releases; last push 2026-02-23).",
			triggers: ["poison game zk battleship", "noir proofs stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"beranalpa/Cangkulan-Lite-ZK-Card-Game": [
		{
			note: "Cangkulan Lite: a zero-knowledge card game on Soroban whose README badges FOUR DISTINCT ZK PROOF MODES — a comparison of proving approaches inside one game rather than a single implementation (README read 2026-09-14; MIT; no releases; last push 2026-02-22).",
			triggers: ["cangkulan zk card game", "four proof modes stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"litemint/cyberbrawl-community-resources": [
		{
			note: "Community-created resources for Cyberbrawl (cyberbrawl.io), Litemint's fast competitive card battler — the community repository rather than the game's own source. Its topics still carry hacktoberfest/hacktoberfest2021 (README read 2026-09-14; MIT; 5 stars; no releases; last push 2026-09-14).",
			triggers: ["cyberbrawl community resources", "litemint card battler"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"rahimklaber/stellar_kt": [
		{
			note: "stellar_kt: a MULTIPLATFORM Kotlin Stellar SDK targeting JS, Native and JVM — the README states the author's aim is basic transaction creation, signing and submission first, with Soroban planned once that lands, so do not assume Soroban coverage. 6 stars; no release published (README read 2026-09-14; no license file; last push 2026-07-15).",
			triggers: ["kotlin multiplatform stellar sdk", "stellar_kt sdk"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/frontend-helpers": [
		{
			note: "SDF's shared frontend helpers — functionality the team kept duplicating across projects, collected so there is less to maintain; the README's own rule is that anything done in more than one repo belongs here. Newest release v2.1.4 (README read 2026-09-14; no license file; last push 2026-07-01).",
			triggers: ["stellar frontend helpers"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/screencasts": [
		{
			note: "The content behind Stellar's screencasts, written in Tape — the scripts and recordings source rather than the videos themselves (README read 2026-09-14; no license file; no releases; last push 2026-09-04).",
			triggers: ["stellar screencasts content"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-experimental/stellar-spec": [
		{
			note: "A Stellar Protocol Specification Suite dated 2026-06-21 and marked Version 27 (stellar-core v27.0.0 / Protocol 27), status Informational — an organised specification index rather than the CAPs themselves. Cite the protocol version it declares, because the document is a snapshot (README read 2026-09-14; no license file; no releases; last push 2026-06-21).",
			triggers: [
				"stellar protocol specification suite",
				"protocol 27 spec index",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-experimental/zig-soroban-sdk": [
		{
			note: "An experimental Zig SDK for writing Soroban contracts, requiring Zig 0.15+ and the Stellar CLI. Its README opens with a CAUTION box: experimental, and not to be used for anything beyond toy experiments. Notable as proof that Soroban contracts have been written outside Rust (README read 2026-09-14; Apache-2.0; 3 stars; no releases; last push 2026-03-20).",
			triggers: [
				"zig soroban sdk",
				"write soroban contract zig",
				"non-rust soroban contract",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"blindpaylabs/blindpay-cli": [
		{
			note: "npm @blindpay/cli 0.6.0 (published 2026-08-03; the package's repository points back at this repo): BlindPay's command-line interface, documented at blindpay.com/blog/cli. Newest GitHub release v0.6.0 (README read 2026-09-14; MIT; 4 stars; last push 2026-08-08).",
			triggers: ["blindpay cli"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"blindpaylabs/blindpay-python": [
		{
			note: "PyPI blindpay 3.4.0 (the project's homepage points back at this repo): BlindPay's Python SDK, with the GitHub release line at v3.4.0 as of the read (README read 2026-09-14; MIT; 3 stars; last push 2026-08-08).",
			triggers: ["blindpay python sdk"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"hot-dao/hot-validation-sdk": [
		{
			note: "HOT DAO's validation SDK: the glue authorising signature generation on the MPC side of the Omni bridge, wrapping RPC calls to several chains — a request typically starts with a call to NEAR and then reaches the others. A GitHub code search finds 14 occurrences of `stellar` in the repository (searched 2026-09-14), so Stellar is one validated chain among several rather than the subject (README read 2026-09-14; no license file; 3 stars; no releases; last push 2026-06-14).",
			triggers: ["hot validation sdk", "omni bridge mpc validation"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"airgap-it/airgap-angular-components": [
		{
			note: "AirGap's shared Angular libraries (core and ngrx), used across AirGap Wallet and AirGap Vault. A GitHub code search finds 4 occurrences of `stellar` in the repository (searched 2026-09-14), so this is multi-chain wallet UI infrastructure that includes Stellar, not a Stellar library (README read 2026-09-14; no license file; 5 stars; no releases; last push 2026-03-19).",
			triggers: ["airgap angular components"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Tellus-Cooperative/.github": [
		{
			note: "Tellus Cooperative's GitHub organisation profile repository — the org's profile card, not code. Their Stellar work is in Tellus-Cooperative/stellar-paylink (metadata read 2026-09-14; no license file; no releases; last push 2026-09-10).",
			triggers: ["tellus cooperative profile"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"nirvana-labs/nirvana-go": [
		{
			note: "The official Go client for the Nirvana Labs REST API, published on pkg.go.dev, newest release v2.0.0. A GitHub code search finds 0 occurrences of `stellar` in the repository (searched 2026-09-14) — like its TypeScript sibling it is indexed through its owner's project, not through Stellar code; do not cite it as a Stellar library (README read 2026-09-14; Apache-2.0; 4 stars; last push 2026-09-11).",
			triggers: ["nirvana labs go library"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"nirvana-labs/terraform-provider-nirvana": [
		{
			note: "Nirvana Labs' Terraform provider, published on the Terraform registry (newest release v1.52.32) for managing their infrastructure API from Terraform. Infrastructure-as-code tooling with no Stellar-specific content (README read 2026-09-14; Apache-2.0; 2 stars; last push 2026-09-08).",
			triggers: ["nirvana terraform provider"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ondoprotocol/global-markets-solana": [
		{
			note: "Triage 2026-09-14: NOT a Stellar repo. Ondo Finance's Global Markets program is a SOLANA smart contract for creating, minting and redeeming GM tokens with access control and rate limiting; a GitHub code search finds 0 occurrences of `stellar` in the repository. Indexed through Ondo's curated project row, whose Stellar presence must be evidenced elsewhere. https://github.com/ondoprotocol/global-markets-solana",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"llinsss/petChain-Frontend": [
		{
			note: "Triage 2026-09-14: NOT a Stellar repo, and a fork. The README states PetChain is built on STARKNET and the badges point at the upstream DogStark/petChain-Frontend; a GitHub code search finds 0 occurrences of `stellar` in the repository. https://github.com/llinsss/petChain-Frontend",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"janvibuilds/Orka": [
		{
			note: 'Triage 2026-09-14: a FORK (upstream x0lg0n/Orka, whose CI badge the README still uses) with 0 occurrences of `stellar` in a GitHub code search, though the README\'s tagline claims "Stellar/Soroban financial infrastructure underneath". A claim in a tagline that the code does not evidence is not a fact to publish; read the upstream repository instead. https://github.com/janvibuilds/Orka',
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	// ── P5 wave 13 (2026-09-14) — 50 more curated-pool repos with no entry
	// (324 remained after wave 12). Read 2026-09-14.
	"alexanderkoh/stellarlight": [
		{
			note: "The public repository of Stellar Light itself (stellarlight.xyz) — the data layer for the Stellar ecosystem, a curated index of what has been built and who to work with, served to people through the web app and to agents through the Stellar Scout API, MCP server and skill (README read 2026-09-14; MIT; 4 stars; no releases; last push 2026-09-14).",
			triggers: ["stellar light data layer", "stellarlight repository"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Stellar-Light/awesome-stellar-community-fund": [
		{
			note: "Twelve AI skills plus curated guides for the Stellar Community Fund (stellarlight.xyz/skills) — claim verification, application guidance and reference material for SCF participants. Created by LumenLoop and now maintained by Stellar Light (README read 2026-09-14; MIT; no releases; last push 2026-07-23).",
			triggers: ["scf skills collection", "awesome stellar community fund"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"lumenloop/lumenloop-skills": [
		{
			note: "LumenLoop's preconfigured Claude Agent Skills: playbooks that make any MCP-capable assistant useful for researching and building on Stellar, wired to LumenLoop's free read-only ecosystem MCP server. The peer of Stellar Light's own skills collection, and worth citing when comparing what agent tooling the ecosystem already publishes (README read 2026-09-14; MIT; 3 stars; no releases; last push 2026-06-16).",
			triggers: [
				"lumenloop skills",
				"stellar agent playbooks",
				"ecosystem mcp skills",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"kalepail/stellar-mpp-sdk": [
		{
			note: "Stellar support for the Machine Payments Protocol (mpp.dev): machine-to-machine payments using Soroban SAC token transfers, with optional support for one-way payment channels — the Stellar payment method inside MPP rather than a wallet. Note this copy is a GitHub FORK, so check the upstream for the current state (README and metadata read 2026-09-14; no license file; no releases; last push 2026-03-20).",
			triggers: [
				"stellar mpp sdk",
				"machine payments protocol stellar",
				"sac transfer payment channel",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"lumenbro/joule-contracts": [
		{
			note: "The Soroban contracts behind JOULE, LumenBro's prepaid AI-compute credit on Stellar, with the unit defined precisely in the README: 1 JOULE = 1,000 Joules of estimated AI inference energy, paid per query through the x402 HTTP payment protocol. Newest tag v0.4.0-se_joule-token_pkg0.2.0_cli22.8.1 (README read 2026-09-14; no license file; last push 2026-02-13).",
			triggers: [
				"joule compute credits",
				"prepaid ai inference stellar",
				"pay per query x402",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"57blocks/agentsmith-x402": [
		{
			note: "agentsmith-x402: open-source x402 payments and discovery for Stellar — agents discover HTTP and MCP services in Bazaar, receive a 402 challenge from the resource server, and pay through a SELF-HOSTED Stellar facilitator, which is the part most x402 stacks leave to a third party (README read 2026-09-14; Apache-2.0; no releases; last push 2026-08-28).",
			triggers: [
				"agentsmith x402",
				"self hosted stellar facilitator",
				"bazaar service discovery x402",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Micopay/micopaybridge": [
		{
			note: "MicoPay Bridge (micopay.com.mx/bridge): a peer-to-peer market for AI agents secured by escrows — two agents that have never met settle a trade ACROSS XRPL AND STELLAR atomically with no custodian, account or prior registration, and can cash out to physical channels in Mexico. Topics name htlc, atomic-swap, x402 and zero-knowledge (README read 2026-09-14; MIT; no releases; last push 2026-09-04).",
			triggers: [
				"micopay bridge agents",
				"xrpl stellar atomic swap",
				"htlc agent escrow",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"axis-markets/orderbook": [
		{
			note: "The AXIS limit-orderbook DEX contract for Stellar, whose README documents the interface directly — `last() -> u64` for the newest order id and `order(id) -> Option<Order>` to fetch one — so the contract's read surface is citable without decompiling it (README read 2026-09-14; no license file; no releases; last push 2026-09-13).",
			triggers: ["axis orderbook contract", "limit orderbook dex soroban"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Fundable-Protocol/stellar_indexer": [
		{
			note: "The Fundable Indexer: a Bun/Turborepo workspace that reads Soroban CONTRACT EVENTS, turns them into typed application data and stores the result in PostgreSQL — the same event-indexing need that Recall and Fluxity solve, here as an open-source component (README read 2026-09-14; no license file; no releases; last push 2026-07-18).",
			triggers: [
				"fundable indexer events",
				"soroban events to postgres",
				"typed contract event data",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"withObsrvr/stellar-extract": [
		{
			note: "A shared Go library for extracting typed rows from Stellar ledger data, which the README calls the single source of truth for BRONZE-LAYER extraction across the Obsrvr data platform — installable as github.com/withObsrvr/stellar-extract. The ingestion layer beneath Obsrvr's Prism explorer (README read 2026-09-14; no license file; no releases; last push 2026-08-18).",
			triggers: [
				"stellar extract go library",
				"bronze layer ledger extraction",
				"typed ledger rows go",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"SentinelFi/stellar_wallet_mock": [
		{
			note: "stellar-wallet-mock: a Playwright testing library that MOCKS THE FREIGHTER extension so a Stellar/Soroban dApp can be tested headlessly end to end without a real wallet — the missing piece for CI on any wallet-connected front end (README read 2026-09-14; no license file; no releases; last push 2026-04-07).",
			triggers: [
				"mock freighter playwright",
				"e2e test stellar dapp",
				"wallet mock testing",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"salazarsebas/acachete-faucet": [
		{
			note: "Acachete Labs' MULTI-TOKEN faucet for Stellar testnet and futurenet (faucet-stellar.acachete.xyz) — broader than friendbot, which funds XLM only, so it is the answer when a builder needs test assets beyond lumens (README read 2026-09-14; MIT; no releases; last push 2026-03-02).",
			triggers: [
				"acachete faucet multi token",
				"testnet token faucet stellar",
				"futurenet faucet",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"paltalabs/defindex-sdk": [
		{
			note: "The DeFindex SDK, published on npm as @defindex/sdk (the README's badge) with the GitHub release line at v0.3.0 — the client for DeFindex's vaults, and the dependency Soroswap's front end uses for its earning and farming features (README read 2026-09-14; the README badges MIT while GitHub reports no license file; 2 stars; last push 2026-09-04).",
			triggers: ["defindex sdk vaults", "defindex client library"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"rahimklaber/SStream": [
		{
			note: "SStream (s-stream.vercel.app): an early streaming-payments protocol for Soroban whose README states its three functions plainly — create a stream by naming recipient, amount per second, total and end, then the operations around it. Last push 2024-07-24, so it is the 2024 reference implementation of the pattern that Fluxity and Quipay later productised (README read 2026-09-14; no license file; 3 stars; no releases).",
			triggers: [
				"sstream streaming payments",
				"amount per second stream soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"luanlabs/fluxity.finance": [
		{
			note: "The landing page for Fluxity (fluxity.finance), the token-streaming and lockup platform on Soroban — the marketing surface whose backend is luanlabs/fluxity-api; topics money-streaming, soroban (README read 2026-09-14; MIT; no releases; last push 2026-08-14).",
			triggers: ["fluxity landing page", "money streaming stellar site"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"defarm-repo/tooling": [
		{
			note: "DeFarm's public developer tooling — a TypeScript SDK and CLI for integrating with the DeFarm platform, whose agricultural traceability the README says is anchored on STELLAR MAINNET (not testnet, which is unusual in this cohort). The repository is a public snapshot of the tooling that ships with the product (README read 2026-09-14; MIT; no releases; last push 2026-09-02).",
			triggers: ["defarm tooling sdk", "agri traceability mainnet stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"warp-driver/oracle-demo": [
		{
			note: "A two-operator WarpDrive oracle that polls CoinGecko every 30 seconds for BTC-USD and ETH-USD and settles quorum-signed rounds into a single on-chain OracleContract on Stellar testnet — the README's value is that it demonstrates WarpDrive's cron, Stellar-event and composition-event triggers in one artefact (README read 2026-09-14; MIT; no releases; last push 2026-06-24).",
			triggers: [
				"warpdrive oracle demo",
				"quorum signed price rounds stellar",
				"cron trigger oracle soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Kali-Decoder/stellar-crates-tinder": [
		{
			note: "swyft.fun (the repo is named stellar-crates-tinder): non-custodial swipe investing for tokenised real-world assets on Stellar — set a budget, swipe assets into a basket, deposit stablecoin on TESTNET through Freighter, and hold vault share tokens, with prices from DIA-compatible oracles (README read 2026-09-14; no license file; no releases; last push 2026-08-24).",
			triggers: [
				"swyft swipe investing",
				"tokenized rwa basket stellar",
				"dia oracle stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ACTA-Team/ACTA-docs": [
		{
			note: "The ACTA documentation site (docs.acta.build): the single reference for issuers, holders, verifiers and integrators building on ACTA's verifiable credentials and `did:stellar` identity, covering the REST API and the rest of the surface. Newest release v0.1.0 (README read 2026-09-14; MIT; last push 2026-08-22).",
			triggers: [
				"acta documentation",
				"did:stellar docs",
				"verifiable credentials reference stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"SCF-Public-Goods-Maintenance/pg-atlas-frontend": [
		{
			note: "The PG Atlas dashboard at pgatlas.xyz — Vite, React, TanStack Router and Query over the metrics backbone for the SCF Public Goods dependency graph; the third piece alongside pg-atlas-backend and pg-atlas-ts-sdk (README read 2026-09-14; license NOASSERTION; 1 star; no releases; last push 2026-07-30).",
			triggers: ["pg atlas dashboard", "public goods dependency graph ui"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Brale-xyz/docs": [
		{
			note: "The open-source developer documentation for Brale's stablecoin infrastructure API (docs.brale.xyz) — issuing your own stablecoin and moving value, documented publicly, which makes it a citable source for how a regulated issuer's API is shaped (README read 2026-09-14; MIT; 1 star; no releases; last push 2026-09-14).",
			triggers: ["brale api docs", "issue your own stablecoin api"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"blindpaylabs/blindpay-php": [
		{
			note: "BlindPay's official PHP SDK for its stablecoin payments API, requiring PHP 8.2+ and installed with `composer require blindpay/php`. GitHub release line v3.4.0, matching the Python SDK's (README read 2026-09-14; MIT; 2 stars; last push 2026-08-08).",
			triggers: ["blindpay php sdk", "composer blindpay"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"blindpaylabs/blindpay-skills": [
		{
			note: "BlindPay's agent skills. Note the duplication before citing a path: blindpaylabs/skills is byte-for-byte the same project — same description, same README, same 564 KB, both created 2026-01-30 and neither marked a fork — so one of the two is a rename or a copy, and there is no signal in the metadata for which is canonical (README and metadata read 2026-09-14; MIT; 5 stars; no releases; last push 2026-09-14).",
			triggers: ["blindpay agent skills"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"blindpaylabs/skills": [
		{
			note: "BlindPay's agent skills — the twin of blindpaylabs/blindpay-skills, identical in description, README, size (564 KB) and creation date (2026-01-30), with neither marked a fork. Cite the pair, not one path, until the org states which is canonical (README and metadata read 2026-09-14; MIT; 5 stars; no releases; last push 2026-09-14).",
			triggers: ["blindpay skills duplicate"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"dfns/dfns-sdk-go": [
		{
			note: "The Dfns Go SDK (v2, godoc at github.com/dfns/dfns-sdk-go/v2), newest release v2.2.0 — the custody provider's Go client, sibling of dfns-sdk-java. Treat it as a custody SDK that supports Stellar among other chains, not a Stellar library (README read 2026-09-14; MIT; 8 stars; last push 2026-09-11).",
			triggers: ["dfns go sdk"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"DcentWallet/info": [
		{
			note: "D'CENT's user-facing information repository: the wallet's user guide, its SUPPORTED COIN LIST at dcentwallet.com/SupportedCoin and its firmware version list — the place to check what D'CENT actually supports rather than inferring it (README read 2026-09-14; no license file; 2 stars; no releases; last push 2026-06-09).",
			triggers: ["dcent supported coins", "dcent wallet user guide"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"DcentWallet/biometric-firmware": [
		{
			note: "D'CENT's release repository for Biometric Wallet firmware images; newest release v2.36.2 (2026-09-10). Firmware distribution, so the release feed is the fact — there is no source here (README read 2026-09-14; no license file; last push 2026-09-10).",
			triggers: ["dcent biometric firmware"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"allbridge-io/allbridge-mcp": [
		{
			note: "allbridge-mcp: an MCP server for Allbridge bridge workflows that helps an agent plan a transfer, build execution jobs, broadcast signed payloads and track the result WITHOUT HOLDING PRIVATE KEYS — the key-custody boundary is the design point worth citing (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-05-04).",
			triggers: ["allbridge mcp server", "agent bridge without keys"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"SwitchlyProtocol/node-launcher": [
		{
			note: "Switchly's node launcher: Helm charts plus a Makefile for deploying the SwitchlyNode stack and its tools with predefined configuration per environment. Operations tooling for running a node rather than protocol code (README read 2026-09-14; MIT; no releases; last push 2026-08-15).",
			triggers: ["switchly node launcher", "helm charts switchlynode"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"btq-ag/QRiNG": [
		{
			note: "QRiNG: a hybrid quantum-blockchain protocol for VERIFIABLE QUANTUM RANDOM NUMBER GENERATION — randomness from Hadamard-circuit measurements settled on-chain by majority vote. A GitHub code search finds 0 occurrences of `stellar` in the repository (searched 2026-09-14), so the settlement chain is not evidenced here; cite it for the randomness protocol, not for a Stellar deployment (README read 2026-09-14; MIT; 2 stars; no releases; last push 2026-07-22).",
			triggers: ["qring quantum randomness", "quantum rng blockchain"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"btq-ag/Leonne": [
		{
			note: "Leonne: a modular framework for simulating consensus networks using post-quantum topological methods, from BTQ. A GitHub code search finds 0 occurrences of `stellar` (searched 2026-09-14) — consensus research rather than Stellar code (README read 2026-09-14; MIT; 6 stars; no releases; last push 2026-04-15).",
			triggers: [
				"leonne consensus simulation",
				"post quantum consensus framework",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"btq-ag/QLDPC": [
		{
			note: "QLDPC: an interactive Python toolkit for quantum LDPC error correction — a circuit builder with real-time visualisation, built on Qiskit. Quantum-computing research from BTQ with no Stellar-specific content (README read 2026-09-14; MIT; 2 stars; no releases; last push 2026-04-16).",
			triggers: ["qldpc error correction toolkit"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"GetBlock-io/rpc-endpoint-benchmark": [
		{
			note: "GetBlock's public RPC benchmark resources: profiles for testing endpoint speed, reliability, method compatibility, rate limits and CHAIN FRESHNESS. Its topics list Ethereum, Solana, Polygon, BNB, Base and Arbitrum, and a code search finds 0 occurrences of `stellar` (searched 2026-09-14), so the methodology transfers but no Stellar profile is published here (README read 2026-09-14; MIT; 1 star; no releases; last push 2026-07-31).",
			triggers: ["rpc endpoint benchmark", "rpc latency methodology"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"nirvana-labs/nirvana-cli": [
		{
			note: "The official CLI for the Nirvana Labs REST API, installable through a Homebrew tap, newest release v0.55.0 — the third Nirvana Labs client in the index alongside nirvana-go and nirvana-typescript, all indexed through their owner's project rather than through Stellar code (README read 2026-09-14; Apache-2.0; last push 2026-09-08).",
			triggers: ["nirvana labs cli"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"blaze-xyz/betterstack-logs-mcp": [
		{
			note: "An MCP server for querying and analysing Betterstack logs across multiple sources and source groups with source selection — Blaze's internal observability tooling exposed to agents, with no Stellar-specific content (README read 2026-09-14; MIT; 1 star; no releases; last push 2026-02-20).",
			triggers: ["betterstack logs mcp"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ondoprotocol/gm-solana-simulator": [
		{
			note: "A Rust library for simulating Ondo Global Markets JIT trades through Jupiter RFQ: GM tokens are minted JUST-IN-TIME when a swap occurs, which the README explains breaks standard transaction simulation — the problem this library exists to solve. Solana, not Stellar (README read 2026-09-14; no license file; 3 stars; no releases; last push 2026-09-04).",
			triggers: ["ondo gm simulator", "jit mint simulation jupiter"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/.github": [
		{
			note: "The @stellar org's default community health files — CODE_OF_CONDUCT, CONTRIBUTING, issue and pull-request templates that GitHub applies across the org's repositories. 14 stars for a repository that contains no product (README read 2026-09-14; no license file; no releases; last push 2026-09-09).",
			triggers: [
				"stellar community health files",
				"stellar contributing template",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"OFFER-HUB/OFFER-HUB-Frontend": [
		{
			note: "The Offer-Hub front end (offer-hub.org): Next.js 16, TypeScript 5 and Tailwind 4. The README is a quick-start and states nothing about the product or its Stellar integration, so the site itself is the grounding for what Offer-Hub does (README read 2026-09-14; no license file; 3 stars; no releases; last push 2026-09-14).",
			triggers: ["offer hub frontend"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"viniciorm/culturago-stellar": [
		{
			note: "CulturaGO (culturago.vercel.app): a platform of verifiable digital CULTURAL PASSPORTS for artists, schools, teachers, organisations and cultural-sector providers, presented as an FDVC 2026 MVP; the README is in Spanish (README read 2026-09-14; no license file; no releases; last push 2026-09-11).",
			triggers: [
				"culturago cultural passport",
				"verifiable cultural credentials",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"0xVida/inter-stellar-battle": [
		{
			note: "INTER-STELLAR (inter-stellar-battle.vercel.app): a retro 16-bit wagered fighting game on Stellar where WHICH MOVE YOU THREW never becomes visible to the chain or the public, and in its Blind Duel mode an opponent does not even learn your character or stats — the hidden-information pattern applied to real-time combat rather than turn-based play (README read 2026-09-14; no license file; no releases; last push 2026-07-03).",
			triggers: [
				"inter-stellar battle game",
				"private wagered combat stellar",
				"blind duel hidden stats",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Clash-Of-Pirates/Clash-of-pirates": [
		{
			note: "Clash (clash-of-pirates.vercel.app): a fully on-chain PvP strategy game on Stellar where cryptographic proofs keep play fair without revealing moves until they resolve — another entry in the ecosystem's hidden-information game cluster (README read 2026-09-14; no license file; no releases; last push 2026-06-27).",
			triggers: ["clash of pirates zk", "onchain pvp strategy stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ThaisFReis/Proof-of-Life": [
		{
			note: "Proof of Life: a two-player asymmetric thriller on Stellar whose README states the mechanic exactly — your position is a secret and your moves are proofs — with a video walkthrough linked. Asymmetric information as the game design rather than as a feature (README read 2026-09-14; MIT; 1 star; no releases; last push 2026-03-02).",
			triggers: ["proof of life game", "asymmetric hidden position stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"deegalabs/deegagames-zk": [
		{
			note: "DeegaGames ZK (deegagames-zk.vercel.app): provably fair games with zero-knowledge proofs on Stellar, built for the Stellar Hacks: ZK Gaming hackathon — the same hackathon that produced Dark Fleet and Poison Game, which is why several independent ZK game repos share a date (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-02-23).",
			triggers: ["deegagames provably fair", "zk gaming hackathon stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"CaBsCrypto/pizzaninja": [
		{
			note: "Slash Slice Arena (slashslice.spicycrust.com): a browser game with 60 FPS MediaPipe HAND TRACKING — you slice with your hands — wired to Stellar through Privy; topics mediapipe, privy, soroban. An unusual input modality for an on-chain game (README read 2026-09-14; no license file; no releases; last push 2026-09-12).",
			triggers: [
				"slash slice arena",
				"hand tracking game stellar",
				"mediapipe web game",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Bond-Hive/interface": [
		{
			note: "BondHive's main interface repository. The README is the unmodified create-next-app scaffold and the GitHub description says only that it is the new interface, so nothing here documents the product — read Bond-Hive/soroban_contracts for what BondHive does on Stellar (README read 2026-09-14; MIT; no releases; last push 2025-06-16).",
			triggers: ["bondhive interface"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Bond-Hive/testnet_interface": [
		{
			note: "BondHive's testnet interface — the testnet twin of Bond-Hive/interface, likewise an unmodified create-next-app scaffold README with no product description; last push 2025-06-04 (README read 2026-09-14; MIT; no releases).",
			triggers: ["bondhive testnet interface"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"gateway-fm/miden-agglayer": [
		{
			note: "Triage 2026-09-14: NOT a Stellar repo. `miden-agglayer` connects Polygon AggLayer tooling to a MIDEN rollup, exposing an EVM-shaped JSON-RPC service and translating bridge transactions into Miden notes; newest release v0.16.2. SIXTH gateway-fm repo triaged this way (with lez-atomic-swaps, loadgenerator, ops-indexer, gasstorm and midenscan-indexer) — the whole org was swept into the pool behind the curated gatewayfm project, which is a genuine Stellar RPC provider. https://github.com/gateway-fm/miden-agglayer",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"acta-team/dApp-ACTA": [
		{
			note: "Triage 2026-09-14: GONE — `gh api repos/acta-team/dApp-ACTA` returns 404, so the repository was deleted, renamed or made private since indexing. ACTA's live repositories are under the ACTA-Team casing (acta-credentials, products-acta, ACTA-docs), all noted. The row should be retired or re-resolved. https://github.com/acta-team/dApp-ACTA",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"acta-team/website": [
		{
			note: "Triage 2026-09-14: GONE — 404 from the GitHub API, same as acta-team/dApp-ACTA. ACTA's live repositories are under the ACTA-Team casing. Retire or re-resolve the row. https://github.com/acta-team/website",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"switchlyprotocol/switchlynode": [
		{
			note: "Triage 2026-09-14: GONE — 404 from the GitHub API. The org's node-launcher repository (SwitchlyProtocol/node-launcher) is live and noted; this node repository is not reachable. Retire or re-resolve the row. https://github.com/switchlyprotocol/switchlynode",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	// ── P5 wave 14 (2026-09-14) — 50 more curated-pool repos with no entry
	// (274 remained after wave 13). Read 2026-09-14.
	"Stellar-Light/scout-mcp": [
		{
			note: "@stellar-light/scout-mcp: Stellar Scout as an MCP server, usable from Claude Desktop, Cursor, ChatGPT, Gemini, Cline, Continue, Zed or any Model Context Protocol client, exposing 19 tools over the Stellar Light index (README read 2026-09-14; MIT; 2 stars; no releases; last push 2026-09-05).",
			triggers: ["scout mcp server", "stellar light mcp tools"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"OpenZeppelin/soroban-security-detectors-sdk": [
		{
			note: "OpenZeppelin's Soroban security detectors SDK — the framework for writing static detectors against Soroban contracts, which is the upstream of automated Soroban security tooling rather than a one-off linter. Newest release v0.0.2 (README read 2026-09-14; AGPL-3.0; 8 stars; last push 2026-09-01).",
			triggers: [
				"soroban security detectors",
				"static analysis soroban contracts",
				"openzeppelin detector sdk",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"SoundnessLabs/stellar-pq": [
		{
			note: "Stellar Post-Quantum Cryptography (stellar-pq.soundness.xyz): experimental post-quantum schemes for Stellar explored at BOTH the application level, through Soroban Smart Accounts, and lower down — the clearest published answer to what post-quantum work on Stellar looks like today, with the word experimental carried from the README (README read 2026-09-14; MIT; 3 stars; no releases; last push 2026-08-27).",
			triggers: [
				"post quantum stellar",
				"pq smart accounts soroban",
				"quantum resistant signatures stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"blend-capital/liquidation-bot": [
		{
			note: "Blend's liquidation bot, built on Paradigm's Artemis framework — the reference implementation of keeping a Soroban lending protocol solvent. Newest release v1.0.0; last push 2024-08-02, so it documents the 2024 design; 13 stars (README read 2026-09-14; Apache-2.0).",
			triggers: [
				"blend liquidation bot",
				"artemis framework soroban",
				"liquidate lending position stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"kalepail/sorodoom": [
		{
			note: "SoroDOOM: a deterministic PureDOOM session run in a Soroban-compatible execution layer with the COMPLETE REPLAY settled on Stellar — the browser runs a pinned gameplay build and the replay is the proof. Topics deterministic-replay, doom, soroban; live at sorodoom.sdf-ecosystem.workers.dev. The most vivid demonstration available that deterministic replay can be settled on-chain (README read 2026-09-14; Apache-2.0; no releases; last push 2026-07-29).",
			triggers: [
				"sorodoom deterministic replay",
				"doom on soroban",
				"settle replay onchain stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Galmanus/vineland-sdk": [
		{
			note: "@vineland/sdk: behavioural-unlinkability compliance on Stellar — a wallet proves it belongs to an issuer's KYC'd set WITHOUT REVEALING WHICH MEMBER, no two of its actions link, and amounts stay public. A precise statement of the compliance-versus-privacy trade being attempted (README read 2026-09-14; MIT; no releases; last push 2026-08-23).",
			triggers: [
				"vineland unlinkability",
				"prove kyc set membership stellar",
				"compliance without linking",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/stellar-rpc-blaster": [
		{
			note: "SDF's internal RPC CLI load-testing tool. Its README opens with a note that the repository is IN DEVELOPMENT AND NOT YET READY FOR USE, pointing at the `dev` branch for current status — so cite it as work in progress, not a tool to reach for (README read 2026-09-14; no license file; no releases; last push 2026-09-03).",
			triggers: ["stellar rpc load testing", "rpc blaster tool"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Trustless-Work/trustlesswork-laboratory": [
		{
			note: "The Trustless Work demo dApp at demo.trustlesswork.com — a minimal example of interacting with the Trustless Work API, which makes it the shortest path to seeing the escrow flow end to end before integrating (README read 2026-09-14; no license file; no releases; last push 2026-09-14).",
			triggers: ["trustless work demo dapp", "escrow api example"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Moonlight-Protocol/network-dashboard-platform": [
		{
			note: "Moonlight Protocol's public network-dashboard backend: a WebSocket aggregator streaming a live anonymous view of the network, deployed as one Fly app per environment with NO DATABASE AND NO AUTH by design. Newest release v0.1.18 (README read 2026-09-14; MIT; last push 2026-08-27).",
			triggers: [
				"moonlight network dashboard",
				"websocket network view stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Moonlight-Protocol/pay-platform": [
		{
			note: "Moonlight Pay's backend: the wallet-based account service for the Moonlight Protocol (GitHub description; the README is empty). Its release line is the most active signal — v0.5.28 as of 2026-08-11 (metadata read 2026-09-14; no license file).",
			triggers: ["moonlight pay backend"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"reflector-network/node-orchestrator": [
		{
			note: "The orchestration component for Reflector oracle nodes (repo name and org; no description, empty README, no releases as of 2026-09-14). The documented pieces of that system are reflector-node, the connectors and the clients, all noted; this one states nothing about itself (metadata read 2026-09-14; no license file; last push 2026-08-27).",
			triggers: ["reflector node orchestrator"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellarchain/v4-api": [
		{
			note: "The StellarChain V4 API: a Symfony 8 and API Platform service for StellarChain's account and metrics data, exposing `/v1` docs and a `/v1/accounts` collection with the address as the API identifier — the backend of the stellarchain/v4 frontend (README read 2026-09-14; no license file; no releases; last push 2026-09-03).",
			triggers: ["stellarchain api accounts", "stellarchain v4 api"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"warp-driver/warpdrive": [
		{
			note: "The WarpDrive core repository — off-chain compute and Vectrs, the engine behind warpdrive-contracts and oracle-demo; the README badges the project status as active and stable enough to use (README read 2026-09-14; license NOASSERTION; no releases; last push 2026-06-04).",
			triggers: ["warpdrive offchain compute", "vectrs warpdrive"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Ben-Platform/kalienator": [
		{
			note: "Kalienator: a CLI program in Effect-TS for running KALE-earning operations around the clock (kalien.xyz) — the automation layer for Stellar's proof-of-teamwork farming game. Newest tag v0.1; topics kale, stellar, effect-ts (README read 2026-09-14; no license file; last push 2026-04-09).",
			triggers: [
				"kalienator kale farming",
				"kale earning automation",
				"effect-ts stellar cli",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Ben-Platform/kaleminator": [
		{
			note: "Kaleminator: the sibling of Kalienator — a CLI Effect-TS service that monitors transfers and triggers actions such as harvesting, organised as an apps/services workspace. Same KALE automation family (README read 2026-09-14; no license file; no releases; last push 2026-04-13).",
			triggers: [
				"kaleminator harvest trigger",
				"monitor transfers trigger action stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"MorcaLabs/tasmil": [
		{
			note: "Tasmil Finance: AI-powered DeFi portfolio infrastructure on Stellar/Soroban, built as a hackathon project (README read 2026-09-14; no license file; no releases; last push 2026-04-13).",
			triggers: ["tasmil finance portfolio", "ai defi portfolio stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Gbangbolaoluwagbemiga/orbitwork-stellar": [
		{
			note: 'OrbitWork (orbitwork-stellar.vercel.app): a cross-border freelance marketplace on Stellar TESTNET with a job board, escrow payments, on-chain reputation and three Soroban contracts, built during the Rise In "Stellar Journey to Mastery" programme — the README\'s own framing (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-07-07).',
			triggers: [
				"orbitwork freelance marketplace",
				"onchain reputation escrow stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Fastish/Prophecy-Markets": [
		{
			note: "Prophecy Markets: a zero-knowledge binary prediction-market platform on Stellar where anyone can create a market on any topic, built for the Stellar ZK Gaming hackathon (README read 2026-09-14; no license file; no releases; last push 2026-02-12).",
			triggers: [
				"prophecy prediction markets",
				"binary prediction market stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Jistriane/AXON-Micropayment-Platform-for-Decentralized-AI-Services-DeAI-": [
		{
			note: "AXON: a monorepo MVP for Stellar-based agentic micropayments for decentralised AI services, built for the Stellar Hacks: Agents hackathon (README read 2026-09-14; no license file; no releases; last push 2026-04-13).",
			triggers: [
				"axon micropayments deai",
				"agent micropayment platform stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"lucylow/stellar-hacks-agents": [
		{
			note: "A pay-per-query web-search MCP server on Stellar: the README states the problem precisely — agents need real-time search, but monthly subscriptions waste money per query and API keys are fragile — and answers it with per-query payment instead of a subscription. Built for Stellar Hacks: Agents (README read 2026-09-14; no license file; no releases; last push 2026-04-13).",
			triggers: ["pay per query search mcp", "per query payment agent stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"lumenbro/agents-portal": [
		{
			note: "LumenBro's AI Agent Portal (agents-portal-eta.vercel.app): passkey-secured smart wallets with ON-CHAIN SPEND POLICIES on Stellar — the hosted face of the policies in lumenbro/soroban-policies and the wallet the lumenjoule SDK creates against. The README is empty; the GitHub description is the durable statement (metadata read 2026-09-14; no license file; no releases; last push 2026-03-16).",
			triggers: ["lumenbro agents portal", "passkey wallet spend policy"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"lumenbro/joule-site": [
		{
			note: "The JOULE landing page (joule-site.vercel.app) for LumenBro's prepaid AI compute credits on Stellar — the marketing surface whose contracts are lumenbro/joule-contracts. The README is empty; the description is the record (metadata read 2026-09-14; no license file; no releases; last push 2026-03-11).",
			triggers: ["joule token site"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ACTA-Team/news-acta": [
		{
			note: "ACTA's news hub (news.acta.build): a Next.js site collecting the project's announcements, releases, partnerships and ecosystem updates — the place ACTA states its own dated claims, which makes it a citable source for when something shipped (README read 2026-09-14; MIT; no releases; last push 2026-08-21).",
			triggers: ["acta news hub", "acta announcements"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"EmmaSA1/Hack-tonalli": [
		{
			note: "A hackathon project that issues certificates through ACTA: the README's only durable content is a link to the issuing transaction on StellarExpert's TESTNET explorer plus a staging deployment workflow — useful as a worked example of ACTA credential issuance, not as a product (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-05-01).",
			triggers: ["hack tonalli acta certificate"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Keengfk/stellar-nft-app": [
		{
			note: "A digital-art NFT platform on Stellar in JavaScript and React, with a live demo and its contract address published in the README — a small, complete example of an NFT front end over a Soroban contract (README read 2026-09-14; MIT; last push 2026-08-22).",
			triggers: ["stellar nft app example", "digital art nft stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"NebulaVRF/landing": [
		{
			note: "The landing page for NebulaVRF, the commit–reveal BLS12-381 randomness contract in NebulaVRF/vrf-contract. The README is the unmodified create-next-app scaffold, so the sibling contract repository is where the substance is (README read 2026-09-14; no license file; no releases; last push 2026-02-14).",
			triggers: ["nebulavrf landing"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"0xZaid10/Cipher-Command-ZK-Game-on-Stellar-": [
		{
			note: "Cipher Command (cipher-command.vercel.app): a fully on-chain two-player strategy game on a 6×6 board where piece POSITIONS AND RANKS are never revealed, enforced by zero-knowledge proofs at every action — Stratego's hidden-rank problem solved with proofs (README read 2026-09-14; no license file; no releases; last push 2026-02-23).",
			triggers: [
				"cipher command hidden ranks",
				"stratego zk stellar",
				"hidden rank proofs game",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"LevanIlashvili/zkBattleship": [
		{
			note: "zkBattleship: zero-knowledge battleship on Stellar where players commit ship placements with NOIR proofs and verify shots on-chain using ULTRAHONK, so the board never leaves the browser. Built for Stellar Hacks ZK Gaming — a third independent battleship implementation in that cohort, and the one that names its proving system (README read 2026-09-14; MIT; no releases; last push 2026-02-23).",
			triggers: [
				"zkbattleship noir ultrahonk",
				"ultrahonk verification stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ShivamSoni20/ZKonfess": [
		{
			note: "ZKonfess (z-konfess.vercel.app): anonymous confessions on Stellar with ZK-Noir proofs, whose tagline states the design goal — cryptography, not trust, for immutable anonymity. Another Stellar Hacks ZK Gaming entry (README read 2026-09-14; MIT; no releases; last push 2026-02-23).",
			triggers: ["zkonfess anonymous", "anonymous posting zk stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"0xasuna/zkshotroul": [
		{
			note: "A ZK roulette-style game scaffolded from the Stellar Game Studio template collection — the README is the Game Studio's shared text (jamesbachini.github.io/Stellar-Game-Studio) rather than a description of this game, the same pattern as danielfsha/Card-RPG (README read 2026-09-14; MIT; 2 stars; no releases; last push 2026-06-24).",
			triggers: ["zkshotroul game", "stellar game studio scaffold"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"pellartech/coala-pay-weather-oracle": [
		{
			note: "A Soroban weather-oracle contract for Coala Pay that records and validates weather data across EPOCHS and triggers a token transfer on the outcome — parametric insurance in its simplest form, where a measurement releases funds (README read 2026-09-14; no license file; no releases; last push 2025-07-21).",
			triggers: [
				"weather oracle soroban",
				"parametric trigger token transfer",
				"coala pay oracle",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"fiatsend/techical-achitecture": [
		{
			note: "Fiatsend's published technical architecture for integrating with Stellar — Anchor Platform SEPs, Soroban and the DeFi building blocks they build on. A design document rather than code, and a rare case of an anchor-adjacent product publishing its integration plan (README read 2026-09-14; no license file; no releases; last push 2026-05-28).",
			triggers: [
				"fiatsend architecture stellar",
				"anchor platform integration design",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"untangledfinance/untangled-docs": [
		{
			note: "The documentation site for Untangled Protocol (docs.untangled.finance), built with Docusaurus — the user documentation behind the Blend-position risk agent and vault contracts noted elsewhere in this registry (README read 2026-09-14; no license file; no releases; last push 2026-08-31).",
			triggers: ["untangled protocol docs"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"untangledfinance/credio-docs": [
		{
			note: "The documentation site for Credio (docs.credio.network), which the GitHub description defines as streaming machine-learning model outputs from data scientists and rating agencies — the docs half of the credio-agents repository (README read 2026-09-14; no license file; no releases; last push 2026-08-11).",
			triggers: ["credio network docs", "streamed model outputs ratings"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"leocagli/Open-Stellar": [
		{
			note: "Open Stellar (v0-open-stellar.vercel.app): an AI agent hub on Cloudflare Workers with Groq — the project that leocagli/open-stellar-passport describes itself as the missing trust layer for. Note the CI and quality badges point at the Bitcoindefi org, so the canonical home may be that copy (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-08-31).",
			triggers: ["open stellar agent hub", "cloudflare workers groq stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"rangesecurity/faraday-sdk": [
		{
			note: "@rangesecurity/faraday-sdk: the TypeScript client for Range Security's Faraday API, published on npm; the README's quick start shows a Configuration plus a ChainsApi, so it is a multi-chain security/monitoring API client rather than a Stellar-specific library (README read 2026-09-14; MIT; no releases; last push 2026-06-22).",
			triggers: ["faraday sdk range security"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"AdamikHQ/adamik-sdk": [
		{
			note: "@adamik/sdk: a TypeScript SDK that DECODES AND VERIFIES blockchain transaction data returned by the Adamik API — a verification client for multi-chain transaction payloads, not a Stellar SDK (README read 2026-09-14; MIT; no releases; last push 2025-09-24).",
			triggers: [
				"adamik sdk decode verify",
				"verify transaction payload multichain",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"blockdaemon/automated-approver-service": [
		{
			note: "Blockdaemon's reference implementation of an Institutional Vault Automated Approver: it polls pending operations, signs `make transaction` and `transfer` intents with ECDSA P-256, and posts approve or reject decisions — the policy-automation pattern for custody, published as reference code. Newest release v2.0.0 (README read 2026-09-14; MIT; last push 2026-09-02).",
			triggers: [
				"automated approver custody",
				"institutional vault approval policy",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"crypto-com/crypto-agent-trading": [
		{
			note: "Crypto.com's agent skills for trading through its APIs — buy, sell, swap and query balances from any SKILL.md-compatible agent platform (OpenClaw, Cursor, Claude Code and others), two independent skills in one repository. 19 stars; an example of an exchange publishing agent skills directly (README read 2026-09-14; Apache-2.0; no releases; last push 2026-08-29).",
			triggers: ["crypto.com agent skills", "exchange trading skill agent"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Flutterwave/Woocommerce-v2": [
		{
			note: "Flutterwave's WooCommerce plugin for its Business (F4B) v2 APIs, newest release 3.3.0 (2026-09-09) — a merchant payment integration for WordPress stores. Part of Flutterwave's large plugin estate rather than Stellar-specific code (README read 2026-09-14; MIT; last push 2026-09-09).",
			triggers: ["flutterwave woocommerce plugin"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Brale-xyz/canton-backup-utility": [
		{
			note: "Brale's utility for backing up and restoring a CANTON Validator — currently covering users and their rights on the participant node. Canton infrastructure tooling, published by a stablecoin issuer whose developer docs are noted separately (README read 2026-09-14; MIT; 3 stars; no releases; last push 2026-07-09).",
			triggers: ["canton validator backup", "brale canton utility"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"airgap-it/airgap-docs": [
		{
			note: "The AirGap help centre and documentation for AirGap Vault and AirGap Wallet (support.airgap.it), built with Docusaurus — the user-facing documentation of a multi-chain air-gapped wallet that includes Stellar (README read 2026-09-14; no license file; 4 stars; no releases; last push 2026-03-24).",
			triggers: ["airgap documentation", "airgap vault wallet help"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ondoprotocol/rwa-contracts": [
		{
			note: "Ondo Finance's real-world-asset contracts in SOLIDITY, published set by set as products are announced; the README states every contract there is deployed on-chain and verified. Ondo's RWA work as visible in this repository is EVM, so do not cite it for a Stellar deployment (README read 2026-09-14; license NOASSERTION; no releases; last push 2026-08-25).",
			triggers: ["ondo rwa contracts", "ondo finance solidity rwa"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Inferara/inf-wasm-tools": [
		{
			note: "Inferara's fork of the WASM tools with support for NON-DETERMINISTIC OPERATIONS — the tooling under their Inference language, aimed at formal specification and verification of WASM programs. Relevant to Soroban only through WASM, which the repository does not claim (README read 2026-09-14; MIT; 3 stars; topics formal-methods, wasm; no releases; last push 2025-12-09).",
			triggers: ["inferara wasm tools", "nondeterministic wasm formal"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Inferara/book": [
		{
			note: "The user guide for Inferara's Inference programming language (inference-lang.org/book) — a formal-methods language, documented from installation to advanced use. No Stellar-specific content (README read 2026-09-14; Apache-2.0; no releases; last push 2026-07-26).",
			triggers: ["inference language book"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Inferara/tree-sitter-inference": [
		{
			note: "The tree-sitter grammar for the Inference language, published on crates.io — editor tooling for Inferara's formal-methods language, with no Stellar-specific content (README read 2026-09-14; GPL-3.0; 2 stars; no releases; last push 2026-03-23).",
			triggers: ["tree-sitter inference grammar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"nirvana-labs/karpenter-provider-nirvana": [
		{
			note: "A Karpenter node-provisioning provider for Nirvana Kubernetes Service (docs.nirvanalabs.io/cloud/nks) — Kubernetes infrastructure, newest release v0.15.1. The fourth Nirvana Labs repository in the index, none of which carries Stellar-specific code (README read 2026-09-14; Apache-2.0; last push 2026-08-26).",
			triggers: ["karpenter provider nirvana", "nks node provisioning"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"nirvana-labs/terraform-nirvana-nks": [
		{
			note: "A Terraform module for creating Nirvana Kubernetes Service clusters, published on the Terraform registry, newest release v0.3.1; authenticates through a NIRVANA_LABS_API_KEY. Infrastructure-as-code, no Stellar content (README read 2026-09-14; Apache-2.0; last push 2026-09-02).",
			triggers: ["terraform nks module"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"nirvana-labs/homebrew-tap": [
		{
			note: "Triage 2026-09-14: a Homebrew tap for installing Nirvana Labs products — packaging metadata, empty README, no releases. The fifth Nirvana Labs repository in the index; none carries Stellar-specific code. https://github.com/nirvana-labs/homebrew-tap",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"IvanMartinez134/Tomin": [
		{
			note: "Triage 2026-09-14: empty README, no GitHub description, no release, no topics — the repository states nothing durable about itself. Re-examine if it gains any of those. https://github.com/IvanMartinez134/Tomin",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	// ── P5 wave 15 (2026-09-14) — 50 more curated-pool repos with no entry
	// (224 remained after wave 14). Read 2026-09-14.
	"Soneso/as-soroban-sdk": [
		{
			note: "Soneso's Soroban SDK for ASSEMBLYSCRIPT — writing Soroban contracts in a TypeScript-like language instead of Rust, at v1.2.0. With stellar-experimental's Zig and C SDKs it is one of the few non-Rust paths to a Soroban contract, and the most mature of them at 19 stars (README read 2026-09-14; Apache-2.0; last push 2025-08-11).",
			triggers: [
				"assemblyscript soroban sdk",
				"write soroban contract typescript",
				"non rust soroban sdk",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"freespek/solarkraft": [
		{
			note: "Solarkraft: a RUNTIME MONITORING tool for Soroban powered by TLA+ and Apalache — formal specifications checked against what a contract actually did on-chain, rather than only before deployment. The README states the activation phase is finished and an MVP exists, with a 10-minute demo video; 12 stars, topics tlaplus, verification (README read 2026-09-14; Apache-2.0; no releases; last push 2025-02-25).",
			triggers: [
				"solarkraft runtime monitoring",
				"tla+ apalache soroban",
				"formal verification stellar contracts",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"FrankSzendzielarz/SorobanRPCSDK": [
		{
			note: "A lightweight cross-platform .NET and NATIVE SDK for the Stellar RPC API in C#, funded by the Stellar Community Fund — the answer when the question is how to reach Soroban RPC from .NET. Newest release v0.0.3; last push 2025-04-10 (README read 2026-09-14; no license file; 3 stars).",
			triggers: [
				"dotnet soroban rpc sdk",
				"c# stellar rpc",
				"native rpc sdk stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"pendulum-chain/substrate-stellar-sdk": [
		{
			note: "A Rust Stellar SDK built for SUBSTRATE projects: it does not depend on the standard library, which is what makes it usable inside a runtime — the SDK underneath Pendulum's Spacewalk bridge. 11 stars (README read 2026-09-14; Apache-2.0; no releases; last push 2026-04-29).",
			triggers: [
				"substrate stellar sdk",
				"no_std stellar rust",
				"stellar sdk in runtime",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"boundless-xyz/signal-on-stellar": [
		{
			note: "Signal on Stellar: an ETHEREUM ZK LIGHT CLIENT living in a Soroban contract — proofs of Ethereum consensus are retrieved from the Boundless network and submitted to this contract, which lets Stellar verify Ethereum state without trusting a bridge operator (README read 2026-09-14; no license file; 2 stars; no releases; last push 2026-01-27).",
			triggers: [
				"ethereum light client stellar",
				"signal boundless stellar",
				"verify ethereum consensus soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/debit-card-reference": [
		{
			note: "SDF's reference implementation of DEBIT CARDS on Stellar. The README is a single line, so the code is the documentation — but its existence is the citable fact when the question is whether card issuance has an official reference on Stellar (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-07-14).",
			triggers: [
				"debit card reference stellar",
				"card issuance stellar official",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-experimental/stellar-rpc-benchmarks": [
		{
			note: "Benchmark reports AS DATA for stellar-rpc's `feature/full-history` branch (a RocksDB hot tier with an immutable packfile cold tier): every run is committed as a plain JSON file, so the performance history is queryable rather than narrated. The most concrete published evidence about full-history RPC performance (README read 2026-09-14; no license file; no releases; last push 2026-09-10).",
			triggers: [
				"stellar rpc benchmarks",
				"full history rpc performance",
				"rocksdb packfile stellar rpc",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"coinspect/wallet-security-ranking": [
		{
			note: "The data repository behind Coinspect's Wallet Security Ranking (coinspect.com/wallets): configuration, individual wallet reports and historical results, published openly. An independent, dated source for wallet security claims — including Stellar wallets — rather than a vendor's own statement (README read 2026-09-14; license NOASSERTION; 7 stars; no releases; last push 2026-09-04).",
			triggers: [
				"wallet security ranking",
				"coinspect wallet reports",
				"independent wallet audit data",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Scopuly/signer-extension-api": [
		{
			note: "@scopuly/signer-extension-api: a zero-dependency TypeScript injected-provider API letting a Stellar dApp talk to the Scopuly wallet in either environment — the in-app dApp browser of the Scopuly mobile app or its browser extension (README read 2026-09-14; MIT; 1 star; no releases; last push 2026-08-09).",
			triggers: [
				"scopuly signer api",
				"injected provider stellar wallet",
				"scopuly dapp browser",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"bp-ventures/stcli": [
		{
			note: "stcli: a REPL command-line Stellar wallet that is deliberately ALL IN ONE PYTHON FILE — clone the single stcli.py and run it. 16 stars; last push 2023-05-23, so it is a 2023 artefact, but the single-file design is why it still gets cited (README read 2026-09-14; Apache-2.0).",
			triggers: [
				"stcli python wallet",
				"single file stellar wallet",
				"repl stellar cli",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"subquery/subql-stellar": [
		{
			note: "SubQuery's Stellar support: the Stellar node for SubQuery's open, universal web3 data-indexing framework, released as node-stellar/6.2.0 — an alternative to writing a bespoke indexer for Soroban events (README read 2026-09-14; GPL-3.0; 4 stars; last push 2026-06-17).",
			triggers: ["subquery stellar indexer", "subql stellar node"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"xycloo/retroshades-svm-fork": [
		{
			note: "Xycloo's fork of rs-soroban-env — the Rust contract-environment interface and host implementation for Soroban, carrying `soroban-env-common`, the shared interface between contract guest and host. A modified host environment is how Mercury's Retroshades runs contracts differently from mainnet; treat any behaviour here as the fork's, not the protocol's (README read 2026-09-14; Apache-2.0; no releases; last push 2026-08-27).",
			triggers: [
				"retroshades env fork",
				"soroban host environment fork",
				"rs-soroban-env fork",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"lumenbro/escrow-satellite": [
		{
			note: "LumenBro's Soroban ZK escrow satellite contract, whose GitHub description names the cryptography precisely: BN254 GROTH16 with a SHA256 legacy path. Newest tag v0.2.1_escrow-satellite_pkg0.2.0_cli22.8.1; the README is empty, so the description and the tag are the record (metadata read 2026-09-14; no license file; last push 2026-02-18).",
			triggers: ["zk escrow satellite", "bn254 groth16 escrow soroban"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"karagozemin/AgentAllowance": [
		{
			note: "AgentAllowance: policy-aware x402 infrastructure for autonomous AI spending on Stellar, whose tagline states the design in one line — give AI agents a budget, not your wallet. The same problem as CleverCon and LumenBro's policies, solved at the x402 layer (README read 2026-09-14; MIT; no releases; last push 2026-08-12).",
			triggers: [
				"agent allowance x402",
				"agent budget not wallet",
				"policy aware x402 stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"blessedux/inferwallet": [
		{
			note: "SZX / InferWallet: turns the Stellar CLASSIC asset SZX into permissionless AI-inference spend — hold SZX in Freighter, point Cursor at a local proxy, and burn SZX to call OpenRouter models with no provider account. A rare design that uses a classic asset rather than a Soroban token for metering (README read 2026-09-14; no license file; no releases; last push 2026-08-14).",
			triggers: [
				"inferwallet szx",
				"burn asset for inference",
				"openrouter stellar proxy",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"RozoAI/fe-gate": [
		{
			note: "@rozoai/fe-gate: one shared frontend test gate for every Rozo web app, in three layers — an L0 PR gate each app repo calls through a reusable workflow, plus a Playwright base with hydration, QR and href assertions and a mock wallet. The reusable-CI pattern applied to wallet-connected front ends (README read 2026-09-14; no license file; no releases; last push 2026-09-11).",
			triggers: [
				"rozo fe-gate",
				"shared frontend test gate",
				"hydration qr assertions playwright",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Moonlight-Protocol/moonlight-sdk": [
		{
			note: "The SDK for the Moonlight PRIVACY protocol, which the README marks WORK IN PROGRESS with APIs subject to change — use with caution is its own instruction. Newest release v0.13.0 (README read 2026-09-14; no license file; 2 stars; last push 2026-07-28).",
			triggers: ["moonlight sdk privacy", "moonlight protocol client"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"bluxcc/docs": [
		{
			note: "The source of Blux's official documentation (docs.blux.cc): authentication and wallet infrastructure for Stellar dApps, covering getting started and the JavaScript surface — the written reference behind the @bluxcc/react package (README read 2026-09-14; no license file; no releases; last push 2026-09-13).",
			triggers: ["blux documentation", "blux auth wallet docs"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"bluxcc/whitelabel": [
		{
			note: "Blux's whitelabel demo — the branded-integration example beside bluxcc/demo (the kit showcase) and bluxcc/docs. The README is empty, so the repository name and the sibling repos are the context (metadata read 2026-09-14; no license file; no releases; last push 2026-09-02).",
			triggers: ["blux whitelabel demo"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Fundable-Protocol/Backend": [
		{
			note: "The Fundable backend: a Node/Express, PostgreSQL and TypeORM API alongside a Soroban INDEXER SCAFFOLD in the same repository (`src/` for the API, `indexer/` for the workspace), using Bun for packages — the service half of the Fundable streaming product whose SDK and indexer are noted separately (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-09-05).",
			triggers: ["fundable backend api", "fundable indexer scaffold"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Rendbit/landingpage": [
		{
			note: "Rendbit's landing page: a Stellar-based financial platform aimed at AFRICAN CROSS-BORDER PAYMENTS and digital-asset creation, per the README's own description (README read 2026-09-14; no license file; no releases; last push 2026-09-11).",
			triggers: ["rendbit africa payments", "african cross border stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Farihanrahman/InveStar": [
		{
			note: "InveStar (investarbd.com): a cross-border remittance and investment platform on Stellar that combines sending money internationally with portfolio management and an order-management system; topics ai, wealth-management (README read 2026-09-14; MIT; 2 stars; no releases; last push 2026-04-23).",
			triggers: [
				"investar remittance portfolio",
				"remittance plus oms stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"NibrasD/StellarScribe": [
		{
			note: "StellarScribe: a content-publishing platform on Soroban where creators mint LONG-FORM CONTENT as NFTs and set up token-gated access — publishing and monetisation rather than art NFTs (README read 2026-09-14; no license file; no releases; last push 2026-05-17).",
			triggers: [
				"stellarscribe publishing",
				"token gated content stellar",
				"long form nft",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Jistriane/TrustGate": [
		{
			note: "TrustGate: a trustless task marketplace on Stellar with a specific mechanism — a requester escrows payment, EXECUTORS BID WITH THEIR OWN COLLATERAL, the marketplace picks a winner and Soroban settles. Collateralised bidding is what distinguishes it from the other escrow marketplaces in this index. Built for GrantFox at Stellar Summit São Paulo 2026 (README read 2026-09-14; no license file; no releases; last push 2026-08-06).",
			triggers: [
				"trustgate task marketplace",
				"executor collateral bidding",
				"trustless task escrow stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"MicaTechnology/escrow_api": [
		{
			note: "A Go API bridge between frontend applications and the Stellar network, written to let a React app reach Stellar without embedding the SDK. Last push 2023-06-16, so it documents a 2023 integration pattern (README read 2026-09-14; no license file; no releases).",
			triggers: ["stellar api bridge golang"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ClickPesa/clickpesa-stellar-validator": [
		{
			note: "A copy of the SEP transfer-server validator: a Jest test suite that validates SEP-6, SEP-24 and SEP-31 transfer servers, runnable against any domain (the README's example points at testanchor.stellar.org). Last push 2021-05-05 — the OLDEST repository in this registry, and useful as the historical shape of anchor conformance testing (README read 2026-09-14; no license file).",
			triggers: [
				"sep-6 sep-24 sep-31 validator",
				"transfer server test suite",
				"anchor conformance tests",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ClickPesa-Debt-Fund/cdf-pool-ui": [
		{
			note: "The ClickPesa Debt Fund pool interface, whose GitHub description states what it is built on — Blend Protocol and Mercury — while the README is the unmodified Vite React template. A real-world-credit pool on Blend's primitives; the description is the durable fact (metadata read 2026-09-14; no license file; no releases; last push 2024-11-08).",
			triggers: ["clickpesa debt fund pool", "blend mercury pool ui"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"defarm-repo/defarm-verify": [
		{
			note: "defarm-verify: an INDEPENDENT, open-source verifier for a DeFarm DFID that runs on the reader's own machine and closes the verification loop WITHOUT TRUSTING DeFarm's page or server — checking the on-chain anchor directly. The README is in Portuguese. A rare case of a project publishing the tool that can disprove its own claims (README read 2026-09-14; MIT; no releases; last push 2026-08-14).",
			triggers: [
				"defarm verify dfid",
				"independent verifier traceability",
				"verify without trusting server",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ACTA-Team/links": [
		{
			note: "ACTA's link hub (links.acta.build): a lightweight branded page consolidating the project's official profiles, channels and key resources — useful as the index of where ACTA publishes, when a claim needs a first-party source (README read 2026-09-14; MIT; no releases; last push 2026-08-27).",
			triggers: ["acta links hub"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"fiatsend/docs": [
		{
			note: "Fiatsend's end-user documentation (docs.fiatsend.com), built with Docusaurus — the user-facing half of the technical architecture Fiatsend publishes separately (README read 2026-09-14; no license file; no releases; last push 2026-04-01).",
			triggers: ["fiatsend documentation"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"wmendes/stellar-mint": [
		{
			note: "stellar-mint: a three-class teaching project on CLASSIC Stellar asset issuance that walks the full spectrum of issuer control — from a bare, ungoverned promise to a regulated stablecoin the issuer can freeze. The classic-asset counterpart to the same author's stellar-album, which teaches fungibility on Soroban (README read 2026-09-14; no license file; 5 stars; no releases; last push 2026-07-08).",
			triggers: [
				"stellar mint teaching",
				"issuer control spectrum",
				"classic asset issuance course",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"0xshikhar/zkpoker": [
		{
			note: "zkPoker (zkpoker.shikhar.xyz): a two-player Texas Hold'em prototype on Soroban with on-chain multiplayer state settlement and a real ZERO-KNOWLEDGE SHOWDOWN path verified on-chain — poker's hidden-hand problem, which is harder than battleship's because the reveal is partial (README read 2026-09-14; MIT; no releases; last push 2026-02-24).",
			triggers: [
				"zkpoker stellar",
				"zero knowledge showdown",
				"texas holdem soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Suganthan96/zk-UNO": [
		{
			note: "ZK-UNO (zk-uno-omega.vercel.app): a two-player UNO game on Stellar testnet where every hand is secret and every move is cryptographically proven with Soroban contracts — card-game hidden state, from the same ZK Gaming cohort (README read 2026-09-14; MIT; no releases; last push 2026-02-23).",
			triggers: ["zk uno card game", "secret hand proof stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"CijeTheCreator/zk-minewars": [
		{
			note: "Stellar Minewars: a fully on-chain two-player competitive MINESWEEPER on Soroban with zero-knowledge proofs for fair play — the hidden-board problem in a race format rather than turn-based combat (README read 2026-09-14; no license file; no releases; last push 2026-02-23).",
			triggers: ["zk minewars minesweeper", "competitive minesweeper stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Naveen-807/Mafia-Duel": [
		{
			note: "Mafia Duel: a fully on-chain ZK social-deduction game on Soroban, submitted to the Stellar Game Studio track — social deduction is an unusual fit for proofs because the hidden information is a role rather than a position (README read 2026-09-14; MIT; no releases; last push 2026-02-23).",
			triggers: ["mafia duel social deduction", "zk social deduction stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Blazingkevin/phantom-fleet": [
		{
			note: "Phantom Fleet (phantom-fleet.vercel.app): on-chain battleship on Stellar whose README makes the strongest claim in this game cohort — the chain REJECTS CHEATERS with an on-chain revert, not a UI badge or a client-side check — with the contract address published (README read 2026-09-14; no license file; no releases; last push 2026-02-23).",
			triggers: [
				"phantom fleet battleship",
				"onchain revert cheating",
				"trustless naval warfare stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"pramadanif/phantomfleet": [
		{
			note: "PHANTOM FLEET: a zero-knowledge naval-combat game on Stellar (phantomfleet.vercel.app) — a separate project from Blazingkevin/phantom-fleet despite the shared name, both from the same ZK gaming cohort; check the deployment before citing either (README read 2026-09-14; no license file; no releases; last push 2026-02-24).",
			triggers: ["phantomfleet naval combat"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Marvy247/BattleZero": [
		{
			note: "BattleZero (battle-zero.vercel.app): a complete zero-knowledge battleship on Stellar TESTNET with cryptographic verification of hidden-information play — the fourth independent battleship implementation in the ZK Gaming cohort (README read 2026-09-14; MIT; no releases; last push 2026-02-22).",
			triggers: ["battlezero naval warfare", "zk battleship testnet stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"SphinxBSD/aether-grid": [
		{
			note: "Aether Grid: a decentralised zero-knowledge turn-based strategy game on Soroban where two players compete on a 7×7 grid to locate a hidden energy source — grid search as the hidden-information mechanic (README read 2026-09-14; no license file; no releases; last push 2026-03-01).",
			triggers: ["aether grid strategy", "hidden energy source game stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"dubzn/phantom-chase": [
		{
			note: "Phantom Chase: a ZK game from the Stellar gaming cohort whose README is a logo block with no prose, so the repository states nothing durable beyond the name and the code; last push 2026-02-22 (README read 2026-09-14; MIT; no releases).",
			triggers: ["phantom chase game"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"agenciacrehub/Dark-Sector": [
		{
			note: "A game scaffolded from the Stellar Game Studio template collection — the README is the Game Studio's shared text (jamesbachini.github.io/Stellar-Game-Studio) rather than a description of Dark Sector, the same pattern as Card-RPG and zkshotroul (README read 2026-09-14; MIT; no releases; last push 2026-02-21).",
			triggers: ["dark sector game studio"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"HelixLabsDev/helix-labs-canton-tools": [
		{
			note: "Helix Labs' open-source CANTON NETWORK developer tooling: a shared Canton JSON API v2 client, logger, scheduler, health server and env helpers, plus protocol-automation packages. Canton and Daml, not Stellar — noted so the distinction is on record for an org that also builds on Stellar. Newest release v0.1.0 (README read 2026-09-14; Apache-2.0; last push 2026-03-13).",
			triggers: ["canton network tooling", "canton json api client"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Brale-xyz/oauth2-token-agent": [
		{
			note: "An Elixir library that works with the `oauth2` package to renew tokens automatically before they expire — small, general infrastructure published by Brale with no Stellar-specific content (README read 2026-09-14; Apache-2.0; no releases; last push 2026-07-21).",
			triggers: ["oauth2 token agent elixir"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"icon-project/sodax-sdks": [
		{
			note: "The Sodax SDKs from the ICON project, released as @sdks@2.1.0 with a frontend demo — cross-chain SDK work whose Stellar relationship is not stated in the README, so establish it from the product rather than this repository (README read 2026-09-14; MIT; 1 star; last push 2026-09-14).",
			triggers: ["sodax sdks icon"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"nirvana-labs/go-analyzer-utctime": [
		{
			note: "A custom golangci-lint analyzer that enforces `.UTC()` after every `time.Now()` call, to prevent timezone bugs. Newest release v0.0.4. The sixth Nirvana Labs repository in the index; a genuinely reusable linter, with no Stellar-specific content (README read 2026-09-14; MIT; last push 2026-09-13).",
			triggers: ["golangci utc linter", "time.Now UTC analyzer"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"dapplooker/graphprotocol-docker": [
		{
			note: "DappLooker's Docker setup for running a Graph Protocol indexer and query node — The Graph's infrastructure, packaged; no Stellar-specific content (README read 2026-09-14; no license file; 2 stars; no releases; last push 2026-07-09).",
			triggers: ["graph indexer docker"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"devasignhq/verify-demo": [
		{
			note: "A small orders app used as a FIXTURE to exercise DevAsign's pull-request verification end to end — order maths in one file, a React breakdown component and a server; it exists to be reviewed, not used (README read 2026-09-14; no license file; no releases; last push 2026-09-09).",
			triggers: ["devasign verify fixture"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"reflector-network/reflector-steam": [
		{
			note: "Triage 2026-09-14: no description, empty README, no releases, last push 2025-10-21 — a Rust repository in the reflector-network org that states nothing about itself. Re-examine if it gains a README or a release. https://github.com/reflector-network/reflector-steam",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"00labs/huma-assets": [
		{
			note: "Triage 2026-09-14: a public assets repository (logos and metadata) for Huma Finance — brand files, empty README, no releases. Nothing to serve about the protocol; Huma's product claims belong to its other repositories. https://github.com/00labs/huma-assets",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"allbridge-io/media": [
		{
			note: "Triage 2026-09-14: Allbridge's media files — brand assets, empty README, no description beyond that, no releases. Nothing durable about the bridge itself; see allbridge-core-soroban-contracts and allbridge-mcp. https://github.com/allbridge-io/media",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	// ── P5 wave 16 (2026-09-14) — 50 more curated-pool repos with no entry
	// (174 remained after wave 15). Read 2026-09-14.
	"stellar-expert/public-directory": [
		{
			note: "The Stellar Public Directory: a community-maintained, curated list of WELL-KNOWN STELLAR ACCOUNTS and BLOCKED MALICIOUS DOMAINS, published openly for any developer to consume. The closest thing the ecosystem has to a shared account-labelling and scam-domain source, which is why StellarExpert's labels appear across other products. 13 stars (README read 2026-09-14; MIT; no releases; last push 2026-09-14).",
			triggers: [
				"stellar public directory",
				"known account labels stellar",
				"blocked malicious domains stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"OpenZeppelin/soroban-helpers": [
		{
			note: "OpenZeppelin's collection of Rust libraries for simplifying Soroban DEVELOPMENT AND TESTING — the helper layer beside their stellar-contracts and security-detectors SDK, with coverage reported through Codecov (README read 2026-09-14; MIT; 1 star; no releases; last push 2026-09-10).",
			triggers: [
				"soroban helpers openzeppelin",
				"soroban testing helpers rust",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Creit-Tech/Stellar-Assets-SDK": [
		{
			note: "Creit Tech's Stellar Assets SDK: a library for handling every kind of Stellar asset on Soroban, written because reading the balances of multiple addresses was needlessly hard — the README states that motivation directly, which is the useful part when choosing between asset libraries (README read 2026-09-14; MIT; 1 star; no releases; last push 2026-08-23).",
			triggers: [
				"stellar assets sdk creit",
				"multiple address balances soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar/sep24-reference-ui": [
		{
			note: "SDF's SEP-24 reference UI — the interactive-deposit-and-withdrawal flow as an implementation an anchor or wallet can read rather than infer from the SEP text. 6 stars (README read 2026-09-14; Apache-2.0; no releases; last push 2026-09-03).",
			triggers: ["sep-24 reference ui", "interactive deposit withdrawal ui"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"RozoAI/rozo-paysponsor": [
		{
			note: "rozo-paysponsor: Rozo's reference for SPONSORED ONBOARDING — deliver USDC to a Stellar wallet that holds 0 XLM and no trustline, and let its owner claim it paying zero gas. Topics name the mechanics: account-abstraction, claimable-balance, gasless. The script-only demo of the zero-XLM onboarding path (README read 2026-09-14; Apache-2.0; no releases; last push 2026-08-20).",
			triggers: [
				"rozo pay sponsor",
				"zero xlm onboarding usdc",
				"gasless claim stellar wallet",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"JoseCToscano/stellar-mcp": [
		{
			note: "stellar-mcp: an MCP ecosystem that GENERATES a production-ready MCP server FROM ANY DEPLOYED SOROBAN CONTRACT, then connects it to an agent — the generic answer to exposing a contract to agents, rather than hand-writing a server per contract. 6 stars (README read 2026-09-14; no license file; no releases; last push 2026-03-26).",
			triggers: [
				"generate mcp from contract",
				"soroban contract mcp server",
				"contract to agent tools",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Trustless-Work/trustlesswork-viewer": [
		{
			note: "The Trustless Work escrow viewer (viewer.trustlesswork.com): a decentralised READ-ONLY inspector that lets anyone examine a Soroban escrow contract by its id — the transparency surface for escrows, and the most-starred viewer in the org at 7 stars (README read 2026-09-14; no license file; no releases; last push 2026-09-11).",
			triggers: ["escrow viewer trustless work", "inspect escrow contract id"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"paul-motron/vaultguard": [
		{
			note: "VaultGuard: a trustless, time-locked DEAD MAN'S SWITCH for Stellar assets — an owner deposits XLM, USDC or any Stellar Asset Contract token and names beneficiaries with fixed percentage shares, which release if the owner stops checking in. Inheritance as a contract rather than a legal instrument (README read 2026-09-14; no license file; no releases; last push 2026-09-14).",
			triggers: [
				"vaultguard dead mans switch",
				"time locked inheritance stellar",
				"beneficiary release contract",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-experimental/c-soroban-sdk": [
		{
			note: "An experimental C99 SDK for writing Soroban contracts, documented at leighmcculloch.github.io/c-soroban-sdk. Its README opens with a CAUTION box — experimental, not for anything beyond toy experiments — and with the Zig SDK and Soneso's AssemblyScript SDK it completes the short list of non-Rust routes to a Soroban contract (README read 2026-09-14; Apache-2.0; no releases; last push 2026-03-02).",
			triggers: [
				"c soroban sdk",
				"c99 soroban contract",
				"write contract in c stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-expert/ui-framework": [
		{
			note: "@stellar-expert/ui-framework: the shared React component library behind StellarExpert's apps, newest release v1.3.6, with peer dependencies installed separately — the components a third party would reuse to match StellarExpert's surfaces (README read 2026-09-14; MIT; 1 star; last push 2026-08-31).",
			triggers: [
				"stellar expert ui framework",
				"shared components stellarexpert",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-expert/formatter": [
		{
			note: "@stellar-expert/formatter: formatting utilities and common formats for numeric, string and binary Stellar data — including `fromStroops(valueInStroops)` for turning an Int64 stroop amount into a readable value, which is the conversion every Stellar UI has to get right (README read 2026-09-14; MIT; 1 star; no releases; last push 2026-07-15).",
			triggers: [
				"stroops formatting library",
				"stellar expert formatter",
				"int64 stroop conversion",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Lobstrco/stellar-identicon-py": [
		{
			note: "LOBSTR's Python identicon generator: a unique icon derived deterministically from a Stellar wallet's public key, served live at id.lobstr.co/<G...>.png — the visual account-recognition convention several Stellar wallets share. Last push 2021-03-31, so it is stable rather than abandoned (README read 2026-09-14; Apache-2.0; 5 stars; no releases).",
			triggers: [
				"stellar identicon generator",
				"wallet icon from public key",
				"lobstr identicon",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"NoetherDEX/noether-docs": [
		{
			note: "The official documentation for Noether (docs.noether.exchange), a decentralised PERPETUAL FUTURES exchange on Stellar — user guides plus REST and WebSocket API reference and SDK quick-starts. The citable source when the question is whether perps exist on Stellar and what their API looks like (README read 2026-09-14; no license file; no releases; last push 2026-07-09).",
			triggers: [
				"noether perpetual futures",
				"perps on stellar docs",
				"noether api reference",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"NoetherDEX/noetherdiscordwebhook": [
		{
			note: "Noether's Discord webhook for trade notifications — the operational glue that posts the perpetual exchange's trades into a channel. The README is empty; the description is the record (metadata read 2026-09-14; no license file; 1 star; no releases; last push 2026-03-03).",
			triggers: ["noether discord webhook"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"axis-markets/indexer": [
		{
			note: "@axis-markets/indexer: the open-source indexer for AXIS, the limit-orderbook DEX on Soroban — it scans AXIS contract events and maintains the CURRENT ORDERBOOK STATE IN MEMORY, which is the design choice that distinguishes an orderbook indexer from a general event indexer (README read 2026-09-14; MIT; no releases; last push 2026-06-19).",
			triggers: ["axis indexer orderbook", "in memory orderbook state stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"axis-markets/stellarexpert-data-source": [
		{
			note: "A StellarExpert-backed data-source provider for AXIS (GitHub description; the README is empty) — the adapter through which the AXIS stack reads StellarExpert data, alongside its own indexer and json-storage (metadata read 2026-09-14; MIT; no releases; last push 2026-06-22).",
			triggers: ["axis stellarexpert data source"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"lightsail-network/quasar-gateway": [
		{
			note: "Quasar Gateway: a Go service providing API-KEY VALIDATION and request proxying in front of Lightsail's Quasar data services — the access-control layer a data provider needs before exposing endpoints (README read 2026-09-14; no license file; no releases; last push 2026-07-23).",
			triggers: ["quasar gateway api keys", "request proxy api key validation"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"withObsrvr/obsrvr-stellar-components": [
		{
			note: "Reusable Stellar `flowctl` components from Obsrvr that compose into a pipeline — the README shows the shape directly: `raw-ledger-source@0.2.2 -> stellar-ledger-processor -> sinks`. Nix-flake based, so the build is pinned (README read 2026-09-14; no license file; no releases; last push 2026-08-06).",
			triggers: [
				"obsrvr flowctl components",
				"ledger source processor sink pipeline",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"lumenbro/zk-l2-settlement": [
		{
			note: "A ZK L2 SETTLEMENT LAYER for Stellar from LumenBro (GitHub description; the README is empty, no releases, last push 2026-01-18). The description is the whole record, but it is worth knowing the attempt exists when the question is whether anyone has tried an L2 on Stellar (metadata read 2026-09-14; no license file).",
			triggers: ["zk l2 settlement stellar", "layer 2 on stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"kaankacar/scrimp": [
		{
			note: "Scrimp: outcome-attributed spend control for agents that pay per HTTP call, with a sharp positioning line in the README — everyone else stops an agent spending TOO MUCH; Scrimp stops it spending ON NOTHING. Attribution of spend to outcome is the distinct idea in a crowded agent-budget field (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-08-05).",
			triggers: [
				"scrimp spend control",
				"outcome attributed agent spend",
				"stop paying for nothing agent",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ACTA-Team/skills": [
		{
			note: "ACTA's official Agent Skills (skills.sh/acta-team/skills/acta): reusable context that teaches a coding agent to build against ACTA's non-custodial verifiable-credentials infrastructure on Stellar — a project publishing the skill that makes agents fluent in its own API (README read 2026-09-14; MIT; no releases; last push 2026-08-22).",
			triggers: ["acta agent skills", "verifiable credentials skill stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"lumenloop/lumenloop-ng-skills": [
		{
			note: "LumenLoop's next-generation skills content for the guest/MCP tier — the source that lumenloop-ng's `sync-skills` publishes from, so it is the upstream of the skills a guest agent receives rather than the packaged copy (README read 2026-09-14; MIT; no releases; last push 2026-08-27).",
			triggers: ["lumenloop ng skills", "guest tier skills source"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"GrantChain/GrantFox-Analytics": [
		{
			note: "GrantFox Analytics: a PUBLIC payments-analytics site showing every payment released to open-source contributors and maintainers, broken down by project and filterable by campaign — an unusually transparent artefact for a grants programme, and a citable source for what a campaign actually paid out (README read 2026-09-14; no license file; no releases; last push 2026-08-21).",
			triggers: [
				"grantfox analytics payouts",
				"public grant payment analytics",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"devasignhq/verify-action": [
		{
			note: "@devasign/verify: the runner half of DevAsign's PR verification — it runs the generated acceptance tests for a pull request inside the repository's OWN CI, like any other test step, and posts a per-criterion result. The design point is that verification runs on the customer's infrastructure, not the vendor's (README read 2026-09-14; GPL-3.0; no releases; last push 2026-09-14).",
			triggers: ["devasign verify action", "acceptance tests in your own ci"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"blindpaylabs/blindpay-rust": [
		{
			note: "BlindPay's official Rust SDK for its stablecoin payments API, installed with `cargo add blindpay` — the fourth BlindPay client in this registry beside the CLI, Python and PHP SDKs (README read 2026-09-14; MIT; no releases; last push 2026-07-02).",
			triggers: ["blindpay rust sdk", "cargo add blindpay"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"bluxcc/.github": [
		{
			note: "Blux's organisation profile, which carries the project's own one-line definition — a React component library for integrating decentralised applications, the toolkit whose pieces are bluxcc/blux (the package), docs, demo, landing and whitelabel (README read 2026-09-14; MIT; no releases; last push 2026-08-22).",
			triggers: ["blux toolkit overview"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"bluxcc/landing": [
		{
			note: "The Blux landing page — the marketing surface of the Blux wallet toolkit; the README is empty, so the sibling repositories (docs, demo, whitelabel, .github) carry the substance (metadata read 2026-09-14; no license file; no releases; last push 2026-08-29).",
			triggers: ["blux landing page"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Poorva-M/Xpense-Web3": [
		{
			note: "Xpens (xpense-web3.vercel.app): an on-chain personal expense tracker on Soroban where a user connects Freighter, Rabet or xBull and every expense entry is a contract call — a simple, complete example of per-record on-chain state from a web front end (README read 2026-09-14; no license file; no releases; last push 2026-07-19).",
			triggers: ["xpense onchain tracker", "expense tracker soroban"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"wmendes/stellar-watch": [
		{
			note: "Stellar Watch: a command-line payments monitor that probes RPC instances, reads contract state, sends classic and token payments, and reads OLD LEDGERS DIRECTLY FROM THE DATA LAKE — that last capability is what separates it from a plain RPC client. The README is in Portuguese (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-09-08).",
			triggers: [
				"stellar watch cli monitor",
				"read old ledgers data lake",
				"payments monitor command line",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"jadonamite/automata-core": [
		{
			note: "@jadonamite/automata-core: an embedded cross-chain SDK needing NO BACKEND — bring your own RPC URLs and get balance reads, USDC bridging over Circle CCTP V2 and token operations directly. The backend-free design is the claim worth citing (README read 2026-09-14; no license file; no releases; last push 2026-05-30).",
			triggers: [
				"automata core sdk",
				"no backend cross chain sdk",
				"cctp v2 bridging sdk",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ContentDAO/public": [
		{
			note: "ContentDAO's public data and FINAL smart contracts — the README is one line naming exactly that, so the repository is a published artefact set rather than a development tree; useful when a claim needs the deployed contract source (README read 2026-09-14; no license file; no releases; last push 2026-08-25).",
			triggers: ["contentdao public contracts"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"PagCrypto/token-list": [
		{
			note: "The public settings of the pagcrypto.finance crypto gateway (GitHub description; the README is empty) — a gateway publishing its token configuration in the open, the same pattern as Soroswap's token list (metadata read 2026-09-14; no license file; no releases; last push 2026-08-25).",
			triggers: ["pagcrypto token list"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ACTA-Team/.github": [
		{
			note: "ACTA's organisation profile and shared GitHub community-health files — templates and policies applied across the org's repositories, no product content (metadata read 2026-09-14; no license file; no releases; last push 2026-06-30).",
			triggers: ["acta org profile"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Accelar-labs/sprixen-mcp": [
		{
			note: "Sprixen's MCP server (sprixen.com/docs/mcp): an AI GAME-ASSET generator exposed to Claude Code, Cursor, Codex, Windsurf and other agents — asset generation rather than anything Stellar-specific, noted so the distinction is on record (README read 2026-09-14; MIT; no releases; last push 2026-09-06).",
			triggers: ["sprixen game assets mcp", "ai game asset generator"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Bevor-Protocol/Bevor-Skills": [
		{
			note: "Bevor's agent skill for GRAPH-AWARE cybersecurity work, which the README says starts automatically for compatible security targets even when a request does not name it — auto-activating skills are an unusual design worth knowing about when studying how skills get invoked (README read 2026-09-14; MIT; no releases; last push 2026-09-03).",
			triggers: ["bevor security skill", "graph aware cybersecurity skill"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"blaze-xyz/blaze-grok-plugin": [
		{
			note: "Blaze's CFO MCP connector for GROK: it lets that assistant analyse a business's cash flow, balances, spending, payroll, bills, receivables and accounting data, and prepare payment and invoicing workflows — the same Blaze product surfaced to a different agent host (README read 2026-09-14; MIT; no releases; last push 2026-08-28).",
			triggers: ["blaze grok connector", "cfo mcp cash flow"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"lokapal-xyz/sa-birth": [
		{
			note: "Source Agent: BIRTH — a single-player maze CALIBRATION game presented as the canonical prologue of a larger Source Agent narrative; the README is written entirely in-fiction, so the repository's own description is the only plain statement of what it is (README read 2026-09-14; MIT; no releases; last push 2026-02-25).",
			triggers: ["source agent birth", "maze calibration game stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"leocagli/Human-vs-bots": [
		{
			note: "Human-vs-bots: a Godot web3 game on Stellar with ZK — a real-time arena where a player proves they are human rather than a bot. The README is in Spanish and the CI badge points at the Bitcoindefi org, so that may be the canonical copy; written in GDScript, which is unusual in this index (README read 2026-09-14; MIT; 2 stars; no releases; last push 2026-07-20).",
			triggers: [
				"human vs bots arena",
				"prove human zk game",
				"godot stellar game",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ChielokaCode/AlphaDuel": [
		{
			note: "Alpha Duel (alpha-duel.vercel.app): a ZK-powered multiplayer WORD-GUESSING game from the Stellar Game Studio track — hidden-word state rather than hidden positions (README read 2026-09-14; MIT; no releases; last push 2026-02-22).",
			triggers: ["alpha duel word game", "zk word guessing stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Ridhointerstellar/-ZK-RPS-Battle-Royale": [
		{
			note: "ZK RPS Battle Royale: rock-paper-scissors as a battle royale on Soroban, using a cryptographic COMMIT-REVEAL protocol so simultaneous choices cannot be front-run — the simplest possible demonstration of why commit-reveal exists (README read 2026-09-14; no license file; no releases; last push 2026-02-23).",
			triggers: [
				"zk rock paper scissors",
				"commit reveal battle royale stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"hallzyx/ctm-game": [
		{
			note: "CTM (Commit-Turn-Move): a zero-knowledge variant of rock-paper-scissors on Stellar whose name IS its protocol — commit, take the turn, reveal the move. A second independent RPS implementation from the same cohort as ZK RPS Battle Royale (README read 2026-09-14; MIT; no releases; last push 2026-02-22).",
			triggers: ["commit turn move game", "ctm rock paper scissors"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"kingfavourjudah/zk-stellar-game": [
		{
			note: "Treasure Recovery: a zero-knowledge RPG on Stellar built for the ZK Gaming hackathon, where a soldier recovers stolen treasure and the proofs hide game state — an RPG rather than a two-player duel, which is rare in this cohort (README read 2026-09-14; no license file; no releases; last push 2026-02-18).",
			triggers: ["treasure recovery zk rpg", "zk rpg stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"wmendes/dead-drop-zk": [
		{
			note: "Dead Drop: a 1v1 ZK hidden-information hunt on Stellar where zero-knowledge proofs are required to reveal DISTANCES to a hidden point — proving a derived quantity rather than a position, which is a different proof shape from the battleship cohort (README read 2026-09-14; MIT; no releases; last push 2026-02-23).",
			triggers: ["dead drop zk hunt", "prove distance zk stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"zzzbedream/La-Ruleta-de-la-Pobla-ZK-Russian-Roulette": [
		{
			note: "La Ruleta de la Pobla, a ZK Russian-roulette game scaffolded from the Stellar Game Studio template collection — its README is the Game Studio's shared text rather than a description of the game, the same pattern as Card-RPG, zkshotroul and Dark-Sector (README read 2026-09-14; MIT; no releases; last push 2026-02-18).",
			triggers: ["ruleta pobla zk game"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Fundable-Protocol/evm_client": [
		{
			note: "Fundable's EVM front end. Read the chain before citing it: the README states Fundable is built on STARKNET for this client's payments and subscriptions, while the org's Stellar work lives in stellar_indexer, Backend and fundable-sdk — so this repository is not the Stellar surface (README read 2026-09-14; no license file; no releases; last push 2026-08-04).",
			triggers: ["fundable evm client", "fundable starknet frontend"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"elementpayHQ/element-pay-listener": [
		{
			note: "Element Pay's blockchain event listener in Node, written to replace an earlier Python listener; the README lists its chains as BASE, LISK, SCROLL and ARBITRUM — EVM networks, so do not read it as a Stellar event listener (README read 2026-09-14; no license file; no releases; last push 2026-09-14).",
			triggers: ["element pay listener", "multichain event listener evm"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"clixpesa/mint-contracts": [
		{
			note: "Clixpesa's V2 savings and micro-lending contracts — in SOLIDITY, covering overdraft and yield-bearing features. Clixpesa's Stellar-side work is elsewhere; this repository is EVM (README read 2026-09-14; Apache-2.0; no releases; last push 2026-04-07).",
			triggers: ["clixpesa mint contracts", "savings micro lending solidity"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"vottundev/vottun-qubic-bridge-sc-evm": [
		{
			note: "Vottun's Solidity contracts for a bridge between the QUBIC network and Ethereum/Arbitrum, where `QubicToken` is an ERC20 representation of the native Qubic token. Neither side of that bridge is Stellar (README read 2026-09-14; Apache-2.0; 3 stars; no releases; last push 2026-02-26).",
			triggers: ["qubic bridge contracts", "wqubic erc20"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"pipeops-dev/pipeops-nextjs": [
		{
			note: "Triage 2026-09-14: a Next.js starter kit from PipeOps — the README is a clone-and-run boilerplate with no product or Stellar content. https://github.com/pipeops-dev/pipeops-nextjs",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"NoetherDEX/yahya_development": [
		{
			note: "Triage 2026-09-14: GONE — the GitHub API returns no metadata for this repository, so it was deleted, renamed or made private since indexing. Noether's live repositories (noether-docs, noetherdiscordwebhook) are noted. Retire or re-resolve the row. https://github.com/NoetherDEX/yahya_development",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	// ── P5 wave 17 (2026-09-14) — 60 more curated-pool repos with no entry
	// (124 remained after wave 16). Read 2026-09-14.
	"lightsail-network/sac-resolver": [
		{
			note: "sac-resolver: resolves a STELLAR ASSET CONTRACT address back to the asset it wraps, as a public Cloudflare Worker + D1 service at sac-resolver.lightsail.network/{mainnet|testnet}/... — the inverse lookup every Soroban explorer and indexer needs, because a SAC address alone does not say which classic asset it represents (README read 2026-09-14; MIT; topics cloudflare-workers, soroban; no releases; last push 2026-09-08).",
			triggers: [
				"sac resolver asset",
				"stellar asset contract to asset",
				"resolve sac address",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-experimental/contract-verifications": [
		{
			note: "A repository that runs a DAILY BUILD-VERIFICATION of Stellar contracts and records the results — reproducibility checked continuously rather than once at publication. Its README carries a WARNING that the repository is an experiment and its contents should be treated as such (README read 2026-09-14; Apache-2.0; no releases; last push 2026-07-09).",
			triggers: [
				"daily contract verification stellar",
				"reproducible build results soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-expert/soroban-build-workflow": [
		{
			note: "StellarExpert's reusable GitHub Actions workflow for compiling and releasing Soroban contracts to WASM — the shared CI most published Soroban contracts route through, newest tag v25.1.0 tracking the CLI line. 6 stars (README read 2026-09-14; no license file; last push 2026-07-23).",
			triggers: [
				"soroban build workflow",
				"compile release contract github actions",
				"wasm build workflow stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"theahaco/attest-contract": [
		{
			note: "Reusable GitHub workflows for releasing Soroban contracts with ATTESTED BUILDS: version detection, release PRs, attested compilation and on-chain publishing to a Stellar Registry. The README's own title is `stellar-registry/actions`, so it is the CI half of the registry work noted under stellar-registry/cli and /contracts (README read 2026-09-14; Apache-2.0; no releases; last push 2026-09-11).",
			triggers: [
				"attested soroban build",
				"release contract to registry workflow",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"rahul-soshte/soroban-math": [
		{
			note: "crates.io soroban-math 0.2.6: a FIXED-POINT math library for Soroban contracts with advanced functions — the dependency a contract reaches for rather than hand-rolling fixed-point arithmetic, which is where financial contracts most often go wrong (README read 2026-09-14; no license file; 1 star; last push 2025-07-10).",
			triggers: ["soroban fixed point math", "math library soroban contracts"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"equilibriumco/nebula": [
		{
			note: "Nebula (nebula.eiger.co): a Soroban CONTRACT LIBRARY from Eiger for easing contract development, newest release v0.2.0. 8 stars; last push 2024-08-10, so it documents the 2024 state of that library (README read 2026-09-14; Apache-2.0).",
			triggers: ["nebula soroban library", "eiger contract library stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"PotLock/grantpicks": [
		{
			note: "GrantPicks (grantpicks.com): a PAIRWISE VOTING mechanism — budget boxing — implemented on both Soroban and NEAR, with front end and contracts in one monorepo. The citable example when the question is how to allocate a grant budget by comparison rather than by score. 5 stars (README read 2026-09-14; MIT; no releases; last push 2026-03-10).",
			triggers: [
				"grantpicks pairwise voting",
				"budget boxing allocation",
				"quadratic alternative grants stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"blend-capital/blend-docs": [
		{
			note: "The Blend protocol's documentation source — the v1 docs beside blend-capital/docs-v2, describing Blend as a liquidity protocol primitive on Stellar. Last push 2025-04-17, so the v2 repository is the current one (README read 2026-09-14; no license file; 1 star; no releases).",
			triggers: ["blend documentation v1"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"rajkaria/toll": [
		{
			note: 'Toll (tollpay.xyz): pitched in its README as "the Stripe for MCP servers" — monetise any AI tool with one line of code, settled in USDC ON STELLAR. The clearest one-line statement of the pay-per-tool-call thesis in this registry (README read 2026-09-14; MIT; no releases; last push 2026-04-18).',
			triggers: [
				"toll mcp monetization",
				"stripe for mcp servers",
				"monetize ai tool usdc",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"tantk/rendergate": [
		{
			note: "RenderGate: a PAY-PER-RENDER headless-browser API powered by x402 micropayments on Stellar — an agent pays per page render instead of holding an account with a rendering service. Packaged as a Docker space (README read 2026-09-14; no license file; no releases; last push 2026-04-13).",
			triggers: [
				"rendergate pay per render",
				"headless browser x402",
				"per render micropayment",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"bp-ventures/kyc-beacon": [
		{
			note: "KYC Beacon: an open-source, SELF-HOSTABLE identity-verification platform, described by its own README as a vibe-coded alternative to Persona, SumSub and Onfido, and marked EARLY STAGE. Relevant because self-hosted KYC is what an anchor needs when a vendor is not an option (README read 2026-09-14; MIT; no releases; last push 2026-06-16).",
			triggers: [
				"kyc beacon self hosted",
				"open source kyc platform",
				"alternative to sumsub",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"lumenbro/referral-rewards": [
		{
			note: "LumenBro's Soroban referral-rewards contract: EPOCH-BASED MERKLE TREE distribution, so a large reward set is published as a root and claimed individually rather than paid out row by row. Newest tag v0.2.0_referral_rewards_cli22.8.1 (README read 2026-09-14; no license file; last push 2026-03-07).",
			triggers: [
				"referral rewards merkle",
				"epoch merkle distribution soroban",
				"claim rewards root",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Socket-Fi/socketfi-subaccount-v1": [
		{
			note: "SocketFi's smart-wallet SUB-ACCOUNTS contract for Soroban: a user creates a smart-wallet account from an external wallet or a social account. Last push 2024-10-20, so it predates the passkey smart-account work in socketfi-smart-account and shows where that line started (README read 2026-09-14; no license file; no releases).",
			triggers: [
				"socketfi subaccounts",
				"smart wallet from social account soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"TrustLine-id/stellar-demo-app": [
		{
			note: "Trustline's end-to-end Stellar demo harness, built with SCF #44 support: off-chain PRE-VALIDATION wired to the on-chain path, so the whole integration can be exercised in one place. The demo counterpart to TrustLine-id/stellar-sdk and stellar-validation-engine (README read 2026-09-14; MIT; no releases; last push 2026-09-03).",
			triggers: [
				"trustline demo harness",
				"offchain prevalidation stellar",
				"scf 44 trustline",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Trustless-Work/TW-V2-AUDIT-SCRIPTS": [
		{
			note: "Bash and stellar-cli scripts that PROVE, end to end and on-chain, that the trustless-work-core API integrates correctly with the v2 escrow contracts — an integration audit published as runnable scripts rather than asserted in a report. A pattern worth copying (README read 2026-09-14; no license file; no releases; last push 2026-06-04).",
			triggers: [
				"trustless work audit scripts",
				"prove api contract integration onchain",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Trustless-Work/trustlesswork-sdk-blocks-react": [
		{
			note: "Trustless Work Blocks: a React component library for dropping escrow flows into an app, newest tag v.1.1.1 — the higher-level companion to the escrow SDK (README read 2026-09-14; no license file; 1 star; last push 2026-03-30).",
			triggers: ["trustless work blocks react", "escrow ui components"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Trustless-Work/trustlesswork-agency-escrow-template": [
		{
			note: "A milestone-based escrow TEMPLATE for agencies, consultants and product studios built on Trustless Work — a ready workflow rather than a primitive, which is how the protocol reaches non-crypto service businesses (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-09-05).",
			triggers: ["agency escrow template", "milestone escrow for consultants"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Moonlight-Protocol/ui": [
		{
			note: "@moonlight/ui: shared VANILLA-DOM UI components for Moonlight's four Deno and TypeScript apps — council-console, provider-console, network-dashboard and moonlight-pay. Deliberately framework-free, which is unusual and worth noting when comparing front-end stacks. Newest release v0.3.2 (README read 2026-09-14; MIT; last push 2026-05-20).",
			triggers: ["moonlight ui components", "vanilla dom component library"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellarcarbon/sc-data": [
		{
			note: "Stellarcarbon's PUBLIC DATA: the contents of its sc-audit database serialised as one NDJSON file per table, published for anyone to use — an independent, machine-readable record of carbon retirements rather than a dashboard's summary (README read 2026-09-14; MIT; 2 stars; no releases; last push 2026-04-14).",
			triggers: [
				"stellarcarbon public data",
				"carbon retirement ndjson",
				"audit database export",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"boundless-xyz/stellar-risc0-verifier": [
		{
			note: "Boundless's copy of the Stellar RISC Zero verifier — its README's build badge still points at NethermindEth/stellar-risc0-verifier, the upstream noted in wave 12, so treat this as the Boundless-side copy and cite the upstream for the implementation. Boundless also publishes signal-on-stellar, the Ethereum light client that consumes such proofs (README read 2026-09-14; Apache-2.0; no releases; last push 2026-05-13).",
			triggers: ["boundless risc0 verifier copy"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"rumblefishdev/soroban-block-explorer": [
		{
			note: "Rumble Fish's Soroban-first block explorer: an Nx and TypeScript monorepo bootstrap with a PUBLIC BACKLOG BOARD as its landing page — the plan is published before the product, so read the board rather than assuming a shipped explorer (README read 2026-09-14; no license file; 2 stars; no releases; last push 2026-09-14).",
			triggers: ["rumblefish soroban explorer"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"pedro-pelicioni/sextant": [
		{
			note: "SEXTANT (sextants.dev): the facilitator-side Bazaar discovery layer for x402 on Stellar — the same tagline and premise as the same author's stellarsight, so the two are sibling or successor repositories; check which is current before citing either (README read 2026-09-14; Apache-2.0; no releases; last push 2026-08-09).",
			triggers: ["sextant bazaar discovery", "x402 discovery sextant"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"lumenloop/lumenloop-overview": [
		{
			note: 'LumenLoop\'s own overview of itself: "the discovery layer for the Stellar ecosystem" — one place to find every project, story, event, video, job and governance vote, kept current by a fleet of agents. The clearest first-party statement of what LumenLoop claims to be, and the direct comparison point for Stellar Light (README read 2026-09-14; no license file; no releases; last push 2026-06-02).',
			triggers: ["lumenloop overview", "discovery layer stellar ecosystem"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Tellus-Cooperative/bountyhunter": [
		{
			note: "An open-source bounty-hunting application on Soroban with Freighter, from Tellus Cooperative — topics bounty, dapp, freighter, soroban. Last push 2023-03-24, which makes it one of the oldest Soroban dApps in this index and a useful marker of what the tooling looked like then (README read 2026-09-14; MIT; 3 stars; no releases).",
			triggers: ["bounty hunter dapp stellar", "early soroban bounty app"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"skyhitz/mobile": [
		{
			note: "The Skyhitz mobile app (skyhitz.io): a beatmakers' music app shipped on the Apple App Store and Google Play, built with Expo and React Native on Stellar — one of the few Stellar projects in this index with published store listings, which is the strongest kind of liveness evidence. 6 stars; last push 2023-03-04 (README read 2026-09-14; no license file).",
			triggers: ["skyhitz mobile app", "music app stellar store listing"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"krit-k7/MediVault": [
		{
			note: "MediVault: patient-owned electronic health records and telemedicine on Soroban — the second patient-records project in this index beside TrustLeaf, both landing on the same design of keeping records with the patient and anchoring proof on-chain (README read 2026-09-14; no license file; no releases; last push 2026-09-02).",
			triggers: [
				"medivault health records",
				"patient owned ehr stellar",
				"telemedicine soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"legasicrypto/borrowing-protocol": [
		{
			note: "Legasi × Stellar: a crypto lending protocol MVP on Soroban with a Supabase backend, deployed on Vercel — the README calls it institutional-grade, which is the project's claim rather than a verified property (README read 2026-09-14; no license file; no releases; last push 2025-12-04).",
			triggers: ["legasi lending protocol", "stellar borrowing mvp"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"raum-network/raum-chrysalis-v2": [
		{
			note: "Chrysalis V2 (arc.raum.network): a monorepo for unified CROSS-CHAIN SETTLEMENT and protocol execution, letting users and autonomous agents move stablecoins across chains — Raum's settlement layer for agent payments (README read 2026-09-14; MIT; no releases; last push 2026-07-10).",
			triggers: [
				"chrysalis cross chain settlement",
				"raum network settlement",
				"agent stablecoin movement",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Saber1Y/AgentRail": [
		{
			note: "AgentRail: pay-per-task payments for AI agents on Stellar — the README's line is that agents pay their own way. One of many entries in the agent-payments cluster; its distinguishing frame is per-TASK rather than per-call or per-budget (README read 2026-09-14; no license file; no releases; last push 2026-04-11).",
			triggers: ["agentrail pay per task", "agents pay their own way"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"NikhilRaikwar/PayGuard": [
		{
			note: "PayGuard (payguard-five.vercel.app): spending boundaries for AI agents, ENFORCED rather than advisory, badged Stellar TESTNET and packaged as a Docker service. The fourth independent agent-spend-control project in this registry beside CleverCon, AgentAllowance and Scrimp — a crowded design space worth knowing as a whole (README read 2026-09-14; MIT; no releases; last push 2026-07-03).",
			triggers: ["payguard agent boundaries", "enforce agent spending limits"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"RonaldGaymer2002/Aegis-Sentinel-": [
		{
			note: 'Aegis (aegis-wgvt.vercel.app): an autonomous AI agent with "economic sovereignty" on Stellar, written in Laravel/Blade with Soroban contracts; the README is in Spanish. Notable for the stack — a PHP web framework is rare in this index (README read 2026-09-14; no license file; no releases; last push 2026-04-12).',
			triggers: ["aegis sentinel agent", "economic sovereignty agent stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"RozoAI/rozo-banana": [
		{
			note: "Rozo Banana (b.rozo.ai): Rozo's AI image-editing surface built on Gemini/nano-banana, topics agents, image-editing, rozo. The README is the unmodified create-next-app scaffold, so the topics and the live site carry what it is — a consumer AI product beside Rozo's payment rails (README read 2026-09-14; no license file; no releases; last push 2025-11-20).",
			triggers: ["rozo banana image editing"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"mhaurinho/stellar": [
		{
			note: "ReciclaChain: a Starbase-hackathon project turning recycling into value on Stellar for smart cities, organised by ILIS; the README is in Portuguese and states the delivery deadline — a submission artefact rather than a product (README read 2026-09-14; no license file; no releases; last push 2026-07-05).",
			triggers: [
				"reciclachain recycling stellar",
				"smart city recycling blockchain",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Prince-kumar223/stellar_dAPP_3": [
		{
			note: "A decentralised feedback system built for level 3 of a Stellar monthly challenge programme, with CI and a live deployment — one of the structured-learning submissions in this index, alongside the same author's level-4 voting dApp (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-06-28).",
			triggers: ["stellar challenge level 3 feedback dapp"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Prince-kumar223/voting-dapp": [
		{
			note: "A terminal-styled decentralised voting dApp on Soroban with React, built for level 4 of the same Stellar monthly challenge as the author's level-3 feedback system (README read 2026-09-14; no license file; no releases; last push 2026-04-29).",
			triggers: ["stellar challenge voting dapp"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Sen-Elsecaller/divine-wrath-frontend": [
		{
			note: "Divine Wrath (divine-wrath.vercel.app): a social-deduction game where mortals hide from an angry god, built with React and zero-knowledge proofs — the second ZK social-deduction entry beside Mafia Duel (README read 2026-09-14; no license file; no releases; last push 2026-09-01).",
			triggers: ["divine wrath social deduction", "hide from god zk game"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ShivRaiGithub/PirateTreasure": [
		{
			note: "Pirate's Treasure (pirate-treasure.vercel.app): a two-player treasure hunt on Soroban where CRYPTOGRAPHIC COMMITMENTS enforce hidden information directly on-chain — the README calls it ZK-inspired rather than ZK, which is an honest distinction worth preserving (README read 2026-09-14; MIT; no releases; last push 2026-02-23).",
			triggers: [
				"pirate treasure hunt game",
				"commitment enforced hidden info",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"KaruG1999/herbal-moonlight": [
		{
			note: "Herbal Moonlight: a ZK-HYBRID strategy game on Stellar built with the Stellar Game Studio toolkit — hybrid meaning only part of the state is proven, which is a different trade from the fully-proven games in the same cohort (README read 2026-09-14; no license file; no releases; last push 2026-02-23).",
			triggers: ["herbal moonlight strategy", "zk hybrid game stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"troqpay/sdk": [
		{
			note: "@troqpay/sdk: TroqPay's official JavaScript/TypeScript SDK, newest release v0.1.3. Its README leads with an operational warning worth repeating — use it from a BACKEND runtime and never expose `trq_test_` or `trq_live_` keys in browser or mobile code (README read 2026-09-14; MIT; last push 2026-08-22).",
			triggers: ["troqpay sdk", "backend only api keys payment sdk"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"troqpay/.github": [
		{
			note: "TroqPay's organisation profile and community-health files — templates and the profile README applied across the org, no product content (metadata read 2026-09-14; no license file; no releases; last push 2026-08-21).",
			triggers: ["troqpay org profile"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Brale-xyz/commons": [
		{
			note: "Brale Commons: the issuer's centralised hub of open resources for building with stablecoins, versioned in its own README at 1.4.2 — a stablecoin issuer publishing shared tooling rather than only API docs (README read 2026-09-14; MIT; 1 star; no releases; last push 2026-04-21).",
			triggers: ["brale commons stablecoin resources"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"axis-markets/demo-server": [
		{
			note: "A demo server for the AXIS indexer (GitHub description; the README is empty) — the runnable example beside axis-markets/indexer, orderbook and json-storage, all noted (metadata read 2026-09-14; no license file; no releases; last push 2026-05-19).",
			triggers: ["axis demo server"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"stellar-experimental/zig-stellar-xdr": [
		{
			note: "Zig types for Stellar XDR, GENERATED from the XDR definitions rather than hand-written. Its README opens with the same CAUTION as the Zig Soroban SDK — experimental, toy experiments only — and together they show how far a non-Rust, non-JS Stellar stack has been taken (README read 2026-09-14; no license file; no releases; last push 2026-02-16).",
			triggers: ["zig stellar xdr", "generated xdr types zig"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Fundable-Protocol/fundable": [
		{
			note: "The Fundable protocol's contract monorepo — written in CAIRO, so these are Starknet contracts; Fundable's Stellar work is in stellar_indexer, Backend and fundable-sdk, and its EVM UI is evm_client. Three chains in one org, which is exactly why the language matters here (README read 2026-09-14; no license file; 4 stars; no releases; last push 2026-01-06).",
			triggers: ["fundable cairo contracts", "fundable starknet protocol"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"allbridge-io/allbridge-core-evm-contracts": [
		{
			note: "The most recent EVM and TRON versions of Allbridge Core's bridge contracts — the counterpart to allbridge-core-soroban-contracts, which holds the Stellar side. When a question is about how Allbridge Core behaves on a given chain, the language of the repository is the answer (README read 2026-09-14; no license file; 4 stars; no releases; last push 2026-08-25).",
			triggers: ["allbridge evm contracts", "allbridge tron contracts"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"perspectivefi/spectra-subgraph": [
		{
			note: "The Spectra Protocol subgraph, indexing Futures and AMM pool data from Spectra's contracts — a Graph Protocol subgraph, so EVM-side infrastructure; Spectra's Stellar work is in spectra-oracles-stellar-public and spectra-core-stellar-public (README read 2026-09-14; MIT; no releases; last push 2026-08-15).",
			triggers: ["spectra subgraph indexing"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"arcane-finance-defi/confidential-asset-platform": [
		{
			note: "Arcane Finance's hackathon submission for a confidential asset platform — the README states it is built for SOLANA, combining a frontend, Solana integrations and an indexer. Not a Stellar repository despite the confidential-assets subject matter overlapping Stellar's own work (README read 2026-09-14; no license file; no releases; last push 2026-05-12).",
			triggers: ["arcane confidential asset platform"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"bitbond/token-tool-mcp": [
		{
			note: "npm token-tool-mcp: Bitbond's MCP server for deploying and managing COMPLIANT ERC20 tokens from any agent — tokenisation-as-a-tool, on EVM rather than Stellar, and a useful comparison point for what an agent-driven issuance flow looks like elsewhere. 6 stars (README read 2026-09-14; MIT; no releases; last push 2026-03-31).",
			triggers: ["token tool mcp bitbond", "deploy compliant erc20 agent"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"dfns/dfns-sdk-rust": [
		{
			note: "The Dfns Rust SDK, published on crates.io as dfns-sdk-rust, newest release v0.3.0 — the fourth Dfns client in this index beside the Java, Go and TypeScript SDKs; a custody provider's library that supports Stellar among many chains (README read 2026-09-14; MIT; last push 2026-09-11).",
			triggers: ["dfns rust sdk"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"CypherD-IO/agent-pay": [
		{
			note: "@cypherhq/agent-pay: Cypher's npm package for agent payments — another entrant in the agent-payments cluster, published by a wallet company rather than a protocol project (README read 2026-09-14; MIT; no releases; last push 2026-04-30).",
			triggers: ["cypher agent pay"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"dapplooker/openclaw-skills": [
		{
			note: "DappLooker's OpenClaw skills, giving an agent access to their DeFi intelligence APIs — the same publish-a-skill-for-your-own-product pattern as ACTA, BlindPay, Crypto.com and Trustless Work, which is now common enough to be a category (README read 2026-09-14; MIT; no releases; last push 2026-05-18).",
			triggers: ["dapplooker openclaw skills", "defi intelligence agent skill"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"CertiKProject/zkvm-verus": [
		{
			note: "CertiK's work for an Ethereum Foundation grant evaluating VERUS for zkVM and zkEVM verification: it contains a Verus proof of the zkWasm virtual machine's BitTable module, adapted from the original. Formal-verification research in Rocq/Verus, not Stellar code (README read 2026-09-14; no license file; 2 stars; no releases; last push 2026-04-20).",
			triggers: ["verus zkvm verification", "zkwasm bittable proof"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Beans-BV/beans-gitflow": [
		{
			note: "bflow: a cross-platform CLI implementing Beans' customised gitflow — it detects the current branch and offers context-appropriate options. Internal developer tooling from the Beans app team, newest release v3.5.0, with no Stellar-specific content (README read 2026-09-14; Apache-2.0; last push 2026-09-02).",
			triggers: ["beans gitflow cli"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"rango-exchange/assets": [
		{
			note: "Rango Exchange's static assets repository: icons and metadata for every blockchain, protocol and swapper it supports — brand and metadata rather than code, though it is a usable source for how a large aggregator labels chains (README read 2026-09-14; no license file; no releases; last push 2026-09-14).",
			triggers: ["rango assets metadata"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"pipeops-dev/pipeops-fastapi": [
		{
			note: "Triage 2026-09-14: a FastAPI starter kit from PipeOps — clone-and-run boilerplate, no product or Stellar content, the sibling of pipeops-nextjs and pipeops-rust. https://github.com/pipeops-dev/pipeops-fastapi",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"pipeops-dev/pipeops-rust": [
		{
			note: "Triage 2026-09-14: a Rust starter kit from PipeOps — empty README, boilerplate Dockerfile, no product or Stellar content. Third PipeOps starter in the index. https://github.com/pipeops-dev/pipeops-rust",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"almanax-ai/Almanax-marketing-site-copy-MIT": [
		{
			note: "Triage 2026-09-14: an MIT-licensed COPY of Almanax's marketing site — empty README, no releases; it exists to relicense a website, not to document a product. https://github.com/almanax-ai/Almanax-marketing-site-copy-MIT",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"VoltaHQ/docs": [
		{
			note: "Triage 2026-09-14: Volta Projects' documentation repository — empty README, no releases, a Makefile-only tree, so nothing durable is stated here. Re-examine if it publishes content. https://github.com/VoltaHQ/docs",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"coindisco/galaxy-ramp": [
		{
			note: "Triage 2026-09-14: GONE — the GitHub API returns no metadata, so the repository was deleted, renamed or made private since indexing. Retire or re-resolve the row. https://github.com/coindisco/galaxy-ramp",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"gakpe/minah_blockchain_v0.2": [
		{
			note: "Triage 2026-09-14: GONE — no metadata from the GitHub API, same as coindisco/galaxy-ramp. Retire or re-resolve the row. https://github.com/gakpe/minah_blockchain_v0.2",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	// ── P5 wave 18 (2026-09-14) — the LAST 64 curated-pool repos with no entry.
	// After this wave every repo in the pool (source != ec-taxonomy, repoScore
	// >= 30, not archived) carries a note. Read 2026-09-14.
	"kommitters/elixir_xdr": [
		{
			note: "hex.pm elixir_xdr (v0.3.11 on GitHub): process XDR data in Elixir against the RFC 4506 standard — the encoding layer under kommitters' Stellar and Soroban libraries, and the reason an Elixir shop can talk to Stellar at all. 11 stars (README read 2026-09-14; MIT; last push 2026-09-09).",
			triggers: ["elixir xdr library", "rfc4506 elixir", "xdr encoding elixir"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"kommitters/soroban.ex": [
		{
			note: "hex.pm soroban (v0.22.0 on GitHub): the Elixir library for talking to a Soroban-RPC server and building contract invocations — the Elixir path to Soroban, built on kommitters' elixir_xdr. 5 stars (README read 2026-09-14; MIT; last push 2026-09-09).",
			triggers: [
				"soroban elixir library",
				"soroban rpc elixir",
				"elixir contract invocation stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"taurushq-io/multi-party-sig": [
		{
			note: "Taurus's Go implementation of THRESHOLD SIGNATURE protocols — multi-party computation for signing, at 391 stars the most-starred repository in this registry. It is general cryptography rather than Stellar code, but it is the library a custodian reaches for when a Stellar key must never exist in one place (README read 2026-09-14; Apache-2.0; no releases; last push 2025-09-10).",
			triggers: [
				"threshold signatures go",
				"multi party signing library",
				"mpc signature protocol",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Galmanus/sorohunter": [
		{
			note: "sorohunter: an ADVERSARIAL hunter for agentic Soroban contracts — generic and ABI-driven, so it attacks a contract from its interface rather than from hand-written cases. The offensive counterpart to OpenZeppelin's static detectors and Solarkraft's runtime monitoring, completing the three published approaches to Soroban contract safety (README read 2026-09-14; MIT; 2 stars; no releases; last push 2026-08-20).",
			triggers: [
				"sorohunter adversarial testing",
				"abi driven contract fuzzing soroban",
				"attack agentic contract",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"davedumto/stellar-social-recovery": [
		{
			note: "A reference implementation of GUARDIAN-APPROVED, TIME-LOCKED account recovery for Stellar — no seed phrase and no custodian. The recovery half of the smart-account story whose other half (passkeys, policies) appears throughout this registry (README read 2026-09-14; MIT; no releases; last push 2026-07-12).",
			triggers: [
				"stellar social recovery",
				"guardian account recovery",
				"time locked recovery stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"jamesbachini/CCTP-Stellar": [
		{
			note: "Demo scripts for Circle CCTP V2 on Stellar testnet: `bridgeout.js` burns testnet USDC through the Stellar `TokenMessengerMinter` and waits for attestation — naming the actual contract an integrator must call, which is the part most CCTP write-ups leave out (README read 2026-09-14; MIT; 1 star; no releases; last push 2026-05-19).",
			triggers: [
				"cctp stellar demo",
				"tokenmessengerminter stellar",
				"burn usdc attestation stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"leocagli/stellar-x402-paywall-kit": [
		{
			note: "npm stellar-x402-paywall-kit: ONE-LINE x402 paywall middleware for Express and Hono backed by a Stellar facilitator — the lowest-effort way to put a 402 in front of an existing HTTP route (README read 2026-09-14; MIT; no GitHub releases; last push 2026-08-06).",
			triggers: [
				"x402 paywall middleware",
				"express hono 402 stellar",
				"one line paywall",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"ffarinas/x402-mcp-stellar-template": [
		{
			note: "A Go template for setting up payments between AI agents and APIs using USDC on Stellar, pitched at ten minutes from clone to charging per call — written for a SaaS owner who wants agents to pay per request rather than hold an account (README read 2026-09-14; no license file; no releases; last push 2026-04-14).",
			triggers: ["x402 mcp template go", "charge agents per call stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"CaBsCrypto/stellar-agent-spend-hub": [
		{
			note: "Stellar Agent Spend Hub: privacy-first agentic payments for MCP, API and digital-service spend — an agent discovers paid resources and pays for them, with privacy as the stated design constraint. Topics agentic-payments, mcp, x402 (README read 2026-09-14; no license file; no releases; last push 2026-08-12).",
			triggers: ["agent spend hub stellar", "privacy first agentic payments"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"vicentewolde/AgentPay": [
		{
			note: "AgentPey (agentpey.com): an agentic payments stack on Stellar testnet built in SEVEN PHASES — verifiable agent identity, spending policy, signed mandates, real commerce and beyond. The phased structure is the useful part: it is a map of what an agent-payments stack actually needs (README read 2026-09-14; Apache-2.0; no releases; last push 2026-09-14).",
			triggers: [
				"agentpey identity credentials",
				"signed mandates agent payments",
				"agent identity stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"iamnotdou/bound-web": [
		{
			note: "Bound Protocol (boundprotocol.dev): a SURETY BOND for AI agents on Stellar — an operator publishes a certificate carrying a bound, so a counterparty can check what an agent is backed for before transacting. Insurance rather than budgeting, which makes it distinct from the spend-control cluster (README read 2026-09-14; MIT; topics ai-agents, soroban; no releases; last push 2026-08-22).",
			triggers: [
				"bound protocol surety",
				"agent surety bond stellar",
				"agent certificate backing",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"kamalbuilds/stealthpayroll": [
		{
			note: "Confidential Payroll on Stellar: salary amounts hidden on-chain as PEDERSEN COMMITMENTS with spending proven by UltraHonk zero-knowledge proofs — payroll is the clearest real use of confidential amounts, because the employer must prove solvency without publishing salaries (README read 2026-09-14; no license file; no releases; last push 2026-07-03).",
			triggers: [
				"stealth payroll stellar",
				"confidential salary commitments",
				"pedersen payroll ultrahonk",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"theahaco/sdf-zk-proposal": [
		{
			note: 'Ahaco\'s published proposal to SDF — "ZK Proofs on Soroban: Recovery + Privacy Bundle", rendered at theahaco.github.io/sdf-zk-proposal. A proposal rather than shipped work, but it is the citable statement of what a ZK recovery-and-privacy bundle for Soroban would contain (README read 2026-09-14; no license file; no releases; last push 2026-05-07).',
			triggers: ["zk proofs soroban proposal", "recovery privacy bundle sdf"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"CheesecakeLabs/Stellar-Asset-Sandbox": [
		{
			note: "The Stellar Asset Sandbox from Cheesecake Labs: an environment for creating and exercising Stellar assets end to end — the practical companion to the issuer-control teaching material, aimed at teams evaluating asset issuance before committing. 4 stars (README read 2026-09-14; no license file; no releases; last push 2026-07-09).",
			triggers: ["stellar asset sandbox", "try asset issuance environment"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"lightsail-network/ledger-devcontainer": [
		{
			note: "A VS Code DevContainer that sets up a LEDGER HARDWARE-WALLET app development environment with zero additional effort, newest release v2025.8.3 — the friction-remover for anyone maintaining the Stellar Ledger app (README read 2026-09-14; MIT; 2 stars; last push 2025-08-27).",
			triggers: ["ledger app devcontainer", "hardware wallet dev environment"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"withObsrvr/rs-stellar-history-archive-hasher": [
		{
			note: "A WASM library for hashing Stellar transaction HISTORY ARCHIVE entries — hashing `TransactionHistoryEntry` and its result counterpart, which is what lets an independent party verify an archive rather than trust it (README read 2026-09-14; MIT; no releases; last push 2026-08-24).",
			triggers: [
				"history archive hasher",
				"verify stellar archive entries",
				"transaction history entry hash",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"withObsrvr/stellar-raw-ledger-origin": [
		{
			note: "stellar-raw-ledger-origin: one adapter-neutral raw-ledger CORE with two runtime adapters, converting a parsed `xdr.LedgerCloseMeta` into a canonical form — the entry point of Obsrvr's ledger pipeline, beside stellar-extract and obsrvr-stellar-components (README read 2026-09-14; no license file; no releases; last push 2026-08-05).",
			triggers: ["raw ledger origin obsrvr", "ledgerclosemeta adapter"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Hoops-Finance/contracts": [
		{
			note: "Hoops' modular Soroban contract suite: a user deposits ONE asset such as USDC and it is spread across SEVERAL AMMs for swaps or liquidity — aggregation at the contract layer rather than in a router (README read 2026-09-14; no license file; no releases; last push 2026-02-28).",
			triggers: ["hoops contracts amm spread", "deposit one asset many amms"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"excellar-labs/excellar-contracts": [
		{
			note: "excellar: a decentralised lending platform on Stellar for tokenising, lending and borrowing MONEY MARKET assets. Newest tag 2/merge_token_pkg0.1.0_cli21.5.0 and last push 2025-09-16, so it documents the 2025 state (README read 2026-09-14; no license file).",
			triggers: [
				"excellar lending money market",
				"tokenize money market stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Templar-Protocol/templar-liquidator": [
		{
			note: "Templar's liquidator service in Rust, newest release v1.2.0 and pushed the day this note was written — the keeper half of Templar's lending protocol, beside Templar-Protocol/contracts (README read 2026-09-14; GPL-3.0; last push 2026-09-14).",
			triggers: ["templar liquidator", "lending keeper stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Moonlight-Protocol/provider-stack": [
		{
			note: "Moonlight's SELF-HOST privacy-provider stack in Rust, shipped as a `docker compose` bundle with the backend, frontend and Postgres together — running a privacy provider is meant to be a compose file, which is the decentralisation claim made concrete (README read 2026-09-14; no license file; no releases; last push 2026-08-17).",
			triggers: ["moonlight provider stack", "self host privacy provider"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Moonlight-Protocol/landing-page": [
		{
			note: "Moonlight Protocol's landing page (moonlightprotocol.io), marked temporary in its own description — the public face of the privacy protocol whose SDK, provider stack, UI, pay platform and dashboards are noted separately (README read 2026-09-14; AGPL-3.0; last push 2026-03-31).",
			triggers: ["moonlight protocol landing"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"RozoAI/rozo-app-mobile": [
		{
			note: "The Rozo mobile app, newest tag v1.1.1 with the README stating it is coming soon — the consumer end of Rozo's payment stack, beside the intents skill, deeplink parser, rewards miniapp and pay sponsor (README read 2026-09-14; no license file; last push 2025-11-25).",
			triggers: ["rozo mobile app"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"troqpay/agent-plugin": [
		{
			note: "TroqPay's official MCP server and Codex/Claude plugin, exposing payment tools such as `troqpay_create_checkout` to any MCP client — the agent surface of the payments API whose SDK is noted separately (README read 2026-09-14; MIT; no releases; last push 2026-06-16).",
			triggers: ["troqpay mcp plugin", "payment tools mcp checkout"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"myazahq/kyc-sdk-react-native": [
		{
			note: "@myazahq/kyc-sdk-react-native v2.6.0: a React Native (Expo) KYC SDK with document auto-capture, eMRTD CHIP READING OVER NFC and ON-DEVICE liveness — passport-chip verification on a phone is a meaningfully higher bar than photo-based KYC, which matters for anchors (README read 2026-09-14; MIT; last push 2026-09-08).",
			triggers: [
				"react native kyc sdk",
				"emrtd nfc chip reading",
				"on device liveness kyc",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"mozartpay/OAs": [
		{
			note: "MozartPay's Orchestrated Agreements CLI (v0.1.0-mvp): a Go command-line tool built on a PURE-GO Soroban RPC client — notable because a pure-Go Soroban path avoids the Rust bindings most Go tooling depends on (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-09-12).",
			triggers: ["mozartpay orchestrated agreements", "pure go soroban rpc"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"linkioafrica/payment-widget": [
		{
			note: "Linkio Africa's merchant payment widget, generated from a dashboard payment link (link-checkout.vercel.app). The README is the create-next-app scaffold, so the description is the durable statement — checkout generated from a link, the same shape as Tellus's paylink (README read 2026-09-14; no license file; no releases; last push 2026-04-09).",
			triggers: ["linkio payment widget", "merchant checkout link africa"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"thegivehub/www": [
		{
			note: "The GiveHub marketing website (thegivehub.com) — the public site of the giving platform; the README is empty, so the site itself carries what GiveHub does (metadata read 2026-09-14; no license file; no releases; last push 2026-07-27).",
			triggers: ["givehub website"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"untangledfinance/untangled-tunnel": [
		{
			note: "Untangled Tunnel: an SSH server for reaching internal infrastructure through secure tunnels, written in TypeScript on Bun (ssh://ssh.untangled.finance). Internal operations tooling, published openly (README read 2026-09-14; MIT; 2 stars; no releases; last push 2025-09-15).",
			triggers: ["untangled tunnel ssh", "ssh port forwarding bun"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"drips-network/gardener": [
		{
			note: "Gardener: a service that ranks a project's dependencies by their GRAPH CENTRALITY, built by Drips to decide how funding should flow through a dependency tree. Directly comparable to PG Atlas's dependency-subgraph work, and the two together are the state of dependency-weighted funding. 6 stars (README read 2026-09-14; MIT; no releases; last push 2026-05-08).",
			triggers: [
				"gardener dependency centrality",
				"rank dependencies funding",
				"graph centrality oss funding",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"AnChainAI/anchain-data-mcp": [
		{
			note: "AnChain.AI's MCP server for its blockchain-intelligence Data API — compliance and risk analytics exposed to agents. 6 stars; AGPL-3.0, which is worth noting because a copyleft licence constrains how an agent platform can embed it (README read 2026-09-14; no releases; last push 2026-02-18).",
			triggers: ["anchain data mcp", "blockchain intelligence agent api"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"almanax-ai/almanax-security-plugin": [
		{
			note: "Almanax's official plugin and skills for Claude Code and Codex, used through their hosted MCP server at mcp.almanax.ai — security analysis delivered as a skill rather than a CLI, the same pattern as Bevor's (README read 2026-09-14; Apache-2.0; 2 stars; no releases; last push 2026-03-27).",
			triggers: ["almanax security plugin", "hosted security mcp"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Bevor-Protocol/Bevor-Action": [
		{
			note: "Bevor's GitHub Action: it runs Bevor AI smart-contract security analysis on every pull request and uploads findings to their dashboard — CI-time security review, the action counterpart to their agent skill (README read 2026-09-14; MIT; no releases; last push 2026-04-29).",
			triggers: ["bevor security action", "contract security on every pr"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"devasignhq/evals": [
		{
			note: "DevAsign's internal EVAL dashboard: it calls their code-review API, gets the review back and scores it with Claude or Gemini as the judge LLM — a team publishing the harness that grades its own product's output, which is rare enough to be worth citing (README read 2026-09-14; Apache-2.0; no releases; last push 2026-05-01).",
			triggers: [
				"devasign evals judge",
				"score ai code review",
				"llm as judge eval dashboard",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"blockdaemon/chain_sink": [
		{
			note: "Chain Sink: Blockdaemon's high-performance blockchain data synchronisation tool in Go, newest release v1.0.0 — infrastructure for pulling chain data at scale, from a node provider that also serves Stellar (README read 2026-09-14; Apache-2.0; last push 2026-03-01).",
			triggers: ["blockdaemon chain sink", "high performance chain data sync"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"dfns/dfns-sdk-kotlin": [
		{
			note: "The Dfns Android SDK in Kotlin — the fifth Dfns client in this registry beside the Java, Go, Rust and TypeScript SDKs; a custody provider's mobile library covering Stellar among many chains (README read 2026-09-14; no license file; no releases; last push 2026-08-27).",
			triggers: ["dfns android sdk", "dfns kotlin"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"soroswap/allbridge-implementation": [
		{
			note: "Scripts that interface Soroswap with Allbridge for cross-chain transactions to and from Stellar — implementation tests rather than a product, and at a last push of 2024-05-03 they record how that integration was exercised in 2024 (README read 2026-09-14; no license file; 1 star; no releases).",
			triggers: ["soroswap allbridge integration", "cross chain tests stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"warp-driver/warpdrive-intro": [
		{
			note: "WarpDrive's Milestone 1 investigation into bringing its off-chain compute to Soroban — the repository is laid out as contracts/ interfaces and architecture plus cryptography/ choices, so it is the design record preceding warpdrive-contracts and oracle-demo (README read 2026-09-14; no license file; no releases; last push 2026-04-17).",
			triggers: [
				"warpdrive intro milestone",
				"offchain compute design soroban",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Aypp23/stellarship": [
		{
			note: "Stellarship (stellarship-web.vercel.app): a zero-knowledge hidden-information naval strategy game on Stellar TESTNET where players commit private boards on-chain and play locally or through a relay — the relay option is the design detail that separates it from the other battleship entries (README read 2026-09-14; no license file; no releases; last push 2026-02-23).",
			triggers: ["stellarship naval strategy", "relay play zk game stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"mthdroid/ZKMind": [
		{
			note: "ZKMind: Mastermind on Stellar where every FEEDBACK CLUE is proven correct by a zero-knowledge proof — the README's line is that your opponent cannot lie. Proving the correctness of a hint, rather than the secrecy of a position, is a distinct proof shape in this cohort (README read 2026-09-14; no license file; no releases; last push 2026-02-21).",
			triggers: [
				"zkmind mastermind stellar",
				"prove feedback clue zk",
				"opponent cannot lie game",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"max-ramos-rod/provably-fair-battleship-stellar": [
		{
			note: "A provably fair battleship built with RISC ZERO for the ZK Gaming hackathon — gameplay happens off-chain and the zkVM receipt carries the proof, which is a different architecture from the Noir and Pedersen entries in the same cohort and ties back to the RISC0 verifier work on Stellar (README read 2026-09-14; no license file; no releases; last push 2026-02-23).",
			triggers: ["risc zero battleship stellar", "zkvm game proof stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Gabrululu/Stellar-Mystery-Box": [
		{
			note: "Stellar Mystery Box: a two-to-three-hour WORKSHOP in Spanish where each participant creates, customises and deploys their own Stellar token — teaching material with a fixed run time, which is what a meetup organiser actually needs (README read 2026-09-14; no license file; no releases; last push 2026-08-30).",
			triggers: ["stellar mystery box workshop", "taller token stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"Gabrululu/Stellar-SwapANDSplash": [
		{
			note: "Stellar: Swap & Splash — an interactive workshop in Spanish where each participant designs, deploys and customises a token, then swaps it with the group; two layers, a contract and a front end. The sibling of the same author's Mystery Box workshop (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-08-18).",
			triggers: [
				"swap and splash workshop",
				"taller intercambio token stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"johneliud/school-management": [
		{
			note: "A Soroban contract for school administration — student registrations, class assignments and fee payments. A plain, readable example of record-keeping plus payments in one contract, useful as teaching material (README read 2026-09-14; no license file; topic soroban-sdk; no releases; last push 2026-05-23).",
			triggers: [
				"school management soroban",
				"student registration contract stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"huitemagico/kmac": [
		{
			note: "KMAC: a soroban-sdk program for sharing and exchanging resources, written in Spanish; last push 2025-01-11 with no release, so it records an early-2025 learning project (README read 2026-09-14; no license file; 1 star).",
			triggers: ["kmac soroban project"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"tupui/soroban-seal-coin": [
		{
			note: "Seal Coin (SEAL): a Soroban token project documented in a JUPYTER NOTEBOOK — an unusual and readable format for explaining a token, since the notebook shows the calls and their outputs together (README read 2026-09-14; license NOASSERTION; 1 star; no releases; last push 2026-06-16).",
			triggers: ["seal coin soroban", "jupyter notebook token stellar"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"EliaquimI/GibborHackaton": [
		{
			note: "GIBBOR: a panic-button system combining an ESP32 device, an Android app and a Node backend, whose README frames the problem precisely — a victim records a video, but how do you prove it was not edited and when it was recorded. Anchoring evidence integrity is the Stellar role here; hardware plus mobile plus chain is a rare combination in this index (README read 2026-09-14; no license file; 1 star; no releases; last push 2026-05-15).",
			triggers: [
				"gibbor panic button",
				"prove video not edited",
				"evidence integrity esp32 stellar",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"kalepail/stellarlight": [
		{
			note: "A GitHub FORK of Stellar Light's own public repository (alexanderkoh/stellarlight) — same README, no divergence stated. Cite the upstream for the project's state (README and metadata read 2026-09-14; MIT; no releases; last push 2026-08-21).",
			triggers: ["stellarlight fork"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"TrustLine-id/colosseum-2026": [
		{
			note: "Trustline's Colosseum Frontier hackathon submission: an institutional-style tokenised vault on SOLANA extended with SVS-13. Not Stellar — Trustline's Stellar work is stellar-sdk, stellar-validation-engine and stellar-demo-app, all noted (README read 2026-09-14; MIT; no releases; last push 2026-05-08).",
			triggers: ["trustline colosseum vault solana"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"fiatsend/contracts": [
		{
			note: "Fiatsend's smart contracts in SOLIDITY — payment infrastructure for businesses paying into Africa, the README's framing being payroll platforms like Deel or Payoneer. Fiatsend's Stellar side is its published technical architecture and docs, both noted; this repository is EVM (README read 2026-09-14; no license file; no releases; last push 2026-04-13).",
			triggers: [
				"fiatsend contracts solidity",
				"payroll into africa contracts",
			],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"spaceandtimefdn/sxt-node-op-contracts": [
		{
			note: "Space and Time's node-operation contracts in Solidity: staking SXT, nominating validators and unstaking. EVM infrastructure for their own network, not Stellar (README read 2026-09-14; license NOASSERTION; 1 star; no releases; last push 2026-01-28).",
			triggers: ["sxt staking contracts", "space and time node operation"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"rango-exchange/token-list": [
		{
			note: "Rango Exchange's custom token list, drawn from sources such as CoinGecko and covering more than 10,000 tokens by the README's own count — aggregator metadata spanning many chains, useful as a comparison point for how a large router curates assets (README read 2026-09-14; no license file; 4 stars; no releases; last push 2025-11-11).",
			triggers: ["rango token list", "aggregator token curation"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"btq-ag/btq-stresstest": [
		{
			note: "BTQ's testnet transaction stress-test tool: participants run it on their own nodes to generate load by periodically sending small random transactions to configured peers. For BTQ's own testnet, not Stellar — the fourth BTQ repository in this index, all quantum/consensus research (README read 2026-09-14; no license file; no releases; last push 2026-04-28).",
			triggers: ["btq stress test testnet"],
			source: "curated",
			asOf: "2026-09-14",
		},
	],
	"CertiKProject/brand-assets": [
		{
			note: "Triage 2026-09-14: CertiK's brand assets — logos and imagery with an instruction not to remove or rename them. No product content. https://github.com/CertiKProject/brand-assets",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"NoetherDEX/noetherkeeperbot": [
		{
			note: "Triage 2026-09-14: GONE — the GitHub API returns no metadata, so the repository was deleted, renamed or made private since indexing. Noether's live repositories (noether-docs, noetherdiscordwebhook) are noted; yahya_development is likewise gone. Retire or re-resolve the row. https://github.com/NoetherDEX/noetherkeeperbot",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"pipeops-dev/pipeops-adonisJs": [
		{
			note: "Triage 2026-09-14: one of TWELVE PipeOps framework starter kits in the curated pool (adonisJs, asp-dotnet-core, fastapi, flask, laravel, nestJs, nodejs, php, ruby-sinatra, rust, vuejs, nextjs). Each is clone-and-run boilerplate for a hosting platform, with no product or Stellar content. They are in the pool because the whole pipeops org was swept in behind its curated project row — the same small-org effect as gateway-fm. https://github.com/pipeops-dev/pipeops-adonisJs",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"pipeops-dev/pipeops-asp-dotnet-core": [
		{
			note: "Triage 2026-09-14: PipeOps ASP.NET Core starter kit — boilerplate, no product or Stellar content. See pipeops-adonisJs for the full set of twelve. https://github.com/pipeops-dev/pipeops-asp-dotnet-core",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"pipeops-dev/pipeops-flask": [
		{
			note: "Triage 2026-09-14: PipeOps Flask starter kit — boilerplate, no product or Stellar content. See pipeops-adonisJs. https://github.com/pipeops-dev/pipeops-flask",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"pipeops-dev/pipeops-laravel": [
		{
			note: "Triage 2026-09-14: PipeOps Laravel starter kit — boilerplate, no product or Stellar content. See pipeops-adonisJs. https://github.com/pipeops-dev/pipeops-laravel",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"pipeops-dev/pipeops-nestJs": [
		{
			note: "Triage 2026-09-14: PipeOps Nest.js starter kit — boilerplate, no product or Stellar content. See pipeops-adonisJs. https://github.com/pipeops-dev/pipeops-nestJs",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"pipeops-dev/pipeops-nodejs": [
		{
			note: "Triage 2026-09-14: PipeOps Node.js starter kit — boilerplate, no product or Stellar content. See pipeops-adonisJs. https://github.com/pipeops-dev/pipeops-nodejs",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"pipeops-dev/pipeops-php": [
		{
			note: "Triage 2026-09-14: PipeOps PHP starter kit — boilerplate, no product or Stellar content. See pipeops-adonisJs. https://github.com/pipeops-dev/pipeops-php",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"pipeops-dev/pipeops-ruby-sinatra": [
		{
			note: "Triage 2026-09-14: PipeOps Ruby/Sinatra starter kit — boilerplate, no product or Stellar content. See pipeops-adonisJs. https://github.com/pipeops-dev/pipeops-ruby-sinatra",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
	"pipeops-dev/pipeops-vuejs": [
		{
			note: "Triage 2026-09-14: PipeOps Vue.js starter kit — boilerplate, no product or Stellar content. See pipeops-adonisJs. https://github.com/pipeops-dev/pipeops-vuejs",
			source: "curated",
			asOf: "2026-09-14",
			visibility: "internal",
		},
	],
};

/**
 * Pool triage verdicts (INTERNAL — never served). The quality board's notes
 * pool is the curated-index repos with repoScore >= 60. On 2026-09-02 every
 * pool repo without a note was examined for a durable, source-citable fact
 * (registry identity that links back, rename/archive, release line, a
 * README-published mainnet ID); these 115 yielded nothing, for the reason
 * recorded. Recording the verdict lets the board tell JUDGED from
 * UNEXAMINED (coverage.knowledgeNotes.triaged) without publishing an
 * opinion about anyone's repo — the same discipline as the batch-1 internal
 * memos. Re-examine a row when it gains a registry package or a mainnet
 * deployment. Keys are lowercase owner/name.
 */
/**
 * Batch-8 triage verdicts for the 50–59 band (2026-09-02): the 80 examined
 * repos that yielded nothing durable, each with the reason. Same contract as
 * POOL_TRIAGE_2026_09_02 — INTERNAL notes, never served, counted by the board
 * as "judged" rather than "unexamined". Re-examine on a registry package,
 * a mainnet deployment, or a project link.
 */
/**
 * Batch-9 triage verdicts for the 40–49 band (2026-09-02): examined repos
 * that yielded nothing durable, each with the reason — INTERNAL, never
 * served, counted by the board as "judged" if the pool ever widens here.
 */
const BAND_40_49_TRIAGE_2026_09_02: Record<string, string> = {
	"alternun-development/alternun":
		"daily version tags (v1.1.80 2026-09-01; 906 tags) but 0 Stellar mentions in README, docs.alternun.io or alternun.io",
	"alternun-development/alternun-admin-ui":
		"private UI shell; 0 Stellar mentions; no tags",
	"alternun-development/alternun-sc-staking":
		"README contract ID CDJRRYST…YB2V not found on public or testnet stellar.expert; no tags",
	"apay-io/apay-bot":
		"1 KB README; package.json name unpublished; last push 2020",
	"bigger-tech/flow":
		"package.json placeholder repository; npm n8n-nodes-stellar 0.1.1 belongs to another repo (joaquinsoza → yripper/n8n-nodes-stellar)",
	"bingtellar/blink-build":
		"testnet only (both README IDs created on testnet 2026-03-25)",
	"blockdaemon/agave-snapshot-uploader":
		"not a Stellar repo (Solana snapshot uploader)",
	"blockdaemon/pyth-exporter":
		"not a Stellar repo (Solana/Pyth exporter; Go module origin gitlab.com/Blockdaemon/solana/pyth_exporter)",
	"blockroll-tech/nuban-bank-prediction":
		"not a Stellar repo (npm nuban-prediction 1.2.0 has no repository field; Nigerian bank lookup)",
	"blockroll-tech/open-assets":
		"not a Stellar repo (logo/asset library; 0 Stellar mentions)",
	"btq-ag/btq-core":
		"not a Stellar repo (own L1 reference node; v0.5.0-testnet)",
	"chainpatrol/discord-bot":
		"not a Stellar repo (private Discord bot; 0 Stellar mentions)",
	"chainpatrol/docs": "not a Stellar repo (docs site; 0 Stellar mentions)",
	"cityofzion/neon-wallet-desktop":
		"not a Stellar repo (NEO/Ethereum wallet by its README; 0 Stellar mentions; v3.11.0 2026-06-17)",
	"coinspect/wallet-security-framework":
		"no Stellar fact in README (wallet security checklist; 0 mentions)",
	"dappradar/nft-sales-adapters":
		"no Stellar adapter in src/adapters (69 entries, none named stellar/soroban); 353-byte README",
	"defarm-repo/soroban-value-chain":
		"PoC by its own README; no tags; last push 2025-04",
	"dextools-io/aggregator-widget":
		"not a Stellar repo (widget docs; 0 Stellar mentions)",
	"dextools-io/chart-widget":
		"not a Stellar repo (widget docs; 0 Stellar mentions)",
	"dfns/dfns-solutions": "recipes/examples; no registry, no tags",
	"dfns/trusted-dealer":
		"not Stellar-specific (CGGMP key import/export; crates `publish = false`; key-import/v0.5.0 2026-08-12)",
	"dogstarcoin/auction-soroban-sc": "no tags, IDs or registry; last push 2023",
	"drips-network/app":
		"not a Stellar repo (EVM funding dapp; 0 Stellar mentions)",
	"drips-network/contracts":
		"not a Stellar repo (EVM contracts; per-chain tags v2_*_update_3)",
	"flashbacknetwork/flashonstellar":
		"tags only (0.3.1v2 2024-12-10; 4 tags); no IDs or registry",
	"flutterwave/node-v3":
		"npm flutterwave-node-v3 1.4.1 (2026-06-17; old path Flutterwave/Flutterwave-node-v3 → 301) but 0 Stellar mentions",
	"flutterwave/php-v3":
		"packagist flutterwavedev/flutterwave-v3 1.2.1 (2026-08-04; repo links back) but 0 Stellar mentions",
	"flutterwave/python-v2":
		"PyPI rave_python 1.5.0 (2026-06-15; homepage Flutterwave/rave-python → 301) but 0 Stellar mentions",
	"flutterwave/react-v3":
		"npm flutterwave-react-v3 1.3.3 (2026-02-11; old path Flutterwave/Flutterwave-React-v3 → 301) but 0 Stellar mentions",
	"francoperez03/stellar-enclave":
		"fork of NethermindEth/stellar-private-payments (GitHub banner); hackathon, four testnet IDs (2026-04-11)",
	"gateway-fm/open-privacy-suite":
		"not a Stellar repo (Ethereum privacy suite; v0.13.0-rc.3)",
	"gateway-fm/ops-explorer":
		"not a Stellar repo (Ethereum explorer; v0.9.0-rc.2)",
	"gateway-fm/oz-policy-builder":
		"README-only so far (no tags; crates unpublished; SCF milestone repo, push 2026-09-01)",
	"grantchain/grantfox":
		"private package; 0 Stellar mentions in README; no tags",
	"hot-dao/omni-sdk":
		"registry entry (@hot-labs/omni-sdk) does not link back to the repo",
	"idos-network/idos-schema": "179-byte README; no tags; 0 Stellar mentions",
	"indexed-xyz/docs": "docs site only (297-byte README; 0 Stellar mentions)",
	"inferara/inferara.com": "company website source (119-byte README)",
	"innookeke/veritask": "hackathon demo, testnet only (private package)",
	"julianclatro/stellar-game-studio":
		"fork of jamesbachini/Stellar-Game-Studio (GitHub banner); testnet ID (2026-02-04)",
	"ledgerhq/lumen":
		"not a Stellar repo (Ledger Design System; 'lumen' name collision; npm @ledgerhq/lumen-ui-react 0.1.56)",
	"linkioafrica/wavy_soroban_contract":
		"67-byte README; Cargo 0.0.0; last push 2024",
	"lobstrco/fraudulent-assets": "README-only data list; no tags",
	"lockb0x-llc/pakana-stellar-razor-components":
		"NuGet entry carries no repository link",
	"luanlabs/fluxity-interface":
		"hosted app (app.fluxity.finance) but no releases, registry or IDs",
	"luanlabs/fluxity-v1-core":
		"Cargo fluxity-v1-core 0.2.0 unpublished; no tags",
	"metagov/daostar":
		"no Stellar fact in README (DAO standards; v1.0.0 2024-08-28; npm name unpublished)",
	"mks044/reapp-poc": "proof of concept; private workspace; testnet",
	"nrxschool/stellar-bootcamp": "course material; 980-byte README; no tags",
	"offer-hub/protocol-offer-hub":
		"hackathon-style Soroban contract; no tags, IDs or registry",
	"offer-hub/x402":
		"hackathon demo; package.json name 'metered' collides with an unrelated npm package (metered-org)",
	"rango-exchange/rango-contracts-v2":
		"not a Stellar repo (Solidity/hardhat; 311-byte README)",
	"runtimeverification/simbolik-vscode":
		"not a Stellar repo (Solidity debugger extension v15.0.1)",
	"sentinelfi/core": "draft contracts workspace; no tags or IDs",
	"sentinelfi/flight": "private UI; testnet only",
	"sentinelfi/soroban_vault":
		"'draft implementation intended for testing purposes only' (README); its 'Mainnet contract address' CCW67TSZ…MI75 is the USDC asset contract and CAS3J7GY…OWMA the XLM one (both created 2024-02-21 by the SAC deployer)",
	"shogun444/agroshield": "hackathon-style app, testnet only",
	"skyhitz/api":
		"252-byte README; npm name skyhitz-api unpublished; last push 2020",
	"skyhitz/cloudflare-graphql": "private worker backend; no IDs or tags",
	"socket-fi/socketfi-dapp-v1":
		"private package; 1.6 KB README; last push 2024",
	"soundnesslabs/soundness-layer":
		"not a Stellar repo (Sui/Walrus verification layer)",
	"stackman27/soo": "no README, no tags",
	"streamcharge/apicharge":
		"issue-tracker repo by its own README ('use this repo to log issues and request features'); no tags",
	"tenk-dao/smartdeploy":
		"crates.io entries (smartdeploy-*) carry no repository field",
	"vaquita-fi/vaquita-eth-global":
		"ETHGlobal hackathon build; 0 Stellar mentions in README",
	"warp-driver/hodlers-app":
		"tech-demo submission by its own README; no IDs or tags",
	"xycloo/onchain-stellar-complaints": "no README, no tags",
	"xycloo/rs-zephyr-toolkit":
		"crates.io entries carry no repository field — link is indirect",
	"yieldback-cash/market-indexer":
		"no README; package.json name ybc-indexer unpublished",
	"yieldback-cash/ybc-contracts":
		"no tags or IDs (siblings triaged in batches 5 and 8)",
};

const BAND_50_59_TRIAGE_2026_09_02: Record<string, string> = {
	"0xshobha/stellar": "hackathon demo, no registry (2.3 KB README)",
	"acta-team/contracts-acta-spikes":
		"experimental spikes by its own README; no tags (facts live on contracts-acta)",
	"alouzious/hive": "hackathon demo, testnet only (mainnet on roadmap)",
	"alphatechini/stellar-autotask": "hackathon demo, no manifest",
	"ange-r/xioma-agent":
		"hackathon demo, testnet only ('Testnet only' in README)",
	"aryansaxenaa/clausekit":
		"hackathon demo, testnet only (Trustless Work hackathon)",
	"aswinwebdev/forge402": "hackathon demo, testnet only",
	"atharvawaghchoure/agentrep": "hackathon demo, testnet only (testnet ID)",
	"betap987/agent-vault-v2": "hackathon demo, testnet only (testnet IDs)",
	"bholdguy/ara-crystal-machine-economy":
		"hackathon demo, testnet only (Replit-hosted)",
	"bitfalt/ecoproof":
		"hackathon demo, testnet only (Trustless Work hackathon; private package)",
	"blockdaemon/agave-snapshot-gossip-client":
		"not a Stellar repo (Solana/Agave tool; 0 Stellar mentions)",
	"blockful/trustful-stellar-v1":
		"testnet-only contracts; no registry, no tags (last push 2025-03)",
	"boxkit-labs/flare": "testnet; APK sideload only, not in stores",
	"btc-wine/terwa-rwa-vault":
		"docs-only README; testnet; no registry (terwa.io presale platform)",
	"calimero-network/core":
		"registry identity but README states no Stellar fact (crates link back; 0 Stellar mentions)",
	"chatpay-go-labs-oficial/chatpay-tallent-ai": "hackathon demo, no registry",
	"chucklam/x402-you.com": "hackathon demo, no registry (2.4 KB README)",
	"coinspect/learn-evm-attacks":
		"not a Stellar repo (EVM attack catalogue; 0 Stellar mentions)",
	"david1984tk/bimex":
		"hackathon-style app; testnet IDs; the 'pilot project' doc it points to for mainnet addresses holds none",
	"deegalabs/stellar-402-spendguard":
		"hackathon submission; 'Testnet only' by README (v0.1.0 2026-04-07)",
	"deonorla/continuum":
		"hackathon demo, testnet only (npm name 'continuum' belongs to another project)",
	"emmy123222/stellar-search":
		"hackathon demo, testnet default (16 stars; no registry)",
	"enerdao/mvp_smart_contract": "2024 MVP contract; no registry, no tags",
	"everyfinance/smart-contracts-stellar":
		"testnet-only contracts; no registry (6 testnet IDs)",
	"flamki/stellarmind": "hackathon demo, no registry",
	"fxdao/fxdao-sc": "1-byte README; CLI-generated tags only (workspace 22.0.7)",
	"giveth/giveth-dapps-v2":
		"release-only; README states no Stellar fact (v3.54; stellar-sdk only in package.json)",
	"hamdyx2202/stellarpayagent": "hackathon demo, testnet only",
	"handilusa/ferrule": "hackathon demo, testnet only (testnet IDs)",
	"ianvinasmoke24/centurion-pay": "hackathon demo, testnet only",
	"inferara/inference":
		"registry identity but README states no Stellar fact (VS Code ext + v0.0.5; 0 Stellar mentions)",
	"janneh2000/stellarshield-ai":
		"hackathon demo, no registry (mainnet on roadmap)",
	"jaredjuarez/guacamole-app":
		"hackathon demo, no manifest (Vite template README)",
	"jennyt3/ai-bora--stellar": "hackathon demo, testnet only (testnet IDs)",
	"jnrspaco/stellarscope": "hackathon demo, no registry",
	"karagozemin/fortexa":
		"hackathon demo, testnet only ('built for testnet validation')",
	"keoyle52/agentmart": "hackathon demo; mainnet claim without IDs or registry",
	"klarqqs/zap402":
		"package.json repository → 404 path (Nursca/zap402); testnet only",
	"laina-defi/laina":
		"no registry, no tags; README has no addresses (hosted URL only in metadata)",
	"lviffy/aaek":
		"README-claimed npm package unpublished (@aaek/sdk; testnet ID)",
	"mariaelisaaraya/shield-stellar":
		"hackathon demo, testnet only (testnet IDs)",
	"mistakili/stellar-agents": "hackathon demo, no registry (Replit-hosted)",
	"mugglepay/mugglepay":
		"not a Stellar repo (crypto payment gateway; 0 Stellar mentions)",
	"nathanofzion/zi-playground":
		"private app; mainnet is a checklist, not a deployment",
	"nicofains1/spendguard": "hackathon demo, testnet only",
	"nihal-pandey-2302/autonomics-core": "hackathon demo, testnet only",
	"nimrid/x402-shopify-commerce": "hackathon demo, no registry",
	"nitish-d-great/stellarread": "hackathon demo, testnet only",
	"normalfinance/normal-index-v1":
		"package.json name unpublished; tag only (@normalfinance/normal-index-v1; 1 tag)",
	"nova-registry-agent/nova-backend":
		"hackathon demo, testnet only (testnet IDs)",
	"nsdbroficial/aegis402": "hackathon demo, testnet only (testnet ID)",
	"offer-hub/offer-hub":
		"release-only; private package; no hosted URL (v1.0.1 2026-02-18; Airtm + Trustless Work orchestrator)",
	"offer-hub/offer-hub-monorepo":
		"private monorepo; no tags; hosted URL only in metadata (same README header as OFFER-HUB/OFFER-HUB)",
	"official-jumpa/jumpa-website":
		"website repo; no registry, no tags (sibling of triaged official-jumpa/jumpa)",
	"oppia-software-labs/zkarcade":
		"hackathon ZK game, testnet only (testnet ID)",
	"paltalabs/defindex-rescue": "ops scripts; no registry, no tags",
	"perun-network/perun-soroban-token":
		"no README; crate unpublished; last push 2024-07",
	"phibao/agent-net":
		"hackathon demo, testnet only ('hardcoded to Stellar testnet')",
	"pyved-solution/pyved-engine":
		"registry identity but README states no Stellar fact (PyPI links back; Stellar only as SDF sponsor logo)",
	"rango-exchange/explorer":
		"hosted site only; README states no Stellar fact (explorer.rango.exchange; 0 Stellar mentions)",
	"rarible/protocol-contracts":
		"not a Stellar repo (EVM NFT contracts; 0 Stellar mentions)",
	"raunet234/solva-mcp": "hackathon demo, testnet only",
	"sadik-tofik/gigpay": "hackathon demo, no registry (2.5 KB README)",
	"samfresh-ai/task-mesh":
		"hackathon demo, testnet only (publish=false; testnet IDs)",
	"sebwingleet/aerochain-stellar":
		"no registry, no tags, no addresses (last push 2025-06)",
	"secbytex03/paymint": "hackathon demo, testnet only",
	"smart-treasury-account-sta/smart-contracts":
		"POC contracts; no registry, no tags (sibling of triaged STA dapp)",
	"socket-fi/socketfi-account-indexer":
		"private package; no registry, no tags (sibling of triaged Socket-Fi rows)",
	"stellar-oxide-gateway/stellar-oxide-gateway":
		"testnet-only by its own README ('Current Working Paths: USDC on Stellar testnet'); no registry",
	"sumitraikwar18/paywall.ai":
		"hackathon demo, testnet only ('Testnet only' in README)",
	"swiftexwallet/swiftex":
		"release-only; no registry/store identity (1.0.5 2026-07-03; APK sideload build only)",
	"tacticalnoot/smol-fe-hackathon":
		"hackathon fork of smol-fe; hosted URL only (noot.smol.xyz; no tags, no registry)",
	"thegivehub/smartcontracts":
		"no registry, no tags; 1.2 KB README (last push 2025-10)",
	"towa-hi/zk":
		"hackathon ZK game, testnet only (stellar-game-studio template)",
	"vjb/stellar-chaos-swarm": "hackathon demo, testnet only (testnet ID)",
	"web3isco/signalforge-agent": "hackathon demo, no registry (3 KB README)",
	"xavio2495/stexio":
		"README-claimed npm packages unpublished (stexio, @stexio/js-sdk, stexio-proxy)",
	"xbull-corp/guess-the-xbull": "hackathon ZK game, testnet only (testnet ID)",
	"zbagdzevicius/tokentails":
		"not a Stellar repo (commercially licensed; 0 Stellar mentions)",
};

const POOL_TRIAGE_2026_09_02: Record<string, string> = {
	"402md/agentcard": "hackathon demo, testnet only",
	"abdulwahabalm/paygent": "hackathon demo, no registry",
	"abroad-finance/abroad": "deploy-* tags only; no registry",
	"acta-team/give-interactuar": "no registry, no tags, no hosted URL",
	"alternun-development/alternun-ui": "UI shell, no registry/tags",
	"andy00l/x402-autopilot": "hackathon demo, testnet only",
	"arihaan/stellar-sara": "hackathon demo, no registry",
	"arnavmehta7/agenflow-protocol": "hackathon demo, 2 KB README",
	"ashfrancis/chickenz": "hackathon ZK game, testnet only",
	"asmodey-afk/stellar-agent-rep": "hackathon submission, no registry",
	"asterizm-protocol/asterizm-contracts-stellar":
		"testnet-only contracts; no registry, no tags",
	"ayushsaklani-min/agentstell": "npm packages don't link back (see D)",
	"bahmez/heistduel": "hackathon ZK game, no registry",
	"blockdaemon/solana-accountsdb-plugin-kafka":
		"not a Stellar repo (Solana geyser plugin)",
	"bosun-josh121/conductor": "hackathon demo, no registry",
	"buendia-builders/ocean_request": "hackathon demo, testnet only",
	"cassxbt/starlane": "hackathon demo, testnet only",
	"catmcgee/stellar-poker-cosnarks": "hackathon ZK game, testnet only",
	"christabel337/agentex": "hackathon demo, no registry",
	"cijethecreator/stellar-tickets": "companion repo 404; IDs without network",
	"cyberverse2/gopadi": "app scaffold, no registry/tags",
	"darthclyn/paygent-stellar": "hackathon demo, no manifest",
	"davz7/mananaseguro": "hackathon demo, no registry",
	"devasignhq/agent": "no registry, no tags, no hosted URL",
	"dmustapha/verdikt": "hackathon demo, testnet only",
	"dprof-in-tech/stipend": "hackathon-style app, no registry",
	"emanuel250yt/stellarorchestra": "README claims npm package not published",
	"emperorsixpacks/-bear-protocol": "hackathon demo; IDs without network",
	"endernakamoto/walt": "hackathon pitch, no registry",
	"eq-lab/pipeline": "no README; one v0.0.1 tag",
	"eras256/milechain": "hackathon demo, testnet escrow",
	"foundermafstat/nft-dnd-stellar": "hackathon ZK game, testnet only",
	"franklivania/caushun": "hackathon demo, no registry",
	"fundable-protocol/fundable-soroban-contracts":
		"alpha tags only, publish=false (see D)",
	"fundable-protocol/stellar_client_os":
		"testnet client; package.json repo \u2192 404 path",
	"futurehelp/query402-api": "hackathon backend; npm name unpublished",
	"gbangbolaoluwagbemiga/kairos": "hackathon demo, testnet only",
	"gyan0890/shieldex": "hackathon demo ('[Hackathon Name]' placeholder)",
	"harystyleseze/careguard": "hackathon demo; npm name unpublished",
	"heylmstoned/prism-stellar-earn": "SCF submission summary; no registry",
	"hoops-finance/calypso-x402": "hackathon demo, no registry",
	"hoops-finance/cometswap": "1 KB stub, no registry",
	"jennycruzy/geotruth": "hackathon demo, testnet only",
	"kaksv/uber-for-agents": "hackathon demo, no registry",
	"kaleababayneh/zstellar-wordle": "hackathon ZK game; hosted demo only",
	"karansinghbisht/veilgrid": "hackathon ZK game, testnet only",
	"kaxeck/nextforge": "hackathon demo, testnet only",
	"klorenn/cosmic-coder-": "hackathon ZK game, testnet only",
	"klorenn/phase": "hackathon-style app, no registry",
	"legasicrypto/agent-credit-rail": "hackathon demo, no registry",
	"leticarolina/watchdog": "hackathon demo; tags only",
	"liquidsfi/liquidsfi-oracle-web": "60-byte stub README, no registry",
	"liquidsfi/liquidsfi-web-app": "Vite template README, no registry",
	"liquidsfi/zkliquid-home": "Vite template README, no registry",
	"liquidsfi/zkliquid-protocol": "60-byte stub README, no registry",
	"loquit-doru/stellar-tokensentry": "README claims npm package not published",
	"lumens-news/news": "no registry/tags; site gave no response",
	"makindeahmed2110/telos": "no README, no tags",
	"mallikaakash/agentsense": "README claims npm package not published",
	"manoahlinks/mindvault": "hackathon demo, testnet only",
	"marcos-sxt/le_coup": "hackathon ZK game, no registry",
	"maxsouth-dev/payloop": "hackathon demo, no registry",
	"mikemoulder/ero": "hackathon demo, no registry",
	"miracle656/veil": "hosted docs shell only; no registry (see D)",
	"mokwathedeveloper/agent-paywall-router": "hackathon demo, testnet only",
	"mr-574rk/mesh402": "hackathon demo, testnet only",
	"mrtimonm/stellar-x-402": "hackathon demo; ID without network",
	"murat48/zktexasholdem": "hackathon ZK game, testnet only",
	"myles181/hagglenet": "hackathon backend, no registry",
	"nickthelegend/fund402": "3 KB README, no registry",
	"nickyunstoppable/veilstar-brawl": "hackathon ZK game, testnet only",
	"nikhilraikwar/authora": "hackathon demo, testnet only",
	"nikhilraikwar/cubeathon": "hackathon ZK game, testnet only",
	"nirmalplays/stellar-x402": "no manifest, no registry",
	"nuelose/cardentic": "hackathon demo, no registry",
	"official-jumpa/jumpa": "npm name belongs to another project",
	"officially-aditya/taskflow-x402": "hackathon demo, testnet only",
	"olivmath/stealth-battleship": "hackathon ZK game, testnet only",
	"oni7u7/kivo": "no README, no tags",
	"oppia-software-labs/sentinel": "MVP-target README; no registry/tags",
	"oshioke-salaki/agent-tontine": "hackathon demo, no registry",
	"oyingrace/agent_loom": "hackathon experiment, no registry",
	"paltalabs/etherfuse-privy-wallet": "testnet/sandbox MVP; no registry",
	"pedro-gattai/zkachi": "hackathon ZK game, no registry",
	"pedro-pelicioni/court-of-shadows": "hackathon ZK game, no registry",
	"peridotfinance/peridot-soroban": "testnet vault demo; one unrelated tag",
	"phamdat721101/signal": "not a Stellar repo (Uniswap v4 / Somnia)",
	"rizwanmoulvi/agent-got-card-x402": "hackathon demo, 4 KB README",
	"sampath-04/hivepayai": "hackathon demo, testnet only",
	"sandman-sh/credence": "hackathon demo, testnet only",
	"shadow-ash/payloop": "testnet contract only; no registry",
	"shreshtthh/agentguard": "hackathon demo, no registry",
	"shreshtthh/zk-seep": "hackathon ZK game, testnet only",
	"simplex-t/sunvasi": "no README, no tags",
	"simplytokenized/soroban-smart-contracts":
		"only third-party (Reflector) contract IDs",
	"siriuslattice/stellarmcp": "npm package lacks repository field (see D)",
	"smart-treasury-account-sta/dapp": "testnet dApp, no registry",
	"socket-fi/socketfi-app": "stub README; package.json repo \u2192 404 path",
	"socket-fi/socketfi-website": "stub README, no registry",
	"softalpha0/agent-bazaar": "hackathon demo; npm name unpublished",
	"spinachfi/spinach": "1.7 KB README, no registry",
	"stellar-light/stellar-pay": "self-curation is an owner call (fact in D)",
	"stellarcarbon/hackmeridian": "210-byte hackathon stub",
	"stellarzerolab/neurochain-dsl-stellar":
		"crate not on crates.io; hackathon package",
	"tasfia-17/stellar-mcp": "package.json name not on npm; hackathon",
	"thewoodfish/agentcompute": "npm entry lacks repository field; testnet",
	"theyuvan/zk-throne": "hackathon ZK game, testnet only",
	"tkcollective/x402-research-skill":
		"PyPI package links to a 404 sibling (see D)",
	"toanbm/stellar-trader": "hackathon demo, testnet; npm name unpublished",
	"ts-mfon/stellar-agent-api-bazaar": "hackathon demo, testnet only",
	"uzochukwuv/eleventts-stellar-mcp": "hackathon MCP demo, private package",
	"velikanghost/heekowave": "hackathon demo, no registry",
	"wuododhis/agentic_stellar": "hackathon-style app, no registry",
	"yonkoo11/beacon": "hackathon demo, no registry",
	"zhekinmaksim/orbitsafe": "hackathon demo, testnet by design",
};
for (const [key, why] of Object.entries(POOL_TRIAGE_2026_09_02)) {
	REPO_KNOWLEDGE_NOTES[key] ??= [];
	REPO_KNOWLEDGE_NOTES[key].push({
		note: `Pool triage 2026-09-02: ${why}. Examined for a durable, source-citable fact and none was found — judged, not unexamined. Re-examine if the repo gains a registry package or a mainnet deployment.`,
		source: "curated",
		asOf: "2026-09-02",
		visibility: "internal",
	});
}
for (const [key, why] of Object.entries(BAND_50_59_TRIAGE_2026_09_02)) {
	REPO_KNOWLEDGE_NOTES[key] ??= [];
	REPO_KNOWLEDGE_NOTES[key].push({
		note: `Band 50–59 triage 2026-09-02: ${why}. Examined for a durable, source-citable fact and none was found — judged, not unexamined. Re-examine if the repo gains a registry package or a mainnet deployment.`,
		source: "curated",
		asOf: "2026-09-02",
		visibility: "internal",
	});
}
for (const [key, why] of Object.entries(BAND_40_49_TRIAGE_2026_09_02)) {
	REPO_KNOWLEDGE_NOTES[key] ??= [];
	REPO_KNOWLEDGE_NOTES[key].push({
		note: `Band 40–49 triage 2026-09-02: ${why}. Examined for a durable, source-citable fact and none was found — judged, not unexamined. Re-examine if the repo gains a registry package or a mainnet deployment.`,
		source: "curated",
		asOf: "2026-09-02",
		visibility: "internal",
	});
}

/**
 * Batch-10 triage verdicts (2026-09-05): the 15 of the 62 never-examined pool
 * rows that yielded nothing durable, each with the reason — INTERNAL, never
 * served, counted by the board as "judged" rather than "unexamined".
 */
const BATCH_10_TRIAGE_2026_09_05: Record<string, string> = {
	"acta-team/brazil-regional-kit":
		"README's 'seven publishable packages' are not on npm (packages/ holds anchors + kit workspaces; @acta-team/ramp-core unpublished); testnet only; no tags",
	"chidubemkingsley/proofescrow":
		"hackathon demo ('Built for the Hackathon', unnamed) — Trustless Work escrow on Stellar testnet; no registry, no tags",
	"edgadafi/dispersor-nomina-alebrije":
		"testnet MVP (Spanish README; hackathon not named); no registry, no tags",
	"joseluismirro/settler": "no README; no tags",
	"websoroban/backend-ide": "empty repo (no README, no language detected)",
	"rodolfonv/proyecto-rbj":
		"672-byte README ('plataforma de préstamos descentralizada en Stellar'); no registry, no tags",
	"shadowfirmware/safelytics":
		"2 KB README, 'testnet en desarrollo'; no registry, no tags",
	"diegoveme/macetero":
		"Prisma/PostgreSQL backend; 0 Stellar mentions in README",
	"inferara/inference-language-spec":
		"language specification; 0 Stellar/Soroban mentions in README",
	"blockdaemon/solana-cluster": "not a Stellar repo (Solana cluster manager)",
	"dfns/terraform-provider-tunnel":
		"not a Stellar repo (Terraform tunnel provider)",
	"stallionsassemble/stallion-contract":
		"bounty contract with no network stated; no registry, no tags (BSL-1.0)",
	"official-jumpa/jumpa-web-app":
		"multi-chain wallet web app (Stellar, Base, Solana); no registry, no tags",
	"sam-rytech/automata-v2":
		"cross-chain agent app, Stellar one of several chains; README 'Version 2.0.0' has no tag or registry behind it",
	"orbitkit-fun/stellar-agent-kit":
		"README-claimed npm packages (stellar-agent-kit 1.0.6, x402-stellar-sdk 1.0.5, create-stellar-devkit-app 1.1.5, stellar-devkit-mcp 1.0.6; all 2026-03-15) list repository codewmilan/stellar-agent-kit, which returns 404 — no link back (see D)",
};
for (const [key, why] of Object.entries(BATCH_10_TRIAGE_2026_09_05)) {
	REPO_KNOWLEDGE_NOTES[key] ??= [];
	REPO_KNOWLEDGE_NOTES[key].push({
		note: `Batch-10 triage 2026-09-05: ${why}. Examined for a durable, source-citable fact and none was found — judged, not unexamined. Re-examine if the repo gains a registry package or a mainnet deployment.`,
		source: "curated",
		asOf: "2026-09-05",
		visibility: "internal",
	});
}

export interface AuditRecord {
	projectSlug: string | null;
	auditor: string | null;
	publishedAt: string | null;
}

/**
 * Build the notes array for one repo: curated entries for its fullName plus
 * one derived audit note when its owning project has reports in the registry.
 * Deterministic and complete — enrich writes the RESULT wholesale each pass.
 */
export interface RepoSignals {
	lastCommitAt?: string | null;
	codeInUse?: {
		contracts?: number | null;
		events?: number | null;
		eventsDelta?: number | null;
		subinvocations?: number | null;
		subinvocationsDelta?: number | null;
		asOf?: string | null;
	} | null;
}

/**
 * A curated note DIRECTLY answers a question when the query carries a
 * specific identifier — a camelCase / snake_case / dotted single token of
 * ≥8 chars, the shape of a constant or symbol name — that appears verbatim
 * (canon-squashed) in the note text. Deliberately TIGHT: generic prose
 * questions never match, so a note can only outrank a DeepWiki walkthrough
 * when it names the exact thing asked about (sls-080: a dated, source-cited
 * fact beats an undated third-party index that contradicts the scanned ref).
 * Public notes only — internal curation memos never become answers.
 */
export function findDirectAnswerNote(
	q: string,
	notes: KnowledgeNote[],
): KnowledgeNote | null {
	// Audit hardening (2026-09-01, three reproduced hijacks): (1) citation
	// URLs inside notes were matchable, so any question quoting github.com/
	// npmjs.com led whichever note first cited one — URLs are stripped before
	// anything matches; (2) bare registrable domains pass the dotted-token
	// shape but are not identifiers — dropped; (3) canon-squashing the whole
	// note let "internal_ingest" infix-match "internal/ingest/main.go" —
	// matching is now EXACT equality between identifier token sets extracted
	// from both sides with the same regex, never substring containment.
	const canon = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
	const IDENT_RE = /[A-Za-z][A-Za-z0-9_.]*[A-Za-z0-9]/g;
	const isIdentShape = (w: string) =>
		/[a-z][A-Z]/.test(w) || /_/.test(w) || /^[a-z]+\.[a-z]+/i.test(w);
	const isBareDomain = (w: string) =>
		/^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*\.[a-z]{2,}$/i.test(w) &&
		!/[A-Z].*[a-z]|[a-z].*[A-Z]/.test(w.replace(/\..*$/, "")) &&
		!w.includes("_");
	const identsOf = (text: string) =>
		new Set(
			(text.match(IDENT_RE) ?? [])
				.filter((w) => isIdentShape(w) && !isBareDomain(w))
				.map(canon)
				.filter((w) => w.length >= 8),
		);
	const qIdents = identsOf(q);
	if (qIdents.size) {
		for (const n of notes) {
			if (n.visibility === "internal") continue;
			const nIdents = identsOf(n.note.replace(/https?:\/\/\S+/g, " "));
			for (const t of qIdents) if (nIdents.has(t)) return n;
		}
	}
	// Trigger-phrase path (sls-080 round 2): the upstream probe asks the
	// question in plain English — "which Horizon ingestion constant pins the
	// highest supported protocol version" — which carries no identifier, so
	// the path above can never serve the note and DeepWiki's stale value wins.
	// Triggers are curated IN THIS FILE, never derived from input, and match
	// on whole-word sets (the infix trap stays dead: every trigger word must
	// appear as its own word in the question).
	const qWords = new Set(
		q
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter(Boolean),
	);
	for (const n of notes) {
		if (n.visibility === "internal") continue;
		if ((n.triggers ?? []).some((t) => triggerFires(t, qWords))) return n;
	}
	return null;
}

/** Every word of the trigger appears as its own word in the question (≥2). */
function triggerFires(trigger: string, qWords: Set<string>): boolean {
	const words = trigger.toLowerCase().split(/\s+/).filter(Boolean);
	return words.length >= 2 && words.every((w) => qWords.has(w));
}

/**
 * Route a plain-English question to the ONE repo whose curated trigger
 * phrases fire on it — before the lexical index gets a vote. On 2026-09-01
 * "soroban cli renamed" routed to tupui/soroban-cli-python by name while the
 * rename fact lived on stellar/stellar-cli's note, so the trigger path inside
 * findDirectAnswerNote never ran. Exactly one repo or nothing: an ambiguous
 * trigger is a curation defect, not a routing decision, and falls through.
 */
export function findRepoByTrigger(q: string): string | null {
	const qWords = new Set(
		q
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter(Boolean),
	);
	const hits = new Set<string>();
	for (const [repo, notes] of Object.entries(REPO_KNOWLEDGE_NOTES)) {
		for (const n of notes) {
			if (n.visibility === "internal") continue;
			if ((n.triggers ?? []).some((t) => triggerFires(t, qWords))) {
				hits.add(repo);
			}
		}
	}
	return hits.size === 1 ? [...hits][0] : null;
}

/**
 * The curated notes for a repo, whatever case either side is written in.
 *
 * The registry was read as `REPO_KNOWLEDGE_NOTES[fullName.toLowerCase()]`,
 * which finds an entry only when the KEY is lowercase. Ten entries are written
 * in GitHub's own casing (Sorosan/sorosan-client, Epta-Node/ai-net, …) and
 * were therefore never returned: the backfill built an empty note list,
 * compared it to the row's empty list, called the row "unchanged", and the
 * board went on listing those repos as un-noted. Indexed once, case-folded, so
 * neither side's capitalisation can hide a fact again.
 */
const NOTES_BY_LOWER_KEY: Map<string, KnowledgeNote[]> = new Map(
	Object.entries(REPO_KNOWLEDGE_NOTES).map(([k, v]) => [k.toLowerCase(), v]),
);

export function curatedNotesFor(fullName: string): KnowledgeNote[] | undefined {
	return NOTES_BY_LOWER_KEY.get(fullName.toLowerCase());
}

export function buildKnowledgeNotes(
	fullName: string,
	projectSlug: string | null,
	auditsByProject: Map<string, AuditRecord[]>,
	signals?: RepoSignals,
): KnowledgeNote[] {
	const notes: KnowledgeNote[] = [...(curatedNotesFor(fullName) ?? [])];
	const audits = projectSlug ? (auditsByProject.get(projectSlug) ?? []) : [];
	if (audits.length) {
		const dated = audits
			.filter((a) => a.publishedAt)
			.sort((a, b) =>
				String(b.publishedAt).localeCompare(String(a.publishedAt)),
			);
		const latest = dated[0] ?? audits[0];
		const latestBit = latest?.auditor
			? ` (latest: ${latest.auditor}${latest.publishedAt ? `, ${String(latest.publishedAt).slice(0, 10)}` : ""})`
			: "";
		// Audit-drift context (code-truth): "audited" and "audited N days +
		// commits ago" are different claims — say both, day-granular, only when
		// both dates exist.
		let driftBit = "";
		const latestDay = latest?.publishedAt
			? String(latest.publishedAt).slice(0, 10)
			: null;
		if (latestDay) {
			const driftDays = Math.max(
				0,
				Math.floor(
					(Date.now() - Date.parse(`${latestDay}T00:00:00Z`)) / 86_400_000,
				),
			);
			const commitDay = signals?.lastCommitAt
				? String(signals.lastCommitAt).slice(0, 10)
				: null;
			const changedBit =
				commitDay !== null
					? commitDay > latestDay
						? "; the repo has committed since"
						: "; no commits since"
					: "";
			driftBit = ` Latest report is ${driftDays} day${driftDays === 1 ? "" : "s"} old${changedBit}.`;
		}
		notes.push({
			note: `${audits.length} security audit report${audits.length === 1 ? "" : "s"} on record for the owning project${latestBit} — full reports via /api/audits?q=${encodeURIComponent(projectSlug ?? "")}.${driftBit}`,
			source: "derived:audit",
			asOf: new Date().toISOString().slice(0, 10),
		});
	}
	// Live-usage fact (code-truth): the repo's attributed mainnet contract(s)
	// show real activity per stellar.expert — static depth plus live usage.
	const use = signals?.codeInUse;
	if (use?.asOf && typeof use.contracts === "number" && use.contracts > 0) {
		const ev = typeof use.events === "number" ? use.events : null;
		const evDelta =
			typeof use.eventsDelta === "number" ? use.eventsDelta : null;
		const fmt = (n: number) => n.toLocaleString("en-US");
		notes.push({
			note: `Live on mainnet: ${use.contracts} attributed contract${use.contracts === 1 ? "" : "s"}${ev !== null ? `, ${fmt(ev)} lifetime events${evDelta !== null ? ` (${evDelta >= 0 ? "+" : ""}${fmt(evDelta)} since the prior weekly snapshot)` : ""}` : ""} per stellar.expert.`,
			source: "derived:usage",
			asOf: String(use.asOf).slice(0, 10),
		});
	}
	return notes;
}
