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
	admin: { useAsTitle: "fullName", defaultColumns: ["fullName", "primaryLanguage", "stars", "repoScore", "lastCommitAt"] },
	access: { read: () => true },
	fields: [
		{ name: "fullName", type: "text", required: true, index: true, admin: { description: "owner/name — natural key" } },
		{ name: "owner", type: "text" },
		{ name: "name", type: "text" },
		{ name: "url", type: "text" },
		{ name: "description", type: "textarea" },
		{ name: "topics", type: "json", admin: { description: "GitHub topics (array of strings) — the tech signal for search (zk, soroban, oracle, ...)" } },
		{ name: "primaryLanguage", type: "text" },
		{ name: "stars", type: "number", defaultValue: 0 },
		{ name: "openIssues", type: "number", defaultValue: 0 },
		{ name: "lastCommitAt", type: "date" },
		{ name: "homepageUrl", type: "text" },
		{ name: "isFork", type: "checkbox", defaultValue: false },
		{ name: "isArchived", type: "checkbox", defaultValue: false },
		{ name: "readmeExcerpt", type: "textarea", admin: { description: "First ~4k chars of the README — the main recall signal (topics are sparse; READMEs name the tech: zk, snark, oracle...)" } },
		// link to the owning project + denormalized grade inputs
		{ name: "projectSlug", type: "text", index: true },
		{ name: "projectName", type: "text" },
		{ name: "hackathonWinner", type: "checkbox", defaultValue: false },
		{ name: "scfAwarded", type: "checkbox", defaultValue: false },
		{ name: "builderReputation", type: "number", defaultValue: 0, admin: { description: "0-1, from the owning builder's Stellar Passport (SCF tier / featured / activity)" } },
		// AI/judge code-review score (0-1) from hackathon evaluations — a far
		// stronger quality signal than stars (a 5/5-reviewed repo with 0 stars is
		// still a strong reference). Ingested by scripts/ingest-dora-evals.ts.
		{ name: "judgeScore", type: "number", admin: { description: "0-1 hackathon AI/judge review score", position: "sidebar" } },
		{ name: "judgedHackathon", type: "text", admin: { description: "hackathon this repo's judge score came from", position: "sidebar" } },
		// computed grade (scripts/enrich-repos.ts via src/lib/repo-grade.ts)
		{ name: "repoScore", type: "number", defaultValue: 0, admin: { description: "0-100 quality grade (freshness + traction + authority)", position: "sidebar" } },
		{ name: "repoScoreLabel", type: "text", admin: { position: "sidebar" } },
		{ name: "lastEnrichedAt", type: "date", admin: { position: "sidebar" } },
		{ name: "enrichError", type: "text", admin: { position: "sidebar" } },

		// ── Code-Truth Ledger (CTL) — code-signal + audit fields.
		// DECLARED here so the scanner (scripts/scan/*) can write them and
		// repoGrade can read codeDepth. All default null/pending; NOTHING writes
		// these until the guarded scanner ships — additive, ~compact, ~300B/doc.
		{
			// Relevance proof from the repo's actual source: strongest → weakest.
			name: "stellarProof",
			type: "select",
			options: ["cargo-sdk", "contract-macros", "js-sdk", "stellar-toml", "weak-mention", "none"],
			index: true,
			admin: { position: "sidebar", description: "Code-verified Stellar relevance (cargo-sdk strongest)" },
		},
		{ name: "codeDepth", type: "number", admin: { position: "sidebar", description: "0-1 Soroban code depth (feeds repoGrade)" } },
		{ name: "sorobanSdkVersion", type: "text", admin: { position: "sidebar", description: "Raw soroban-sdk version requirement (sourced fact)" } },
		{
			name: "versionStatus",
			type: "select",
			options: ["current", "supported", "deprecated", "unknown"],
			admin: { position: "sidebar", description: "soroban-sdk status vs latest protocol (unknown never lowers tier)" },
		},
		{ name: "contractMacroCount", type: "number", admin: { position: "sidebar" } },
		{ name: "isDeployableContract", type: "checkbox", admin: { position: "sidebar", description: "Cargo cdylib — real deployable contract" } },
		{ name: "hasAuthPatterns", type: "checkbox", admin: { position: "sidebar" } },
		{ name: "hasStoragePatterns", type: "checkbox", admin: { position: "sidebar" } },
		{ name: "hasEvents", type: "checkbox", admin: { position: "sidebar" } },
		{ name: "usesNoStd", type: "checkbox", admin: { position: "sidebar" } },
		{ name: "stellarJsDep", type: "text", admin: { position: "sidebar", description: "Matched @stellar/* JS dependency" } },
		// Anti-farm (additive; real code caps to 0).
		{ name: "farmScore", type: "number", admin: { position: "sidebar", description: "Farm signal count (>=2 = archive; real code forces 0)" } },
		{ name: "farmFlags", type: "json", admin: { position: "sidebar", description: "Farm reasons — so explain can say WHY it declined" } },
		// Soft relevance flag — legit-but-unproven Stellar repo, excluded from
		// inline codeReferences/explain routing but NEVER archived (reversible).
		{ name: "unverifiedStellar", type: "checkbox", index: true, admin: { position: "sidebar", description: "Alive but no code-proof — soft-excluded, never archived" } },
		// Scan lifecycle. pending = never successfully scanned (never demoted).
		{
			name: "codeScanState",
			type: "select",
			options: ["pending", "scanned", "error", "incomplete"],
			defaultValue: "pending",
			index: true,
			admin: { position: "sidebar", description: "CTL scan state — pending/error/incomplete are never demoted" },
		},
		{ name: "codeScanError", type: "text", admin: { position: "sidebar" } },
		{ name: "codeScanNote", type: "text", admin: { position: "sidebar", description: "e.g. submodule-contracts, tree-incomplete, blob-unreadable" } },
		{ name: "codeScannedAt", type: "date", admin: { position: "sidebar" } },
		// ── Audit trail — every code-signal change is explainable + rollbackable.
		{ name: "priorTier", type: "text", admin: { position: "sidebar", description: "Tier before the last CTL change (for rollback)" } },
		{ name: "tierReason", type: "json", admin: { position: "sidebar", description: "Why the tier changed (enum reasons)" } },
		{ name: "tierChangedAt", type: "date", admin: { position: "sidebar" } },
		{ name: "tierRunId", type: "text", index: true, admin: { position: "sidebar", description: "Scan run that set the signals — rollback key" } },
		{ name: "priorUnverified", type: "checkbox", admin: { position: "sidebar" } },
		{ name: "unverifiedRunId", type: "text", admin: { position: "sidebar" } },
	],
};
