export const CATEGORIES = [
	"ai",
	"consumer-dapps",
	"defi",
	"developer-tooling",
	"gaming",
	"infrastructure",
	"nfts",
	"payments",
	"scf",
	"web3-social",
] as const;

export const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
	ai: "AI",
	"consumer-dapps": "Consumer dApps",
	defi: "DeFi",
	"developer-tooling": "Developer Tooling",
	gaming: "Gaming",
	infrastructure: "Infrastructure",
	nfts: "NFTs",
	payments: "Payments",
	scf: "SCF",
	"web3-social": "Web3 Social",
};

export type Category = (typeof CATEGORIES)[number];

export const QUARTERS = ["q1-2026", "q2-2026", "q3-2026", "q4-2026"] as const;
export type Quarter = (typeof QUARTERS)[number];
export const QUARTER_LABELS: Record<Quarter, string> = {
	"q1-2026": "Q1 2026",
	"q2-2026": "Q2 2026",
	"q3-2026": "Q3 2026",
	"q4-2026": "Q4 2026",
};

/**
 * The currently-fundable quarter: RFPs in this quarter are "open" for
 * builders to claim, with winners eligible for SCF grant funding. Prior
 * quarters are closed (already funded or moved on). It is the quarter
 * BRIEF_ROSTER's page names; a brief stays open here until this moves, so
 * recheck that page, and bump BRIEF_ROSTER.checkedOn, when it changes.
 */
export const ACTIVE_QUARTER: Quarter = "q4-2026";

/** The official page the open briefs were last checked against, and the
 * day. SCF's RFP Track page lists the briefs open now under "Current Open
 * RFPs"; on 2026-11-12 it listed the two Q4 2026 briefs, published there on
 * 2026-11-11 (handbook commit 4cc1fae3). /api/rfps serves this as
 * meta.briefRoster. */
export const BRIEF_ROSTER = {
	source:
		"https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/rfp-track",
	checkedOn: "2026-11-12",
} as const;

/** Status of an RFP relative to ACTIVE_QUARTER. */
export type RfpStatus = "open" | "closed";

export function rfpStatus(quarter: Quarter): RfpStatus {
	return quarter === ACTIVE_QUARTER ? "open" : "closed";
}

/** The brief SCF published for an idea it took up as an RFP: its title on
 * the RFP Track page, a commit-pinned copy of that page that carries it (the
 * live page drops a quarter's briefs when the next quarter's arrive), and
 * the day that copy was read. */
export interface PublishedBrief {
	title: string;
	url: string;
	checkedOn: string;
	/** The brief's functional requirements, restated short, in its order.
	 * Absent: not restated here; the brief at url has them. */
	functionalRequirements?: string[];
	/** What the brief rules out of scope, restated short. Absent: not
	 * restated here. */
	outOfScope?: string[];
}

export interface Idea {
	id: string;
	title: string;
	description: string;
	/** The idea's own summary of what to build, as /ideas shows it. Not the
	 * published brief: some were written before SCF published one, and can
	 * differ from it (publishedBrief). */
	technicalRequirements: string | null;
	category: Category;
	authorName: string;
	quarter: Quarter;
	/** Absent: no published brief is linked. None was found in the RFP Track
	 * page's history (checked 2026-11-04), which is not a claim SCF
	 * published none. */
	publishedBrief?: PublishedBrief;
}

// Commit-pinned copies of SCF's RFP Track page: for a closed quarter, the last
// version that carried its briefs (read 2026-11-04); for the open quarter, the
// version that published them (read 2026-11-12).
const RFP_TRACK = (commit: string) =>
	`https://github.com/stellar/scf-handbook/blob/${commit}/scf-awards/build-award/rfp-track.md`;
