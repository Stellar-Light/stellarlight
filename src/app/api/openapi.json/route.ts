/**
 * OpenAPI 3.1 specification for the Scout public API.
 *
 *   GET /api/openapi.json
 *
 * Auto-discoverable, machine-readable description of all 14 public
 * read-only endpoints. Aggregators paste the URL into openapi-typescript /
 * orval / kiota / any codegen and instantly get typed clients in
 * TypeScript, Python, Go, Rust, etc. — no hand-rolled fetch wrappers.
 *
 * The spec is the contract. Every public endpoint listed here is:
 *   - Read-only (GET) or moderated submission (POST)
 *   - No auth, no rate limits today (see info.description: Rate limits)
 *   - CORS-enabled (Access-Control-Allow-Origin: *) + X-API-Version: 1,
 *     set in next.config.mjs headers() for the public endpoint list
 *   - Edge-cached (varies per endpoint, see individual descriptions)
 *
 * If you change a route's params or response shape, update this file in
 * the same PR. The /scout/api-reference page also reads this spec at
 * build time to render the public docs.
 *
 * Reference: https://spec.openapis.org/oas/v3.1.0
 */

import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 3600;

const SITE_URL = "https://stellarlight.xyz";
const VERSION = "1.0.0";

interface OpenAPISpec {
	openapi: string;
	info: Record<string, unknown>;
	servers: Array<Record<string, unknown>>;
	tags: Array<Record<string, unknown>>;
	paths: Record<string, unknown>;
	components: Record<string, unknown>;
}

