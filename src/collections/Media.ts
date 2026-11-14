import type { CollectionConfig } from "payload";
import { requireMediaStore } from "../lib/media-files";
import { adminOnly } from "./access";

export const Media: CollectionConfig = {
	slug: "media",
	access: {
		read: () => true,
		create: adminOnly,
		update: adminOnly,
		delete: adminOnly,
	},
	// No file store, no upload: without the R2 adapter Payload writes the file
	// to the local disk and the record outlives it (src/lib/media-files.ts).
	hooks: { beforeOperation: [requireMediaStore] },
	fields: [
		{
			name: "alt",
			type: "text",
			required: true,
		},
	],
	upload: true,
};
