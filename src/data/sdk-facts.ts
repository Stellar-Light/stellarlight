/**
 * Stellar SDK facts: security advisories by version, moved, renamed and
 * deprecated packages, and officially deprecated code patterns. Every row is
 * read from its publisher's own record and dated; nothing here is inferred.
 *
 * A version is affected by an advisory only inside that advisory's own
 * ranges, copied verbatim. A package's status is the registry's own field
 * (npm `deprecated`) or the publisher's own words, quoted. An idiom is listed
 * only where the SDK or CLI source, its release notes, or
 * developers.stellar.org states the deprecation and the replacement.
 *
 * scripts/check-sdk-facts.ts runs weekly (.github/workflows/sdk-facts.yml)
 * and re-reads: the advisory database and the repository advisories (every
 * advisory field served here), each registry's deprecated message, latest
 * major and yanks, soroban-sdk's crates.io index (alsoAffects), and the
 * rs-soroban-sdk and stellar-cli release notes published since
 * IDIOMS_REVIEWED_THROUGH. It does NOT re-read the renamed and moved
 * statements or the idiom source pages: those were read once, on their asOf.
 * It goes red on anything these lists do not hold. Update the row and its
 * asOf together.
 *
 * Read 2026-11-12:
 *  - GitHub Advisory Database, `/advisories?ecosystem=rust|npm&affects=...`
 *    for every package below, types reviewed, unreviewed and malware;
 *  - published repository advisories of every repository below;
 *  - registry.npmjs.org, crates.io/api/v1/crates, jsr.io meta.json;
 *  - the crates.io index for soroban-sdk and the soroban-* and stellar-*
 *    crates below it (alsoAffects);
 *  - rs-soroban-sdk and stellar-cli release notes through
 *    IDIOMS_REVIEWED_THROUGH, the SDK source at the tags named per idiom, and
 *    the developers.stellar.org pages named per idiom.
 */

export const SDK_FACTS_ASOF = "2026-11-12";

/** Release notes of these repositories were read for deprecations up to the
 * IDIOMS_REVIEWED_THROUGH timestamp; the check asks for a review of any
 * release published at or after it whose notes name one. */
export const IDIOM_RELEASE_REPOS = [
	"stellar/rs-soroban-sdk",
	"stellar/stellar-cli",
] as const;
export const IDIOMS_REVIEWED_THROUGH = "2026-11-12T18:24:50Z";

export const SDK_REGISTRIES = ["crates.io", "npm", "jsr"] as const;
export type SdkRegistry = (typeof SDK_REGISTRIES)[number];

/** GitHub's advisory ecosystem names for the registries it covers (JSR has
 * none: its packages are watched through their repository advisories). */
export const ADVISORY_ECOSYSTEMS = ["rust", "npm"] as const;
export type AdvisoryEcosystem = (typeof ADVISORY_ECOSYSTEMS)[number];

export const ADVISORY_SEVERITIES = [
	"low",
	"medium",
	"high",
	"critical",
] as const;

/** exact = every hop of the path is an `=` requirement, so every build of
 * those releases (on appliesTo) compiles an affected version; minimum = at
 * least one hop admits a range of versions (`^` or similar), so the lockfile
 * decides whether the version built is affected. */
export const INHERITED_PINS = ["exact", "minimum"] as const;

/** Which builds the path is in, from the `target` cfg of every hop. */
export const APPLIES_TO = [
	"every build",
	"host builds and tests, not the deployed wasm contract",
	"wasm contract builds only",
	"builds matching every hop's target",
] as const;

/** How deep the walk below soroban-sdk goes, and which crates it walks
 * through: the publishers' own soroban-* and stellar-* crates. */
export const ALSO_AFFECTS_MAX_HOPS = 4;

/** An advisory a repo inherits through soroban-sdk's dependency tree, read
 * from the crates.io index (never assumed): normal, non-optional
 * dependencies, through soroban-* and stellar-* crates, up to
 * ALSO_AFFECTS_MAX_HOPS hops. Per release and build class, the strongest
 * path is kept (exact before minimum, then the shortest). */
export interface SdkAlsoAffects {
	ecosystem: string;
	/** The crate a repo declares. */
	package: string;
	/** Its stable releases that reach an affected version of `via` along
	 * `path`, in the advisory range grammar. */
	vulnerableRange: string;
	/** The crate the advisory names (the last crate of `path`). */
	via: string;
	/** Crate names from `package` to `via`. */
	path: string[];
	/** The `target` cfg of each hop (path.length - 1 entries); null = every
	 * target. */
	targets: Array<string | null>;
	pin: (typeof INHERITED_PINS)[number];
	appliesTo: (typeof APPLIES_TO)[number];
	basis: string;
	sourceUrl: string;
}

/** reviewed / unreviewed / malware = the GitHub Advisory Database type;
 * repository = only the maintainer's repository advisory, absent from the
 * database on asOf. */
export const ADVISORY_SOURCES = [
	"reviewed",
	"unreviewed",
	"malware",
	"repository",
] as const;

export interface SdkAdvisory {
	ghsa: string;
	cve: string | null;
	severity: (typeof ADVISORY_SEVERITIES)[number];
	summary: string;
	source: (typeof ADVISORY_SOURCES)[number];
	url: string;
	/** owner/repo of the affected code, as the advisory names it. */
	repository: string;
	/** YYYY-MM-DD, the advisory's own published date. */
	publishedAt: string;
	/** Verbatim from the advisory. A package not named here can still pull an
	 * affected one in: see alsoAffects, and check the lockfile. */
	affected: Array<{
		ecosystem: string;
		package: string;
		vulnerableRange: string;
		firstPatched: string | null;
	}>;
	/** soroban-sdk releases whose dependency tree reaches an affected version
	 * of a crate named in `affected`. [] = no soroban-sdk release reaches one
	 * within ALSO_AFFECTS_MAX_HOPS hops of normal dependencies, not a
	 * clearance beyond that: the lockfile is the full answer. */
	alsoAffects: SdkAlsoAffects[];
	asOf: string;
}

