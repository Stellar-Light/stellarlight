/**
 * Protected allowlist — repos the Code-Truth Ledger can NEVER archive or exclude
 * from surfaces, regardless of any code signal, farm score, or staleness
 * (safety-spec hard invariant H5 + P10).
 *
 * Two layers:
 *   1. Canonical owners — the core Stellar/Soroban orgs whose repos are, by
 *      definition, ground-truth references (even an archived/experimental one is
 *      a legitimate historical reference, not junk to demote).
 *   2. Runtime keys — a caller can also treat any repo that is `scfAwarded`, has
 *      a curated `projectSlug`/`prominence`, or appears in a curated
 *      multichain-project's repo list as protected (P10: a big cross-chain
 *      project only tangentially Stellar must not be archived by ownership rules
 *      alone). Those signals live on the repo doc; `isProtected` takes them.
 *
 * Matching is case-insensitive on `owner`. Keep this list conservative and
 * auditable — it is a floor, not a ranking lever.
 */

/** Canonical Stellar/Soroban orgs — every repo they own is protected. */
export const PROTECTED_OWNERS: ReadonlySet<string> = new Set(
	[
		"stellar",
		"stellar-deprecated", // archived-but-canonical (e.g. reference impls) — still a legit reference
		"soroban", // legacy soroban org
		"soroswap",
		"blend-capital",
		"aquarius",
		"aquarius-finance",
		"paltalabs",
		"script3",
		"orbitlens", // Reflector / oracle infra
		"reflector-network",
		"creit-tech", // stellar-wallets-kit, popular SDKs
		"lightsail-network",
		"sorobandomains",
		"tyvdh", // kalepail / SDF tooling author
		"kalepail",
	].map((o) => o.toLowerCase()),
);

/**
 * Individual protected repos (owner/name, lowercased) for canonical references
 * whose owner is NOT a blanket-protected org — e.g. widely-cited examples or
 * SDKs that live under a personal/community account.
 */
export const PROTECTED_REPOS: ReadonlySet<string> = new Set(
	[
		"stellar/soroban-examples",
		"stellar/rs-soroban-sdk",
		"stellar/js-stellar-sdk",
		"stellar/stellar-cli",
		"stellar/soroban-docs",
		"stellar/stellar-docs",
	].map((r) => r.toLowerCase()),
);

/** Owner of a `fullName` (owner/name), lowercased; "" if malformed. */
function ownerOf(fullName: string): string {
	const i = fullName.indexOf("/");
	return i > 0 ? fullName.slice(0, i).toLowerCase() : "";
}

/**
 * Static allowlist check — canonical owner OR explicitly-listed repo. This is
 * the compile-time floor; use `isProtected` for the full check that also honors
 * per-doc curation signals.
 */
export function isAllowlisted(fullName: string | null | undefined): boolean {
	if (!fullName) return false;
	const full = fullName.toLowerCase();
	if (PROTECTED_REPOS.has(full)) return true;
	return PROTECTED_OWNERS.has(ownerOf(full));
}

/** Per-doc protection signals (from the repo document). */
export interface ProtectionSignals {
	fullName?: string | null;
	/** owning project is SCF-funded — curated, never junk */
	scfAwarded?: boolean | null;
	/** has a curated project link — came through the human-reviewed directory */
	projectSlug?: string | null;
	/** curated prominence (>0 = editorially surfaced) */
	projectProminence?: number | null;
	/** appears in a curated multichain project's repo list (P10) */
	curatedMultichain?: boolean | null;
}

/**
 * Full protection check — the allowlist PLUS any per-doc curation signal. A repo
 * that is protected can never be demoted to `archive` or flagged
 * `unverifiedStellar` by the scanner (the scanner short-circuits to keep-current
 * for these). Bias: when any curation signal says "a human vouched for this",
 * the automated code gate must not override it.
 */
export function isProtected(sig: ProtectionSignals): boolean {
	if (isAllowlisted(sig.fullName)) return true;
	if (sig.scfAwarded) return true;
	if (sig.curatedMultichain) return true;
	if (sig.projectSlug && sig.projectSlug.trim() !== "") return true;
	if ((sig.projectProminence ?? 0) > 0) return true;
	return false;
}
