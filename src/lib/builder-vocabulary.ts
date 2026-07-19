/**
 * Skill/vertical synonym expansions for the builders (people) surface.
 * Lives in lib (not the route) so the search-vocabulary key-coverage guard
 * can import it — route modules may only export handlers.
 */
export const BUILDER_SYNONYMS: Record<string, string[]> = {
	payments: [
		"payment",
		"remittance",
		"remittances",
		"boleto",
		"pix",
		"pagamento",
		"checkout",
		"cross-border",
	],
	payment: ["payments", "remittance", "boleto", "pix"],
	defi: [
		"decentralized finance",
		"lending",
		"amm",
		"dex",
		"yield",
		"liquidity",
	],
	wallet: ["wallets", "custody", "custodial", "self-custody"],
	audit: ["audits", "auditing", "security", "formal verification"],
	oracle: ["oracles", "price feed", "pricefeed", "price-feed"],
	rwa: [
		"real world asset",
		"real-world asset",
		"tokenization",
		"tokenized",
		"tokenize",
	],
	stablecoin: ["stablecoins", "stable coin", "usdc", "eurc"],
	anchor: ["anchors", "on-ramp", "off-ramp", "on/off-ramp", "sep-24", "sep-6"],
	nft: ["nfts", "non-fungible"],
	soroban: ["smart contract", "smart contracts", "rust contract"],
	ai: ["agent", "agents", "agentic", "llm"],
	identity: ["kyc", "did", "credential", "verifiable credential"],
};
