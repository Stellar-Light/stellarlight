#!/usr/bin/env node
/**
 * Stellar Scout MCP Server
 *
 * Exposes stellarlight.xyz's 18 public APIs as MCP tools so any MCP-compatible
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
			"Semantic ($vectorSearch over Voyage embeddings) search across the Stellar **knowledge corpus** — SDF blog, SCF Handbook, SEPs/standards, dev docs, papers, SCF proposals, security audits, incident reports, and Lumenloop/EC research. Returns the top matching text chunks with source attribution, section, URL, and a confidence score (relevance + freshness + authority); audit chunks add auditor/protocol/severity. Filterable by `source`; falls back to BM25-lite keyword search if vectors are unavailable. **Use when:** 'how does X work', 'is X possible / has X been discussed on Stellar', 'what does the SEP/spec/audit say about X', or you need primary-source citations for a thesis or design question. **Not for:** what products exist or their funding/status → use search_projects; GitHub source code ranked by quality → use search_repos.",
		inputSchema: {
			query: z
				.string()
				.min(2)
				.describe("Natural-language search query."),
			source: z
				.enum([
					// Keep in sync with VALID_SOURCES in src/app/api/research/route.ts
					// (the live API is the source of truth for this value set).
					"sdf-blog",
					"scf-handbook",
					"sep",
					"dev-docs",
					"paper",
					"scf-proposal",
					"lumenloop",
					"lumenloop-research",
					"audit",
					"incident",
					"ec-developer-report",
				])
				.optional()
				.describe(
					"Optional source filter. Use 'audit' for security questions, 'incident' for exploit/post-mortem history, 'ec-developer-report' for ecosystem stats, 'paper' for foundational protocol questions.",
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
			"Browse/LIST Stellar hackathon **events** — a merged, de-duplicated feed of curated Payload events (rich detail, internal pages) + live DoraHacks events (SDF org IDs 3096/3853), sorted upcoming→active→completed then newest-first. Each row carries name, slug, dates, status, organizer, source, and (for DoraHacks) prizePoolUSD + hackersCount. Filter by `status` (upcoming|active|completed), `organizer` slug, or `source` (curated|dorahacks). **Use when:** 'what Stellar hackathons are coming up / running now / recently ended', 'list SDF hackathons', or you need the slug of an event before drilling in. When a forward-looking query (status=upcoming|active) returns zero, it adds `meta.fallbackChannels` (BuildOnStellar, stellarlight.xyz, DoraHacks) — surface those rather than dead-ending. **Not for:** one event's winners/submissions/tracks → use get_hackathon; comparing 2+ named events → use compare_hackathons; ecosystem-wide rollups (total prize pools, category/funding totals across ALL events) → use analyze_ecosystem; RFPs/bounties/grants → use get_rfps.",
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
			"Full detail for ONE hackathon by slug — its metadata plus every submission with placement, prize amount, prize track, post-hack status (Built/In Progress/Abandoned), and scfAwarded flag; derives `winners`, per-`tracks` aggregates (prize $ + winner/submission counts), and a `stats` outcome funnel. Dual-shape: curated events return full DB detail; DoraHacks-only events read submissions/winners/tracks live from DoraHacks (degrading to a curated winner roster + `meta.note` when the live feed is unavailable). **Use when:** 'who won [event] / its soroban track', 'what projects were submitted to [event]', 'what tracks did [event] have and what did they pay', 'how many [event] submissions are still being built'. Needs an exact slug — get it from get_hackathons first if unknown. **Not for:** listing/browsing many events → use get_hackathons; comparing stats across 2+ events → use compare_hackathons; ecosystem-wide aggregates → use analyze_ecosystem; a winning project's own repo/funding/status outside the hackathon context → use search_projects / search_repos.",
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
			"Side-by-side comparison of 2–5 named hackathons (by slug). Returns each event's snapshot (dates, status, source, prizePoolUSD, hackersCount, submissionCount, winnerCount, prizePerWinnerUSD where derivable) plus a `deltas` block flagging the spreads agents care about — prize-pool range, submission-count range, prize-per-winner, registered-hacker counts — with human-readable `notes` like '2× spread'. Unresolved slugs come back as `source:\"not-found\"` and are listed in deltas.notes without inflating `returned`. **Use when:** 'which Stellar hackathon should I enter', 'how did [event A] compare to [event B] on prizes/turnout', 'was [A] or [B] bigger'. Requires ≥2 known slugs (max 5; iterate beyond that) — resolve them via get_hackathons first. **Not for:** one event's deep detail/winners → use get_hackathon; discovering/listing events → use get_hackathons; ecosystem-wide totals across ALL events → use analyze_ecosystem.",
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
			"The Stellar **people directory** — curated builder PROFILES (synced from Stellar Passport): displayName, githubUsername, bio, roleTitle, location, scfTier, and the projects[] each has shipped. Free-text `q`/`skill` searches across bio + role + project names/descriptions; `location` filters by place; featured builders sort first. **Use when:** 'find me a teammate/collaborator who has shipped X', 'Stellar devs in Lagos who've done Soroban', 'who can I hire for an anchor build' — i.e. you want a PERSON to contact. **Not for:** a funded project/product or 'who built X (the company)' → use search_projects; the GitHub repo/code itself → use search_repos; ecosystem-wide dev *counts*/activity stats → use get_leaderboard.",
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

