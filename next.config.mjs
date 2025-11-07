import { withPayload } from "@payloadcms/next/withPayload";

/** @type {import('next').NextConfig} */
const nextConfig = {
	// Your Next.js config here
	// Disable ESLint during builds - we use Biome instead
	eslint: {
		ignoreDuringBuilds: true,
	},
	webpack: (webpackConfig) => {
		webpackConfig.resolve.extensionAlias = {
			".cjs": [".cts", ".cjs"],
			".js": [".ts", ".tsx", ".js", ".jsx"],
			".mjs": [".mts", ".mjs"],
		};

		return webpackConfig;
	},
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
