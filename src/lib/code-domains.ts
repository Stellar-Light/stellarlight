/**
 * Code-domain classification — the general "what does this repo's CODE
 * actually do" layer, for every scanned repo.
 *
 * Metadata says what a repo claims; this says what its code proves. Domains
 * are derived ONLY from strong evidence the scanner already extracted:
 *   - ecosystem dependencies (stellar-deps allowlist — manifests, not prose)
 *   - SDK capability tags (real API usage in source, context-gated)
 *   - contract interface fn names for on-chain trait standards (e.g. the
 *     SEP-40 `lastprice` surface)
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

/** Dependency evidence → domain. Matched against stellarDeps entries
 * (verbatim allowlisted names from manifests). Prefix match on scopes. */
const DEP_DOMAINS: Array<[test: (dep: string) => boolean, domain: CodeDomain]> =
	[
		[(d) => d.startsWith("@blend-capital/") || d.startsWith("blend-"), "defi-lending"],
		[(d) => d === "xycloans" || d.startsWith("xycloans-"), "defi-lending"],
		[(d) => d.startsWith("@soroswap/") || d.startsWith("soroswap-"), "defi-amm"],
		[(d) => d.startsWith("@phoenix-protocol/") || d.startsWith("phoenix-"), "defi-amm"],
		[(d) => d.startsWith("@defindex/"), "defi-yield"],
		[(d) => d.startsWith("@reflector-network/") || d.startsWith("reflector-"), "oracle"],
		[(d) => d.startsWith("@x402/") || d === "x402" || d.startsWith("x402-"), "payments-x402"],
		[(d) => d === "passkey-kit" || d === "passkey-kit-sdk", "wallet-infra"],
		[(d) => d === "stellar-wallets-kit" || d.startsWith("@creit.tech/") || d.startsWith("@creit-tech/"), "wallet-infra"],
		[(d) => d.startsWith("@stellar-indexer/") || d === "mercury-sdk", "indexer"],
	];

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
];

export interface DomainSignals {
	stellarDeps?: string[] | null;
	sdkCapabilities?: string[] | null;
	/** Extracted contract-interface entries; only fn names are read. */
	contractInterface?: Array<{ name?: string | null } | string> | null;
}

export function deriveCodeDomains(s: DomainSignals): CodeDomain[] {
	const out = new Set<CodeDomain>();
	for (const dep of s.stellarDeps ?? []) {
		const d = dep.toLowerCase();
		for (const [test, domain] of DEP_DOMAINS) if (test(d)) out.add(domain);
	}
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
