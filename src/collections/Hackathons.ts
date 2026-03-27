import type { CollectionConfig } from "payload";

import { generateSlug, normalizeUrlField } from "../lib/utils/normalize";

export const Hackathons: CollectionConfig = {
	slug: "hackathons",
	admin: {
		useAsTitle: "name",
		defaultColumns: ["name", "status", "startDate", "endDate"],
		group: "Content",
	},
	access: {
		read: () => true,
		create: ({ req }) => !!req.user,
		update: ({ req }) => !!req.user,
		delete: ({ req }) => !!req.user,
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
			name: "description",
			type: "textarea",
		},
		{
			name: "startDate",
			type: "date",
			required: true,
			admin: {
				date: {
					pickerAppearance: "dayOnly",
					displayFormat: "MMM d, yyyy",
				},
			},
		},
		{
			name: "endDate",
			type: "date",
			required: true,
			admin: {
				date: {
					pickerAppearance: "dayOnly",
					displayFormat: "MMM d, yyyy",
				},
			},
		},
		{
			name: "organizer",
			type: "relationship",
			relationTo: "entities",
			admin: {
				description: "The organization running this hackathon",
			},
		},
		{
			name: "externalUrl",
			type: "text",
			admin: {
				description: "Link to the hackathon's external page",
			},
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "upcoming",
			options: [
				{ label: "Upcoming", value: "upcoming" },
				{ label: "Active", value: "active" },
				{ label: "Completed", value: "completed" },
			],
			admin: {
				position: "sidebar",
			},
		},
		{
			name: "projects",
			type: "join",
			collection: "projects",
			on: "hackathon",
			admin: {
				description: "Projects that originated from this hackathon",
			},
		},
	],
	hooks: {
		beforeValidate: [
			async ({ data }) => {
				if (data && !data.slug && data.name) {
					data.slug = generateSlug(data.name);
				}
				if (data?.externalUrl) {
					data.externalUrl = normalizeUrlField(data.externalUrl);
				}
				return data;
			},
		],
	},
};