// 6. search_projects — prior-art / competitor lookup
server.registerTool(
	"search_projects",
	{
		title: "Find Stellar projects, protocols & services (ecosystem directory)",
		description:
			"Search the curated Stellar **project/product directory** — what's been *built*, by whom, with SCF-funding and live/inactive status (wallets, DEXes, anchors, lending, oracles, RWAs, tooling). Keyword + synonym match (dex→amm/swap, rosca→susu/chama) ranked by curated **prominence**, SDF/community verification, SCF funding, and Live status; falls back to semantic vector search when keyword hits are thin. Each result carries status, scfAwarded/scfTotalAwardedUSD, the project's own links, a confidence score, and its top indexed `repos` inline. **Use when:** 'who/what already exists for X', 'has anyone built X', 'is there a live/funded project for X', or you need a project's funding/status/competitors. **Not for:** raw GitHub source repos ranked by code quality → use search_repos; docs, SEPs, audits, how-to/feasibility knowledge → use search_research; category counts or whitespace → use get_clusters.",
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
			"Search the indexed Stellar ecosystem **GitHub code repos** — the actual source, graded for quality. Indexes GitHub topics + description + language + README, expands tech synonyms (zk→zero-knowledge/snark, oracle→price-feed), and ranks by **repoScore (0-100) = code-depth (verified from the repo's actual source) + freshness + traction + hackathon/SCF/builder authority**. Each result carries a **`codeVerified`** block (`stellarProof`, `codeDepth` 0-1, `isDeployableContract`, `sorobanSdkVersion`+`versionStatus`), or null until code-scanned — use it to prefer a real deployable contract on a current soroban-sdk over a repo that merely mentions Stellar. Filterable by `language` and `minScore`. **Use when:** 'show me the code / repos for X', 'find a Rust/Soroban implementation of X', 'what GitHub repos exist for X', or you need prior-art source to read, fork, or cite. **Not for:** what products/companies exist or their funding/live status → use search_projects; conceptual docs, SEPs, audits, or how-to/feasibility knowledge → use search_research; a known project's metadata (those repos already ride inline on search_projects results).",
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
			"Get a **source-grounded answer** to a deep code question about a Stellar repo — not just a link. StellarLight routes the question to the authoritative repo (error codes / consensus / XDR → `stellar/stellar-core`; Horizon → `stellar/go`; RPC → `stellar/stellar-rpc`; SEP reference impls, SDKs…), then DeepWiki answers from that repo's internals with the source files. **Use when:** 'where is X defined / how does Y work' for a Stellar internal — error/result codes, SCP/consensus, ledger, XDR, a SEP's implementation. **Not for:** which repos/projects exist → use search_repos / search_projects; ecosystem docs, SEP text, or audits → use search_research. Returns the routed `repo`, the grounded `answer`, `alternateRepos`, and `sources` (repoUrl + deepWikiUrl). Pass `repo` to pin one, or omit to auto-route.",
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
			"The curated set of Stellar **RFPs / sponsor briefs** (mirrors the /ideas page) — open ones are eligible for **SCF grant funding** when winners are picked; closed ones are past rounds kept for context. Each brief has title, description, technicalRequirements, category, quarter, and a quarter-derived status (open|closed). Filter by `q`, `category`, `quarter`, or `status`; response carries open/closed counts + the activeQuarter. **Use when:** 'what RFPs/bounties match my idea', 'what's the SCF funding asking for this quarter', 'is there a sponsor brief for X I could get funded to build'. **Not for:** projects already BUILT/funded → use search_projects; hackathons + their prizes → use get_hackathons; how-to / SCF Handbook / standards knowledge → use search_research.",
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
			"Catalog of installable Stellar **AI skills/tools** — a unified, filterable list merging SDF's 7 official skills.stellar.org skills, Stellarlight + lumenloop + trusted third-party curated entries, and approved community submissions. Each entry carries an `install` command, `kind` (skill-md | mcp-server | sdk | cli | agent-kit | tool), `source`, repo/homepage/docs, and `meta.counts.bySource`; filter by `source` or `kind`. **Use when:** 'what Stellar AI skills / MCP servers / SDKs can I install', 'is there a skill for soroban / anchors / payments', or matching a builder's idea to the right installable tool. **Not for:** the full SKILL.md text or install details of ONE named skill → use get_skill; built/funded products in the ecosystem (not installable agent skills) → use search_projects; GitHub source repos → use search_repos; docs/standards/how-to knowledge → use search_research.",
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
			"Full detail for ONE skill by slug or display name — returns its metadata plus, for SDF official skills, the complete raw SKILL.md text under `.skill.content` (fetched live from skills.stellar.org); curated/community entries return metadata (and inlined content for Stellarlight's own skills). Accepts either the slug ('agentic-payments') or display name ('Agentic Payments'); 404s with a hint to list /api/skills if unknown. **Use when:** you already know a skill name and need its actual instructions / install command / SKILL.md body to follow or quote. **Not for:** browsing or discovering which skills exist → use list_skills; conceptual docs or standards behind a topic (not a packaged skill) → use search_research.",
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
			"Returns a **ranked list of active Stellar projects** (default top 50, max 300) sortable by `sort=activity|stars|issues` over a `range` (7d/30d/90d/1y/all), with per-project GitHub rollups (`totalStars`, `openIssuesTotal`, `lastActivityAt`, `repoCount`) and `scfAwarded`; optional `category` filter and `format=csv`. Also bundles an **Electric Capital ecosystem dev macro** block (28-day active / Stellar-only / multichain dev counts, commits28d, full-time/part-time/one-time dev splits). **Use when:** 'who/what are the top/most-active Stellar projects', 'most-starred projects', 'which projects shipped recently (last 30d)', 'how many active Stellar devs / how does Stellar's dev activity look', or you need a CSV/Dune-style export of ranked projects. **Not for:** category counts or crowded-vs-underbuilt whitespace → use get_clusters; ecosystem-wide hackathon/funding/status-funnel totals → use analyze_ecosystem; finding a specific project's profile/funding/competitors → use search_projects; ranking individual developers (this ranks PROJECTS, plus an EC macro snapshot — it does not list named devs) → use get_builders.",
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
			"Self-describe / health endpoint for Stellar Scout — returns service ok + version, `generatedAt`, per-source freshness & size (`sources[]`: projects, hackathons, builders, repos, ecosystemStats, sdfSkills, each with count + lastUpdatedAt + notes), recent `usage` stats, and an enumeration of every available `/api/*` endpoint. Cheap (count-only queries, no params). **Use when:** you need to know how fresh/large the data is before answering ('as of when?', 'how many projects are indexed?'), discover what endpoints exist, or sanity-check the API is up. **Not for:** the actual project/repo/research DATA itself → call the matching search tool (search_projects, search_repos, search_research); ecosystem developer-activity macro stats → use get_leaderboard.",
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
			"Write-back channel to report a Scout failure — wrong answer, missing/stale data, a bug, or a suggestion. POSTs {kind, message, context?} into Stellarlight's curator queue (reviewed weekly); rate-limited to 6/min/IP. `kind` ∈ bug | missing-data | wrong-answer | suggestion | other; `message` 10–4000 chars; optional context (query, endpoint, agentName) helps curators reproduce. **Use when:** a Scout query returned something wrong/empty that you believe SHOULD exist, or data looks stale — file it so the corpus/endpoint gets fixed. **Not for:** reading freshness or checking the API is up (a read, not a report) → use get_status; finding the data you actually want → use the relevant search tool (search_projects / search_repos / search_research).",
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
			"Groups the active Stellar **project directory into topic clusters** and scores each on **crowdedness (1–10, log-scaled)** so you can see saturated vs underbuilt lanes — i.e. *where to build*. Each cluster returns `size`, `crowdedness`, `scfFundedCount`, `scfTotalUSD`, `hackathonWinnerCount`, and up to 5 sample projects; cluster by `dimension=category` (coarse 7-cat) or `dimension=types` (finer: Wallet/DEX/Lending/RWA/Oracle…), or pass `key`/`type` to get one cluster. **Use when:** 'what's the most crowded category on Stellar', 'show me an underbuilt/whitespace area', 'how many projects/funded projects are in RWA vs wallets', 'where is the competition thin'. **Not for:** ranking the top projects/repos by stars or activity → use get_leaderboard; ecosystem-wide totals (events + funding + status funnel) → use analyze_ecosystem; finding/looking up an actual named project in a category → use search_projects.",
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
			"Returns the **cross-everything ecosystem rollup** — the macro totals that single-event or single-cluster tools can't answer alone. `dimension=all` (default) or slice to `hackathons` (totalEvents, upcoming/active/completed counts, totalPrizePoolUSD, totalRegisteredHackers — live from DoraHacks), `categories` (project-count distribution + scfFunded + hackathon winners per category), or `funding` (scfAwardedProjects, scfTotalDistributedUSD, meanAwardUSD, per-round breakdown, and the post-hackathon Built/In-Progress/Abandoned status funnel). **Use when:** 'what's the overall state of Stellar hackathons/grants', 'total SCF funding distributed / mean award size', 'how much prize money across all hackathons', 'how many projects get built vs abandoned after hackathons'. **Not for:** crowdedness or whitespace per category → use get_clusters; a ranked list of top/active projects → use get_leaderboard; one specific hackathon's details → use get_hackathon; comparing two hackathons head-to-head → use compare_hackathons.",
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

// 15. get_partners — curated ecosystem partner directory
server.registerTool(
	"get_partners",
	{
		title: "Search Stellar ecosystem partners (audit firms, anchors, infra)",
		description:
			"The curated **ecosystem partner directory** — vetted service providers a builder hires or integrates: audit firms (Veridise, OtterSec, Runtime Verification, Certora, Halborn), anchors & on/off-ramps, infrastructure, tooling, wallets, legal, agencies. Filter by `type` (audit-firm | anchor | on-off-ramp | infrastructure | tooling | protocol | wallet | legal | agency | other), `sector`, `region`, or free-text `q`. **Use when:** 'who can audit my Soroban contract', 'find a Stellar anchor / on-ramp in <region>', 'which infra/tooling/wallet providers exist' — i.e. you want a PROVIDER to hire or integrate. **Not for:** a built product/project or its funding/status → use search_projects; a person/teammate to collaborate with → use get_builders; the GitHub source code → use search_repos.",
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
				.describe("Free-text search across partner name + description."),
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
			"Latest-first feed of **contract-affecting changes** to the Scout API, MCP tools, and typed client — new/removed endpoints or tools, param/enum changes, response-shape changes, routing/description rewrites. Each entry carries `date`, `surfaces[]`, `type` (added | changed | fixed | removed), a one-line `summary`, and optional `detail`. Filter with `since` (ISO date) / `limit`. **Use when:** you cached Scout's shape earlier and want to know what changed before relying on it, or you're debugging a field/param that moved. **Not for:** the actual ecosystem DATA → use the relevant search tool; current health / data freshness / version → use get_status.",
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
