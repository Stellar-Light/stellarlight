/**
 * Stellar Scout API changelog — a curated, agent-readable feed of notable
 * changes to the public API, MCP tools, and typed client. Served at
 * `GET /api/changelog` so consuming agents (and their owners) can diff
 * "what changed lately" without trawling git history.
 *
 * Keep it latest-first. Add an entry whenever a change alters the contract
 * an agent depends on: new/removed endpoints or tools, param/enum changes,
 * description/routing rewrites, or response-shape changes. Skip purely
 * internal refactors that don't change observable behavior.
 */

export type ChangelogSurface = "api" | "mcp" | "api-client" | "skill";
export type ChangelogType = "added" | "changed" | "fixed" | "removed";

export interface ChangelogEntry {
	/** ISO date (YYYY-MM-DD) the change went live. */
	date: string;
	/** Which distribution surface(s) the change touched. */
	surfaces: ChangelogSurface[];
	/** Released package/spec version, when applicable (e.g. "scout-mcp@1.1.2"). */
	version?: string;
	/** Kind of change, keep-a-changelog style. */
	type: ChangelogType;
	/** One-line, agent-facing summary. */
	summary: string;
	/** Optional longer detail / migration note. */
	detail?: string;
}

/** Latest-first. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		date: "2026-07-02",
		surfaces: ["api"],
		type: "added",
		summary:
			"OpenAPI polish: every operation now carries an `operationId` (`getStatus`, `searchProjects`, `explainRepo`, `submitFeedback`, etc. — matches the api-client method names). Added the missing `Repos` global tag. Every path now has full 'Use when / Not for' routing text (4 remaining ops closed).",
		detail:
			"Result: Spectral (spectral:oas ruleset) lints the spec at 0 errors / 0 warnings, and codegen tools (openapi-typescript, orval, kiota) emit predictable method names that match `@stellar-light/api-client`.",
	},
	{
		date: "2026-07-01",
		surfaces: ["mcp"],
		version: "scout-mcp@1.1.5",
		type: "added",
		summary:
			"Two new MCP tools — `get_partners` (the ecosystem partner directory) and `get_changelog` (this feed) — so MCP-transport agents reach the same surface as the REST API + typed client. 18 tools total.",
	},
	{
		date: "2026-07-01",
		surfaces: ["api", "api-client"],
		type: "fixed",
		summary:
			"Response-shape drift reconciled with the OpenAPI spec: documented `/api/projects/search` item `confidence`/`repos`/`via`, `/api/repos/search` `meta.canonical`/`meta.note`, and `/api/repos/explain` `meta`. `/api/repos/explain` now always returns `answered`/`sources`/`alternateRepos` (even when nothing routes). `/api/status` adds `apiVersion` (tracks the OpenAPI `info.version`); the two no longer drift.",
	},
	{
		date: "2026-07-01",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"Hackathon `placementRank` now parses word ordinals ('First/Second/Third Place'), so events like `build-on-stellar` return the real 1st-place winner as `winners[0]` (was scrambled). And source-unranked winners now carry `placementRank: null` instead of a leaked `9999` sentinel.",
		detail:
			"Corrects the 2026-06-30 placementRank entry: `winners[0]` is the 1st-place entry only when the event has ranked placements. For a flat 'Winners' bucket (many DoraHacks events), every winner is `placementRank: null` and order is not significant — check for null rather than assuming winners[0] is 1st.",
	},
	{
		date: "2026-06-30",
		surfaces: ["api"],
		type: "added",
		summary:
			"`GET /api/partners` is now populated — 24 curated ecosystem partners (5 audit firms + 19 anchors), filterable by `?type` / `?sector` / `?region` / `?q`. Was previously empty.",
		detail:
			"Curated seed data (`verified:false`); partners can claim + enrich via the portal. Use for 'who should audit my contract' / 'find an anchor' discovery. Audit firms: Veridise, OtterSec, Runtime Verification, Certora, Halborn.",
	},
	{
		date: "2026-06-30",
		surfaces: ["api"],
		type: "changed",
		summary:
			"Every public `/api` endpoint now returns `X-API-Version: 1` and permissive CORS (`Access-Control-Allow-Origin: *`) uniformly — cross-origin/browser agents can call any endpoint and version-pin consistently.",
	},
	{
		date: "2026-06-30",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"`/api/analyze` `categories.totalProjects` reconciled to the active-project count (~888) with an explicit `scope` label — was a stale 500. Intentionally differs from `/api/status`, which counts the full collection.",
	},
	{
		date: "2026-06-27",
		surfaces: ["api", "skill"],
		type: "fixed",
		summary:
			'`/api/skills` no longer advertises a stale "14 tools" count for Scout MCP — reconciled with the shipped tool set (16 after `explain_repo`).',
	},
	{
		date: "2026-06-30",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"Hackathon detail winners are now sorted by placement and carry a numeric `placementRank` (1 = best) where the source provides an ordinal, so `winners[0]` is the 1st-place entry. Previously the array was scrambled with only a string label, making winner-order claims ungroundable.",
		detail:
			"Applies to both the DoraHacks-feed and curated/DB winner paths. Sort/filter on `placementRank` instead of parsing the `hackathonPlacement` string. (See the 2026-07-01 entry: unranked winners carry `placementRank: null`.)",
	},
	{
		date: "2026-06-30",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"`/api/repos/explain` degrades gracefully when DeepWiki hasn't indexed a repo — returns `answered:false` + the routed authoritative repo, instead of surfacing DeepWiki's \"Repository not found\" error as if it were an answer.",
	},
	{
		date: "2026-06-30",
		surfaces: ["api", "mcp"],
		version: "scout-mcp@1.1.4",
		type: "added",
		summary:
			"Repo intelligence — deep code answers. Infra/protocol questions now route to the authoritative repo (error/result codes, consensus/SCP, XDR → stellar-core; Horizon → stellar/go; RPC → stellar-rpc) and `explain_repo` / GET /api/repos/explain returns a source-grounded answer pulled from DeepWiki — the actual answer, not just a link.",
		detail:
			"search_repos now floats curated canonical SDF repos to the top for infra queries and adds a `deepWikiUrl` to every result. The new `explain_repo` MCP tool + /api/repos/explain endpoint pair our routing with DeepWiki's repo Q&A: our index picks WHICH repo is authoritative, DeepWiki explains WHAT'S INSIDE. 16 MCP tools total.",
	},
	{
		date: "2026-06-27",
		surfaces: ["api", "mcp", "skill"],
		version: "scout-mcp@1.1.3",
		type: "changed",
		summary:
			"Every tool/endpoint description rewritten to be use-case-driven — each states when to use it and which sibling tool to use instead — so agents pick the right tool instead of calling all of them. Added GET /api/changelog (this feed).",
		detail:
			"Disambiguates the confusable clusters (search_projects vs search_repos vs search_research; the three hackathon tools; clusters vs leaderboard vs analyze). Kept consistent across the MCP, OpenAPI, and skill docs.",
	},
	{
		date: "2026-06-23",
		surfaces: ["api", "mcp", "api-client"],
		version: "scout-mcp@1.1.2, api-client@1.2.1",
		type: "removed",
		summary:
			"Dropped the dead `scfTier` and `featured` builder filters — they were advertised but unseeded, so they could never match.",
		detail:
			"Removed from /api/builders, the filter-miss advisory, the OpenAPI spec, the MCP `get_builders` tool, and the typed client. The working builder filters are `q`, `location`, and `skill`. `scfTier` remains a response field on each builder.",
	},
	{
		date: "2026-06-22",
		surfaces: ["api", "skill"],
		version: "openapi 1.2.0",
		type: "fixed",
		summary:
			"Declared enums are now enforced: `projects/search.category`, `leaderboard.format`, and `clusters.dimension` return `400 + validX` on invalid values instead of silently accepting them.",
		detail:
			"Added matching drift-guard assertions so the daily CI check now also tests invalid-value rejection, not just spec⇄live⇄doc agreement.",
	},
	{
		date: "2026-06-20",
		surfaces: ["api", "mcp", "api-client", "skill"],
		version: "scout-mcp@1.1.0",
		type: "added",
		summary:
			"New `/api/repos/search` — an indexed-and-scored Stellar GitHub repo / code-reference index — plus the `search_repos` MCP tool (the 15th tool).",
		detail:
			"Searches ~1,900 Stellar ecosystem repos by tech/keyword, ranked by `repoScore` (freshness + traction + hackathon/SCF/builder authority). The same graded repos are injected inline into `/api/projects/search` as `codeReferences`.",
	},
	{
		date: "2026-06-19",
		surfaces: ["api"],
		type: "changed",
		summary:
			"`/api/clusters` accepts a value filter (e.g. `?category=RWA`); `/api/leaderboard` now reports real per-project GitHub stars; `/api/builders` enriched from GitHub (bio/location/website).",
	},
];
