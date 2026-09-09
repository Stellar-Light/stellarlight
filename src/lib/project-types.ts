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
