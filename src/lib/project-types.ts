/**
 * The project `types` vocabulary, in ONE place.
 *
 * Consolidated 2026-09-09 while closing the enum-drift class (stellar-raven
 * sls-082 / sls-084): the list was hand-copied into the Payload collection,
 * two route validators and two OpenAPI enums. The five copies agreed on the
 * day this was written — but five copies is exactly how the other findings
 * happened, so the collection, both validators and both spec enums now spread
 * this array and `spec-enum-parity.test.ts` pins them to it. Provenance notes
 * for the newer values travelled here from the collection.
 */
export const PROJECT_TYPES = [
	"Wallet",
	"DEX",
	"Lending",
	"Bridge",
	"Infrastructure",
	"Payments",
	"Anchor",
	"SDK",
	"Indexer",
	"Explorer",
	"Analytics",
	"AI",
	"Gaming",
	"Education",
	"Security",
	"NFT",
	"RWA",
	"Stablecoin",
	"Social Impact",
	"RPC",
	"Faucet",
	// Raven #39 (2026-08-21): card-program infrastructure a builder can
	// integrate to issue cards to users (Bridge, Rain, Wirex). Distinct from
	// a consumer app that merely HAS a card. The playbook's own category.
	"Card Issuing",
	// Centralized exchanges that list XLM (Playbook CEX directory); imported
	// only with a live CoinGecko XLM market as evidence (2026-08-21).
	"Exchange",
	// Price/data oracle providers on Stellar/Soroban. The vertical had
	// NO enum member at all — reflector, dia, band, redstone-finance,
	// lightecho, pyth every one carried types:[] and the whole category
	// was invisible to type browse (truth-battery guard D, 2026-08-27).
	"Oracle",
	// Yield/asset-management products: vaults, strategy allocators,
	// structured yield (defindex, arka-fund, cushion, meria, backyard,
	// normal-finance…). The P4 untyped census (2026-08-31) found the
	// vertical had no enum member — five rows stayed honestly untyped
	// rather than be force-fitted into Lending, the same class gap as
	// Oracle/Card Issuing before it.
	"Yield",
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

/**
 * What each type means, in one line a reader (or a typed-decision model) can
 * apply to a project description. Keyed by the vocabulary itself, so a new
 * PROJECT_TYPES member without a definition does not compile.
 */
export const TYPE_DEFINITIONS: Record<ProjectType, string> = {
	Wallet:
		"Holds users' keys or accounts and lets them send, receive or hold assets.",
	DEX: "A decentralized exchange or AMM where assets are swapped on-chain.",
	Lending:
		"A lending or borrowing protocol: loans, credit lines or collateralized borrowing.",
	Bridge: "Moves assets or messages between Stellar and other chains.",
	Infrastructure:
		"Infrastructure other products build on: nodes, APIs, developer platforms or network services.",
	Payments:
		"Moves money for people or businesses: transfers, remittances, payroll or merchant payments.",
	Anchor:
		"A Stellar anchor: an on- and off-ramp that issues or redeems assets against fiat.",
	SDK: "A software development kit or library that developers import into their code.",
	Indexer: "Indexes chain data into a queryable form for other software.",
	Explorer:
		"A block or ledger explorer for browsing transactions, accounts and assets.",
	Analytics: "Dashboards or data analysis about the network, assets or users.",
	AI: "The product is built around AI or machine learning.",
	Gaming: "A game or a gaming platform.",
	Education:
		"Teaches people about Stellar, crypto or development: courses, tutorials or learning content.",
	Security:
		"Security services or tooling: audits, monitoring, key protection or fraud prevention.",
	NFT: "Creates, trades or uses NFTs and other digital collectibles.",
	RWA: "Tokenizes real-world assets such as real estate, credit, commodities or securities.",
	Stablecoin:
		"Issues, or is, a token pegged to a fiat currency or another asset.",
	"Social Impact":
		"Aimed at humanitarian, financial-inclusion or public-good outcomes.",
	RPC: "Provides RPC or Horizon API endpoints for submitting to and querying the network.",
	Faucet: "Gives out test tokens on a test network.",
	"Card Issuing":
		"Infrastructure a builder integrates to issue payment cards to its users, not a consumer app that merely has a card.",
	Exchange: "A centralized exchange that lists XLM or other Stellar assets.",
	Oracle: "Provides price or data feeds that contracts read.",
	Yield:
		"Vaults, strategies or structured products that earn yield on deposited assets.",
};
