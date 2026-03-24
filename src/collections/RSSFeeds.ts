import type { CollectionConfig } from "payload";

export const RSSFeeds: CollectionConfig = {
	slug: "rss-feeds",
	admin: {
		useAsTitle: "name",
		defaultColumns: ["name", "feedUrl", "enabled", "syncFrequency", "lastSyncedAt"],
		description: "Manage RSS feeds that automatically import blog posts. Visit the RSS Management page to sync feeds.",
	},
	access: {
		read: ({ req }) => !!req.user,
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
				description: "A friendly name for this RSS feed (e.g., 'Stellar Blog')",
			},
		},
		{
			name: "feedUrl",
			type: "text",
			required: true,
			admin: {
				description: "The full URL of the RSS feed",
			},
		},
		{
			name: "enabled",
			type: "checkbox",
			defaultValue: true,
			admin: {
				description: "Enable or disable automatic syncing for this feed",
			},
		},
		{
			name: "syncFrequency",
			type: "select",
			required: true,
			defaultValue: "hourly",
			options: [
				{
					label: "Every 15 minutes",
					value: "15min",
				},
				{
					label: "Every 30 minutes",
					value: "30min",
				},
				{
					label: "Hourly",
					value: "hourly",
				},
				{
					label: "Every 6 hours",
					value: "6hours",
				},
				{
					label: "Daily",
					value: "daily",
				},
				{
					label: "Manual only",
					value: "manual",
				},
			],
			admin: {
				description: "How often to sync this feed",
			},
		},
		{
			name: "author",
			type: "text",
			admin: {
				description: "Default author name for posts from this feed (if not specified in RSS)",
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
			],
			admin: {
				description: "Default category for posts from this feed",
			},
		},
		{
			name: "tags",
			type: "text",
			hasMany: true,
			admin: {
				description: "Default tags to add to all posts from this feed",
			},
		},
		{
			name: "sourceTag",
			type: "select",
			options: [
				{ label: "SDF Blog", value: "sdf-blog" },
				{ label: "Medium", value: "medium" },
				{ label: "Stablecoin Report", value: "stablecoin-report" },
				{ label: "RWA Report", value: "rwa-report" },
			],
			admin: {
				description: "Source tag for filtering on the blog page",
			},
		},
		{
			name: "autoPublish",
			type: "checkbox",
			defaultValue: false,
			admin: {
				description: "Automatically publish imported posts (otherwise they'll be drafts)",
			},
		},
		{
			name: "lastSyncedAt",
			type: "date",
			admin: {
				readOnly: true,
				description: "Last time this feed was successfully synced",
			},
		},
		{
			name: "lastSyncStatus",
			type: "select",
			options: ["Success", "Failed", "Never"],
			defaultValue: "Never",
			admin: {
				readOnly: true,
				description: "Status of the last sync attempt",
			},
		},
		{
			name: "lastSyncError",
			type: "textarea",
			admin: {
				readOnly: true,
				description: "Error message from the last failed sync (if any)",
			},
		},
		{
			name: "totalPostsImported",
			type: "number",
			defaultValue: 0,
			admin: {
				readOnly: true,
				description: "Total number of posts imported from this feed",
			},
		},
	],
	hooks: {
		beforeValidate: [
			async ({ data }) => {
				// Normalize feed URL
				if (data?.feedUrl) {
					let url = data.feedUrl.trim();
					if (!url.startsWith("http://") && !url.startsWith("https://")) {
						url = `https://${url}`;
					}
					data.feedUrl = url;
				}
				return data;
			},
		],
	},
};

