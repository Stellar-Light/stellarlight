#!/usr/bin/env node
/**
 * Stellar Scout MCP Server
 *
 * Exposes stellarlight.xyz's 19 public APIs as MCP tools so any MCP-compatible
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
import { version as pkgVersion } from "../package.json";

const API_BASE = process.env.SCOUT_API_BASE ?? "https://stellarlight.xyz";
// Derived from package.json at build time (tsup inlines it) so the
// self-reported serverInfo.version can never drift from the published version
// again — 1.1.6 shipped reporting "1.1.5" because this was a hardcoded string.
// Same fix as api-client's CLIENT_VERSION (#226).
const VERSION = pkgVersion;
const USER_AGENT =
	process.env.SCOUT_USER_AGENT ?? `stellar-scout-mcp/${VERSION}`;

/**
 * Centralized fetch with error handling. Returns the parsed JSON or a structured
 * error response the MCP client can surface to the user / agent.
 */
async function callScout<T = unknown>(
	path: string,
	init?: RequestInit,
): Promise<
	{ ok: true; data: T } | { ok: false; error: string; status?: number }
> {
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
			"Semantic search over the Stellar knowledge corpus — SDF blog, SCF Handbook, SEPs/standards, dev docs, papers, audits, incident reports. Returns cited text chunks with source, section, URL, confidence (audits add auditor/severity). THE surface for 'how does X work', 'what does the SEP/spec/audit say', and how-to/feasibility questions. Not for products and their funding/status → use search_projects.",
		inputSchema: {
			query: z.string().min(2).describe("Natural-language search query."),
			source: z
				.enum([
					// Keep in sync with VALID_SOURCES in src/app/api/research/route.ts
					// (the live API is the source of truth for this value set).
					"sdf-blog",
					"scf-handbook",
					"sep",
					"cap",
					"dev-docs",
					"paper",
					"scf-proposal",
					"lumenloop",
					"lumenloop-research",
					"audit",
					"incident",
					"security-program",
					"sdf-org",
					"ec-developer-report",
					"release",
				])
				.optional()
				.describe(
					"Optional source filter. Use 'audit' for security questions, 'incident' for exploit/post-mortem history, 'security-program' for bug-bounty / vulnerability-disclosure program status (which program is current, where to report), 'sdf-org' for SDF's canonical organizational pages (mandate, legal structure/terms, foundation, team, enterprise fund, quarterly-reports index), 'ec-developer-report' for ecosystem stats, 'paper' for foundational protocol questions, 'release' for stellar-core/CLI/SDK release notes (what shipped, when — protocol upgrade tags).",
				),
			auditor: z
				.string()
				.optional()
				.describe(
					"Audit-metadata filter: exact auditor firm (case-insensitive, e.g. OtterSec). Implies source=audit — retrieval is scoped to audit chunks.",
				),
			protocol: z
				.string()
				.optional()
				.describe(
					"Audit-metadata filter: audited protocol/codebase name (substring). Implies source=audit.",
				),
			severity: z
				.enum(["critical", "high", "medium", "low", "informational", "unknown"])
				.optional()
				.describe(
					"Audit-metadata filter (per-chunk inferred severity; 'unknown' for most PDF-derived chunks). Implies source=audit. For report-level enumeration use get_audits.",
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
	async ({ query, source, auditor, protocol, severity, limit }) => {
		const params = new URLSearchParams({ q: query });
		if (source) params.set("source", source);
		if (auditor) params.set("auditor", auditor);
		if (protocol) params.set("protocol", protocol);
		if (severity) params.set("severity", severity);
		if (limit !== undefined) params.set("limit", String(limit));
		const result = await callScout(`/api/research?${params}`);
		return asToolResult(result);
	},
);

// 1b. get_audits — the enumerable security-audit registry
server.registerTool(
	"get_audits",
	{
		title: "List Stellar security-audit reports",
		description:
			"Enumerable registry of Stellar security-audit reports — one row per report (normalized auditor, publication date, verified directory-project link). Answers 'list all audits for project X', 'what has firm Y audited on Stellar', 'newest Soroban audits'. Absence of a report = no audit ON RECORD at our source, NOT a claim the project is unaudited; findingsTotal/severityCounts null = not extracted, NOT zero. For what an audit FOUND (findings text) → search_research with source=audit.",
		inputSchema: {
			project: z
				.string()
				.optional()
				.describe("Directory project slug (exact), e.g. blend."),
			auditor: z
				.string()
				.optional()
				.describe(
					"Auditor firm, case-insensitive exact match (e.g. OtterSec).",
				),
			query: z
				.string()
				.optional()
				.describe("Substring match on title / protocol / project name."),
			since: z
				.string()
				.optional()
				.describe("Only reports published on/after this date (YYYY-MM-DD)."),
			limit: z
				.number()
				.int()
				.min(1)
				.max(100)
				.optional()
				.describe("Max rows (default 100)."),
		},
	},
	async ({ project, auditor, query, since, limit }) => {
		const params = new URLSearchParams();
		if (project) params.set("project", project);
		if (auditor) params.set("auditor", auditor);
		if (query) params.set("q", query);
		if (since) params.set("since", since);
		if (limit !== undefined) params.set("limit", String(limit));
		const qs = params.toString();
		const result = await callScout(`/api/audits${qs ? `?${qs}` : ""}`);
		return asToolResult(result);
	},
);

// 2. get_hackathons — list curated + DoraHacks events
server.registerTool(
	"get_hackathons",
	{
		title: "List Stellar hackathons",
		description:
			"Browse/LIST Stellar hackathon events — a merged, de-duplicated curated + live DoraHacks feed (dates, status, organizer, prize pools), sorted upcoming→active→completed then newest-first. The entry point for event slugs; zero-result forward-looking queries return `meta.fallbackChannels` (surface them, don't dead-end). Not for one event's winners/submissions/tracks → use get_hackathon.",
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
			"Full detail for ONE hackathon by slug — every submission with placement, prize, track, and post-hack status; derives `winners`, per-track aggregates, and a `stats` outcome funnel. DoraHacks-only events read live, degrading to a winner roster + `meta.note`. Needs an exact slug — resolve via get_hackathons first. Not for listing/browsing events → use get_hackathons.",
		inputSchema: {
			slug: z
				.string()
				.min(1)
				.describe("Hackathon slug (e.g. 'stellar-agents-x402-stripe-mpp')."),
		},
	},
	async ({ slug }) => {
		const result = await callScout(
			`/api/hackathons/${encodeURIComponent(slug)}`,
		);
		return asToolResult(result);
	},
);

// 4. compare_hackathons — side-by-side
server.registerTool(
	"compare_hackathons",
	{
		title: "Compare 2–5 Stellar hackathons side-by-side",
		description:
			"Side-by-side comparison of 2–5 hackathons by slug — per-event snapshot (prize pool, submissions, winners, hackers, prize-per-winner) plus a `deltas` block flagging the spreads. Unresolved slugs return source:'not-found' without inflating counts. Requires ≥2 known slugs — resolve via get_hackathons. Not for ecosystem-wide totals across ALL events → use analyze_ecosystem.",
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
			"The Stellar PEOPLE directory — builder profiles synced from Stellar Passport (bio, role, location, shipped projects[]), searchable by `skill` and `location`. Use to find a person to recruit, hire, or collaborate with. Not for the company/product behind a project ('who built X') → use search_projects. Profiles carry NO SCF-tier/award data (the never-populated `scfTier` response field was removed in API spec 1.7.19).",
		inputSchema: {
			location: z
				.string()
				.optional()
				.describe("Filter by location substring (e.g. 'Lagos', 'Brazil')."),
			skill: z
				.string()
				.optional()
				.describe("Filter by skill/tech mentioned in bio."),
			limit: z
				.number()
				.int()
				.min(1)
				.max(50)
				.optional()
				.describe("Max results (default 20)."),
		},
	},
	async ({ location, skill, limit }) => {
		const params = new URLSearchParams();
		if (location) params.set("location", location);
		if (skill) params.set("skill", skill);
		if (limit !== undefined) params.set("limit", String(limit));
		const qs = params.toString();
		const result = await callScout(`/api/builders${qs ? `?${qs}` : ""}`);
		return asToolResult(result);
	},
);

// 5b. get_people — SDF team/people index (leadership, board, advisors)
server.registerTool(
	"get_people",
	{
		title: "SDF team / people index",
		description:
			"The Stellar Development Foundation org/people index — leadership, board of directors, and advisors (name → role → org), quoted from stellar.org/foundation/team with provenance. Use for 'who is <person>', 'what is <person>'s role at SDF', 'who leads <area>', 'who's on the SDF board'. Distinct from get_builders (GitHub-contributor profiles) — an SDF VP or board member is NOT a 'builder'. Not for doc/spec authorship → use search_research.",
		inputSchema: {
			q: z
				.string()
				.optional()
				.describe(
					"Name / role / org filter (e.g. 'justin rice', 'ecosystem', 'openai'). All tokens must match.",
				),
			section: z
				.string()
				.optional()
				.describe(
					"Restrict to one section: 'Leadership', 'Board of directors', or 'Advisors' (aliases 'board'/'advisor' accepted).",
				),
			limit: z
				.number()
				.int()
				.min(1)
				.max(100)
				.optional()
				.describe("Max results (default 50)."),
		},
	},
	async ({ q, section, limit }) => {
		const params = new URLSearchParams();
		if (q) params.set("q", q);
		if (section) params.set("section", section);
		if (limit !== undefined) params.set("limit", String(limit));
		const qs = params.toString();
		const result = await callScout(`/api/people${qs ? `?${qs}` : ""}`);
		return asToolResult(result);
	},
);

// 6. search_projects — prior-art / competitor lookup
server.registerTool(
	"search_projects",
	{
		title: "Find Stellar projects, protocols & services (ecosystem directory)",
		description:
			"Search the curated directory of Stellar projects/products — what has been BUILT, by whom, with SCF funding, lifecycle status, links, and indexed repos inline. Answers 'who/what already exists for X' with directory records. Not for docs, standards, or how-to/reference knowledge → use search_research.",
		inputSchema: {
			q: z.string().optional().describe("Keyword query."),
			category: z
				.string()
				.optional()
				.describe(
					"Filter by category (Infrastructure, Tooling, User-Facing App, Asset, Protocol/Contract, Anchor, Partner Integration).",
				),
			hackathon: z.string().optional().describe("Filter by hackathon slug."),
			status: z
				.string()
				.optional()
				.describe(
					"Filter by lifecycle status (Live, Inactive, Development, Pre-Release, Pre-Development). status=Inactive lists retired/defunct projects — useful for 'is X still alive' and post-mortem queries.",
				),
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
	async ({ q, category, hackathon, status, scfAwarded, limit }) => {
		const params = new URLSearchParams();
		if (q) params.set("q", q);
		if (category) params.set("category", category);
		if (hackathon) params.set("hackathon", hackathon);
		if (status) params.set("status", status);
		if (scfAwarded) params.set("scfAwarded", "1");
		if (limit !== undefined) params.set("limit", String(limit));
		const qs = params.toString();
		const result = await callScout(`/api/projects/search${qs ? `?${qs}` : ""}`);
		return asToolResult(result);
	},
);

// 6b. search_repos — graded GitHub code-reference index
server.registerTool(
	"search_repos",
	{
		title: "Search the Stellar GitHub repo / code-reference index",
		description:
			"Search the indexed Stellar ecosystem GitHub code repos — actual source graded by repoScore (0-100: code-depth + freshness + traction + ecosystem authority), each with a `codeVerified` block once scanned (prefer a real deployable contract on a current soroban-sdk). Use for 'show me the code/repos for X' or 'find a Rust/Soroban implementation of X'. Not for products/companies and their funding/status → use search_projects.",
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

// 6c. explain_repo — deep code answer (StellarLight routing × DeepWiki)
server.registerTool(
	"explain_repo",
	{
		title: "Explain a Stellar repo's internals (deep code answer)",
		description:
			"Source-grounded ANSWER to a deep code question about a Stellar internal — routes the question to the authoritative repo (stellar-core, Horizon/go, RPC, SDKs, SEP reference impls), then DeepWiki answers from that repo's source files. Pass `repo` to pin one, or omit to auto-route. Not for discovering which repos/projects exist → use search_repos / search_projects.",
		inputSchema: {
			q: z
				.string()
				.describe(
					"The deep code question, e.g. 'where are transaction result codes defined' or 'how does SCP reach consensus'.",
				),
			repo: z
				.string()
				.optional()
				.describe(
					"Optional owner/name to pin the repo (e.g. 'stellar/stellar-core'). Omit to auto-route to the authoritative repo.",
				),
		},
	},
	async ({ q, repo }) => {
		const params = new URLSearchParams();
		params.set("q", q);
		if (repo) params.set("repo", repo);
		const result = await callScout(`/api/repos/explain?${params.toString()}`);
		return asToolResult(result);
	},
);

// 7. get_rfps — Open + closed Stellar RFPs
server.registerTool(
	"get_rfps",
	{
		title: "List Stellar RFPs (SCF-funded sponsor briefs)",
		description:
			"Curated Stellar RFPs / sponsor briefs (mirrors /ideas) — open briefs are fundable in the current SCF round; closed ones are past rounds kept for context. Response carries open/closed counts, the activeQuarter, and the live SCF round + submission window (`meta.scfRound`). Answers 'what does the ecosystem want built'. Not for how-to-apply / SCF Handbook knowledge → use search_research.",
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
			"Catalog of installable Stellar AI skills/tools — SDF's official skills.stellar.org set merged with curated and community entries. Each entry carries an `install` command, `kind` (skill-md | mcp-server | sdk | cli | agent-kit | tool), and repo/docs links. Answers 'what Stellar AI skills / MCP servers can I install'. Not for ONE named skill's full content → use get_skill.",
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
			"Full detail for ONE skill by slug or display name — metadata plus, for SDF official skills, the complete raw SKILL.md text (`.skill.content`, fetched live from skills.stellar.org). 404s with a hint to list skills when unknown. Use when you know the skill and need its actual instructions or install command. Not for discovering which skills exist → use list_skills.",
		inputSchema: {
			name: z
				.string()
				.min(1)
				.describe(
					"Skill name (e.g. 'soroban', 'anchors', 'agentic-payments').",
				),
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
			"Ranked list of active Stellar projects with per-project GitHub rollups (stars, open-issue backlog, last activity), plus an Electric Capital dev-count macro block ('how many active Stellar devs'). Metrics are recency/backlog signals, not commit volume. Ranks PROJECTS, not people → use get_builders for individual developers.",
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
			"Self-describe / health endpoint — service ok + versions, per-source freshness and counts (`sources[]`), recent usage, and an enumeration of every /api/* endpoint. Cheap, no params. Use to check how fresh/large the data is or to discover endpoints. Not for the data itself → call the matching search tool.",
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
			"Write-back channel to report a Scout failure — wrong answer, missing/stale data, a bug, or a suggestion. POSTs {kind, message, context?} into the curator queue (reviewed weekly); rate-limited 6/min/IP. Use when a query returned something wrong/stale/empty that SHOULD exist. Not for finding the data you actually want → use the relevant search tool.",
		inputSchema: {
			kind: z
				.enum(["bug", "missing-data", "wrong-answer", "suggestion", "other"])
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
			"Groups the active Stellar project directory into topic clusters scored on crowdedness (1–10, log-scaled) — the market-map view of saturated vs underbuilt lanes, i.e. WHERE TO BUILD. Per cluster: size, SCF funding, hackathon winners, sample projects; `dimension=category|types`. Answers 'what's crowded / where is whitespace'. Not for looking up a named project → use search_projects.",
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
			"The cross-ecosystem macro rollup — totals no single-event tool answers: hackathon totals (prize pools, hackers), SCF funding distributed (per-round + the Built/In-Progress/Abandoned funnel), and per-category distribution. Slice via `dimension=hackathons|categories|funding`. Not for per-category crowdedness/whitespace → use get_clusters.",
		inputSchema: {
			dimension: z
				.enum(["all", "hackathons", "categories", "funding"])
				.optional()
				.describe("Which slice to return. Default 'all' returns everything."),
		},
	},
	async ({ dimension }) => {
		const qs = dimension ? `?dimension=${dimension}` : "";
		const result = await callScout(`/api/analyze${qs}`);
		return asToolResult(result);
	},
);

// 15. get_partners — curated ecosystem partner directory
server.registerTool(
	"get_partners",
	{
		title: "Search Stellar ecosystem partners (audit firms, anchors, infra)",
		description:
			"The curated ecosystem partner directory — vetted service providers a builder hires or integrates: audit firms, anchors & on/off-ramps, infrastructure, tooling, wallets, legal, agencies. Filter by `type`/`sector`/`region` or free-text `q` (capability-fit ranked). Answers 'who can audit my Soroban contract / find an anchor in <region>'. Not for a built product/project → use search_projects.",
		inputSchema: {
			type: z
				.string()
				.optional()
				.describe(
					"Partner type: audit-firm | anchor | on-off-ramp | infrastructure | tooling | protocol | wallet | legal | agency | other.",
				),
			sector: z.string().optional().describe("Sector/vertical filter."),
			region: z.string().optional().describe("Region/country filter."),
			q: z
				.string()
				.optional()
				.describe(
					"Free-text need, relevance-ranked by structured capability fit (assets, ramps, SEPs, country, services, region) — e.g. 'USDC off-ramp Mexico' surfaces anchors by capability, not keyword overlap.",
				),
		},
	},
	async ({ type, sector, region, q }) => {
		const params = new URLSearchParams();
		if (type) params.set("type", type);
		if (sector) params.set("sector", sector);
		if (region) params.set("region", region);
		if (q) params.set("q", q);
		const qs = params.toString() ? `?${params.toString()}` : "";
		const result = await callScout(`/api/partners${qs}`);
		return asToolResult(result);
	},
);

// 16. get_changelog — contract-change feed
server.registerTool(
	"get_changelog",
	{
		title: "Get the Scout API/MCP contract changelog",
		description:
			"Latest-first feed of contract-affecting changes to the Scout API, MCP tools, and typed client — new/removed endpoints & tools, param/enum changes, description/routing rewrites. Filter with `since`/`limit`. Use when you cached Scout's shape earlier and want to know what moved. Not for current health / data freshness → use get_status.",
		inputSchema: {
			since: z
				.string()
				.optional()
				.describe("Only entries on/after this ISO date (YYYY-MM-DD)."),
			limit: z
				.number()
				.int()
				.positive()
				.optional()
				.describe("Max entries to return (latest-first)."),
		},
	},
	async ({ since, limit }) => {
		const params = new URLSearchParams();
		if (since) params.set("since", since);
		if (limit) params.set("limit", String(limit));
		const qs = params.toString() ? `?${params.toString()}` : "";
		const result = await callScout(`/api/changelog${qs}`);
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
