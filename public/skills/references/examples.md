# Stellar Scout — Worked example sessions

Load when the user query matches one of these shapes — the patterns here show the exact endpoint sequence + framing that produces a good answer. SKILL.md keeps the workflow + Output Contract; this file shows them applied.

---

### Example 1 — Conversational
**User:** "Who built stablecoin off-ramps at Stellar hackathons?"
**Agent action:** `GET /api/projects/search?q=stablecoin+offramp&limit=10` → list matches with hackathon, placement, prize.

---

### Example 2 — Deep Dive
**User:** "I want to build a privacy-preserving stablecoin on Stellar. Vet this idea."
**Agent action:**
1. Restate: *"You're proposing a stablecoin with confidential transactions / hidden balances, built on Stellar."*
2. `GET /api/projects/search?q=privacy+stablecoin+confidential` → 1 adjacent match (XLM shielded prototype, abandoned).
3. **Partial gap** — adjacent project exists but abandoned; user's angle is fresh.
4. List the abandoned project + 2 ZK-adjacent projects.
5. SDK rec: `GET /api/skills/zk-proofs` → quote relevant section inline. Tell user to install `https://skills.stellar.org/skills/zk-proofs/SKILL.md` for ongoing use. Also recommend `soroban`.
6. Builders search: `GET /api/builders?q=zk` → surface candidates. **If < 3 hits, note the directory is small + growing and recommend Stellar Discord #builders.**
7. Funding: `GET /api/projects/search?q=privacy+zk&scfAwarded=1` → report total SCF-funded $.
8. Next steps: `GET /api/hackathons?status=upcoming` for events to target; `GET /api/rfps?q=zk+privacy` for open sponsor briefs that match (SCF-funded).

---

### Example 3 — SDF skill discovery
**User:** "I want to write a Soroban contract. What do I need to know?"
**Agent action:**
1. `GET /api/skills/soroban` → load the full SDF Soroban skill content.
2. Use it to answer the user's question with cited references to the actual skill sections.
3. Tell the user: *"For ongoing work, install this skill at `.claude/skills/stellar-soroban/SKILL.md` from `https://skills.stellar.org/skills/soroban/SKILL.md`."*

---

