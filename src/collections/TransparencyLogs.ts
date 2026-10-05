import type { CollectionConfig } from "payload";
import { adminOnly } from "./access";

export const TransparencyLogs: CollectionConfig = {
	slug: "transparency-logs",
	admin: {
		useAsTitle: "action",
		defaultColumns: ["action", "targetCollection", "targetId", "timestamp"],
	},
	access: {
		read: () => true,
		create: adminOnly,
		update: adminOnly,
		delete: adminOnly,
	},
	fields: [
		{
			name: "action",
			type: "select",
			required: true,
			options: ["Create", "Update", "SyncImport", "Intake"],
		},
		{
			name: "actorType",
			type: "select",
			required: true,
			options: ["System", "User", "Admin"],
		},
		{
			name: "targetCollection",
			type: "text",
			required: true,
		},
		{
			name: "targetId",
			type: "text",
			required: true,
		},
		{
			name: "diff",
			type: "json",
		},
		{
			name: "timestamp",
			type: "date",
			required: true,
			defaultValue: () => new Date(),
		},
	],
	// Indexes can be added later if needed for performance
};
