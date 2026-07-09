# Stellar Scout — API reference

Full endpoint docs for the stellar-scout skill. SKILL.md keeps the quick-reference table; this file is the deep dive. Load on demand when the user asks how an endpoint behaves or when an answer needs an unusual filter combo.

All endpoints hosted at `https://stellarlight.xyz`. Public read-only, no auth. Edge-cached. Rate-limited per IP.

---

## `GET /api/leaderboard`
Stellar dev-activity stats + ranked projects.

**Params:** `sort=activity|stars|issues`, `range=7d|30d|90d|1y|all`, `category={cat}`, `limit=N`.

**Returns:** `.ecosystem.activeDevs28d`, `.ecosystem.commits28d`, `.ecosystem.multichainDevs28d`, `.ecosystem.stellarOnlyDevs28d`, `.projects[*]`.

For *cross-chain peer comparison* (Ethereum / Solana / etc.), chain a second call: `GET /api/research?source=ec-developer-report&q=stellar+L1+comparison`. The leaderboard endpoint itself does not return peer-L1 data.

---

## `GET /api/hackathons`
A merged feed of:
- **Live** DoraHacks events for Stellar (org IDs 3096 + 3853) — primary feed today
- **Curated** Stellar hackathons (richer detail, internal pages) — currently sparse; treat as a future capability. Check `.meta.counts.curated` before assuming richer detail is available.

Each row has a `source` field (`"curated"` or `"dorahacks"`). When `.meta.counts.curated === 0` (common right now), every hackathon's detail comes from DoraHacks and follows the DoraHacks-only response shape (see `/api/hackathons/{slug}` below).

**Params:** `status=upcoming|active|completed`, `organizer={slug}`, `source=curated|dorahacks` (optional). Invalid `status` or `source` returns 400 with the valid enum list.

**Returns:** `.hackathons[*]` with name, dates, status, externalUrl, source, prizePoolUSD (DoraHacks only), hackersCount (DoraHacks only). `.meta.counts.{curated,dorahacks,returned}` for quick coverage stats.

**Empty-result fallback (very important):** when `?status=upcoming` or `?status=active` returns 0 hackathons, the response includes a `.meta.fallbackChannels` object pointing the user at live sources outside our DB:
- **`@BuildOnStellar`** on X/Twitter (`https://x.com/BuildOnStellar`) — first to announce
- **`https://stellarlight.xyz/hackathons`** — live page; curators add events here before they fully populate the API
- **DoraHacks — Stellar Development Foundation** (`https://dorahacks.io/org/3096`) — registration goes live here

**Do not say *"no Stellar hackathons exist"*** when this happens — say *"there are no upcoming/active hackathons in stellarlight's feed right now (we're between events). The next one will land at @BuildOnStellar or stellarlight.xyz/hackathons — follow those for the announcement."* Then pivot the user to RFPs (`/api/rfps?status=open`) since those are continuously fundable.

---

## `GET /api/hackathons/{slug}`
Single-hackathon detail. **Two response shapes** depending on the data source:

**(a) Curated** (slug resolves to a Payload Hackathons row) — full detail:
- `.hackathon.stats` — totalSubmissions, totalPrizeUSD, winners count, outcome funnel (built / inProgress / abandoned / unknown)
- `.hackathon.tracks[*]` — prize tracks derived from past submissions, each with `{name, winnerCount, submissionCount, totalPrizeUSD}`. Use for "which tracks did this hackathon pay out for?"
- `.winners[*]` — projects that placed, **sorted by placement** (`winners[0]` = 1st), each with a numeric `placementRank` (1 = best) alongside the `hackathonPlacement` label — sort/filter on `placementRank`, don't parse the string
- `.submissions[*]` — every submission with placement, prize, track