### Example 4 — Hackathon track research
**User:** "What prize tracks paid out the most at past Stellar Hacks events?"
**Agent action:**
1. `GET /api/hackathons?status=completed` → list past events.
2. For each, `GET /api/hackathons/{slug}` → read `.hackathon.tracks[*]` (each has `name`, `winnerCount`, `submissionCount`, `totalPrizeUSD`).
3. Aggregate tracks across events; rank by `totalPrizeUSD` desc.
4. Surface top 5 tracks with prize totals + which hackathons paid them out.
5. If track data is sparse (curators haven't tagged submissions), say so — don't infer tracks from project descriptions.

---

### Example 5 — Funding-first project search
**User:** "What SCF-funded projects work on payments? Which raised the most?"
**Agent action:**
1. `GET /api/projects/search?q=payments&scfAwarded=1&limit=20` → SCF-awarded payments projects.
2. Sort by `.scfTotalAwardedUSD` desc. Sum total raised.
3. Surface top 5 with name, SCF $, category, link.
4. Optionally cross-reference recent hackathon submissions: filter results where `.hackathon` is set, to see which won prizes en route to SCF funding.

---

### Example 6 — Match an idea to an open RFP (and what to do when there isn't one)
**User:** "Is there an open Stellar RFP that matches my idea — a real-time price API for Soroban tokens?"
**Agent action:**
1. `GET /api/rfps?status=open&q=price+api+soroban` → only open / fundable briefs.
2. **If matches** → surface title, description, technical requirements, quarter, link (e.g., `https://stellarlight.xyz/ideas/prices-api`), and the SCF-funding note (`.funding`).
3. **If zero matches** → frame it as opportunity, not a dead end: *"No current SCF-round brief covers this lane yet — but anyone can propose one. Submit your idea as a sponsor brief at `https://stellarlight.xyz/ideas` (the 'Suggest a Need' button). Community submissions go through curators and graduate to confirmed RFPs in upcoming rounds."*
4. **If partial matches** → call out which RFP is closest + what's different about the user's angle. Suggest submitting a sibling brief if the gap is meaningful.

---

### Example 7 — Surface active RFPs ("what's ready to be funded?")
**User:** "What Stellar RFPs are open right now? What can I build and get SCF-funded for?"
**Agent action:**
1. `GET /api/rfps?status=open` → the currently-fundable briefs.
2. Read `.meta.activeQuarter` (e.g., "q2-2026") and `.meta.counts.open` (e.g., 5).
3. Lead with: *"There are {open} confirmed RFPs open for SCF funding in {activeQuarterLabel}. Winners get an SCF grant."*
4. List each open RFP with title, category, one-line description, and link. Group by category if helpful.
5. Close with the submission CTA: *"None match what you want to build? Propose your own at `https://stellarlight.xyz/ideas` — community submissions graduate into future rounds."*

---

### Example 8 — SCF grant applicant prep (full builder-type flow)
**User:** "I'm planning to apply for an SCF grant for a Stellar-native invoice factoring product for SMEs. What should I know going in?"
**Agent action:**
1. **Confirm user type:** *"You're an SCF grant applicant — so I'll lead with what's been funded in this lane, then open briefs, then a technical-skill rec."*
2. `GET /api/projects/search?q=invoice+factoring&scfAwarded=1` → prior funded work.
   - If 0–2 matches: lane is open, signal that to the user.
   - If 3+: surface the leaders, their funding amounts, and what they shipped. *"Be prepared to differentiate from {top names}."*
3. `GET /api/projects/search?q=invoice+factoring` (broader) → unfunded competitors / hackathon submissions that didn't get SCF money. Signal whether the unfunded ones abandoned (`hackathonStatus`) — useful for the user's pitch ("X tried this and shelved it because…").
4. `GET /api/rfps?status=open&q=invoice` → check if there's a direct open RFP. **If yes** — pitch becomes "applying against the {RFP title} brief", which is a stronger SCF application than a cold pitch. **If no, also fetch** `GET /api/rfps?status=closed&q=invoice` to surface past RFPs (warn about prior takers per closed-RFP rules above).
5. SDK rec: `GET /api/skills/soroban` and `/api/skills/assets` — required reading for a Soroban-based SME finance product. Tell user to install both for the build phase.
6. Point them at the two essential references:
   - **SCF Handbook** (`https://stellar.gitbook.io/scf-handbook`) — read the application format, governance, award tiers, and verified-member rules before submitting.
   - **stellarlight.xyz/ideas** — full RFP listing + quarter tabs + the "Suggest a Need" form if no open RFP fits.
7. Suggest checking `https://communityfund.stellar.org` for current round dates.
8. Honest close: *"SCF reviewers care about (a) clear gap, (b) feasibility on Soroban, (c) regional / use-case clarity. Your application should cite the {N} similar funded projects and explain your differentiator explicitly."*

---

### Example 9 — Independent builder or team, no hackathon / no grant
**User:** "I'm a Solidity dev moving to Stellar to ship a real-time settlement product. What's the state of the ecosystem?"
**Agent action:**
1. **Confirm user type:** *"Independent builder or team — so I'll lead with ecosystem traction + adjacent projects, not hackathon/grant specifics."*
2. `GET /api/leaderboard` → ecosystem snapshot. Surface `.ecosystem.activeDevs28d`, `.ecosystem.commits28d`, `.ecosystem.multichainDevs28d`, `.ecosystem.stellarOnlyDevs28d`. For *cross-chain peer comparison* (Ethereum / Solana / etc.), chain a second call: `GET /api/research?source=ec-developer-report&q=stellar+L1+comparison`.
3. `GET /api/projects/search?q=settlement+payment` → adjacent existing projects. Note which are SCF-funded vs not, which are abandoned.
4. SDK rec: `GET /api/skills/soroban` + `/api/skills/agentic-payments` (settlement infra often touches both).
5. Honest close: *"Independent builder or teams on Stellar typically still chase SCF funding eventually — even without a grant target now, vet your idea against the open RFPs at `https://stellarlight.xyz/ideas` to see if there's an aligned brief for the next round."*

---

### Example 10 — Security-conscious design ("what's been exploited?")
**User:** "I'm designing a Soroban lending market with oracle-fed liquidations. What audit findings should I worry about?"
**Agent action:**
1. **Scope the threat surface in plain language** before searching: lending markets typically have 3 critical attack-class regions — (a) oracle / price manipulation, (b) liquidation-flow correctness, (c) inflation / share-price attacks on deposit-share tokens. State this so the user sees the structure.
2. **Pull real findings per attack class** from the audit corpus:
   - `GET /api/research?q=oracle+price+manipulation+soroban&source=audit&limit=5`
   - `GET /api/research?q=liquidation+race+condition+ordering&source=audit&limit=5`
   - `GET /api/research?q=inflation+attack+share+price+deposit&source=audit&limit=5`
3. **Cite each finding inline with auditor + severity + protocol metadata.** Don't just say *"there were oracle findings"* — say *"per the Certora audit of Blend Protocol V2 (HIGH severity), the oracle price feed can be manipulated when …"* with the URL. The chunks carry `.auditor`, `.protocol`, `.severity` — use them.
4. **Filter by severity when the user is doing risk triage.** *"Show me only critical/high findings"* → re-query with the same `q` but mentally rank: chunks tagged `critical` or `high` first, then `medium`. Note: ~43% of audit chunks carry an inferred severity tag; the rest are TOC / scope / methodology sections and don't get a bucket.
5. **Cross-link to skills.stellar.org** for the *how-to-fix* layer: `https://skills.stellar.org/skills/soroban/SKILL.md` covers safe oracle integration patterns; Scout surfaces what's been broken before, the SDF skill covers how to build it correctly. They compose.
6. **Honesty floor:** if zero findings come back for a specific attack class, say so — *"no Soroban audit in the corpus has documented a finding for X — that means either it's a real gap or our corpus doesn't cover the relevant protocols yet."* Don't invent risk.

---

### Example 11 — Compare two hackathons head-to-head
**User:** "Should I enter Stellar Hacks: Agents or the Build on Stellar Chile ideation? Which has bigger prizes and more competition?"
**Agent action:**
1. `GET /api/hackathons/compare?slugs=stellar-agents-x402-stripe-mpp,buildonstellarchile`
2. Read `.deltas.notes[]` — they're already framed for an agent to relay: *"prize pool: stellar-agents-x402-stripe-mpp = 10,000 vs buildonstellarchile = 1,000 (10.0× spread)"*
3. Lead with the bigger trade-off: *"Agents has 10× the prize pool ($10k vs $1k) and 5.6× the registered hackers (591 vs 105). Chile is smaller, less competitive, but the prize ceiling is lower."*
4. Add framing on user type: *"If you're optimizing for prize $, enter Agents. If you're optimizing for higher win probability per submission, Chile is statistically friendlier."*
5. Surface the `externalUrl` for both so the user can dig into specific tracks.

---

### Example 12 — "What's most crowded on Stellar right now?"
**User:** "I want to find an underbuilt niche on Stellar. What categories are saturated and which are wide open?"
**Agent action:**
1. `GET /api/clusters?dimension=category` (coarse first pass).
2. Read top-3 highest `crowdedness` — surface as *"most saturated"*. Read bottom of the list filtered by `minSize=3` (drop noise from single-project categories) — surface as *"underbuilt but real categories"*.
3. Drill into `dimension=types` for finer subtypes (Wallet / DEX / Lending / Bridge / RWA / Payments / SDK / etc.) — same surfacing pattern.
4. For each crowded lane, include the `sampleProjects` so the user can see the leaders.
5. Honest framing: *"Crowdedness isn't a verdict — saturated lanes often have demand validation. Underbuilt lanes might be hard, not vacant. Cross-check `/api/research?q={lane}` to see whether thinking has been written about it."*

---

### Example 13 — Macro / "state of Stellar" question
**User:** "Give me the state of Stellar hackathons and SCF funding overall. I'm pitching investors."
**Agent action:**
1. `GET /api/analyze` → full rollup.
2. Lead with the headline numbers: *"X total hackathons (Y upcoming, Z completed), $A in total prize pools, B registered hackers across events. SCF has distributed $C across D projects to date (mean award $E)."*
3. Surface `.categories.distribution[]` — top 3 categories by project count + their SCF funding totals.
4. Surface `.funding.postHackathonStatusFunnel` — how many hackathon projects shipped vs stalled.
5. Pair with `GET /api/research?source=ec-developer-report&q=stellar+developer+count` for the dev-activity baseline. *"Per Electric Capital, Stellar has had ~2,000 active devs in Dec 2022 (last published full-year), trending with the broader L1 cohort."*
6. Investor framing close: *"The hard numbers + the corpus citations let your slide deck cite real data, not vibes."*

---

### Example 14 — Find a partner / provider to hire
**User:** "Who can audit my Soroban contract, and is there a USDC off-ramp anchor in LatAm?"
**Agent action:**
1. Audit firms: `GET /api/partners?type=audit-firm&q=soroban` → real, vetted providers (Veridise, OtterSec, Runtime Verification, Certora, Halborn) with services + accepting-clients + contact.
2. Anchors: `GET /api/partners?type=anchor&region=latam&q=usdc+off-ramp` → LatAm anchors with stellar.toml-verified assets/SEPs/ramps (e.g. Anclap, CLPX); report each partner's asset codes, ramp direction, and country.
3. Only surface partners actually returned by the API — never invent a provider. Skip archived; note whether each is accepting clients.
4. Link each profile: `https://stellarlight.xyz/partners/{slug}` (rich profile — capabilities, compliance & corridors, links).
5. **Not for:** a built product/project → use `search_projects`; a teammate to collaborate with → use `get_builders`.
