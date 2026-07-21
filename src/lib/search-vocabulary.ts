/**
 * Canonical search-vocabulary registry (ideas/shared-synonym-registry.md).
 * Three surfaces each maintain synonym expansions — project search, repo
 * search, builders — and every vocabulary lesson ("LatAm→countries",
 * "pool→liquidity") historically had to be hand-copied between them; the
 * next retrieval miss is always a term fixed in one map and absent in
 * another (project search lacked stopwords repo search had for weeks).
 *
 * Two layers:
 *  - CORE_SYNONYMS — expansions every content surface owes. Each surface's
 *    exported SYNONYMS is mergeVocabulary(core, overlay), so a lesson added
 *    here reaches project search AND repo search in one edit (builders
 *    merges the subset of core keys it owns — builder queries are
 *    skill-shaped, so it doesn't take chains/regions).
 *  - Per-surface overlays — deliberately divergent vocabulary stays with
 *    its surface ("wallet" implies custody vocabulary on projects but
 *    keypair/passkey vocabulary on repos; "sdk"→"client" is safe under repo
 *    search's word-boundary matcher but too loose for project substring
 *    matching). An overlay entry EXTENDS the core entry, never replaces it.
 *
 * KEY coverage (which nouns must exist per surface) is pinned by
 * CORE_VERTICALS / BUILDER_CORE_VERTICALS; VALUE coverage (core expansions
 * actually reaching each surface) is pinned by
 * src/lib/__tests__/search-vocabulary.test.ts. Keep this module
 * import-free: repo-search and project-search-match both import it, and it
 * must never point back at either.
 */

/** Vertical nouns BOTH project search and repo search must expand. */
export const CORE_VERTICALS = [
	"amm",
	"bridge",
	"dex",
	"indexer",
	"lending",
	"nft",
	"oracle",
	"rwa",
	"sdk",
	"stablecoin",
	"wallet",
] as const;

/**
 * The subset the builders (skills) surface must also expand — builder
 * queries are skill-shaped ("rust dev", "oracle experience"), so only the
 * verticals that read as skills are owed there.
 */
export const BUILDER_CORE_VERTICALS = [
	"nft",
	"oracle",
	"rwa",
	"stablecoin",
	"wallet",
] as const;

/**
 * Shared expansions. Values here must be safe under EVERY surface's
 * matcher (project search substring-matches; repo search word-boundary
 * matches) — surface-tuned riskier terms belong in that surface's overlay.
 * Sources of truth for the lessons: sls-018 (ramp vocabulary), sls-019
 * (pool/liquidity), Beacon Q3 (chain names), Raven launch demo
 * (LatAm→countries).
 */
