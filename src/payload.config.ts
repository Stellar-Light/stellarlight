// storage-adapter-import-placeholder
import { mongooseAdapter } from "@payloadcms/db-mongodb";
import { payloadCloudPlugin } from "@payloadcms/payload-cloud";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import path from "path";
import { buildConfig } from "payload";
import { fileURLToPath } from "url";
import sharp from "sharp";

import { Entities } from "./collections/Entities";
import { Media } from "./collections/Media";
import { Projects } from "./collections/Projects";
import { SyncJobs } from "./collections/SyncJobs";
import { TransparencyLogs } from "./collections/TransparencyLogs";
import { Users } from "./collections/Users";

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
		},
	},
	collections: [Users, Media, Projects, Entities, TransparencyLogs, SyncJobs],
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
