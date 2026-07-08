import { BlocksFeature, lexicalEditor } from "@payloadcms/richtext-lexical";
import type { CollectionConfig } from "payload";
import { HtmlSnippetBlock } from "../blocks/HtmlSnippet";
import { SocialEmbedBlock } from "../blocks/SocialEmbed";

export const Blog: CollectionConfig = {
	slug: "blog",
	admin: {
		useAsTitle: "title",
		defaultColumns: ["title", "author", "publishedAt", "featured", "status"],
		preview: (doc) => {
			if (doc?.slug) {
				const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
				return `${base}/api/preview?secret=${process.env.PAYLOAD_SECRET}&slug=${doc.slug}`;
			}
			return null;
		},
	},
	versions: {
		drafts: true,
	},
	access: {
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
			admin: {
				description: "The main title of the blog post",
			},
		},
		{
			name: "slug",
			type: "text",
			required: true,
			unique: true,
			admin: {
				description: "URL-friendly version of the title",
				position: "sidebar",
			},
			hooks: {
				beforeValidate: [
					({ value, data }) => {
						if (!value && data?.title) {
							return data.title
								.toLowerCase()
								.replace(/[^a-z0-9]+/g, "-")
								.replace(/(^-|-$)/g, "");
						}
						return value;
					},
				],
			},
		},
		{
			name: "author",
			type: "text",
			required: true,
			admin: {
				description: "Author name",
				position: "sidebar",
			},
		},
		{
			name: "excerpt",
			type: "textarea",
			required: true,
			admin: {
				description: "Short summary for preview cards (150-200 characters)",
			},
		},
		{
			name: "featuredImage",
			type: "upload",
			relationTo: "media",
			admin: {
				description: "Hero image for the blog post",
			},
		},
		{
			name: "rssImageUrl",
			type: "text",
			admin: {
				description: "Image URL from RSS feed (for external posts)",
				readOnly: true,
				position: "sidebar",
			},
		},
		{
			name: "featured",
			type: "checkbox",
			defaultValue: false,
			admin: {
				description: "Show in highlights section",
				position: "sidebar",
			},
		},
		{
			name: "contentType",
			type: "select",
			required: true,
			defaultValue: "richText",
			options: [
				{
					label: "Rich Text Editor",
					value: "richText",
				},
				{
					label: "Markdown",
					value: "markdown",
				},
			],
			admin: {
				description: "Choose how you want to create this post",
				position: "sidebar",
			},
		},
		{
			name: "content",
			type: "richText",
			admin: {
				description:
					"Rich text content (used when Content Type is Rich Text Editor)",
				condition: (data) =>
					data.contentType === "richText" && !data.isRSSExternal,
			},
			editor: lexicalEditor({
				features: ({ defaultFeatures }) => [
					...defaultFeatures,
					BlocksFeature({ blocks: [SocialEmbedBlock, HtmlSnippetBlock] }),
				],
			}),
		},
		{
			name: "markdownContent",
			type: "code",
			admin: {
				description: "Markdown content (used when Content Type is Markdown)",
				language: "markdown",
				condition: (data) =>
					data.contentType === "markdown" && !data.isRSSExternal,
			},
		},
		{
			name: "rssFeed",
			type: "relationship",
			relationTo: "rss-feeds",
			admin: {
				description:
					"If this post was imported from an RSS feed, link to the feed source",
				position: "sidebar",
			},
		},
		{
			name: "rssItemId",
			type: "text",
			admin: {
				description:
					"Unique identifier from RSS feed item (for duplicate detection)",
				position: "sidebar",
				readOnly: true,
			},
		},
		{
			name: "isRSSExternal",
			type: "checkbox",
			defaultValue: false,
			admin: {
				description:
					"If true, this post links to an external RSS article instead of displaying content here",
				position: "sidebar",
				readOnly: true,
			},
		},
		{
			name: "externalUrl",
			type: "text",
			admin: {
				description: "Original URL of the RSS article (for external posts)",
				position: "sidebar",
				readOnly: true,
				condition: (data) => data.isRSSExternal === true,
			},
		},
		{
			name: "rssDescription",
			type: "textarea",
			admin: {
				description: "Description from RSS feed (for external posts)",
				readOnly: true,
				condition: (data) => data.isRSSExternal === true,
			},
		},
		{
			name: "category",
			type: "select",
			options: [
				"Announcement",
				"Tutorial",
				"News",
				"Technical",
				"Community",
				"Partnership",
				"Update",
				"Ecosystem",
			],
			admin: {
				position: "sidebar",
			},
		},
		{
			name: "tags",
			type: "text",
			hasMany: true,
			admin: {
				description: "Add tags to help categorize this post",
			},
		},
		{
			name: "publishedAt",
			type: "date",
			admin: {
				description: "Publication date",
				position: "sidebar",
				date: {
					pickerAppearance: "dayAndTime",
				},
			},
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "draft",
			options: [
				{
					label: "Draft",
					value: "draft",
				},
				{
					label: "Published",
					value: "published",
				},
			],
			admin: {
				position: "sidebar",
			},
		},
		{
			name: "meta",
			type: "group",
			admin: {
				description: "SEO and social media metadata",
			},
			fields: [
				{
					name: "description",
					type: "textarea",
					admin: {
						description: "Meta description for SEO",
					},
				},
				{
					name: "keywords",
					type: "text",
					hasMany: true,
					admin: {
						description: "SEO keywords",
					},
				},
			],
		},
	],
	hooks: {
		beforeValidate: [
			async ({ data, operation }) => {
				if (data && !data.slug && data.title) {
					data.slug = data.title
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, "-")
						.replace(/(^-|-$)/g, "");
				}
				return data;
			},
		],
	},
};
