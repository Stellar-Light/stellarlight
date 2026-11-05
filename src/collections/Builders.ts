import type { CollectionConfig } from "payload";
import { PUBLIC_BUILDERS } from "@/lib/integrations/stellar-passport";
import { adminOnly, isAdmin } from "./access";

const Builders: CollectionConfig = {
	slug: "builders",
	admin: {
		useAsTitle: "display_name",
		group: "Content",
		defaultColumns: [
			"display_name",
			"github_username",
			"is_featured",
			"updatedAt",
		],
		description: "Builder profiles from Stellar Passport",
	},
	access: {
		// Payload's REST (/api/builders/<id>, /api/builders/count) and GraphQL
		// answer anyone: only an admin reads a private profile there. Site
		// pages and /api/builders read through the local API and apply the
		// same rule themselves.
		read: ({ req }) => (isAdmin(req.user) ? true : PUBLIC_BUILDERS),
		create: adminOnly,
		update: adminOnly,
		delete: adminOnly,
	},
	fields: [
		{
			name: "github_username",
			type: "text",
			required: true,
			unique: true,
			index: true,
			admin: {
				description: "GitHub username for the builder",
			},
		},
		{
			name: "display_name",
			type: "text",
			required: true,
			admin: {
				description: "Display name of the builder",
			},
		},
		{
			name: "avatar_url",
			type: "text",
			admin: {
				description: "URL to the builder avatar image",
			},
		},
		{
			name: "bio",
			type: "textarea",
			admin: {
				description: "Builder biography",
			},
		},
		{
			name: "role_title",
			type: "text",
			admin: {
				description: "Professional role or title",
			},
		},
		{
			name: "location",
			type: "text",
			admin: {
				description: "Geographic location",
			},
		},
		{
			name: "website_url",
			type: "text",
			admin: {
				description: "Personal or professional website",
			},
		},
		{
			name: "twitter_handle",
			type: "text",
			admin: {
				description: "Twitter/X handle",
			},
		},
		{
			name: "telegram_handle",
			type: "text",
			admin: {
				description: "Telegram handle",
			},
		},
		{
			name: "discord_handle",
			type: "text",
			admin: {
				description: "Discord handle",
			},
		},
		{
			name: "stellar_address",
			type: "text",
			admin: {
				description: "Stellar blockchain address",
			},
		},
		{
			name: "is_featured",
			type: "checkbox",
			defaultValue: false,
			admin: {
				description: "Featured builder on homepage",
			},
		},
		{
			name: "github_id",
			type: "text",
			admin: {
				description: "GitHub user ID",
			},
		},
		{
			name: "discord_username",
			type: "text",
			admin: {
				description: "Discord username",
			},
		},
		{
			name: "scf_tier",
			type: "text",
			admin: {
				description: "SCF funding tier",
			},
		},
		{
			name: "visibility",
			type: "select",
			options: [
				{ label: "Public", value: "public" },
				{ label: "Private", value: "private" },
			],
			defaultValue: "public",
			admin: {
				description: "Profile visibility",
			},
		},
		{
			name: "projects",
			type: "array",
			fields: [
				{
					name: "name",
					type: "text",
					required: true,
				},
				{
					name: "slug",
					type: "text",
					required: true,
				},
				{
					name: "short_description",
					type: "textarea",
				},
				{
					name: "status",
					type: "select",
					options: [
						{ label: "Building", value: "building" },
						{ label: "Live", value: "live" },
						{ label: "Deprecated", value: "deprecated" },
					],
				},
				{
					name: "website_url",
					type: "text",
				},
				{
					name: "demo_url",
					type: "text",
				},
				{
					name: "docs_url",
					type: "text",
				},
				{
					name: "contract_address",
					type: "text",
				},
				{
					name: "repos",
					type: "array",
					fields: [
						{
							name: "full_name",
							type: "text",
							required: true,
						},
						{
							name: "html_url",
							type: "text",
							required: true,
						},
						{
							name: "primary_language",
							type: "text",
						},
						{
							name: "stars",
							type: "number",
						},
						{
							name: "forks",
							type: "number",
						},
						{
							name: "description",
							type: "textarea",
						},
					],
				},
				{
					name: "heatmap",
					type: "json",
					admin: {
						description: "Activity heatmap data",
					},
				},
			],
		},
		{
			name: "stats",
			type: "group",
			fields: [
				{
					name: "totalCommits30d",
					type: "number",
					defaultValue: 0,
					admin: {
						description: "Total commits in last 30 days",
					},
				},
				{
					name: "activeDays30d",
					type: "number",
					defaultValue: 0,
					admin: {
						description: "Active days in last 30 days",
					},
				},
				{
					name: "lastActiveDate",
					type: "text",
					admin: {
						description: "Last active date",
					},
				},
			],
		},
		{
			name: "passport_created_at",
			type: "date",
			admin: {
				description: "When the passport profile was created",
			},
		},
		{
			name: "last_synced",
			type: "date",
			admin: {
				description: "Last sync from Stellar Passport API",
			},
		},
		// GitHub contributor pass (scripts/enrich-builder-contributions.ts): repos in
		// OUR index this person committed to in the last 12 months, from GitHub's
		// public contributionsCollection. Fills the gap between "repos they own"
		// and "repos they actually work in" (org repos they never declared).
		{
			name: "contributions",
			type: "array",
			admin: {
				description:
					"Indexed Stellar repos this person committed to in the last 12 months (GitHub contributor pass)",
			},
			fields: [
				{ name: "fullName", type: "text", required: true },
				{ name: "commits12m", type: "number" },
				{ name: "projectSlug", type: "text" },
			],
		},
		{
			name: "contributions_synced_at",
			type: "date",
			admin: {
				description:
					"When the GitHub contributor pass last ran for this profile",
			},
		},
	],
	hooks: {
		beforeChange: [
			({ data }) => {
				data.last_synced = new Date().toISOString();
				return data;
			},
		],
	},
	timestamps: true,
};

export default Builders;
