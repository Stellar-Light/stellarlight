import { withPayload } from "@payloadcms/next/withPayload";

/** @type {import('next').NextConfig} */
const nextConfig = {
	// Exclude problematic packages from server-side bundling
	// This prevents Next.js from trying to bundle these packages
	serverExternalPackages: [
		"thread-stream",
		"pino",
		"pino-pretty",
	],
	webpack: (webpackConfig, { isServer, webpack }) => {
		webpackConfig.resolve.extensionAlias = {
			".cjs": [".cts", ".cjs"],
			".js": [".ts", ".tsx", ".js", ".jsx"],
			".mjs": [".mts", ".mjs"],
		};

		// Ignore test files from node_modules
		webpackConfig.plugins = webpackConfig.plugins || [];
		webpackConfig.plugins.push(
			new webpack.IgnorePlugin({
				resourceRegExp: /\.(test|spec)\.(js|ts|mjs|cjs|tsx|jsx)$/,
				contextRegExp: /node_modules/,
			})
		);

		// Ignore non-JS files that shouldn't be processed
		webpackConfig.plugins.push(
			new webpack.IgnorePlugin({
				resourceRegExp: /\.(md|txt|zip|sh|yml|yaml|LICENSE)$/,
				contextRegExp: /node_modules\/thread-stream/,
			})
		);

		return webpackConfig;
	},
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
