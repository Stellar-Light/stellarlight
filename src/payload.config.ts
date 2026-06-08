import { mongooseAdapter } from "@payloadcms/db-mongodb";
import { payloadCloudPlugin } from "@payloadcms/payload-cloud";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { s3Storage } from "@payloadcms/storage-s3";
import path from "path";
import { buildConfig } from "payload";
import { fileURLToPath } from "url";
import sharp from "sharp";

import { Blog } from "./collections/Blog";
import Builders from "./collections/Builders";
import { Carousel } from "./collections/Carousel";
import { CommunitySkills } from "./collections/CommunitySkills";
import { Entities } from "./collections/Entities";
import { ApiUsage } from "./collections/ApiUsage";
import { Hackathons } from "./collections/Hackathons";
import { IdeaSubmissions } from "./collections/IdeaSubmissions";
import { Media } from "./collections/Media";
import { ResearchDocs } from "./collections/ResearchDocs";
import { ScoutFeedback } from "./collections/ScoutFeedback";
import { Projects } from "./collections/Projects";
import { RSSFeeds } from "./collections/RSSFeeds";
import { Signals } from "./collections/Signals";
import { TransparencyLogs } from "./collections/TransparencyLogs";
import { Users } from "./collections/Users";
import { Banner } from "./globals/Banner";
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
		Builders,
		RSSFeeds,
		Signals,
		Entities,
		TransparencyLogs,
		Carousel,
		Hackathons,
		IdeaSubmissions,
		ApiUsage,
		ResearchDocs,
		ScoutFeedback,
		CommunitySkills,
	],
	globals: [Banner],
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
			// MongoDB Atlas recommended options
			retryWrites: true,
			w: 'majority',
		},
		// Disable file storage in MongoDB - files stored on disk in /media directory
		// On Vercel (read-only filesystem), uploads will fail but admin panel works
		// For persistent storage, use external storage like Cloudflare R2 or AWS S3
		disableIndexHints: false,
	}),
	sharp,
	plugins: [
		payloadCloudPlugin(),
		// Cloudflare R2 storage for media uploads (using S3-compatible adapter)
		// R2 is S3-compatible, so we use the S3 storage adapter
		// Conditionally enabled when credentials are available
		...(process.env.R2_ACCESS_KEY_ID &&
		process.env.R2_SECRET_ACCESS_KEY &&
		process.env.R2_BUCKET &&
		process.env.R2_ENDPOINT
			? [
					s3Storage({
						collections: {
							media: true, // Enable R2 storage for media collection
						},
						bucket: process.env.R2_BUCKET || "",
						config: {
							credentials: {
								accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
								secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
							},
							region: process.env.R2_REGION || "auto",
							endpoint: process.env.R2_ENDPOINT || "",
							forcePathStyle: true, // Required for R2 compatibility
						},
					}),
				]
			: []),
	],
});
