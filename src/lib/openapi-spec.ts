/**
 * The OpenAPI 3.1 spec for the Scout public API — THE contract, as a pure
 * data module. Served by src/app/api/openapi.json/route.ts; snapshotted to
 * specs/openapi.json and codegen'd into api-client/src/schema.ts by
 * scripts/contract/build-contract.ts (PR-enforced via contract-gate.yml).
 * Lives outside the route file because Next.js route modules may only export
 * handlers/config — and so scripts can import it without touching next/server.
 *
 * If you change a route's params or response shape, update this spec in the
 * same PR, run `pnpm contract:write`, and add a changelog entry — CI fails
 * otherwise.
 */
import { API_VERSION } from "./version";

const SITE_URL = "https://stellarlight.xyz";
// Shared with /api/status (`apiVersion`) so the contract version never drifts.
const VERSION = API_VERSION;

interface OpenAPISpec {
	openapi: string;
	info: Record<string, unknown>;
	servers: Array<Record<string, unknown>>;
	tags: Array<Record<string, unknown>>;
	paths: Record<string, unknown>;
	components: Record<string, unknown>;
}

export const spec: OpenAPISpec = {
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
			"## Routing metadata (description vs x-routing)",
			"Operation `description` fields are deliberately terse purpose statements: the operation's distinctive job plus its single sharpest disambiguation, nothing else. The machine-routing vocabulary that previously lived in description prose — category/product enumerations, synonym chains, example question phrasings — lives in each operation's `x-routing` extension: `{purpose, keywords[], useWhen[], notFor[], exampleQuestions[]}`. Lexical and embedding routers should score `x-routing` as separately-weighted fields rather than concatenating it into the description (broad prose descriptions were lexically capturing question families other operations answer — sls-051); `notFor` entries name the operation to prefer, as '<question shape> -> <operationId>'.",
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
			'`/api/projects/search` sorts by descending keyword `score` (token-overlap count) and exposes `meta.matchMode` (`strict` → `loose-1` → `majority` → `semantic`) so you know how much the query was relaxed. `semantic` means no keyword tier matched at all — the rows are vector-similarity guesses (`via: "semantic"`, confidence capped at medium), not keyword-confirmed answers. `/api/research` sorts by descending vector-similarity `score` (0–1 cosine). Use these for cross-source ranking when merging with other aggregators.',
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
			name: "Repos",
			description:
				"Indexed and scored Stellar GitHub repos + code-question answering",
		},
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
				operationId: "getStatus",
				tags: ["Discovery"],
				summary: "Service health + endpoint enumeration",
				description:
					"Self-describe / health endpoint — service ok + versions, per-source freshness and counts (`sources[]`), recent usage, and an enumeration of every /api/* endpoint. Cheap, no params. Use to check how fresh/large the data is or to discover endpoints. Not for the data itself → call the matching search operation.",
				"x-routing": {
					purpose:
						"Service health, per-source data freshness, and endpoint discovery.",
					keywords: [
						"status",
						"health",
						"up",
						"version",
						"freshness",
						"last updated",
						"as of",
						"counts",
						"sources",
						"endpoints",
						"discovery",
						"usage",
						"projects count",
						"hackathons count",
						"builders count",
						"repos count",
						"ecosystemStats",
						"sdfSkills",
						"researchDocs",
						"partners count",
					],
					useWhen: [
						"how fresh or large is the data ('as of when?', 'how many projects are indexed?')",
						"what endpoints exist / sanity-check the API is up",
					],
					notFor: [
						"the actual project/repo/research data -> searchProjects / searchRepos / searchResearch",
						"ecosystem developer-activity macro stats -> getLeaderboard",
					],
					exampleQuestions: [
						"How many projects are indexed?",
						"When was the repo index last updated?",
						"What endpoints does the Scout API expose?",
					],
				},
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
				operationId: "getChangelog",
				tags: ["Discovery"],
				summary: "Recent changes to the API, MCP tools, and client",
				description:
					"A curated, latest-first feed of contract-affecting changes — new/removed endpoints & tools, param/enum changes, description rewrites. Point an agent here to see what changed lately without reading git history. **Use when:** you cached the API surface earlier and want to know what moved before relying on it, or you're debugging a field/param that changed. **Not for:** the actual ecosystem data → use the relevant search endpoint; current health / source freshness / version → use /api/status.",
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
				operationId: "searchProjects",
				tags: ["Projects"],
				summary: "Search Stellar projects (prior art / competitor lookup)",
				description:
					"Search the curated directory of Stellar projects/products — what has been BUILT, by whom, with SCF funding, lifecycle status, `builtBy`, links, indexed repos, and verified on-chain metrics (`onchain`) inline. Answers 'who/what already exists for X' with directory records; the `type` filter gives exact product-type rosters. Not for docs, standards, or how-to/reference knowledge → use searchResearch.",
				"x-routing": {
					purpose:
						"Directory lookup of built Stellar projects/products — status, SCF funding, builder, links. Keyword+synonym ranked by prominence/verification/funding/Live status, semantic fallback when keyword hits are thin.",
					keywords: [
						"projects",
						"products",
						"apps",
						"dapps",
						"protocols",
						"teams",
						"companies",
						"startups",
						"directory",
						"market map",
						"on-chain activity",
						"onchain metrics",
						"contract events",
						"contract invocations",
						"asset holders",
						"circulating supply",
						"tvl",
						"prior art",
						"competitors",
						"defi",
						"lending",
						"credit",
						"yield",
						"amm",
						"dex",
						"swap",
						"liquidity",
						"nft marketplace",
						"wallets",
						"anchors",
						"on/off-ramps",
						"rwa",
						"real-world-asset tokenization",
						"stablecoins",
						"payments",
						"oracles",
						"identity",
						"gaming",
						"infrastructure",
						"tooling",
						"perpetuals",
						"derivatives",
						"block explorers",
						"stellar.expert",
						"stellarchain",
						"rosca",
						"susu",
						"chama",
						"etherfuse stablebonds",
						"ustry",
						"cetes",
						"soroswap",
						"scf-funded",
						"live",
						"inactive",
					],
					useWhen: [
						"who has built / has anyone built / is there a live or SCF-funded project for X",
						"which projects exist / give me a directory or market map of a category (wallets, DeFi, NFT marketplaces, anchors and anchor infrastructure, explorers)",
						"DIRECTORY FACTS about a named product — status, funding, builder, links (e.g. Etherfuse Stablebonds USTRY/CETES, Soroswap)",
						"is there a mature X I could integrate / who is building Y / projects operating as anchors",
						"list/enumerate/compare from the curated directory: which wallets exist and how they differ, main DeFi projects, perpetuals/derivatives DEXes, AMM/liquidity protocols and their yields",
					],
					notFor: [
						"how-to / reference / docs questions (CLI usage, bindings, SEP or standards text, feasibility) -> searchResearch",
						"raw GitHub source repos ranked by code quality -> searchRepos",
						"editorial/analysis content about a product (articles, interviews, metrics commentary, deep dives) -> content platforms, not this directory",
						"category counts or whitespace -> getClusters",
						"a TVL-complete DeFi rollup -> analyzeEcosystem dimension=tvl (the types taxonomy has no DeFi umbrella; RWA/Infrastructure-typed protocols like Spiko carry most Stellar TVL, so type=DEX+Lending rosters miss them)",
					],
					exampleQuestions: [
						"Which wallets exist on Stellar and how do they differ?",
						"Has anyone built a ROSCA/susu app on Stellar?",
						"Is Etherfuse Stablebonds live and SCF-funded?",
						"Who built Soroswap?",
						"Give me a market map of Stellar DeFi projects",
					],
				},
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
						name: "type",
						in: "query",
						description:
							"Filter to projects whose `types[]` includes this product type — server-side exact membership, e.g. `type=Wallet` enumerates Wallet-typed records (combine with `q` and/or `status` to scope further, or use alone to list a type). Distinct from `category` (a project has ONE category but can carry several types). Unknown values return 400 with validTypes.",
						schema: {
							type: "string",
							enum: [
								"Wallet",
								"DEX",
								"Lending",
								"Bridge",
								"Infrastructure",
								"Payments",
								"Anchor",
								"SDK",
								"Indexer",
								"Explorer",
								"Analytics",
								"AI",
								"Gaming",
								"Education",
								"Security",
								"NFT",
								"RWA",
								"Stablecoin",
								"Social Impact",
								"RPC",
								"Faucet",
							],
						},
					},
					{
						name: "scfAwarded",
						in: "query",
						description: "Filter to SCF-funded projects only",
						schema: { type: "boolean" },
					},
					{
						name: "status",
						in: "query",
						description:
							"Filter by lifecycle status (e.g. status=Inactive lists retired/defunct projects; status=Live restricts to operating ones). Unknown values return 400 with validStatuses.",
						schema: {
							type: "string",
							enum: [
								"Live",
								"Inactive",
								"Development",
								"Pre-Release",
								"Pre-Development",
							],
						},
					},
					{ $ref: "#/components/parameters/limit" },
					{ $ref: "#/components/parameters/offset" },
					{ $ref: "#/components/parameters/fields" },
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
				operationId: "searchRepos",
				tags: ["Repos"],
				summary: "Search the Stellar GitHub repo / code-reference index",
				description:
					"Search the indexed Stellar ecosystem GitHub code repos — actual source graded by repoScore (0-100: freshness + traction + ecosystem authority), filterable by `language`/`minScore`. Use for 'show me the code/repos for X' or 'find a Rust/Soroban implementation of X' — prior-art source to read, fork, or cite. Not for products/companies and their funding/status → use searchProjects.",
				"x-routing": {
					purpose:
						"Find quality-graded Stellar GitHub source code — libraries, contracts, SDKs, templates. Indexes topics + description + language + README; expands tech synonyms.",
					keywords: [
						"code",
						"repos",
						"github",
						"source",
						"libraries",
						"sdks",
						"client libraries",
						"boilerplate",
						"templates",
						"starters",
						"example contracts",
						"reference contracts",
						"sep-41 token",
						"sep reference impls",
						"openzeppelin soroban",
						"testing tooling",
						"fuzz",
						"property-based",
						"unit tests",
						"rust",
						"soroban",
						"streaming payments",
						"recurring payments",
						"groth16",
						"zk",
						"zero-knowledge",
						"snark",
						"proof verifier",
						"passkey",
						"smart wallet",
						"soroban-sdk version",
						"stellar-cli release",
						"target protocol",
						"openzeppelin rwa",
						"regulated token",
						"erc-3643",
						"t-rex",
						"ai-agent identity",
						"oracle",
						"price-feed",
					],
					useWhen: [
						"show me the code / what GitHub repos exist for X",
						"find a Rust/Soroban implementation, example, or reference contract (SEP-41 token, SEP reference impls, OpenZeppelin Soroban/RWA/regulated-token contracts)",
						"find libraries, SDKs, boilerplate, starters, or testing tooling (fuzz, property-based, unit tests) for Soroban/Rust/Stellar",
						"streaming/recurring-payment contract examples, Groth16/ZK proof verifiers, passkey and smart-wallet implementations, AI-agent identity work",
						"current soroban-sdk / stellar-cli release versions and target protocol; top-rated SDK/client-library repos",
					],
					notFor: [
						"what products/companies exist or their funding/live status -> searchProjects",
						"conceptual docs, SEPs, audits, or how-to/feasibility knowledge -> searchResearch",
						"a known project's metadata (its repos already ride inline on results) -> searchProjects",
						"'where is X defined / how does Y work' inside one repo -> explainRepo",
					],
					exampleQuestions: [
						"Find a Soroban AMM implementation in Rust",
						"What OpenZeppelin contracts exist for Stellar?",
						"Show me passkey smart-wallet repos",
						"Is there a Groth16 proof verifier for Soroban?",
					],
				},
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
					{ $ref: "#/components/parameters/fields" },
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
				operationId: "explainRepo",
				tags: ["Repos"],
				summary: "Deep code answer about a Stellar repo (routing × DeepWiki)",
				description:
					"Source-grounded ANSWER to a deep code question about a Stellar internal — routes the question to the authoritative repo (stellar-core, Horizon/go, RPC, SDKs, SEP reference impls), then DeepWiki answers from that repo's source files. Degrades to the routed repo + deepWikiUrl when DeepWiki is unavailable. Not for discovering which repos/projects exist → use searchRepos.",
				"x-routing": {
					purpose:
						"Deep 'where/how' code answers grounded in the authoritative Stellar repo's internals.",
					keywords: [
						"error codes",
						"result codes",
						"consensus",
						"scp",
						"xdr",
						"stellar-core",
						"horizon",
						"stellar/go",
						"rpc",
						"stellar-rpc",
						"sep reference implementation",
						"sdk internals",
						"implementation",
						"defined",
						"deepwiki",
					],
					useWhen: [
						"'where is X defined / how does Y work' for a Stellar internal (error/result codes, consensus/SCP, ledger, XDR, a SEP's implementation)",
						"'how do I / where is / show me the implementation of' deep code questions answered from the authoritative repo's internals",
					],
					notFor: [
						"which repos/projects exist -> searchRepos / searchProjects",
						"ecosystem docs / SEP text / audits -> searchResearch",
					],
					exampleQuestions: [
						"Where are transaction result codes defined?",
						"How does SCP reach consensus?",
						"Where does Horizon ingest ledger data?",
					],
				},
				parameters: [
					{
						name: "q",
						in: "query",
						required: true,
						description:
							"The deep code question (e.g. 'where are transaction result codes defined').",
						schema: { type: "string" },
					},
					{
						name: "repo",
						in: "query",
						required: false,
						description:
							"Optional owner/name to pin the repo (e.g. stellar/stellar-core). Omit to auto-route.",
						schema: { type: "string" },
					},
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
										meta: {
											type: "object",
											description:
												"Provenance: routing/grounding source + generation time.",
											properties: {
												source: { type: "string" },
												generatedAt: { type: "string", format: "date-time" },
												note: { type: "string" },
											},
										},
										q: { type: "string" },
										repo: { type: "string", nullable: true },
										routedVia: {
											type: "string",
											nullable: true,
											description:
												"How the repo was chosen: explicit | canonical | search. null when nothing routed.",
										},
										repoMeta: {
											type: "object",
											nullable: true,
											description:
												"Freshness/status of the routed repo from the StellarLight index — attach lastCommitAt as the as-of date when citing the answer. Null when the repo isn't indexed or nothing routed.",
											properties: {
												lastCommitAt: {
													type: "string",
													format: "date-time",
													nullable: true,
												},
												stars: { type: "integer", nullable: true },
												isArchived: { type: "boolean" },
												repoScoreLabel: { type: "string", nullable: true },
											},
										},
										codeVerified: {
											type: "object",
											nullable: true,
											description:
												"Code-verified truth from analyzing the routed repo's ACTUAL source — qualify the answer with it: a deployable contract on a supported soroban-sdk is authoritative; tooling that merely uses Stellar is not. Null until code-scanned.",
											properties: {
												stellarProof: { type: "string" },
												codeDepth: { type: "number", nullable: true },
												isDeployableContract: {
													type: "boolean",
													description:
														"The routed repo's PRODUCT is a deployable Soroban contract. Known platform/SDK/tooling repos (stellar-core, rs-soroban-env, the SDKs/CLI/RPC…) are pinned FALSE — they vendor cdylib crates as runtime/fixtures, and this flag must never be read as 'Stellar Core itself is deployable' (sls-046).",
												},
												sorobanSdkVersion: { type: "string", nullable: true },
												versionStatus: { type: "string", nullable: true },
												scannedAt: {
													type: "string",
													format: "date-time",
													nullable: true,
												},
												symbols: {
													type: "array",
													items: { type: "string" },
												},
												mainnetContractId: {
													type: "string",
													nullable: true,
												},
												sdkCapabilities: {
													type: "array",
													items: { type: "string" },
												},
											},
										},
										answer: {
											type: "string",
											nullable: true,
											description:
												"DeepWiki source-grounded answer; null if DeepWiki had no answer (routed repo still returned).",
										},
										answered: {
											type: "boolean",
											description:
												"Always present, including when routedVia is null (then false).",
										},
										alternateRepos: {
											type: "array",
											items: { type: "string" },
											description:
												"Other authoritative repos for this concept. Always present ([] when none).",
										},
										sources: {
											type: "object",
											description:
												"Always present; fields are null when nothing was routed.",
											properties: {
												repoUrl: { type: "string", nullable: true },
												deepWikiUrl: { type: "string", nullable: true },
												deepWikiSearchUrl: { type: "string", nullable: true },
											},
										},
										note: {
											type: "string",
											nullable: true,
											description:
												"Present when routing failed entirely — a hint to use search_repos or pin ?repo=.",
										},
										note2: {
											type: "string",
											nullable: true,
											description:
												"Present when a repo routed but DeepWiki had no answer.",
										},
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
				operationId: "getHackathons",
				tags: ["Hackathons"],
				summary: "List Stellar hackathons",
				description:
					"Browse/LIST Stellar hackathon events — a merged, de-duplicated curated + live DoraHacks feed (dates, status, organizer, prize pools), sorted upcoming→active→completed then newest-first. The entry point for event slugs; zero-result forward-looking queries return `meta.fallbackChannels` (surface them, don't dead-end). Not for one event's winners/submissions/tracks → use getHackathon.",
				"x-routing": {
					purpose:
						"List/browse Stellar hackathon events (curated + DoraHacks SDF orgs 3096/3853) and resolve event slugs.",
					keywords: [
						"hackathon",
						"hackathons",
						"events",
						"upcoming",
						"active",
						"completed",
						"dorahacks",
						"sdf",
						"prize pool",
						"hackers",
						"organizer",
						"buildonstellar",
					],
					useWhen: [
						"what Stellar hackathons are coming up / running now / recently ended",
						"list SDF hackathons",
						"you need the slug of an event before drilling in",
					],
					notFor: [
						"one event's winners/submissions/tracks -> getHackathon",
						"comparing 2+ named events -> compareHackathons",
						"ecosystem-wide rollups (total prize pools, category/funding totals across ALL events) -> analyzeEcosystem",
						"RFPs/bounties/grants -> getRfps",
					],
					exampleQuestions: [
						"What Stellar hackathons are coming up?",
						"List recently completed SDF hackathons",
					],
				},
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
				operationId: "getHackathon",
				tags: ["Hackathons"],
				summary: "Get one hackathon's full detail",
				description:
					"Full detail for ONE hackathon by slug — every submission with placement, prize, track, and post-hack status; derives `winners`, per-track aggregates, and a `stats` outcome funnel. DoraHacks-only events read live, degrading to a winner roster + `meta.note`. Needs an exact slug — resolve via getHackathons first. Not for listing/browsing events → use getHackathons.",
				"x-routing": {
					purpose:
						"One hackathon's winners, submissions, tracks, and outcome stats.",
					keywords: [
						"winners",
						"won",
						"submissions",
						"tracks",
						"placement",
						"prize",
						"prize track",
						"soroban track",
						"post-hack status",
						"built",
						"in progress",
						"abandoned",
						"outcome funnel",
						"scfAwarded",
					],
					useWhen: [
						"who won [event] / who won its soroban track",
						"what projects were submitted to [event]",
						"what tracks did [event] have and what did they pay",
						"how many [event] submissions are still being built",
					],
					notFor: [
						"listing/browsing many events -> getHackathons",
						"comparing stats across 2+ events -> compareHackathons",
						"ecosystem-wide aggregates -> analyzeEcosystem",
						"a winning project's own repo/funding/status outside the hackathon context -> searchProjects / searchRepos",
					],
					exampleQuestions: [
						"Who won the Stellar x402 hackathon?",
						"What tracks did the event have and what did they pay?",
					],
				},
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
				operationId: "compareHackathons",
				tags: ["Hackathons"],
				summary: "Compare 2–5 hackathons side-by-side",
				description:
					"Side-by-side comparison of 2–5 hackathons by slug — per-event snapshot (prize pool, submissions, winners, hackers, prize-per-winner) plus a `deltas` block flagging the spreads. Unresolved slugs return source:'not-found' without inflating counts. Requires ≥2 known slugs — resolve via getHackathons. Not for ecosystem-wide totals across ALL events → use analyzeEcosystem.",
				"x-routing": {
					purpose:
						"Compare 2–5 named hackathons on prizes, turnout, and outcomes.",
					keywords: [
						"compare",
						"versus",
						"vs",
						"bigger",
						"prize pool",
						"turnout",
						"spread",
						"prize-per-winner",
						"registered hackers",
						"submission count",
					],
					useWhen: [
						"which Stellar hackathon should I enter",
						"how did [event A] compare to [event B] on prizes/turnout",
						"was [A] or [B] bigger",
					],
					notFor: [
						"one event's deep detail/winners -> getHackathon",
						"discovering/listing events -> getHackathons",
						"ecosystem-wide totals across ALL events -> analyzeEcosystem",
					],
					exampleQuestions: [
						"Was event A bigger than event B?",
						"Compare the last two SDF hackathons on prize money",
					],
				},
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
				operationId: "getBuilders",
				tags: ["Builders"],
				summary: "Search Stellar builders",
				description:
					"The Stellar PEOPLE directory — builder profiles synced from Stellar Passport (bio, role, location, shipped projects[]), searchable by `q`/`skill` and `location`. Use to find a person to recruit, hire, or collaborate with. Not for the company/product behind a project ('who built X') → use searchProjects. Profiles carry NO populated SCF-tier/award data.",
				"x-routing": {
					purpose:
						"Find Stellar builders (people) by skill, location, or shipped projects — recruiting/hiring.",
					keywords: [
						// sls-052: stack+role/seniority question family
						"developers",
						"devs",
						"engineers",
						"contributors",
						"experienced",
						"senior",
						"hire",
						"typescript",
						"javascript",
						"frontend",
						"backend",
						"smart contract developer",
						"builder",
						"builders",
						"developer",
						"developers",
						"devs",
						"engineers",
						"contributors",
						"teammate",
						"collaborator",
						"hire",
						"recruit",
						"person",
						"people",
						"profiles",
						"passport",
						"location",
						"lagos",
						"latam",
						"latin america",
						"india",
						"africa",
						"asia",
						"europe",
						"rust",
						"soroban",
					],
					useWhen: [
						"find developers by stack + role/seniority (e.g. experienced Rust Soroban devs)",
						"find me a teammate/collaborator who has shipped X",
						"Stellar devs in [place] who've done Soroban / 'Rust builders to hire' / 'builders in LatAm working on payments'",
						"who can I hire for an anchor build — you want a PERSON to contact",
						"filter/find PEOPLE by region (Latin America, India, Africa, Asia, Europe) or by stack",
					],
					notFor: [
						"a funded project/product or 'who built X (the company)' -> searchProjects",
						"the GitHub repo/code itself -> searchRepos",
						"ecosystem-wide dev counts/activity stats -> getLeaderboard",
						"SCF-tier or award-track filtering (unsupported — no SCF-tier data exists on profiles; the never-populated `scfTier` response field was removed in 1.7.19; a project's award history) -> searchProjects",
					],
					exampleQuestions: [
						"Who are experienced Rust Soroban devs I could work with?",
						"Find experienced Soroban devs I could reach out to",
						"Rust builders to hire in LatAm working on payments",
						"Who in Lagos has shipped a Stellar project?",
					],
				},
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
					{ $ref: "#/components/parameters/fields" },
				],
				responses: {
					"200": {
						description: "Builder list",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										meta: {
											type: "object",
											properties: {
												matchBasis: {
													type: "string",
													description:
														"What a skill match IS (sls-041): free-text hits over profile + project prose = candidate discovery, NOT verified experience/seniority/availability. Read each row's `match` for where the query hit, and `codeEvidence` for repository-backed facts.",
												},
											},
										},
										builders: {
											type: "array",
											items: { $ref: "#/components/schemas/Builder" },
										},
									},
								},
							},
						},
					},
				},
			},
		},
		"/api/people": {
			get: {
				operationId: "getPeople",
				tags: ["Builders"],
				summary: "SDF team / people index",
				description:
					"The Stellar Development Foundation org/people index — leadership, board of directors, and advisors (name → role → org), quoted from stellar.org/foundation/team with provenance. Use for 'who is <person>', 'what is <person>'s role at SDF', 'who leads <area>', 'who's on the SDF board'. Distinct from getBuilders (GitHub-contributor profiles) — an SDF VP or board member is NOT a 'builder'. Not for doc/spec authorship → use searchResearch.",
				"x-routing": {
					purpose:
						"Look up a named person on the SDF roster (leadership / board / advisors) and their current role/affiliation.",
					keywords: [
						"who is",
						"role",
						"title",
						"leadership",
						"executive",
						"ceo",
						"cto",
						"cfo",
						"chief",
						"vp",
						"vp of ecosystem",
						"board",
						"board of directors",
						"director",
						"advisor",
						"advisors",
						"sdf team",
						"stellar development foundation team",
						"founder",
						"staff",
						"person",
						"people",
					],
					useWhen: [
						"who is <person> / what is <person>'s role at SDF",
						"who leads ecosystem / product / engineering at the SDF",
						"who sits on the SDF board of directors or advisory board",
						"a named SDF staffer or leader that getBuilders (GitHub contributors) doesn't cover",
					],
					notFor: [
						"a GitHub-contributor / builder to hire -> getBuilders",
						"who authored a doc/spec/blog post -> searchResearch",
						"a funded project/product or 'who built X (the company)' -> searchProjects",
					],
					exampleQuestions: [
						"Who is Justin Rice and what does he do at SDF?",
						"Who is the SDF Chief Scientist?",
						"Who's on the Stellar Development Foundation board of directors?",
					],
				},
				parameters: [
					{
						name: "q",
						in: "query",
						description:
							"Name / role / org text filter (e.g. 'justin rice', 'ecosystem', 'openai'). All tokens must match.",
						schema: { type: "string" },
					},
					{
						name: "section",
						in: "query",
						description:
							"Restrict to one roster section. Accepts 'Leadership', 'Board of directors', 'Advisors' (and aliases 'board'/'advisor').",
						schema: { type: "string" },
					},
					{ $ref: "#/components/parameters/limit" },
					{ $ref: "#/components/parameters/offset" },
				],
				responses: {
					"200": {
						description: "SDF roster",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										meta: {
											type: "object",
											properties: {
												source: {
													type: "string",
													description:
														"The roster page each row is quoted from (stellar.org/foundation/team).",
												},
												observedAt: {
													type: "string",
													description:
														"Date the roster was last observed from the source (YYYY-MM-DD).",
												},
												sections: {
													type: "array",
													items: { type: "string" },
													description:
														"Distinct roster sections present (Leadership, Board of directors, Advisors).",
												},
												matchBasis: {
													type: "string",
													description:
														"This is an org/people reference index, NOT a builder/contributor index — roster facts, not verified availability.",
												},
											},
										},
										people: {
											type: "array",
											items: { $ref: "#/components/schemas/Person" },
										},
									},
								},
							},
						},
					},
					"400": {
						description:
							"Invalid section value, or an unsupported query parameter.",
					},
				},
			},
		},
		"/api/partners": {
			get: {
				operationId: "getPartners",
				tags: ["Partners"],
				summary: "List ecosystem partners",
				description:
					"Published ecosystem partner directory — service providers a builder hires or integrates: anchors, on/off-ramps, infrastructure, tooling, protocols, wallets, audit firms. Partner-claimed facts ride WITH system-verified signals + `freshness` (down-rank/skip `excludeFromMatching`). Filter by `type`/`sector`/`region`/`ramps`/`accepting`/`q`. Not for built products/projects → use searchProjects.",
				"x-routing": {
					purpose:
						"Directory of hireable/integratable ecosystem partners with verified activity signals.",
					keywords: [
						"partner",
						"partners",
						"anchor",
						"anchors",
						"on-ramp",
						"off-ramp",
						"ramps",
						"audit",
						"audit firm",
						"auditor",
						"infrastructure",
						"tooling",
						"protocol",
						"wallet",
						"legal",
						"agency",
						"integration",
						"service provider",
						"region",
						"sector",
						"corridor",
						"accepting clients",
					],
					useWhen: [
						"'who should audit my Soroban contract' (type=audit-firm)",
						"find an anchor or on/off-ramp in {region}",
						"partner discovery for an integration",
					],
					notFor: [
						"projects/products that were BUILT -> searchProjects",
						"the people who build them -> getBuilders",
						"SCF grant briefs -> getRfps",
					],
					exampleQuestions: [
						"Who can audit my Soroban contract?",
						"Find a USDC off-ramp partner in Mexico",
					],
				},
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
						// Param-level doc ONLY — op description deliberately untouched
						// (downstream routing catalogs diff op descriptions).
						name: "ramps",
						in: "query",
						description:
							"Filter by fiat-ramp capability: `on-ramp` (fiat → Stellar), `off-ramp` (Stellar → fiat), or `on-ramp,off-ramp` to require both. Unknown values return 400 with `validRamps`. Combine with `region`/`q` for corridor lookups (e.g. ramps=on-ramp&q=mexico).",
						schema: { type: "string", example: "on-ramp" },
					},
					{
						name: "accepting",
						in: "query",
						description:
							"Set to 1 to return only partners currently accepting new clients",
						schema: { type: "string", enum: ["1"] },
					},
					{
						// Param-level doc ONLY — the operation description above is
						// deliberately untouched (downstream routing catalogs diff
						// op descriptions; param additions are neutral).
						name: "all",
						in: "query",
						description:
							"Set to 1 to bypass the directory quality bar. By default results include only complete, non-archived profiles (tagline + a contact path), pilot partners first; all=1 returns every published partner including placeholder-thin profiles.",
						schema: { type: "string", enum: ["1"] },
					},
					{ $ref: "#/components/parameters/q" },
					{ $ref: "#/components/parameters/limit" },
					{ $ref: "#/components/parameters/fields" },
				],
				responses: {
					"200": {
						description: "Partner directory",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/PartnersResponse" },
							},
						},
					},
				},
			},
		},
		"/api/partners/{slug}": {
			get: {
				operationId: "getPartner",
				tags: ["Partners"],
				summary: "Get one partner's full profile",
				description:
					"Full published profile for one partner by slug, including verified signals + freshness. 404 for unknown or unpublished slugs. **Use when:** you already know a partner's slug (from /api/partners) and need their full public profile — services, sectors, regions, docs, contact, freshness. **Not for:** discovering partners for a need → use /api/partners with ?type/?sector/?region/?q; a project/product rather than a service provider → use /api/projects/search.",
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
		"/api/partners/match": {
			post: {
				operationId: "matchPartners",
				tags: ["Partners"],
				summary: "AI-rank partners against a plain-language need",
				description:
					"Describe a builder need in plain language (e.g. 'I need a USDC off-ramp in Mexico with SEP-24') and get the published partners RANKED by fit, each with a one-line reason. Grounded: only real published partners are ranked — nothing is invented. Requires the service to have AI configured; returns 503 `unavailable:true` otherwise (fall back to GET /api/partners filters). **Use when:** an agent needs a scored shortlist for a concrete integration need. **Not for:** browsing the full directory → GET /api/partners; interactive human chat → the /partners/chat page (backed by /api/partners/assistant).",
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["need"],
								properties: {
									need: {
										type: "string",
										description: "The builder's need, in plain language",
									},
								},
							},
						},
					},
				},
				responses: {
					"200": {
						description: "Ranked matches with reasons",
						content: { "application/json": { schema: { type: "object" } } },
					},
					"429": { description: "Rate limited" },
					"503": {
						description:
							"AI backend unavailable — fall back to GET /api/partners",
						content: { "application/json": { schema: { type: "object" } } },
					},
				},
			},
		},
		"/api/partners/assistant": {
			post: {
				operationId: "partnerAssistant",
				"x-side-effecting": true,
				tags: ["Partners"],
				summary: "Conversational partner concierge (find OR get listed)",
				description:
					"Chat backend for /partners/chat. Send the running message history; intent-routed: a builder need returns real matched partners in `matches[]` (never hallucinated), a company describing itself gets interviewed (`canList:true` → offer profile extraction). Returns `{reply, matches?, intent, canList}`; 503 without AI. Not for one-shot programmatic ranking → use matchPartners.",
				"x-routing": {
					purpose:
						"Conversational partner concierge — find partners or start a get-listed flow. Matches are deterministically searched; surfaced partners are logged as leads for the weekly partner digest.",
					keywords: [
						"chat",
						"concierge",
						"conversation",
						"assistant",
						"find a partner",
						"get listed",
						"interview",
						"leads",
					],
					useWhen: ["building a conversational partner-finding UX"],
					notFor: [
						"one-shot programmatic ranking -> matchPartners",
						"browsing the directory -> getPartners",
					],
					exampleQuestions: [
						"(chat turn) I need a SEP-24 anchor in Brazil — who should I talk to?",
					],
				},
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["messages"],
								properties: {
									messages: {
										type: "array",
										description: "Chat turns, oldest first",
										items: {
											type: "object",
											required: ["role", "content"],
											properties: {
												role: { type: "string", enum: ["user", "assistant"] },
												content: { type: "string" },
											},
										},
									},
								},
							},
						},
					},
				},
				responses: {
					"200": {
						description: "Assistant reply (+ matches when a need was searched)",
						content: { "application/json": { schema: { type: "object" } } },
					},
					"429": { description: "Rate limited" },
					"503": {
						description: "AI backend unavailable",
						content: { "application/json": { schema: { type: "object" } } },
					},
				},
			},
		},
		"/api/partners/onboard": {
			post: {
				operationId: "partnerOnboard",
				tags: ["Partners"],
				summary: "AI onboarding helpers: interview chat + profile extraction",
				description:
					"Two modes for the get-listed flow. `{mode:'chat', messages}` → interview-style reply for a company describing itself. `{mode:'extract', messages}` → structures the transcript into partner-profile `fields` (tagline, services, sectors, regions, contact…; null where nothing was stated — nothing invented). 503 `unavailable:true` without AI configured. **Use when:** turning a get-listed conversation into structured profile fields (then submit via POST /api/partners/submit-listing). **Not for:** finding partners → /api/partners/match or /assistant.",
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["mode", "messages"],
								properties: {
									mode: { type: "string", enum: ["chat", "extract"] },
									messages: {
										type: "array",
										items: {
											type: "object",
											required: ["role", "content"],
											properties: {
												role: { type: "string", enum: ["user", "assistant"] },
												content: { type: "string" },
											},
										},
									},
								},
							},
						},
					},
				},
				responses: {
					"200": {
						description: "`{reply}` (chat mode) or `{fields}` (extract mode)",
						content: { "application/json": { schema: { type: "object" } } },
					},
					"429": { description: "Rate limited" },
					"503": {
						description: "AI backend unavailable",
						content: { "application/json": { schema: { type: "object" } } },
					},
				},
			},
		},
		"/api/partners/submit-listing": {
			post: {
				operationId: "submitPartnerListing",
				"x-side-effecting": true,
				tags: ["Partners"],
				summary: "Submit a new-partner listing (or claim an existing one)",
				description:
					"Submits a company for directory listing. New companies become a DRAFT partner account reviewed by the Stellar Light team before publication (publishing emails the contact an account invite). If the company is already listed, the submission is recorded as a CLAIM REQUEST on the existing profile instead — no duplicates. Returns `{ok:true, mode:'draft'|'claim'}`. Rate-limited; contactEmail becomes the account login. **Use when:** completing a get-listed flow (fields usually come from /api/partners/onboard extract). **Not for:** editing an existing claimed profile → the partner dashboard.",
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["orgName", "contactEmail"],
								properties: {
									orgName: { type: "string", minLength: 2, maxLength: 120 },
									contactEmail: {
										type: "string",
										format: "email",
										description: "Becomes the partner account login",
									},
									fields: {
										type: "object",
										description:
											"Profile fields (typically the /api/partners/onboard extract output)",
									},
								},
							},
						},
					},
				},
				responses: {
					"200": {
						description: "`{ok:true, mode:'draft'|'claim'}`",
						content: { "application/json": { schema: { type: "object" } } },
					},
					"400": {
						description: "Missing/invalid orgName or contactEmail",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ErrorResponse" },
							},
						},
					},
					"429": { description: "Rate limited" },
				},
			},
		},
		"/api/rfps": {
			get: {
				operationId: "getRfps",
				tags: ["Funding"],
				summary: "List Stellar RFPs (SCF-funded sponsor briefs)",
				description:
					"Curated Stellar RFPs / sponsor briefs (mirrors /ideas) — open briefs are fundable in the current SCF round; closed ones are past rounds kept for context. Response carries open/closed counts, the activeQuarter, and the live SCF round + submission window (`meta.scfRound`). Answers 'what does the ecosystem want built'. Not for how-to-apply / SCF Handbook knowledge → use searchResearch.",
				"x-routing": {
					purpose:
						"Open/closed Stellar RFPs, sponsor briefs, and the live SCF round submission window.",
					keywords: [
						"rfp",
						"rfps",
						"sponsor brief",
						"briefs",
						"bounty",
						"bounties",
						"grant",
						"grants",
						"scf",
						"funding opportunity",
						"quarter",
						"round",
						"submission deadline",
						"open",
						"closed",
						"kelp",
						"hummingbot",
					],
					useWhen: [
						"what RFPs/bounties/grants match my idea / are open",
						"what is the SCF funding asking for this quarter / what does the ecosystem want built",
						"is there a sponsor brief for X I could get funded to build / where can I get an SCF grant",
						"which SCF round is currently open for submissions and its deadline",
						"whether a past RFP (e.g. the Kelp / Hummingbot one) is closed or can still be applied to; the post-submission review lifecycle",
					],
					notFor: [
						"projects already BUILT/funded -> searchProjects",
						"hackathons + their prizes -> getHackathons",
						"how-to / SCF Handbook / standards knowledge -> searchResearch",
					],
					exampleQuestions: [
						"What RFPs are open this quarter?",
						"Is there a sponsor brief for X I could get funded to build?",
						"Which SCF round is open and when does it close?",
					],
				},
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
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										meta: {
											type: "object",
											properties: {
												activeQuarter: { type: "string" },
												counts: {
													type: "object",
													description:
														"total/open/closed count curated BRIEFS only; matched/returned count result ROWS, which also include synthetic scf-round rows — so open=5 with returned=6 is consistent, not a discrepancy (sls-045). See countBasis.",
													properties: {
														total: { type: "integer" },
														open: { type: "integer" },
														closed: { type: "integer" },
														matched: { type: "integer" },
														returned: { type: "integer" },
														syntheticRounds: {
															type: "integer",
															description:
																"Synthetic scf-round rows in the returned page (rowType 'scf-round').",
														},
													},
												},
												countBasis: {
													type: "string",
													description:
														"Plain-language statement of what each count counts and how to count briefs (filter rowType === 'rfp').",
												},
												scfRound: {
													type: "object",
													description:
														"SCF round identity + submission window (curated — SCF publishes no machine-readable round feed): fields are null when unconfirmed rather than guessed. Always cite asOf alongside answers built on this.",
													properties: {
														currentRound: {
															type: "integer",
															nullable: true,
															description:
																"Round currently open for submissions; null when no round is confirmed open as of asOf.",
														},
														lastConfirmedRound: {
															type: "integer",
															nullable: true,
														},
														lastConfirmedRoundNote: {
															type: "string",
															nullable: true,
														},
														submissionWindow: {
															type: "object",
															properties: {
																opens: {
																	type: "string",
																	format: "date",
																	nullable: true,
																},
																closes: {
																	type: "string",
																	format: "date",
																	nullable: true,
																},
															},
														},
														asOf: { type: "string", format: "date" },
														verifyAt: { type: "string", format: "uri" },
													},
												},
											},
										},
										rfps: {
											type: "array",
											items: { $ref: "#/components/schemas/Rfp" },
										},
										funding: {
											type: "string",
											description:
												"Funding-context sentence for the whole list: winners of OPEN RFPs are eligible for SCF grant funding in the current round; closed RFPs are past rounds, surfaced for context but no longer fundable.",
										},
									},
								},
							},
						},
					},
				},
			},
		},
		"/api/audits": {
			get: {
				operationId: "listAudits",
				tags: ["Research"],
				summary: "Enumerable registry of Stellar security-audit reports",
				description:
					"One row per security-audit report from stellarsecurityportal.com — the structured, enumerable half of the audit corpus (full report text is chunk-served by searchResearch with source=audit). Rows carry a normalized auditor, publication date, and a hand-verified link to the directory project (`projectSlug`). Semantics: a project ABSENT here has no audit on record at our source — NOT a claim it is unaudited; `findingsTotal`/`severityCounts` null = not extracted, NOT zero. Unknown query params are rejected with 400, never silently ignored.",
				"x-routing": {
					purpose:
						"List/filter security-audit reports as structured rows: which audits exist, for which project, by which firm, when.",
					keywords: [
						"audit",
						"audits",
						"audit report",
						"security audit",
						"audited",
						"auditor",
						"ottersec",
						"certora",
						"code4rena",
						"veridise",
						"halborn",
						"which projects are audited",
						"audit history",
					],
					useWhen: [
						"'list all audits for project X' / 'is X audited' (with the absence caveat)",
						"'what has firm Y audited on Stellar'",
						"enumerating or counting the audit corpus, newest-first audit activity",
					],
					notFor: [
						"what a specific audit FOUND (findings text, vulnerabilities discussed) -> searchResearch with source=audit",
						"security incidents/exploits that happened in production -> searchResearch with source=incident",
					],
					exampleQuestions: [
						"Which audit firms have reviewed Blend?",
						"List the OtterSec audits of Stellar projects",
						"What are the newest Soroban audits?",
					],
				},
				parameters: [
					{
						name: "project",
						in: "query",
						description: "Directory project slug (exact), e.g. blend",
						schema: { type: "string" },
					},
					{
						name: "auditor",
						in: "query",
						description:
							"Auditor firm, case/homoglyph-insensitive exact match (e.g. OtterSec)",
						schema: { type: "string" },
					},
					{
						name: "q",
						in: "query",
						description: "Substring match on title / protocol / project name",
						schema: { type: "string" },
					},
					{
						name: "since",
						in: "query",
						description:
							"Only reports published on/after this date (YYYY-MM-DD)",
						schema: { type: "string", format: "date" },
					},
					{
						name: "limit",
						in: "query",
						description: "Max rows (default 100, max 100)",
						schema: { type: "integer", minimum: 1, maximum: 100, default: 100 },
					},
					{
						name: "offset",
						in: "query",
						description: "Pagination offset",
						schema: { type: "integer", minimum: 0, default: 0 },
					},
				],
				responses: {
					"200": {
						description:
							"Audit registry rows (meta.counts.total = corpus size; meta.counts.matched = after filters)",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										meta: { $ref: "#/components/schemas/Meta" },
										audits: {
											type: "array",
											items: { $ref: "#/components/schemas/Audit" },
										},
									},
								},
							},
						},
					},
					"400": {
						description:
							"Unknown parameter or invalid value (params are never silently ignored)",
						content: { "application/json": { schema: { type: "object" } } },
					},
				},
			},
		},
		"/api/research": {
			get: {
				operationId: "searchResearch",
				tags: ["Research"],
				summary: "Vector search over the Stellar research corpus",
				description:
					"Semantic search over the Stellar knowledge corpus — SDF blog, SCF Handbook, SEPs/standards, dev docs, papers, audits, incident reports. Returns cited text chunks with source, section, URL, confidence, and provenance dates (`publishedAt` = the source's own stated date; `observedAt` = when ingest last crawled the page; audits add auditor/severity — filterable; report-level enumeration → listAudits). THE surface for 'how does X work', 'what does the SEP/spec/audit say', and how-to/feasibility questions. Not for products and their funding/status → use searchProjects.",
				"x-routing": {
					purpose:
						"Cited knowledge/docs answers from the Stellar research corpus ($vectorSearch over Voyage embeddings; BM25-lite keyword fallback when vectors are unavailable).",
					keywords: [
						// sls-052: SDF-organizational question family
						"SDF",
						"Stellar Development Foundation",
						"enterprise fund",
						"mandate",
						"organizational structure",
						"leadership",
						"chief scientist",
						"roadmap",
						"grants program",
						"sep",
						"seps",
						"cap",
						"standards",
						"dev docs",
						"documentation",
						"whitepaper",
						"stellar consensus protocol",
						"scp",
						"sdf",
						"stellar development foundation",
						"scf handbook",
						"scf proposals",
						"lumenloop",
						"ec research",
						"security",
						"bug bounty",
						"hackerone",
						"immunefi",
						"security program",
						"responsible disclosure",
						"vulnerability disclosure",
						"security audit",
						"exploit",
						"hack",
						"incident",
						"post-mortem",
						"oracle manipulation",
						"yieldblox",
						"reflector",
						"reentrancy",
						"soroban-sdk security advisories",
						"cve",
						"denial-of-service",
						"instance-storage growth",
						"authorization recursion",
						"compliance",
						"regulation",
						"travel rule",
						"fatf",
						"kyc",
						"aml",
						"bsa",
						"sanctions",
						"humanitarian aid",
						"unhcr ukraine",
						"scf v7.0",
						"award tiers",
						"grant programs",
						"build award",
						"instawards",
						"liquidity award",
						"public goods award",
						"security audit reports",
						"audit findings",
						"what did the audit find",
						"vulnerabilities found",
						"eligibility",
						"review timeline",
						"prescreen",
						"panel review",
						"community vote",
						"submission deadlines",
						"neural quorum governance",
						"community voting",
						"quorum",
						"ambassador program",
						"regional chapters",
						"india",
						"bootcamps",
						"soroban mainnet launch",
						"protocol 20",
						"xlm initial supply",
						"sdf enterprise fund",
						"sdf mandate",
						"asset listing",
						"exchanges",
						"aggregators",
						"contract source verification",
						"release.yml",
						"stellar lab",
						"stellar.expert",
					],
					useWhen: [
						"SDF organizational questions (enterprise fund, mandate, leadership, structure)",
						"'how does X work', 'is X possible / has X been discussed on Stellar', 'what does the SEP/spec/audit say about X'",
						"primary-source citations for a thesis or design question; ecosystem KNOWLEDGE & explainer questions ('what is / how does / who / why / is it true that…')",
						"security & risk (audits, exploits, incidents, post-mortems, oracle manipulation), bug-bounty / disclosure program status (source=security-program: which program is current, HackerOne vs Immunefi, where to report), compliance & regulation (Travel Rule, FATF, KYC/AML, sanctions)",
						"SDF's canonical organizational pages (source=sdf-org): mandate incl. self-funded/pays-taxes structure, terms of service / Delaware non-profit legal form, foundation mission, leadership & board roster, Enterprise Fund scope & portfolio size, quarterly-reports index",
						"funding & governance (SCF v7.0, award tiers, Neural Quorum Governance) and SCF program mechanics — how to apply step-by-step, Build/Instawards/Liquidity/Public-Goods awards, eligibility, review timeline (prescreen, panel review, community vote, KYC), deadlines",
						"SDF org/mission/legal structure; protocol history (SCP whitepaper, authors); ecosystem programs (ambassadors, regional chapters, bootcamps)",
						"Soroban security incidents (reentrancy, sdk advisories/CVEs, DoS); ecosystem history (Protocol 20 mainnet launch, XLM initial supply, UNHCR aid, Enterprise Fund)",
						"making an issued asset tradable/visible on exchanges, wallets, explorers, aggregators; contract source verification (release.yml, Stellar Lab vs stellar.expert); fact-checking a claim about Stellar",
					],
					notFor: [
						"what products exist or their funding/status -> searchProjects",
						"GitHub source code ranked by quality -> searchRepos",
					],
					exampleQuestions: [
						"What is the SDF enterprise fund and what is its mandate?",
						"How does the Stellar Consensus Protocol work?",
						"What does the SCF Handbook say about award tiers?",
						"Has there been a reentrancy incident on Soroban?",
						"How do I apply for an SCF Build Award?",
						"How do I make my issued asset visible on exchanges and explorers?",
					],
				},
				parameters: [
					{
						name: "q",
						in: "query",
						description:
							"Natural-language search query. Required unless the `query` alias is supplied — requests with neither return 400.",
						schema: { type: "string", minLength: 2 },
					},
					{
						name: "query",
						in: "query",
						description:
							"Alias of `q` (agents commonly send the term under this name; both are accepted, `q` wins when both are present).",
						schema: { type: "string", minLength: 2 },
					},
					{
						name: "source",
						in: "query",
						description:
							"Optional source filter. Use 'audit' for security questions, 'incident' for exploit/post-mortem history, 'security-program' for bug-bounty / vulnerability-disclosure program status (which program is current, where to report), 'sdf-org' for SDF's canonical organizational pages (mandate, legal structure/terms, foundation, team, enterprise fund, quarterly-reports index), 'ec-developer-report' for ecosystem stats, 'paper' for foundational protocol questions, 'release' for stellar-core/CLI/SDK release notes (what shipped, when — protocol upgrade tags).",
						schema: {
							type: "string",
							enum: [
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
							],
						},
					},
					{
						name: "auditor",
						in: "query",
						description:
							"Audit-metadata filter: exact auditor firm (case/homoglyph-insensitive, e.g. OtterSec, Certora). Using any audit-metadata filter scopes RETRIEVAL to source=audit (an explicit contradictory source= is rejected with 400). For report-level enumeration prefer listAudits.",
						schema: { type: "string" },
					},
					{
						name: "protocol",
						in: "query",
						description:
							"Audit-metadata filter: audited protocol/codebase name (substring match). Narrows results to audit-source chunks.",
						schema: { type: "string" },
					},
					{
						name: "severity",
						in: "query",
						description:
							"Audit-metadata filter, case-insensitive. CAVEAT: severity labels the MATCHED CHUNK's section (inferred from PDF-derived headings), not the report or a specific finding \u2014 an architecture chunk can carry 'high' while the findings table reads 'unknown' — do not treat a filtered result set as a complete list of findings at that severity. Unknown values are rejected with a 400.",
						schema: {
							type: "string",
							enum: [
								"critical",
								"high",
								"medium",
								"low",
								"informational",
								"unknown",
							],
						},
					},
					{
						name: "limit",
						in: "query",
						description: "Max results (default 8, max 25)",
						schema: { type: "integer", minimum: 1, maximum: 25, default: 8 },
					},
					{ $ref: "#/components/parameters/fields" },
				],
				responses: {
					"200": {
						description: "Research results",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										meta: { $ref: "#/components/schemas/Meta" },
										results: {
											type: "array",
											items: { $ref: "#/components/schemas/ResearchResult" },
										},
									},
								},
							},
						},
					},
				},
			},
		},
		"/api/skills": {
			get: {
				operationId: "listSkills",
				tags: ["Skills"],
				summary: "List AI skills for Stellar builders",
				description:
					"Catalog of installable Stellar AI skills/tools — SDF's official skills.stellar.org set merged with curated and community entries. Each entry carries an `install` command, `kind` (skill-md | mcp-server | sdk | cli | agent-kit | tool), and repo/docs links; filter by `source`/`kind`. Answers 'what Stellar AI skills / MCP servers can I install'. Not for ONE named skill's full content → use getSkill.",
				"x-routing": {
					purpose:
						"Browse installable Stellar AI skills, MCP servers, SDKs, CLIs, and agent kits.",
					keywords: [
						"skill",
						"skills",
						"ai skills",
						"mcp",
						"mcp server",
						"sdk",
						"cli",
						"agent kit",
						"tool",
						"install",
						"installable",
						"skill-md",
						"skills.stellar.org",
						"marketplace",
						"catalog",
					],
					useWhen: [
						"what Stellar AI skills / MCP servers / SDKs can I install",
						"is there a skill for soroban / anchors / payments",
						"matching a builder's idea to the right installable tool",
					],
					notFor: [
						"the full SKILL.md text or install details of ONE named skill -> getSkill",
						"built/funded products in the ecosystem (not installable agent skills) -> searchProjects",
						"GitHub source repos -> searchRepos",
						"docs/standards/how-to knowledge -> searchResearch",
					],
					exampleQuestions: [
						"What MCP servers exist for Stellar?",
						"Is there a skill for anchors?",
					],
				},
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
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										meta: { $ref: "#/components/schemas/Meta" },
										skills: {
											type: "array",
											items: { $ref: "#/components/schemas/Skill" },
										},
									},
								},
							},
						},
					},
				},
			},
		},
		"/api/skills/{name}": {
			get: {
				operationId: "getSkill",
				tags: ["Skills"],
				summary: "Get one skill's full content",
				description:
					"Full detail for ONE skill by slug or display name — metadata plus, for SDF official skills, the complete raw SKILL.md text (`.skill.content`, fetched live from skills.stellar.org). 404s with a hint to list /api/skills when unknown. Use when you know the skill and need its actual instructions or install command. Not for discovering which skills exist → use listSkills.",
				"x-routing": {
					purpose:
						"One skill's full SKILL.md content, metadata, and install command.",
					keywords: [
						"skill content",
						"skill.md",
						"install command",
						"instructions",
						"agentic payments",
						"soroban skill",
						"stellar-scout",
					],
					useWhen: [
						"you already know a skill name and need its actual instructions / install command / SKILL.md body to follow or quote",
					],
					notFor: [
						"browsing or discovering which skills exist -> listSkills",
						"conceptual docs or standards behind a topic (not a packaged skill) -> searchResearch",
					],
					exampleQuestions: [
						"Show me the SKILL.md for agentic-payments",
						"How do I install the soroban skill?",
					],
				},
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
				operationId: "getClusters",
				tags: ["Analytics"],
				summary: "Topic clusters with crowdedness scores",
				description:
					"Groups the active Stellar project directory into topic clusters scored on crowdedness (1–10, log-scaled) — the market-map view of saturated vs underbuilt lanes, i.e. WHERE TO BUILD. Per cluster: size, SCF funding, hackathon winners, sample projects; `dimension=category|types`. Answers 'what's crowded / where is whitespace'. Not for looking up a named project → use searchProjects.",
				"x-routing": {
					purpose:
						"Category crowdedness / whitespace analysis over the project directory.",
					keywords: [
						"crowded",
						"crowdedness",
						"saturated",
						"underbuilt",
						"whitespace",
						"opportunity gap",
						"where to build",
						"market map",
						"category counts",
						"clusters",
						"room to build",
						"competition",
						"wallets",
						"dex",
						"lending",
						"rwa",
						"oracle",
						"nft",
						"anchors",
						"defi",
					],
					useWhen: [
						"what's the most crowded category on Stellar / which categories are crowded",
						"show me an underbuilt/whitespace area / where is the competition thin",
						"how many projects (or SCF-funded projects) are in RWA vs wallets / per category",
						"'where should I build' opportunity-gap questions across the project directory",
					],
					notFor: [
						"ranking the top projects/repos by stars or activity -> getLeaderboard",
						"ecosystem-wide totals (events + funding + status funnel) -> analyzeEcosystem",
						"finding/looking up an actual named project in a category -> searchProjects",
					],
					exampleQuestions: [
						"What's the most crowded category on Stellar?",
						"How many projects are in RWA vs wallets?",
						"Where is there room to build?",
					],
				},
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
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										meta: {
											type: "object",
											properties: {
												population: {
													$ref: "#/components/schemas/PopulationScope",
												},
											},
										},
										clusters: {
											type: "array",
											items: { $ref: "#/components/schemas/Cluster" },
										},
									},
								},
							},
						},
					},
				},
			},
		},
		"/api/analyze": {
			get: {
				operationId: "analyzeEcosystem",
				tags: ["Analytics"],
				summary: "Cross-event Stellar ecosystem analytics rollup",
				description:
					"The cross-ecosystem macro rollup — totals no single-event tool answers: hackathon totals, SCF funding distributed (per-round + the Built/In-Progress/Abandoned funnel), per-category distribution, and the DeFi TVL rollup (DefiLlama-sourced, as-of dated, directory-scoped). Slice via `dimension=hackathons|categories|funding|tvl`. Not for per-category crowdedness/whitespace → use getClusters.",
				"x-routing": {
					purpose:
						"Ecosystem-wide macro totals: hackathons, SCF funding, category distribution, TVL.",
					keywords: [
						"total",
						"totals",
						"overall",
						"aggregate",
						"macro stats",
						"ecosystem-wide",
						"state of",
						"prize money",
						"prize pools",
						"totalPrizePoolUSD",
						"registered hackers",
						"scf funding distributed",
						"mean award",
						"per-round breakdown",
						"status funnel",
						"built vs abandoned",
						"category distribution",
						"project counts by category",
						"tvl",
						"defi tvl",
						"defillama",
						"top protocols by tvl",
					],
					useWhen: [
						"what's the overall state of Stellar hackathons/grants",
						"total SCF funding distributed / mean award size",
						"how much prize money across all hackathons (totalEvents, prize pools, registered hackers — live from DoraHacks)",
						"how many projects get built vs abandoned after hackathons",
						"total/top DeFi TVL on Stellar (DefiLlama-tracked protocols only — undercounts chain-wide TVL; as-of dated, never an exact to-the-dollar live figure)",
					],
					notFor: [
						"crowdedness or whitespace per category -> getClusters",
						"a ranked list of top/active projects -> getLeaderboard",
						"one specific hackathon's details -> getHackathon",
						"comparing two hackathons head-to-head -> compareHackathons",
					],
					exampleQuestions: [
						"How much SCF funding has been distributed in total?",
						"What's the total prize money across all Stellar hackathons?",
						"What's the total DeFi TVL on Stellar?",
					],
				},
				parameters: [
					{
						name: "dimension",
						in: "query",
						description: "Which slice to return",
						schema: {
							type: "string",
							enum: ["all", "hackathons", "categories", "funding", "tvl"],
							default: "all",
						},
					},
				],
				responses: {
					"200": {
						description: "Analytics rollup",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										meta: {
											type: "object",
											properties: {
												population: {
													$ref: "#/components/schemas/PopulationScope",
												},
											},
										},
										funding: {
											type: "object",
											description:
												"Present for dimension=all|funding. Carries computedAt, methodologyVersion, countBasis, byRound — and projectSetHash (sls-044): a stable sha256-prefix digest of the sorted awarded-project slug set. Same hash across your snapshots ⇒ same project SET (only amounts/labels can differ); different hash ⇒ membership changed (adds/removals/reclassifications) — the honest explanation for a moving cumulative total under an unchanged methodology. #520 delta provenance: snapshotAsOf / previousSnapshot / snapshotDelta make the set change ANSWER-VISIBLE — which slugs were added/removed vs the preceding persisted snapshot and mechanical reason codes for removals; deltaBasis documents the semantics and deltaUnavailable states explicitly when the comparison cannot be served (no differing prior snapshot yet, or store unavailable).",
											properties: {
												projectSetHash: { type: "string" },
												snapshotAsOf: {
													type: "string",
													format: "date-time",
													nullable: true,
													description:
														"When the CURRENT projectSetHash was first observed (persisted snapshot time). computedAt is when THIS response was computed; snapshotAsOf dates the set state.",
												},
												previousSnapshot: {
													type: "object",
													nullable: true,
													description:
														"The most recent persisted snapshot with a DIFFERENT project set. Null when none exists yet (see deltaUnavailable).",
													properties: {
														projectSetHash: { type: "string" },
														computedAt: {
															type: "string",
															format: "date-time",
															nullable: true,
														},
														scfAwardedProjects: {
															type: "integer",
															nullable: true,
														},
														scfTotalDistributedUSD: {
															type: "number",
															nullable: true,
														},
													},
												},
												snapshotDelta: {
													type: "object",
													nullable: true,
													description:
														"Membership diff: this response's awarded set vs previousSnapshot's. Null when previousSnapshot is null (deltaUnavailable says why).",
													properties: {
														addedProjects: {
															type: "array",
															items: { type: "string" },
															description:
																"Slugs in the current set but not the previous snapshot.",
														},
														removedProjects: {
															type: "array",
															items: { type: "string" },
														},
														addedCount: { type: "integer" },
														removedCount: { type: "integer" },
														totalUSDDelta: {
															type: "number",
															description:
																"This response's scfTotalDistributedUSD minus the previous snapshot's.",
														},
														removedReasons: {
															type: "array",
															description:
																"Per removed slug, a MECHANICAL reason from the record's current state — never a guess.",
															items: {
																type: "object",
																properties: {
																	slug: { type: "string" },
																	reason: {
																		type: "string",
																		enum: [
																			"dedupe",
																			"eligibility-reclassification",
																			"source-correction",
																			"unknown",
																		],
																		description:
																			"'dedupe' = record now points at a canonical slug (duplicate merged); 'eligibility-reclassification' = record left the active status pool; 'source-correction' = scf.awarded corrected to false; 'unknown' = record missing or no mechanical signal.",
																	},
																},
															},
														},
													},
												},
												deltaUnavailable: {
													type: "string",
													nullable: true,
													description:
														"Non-null when snapshotDelta cannot be served, stating WHY (no differing prior snapshot recorded yet, or snapshot store unavailable) — an explicit reason, never a silent omission.",
												},
												deltaBasis: { type: "string" },
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
		"/api/leaderboard": {
			get: {
				operationId: "getLeaderboard",
				tags: ["Ecosystem"],
				summary: "Stellar ecosystem developer activity",
				description:
					"Ranked list of active Stellar projects (`sort=activity|stars|issues` over a `range`; `category` filter; `format=csv`) with per-project GitHub rollups, plus an Electric Capital dev-count macro block. `meta.metricDefinitions` defines each served metric — activity = latest-commit recency (NOT commit volume); issues = open backlog (not activity). Ranks PROJECTS, not people → use getBuilders.",
				"x-routing": {
					purpose:
						"Ranked active-project leaderboard + Electric Capital ecosystem developer stats. Population = EVERY Live/Development/Pre-Release project with its indexed-repo rollup (default range=all); absence from the top-N means ranked below N or no indexed repos — never a liveness verdict.",
					keywords: [
						// sls-052: repo-health question family
						"open issues",
						"issue tracker",
						"issue backlog",
						"repo health",
						"repository health",
						"maintenance",
						"activity",
						"most active",
						"commits",
						"stars",
						"leaderboard",
						"top projects",
						"most active",
						"most starred",
						"stars",
						"recently shipped",
						"activity",
						"open issues",
						"backlog",
						"csv",
						"dune",
						"export",
						"developer counts",
						"active devs",
						"electric capital",
						"commits28d",
						"full-time",
						"part-time",
						"multichain",
						"repoCount",
					],
					useWhen: [
						"which projects have open issues / the biggest issue backlog",
						"repo health / maintenance / activity comparisons across projects",
						"who/what are the top/most-active Stellar projects",
						"most-starred projects; which projects shipped recently (last 30d)",
						"how many active Stellar devs / how does Stellar's dev activity look (EC 28-day active / Stellar-only / multichain splits)",
						"a CSV/Dune-style export of ranked projects (default top 50, max 300)",
					],
					notFor: [
						"category counts or crowded-vs-underbuilt whitespace -> getClusters",
						"ecosystem-wide hackathon/funding/status-funnel totals -> analyzeEcosystem",
						"a specific project's profile/funding/competitors -> searchProjects",
						"ranking individual developers (this ranks PROJECTS + an EC macro snapshot; it lists no named devs) -> getBuilders",
					],
					exampleQuestions: [
						"Which leaderboard projects have open issues?",
						"What are the most active Stellar projects in the last 30 days?",
						"How many active developers does Stellar have?",
						"Export the top 100 Stellar projects as CSV",
					],
				},
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
						name: "type",
						in: "query",
						description:
							"Filter to one or more granular project types — the same `types[]` taxonomy on project-search rows and echoed on each leaderboard row. Repeatable (`?type=DEX&type=Lending`) and comma-separable (`?type=DEX,Lending`); membership is EITHER (a project typed DEX OR Lending is kept), so you can build an explicit DEX/Lending-style grouping. Exact whole-element match, NOT substring. Unknown values return 400 with validTypes. Applied at the DB layer before ranking and limiting; `meta.filters.type` echoes the applied scope.",
						schema: {
							type: "array",
							items: {
								type: "string",
								enum: [
									"Wallet",
									"DEX",
									"Lending",
									"Bridge",
									"Infrastructure",
									"Payments",
									"Anchor",
									"SDK",
									"Indexer",
									"Explorer",
									"Analytics",
									"AI",
									"Gaming",
									"Education",
									"Security",
									"NFT",
									"RWA",
									"Stablecoin",
									"Social Impact",
									"RPC",
									"Faucet",
								],
							},
						},
						style: "form",
						explode: true,
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
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										meta: {
											type: "object",
											description:
												"Carries filters, metricDefinitions (what each served metric IS), generatedAt, and dataAsOf.",
											properties: {
												dataAsOf: {
													type: "string",
													format: "date-time",
													nullable: true,
													description:
														"sls-036: the repository-index rollup timestamp — the most recent index refresh across the repo rows this response aggregated. Every github.* number (stars/issues/lastActivityAt) is as-of THIS moment, not a live GitHub read. Distinct from generatedAt (response serialization time). Null when no indexed repos matched.",
												},
												metricDefinitions: {
													type: "object",
													additionalProperties: { type: "string" },
												},
											},
										},
										ecosystem: {
											type: "object",
											description:
												"Electric Capital Developer Report snapshot — ecosystem-wide developer activity. Dated numbers: always cite asOf (they are NOT live). stellarOnlyDevs28d + multichainDevs28d sum to activeDevs28d; fullTimeDevs + partTimeDevs + oneTimeDevs is the same 28-day-active population split by EC tenure class.",
											properties: {
												asOf: {
													type: "string",
													format: "date",
													description:
														"Snapshot date of the EC dataset every number below is as-of.",
												},
												activeDevs28d: {
													type: "integer",
													description:
														"Developers with commit activity in the trailing 28 days.",
												},
												stellarOnlyDevs28d: {
													type: "integer",
													description:
														"28-day active devs committing ONLY in the Stellar ecosystem.",
												},
												multichainDevs28d: {
													type: "integer",
													description:
														"28-day active devs also active in other ecosystems.",
												},
												commits28d: {
													type: "integer",
													description: "Total commits in the trailing 28 days.",
												},
												fullTimeDevs: { type: "integer" },
												partTimeDevs: { type: "integer" },
												oneTimeDevs: { type: "integer" },
											},
										},
										projects: {
											type: "array",
											items: {
												$ref: "#/components/schemas/LeaderboardProject",
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
		"/api/feedback": {
			get: {
				operationId: "getFeedbackSchema",
				tags: ["Feedback"],
				summary: "Get the feedback request schema (discovery)",
				description:
					"Returns the expected POST body shape + valid `kind` values, so an agent can self-discover how to submit feedback without guessing. No side effects. **Use when:** you're about to POST feedback and want the schema first — kind enum, required fields, size limits. **Not for:** actually submitting feedback → POST /api/feedback; browsing what's been reported → not exposed (curator queue is private).",
				responses: {
					"200": {
						description: "Feedback request schema",
						content: { "application/json": { schema: { type: "object" } } },
					},
				},
			},
			post: {
				operationId: "submitFeedback",
				"x-side-effecting": true,
				tags: ["Feedback"],
				summary: "Submit feedback on Scout's output",
				description:
					"Send a feedback report when the skill returns wrong / missing / misleading information. Lands in the curator queue. Rate-limited to 6/min/IP (IP hashed with PAYLOAD_SECRET, never stored raw). **Use when:** a Scout query returned something wrong / stale / empty that you believe SHOULD exist — file it so the corpus/endpoint gets fixed. **Not for:** discovering the schema first → GET /api/feedback; reading data (this is a write endpoint) → use the relevant search endpoint.",
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
			fields: {
				name: "fields",
				in: "query",
				description:
					"Comma-separated top-level field names to return per row (e.g. fields=name,slug,tvlUSD), shrinking the payload. Case-insensitive. Each row's identity keys (id/slug/fullName/githubUsername/url/source, where present) are always included; unknown names are ignored, not rejected. Applies only to the rows array — meta is unaffected. Nested objects are selected whole (no dot-paths).",
				schema: { type: "string" },
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
							semantic: {
								type: "integer",
								minimum: 0,
								description:
									'projects/search only: rows in this page served by the vector-similarity fallback rather than a keyword match (each tagged via:"semantic"; included in returned/total). Lets a consumer separate keyword truth from similarity guesses.',
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
			Audit: {
				type: "object",
				description:
					"One security-audit report row from the /api/audits registry. Null semantics: projectSlug null = the audited codebase has no directory project (NOT 'unaudited'); findingsTotal/severityCounts null = not extracted, NOT zero.",
				properties: {
					reportId: {
						type: "integer",
						description: "stellarsecurityportal.com report id (natural key)",
					},
					title: { type: "string" },
					reportUrl: { type: ["string", "null"] },
					auditor: {
						type: ["string", "null"],
						description: "Normalized auditor firm (canonical casing)",
					},
					protocol: {
						type: ["string", "null"],
						description: "Audited protocol/codebase name as published",
					},
					projectSlug: {
						type: ["string", "null"],
						description:
							"Verified directory-project link; null = no directory project for this codebase (NOT 'unaudited')",
					},
					projectName: { type: ["string", "null"] },
					linkBasis: {
						type: ["string", "null"],
						description:
							"Provenance of the project link: name-exact | alias | unmatched (verified no-match); null = not yet triaged",
					},
					publishedAt: { type: ["string", "null"], format: "date-time" },
					dateBasis: {
						type: ["string", "null"],
						description:
							"published = real date-stamp; portal-record = wall-clock portal timestamp (likely upload time) — not publication recency; null = pre-dateBasis row",
					},
					observedAt: {
						type: ["string", "null"],
						format: "date-time",
						description: "When our crawler last saw the report live",
					},
					findingsTotal: {
						type: ["integer", "null"],
						description:
							"Populated when the auditor's report format parses deterministically AND round-trips its own stated count (OtterSec, Veridise, Certora, Code4rena, Hacken). null = not extracted, NOT zero.",
					},
					severityCounts: {
						type: ["object", "null"],
						description:
							"{critical, high, medium, low, informational} counts, only for formats carrying per-finding severity that agrees with its finding-ID prefix (Certora tables, Code4rena tier headings). null = not extracted, NOT zero.",
					},
					chunksIndexed: {
						type: "integer",
						description:
							"Full-text chunks serving this report via /api/research?source=audit",
					},
				},
			},
			ResearchResult: {
				type: "object",
				description:
					"One ranked research chunk from /api/research (best chunk per document).",
				properties: {
					id: { type: "string" },
					source: { type: "string" },
					title: { type: "string" },
					section: { type: ["string", "null"] },
					url: { type: "string" },
					content: { type: "string" },
					chunkIndex: { type: "integer" },
					publishedAt: {
						type: ["string", "null"],
						description: "The source's own stated date",
					},
					observedAt: {
						type: ["string", "null"],
						description: "When ingest last crawled the page live",
					},
					auditor: {
						type: ["string", "null"],
						description: "Audit-source chunks only",
					},
					protocol: {
						type: ["string", "null"],
						description: "Audit-source chunks only",
					},
					severity: {
						type: ["string", "null"],
						description:
							"Audit-source chunks only; section-inferred and CHUNK-level (labels the matched chunk's section, not the report or a finding), 'unknown' for most PDF-derived chunks",
					},
					score: { type: ["number", "null"] },
					confidence: {
						type: "object",
						description:
							"0-1 trust signal: score, label (high/medium/low), relevance, freshness, authority, ageDays",
					},
				},
			},
			Partner: {
				type: "object",
				description:
					"An ecosystem partner (anchor, ramp, infrastructure, tooling, protocol, wallet, audit firm…). Partner-claimed facts and system-verified signals are SEPARATE fields — `verified` and `trust` are system-computed and cannot be self-reported; everything else is partner/curator-maintained.",
				properties: {
					slug: { type: "string" },
					name: { type: "string" },
					partnerType: {
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
					pilot: {
						type: "boolean",
						description:
							"Founding pilot-cohort partner (sorts first in unqueried lists).",
					},
					tagline: { type: "string", nullable: true },
					description: { type: "string", nullable: true },
					logoUrl: { type: "string", nullable: true },
					websiteUrl: { type: "string", nullable: true },
					foundedYear: { type: "integer", nullable: true },
					services: { type: "array", items: { type: "string" } },
					sectors: { type: "array", items: { type: "string" } },
					regions: { type: "array", items: { type: "string" } },
					assets: {
						type: "array",
						items: { type: "string" },
						description:
							"Asset codes this partner issues/supports (from stellar.toml or curated).",
					},
					seps: {
						type: "array",
						items: { type: "string" },
						description:
							"SEP standards implemented (sep-6, sep-24, sep-31). Empty with non-empty rampTypes = the ramp is a proprietary API, not SEP-based.",
					},
					rampTypes: {
						type: "array",
						items: { type: "string", enum: ["on-ramp", "off-ramp"] },
						description: "Fiat ramps offered.",
					},
					country: { type: "string", nullable: true },
					acceptingClients: { type: "boolean" },
					typicalEngagement: { type: "string", nullable: true },
					leadTime: { type: "string", nullable: true },
					pricingModel: { type: "string", nullable: true },
					pricingNotes: { type: "string", nullable: true },
					docsUrl: { type: "string", nullable: true },
					githubOrg: { type: "string", nullable: true },
					contactEmail: { type: "string", nullable: true },
					contactChannel: { type: "string", nullable: true },
					responseSla: { type: "string", nullable: true },
					caseStudies: { type: "array", items: { type: "object" } },
					verified: {
						type: "object",
						description:
							"SYSTEM-computed activity signals (never self-reported). All-null = not yet auto-verified, NOT a negative signal.",
						properties: {
							githubLastCommitAt: { type: "string", nullable: true },
							githubCommits90d: { type: "integer", nullable: true },
							onchainActive: { type: "boolean", nullable: true },
							onchainNote: { type: "string", nullable: true },
							scfInvolvement: { type: "string", nullable: true },
							lastAutoVerifyAt: { type: "string", nullable: true },
						},
					},
					freshness: {
						type: "object",
						description:
							"Profile freshness state machine (fresh → aging → stale → archived). Consumers should down-rank or skip partners with excludeFromMatching: true.",
						properties: {
							status: {
								type: "string",
								enum: ["fresh", "aging", "stale", "archived"],
							},
							lastPartnerUpdateAt: { type: "string", nullable: true },
							isCurrent: { type: "boolean" },
							excludeFromMatching: { type: "boolean" },
						},
					},
					trust: {
						type: "object",
						description:
							"System-computed composite trust (0-1 score + label), decomposed into freshness and verification sub-signals.",
						properties: {
							score: { type: "number" },
							label: { type: "string" },
							freshness: { type: "number" },
							verification: { type: "number" },
						},
					},
					url: {
						type: "string",
						description: "Canonical partner profile page on stellarlight.xyz.",
					},
				},
			},
			PartnersResponse: {
				type: "object",
				properties: {
					meta: { $ref: "#/components/schemas/Meta" },
					partners: {
						type: "array",
						items: { $ref: "#/components/schemas/Partner" },
					},
				},
			},
			PopulationScope: {
				type: "object",
				nullable: true,
				description:
					"sls-048: the population a quantitative response aggregated, made answer-visible. Identical `id`s across responses (e.g. analyze vs clusters) mean the numbers are mechanically comparable; different `id`s are DIFFERENT populations — never merge/sum them without labeling the scopes. `truncated: true` means the result is a sample of the population, not a census. Null when the underlying fetch failed.",
				properties: {
					id: {
						type: "string",
						description:
							"Stable digest of collection + filters (NOT count/time), e.g. 'projects|status:Development+Live+Pre-Release'. /api/status sources use 'projects|status:all' (full collection).",
					},
					basis: { type: "string" },
					statusScope: {
						type: "array",
						items: { type: "string" },
						nullable: true,
						description: "Status filter applied; null = no status filter.",
					},
					totalAvailable: {
						type: "integer",
						description:
							"Docs matching the scope in the DB at generation time.",
					},
					included: {
						type: "integer",
						description: "Docs actually aggregated into this response.",
					},
					truncated: {
						type: "boolean",
						description:
							"included < totalAvailable — the response is a sample, not the population.",
					},
					generatedAt: { type: "string", format: "date-time" },
				},
			},
			StatusResponse: {
				type: "object",
				required: ["ok", "service", "version", "generatedAt", "endpoints"],
				properties: {
					ok: { type: "boolean" },
					service: { type: "string", const: "Stellar Scout" },
					version: {
						type: "string",
						description: "Scout skill/service release line.",
					},
					apiVersion: {
						type: "string",
						description:
							"API contract (OpenAPI) version \u2014 equals /api/openapi.json info.version. Reason about the live contract from this rather than the service version.",
					},
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
								populationId: {
									type: "string",
									description:
										"Scope digest of what `count` counts (sls-048) — same format as meta.population.id on /api/analyze and /api/clusters. DB-backed sources here are `<collection>|status:all` (the FULL collection incl. Inactive), which is why projects.count is larger than analyze/clusters' active-only populations. Different ids = different populations: never merge or compare the numbers without labeling the scopes.",
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
						enum: ["Draft", "Development", "Pre-Release", "Live", "Inactive"],
						description:
							"Lifecycle status. 'Inactive' = defunct/archived (e.g. product shut down) — such projects stay name-searchable but are heavily down-ranked and excluded from the leaderboard/directory. Status describes the PROJECT/entity lifecycle, not proof that a specific product is deployed on Stellar mainnet — check statusAsOf/statusSourceUrl/statusBasis for the label's provenance, and supportedNetworks/description for deployment scope.",
					},
					statusAsOf: {
						type: "string",
						nullable: true,
						description:
							"When the current status value was last asserted/verified (ISO 8601). Null = undated legacy label — treat the status as source-relative, not freshly confirmed.",
					},
					statusSourceUrl: {
						type: "string",
						nullable: true,
						description:
							"Primary evidence URL behind the current status (operator announcement, checked product surface, on-chain probe). Null on legacy rows.",
					},
					statusBasis: {
						type: "string",
						nullable: true,
						// nullable carries the null case; a null literal in the enum crashes
						// Spectral's JSONPath engine (see scfAmountStatus).
						enum: [
							"operator-announcement",
							"site-liveness",
							"onchain-activity",
							"human-verified",
							"source-inherited",
						],
						description:
							"What kind of evidence backs the current status: 'operator-announcement' = the team/operator said so (can describe PLANS, not deployment — read statusAsOf + the description), 'site-liveness' = the product surface was checked, 'onchain-activity' = contract/network probe, 'human-verified' = owner-confirmed, 'source-inherited' = label carried from a seed source, unverified. Null = provenance not yet recorded.",
					},
					builtBy: {
						type: "object",
						nullable: true,
						description:
							"The organization/entity behind this project ('who built X') — e.g. LOBSTR → Ultra Stellar, Soroswap → Paltalabs. Null when no org is linked. Browse the org's portfolio at https://stellarlight.xyz/entities/{slug}.",
						properties: {
							name: { type: "string" },
							slug: { type: "string" },
						},
					},
					logoUrl: { type: "string", nullable: true },
					scfAwarded: { type: "boolean" },
					scfTotalAwardedUSD: { type: "number", nullable: true },
					scfAmountStatus: {
						type: "string",
						nullable: true,
						// No null literal in the enum: legal JSON Schema, but it crashes
						// Spectral's JSONPath engine (nimma) — openapi-lint CI was red for
						// 3 days on it. `nullable: true` already carries the null case.
						enum: ["disclosed", "undisclosed"],
						description:
							"Disambiguates a null award amount: 'undisclosed' = the SCF award is confirmed but no amount is published in the source data (NOT a data gap — do not guess); 'disclosed' = scfTotalAwardedUSD carries the number; null = not awarded.",
					},
					scfAwardedRounds: {
						type: "array",
						items: { type: "integer" },
						description:
							"SCF round numbers this project was awarded in (e.g. [2, 17, 22]), from official award pages. Rounds are authoritative; dollar TOTALS are in-house reconstructions (per-award amounts aren't published for all rounds) and can legitimately differ between aggregators — reconcile on rounds, not totals.",
					},
					coverage: {
						type: "object",
						nullable: true,
						description:
							"Structured corridor/coverage for Anchor-typed projects — answers 'which anchors serve currency/corridor X?' with filterable, dated fields instead of prose. Synced from the matching partner record; null for non-anchors or when no partner record matches.",
						properties: {
							countries: {
								type: "array",
								items: { type: "string" },
								description: "Primary market/jurisdiction country names.",
							},
							currencies: {
								type: "array",
								items: { type: "string" },
								description: "Fiat currencies supported (e.g. MXN, EUR, PHP).",
							},
							seps: {
								type: "array",
								items: { type: "string" },
								description:
									"Supported SEPs (sep-6, sep-24, sep-31) — the on/off-ramp interop surface.",
							},
							asOf: {
								type: "string",
								nullable: true,
								description:
									"Date (YYYY-MM-DD) the coverage was synced from the partner record — cite as the as-of date.",
							},
						},
					},
					supportedNetworks: {
						type: "array",
						items: { type: "string" },
						description:
							"Blockchain networks this project supports, lowercase (e.g. ['stellar','xrpl']), so a multichain wallet's omission of a chain isn't misread as a negative. Empty when unknown.",
					},
					routes: {
						type: "array",
						nullable: true,
						description:
							"sls-032: curated ROUTE-LEVEL bridge evidence for Bridge-typed records. A project hit alone is DISCOVERY-only — it never establishes that a specific transfer route exists, which direction is supported, or what the destination asset representation is (canonical Circle-issued USDC vs a bridged representation like USDC.axl). Each row here is a curator-verified route fact grounded in the provider's own docs (sourceUrl + asOf). Null = no curated route evidence (UNKNOWN, never 'no routes exist'). Quote-time facts (fees, live availability, current quotes) are intentionally NOT encoded — confirm those with the provider at transfer time.",
						items: {
							type: "object",
							required: ["fromChain", "toChain"],
							properties: {
								fromChain: {
									type: "string",
									description:
										"Source network, lowercase — same vocabulary as supportedNetworks ('evm' is the EVM umbrella).",
								},
								toChain: { type: "string" },
								direction: {
									type: "string",
									nullable: true,
									enum: ["one-way", "bidirectional"],
									description:
										"'bidirectional' = the reverse leg is also evidenced; 'one-way' = only fromChain→toChain is. Null = direction not verified.",
								},
								assets: {
									type: "array",
									items: { type: "string" },
									description:
										"Asset codes moved on this route (e.g. USDC). Empty = asset scope not curated (unknown, not none).",
								},
								assetRepresentation: {
									type: "string",
									nullable: true,
									enum: ["canonical", "wrapped", "bridged", "interchain"],
									description:
										"What the DESTINATION asset is: 'canonical' = issuer-native (e.g. Circle-issued USDC via CCTP burn-mint), 'wrapped'/'bridged'/'interchain' = a representation (e.g. USDC.axl). Null = quote-time/unverified — never assume canonical.",
								},
								mechanism: {
									type: "string",
									nullable: true,
									description:
										"Settlement mechanism, e.g. 'cctp-burn-mint', 'native-liquidity-pool', 'lock-mint', 'aggregator-router'.",
								},
								sourceUrl: {
									type: "string",
									nullable: true,
									description:
										"Provider source the route evidence was verified from.",
								},
								asOf: {
									type: "string",
									nullable: true,
									description:
										"YYYY-MM-DD the route evidence was verified — routes are dated facts, re-verify before relying on them for a live transfer.",
								},
							},
						},
					},
					venueRole: {
						type: "string",
						nullable: true,
						enum: [
							"amm",
							"native-orderbook",
							"aggregator-router",
							"trading-ui",
							"wallet-integrated",
						],
						description:
							"sls-035: role in the DEX/trading landscape. 'amm' and 'native-orderbook' are INDEPENDENT LIQUIDITY VENUES; 'aggregator-router' routes across venues and runs none; 'trading-ui' is an interface over other venues (e.g. the native SDEX); 'wallet-integrated' is trading embedded in a wallet. A DEX type/cluster count is a directory TAXONOMY count, not a competitor or venue count — count venueRole in ('amm','native-orderbook') for independent venues. Null = not yet classified (unknown, NOT 'not a venue').",
					},
					anchorProfile: {
						type: "object",
						nullable: true,
						description:
							"Integration-oriented ramp/anchor profile joined from the partner directory (Anchor-typed rows only; null otherwise). Complements `coverage`: rampTypes says WHAT ramps exist, seps says over WHICH interop surface — `seps: []` with non-empty rampTypes means a proprietary ramp API rather than SEP-6/24. EMPTY-FIELD SEMANTICS (sls-049): capability arrays fill only from VERIFIABLE sources (the anchor's stellar.toml / its own docs); when ALL of assets/seps/rampTypes are empty the anchor is `profileState: 'not-profiled'` — unknown, NOT capability-free. Never turn an empty array into a negative claim when the description asserts live corridors. `url` links the full partner profile.",
						properties: {
							slug: { type: "string" },
							country: { type: "string", nullable: true },
							regions: { type: "array", items: { type: "string" } },
							assets: { type: "array", items: { type: "string" } },
							seps: { type: "array", items: { type: "string" } },
							rampTypes: {
								type: "array",
								items: { type: "string", enum: ["on-ramp", "off-ramp"] },
							},
							asOf: { type: "string", nullable: true },
							url: { type: "string" },
							profileState: {
								type: "string",
								enum: ["profiled", "not-profiled"],
								description:
									"'profiled' = at least one capability field is verified-filled; 'not-profiled' = capabilities not yet verified for this anchor (empty arrays mean UNKNOWN, not absent).",
							},
						},
					},
					onchain: {
						type: ["object", "null"],
						description:
							"On-chain metrics from stellar.expert for hand-verified contract/asset join keys. null = not tracked in our registry — NEVER 'no on-chain activity'. contracts[]: {address, label, events, subinvocations, storageEntries, createdAt, verifiedRepo} — events and subinvocations are LIFETIME counts (a contract users call directly at top level can show low subinvocations despite heavy use; read events alongside). assetHolders = funded trustlines; assetSupply = whole asset units. From the second weekly snapshot, delta fields activate: per-contract eventsDelta/subinvocationsDelta, assetHoldersDelta, with prevAsOf + deltaDays defining the window — null deltas mean no prior snapshot yet, NOT zero activity. source + asOf date every payload.",
					},
					audits: {
						type: ["object", "null"],
						description:
							"Security-audit rollup from the /api/audits registry (hand-verified projectSlug links): {count, auditors[] (normalized firm names), latestAt (YYYY-MM-DD of the newest report)}. null = no audit on record at our source — NOT a claim the project is unaudited (same absence semantics as /api/audits). Full report rows via /api/audits?project=<slug>; findings text via searchResearch with source=audit.",
						properties: {
							count: { type: "integer" },
							auditors: { type: "array", items: { type: "string" } },
							latestAt: { type: ["string", "null"] },
						},
					},
					tvlUSD: {
						type: "number",
						nullable: true,
						description:
							"Total value locked in USD per DefiLlama, summed across the protocol's tracked components. null = NOT TRACKED on DefiLlama (never 'zero TVL'). Refreshed weekly; see tvlAsOf.",
					},
					tvlAsOf: {
						type: "string",
						nullable: true,
						description: "When tvlUSD was fetched from DefiLlama (ISO 8601).",
					},
					tvlSource: {
						type: "string",
						nullable: true,
						description:
							"Source that produced tvlUSD (e.g. 'defillama'). Null = legacy value predating provenance. Concurrent sources (operator site, DefiLlama, Dune) legitimately differ by pricing time and inclusion scope — cite tvlUSD as '<tvlSource> as of <tvlAsOf>', never as exact universal truth.",
					},
					tvlMethod: {
						type: "string",
						nullable: true,
						description:
							"How tvlUSD was computed (e.g. sum of the mapped DefiLlama protocol rows in llamaSlugs, USD at DefiLlama pricing time) — the inclusion-scope note that lets a consumer reconcile modest cross-source differences instead of calling them contradictions.",
					},
					llamaSlugs: {
						type: "array",
						nullable: true,
						items: { type: "string" },
						description:
							"sls-039: the curated DefiLlama protocol slugs whose rows SUM to tvlUSD (several per project — e.g. Blend = pools + backstops). The mapped-provider identifiers tvlMethod refers to: follow each as https://defillama.com/protocol/{slug} for the provider's own page and full TVL time series (history/peak/record live at the provider — this API serves the current dated point only). Null = not llama-mapped (matches tvlUSD null = not tracked).",
					},
					tvlMethodUrl: {
						type: "string",
						nullable: true,
						format: "uri",
						description:
							"sls-039: citation URL for the project's PRIMARY mapped DefiLlama protocol row (first of llamaSlugs) — the provider/method page to cite alongside tvlUSD. When llamaSlugs has multiple entries, tvlUSD sums ALL of them, so this page shows one component, not necessarily the whole sum — enumerate llamaSlugs for the full inclusion set. Null when not llama-mapped.",
					},
					canonicalSlug: {
						type: "string",
						nullable: true,
						description:
							"When this record is a known duplicate/rename, the slug of the CANONICAL record to prefer; null for canonical records themselves. Follow it before citing counts or funding.",
					},
					identity: {
						type: "object",
						nullable: true,
						description:
							"Rename continuity (sls-050). Present when this project has former names: aliases resolve to this record in search, and this block carries the provenance. Cite the CURRENT name; mention the alias when the user asked by it.",
						properties: {
							currentName: { type: "string" },
							aliases: { type: "array", items: { type: "string" } },
							renamedAt: {
								type: "string",
								format: "date",
								nullable: true,
								description: "When the current name took effect (if known).",
							},
							sourceUrl: { type: "string", nullable: true },
						},
					},
					lifecycle: {
						type: "object",
						nullable: true,
						description:
							"Historical-archive context, present only when a record carries real history (e.g. a defunct project that used to be live) — narrate as 'used to be live', not as a current offering. Null for ordinary live records.",
						properties: {
							wasLive: { type: "boolean" },
							note: { type: "string", nullable: true },
						},
					},
					hackathon: { type: "string", nullable: true },
					hackathonPlacement: { type: "string", nullable: true },
					placementRank: {
						type: "integer",
						nullable: true,
						description:
							"Numeric rank parsed from hackathonPlacement (1 = best), handling both digit ('1st Place') and word ('First Place') ordinals — or null when the source gives no ordinal (a flat 'Winners' bucket). winners[] is sorted by placementRank, so winners[0] is the 1st-place entry when the event has ranked placements; unranked winners (placementRank: null) sort last and their order is not significant. Sort/filter on placementRank instead of parsing the label.",
					},
					hackathonPrize: { type: "number", nullable: true },
					hackathonPrizeTrack: { type: "string", nullable: true },
					score: {
						type: "number",
						description:
							"Relevance score for the current query (higher = better match)",
					},
					confidence: {
						type: "object",
						nullable: true,
						description:
							"Blended confidence for this result: overall score (0-1) + label, decomposed into relevance / freshness / authority sub-signals (each 0-1) and ageDays.",
						properties: {
							score: { type: "number" },
							label: { type: "string" },
							relevance: { type: "number" },
							freshness: { type: "number" },
							authority: { type: "number" },
							ageDays: { type: "integer", nullable: true },
						},
					},
					repos: {
						type: "array",
						description:
							"This project\u2019s top indexed GitHub repos, surfaced inline (same shape as /api/repos/search items). Cite as the project\u2019s code references.",
						items: { $ref: "#/components/schemas/Repo" },
					},
					lastActivityAt: {
						type: "string",
						format: "date-time",
						nullable: true,
						description:
							"Most recent commit across the project's own indexed repos \u2014 attach as the as-of date for 'is this project active?' answers. Null = no indexed repo with a known commit date (an INDEX gap \u2014 e.g. a closed-source product), never 'no activity'.",
					},
					via: {
						type: "string",
						description:
							"How this result was matched: keyword (token/synonym overlap) or vector (semantic fallback).",
					},
					url: { type: "string", format: "uri" },
					prominence: {
						type: "number",
						description:
							"Editorial ranking boost (0-100); higher = more canonical for its category.",
					},
					verificationLevel: { type: "string", nullable: true },
					productKind: {
						type: "string",
						nullable: true,
						description:
							"sls-033/#519: curated product-kind for wallet-class records (hardware-wallet | mobile-app | browser-extension | web-app | protocol | sdk-kit). null = not-yet-classified (never a negative claim).",
					},
					availability: {
						type: "array",
						nullable: true,
						items: {
							type: "object",
							properties: {
								platform: { type: "string" },
								state: { type: "string" },
								storeUrl: { type: "string", nullable: true },
								checkedAt: { type: "string", nullable: true },
								note: { type: "string", nullable: true },
							},
						},
						description:
							"sls-033/#519: per-platform availability with as-of dates. null = not curated.",
					},
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
											"semantic",
											"all",
										],
										description:
											'Tier of match relaxation that produced these results. `semantic` means NO keyword tier matched — every row is a vector-similarity fallback guess (each tagged `via: "semantic"`, confidence capped at medium): verify relevance before relying on them.',
									},
									matchModeLabel: { type: "string" },
									anchorProfileBasis: {
										type: "string",
										description:
											"Present only when the page carries anchor rows (sls-049): empty-field semantics for the anchorProfile join — empty capability arrays mean not-yet-profiled (see each profile's profileState), never a negative capability claim.",
									},
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
					hackathons: {
						type: "array",
						items: { $ref: "#/components/schemas/Hackathon" },
					},
				},
			},
			HackathonDetailResponse: {
				type: "object",
				properties: {
					meta: { $ref: "#/components/schemas/Meta" },
					hackathon: { type: "object" },
					winners: {
						type: "array",
						description:
							"Winner entries. Ordering contract: placementRank is the ONLY per-entry ordering signal — never infer finishing order from array position; check winnersRanked first.",
						items: {
							type: "object",
							properties: {
								name: { type: "string" },
								hackathonPlacement: { type: "string", nullable: true },
								placementRank: { type: "integer", nullable: true },
								hackathonPrize: { type: "number", nullable: true },
							},
						},
					},
					winnersRanked: {
						type: "boolean",
						nullable: true,
						description:
							"Whether the winners array order is a ranking. true = ordinal placements (sorted by placementRank, winners[0] is 1st place); false = tier-labeled winners (all placementRank null — array order is meaningless, treat as an unordered set); null = no winners recorded.",
					},
					submissions: { type: "array", items: { type: "object" } },
					tracks: { type: "array", items: { type: "object" } },
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
					stellarEvidence: {
						type: "string",
						enum: ["code-verified", "sdf-org", "curated", "mentioned", "none"],
						description:
							"WHY this repo ranks as Stellar-relevant (sls-047) — ranking puts Stellar evidence ABOVE raw keyword score, and this names the tier: code-verified (scan found real Stellar/Soroban code) / sdf-org / curated (canonical or flagship map) / mentioned (stellar|soroban in its own name/topics/description/README) / none — a general-purpose toolchain or dependency with NO direct Stellar evidence. 'none' rows can still topic-match a query (e.g. a ZK language for q=zero-knowledge): treat them as toolchains, never cite them as Stellar reference implementations.",
					},
					codeVerified: {
						type: "object",
						nullable: true,
						description:
							"Code-verified truth from analyzing the repo's ACTUAL source (not stars/topics) — the discriminator between 'popular' and 'real, current, deep Soroban code'. Null until the repo has been code-scanned. Use to qualify an answer: prefer a deployable contract on a supported soroban-sdk over tooling that merely uses Stellar.",
						properties: {
							stellarProof: {
								type: "string",
								enum: [
									"cargo-sdk",
									"contract-macros",
									"lang-sdk",
									"js-sdk",
									"stellar-toml",
									"none",
								],
								description:
									"How we verified it's Stellar, strongest→weakest: cargo-sdk (soroban-sdk dep) / contract-macros (#[contract] usage) / lang-sdk (Swift/Kotlin/Go/Python Stellar SDK) / js-sdk / stellar-toml. 'none' = the repo WAS scanned and no direct Stellar code evidence was found (a scanned general-purpose dependency) — such repos rank below Stellar-evidenced ones and carry stellarEvidence 'none' unless their own text mentions Stellar.",
							},
							codeDepth: {
								type: "number",
								nullable: true,
								description:
									"0-1 substance of the actual contract code (auth/storage/arith/branch, not mere presence). ~0.6+ = a real, non-trivial contract; low = scaffold/template. Null for non-Rust proofs.",
							},
							isDeployableContract: {
								type: "boolean",
								description:
									"This repo's PRODUCT is a deployable Soroban contract (Cargo cdylib — vs a CLI/indexer/frontend that only uses Stellar). Known platform/SDK/tooling repos (stellar-core, rs-soroban-env, the SDKs/CLI/RPC…) are pinned FALSE even though they vendor cdylib crates — those are runtime/fixtures, not a deployable contract product (sls-046).",
							},
							sorobanSdkVersion: {
								type: "string",
								nullable: true,
								description:
									"Raw soroban-sdk version requirement (a sourced fact — never a bare protocol integer).",
							},
							versionStatus: {
								type: "string",
								enum: ["current", "supported", "deprecated", "unknown"],
								nullable: true,
								description:
									"soroban-sdk status vs the latest protocol at scan time. 'unknown' (rc/git/unpinned) never implies staleness.",
							},
							scannedAt: {
								type: "string",
								format: "date-time",
								nullable: true,
								description: "When the code was last scanned.",
							},
							symbols: {
								type: "array",
								items: { type: "string" },
								description:
									"Public code-symbol surface (pub fn/struct/enum/trait names) extracted from the scanned Rust sources — what the repo IMPLEMENTS (e.g. release_escrow, swap_exact_tokens). Also a search signal: queries match these. Empty for repos scanned before 2026-07-08 or non-Rust proofs.",
							},
							mainnetContractId: {
								type: "string",
								nullable: true,
								description:
									"README-claimed contract id VERIFIED to exist on Stellar mainnet at scan time (stellar.expert echo-check) — unfakeable deployment evidence. Null when no verified address.",
							},
							sdkCapabilities: {
								type: "array",
								items: { type: "string" },
								description:
									"Stellar SDK capability tags detected in the repo's JS/TS sources — what a dapp actually DOES with the SDK: tx-building, signing, soroban-rpc, contract-invoke, horizon, sep10-auth, sep24-ramp, wallet-kit, passkey, fee-bump. Closed tag set; [] = no JS sources analyzed yet or none detected (scan-dated, not a negative).",
							},
						},
					},
				},
			},
			RepoSearchResponse: {
				type: "object",
				required: ["meta", "repos"],
				properties: {
					meta: {
						allOf: [
							{ $ref: "#/components/schemas/Meta" },
							{
								type: "object",
								properties: {
									canonical: {
										type: "string",
										nullable: true,
										description:
											"The curated canonical SDF repo floated to the top for an infra/protocol query (e.g. error codes \u2192 stellar/stellar-core), or null when the query isn\u2019t a canonical-routed concept.",
									},
									note: {
										type: "string",
										description:
											"How to read the results (e.g. code references graded by repoScore 0-100).",
									},
								},
							},
						],
					},
					repos: {
						type: "array",
						items: { $ref: "#/components/schemas/Repo" },
					},
				},
			},
			Builder: {
				type: "object",
				description:
					"A builder profile row from /api/builders. Profile text (bio/roleTitle) is builder-claimed, NOT verified experience; when the request had a q/skill filter, `match` and `codeEvidence` carry the match provenance (sls-041). Nullable profile fields are null (or empty-string) when unset — never a negative claim.",
				properties: {
					githubUsername: {
						type: "string",
						description:
							"Natural key; also the stellarlight.xyz/builders/{githubUsername} page slug.",
					},
					displayName: {
						type: "string",
						description:
							"Display name; falls back to githubUsername when unset.",
					},
					bio: { type: "string", nullable: true },
					roleTitle: { type: "string", nullable: true },
					location: {
						type: "string",
						nullable: true,
						description:
							"Free-text location as entered (e.g. 'Rio de Janeiro, RJ, Brasil') — the ?location= filter substring-matches this.",
					},
					websiteUrl: { type: "string", nullable: true },
					twitterHandle: {
						type: "string",
						nullable: true,
						description:
							"As entered by the builder — can be a bare handle OR a full profile URL; normalize before constructing links.",
					},
					avatarUrl: { type: "string", nullable: true },
					isFeatured: { type: "boolean" },
					projectCount: {
						type: "integer",
						description:
							"Length of `projects` — the builder's own synced entries, not an ecosystem-wide attribution count.",
					},
					projects: {
						type: "array",
						description:
							"Projects synced from the builder's Stellar Passport profile. Raw sync rows: keys are snake_case, and extra passthrough fields (id, website_url, demo_url, docs_url, contract_address, repos, heatmap…) may ride along.",
						items: {
							type: "object",
							properties: {
								name: { type: "string" },
								slug: { type: "string" },
								short_description: { type: "string" },
								status: { type: "string" },
							},
							additionalProperties: true,
						},
					},
					url: {
						type: "string",
						format: "uri",
						description: "Canonical builder profile page on stellarlight.xyz.",
					},
					match: {
						type: "object",
						nullable: true,
						description:
							"WHY this row matched (null without a q/skill filter). Free-text profile evidence — treat bio/role text as claims, not verified experience.",
						properties: {
							matchedFields: {
								type: "array",
								items: { type: "string" },
								description:
									"Profile fields the query hit (bio, roleTitle, displayName, githubUsername, location, projects).",
							},
							matchedProjects: {
								type: "array",
								items: {
									type: "object",
									properties: {
										name: { type: "string" },
										slug: { type: "string", nullable: true },
									},
								},
								description:
									"Projects whose name/description matched the query.",
							},
							matchedTerms: {
								type: "object",
								additionalProperties: { type: "string" },
								description:
									"Per query token, the literal term that hit — a token can match via a synonym (e.g. 'payments' via 'remittance').",
							},
							basis: {
								type: "string",
								enum: ["profile-text"],
							},
						},
					},
					codeEvidence: {
						type: "array",
						nullable: true,
						description:
							"Indexed repos owned by this builder's GitHub account that match the query — observable facts (language, last activity), kept SEPARATE from subjective profile text. [] = no direct code evidence in the index (a weaker match, not a disqualification); null without a q/skill filter.",
						items: {
							type: "object",
							properties: {
								fullName: { type: "string" },
								url: { type: "string", nullable: true },
								primaryLanguage: { type: "string", nullable: true },
								stars: { type: "integer" },
								lastCommitAt: {
									type: "string",
									format: "date-time",
									nullable: true,
								},
								repoScore: { type: "number" },
							},
						},
					},
				},
			},
			Person: {
				type: "object",
				description:
					"One SDF roster entry from /api/people: person, current role, section, and affiliation — quoted from stellar.org/foundation/team with provenance (sourceUrl + observedAt). Roster facts, not verified availability.",
				properties: {
					name: { type: "string" },
					role: {
						type: "string",
						description:
							"Current role/title, e.g. 'VP of Ecosystem', 'CEO of Stripe'.",
					},
					section: {
						type: "string",
						description:
							"Roster section: 'Leadership' | 'Board of directors' | 'Advisors'.",
					},
					org: {
						type: "string",
						description:
							"Affiliation — 'Stellar Development Foundation' for leadership, the external org for board/advisors, '' when the role names none.",
					},
					sourceUrl: { type: "string" },
					observedAt: {
						type: "string",
						description:
							"Date this entry was last observed from the source (YYYY-MM-DD).",
					},
				},
			},
			Rfp: {
				type: "object",
				description:
					"An RFP row from /api/rfps. rowType discriminates real briefs from the synthetic live-round row (sls-045) — count/render briefs by filtering rowType === 'rfp'.",
				properties: {
					id: {
						type: "string",
						description:
							"Brief slug (also the stellarlight.xyz/ideas/{id} page). Synthetic rows use 'scf-round-{n}'.",
					},
					title: { type: "string" },
					description: { type: "string" },
					technicalRequirements: {
						type: "string",
						nullable: true,
						description:
							"The sponsor's technical requirements text. Null when the brief carries none — and always null on synthetic scf-round rows.",
					},
					category: {
						type: "string",
						description:
							"Category slug — the ?category= filter vocabulary (an unrecognized filter value returns 400 with validCategories). 'scf' is carried by the synthetic live-round row.",
					},
					categoryLabel: {
						type: "string",
						description: "Display label for category (e.g. 'DeFi').",
					},
					authorName: {
						type: "string",
						description:
							"Sponsor/author of the brief; 'Stellar Community Fund' on synthetic rows.",
					},
					quarter: {
						type: "string",
						description:
							"Quarter slug (e.g. 'q1-2026') — the ?quarter= filter vocabulary. Synthetic rows carry the active quarter.",
					},
					quarterLabel: {
						type: "string",
						description:
							"Display label ('Q1 2026'); 'Live round' on synthetic rows.",
					},
					status: {
						type: "string",
						enum: ["open", "closed"],
						description:
							"'open' = fundable in the current SCF quarter; 'closed' = a prior round, surfaced for context.",
					},
					url: {
						type: "string",
						format: "uri",
						description:
							"Brief page (stellarlight.xyz/ideas/{id}); the SCF awards page on synthetic scf-round rows.",
					},
					rowType: {
						type: "string",
						enum: ["rfp", "scf-round"],
						description:
							"'rfp' = a curated sponsor brief. 'scf-round' = a SYNTHETIC row representing the live SCF round's open submission window (served as a row so row-reading agents don't miss the open round). Synthetic rows are NOT briefs — count/render briefs by filtering rowType === 'rfp'.",
					},
					synthetic: {
						type: "boolean",
						description:
							"True only on synthetic scf-round rows — mirror of rowType.",
					},
				},
			},
			Hackathon: {
				type: "object",
				description:
					"One hackathon event row from /api/hackathons — merged from the curated collection and the live DoraHacks feed (`source` says which). prizePoolUSD/hackersCount are ABSENT when the source publishes none: unknown, never zero.",
				properties: {
					id: {
						type: "string",
						description:
							"'dorahacks-{id}' for DoraHacks rows; the curated collection id otherwise.",
					},
					name: { type: "string" },
					slug: {
						type: "string",
						description:
							"Event slug — the key /api/hackathons/{slug} (getHackathon) resolves.",
					},
					description: {
						type: "string",
						nullable: true,
						description: "Event description (DoraHacks rows carry markdown).",
					},
					startDate: { type: "string", format: "date", nullable: true },
					endDate: { type: "string", format: "date", nullable: true },
					status: {
						type: "string",
						enum: ["upcoming", "active", "completed"],
						description:
							"Derived from start/end vs now for DoraHacks rows; curated rows carry their stored status.",
					},
					externalUrl: {
						type: "string",
						nullable: true,
						description:
							"The event's own page (the DoraHacks detail page for dorahacks rows). Null when the curated row has none.",
					},
					organizer: {
						type: "object",
						nullable: true,
						description:
							"Organizing org; slug is the ?organizer= filter value. Null when the source names none.",
						properties: {
							id: { type: "string" },
							name: { type: "string" },
							slug: { type: "string" },
						},
					},
					url: {
						type: "string",
						format: "uri",
						description:
							"Canonical link: the DoraHacks detail page for dorahacks rows, stellarlight.xyz/hackathons/{slug} for curated rows.",
					},
					source: {
						type: "string",
						enum: ["curated", "dorahacks"],
						description:
							"Which feed served this row — the ?source= filter vocabulary.",
					},
					prizePoolUSD: {
						type: "number",
						description:
							"Total prize pool in USD. ABSENT when the source publishes none — unknown, not zero.",
					},
					hackersCount: {
						type: "integer",
						description:
							"Registered hackers (DoraHacks). Absent when unknown; individual builder names are not available from the source.",
					},
				},
			},
			Skill: {
				type: "object",
				description:
					"One installable Stellar AI skill/tool from /api/skills — SDF's skills.stellar.org set, curated entries, and approved community submissions mapped onto one unified shape. Optional fields are OMITTED when not applicable (absent = not applicable, never null and never false).",
				properties: {
					slug: {
						type: "string",
						description:
							"Skill slug — resolves via /api/skills/{name} (getSkill).",
					},
					name: { type: "string" },
					tagline: {
						type: "string",
						description: "One-line summary. Absent on some rows.",
					},
					description: { type: "string" },
					source: {
						type: "string",
						enum: ["sdf", "stellarlight", "lumenloop", "external", "community"],
					},
					kind: {
						type: "string",
						enum: ["skill-md", "mcp-server", "sdk", "cli", "agent-kit", "tool"],
					},
					install: {
						type: "string",
						description:
							"Primary install command (e.g. 'npx skills add stellar/{slug}'). Absent when the entry has no one-line install.",
					},
					installAlt: {
						type: "array",
						description:
							"Alternate install commands for other agent runtimes — an ARRAY of {label, command} entries (label = the runtime, e.g. 'Codex'). Absent when only the primary install applies.",
						items: {
							type: "object",
							properties: {
								label: { type: "string" },
								command: { type: "string" },
							},
						},
					},
					repository: {
						type: "string",
						description: "Source repository URL. Absent when not published.",
					},
					homepage: { type: "string" },
					docs: {
						type: "string",
						description: "Docs URL. Absent on most rows.",
					},
					rawUrl: {
						type: "string",
						description:
							"Direct raw SKILL.md URL (SDF skills). Absent elsewhere.",
					},
					compatibility: {
						type: "array",
						items: { type: "string" },
						description:
							"Agent runtimes the skill is known to work in (e.g. 'Claude Code', 'Codex', 'Cursor').",
					},
					targetUser: {
						type: "array",
						items: { type: "string" },
						description: "Intended audience tags (dev, founder, agent).",
					},
					tags: { type: "array", items: { type: "string" } },
					featured: {
						type: "boolean",
						description:
							"Editorially featured. Absent (not false) on most rows.",
					},
					userInvocable: {
						type: "boolean",
						description:
							"SDF skills only — whether the skill is user-invocable in skills.stellar.org's sense. Absent elsewhere.",
					},
					argumentHint: {
						type: "string",
						description:
							"SDF skills only — argument hint (e.g. '[payment task]'). Absent elsewhere.",
					},
				},
			},
			Cluster: {
				type: "object",
				description:
					"One category/type cluster from /api/clusters — crowdedness/whitespace over the active project directory. size is a directory TAXONOMY count (how many projects carry the tag), NOT a venue or competitor count (sls-035): the DEX cluster, e.g., includes aggregators and trading UIs alongside independent venues.",
				properties: {
					key: {
						type: "string",
						description:
							"The cluster label — a category (dimension=category) or a types[] value (dimension=types), e.g. 'RWA'.",
					},
					dimension: {
						type: "string",
						enum: ["category", "types"],
						description:
							"Which taxonomy this cluster was computed over (echoes ?dimension=).",
					},
					size: {
						type: "integer",
						description:
							"Projects in the cluster — a taxonomy count (see component description).",
					},
					scfFundedCount: {
						type: "integer",
						description: "Cluster projects with an SCF award.",
					},
					scfTotalUSD: {
						type: "number",
						description:
							"Sum of known SCF award amounts across the cluster — an in-house reconstruction (per-award amounts aren't published for all rounds): comparable across clusters, not an official figure.",
					},
					hackathonWinnerCount: {
						type: "integer",
						description: "Cluster projects with a top hackathon placement.",
					},
					crowdedness: {
						type: "integer",
						minimum: 1,
						maximum: 10,
						description:
							"1-10 log-scaled crowding score: round(log2(size+1) + log2(scfFundedCount+1) + 0.5*log2(hackathonWinnerCount+1)), clamped to 1..10 — SCF funding and winners add a modifier, so a well-funded small cluster can outrank a huge unfunded one. Sort descending for 'most crowded', ascending for whitespace.",
					},
					sampleProjects: {
						type: "array",
						description:
							"A few showcase projects, sorted by SCF funding + hackathon prize — a SAMPLE of the cluster, not its full membership (enumerate via searchProjects).",
						items: {
							type: "object",
							properties: {
								name: { type: "string" },
								slug: { type: "string" },
								shortDescription: { type: "string", nullable: true },
								scfAwarded: { type: "boolean" },
								url: { type: "string", format: "uri" },
							},
						},
					},
				},
			},
			LeaderboardProject: {
				type: "object",
				description:
					"One ranked project row from /api/leaderboard. Every github.* number is as-of meta.dataAsOf (the repo-index rollup timestamp), NOT a live GitHub read — meta.metricDefinitions states what each metric IS (sls-036).",
				properties: {
					rank: {
						type: "integer",
						description:
							"1-based position under THIS response's sort/range/category/type scope — recomputed per request, not a stable global rank. Cite alongside the applied filters (meta.filters).",
					},
					id: { type: "string" },
					name: { type: "string" },
					slug: {
						type: "string",
						description:
							"Directory slug — join key to searchProjects for the full profile.",
					},
					category: { type: "string" },
					types: {
						type: "array",
						items: { type: "string" },
						description:
							"Granular product-type tags — the same types[] taxonomy as project-search rows, echoed so a consumer can see WHY a row matched a ?type= filter (#524).",
					},
					shortDescription: { type: "string", nullable: true },
					scfAwarded: { type: "boolean" },
					github: {
						type: "object",
						description:
							"Rollup across the project's INDEXED repos, as-of meta.dataAsOf.",
						properties: {
							totalStars: {
								type: "integer",
								description: "Sum of stargazer counts across indexed repos.",
							},
							openIssuesTotal: {
								type: "integer",
								description:
									"Sum of OPEN issues (EXCLUDES pull requests — will not match GitHub's REST open_issues_count). A backlog snapshot, not an activity or quality ranking.",
							},
							lastActivityAt: {
								type: "string",
								format: "date-time",
								nullable: true,
								description:
									"Latest default-branch commit (fallback: last push) across indexed repos. Null when no indexed repo has a known date.",
							},
							repoCount: {
								type: "integer",
								description:
									"Indexed repos attributed to the project — our index's coverage, not the project's total GitHub footprint.",
							},
						},
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
