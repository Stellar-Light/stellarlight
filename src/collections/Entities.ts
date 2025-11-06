import type { CollectionConfig } from "payload";
import { generateSlug, normalizeUrlField } from "../lib/utils/normalize";

export const Entities: CollectionConfig = {
	slug: "entities",
	admin: {
		useAsTitle: "name",
	},
	access: {
		read: () => true,
		create: ({ req }) => {
			// Allow admin creation from backend
			return !!req.user;
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
			name: "domains",
			type: "array",
			fields: [
				{
					name: "domain",
					type: "text",
					required: true,
				},
			],
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
					name: "twitter",
					type: "text",
				},
			],
		},
		{
			name: "projects",
			type: "relationship",
			relationTo: "projects",
			hasMany: true,
		},
	],
	// Unique index on slug is handled by unique: true on the field
	hooks: {
		beforeValidate: [
			async ({ data }) => {
				// Generate slug from name if not provided
				if (data && !data.slug && data.name) {
					data.slug = generateSlug(data.name);
				}

				// Normalize URLs in links group
				if (data?.links) {
					if (data.links.website) {
						data.links.website = normalizeUrlField(data.links.website);
					}
					if (data.links.github) {
						data.links.github = normalizeUrlField(data.links.github);
					}
					if (data.links.twitter) {
						data.links.twitter = normalizeUrlField(data.links.twitter);
					}
				}

				return data;
			},
		],
	},
};
