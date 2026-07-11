/**
 * Known core-infrastructure repos that must NEVER be classified as deployable
 * Soroban contracts (sls-046).
 *
 * `isDeployableContract` means "this repo's PRODUCT is a deployable Soroban
 * contract" (a cdylib crate you'd build and deploy to the network — an AMM,
 * an oracle contract, a game). The code scanner derives it from Cargo.toml
 * `crate-type = ["cdylib"]`, which is the right signal for project repos but
 * misfires on core platform repos: stellar-core vendors the Rust host-
 * invocation bridge, rs-soroban-env IS the host environment (its cdylib
 * crates are the runtime + test fixtures), stellar-cli and the SDKs embed
 * example/fixture contracts. A consumer using the flag to pick deployable
 * contracts would misclassify core protocol software as a contract deployment
 * (live case: explainRepo on stellar/stellar-core returned
 * `codeVerified.isDeployableContract: true`).
 *
 * The pin is applied BOTH at serving time (repo-search / repos explain — so
 * already-scanned rows read correctly without a re-scan) and at scan time
 * (scan-repo-code.ts — so stored rows converge to the truth).
 *
 * Keep entries NARROW: platform/SDK/tooling repos whose product is not a
 * deployable contract. Repos of deployable examples (stellar/soroban-examples)
 * or real contract products deliberately do NOT belong here.
 */
const INFRA_NOT_DEPLOYABLE = new Set<string>(
	[
		// core protocol / runtime
		"stellar/stellar-core",
		"stellar/rs-soroban-env",
		"stellar/stellar-protocol",
		"stellar/stellar-xdr",
		"stellar/rs-stellar-xdr",
		// horizon / rpc / platform services
		"stellar/go",
		"stellar/stellar-rpc",
		"stellar/soroban-rpc",
		"stellar/anchor-platform",
		"stellar/quickstart",
		// SDKs / tooling (embed example + fixture contracts)
		"stellar/rs-soroban-sdk",
		"stellar/stellar-cli",
		"stellar/soroban-cli",
		"stellar/js-stellar-sdk",
		"stellar/js-stellar-base",
		"stellar/java-stellar-anchor-sdk",
	].map((s) => s.toLowerCase()),
);

/** True when `fullName` is a known platform/SDK/tooling repo whose
 * `isDeployableContract` must be pinned false regardless of scan output. */
export function isKnownInfraNotDeployable(fullName: string): boolean {
	return INFRA_NOT_DEPLOYABLE.has(fullName.toLowerCase());
}
