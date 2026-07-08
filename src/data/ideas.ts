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

export const QUARTERS = ["q1-2026", "q2-2026"] as const;
export type Quarter = (typeof QUARTERS)[number];
export const QUARTER_LABELS: Record<Quarter, string> = {
	"q1-2026": "Q1 2026",
	"q2-2026": "Q2 2026",
};

/**
 * The currently-fundable quarter — RFPs in this quarter are "open" for
 * builders to claim, with winners eligible for SCF grant funding. Prior
 * quarters are closed (already funded or moved on). Bump this when a
 * new SCF round opens.
 */
export const ACTIVE_QUARTER: Quarter = "q2-2026";

/** Status of an RFP relative to ACTIVE_QUARTER. */
export type RfpStatus = "open" | "closed";

export function rfpStatus(quarter: Quarter): RfpStatus {
	return quarter === ACTIVE_QUARTER ? "open" : "closed";
}

export interface Idea {
	id: string;
	title: string;
	description: string;
	technicalRequirements: string | null;
	category: Category;
	authorName: string;
	quarter: Quarter;
}

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
	},
	{
		id: "account-demolisher",
		title: "Account Demolisher",
		description:
			"Abandoning a Stellar account requires manually removing all trustlines, offers, and data entries before merging the account — a tedious multi-step process with no tooling support. This creates UX debt for end-users and wallet developers alike.",
		technicalRequirements:
			'Automated Cleanup: Detect and batch-remove all open offers, trustlines, and account data in the minimum number of transactions.\n\nSafe Merge: Final account merge to a user-specified destination address.\n\nWallet SDK: Expose as a callable SDK function so wallets can offer "close account" flows natively.',
		category: "consumer-dapps",
		authorName: "Jake",
		quarter: "q2-2026",
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
	},
];
