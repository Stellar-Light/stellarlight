/**
 * Skill/vertical synonym expansions for the builders (people) surface.
 * Lives in lib (not the route) so the search-vocabulary key-coverage guard
 * can import it — route modules may only export handlers.
 *
 * Core vocabulary is merged in from CORE_SYNONYMS — but ONLY for the keys
 * this surface owns: builder queries are skill-shaped ("oracle
 * experience"), so chains/regions/etc. from the core registry are not
 * taken wholesale. Add a lesson to the core registry when every surface
 * owes it; here only when it's builder-specific (bio phrasing like
 * "self-custody", region payment rails like boleto/PIX).
 */
import { CORE_SYNONYMS, mergeVocabulary } from "./search-vocabulary";

const BUILDER_SYNONYM_OVERLAY: Record<string, string[]> = {
	payments: ["remittances", "boleto", "pix", "pagamento"],
	payment: ["boleto", "pix"],
	defi: ["dex", "liquidity"],
	wallet: ["wallets", "custody", "custodial", "self-custody"],
	audit: ["audits", "auditing", "security", "formal verification"],
	oracle: ["oracles"],
	rwa: ["tokenize"],
	stablecoin: ["stablecoins", "stable coin"],
	anchor: ["anchors", "on/off-ramp"],
	nft: ["nfts"],
	soroban: ["smart contracts", "rust contract"],
	ai: ["agent", "agents", "agentic", "llm"],
	identity: ["verifiable credential"],
};

/** Core entries for exactly the keys this surface owns (overlay keys). */
const BUILDER_CORE: Record<string, string[]> = Object.fromEntries(
	Object.entries(CORE_SYNONYMS).filter(([k]) => k in BUILDER_SYNONYM_OVERLAY),
);

export const BUILDER_SYNONYMS: Record<string, string[]> = mergeVocabulary(
	BUILDER_CORE,
	BUILDER_SYNONYM_OVERLAY,
);
