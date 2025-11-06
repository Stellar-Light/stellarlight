import type { CollectionConfig } from "payload";

export const SyncJobs: CollectionConfig = {
	slug: "sync-jobs",
	admin: {
		useAsTitle: "source",
		defaultColumns: ["source", "status", "startedAt", "finishedAt"],
	},
	access: {
		read: ({ req }) => {
			// In PayloadCMS, authenticated users are admins
			return !!req.user;
		},
	},
	fields: [
		{
			name: "source",
			type: "select",
			required: true,
			options: ["Lumenloop"],
		},
		{
			name: "stats",
			type: "json",
		},
		{
			name: "startedAt",
			type: "date",
			required: true,
		},
		{
			name: "finishedAt",
			type: "date",
		},
		{
			name: "status",
			type: "select",
			required: true,
			options: ["Running", "Completed", "Failed"],
		},
		{
			name: "log",
			type: "textarea",
		},
	],
	// Indexes can be added later if needed for performance
};
