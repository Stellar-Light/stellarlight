// storage-adapter-import-placeholder
import { mongooseAdapter } from "@payloadcms/db-mongodb";
import { payloadCloudPlugin } from "@payloadcms/payload-cloud";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import path from "path";
import { buildConfig } from "payload";
import { fileURLToPath } from "url";
import sharp from "sharp";

import { Blog } from "./collections/Blog";
import { Entities } from "./collections/Entities";
import { Media } from "./collections/Media";
import { Projects } from "./collections/Projects";
import { RSSFeeds } from "./collections/RSSFeeds";
import { Signals } from "./collections/Signals";
import { TransparencyLogs } from "./collections/TransparencyLogs";
import { Users } from "./collections/Users";
import { syncRSSFeedTask } from "./jobs/syncRSSFeed";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
	admin: {
		user: Users.slug,
		importMap: {
			baseDir: path.resolve(dirname),
		},
		meta: {
			titleSuffix: "- Stellar Light",
			favicon: "/logo.png",
			ogImage: "/logo.png",
		},
		components: {
			graphics: {
				Logo: "./components/payload/Logo#Logo",
				Icon: "./components/payload/Icon#Icon",
			},
			afterNavLinks: [
				"./components/payload/AfterNavLinks#AfterNavLinks",
			],
		},
	},
	collections: [
		Users,
		Media,
		Projects,
		Blog,
		RSSFeeds,
		Signals,
		Entities,
		TransparencyLogs,
	],
	jobs: {
		tasks: [
			{
				slug: "sync-rss-feed",
				handler: syncRSSFeedTask,
				interfaceName: "SyncRSSFeedTask",
				inputSchema: [
					{
						name: "feedId",
						type: "text",
						label: "Feed ID (optional - leave empty to sync all)",
						required: false,
					},
					{
						name: "syncAll",
						type: "checkbox",
						label: "Sync All Enabled Feeds",
						required: false,
					},
				],
			},
		],
		jobsCollectionOverrides: ({ defaultJobsCollection }) => {
			return {
				...defaultJobsCollection,
				admin: {
					...defaultJobsCollection.admin,
					hidden: false,
					group: "System",
					useAsTitle: "taskSlug",
					defaultColumns: ["taskSlug", "taskStatus", "createdAt", "completedAt"],
				},
				labels: {
					singular: "Sync Job",
					plural: "Sync Jobs",
				},
				access: {
					read: ({ req }) => !!req.user,
					create: () => false,
					update: () => false,
					delete: ({ req }) => !!req.user,
				},
			};
		},
	},
	editor: lexicalEditor(),
	secret: process.env.PAYLOAD_SECRET || "",
	typescript: {
		outputFile: path.resolve(dirname, "payload-types.ts"),
	},
	db: mongooseAdapter({
		url: process.env.MONGODB_URI || process.env.DATABASE_URI || "",
	}),
	sharp,
	plugins: [
		payloadCloudPlugin(),
		// storage-adapter-placeholder
	],
});
