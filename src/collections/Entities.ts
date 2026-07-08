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
			name: "logo",
			type: "upload",
			relationTo: "media",
			admin: {
				description:
					"Entity logo image. If not provided, a default icon will be used.",
			},
		},
		{
			name: "description",
			type: "textarea",
			admin: {
				description: "Description of the entity/organization.",
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
					admin: {
						description:
							"X (formerly Twitter) profile URL (e.g., https://x.com/username)",
					},
					label: "X (Twitter)",
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