const DB = "https://github.com/advisories/";

export const SDK_ADVISORIES: readonly SdkAdvisory[] = [
	{
		ghsa: "GHSA-x2hw-px52-wp4m",
		cve: "CVE-2026-32322",
		severity: "medium",
		summary:
			"rs-soroban-sdk: `Fr` scalar field equality comparison bypasses modular reduction",
		source: "reviewed",
		url: `${DB}GHSA-x2hw-px52-wp4m`,
		repository: "stellar/rs-soroban-sdk",
		publishedAt: "2026-03-13",
		affected: [
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: ">= 25.0.0, < 25.3.0",
				firstPatched: "25.3.0",
			},
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: ">= 23.0.0, < 23.5.3",
				firstPatched: "23.5.3",
			},
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: "< 22.0.11",
				firstPatched: "22.0.11",
			},
		],
		alsoAffects: [],
		asOf: "2026-11-12",
	},
	{
		ghsa: "GHSA-4chv-4c6w-w254",
		cve: "CVE-2026-26267",
		severity: "high",
		summary:
			"The rs-soroban-sdk #[contractimpl] macro calls inherent function instead of trait function when names collide",
		source: "reviewed",
		url: `${DB}GHSA-4chv-4c6w-w254`,
		repository: "stellar/rs-soroban-sdk",
		publishedAt: "2026-02-17",
		affected: [
			{
				ecosystem: "rust",
				package: "soroban-sdk-macros",
				vulnerableRange: ">= 25.0.0, <= 25.1.0",
				firstPatched: "25.1.1",
			},
			{
				ecosystem: "rust",
				package: "soroban-sdk-macros",
				vulnerableRange: ">= 23.0.0, <= 23.5.1",
				firstPatched: "23.5.2",
			},
			{
				ecosystem: "rust",
				package: "soroban-sdk-macros",
				vulnerableRange: "<= 22.0.9",
				firstPatched: "22.0.10",
			},
		],
		alsoAffects: [
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: ">= 0.0.2, <= 22.0.9",
				via: "soroban-sdk-macros",
				path: ["soroban-sdk", "soroban-sdk-macros"],
				targets: [null],
				pin: "minimum",
				appliesTo: "every build",
				basis:
					"soroban-sdk 0.0.2 to 22.0.9 (stable releases) reach soroban-sdk-macros through soroban-sdk > soroban-sdk-macros (crates.io index: normal, non-optional dependencies). At least one hop admits a range of versions, so Cargo.lock decides whether the version built is affected. Newest release in range: soroban-sdk 22.0.9 requires soroban-sdk-macros ^22.0.9.",
				sourceUrl: "https://index.crates.io/so/ro/soroban-sdk",
			},
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: ">= 23.0.0, <= 23.5.1",
				via: "soroban-sdk-macros",
				path: ["soroban-sdk", "soroban-sdk-macros"],
				targets: [null],
				pin: "minimum",
				appliesTo: "every build",
				basis:
					"soroban-sdk 23.0.0 to 23.5.1 (stable releases) reach soroban-sdk-macros through soroban-sdk > soroban-sdk-macros (crates.io index: normal, non-optional dependencies). At least one hop admits a range of versions, so Cargo.lock decides whether the version built is affected. Newest release in range: soroban-sdk 23.5.1 requires soroban-sdk-macros ^23.5.1.",
				sourceUrl: "https://index.crates.io/so/ro/soroban-sdk",
			},
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: ">= 25.0.0, <= 25.1.0",
				via: "soroban-sdk-macros",
				path: ["soroban-sdk", "soroban-sdk-macros"],
				targets: [null],
				pin: "minimum",
				appliesTo: "every build",
				basis:
					"soroban-sdk 25.0.0 to 25.1.0 (stable releases) reach soroban-sdk-macros through soroban-sdk > soroban-sdk-macros (crates.io index: normal, non-optional dependencies). At least one hop admits a range of versions, so Cargo.lock decides whether the version built is affected. Newest release in range: soroban-sdk 25.1.0 requires soroban-sdk-macros ^25.1.0.",
				sourceUrl: "https://index.crates.io/so/ro/soroban-sdk",
			},
		],
		asOf: "2026-11-12",
	},
	{
		ghsa: "GHSA-96xm-fv9w-pf3f",
		cve: "CVE-2026-24889",
		severity: "medium",
		summary:
			"soroban-sdk has overflow in Bytes::slice, Vec::slice, GenRange::gen_range for u64",
		source: "reviewed",
		url: `${DB}GHSA-96xm-fv9w-pf3f`,
		repository: "stellar/rs-soroban-sdk",
		publishedAt: "2026-01-28",
		affected: [
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: ">= 25.0.0, < 25.0.2",
				firstPatched: "25.0.2",
			},
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: ">= 23.0.0, < 23.5.1",
				firstPatched: "23.5.1",
			},
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: "< 22.0.9",
				firstPatched: "22.0.9",
			},
		],
		alsoAffects: [],
		asOf: "2026-11-12",
	},
	{
		ghsa: "GHSA-pm4j-7r4q-ccg8",
		cve: null,
		severity: "low",
		summary:
			"Soroban: Muxed address<->ScVal conversions may break after a conversion failure",
		source: "reviewed",
		url: `${DB}GHSA-pm4j-7r4q-ccg8`,
		repository: "stellar/rs-soroban-env",
		publishedAt: "2026-03-07",
		affected: [
			{
				ecosystem: "rust",
				package: "soroban-env-host",
				vulnerableRange: "< 26.0.0",
				firstPatched: "26.0.0",
			},
		],
		alsoAffects: [
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: ">= 0.0.2, <= 0.0.3",
				via: "soroban-env-host",
				path: ["soroban-sdk", "soroban-env-host"],
				targets: ['cfg(not(target_family = "wasm"))'],
				pin: "minimum",
				appliesTo: "host builds and tests, not the deployed wasm contract",
				basis:
					"soroban-sdk 0.0.2 to 0.0.3 (stable releases) reach soroban-env-host through soroban-sdk > soroban-env-host (crates.io index: normal, non-optional dependencies). At least one hop admits a range of versions, so Cargo.lock decides whether the version built is affected. Newest release in range: soroban-sdk 0.0.3 requires soroban-env-host ^0.0.3.",
				sourceUrl: "https://index.crates.io/so/ro/soroban-sdk",
			},
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: ">= 0.3.0, <= 0.9.2",
				via: "soroban-env-host",
				path: ["soroban-sdk", "soroban-env-host"],
				targets: ['cfg(not(target_family = "wasm"))'],
				pin: "minimum",
				appliesTo: "host builds and tests, not the deployed wasm contract",
				basis:
					"soroban-sdk 0.3.0 to 0.9.2 (stable releases) reach soroban-env-host through soroban-sdk > soroban-env-host (crates.io index: normal, non-optional dependencies). At least one hop admits a range of versions, so Cargo.lock decides whether the version built is affected. Newest release in range: soroban-sdk 0.9.2 requires soroban-env-host ^0.0.17.",
				sourceUrl: "https://index.crates.io/so/ro/soroban-sdk",
			},
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: ">= 0.0.4, <= 0.2.1",
				via: "soroban-env-host",
				path: [
					"soroban-sdk",
					"soroban-sdk-macros",
					"soroban-spec",
					"soroban-env-host",
				],
				targets: [null, null, null],
				pin: "minimum",
				appliesTo: "every build",
				basis:
					"soroban-sdk 0.0.4 to 0.2.1 (stable releases) reach soroban-env-host through soroban-sdk > soroban-sdk-macros > soroban-spec > soroban-env-host (crates.io index: normal, non-optional dependencies). At least one hop admits a range of versions, so Cargo.lock decides whether the version built is affected. Newest release in range: soroban-sdk 0.2.1 requires soroban-sdk-macros ^0.2.1, soroban-sdk-macros 0.2.1 requires soroban-spec ^0.2.1, soroban-spec 0.2.1 requires soroban-env-host ^0.0.9.",
				sourceUrl: "https://index.crates.io/so/ro/soroban-sdk",
			},
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: ">= 20.0.0, <= 25.3.2",
				via: "soroban-env-host",
				path: ["soroban-sdk", "soroban-env-host"],
				targets: ['cfg(not(target_family="wasm"))'],
				pin: "exact",
				appliesTo: "host builds and tests, not the deployed wasm contract",
				basis:
					"soroban-sdk 20.0.0 to 25.3.2 (stable releases) reach soroban-env-host through soroban-sdk > soroban-env-host (crates.io index: normal, non-optional dependencies). Every hop is an exact = requirement, so these builds compile an affected version. Newest release in range: soroban-sdk 25.3.2 requires soroban-env-host =25.2.2.",
				sourceUrl: "https://index.crates.io/so/ro/soroban-sdk",
			},
		],
		asOf: "2026-11-12",
	},
	{
		ghsa: "GHSA-3xhm-p452-9wjh",
		cve: null,
		severity: "medium",
		summary: "VecM serde deserialization does not enforce maximum length",
		source: "repository",
		url: "https://github.com/stellar/rs-stellar-xdr/security/advisories/GHSA-3xhm-p452-9wjh",
		repository: "stellar/rs-stellar-xdr",
		publishedAt: "2026-09-29",
		affected: [
			{
				ecosystem: "rust",
				package: "stellar-xdr",
				vulnerableRange: "< 28.0.1",
				firstPatched: "28.0.1",
			},
		],
		alsoAffects: [
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: ">= 0.0.2, <= 29.0.1",
				via: "stellar-xdr",
				path: ["soroban-sdk", "soroban-sdk-macros", "stellar-xdr"],
				targets: [null, null],
				pin: "minimum",
				appliesTo: "every build",
				basis:
					"soroban-sdk 0.0.2 to 29.0.1 (stable releases) reach stellar-xdr through soroban-sdk > soroban-sdk-macros > stellar-xdr (crates.io index: normal, non-optional dependencies). At least one hop admits a range of versions, so Cargo.lock decides whether the version built is affected. Newest release in range: soroban-sdk 29.0.1 requires soroban-sdk-macros ^29.0.1, soroban-sdk-macros 29.0.1 requires stellar-xdr =28.0.0.",
				sourceUrl: "https://index.crates.io/so/ro/soroban-sdk",
			},
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: ">= 20.0.0, <= 29.0.1",
				via: "stellar-xdr",
				path: [
					"soroban-sdk",
					"soroban-env-guest",
					"soroban-env-common",
					"stellar-xdr",
				],
				targets: ['cfg(target_family="wasm")', null, null],
				pin: "exact",
				appliesTo: "wasm contract builds only",
				basis:
					"soroban-sdk 20.0.0 to 29.0.1 (stable releases) reach stellar-xdr through soroban-sdk > soroban-env-guest > soroban-env-common > stellar-xdr (crates.io index: normal, non-optional dependencies). Every hop is an exact = requirement, so these builds compile an affected version. Newest release in range: soroban-sdk 29.0.1 requires soroban-env-guest =29.0.1, soroban-env-guest 29.0.1 requires soroban-env-common =29.0.1, soroban-env-common 29.0.1 requires stellar-xdr =28.0.0.",
				sourceUrl: "https://index.crates.io/so/ro/soroban-sdk",
			},
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: ">= 20.0.0, <= 29.0.1",
				via: "stellar-xdr",
				path: [
					"soroban-sdk",
					"soroban-env-host",
					"soroban-env-common",
					"stellar-xdr",
				],
				targets: ['cfg(not(target_family="wasm"))', null, null],
				pin: "exact",
				appliesTo: "host builds and tests, not the deployed wasm contract",
				basis:
					"soroban-sdk 20.0.0 to 29.0.1 (stable releases) reach stellar-xdr through soroban-sdk > soroban-env-host > soroban-env-common > stellar-xdr (crates.io index: normal, non-optional dependencies). Every hop is an exact = requirement, so these builds compile an affected version. Newest release in range: soroban-sdk 29.0.1 requires soroban-env-host =29.0.1, soroban-env-host 29.0.1 requires soroban-env-common =29.0.1, soroban-env-common 29.0.1 requires stellar-xdr =28.0.0.",
				sourceUrl: "https://index.crates.io/so/ro/soroban-sdk",
			},
		],
		asOf: "2026-11-12",
	},
	{
		ghsa: "GHSA-x57h-xx53-v53w",
		cve: "CVE-2026-29795",
		severity: "medium",
		summary: "stellar-xdr's StringM::from_str bypasses max length validation",
		source: "reviewed",
		url: `${DB}GHSA-x57h-xx53-v53w`,
		repository: "stellar/rs-stellar-xdr",
		publishedAt: "2026-03-05",
		affected: [
			{
				ecosystem: "rust",
				package: "stellar-xdr",
				vulnerableRange: "<= 25.0.0",
				firstPatched: "25.0.1",
			},
		],
		alsoAffects: [
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: ">= 0.0.2, <= 25.3.2",
				via: "stellar-xdr",
				path: ["soroban-sdk", "soroban-sdk-macros", "stellar-xdr"],
				targets: [null, null],
				pin: "minimum",
				appliesTo: "every build",
				basis:
					"soroban-sdk 0.0.2 to 25.3.2 (stable releases) reach stellar-xdr through soroban-sdk > soroban-sdk-macros > stellar-xdr (crates.io index: normal, non-optional dependencies). At least one hop admits a range of versions, so Cargo.lock decides whether the version built is affected. Newest release in range: soroban-sdk 25.3.2 requires soroban-sdk-macros ^25.3.2, soroban-sdk-macros 25.3.2 requires stellar-xdr =25.0.0.",
				sourceUrl: "https://index.crates.io/so/ro/soroban-sdk",
			},
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: ">= 20.0.0, <= 25.3.2",
				via: "stellar-xdr",
				path: [
					"soroban-sdk",
					"soroban-env-guest",
					"soroban-env-common",
					"stellar-xdr",
				],
				targets: ['cfg(target_family="wasm")', null, null],
				pin: "exact",
				appliesTo: "wasm contract builds only",
				basis:
					"soroban-sdk 20.0.0 to 25.3.2 (stable releases) reach stellar-xdr through soroban-sdk > soroban-env-guest > soroban-env-common > stellar-xdr (crates.io index: normal, non-optional dependencies). Every hop is an exact = requirement, so these builds compile an affected version. Newest release in range: soroban-sdk 25.3.2 requires soroban-env-guest =25.2.2, soroban-env-guest 25.2.2 requires soroban-env-common =25.2.2, soroban-env-common 25.2.2 requires stellar-xdr =25.0.0.",
				sourceUrl: "https://index.crates.io/so/ro/soroban-sdk",
			},
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: ">= 20.0.0, <= 25.3.2",
				via: "stellar-xdr",
				path: [
					"soroban-sdk",
					"soroban-env-host",
					"soroban-env-common",
					"stellar-xdr",
				],
				targets: ['cfg(not(target_family="wasm"))', null, null],
				pin: "exact",
				appliesTo: "host builds and tests, not the deployed wasm contract",
				basis:
					"soroban-sdk 20.0.0 to 25.3.2 (stable releases) reach stellar-xdr through soroban-sdk > soroban-env-host > soroban-env-common > stellar-xdr (crates.io index: normal, non-optional dependencies). Every hop is an exact = requirement, so these builds compile an affected version. Newest release in range: soroban-sdk 25.3.2 requires soroban-env-host =25.2.2, soroban-env-host 25.2.2 requires soroban-env-common =25.2.2, soroban-env-common 25.2.2 requires stellar-xdr =25.0.0.",
				sourceUrl: "https://index.crates.io/so/ro/soroban-sdk",
			},
		],
		asOf: "2026-11-12",
	},
	{
		ghsa: "GHSA-5873-6fwq-463f",
		cve: "CVE-2023-46135",
		severity: "medium",
		summary:
			"stellar-strkey vulnerable to panic in SignedPayload::from_payload",
		source: "reviewed",
		url: `${DB}GHSA-5873-6fwq-463f`,
		repository: "stellar/rs-stellar-strkey",
		publishedAt: "2023-10-25",
		affected: [
			{
				ecosystem: "rust",
				package: "stellar-strkey",
				vulnerableRange: "< 0.0.8",
				firstPatched: "0.0.8",
			},
		],
		alsoAffects: [
			{
				ecosystem: "rust",
				package: "soroban-sdk",
				vulnerableRange: ">= 0.0.6, <= 0.9.2",
				via: "stellar-strkey",
				path: ["soroban-sdk", "stellar-strkey"],
				targets: ['cfg(not(target_family = "wasm"))'],
				pin: "minimum",
				appliesTo: "host builds and tests, not the deployed wasm contract",
				basis:
					"soroban-sdk 0.0.6 to 0.9.2 (stable releases) reach stellar-strkey through soroban-sdk > stellar-strkey (crates.io index: normal, non-optional dependencies). At least one hop admits a range of versions, so Cargo.lock decides whether the version built is affected. Newest release in range: soroban-sdk 0.9.2 requires stellar-strkey ^0.0.7.",
				sourceUrl: "https://index.crates.io/so/ro/soroban-sdk",
			},
		],
		asOf: "2026-11-12",
	},
	{
		ghsa: "GHSA-6cgh-hjpw-q3gq",
		cve: "CVE-2021-32738",
		severity: "medium",
		summary:
			"Utils.readChallengeTx does not verify the server account signature",
		source: "reviewed",
		url: `${DB}GHSA-6cgh-hjpw-q3gq`,
		repository: "stellar/js-stellar-sdk",
		publishedAt: "2021-07-02",
		affected: [
			{
				ecosystem: "npm",
				package: "stellar-sdk",
				vulnerableRange: "< 8.2.3",
				firstPatched: "8.2.3",
			},
		],
		alsoAffects: [],
		asOf: "2026-11-12",
	},
];