const spec: OpenAPISpec = {
	openapi: "3.1.0",
	info: {
		title: "Stellar Scout API",
		version: VERSION,
		summary:
			"Agent-native data layer for the Stellar ecosystem — projects, builders, hackathons, SCF, audits, research.",
		description: [
			"Read-only public API powering Stellar Scout. Aggregators, autonomous agents, and AI tools can call these endpoints directly without auth.",
			"",
			"All endpoints are edge-cached. The same data is available via the @stellar-light/scout-mcp Model Context Protocol server (for human-driven clients) and via the @stellar-light/api-client TypeScript SDK (for autonomous aggregators).",
			"",
			"Data sources merged behind these endpoints: the Stellarlight directory of curated Stellar projects + an indexed-and-scored GitHub repo index, Stellar Passport builder profiles, Electric Capital developer activity, Soroban audit corpus, SDF skills.stellar.org skill catalog, lumenloop ecosystem data, and primary research (SEPs, papers, dev docs, SCF Handbook). Live collection sizes are in GET /api/status (sources[]) — counts are intentionally not hardcoded here to avoid drift.",
			"",
			"## Versioning",
			"Every response carries an `X-API-Version` header (currently `1`). The number bumps only on a breaking response-shape change; additive fields don't bump it. Pin to a version by asserting the header. Breaking changes are announced before they ship.",
			"",
			"## Rate limits",
			"None enforced today — the API is public and unauthenticated. When limits are introduced they will be advertised via `X-RateLimit-*` and `Retry-After` headers and documented here BEFORE enforcement, so autonomous consumers can adopt back-off ahead of time. Be courteous: cache where `Cache-Control` allows, and prefer `offset` pagination over hammering.",
			"",
			"## Pagination",
			"List endpoints (`/api/projects/search`, `/api/builders`, `/api/rfps`) accept `limit` + `offset`. The response `meta.counts` carries `returned` (this page) and `total`/`matched` (all rows matching the filter, pre-slice). Page until `offset + returned >= total`.",
			"",
			"## Ordering & relevance",
			"`/api/projects/search` sorts by descending keyword `score` (token-overlap count) and exposes `meta.matchMode` (`strict` → `loose-1` → `majority`) so you know how much the query was relaxed. `/api/research` sorts by descending vector-similarity `score` (0–1 cosine). Use these for cross-source ranking when merging with other aggregators.",
		].join("\n"),
		contact: {
			name: "Stellar Light",
			url: "https://stellarlight.xyz/scout",
			email: "support@stellarlight.xyz",
		},
		license: { name: "MIT", identifier: "MIT" },
	},
	servers: [
		{
			url: SITE_URL,
			description: "Production",
		},
	],
	tags: [
		{ name: "Discovery", description: "Service health + endpoint enumeration" },
		{ name: "Projects", description: "Curated Stellar project directory" },
		{
			name: "Hackathons",
			description: "Stellar Hacks events + DoraHacks feed",
		},
		{ name: "Builders", description: "Stellar Passport builder profiles" },
		{
			name: "Partners",
			description:
				"Ecosystem partner directory (anchors, ramps, infra, tooling) with verified signals + freshness",
		},
		{ name: "Funding", description: "SCF history + open RFPs" },
		{
			name: "Research",
			description:
				"Vector search over the 4,541-chunk corpus (SEPs, audits, papers, dev docs, etc.)",
		},
		{
			name: "Skills",
			description: "AI skill marketplace (SKILL.md / MCP / SDK / CLI catalog)",
		},
		{ name: "Analytics", description: "Cross-event rollups + topic clusters" },
		{
			name: "Ecosystem",
			description: "Developer activity + ecosystem dev stats",
		},
		{ name: "Feedback", description: "Curator feedback loop" },
	],
	paths: {
		"/api/status": {
			get: {
				tags: ["Discovery"],
				summary: "Service health + endpoint enumeration",
				description:
					"Returns service health, data-source freshness per collection, and a self-describing enumeration of all 14 endpoints. Useful as a self-discovery call before making other queries.",
				responses: {
					"200": {
						description: "Service status",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/StatusResponse" },
							},
						},
					},
				},
			},
		},
		"/api/projects/search": {
			get: {
				tags: ["Projects"],
				summary: "Search Stellar projects (prior art / competitor lookup)",
				description:
					"Search the curated Stellar project directory (hundreds of projects; live count in /api/status) with tiered match-mode (strict → loose → majority). Tier surfaced as `.meta.matchMode` so agents convey relevance honestly. Essential for *'has anyone already built this?'* gap-classification questions. A bare call with no q/filter returns `meta.error: no_query` + 0 rows (it does NOT return the full directory).",
				parameters: [
					{ $ref: "#/components/parameters/q" },
					{
						name: "category",
						in: "query",
						description: "Filter by category",
						schema: {
							type: "string",
							enum: [
								"Infrastructure",
								"Tooling",
								"User-Facing App",
								"Asset",
								"Protocol/Contract",
								"Anchor",
								"Partner Integration",
							],
						},
					},
					{
						name: "hackathon",
						in: "query",
						description: "Filter by hackathon slug",
						schema: { type: "string" },
					},
					{
						name: "scfAwarded",
						in: "query",
						description: "Filter to SCF-funded projects only",
						schema: { type: "boolean" },
					},
					{ $ref: "#/components/parameters/limit" },
					{ $ref: "#/components/parameters/offset" },
				],
				responses: {
					"200": {
						description: "Project search results",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ProjectSearchResponse" },
							},
						},
					},
				},
			},
		},
		"/api/repos/search": {
			get: {
				tags: ["Repos"],
				summary: "Search the Stellar GitHub repo / code-reference index",
				description:
					"Search ~1,900 indexed-and-scored Stellar ecosystem GitHub repos by tech/keyword — the code layer beneath the project directory. Answers *'show me the repos / code for X'* and prior-art **code** lookups that project search can't. Indexes GitHub topics + description + language + README, expands synonyms (zk→zero-knowledge/snark, oracle→price-feed, …), and ranks by `repoScore` (0–100 = freshness + traction + hackathon/SCF/builder authority). Lead with high-score repos as the strongest references and cite each repo's `url` / `homepageUrl`. The same graded repos are injected inline into `/api/projects/search` as `codeReferences`.",
				parameters: [
					{ $ref: "#/components/parameters/q" },
					{
						name: "language",
						in: "query",
						description:
							"Filter by primary language (case-insensitive substring, e.g. 'Rust', 'TypeScript')",
						schema: { type: "string" },
					},
					{
						name: "minScore",
						in: "query",
						description:
							"Only return repos with repoScore ≥ this (0–100). Use 40+ for high-signal references.",
						schema: { type: "integer", minimum: 0, maximum: 100, default: 0 },
					},
					{ $ref: "#/components/parameters/limit" },
					{ $ref: "#/components/parameters/offset" },
				],
				responses: {
					"200": {
						description: "Repo search results graded by repoScore",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/RepoSearchResponse" },
							},
						},
					},
				},
			},
		},
		"/api/hackathons": {
			get: {
				tags: ["Hackathons"],
				summary: "List Stellar hackathons",
				description:
					"Returns curated Stellar hackathons + live DoraHacks events. Empty status-scoped queries include fallback channels (BuildOnStellar / stellarlight / DoraHacks) so agents can route users to live announcement sources.",
				parameters: [
					{
						name: "status",
						in: "query",
						description: "Filter by event status",
						schema: {
							type: "string",
							enum: ["upcoming", "active", "completed"],
						},
					},
					{
						name: "organizer",
						in: "query",
						description: "Filter by organizer slug",
						schema: { type: "string" },
					},
					{
						name: "source",
						in: "query",
						description: "Restrict to one feed (curated vs DoraHacks)",
						schema: { type: "string", enum: ["curated", "dorahacks"] },
					},
					{ $ref: "#/components/parameters/limit" },
				],
				responses: {
					"200": {
						description: "Hackathon list",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/HackathonsResponse" },
							},
						},
					},
				},
			},
		},
		"/api/hackathons/{slug}": {
			get: {
				tags: ["Hackathons"],
				summary: "Get one hackathon's full detail",
				description:
					"Returns submissions, placements, prize tracks, post-hack status funnel, and outcome data for one hackathon by slug. Dual-shape response: curated entries return full detail; DoraHacks-only entries return metadata + prize pool + an explicit `.meta.note`.",
				parameters: [
					{
						name: "slug",
						in: "path",
						required: true,
						description: "Hackathon slug",
						schema: { type: "string" },
					},
				],
				responses: {
					"200": {
						description: "Hackathon detail",
						content: {
							"application/json": {
								schema: {
									$ref: "#/components/schemas/HackathonDetailResponse",
								},
							},
						},
					},
					"404": {
						description: "Hackathon not found",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ErrorResponse" },
							},
						},
					},
				},
			},
		},
		"/api/hackathons/compare": {
			get: {
				tags: ["Hackathons"],
				summary: "Compare 2–5 hackathons side-by-side",
				description:
					"Returns each hackathon's stats + a `.deltas` block highlighting differences agents care about (prize spread, hacker count, prize-per-winner). Useful for *'which Stellar hackathon should I enter?'* type questions.",
				parameters: [
					{
						name: "slugs",
						in: "query",
						required: true,
						description: "2–5 hackathon slugs, comma-separated (?slugs=a,b)",
						schema: {
							type: "array",
							items: { type: "string" },
							minItems: 2,
							maxItems: 5,
						},
						// The API parses ?slugs=a,b — comma-separated, NOT repeated
						// params. explode:false is the OpenAPI encoding for that.
						style: "form",
						explode: false,
					},
				],
				responses: {
					"200": {
						description: "Comparison rollup",
						content: { "application/json": { schema: { type: "object" } } },
					},
				},
			},
		},
		"/api/builders": {
			get: {
				tags: ["Builders"],
				summary: "Search Stellar builders",
				description:
					"Returns Stellar builder profiles (sourced from Stellar Passport). Useful for *'find a teammate / collaborator who has shipped in X'* queries. Small + growing dataset — flag gaps honestly.",
				parameters: [
					{
						name: "location",
						in: "query",
						description:
							"Filter by location substring (e.g. 'Lagos', 'Brazil')",
						schema: { type: "string" },
					},
					{
						name: "skill",
						in: "query",
						description: "Filter by skill/tech mentioned in bio",
						schema: { type: "string" },
					},
					{
						name: "scfTier",
						in: "query",
						description: "Filter by SCF tier",
						schema: { type: "string" },
					},
					{ $ref: "#/components/parameters/limit" },
					{ $ref: "#/components/parameters/offset" },
				],
				responses: {
					"200": {
						description: "Builder list",
						content: { "application/json": { schema: { type: "object" } } },
					},
				},
			},
		},
		"/api/partners": {
			get: {
				tags: ["Partners"],
				summary: "List ecosystem partners",
				description:
					"Published partners (anchors, on/off ramps, infrastructure, tooling, protocols, wallets, audit firms). Each carries partner-claimed facts AND system-verified signals (GitHub activity, on-chain footprint, SCF involvement) plus a `freshness` object — consumers should down-rank or skip partners flagged `freshness.excludeFromMatching`. Fresh partners sort first.",
				parameters: [
					{
						name: "type",
						in: "query",
						description: "Filter by partner type",
						schema: {
							type: "string",
							enum: [
								"anchor",
								"on-off-ramp",
								"infrastructure",
								"tooling",
								"protocol",
								"wallet",
								"audit-firm",
								"legal",
								"agency",
								"other",
							],
						},
					},
					{
						name: "sector",
						in: "query",
						description:
							"Filter by sector served (defi, payments, rwa, stablecoins, …)",
						schema: { type: "string" },
					},
					{
						name: "region",
						in: "query",
						description: "Filter by region served (global, latam, africa, …)",
						schema: { type: "string" },
					},
					{
						name: "accepting",
						in: "query",
						description:
							"Set to 1 to return only partners currently accepting new clients",
						schema: { type: "string", enum: ["1"] },
					},
					{ $ref: "#/components/parameters/q" },
					{ $ref: "#/components/parameters/limit" },
				],
				responses: {
					"200": {
						description: "Partner directory",
						content: { "application/json": { schema: { type: "object" } } },
					},
				},
			},
		},
		"/api/partners/{slug}": {
			get: {
				tags: ["Partners"],
				summary: "Get one partner's full profile",
				description:
					"Full published profile for one partner by slug, including verified signals + freshness. 404 for unknown or unpublished slugs.",
				parameters: [
					{
						name: "slug",
						in: "path",
						required: true,
						description: "Partner slug",
						schema: { type: "string" },
					},
				],
				responses: {
					"200": {
						description: "Partner profile",
						content: { "application/json": { schema: { type: "object" } } },
					},
					"404": {
						description: "Partner not found or not published",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ErrorResponse" },
							},
						},
					},
				},
			},
		},
		"/api/rfps": {
			get: {
				tags: ["Funding"],
				summary: "List Stellar RFPs (SCF-funded sponsor briefs)",
				description:
					"Returns open + closed Stellar RFPs (sponsor briefs that get SCF-funded for the winning team). Quarter-aware: response includes `.meta.activeQuarter` so agents know which RFPs are open *now* vs prior rounds.",
				parameters: [
					{
						name: "status",
						in: "query",
						description:
							"Open RFPs are fundable for the current SCF quarter; closed are prior rounds",
						schema: { type: "string", enum: ["open", "closed"] },
					},
					{
						name: "quarter",
						in: "query",
						description: "Filter by quarter slug (e.g. 'q1-2026')",
						schema: { type: "string" },
					},
					{ $ref: "#/components/parameters/q" },
					{
						name: "category",
						in: "query",
						description:
							"Filter by RFP category (e.g. 'defi', 'payments', 'infrastructure'). An unrecognized value returns 400 with the valid category list.",
						schema: { type: "string" },
					},
					{ $ref: "#/components/parameters/limit" },
					{ $ref: "#/components/parameters/offset" },
				],
				responses: {
					"200": {
						description: "RFP list",
						content: { "application/json": { schema: { type: "object" } } },
					},
				},
			},
		},
		"/api/research": {
			get: {
				tags: ["Research"],
				summary: "Vector search over the Stellar research corpus",
				description:
					"Vector search over a 4,541-chunk corpus of primary Stellar sources: SEPs, SCF Handbook, dev docs, foundational papers (Mazières SCP), lumenloop community playbooks, Soroban audit reports (Certora, OtterSec, Halborn, OpenZeppelin, Code4rena, etc.), Electric Capital Developer Reports, SDF blog. Returns top-K chunks with severity metadata for audit chunks. Each result carries a `confidence` object — `{ score (0-1), label (high/medium/low), relevance, freshness, authority, ageDays }` — blending match strength, source-aware recency, and source authority so an agent can tell a strong, fresh, canonical hit from a weak or stale one. Sort by `confidence.score` for trust-ranked results; `meta.scoreModel.version` identifies the model. The raw `score` field remains cosine similarity (0–1, higher = more relevant).",
				parameters: [
					{
						name: "q",
						in: "query",
						required: true,
						description: "Natural-language search query",
						schema: { type: "string", minLength: 2 },
					},
					{
						name: "source",
						in: "query",
						description:
							"Optional source filter. Use 'audit' for security questions, 'ec-developer-report' for ecosystem stats, 'paper' for foundational protocol questions.",
						schema: {
							type: "string",
							enum: [
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
							],
						},
					},
					{
						name: "limit",
						in: "query",
						description: "Max results (default 8, max 25)",
						schema: { type: "integer", minimum: 1, maximum: 25, default: 8 },
					},
				],
				responses: {
					"200": {
						description: "Research results",
						content: { "application/json": { schema: { type: "object" } } },
					},
				},
			},
		},
		"/api/skills": {
			get: {
				tags: ["Skills"],
				summary: "List AI skills for Stellar builders",
				description:
					"Merged catalog of SDF skills.stellar.org skills + curated Stellar Light entries + approved community submissions. Editorial source priority: Stellarlight → SDF → external ecosystem → competing aggregators → community. Featured skills sort first.",
				parameters: [
					{
						name: "source",
						in: "query",
						description: "Filter by source",
						schema: {
							type: "string",
							enum: [
								"sdf",
								"stellarlight",
								"lumenloop",
								"external",
								"community",
							],
						},
					},
					{
						name: "kind",
						in: "query",
						description: "Filter by skill kind",
						schema: {
							type: "string",
							enum: [
								"skill-md",
								"mcp-server",
								"sdk",
								"cli",
								"agent-kit",
								"tool",
							],
						},
					},
				],
				responses: {
					"200": {
						description: "Skills catalog",
						content: { "application/json": { schema: { type: "object" } } },
					},
				},
			},
		},
		"/api/skills/{name}": {
			get: {
				tags: ["Skills"],
				summary: "Get one skill's full content",
				description:
					"Returns full SKILL.md content for SDF + Stellar Light skills (where applicable) plus metadata for all sources. Use when a user mentions a specific skill by name — cheaper than filtering the full list endpoint.",
				parameters: [
					{
						name: "name",
						in: "path",
						required: true,
						description:
							"Skill slug (e.g. 'soroban', 'stellar-scout', 'rozo-intent-pay')",
						schema: { type: "string" },
					},
				],
				responses: {
					"200": {
						description: "Skill detail with content",
						content: { "application/json": { schema: { type: "object" } } },
					},
					"404": {
						description: "Skill not found",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ErrorResponse" },
							},
						},
					},
				},
			},
		},
		"/api/clusters": {
			get: {
				tags: ["Analytics"],
				summary: "Topic clusters with crowdedness scores",
				description:
					"Returns clusters of projects by category or types, each with a log-scaled crowdedness score (1–10), SCF-funded count, and sample projects. Useful for *'what's most crowded on Stellar?'* / *'show me underbuilt categories'* queries.",
				parameters: [
					{
						name: "dimension",
						in: "query",
						description: "Cluster by category (coarse 7-cat) or types (finer)",
						schema: {
							type: "string",
							enum: ["category", "types"],
							default: "category",
						},
					},
					{
						name: "minSize",
						in: "query",
						description: "Only include clusters with at least N projects",
						schema: { type: "integer", minimum: 1 },
					},
				],
				responses: {
					"200": {
						description: "Cluster list",
						content: { "application/json": { schema: { type: "object" } } },
					},
				},
			},
		},
		"/api/analyze": {
			get: {
				tags: ["Analytics"],
				summary: "Cross-event Stellar ecosystem analytics rollup",
				description:
					"Aggregate stats across all hackathons + projects + SCF funding. Returns: total events, prize pool totals, top categories by project count + SCF-funded count, distribution of SCF awards, post-hackathon status funnel (Built / In Progress / Abandoned).",
				parameters: [
					{
						name: "dimension",
						in: "query",
						description: "Which slice to return",
						schema: {
							type: "string",
							enum: ["all", "hackathons", "categories", "funding"],
							default: "all",
						},
					},
				],
				responses: {
					"200": {
						description: "Analytics rollup",
						content: { "application/json": { schema: { type: "object" } } },
					},
				},
			},
		},
		"/api/leaderboard": {
			get: {
				tags: ["Ecosystem"],
				summary: "Stellar ecosystem developer activity",
				description:
					"Returns 28-day active dev counts, commits, full-time vs part-time vs one-time dev splits, geographic distribution. Sourced from Electric Capital. Useful for *'how does Stellar compare on dev activity?'* macro questions.",
				parameters: [
					{
						name: "sort",
						in: "query",
						description:
							"Order the project leaderboard. An unrecognized value returns 400 with the valid list.",
						schema: {
							type: "string",
							enum: ["activity", "stars", "issues"],
							default: "activity",
						},
					},
					{
						name: "range",
						in: "query",
						description:
							"Activity time-window for the leaderboard. An unrecognized value returns 400.",
						schema: {
							type: "string",
							enum: ["7d", "30d", "90d", "1y", "all"],
							default: "all",
						},
					},
					{
						name: "category",
						in: "query",
						description:
							"Filter the leaderboard to one project category (e.g. 'Tooling', 'Infrastructure').",
						schema: { type: "string" },
					},
					{
						name: "format",
						in: "query",
						description: "Response format.",
						schema: { type: "string", enum: ["json", "csv"], default: "json" },
					},
					{ $ref: "#/components/parameters/limit" },
				],
				responses: {
					"200": {
						description: "Leaderboard + ecosystem stats",
						content: { "application/json": { schema: { type: "object" } } },
					},
				},
			},
		},
		"/api/feedback": {
			get: {
				tags: ["Feedback"],
				summary: "Get the feedback request schema (discovery)",
				description:
					"Returns the expected POST body shape + valid `kind` values, so an agent can self-discover how to submit feedback without guessing. No side effects.",
				responses: {
					"200": {
						description: "Feedback request schema",
						content: { "application/json": { schema: { type: "object" } } },
					},
				},
			},
			post: {
				tags: ["Feedback"],
				summary: "Submit feedback on Scout's output",
				description:
					"Send a feedback report when the skill returns wrong / missing / misleading information. Lands in the curator queue. Rate-limited to 6/min/IP (IP hashed with PAYLOAD_SECRET, never stored raw).",
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: { $ref: "#/components/schemas/FeedbackRequest" },
						},
					},
				},
				responses: {
					"201": {
						description: "Feedback received (a curator-queue row was created)",
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["ok", "id"],
									properties: {
										ok: { type: "boolean" },
										id: { type: "string" },
										message: { type: "string" },
									},
								},
							},
						},
					},
					"400": {
						description: "Validation error",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ErrorResponse" },
							},
						},
					},
					"429": {
						description: "Rate limit exceeded",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ErrorResponse" },
							},
						},
					},
				},
			},
		},
	},
	components: {
		parameters: {
			q: {
				name: "q",
				in: "query",
				description: "Keyword query (free text)",
				schema: { type: "string" },
			},
			limit: {
				name: "limit",
				in: "query",
				description:
					"Max results per page. The default and cap VARY by endpoint (e.g. projects/search 20/100, builders 50/200, leaderboard 50/300, research 8/25). A value below 1 or above the cap is clamped, not rejected.",
				schema: { type: "integer", minimum: 1 },
			},
			offset: {
				name: "offset",
				in: "query",
				description:
					"Number of matching rows to skip before returning (pagination). Page until offset + meta.counts.returned >= meta.counts.total.",
				schema: { type: "integer", minimum: 0, default: 0 },
			},
		},
		schemas: {
			Meta: {
				type: "object",
				description: "Standard meta block included on every list response",
				properties: {
					source: { type: "string", format: "uri" },
					generatedAt: { type: "string", format: "date-time" },
					filters: { type: "object", additionalProperties: true },
					counts: {
						type: "object",
						properties: {
							returned: {
								type: "integer",
								minimum: 0,
								description: "Rows in this page (post limit/offset slice)",
							},
							total: {
								type: "integer",
								minimum: 0,
								description:
									"Rows matching the filter before slicing (paginated endpoints). Page until offset + returned >= total.",
							},
						},
					},
				},
			},
			ErrorResponse: {
				type: "object",
				required: ["error"],
				properties: {
					error: { type: "string" },
					details: { type: "object", additionalProperties: true },
				},
			},
			StatusResponse: {
				type: "object",
				required: ["ok", "service", "version", "generatedAt", "endpoints"],
				properties: {
					ok: { type: "boolean" },
					service: { type: "string", const: "Stellar Scout" },
					version: { type: "string" },
					generatedAt: { type: "string", format: "date-time" },
					sources: {
						type: "array",
						items: {
							type: "object",
							properties: {
								name: { type: "string" },
								count: { type: "integer" },
								lastUpdatedAt: {
									type: "string",
									format: "date-time",
									nullable: true,
								},
								notes: { type: "string" },
							},
						},
					},
					usage: {
						type: "object",
						properties: {
							total: { type: "integer" },
							last24h: { type: "integer" },
							last7d: { type: "integer" },
							byEndpoint: {
								type: "array",
								items: {
									type: "object",
									properties: {
										endpoint: { type: "string" },
										count: { type: "integer" },
									},
								},
							},
						},
					},
					endpoints: { type: "array", items: { type: "string" } },
					docs: { type: "string", format: "uri" },
					skill: { type: "string", format: "uri" },
				},
			},
			Project: {
				type: "object",
				required: ["id", "name", "slug", "category", "status"],
				properties: {
					id: { type: "string" },
					name: { type: "string" },
					slug: { type: "string" },
					category: {
						type: "string",
						enum: [
							"Infrastructure",
							"Tooling",
							"User-Facing App",
							"Asset",
							"Protocol/Contract",
							"Anchor",
							"Partner Integration",
						],
					},
					shortDescription: { type: "string" },
					status: {
						type: "string",
						enum: ["Draft", "Development", "Pre-Release", "Live"],
					},
					logoUrl: { type: "string", nullable: true },
					scfAwarded: { type: "boolean" },
					scfTotalAwardedUSD: { type: "number", nullable: true },
					hackathon: { type: "string", nullable: true },
					hackathonPlacement: { type: "string", nullable: true },
					hackathonPrize: { type: "number", nullable: true },
					hackathonPrizeTrack: { type: "string", nullable: true },
					score: {
						type: "number",
						description:
							"Relevance score for the current query (higher = better match)",
					},
					url: { type: "string", format: "uri" },
					prominence: {
						type: "number",
						description:
							"Editorial ranking boost (0-100); higher = more canonical for its category.",
					},
					verificationLevel: { type: "string", nullable: true },
					types: {
						type: "array",
						items: { type: "string" },
						description:
							"Capability tags (Wallet, DEX, Lending, Oracle, SDK, RPC, Faucet, NFT, RWA, Anchor, Stablecoin, Indexer, Explorer, Security, Gaming).",
					},
					links: {
						type: "object",
						description:
							"The project OWN canonical homes - cite these as the primary source, not StellarLight or any directory. Only present, non-empty fields are included.",
						properties: {
							website: { type: "string" },
							github: { type: "string" },
							docs: { type: "string" },
							twitter: { type: "string" },
							discord: { type: "string" },
						},
					},
				},
			},
			ProjectSearchResponse: {
				type: "object",
				required: ["meta", "projects"],
				properties: {
					meta: {
						allOf: [
							{ $ref: "#/components/schemas/Meta" },
							{
								type: "object",
								properties: {
									matchMode: {
										type: "string",
										enum: [
										"strict",
										"loose-1",
										"loose-2",
										"loose-3",
										"majority",
										"all",
									],
										description:
											"Tier of match relaxation that produced these results",
									},
									matchModeLabel: { type: "string" },
								},
							},
						],
					},
					projects: {
						type: "array",
						items: { $ref: "#/components/schemas/Project" },
					},
					codeReferences: {
						type: "array",
						description:
							"Top graded repos matching the same query, surfaced inline (max 5, first page only; same shape as /api/repos/search). Cite as existing code references for prior-art questions.",
						items: { $ref: "#/components/schemas/Repo" },
					},
				},
			},
			HackathonsResponse: {
				type: "object",
				properties: {
					meta: {
						allOf: [
							{ $ref: "#/components/schemas/Meta" },
							{
								type: "object",
								properties: {
									fallbackChannels: {
										type: "object",
										description:
											"Present when the query returns 0 events — a summary plus live announcement channels to point the user at. NOTE: an OBJECT, not an array.",
										properties: {
											summary: { type: "string" },
											channels: {
												type: "array",
												items: {
													type: "object",
													properties: {
														name: { type: "string" },
														url: { type: "string", format: "uri" },
														why: { type: "string" },
													},
												},
											},
										},
									},
								},
							},
						],
					},
					hackathons: { type: "array", items: { type: "object" } },
				},
			},
			HackathonDetailResponse: {
				type: "object",
				properties: {
					meta: { $ref: "#/components/schemas/Meta" },
					hackathon: { type: "object" },
				},
			},
			Repo: {
				type: "object",
				description:
					"An indexed Stellar ecosystem GitHub repository graded by repoScore. Cite the repo's url / homepageUrl as the primary source.",
				required: ["fullName", "repoScore"],
				properties: {
					fullName: { type: "string", description: "owner/name" },
					owner: { type: "string", nullable: true },
					name: { type: "string", nullable: true },
					url: { type: "string", format: "uri", nullable: true },
					description: { type: "string", nullable: true },
					topics: { type: "array", items: { type: "string" } },
					primaryLanguage: { type: "string", nullable: true },
					stars: { type: "integer" },
					openIssues: { type: "integer" },
					lastCommitAt: { type: "string", format: "date-time", nullable: true },
					homepageUrl: { type: "string", nullable: true },
					isFork: { type: "boolean" },
					isArchived: { type: "boolean" },
					project: {
						type: "object",
						nullable: true,
						description: "The curated project this repo is linked to, if any.",
						properties: {
							slug: { type: "string" },
							name: { type: "string", nullable: true },
						},
					},
					hackathonWinner: { type: "boolean" },
					scfAwarded: { type: "boolean" },
					builderReputation: { type: "number" },
					judgeScore: { type: "number", nullable: true },
					judgedHackathon: { type: "string", nullable: true },
					repoScore: {
						type: "number",
						minimum: 0,
						maximum: 100,
						description:
							"Quality grade (0–100) = freshness + traction + hackathon/SCF/builder authority. Lead with high-score repos.",
					},
					repoScoreLabel: { type: "string", nullable: true },
					score: {
						type: "number",
						description:
							"Keyword-relevance score for the current query (higher = better match).",
					},
				},
			},
			RepoSearchResponse: {
				type: "object",
				required: ["meta", "repos"],
				properties: {
					meta: { $ref: "#/components/schemas/Meta" },
					repos: {
						type: "array",
						items: { $ref: "#/components/schemas/Repo" },
					},
				},
			},
			FeedbackRequest: {
				type: "object",
				required: ["kind", "message"],
				description:
					"Optional reporting context is NESTED under `context` (matches the live endpoint + the GET /api/feedback self-schema).",
				properties: {
					kind: {
						type: "string",
						enum: [
							"bug",
							"missing-data",
							"wrong-answer",
							"suggestion",
							"other",
						],
					},
					message: { type: "string", minLength: 10, maxLength: 4000 },
					context: {
						type: "object",
						description: "Optional context about what triggered the feedback.",
						properties: {
							query: { type: "string" },
							endpoint: { type: "string" },
							skillVersion: { type: "string" },
							agentName: { type: "string" },
						},
					},
				},
			},
		},
	},
};

export async function GET(_req: NextRequest) {
	return NextResponse.json(spec, {
		headers: {
			// Long edge cache + permissive CORS so any codegen tool can fetch
			// the spec from the browser or a CI runner without auth concerns.
			"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, OPTIONS",
		},
	});
}

export function OPTIONS() {
	return new NextResponse(null, {
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		},
	});
}
