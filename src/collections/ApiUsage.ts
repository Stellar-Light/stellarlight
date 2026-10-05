import type { CollectionConfig } from "payload";
import { adminOnly } from "./access";

/**
 * ApiUsage — append-only log of public-API hits for the Stellar Scout
 * surface. One row per request. Used to track skill adoption and
 * understand which questions agents are asking.
 *
 * Privacy:
 * - No IP address logged
 * - Query string is truncated to 100 chars + lowercased
 * - User-Agent is bucketed into a coarse category, not stored raw
 * - No request body / response body
 *
 * Access:
 * - Read: admin only (curators see usage in the Payload admin)
 * - Create: via Payload's local API only — public REST/GraphQL blocked
 * - Update/delete: forbidden (append-only)
 */
export const ApiUsage: CollectionConfig = {
	slug: "api-usage",
	admin: {
		useAsTitle: "endpoint",
		defaultColumns: [
			"endpoint",
			"uaBucket",
			"scoutVersion",
			"country",
			"createdAt",
		],
		group: "Analytics",
		description:
			"Public-API hit log. Append-only, used to measure Scout skill adoption.",
	},
	access: {
		read: adminOnly,
		create: () => false, // local API only — REST/GraphQL clients cannot create
		update: () => false,
		delete: adminOnly,
	},
	fields: [
		{
			name: "endpoint",
			type: "text",
			required: true,
			index: true,
			admin: {
				description: "Endpoint path (e.g. /api/projects/search)",
			},
		},
		{
			name: "query",
			type: "text",
			admin: {
				description: "Query keywords (truncated to 100 chars, lowercased)",
			},
		},
		{
			name: "uaBucket",
			type: "select",
			defaultValue: "other",
			index: true,
			options: [
				{ label: "Claude Code / Claude.ai", value: "claude" },
				{ label: "Codex / OpenAI", value: "codex" },
				{ label: "Cursor", value: "cursor" },
				{ label: "Generic agent / SDK", value: "agent" },
				{ label: "curl / scripted", value: "curl" },
				{ label: "Browser", value: "browser" },
				{ label: "Bot / crawler", value: "bot" },
				{ label: "Stellarlight probe / engine", value: "probe" },
				{ label: "Other", value: "other" },
			],
		},
		{
			name: "scoutVersion",
			type: "text",
			index: true,
			admin: {
				description: "Value of the X-Scout-Version header, if sent",
			},
		},
		{
			name: "country",
			type: "text",
			admin: {
				description:
					"ISO country code from edge geo header (Vercel x-vercel-ip-country / CF cf-ipcountry)",
			},
		},
		{
			name: "filtersJson",
			type: "text",
			admin: {
				description:
					"Compact JSON snapshot of filter params (truncated). e.g. {category:'defi',scfAwarded:1}",
			},
		},
		{
			// Engine D (demand-side mining): rows returned on this response.
			// 0 = a real consumer asked and got nothing — the highest-signal
			// miss class there is, trendable straight from the log.
			name: "resultCount",
			type: "number",
			admin: {
				description: "Rows returned on this response (0 = miss)",
			},
		},
		{
			// HTTP status we answered with. A 5xx row is the server-side record
			// of a failure the caller saw; without it a stall leaves no trace.
			name: "status",
			type: "number",
			index: true,
		},
		{
			// Our own wall time for the request in milliseconds, measured from
			// the start of the handler to the moment the hit is logged.
			name: "durationMs",
			type: "number",
		},
		{
			// Match tier served (projects: strict/loose-1/majority/semantic/all;
			// research: vector/keyword). `semantic` on projects = pure fallback.
			name: "matchMode",
			type: "text",
			admin: {
				description: "Match tier / retrieval mode served",
			},
		},
	],
	timestamps: true,
};
