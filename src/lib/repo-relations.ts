/**
 * Curated repo-generation relations (sls-064 analog A, 2026-08-14).
 *
 * Repo families ship successor generations (blend-contracts →
 * blend-contracts-v2) and nothing on either row said so — an agent asking
 * for "blend contracts" got the dormant, superseded generation ranked
 * first. Same class as the audit-report relations: the relation must be
 * SERVED, and never guessed.
 *
 * DISCIPLINE (mirrors AUDIT_RELATIONS): keys are lowercase fullNames of the
 * SUPERSEDED repo; values name the successor exactly as GitHub spells it.
 * Only add pairs verified against the repos' own READMEs/org statements —
 * a name ending in -v2 is a CANDIDATE, never proof. Date every entry.
 * Enrich re-stamps wholesale each pass, so this map is the single truth.
 */
export type SupersessionKind =
	| "archived"
	| "renamed"
	| "deprecated"
	| "superseded";

export interface RepoSupersession {
	/** archived = GitHub archived the repo; renamed = the path 301s to a new
	 *  one; deprecated = the package/repo carries a deprecation notice;
	 *  superseded = a newer generation exists and the repo says so. */
	kind: SupersessionKind;
	/** Where to go instead, as GitHub spells it; null when the repo names no
	 *  successor (an archived demo, a deprecated SDK with "no direct successor"). */
	supersededBy: string | null;
	/** The date the repo itself gives (GitHub's archive banner, a release
	 *  notice) as YYYY-MM-DD — null when only the date WE READ it is known.
	 *  Never the read date: that would date our visit, not the fact. */
	deprecatedAt: string | null;
	/** The repo's own statement, quoted — the evidence, not our paraphrase. */
	source: string;
	/** When the statement was read (YYYY-MM-DD). */
	asOf: string;
}

/**
 * Curated repo supersession, keyed by lowercase fullName of the repo that IS
 * superseded (P5, 2026-09-05). Every entry is the repo's own statement —
 * GitHub's archive banner, a README "this repository has moved", an npm
 * deprecation notice — read on asOf and quoted in `source`. These facts lived
 * in knowledgeNotes prose, which a consumer had to read; now they are fields
 * a consumer can join on.
 *
 * DISCIPLINE. A successor is never inferred from a name (a repo ending in
 * -v2 is a candidate, not proof). A case-only path change is not a rename.
 * A repo whose OLDER PACKAGES are deprecated in its favour (js-stellar-sdk,
 * typescript-wallet-sdk, js-xdr) is the successor, not superseded, and is
 * deliberately absent here. deprecatedAt is the repo's date or null — the
 * kotlin-wallet-sdk banner gives no date, so its entry says null rather than
 * the day we looked.
 */
