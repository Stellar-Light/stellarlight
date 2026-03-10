import type { Block } from "payload";

export const HtmlSnippetBlock: Block = {
	slug: "htmlSnippet",
	labels: {
		singular: "HTML Snippet",
		plural: "HTML Snippets",
	},
	fields: [
		{
			name: "html",
			type: "code",
			required: true,
			label: "HTML",
			admin: {
				language: "html",
				description:
					"Paste raw HTML to embed in this post. Rendered as-is on the frontend — use with care.",
			},
		},
	],
};
