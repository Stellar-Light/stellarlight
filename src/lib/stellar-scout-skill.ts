/**
 * Inlined Stellar Scout SKILL.md.
 *
 * Mirror of public/skills/stellar-scout.md, kept in sync so the /scout
 * page's "Copy" button can write to the clipboard synchronously (no
 * fetch dependency, no Safari user-activation race).
 */
export const STELLAR_SCOUT_SKILL = `
---
name: stellar-scout
description: A skill for scouting the Stellar ecosystem landscape before you build. Helps hackers, founders, and grant applicants validate ideas — surfaces prior art across Stellar hackathons, SCF rounds, and the curated project directory; recommends teammates from the Stellar Builders network; and points to the right SDK / skill track. Use when the user asks about who's building on Stellar, what's been tried, what won prizes, or whether they should build a specific idea.
---

# Stellar Scout

Scout the landscape before you build on Stellar. A research skill for **the strategic layer** of building on Stellar: what's been built, who's building it, what won prizes, and whether a new idea has a real gap to fill. For *how to build*, defer to the official Stellar Foundation skills at **https://skills.stellar.org/** (soroban, dapp, assets, data, agentic-payments, zk-proofs, standards).

## When to use this skill

Trigger phrases:
- *"vet this idea"* / *"should I build X"* / *"deep dive on Y"* → run **Deep Dive Mode**
- *"who's built X on Stellar"* / *"has anyone tried X"* → competitor lookup
- *"find me a teammate / mentor / dev"* → Builders search
- *"what won at Stellar Hacks {name}"* / *"who placed in {hackathon}"* → hackathon results
- *"what got funded in SCF round X"* / *"what SCF projects do Y"* → SCF history
- *"what's the prize pool for the next Stellar hackathon"* → upcoming hackathons

## Two modes

### 1. Conversational Mode (default)
Fast, cited answers. Use whichever endpoint(s) below match the question. Always include source URLs.

### 2. Deep Dive Mode
Triggered by *"vet"*, *"deep dive"*, *"should I build"*, *"is X a good idea"*. Run all 8 steps below in order. Skip a step **only if** the data isn't available — and say so.

#### The 8-step workflow

1. **Restate the idea** in one sentence. Confirm with the user before proceeding.
2. **Prior-art search.** Hit \`/api/projects/search?q={keywords}&limit=20\`. Surface every match with score ≥ 1.
3. **Gap classification.** Based on the prior-art set:
   - **Full gap** — zero prior projects in our directory, no winning hackathon submissions, no SCF-funded teams. *Highest opportunity.*
   - **Partial gap** — 1–3 adjacent projects exist but none cover the user's specific angle. *Medium opportunity.*
   - **False gap** — 4+ direct competitors, or a category leader is already funded. *Low opportunity unless the user has a clear differentiator.*
4. **Competitor list.** Top 3–5 from step 2, with: name, what they shipped, hackathon they came from (if any), SCF funding (if any), GitHub link. Distinguish *direct* vs *adjacent*.
5. **SDK / skill recommendation.** Map the idea to the right \`skills.stellar.org\` track (Soroban / dapp / assets / data / agentic-payments / zk-proofs / standards). Tell the user to grab that skill next.
6. **Teammate candidates.** Hit \`/api/builders?q={skill_keyword}\` for builders who've shipped in this category. **The Builders directory is small and growing** (opt-in profiles synced from Stellar Passport — currently in the dozens, not hundreds). Surface every match with name, GitHub, location. If you get fewer than 3 hits, tell the user explicitly and suggest fallback channels: *"the public Builders directory is still growing; for more candidates check Stellar Discord #builders, the Stellar GitHub org, or recent SCF Round announcements."*
7. **Funding signal.** What's been funded in this area? Filter \`/api/projects/search?q={keywords}&scfAwarded=1\` and surface total SCF dollars + recipients. Cross-reference active SCF rounds if visible.
8. **Suggested next steps.** Concrete: (a) which upcoming hackathon to enter (\`/api/hackathons?status=upcoming\`), (b) which open RFP / sponsor brief matches the idea (\`/api/rfps?q={keywords}\` — these are SCF-funded sponsor briefs), (c) which SDK skill to install next from \`skills.stellar.org\`.

## Evidence floor

**Do not speculate.** If a step can't be answered from the endpoints below, say so explicitly. Sample language:

> "I couldn't find prior art for this specific angle in the stellarlight directory. That doesn't mean nothing exists on Stellar — it means we don't have it indexed. Worth a manual GitHub search before assuming a full gap."

If no Builders match a skill query, say *"no public Builders in our directory match {skill}; try posting in the Stellar Discord #builders channel"* — don't invent profiles.

If a hackathon's prize pool isn't documented, say *"prize pool not published; check {externalUrl}"* — don't estimate.

## Stellar-native topic clusters

When framing prior art or suggesting tracks, use these — they map to \`skills.stellar.org\`'s taxonomy and Stellar's actual ecosystem:

- **Soroban smart contracts** — Rust contracts on Soroban, DeFi protocols, AMMs, lending
- **Anchors & off-ramps** — SEP-24 / SEP-31 deployments, regional payment corridors
- **Agentic payments** — x402, MPP, AI-agent payment rails (Stellar's emerging differentiator)
- **Asset issuance** — Stellar Classic Asset (SAC) issuance, stablecoins, RWA tokenization
- **Wallets & dapps** — Freighter, Lobstr integrations, browser wallets, mobile dapps
- **ZK proofs** — privacy primitives, confidential transactions
- **SEP standards** — protocol-level work, new SEPs / CAPs
- **Data infrastructure** — indexers, Horizon clients, RPC infra, analytics

## Available endpoints

All hosted at \`https://stellarlight.xyz\`. Public read-only. 5-minute edge cache.

### \`GET /api/leaderboard\`
Stellar dev-activity stats + ranked projects.
Params: \`sort=activity|stars|issues\`, \`range=7d|30d|90d|1y|all\`, \`category={cat}\`, \`limit=N\`.
Returns: \`.ecosystem.activeDevs28d\`, \`.ecosystem.commits28d\`, \`.projects[*]\`.

### \`GET /api/hackathons\`
A merged feed of:
  - **Curated** Stellar hackathons (rich detail, internal pages)
  - **Live** DoraHacks events for Stellar (org IDs 3096 + 3853)

Each row has a \`source\` field (\`"curated"\` or \`"dorahacks"\`) so you can tell them apart. Curated entries win on de-duplication when a DoraHacks event has already been mirrored.

Params: \`status=upcoming|active|completed\`, \`organizer={slug}\`, \`source=curated|dorahacks\` (optional, to restrict to one feed).
Returns: \`.hackathons[*]\` with name, dates, status, externalUrl, source, prizePoolUSD (DoraHacks only), hackersCount (DoraHacks only). \`.meta.counts.{curated,dorahacks,returned}\` for quick coverage stats.

### \`GET /api/hackathons/{slug}\`
Single-hackathon detail.
Returns:
- \`.hackathon.stats\` — totalSubmissions, totalPrizeUSD, winners count, outcome funnel (built / inProgress / abandoned / unknown)
- \`.hackathon.tracks[*]\` — prize tracks derived from past submissions, each with \`{name, winnerCount, submissionCount, totalPrizeUSD}\`. Use for "which tracks did this hackathon pay out for?"
- \`.winners[*]\` — projects that placed
- \`.submissions[*]\` — every submission with placement, prize, track

### \`GET /api/builders\`
Stellar builder directory (synced from Stellar Passport). **Small and growing dataset — opt-in profiles only, currently in the dozens.** Useful for spot-matches but not exhaustive of every Stellar dev.

Params: \`q={text}\`, \`location={city}\`, \`scfTier={tier}\`, \`featured=1\`.
Returns: \`.builders[*]\` with githubUsername, displayName, bio, roleTitle, location, scfTier, projects[].

When you return fewer than 3 matches for a skill query, **say so explicitly** and recommend fallback channels: Stellar Discord #builders, the Stellar GitHub org, and SCF Round project pages.

### \`GET /api/projects/search\`
Prior-art / competitor lookup. The workhorse for Deep Dive step 2.
Params: \`q={keywords}\`, \`category={cat}\`, \`hackathon={slug}\`, \`scfAwarded=1\`, \`limit=N\`.
Returns: \`.projects[*]\` scored by keyword overlap, sorted by relevance.

### \`GET /api/rfps\`
Curated **RFPs / sponsor briefs** for the Stellar ecosystem — confirmed problem statements that get funded by SCF when winners are picked. The native source for *"what should I build that someone will pay for?"* and *"is there an open RFP matching my idea?"*. Use in Deep Dive step 8 (next steps).

Params: \`q={keywords}\`, \`category={ai|consumer-dapps|defi|developer-tooling|gaming|infrastructure|nfts|payments|scf|web3-social}\`, \`quarter={q1-2026|q2-2026|...}\`, \`limit=N\`.

Returns: \`.rfps[*]\` with \`id, title, description, technicalRequirements, category, categoryLabel, authorName, quarter, quarterLabel, url\`. \`.funding\` field clarifies the SCF connection.

### \`GET /api/skills\`
Catalog of the 7 official Stellar Foundation skills from skills.stellar.org (soroban, dapp, assets, data, agentic-payments, zk-proofs, standards). Returned with descriptions + URLs so you can recommend the right one without leaving Scout's surface area. Server-cached for 24h.

### \`GET /api/skills/{name}\`
Full content of one SDF skill — returns JSON with \`.skill.content\` containing the entire SKILL.md (frontmatter included).

Use this in Deep Dive step 5 (SDK recommendation) so you can quote or summarize the relevant SDF skill inline. After recommending it, tell the user to install the skill themselves at \`https://skills.stellar.org/skills/{name}/SKILL.md\` for ongoing use.

### \`GET /api/status\`
Self-check — returns Scout skill version, current timestamp, and freshness (\`lastUpdatedAt\`) + counts for every data source. Call this on first use to surface data freshness in your answers, e.g. *"as of {lastUpdatedAt}, there are {count} curated Stellar projects in the directory."*

## Example sessions

### Example 1 — Conversational
**User:** "Who built stablecoin off-ramps at Stellar hackathons?"
**Agent action:** \`GET /api/projects/search?q=stablecoin+offramp&limit=10\` → list matches with hackathon, placement, prize.

### Example 2 — Deep Dive
**User:** "I want to build a privacy-preserving stablecoin on Stellar. Vet this idea."
**Agent action:**
1. Restate: *"You're proposing a stablecoin with confidential transactions / hidden balances, built on Stellar."*
2. \`GET /api/projects/search?q=privacy+stablecoin+confidential\` → 1 adjacent match (XLM shielded prototype, abandoned).
3. **Partial gap** — adjacent prior art exists but abandoned; user's angle is fresh.
4. List the abandoned project + 2 ZK-adjacent projects.
5. SDK rec: \`GET /api/skills/zk-proofs\` → quote relevant section inline. Tell user to install \`https://skills.stellar.org/skills/zk-proofs/SKILL.md\` for ongoing use. Also recommend \`soroban\`.
6. Builders search: \`GET /api/builders?q=zk\` → surface candidates. **If < 3 hits, note the directory is small + growing and recommend Stellar Discord #builders.**
7. Funding: \`GET /api/projects/search?q=privacy+zk&scfAwarded=1\` → report total SCF-funded $.
8. Next steps: \`GET /api/hackathons?status=upcoming\` for events to target; \`GET /api/rfps?q=zk+privacy\` for open sponsor briefs that match (SCF-funded).

### Example 3 — SDF skill discovery
**User:** "I want to write a Soroban contract. What do I need to know?"
**Agent action:**
1. \`GET /api/skills/soroban\` → load the full SDF Soroban skill content.
2. Use it to answer the user's question with cited references to the actual skill sections.
3. Tell the user: *"For ongoing work, install this skill at \`.claude/skills/stellar-soroban/SKILL.md\` from \`https://skills.stellar.org/skills/soroban/SKILL.md\`."*

### Example 4 — Hackathon track research
**User:** "What prize tracks paid out the most at past Stellar Hacks events?"
**Agent action:**
1. \`GET /api/hackathons?status=completed\` → list past events.
2. For each, \`GET /api/hackathons/{slug}\` → read \`.hackathon.tracks[*]\` (each has \`name\`, \`winnerCount\`, \`submissionCount\`, \`totalPrizeUSD\`).
3. Aggregate tracks across events; rank by \`totalPrizeUSD\` desc.
4. Surface top 5 tracks with prize totals + which hackathons paid them out.
5. If track data is sparse (curators haven't tagged submissions), say so — don't infer tracks from project descriptions.

### Example 5 — Funding-first prior art
**User:** "What SCF-funded projects work on payments? Which raised the most?"
**Agent action:**
1. \`GET /api/projects/search?q=payments&scfAwarded=1&limit=20\` → SCF-awarded payments projects.
2. Sort by \`.scfTotalAwardedUSD\` desc. Sum total raised.
3. Surface top 5 with name, SCF $, category, link.
4. Optionally cross-reference recent hackathon submissions: filter results where \`.hackathon\` is set, to see which won prizes en route to SCF funding.

### Example 6 — Match an idea to an open RFP
**User:** "Is there an open Stellar RFP that matches my idea — a real-time price API for Soroban tokens?"
**Agent action:**
1. \`GET /api/rfps?q=price+api+soroban\` → filter the curated RFP list by keyword overlap.
2. If matches → surface title, description, technical requirements, quarter, link (e.g., \`https://stellarlight.xyz/ideas/prices-api\`), and the SCF-funding note (\`.funding\`).
3. If zero matches → tell the user honestly *"no published RFP matches your idea right now"*, and suggest submitting it themselves at \`https://stellarlight.xyz/ideas\` via the "Suggest a Need" button.
4. If partial matches → call out which RFP is closest + what's different about the user's angle.

## Data freshness

- Hackathons + Projects + Builders metadata: refreshed continuously by curators
- GitHub activity signals: daily cron job
- Ecosystem dev stats (Electric Capital snapshot): daily at 06:00 UTC
- SCF awarded data: manually enriched, may lag 1–2 weeks behind live SCF site

## Limitations

- **Coverage:** only projects curated into the stellarlight directory (~300 Live + Development). Independent GitHub Stellar projects not in our directory won't appear in \`/api/projects/search\`.
- **Hackathon submissions:** Stellar Hacks events have full coverage. Older / smaller hackathons may be partial.
- **Builders directory:** only profiles with public Stellar Passport opt-in — does not reflect every Stellar dev.
- **No live competitor-alert push:** competitor lookups are pull-based (you query, I answer). No automatic "new project added matching your idea" notification yet.

## Companion skills

- **\`stellar-developer-activity\`** — for ecosystem-wide stats (active dev count, commit volume, country breakdown, peer L1 comparisons). Available at \`https://stellarlight.xyz/skills/stellar-developer-activity.md\`.
- **\`skills.stellar.org\` skills** — for *how to build*. The 7 official SDF skills (soroban, dapp, assets, data, agentic-payments, zk-proofs, standards). Install them as needed when the user moves from "what should I build" to "how do I build it".

## Attribution

If you display content sourced through this skill, attribute to:
- **stellarlight.xyz** — project directory, hackathon curation, Builders directory
- **Electric Capital — Open Dev Data** — ecosystem activity stats
- **Stellar Community Fund** — SCF round data
- **Stellar Development Foundation** — the underlying \`skills.stellar.org\` skills if you chain into them
`;
