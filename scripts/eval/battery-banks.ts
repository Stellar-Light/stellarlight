/**
 * The battery's question banks — DATA, separated from the harness so the
 * bank linter can import them without executing a live run, and so the
 * eval-fingerprint baseline pins bank edits as explicit, reviewable acts
 * (QUALITY.md §5: re-baselining is part of the PR that earns it).
 */

export const KNOWN_BANKS: Array<Array<[string, string]>> = [
	[
		["Soroswap", "soroswap"],
		["Reflector", "reflector"],
		["Freighter", "freighter"],
		["Blend", "blend"],
	],
	[
		["Etherfuse", "etherfuse"],
		["Allbridge", "allbridge"],
		["Lobstr", "lobstr"],
		["Band", "band"],
	],
	[
		["Sorobix", "sorobix"],
		["Tansu", "tansu"],
		["DeFindex", "defindex"],
		["Decaf", "decaf"],
	],
	[
		["Kulipa", "kulipa"], // Inactive — must still resolve, with its truth
		["GetBlockCard", "getblockcard"], // Inactive + camelCase — the hard case
		["Wirex", "wirex-pay"],
		["Rain", "rain"],
	],
];

export const ABSENT_BANKS: string[][] = [
	["is FlurboSwap live", "what is ZorbLend"],
	["is QuantumPay live", "tell me about NebulaBridge"],
	["is StellarGizmo live", "what is OrbitMintX"],
];

/** The nonsense strings raven-honest-absence probes with. Kept here beside
 * ABSENT_BANKS so there is ONE list of names we know we invented. */
export const NONSENSE_PROBES = [
	"zzqqxx nonexistent protocol 9999",
	"flurbomatic quantifold widgetron on Stellar",
];

/** Did WE make this name up?
 *
 * The absent-banks are fabricated project names the battery fires at the API to
 * prove it says "no record held" instead of hallucinating. They are designed to
 * look exactly like real Stellar projects, because a canary that reads as fake
 * tests nothing.
 *
 * That design is why they came back as consumer demand. The battery runs
 * THROUGH the Raven gateway, whose adapter sends no User-Agent, so engine-d
 * cannot separate it from genuine Raven traffic; and isSyntheticQuery only
 * matches literal-nonsense shapes, so it cannot see a plausible brand name. Six
 * of our own canaries were mined into the ledger as unmet demand — findings
 * that could only be "fixed" by inventing a fake project.
 *
 * The bank is the authoritative list of what we invented, so the filter reads
 * it directly and self-maintains when the bank changes. Deliberately NOT a
 * regex over name shapes: these names are by construction indistinguishable
 * from real ones, and a pattern that caught them would eat real demand too.
 */
export function isFabricatedProbe(q: string): boolean {
	const s = q.trim().toLowerCase();
	if (!s) return false;
	for (const bank of ABSENT_BANKS)
		for (const probe of bank) if (s === probe.toLowerCase()) return true;
	for (const probe of NONSENSE_PROBES) if (s === probe.toLowerCase()) return true;
	return false;
}

export const CATEGORY_BANKS: Array<{
	q: string;
	anyOf: string[];
	op?: string;
	key?: string;
	min?: number;
}> = [
	{ q: "oracle price feeds on Stellar", anyOf: ["reflector", "band", "dia"] },
	{
		q: "block explorer for Stellar",
		anyOf: ["stellar-expert", "stellarchain", "steexp"],
	},
	{
		q: "non-custodial wallet for Stellar",
		anyOf: ["freighter", "lobstr", "xbull"],
	},
	// audit firms live on the PARTNERS surface (guard A holds the two apart);
	// the directory rows for this query are halborn/stellar-security-portal.
	{
		q: "smart contract audit firms for Soroban",
		anyOf: ["ottersec", "veridise", "certora"],
		op: "getPartners",
		key: "partners",
	},
	{
		q: "cross-chain bridge to Stellar",
		anyOf: ["allbridge", "spacewalk", "axelar"],
	},
	// 2026-08-27 recalibration: the Lending vertical holds 20+ typed rows, so
	// asserting two hand-picked members in top-8 encoded an unfounded
	// canonicality opinion (the red it produced led to #1053, which was right
	// for the CLASS — typed rows now rank as if they said one more word — but
	// the assertion itself was wrong). What retrieval owes this query: the
	// flagship leads, and the page is category-pure. Canonicality WITHIN a
	// vertical is prominence curation, not a retrieval assertion.
	{ q: "lending protocol on Stellar", anyOf: ["blend"], min: 1 },
	// ── persona: hacker-buildtime (wave-3 hacker-journey battery 2026-08-27,
	// formalized into rotation per QUALITY.md §5) — day-one build needs a
	// hacker actually asks, with the answers that run proved we hold. ──
	{
		q: "RPC provider for Soroban mainnet",
		anyOf: ["nownodes", "validation-cloud", "quicknode", "gatewayfm"],
	},
	{
		q: "testnet faucet XLM",
		anyOf: ["friendbot", "stellar-laboratory"],
		min: 1,
	},
	// wallet-KIT vs wallet: wave 3 found the kit ranks below wallets for this
	// query — min 1 keeps the probe honest without encoding a ranking opinion.
	{
		q: "wallet connection kit for a Stellar dapp",
		anyOf: ["stellar-wallets-kit"],
		min: 1,
	},
];
