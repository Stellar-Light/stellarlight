import { withPayload } from "@payloadcms/next/withPayload";

/** @type {import('next').NextConfig} */
const nextConfig = {
	// Disable client-side router cache so filter changes always fetch fresh data
	experimental: {
		staleTimes: {
			dynamic: 0,
			static: 180,
		},
	},
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "cdn.dorahacks.io",
			},
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "demo.stellarpassport.xyz",
			},
		],
	},
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
	async headers() {
		// CORS + version header for the PUBLIC Scout API only.
		//
		// We deliberately enumerate the public read endpoints instead of a
		// blanket `/api/:path*` — Payload mounts its own admin REST under
		// /api/* (users, media, auth, collections), and we must NOT open
		// those to cross-origin reads. Add new public endpoints here as they
		// ship (the verify-claims gate + SHIPPING.md track this).
		//
		// X-API-Version lets aggregators detect breaking changes: the value
		// bumps when a response shape changes incompatibly. Today: 1.
		const publicApi = [
			"/api/openapi.json",
			"/api/status",
			"/api/changelog",
			"/api/audits",
			"/api/projects/search",
			"/api/repos/search",
			"/api/repos/explain",
			"/api/hackathons",
			"/api/hackathons/:slug",
			"/api/hackathons/compare",
			"/api/builders",
			"/api/partners",
			"/api/partners/:slug",
			"/api/rfps",
			"/api/research",
			"/api/skills",
			"/api/skills/:name",
			"/api/skills/:name/og",
			"/api/clusters",
			"/api/analyze",
			"/api/leaderboard",
			"/api/feedback",
		];
		const corsHeaders = [
			{ key: "Access-Control-Allow-Origin", value: "*" },
			{ key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
			{ key: "Access-Control-Allow-Headers", value: "Content-Type" },
			{ key: "Access-Control-Max-Age", value: "86400" },
			{ key: "X-API-Version", value: "1" },
		];
		return publicApi.map((source) => ({ source, headers: corsHeaders }));
	},
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
