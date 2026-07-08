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
		date: "2026-07-08",
		surfaces: ["mcp"],
		version: "@stellar-light/scout-mcp@1.1.8",
		type: "changed",
		summary:
			"get_partners `q` param description corrected: q is relevance-ranked by structured capability fit (assets/ramps/SEPs/country/services/region), not a literal name+description keyword search — the old text under-sold capability queries like 'USDC off-ramp Mexico'.",
	},
	{
		date: "2026-07-08",
		surfaces: ["api", "api-client"],
		type: "fixed",
		summary:
			"OpenAPI spec under-documented the live contract — CORRECTION: `Project.anchorProfile` was wrongly removed from the spec as 'never-implemented' (it IS served on Anchor-typed searchProjects rows and is now load-bearing for ramp queries); re-documented, plus `Project.canonicalSlug`, `Project.lifecycle`, and a full `Partner` component for getPartners (previously spec'd as a bare untyped object).",
		detail:
			"anchorProfile is the integration-oriented ramp profile joined from the partner directory ({slug,country,regions,assets,seps,rampTypes,asOf,url}; seps [] + non-empty rampTypes = proprietary ramp API rather than SEP-6/24). canonicalSlug = duplicate-lineage pointer; lifecycle = historical-archive context. The new Partner component documents all 31 live row fields incl. the system-computed `verified`/`trust`/`freshness` objects. Downstream catalogs generated from the spec (e.g. schema-drift detectors) should see this as ADDITIVE schema drift only — no ops/params/routing text changed. Prevention: the daily api-drift guard now asserts live-response field coverage (every field a live row serves must be documented in its spec component), so under-documentation is caught by our CI before any consumer's drift detector.",
	},
	{
		date: "2026-07-08",
		surfaces: ["api", "mcp", "api-client"],
		type: "fixed",
		summary:
			"searchProjects now retrieves on STRUCTURED truth, not just prose. A record's `types` and curated `coverage` (countries/currencies/SEPs) are searchable + drive INCLUSION, so a generic 'Mexico on-ramp MXN' query surfaces Etherfuse (coverage MXN/Mexico; prose about Stablebonds) and 'DEX AMM swap liquidity pool' surfaces Sushi (type=DEX; desc says 'liquidity provision', not 'pool') (sls-018, sls-019).",
		detail:
			"Root cause: the candidate query + scoring read only name/description/category, so structured coverage — the exact fields built for corridor queries — was invisible to search, and a strict-AND near-miss dropped a category match for lacking one prose word. Fix (src/lib/project-search-match.ts, unit-tested): coverage values (+ implied anchor/ramp vocabulary for any covered record) and types/supportedNetworks fold into the searchable haystack; a project that IS the queried category or whose coverage serves a queried country/currency is admitted one match-tier looser (structured truth > one extra word); a corridor coverage hit under ramp intent bypasses the tier entirely. Precision-gated: the corridor bypass fires only on ramp/anchor intent + a literal coverage-value match, so topic queries don't over-recall. New known-item recall guard in the daily self-audit (scripts/self-audit.ts) asserts Etherfuse/Sushi/Soroswap stay retrievable — the class, not just the two instances.",
	},
	{
		date: "2026-07-08",
		surfaces: ["api", "api-client"],
		version: "@stellar-light/api-client@1.4.0",
		type: "added",
		summary:
			"searchProjects results now carry structured `coverage` {countries, currencies, seps, asOf} for Anchor-typed projects (sls-012) and `supportedNetworks` [] (sls-017) — corridor/chain questions become filterable + dated instead of prose-mined. getHackathon detail adds `prizeTiers` [] {place, rank, amountUSD, asset} parsed from the prize prose (sls-016).",
		detail:
			"coverage is synced from the matching partner record (SEPs/currencies/country), null for non-anchors; ~16 anchor projects populated (e.g. bitso → MXN/BRL/ARS/COP/USD, mykobo → SEP-6/24/31·EUR). supportedNetworks distinguishes a multichain wallet's omission from a negative (LOBSTR = [stellar, xrpl]). prizeTiers joins to winners via placementRank (empty when a hackathon has no itemized split). OpenAPI Project schema reconciled: the never-implemented `anchorProfile` field was removed in favor of the real `coverage`/`supportedNetworks`. api-client 1.4.0 regenerated from the live spec.",
	},
	{
		date: "2026-07-08",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"getPartners and getBuilders free-text `q` are relevance-matched, not strict all-token substring. getPartners routes `q` through the shared matchmaker scorer (weighted by assets/ramps/SEPs/country/region) — 'USDC off-ramp' in LatAm went 1 → 6 results. getBuilders `q` gains synonym + singular/plural stem expansion (payments ↔ boleto/PIX/remittance) (sls-010).",
		detail:
			"Found by dogfooding our own MCP tools with natural questions: the list endpoints used tokens.every(hay.includes) so adding keywords returned FEWER results, and structured capability fields never counted. getPartners now reuses scorePartners (the concierge engine); a latent region bug where 'usd' inside 'USDC' mis-gated queries to North-America was fixed with word-boundary matching (regression-tested). getBuilders q=payments in Brazil went 1 → 2. Ranking-only change; no param/shape changes.",
	},
	{
		date: "2026-07-06",
		surfaces: ["api"],
		version: "openapi 1.6.1",
		type: "fixed",
		summary:
			"sls-014: getRfps meta.scfRound is now LIVE (6h revalidate from communityfund.stellar.org/awards' embedded award_rounds payload) — no more stale-at-birth round state. sls-015: searchProjects description scopes its product name-drops to directory facts (editorial/analysis content belongs to content platforms).",
		detail:
			"scfRound previously shipped as a hand-curated constant that asserted 'no round confirmed open' while the cited source showed SCF #45 in Submission (sls-014). It now parses the awards page's structured round data (roundNumber/phase/submission deadline) on a 6-hour revalidate, adds currentPhase + roundsInProgress + source:'live'|'unavailable', and enforces the invariant: on fetch failure the note says the live check failed and points at verifyAt — it never asserts a negative. sls-015: the searchProjects operation description's named-product mentions (Etherfuse Stablebonds, Soroswap, explorers) are now explicitly bounded to directory facts, per the finding that agents read them as routing claims for editorial questions. DESCRIPTION CHANGE — downstream routing catalogs should re-baseline after ingesting (the change was requested by the downstream eval itself).",
	},
	{
		date: "2026-07-06",
		surfaces: ["api"],
		version: "openapi 1.6.0",
		type: "changed",
		summary:
			"getPartners default results now pass a directory quality bar (tagline + contact path, non-archived) with the pilot cohort sorted first; new all=1 param returns the unfiltered set. New `pilot` boolean on partner entries.",
		detail:
			"The partner directory default view now shows only complete, non-archived profiles — most seeded rows were placeholder-thin (no tagline) and read as noise to consumers. Pass all=1 for every published partner (the previous behavior). Sort is pilot-first, then freshness. Additive param + response field; the getPartners operation DESCRIPTION is unchanged (routing-neutral for downstream catalogs — only the default result set is curated, a data-quality improvement). Archived (owner-confirmed dead) partners stay reachable at /api/partners/{slug} with freshness.status=archived.",
	},
	{
		date: "2026-07-06",
		surfaces: ["api"],
		version: "openapi 1.5.0",
		type: "added",
		summary:
			"codeVerified block on repos — code-truth from analyzing each repo's ACTUAL source (stellarProof, codeDepth, deployable-contract, soroban-sdk version status). The discriminator between a popular repo and real, current, deep Soroban code.",
		detail:
			"search_repos results and explain_repo now carry a codeVerified object: stellarProof (how we know it's Stellar — cargo-sdk/contract-macros/lang-sdk/js-sdk/stellar-toml), codeDepth (0-1 substance of the contract logic, not stars), isDeployableContract (Cargo cdylib), sorobanSdkVersion + versionStatus (current/supported/deprecated/unknown vs the latest protocol). Derived by scanning the repo's Cargo.toml + source through a shared, tested pipeline; codeDepth also feeds repoScore so code-verified deep contracts outrank starred-but-shallow ones. null until a repo is code-scanned (honest — we never claim verification we haven't done). ADDITIVE + routing-neutral: new response fields only, no operation added/removed, no operation-description changes.",
	},
	{
		date: "2026-07-05",
		surfaces: ["api"],
		version: "openapi 1.4.5",
		type: "fixed",
		summary:
			"Data-quality fixes from an adversarial recheck of the sls-* feedback items: hackathon winner ranking (i18n placement parsing), name-search over-fire, blog chunk hygiene, funding count basis, and JSON errors on the skill-detail route.",
		detail:
			"sls-005: placementRank now parses Spanish ordinals + emoji medals and reads the award title, so LatAm/emoji hackathons rank correctly and genuine flat-pool events honestly report winnersRanked=false (was wrong in both directions). sls-009: only an EXACT name/slug match dominates authority now — prefix/whole-word matches drop to a late tiebreaker, so a generic query like 'swap' no longer ranks a 0-prominence 'SwapX' above flagship Soroswap. sls-006: SDF-blog nav/footer boilerplate is stripped at ingest and metadata/related-post stubs are dropped, so retrieval returns article prose not chrome (re-crawl pending). sls-013: countBasis now states byRound[].count is per-round membership (non-additive). sls-011: /api/projects/search meta carries scfCountBasis where the SCF numbers appear. sls-004: /api/skills/{slug} is force-dynamic (GET still CDN-cached via headers) so non-GET returns JSON 405, not a plaintext Vercel error. Schema-only/additive + behavior fixes — no operation-description changes (routing-neutral).",
	},
	{
		date: "2026-07-04",
		surfaces: ["api"],
		version: "openapi 1.4.4",
		type: "changed",
		summary:
			"searchResearch description trim (routing hygiene): the 1.4.0 'Soroban security practice' phrasing ('vulnerability classes auditors find', 'audit findings') was lexically strong enough to capture how-to/checklist questions that belong to the ecosystem SKILLS lane in downstream routers. Reworded to 'Soroban security incidents — reentrancy, soroban-sdk advisories/CVEs, denial-of-service' — topical coverage kept, tutorial-shaped phrasing removed.",
		detail:
			"Measured on the lexical spec-routing eval before shipping: the stolen skills case routes back to its skill (skills lane restored to its floor) with ZERO scout top-1 losses — all 1.4.0 routing gains hold (legacy 232/338). Downstream catalogs that gate on routing baselines: after ingesting, the only remaining swing vs a 2026-07-03 baseline is the +10 legacy improvement — re-baseline upward.",
	},
	{
		date: "2026-07-03",
		surfaces: ["api"],
		version: "openapi 1.4.3",
		type: "added",
		summary:
			"Anchor corridor data goes structured (sls-012): Anchor-typed rows in `/api/projects/search` now carry `anchorProfile` — country, regions, asset codes, supported SEPs, ramp types, and an asOf date — joined from the partner directory's stellar.toml enrichment. 'Which anchors serve corridor X→Y' becomes filterable, dated evidence instead of prose-mining shortDescriptions.",
		detail:
			"Single source of truth: the data lives on partner records (already exposed at /api/partners) and is joined by normalized name at read time — null when no partner record matches. Cite anchorProfile.asOf as the coverage as-of date.",
	},
	{
		date: "2026-07-03",
		surfaces: ["api"],
		version: "openapi 1.4.2",
		type: "fixed",
		summary:
			"SCF funding data made reconcilable (sls-011/013): `/api/projects/search` rows gain `scfAwardedRounds` (e.g. [2, 17, 22] — rounds are authoritative; dollar totals are in-house reconstructions and can differ between aggregators, reconcile on rounds). `/api/analyze` funding dimension: `byRound` now actually populates (read the wrong field name since launch), amounts apportioned equally across a project's rounds instead of double-counted, `postHackathonStatusFunnel` scoped to hackathon-linked projects (was counting all 890 projects as Unknown via an unselected field), and the block gains `computedAt` + `methodologyVersion` + `countBasis` so metric swings are explainable.",
		detail:
			"countBasis states it explicitly: we count distinct PROJECTS (SDF's site counters count SUBMISSIONS — totals differ by design), and SCF doesn't publish per-award amounts for all rounds, so no cumulative dollar figure is official. Present computedAt alongside any quoted total.",
	},
	{
		date: "2026-07-03",
		surfaces: ["api"],
		version: "openapi 1.4.1",
		type: "changed",
		summary:
			"Four consumer-reported fixes (sls-007/009/010 + repo-search hygiene): `/api/projects/search` now ranks exact/prefix/whole-word NAME matches above all authority signals (q='Blend' returns Blend first, not a higher-authority keyword match); `/api/builders` `location` accepts region umbrellas (Latin America/LatAm, Africa, Asia, Europe → expanded to the country values profiles carry); `/api/rfps` meta gains `scfRound` (currentRound, lastConfirmedRound, submissionWindow, asOf, verifyAt — curated, null when unconfirmed rather than guessed); repo-search term matching moves to two-sided word boundaries (kills mid-word substring noise).",
		detail:
			"Name-lookup is the standard directory contract: exact=3/prefix=2/whole-word=1 dominates prominence/SCF authority in the keyword path. scfRound fields are curated because SCF publishes no machine-readable round feed — always present asOf with round answers. All changes additive or ranking-behavior only; no fields removed.",
	},
	{
		date: "2026-07-03",
		surfaces: ["api"],
		type: "changed",
		summary:
			"`/api/projects/search` region-umbrella synonyms: queries with 'LatAm' now also match records described with country vocabulary (Brazil, Mexico, Argentina, Colombia, Chile, Peru) — likewise 'Africa', 'Asia', 'Europe'. 'LatAm asset issuers' now surfaces PagFinance/CashAbroad-class projects whose records name countries, not regions.",
		detail:
			"Search behavior only — no paths, params, response shapes, or operation descriptions changed. Prompted by a live agent query that missed country-described projects on a region-worded question.",
	},
	{
		date: "2026-07-03",
		surfaces: ["api"],
		version: "openapi 1.4.0",
		type: "changed",
		summary:
			"Routing-guidance enrichment round 2 (info.version → 1.4.0): seven discovery operations' descriptions gained real-user topic vocabulary — searchResearch (SCF application process/Instawards/review timeline, Soroban security practice: reentrancy/CVEs/DoS classes, ecosystem history: Protocol 20 launch/XLM supply/UNHCR/Enterprise Fund, asset listing, contract verification), searchProjects (wallets/anchors/NFT marketplaces/perps/explorers/market map), searchRepos (streaming payments, ZK verifiers, passkey smart wallets, SDK/CLI versions, OZ RWA), getRfps (current-round + closed-RFP checks), getBuilders (by region/stack), getClusters (market-map/whitespace), analyzeEcosystem (TVL rollups).",
		detail:
			"Description text only — no paths, params, or response shapes changed. Measured on the lexical spec-routing eval: scout top-1 53.7%→66.3% (legacy lane) and 72%→84% (real-user lane, top-3 100%), overall +10 cases, zero hard per-case regressions (every strict flip is a case whose accepted-services set already includes scout). Downstream catalogs that gate on routing baselines should re-baseline after ingesting.",
	},
	{
		date: "2026-07-03",
		surfaces: ["api"],
		version: "openapi 1.3.3",
		type: "added",
		summary:
			"Three consumer-reported contract fixes: `/api/hackathons/{slug}` gains `winnersRanked` (true = winners array is placement-sorted; false = tier-labeled winners, array order meaningless — placementRank is the only ordering signal); `/api/projects/search` rows gain `scfAmountStatus` ('undisclosed' = award confirmed but amount unpublished, vs 'disclosed'/null — stop guessing on null amounts); and method misuse on every public endpoint now answers a JSON 405 with an Allow header instead of an empty non-JSON body.",
		detail:
			"Addresses downstream integration findings sls-002 (ambiguous null SCF amounts), sls-004 (non-JSON error responses), and sls-005 (tier winner arrays read as rankings). All additive.",
	},
	{
		date: "2026-07-03",
		surfaces: ["api", "mcp"],
		version: "openapi 1.3.2",
		type: "added",
		summary:
			"Dated freshness on answer surfaces: `/api/repos/explain` now returns `repoMeta` (lastCommitAt, stars, isArchived, repoScoreLabel of the routed repo) so grounded answers carry an as-of date; `/api/projects/search` rows gain `lastActivityAt` (most recent commit across the project's own repos) and each inline repo ref now includes `lastCommitAt`. Also: scout-mcp's search_research `source` enum adds the missing 'incident' value (MCP ⇄ API parity).",
		detail:
			"Attach repoMeta.lastCommitAt / lastActivityAt as the as-of date when citing answers instead of asserting undated facts. All changes additive — no field removed or renamed.",
	},
	{
		date: "2026-07-02",
		surfaces: ["api"],
		version: "openapi 1.3.1",
		type: "added",
		summary:
			"`/api/projects/search` results now carry `builtBy` — the organization/entity behind each project ('who built LOBSTR?' → Ultra Stellar; Soroswap → Paltalabs), null when no org is linked. Also: the `status` enum gains 'Inactive' (defunct/archived projects stay name-searchable but are heavily down-ranked and excluded from the leaderboard/directory — e.g. Keybase).",
		detail:
			"Attribution is resolved from the curated entities collection (one org per project). Sort/present with builtBy for 'who is behind X' questions instead of guessing from project descriptions.",
	},
	{
		date: "2026-07-02",
		surfaces: ["api"],
		version: "openapi 1.3.0",
		type: "changed",
		summary:
			"OpenAPI routing overhaul (info.version → 1.3.0): every discovery operation's description now enumerates its answerable topics with real ecosystem vocabulary — searchResearch (compliance/Travel Rule, bug bounties, incidents/post-mortems, SCF governance, SDF, SCP history, ambassador programs), searchProjects (NFT/RWA/lending/wallets/anchors + 'who built X'), searchRepos (OpenZeppelin, SEP-41, fuzz testing), getBuilders (recruit/hire), getRfps/getClusters/analyzeEcosystem. Write ops carry `x-side-effecting: true` so consumers classify them without parsing prose.",
		detail:
			"Measured against a lexical spec-routing eval: routing a corpus of real builder questions to the correct operation jumped from 31.6% to 50.5% top-1 and 67.4% to 85.3% top-5. `info.version` is bumped on ANY additive path/description change so drift consumers can diff the version string, not just paths.",
	},
	{
		date: "2026-07-02",
		surfaces: ["api"],
		type: "added",
		summary:
			"Partner pipeline is real: new `POST /api/partners/submit-listing` (creates a reviewed draft partner account — or a claim request when the company is already listed), and the previously undocumented `POST /api/partners/match`, `/assistant`, and `/onboard` are now in the OpenAPI spec with operationIds.",
		detail:
			"All partner AI endpoints degrade to 503 `unavailable:true` without an AI backend — fall back to GET /api/partners filters. Concierge-surfaced partners are logged as leads and delivered in a weekly partner digest.",
	},
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
