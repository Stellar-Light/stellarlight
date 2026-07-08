import type { CollectionConfig } from "payload";

/**
 * CommunitySkills — third-party-submitted entries in the Stellar AI skills
 * marketplace. Anyone can POST a submission via /api/community-skills; it
 * lands here with `status: "pending"`. Admin reviews and flips to
 * "approved" (shows in /skills marketplace) or "rejected".
 *
 * Curated entries we control directly (Stellarlight + lumenloop + future
 * Stellar-Light skills) live in src/lib/integrations/curated-skills.ts as
 * a hardcoded constant — no need for an admin UI for those.
 *
 * SDF skills come from the skills.stellar.org proxy in
 * src/lib/integrations/sdf-skills.ts.
 *
 * The /api/skills endpoint merges all three sources into one response.
 */
export const CommunitySkills: CollectionConfig = {
	slug: "community-skills",
	admin: {
		useAsTitle: "name",
		defaultColumns: ["name", "status", "kind", "submittedBy", "submittedAt"],
		group: "Scout",
		description:
			"Community-submitted AI skills for the Stellar marketplace. POST submissions land here as 'pending' — review and approve to publish.",
	},
	access: {
		// Anyone can submit via POST /api/community-skills (which uses the
		// Local API and is gated by validation + rate limits there).
		create: () => false, // disallow create via REST/GraphQL; route handler uses Local API
		read: ({ req }) => !!req.user,
		update: ({ req }) => !!req.user,
		delete: ({ req }) => !!req.user,
	},
	fields: [
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "pending",
			index: true,
			options: [
				{ label: "Pending review", value: "pending" },
				{ label: "Approved", value: "approved" },
				{ label: "Rejected", value: "rejected" },
			],
		},
		{
			name: "name",
			type: "text",
			required: true,
			admin: {
				description:
					"Display name shown on the skill card (e.g. 'Soroban Audit Helper').",
			},
		},
		{
			name: "slug",
			type: "text",
			required: true,
			unique: true,
			index: true,
			admin: {
				description: "URL-safe slug (kebab-case). Used as the dedup key.",
			},
		},
		{
			name: "tagline",
			type: "text",
			required: true,
			maxLength: 160,
			admin: {
				description: "One-line tagline (≤ 160 chars).",
			},
		},
		{
			name: "description",
			type: "textarea",
			required: true,
			admin: {
				description: "Longer description (1-2 paragraphs).",
			},
		},
		{
			name: "kind",
			type: "select",
			required: true,
			index: true,
			options: [
				{ label: "SKILL.md (vercel-labs/skills)", value: "skill-md" },
				{ label: "MCP server", value: "mcp-server" },
				{ label: "SDK (library you import)", value: "sdk" },
				{ label: "CLI (command-line tool)", value: "cli" },
				{ label: "Agent kit (SDK for AI agents)", value: "agent-kit" },
				{ label: "Other tool", value: "tool" },
			],
		},
		{
			name: "install",
			type: "text",
			required: true,
			admin: {
				description:
					'Install command shown on the card (e.g. "npx skills add user/skill").',
			},
		},
		{
			name: "repository",
			type: "text",
			admin: {
				description: "GitHub repo URL.",
			},
		},
		{
			name: "homepage",
			type: "text",
			admin: {
				description: "Homepage / landing page URL.",
			},
		},
		{
			name: "docs",
			type: "text",
			admin: {
				description: "Documentation URL.",
			},
		},
		{
			name: "compatibility",
			type: "array",
			fields: [{ name: "agent", type: "text" }],
			admin: {
				description: "Compatible agents (Claude Code, Cursor, ChatGPT, etc.).",
			},
		},
		{
			name: "targetUser",
			type: "select",
			hasMany: true,
			options: [
				{ label: "Developers", value: "dev" },
				{ label: "Founders / non-developers", value: "founder" },
				{ label: "AI agents", value: "agent" },
			],
		},
		{
			name: "tags",
			type: "array",
			fields: [{ name: "tag", type: "text" }],
			admin: {
				description: "Topic tags shown as chips on the card.",
			},
		},
		{
			name: "submittedBy",
			type: "group",
			fields: [
				{ name: "name", type: "text" },
				{ name: "email", type: "email" },
				{ name: "githubHandle", type: "text" },
			],
			admin: {
				description:
					"Submitter contact info (collected on the submission form).",
			},
		},
		{
			name: "submittedAt",
			type: "date",
			admin: {
				readOnly: true,
				description: "When the submission landed.",
			},
		},
		{
			name: "approvedAt",
			type: "date",
			admin: {
				description: "When the submission was approved.",
			},
		},
		{
			name: "rejectionReason",
			type: "textarea",
			admin: {
				description: "Why it was rejected (shown to submitter if they ask).",
			},
		},
		{
			name: "ipHash",
			type: "text",
			index: true,
			admin: {
				readOnly: true,
				description:
					"SHA-256(ip + secret). De-duplicate spam without logging raw IPs.",
			},
		},
	],
	timestamps: true,
};
