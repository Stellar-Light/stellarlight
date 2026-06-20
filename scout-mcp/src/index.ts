#!/usr/bin/env node
/**
 * Stellar Scout MCP Server
 *
 * Exposes stellarlight.xyz's 15 public APIs as MCP tools so any MCP-compatible
 * client (Claude desktop, Cursor, ChatGPT custom GPTs, Gemini, Cline, Continue,
 * Zed, etc.) can call them as native function calls.
 *
 * The underlying APIs are documented at https://stellarlight.xyz/scout.
 * Each tool is a thin wrapper that handles URL construction + response parsing.
 *
 * Usage (MCP client config):
 *
 *   { "command": "npx", "args": ["-y", "@stellar-light/scout-mcp"] }
 *
 * Or self-hosted:
 *
 *   { "command": "node", "args": ["/path/to/dist/index.js"] }
 *
 * Optional environment variables:
 *
 *   SCOUT_API_BASE  - override the API base URL (default: https://stellarlight.xyz)
 *   SCOUT_USER_AGENT - override the user-agent string sent on each call
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = process.env.SCOUT_API_BASE ?? "https://stellarlight.xyz";
const VERSION = "1.1.0";
const USER_AGENT = process.env.SCOUT_USER_AGENT ?? `stellar-scout-mcp/${VERSION}`;

/**
 * Centralized fetch with error handling. Returns the parsed JSON or a structured
 * error response the MCP client can surface to the user / agent.
 */
async function callScout<T = unknown>(
	path: string,
	init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
	const url = `${API_BASE}${path}`;
	try {
		const res = await fetch(url, {
			...init,
			headers: {
				"User-Agent": USER_AGENT,
				Accept: "application/json",
				...(init?.body ? { "Content-Type": "application/json" } : {}),
				...(init?.headers ?? {}),
			},
		});
		const text = await res.text();
		let data: T;
		try {
			data = JSON.parse(text) as T;
		} catch {
			return {
				ok: false,
				error: `Non-JSON response from ${url} (status ${res.status}): ${text.slice(0, 200)}`,
				status: res.status,
			};
		}
		if (!res.ok) {
			return {
				ok: false,
				error: `HTTP ${res.status} from ${url}: ${JSON.stringify(data).slice(0, 200)}`,
				status: res.status,
			};
		}
		return { ok: true, data };
	} catch (err) {
		return {
			ok: false,
			error: `Network error calling ${url}: ${(err as Error).message}`,
		};
	}
}

