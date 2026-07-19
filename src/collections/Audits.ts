import type { CollectionConfig } from "payload";

/**
 * Security-audit registry: one row per audit REPORT (not per finding),
 * ingested from stellarsecurityportal.com by scripts/ingest-soroban-security.ts
 * alongside the full-text research chunks. This is the structured half of the
 * audit corpus — it exists so agents can ENUMERATE and FILTER audits
 * ("list all audits for Blend", "what has OtterSec audited on Stellar")
 * instead of hoping vector retrieval surfaces the right mangled chunk.
 *
 * Field semantics an agent must not misread:
 *   - projectSlug null = the audited codebase has no directory project
 *     (platform code, unindexed product) — NOT "unaudited project".
 *   - findingsTotal / severityCounts null = not yet extracted from the
 *     PDF-mangled report body — NOT zero findings. Deterministic
 *     extraction only; we never guess counts.
 */
export const Audits: CollectionConfig = {
	slug: "audits",
	admin: {
		useAsTitle: "title",
		defaultColumns: ["title", "auditor", "projectSlug", "publishedAt"],
	},
	access: { read: () => true },
	fields: [
		{
			name: "reportId",
			type: "number",
			required: true,
			index: true,
			unique: true,
			admin: {
				description: "stellarsecurityportal.com report id — natural key",
			},
		},
		{ name: "title", type: "text", required: true },
		{
			name: "reportUrl",
			type: "text",
			admin: { description: "https://stellarsecurityportal.com/report/{id}" },
		},
		{
			name: "auditor",
			type: "text",
			index: true,
			admin: {
				description:
					"Normalized auditor firm (homoglyph-repaired, canonical casing)",
			},
		},
		{
			name: "protocol",
			type: "text",
			admin: { description: "Audited protocol/codebase name, as published" },
		},
		{
			name: "projectSlug",
			type: "text",
			index: true,
			admin: {
				description:
					"Verified directory-project link. null = audited codebase has no directory project (NOT 'unaudited').",
			},
		},
		{ name: "projectName", type: "text" },
		{
			name: "linkBasis",
			type: "select",
			options: ["name-exact", "alias", "unmatched"],
			admin: {
				description:
					"Provenance of the projectSlug link (unmatched = verified no-match)",
			},
		},
		{
			name: "publishedAt",
			type: "date",
			admin: { description: "Report date as published by the portal" },
		},
		{
			name: "dateBasis",
			type: "select",
			options: ["published", "portal-record"],
			admin: {
				description:
					"published = a real date-stamp; portal-record = the portal stored a wall-clock timestamp (likely upload time) — do not treat as publication recency",
			},
		},
		{
			name: "observedAt",
			type: "date",
			admin: { description: "When our crawler last saw this report live" },
		},
		{
			name: "findingsTotal",
			type: "number",
			admin: {
				description:
					"Total findings, when deterministically extractable. null = unknown, NOT zero.",
			},
		},
		{
			name: "severityCounts",
			type: "json",
			admin: {
				description:
					"{critical, high, medium, low, informational} counts when deterministically extractable. null = unknown, NOT zero.",
			},
		},
		{
			name: "chunksIndexed",
			type: "number",
			defaultValue: 0,
			admin: {
				description:
					"How many full-text research chunks serve this report via /api/research",
			},
		},
	],
};
