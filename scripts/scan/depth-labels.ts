/**
 * codeDepth ground-truth answer key — the ONE label set the calibration probe
 * (depth-probe.ts) and the CI regression gate (depth-eval.ts) both consume.
 *
 * Membership is grounded in EXTERNAL facts only — never "the current scorer
 * likes it" (that would make the gate circular and blind to shared bias):
 *   DEEP    = SCF-funded and/or audited and/or canonical live protocols whose
 *             contracts demonstrably run in production.
 *   SHALLOW = official templates / examples / quickstarts / hello-worlds —
 *             structurally complete by design, substantively empty by design.
 *
 * Deliberately EXCLUDED: high-scoring repos with no external corroboration
 * (no linked project, no funding, no audit) — a scorer-flattering unknown is
 * exactly the thing a label set must not contain.
 *
 * Grow it, don't churn it: add rows with a `why`; only remove a row when the
 * external fact changes (protocol dies, example graduates to a real product).
 */

export interface LabeledRepo {
	fullName: string;
	why: string;
}

export const DEEP: LabeledRepo[] = [
	{
		fullName: "blend-capital/blend-contracts",
		why: "audited lending protocol, SCF-funded, live on mainnet",
	},
	{
		fullName: "blend-capital/blend-contracts-v2",
		why: "v2 of the audited live lending protocol (current separation floor)",
	},
	{ fullName: "soroswap/core", why: "audited AMM, SCF-funded, live" },
	{
		fullName: "reflector-network/reflector-contract",
		why: "canonical oracle, SCF-funded, live feeds on mainnet",
	},
	{
		fullName: "kalepail/passkey-kit",
		why: "canonical passkey smart-wallet kit, widely integrated",
	},
	{ fullName: "eq-lab/slender", why: "SCF-funded lending protocol, live" },
	{
		fullName: "phoenix-protocol-group/phoenix-contracts",
		why: "SCF-funded AMM suite",
	},
	{ fullName: "laina-defi/laina", why: "SCF-funded lending protocol" },
	{
		fullName: "sentinelfi/sentinel_soroban_v3",
		why: "SCF-funded insurance/coverage protocol",
	},
	{ fullName: "normalfinance/normal-stellar-amm", why: "SCF-funded AMM" },
	{
		fullName: "perun-network/perun-soroban-contract",
		why: "Perun state channels — established research org's Soroban port",
	},
];

export const SHALLOW: LabeledRepo[] = [
	{
		fullName: "stellar/soroban-examples",
		why: "official example set — structure without product substance",
	},
	{ fullName: "stellar/soroban-quickstart", why: "official quickstart" },
	{ fullName: "stellar/soroban-example-dapp", why: "official example dapp" },
	{
		fullName: "stellar/soroban-template-astro",
		why: "official template (KNOWN_SCAFFOLDS)",
	},
	{
		fullName: "jamesbachini/Soroban-Hello-World",
		why: "hello-world tutorial repo",
	},
	{ fullName: "dbcfd/soroban-template", why: "community template" },
	{
		fullName: "axelarnetwork/stellar-its-example",
		why: "official integration example",
	},
	{
		fullName: "allbridge-io/allbridge-proxy-contract-example",
		why: "official proxy-contract example",
	},
];

/** Gate thresholds — see depth-eval.ts for how they're asserted. Calibrated
 * 2026-07-07 against live scores (deep min 0.57 = blend-v2; shallow max 0.44
 * = the official examples): a change that drags a real protocol under 0.55,
 * lifts a template over 0.50, or collapses the band margin below 0.05 fails. */
export const GATE = {
	deepMin: 0.55,
	shallowMax: 0.5,
	marginMin: 0.05,
	/** Fetch failures happen (renames, rate limits); require this coverage per band. */
	minCoverage: 0.8,
} as const;