/** Shape every tool returns to MCP — either the data as pretty JSON, or a clear error. */
function asToolResult(
	result:
		| { ok: true; data: unknown }
		| { ok: false; error: string; status?: number },
): { content: { type: "text"; text: string }[]; isError?: boolean } {
	if (result.ok) {
		return {
			content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
		};
	}
	return {
		isError: true,
		content: [{ type: "text", text: result.error }],
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

const server = new McpServer({
	name: "stellar-scout",
	version: VERSION,
});

// 1. search_research — vector search over the research corpus
server.registerTool(
	"search_research",
	{
		title: "Search the Stellar research corpus",
		description:
			"Vector search over a 4,541-chunk corpus of primary Stellar sources: SEPs, SCF Handbook, dev docs, foundational papers (Mazières SCP), lumenloop community playbooks, Soroban audit reports (Certora, OtterSec, Halborn, OpenZeppelin, Code4rena, etc.), Electric Capital Developer Reports, and SDF blog. Returns top-K chunks with severity metadata for audit chunks.",
		inputSchema: {
			query: z
				.string()
				.min(2)
				.describe("Natural-language search query."),
			source: z
				.enum([
					"sdf-blog",
					"scf-handbook",
					"sep",
					"dev-docs",
					"paper",
					"scf-proposal",
					"lumenloop",
					"lumenloop-research",
					"audit",
					"ec-developer-report",
				])
				.optional()
				.describe(
					"Optional source filter. Use 'audit' for security questions, 'ec-developer-report' for ecosystem stats, 'paper' for foundational protocol questions.",
				),
			limit: z
				.number()
				.int()
				.min(1)
				.max(25)
				.optional()
				.describe("Max results to return (default 8, max 25)."),
		},
	},
	async ({ query, source, limit }) => {
		const params = new URLSearchParams({ q: query });
		if (source) params.set("source", source);
		if (limit !== undefined) params.set("limit", String(limit));
		const result = await callScout(`/api/research?${params}`);
		return asToolResult(result);
	},
);

// 2. get_hackathons — list curated + DoraHacks events
server.registerTool(
	"get_hackathons",
	{
		title: "List Stellar hackathons",
		description:
			"Returns curated Stellar hackathons + live DoraHacks events. Empty status-scoped queries include fallback channels (BuildOnStellar / stellarlight / DoraHacks) so agents can route users to live announcement sources.",
		inputSchema: {
			status: z
				.enum(["upcoming", "active", "completed"])
				.optional()
				.describe("Optional status filter."),
			organizer: z
				.string()
				.optional()
				.describe("Optional organizer slug filter."),
			source: z
				.enum(["curated", "dorahacks"])
				.optional()
				.describe(
					"Restrict to one feed. Useful when comparing curated detail vs live DoraHacks feed.",
				),
			limit: z
				.number()
				.int()
				.min(1)
				.max(100)
				.optional()
				.describe("Max results (default 20)."),
		},
	},
	async ({ status, organizer, source, limit }) => {
		const params = new URLSearchParams();
		if (status) params.set("status", status);
		if (organizer) params.set("organizer", organizer);
		if (source) params.set("source", source);
		if (limit !== undefined) params.set("limit", String(limit));
		const qs = params.toString();
		const result = await callScout(`/api/hackathons${qs ? `?${qs}` : ""}`);
		return asToolResult(result);
	},
);

// 3. get_hackathon — detail for one hackathon
server.registerTool(
	"get_hackathon",
	{
		title: "Get one hackathon's full detail",
		description:
			"Returns submissions, placements, prize tracks, post-hack status funnel, and outcome data for one hackathon by slug. Dual-shape response: curated entries return full detail; DoraHacks-only entries return metadata + prize pool + an explicit .meta.note saying detail isn't curated yet.",
		inputSchema: {
			slug: z
				.string()
				.min(1)
				.describe("Hackathon slug (e.g. 'stellar-agents-x402-stripe-mpp')."),
		},
	},
	async ({ slug }) => {
		const result = await callScout(`/api/hackathons/${encodeURIComponent(slug)}`);
		return asToolResult(result);
	},
);

// 4. compare_hackathons — side-by-side
server.registerTool(
	"compare_hackathons",
	{
		title: "Compare 2–5 Stellar hackathons side-by-side",
		description:
			"Returns each hackathon's stats + a .deltas block highlighting differences agents care about (prize spread, hacker count, prize-per-winner). Useful for *'which Stellar hackathon should I enter?'* type questions.",
		inputSchema: {
			slugs: z
				.array(z.string().min(1))
				.min(2)
				.max(5)
				.describe("2–5 hackathon slugs to compare."),
		},
	},
	async ({ slugs }) => {
		const result = await callScout("/api/hackathons/compare", {
			method: "POST",
			body: JSON.stringify({ slugs }),
		});
		return asToolResult(result);
	},
);

// 5. get_builders — Stellar Passport builder directory
server.registerTool(
	"get_builders",
	{
		title: "Search Stellar builders",
		description:
			"Returns Stellar builder profiles (sourced from Stellar Passport). Each builder has displayName, githubUsername, bio, location, scfTier, projects[], plus stats. Useful for *'find a teammate / collaborator who has shipped in X'* queries.",
		inputSchema: {
			location: z
				.string()
				.optional()
				.describe("Filter by location substring (e.g. 'Lagos', 'Brazil')."),
			skill: z
				.string()
				.optional()
				.describe("Filter by skill/tech mentioned in bio."),
			scfTier: z
				.string()
				.optional()
				.describe("Filter by SCF tier."),
			limit: z
				.number()
				.int()
				.min(1)
				.max(50)
				.optional()
				.describe("Max results (default 20)."),
		},
	},
	async ({ location, skill, scfTier, limit }) => {
		const params = new URLSearchParams();
		if (location) params.set("location", location);
		if (skill) params.set("skill", skill);
		if (scfTier) params.set("scfTier", scfTier);
		if (limit !== undefined) params.set("limit", String(limit));
		const qs = params.toString();
		const result = await callScout(`/api/builders${qs ? `?${qs}` : ""}`);
		return asToolResult(result);
	},
);

// 6. search_projects — prior-art / competitor lookup
server.registerTool(
	"search_projects",
	{
		title: "Find Stellar projects, protocols & services (ecosystem directory)",
		description:
			"The Stellar ecosystem directory — search 740+ curated projects, protocols, and services by keyword or category: DEXes/AMMs/swap services, wallets, anchors, lending, tooling, infrastructure, assets. Use this for ANY 'find / list / what are the … on Stellar' lookup (e.g. 'swap services', 'wallets', 'lending protocols') AND for prior-art / 'has anyone already built this?' gap checks. Tiered match-mode (strict → loose → majority) surfaced as .meta.matchMode; results carry confidence scores.",
		inputSchema: {
			q: z.string().optional().describe("Keyword query."),
			category: z
				.string()
				.optional()
				.describe(
					"Filter by category (Infrastructure, Tooling, User-Facing App, Asset, Protocol/Contract, Anchor, Partner Integration).",
				),
			hackathon: z
				.string()
				.optional()
				.describe("Filter by hackathon slug."),
			scfAwarded: z
				.boolean()
				.optional()
				.describe("Filter to SCF-funded projects only."),
			limit: z
				.number()
				.int()
				.min(1)
				.max(100)
				.optional()
				.describe("Max results (default 20)."),
		},
	},
	async ({ q, category, hackathon, scfAwarded, limit }) => {
		const params = new URLSearchParams();
		if (q) params.set("q", q);
		if (category) params.set("category", category);
		if (hackathon) params.set("hackathon", hackathon);
		if (scfAwarded) params.set("scfAwarded", "1");
		if (limit !== undefined) params.set("limit", String(limit));
		const qs = params.toString();
		const result = await callScout(
			`/api/projects/search${qs ? `?${qs}` : ""}`,
		);
		return asToolResult(result);
	},
);

// 6b. search_repos — graded GitHub code-reference index
server.registerTool(
	"search_repos",
	{
		title: "Search the Stellar GitHub repo / code-reference index",
		description:
			"The code layer beneath the project directory — search ~1,900 indexed-and-scored Stellar ecosystem GitHub repos by tech/keyword. Answers 'show me the repos / code for X', 'what repos exist for X', 'is there an open-source implementation of X', and prior-art *code* lookups that project search can't. Indexes GitHub topics + description + language + README, expands synonyms (zk→zero-knowledge/snark, oracle→price-feed, …), and ranks by repoScore (0–100 = freshness + traction + hackathon/SCF/builder authority). Lead with high-score repos as the strongest existing references and cite each repo's url/homepage. The same graded repos are injected inline into search_projects as `codeReferences`, so use this tool when you specifically want repos ranked on their own.",
		inputSchema: {
			q: z
				.string()
				.optional()
				.describe(
					"Tech/keyword query (e.g. 'zk', 'oracle', 'escrow', 'soroban amm').",
				),
			language: z
				.string()
				.optional()
				.describe("Filter by primary language (e.g. 'Rust', 'TypeScript')."),
			minScore: z
				.number()
				.int()
				.min(0)
				.max(100)
				.optional()
				.describe(
					"Only return repos with repoScore ≥ this (0–100). Use 40+ for high-signal references.",
				),
			limit: z
				.number()
				.int()
				.min(1)
				.max(100)
				.optional()
				.describe("Max results (default 20)."),
			offset: z
				.number()
				.int()
				.min(0)
				.optional()
				.describe("Pagination offset (default 0)."),
		},
	},
	async ({ q, language, minScore, limit, offset }) => {
		const params = new URLSearchParams();
		if (q) params.set("q", q);
		if (language) params.set("language", language);
		if (minScore !== undefined) params.set("minScore", String(minScore));
		if (limit !== undefined) params.set("limit", String(limit));
		if (offset !== undefined) params.set("offset", String(offset));
		const qs = params.toString();
		const result = await callScout(`/api/repos/search${qs ? `?${qs}` : ""}`);
		return asToolResult(result);
	},
);

// 7. get_rfps — Open + closed Stellar RFPs
server.registerTool(
	"get_rfps",
	{
		title: "List Stellar RFPs (SCF-funded sponsor briefs)",
		description:
			"Returns open + closed Stellar RFPs (sponsor briefs that get SCF-funded for the winning team). Quarter-aware: response includes .meta.activeQuarter so agents know which RFPs are open *now* vs prior rounds.",
		inputSchema: {
			status: z
				.enum(["open", "closed"])
				.optional()
				.describe(
					"Open RFPs are fundable for the current SCF quarter; closed are prior rounds.",
				),
			quarter: z
				.string()
				.optional()
				.describe("Filter by quarter slug (e.g. 'q1-2026')."),
			limit: z
				.number()
				.int()
				.min(1)
				.max(100)
				.optional()
				.describe("Max results (default 20)."),
		},
	},
	async ({ status, quarter, limit }) => {
		const params = new URLSearchParams();
		if (status) params.set("status", status);
		if (quarter) params.set("quarter", quarter);
		if (limit !== undefined) params.set("limit", String(limit));
		const qs = params.toString();
		const result = await callScout(`/api/rfps${qs ? `?${qs}` : ""}`);
		return asToolResult(result);
	},
);

// 8. list_skills — Stellar AI skill catalog
server.registerTool(
	"list_skills",
	{
		title: "List Stellar AI skills",
		description:
			"Returns the catalog of skills.stellar.org's 7 official skills (soroban, anchors, dapp, assets, data, agentic-payments, zk-proofs, standards). Useful when matching a builder's idea to the right SDK skill for execution.",
		inputSchema: {},
	},
	async () => {
		const result = await callScout("/api/skills");
		return asToolResult(result);
	},
);

// 9. get_skill — one skill's content
server.registerTool(
	"get_skill",
	{
		title: "Get the full content of one Stellar AI skill",
		description:
			"Returns the full SKILL.md content for one of skills.stellar.org's official skills, plus metadata.",
		inputSchema: {
			name: z
				.string()
				.min(1)
				.describe("Skill name (e.g. 'soroban', 'anchors', 'agentic-payments')."),
		},
	},
	async ({ name }) => {
		const result = await callScout(`/api/skills/${encodeURIComponent(name)}`);
		return asToolResult(result);
	},
);

// 10. get_leaderboard — ecosystem dev activity
server.registerTool(
	"get_leaderboard",
	{
		title: "Get Stellar ecosystem developer activity",
		description:
			"Returns 28-day active dev counts, commits, full-time vs part-time vs one-time dev splits, geographic distribution. Sourced from Electric Capital. Useful for *'how does Stellar compare on dev activity?'* macro questions.",
		inputSchema: {
			include: z
				.string()
				.optional()
				.describe(
					"Optional comma-separated includes (e.g. 'hackathons' to surface hackathon context).",
				),
		},
	},
	async ({ include }) => {
		const qs = include ? `?include=${encodeURIComponent(include)}` : "";
		const result = await callScout(`/api/leaderboard${qs}`);
		return asToolResult(result);
	},
);

// 11. get_status — health check + self-discovery
server.registerTool(
	"get_status",
	{
		title: "Get Scout API health + endpoint enumeration",
		description:
			"Returns service health, data-source freshness per collection (projects, hackathons, builders, ecosystemStats, sdfSkills), and an enumeration of all 14 endpoints. Useful as a self-discovery call before making other queries.",
		inputSchema: {},
	},
	async () => {
		const result = await callScout("/api/status");
		return asToolResult(result);
	},
);

// 12. submit_feedback — in-skill feedback loop
server.registerTool(
	"submit_feedback",
	{
		title: "Submit feedback on Stellar Scout",
		description:
			"Send a feedback report when the skill returns wrong / missing / misleading information. Lands in stellarlight's curator queue. Rate-limited to 6/minute/IP.",
		inputSchema: {
			kind: z
				.enum([
					"bug",
					"missing-data",
					"wrong-answer",
					"suggestion",
					"other",
				])
				.describe("Category of feedback."),
			message: z
				.string()
				.min(10)
				.max(4000)
				.describe(
					"Describe what went wrong concretely. 10–4000 chars. Include the query + endpoint if relevant.",
				),
			query: z
				.string()
				.optional()
				.describe("The user query that triggered the issue."),
			endpoint: z
				.string()
				.optional()
				.describe("Which /api/* endpoint misbehaved."),
			agentName: z
				.string()
				.optional()
				.describe(
					"Your agent name (e.g. 'claude-code', 'cursor-mcp', 'gemini').",
				),
		},
	},
	async ({ kind, message, query, endpoint, agentName }) => {
		const result = await callScout("/api/feedback", {
			method: "POST",
			body: JSON.stringify({
				kind,
				message,
				context: {
					query,
					endpoint,
					skillVersion: VERSION,
					agentName: agentName ?? "scout-mcp",
				},
			}),
		});
		return asToolResult(result);
	},
);

// 13. get_clusters — topic clusters with crowdedness scores
server.registerTool(
	"get_clusters",
	{
		title: "Get Stellar project topic clusters with crowdedness scores",
		description:
			"Returns clusters of projects by category or types, each with a log-scaled crowdedness score (1–10), SCF-funded count, and sample projects. Useful for *'what's most crowded on Stellar?'* / *'show me underbuilt categories'* queries.",
		inputSchema: {
			dimension: z
				.enum(["category", "types"])
				.optional()
				.describe("Cluster by category (coarse 7-cat) or types (finer)."),
			minSize: z
				.number()
				.int()
				.min(1)
				.optional()
				.describe("Only include clusters with at least N projects."),
		},
	},
	async ({ dimension, minSize }) => {
		const params = new URLSearchParams();
		if (dimension) params.set("dimension", dimension);
		if (minSize !== undefined) params.set("minSize", String(minSize));
		const qs = params.toString();
		const result = await callScout(`/api/clusters${qs ? `?${qs}` : ""}`);
		return asToolResult(result);
	},
);

// 14. analyze_ecosystem — cross-event analytics
server.registerTool(
	"analyze_ecosystem",
	{
		title: "Cross-event Stellar ecosystem analytics rollup",
		description:
			"Aggregate stats across all hackathons + projects + SCF funding. Returns: total events, prize pool totals, top categories by project count + SCF-funded count, distribution of SCF awards, post-hackathon status funnel (Built / In Progress / Abandoned). Dimensions: 'all' | 'hackathons' | 'categories' | 'funding'.",
		inputSchema: {
			dimension: z
				.enum(["all", "hackathons", "categories", "funding"])
				.optional()
				.describe(
					"Which slice to return. Default 'all' returns everything.",
				),
		},
	},
	async ({ dimension }) => {
		const qs = dimension ? `?dimension=${dimension}` : "";
		const result = await callScout(`/api/analyze${qs}`);
		return asToolResult(result);
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	// stderr is the only safe place to log — stdout is the MCP wire protocol.
	console.error(
		`[stellar-scout-mcp v${VERSION}] connected via stdio · API base ${API_BASE}`,
	);
}

main().catch((err) => {
	console.error("[stellar-scout-mcp] FATAL:", err);
	process.exit(1);
});
