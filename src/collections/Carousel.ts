import type { CollectionConfig } from "payload";

export const Carousel: CollectionConfig = {
	slug: "carousel",
	admin: {
		useAsTitle: "name",
		defaultColumns: ["name", "image", "order", "active"],
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
			admin: {
				description: "Name/identifier for this carousel item",
			},
		},
		{
			name: "image",
			type: "upload",
			relationTo: "media",
			required: true,
			admin: {
				description: "Logo/image to display in the carousel",
			},
		},
		{
			name: "url",
			type: "text",
			admin: {
				description: "Optional URL to link to when clicked",
			},
		},
		{
			name: "order",
			type: "number",
			defaultValue: 0,
			admin: {
				description: "Display order (lower numbers appear first)",
			},
		},
		{
			name: "active",
			type: "checkbox",
			defaultValue: true,
			admin: {
				description: "Show this item in the carousel",
			},
		},
	],
};
