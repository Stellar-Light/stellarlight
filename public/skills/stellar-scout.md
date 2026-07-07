---
name: stellar-scout
version: 1.1.0
homepage: https://stellarlight.xyz/scout
license: MIT
compatibility: Claude Code, Codex, OpenClaw, Cursor, Amp, Antigravity, Cline, plus 50+ others via vercel-labs/skills
description: Scouts the Stellar ecosystem before you build. Validates ideas against existing projects, matches open SCF-funded RFPs, drafts SCF pitches, finds audit firms, compares RFPs, recommends Soroban SDK skills, and cites primary sources (audits, SEPs, papers). Use whenever someone asks what to build on Stellar, vets an idea, preps an SCF grant application or hackathon entry, needs an auditor, or needs prior-art / security findings on a Soroban protocol.
---

# Stellar Scout

A research skill for **the strategic layer** of building on Stellar: what's already been shipped, what got funded, what RFPs are open right now, and whether a new idea has a real gap. Works for hackathon entrants, SCF grant applicants, and independent builders or teams alike.

For *how to build* (Rust on Soroban, SEP standards, agentic payments, ZK, etc.), defer to the Stellar Foundation's official skills at **https://skills.stellar.org/** (soroban, dapp, assets, data, agentic-payments, zk-proofs, standards). Scout chains into them via `/api/skills` when the user moves from "what should I build" to "how do I build it".

## When to use this skill

### Step 0 — Disambiguate the user type first

When a user opens with a broad question (*"I want to build something on Stellar"*, *"what should I work on?"*, *"help me find an idea"*), **don't dive in yet**. Ask one clarifying question first:

> *"Quick question to point you the right direction — are you (a) entering a Stellar hackathon, (b) preparing an SCF grant application, or (c) building independently as a solo dev or team?"*

Their answer determines which endpoints you lead with — see the user-type routing table below. If they've already made it clear in their question (e.g. *"I'm preparing my SCF grant"*), skip the ask and route directly.

### User-type routing — lead with these first