/** active = the publisher's current package. deprecated = the registry
 * itself marks it deprecated (npm's `deprecated` field). renamed = the
 * publisher names a new package on the same registry; the old name still
 * resolves, unmarked. moved = the publisher names a new registry or scope;
 * the old one still receives releases for now. */
export const PACKAGE_STATUSES = [
	"active",
	"deprecated",
	"renamed",
	"moved",
] as const;

export interface SdkPackage {
	registry: SdkRegistry;
	name: string;
	/** owner/repo the registry names as the source; its repository
	 * advisories are watched. */
	repository: string;
	status: (typeof PACKAGE_STATUSES)[number];
	/** What the status covers when it is not the whole package; null = the
	 * whole package. */
	statusScope: string | null;
	replacement: { registry: SdkRegistry; name: string } | null;
	/** The publisher's own words: an exact excerpt of the source (markdown
	 * kept, whitespace collapsed); null for an active package. */
	statement: string | null;
	statementUrl: string | null;
	/** Major of the registry's latest stable release on asOf. */
	latestMajor: number;
	/** Versions the registry marks not for use: crates.io and JSR yanks, and
	 * npm versions deprecated one by one in a package that is not deprecated
	 * as a whole. [] = checked, none. */
	withdrawnVersions: string[];
	registryUrl: string;
	asOf: string;
}

