/**
 * Code-domain classification — the general "what does this repo's CODE
 * actually do" layer, for every scanned repo.
 *
 * Metadata says what a repo claims; this says what its code proves. Domains
 * are IDENTITY — what this repo's own code IS — derived only from:
 *   - contract interface fn names for on-chain protocol surfaces (SEP-40
 *     lastprice, the UniswapV2 + Phoenix AMM dialects, the Blend pool)
 *   - SDK capability tags where the repo's OWN code implements the flow
 *     (sep24-ramp = real interactive deposit/withdraw paths)
 * Dependencies are deliberately NOT identity evidence (2026-08-15: a
 * multisig signer depping @soroswap/sdk was served under domain=defi-amm —
 * depending on a protocol's SDK makes you its CONSUMER, not the protocol).
 * Integration truth lives in stellarDeps and the dependsOn filter.
 * Topics, READMEs, and descriptions are deliberately NOT evidence here —
 * self-description is the metadata weakness this layer exists to beat.
 *
 * A repo can hold several domains ("blend integration + x402 checkout").
 * Empty = the code proved nothing domain-specific — an honest null, not a
 * failure. Extend the registry with names, never guesses.
 */

export const CODE_DOMAINS = [
	"defi-lending",
	"defi-amm",
	"defi-yield",
	"oracle",
	"payments-x402",
	"wallet-infra",
	"anchor-ramp",
	"indexer",
] as const;

export type CodeDomain = (typeof CODE_DOMAINS)[number];


/** Contract-interface trait evidence: fn names that identify an on-chain
 * standard's surface. Conservative — one canonical marker per standard. */
const IFACE_DOMAINS: Array<[fnName: string, domain: CodeDomain]> = [
	// SEP-40 price feed trait — the canonical oracle surface.
	["lastprice", "oracle"],
	// UniswapV2-style router surface — the de-facto AMM standard on Soroban.
	// Markers verified against soroswap/core's stored interface (2026-08-15:
	// domain=defi-amm served 0 while soroswap sat scanned with 48 fns).
	["add_liquidity", "defi-amm"],
	["swap_exact_tokens_for_tokens", "defi-amm"],
	// Phoenix-style pool surface (CosmWasm heritage) — verified against
	// Phoenix-Protocol-Group/phoenix-contracts' stored interface (2026-08-15:
	// scanned at depth 0.75 with 48 fns, zero matched the UniswapV2 markers).
	["provide_liquidity", "defi-amm"],
	["withdraw_liquidity", "defi-amm"],
	["simulate_reverse_swap", "defi-amm"],
	// Blend-style pool surface — the de-facto lending standard on Soroban.
	// Verified against blend-capital/blend-contracts' stored interface.
	["queue_set_reserve", "defi-lending"],
	["get_positions", "defi-lending"],
	// CAP-58 custom-account interface — THE on-chain wallet-infrastructure
	// marker: every smart-wallet/account-abstraction contract implements
	// __check_auth (verified 2026-08-15 against passkey-kit's stored
	// interface; 18 corpus carriers, all genuinely account contracts).
	// Replaces the deleted dep-based wallet-infra rule with identity.
	["__check_auth", "wallet-infra"],
];

export interface DomainSignals {
	stellarDeps?: string[] | null;
	sdkCapabilities?: string[] | null;
	/** Extracted contract-interface entries; only fn names are read. */
	contractInterface?: Array<{ name?: string | null } | string> | null;
}

export function deriveCodeDomains(s: DomainSignals): CodeDomain[] {
	const out = new Set<CodeDomain>();
	// sep24-ramp capability = real interactive-deposit/withdraw code paths.
	if ((s.sdkCapabilities ?? []).includes("sep24-ramp")) out.add("anchor-ramp");
	for (const entry of s.contractInterface ?? []) {
		const raw = (
			typeof entry === "string" ? entry : (entry?.name ?? "")
		).toLowerCase();
		// Stored entries are "ContractType.fn_name(args) -> Ret" strings —
		// extract the fn segment (after the last dot, before the paren) so
		// "beamoraclecontract.lastprice(...)" matches "lastprice".
		const fnName = (raw.split("(")[0] ?? "").split(".").pop() ?? "";
		for (const [fn, domain] of IFACE_DOMAINS)
			if (fnName === fn) out.add(domain);
	}
	return [...out].sort();
}