| User type | Lead endpoint #1 | Lead endpoint #2 | Lead endpoint #3 |
|---|---|---|---|
| **Hackathon entrant** | `/api/hackathons?status=upcoming` (find an event to enter) — *if 0 results, surface `.meta.fallbackChannels` (BuildOnStellar / stellarlight) and pivot to RFPs* | `/api/rfps?status=open` (track / sponsor briefs) | `/api/projects/search?q={idea}` (prior projects) |
| **SCF grant applicant** | `/api/rfps?status=open` (briefs are SCF-funded — winners get the grant) | `/api/projects/search?scfAwarded=1&q={idea}` (similar funded work) | `/api/skills/{track}` (SDF skill for the technical layer) |
| **Independent builder or team** | `/api/projects/search?q={idea}` (what's been shipped) | `/api/leaderboard` (ecosystem traction / momentum) | `/api/rfps?status=open` (paid opportunities they may not know about) |

### Trigger phrases (any user type)

- *"vet this idea"* / *"should I build X"* / *"deep dive on Y"* → run **Deep Dive Mode**
- *"draft my SCF pitch"* / *"help with my SCF application"* / *"how do I pitch this to SCF"* → run the **Draft SCF Pitch** workflow
- *"who should audit my contract"* / *"find me an auditor"* / *"which audit firm"* → run the **Find Audit Firm** workflow
- *"find me an anchor / on-ramp / off-ramp in {region}"* / *"who provides {service} on Stellar"* / *"which infra / tooling / wallet provider"* → `/api/partners?type={anchor|on-off-ramp|infrastructure|tooling|wallet}&region={region}&q={need}` — the curated **partner directory** of real, vetted providers to hire or integrate (capabilities from stellar.toml, compliance & corridors, accepting-clients, freshness). Recommend only partners the API returns — never invent one; link each `stellarlight.xyz/partners/{slug}`.
- *"which RFP should I go for"* / *"compare the open RFPs"* / *"rank the RFPs for my team"* → run the **Compare RFPs** workflow
- *"who's built X on Stellar"* / *"has anyone tried X"* → competitor lookup
- *"show me the repos / code for X"* / *"what repos exist for X"* / *"prior-art code on Stellar"* → `/api/projects/search?q={topic}` returns each project **plus its GitHub repos and a graded `codeReferences` list**; or `/api/repos/search?q={topic}` to hit the repo index directly (2,000+ Stellar repos, ranked by `repoScore`)
- *"what should I build"* / *"what RFPs are open"* / *"what's currently fundable"* → list open RFPs (`/api/rfps?status=open`)
- *"what got funded in SCF round X"* / *"prior SCF projects in {category}"* → SCF history via `/api/projects/search?scfAwarded=1`
- *"how does Stellar compare on dev activity"* → `/api/leaderboard` for Stellar ecosystem stats (`.ecosystem.activeDevs28d`, `.ecosystem.commits28d`, `.ecosystem.multichainDevs28d`); for cross-chain peer comparison use `/api/research?source=ec-developer-report&q=stellar+devs+comparison`
- *"find me a teammate / mentor / dev"* → Builders search (small + growing — for IRL hackathons the local team often isn't in the directory; fall back to Stellar Discord)
- *"what won at Stellar Hacks {name}"* / *"who placed in {hackathon}"* → hackathon results
- *"what's the prize pool for the next Stellar hackathon"* → upcoming hackathons

### Good first questions for new users

When the agent introduces Scout, suggest these starter prompts depending on user type:

**For hackathon entrants:**
- *"What Stellar hackathons are open right now and what's their prize pool?"*
- *"Has anyone built {my idea} at a past Stellar hackathon?"*
- *"Which SCF-funded RFPs match my hackathon idea?"*

**For SCF grant applicants:**
- *"What SCF-funded projects work on {my category}? How much have they raised total?"*
- *"Is there an open RFP in {category} for the current SCF round?"*
- *"Vet my SCF idea: {description}"*

**For independent builders or teams:**
- *"What's been shipped on Stellar in {category}?"*
- *"Show me the most active Stellar projects right now."*
- *"Vet this idea: {description}"*

## Two modes

### 1. Conversational Mode (default)
Fast, cited answers. Use whichever endpoint(s) below match the question. Always include source URLs.

### 2. Deep Dive Mode
Triggered by *"vet"*, *"deep dive"*, *"should I build"*, *"is X a good idea"*. Run all 8 steps below in order. Skip a step **only if** the data isn't available — and say so.

#### The 8-step workflow

1. **Restate the idea** in one sentence. Confirm with the user before proceeding. **Reframe if the assumption is off** — if existing projects in our directory suggest the user has the wrong layer ("I want to build a DEX" but the gap is actually in execution infrastructure), surface that *before* you start searching. Don't validate an idea just because they're excited about it. Example: *"You said DEX, but every Stellar DEX project is well-funded — the real gap the existing projects reveal is order-routing infra. Want me to vet that instead?"*
2. **Search existing projects.** Hit `/api/projects/search?q={keywords}&limit=20`. Surface every match with score ≥ 1. **For thesis / design-tradeoff aspects** of the idea (not just "does this exist"), also call `/api/research?q={keywords}` and surface primary-source citations from the corpus — SEP design rationales, SDF blog posts, SCF Handbook guidance, etc. Cite the source URL on every claim grounded in research.
3. **Gap classification + crowdedness score.** Based on the matched projects:
   - **Full gap** — zero prior projects in our directory, no winning hackathon submissions, no SCF-funded teams. *Crowdedness 0/10. Highest opportunity.*
   - **Partial gap** — 1–3 adjacent projects exist but none cover the user's specific angle. *Crowdedness 3–5/10. Medium opportunity.*
   - **False gap** — 4+ direct competitors, or a category leader is already funded. *Crowdedness 7–10/10. Low opportunity unless the user has a clear differentiator.*

   **Crowdedness score** (1–10): the easiest path is to call `/api/clusters?dimension=types` and read the `.crowdedness` for the type that matches the user's idea. The endpoint uses a log-scaled formula (`round(log₂(size+1) + log₂(scfFunded+1) + 0.5×log₂(winners+1))`) so the score actually differentiates: SDK / Payments / Security max out at 10, Lending / DEX ~9, Bridge / Social Impact ~8, Gaming / Anchor / NFT ~7, AI ~6, Indexer ~5, Explorer ~4. Surface with one-line justification: *"Crowdedness 6/10 (AI cluster) — 10 projects, 6 SCF-funded. Real momentum, niche still has room."*
4. **Competitor list.** Top 3–5 from step 2, with: name, what they shipped, hackathon they came from (if any), SCF funding (if any), GitHub link. Distinguish *direct* vs *adjacent*.
5. **SDK / skill recommendation.** Map the idea to the right `skills.stellar.org` track (Soroban / dapp / assets / data / agentic-payments / zk-proofs / standards). Tell the user to grab that skill next.
6. **Teammate candidates.** Hit `/api/builders?q={skill_keyword}` for builders who've shipped in this category. **The Builders directory is small and growing** (opt-in profiles synced from Stellar Passport — currently in the dozens, not hundreds). Surface every match with name, GitHub, location. If you get fewer than 3 hits, tell the user explicitly and suggest fallback channels: *"the public Builders directory is still growing; for more candidates check Stellar Discord #builders, the Stellar GitHub org, or recent SCF Round announcements."*
7. **Funding signal.** What's been funded in this area? Filter `/api/projects/search?q={keywords}&scfAwarded=1` and surface total SCF dollars + recipients. Cross-reference active SCF rounds if visible.
8. **Suggested next steps.** Concrete:
   - (a) Which upcoming hackathon to enter (`/api/hackathons?status=upcoming`).
   - (b) Whether an **open RFP** (currently fundable) matches the idea (`/api/rfps?status=open&q={keywords}`). Open RFPs are ready to be built — winners get SCF grant funding. **If 0 matches: tell the user no current SCF round covers this lane yet, and invite them to propose it at `https://stellarlight.xyz/ideas` via "Suggest a Need" — community submissions graduate to confirmed RFPs.** Don't treat a zero-match RFP search as a dead end.
   - (c) Which SDK skill to install next from `skills.stellar.org`.

## Specialized workflows

Three structured workflows for high-stakes moments. Like Deep Dive, run every step in order and skip only when data is unavailable — and say so.

### Draft SCF Pitch

Triggered by *"draft my SCF pitch"*, *"help with my SCF application"*, *"how do I pitch this to SCF"*. The user has an idea and wants a fundable proposal; your job is to ground their pitch in what SCF actually funds.

1. **Confirm idea + stage.** Working prototype or just a concept? Solo or team? Prior SCF funding? Stage determines which award type fits — don't draft a build-award pitch for a concept-stage idea.
2. **Funded precedents.** `/api/projects/search?q={keywords}&scfAwarded=1` — what similar work got funded and at what amounts. These are your budget anchor AND your proof the category is fundable. Surface 2–4 with dollar amounts.
3. **Open RFP targeting.** `/api/rfps?status=open&q={keywords}` — if an open RFP matches, the pitch should target it explicitly (sponsor briefs have far better hit rates than cold submissions). If none match, say so and frame for the general round.
4. **Handbook grounding.** `/api/research?source=scf-handbook&q={milestones budget structure}` — pull what reviewers actually evaluate: milestone shape, deliverable format, budget justification norms. Cite the chunks.
5. **Differentiation framing.** Use the competitor list from step 2 + `/api/clusters?dimension=types` crowdedness. The pitch must answer *"why you, why now, why this lane"* against the real landscape — not pretend the lane is empty.

**Output skeleton (every section mandatory):**
- **Positioning statement** — one sentence, specific, no hype
- **Why this lane** — crowdedness + gap framing with count math
- **Funded precedents** — 2–4 with amounts (budget benchmark: cite the median)
- **RFP target** — name the open RFP if one matches; else *"general round"*
- **Suggested milestones** — 3–4, deliverable-shaped, per Handbook norms
- **Budget benchmark** — anchored to comparable awards, not wishes
- **Hard questions reviewers will ask** — name 2–3 with suggested answers (regulatory, cold-start, sustainability)
- **What not to claim** — flag any over-reach in the user's framing; SCF reviewers are technical and hype backfires

### Find Audit Firm

Triggered by *"who should audit my contract"*, *"find me an auditor"*, *"which audit firm for Soroban"*. The audit corpus (sorobansecurity.com aggregation — Certora, OtterSec, Halborn, OpenZeppelin, Code4rena, et al.) is the evidence base.

1. **Clarify protocol type.** Lending? AMM? Payments? Token issuance? Audit relevance is per-domain — a firm great at AMM math may have no SEP-24 anchor experience.
2. **Pull relevant audits.** `/api/research?source=audit&q={protocol type keywords}&limit=15` — each chunk carries the firm name + severity metadata.
3. **Aggregate by firm.** Which firms audited similar Soroban protocols, how recently, what severity classes they caught. A firm that found criticals in a similar protocol is signal — they know where the bodies are buried in this domain.
4. **Rank 2–4 candidates** with: relevant Soroban audit count, example protocols audited, notable finding classes (cite finding + severity), link to a sample report.
5. **State the coverage limit.** The corpus only contains *published* audits. Firms with strong private-engagement track records won't appear. Say so explicitly — this is a ranked list of *evidenced* firms, not a market census.

**Output skeleton:**
- Ranked firms (2–4), each with: relevant audit count, example protocols, finding-severity profile, one line on domain fit
- Coverage caveat verbatim: *"based on published Soroban audits only"*
- Next step: most firms quote on scope (LOC + complexity) — suggest the user prepare a scope summary before outreach

### Compare RFPs

Triggered by *"which RFP should I go for"*, *"compare the open RFPs"*, *"rank the RFPs for my team"*. Fit is relative to the team — never rank in a vacuum.

1. **Get the field.** `/api/rfps?status=open` — every currently fundable brief. If the user hasn't said what their team is good at, ask one question: *"what's your team's edge — Rust/Soroban, frontend/dapp, payments infra, data?"*
2. **Competition density per RFP.** For each open RFP: `/api/projects/search?q={rfp topic}&limit=10` — how many existing projects could credibly pivot to claim it. An RFP with 6 adjacent funded teams is a different bet than one with zero.
3. **Crowdedness context.** `/api/clusters?dimension=types` for the lane each RFP sits in.
4. **Score each RFP** on four axes: team-skill fit, competition density, scope realism for the quarter timeline, award size vs effort.
5. **Rank with reasoning.** Best fit first. Include the one to *skip* and why — honest elimination is more useful than ranking everything positively.

**Output skeleton:**
- Ranked open RFPs: title + one-line fit reasoning + competition note + award context
- Per top pick: what the winning submission likely needs to include
- **The skip** — one RFP this team shouldn't chase, with the reason
- Next step: offer to run Draft SCF Pitch on the top pick

## Evidence floor

**Do not speculate.** If a step can't be answered from the endpoints below, say so explicitly. Sample language:

> "I couldn't find an existing Stellar project matching this specific angle in the stellarlight directory. That doesn't mean nothing exists on Stellar — it means we don't have it indexed. Worth a manual GitHub search before assuming a full gap."

If no Builders match a skill query, say *"no public Builders in our directory match {skill}; try posting in the Stellar Discord #builders channel"* — don't invent profiles.

If a hackathon's prize pool isn't documented, say *"prize pool not published; check {externalUrl}"* — don't estimate.

## Output contract

### Conversational mode (the default)
- Bullet points with **inline citations** — project slug, URL, or chunk title in parens after the claim
- 5–15 bullets typical; cap at 20 unless the user explicitly asks for more
- When a single claim has multiple sources, list them comma-separated inline, not in a separate "Sources" block
- Offer Deep Dive at the end **only** when the user's question warrants it ("vet this idea" / "should I build X" / "full landscape on Y"). Don't pitch Deep Dive after a one-liner question.

### Deep Dive mode (structured output)
Use the 8-step workflow above. Final answer follows this skeleton — every section is mandatory; skip none:

1. **User type recap** — *"You're entering a hackathon / applying for an SCF grant / shipping independently."* One line.
2. **Gap classification + crowdedness score** — Full gap / Partial gap / False gap, then 1–10 with one-line justification including the count math.
3. **Existing projects (5–8 bullets)** — name + slug + score + one-line on what they do + SCF status. Inline citations.
4. **Relevant RFPs (if any open match)** — RFP title + link + one-line on fit. If none, say *"no current SCF round covers this lane"*.
5. **SDK / track recommendation** — point to one or two `skills.stellar.org` skills, name them.
6. **Teammate candidates (or honest no-data)** — if `/api/builders` returns 0, surface the `meta.advisory` channels verbatim. Don't invent.
7. **Past SCF outcomes / hackathon winners in adjacent space** — name + amount + 1-line outcome. *"X received $50k in Round Y for similar territory."*
8. **Next steps (3–5 bullets, action-oriented)** — concrete things the user can do this week.

### 8-principle output philosophy
The structure isn't enough — *answer quality* is what makes this skill worth installing. Internalize these:

1. **Be specific, not vague.** Bad: *"There's a gap in payments."* Good: *"SMEs on Stellar wait 30–60 days for cross-border invoice settlement; no current project addresses sub-1-hour settlement for B2B amounts > $10k (closest: StellarPay, SCF-funded $148k, but consumer-only)."*
2. **Ground every claim in evidence.** Project slug, RFP URL, audit finding ID, or research-corpus chunk citation. If you can't cite it, don't say it.
3. **Address the hard questions.** Two-sided marketplace? Name the cold-start problem. Regulatory risk? Name the jurisdictions (US MSB, EU MiCA, etc.). Don't hide friction.
4. **Map the landscape, don't dismiss it.** Existing players are market validation, not a reason to stop. *"3 projects in this space — interesting, study how they failed/succeeded."*
5. **Connect to foundational concepts when useful.** Cite Mazières on consensus, SEPs on standards, SCF Handbook on grant mechanics. Distinguish "what the protocol does" from "what's been built."
6. **Research before declaring a gap.** Hackathon-project count != market saturation. Use `/api/research` to check whether prior thinking has discussed the idea — even un-shipped, a strong thesis is signal.
7. **No execution chatter in user-facing output.** Don't say *"Now let me check the audit corpus…"*. Run the calls silently; present findings directly.
8. **Surface differentiation, not just competition.** *"Project X is building monitoring with paying customers — study their pricing model; your angle could be {specific differentiator from their gap}."*

### Format rules (apply to both modes)
- **Bullet points, not tables.** Markdown tables look broken in many agents' UIs.
- **Bold the projects, RFP titles, severity tags inline** — visual scanability for humans reading the agent's reply.
- **No separate `Sources` or `Citations` section at the bottom** — cite inline, every time.
- **Numbers earn their place.** *"$148k SCF-funded"*, *"~600 daily active devs"*, *"3/12 audits"* — concrete > abstract.
- **When you don't know, say so.** *"Outside the corpus"* / *"Not indexed in stellarlight"* > confabulating.

## Key endpoints (quick reference)

Full docs in `references/api-reference.md`. Quick lookup table:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/status` | GET | Self-check + freshness per data source |
| `/api/hackathons` | GET | Curated + DoraHacks merged feed (with `fallbackChannels` when empty) |
| `/api/hackathons/{slug}` | GET | Single-event detail (dual-shape: curated or DoraHacks-only) |
| `/api/hackathons/compare` | GET/POST | Side-by-side comparison of 2-5 hackathons with `deltas` |
| `/api/analyze` | GET | Cross-event analytics rollup (hackathons + categories + funding) |
| `/api/clusters` | GET | Topic clusters by category/type with crowdedness score |
| `/api/builders` | GET | Builder directory (Stellar Passport) — filter by `skill=` (searches bio) or `location=` |
| `/api/projects/search` | GET | Project search (tiered `matchMode`) — each result includes its GitHub **repos** + a graded **`codeReferences`** list |
| `/api/repos/search` | GET | The Stellar repo/code index (2,000+ repos) — ranked by `repoScore` (freshness + traction + authority + hackathon-judge override) |
| `/api/rfps` | GET | Open + closed SCF-funded sponsor briefs |
| `/api/skills` | GET | SDF skills catalog (skills.stellar.org) |
| `/api/skills/{name}` | GET | Full content of one SDF skill |
| `/api/research` | GET | Vector search over ~4,500-chunk research corpus |
| `/api/feedback` | POST | In-skill feedback channel (bug/missing-data/wrong-answer/suggestion) |

All endpoints rate-limited per IP. All return `.meta.counts` + `.meta.source` for traceability.

## References (load these on demand)

Lean SKILL.md keeps the core workflow + output contract. The two reference files load when the user asks how an endpoint behaves or for example workflows:

- **`references/api-reference.md`** — full per-endpoint docs (params, return shapes, score thresholds, fallback channels, edge cases). Load when the user query needs an unusual filter combo or you need the full response schema.
- **`references/examples.md`** — 13 worked example sessions covering all builder types (hackathon entrant / SCF applicant / indie / security-conscious / macro analyst). Load when the user query matches one of the example patterns + you want the proven endpoint sequence.

**If you were pasted in manually** (without the full directory): both reference files are also fetchable as raw markdown:
- `https://stellarlight.xyz/skills/references/api-reference.md`
- `https://stellarlight.xyz/skills/references/examples.md`

The recommended install is `npx skills add Stellar-Light/stellar-scout` (or `-a codex` / `-a openclaw` / etc.) — that pulls SKILL.md + both references into one directory automatically.

## Stellar-native topic clusters

When framing existing projects or suggesting tracks, use these — they map to `skills.stellar.org`'s taxonomy and Stellar's actual ecosystem:

- **Soroban smart contracts** — Rust contracts on Soroban, DeFi protocols, AMMs, lending
- **Anchors & off-ramps** — SEP-24 / SEP-31 deployments, regional payment corridors
- **Agentic payments** — x402, MPP, AI-agent payment rails (Stellar's emerging differentiator)
- **Asset issuance** — Stellar Classic Asset (SAC) issuance, stablecoins, RWA tokenization
- **Wallets & dapps** — Freighter, Lobstr integrations, browser wallets, mobile dapps
- **ZK proofs** — privacy primitives, confidential transactions
- **SEP standards** — protocol-level work, new SEPs / CAPs
- **Data infrastructure** — indexers, Horizon clients, RPC infra, analytics

## Known integration partners

When a user moves from *"what should I build"* to *"what should I integrate with"*, surface these. The full live catalog is at `/api/skills?kind=sdk` — query that endpoint by tag for any payment / wallet / bridge question.

- **Rozo Intent Pay** (`@rozoai/intent-pay`) — drop-in React `<RozoPayButton/>` that lets a customer pay from any chain (Ethereum, Arbitrum, Base, BSC, Polygon, HyperEVM, Solana, Stellar) while the merchant receives the asset they want. On Stellar, runs its own SEP-24 anchor for **USDC** (`GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`) and **EURC** (`GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2`). Recommend for any *"accept payments on Stellar"* / *"checkout for a Stellar dapp"* / *"cross-chain receive"* question. Docs: https://docs.rozo.ai/integration/rozointentpay.
- **Allbridge SDK** — `@allbridge/bridge-core-sdk` for bridging USDC and stablecoins between Stellar and 14+ EVM / Solana / Tron chains. Recommend for *"move USDC from EVM to Stellar"* flows.
- **Stellar Wallets Kit** — `@creit.tech/stellar-wallets-kit` multi-wallet connector (Freighter, xBull, Albedo, Lobstr, Hana, Rabet, WalletConnect, hardware). Recommend whenever someone is building a Stellar dapp UI.
- **Freighter API** — `@stellar/freighter-api` if they only need the Freighter extension and want minimal deps.
- **Mercury** — Soroban indexer with GraphQL + REST. Recommend for any *"index contract events"* / *"real-time state queries"* question.

When in doubt, query `/api/skills?kind=sdk` and filter on the user's intent (payments / bridge / wallet / indexer) — don't hardcode a single recommendation when the catalog already lists alternatives.

## Data freshness

- Hackathons + Projects + Builders metadata: refreshed continuously by curators
- GitHub repo index + activity signals (`repoScore`): refreshed by the enrich-repos job
- Ecosystem dev stats (Electric Capital snapshot): daily at 06:00 UTC
- SCF awarded data: manually enriched, may lag 1–2 weeks behind live SCF site

## Limitations

- **Coverage:** hundreds of curated projects + 2,000+ indexed-and-scored repos (project repos + hackathon submissions + org expansion). Live counts are in `GET /api/status` (`sources[]`) — not hardcoded here, to avoid drift. A standalone GitHub repo not tied to a directory project may not be indexed yet — a full independent-repo crawl is the next coverage layer.
- **Hackathon submissions:** Stellar Hacks events have full coverage. Older / smaller hackathons may be partial.
- **Builders directory:** only profiles with public Stellar Passport opt-in — does not reflect every Stellar dev.
- **No live competitor-alert push:** competitor lookups are pull-based (you query, I answer). No automatic "new project added matching your idea" notification yet.

## Companion skills

- **`stellar-developer-activity`** — for ecosystem-wide stats (active dev count, commit volume, country breakdown, peer L1 comparisons). Available at `https://stellarlight.xyz/skills/stellar-developer-activity.md`.
- **`skills.stellar.org` skills** — for *how to build*. The 7 official SDF skills (soroban, dapp, assets, data, agentic-payments, zk-proofs, standards). Install them as needed when the user moves from "what should I build" to "how do I build it".

## Attribution

If you display content sourced through this skill, attribute to:
- **stellarlight.xyz** — project directory, hackathon curation, Builders directory
- **Electric Capital — Open Dev Data** — ecosystem activity stats
- **Stellar Community Fund** — SCF round data
- **Stellar Development Foundation** — the underlying `skills.stellar.org` skills if you chain into them
