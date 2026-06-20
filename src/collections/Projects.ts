import type { CollectionConfig } from "payload";

import { generateSlug, normalizeUrlField } from "../lib/utils/normalize";

export const Projects: CollectionConfig = {
	slug: "projects",
	admin: {
		useAsTitle: "name",
	},
	versions: {
		maxPerDoc: 3,
	},
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
				"DEX",
				"Lending",
				"Bridge",
				"Payments",
				"Anchor",
				"SDK",
				"Indexer",
				"Explorer",
				"Analytics",
				"AI",
				"Gaming",
				"Education",
				"Security",
				"NFT",
				"RWA",
				"Stablecoin",
				"Social Impact",
				"RPC",
				"Faucet",
			],
		},
		{
			name: "status",
			type: "select",
			required: true,
			index: true,
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
					admin: {
						description: "X (formerly Twitter) profile URL (e.g., https://x.com/username)",
					},
					label: "X (Twitter)",
				},
				{
					name: "discord",
					type: "text",
				},
			],
		},
		{
			name: "github",
			type: "group",
			admin: {
				description: "Link GitHub data to this project",
			},
			fields: [
				{
					name: "orgLogin",
					type: "text",
					admin: {
						description: 'GitHub org login (optional), e.g. "stellar"',
					},
				},
				{
					name: "repos",
					type: "array",
					labels: { singular: "Repo", plural: "Repos" },
					admin: {
						description:
							"Specific repositories for this project (owner/name)",
					},
					fields: [
						{ name: "owner", type: "text", required: true },
						{ name: "name", type: "text", required: true },
					],
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
			name: "scf",
			type: "group",
			admin: {
				description: "Stellar Community Fund data",
			},
			fields: [
				{
					name: "awarded",
					type: "checkbox",
					defaultValue: false,
					admin: {
						description: "Whether this project has received SCF funding",
					},
				},
				{
					name: "lastAwardedRound",
					type: "number",
					admin: {
						description: "Last SCF round this project was awarded in",
					},
				},
				{
					name: "slug",
					type: "text",
					admin: {
						description: "SCF project slug (used for linking to communityfund.stellar.org)",
					},
				},
				{
					name: "totalAwarded",
					type: "number",
					admin: {
						description: "Total funding amount awarded from SCF (in USD)",
					},
				},
				{
					name: "awardedRounds",
					type: "number",
					hasMany: true,
					admin: {
						description: "Round numbers this project was funded in, e.g. 2, 17, 22",
					},
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
			// Voyage (voyage-3, 1024-dim) embedding of name + description +
			// category, for semantic project search via Atlas $vectorSearch.
			// Backfilled by scripts/embed-projects.ts, read raw by the search
			// route. Hidden from admin; large numeric array, not display data.
			name: "embedding",
			type: "json",
			admin: { hidden: true },
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
		{
			name: "featured",
			type: "checkbox",
			defaultValue: false,
			admin: {
				description: "Featured projects appear first in the directory when sorted by Featured.",
			},
		},
		{
			name: "relevanceScore",
			type: "number",
			defaultValue: 0,
			admin: {
				description:
					"Computed relevance score (0-100). Higher = more relevant. Auto-calculated from TVL, GitHub activity, completeness, etc.",
				position: "sidebar",
			},
		},
		{
			name: "prominence",
			type: "number",
			defaultValue: 0,
			admin: {
				description:
					"Editorial search-ranking boost (0-100). Lifts canonical/flagship projects above incidental keyword mentions in /api/projects/search. Guide: 90 = the canonical pick for its category (Freighter, Soroswap, Blend, Reflector, USDC); 70 = established; 50 = notable; 0 = default. Distinct from relevanceScore (auto-computed) — this is curated.",
				position: "sidebar",
			},
		},
		{
			name: "communityPick",
			type: "checkbox",
			defaultValue: false,
			admin: {
				description: "Mark this project as a community pick. Note: Projects must have an X (Twitter) profile link in the Links section to appear in the Community Picks section on the homepage.",
			},
		},
		{
			name: "relatedEntities",
			type: "join",
			collection: "entities",
			on: "projects",
			admin: {
				description: "Entities/organizations linked to this project. Edit from either side.",
			},
		},
		{
			name: "hackathon",
			type: "relationship",
			relationTo: "hackathons",
			admin: {
				description: "Hackathon this project originated from (if applicable)",
			},
		},
		{
			name: "hackathonStatus",
			type: "select",
			options: [
				{ label: "Built", value: "Built" },
				{ label: "In Progress", value: "In Progress" },
				{ label: "Abandoned", value: "Abandoned" },
			],
			admin: {
				description: "Post-hackathon project status",
				condition: (data) => !!data?.hackathon,
			},
		},
		{
			name: "hackathonPlacement",
			type: "select",
			options: [
				{ label: "Grand Prize", value: "grand-prize" },
				{ label: "1st Place", value: "1st" },
				{ label: "2nd Place", value: "2nd" },
				{ label: "3rd Place", value: "3rd" },
				{ label: "Honorable Mention", value: "honorable-mention" },
				{ label: "Track Winner", value: "track-winner" },
			],
			admin: {
				description:
					"If this project won a placement at the hackathon, surface it in the Winners section",
				condition: (data) => !!data?.hackathon,
			},
		},
		{
			name: "hackathonPrize",
			type: "number",
			admin: {
				description: "Prize amount won (USD)",
				condition: (data) => !!data?.hackathon && !!data?.hackathonPlacement,
				step: 100,
			},
		},
		{
			name: "hackathonPrizeTrack",
			type: "text",
			admin: {
				description:
					"Track or sponsor that awarded the prize (e.g. 'Best DeFi', 'Coinbase Track')",
				condition: (data) => !!data?.hackathon && !!data?.hackathonPlacement,
			},
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

				// Invalidate GitHub cache if repos changed
				if (operation === "update" && previousDoc) {
					const currentRepos = doc.github?.repos || [];
					const previousRepos = previousDoc.github?.repos || [];

					const currentReposKey = JSON.stringify(
						(currentRepos as any[])
							.map((r: any) => `${r.owner}/${r.name}`)
							.sort(),
					);
					const previousReposKey = JSON.stringify(
						(previousRepos as any[])
							.map((r: any) => `${r.owner}/${r.name}`)
							.sort(),
					);

					if (currentReposKey !== previousReposKey) {
						// Delete cache to force refresh on next request
						const existing = await req.payload.find({
							collection: "signals",
							where: { project: { equals: doc.id } },
							limit: 1,
						});

						if (existing.docs.length > 0) {
							await req.payload.delete({
								collection: "signals",
								id: existing.docs[0].id,
							});
						}
					}
				}
			},
		],
	},
};
