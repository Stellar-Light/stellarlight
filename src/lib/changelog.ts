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
		date: "2026-07-20",
		surfaces: ["api"],
		version: "openapi@1.8.10",
		type: "added",
		summary:
			"?fields= response projection on the five heaviest list endpoints (projects/search, repos/search, research, builders, partners) — agents can request only the row fields they need.",
		detail:
			"fields=name,slug,tvlUSD returns rows with just those keys (case-insensitive). Identity keys (id/slug/fullName/githubUsername/url/source, where present on a row) are always included so projected rows still join back to their records; unknown field names are ignored rather than rejected (additive-contract ethos — a renamed field must degrade, not break callers); meta blocks are never projected. Nested objects are whole-key selections (fields=onchain returns the whole onchain block; dot-paths unsupported). Absent fields= returns the exact previous full response — purely additive.",
	},
	{
		date: "2026-07-20",
		surfaces: ["api"],
		version: "openapi@1.8.9",
		type: "added",
		summary:
			"Full row schemas documented for builders, people, rfps, hackathons, skills, clusters, and leaderboard — every list endpoint's item shape is now a named component, guarded by the daily live⊆spec field-coverage check.",
		detail:
			"Previously only Project/Partner/Audit/ResearchResult rows had documented shapes; the other seven list operations served rows the spec typed as bare objects (the anchorProfile under-documentation class, unguarded on 7 of ~10 shapes). New components: Builder (incl. match/codeEvidence provenance semantics), Person, Rfp (rowType discriminator), Hackathon (absent prizePoolUSD/hackersCount = unknown, never zero), Skill (absent optional fields = not-applicable, never false), Cluster (size is a taxonomy count, not a competitor count), LeaderboardProject (github.* numbers are as-of meta.dataAsOf). Also documented: the /api/rfps top-level `funding` string and the /api/leaderboard `ecosystem` Electric-Capital block. No serving behavior changed — this is documentation of existing responses, now drift-guarded.",
	},
	{
		date: "2026-07-20",
		surfaces: ["api"],
		version: "openapi@1.8.8",
		type: "added",
		summary:
			"/api/status sources[] gains researchDocs and partners rows — the freshness guard now covers the research corpus and partner directory crons.",
		detail:
			"Two new rows in sources[]: researchDocs (the primary research corpus behind /api/research — previously the #2 endpoint by usage had no freshness row) and partners (partner directory profiles; counts ALL rows incl. unpublished drafts, populationId partner-accounts|status:all — /api/partners serves published-only, so its total can be smaller). The daily self-audit now applies staleness thresholds to audits/researchDocs/partners, so a stalled ingest cron surfaces as a tracked failure instead of silence.",
	},
	{
		date: "2026-07-20",
		surfaces: ["api"],
		version: "openapi@1.8.7",
		type: "added",
		summary:
			"On-chain deltas + partner-asset join: projects.onchain gains eventsDelta/subinvocationsDelta/assetHoldersDelta with prevAsOf/deltaDays; partner-linked issuer assets auto-join their projects.",
		detail:
			"Snapshot-over-snapshot activity: from the second enrichment run, each contract carries eventsDelta and subinvocationsDelta and assets carry assetHoldersDelta, with prevAsOf + deltaDays defining the comparison window — lifetime counts can't distinguish a dead contract from a busy one; deltas can. null delta = no prior snapshot, NOT zero activity. Coverage: partner records with a projectSlug and enrichment-verified on-chain assets now auto-join their canonical (top-holders) asset to the project row.",
	},
	{
		date: "2026-07-20",
		surfaces: ["api"],
		version: "openapi@1.8.6",
		type: "added",
		summary:
			"On-chain metrics on project rows: projects.onchain — per-contract activity (events, subinvocations, storage) + asset holders/supply from stellar.expert, hand-verified join keys.",
		detail:
			"searchProjects rows gain an `onchain` group for projects with verified on-chain join keys (contract addresses from the projects' own deployment manifests/READMEs; assets from canonical issuer accounts). Per contract: lifetime events + subinvocations + storageEntries + createdAt + the wasm-validation repo when available. Per asset: funded-trustline holders + supply in whole units. Semantics: onchain null = not tracked in our registry, never 'no activity'; stellar.expert's direct invocation counter is currently null service-wide, so events/subinvocations are the honest activity signals. Refreshed weekly.",
	},
	{
		date: "2026-07-19",
		surfaces: ["api"],
		version: "openapi@1.8.5",
		type: "added",
		summary:
			"findingsTotal/severityCounts now populate on /api/audits for auditor formats that parse deterministically — 20 of 58 reports carry verified counts (previously 100% null).",
		detail:
			"Per-auditor grammars (OtterSec, Veridise, Certora, Code4rena, Hacken) extract findings counts ONLY when the report round-trips an internal consistency check: enumerated finding IDs must equal the report's own stated total, and per-finding severity words must agree with their ID prefixes. One failed check → null (= not extracted, NOT zero — unchanged semantics). severityCounts populate where the format carries per-finding severity (Certora tables, Code4rena tier headings). Shattered formats (Halborn, Runtime Verification, Quarkslab...) deliberately stay null rather than guessed.",
	},
	{
		date: "2026-07-19",
		surfaces: ["api"],
		version: "openapi@1.8.4",
		type: "fixed",
		summary:
			"Audit filters now scope retrieval (no more silent false negatives); /api/audits gains real-date since validation, didYouMean on filtered empties, and a dateBasis honesty field.",
		detail:
			"Cold-audit fixes on the new surfaces: (1) /api/research auditor/protocol/severity filters previously post-filtered an unscoped pool — a query whose top-K lacked audit chunks returned 0 even when matching audit chunks existed; the filters now imply source=audit at retrieval, and a contradictory explicit source= is a 400. severity is case-insensitive. (2) /api/audits: since= rejects impossible YYYY-MM-DD dates (2026-13-01 previously passed and matched nothing); filtered empties return meta.didYouMean suggestions from the registry's own values; rows carry dateBasis (published | portal-record) so wall-clock portal timestamps aren't mistaken for publication recency.",
	},
	{
		date: "2026-07-19",
		surfaces: ["api", "mcp"],
		version: "openapi@1.8.3 / scout-mcp@1.1.11",
		type: "added",
		summary:
			"New `/api/people` (getPeople) + `get_people` MCP tool: the SDF team/people index — leadership, board of directors, and advisors (name → role → org), quoted from stellar.org/foundation/team with provenance. Answers 'who is <person>', 'what's their SDF role', 'who's on the board'. Deliberately distinct from getBuilders (GitHub-contributor profiles): a VP of Ecosystem or a board member is not a 'builder'. Filter by `q` (name/role/org) and `section` (Leadership/Board of directors/Advisors).",
		detail:
			"Closes the person-lookup gap where getBuilders returned 0 for well-known SDF people (Justin Rice = VP Ecosystem, Tomer Weller, board members) and searchResearch surfaced only tangential prose. The roster's roles + section grouping are extracted from the team page's __NEXT_DATA__ card blocks (reusing the sls-055 parser, now also capturing each card's section from its container title) into a committed registry (src/data/sdf-people.ts, regenerated by scripts/build-sdf-people.ts) — DB-independent and deterministic for the drift guard. getBuilders now cross-links: a name-shaped query that matches the SDF roster returns a concrete identification (name — role — section) plus a pointer to /api/people, instead of a misleading 'broaden your filter'.",
	},
	{
		date: "2026-07-19",
		surfaces: ["api"],
		version: "openapi@1.8.2",
		type: "changed",
		summary:
			"Audit and ResearchResult row schemas fully documented in the spec (previously generic objects); daily drift guard now field-covers both.",
		detail:
			"components.schemas.Audit and components.schemas.ResearchResult document every served field with null semantics (projectSlug null = no directory project, NOT unaudited; findingsTotal/severityCounts null = not extracted, NOT zero; severity is section-inferred). The daily api-drift field-coverage check now asserts live rows ⊆ spec for /api/audits and /api/research alongside projects/partners — a new field that ships undocumented turns the guard red.",
	},
	{
		date: "2026-07-19",
		surfaces: ["api"],
		version: "openapi@1.8.1",
		type: "added",
		summary:
			"New research source 'release' — stellar-core/stellar-cli/SDK GitHub release notes (protocol upgrade tags, dated); sdf-blog titles repaired for foundation-news posts.",
		detail:
			"The corpus was snapshot-shaped: Protocol 27 'Zipper' reached mainnet with no document saying what shipped when. /api/research?source=release now serves one dated doc per stable GitHub release of stellar/stellar-core, stellar-cli, js-stellar-sdk, and rs-soroban-sdk. Separately, ~50 stellar.org foundation-news posts (including the Protocol 27 and 26 upgrade guides) were ingested with their titles collapsed to 'Stellar' (brand-prefix og:title ordering) — titles now extract correctly, restoring their retrieval weight.",
	},
	{
		date: "2026-07-19",
		surfaces: ["api"],
		version: "openapi@1.8.0",
		type: "added",
		summary:
			"New GET /api/audits — enumerable security-audit registry (one row per report, hand-verified projectSlug links); /api/research now honors auditor/protocol/severity filters instead of silently ignoring them.",
		detail:
			"The audit corpus gains a structured half: /api/audits lists every stellarsecurityportal.com report with normalized auditor, publication date, and a verified directory-project link (project=, auditor=, q=, since= filters; unknown params 400). Agents can now answer 'list all audits for X' / 'what has firm Y audited' by enumeration instead of vector retrieval. On /api/research, the previously-ignored auditor/protocol/severity params now filter audit-chunk metadata (unknown severity values 400); severity remains section-inferred and mostly 'unknown' on PDF-derived chunks — /api/audits is the reliable report-level surface. /api/status gains an 'audits' source row. Registry rows carry findingsTotal/severityCounts as null until deterministic extraction lands (null = not extracted, NOT zero).",
	},
	{
		date: "2026-07-16",
		surfaces: ["api"],
		version: "spec 1.7.28",
		type: "fixed",
		summary:
			"searchResearch brand/lookup queries: a chunk containing EVERY query token verbatim is now fetched into the pool even when cosine retrieval missed it, and carries a relevance floor of 0.8. Live failures this fixes: bare q=Alchemy returned 0 results (the lone-word embedding's nearest neighbours were all low-value chunks), and 'Alchemy Stellar Data API transfers balances' ranked the official Indexers chunk that literally documents Alchemy's Data API below top-15, behind pages merely titled 'Balances'/'Token Transfers'.",
		detail:
			"Same fetch-not-rank root as the sls-019 identifier lookup and the recency supplement: the pool is supplemented with full-lexical-coverage chunks (AND-match over ≤8 de-pluralized query tokens; gated on the vector pool lacking any full-coverage chunk so the hot path pays the extra find only on a real miss), each carrying its REAL stored-embedding cosine. Ranking floors full-coverage relevance at 0.8 — under curated anchors (0.85) and exact CAP/SEP IDs (0.9), so genuinely-closer embeddings still win and raw cosine orders full-coverage peers. The floor applies only while coverage is DISCRIMINATING (at most 5 chunks in the pool carry it): the first deploy floored generic-vocabulary coverage and regressed 3 golden cases ('SCF handbook link' served seven uniform-floored pages containing scf/handbook/link over the actual handbook root) — widely-covered tokens are not a lookup key. scoreModel.note documents the floor and its gate.",
	},
	{
		date: "2026-07-15",
		surfaces: ["api"],
		version: "spec 1.7.27",
		type: "fixed",
		summary:
			"`/api/projects/search` result counts are now computed AFTER canonical deduplication (sls-056). `meta.counts.returned` and `total` previously counted the pre-fold page, so a query whose results included a lineage-shadow duplicate reported more rows than the payload carried — e.g. q=OrbitCDP served one canonical row while both counts said 2. Counts now hold the invariants returned === projects.length and total >= returned.",
		detail:
			"The shadow-fold (a merged-away duplicate whose canonicalSlug points at the surviving record is swapped for its canonical, or dropped if the canonical is already present) and the status/type belt-filters run AFTER the page is assembled, so counting `projects.length + semanticAdds.length` over-reported by exactly the rows those steps removed. `returned` is now the served array length; `total` subtracts the same per-page fold delta from the pre-slice match total (still ≥ returned). No response-shape change — only the count values are corrected.",
	},
	{
		date: "2026-07-14",
		surfaces: ["api"],
		version: "spec 1.7.26",
		type: "added",
		summary:
			"searchResearch now answers SDF leadership-role questions and stamps crawl-observation dates. The Team page's per-member ROLES ('Founder and Chief Scientist', 'VP of Ecosystem') live only in the page's embedded card data — a plain <main> scrape yielded a role-less name list — so ingestion now recovers the Name→Role roster from that embedded data. Every research chunk also carries a new `observedAt` (crawl-observation date: when ingest last observed the content live at the source), distinct from `publishedAt` (the source's own stated date).",
		detail:
			"Team-page extraction parses the embedded Sanity card blocks (fail-safe: if the structure changes the ingester's signature guard REFUSES the page rather than silently re-ingesting a role-less list); the leadership roles are now registered signatures. `observedAt` is stamped on every ingest run — re-written even when content is unchanged (metadata-only, no re-embed) — so it reflects last-observation, not last-change like Payload updatedAt. First lit on the sdf-org corpus.",
	},
	{
		date: "2026-07-14",
		surfaces: ["api"],
		version: "spec 1.7.25",
		type: "fixed",
		summary:
			"Leaderboard `type` filter correctness + documentation (#524): the `type` param added in 1.7.23 was served but (a) undocumented in the OpenAPI spec and (b) matched by SUBSTRING — so type=DEX false-included Indexer/Codex rows. It now uses exact whole-element membership, documents the `type` query parameter with its full enum and multi-value (repeatable + comma-separable, EITHER-membership) semantics, and echoes the applied scope at meta.filters.type.",
		detail:
			"Root cause: Payload's contains operator compiles to a case-insensitive substring regex, so as an array-membership filter it silently leaks partial matches (projects/search stayed correct only because it also post-filters in JS). The leaderboard now selects with the exact `in` operator and re-asserts membership with a JS backstop — the same belt-and-suspenders gate. Documenting the previously-undocumented `type` param also closes a served-but-undocumented drift. No response-schema field change: each row already carried `types`.",
	},
	{
		date: "2026-07-14",
		surfaces: ["api"],
		version: "spec 1.7.24",
		type: "changed",
		summary:
			"Golden-eval standing-miss fixes: searchResearch recency-intent queries now pool-supplement the corpus's newest publication-dated docs (fetch-stage fix — the Protocol 27 'Zipper' announcement never entered the vector pool for 'latest soroban release') and stop counting dev-docs 'Last updated' maintenance dates as publication evidence in the recency re-rank; a curated vertical-anchor registry floors relevance for the canonical docs of a recognized consumer intent (first vertical: bridge-assets — the CCTP cross-chain-transfers how-to and the Allbridge Soroban bridge audit); searchRepos gains a streaming-payments vertical flagship set (fluxity/sstream — canonical Stellar streaming repos whose descriptions carry no 'streaming payments' tokens).",
		detail:
			"Supplemented chunks are scored with their real stored-embedding cosine on the same scale as the vector pool — no invented relevance; anchor docs are direct-fetched into the pool when the vector stage missed them (the sls-019 inclusion-not-just-ranking principle). Also fixes a JSON-over-escaped regex in the scf-handbook-link golden lock (the expectation could never match any URL; retrieval was already serving stellar.gitbook.io/scf-handbook at rank 1).",
	},
	{
		date: "2026-07-14",
		surfaces: ["api"],
		version: "spec 1.7.23",
		type: "changed",
		summary:
			"Three consumer-reported contract fixes: projects rows gain optional productKind/availability wallet-taxonomy fields (sls-033/#519); /api/builders rejects unsupported query params with 400 + supportedParams, closing the Engine E invalid-accepted class (#521); /api/leaderboard gains a validated type filter (was silently ignored) + per-row types (#524).",
		detail:
			"Wallet productKind (hardware-wallet | mobile-app | browser-extension | web-app | protocol | sdk-kit) + availability serve where curated (null = not-yet-classified, never a negative claim). Unsupported-param rejection is additive-safe (only previously-ignored params now 400). Leaderboard type validates against the projects types enum, filters at the DB layer before ranking.",
	},
	{
		date: "2026-07-14",
		surfaces: ["api", "mcp"],
		version: "spec 1.7.22",
		type: "added",
		summary:
			"sls-055/#533: new 'sdf-org' research source — canonical non-blog stellar.org organizational pages, quotable. Covers the SDF Mandate (current + 2019/2017 historical, incl. the self-funded / pays-taxes structure wording), Terms of Service (incl. the Delaware non-profit corporation wording), Foundation, Team (leadership + board roster), Enterprise Fund (venture-style fund, portfolio totaling over $100m), and the Quarterly Reports index.",
		detail:
			"searchResearch's `source` enum gains 'sdf-org'. The page family is declared once in a CANONICAL_PAGES registry (URL + per-page verbatim signature phrases, verified live 2026-07-13) that drives BOTH the ingester (scripts/ingest-sdf-org.ts: rendered-page text scoped to the page's main element, publishedAt only when the page states a date, e.g. the Terms effective-date line) and a weekly corpus-coverage class guard that reds the health tracker if any family member's page or quotable wording goes missing — the sls-020 security-program pages are folded into the same registry, so the family is guarded as a class rather than patched per query. Corpus rows land with the next research-corpus refresh after deploy.",
	},
	{
		date: "2026-07-14",
		surfaces: ["api-client", "mcp"],
		type: "changed",
		summary:
			"@stellar-light/api-client 1.6.0 (major-minor: the never-populated builder `scfTier` property is REMOVED from generated types — matching the live contract — alongside six spec revisions of new fields: `identity`, `routes`, `venueRole`, status provenance, `llamaSlugs`/`tvlMethodUrl`, funding snapshot deltas, the `type`/`status` filters, and the `security-program` research source) and @stellar-light/scout-mcp 1.1.10 (terse tool descriptions per the sls-051 split, `cap` + `security-program` source enums, scfTier claim removal).",
		detail:
			"If you generated against api-client 1.5.3 (spec 1.7.15-era), regenerate once against 1.6.0 for the 1.7.16→1.7.21 union. The only removal is builder `scfTier` (was empty string on every row since introduction; the live API stopped emitting it in spec 1.7.19 per sls-040/#521).",
	},
	{
		date: "2026-07-13",
		surfaces: ["api", "mcp"],
		version: "spec 1.7.21",
		type: "added",
		summary:
			"sls-020: new `security-program` research source — SDF's bug-bounty / vulnerability-disclosure program status. Covers the 2026-05-07 consolidation into a single HackerOne program (general Stellar Immunefi program deprecated; the OpenZeppelin-on-Stellar Immunefi bounty remains active and separate) and labels the stale stellar.org bug-bounty landing page as superseded for program-status claims.",
		detail:
			"searchResearch's `source` enum gains 'security-program' (records ingested from the live HackerOne program policy via public GraphQL, publishedAt from the policy's own effective date, plus a curated dated supersession record). The scout-mcp source enum also gains the previously-missing 'cap' value — the MCP wrapper was rejecting a filter the live API serves; both MCP changes ride the next npm publish.",
	},
	{
		date: "2026-07-13",
		surfaces: ["api"],
		version: "spec 1.7.21",
		type: "fixed",
		summary:
			"sls-019: exact CAP/SEP identifier queries now retrieve their own document at rank 1 (q=CAP-0038 had ranked its target 23rd), and source-filtered pages no longer serve duplicate chunks of one document while distinct in-source documents exist (q=Asset+Clawback&source=cap had served cap-0035.md 9× in one page). sls-022: the YieldBlox incident record now carries verified facts — event 2026-02-22, completed drain of 61,249,278 XLM + ~1,000,197 USDC (≈$10.2M USD), pool-operator oracle misconfiguration (USTRY/Reflector), ~48M XLM later quarantined (quarantine ≠ recovery) — replacing the wrong 'May 2026, attempted & contained, $61M' row.",
		detail:
			"Identifier forms (CAP-38 / cap 0038 / sep#10 / SEP-0024 …) normalize to the canonical slug; the named document is pinned above vector order with relevance floored at 0.9 (the scoreModel note now states exact-identifier matches rank first). If the vector pool misses the named doc it is fetched directly by ID. Source-filtered $vectorSearch surveys a deeper candidate pool BEFORE the source $match and re-trims after it, so the best-chunk-per-document collapse has enough distinct documents to fill a page. Golden eval gains exact-ID rank-1 locks (cap-0021/0038/0058), a no-duplicate-URLs dedup lock, a security-program transition lock, and a YieldBlox incident-facts lock (forbids 'May 2026 attempted' and '$61M' renderings).",
	},
	{
		date: "2026-07-13",
		surfaces: ["api"],
		version: "spec 1.7.20",
		type: "added",
		summary:
			"sls schema wave (all additive): sls-032 #516 — project rows gain nullable `routes` (curated route-level bridge evidence: `fromChain`/`toChain`, `direction`, `assets`, `assetRepresentation` canonical|wrapped|bridged|interchain, `mechanism`, `sourceUrl`, `asOf`; null = not curated, NEVER 'no routes'; a Bridge project hit stays discovery-only). sls-035 #517 — rows gain nullable `venueRole` (amm | native-orderbook | aggregator-router | trading-ui | wallet-integrated) so a DEX cluster count stops reading as a competitor count. sls-036 #524 residual — getLeaderboard meta gains `dataAsOf` (the repo-index rollup timestamp the served github numbers are as-of; distinct from `generatedAt`). sls-039 #522 — rows gain `llamaSlugs` (the mapped DefiLlama identifiers `tvlMethod` refers to) + `tvlMethodUrl` (provider citation URL; the provider page carries the full TVL time series — this API serves the dated current point). sls-044 #520 — analyze funding gains `snapshotAsOf`, `previousSnapshot`, `snapshotDelta` (`addedProjects`/`removedProjects` slug lists + `removedReasons` with mechanical codes dedupe | eligibility-reclassification | source-correction | unknown), `deltaBasis`, and an explicit `deltaUnavailable` reason when no comparison exists yet.",
		detail:
			"Response-shape notes: `routes` and `venueRole` are curator-populated (grounded in provider docs with source URL + as-of date) — most records serve null, which means UNKNOWN/not-yet-curated, never a negative claim; do not answer canonical-USDC route questions from a bare Bridge project hit (that is the sls-032 finding — quote-time facts like fees/availability are intentionally not encoded). `llamaSlugs`/`tvlMethodUrl` serve the existing enricher mapping (null = not DefiLlama-tracked, matching `tvlUSD` semantics). Funding delta: snapshots persist server-side one-per-set-state (keyed by `projectSetHash`); the first read after this deploy serves `deltaUnavailable` honestly until a second, different set state is observed. First curated data rides the same wave: bridge routes for usdc-swap / allbridge / estrela / CCTP (rubic deliberately not route-encoded — its evidence is chain-level integration, and an aggregator's asset outcome is quote-time), and `venueRole` for the ten clearest DEX-landscape records (soroswap/aquarius/phoenix/sushi/comet = amm, stellarterm/stellarx = trading-ui, lobstr/scopuly = wallet-integrated, stellarbroker = aggregator-router).",
	},
	{
		date: "2026-07-13",
		surfaces: ["api", "mcp", "skill"],
		version: "spec 1.7.19",
		type: "removed",
		summary:
			"sls-040 (upstream #521): removed the always-blank `scfTier` field from /api/builders rows. The source field was never populated (116/116 live profiles empty), so the emitted empty string contradicted the documented contract that SCF-tier data is unsupported — an observable ambiguity a machine consumer could misread as a supported-but-empty signal. Builder rows no longer carry the key at all.",
		detail:
			"getBuilders response rows drop `scfTier` entirely (it was \"\" on every row; no consumer could ever have read a real value from it). The routing guidance is unchanged: SCF-tier/award-track filtering remains unsupported on /api/builders — a project's award history lives on /api/projects/search rows. If person-level SCF tier ever gains a real source it will return as a typed, documented field with provenance, per #521's option 2. The MCP get_builders tool description and the skill API reference now state the removal. Note: an unsupported scfTier QUERY parameter is still silently ignored (no 4xx) — explicit unknown-param rejection is tracked separately.",
	},
	{
		date: "2026-07-12",
		surfaces: ["api"],
		type: "added",
		summary:
			"sls-050: rename continuity as structured data. Project rows gain a nullable `identity` block ({currentName, aliases, renamedAt, sourceUrl}) served whenever a record carries former names; alias lookups now rank as exact-name matches in searchProjects (q=vibrant resolves to vesseo with the continuity disclosed, not via invisible synonyms). Additive.",
		detail:
			"Response shape (byte-aligned with the OpenAPI schema): project rows gain an optional nullable `identity` object — `identity.currentName`, `identity.aliases` (array), `identity.renamedAt`, `identity.sourceUrl` — served only when a record carries former names; NO new top-level fields. Search: aliases join the candidate query and name matching (exact alias = exact-name rank). First populated record: vesseo (formerly Vibrant). The general mechanism replaces per-case synonym patches for renames. (Detail corrected 2026-07-13 per consumer report sls-054: the original sentence described internal storage field names, not the served shape.)",
	},
	{
		date: "2026-07-12",
		surfaces: ["api"],
		type: "changed",
		summary:
			"sls-052 + sls-053: x-routing vocabulary curation (repo-health terms on getLeaderboard, SDF-organizational terms on searchResearch, stack+role terms on getBuilders — the three families measured as unrecovered at the 1.7.16 absorb) and the skills directory now derives the SDF catalog from skills.stellar.org/llms.txt (24h cache): superseded `soroban` is gone; `smart-contracts`, `setup-stellar-contracts`, and `agent-browser-webauthn` now listed.",
		detail:
			"x-routing additions are additive curation inside the 1.7.16 structure — descriptions unchanged, capture guards hold. The routing-surface CI check gains the inverse guard sls-052 recommends: each operation's x-routing must cover the vocabulary of the question families it is expected to win. Skills consumers should refresh: the soroban slug no longer appears; smart-contracts is the maintained successor.",
	},
	{
		date: "2026-07-11",
		surfaces: ["api"],
		version: "spec 1.7.16",
		type: "changed",
		summary:
			"sls-051 structural fix — operation descriptions rewritten as terse purpose statements (every one now ≤600 chars; searchProjects was 2,330, searchResearch 2,395), and the routing vocabulary they carried (category/product enumerations, synonym chains, question exemplars) MOVED — not deleted — to a new machine-readable `x-routing` extension on each operation: {purpose, keywords[], useWhen[], notFor[], exampleQuestions[]}. WHY: enumeration-heavy description prose was lexically capturing question families other operations answer (22/122 extended-lane docs-shaped questions ranked searchProjects top-1 at the 1.7.15 absorb), and each prose repair just moved the capture to a new family — 1.7.15 fixed editorial capture and created docs capture. Consumers that cached operation descriptions should re-baseline against 1.7.16; lexical/embedding routers should score `x-routing` as separately-weighted fields rather than concatenating it into the description (convention documented in info.description under 'Routing metadata').",
		detail:
			"17 operations shrank (before→after chars): searchResearch 2395→399, searchProjects 2330→362, getLeaderboard 1551→390, analyzeEcosystem 1510→390, searchRepos 1436→381, getBuilders 1321→353, getClusters 1241→382, getRfps 1174→385, getHackathon 1066→364, getHackathons 1061→384, compareHackathons 928→370, listSkills 890→398, explainRepo 826→370, getStatus 757→309, getPartners 738→393, getSkill 720→369, partnerAssistant 659→374. No parameter or response-shape changes — operation descriptions + the additive x-routing extension only. Guarded in contract CI by scripts/eval/routing-surface-check.ts: asserts every description ≤600 chars and that sls-051's docs-shaped probes ('which Wasm target does the current Stellar CLI build to?' et al.) never rank searchProjects' description as top token-coverage nor ≥0.35 absolute. scout-mcp tool descriptions received the same shrink and ride the next npm publish.",
	},
	{
		date: "2026-07-11",
		surfaces: ["api-client", "mcp"],
		type: "changed",
		summary:
			"@stellar-light/api-client 1.5.3 + @stellar-light/scout-mcp 1.1.9 published: client types regenerated for spec 1.7.15 (status + type filters, meta.warnings, provenance fields statusAsOf/statusSourceUrl/statusBasis + tvlSource/tvlMethod, builder match provenance, rfps rowType, analyze tvl dimension, population digests); MCP search_projects gains the status param and drops the false scfTier claim from get_builders.",
		detail:
			"If you generated against api-client 1.5.1 (spec 1.6.1-era) or 1.5.2, regenerate once — three spec revisions (1.7.13/1.7.14/1.7.15) landed between publishes. All changes additive.",
	},
	{
		date: "2026-07-11",
		surfaces: ["api"],
		version: "spec 1.7.15",
		type: "added",
		summary:
			"sls-041..050 wave (all additive): getBuilders rows carry `match` (matchedFields/matchedProjects/matchedTerms — WHY a skill query hit) + `codeEvidence` (indexed repos owned by the builder that match the query) + meta.matchBasis; getClusters no longer truncates its input at 500 active projects and both it and analyzeEcosystem carry a `meta.population` scope digest (id/totalAvailable/included/truncated — identical ids ⇒ comparable numbers); getStatus sources gain `populationId`; analyze funding gains `projectSetHash` (stable digest of the awarded-project SET — distinguishes amount corrections from membership changes across snapshots); getRfps rows carry a `rowType` discriminator ('rfp' vs synthetic 'scf-round') + counts.syntheticRounds + meta.countBasis (open counts briefs; returned counts rows); searchRepos rows carry `stellarEvidence` (code-verified/sdf-org/curated/mentioned/none — why a repo ranks), scanned-but-proof-'none' repos no longer rank as Stellar-proven, and `codeVerified.isDeployableContract` is pinned false for known platform/SDK/tooling repos (stellar-core, rs-soroban-env, CLI/SDKs — their cdylibs are runtime/fixtures, not deployable products); searchProjects anchorProfile gains `profileState` + meta.anchorProfileBasis (empty capability arrays = unknown, never a negative claim).",
		detail:
			"Data fixes riding the wave: Band award facts aligned to the official SCF record (SCF #16, $60K — the canonical row's unsourced #41/$100K corrected); Bitso anchor profile filled from Bitso's own sources (USDC on/off-ramp over Stellar); Vibrant→Vesseo rename mapped bidirectionally in search synonyms. Regression guards ship in the daily self-audit (band award lock, rfps row/count contract, clusters⇄analyze population parity, stellar-core classification, zero-knowledge ranking evidence, vibrant→vesseo recall).",
	},
	{
		date: "2026-07-11",
		surfaces: ["api"],
		type: "changed",
		summary:
			"Version disambiguation: spec bumped to 1.7.14 with no contract change. Two parallel additive changes (status/TVL provenance fields; type filter + leaderboard metricDefinitions + analyze tvl dimension + repo alias recall) both shipped labeled 1.7.13, so for a window that version string covered two different contracts. 1.7.14 marks the union state so drift CI re-baselines cleanly.",
		detail:
			"No fields or operations change in this bump. If your catalog was generated from 1.7.13, regenerate once against 1.7.14 to be certain you have the union (both changelog entries dated 2026-07-11 describe the two constituent changes).",
	},
	{
		date: "2026-07-11",
		surfaces: ["api"],
		version: "openapi@1.7.13",
		type: "added",
		summary:
			"Contract-honesty batch (sls-025/033/036/038/040): searchProjects gains a real `type` filter (?type=Wallet now filters server-side on types[] membership — it was silently ignored; unknown values 400 with validTypes; echoed in meta.filters.type). analyzeEcosystem gains `dimension=tvl` and serves the TVL rollup the description promised (totalTvlUSD + top10 by tvlUSD, DefiLlama-sourced, asOf-dated; also in dimension=all). getLeaderboard responses carry meta.metricDefinitions defining every served metric (issues = OPEN-issue backlog rollup, issue-only excluding PRs — a backlog snapshot, not activity; activity/lastActivityAt = latest default-branch commit across indexed repos; repoCount = indexed-repo coverage). searchRepos recall: owner-segment and separator-insensitive alias matching (q=progax01, q=stellar8004, q=subquery/stellar-subql-starter now resolve; erc/eip/src-NNNN standards tokens expand to their number), and zero-result pages carry meta.searched (tokens + expansions + fields searched) stating an empty page is NOT evidence of nonexistence. getBuilders descriptions no longer advertise SCF-tier/award-track recruiting (every live scfTier value is empty; the response field remains, explicitly labeled unpopulated).",
		detail:
			"All additive; nothing removed or renamed. New optional response members: searchProjects meta.filters.type; analyze `tvl` block (+ 'tvl' in meta.validDimensions); leaderboard meta.metricDefinitions; searchRepos meta.searched (zero-result responses only). searchRepos ranking: an exact owner/name/path alias match now outranks keyword/semantic neighbors (below curated canonical/flagship floats); other queries rank as before. Consumers that treated q=wallet keyword results as a Wallet-type roster should switch to ?type=Wallet.",
	},
	{
		date: "2026-07-11",
		surfaces: ["api"],
		type: "added",
		summary:
			"Provenance fields on searchProjects rows (sls-023/024/029/031, additive): `statusAsOf` (when the lifecycle label was last asserted, ISO 8601), `statusSourceUrl` (primary evidence URL), `statusBasis` (what KIND of evidence: operator-announcement | site-liveness | onchain-activity | human-verified | source-inherited), `tvlSource` (which source produced tvlUSD, e.g. 'defillama'), `tvlMethod` (how it was computed — inclusion scope for reconciling cross-source differences). Data: DTCC corrected Live → Development (its own announcement says DTC tokenization on Stellar is expected H1 2027 — an entity being live is not a live Stellar deployment); Band + Lightecho oracles gain supportedNetworks from primary evidence (Stellar-docs-listed mainnet contract + Band's own Soroban repo; Lightecho's README mainnet contract).",
		detail:
			"All five fields are optional/nullable and null on legacy rows — zero writes to existing data; curation and the TVL enricher populate them going forward. Semantic-fallback rows also now carry tvlUSD/tvlAsOf (they were silently null on that path). Consumers should read a bare status as source-relative and undated; statusBasis 'operator-announcement' can describe PLANS (like DTCC's H1-2027 target), so pair it with statusAsOf and the description before claiming a live deployment. Cite TVL as '<tvlSource> as of <tvlAsOf>' — concurrent sources legitimately differ by pricing time and inclusion scope.",
	},
	{
		date: "2026-07-11",
		surfaces: ["api"],
		type: "added",
		summary:
			"searchProjects intent upgrades (spec 1.7.12): new `status` filter (the 81-record Inactive corpus is now reachable: ?status=Inactive); unknown query params are no longer silently ignored (meta.warnings names them and points at the supported set); 'X vs Y' comparison queries guarantee BOTH named subjects in results; TVL-superlative queries ('highest tvl') admit and rank the actual tvlUSD leaders; negated prose ('non-custodial') no longer matches the positive intent ('custody'). Research: recency-intent queries ('latest/recent/current…') rank by dated freshness — evergreen-doc scoring no longer serves a 2024 protocol section for 'latest soroban release'.",
		detail:
			"All additive; nothing removed or renamed. meta.warnings is a new optional string[] on searchProjects responses; meta.filters gains `status` (echoed, null when absent). Ranking changes are query-intent-scoped: plain topical queries rank exactly as before; only vs/tvl/recency/negation intents change. Consumers that guessed unsupported params (country/sep/network) now get an explicit warning instead of silently-unfiltered results — put those terms in q (structured coverage is matched from query text).",
	},
	{
		date: "2026-07-10",
		surfaces: ["api"],
		type: "changed",
		summary:
			"Liveness wave: 38 provably-defunct projects flipped Live → Inactive (each individually researched with positive evidence — shutdown notices, parked/unregistered domains, abandoned footprints — recorded on the row as lifecycle.note, e.g. Whalestack wound down to a BTCPay redirect; nTokens discontinued the BRL anchor; Lumenaut's inflation pool ended with Protocol 12). 13 records whose PRODUCT is alive got their dead recorded URL repointed (stellarbeat → OBSRVR Radar, fastbuka → Choppaddi rebrand, afriex, xycloans, arst…). chainatlas merged into chainsatlas (duplicate).",
		detail:
			"Directory truth change only — no shape change. Live count 871 → 832. Inactive records stay name-searchable (heavily down-ranked) and now explain themselves via lifecycle.note; they drop out of active listings, leaderboard, clusters and funding aggregates. Methodology + full evidence table: the liveness triage in our changelog-linked improvements notes.",
	},
	{
		date: "2026-07-10",
		surfaces: ["api-client"],
		version: "api-client@1.5.1",
		type: "fixed",
		summary:
			"Types catch up to openapi 1.7.9-1.7.11: matchMode union gains 'semantic', meta.counts gains optional `semantic`. Consumers on 1.5.0 narrowing matchMode exhaustively hit an unknown value at runtime when the API serves a semantic-fallback page — update to 1.5.1.",
		detail:
			"Generated-types-only release; no runtime behavior change in the client.",
	},
	{
		date: "2026-07-10",
		surfaces: ["api"],
		type: "changed",
		summary:
			"Duplicate project records merged (12 pairs, e.g. stellar-expert/stellarexpert, soroban-pulse/sorobanpulse, coins-ph/coinsph): each pair was ONE project split across an SCF-funded record and a lumenloop-enriched record, splitting funding/description/repos between rows. The canonical record now carries the complete facts; the duplicate stays name-searchable as a lineage shadow (canonicalSlug → canonical, status Inactive, lifecycle.note explains). No records deleted; no shape change.",
		detail:
			"Consumers resolving a shadow should follow its canonicalSlug pointer for funding/status/repos. Aggregates (analyze funding, clusters, leaderboard) already exclude Inactive rows, so per-project stats stop double/under-counting. Repo enrichment now links repos only to canonical records.",
	},
	{
		date: "2026-07-10",
		surfaces: ["api"],
		version: "openapi@1.7.11",
		type: "changed",
		summary:
			"searchResearch title-match refinement: a query naming a record's protocol field exactly (q='hiyield audit') now counts as a FULL title match — previously the generic token 'audit' gave the named record and an off-protocol audit the same boost, and the wrong record kept #1 on a 0.01 cosine edge (1.7.10 live-verify residual).",
		detail:
			"Ranking-order change only; no shape change. Unit test pins the real-world case (both titles contain 'Audit Report', only the protocol field discriminates).",
	},
	{
		date: "2026-07-10",
		surfaces: ["api"],
		version: "openapi@1.7.10",
		type: "changed",
		summary:
			"searchResearch ranking overhaul (audit R2, worst cell at 12%): dated meeting recaps (developers.stellar.org/meetings/YYYY/MM/DD) no longer ride dev-docs' canonical authority + evergreen freshness — they now score as meeting-notes (authority 0.5) with their URL date as freshness, so a one-line recap can't outrank the CAP/doc it mentions. Crawl-artifact rows (author archives, pagination mirrors) are dropped at serve time and pruned from the corpus. Exact-duplicate content mirrored across URLs collapses to one row. A title-match signal now feeds relevance ('Install the CLI' ranks top for q=install stellar cli; named-protocol audit lookups match the protocol field). Deeper candidate pool (8×) so 'best chunk per document' actually yields distinct documents.",
		detail:
			"Also ingest-side (lands with the next corpus refresh): CAP/SEP titles read the preamble Title: field first (cap-0066/sep-0020 carried mid-document body fragments as titles); dev-docs rows get publishedAt from the pages' own 'Last updated on' footer (was null on 100% of rows). Ranking-order change only — response shape unchanged; meeting rows now serialize their URL-derived publishedAt instead of null.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.9",
		type: "changed",
		summary:
			'Semantic-fallback honesty on searchProjects (audit R1): when NO keyword tier matches and results come from the vector fallback, meta.matchMode now says `semantic` (new enum value) with an honest matchModeLabel — previously it claimed `strict`/`majority` ("all keywords matched") over pure similarity guesses. Semantic rows\' confidence is now computed from the ABSOLUTE cosine band and hard-capped below `high` (max 0.7 / medium) — the top fallback guess no longer reads 0.9+ "high". meta.counts gains `semantic` (rows on this page served by the fallback).',
		detail:
			"Why: an agent consuming a confident wrong answer is worse off than with an empty set. Keyword-matched rows are unchanged. Additive/labeling change — no rows removed, ranking order unchanged (semantic adds still append below keyword hits). Consumers pinning matchMode enums should add `semantic`.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.8",
		type: "added",
		summary:
			"F7+F8 (audit root #8): cross-lane hints — empty or weak-match responses on searchProjects/searchRepos/searchResearch/getPartners now carry meta.hints pointing at the lane that answers ('code → /api/repos/search', 'providers → /api/partners'…); superlative queries ('biggest dex') get meta.superlativeNote stating result order is NOT a size/usage ranking; Project rows gain tvlUSD/tvlAsOf (DefiLlama, weekly refresh; null = not tracked, never zero).",
		detail:
			"Also: single-word camelCase known-item queries fixed (q=DeRisk missed the record named DeRisk — the raw joined form now participates alongside the split tokens; Engine A run-1 catch). Hints appear ONLY on empty/relaxed-tier responses — healthy strict results are unchanged.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.7",
		type: "changed",
		summary:
			"searchRepos ranking: Stellar evidence now ranks ABOVE raw keyword score (3-tier: code-verified/SDF/canonical > stellar-mentioned incl. README > no evidence) — org-swept other-chain repos no longer beat code-verified Stellar repos on niche verticals. Repo owner is now searchable (q=allbridge reaches allbridge-io/*). explainRepo gains an honesty guard: an unmapped question whose best search hit shares no query token returns the no-route response with nearest candidates as alternateRepos, instead of confidently explaining a lexical-noise repo.",
		detail:
			"Ranking-order change only — response shapes unchanged; no operation description text changed. Values re-rank immediately; 3 unit tests pin the policy.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.6",
		type: "added",
		summary:
			"searchResearch gains the `cap` source — Core Advancement Proposals (stellar-protocol/core) join the corpus at SEP-tier authority, closing the audit's biggest protocol-lane gap (CAP-number queries previously fell through to meeting-notes junk). Dev-docs ingestion also extended: the page cap no longer truncates ~400 reference pages (tokens/asset-issuance, validators, learn), and author/pagination junk URLs are excluded at the source.",
		detail:
			"New corpus content lands with the next scheduled refresh-research-corpus run. cap chunks are evergreen (no freshness decay), authority 1.0, filterable via ?source=cap.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.5",
		type: "fixed",
		summary:
			"getRfps: an SCF round in Submission phase is now served as a first-class OPEN row (id scf-round-N, category scf, links to the handbook + application page) — previously the live open-round fact existed only in meta.scfRound while every idea row read closed, so row-reading agents concluded no funding was open (observed in a live Raven session, reported by Emir/SDF).",
		detail:
			"Additive row, appears under status=open and default listings while a round is accepting submissions; disappears when the window closes. Daily self-audit now asserts the phase⇔row contract in both directions.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.4",
		type: "fixed",
		summary:
			"searchProjects semantic lane (F3, audit root #3): semantic-augmented rows now serialize `types` and `prominence` (previously always []/null — a projection bug); zero-keyword-hit queries (misspellings, slug forms) get a semantic RESCUE pass at a lower similarity floor instead of a dead total:0; keyword confidence now discriminates by match completeness (was a uniform ~0.97 across a page).",
		detail:
			"Rescue results are flagged by the existing meta.semantic; the calibrated 0.68 floor still guards augmentation on top of keyword results. Confidence values shift for partial matches (2-of-3 tokens now reads lower than a full match) — consumers sorting by confidence get honest ordering.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.3",
		type: "fixed",
		summary:
			"Search lexical core (F2, audit root #2): iterative stemming (donations/donate, savings/save, charities/charity now co-retrieve), currency NAMES map to stored codes ('kenyan shilling' → KES rows), relaxed match tiers must keep the intent-bearing rare token (generic verbs like buy/get/send can no longer be the only match — 'peruvian sol' no longer floods on 'sol'), repo symbol search handles digit-boundary identifiers (groth16, secp256r1, ed25519, ScVal). Builders: 'south america'/'central america' location umbrellas.",
		detail:
			"Values/recall only, no shape changes. matchMode semantics unchanged except loose-1/majority additionally require an anchor-token hit; all-generic queries behave as before.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.2",
		type: "fixed",
		summary:
			"searchProjects recall (F1, full-surface audit root #1): a record's `types` and `coverage.seps` now drive candidate INCLUSION, not just ranking — type-browse queries ('social impact projects', 'education', 'decentralized exchange') and SEP queries ('sep-24 anchors') retrieve records whose prose never says those words. getBuilders: `q` now matches githubUsername, and location accepts common non-English spellings (brasil, méxico).",
		detail:
			"The audit measured type-name retrievability at 3/15 (Social Impact) to 63/141 (SDK) because select fields were excluded from the candidate query; they now join via exact-membership clauses driven by the intent-type map (new browse vocabulary: exchange, education, analytics, dashboard, security, impact, ai, infrastructure). Additive recall only — existing results keep their ranking.",
	},
	{
		date: "2026-07-09",
		surfaces: ["skill"],
		type: "fixed",
		summary:
			"Scout skill api-reference caught up to the OpenAPI 1.7.x surface (stellar-scout#8): getPartners now documents the `ramps` filter and the typed Partner row (rampTypes/seps/assets/freshness/trust/verified); explainRepo and searchRepos document the full codeVerified block (symbols, sdkCapabilities, mainnetContractId) and the code-depth term in repoScore.",
		detail:
			"Skill prose is bundled by downstream agents as runtime guidance, so it lagging the spec meant agents missed callable capabilities. Synced to the Stellar-Light/stellar-scout mirror in the same change.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.1",
		type: "changed",
		summary:
			"searchResearch results are now trust-ranked and deduplicated: one best chunk per document, ordered by the confidence signal (relevance + freshness + authority) instead of raw retrieval score. Duplicate chunks of a single post no longer crowd the top-K, and semantically-close but stale docs (e.g. a 2022 never-productionized research protocol) no longer outrank current sources on consumer-intent queries.",
		detail:
			"Motivating case: 'bridge assets from EVM to Stellar' returned Starbridge (2022) chunks twice while CCTP/Allbridge content sat below the fold; now the top-K carries the Allbridge/Spectra/Tricorn bridge audits + CCTP-bearing integration docs. Response shape unchanged (raw `score` still returned per row); only ordering and per-document dedupe changed. Golden eval: 21/21 pre-existing research questions unchanged, new bridge-evm-to-stellar case added.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.0",
		type: "changed",
		summary:
			"Spec info.version bumped 1.6.1 → 1.7.0, covering the 2026-07-08/09 contract additions that shipped under an unchanged version: codeVerified.symbols/sdkCapabilities/mainnetContractId, Project.canonicalSlug/lifecycle/anchorProfile, typed Partner/PartnersResponse, and the getPartners `ramps` filter.",
		detail:
			"Going forward info.version bumps with every observable contract change (including description-only changes), so downstream catalogs can use it as a staleness signal instead of diffing the whole document.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api", "api-client"],
		type: "fixed",
		summary:
			"getPartners gains a real `ramps` filter (`on-ramp` / `off-ramp`, comma-separated to require both; unknown values 400 with `validRamps`). CORRECTION: a fix-verification note on the public tracker cited `?ramps=on-ramp` as a probe before this param existed — the endpoint silently ignored it and returned the unfiltered set. The advertised contract is now the implemented contract.",
		detail:
			"Filters on the structured Partners.rampTypes capability field (the same data the `q` relevance scorer already weighted). meta.filters echoes `ramps`; meta.validRamps lists accepted values. Corridor lookups compose: ramps=on-ramp&q=mexico.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api-client"],
		version: "@stellar-light/api-client@1.5.0",
		type: "added",
		summary:
			"api-client 1.5.0 published: regenerated types for spec 1.6.1 — codeVerified gains `symbols`, `sdkCapabilities`, `mainnetContractId`; Project gains `canonicalSlug`, `lifecycle`, restored `anchorProfile`; partners responses are now fully typed (Partner/PartnersResponse schemas).",
		detail:
			"Registry-verified: the published d.ts carries the new codeVerified fields. Consumers on 1.4.x see the new response fields as untyped extras; upgrade for autocomplete/type-safety on code-facts data.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api", "api-client"],
		type: "fixed",
		summary:
			"codeDepth accuracy: tiered Stellar-path file selection fixes monorepo dilution for JS/TS repos (multi-chain SDKs/wallets whose Stellar integration files were displaced by bigger non-Stellar files now score on their actual Stellar code), and Rust workspace breadth now scales with evidenced-deep crates instead of raw declared-crate count (stub Cargo.toml padding no longer inflates depth).",
		detail:
			"Affected JS repos re-score on their next scan wave (multi-chain SDK/wallet monorepos — previously under-scored). No shape changes; values only. Answer-key gate now 12 JS deep + 14 shallow labels, margin 0.110.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api", "api-client"],
		type: "changed",
		summary:
			"codeDepth for JS/TS dapps is now the calibrated jsDepth, not a flat 0.3. A repo's `codeVerified.codeDepth` now separates real Stellar integration (wallets, dapps, SDKs — 0.5-1.0) from boilerplate/templates (≤0.3) for js-sdk repos, using the same 0-1 scale as Rust contracts. Grounded in a 29-label adversarially-verified answer key + CI gate.",
		detail:
			"Only js-sdk-proof repos with actual JS sources are re-scored; Rust contracts, other-language SDKs, and non-code repos are unchanged. sdkCapabilities carries the underlying evidence. Populated as scan waves reach non-Rust repos (was uniformly 0.3 before).",
	},
	{
		date: "2026-07-09",
		surfaces: ["api", "api-client"],
		type: "added",
		summary:
			"JS/TS code facts (gist gap 1, phase 1): searchRepos + explainRepo codeVerified gains `sdkCapabilities` — Stellar SDK capability tags detected in a repo's actual JS/TS sources (tx-building, signing, soroban-rpc, sep10-auth, sep24-ramp, wallet-kit, passkey, …), and `symbols` now covers JS/TS exported surfaces when a repo has no Rust.",
		detail:
			"The dapp-depth fact set: 'real wallet integration vs boilerplate' is legible from which SDK calls appear. Closed tag enum; [] = not yet scanned post-2026-07-09 or no JS sources (scan-dated, not a negative). Scoring for non-Rust repos deliberately stays flat until a JS answer key is mined — these are facts, not judgments. Populated by scan waves.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api", "api-client"],
		type: "fixed",
		summary:
			"Spec correction: `codeVerified.mainnetContractId` was mis-nested in the explainRepo response (a stray property under `content` instead of inside the schema — caught by spectral) and MISSING from the Repo component entirely. Now correctly placed in both; snapshot + client types regenerated.",
		detail:
			"No behavioral change to the live API — the served field was always correct; only the spec's description of it was wrong. Downstream catalogs regenerating from the spec pick up Repo.codeVerified.mainnetContractId as documented.",
	},
	{
		date: "2026-07-08",
		surfaces: ["api", "api-client"],
		type: "added",
		summary:
			"searchRepos codeVerified gains `mainnetContractId` — a README-claimed contract id the scanner VERIFIED to exist on Stellar mainnet (stellar.expert echo-check). Unfakeable deployment evidence: an address string is cheap, a live contract isn't. Verified deployment also weighs ~3x a bare address mention in codeDepth.",
		detail:
			"Populated by scan waves (fail-open: network problems never penalize; the response must echo the requested id, so garbage/empty ids can't false-verify). Null = no verified address, NOT 'not deployed'. Also part of scorer v3: sampling-aware breadth gate + education/demo example markers; the ground-truth answer key grew 20 → 66 verified labels (57 gating + 9 frontier) via a 111-agent adversarially-verified label-mining pass.",
	},
	{
		date: "2026-07-08",
		surfaces: ["api", "api-client"],
		type: "added",
		summary:
			"searchRepos results gain `codeVerified.symbols` — the public code-symbol surface (pub fn/struct/enum/trait names) extracted from each repo's scanned Rust sources. Search also MATCHES on them: 'escrow' now retrieves a repo whose code defines release_escrow/EscrowContract even if its README never says the word (weighted between name/topic and description hits).",
		detail:
			"Closes the structure≠semantics gap: the index knew a repo HAS a deployable contract, not WHAT it implements. Symbols are extracted offline from the same fetched sources the codeDepth scan reads (pub items only, plumbing names filtered, capped 60/repo, top 20 exposed), populated by scan waves — repos scanned before 2026-07-08 carry [] until rescanned. Empty symbols on a scanned repo is 'not yet rescanned', NOT 'no public API'.",
	},
	{
		date: "2026-07-08",
		surfaces: ["api", "api-client"],
		type: "added",
		summary:
			"Contract-as-code guarantee: the OpenAPI spec is now a committed snapshot (specs/openapi.json) and @stellar-light/api-client types are GENERATED from it; CI blocks any contract change that isn't announced in this changelog. Consumers can rely on: every schema/param/op change appears here, same release.",
	},
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
