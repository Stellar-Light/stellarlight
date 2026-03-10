import type { Block } from "payload";

export const SocialEmbedBlock: Block = {
	slug: "socialEmbed",
	labels: {
		singular: "Social Embed",
		plural: "Social Embeds",
	},
	fields: [
		{
			name: "url",
			type: "text",
			required: true,
			label: "URL",
			admin: {
				description:
					"Paste a link from X/Twitter, Instagram, or YouTube. Example: https://x.com/user/status/123",
			},
		},
	],
};
