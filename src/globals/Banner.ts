import type { GlobalConfig } from "payload";

export const Banner: GlobalConfig = {
	slug: "banner",
	admin: {
		description: "Configure the site-wide top banner",
	},
	access: {
		read: () => true,
		update: ({ req }) => !!req.user,
	},
	fields: [
		{
			name: "enabled",
			type: "checkbox",
			defaultValue: false,
			admin: {
				description: "Turn the banner ON or OFF",
			},
		},
		{
			name: "message",
			type: "textarea",
			required: true,
			admin: {
				description: "Banner message to display",
				condition: (data) => data.enabled,
			},
		},
		{
			name: "linkUrl",
			type: "text",
			admin: {
				description: "Optional URL - when set, the banner becomes clickable",
				condition: (data) => data.enabled,
			},
		},
		{
			name: "backgroundColor",
			type: "select",
			defaultValue: "primary",
			required: true,
			options: [
				{
					label: "Primary/Brand",
					value: "primary",
				},
				{
					label: "Blue",
					value: "blue",
				},
				{
					label: "Green",
					value: "green",
				},
				{
					label: "Amber",
					value: "amber",
				},
				{
					label: "Red",
					value: "red",
				},
				{
					label: "Gray",
					value: "gray",
				},
			],
			admin: {
				description: "Choose a background color for the banner",
				condition: (data) => data.enabled,
			},
		},
	],
};
