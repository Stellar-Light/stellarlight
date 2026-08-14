import type { CollectionConfig } from "payload";

/**
 * Code references: GitHub repos in the Stellar ecosystem as flat, searchable,
 * graded entities. Powers /api/repos/search — the "searching for zk and getting
 * nothing about existing zk repos is unfortunate" gap. Repos are enriched from
 * the projects directory (scripts/enrich-repos.ts) with GitHub topics /
 * description / language / freshness, joined with our hackathon/SCF/prominence
 * signals into a `repoScore` quality grade.
 */
export const Repos: CollectionConfig = {
	slug: "repos",
	admin: {
		useAsTitle: "fullName",
		defaultColumns: [
			"fullName",
			"primaryLanguage",
			"stars",
			"repoScore",
			"lastCommitAt",
		],
	},
	access: { read: () => true },
	hooks: {
		// Internal knowledge notes are triage memory (why a long-tail repo
		// isn't worth surfacing/deep-indexing) and must never leave the DB
		// through ANY read path — including Payload's auto-exposed
		// /api/repos REST (public read). Filtered here at the collection
		// layer for unauthenticated reads; admin sessions still see them.
		// Serve-side filters in repo-search are a second, redundant layer.
		afterRead: [
			({ doc, req }) => {
				if (!req?.user) {
					if (Array.isArray(doc?.knowledgeNotes)) {
						doc.knowledgeNotes = doc.knowledgeNotes.filter(
							(n: { visibility?: string | null }) =>
								n?.visibility !== "internal",
						);
					}
					// Triage tags are internal verdicts (see repo-triage.ts) —
					// public surfaces express the same reality via tier +
					// activityState in neutral language.
					if (doc && "triageTags" in doc) doc.triageTags = undefined;
				}
				return doc;
			},
		],
	},
	fields: [
		{
			name: "fullName",
			type: "text",
			required: true,
			index: true,
			admin: { description: "owner/name — natural key" },
		},
		{ name: "owner", type: "text" },
		{ name: "name", type: "text" },
		{ name: "url", type: "text" },
		{ name: "description", type: "textarea" },
		{
			name: "topics",
			type: "json",
			admin: {
				description:
					"GitHub topics (array of strings) — the tech signal for search (zk, soroban, oracle, ...)",
			},
		},
		{ name: "primaryLanguage", type: "text" },
		{ name: "stars", type: "number", defaultValue: 0 },
		{ name: "openIssues", type: "number", defaultValue: 0 },
		{ name: "lastCommitAt", type: "date" },
		{
			// Repo-intel slice 2: velocity + release signals from the same enrich
			// GraphQL call. asOf dates the snapshot; null fields = unavailable at
			// fetch time, never zero.
			name: "activitySignals",
			type: "group",
			fields: [
				{ name: "commits90d", type: "number" },
				{ name: "lastReleaseAt", type: "date" },
				{ name: "releaseTag", type: "text" },
				{ name: "openPRs", type: "number" },
				{ name: "asOf", type: "date" },
			],
		},
		{
			// sls-064 analog: this repo is a SUPERSEDED generation; the named
			// repo is its successor. Curated via REPO_SUCCESSIONS
			// (src/lib/repo-relations.ts) — verified against the repos' own
			// statements, never inferred from names. Null = not superseded
			// (or not yet classified). Stamped wholesale by enrich each pass.
			name: "successorRepo",
			type: "text",
			index: true,
		},
		{
			// Repo-intel slice 3: dated facts with sources (curated map +
			// derived audit crosslink), rebuilt wholesale by enrich each pass —
			// see src/lib/repo-knowledge.ts for the discipline.
			name: "knowledgeNotes",
			type: "array",
			fields: [
				{ name: "note", type: "textarea", required: true },
				{ name: "source", type: "text", required: true },
				{ name: "asOf", type: "text" },
				{
					// public (default) serves everywhere; internal is triage
					// memory that never leaves the DB (serve-side filtered).
					name: "visibility",
					type: "select",
					options: ["public", "internal"],
					defaultValue: "public",
				},
			],
		},
		{ name: "homepageUrl", type: "text" },
		{ name: "isFork", type: "checkbox", defaultValue: false },
		{ name: "isArchived", type: "checkbox", defaultValue: false },
		{
			name: "readmeExcerpt",
			type: "textarea",
			admin: {
				description:
					"First ~4k chars of the README — the main recall signal (topics are sparse; READMEs name the tech: zk, snark, oracle...)",
			},
		},
		// link to the owning project + denormalized grade inputs
		{ name: "projectSlug", type: "text", index: true },
		{ name: "projectName", type: "text" },
		{ name: "hackathonWinner", type: "checkbox", defaultValue: false },
		{ name: "scfAwarded", type: "checkbox", defaultValue: false },
		{
			name: "builderReputation",
			type: "number",
			defaultValue: 0,
			admin: {
				description:
					"0-1, from the owning builder's Stellar Passport (SCF tier / featured / activity)",
			},
		},
		// AI/judge code-review score (0-1) from hackathon evaluations — a far
		// stronger quality signal than stars (a 5/5-reviewed repo with 0 stars is
		// still a strong reference). Ingested by scripts/ingest-dora-evals.ts.
		{
			name: "judgeScore",
			type: "number",
			admin: {
				description: "0-1 hackathon AI/judge review score",
				position: "sidebar",
			},
		},
		{
			name: "judgedHackathon",
			type: "text",
			admin: {
				description: "hackathon this repo's judge score came from",
				position: "sidebar",
			},
		},
		// computed grade (scripts/enrich-repos.ts via src/lib/repo-grade.ts)
		{
			name: "repoScore",
			type: "number",
			defaultValue: 0,
			admin: {
				description: "0-100 quality grade (freshness + traction + authority)",
				position: "sidebar",
			},
		},
		{ name: "repoScoreLabel", type: "text", admin: { position: "sidebar" } },
		{ name: "lastEnrichedAt", type: "date", admin: { position: "sidebar" } },
		{ name: "enrichError", type: "text", admin: { position: "sidebar" } },
		{
			// INTERNAL structured triage labels (src/lib/repo-triage.ts) —
			// derived from stored signals each enrich pass, stripped for
			// unauthenticated reads by the afterRead hook. Drives scan-wave
			// skip decisions; never drives public copy.
			name: "triageTags",
			type: "select",
			hasMany: true,
			options: [
				"dead-hackathon-project",
				"farm-signals",
				"inert-fork",
				"archived-upstream",
				"dead-long-tail",
				"tutorial-or-template",
			],
			index: true,
			admin: { position: "sidebar", description: "Internal triage labels — never served" },
		},
		{
			// Discovery provenance: how this repo entered the index. Project-linked
			// repos come from the curated directory's github links (enrich-repos);
			// ec-taxonomy repos come from Electric Capital's public crypto-ecosystems
			// list (ingest-ec-taxonomy). Forever distinguishable for trust/filtering.
			name: "source",
			type: "select",
			options: ["project-link", "ec-taxonomy"],
			defaultValue: "project-link",
			index: true,
			admin: { position: "sidebar", description: "How this repo entered the index" },
		},
		{
			// Quality tier (tag-and-demote, never delete — the Inactive-projects
			// pattern): archive = archived/dead-and-unstarred (name-searchable but
			// sinks in ranking, excluded from inline codeReferences); community =
			// alive but unproven; quality = repoScoreLabel high. Computed at
			// ingest/enrich time.
			name: "tier",
			type: "select",
			options: ["quality", "community", "archive"],
			defaultValue: "community",
			index: true,
			admin: { position: "sidebar", description: "Quality tier — archive is demoted, never deleted" },
		},

		// ── Code-Truth Ledger (CTL) — code-signal + audit fields.
		// DECLARED here so the scanner (scripts/scan/*) can write them and
		// repoGrade can read codeDepth. All default null/pending; NOTHING writes
		// these until the guarded scanner ships — additive, ~compact, ~300B/doc.
		{
			// Relevance proof from the repo's actual source: strongest → weakest.
			name: "stellarProof",
			type: "select",
			options: [
				"cargo-sdk",
				"contract-macros",
				"js-sdk",
				"lang-sdk",
				"stellar-toml",
				"weak-mention",
				"none",
			],
			index: true,
			admin: {
				position: "sidebar",
				description: "Code-verified Stellar relevance (cargo-sdk strongest)",
			},
		},
		{
			name: "codeDepth",
			type: "number",
			admin: {
				position: "sidebar",
				description: "0-1 Soroban code depth (feeds repoGrade)",
			},
		},
		{
			name: "sorobanSdkVersion",
			type: "text",
			admin: {
				position: "sidebar",
				description: "Raw soroban-sdk version requirement (sourced fact)",
			},
		},
		{
			name: "versionStatus",
			type: "select",
			options: ["current", "supported", "deprecated", "unknown"],
			admin: {
				position: "sidebar",
				description:
					"soroban-sdk status vs latest protocol (unknown never lowers tier)",
			},
		},
		{
			// Engineering-practice presence facts from the code scan (tree-level):
			// "has a CI config" / "has test files" — presence only, never a claim
			// CI passes or coverage is good. Written by scan-repo-code.
			name: "ciPresent",
			type: "checkbox",
		},
		{ name: "testsPresent", type: "checkbox" },
		{
			name: "contractMacroCount",
			type: "number",
			admin: { position: "sidebar" },
		},
		{
			name: "isDeployableContract",
			type: "checkbox",
			admin: {
				position: "sidebar",
				description: "Cargo cdylib — real deployable contract",
			},
		},
		{
			name: "hasAuthPatterns",
			type: "checkbox",
			admin: { position: "sidebar" },
		},
		{
			name: "hasStoragePatterns",
			type: "checkbox",
			admin: { position: "sidebar" },
		},
		{ name: "hasEvents", type: "checkbox", admin: { position: "sidebar" } },
		{ name: "usesNoStd", type: "checkbox", admin: { position: "sidebar" } },
		{
			name: "stellarJsDep",
			type: "text",
			admin: {
				position: "sidebar",
				description: "Matched @stellar/* JS dependency",
			},
		},
		// Anti-farm (additive; real code caps to 0).
		{
			name: "farmScore",
			type: "number",
			admin: {
				position: "sidebar",
				description: "Farm signal count (>=2 = archive; real code forces 0)",
			},
		},
		{
			name: "farmFlags",
			type: "json",
			admin: {
				position: "sidebar",
				description: "Farm reasons — so explain can say WHY it declined",
			},
		},
		// Public code-symbol surface (pub fn/struct/enum/trait names) extracted
		// from the scanned sources — lets search match what a repo IMPLEMENTS
		// ("escrow" ⇢ release_escrow), not just what its README says.
		{
			name: "codeSymbols",
			type: "json",
			admin: {
				position: "sidebar",
				description:
					"Extracted pub fn/type names (array of strings) — code-content search signal",
			},
		},
		{
			name: "contractInterface",
			type: "json",
			admin: {
				position: "sidebar",
				description:
					"Soroban contract ABI (array of strings): pub fn signatures per #[contractimpl] block, Contract.fn(args) -> ret",
			},
		},
		{
			name: "stellarDeps",
			type: "json",
			admin: {
				position: "sidebar",
				description:
					"Stellar-ecosystem dependencies (array of package names) from Cargo.toml/package.json — allowlist-matched, the dependency-graph signal",
			},
		},
		{
			name: "sdkCapabilities",
			type: "json",
			admin: {
				position: "sidebar",
				description:
					"JS/TS SDK capability tags (tx-building, signing, soroban-rpc, x402, mpp, \u2026) detected in actual sources \u2014 computed since 2026-07-09 but unpersisted until 2026-08-12 (write-shape omitted it)",
			},
		},
		{
			// Evidence-only domain labels (src/lib/code-domains.ts): what the
			// CODE proves the repo does (defi-lending, defi-amm, oracle,
			// payments-x402, wallet-infra, anchor-ramp, indexer, \u2026) \u2014 derived
			// from deps + capability tags + interface traits at scan time,
			// never from topics/README self-description.
			name: "codeDomains",
			type: "json",
			index: true,
			admin: {
				position: "sidebar",
				description: "Code-evidence domain labels (scanner-derived)",
			},
		},
		{
			name: "scannedRef",
			type: "text",
			admin: {
				position: "sidebar",
				description:
					"Commit SHA of the default branch the code facts were computed at — provenance pin (github.com/<fullName>/tree/<scannedRef>)",
			},
		},
		{
			name: "mainnetContractId",
			type: "text",
			admin: {
				position: "sidebar",
				description:
					"README contract id VERIFIED live on Stellar mainnet via stellar.expert (scanner)",
			},
		},
		// Soft relevance flag — legit-but-unproven Stellar repo, excluded from
		// inline codeReferences/explain routing but NEVER archived (reversible).
		{
			name: "unverifiedStellar",
			type: "checkbox",
			index: true,
			admin: {
				position: "sidebar",
				description: "Alive but no code-proof — soft-excluded, never archived",
			},
		},
		// Scan lifecycle. pending = never successfully scanned (never demoted).
		{
			name: "codeScanState",
			type: "select",
			options: ["pending", "scanned", "error", "incomplete"],
			defaultValue: "pending",
			index: true,
			admin: {
				position: "sidebar",
				description:
					"CTL scan state — pending/error/incomplete are never demoted",
			},
		},
		{ name: "codeScanError", type: "text", admin: { position: "sidebar" } },
		{
			name: "codeScanNote",
			type: "text",
			admin: {
				position: "sidebar",
				description:
					"e.g. submodule-contracts, tree-incomplete, blob-unreadable",
			},
		},
		{ name: "codeScannedAt", type: "date", admin: { position: "sidebar" } },
		{
			// Code-in-use (code-truth track): rollup of LIVE mainnet activity for
			// contracts attributed to this repo (scanner-verified contract ids +
			// stellar.expert wasm validation). Written ONLY by
			// scripts/data/enrich-onchain-projects.ts (weekly). Deltas null until
			// a second snapshot exists — never zero.
			name: "codeInUse",
			type: "group",
			admin: {
				description:
					"Mainnet usage rollup for contracts attributed to this repo. Populated by enrich-onchain-projects only; absent = no verified contract joined, NOT 'unused'.",
			},
			fields: [
				{ name: "contracts", type: "number" },
				{ name: "events", type: "number" },
				{ name: "eventsDelta", type: "number" },
				{ name: "subinvocations", type: "number" },
				{ name: "subinvocationsDelta", type: "number" },
				{ name: "asOf", type: "text" },
			],
		},
		// ── Audit trail — every code-signal change is explainable + rollbackable.
		{
			name: "priorTier",
			type: "text",
			admin: {
				position: "sidebar",
				description: "Tier before the last CTL change (for rollback)",
			},
		},
		{
			name: "tierReason",
			type: "json",
			admin: {
				position: "sidebar",
				description: "Why the tier changed (enum reasons)",
			},
		},
		{ name: "tierChangedAt", type: "date", admin: { position: "sidebar" } },
		{
			name: "tierRunId",
			type: "text",
			index: true,
			admin: {
				position: "sidebar",
				description: "Scan run that set the signals — rollback key",
			},
		},
		{
			name: "priorUnverified",
			type: "checkbox",
			admin: { position: "sidebar" },
		},
		{ name: "unverifiedRunId", type: "text", admin: { position: "sidebar" } },
	],
};