export const CORE_SYNONYMS: Record<string, string[]> = {
	// ── Verticals ──
	amm: ["amm", "liquidity", "pool", "swap", "dex"],
	dex: ["dex", "amm", "swap", "exchange", "orderbook", "liquidity"],
	swap: ["swap", "dex", "amm", "exchange", "liquidity"],
	pool: ["pool", "liquidity", "amm", "dex", "swap"],
	liquidity: ["liquidity", "pool", "amm", "dex", "swap"],
	lending: ["lending", "lend", "borrow", "loan", "money market"],
	// Q5 cold-agent run (2026-07-20): "escrow" queries must reach milestone/
	// conditional-payment vocabulary — the canonical audited escrow platform's
	// repo name doesn't contain the word.
	escrow: ["escrow", "milestone", "milestones", "conditional payment"],
	// Real-demand fixes (2026-07-21 Raven battery / consumer report):
	// "is blend audited?" tokenizes to [blend, audited] and records carry
	// "audit(s)" — the suffixed forms must reach the stem or the subject
	// record loses strict AND to prose-mentioners.
	audited: ["audited", "audit", "audits"],
	auditor: ["auditor", "audit", "audits"],
	auditors: ["auditors", "auditor", "audit", "audits"],
	// "strupey" = misspelled STROOPY, the former Stellar mascot (17 real asks
	// in 30 days) — route both to "stroop", the official unit named after it
	// (dev-docs Fees + Glossary hold the grounded content).
	stroopy: ["stroopy", "stroop"],
	strupey: ["strupey", "stroopy", "stroop"],
	oracle: [
		"oracle",
		"price feed",
		"data feed",
		"datafeed",
		"pricefeed",
		"price-feed",
	],
	bridge: ["bridge", "cross-chain", "interoperability", "cctp", "wrapped"],
	indexer: ["indexer", "indexing", "subgraph", "data pipeline", "etl"],
	sdk: ["sdk", "library", "client library", "kit"],
	nft: ["nft", "non-fungible", "collectible", "collectibles", "mint"],
	rwa: [
		"rwa",
		"real world asset",
		"real-world asset",
		"tokenized",
		"tokenization",
	],
	stablecoin: ["stablecoin", "stable", "usdc", "eurc"],
	// Divergence deliberate past the noun itself: custody/keystore vocabulary
	// on projects, keypair/passkey on repos — overlays carry those.
	wallet: ["wallet"],
	defi: ["defi", "decentralized finance", "amm", "lending", "yield"],
	soroban: ["soroban", "smart contract", "contract"],
	contract: ["contract", "soroban", "smart contract"],
	zk: [
		"zk",
		"zero-knowledge",
		"zero knowledge",
		"zkp",
		"snark",
		"stark",
		"plonk",
		"groth16",
	],
	zkp: ["zkp", "zk", "zero-knowledge"],
	identity: ["identity", "kyc", "did", "credential", "compliance"],
	// Ramp/anchor vertical (sls-018): corridor queries must reach issuers
	// whose prose never says "anchor" — on every surface.
	anchor: [
		"anchor",
		"on-ramp",
		"off-ramp",
		"ramp",
		"sep-24",
		"sep24",
		"sep-6",
		"sep6",
		"fiat",
	],
	payments: [
		"payments",
		"payment",
		"checkout",
		"merchant",
		"settlement",
		"remittance",
		"cross-border",
	],
	payment: ["payment", "payments", "remittance"],
	// ── Chains (Beacon Q3): users name the chain, records say "EVM"/"cross-chain" ──
	evm: ["evm", "ethereum", "erc-20", "erc20", "cross-chain", "bridge"],
	ethereum: ["ethereum", "evm", "erc-20", "eth", "cross-chain", "bridge"],
	solana: ["solana", "sol", "cross-chain", "bridge"],
	sol: ["sol", "solana", "cross-chain"],
	tron: ["tron", "trx", "cross-chain"],
	xrpl: ["xrpl", "xrp", "ripple", "cross-chain"],
	xrp: ["xrp", "xrpl", "cross-chain"],
	bitcoin: ["bitcoin", "btc", "cross-chain"],
	btc: ["btc", "bitcoin", "cross-chain"],
	polkadot: ["polkadot", "dot", "kusama", "cross-chain"],
	kusama: ["kusama", "polkadot", "cross-chain"],
	sui: ["sui", "cross-chain"],
	near: ["near", "cross-chain"],
	base: ["base", "evm", "cross-chain"],
	bnb: ["bnb", "bsc", "binance", "evm", "cross-chain"],
	bsc: ["bsc", "bnb", "binance", "evm", "cross-chain"],
	optimism: ["optimism", "evm", "cross-chain"],
	avalanche: ["avalanche", "evm", "cross-chain"],
	polygon: ["polygon", "evm", "cross-chain"],
	arbitrum: ["arbitrum", "evm", "cross-chain"],
	cctp: ["cctp", "cross-chain transfer protocol", "circle", "usdc", "bridge"],
	// ── Regions (Raven launch demo): umbrella terms → the country vocabulary
	// records actually use ──
	latam: [
		"latam",
		"latin america",
		"brazil",
		"brazilian",
		"mexico",
		"mexican",
		"argentina",
		"colombia",
		"chile",
		"peru",
	],
	africa: ["africa", "african", "nigeria", "kenya", "ghana", "south africa"],
	asia: [
		"asia",
		"asian",
		"india",
		"indian",
		"philippines",
		"indonesia",
		"vietnam",
		"singapore",
	],
	europe: ["europe", "european", "eu"],
};

/**
 * Transactional verbs and container nouns that appear in half the corpus —
 * the ring OUTSIDE stopwords. A query token in this set can still match and
 * score, but it never counts as the query's ANCHOR (the intent-bearing noun
 * that mention-vs-identity ranking keys on). Shared by project search and
 * repo search so the identity rule means the same thing on both surfaces.
 */
export const GENERIC_QUERY_TOKENS = new Set([
	"buy",
	"sell",
	"get",
	"send",
	"receive",
	"make",
	"use",
	"need",
	"want",
	"find",
	"money",
	"crypto",
	"token",
	"tokens",
	"coin",
	"coins",
	"app",
	"apps",
	"platform",
	"service",
	"services",
	"tool",
	"tools",
	"solution",
	"project",
	"projects",
	"way",
	"sol", // ambiguous: Solana's ticker vs spanish "sol" — never a lone anchor
]);

/** The intent-bearing (non-generic, non-trivial) tokens of a query. */
export function anchorTokens(tokens: string[]): string[] {
	return tokens.filter((t) => !GENERIC_QUERY_TOKENS.has(t) && t.length > 2);
}

/**
 * Union-merge a surface overlay onto the core registry. Overlay entries
 * extend (never replace) core entries; keys unique to either side pass
 * through. Consumers all Set-dedupe expansions, so ordering is cosmetic.
 */
export function mergeVocabulary(
	core: Record<string, string[]>,
	overlay: Record<string, string[]>,
): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	for (const [k, vs] of Object.entries(core)) out[k] = [...vs];
	for (const [k, vs] of Object.entries(overlay)) {
		out[k] = [...new Set([...(out[k] ?? []), ...vs])];
	}
	return out;
}
