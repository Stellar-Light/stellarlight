import { mongooseAdapter } from "@payloadcms/db-mongodb";
import { payloadCloudPlugin } from "@payloadcms/payload-cloud";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { vercelBlobStorage } from "@payloadcms/storage-vercel-blob";
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
			// favicon and ogImage are handled via Next.js metadata
		} as any, // Payload meta config types may vary by version
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
		connectOptions: {
			// Ensure SSL/TLS is properly configured for MongoDB Atlas
			// These options help with connection stability
			serverSelectionTimeoutMS: 5000,
			socketTimeoutMS: 45000,
		},
	}),
	sharp,
	plugins: [
		payloadCloudPlugin(),
		// Always add Vercel Blob storage adapter
		// The adapter requires a valid token to initialize the provider
		vercelBlobStorage({
			collections: {
				media: {
					prefix: "media",
				},
			},
			token: process.env.BLOB_READ_WRITE_TOKEN || "",
		}),
	],
});
