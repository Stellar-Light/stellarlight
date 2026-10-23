import type { CollectionConfig } from "payload";
import { LOCATOR_KINDS } from "../lib/source-locator";
import { adminOnly } from "./access";

/**
 * The source-locator index behind locateSource (/api/sources/locate): one
 * row per pointer into an allowlisted Stellar repo. Names, lines and hashes
 * only, never a file body. Written by scripts/build-source-locators.ts alone
 * (through the database driver, not this API); the route reads it.
 */
export const SourceLocators: CollectionConfig = {
	slug: "source-locators",
	admin: {
		useAsTitle: "key",
		defaultColumns: ["repo", "path", "locatorKind", "locator", "line"],
		group: "Research",
		description:
			"Pointers into the allowlisted repos, Stellar's own and OpenZeppelin's Soroban contracts (path, symbol or heading, line, blob sha). Managed by scripts/build-source-locators.ts.",
	},
	access: {
		read: adminOnly,
		create: () => false,
		update: () => false,
		delete: adminOnly,
	},
	fields: [
		{ name: "key", type: "text", required: true, unique: true, index: true },
		{ name: "repo", type: "text", required: true, index: true },
		{
			name: "ref",
			type: "text",
			required: true,
			admin: {
				description:
					"Commit the row was read at. Unchanged files keep their first ref: same blob, same lines.",
			},
		},
		{ name: "path", type: "text", required: true },
		{
			name: "locatorKind",
			type: "select",
			required: true,
			index: true,
			options: [...LOCATOR_KINDS],
		},
		{ name: "locator", type: "text" },
		{ name: "line", type: "number" },
		{ name: "blobSha", type: "text", required: true },
		{
			name: "terms",
			type: "text",
			hasMany: true,
			index: true,
			admin: {
				description:
					"Lowercased words and whole-name keys the route matches q against.",
			},
		},
	],
	timestamps: true,
};

/** One row per allowlisted repo: the commit last indexed and when, the basis of verifiedAt. */
export const SourceLocatorRepos: CollectionConfig = {
	slug: "source-locator-repos",
	admin: {
		useAsTitle: "repo",
		defaultColumns: ["repo", "ref", "builtAt", "pointers"],
		group: "Research",
	},
	access: {
		read: adminOnly,
		create: () => false,
		update: () => false,
		delete: adminOnly,
	},
	fields: [
		{ name: "repo", type: "text", required: true, unique: true, index: true },
		{ name: "ref", type: "text", required: true },
		{
			name: "builtAt",
			type: "date",
			required: true,
			admin: {
				description:
					"End of the last build that read back every row: each stored pointer was confirmed then.",
			},
		},
		{ name: "files", type: "number" },
		{ name: "pointers", type: "number" },
		{ name: "builderVersion", type: "text" },
	],
	timestamps: true,
};