**(b) DoraHacks-only** (slug matches a live DoraHacks event we haven't curated in our DB) — now pulls the **live submission roster** from DoraHacks:
- `.hackathon.source = "dorahacks"`, `.hackathon.prizePoolUSD`, `.hackathon.hackersCount`
- `.submissions[*]` — every submission, pulled live: `{name, githubUrl, demoUrl, videoUrl, track, description, hackathonPlacement, award, isWinner, url}`
- `.winners[*]` — the submissions that placed (derived from `winner_prizes`), **sorted by placement** (`winners[0]` = 1st), each with `hackathonPlacement` (e.g. "1st Place"), a numeric `placementRank` (1 = best), + `award`
- `.hackathon.tracks` and the top-level `.tracks` — derived from the roster, each `{name, submissionCount, winnerCount}`. Always present now (`[]` when there are no tracks)
- Read-through + cached ~1h; if the DoraHacks feed is briefly unavailable these degrade to empty and `.meta.note` says so. `.hackathon.externalUrl` is the canonical event page.
- **Per-event coverage is uneven** — ideathons / brand-new events may have **no submitted buidls yet**, so `submissions`/`winners`/`tracks` are legitimately empty (not an error); larger build events (e.g. `stellar-hacks-blend`, `stellar-agents-x402-stripe-mpp`) are fully populated.

---

## `GET /api/hackathons/compare`
Side-by-side comparison of 2–5 hackathons. Returns each hackathon's snapshot plus a `deltas` block highlighting prize-pool spread, submission-count spread, and per-winner economics.

**Params (GET):** `?slugs=a,b,c` (2–5 slugs, comma-separated).
**Body (POST):** `{ "slugs": ["a", "b", "c"] }` — identical schema, both verbs accepted.

**Returns:** `.hackathons[*]` snapshot (curated detail or DoraHacks metadata), `.deltas.notes[*]` agent-readable strings like *"prize pool: stellar-agents-x402-stripe-mpp = 10,000 vs buildonstellarchile = 1,000 (10.0× spread)"*. Per-stat `highest`/`lowest` keys also available under `.deltas.{prizePoolUSD,submissionCount,prizePerWinnerUSD,hackersCount}`.

Use this when the user wants to choose between two upcoming events ("which Stellar Hacks should I enter?") or compare past hackathons for category fit. Not for comparing 2 across-ecosystem hackathons.

---

## `GET /api/analyze`
Cross-event analytics — the macro picture across all Stellar hackathons + funding + projects.

**Params:** `dimension=all|hackathons|categories|funding` (default `all`).

**Returns:**
- `.hackathons.totalEvents`, `.hackathons.byStatus`, `.hackathons.totalPrizePoolUSD`, `.hackathons.totalRegisteredHackers`
- `.categories.distribution[*]` — per-category project counts + SCF totals + hackathon-winner counts (sorted desc by project count)
- `.funding.scfAwardedProjects`, `.funding.scfTotalDistributedUSD`, `.funding.meanAwardUSD`, `.funding.postHackathonStatusFunnel`, `.funding.byRound[*]`

Use this when the user asks "*what's the state of Stellar's hackathon scene*" or "*how much SCF money has been distributed to date*" — these can't be answered from single-event detail.

---

## `GET /api/clusters`
Topic clustering across active Stellar projects with crowdedness scoring.

**Params:** `dimension=category|types` (default `category`), `minSize=N` (default 1).

**Returns:** `.clusters[*]` with:
- `.key` — the category or type name
- `.size` — project count in this cluster
- `.crowdedness` — 1–10, log-scaled: `round(log₂(size+1) + log₂(scfFunded+1) + 0.5×log₂(winners+1))`, clipped to [1,10]. Log scaling means a cluster of 200 projects scores ~8/10 vs 6 projects ~3/10 — actually differentiates, unlike a linear formula. Cross-reference `.size` + `.scfFundedCount` for raw numbers.
- `.scfFundedCount`, `.scfTotalUSD`, `.hackathonWinnerCount`
- `.sampleProjects[]` — up to 5 ranked by SCF funding + hackathon prize

Default sort: crowdedness desc (most crowded first).

Use this to answer *"what's the most crowded category on Stellar?"* (lead with the top 3) or *"what category is underbuilt?"* (sort by crowdedness asc, or filter `minSize=3` then read bottom).

---

## `GET /api/builders`
Stellar builder directory (synced from Stellar Passport). **Populated but small and sparse (~110 profiles; some rows are just a GitHub handle + avatar).** A 0-result is a *filter miss*, not an empty directory — `.meta.advisory` distinguishes the two and reports the real collection size. Broaden or drop a filter (`q`/`location`/`skill`) before routing the user to fallback channels.

**Params:** `q={text}`, `location={city}`, `skill={tech}` (alias for `q`).

**Returns:** `.builders[*]` with githubUsername, displayName, bio, roleTitle, location, scfTier, projects[]. When `.meta.counts.returned === 0`, the response also includes `.meta.advisory` with a one-line summary + 2 fallback channels (Stellar Discord + GitHub topic:stellar) — relay these verbatim to the user. The advisory exists specifically so you don't confabulate ecosystem-level claims from an empty directory.

---

## `GET /api/projects/search`
Search existing Stellar projects (competitor / overlap lookup). The workhorse for Deep Dive step 2.

**Params:** `q={keywords}`, `category={cat}`, `scfAwarded=1`, `limit=N`.

**Returns:** `.projects[*]` scored by keyword overlap, sorted by relevance.

**Tiered keyword matching — read `.meta.matchMode` before framing results:**
- `strict` — every query token matched (highest confidence; lead with "I found N exact matches for {q}")
- `loose-1` — all but one token matched (treat as adjacent; lead with "I couldn't find an exact match, but these are close — N of M keywords match")
- `majority` — at least ⌈N/2⌉ tokens matched (broadest interpretation; lead with "broader interpretation of {q} — these projects overlap on the main themes")
- `all` — accompanies results only when a non-`q` filter (`category`/`scfAwarded`) was applied. A bare call with **no `q` AND no filter does NOT return the full directory** — it returns `meta.error: "no_query"` + 0 rows; re-call with `?q=<terms>`.

This fallback chain means **a multi-word natural query like *"real-time price API for Soroban tokens"* will not dead-end at 0** — the endpoint relaxes to looser tiers until it finds something. Honesty matters: tell the user which tier returned the results so they can judge relevance themselves (`.meta.matchModeLabel` gives a pre-formatted human-readable version).

When `matchMode === "majority"` still returns 0, the response includes `.meta.advisory` pointing you at `/api/research` (for thesis-level questions) and suggesting a synonym retry.

---

## `GET /api/rfps`
Curated **RFPs / sponsor briefs** for the Stellar ecosystem — confirmed problem statements that get funded by SCF when winners are picked. The native source for *"what should I build that someone will pay for?"* and *"what's currently fundable?"*. Use in Deep Dive step 8 (next steps) AND lead with this when the user asks generally what to build.

**Params:** `q={keywords}`, `category={ai|consumer-dapps|defi|developer-tooling|gaming|infrastructure|nfts|payments|scf|web3-social}`, `quarter={q1-2026|q2-2026|...}`, **`status={open|closed}`**, `limit=N`.

**Returns:** `.rfps[*]` with `id, title, description, technicalRequirements, category, categoryLabel, quarter, quarterLabel, **status** (open/closed), authorName, url`. Meta includes `.activeQuarter`, `.counts.{open,closed,total}`, and `.submitNewBriefAt`. `.funding` clarifies the SCF connection.

**Always pair RFP results with these two external references so the user has the full picture:**
- **SCF Handbook** — `https://stellar.gitbook.io/scf-handbook` — covers how SCF rounds work, application format, governance, award tiers, and verified-member rules. Recommend it for any user asking *"how does the funding work?"* or preparing an application.
- **stellarlight.xyz/ideas** — the live RFP listing + the "Suggest a Need" form. Always link here when surfacing RFPs so the user can browse the full set, see quarter tabs, or submit their own.

**Active RFPs vs closed RFPs:**
- `status: "open"` RFPs are in the current SCF round (`activeQuarter`) and are **ready to be funded and built** — winners get an SCF grant. These are the actionable opportunities. Surface these first.
- `status: "closed"` RFPs are from past quarters. **Surface them with a clear warning: *"This RFP was from {quarterLabel} — someone is likely already building it."*** It's not a dead lane. Always pair the warning with a concrete next step:
  - **Surface the `.authorName` field** and recommend the user reach out to coordinate (*"The original author was {authorName} — DM them on Stellar Discord or check the Stellar GitHub org to see who picked it up"*).
  - **Suggest competing/better takes** if the user has a clear differentiator (*"If your angle adds {X} the original brief didn't cover, that's still a viable build."*).
  - Make clear they can't claim SCF funding for this RFP in the current round, but the work might still ship as an SCF grant in a future round.
- Default behavior: when the user asks generally *"what should I build?"* or *"what RFPs are out there?"*, call `GET /api/rfps?status=open` first and lead with the active set. Mention the count from `.counts.open`. When you include closed RFPs as additional context, label them as past-quarter every time.

**Important framing when there are 0 open matches:**
- 0 open RFPs in a category doesn't mean *"no opportunity"*. It means *"no sponsor brief in the current SCF round (`.activeQuarter`) covers this lane yet."*
- **Anyone can propose an RFP** at `https://stellarlight.xyz/ideas` (`.meta.submitNewBriefAt`) via the "Suggest a Need" button. Community submissions go through curators and graduate to confirmed briefs in upcoming rounds.
- When you find no matching open RFP, tell the user this explicitly and surface the submission CTA. Don't frame it as a dead end; frame it as an invitation to define the brief themselves.

---

## `GET /api/skills`
A merged, multi-source AI-skill catalog (~30 entries) — the 7 official SDF skills from skills.stellar.org (soroban, dapp, assets, data, agentic-payments, zk-proofs, standards) **plus** Stellarlight, lumenloop, and external skills. Filter with `source` (`sdf|stellarlight|lumenloop|external|community`) and `kind`; `.meta.counts.bySource` breaks down the mix and `.meta.validSources`/`.meta.validKinds` list the facets. `/api/skills/{name}` returns full SKILL.md content for sources that ship one (SDF + curated), metadata-only otherwise. Server-cached 24h. An invalid `source` returns 400 with `validSources`.

---

## `GET /api/skills/{name}`
Full content of one SDF skill — returns JSON with `.skill.content` containing the entire SKILL.md (frontmatter included).

Use this in Deep Dive step 5 (SDK recommendation) so you can quote or summarize the relevant SDF skill inline. After recommending it, tell the user to install the skill themselves at `https://skills.stellar.org/skills/{name}/SKILL.md` for ongoing use.

---

## `GET /api/research`
**The thesis-grounding endpoint.** Semantic search across a curated corpus of primary Stellar sources — SDF blog posts, the SCF Handbook, SEPs, developers.stellar.org, foundational papers (Mazieres SCP), the lumenloop awesome-scf playbooks + research articles, **Soroban protocol audit reports** (Certora, OtterSec, Halborn, OpenZeppelin, Code4rena, et al. via sorobansecurity.com), and the **Electric Capital Developer Reports** (annual + geographic dev-activity analyses, 2019–2023). ~4,500+ chunks total, embedded with Voyage AI `voyage-3` (1024-dim) and indexed in MongoDB Atlas Vector Search.

Use this when the user asks a **conceptual / thesis / design-tradeoff / security question** that the other structured endpoints can't answer alone. Examples:
- *"How does SCP federated consensus actually work?"*
- *"What's the design rationale behind SEP-24?"*
- *"What's the SCF prescreen process?"*
- *"How do anchors handle KYC?"*
- *"What audit findings have been reported for Blend's oracle?"*
- *"Has any Soroban protocol been hit with an inflation attack?"*
- *"How has Stellar's developer count changed since 2019?"*
- *"What L1s does Electric Capital group Stellar with by dev-activity?"*

Always cite the source URL from each returned chunk — that's the whole point. **Audit chunks** carry extra metadata: `.auditor`, `.protocol`, and `.severity` (`critical | high | medium | low | informational | unknown`) — surface these inline ("per a HIGH-severity finding in the Certora audit of Blend Protocol V2…"). **EC Developer Report chunks** are historical (2019–2023 PDFs); for the most recent year cross-reference `developerreport.com/ecosystems/stellar`.

**Params:** `q={query}` (required), `source={sdf-blog|scf-handbook|sep|dev-docs|paper|scf-proposal|lumenloop|lumenloop-research|audit|incident|ec-developer-report}` (optional filter), `limit=N` (default 8, max 25). Invalid source returns 400 with `validSources`.

**Returns:** `.results[*]` with `{id, source, title, section, url, content, chunkIndex, score}`. `.meta.mode` indicates `"vector"` (semantic search via Atlas $vectorSearch) or `"keyword"`. **Mode is chosen per query (dynamic), not per source** — the *same* `source` can return either mode depending on the query string, so don't pin a mode to a source. `.meta.model` reports the embedding model used.

**Read the `score` before citing.** Vector search always returns the top-K nearest chunks even if none are truly relevant. Calibrated from real query patterns:
- `score ≥ 0.78` → direct hit, cite confidently (e.g. SCP query → Mazières paper)
- `score 0.72–0.78` → relevant, cite normally (e.g. "soroban storage" → dev-docs)
- `score 0.68–0.72` → adjacent / partial — lead with *"broadly related, not a direct answer"*
- `score < 0.68` → weak match; **don't cite as authoritative** — say *"the closest thing in the corpus is X, but it doesn't directly answer your question"*

When all returned chunks score below 0.68, treat the topic as outside our corpus and tell the user explicitly — don't confabulate.

**Rate limit:** 60 requests / minute / IP. Don't loop the endpoint.

---

## `POST /api/feedback`
In-skill feedback channel — agents can report a bug, missing data, wrong answer, or suggestion without leaving the workflow.

**Body:**
```json
{
  "kind": "bug" | "missing-data" | "wrong-answer" | "suggestion" | "other",
  "message": "10–4000 chars describing the issue concretely",
  "context": {
    "query": "optional — the user query that triggered the issue",
    "endpoint": "optional — the /api/* endpoint that misbehaved",
    "skillVersion": "optional — SKILL.md frontmatter version",
    "agentName": "optional — claude-code | codex | openclaw | etc."
  }
}
```

**Returns:** `{ok: true, id, message}` on 201; `{error, validKinds?, hint?, example?}` on 400; `{error, hint}` on 429.

**Rate limit:** 6 requests / minute / IP (lower than read endpoints — feedback shouldn't fire-hose).

**When to call this:** whenever you (the agent) detect a quality issue worth a curator's eye — bad citation, missing protocol, wrong tag, unexpected 0-result for a real question. Don't fire on every empty response; reserve for things a human reviewer should investigate.

Submitting feedback is **explicitly encouraged** and contributes to improving the skill for everyone. Mention to the user when you submit one: *"I've also flagged this as a quality issue via /api/feedback so curators can fix it."*

A `GET /api/feedback` returns the schema in case you want to discover the shape without reading this doc.

---

## `GET /api/status`
Self-check — returns Scout skill version, current timestamp, and freshness (`lastUpdatedAt`) + counts for every data source. Call this on first use to surface data freshness in your answers, e.g. *"as of {lastUpdatedAt}, there are {count} curated Stellar projects in the directory."*

Also useful as a sanity check that the API is reachable before running a Deep Dive — saves dropping into a workflow only to fail halfway through.

## `GET /api/changelog`
A curated, latest-first feed of contract-affecting changes to the API, MCP tools, and typed client — new/removed endpoints & tools, param/enum changes, description rewrites. Point an agent here (or diff it periodically) to stay current on what each tool offers and how to use it, without reading git history. Filter with `?since=YYYY-MM-DD` or cap with `?limit=N`. Each entry carries `date`, `surfaces[]` (api / mcp / api-client / skill), `type` (added / changed / fixed / removed), a one-line `summary`, and optional `detail`.

## `GET /api/repos/explain`
**Deep code answers** — pairs StellarLight's repo routing with DeepWiki. Ask a deep code question (`?q=where are transaction result codes defined`) and it routes to the authoritative repo (error/result codes, consensus/SCP, XDR → `stellar/stellar-core`; Horizon → `stellar/go`; RPC → `stellar/stellar-rpc`; SDKs / SEP reference impls), then returns a **source-grounded answer** from DeepWiki — the actual answer with source files, not just a link. Pin a repo with `?repo=owner/name`, or omit to auto-route. Returns `repo`, `routedVia`, `answer`, `alternateRepos`, `sources` (repoUrl + deepWikiUrl + deepWikiSearchUrl), and the repo's `codeVerified` block — code facts verified from the actual source: `stellarProof`, `codeDepth` (0–1), `isDeployableContract`, `sorobanSdkVersion`+`versionStatus`, `symbols[]` (public fn/struct names), `sdkCapabilities[]` (detected SDK call patterns: tx-building, signing, soroban-rpc, sep10-auth, …), and `mainnetContractId` (a README-claimed contract id verified to exist on mainnet; null = no verified address, NOT 'not deployed'). Degrades gracefully — if DeepWiki is briefly unavailable you still get the authoritative repo to read. **Use for** *"where is X defined / how does Y work"* internals questions; for *which* repos exist use `/api/repos/search`, for ecosystem docs/SEPs/audits use `/api/research`. Also exposed as the `explain_repo` MCP tool.

## `GET /api/repos/search`
Search the indexed-and-scored Stellar GitHub repo index (~2,300 repos) — the code layer beneath the project directory. **Params:** `q={tech/keyword}` (synonym-expanded: zk→zero-knowledge, oracle→price-feed, …), `language={Rust|TypeScript|…}`, `minScore={0-100}` (40+ = high-signal), `limit`/`offset`. Ranked by `repoScore` (0–100 = code-depth verified from the repo's actual source + freshness + traction + hackathon/SCF/builder authority). Each result carries a `codeVerified` block (`stellarProof`, `codeDepth`, `isDeployableContract`, `sorobanSdkVersion`+`versionStatus`, `symbols[]`, `sdkCapabilities[]`, `mainnetContractId`) or null until code-scanned. For infra/protocol queries (error codes, consensus, XDR, horizon, rpc) it floats the **canonical SDF repos** to the top and lists them in `meta.canonical`. **Every result carries `deepWikiUrl`** (hand off to `/api/repos/explain` for the deep answer). The same graded repos ride inline on `/api/projects/search` as `codeReferences`. **Use for** *"show me repos/code for X"*; for what products *exist* use `/api/projects/search`; for deep internals of a specific repo use `/api/repos/explain`. Exposed as the `search_repos` MCP tool.

## `GET /api/partners`
Curated directory of Stellar ecosystem **partners** — audit firms, anchors, on/off-ramps, infrastructure, tooling. **Params:** `type={anchor|on-off-ramp|infrastructure|tooling|protocol|wallet|audit-firm|legal|agency|other}`, `ramps={on-ramp|off-ramp}` (comma-separate to require both; unknown values 400 with `validRamps`), `sector`, `region`, `accepting=1`, `q` (relevance-ranked by structured capability fit — assets/ramps/SEPs/country/services/region), `limit`/`offset`. Each entry is a typed `Partner` row: `name`, `partnerType`, `sectors[]`, `description`, `websiteUrl`, capability facts (`rampTypes[]`, `seps[]`, `assets[]`, `country`), a `freshness` block (`status`, `excludeFromMatching` — never recommend a partner flagged stale), a `trust` score (0–1 + label), and a system-computed `verified` block (GitHub activity, on-chain footprint, SCF involvement — trust these over self-claims). `.meta.counts.total` is the full match count. **Use for** *"who should audit my Soroban contract"* (`?type=audit-firm`), *"find an anchor / on-off-ramp in {region}"* (`?ramps=on-ramp&q={country}`), or partner discovery for integrations. For projects/products that were BUILT use `/api/projects/search`; for the people who build them use `/api/builders`. Exposed as the `get_partners` MCP tool.