const NPM = "https://www.npmjs.com/package/";
const CRATES = "https://crates.io/crates/";

export const SDK_PACKAGES: readonly SdkPackage[] = [
	{
		registry: "crates.io",
		name: "soroban-sdk",
		repository: "stellar/rs-soroban-sdk",
		status: "active",
		statusScope: null,
		replacement: null,
		statement: null,
		statementUrl: null,
		latestMajor: 29,
		withdrawnVersions: [
			"0.0.1",
			"0.0.2",
			"0.0.3",
			"0.0.4",
			"0.0.6",
			"0.1.0",
			"0.1.1",
			"0.2.0",
			"0.2.1",
			"0.3.0",
			"0.3.1",
			"0.3.2",
			"0.4.0",
			"0.4.1",
			"0.4.2",
			"0.4.3",
			"0.5.0",
			"0.6.0",
			"0.7.0",
			"0.8.0",
			"0.8.1",
			"0.8.2",
			"0.8.3",
			"0.8.4",
			"0.8.5",
			"0.8.6",
			"0.8.7",
			"0.9.0",
			"0.9.1",
			"0.9.2",
			"21.0.0",
		],
		registryUrl: `${CRATES}soroban-sdk`,
		asOf: "2026-11-12",
	},
	{
		// Listed for GHSA-4chv-4c6w-w254, which names this crate.
		registry: "crates.io",
		name: "soroban-sdk-macros",
		repository: "stellar/rs-soroban-sdk",
		status: "active",
		statusScope: null,
		replacement: null,
		statement: null,
		statementUrl: null,
		latestMajor: 29,
		withdrawnVersions: [
			"0.0.2",
			"0.0.3",
			"0.0.4",
			"0.0.6",
			"0.1.0",
			"0.1.1",
			"0.2.0",
			"0.2.1",
			"0.3.0",
			"0.3.1",
			"0.3.2",
			"0.4.0",
			"0.4.1",
			"0.4.2",
			"0.4.3",
			"0.5.0",
			"0.6.0",
			"0.7.0",
			"0.8.0",
			"0.8.1",
			"0.8.2",
			"0.8.3",
			"0.8.4",
			"0.8.5",
			"0.8.6",
			"0.8.7",
			"0.9.0",
			"0.9.1",
			"0.9.2",
		],
		registryUrl: `${CRATES}soroban-sdk-macros`,
		asOf: "2026-11-12",
	},
	{
		// Listed for GHSA-pm4j-7r4q-ccg8, which names this crate.
		registry: "crates.io",
		name: "soroban-env-host",
		repository: "stellar/rs-soroban-env",
		status: "active",
		statusScope: null,
		replacement: null,
		statement: null,
		statementUrl: null,
		latestMajor: 30,
		withdrawnVersions: [
			"0.0.1",
			"0.0.2",
			"0.0.3",
			"0.0.4",
			"0.0.5",
			"0.0.6",
			"0.0.7",
			"0.0.8",
			"0.0.9",
			"0.0.10",
			"0.0.11",
			"0.0.12",
			"0.0.13",
			"0.0.14",
			"0.0.15",
			"0.0.16",
			"0.0.17",
			"29.0.0",
		],
		registryUrl: `${CRATES}soroban-env-host`,
		asOf: "2026-11-12",
	},
	{
		// Listed for GHSA-x57h-xx53-v53w and GHSA-3xhm-p452-9wjh.
		registry: "crates.io",
		name: "stellar-xdr",
		repository: "stellar/rs-stellar-xdr",
		status: "active",
		statusScope: null,
		replacement: null,
		statement: null,
		statementUrl: null,
		latestMajor: 30,
		withdrawnVersions: [
			"0.0.1",
			"0.0.2",
			"0.0.6",
			"0.0.7",
			"0.0.8",
			"0.0.9",
			"0.0.10",
			"0.0.11",
			"0.0.12",
			"0.0.13",
			"0.0.14",
			"0.0.15",
			"0.0.16",
			"0.0.17",
		],
		registryUrl: `${CRATES}stellar-xdr`,
		asOf: "2026-11-12",
	},
	{
		// Listed for GHSA-5873-6fwq-463f, which names this crate.
		registry: "crates.io",
		name: "stellar-strkey",
		repository: "stellar/rs-stellar-strkey",
		status: "active",
		statusScope: null,
		replacement: null,
		statement: null,
		statementUrl: null,
		latestMajor: 1,
		withdrawnVersions: ["0.0.17"],
		registryUrl: `${CRATES}stellar-strkey`,
		asOf: "2026-11-12",
	},
	{
		registry: "crates.io",
		name: "stellar-cli",
		repository: "stellar/stellar-cli",
		status: "active",
		statusScope: null,
		replacement: null,
		statement: null,
		statementUrl: null,
		latestMajor: 30,
		withdrawnVersions: ["0.0.1"],
		registryUrl: `${CRATES}stellar-cli`,
		asOf: "2026-11-12",
	},
	{
		// Still published in step with stellar-cli (30.0.1 on 2026-11-03): the
		// crate is the library stellar-cli is built on (crates.io index:
		// stellar-cli 30.0.1 requires soroban-cli =30.0.1).
		registry: "crates.io",
		name: "soroban-cli",
		repository: "stellar/stellar-cli",
		status: "renamed",
		statusScope:
			"Installing or invoking the CLI binary (`cargo install soroban-cli`, the `soroban` command): renamed to stellar-cli and `stellar`. The crate remains a library, published in step with stellar-cli, which requires soroban-cli =30.0.1 at 30.0.1, so a soroban-cli dependency line is not deprecated use.",
		replacement: { registry: "crates.io", name: "stellar-cli" },
		statement: "Soroban CLI has been renamed to Stellar CLI.",
		statementUrl:
			"https://developers.stellar.org/docs/networks/software-versions",
		latestMajor: 30,
		withdrawnVersions: [
			"0.0.1",
			"0.0.2",
			"0.0.3",
			"0.0.4",
			"0.1.0",
			"0.1.1",
			"0.1.2",
			"0.2.0",
			"0.2.1",
			"0.3.1",
			"0.3.2",
			"0.3.3",
			"0.4.0",
			"0.5.0",
			"0.6.0",
			"0.7.0",
			"0.7.1",
			"0.8.0",
			"0.8.5",
			"0.8.7",
			"0.9.0",
			"0.9.1",
			"0.9.4",
		],
		registryUrl: `${CRATES}soroban-cli`,
		asOf: "2026-11-12",
	},
	{
		registry: "npm",
		name: "@stellar/stellar-sdk",
		repository: "stellar/js-stellar-sdk",
		status: "active",
		statusScope: null,
		replacement: null,
		statement: null,
		statementUrl: null,
		latestMajor: 17,
		withdrawnVersions: [],
		registryUrl: `${NPM}@stellar/stellar-sdk`,
		asOf: "2026-11-12",
	},
	{
		registry: "npm",
		name: "stellar-sdk",
		repository: "stellar/js-stellar-sdk",
		status: "deprecated",
		statusScope: null,
		replacement: { registry: "npm", name: "@stellar/stellar-sdk" },
		statement: "⚠️ This package has moved to @stellar/stellar-sdk! 🚚",
		statementUrl: `${NPM}stellar-sdk`,
		latestMajor: 13,
		withdrawnVersions: [],
		registryUrl: `${NPM}stellar-sdk`,
		asOf: "2026-11-12",
	},
	{
		registry: "npm",
		name: "@stellar/stellar-base",
		repository: "stellar/js-stellar-base",
		status: "deprecated",
		statusScope: null,
		replacement: { registry: "npm", name: "@stellar/stellar-sdk" },
		statement:
			"This package is now rolled into @stellar/stellar-sdk. Please use @stellar/stellar-sdk to continue receiving updates and support.",
		statementUrl: `${NPM}@stellar/stellar-base`,
		latestMajor: 15,
		withdrawnVersions: [],
		registryUrl: `${NPM}@stellar/stellar-base`,
		asOf: "2026-11-12",
	},
	{
		registry: "npm",
		name: "stellar-base",
		repository: "stellar/js-stellar-base",
		status: "deprecated",
		statusScope: null,
		replacement: { registry: "npm", name: "@stellar/stellar-base" },
		statement: "⚠️ This package has moved to @stellar/stellar-base! 🚚",
		statementUrl: `${NPM}stellar-base`,
		latestMajor: 13,
		withdrawnVersions: [],
		registryUrl: `${NPM}stellar-base`,
		asOf: "2026-11-12",
	},
	{
		registry: "npm",
		name: "soroban-client",
		repository: "stellar/js-soroban-client",
		status: "deprecated",
		statusScope: null,
		replacement: { registry: "npm", name: "@stellar/stellar-sdk" },
		statement:
			"⚠️ This package is now deprecated: transition to @stellar/stellar-sdk@latest, instead! 🚚 All future updates and bug fixes will happen there. Please refer to the migration guide for details on porting your codebase: https://github.com/stellar/js-soroban-client/tree/main/docs/migration.md",
		statementUrl: `${NPM}soroban-client`,
		latestMajor: 1,
		withdrawnVersions: [],
		registryUrl: `${NPM}soroban-client`,
		asOf: "2026-11-12",
	},
	{
		registry: "npm",
		name: "@stellar/freighter-api",
		repository: "stellar/freighter",
		status: "renamed",
		statusScope: null,
		replacement: { registry: "npm", name: "@stellar/varial-sdk" },
		statement:
			"`@stellar/varial-sdk` was previously published as `@stellar/freighter-api`. Dapps already using `@stellar/freighter-api` keep working; new methods are only added here.",
		statementUrl: `${NPM}@stellar/varial-sdk`,
		latestMajor: 6,
		withdrawnVersions: [],
		registryUrl: `${NPM}@stellar/freighter-api`,
		asOf: "2026-11-12",
	},
	{
		// Listed as the replacement its publisher names for freighter-api.
		registry: "npm",
		name: "@stellar/varial-sdk",
		repository: "stellar/freighter",
		status: "active",
		statusScope: null,
		replacement: null,
		statement: null,
		statementUrl: null,
		latestMajor: 7,
		withdrawnVersions: [],
		registryUrl: `${NPM}@stellar/varial-sdk`,
		asOf: "2026-11-12",
	},
	{
		registry: "npm",
		name: "@creit.tech/stellar-wallets-kit",
		repository: "Creit-Tech/Stellar-Wallets-Kit",
		status: "moved",
		statusScope: null,
		replacement: { registry: "jsr", name: "@creit-tech/stellar-wallets-kit" },
		statement:
			"The first version of the library was hosted in [NPM](https://www.npmjs.com/package/@creit.tech/stellar-wallets-kit) with a different workspace: `@creit.tech` vs the new `@creit-tech` user in JSR. To be compatible with old installations we are also pushing new code to the NPM package but be aware that at some point we will stop doing it, we suggest migrating to the new JSR workspace.",
		statementUrl:
			"https://github.com/Creit-Tech/Stellar-Wallets-Kit/blob/main/docs/files/installation.md",
		latestMajor: 2,
		withdrawnVersions: [],
		registryUrl: `${NPM}@creit.tech/stellar-wallets-kit`,
		asOf: "2026-11-12",
	},
	{
		// The @creit-tech scope exists on JSR only; npm answers 404 for it.
		registry: "jsr",
		name: "@creit-tech/stellar-wallets-kit",
		repository: "Creit-Tech/Stellar-Wallets-Kit",
		status: "active",
		statusScope: null,
		replacement: null,
		statement: null,
		statementUrl: null,
		latestMajor: 2,
		withdrawnVersions: [],
		registryUrl: "https://jsr.io/@creit-tech/stellar-wallets-kit",
		asOf: "2026-11-12",
	},
];

