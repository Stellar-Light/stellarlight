import type { CollectionConfig } from "payload";

import { generateSlug, normalizeUrlField } from "../lib/utils/normalize";

export const Projects: CollectionConfig = {
	slug: "projects",
	admin: {
		useAsTitle: "name",
	},
	versions: true,
	access: {
		read: () => true,
		create: ({ data, req }) => {
			// Allow admin creation from backend
			if (req.user) {
				return true;
			}
			// Allow public creation for intake (unverified projects)
			if (
				data?.provenance?.source === "UserSubmitted" &&
				data?.verificationLevel === "Unverified"
			) {
				return true;
			}
			return false;
		},
		update: ({ req }) => {
			// Only admins can update
			return !!req.user;
		},
	},
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
			unique: true,
			admin: {
				position: "sidebar",
			},
		},
		{
			name: "logo",
			type: "upload",
			relationTo: "media",
			admin: {
				description: "Project logo image. If not provided, a default logo will be used.",
			},
		},
		{
			name: "shortDescription",
			type: "textarea",
		},
		{
			name: "category",
			type: "select",
			required: true,
			options: [
				"Infrastructure",
				"Tooling",
				"Partner Integration",
				"User-Facing App",
				"Asset",
				"Protocol/Contract",
				"Anchor",
			],
		},
		{
			name: "types",
			type: "select",
			hasMany: true,
			options: [
				"Wallet",
				"Anchor",
				"Bridge",
				"SDK",
				"Payment Rail",
				"DEX",
				"Indexer",
				"Explorer",
				"Other",
			],
		},
		{
			name: "status",
			type: "select",
			required: true,
			options: ["Draft", "Development", "Pre-Release", "Live"],
			defaultValue: "Draft",
			admin: {
				description: "Draft projects require admin approval before appearing on the frontend",
			},
		},
		{
			name: "links",
			type: "group",
			fields: [
				{
					name: "website",
					type: "text",
				},
				{
					name: "github",
					type: "text",
				},
				{
					name: "docs",
					type: "text",
				},
				{
					name: "twitter",
					type: "text",
				},
				{
					name: "discord",
					type: "text",
				},
			],
		},
		{
			name: "onchain",
			type: "group",
			fields: [
				{
					name: "assetCode",
					type: "text",
				},
				{
					name: "issuer",
					type: "text",
				},
				{
					name: "contracts",
					type: "array",
					fields: [
						{
							name: "address",
							type: "text",
						},
					],
				},
			],
		},
		{
			name: "verificationLevel",
			type: "select",
			required: true,
			defaultValue: "Unverified",
			options: ["Unverified", "Verified (SDF)", "Verified (Community)"],
		},
		{
			name: "provenance",
			type: "group",
			fields: [
				{
					name: "source",
					type: "select",
					required: true,
					options: ["LumenloopSeed", "UserSubmitted", "AdminEdit"],
				},
				{
					name: "sourceId",
					type: "text",
				},
				{
					name: "firstSeenAt",
					type: "date",
				},
			],
		},
		{
			name: "lastVerifiedAt",
			type: "date",
		},
	],
	// Unique index on slug is handled by unique: true on the field
	hooks: {
		beforeValidate: [
			async ({ data, operation, req }) => {
				// Generate slug from name if not provided
				if (data && !data.slug && data.name) {
					data.slug = generateSlug(data.name);
				}

				// Set provenance for admin-created entries
				if (
					data &&
					operation === "create" &&
					req?.user &&
					!data.provenance?.source
				) {
					data.provenance = {
						...data.provenance,
						source: "AdminEdit",
						firstSeenAt: new Date().toISOString(),
					};
				}

				// Normalize URLs in links group
				if (data?.links) {
					if (data.links.website) {
						data.links.website = normalizeUrlField(data.links.website);
					}
					if (data.links.github) {
						data.links.github = normalizeUrlField(data.links.github);
					}
					if (data.links.docs) {
						data.links.docs = normalizeUrlField(data.links.docs);
					}
					if (data.links.twitter) {
						data.links.twitter = normalizeUrlField(data.links.twitter);
					}
					if (data.links.discord) {
						data.links.discord = normalizeUrlField(data.links.discord);
					}
				}

				return data;
			},
		],
		afterChange: [
			async ({ doc, operation, req, previousDoc }) => {
				if (!req.payload) return;

				// Determine action type
				let action: "Create" | "Update" | "SyncImport" | "Intake" = "Update";
				let actorType: "System" | "User" | "Admin" = "User";

				if (operation === "create") {
					action = "Create";
					// Check if this is from sync or intake based on provenance
					if (doc.provenance?.source === "LumenloopSeed") {
						action = "SyncImport";
						actorType = "System";
					} else if (doc.provenance?.source === "UserSubmitted") {
						action = "Intake";
						actorType = "User";
					} else if (req.user) {
						actorType = "Admin";
					}
				} else if (operation === "update") {
					if (req.user) {
						actorType = "Admin";
					}
				}

				// Create transparency log entry
				await req.payload.create({
					collection: "transparency-logs",
					data: {
						action,
						actorType,
						targetCollection: "projects",
						targetId: doc.id.toString(),
						diff: {
							before: previousDoc || null,
							after: doc,
						},
						timestamp: new Date().toISOString(),
					},
				});
			},
		],
	},
};
