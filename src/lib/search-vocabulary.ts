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
/** zk proof-system vocabulary, shared by every family entry point (see the
 * `zk`/`snark`/`zk-snark`/… keys below). One list so the members stay in sync. */
// EVM-standard families — every entry point (bare + hyphenated) maps to the
// same set, the zk-family pattern: a query FOR any member expands to all.
const ERC20_FAMILY: string[] = [
	"erc20",
	"erc-20",
	"sep-41",
	"sep41",
	"token",
	"fungible",
];
const ERC_NFT_FAMILY: string[] = [
	"erc721",
	"erc-721",
	"erc1155",
	"erc-1155",
	"nft",
	"collectible",
];
const ERC3643_FAMILY: string[] = [
	"erc3643",
	"erc-3643",
	"sep-57",
	"sep57",
	"rwa",
	"real world asset",
	"regulated",
	"compliance",
	"kyc",
];
const ZK_FAMILY: string[] = [
	"zk",
	"zero-knowledge",
	"zero knowledge",
	"zkp",
	"snark",
	"stark",
	"plonk",
	"groth16",
];

export const CORE_SYNONYMS: Record<string, string[]> = {
	// ── Verticals ──
	amm: ["amm", "liquidity", "pool", "swap", "dex"],
	dex: ["dex", "amm", "swap", "exchange", "orderbook", "liquidity"],
	swap: ["swap", "dex", "amm", "exchange", "liquidity"],
	pool: ["pool", "liquidity", "amm", "dex", "swap"],
	liquidity: ["liquidity", "pool", "amm", "dex", "swap"],
	lending: ["lending", "lend", "borrow", "loan", "money market"],
	// Raven #39: card-issuance vocabulary; "card issuing" is the types value.
	card: ["card", "cards", "card issuing"],
	cards: ["card", "cards", "card issuing"],
	debit: ["debit", "card", "cards", "card issuing"],
	cex: ["cex", "centralized exchange", "exchange"],
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
	// ^ "strupey" is also a SPELLING CORRECTION (see below): it may still find
	// the Stroopy.AI project row, but the response must say the match went
	// through a correction, never "all keywords matched" (sls-076).
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
	// zk proof-system family. Bidirectional (P5, 2026-07-21): the family used to
	// be reachable ONLY from "zk" — q=zk found the repos, but q=zk-snark / q=snark
	// / q=zksnark returned 0 because those were only VALUES under "zk", never keys,
	// so a query FOR a family member never expanded back to the family. Every entry
	// point now maps to the same ZK_FAMILY set, so q=zk-snark ≡ q=zk. Kept to
	// specific proof-system terms (no "proof"/"circuit" — those stay repo-overlay-
	// only, too loose for project substring matching; see the vocabulary test).
	zk: [...ZK_FAMILY],
	zkp: ["zkp", ...ZK_FAMILY],
	snark: [...ZK_FAMILY],
	stark: [...ZK_FAMILY],
	plonk: [...ZK_FAMILY],
	groth16: [...ZK_FAMILY],
	zksnark: ["zksnark", ...ZK_FAMILY],
	"zk-snark": ["zk-snark", "zksnark", ...ZK_FAMILY],
	// ── EVM porter vocabulary (Raven codegen-correctness note, 2026-08-15) ──
	// Porters phrase in EVM terms (the Ascend ERC-3643 port report; Raven
	// measured same-concept-different-phrasing returning materially different
	// results). Each EVM entry point expands to the Stellar-native vocabulary
	// the corpus actually holds — ERC-3643 → SEP-57 comes from Raven's golden
	// q-sor-evm-to-soroban-porting. Values stay substring-safe on the project
	// surface (no bare "auth" — it substring-matches "author").
	erc20: [...ERC20_FAMILY],
	"erc-20": [...ERC20_FAMILY],
	erc721: [...ERC_NFT_FAMILY],
	"erc-721": [...ERC_NFT_FAMILY],
	erc1155: [...ERC_NFT_FAMILY],
	"erc-1155": [...ERC_NFT_FAMILY],
	erc3643: [...ERC3643_FAMILY],
	"erc-3643": [...ERC3643_FAMILY],
	solidity: ["solidity", "soroban", "rust", "smart contract"],
	"msg.sender": ["msg.sender", "require_auth", "authorization", "invoker"],
	nonreentrant: ["nonreentrant", "reentrancy", "reentrant"],
	reentrancy: ["reentrancy", "reentrant", "nonreentrant"],
	// "indexed" (Solidity event modifier) → Soroban event topics; the
	// "indexer" vertical is a different key and unaffected.
	indexed: ["indexed", "topics", "events"],
	hardhat: ["hardhat", "stellar-cli", "cli", "toolchain"],
	foundry: ["foundry", "stellar-cli", "cli", "toolchain"],
	// Privacy vertical (2026-07-21 privacy battery): street vocabulary
	// ("anonymous", "mixer", "monero-style") never appears in privacy
	// records — they say privacy/confidential ("privacy-preserving token
	// distribution", "Privacy pools protocol", "confidential transactions").
	// Route the asked words to the record words so "anonymous mixer" reaches
	// the actual privacy projects instead of falling through to semantic
	// neighbors.
	anonymous: ["anonymous", "anonymity", "privacy", "private", "confidential"],
	anonymity: ["anonymity", "anonymous", "privacy", "confidential"],
	mixer: ["mixer", "privacy", "tumbler", "confidential"],
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
	// "monero-style X" queries are privacy-intent, not corridor-intent — the
	// chain name doubles as privacy vocabulary (2026-07-21 privacy battery).
	monero: ["monero", "xmr", "privacy", "cross-chain"],
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
	// "is X still live/maintained/building" — pure question scaffolding in any
	// query; content in none. Added when the mention-vs-identity leftover rule
	// found it blocking "does <name> still build" (2026-08-31).
	"still",
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
	// Liveness/status words describe a STATE, never an identity. "is X live" is
	// the most natural way to ask about a project, and it was the single worst
	// query shape we had: "live" counted as an anchor noun, nearly every
	// project's text says "live", so the F2 anchor rule admitted every row —
	// at matchMode=majority with HIGH confidence, while the actual named
	// project was often absent entirely. Every honesty guard is gated on
	// matchMode==="semantic", so these queries bypassed all of them and
	// returned confidently-wrong answers instead of an honest refusal.
	// Making them generic lets the EXISTING anchor rule work: the only anchor
	// left is the project name, nothing matches it, and the query correctly
	// falls through to semantic where the confidence cap and the
	// "neighbours, not matches" advisory fire.
	"live",
	"alive",
	"active",
	"inactive",
	"running",
	"working",
	"status",
	"dead",
	"defunct",
	"launched",
	"shipped",
	"available",
	"online",
	"offline",
	"maintained",
	"abandoned",
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
	// Null prototype, because these maps are keyed by USER QUERY TOKENS. On a
	// plain object, SYNONYMS["constructor"] returns Object.prototype.constructor
	// (a function, so `?? []` never fires) and the caller's for..of throws —
	// q=constructor was a live 500 on BOTH search surfaces (Engine A R-SYM,
	// 2026-08-28). The tokenizer lowercases, so `constructor` is the one
	// reachable prototype key; killing the prototype kills the class for every
	// surface that merges its vocabulary here.
	const out: Record<string, string[]> = Object.create(null);
	for (const [k, vs] of Object.entries(core)) out[k] = [...vs];
	for (const [k, vs] of Object.entries(overlay)) {
		out[k] = [...new Set([...(out[k] ?? []), ...vs])];
	}
	return out;
}

/** Query tokens that are known MISSPELLINGS, mapped to the terms the synonym
 * expansion injects for them. A row admitted ONLY through these terms is a
 * spelling-corrected match, not a keyword match — sls-076: q="Strupey"
 * returned Stroopy.AI at matchMode=strict / "all keywords matched" although
 * neither name nor slug contains "strupey", and two independent agent runs
 * then promoted the row into identity evidence for an unverified name. The
 * expansion is deliberate (it finds the right thing); the LABEL was the lie.
 * Domain synonyms (cex → centralized exchange) are NOT corrections — a row
 * matching the expanded domain term genuinely answers the query. */
// Null prototype for the same reason as mergeVocabulary: keyed by raw query
// tokens, and SPELLING_CORRECTIONS["constructor"] must be undefined, not a
// function that then gets treated as a correction string.
export const SPELLING_CORRECTIONS: Record<string, string> = Object.assign(
	Object.create(null),
	{
		strupey: "stroopy",
	},
);
