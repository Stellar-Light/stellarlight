import type { CollectionConfig } from "payload";

/**
 * i³ Awards — voting rounds (Impact / Innovation / Interoperability).
 *
 * A round is the container for one shortlisting vote: which categories are
 * on the ballot, when voting opens/closes, and whether the round is live.
 * Nominees and the voter whitelist hang off a round via relationships
 * (award-nominees / award-voters), so multiple rounds can coexist and a
 * test round never contaminates a real one.
 *
 * Votes themselves are NOT stored here — they live on-chain as TESTNET
 * manageData entries on each voter's account (`i3.<roundSlug>.<categoryKey>`
 * = nominee project slug). The chain is the ballot box; these collections
 * are only the ballot paper (round, choices, who may vote).
 *
 * TESTNET-only by design (see src/lib/awards/stellar.ts). The /awards page
 * that fronts this is hidden: no nav links, robots noindex, not in the
 * sitemap, and none of the /api/awards/* routes appear in the OpenAPI spec
 * (internal page backend, not the data API).
 */

/** `i3.<roundSlug>.<categoryKey>` must fit a 64-byte manageData key. */
const MANAGE_DATA_KEY_BUDGET = 64 - "i3.".length - ".".length; // slug + key

const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const AwardRounds: CollectionConfig = {
	slug: "award-rounds",
	labels: { singular: "Award Round", plural: "Award Rounds" },
	admin: {
		useAsTitle: "title",
		defaultColumns: ["title", "slug", "status", "opensAt", "closesAt"],
		group: "Awards",
		description:
			"i³ Awards voting rounds. Votes are recorded on Stellar TESTNET; this collection only defines the ballot.",
	},
	access: {
		// Round metadata is public (the /awards page serves it); writes are admin.
		read: () => true,
		create: ({ req }) => !!req.user,
		update: ({ req }) => !!req.user,
		delete: ({ req }) => !!req.user,
	},
	fields: [
		{
			name: "title",
			type: "text",
			required: true,
			admin: { description: 'Display title, e.g. "i³ Awards 2026"' },
		},
		{
			name: "slug",
			type: "text",
			required: true,
			unique: true,
			admin: {
				position: "sidebar",
				description:
					"Lowercase, hyphenated. Becomes part of the on-chain vote key (i3.<slug>.<category>) — keep it short and NEVER change it after voting opens.",
			},
			validate: (value: unknown) => {
				if (typeof value !== "string" || !SLUG_SHAPE.test(value)) {
					return "Slug must be lowercase letters/numbers with hyphens (e.g. i3-2026).";
				}
				return true;
			},
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "draft",
			options: [
				{ label: "Draft", value: "draft" },
				{ label: "Open (voting live)", value: "open" },
				{ label: "Closed", value: "closed" },
			],
			admin: {
				position: "sidebar",
				description:
					"Only an OPEN round accepts ballots (and only inside the opensAt/closesAt window, when set).",
			},
		},
		{
			name: "ballotMode",
			type: "select",
			required: true,
			defaultValue: "one-per-category",
			options: [{ label: "One pick per category", value: "one-per-category" }],
			admin: {
				description:
					"How many nominees a voter may pick per category. Only one-per-category exists today; the field leaves room for future modes without a schema change.",
			},
		},
		{
			name: "categories",
			type: "array",
			required: true,
			minRows: 1,
			defaultValue: [
				{
					key: "impact",
					name: "Impact",
					tagline: "Real-world outcomes for real people",
				},
				{
					key: "innovation",
					name: "Innovation",
					tagline: "Pushing what's possible on Stellar",
				},
				{
					key: "interoperability",
					name: "Interoperability",
					tagline: "Bridging Stellar to the wider world",
				},
			],
			admin: {
				description:
					"Ballot categories. `key` goes on-chain (i3.<round>.<key>) — lowercase, short, never renamed mid-round.",
			},
			fields: [
				{
					name: "key",
					type: "text",
					required: true,
					validate: (value: unknown) => {
						if (typeof value !== "string" || !SLUG_SHAPE.test(value)) {
							return "Category key must be lowercase letters/numbers with hyphens.";
						}
						return true;
					},
				},
				{ name: "name", type: "text", required: true },
				{ name: "tagline", type: "text" },
			],
		},
		{
			name: "opensAt",
			type: "date",
			admin: {
				position: "sidebar",
				date: { pickerAppearance: "dayAndTime" },
				description:
					"Optional. Before this instant, an 'open' round still rejects ballots.",
			},
		},
		{
			name: "closesAt",
			type: "date",
			admin: {
				position: "sidebar",
				date: { pickerAppearance: "dayAndTime" },
				description:
					"Optional. After this instant ballots are rejected. Voters may change their vote until then.",
			},
		},
	],
	hooks: {
		beforeValidate: [
			({ data }) => {
				// The on-chain key is `i3.<roundSlug>.<categoryKey>` and manageData
				// keys cap at 64 bytes — reject combinations that can't fit instead
				// of failing at vote time.
				const slug = typeof data?.slug === "string" ? data.slug.trim() : "";
				const categories = Array.isArray(data?.categories)
					? data.categories
					: [];
				for (const cat of categories) {
					const key = typeof cat?.key === "string" ? cat.key.trim() : "";
					if (
						slug &&
						key &&
						slug.length + key.length > MANAGE_DATA_KEY_BUDGET
					) {
						throw new Error(
							`Round slug + category key "${key}" exceed the 64-byte on-chain key budget (i3.<slug>.<key>). Shorten one of them.`,
						);
					}
				}
				return data;
			},
		],
	},
};
