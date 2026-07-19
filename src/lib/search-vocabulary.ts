/**
 * Canonical search-vocabulary contract (ideas/shared-synonym-registry.md,
 * guard phase). Three surfaces each maintain their own synonym expansions —
 * project search, repo search, builders — and every vocabulary lesson
 * ("LatAm→countries", "pool→liquidity") historically had to be hand-copied
 * between them; the next retrieval miss is always a term fixed in one map
 * and absent in another (project search lacked stopwords repo search had
 * for weeks).
 *
 * This module does NOT merge the expansion VALUES (each surface's
 * expansions differ deliberately: "wallet" implies custody vocabulary on
 * projects but repo-topic vocabulary on repos). It pins the KEY coverage:
 * every noun listed here must have an expansion entry on the surfaces that
 * owe it one, enforced by src/lib/__tests__/search-vocabulary.test.ts.
 * Add a vertical here when a lesson lands, and the test forces you to
 * teach every surface — not just the one that missed.
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
