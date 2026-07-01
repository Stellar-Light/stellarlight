/**
 * OpenAPI 3.1 specification for the Scout public API.
 *
 *   GET /api/openapi.json
 *
 * Auto-discoverable, machine-readable description of all public
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
const VERSION = "1.2.0";

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
					"Self-describe / health endpoint for Stellar Scout — returns service ok + version, `generatedAt`, per-source freshness & size (`sources[]`: projects, hackathons, builders, repos, ecosystemStats, sdfSkills, each with count + lastUpdatedAt + notes), recent `usage` stats, and an enumeration of every available `/api/*` endpoint. Cheap (count-only queries, no params). **Use when:** you need to know how fresh/large the data is before answering ('as of when?', 'how many projects are indexed?'), discover what endpoints exist, or sanity-check the API is up. **Not for:** the actual project/repo/research DATA itself → call the matching search tool (search_projects, search_repos, search_research); ecosystem developer-activity macro stats → use get_leaderboard.",
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
		"/api/changelog": {
			get: {
				tags: ["Discovery"],
				summary: "Recent changes to the API, MCP tools, and client",
				description:
					"A curated, latest-first feed of contract-affecting changes — new/removed endpoints & tools, param/enum changes, description rewrites. Point an agent here to see what changed lately without reading git history.",
				parameters: [
					{
						name: "since",
						in: "query",
						required: false,
						description: "Only entries on/after this ISO date (YYYY-MM-DD).",
						schema: { type: "string", format: "date" },
					},
					{
						name: "limit",
						in: "query",
						required: false,
						description: "Max entries to return, latest-first (1–100).",
						schema: { type: "integer", minimum: 1, maximum: 100 },
					},
				],
				responses: {
					"200": {
						description: "Changelog feed (latest-first)",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										ok: { type: "boolean" },
										service: { type: "string" },
										version: { type: "string" },
										generatedAt: { type: "string", format: "date-time" },
										meta: { type: "object" },
										entries: {
											type: "array",
											items: {
												type: "object",
												properties: {
													date: { type: "string", format: "date" },
													surfaces: {
														type: "array",
														items: {
															type: "string",
															enum: ["api", "mcp", "api-client", "skill"],
														},
													},
													version: { type: "string" },
													type: {
														type: "string",
														enum: ["added", "changed", "fixed", "removed"],
													},
													summary: { type: "string" },
													detail: { type: "string" },
												},
											},
										},
									},
								},
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
					"Search the curated Stellar **project/product directory** — what's been *built*, by whom, with SCF-funding and live/inactive status (wallets, DEXes, anchors, lending, oracles, RWAs, tooling). Keyword + synonym match (dex→amm/swap, rosca→susu/chama) ranked by curated **prominence**, SDF/community verification, SCF funding, and Live status; falls back to semantic vector search when keyword hits are thin. Each result carries status, scfAwarded/scfTotalAwardedUSD, the project's own links, a confidence score, and its top indexed `repos` inline. **Use when:** 'who/what already exists for X', 'has anyone built X', 'is there a live/funded project for X', or you need a project's funding/status/competitors. **Not for:** raw GitHub source repos ranked by code quality → use search_repos; docs, SEPs, audits, how-to/feasibility knowledge → use search_research; category counts or whitespace → use get_clusters.",
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
					"Search the indexed Stellar ecosystem **GitHub code repos** — the actual source, graded for quality. Indexes GitHub topics + description + language + README, expands tech synonyms (zk→zero-knowledge/snark, oracle→price-feed), and ranks by **repoScore (0-100) = freshness + traction + hackathon/SCF/builder authority**. Filterable by `language` and `minScore`. **Use when:** 'show me the code / repos for X', 'find a Rust/Soroban implementation of X', 'what GitHub repos exist for X', or you need prior-art source to read, fork, or cite. **Not for:** what products/companies exist or their funding/live status → use search_projects; conceptual docs, SEPs, audits, or how-to/feasibility knowledge → use search_research; a known project's metadata (those repos already ride inline on search_projects results).",
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
		"/api/repos/explain": {
			get: {
				tags: ["Repos"],
				summary: "Deep code answer about a Stellar repo (routing × DeepWiki)",
				description:
					"Get a source-grounded ANSWER to a deep code question about a Stellar repo — not just a link. StellarLight routes the question to the authoritative repo (error/result codes, consensus/SCP, XDR → stellar/stellar-core; Horizon → stellar/go; RPC → stellar/stellar-rpc; SEP reference impls; SDKs), then DeepWiki answers from that repo's internals with source files. **Use when:** 'where is X defined / how does Y work' for a Stellar internal. **Not for:** which repos/projects exist → use /api/repos/search or /api/projects/search; ecosystem docs / SEP text / audits → use /api/research. Degrades gracefully: if DeepWiki is unavailable you still get the routed authoritative repo + its deepWikiUrl.",
				parameters: [
					{ name: "q", in: "query", required: true, description: "The deep code question (e.g. 'where are transaction result codes defined').", schema: { type: "string" } },
					{ name: "repo", in: "query", required: false, description: "Optional owner/name to pin the repo (e.g. stellar/stellar-core). Omit to auto-route.", schema: { type: "string" } },
				],
				responses: {
					"200": {
						description: "Routed repo + DeepWiki-grounded answer",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										ok: { type: "boolean" },
										q: { type: "string" },
										repo: { type: "string", nullable: true },
										routedVia: { type: "string", nullable: true },
										answer: { type: "string", nullable: true, description: "DeepWiki source-grounded answer; null if DeepWiki had no answer (routed repo still returned)." },
										answered: { type: "boolean" },
										alternateRepos: { type: "array", items: { type: "string" } },
										sources: { type: "object", properties: { repoUrl: { type: "string" }, deepWikiUrl: { type: "string" }, deepWikiSearchUrl: { type: "string", nullable: true } } },
									},
								},
							},
						},
					},
					"400": { description: "Missing q" },
				},
			},
		},
		"/api/hackathons": {
			get: {
				tags: ["Hackathons"],
				summary: "List Stellar hackathons",
				description:
					"Browse/LIST Stellar hackathon **events** — a merged, de-duplicated feed of curated Payload events (rich detail, internal pages) + live DoraHacks events (SDF org IDs 3096/3853), sorted upcoming→active→completed then newest-first. Each row carries name, slug, dates, status, organizer, source, and (for DoraHacks) prizePoolUSD + hackersCount. Filter by `status` (upcoming|active|completed), `organizer` slug, or `source` (curated|dorahacks). **Use when:** 'what Stellar hackathons are coming up / running now / recently ended', 'list SDF hackathons', or you need the slug of an event before drilling in. When a forward-looking query (status=upcoming|active) returns zero, it adds `meta.fallbackChannels` (BuildOnStellar, stellarlight.xyz, DoraHacks) — surface those rather than dead-ending. **Not for:** one event's winners/submissions/tracks → use get_hackathon; comparing 2+ named events → use compare_hackathons; ecosystem-wide rollups (total prize pools, category/funding totals across ALL events) → use analyze_ecosystem; RFPs/bounties/grants → use get_rfps.",
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
					"Full detail for ONE hackathon by slug — its metadata plus every submission with placement, prize amount, prize track, post-hack status (Built/In Progress/Abandoned), and scfAwarded flag; derives `winners`, per-`tracks` aggregates (prize $ + winner/submission counts), and a `stats` outcome funnel. Dual-shape: curated events return full DB detail; DoraHacks-only events read submissions/winners/tracks live from DoraHacks (degrading to a curated winner roster + `meta.note` when the live feed is unavailable). **Use when:** 'who won [event] / its soroban track', 'what projects were submitted to [event]', 'what tracks did [event] have and what did they pay', 'how many [event] submissions are still being built'. Needs an exact slug — get it from get_hackathons first if unknown. **Not for:** listing/browsing many events → use get_hackathons; comparing stats across 2+ events → use compare_hackathons; ecosystem-wide aggregates → use analyze_ecosystem; a winning project's own repo/funding/status outside the hackathon context → use search_projects / search_repos.",
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
					"Side-by-side comparison of 2–5 named hackathons (by slug). Returns each event's snapshot (dates, status, source, prizePoolUSD, hackersCount, submissionCount, winnerCount, prizePerWinnerUSD where derivable) plus a `deltas` block flagging the spreads agents care about — prize-pool range, submission-count range, prize-per-winner, registered-hacker counts — with human-readable `notes` like '2× spread'. Unresolved slugs come back as `source:\"not-found\"` and are listed in deltas.notes without inflating `returned`. **Use when:** 'which Stellar hackathon should I enter', 'how did [event A] compare to [event B] on prizes/turnout', 'was [A] or [B] bigger'. Requires ≥2 known slugs (max 5; iterate beyond that) — resolve them via get_hackathons first. **Not for:** one event's deep detail/winners → use get_hackathon; discovering/listing events → use get_hackathons; ecosystem-wide totals across ALL events → use analyze_ecosystem.",
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
					"The Stellar **people directory** — curated builder PROFILES (synced from Stellar Passport): displayName, githubUsername, bio, roleTitle, location, scfTier, and the projects[] each has shipped. Free-text `q`/`skill` searches across bio + role + project names/descriptions; `location` filters by place; featured builders sort first. **Use when:** 'find me a teammate/collaborator who has shipped X', 'Stellar devs in Lagos who've done Soroban', 'who can I hire for an anchor build' — i.e. you want a PERSON to contact. **Not for:** a funded project/product or 'who built X (the company)' → use search_projects; the GitHub repo/code itself → use search_repos; ecosystem-wide dev *counts*/activity stats → use get_leaderboard.",
				parameters: [
					{
						name: "q",
						in: "query",
						description:
							"Free-text filter over bio / role / projects (accepts `skill`/`tech` as aliases)",
						schema: { type: "string" },
					},
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
					"Published ecosystem partners (anchors, on/off ramps, infrastructure, tooling, protocols, wallets, audit firms). Each carries partner-claimed facts AND system-verified signals (GitHub activity, on-chain footprint, SCF involvement) plus a `freshness` object — consumers should down-rank or skip partners flagged `freshness.excludeFromMatching`. Fresh partners sort first. Filter by `type` / `sector` / `region` / `accepting` / `q`. **Use when:** 'who should audit my Soroban contract' (`type=audit-firm`), 'find an anchor or on/off-ramp in {region}', or partner discovery for an integration. **Not for:** projects/products that were BUILT → use search_projects; the people who build them → use get_builders; SCF grant briefs → use get_rfps.",
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
					"The curated set of Stellar **RFPs / sponsor briefs** (mirrors the /ideas page) — open ones are eligible for **SCF grant funding** when winners are picked; closed ones are past rounds kept for context. Each brief has title, description, technicalRequirements, category, quarter, and a quarter-derived status (open|closed). Filter by `q`, `category`, `quarter`, or `status`; response carries open/closed counts + the activeQuarter. **Use when:** 'what RFPs/bounties match my idea', 'what's the SCF funding asking for this quarter', 'is there a sponsor brief for X I could get funded to build'. **Not for:** projects already BUILT/funded → use search_projects; hackathons + their prizes → use get_hackathons; how-to / SCF Handbook / standards knowledge → use search_research.",
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
					"Semantic ($vectorSearch over Voyage embeddings) search across the Stellar **knowledge corpus** — SDF blog, SCF Handbook, SEPs/standards, dev docs, papers, SCF proposals, security audits, incident reports, and Lumenloop/EC research. Returns the top matching text chunks with source attribution, section, URL, and a confidence score (relevance + freshness + authority); audit chunks add auditor/protocol/severity. Filterable by `source`; falls back to BM25-lite keyword search if vectors are unavailable. **Use when:** 'how does X work', 'is X possible / has X been discussed on Stellar', 'what does the SEP/spec/audit say about X', or you need primary-source citations for a thesis or design question. **Not for:** what products exist or their funding/status → use search_projects; GitHub source code ranked by quality → use search_repos.",
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
					"Catalog of installable Stellar **AI skills/tools** — a unified, filterable list merging SDF's 7 official skills.stellar.org skills, Stellarlight + lumenloop + trusted third-party curated entries, and approved community submissions. Each entry carries an `install` command, `kind` (skill-md | mcp-server | sdk | cli | agent-kit | tool), `source`, repo/homepage/docs, and `meta.counts.bySource`; filter by `source` or `kind`. **Use when:** 'what Stellar AI skills / MCP servers / SDKs can I install', 'is there a skill for soroban / anchors / payments', or matching a builder's idea to the right installable tool. **Not for:** the full SKILL.md text or install details of ONE named skill → use get_skill; built/funded products in the ecosystem (not installable agent skills) → use search_projects; GitHub source repos → use search_repos; docs/standards/how-to knowledge → use search_research.",
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
					"Full detail for ONE skill by slug or display name — returns its metadata plus, for SDF official skills, the complete raw SKILL.md text under `.skill.content` (fetched live from skills.stellar.org); curated/community entries return metadata (and inlined content for Stellarlight's own skills). Accepts either the slug ('agentic-payments') or display name ('Agentic Payments'); 404s with a hint to list /api/skills if unknown. **Use when:** you already know a skill name and need its actual instructions / install command / SKILL.md body to follow or quote. **Not for:** browsing or discovering which skills exist → use list_skills; conceptual docs or standards behind a topic (not a packaged skill) → use search_research.",
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
					"Groups the active Stellar **project directory into topic clusters** and scores each on **crowdedness (1–10, log-scaled)** so you can see saturated vs underbuilt lanes — i.e. *where to build*. Each cluster returns `size`, `crowdedness`, `scfFundedCount`, `scfTotalUSD`, `hackathonWinnerCount`, and up to 5 sample projects; cluster by `dimension=category` (coarse 7-cat) or `dimension=types` (finer: Wallet/DEX/Lending/RWA/Oracle…), or pass `key`/`type` to get one cluster. **Use when:** 'what's the most crowded category on Stellar', 'show me an underbuilt/whitespace area', 'how many projects/funded projects are in RWA vs wallets', 'where is the competition thin'. **Not for:** ranking the top projects/repos by stars or activity → use get_leaderboard; ecosystem-wide totals (events + funding + status funnel) → use analyze_ecosystem; finding/looking up an actual named project in a category → use search_projects.",
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
					"Returns the **cross-everything ecosystem rollup** — the macro totals that single-event or single-cluster tools can't answer alone. `dimension=all` (default) or slice to `hackathons` (totalEvents, upcoming/active/completed counts, totalPrizePoolUSD, totalRegisteredHackers — live from DoraHacks), `categories` (project-count distribution + scfFunded + hackathon winners per category), or `funding` (scfAwardedProjects, scfTotalDistributedUSD, meanAwardUSD, per-round breakdown, and the post-hackathon Built/In-Progress/Abandoned status funnel). **Use when:** 'what's the overall state of Stellar hackathons/grants', 'total SCF funding distributed / mean award size', 'how much prize money across all hackathons', 'how many projects get built vs abandoned after hackathons'. **Not for:** crowdedness or whitespace per category → use get_clusters; a ranked list of top/active projects → use get_leaderboard; one specific hackathon's details → use get_hackathon; comparing two hackathons head-to-head → use compare_hackathons.",
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
					"Returns a **ranked list of active Stellar projects** (default top 50, max 300) sortable by `sort=activity|stars|issues` over a `range` (7d/30d/90d/1y/all), with per-project GitHub rollups (`totalStars`, `openIssuesTotal`, `lastActivityAt`, `repoCount`) and `scfAwarded`; optional `category` filter and `format=csv`. Also bundles an **Electric Capital ecosystem dev macro** block (28-day active / Stellar-only / multichain dev counts, commits28d, full-time/part-time/one-time dev splits). **Use when:** 'who/what are the top/most-active Stellar projects', 'most-starred projects', 'which projects shipped recently (last 30d)', 'how many active Stellar devs / how does Stellar's dev activity look', or you need a CSV/Dune-style export of ranked projects. **Not for:** category counts or crowded-vs-underbuilt whitespace → use get_clusters; ecosystem-wide hackathon/funding/status-funnel totals → use analyze_ecosystem; finding a specific project's profile/funding/competitors → use search_projects; ranking individual developers (this ranks PROJECTS, plus an EC macro snapshot — it does not list named devs) → use get_builders.",
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
							"Filter the leaderboard to one project category (e.g. 'Tooling', 'Infrastructure'). An unrecognized value returns 400 with the valid list.",
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
						placementRank: {
							type: "integer",
							nullable: true,
							description:
								"Numeric rank parsed from hackathonPlacement (1 = best). winners[] is sorted by this, so winners[0] is the 1st-place entry — sort/filter on this instead of parsing the label.",
						},
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
						deepWikiUrl: {
							type: "string",
							description:
								"DeepWiki AI-generated wiki of this repo's internals (deepwiki.com/{owner}/{name}). Hand off here for deep 'where/how' code questions — e.g. where error codes / consensus / XDR are defined — beyond which-repo discovery.",
						},
						canonical: {
							type: "boolean",
							description:
								"True when surfaced as a curated canonical SDF answer for an infra/protocol query (e.g. error codes → stellar-core/Horizon/SDKs; Horizon → stellar/go). Floated to the top; meta.canonical lists them.",
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