/** 2026-04-17: the six Q1 2026 briefs. */
const Q1_BRIEFS = RFP_TRACK("be0c693d89a0990d9fabebc61fd2894d23ec55e2");
/** 2026-07-23: the five Q2 2026 briefs. */
const Q2_BRIEFS = RFP_TRACK("1e04b79973358e3dea58d821ed6419b50c93370c");
/** 2026-07-29: the two Q3 2026 briefs. */
const Q3_BRIEFS = RFP_TRACK("7abdddd09fe05c6de47de300a5cde73caa61cb02");
/** 2026-11-11: the two Q4 2026 briefs ("GITBOOK-247: q4 RFPs"). */
const Q4_BRIEFS = RFP_TRACK("4cc1fae33d46618cf9193d1467e670fe7a48550a");
const brief = (
	url: string,
	title: string,
	checkedOn = "2026-11-04",
): PublishedBrief => ({
	title,
	url,
	checkedOn,
});

export const IDEAS: Idea[] = [
	{
		id: "prices-api",
		title: "Prices API & Indexing Service",
		description:
			"The Stellar ecosystem lacks a single, reliable, and standardized API to source aggregated, real-time, and historical price data for all Stellar assets (Classic and SEP-41 Soroban tokens). This fragmentation hinders the development of accurate DeFi protocols, portfolio tracking tools, and general-purpose applications, significantly increasing integration complexity for builders.",
		technicalRequirements:
			"Asset Coverage: Full support for all current native Stellar assets and SEP-41 Soroban contract tokens.\n\nPrice Aggregation: Algorithm to calculate weighted average prices across major on-chain (Soroswap, Aquarius, SDEX, Blend) and off-chain markets.\n\nVolume Weighting (VWAP): Inclusion of a configurable USD-denominated trading volume threshold for market inclusion to filter out illiquid pairs.\n\nData Endpoints: Delivery of real-time price endpoints and historical price endpoints for intervals including 24h, 7d, 30d, and 1yr.\n\nPerformance: High availability, low-latency architecture capable of handling high query volumes.",
		category: "infrastructure",
		authorName: "Jake",
		quarter: "q1-2026",
		publishedBrief: brief(Q1_BRIEFS, "Prices API"),
	},
	{
		id: "defi-positions-api",
		title: "DeFi Positions API",
		description:
			"As the Stellar DeFi sector matures with protocols like Blend and Aquarius, users and developers face significant complexity in tracking aggregated positions. There is currently no unified way to view deposits, borrowings, and yield across disparate protocols, leading to a fragmented user experience.",
		technicalRequirements:
			"Protocol Support: Initial integration with top-tier DeFi protocols by TVL (e.g., Blend, Aquarius, FxDAO).\n\nProtocol Semantics: Integration of protocol-specific logic, such as Blend's backstop pools or varied collateral/interest models.\n\nPosition Data Points: API must return deposited and borrowed amounts, current interest rates / APY (for both deposits and loans), total yield earned and full position history.\n\nUser Input: Support for both Stellar G-addresses and Soroban C-addresses.",
		category: "defi",
		authorName: "Jake",
		quarter: "q1-2026",
		publishedBrief: brief(Q1_BRIEFS, "DeFi Positions API"),
	},
	{
		id: "c-address-tooling",
		title: "C-Address Tooling & Onboarding",
		description:
			"The shift to C-addresses (Soroban smart accounts) faces two major adoption blockers: the friction of needing a G-address to fund a C-address, and a lack of modern mobile SDKs for the Smart Account standard.",
		technicalRequirements:
			"G-to-C Seamless Bridge: A protocol or service enabling direct funding of C-addresses via G-addresses, CEX withdrawals, or fiat-to-crypto proxy services.\n\nTransparent UX: The funding mechanism should aim to make the G-address requirement transparent or unnecessary for the end-user.\n\nStakeholder Integration: Must consider the specific integration needs of existing Stellar wallets.",
		category: "infrastructure",
		authorName: "Tyler",
		quarter: "q1-2026",
		publishedBrief: brief(Q1_BRIEFS, "C-Address Tooling & Onboarding"),
	},
	{
		id: "soroban-block-explorer",
		title: "Soroban-First Block Explorer",
		description:
			"Most existing Stellar explorers prioritize classic assets. The lack of deep, legible support for Soroban transactions prevents developers and users from consistently verifying contract interactions, hindering the growth of DeFi and collectibles.",
		technicalRequirements:
			"SEP-41 Indexing: Development of high-quality, open-source libraries (React Native, Swift, Kotlin) implementing the OZ smart account standard.\n\nHuman-Readable Transactions: UI must translate complex contract interactions into clear, legible actions rather than raw hex data.\n\nEvent Handling: Full support for CAP-67 events and SEP-41 transaction handling.",
		category: "infrastructure",
		authorName: "Keeks",
		quarter: "q1-2026",
		publishedBrief: brief(Q1_BRIEFS, "Soroban-first Block Explorer"),
	},
	{
		id: "concentrated-liquidity-amm",
		title: "Advanced AMM Framework (Concentrated Liquidity)",
		description:
			"Current Stellar AMMs primarily use constant-product models. This uniform liquidity distribution leads to inefficient capital usage. The ecosystem needs a standardized framework for concentrated liquidity to enable tighter spreads and more expressive market structures.",
		technicalRequirements:
			'Concentrated Liquidity: Smart contract implementation allowing LPs to provide liquidity within specific price ranges.\n\nPosition Management: Support for position-based liquidity and robust LP accounting.\n\nEfficiency: High-performance swap execution and automated fee calculations.\n\nExtensibility: Modular architecture to support future "hooks," custom fee models, or specialized pool logic.',
		category: "defi",
		authorName: "Ishan",
		quarter: "q1-2026",
	},
	{
		id: "soroban-vrf",
		title: "Soroban Verifiable Random Function (VRF)",
		description:
			"Soroban contracts are deterministic and lack native secure randomness. Without a VRF, on-chain games and NFT mints rely on exploitable entropy (like block timestamps), compromising security and trust.",
		technicalRequirements:
			"Cryptographic Verification: Generation of off-chain randomness with proofs (e.g., ECVRF) that can be verified on-chain at low cost.\n\nTamper Resistance: Absolute guarantee that neither node operators nor users can predict the outcome before finalization.",
		category: "infrastructure",
		authorName: "Raph",
		quarter: "q1-2026",
	},
	{
		id: "reverse-engineering-tool",
		title: "Specialized Reverse Engineering Tool",
		description:
			"Soroban contracts are WASM files with specific internal logic. Existing decompilers produce generic code that is difficult for researchers to audit for security or optimization.",
		technicalRequirements:
			"Internal Context: The tool must incorporate specific Soroban internal knowledge to produce a more accurate WAT/C-close representation.\n\nAccuracy Benchmark: Aim for 90% accuracy in the reconstruction of decompiled WASM contracts to ensure they are human-understandable.",
		category: "developer-tooling",
		authorName: "Matej",
		quarter: "q1-2026",
		publishedBrief: brief(
			Q1_BRIEFS,
			"Soroban Specialized Reverse Engineering Tool",
		),
	},
	{
		id: "ai-webide",
		title: "AI-Focused WebIDE",
		description:
			"Current WebIDEs are either unmaintained or lack integrated AI. Developers currently face high costs for AI tools and a lack of environment-aware assistants that can guide them through the specific nuances of Stellar/Soroban.",
		technicalRequirements:
			'AI-First Design: Integrated AI to share code, troubleshoot, and generate Soroban-specific logic within the browser.\n\nAnalytics Driven: System should learn from user interactions to continuously improve Stellar documentation and AI suggestions.\n\nAccount Sponsoring: Mechanism to cover developer costs via "rail-guarded" sponsorship for Stellar-focused projects.',
		category: "developer-tooling",
		authorName: "Raph",
		quarter: "q1-2026",
	},
	{
		id: "hummingbot-integration",
		title: "Hummingbot Integration (Trading Engine)",
		description:
			"The deprecation of Kelp has left a liquidity gap. Stellar needs a bridge to the Hummingbot framework to enable automated market-making and arbitrage between Stellar and other global exchanges.",
		technicalRequirements:
			"Orderbook Support: Implementation of a Stellar orderbook connector for the official Hummingbot repository.\n\nLiquidity Provision: Enable standard market-making and arbitrage strategies.\n\nFuture Scope: (Optional) Expand to support Stellar AMMs and intra-Soroban AMM arbitrage.",
		category: "defi",
		authorName: "Rahim",
		quarter: "q1-2026",
		publishedBrief: brief(
			Q1_BRIEFS,
			"Hummingbot integration (open source trading engine)",
		),
	},
	{
		id: "trustline-onboarder",
		title: "Trustline Onboarder",
		description:
			"New users on Stellar must manually add trustlines before they can receive non-native assets, creating a significant friction point. There is no standardized, user-friendly flow to guide someone from receiving a payment link to holding an asset for the first time.",
		technicalRequirements:
			"One-Click Trustline: A widget or SDK that allows any app to embed a frictionless trustline creation flow.\n\nSponsorship Support: Integration with Stellar's fee and reserve sponsorship mechanisms so users can onboard without holding XLM.\n\nMulti-Asset: Support for batching multiple trustline additions in a single transaction.",
		category: "payments",
		authorName: "Tyler",
		quarter: "q2-2026",
		publishedBrief: brief(Q2_BRIEFS, "Trustline onboarder"),
	},
	{
		id: "passkey-ui-kit",
		title: "Passkey UI Kit",
		description:
			"Soroban's smart account standard supports passkey-based signing, but there is no polished, reusable UI component library for wallets and dApps to integrate this experience. Teams are reinventing the same flows with inconsistent UX.",
		technicalRequirements:
			"Component Library: Pre-built React (and optionally React Native) components for passkey registration, authentication, and transaction signing.\n\nStandards Compliant: Must implement the OZ smart account standard and WebAuthn spec.\n\nCustomizable: Headless variants for teams that need full visual control.",
		category: "developer-tooling",
		authorName: "Keeks",
		quarter: "q2-2026",
		publishedBrief: brief(Q2_BRIEFS, "Passkey UI"),
	},
	{
		id: "account-demolisher",
		title: "Account Demolisher",
		description:
			"Abandoning a Stellar account requires manually removing all trustlines, offers, and data entries before merging the account; a tedious multi-step process with no tooling support. This creates UX debt for end-users and wallet developers alike.",
		technicalRequirements:
			'Automated Cleanup: Detect and batch-remove all open offers, trustlines, and account data in the minimum number of transactions.\n\nSafe Merge: Final account merge to a user-specified destination address.\n\nWallet SDK: Expose as a callable SDK function so wallets can offer "close account" flows natively.',
		category: "consumer-dapps",
		authorName: "Jake",
		quarter: "q2-2026",
		publishedBrief: brief(Q2_BRIEFS, "Account Demolisher"),
	},
	{
		id: "contract-source-verification",
		title: "Contract Source Verification Service",
		description:
			"Soroban contracts are deployed as opaque WASM blobs. Without a source verification registry, users and auditors cannot confirm that the deployed bytecode matches any published source code, undermining trust in the ecosystem.",
		technicalRequirements:
			"Deterministic Build: Reproducible WASM compilation pipeline (e.g., via Docker) so source-to-bytecode matching is verifiable.\n\nRegistry API: Public API and UI to submit, verify, and query contract source code by contract ID.\n\nExplorer Integration: Hook into the Soroban-First Block Explorer (Q1 RFP) to surface verification badges.",
		category: "infrastructure",
		authorName: "Matej",
		quarter: "q2-2026",
		// The idea above predates the brief: SCF's brief (rewritten 27 May
		// 2026) asks for SEP-58 rebuilds on an SDF-allowlisted image and rules
		// deterministic Rust compilation research out.
		publishedBrief: {
			...brief(Q2_BRIEFS, "Contract Source Verification Service"),
			functionalRequirements: [
				"Accepts source submissions (a tarball or equivalent) tied to a target Wasm hash.",
				"Rebuilds the source with an SDF-allowlisted trusted build image, named by the SEP-58 bldimg field; the proposal states its image allowlist policy.",
				"A free public API answers verification status by contract ID or Wasm hash, with the SEP-58 fields recorded (bldimg, bldopt, source_repo, source_rev, tarball_url, tarball_sha256), the linked source, build metadata, an image trust signal and a timestamp.",
				"One shared result layer that explorers, Lab and wallets query without rebuilding; a design that makes every consumer rebuild, or rests on one hardcoded verifier, does not qualify.",
				"Several verifiers each report against the deployed Wasm hash, and a disagreement shows per verifier, not as one status.",
				"Covers Mainnet and Testnet.",
				"Verifies contracts deployed before launch; retroactive verification of non-upgradable contracts is a priority.",
				"Accepts every SEP-58 source mode: public repo (source_repo and source_rev), hosted tarball (tarball_url and tarball_sha256) and content-addressed (tarball_sha256 alone), with IPFS a first-tier channel beside HTTPS and neither HTTPS nor GitHub hardcoded; responses say which mode applies.",
				"A CLI or developer submission flow, with the API shaped to fit stellar-cli.",
				"Exposes verification metadata that explorers (Stellar Expert, StellarChain, Stellar Lab) and other tools can consume.",
				"Keeps SEP-55 attestations and SEP-58 rebuild verification apart as distinct trust levels.",
				"Aligns the API with the verifier-API SEP once that spec is written.",
			],
			outOfScope: [
				"How each verifier chooses to display results, such as for contracts without public source.",
				"Writing SEP-58 or SEP-55; coordination is expected.",
				"Producing the trusted stellar-cli Docker images, which SDF maintains.",
				"Changes to SDF-owned tools (stellar-cli, Stellar Lab) beyond exposing the APIs they consume.",
				"UI work on any one third-party explorer.",
				"Fully deterministic Rust compilation as a research effort: the brief asks for the best reproducibility available today, anchored on the SDF-allowlisted images.",
			],
		},
	},
	{
		id: "oz-accounts-policy-builder",
		title: "OZ Accounts Policy Builder",
		description:
			"OpenZeppelin-style smart accounts on Soroban support custom signing policies, but configuring them requires writing Rust and understanding low-level contract internals. There is no no-code or low-code interface for teams to define and deploy account policies.",
		technicalRequirements:
			"Visual Policy Editor: UI for composing account policies (multisig thresholds, spending limits, time locks, allowed contracts) without writing code.\n\nCode Export: Generate auditable Rust/Soroban source from the visual policy definition.\n\nDeployment Flow: One-click deploy of the configured account contract to testnet or mainnet.",
		category: "developer-tooling",
		authorName: "Ishan",
		quarter: "q2-2026",
		publishedBrief: brief(Q2_BRIEFS, "OZ accounts policy builder"),
	},
	{
		id: "layerzero-dvn",
		title: "Stellar-compatible LayerZero DVN",
		description:
			"LayerZero V2's Stellar implementation is built on Soroban and in security audits, but only one reference DVN (LzDVN, secp256k1 multisig) verifies its messages. For Stellar to be a credible omnichain destination, with issuers like USDT0, Paxos, BitGo, Solv, and Ethena preparing to launch via LayerZero, applications need a meaningful choice of independent Decentralized Verifier Networks to compose into their X-of-Y-of-N Security Stack. This RFP funds teams ALREADY operating production DVNs on LayerZero V2 to extend their service to Stellar; greenfield DVN proposals are out of scope.",
		technicalRequirements:
			"Hard Prerequisite: A production DVN live on at least one LayerZero V2 mainnet pathway, with attestation history verifiable on LayerZero Scan; the Stellar deployment is an extension of an existing service, not a new entity.\n\nStellar DVN Contract: A Soroban contract conforming to the LayerZero V2 DVN interface and the Stellar implementation's Abstract Account pattern (custom __check_auth; Soroban prohibits reentrancy), submitting attestations to Stellar's ULN302 message library. Testnet first, then an audited mainnet deployment; each team arranges and funds its own audit.\n\nOff-chain Verifier: The team's existing verification service (ZK, TEE, K-of-N, light client, or other) extended to listen to Stellar RPC for PacketSent events and attest in both directions, keeping the security guarantee consistent across pathways.\n\nStellar Constraints: Correct bytes32-to-Stellar address conversion, TTL-aware storage with the hybrid extension strategy, and attestation flows within Soroban's per-transaction limits (200 reads, instruction/memory/write-entry caps).\n\nPathway Coverage: At minimum Stellar to Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, Solana, and BNB Chain.\n\nOperations: 24-month maintenance commitment with at least 2 nodes, public operational telemetry (verifications served, error rate, latency), and listing on LayerZero's official DVN provider directory as a hard deliverable.",
		category: "infrastructure",
		authorName: "SCF Delegates",
		quarter: "q3-2026",
		publishedBrief: brief(Q3_BRIEFS, "Stellar-compatible LayerZero DVN"),
	},
	{
		id: "x402-facilitator-bazaar",
		title: "x402 Facilitator with Bazaar Discovery",
		description:
			"x402 turns HTTP 402 into a machine-native payment flow, and Stellar suits it well: settlement costs about 0.0023 XLM, which is what makes per-request agent micropayments viable. Exact settlement already works (the Apache-2.0 @x402/stellar package and the free Built on Stellar facilitator), but Stellar has no native Bazaar, the discovery layer that lets an agent find, price, and pay for x402-protected services without a pre-existing integration. Today a Stellar-denominated service is only as discoverable as whichever multi-chain facilitator happens to carry it. This RFP funds a production facilitator on both networks plus a Stellar-native Bazaar, with discovery as the highest-value share of the budget.",
		technicalRequirements:
			"Facilitator: verify, settle, and supported on BOTH stellar:testnet and stellar:pubnet, built on @x402/stellar rather than reimplementing settlement. Strict Soroban auth-entry validation (exact call, asset, amount, recipient; no replay; ledger-based expiration), classic keypairs and custom __check_auth accounts, any SEP-41 token with USDC default and correct 7-decimal handling, sponsored network fees advertised via extra.areFeesSponsored, and strictly non-custodial.\n\nBazaar Discovery (the core new capability): GET /discovery/resources with the spec's filters and GET /discovery/search with REAL natural-language ranking; search quality is a graded deliverable. Automatic cataloging from the discovery extension with no separate registration step, HTTP endpoints and MCP tools as first-class resource types, catalog-integrity enforcement against forged listings including routeTemplate validation, and a commitment to track the moving x402 discovery conventions through the grant period.\n\nMCP Server: search and paid-call tools so an agent can discover and pay from inside a runtime, with machine-readable error codes on every rejection.\n\nupto Scheme Upstream: author scheme_upto_stellar.md and its implementation, contributed through the x402 Technical Steering Committee (SDF's Foundation board seat is available to unblock review).\n\nLicense and Conformance: a permissive OSI-approved license with no AGPL in the dependency path (the OpenZeppelin Relayer x402 plugin is AGPL and excluded as a base). Acceptance is wire-level: an unmodified canonical client completing payment end-to-end on both networks, a passing run of the x402 repo's e2e suite, and a published settled transaction hash per network per scheme.\n\nAudit: a third-party review via the Audit Bank covering the settlement path, auth-entry validation, and the discovery trust boundary before the mainnet production tag.",
		category: "payments",
		authorName: "SCF Delegates",
		quarter: "q3-2026",
		publishedBrief: brief(
			Q3_BRIEFS,
			"X402 Facilitator with Bazaar (discovery) support",
		),
	},
	{
		id: "scf-web-api-analytics",
		title: "Web and API Analytics for Stellar Ecosystem Projects",
		description:
			"SCF has no trusted, unified source of end-user usage data for the projects it funds, so reviewers rely on self-reported metrics when weighing follow-on programs such as Growth Hack, the Public Goods Award and Integration Track traction. Ecosystem visibility tools can say which projects claim to build on Stellar, but not which are actually used. This RFP funds a privacy-first, multi-tenant web and API analytics service that SCF runs for Stellar projects at no charge, built on Umami or GoatCounter, hosted and supported by the proposer for 12 months, with stewardship handed to a community-appointed operator between months 6 and 12 at SCF's discretion.",
		technicalRequirements:
			"Web Analytics: privacy-first, GDPR-compliant analytics collected only from frontend code, through a version-pinned tracker script, with bot and inflation mitigation and supply-chain defenses. At minimum: page views, unique visitors, referrers, session duration, bounce rate, country-level geography, and device and browser breakdown.\n\nAPI Analytics: tenants dual-export OpenTelemetry to the SCF collector, which drops traces, spans and deep logs and keeps standardized metrics (service, normalized route, status code, latency) in PostgreSQL. Sized for about 1,000,000 requests a day, with aggregates kept at least 24 months.\n\nMulti-tenancy: self-service enrollment for any project built on Stellar, strict tenant isolation, a global view for SCF operators, revocable API keys for machine consumers, and zero fees.\n\nDashboards: a private view for each project and a global comparison view for SCF operators, for both web and API metrics.\n\nOpen Source: one OSI-licensed monorepo holding all application code, infrastructure-as-code, runbooks, a tenant onboarding guide, tests, and security and privacy documentation.\n\nHosting and Handover: the proposer hosts and supports the service for 12 months after the final development tranche (targets: 99.99% ingestion and 99.90% dashboard availability, critical and high vulnerabilities patched within 24 hours), and hands stewardship to a community-appointed operator between months 6 and 12, at SCF's discretion.\n\nAdoption: at least three SCF-awarded projects instrumented for web analytics and one for API traffic.\n\nEligibility: builders unknown to SCF are not eligible.",
		category: "infrastructure",
		authorName: "SCF Delegates",
		quarter: "q4-2026",
		publishedBrief: brief(
			Q4_BRIEFS,
			"Web and API Analytics for Stellar Ecosystem Projects",
			"2026-11-12",
		),
	},
	{
		id: "xdr-cap-coverage-audit",
		title: "XDR/CAP-Coverage Audit Tool and Indexer-Hardening Guide",
		description:
			"Every application that reads the Stellar ledger decodes XDR, and rare but valid transaction shapes keep crashing those readers because nobody tested them. Wallet-backend ingestion halted on CAP-0040 signed-payload signers, unbounded authorization trees and CAP-0073 trustlines; stellar-etl opened a Protocol 28 epic over about fifty correctness issues; and a decoding fix made in one Stellar SDK is not carried to the others. This RFP funds a shared test kit: a corpus of rare ledger patterns tagged by CAP, a replay harness for indexers, an SDK conformance runner, a linter, and an indexer-hardening guide.",
		technicalRequirements:
			"Corpus and Generator: XDR that stellar-core actually emits, covering the rare patterns each CAP introduced or changed, tagged with CAP and protocol version, reproducible on testnet and mainnet passphrases, each entry with its expected decoded values in a manifest. Entries round-trip through rs-stellar-xdr and agree with stellar-core's --check-lcm goldens.\n\nReplay Harness: feeds the corpus to any indexer through a documented adapter, delivering ledgers through an input existing pipelines already read (such as the Galexie data lake layout or a mock getLedgers endpoint; the proposal says which it supports first), and reports every shape it mishandles or silently drops. The reference adapter reproduces wallet-backend #729, #731 and #716 on pre-fix commits.\n\nSDK Conformance Runner: runs the corpus through at least the JavaScript, Go and Rust SDKs in CI, reports where they diverge from the network and from each other, files sibling issues in each affected SDK, and reproduces js-stellar-sdk #1766, #1785 and #1789 on pre-fix tags.\n\nLinter: for one language and framework, flags trusting unvalidated fields, missing depth and size caps on recursive structures, and deriving participants from the envelope instead of the ledger meta.\n\nIndexer-Hardening Guide: field by field, which transaction fields stellar-core validates and which it passes through, recommended caps, the participants-from-meta rule, and muxed and signed-payload address handling (SEP-0023), ready to publish on developers.stellar.org.\n\nFindings: the corpus run against at least one SDF pipeline (wallet-backend or stellar-etl), with each failure triaged and filed upstream.\n\nNon-functional: runs offline with no mainnet keys or funds, fast enough for CI on every pull request, bounded memory, a permissive open-source license, and a maintenance plan through the first protocol upgrade after delivery.",
		category: "developer-tooling",
		authorName: "SCF Delegates",
		quarter: "q4-2026",
		publishedBrief: brief(
			Q4_BRIEFS,
			"XDR/CAP-Coverage Audit Tool and Indexer-Hardening Guide",
			"2026-11-12",
		),
	},
];
