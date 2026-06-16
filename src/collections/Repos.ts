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
		// computed grade (scripts/enrich-repos.ts via src/lib/repo-grade.ts)
		{ name: "repoScore", type: "number", defaultValue: 0, admin: { description: "0-100 quality grade (freshness + traction + authority)", position: "sidebar" } },
		{ name: "repoScoreLabel", type: "text", admin: { position: "sidebar" } },
		{ name: "lastEnrichedAt", type: "date", admin: { position: "sidebar" } },
		{ name: "enrichError", type: "text", admin: { position: "sidebar" } },
	],
};