/** Where an idiom's pattern is meant to be searched: Rust source, build
 * configuration (Cargo, rustup, Makefiles, CI), or CLI invocations in
 * scripts, docs and CI. */
export const IDIOM_SCOPES = ["rust-source", "build-config", "cli"] as const;

export interface SdkIdiom {
	id: string;
	scope: (typeof IDIOM_SCOPES)[number];
	deprecated: string;
	replacement: string;
	/** JavaScript regular expression source, no flags, applied to one line
	 * at a time. A match is a place to look, not proof of use. */
	pattern: string;
	/** A string the pattern matches. */
	example: string;
	/** The first release where the deprecation applies. */
	appliesFrom: { name: string; version: string };
	/** The publisher's own words: an exact excerpt of the source (markdown
	 * kept, whitespace collapsed; release-note lines without their author and
	 * pull request link). */
	statement: string;
	sourceUrl: string;
	asOf: string;
}

const SDK_REL = "https://github.com/stellar/rs-soroban-sdk/releases/tag/";
const CLI_REL = "https://github.com/stellar/stellar-cli/releases/tag/";

/** Not every deprecation the publishers have made: the ones an agent is
 * likely to meet in a repository, each stated by an official source. A form
 * missing here is not a claim that it is current. */
export const SDK_IDIOMS: readonly SdkIdiom[] = [
	{
		id: "wasm32-unknown-unknown-target",
		scope: "build-config",
		deprecated: "wasm32-unknown-unknown",
		replacement: "wasm32v1-none (Rust 1.84 or later)",
		pattern: "wasm32-unknown-unknown",
		example: "rustup target add wasm32-unknown-unknown",
		appliesFrom: { name: "rustc", version: "1.82.0" },
		statement:
			"The `wasm32-unknown-unknown` target is **not supported** for building Soroban contracts when using Rust 1.82 or newer.",
		sourceUrl:
			"https://developers.stellar.org/docs/learn/fundamentals/contract-development/rust-dialect",
		asOf: "2026-11-12",
	},
	{
		id: "soroban-cli",
		scope: "cli",
		deprecated:
			"installing soroban-cli as a binary, or invoking the `soroban` command",
		replacement: "`cargo install stellar-cli`, and the `stellar` command",
		pattern:
			"\\bcargo\\s+install\\b.*\\bsoroban-cli\\b|\\bsoroban-cli\\s+(?:install|deploy)\\b|^\\s*(?:-\\s+)?(?:run:\\s+|RUN\\s+|\\$\\s+)?soroban\\s+contract\\s|(?:&&|;)\\s*soroban\\s+contract\\s",
		example: "cargo install --locked soroban-cli",
		appliesFrom: { name: "stellar-cli", version: "21.0.0" },
		statement: "Soroban CLI has been renamed to Stellar CLI.",
		sourceUrl: "https://developers.stellar.org/docs/networks/software-versions",
		asOf: "2026-11-12",
	},
	{
		id: "events-publish",
		scope: "rust-source",
		deprecated: "env.events().publish(topics, data)",
		replacement: "a #[contractevent] type, published with its publish method",
		pattern: "\\.events\\(\\)\\s*\\.publish\\(",
		example: 'env.events().publish((symbol_short!("x"),), 1u32);',
		appliesFrom: { name: "soroban-sdk", version: "23.0.0" },
		statement: "use the #[contractevent] macro on a contract event type",
		sourceUrl:
			"https://github.com/stellar/rs-soroban-sdk/blob/v23.0.0/soroban-sdk/src/events.rs",
		asOf: "2026-11-12",
	},
	{
		id: "register-contract",
		scope: "rust-source",
		deprecated: "Env::register_contract, Env::register_contract_wasm",
		replacement: "Env::register",
		pattern: "\\bregister_contract(?:_wasm)?\\(",
		example: "let id = env.register_contract(None, Contract);",
		appliesFrom: { name: "soroban-sdk", version: "22.0.0" },
		statement:
			"Add `register` and `register_at` fns to replace `register_contract`, `register_contract_with_constructor`, `register_contract_wasm`, `register_contract_wasm_with_constructor`",
		sourceUrl: `${SDK_REL}v22.0.0`,
		asOf: "2026-11-12",
	},
	{
		id: "update-current-contract-wasm",
		scope: "rust-source",
		deprecated: "Deployer::update_current_contract_wasm",
		replacement:
			"Deployer::update_current_contract with ContractExecutable::Wasm(hash)",
		pattern: "\\bupdate_current_contract_wasm\\(",
		example: "env.deployer().update_current_contract_wasm(new_wasm_hash);",
		appliesFrom: { name: "soroban-sdk", version: "28.0.0" },
		statement:
			"`deploy_contract` replaces `deploy_v2`, and `update_current_contract` replaces `update_current_contract_wasm`; the old ones still work but are deprecated. Wrap the Wasm hash in `ContractExecutable::Wasm(...)` to migrate.",
		sourceUrl: `${SDK_REL}v28.0.0`,
		asOf: "2026-11-12",
	},
	{
		id: "deploy-v2",
		scope: "rust-source",
		deprecated: "DeployerWithAddress::deploy_v2",
		replacement:
			"DeployerWithAddress::deploy_contract with ContractExecutable::Wasm(hash)",
		pattern: "\\bdeploy_v2\\(",
		example: ".deploy_v2(wasm_hash, ())",
		appliesFrom: { name: "soroban-sdk", version: "28.0.0" },
		statement:
			"`deploy_contract` replaces `deploy_v2`, and `update_current_contract` replaces `update_current_contract_wasm`; the old ones still work but are deprecated. Wrap the Wasm hash in `ContractExecutable::Wasm(...)` to migrate.",
		sourceUrl: `${SDK_REL}v28.0.0`,
		asOf: "2026-11-12",
	},
	{
		id: "contract-install",
		scope: "cli",
		deprecated: "stellar contract install",
		replacement: "stellar contract upload",
		pattern: "\\bstellar\\s+contract\\s+install\\b",
		example: "stellar contract install --wasm target/x.wasm",
		appliesFrom: { name: "stellar-cli", version: "22.3.0" },
		statement: "Deprecate `contract install` in favor of `contract upload`.",
		sourceUrl: `${CLI_REL}v22.3.0`,
		asOf: "2026-11-12",
	},
	{
		id: "contract-optimize",
		scope: "cli",
		deprecated: "stellar contract optimize",
		replacement: "stellar contract build --optimize",
		pattern: "\\bstellar\\s+contract\\s+optimize\\b",
		example: "stellar contract optimize --wasm target/x.wasm",
		appliesFrom: { name: "stellar-cli", version: "23.2.0" },
		statement:
			"**`stellar contract optimize`** → Use `stellar contract build --optimize`",
		sourceUrl: `${CLI_REL}v23.2.0`,
		asOf: "2026-11-12",
	},
	{
		id: "feestats",
		scope: "cli",
		deprecated: "stellar feestats",
		replacement: "stellar fees stats",
		pattern: "\\bstellar\\s+feestats\\b",
		example: "stellar feestats --network mainnet",
		appliesFrom: { name: "stellar-cli", version: "25.0.0" },
		statement: "`stellar feestats` -> Use `stellar fees stats`",
		sourceUrl: `${CLI_REL}v25.0.0`,
		asOf: "2026-11-12",
	},
	{
		id: "bindings-typescript",
		scope: "cli",
		deprecated: "stellar contract bindings typescript",
		replacement:
			"the js-stellar-sdk CLI (https://github.com/stellar/js-stellar-sdk#cli)",
		pattern: "\\bstellar\\s+contract\\s+bindings\\s+typescript\\b",
		example:
			"stellar contract bindings typescript --contract-id C... --output-dir x",
		appliesFrom: { name: "stellar-cli", version: "28.1.0" },
		statement:
			"TypeScript bindings are now deprecated (`stellar contract bindings typescript`) in favor of https://github.com/stellar/js-stellar-sdk#cli.",
		sourceUrl: `${CLI_REL}v28.1.0`,
		asOf: "2026-11-12",
	},
];