export const REPO_SUPERSESSIONS: Record<string, RepoSupersession> = {
	"blend-capital/blend-contracts": {
		kind: "superseded",
		supersededBy: "blend-capital/blend-contracts-v2",
		deprecatedAt: null,
		source:
			"README points to the v2 repo as the live protocol generation; v1 dormant since 2024-05",
		asOf: "2026-08-14",
	},
	"stellar/go": {
		kind: "archived",
		supersededBy: "stellar/go-stellar-sdk",
		deprecatedAt: null,
		source:
			"README header: 'REPOSITORY DEPRECATED — This repository has been moved to github.com/stellar/go-stellar-sdk'; GitHub archived:true",
		asOf: "2026-09-01",
	},
	"stellar/js-soroban-client": {
		kind: "archived",
		supersededBy: "stellar/js-stellar-sdk",
		deprecatedAt: "2025-03-11",
		source:
			"GitHub banner 'archived by the owner on Mar 11, 2025'; README 'Deprecation Notice': deprecated in favor of stellar/js-stellar-sdk",
		asOf: "2026-09-01",
	},
	"stellar/js-stellar-base": {
		kind: "deprecated",
		supersededBy: "stellar/js-stellar-sdk",
		deprecatedAt: null,
		source:
			"npm: every version of @stellar/stellar-base carries 'This package is now rolled into @stellar/stellar-sdk'; README: future updates ship only in @stellar/stellar-sdk",
		asOf: "2026-09-01",
	},
	"stellar/django-polaris": {
		kind: "archived",
		supersededBy: null,
		deprecatedAt: "2025-05-23",
		source: "GitHub banner 'archived by the owner on May 23, 2025'",
		asOf: "2026-09-01",
	},
	"stellar/kotlin-wallet-sdk": {
		kind: "archived",
		supersededBy: null,
		deprecatedAt: null,
		source:
			"GitHub archived:true; README banner: 'This SDK is deprecated and no longer maintained… There is no direct Kotlin/Java successor.'",
		asOf: "2026-09-01",
	},
	"stellar/wallet-backend-client": {
		kind: "archived",
		supersededBy: null,
		deprecatedAt: null,
		source:
			"GitHub archived:true; README: 'not currently under active development'; the documented npm package was never published",
		asOf: "2026-09-01",
	},
	"stellar/stellar-turrets": {
		kind: "archived",
		supersededBy: null,
		deprecatedAt: "2026-01-08",
		source: "GitHub banner 'archived by the owner on Jan 8, 2026'",
		asOf: "2026-09-02",
	},
	"stellar/core-node-admin-panel": {
		kind: "archived",
		supersededBy: null,
		deprecatedAt: "2024-06-06",
		source: "GitHub banner 'archived by the owner on Jun 6, 2024'",
		asOf: "2026-09-02",
	},
	"stellar/sep-smart-wallet": {
		kind: "archived",
		supersededBy: null,
		deprecatedAt: "2026-01-30",
		source: "GitHub banner 'archived by the owner on Jan 30, 2026'",
		asOf: "2026-09-01",
	},
	"stellar/amm-reference-ui": {
		kind: "archived",
		supersededBy: null,
		deprecatedAt: "2025-05-01",
		source: "GitHub banner 'archived by the owner on May 1, 2025'",
		asOf: "2026-09-01",
	},
	"stellar/recoverysigner-demo-client": {
		kind: "archived",
		supersededBy: null,
		deprecatedAt: "2025-03-26",
		source: "GitHub banner 'archived by the owner on Mar 26, 2025'",
		asOf: "2026-09-01",
	},
	"stellar-deprecated/horizon": {
		kind: "archived",
		supersededBy: "stellar/stellar-horizon",
		deprecatedAt: "2020-01-22",
		source:
			"GitHub banner 'archived by the owner on Jan 22, 2020'; Horizon lives in stellar/stellar-horizon",
		asOf: "2026-09-01",
	},
	"stellar-deprecated/horizon-importer": {
		kind: "archived",
		supersededBy: "stellar/stellar-horizon",
		deprecatedAt: "2019-11-16",
		source:
			"GitHub banner 'archived by the owner on Nov 16, 2019'; README: 'not in active development anymore. Please use https://github.com/stellar/horizon' — which now lives in stellar/stellar-horizon",
		asOf: "2026-09-01",
	},
	"stellar-deprecated/bridge-server": {
		kind: "archived",
		supersededBy: null,
		deprecatedAt: "2019-09-12",
		source: "GitHub banner 'archived by the owner on Sep 12, 2019'",
		asOf: "2026-09-01",
	},
	"stellar-deprecated/transfer-server-validator": {
		kind: "archived",
		supersededBy: null,
		deprecatedAt: "2021-12-15",
		source: "GitHub banner 'archived by the owner on Dec 15, 2021'",
		asOf: "2026-09-02",
	},
	"stellar-deprecated/sep24-demo-client": {
		kind: "archived",
		supersededBy: null,
		deprecatedAt: "2023-11-07",
		source: "GitHub banner 'archived by the owner on Nov 7, 2023'",
		asOf: "2026-09-02",
	},
	"stellar-deprecated/sep31-demo-client": {
		kind: "archived",
		supersededBy: null,
		deprecatedAt: "2023-11-07",
		source: "GitHub banner 'archived by the owner on Nov 7, 2023'",
		asOf: "2026-09-02",
	},
	"stellar-deprecated/auth-required-tokens-manager": {
		kind: "archived",
		supersededBy: null,
		deprecatedAt: "2024-07-01",
		source: "GitHub banner 'archived by the owner on Jul 1, 2024'",
		asOf: "2026-09-02",
	},
	"stellar-deprecated/network-explorer": {
		kind: "archived",
		supersededBy: null,
		deprecatedAt: "2019-11-16",
		source: "GitHub banner 'archived by the owner on Nov 16, 2019'",
		asOf: "2026-09-02",
	},
	"kalepail/passkey-kit": {
		kind: "archived",
		supersededBy: "stellar/passkey-kit",
		deprecatedAt: null,
		source:
			"GitHub archived:true; README: 'This repository has moved… Development of passkey-kit now happens at stellar/passkey-kit… all tags were carried over.'",
		asOf: "2026-09-01",
	},
	"kalepail/smart-account-kit": {
		kind: "archived",
		supersededBy: "stellar/smart-account-kit",
		deprecatedAt: null,
		source:
			"GitHub archived:true; README: 'This repository has moved. Development continues at github.com/stellar/smart-account-kit'",
		asOf: "2026-09-01",
	},
	"soroswap/frontend": {
		kind: "archived",
		supersededBy: null,
		deprecatedAt: "2026-07-24",
		source: "GitHub banner 'archived by the owner on Jul 24, 2026'",
		asOf: "2026-09-02",
	},
	"soroswap/spacewalk-implementation": {
		kind: "archived",
		supersededBy: null,
		deprecatedAt: "2026-07-24",
		source: "GitHub banner 'archived by the owner on Jul 24, 2026'",
		asOf: "2026-09-02",
	},
	"soroswap/phoenix-zephyr-indexer": {
		kind: "archived",
		supersededBy: null,
		deprecatedAt: "2026-07-24",
		source: "GitHub banner 'archived by the owner on Jul 24, 2026'",
		asOf: "2026-09-02",
	},
	"lobstrco/stellar-core-parallel-catchup-py": {
		kind: "archived",
		supersededBy: null,
		deprecatedAt: "2026-06-22",
		source: "GitHub banner 'archived by the owner on Jun 22, 2026'",
		asOf: "2026-09-02",
	},
	"sorobanhooks/freighter": {
		kind: "renamed",
		supersededBy: "sorobanhooks/aptopia-wallet",
		deprecatedAt: null,
		source:
			"path redirects to github.com/sorobanhooks/aptopia-wallet (HTTP 301)",
		asOf: "2026-09-02",
	},
	"ebubechi-ihediwa/verix": {
		kind: "renamed",
		supersededBy: "verixhq/Verix",
		deprecatedAt: null,
		source: "path redirects to github.com/verixhq/Verix (HTTP 301)",
		asOf: "2026-09-02",
	},
	"leomanza/near-shade-coordination": {
		kind: "renamed",
		supersededBy: "leomanza/delibera.xyz",
		deprecatedAt: null,
		source: "path redirects to github.com/leomanza/delibera.xyz (HTTP 301)",
		asOf: "2026-09-02",
	},
	"leojay-net/stellar-agent-flow": {
		kind: "renamed",
		supersededBy: "Pridex-Org/Stellar-Agent-Flow",
		deprecatedAt: null,
		source:
			"path redirects to github.com/Pridex-Org/Stellar-Agent-Flow (HTTP 301)",
		asOf: "2026-09-02",
	},
	"t0k1dev/vendly": {
		kind: "renamed",
		supersededBy: "tokidev-ai/vendly",
		deprecatedAt: null,
		source: "path redirects to github.com/tokidev-ai/vendly (HTTP 301)",
		asOf: "2026-09-02",
	},
	"treblelegacy/x402-agents-stellar-project": {
		kind: "renamed",
		supersededBy: "pwsaragossy/x402-agents-stellar-project",
		deprecatedAt: null,
		source:
			"path redirects to github.com/pwsaragossy/x402-agents-stellar-project (HTTP 301)",
		asOf: "2026-09-02",
	},
	"devasignhq/soroban-contract": {
		kind: "renamed",
		supersededBy: "devasignhq/bounty-escrow",
		deprecatedAt: null,
		source:
			"path redirects to devasignhq/bounty-escrow (GitHub API resolves the rename)",
		asOf: "2026-09-02",
	},
	"ericmt-98/micopay-mvp": {
		kind: "renamed",
		supersededBy: "Micopay/micopay-protocol",
		deprecatedAt: null,
		source: "path redirects to github.com/Micopay/micopay-protocol (HTTP 301)",
		asOf: "2026-09-02",
	},
};

/**
 * The successor view enrich-repos stamps into `successorRepo` — derived, so
 * the dated map above is the single truth and the weekly pass needs no change.
 */
export const REPO_SUCCESSIONS: Record<string, string> = Object.fromEntries(
	Object.entries(REPO_SUPERSESSIONS)
		.filter(([, v]) => v.supersededBy)
		.map(([k, v]) => [k, v.supersededBy as string]),
);

/** The supersession fields a repo row serves, or null when the repo has none. */
export function repoSupersession(fullName: string): {
	supersededBy: string | null;
	deprecatedAt: string | null;
	supersessionKind: SupersessionKind;
} | null {
	const s = REPO_SUPERSESSIONS[fullName.toLowerCase()];
	return s
		? {
				supersededBy: s.supersededBy,
				deprecatedAt: s.deprecatedAt,
				supersessionKind: s.kind,
			}
		: null;
}
