# QUALITY, the progression from "we fix what we trip over" to "agents run it"

Companion to [PLAN.md](./PLAN.md) (what we build) and ARCHITECTURE.md (how it
works). This is the working doc behind the /quality surface: why the same bug classes recur, the
three layers that end that, the machinery that runs it, and the measurable ladder
from human-driven fixing to agent-run operation.

## 0. The honest diagnosis (2026-08-27)

Six classes account for nearly every finding ever filed against us, by SDF
reviewers, by stellar-raven, by our own batteries:

1. **Identity**, a name should find its thing; phrasing must not break it
   (sls-009, -076, the liveness/anchor bugs, slug-not-in-haystack).
2. **Honest degradation**, when we relax, the response must say so
   (matchMode families, vetIdea neighbours, exact-miss honesty).
3. **Evidence population**, the field exists, rows are empty; collectors
   have structural blind spots (redirect hops, bot walls, provenance nulls).
4. **Taxonomy coverage**, a vertical without an enum member is invisible
   (Exchange, Oracle).
5. **Contract completeness**, opaque schemas, silently-ignored params
   (resolver objects, listSkills q).
6. **Cross-surface consistency**, two of our answers disagree (sls-073).

Why fixes did not stick as classes: each fix landed **where the bug fired**,
conventions live in ~35 hand-written operations instead of one enforced
layer, guards **sample** instances instead of enforcing invariants, and the
findings ledger records instances without a class-closure step. Detection
outruns remediation by design; the pile grows.

## 1. The three layers (every finding must land in one)

**L1. Invariants (CI, cannot regress).** A class is dead only when code
physically cannot ship a violation. Live today: contract freshness, spectral,
routing budget, vocabulary-drift test, **schema opacity zero** (this PR -
the resolver class, locked). Next: the *list-endpoint honesty conformance*
(every list op provides matchMode + honest-empty + advertised params, one
shared layer, one test that walks the spec and probes every op).

**L2. Coverage SLOs (data, trend-tracked, ratchet-only).** Numbers that may
only move up, published weekly to /quality, regression = red: Live rows with
dated source (98%+ target; 91% → 98% on 2026-08-27), link-evidence coverage,
typed-vertical reachability (every type with ≥2 rows has enum + intent +
rows), scan coverage. A ratchet that dips pages a human.

**L3. Adversarial discovery (rotating, never green-by-default).** The truth
battery (guard D), golden parity, and **surveyor rounds**: fresh question
sets from rotating personas (hacker, investor, integrator, historian) run
through the live gateway. Slices D–F already derive expectations from
curation instead of hand-written lists, extend that principle everywhere.

**The closure rule (the whole point):** every finding, ours, Tyler's,
kalepail's, gets a class label from §0 and must close as one of:
`invariant-added` (L1) · `slo-added` (L2) · `bank-added` (L3) · `wont-fix`
(with reason). *A fix with no layer is not closed.* The metric that matters
is **recurrence after a silence-close**: a NEW finding on a (surface,
failure-mode) pair we had already closed *on silence* — the detector stopped
reporting and nobody re-probed. That is the closure rule's actual question:
did we close without repairing, and did the same kind of failure come back?
Steady state means that number reaches zero and stays there. Its exact-id
sibling — a specific finding a detector raises again after closure, hardest
when the closure was `verified` — is published beside it.

The **headline close rate counts evidence only**: `verified` plus a `cleared`
carrying a live re-probe stamp. A detector going quiet is not repair, and
silence-closes are published apart as their own share rather than folded in.
Both live in the artifact (`findings.closure`, `closingRate`, `silenceShare`)
— never hand-copied into this document.

The number this replaces, **repeat-class rate** (a finding whose §0 class had
any prior finding), is kept as context under `classRecurrence`. With eight
broad classes it is pinned near 100% however much repair lands, so it cannot
be steered by; it is reported, not targeted.

## 2. The machinery we already have, and the one loop it was missing

We are not short on machinery. Mapping what EXISTS to the functions:

| function | already running |
|---|---|
| daily sentinel | raven-eval-parity (guards A-D), category battery, canary, drift + freshness guards |
| weekly sweeps | check-links, upgrade-status-basis, scan waves, partner freshness |
| discovery engine | engines A-D detectors → improvements ledger → /quality |
| adversarial rounds | the truth-battery waves + externally: stellar-raven's sls pipeline |
| contract gate | contract:check, spectral, routing budget, vocabulary-drift test, opacity lock |

What was missing is not a new lane, it is the **closure rule** (§1) binding
them: today a detector files a finding, a human fixes an instance, the pile
grows. The rule makes every finding terminate in a layer, and the repeat-class
rate measures whether that actually happened.

Two practices adopted from stellar-raven's `.agents/` discipline: dated
append-only **round ledgers** for multi-lane efforts (exact commands and
outputs, verdicts with stamps, "tests passed" is not evidence), and **"done
means"** stated on every queued item.

## 3. The autonomy ladder

Stage advancement is earned per lane: **N consecutive intervention-free
weeks** (human reviewed, changed nothing), then the gate opens.

- **Stage 0 (past):** human does the work, agents assist.
- **Stage 1 (now):** agents do the work end-to-end; human merges. Every PR
  carries live verification in its body.
- **Stage 2 (entry: 2 clean weeks/lane):** auto-merge on green for
  bounded work, guard banks, lessons, docs, dry-run reports. Contract and
  data-execute still human-gated.
- **Stage 3 (entry: 4 clean weeks):** data mutations execute after
  dry-run diff < threshold + mandatory read-back verify; the daily loop lands
  root fixes in non-contract code.
- **Stage 4 (steady state):** human gates only: contract version
  changes, outward-facing posts, spend, and anything §0-class-new.

**How a week is counted.** A week counts for a lane only when that lane
executed ITSELF and nothing it wrote was corrected, and the weeks must be
CONSECUTIVE ISO weeks running up to the current one — four scattered good weeks
are not four clean weeks, and a lane that stops running stops earning the same
day. An execute a human dispatched is a person operating the lane: it is
reported and it earns nothing. Every counted execute is proven from that run's
own job steps (a skipped step moved nothing), never from today's copy of the
workflow file — an instrument that re-reads the past when you edit a YAML today
is not an instrument. The roster of lanes that can write to production is
derived at run time from `.github/workflows`;
`improvements/lanes/lanes.json` supplies only what each lane writes, and a
workflow missing from it is reported could-not-check.
`scripts/check-lane-autonomy.ts` counts against GitHub's own run history into
`improvements/audits/lane-autonomy-latest.json`, published on /quality. The
reset is `improvements/lanes/interventions.json`, append-only: the newest entry
for a lane restarts its clock, and **any PR that corrects what a lane wrote —
or the read-back used to verify it — appends its entry there in the same PR.**
An unlogged correction silently buys autonomy the lane did not earn. Reaching
the bar publishes ELIGIBILITY; the promotion itself stays a human call.

**Steady state =** 4 consecutive weeks of: all dailies green · recurrence
after a silence-close at 0 · SLOs at target · zero externally-filed
correctness findings. Then the service runs at Stage 3+ by default and humans
do product, not repair.

## 4. Phases

- **P0. Name the classes, lock the first invariant.** `status: done`
  This document · the opacity lock in CI · §0 class labels DERIVED from
  every finding's failureMode (CLASS_OF in build-quality-artifact.ts — a
  total, reviewable map; unmapped modes warn) · battery lanes on the rounds
  format.
  *Evidence:* `check-schema-opacity.ts` (the 47 baselined open maps were
  paid down to ZERO in #1092; the ratchet now holds the floor at 0), QUALITY.md
  itself.

- **P1. Honesty layer, eval integrity, the dashboard.** `status: done`
  The list-endpoint honesty layer + conformance ratchet (#1060) with the
  8-op debt paid to zero via one shared vocabulary (#1061) · eval-bank
  freeze with sha256 fingerprints and a vitest gate (#1063) · the bank
  linter with live rot detection · persona rotation in the battery banks ·
  the /quality dashboard with committed trend history (#1075), rebuilt
  around findings, gap matrix and the miss funnel (#1077, #1078).
  *Evidence:* `specs/honesty-baseline.json` (debt 0),
  `scripts/eval/eval-baselines.json`, `improvements/quality/*.json`.

- **P2. Entity truth: issuers, receipts, enumerations, dedupe.** `status: done`
  sls-033 closed at root, typed enumerations are limit-independent sets
  (#1064, #1065) · stablecoin issuer relations made conflation-proof, with
  the `issued` claim family (#1068, #1069) · receipts-in-repo for
  human-verified corrections (#1073) · repo dedupe: the 2026-08-28 census
  found 381 duplicate rows (a rename-loop in enrich-repos creating a fresh
  copy per pass); root cause fixed with a canonical-name lookup (#1081), the
  381 orphans merged and deleted (run 33140742611), and the read-back guard
  (`check-repo-dupes.ts`) verified 12938 rows = 12938 distinct fullNames. The
  guard now runs after every enrich wave, so the phase stays done only while
  the collection stays clean.
  *Evidence:* battery slice G (enumeration integrity), slice H (verify
  grades itself), `improvements/receipts/`,
  `improvements/quality/entities.json` (repos.duplicateRows = 0),
  `scripts/data/check-repo-dupes.ts` in enrich-repos.yml + dedupe-repos.yml.

- **P3. Earned autonomy.** `status: in progress`
  Stage-2 autonomy for bounded work · event-driven freshness (PLAN §5) ·
  steady-state review.
  *Shipped so far:* the daily pipeline now rebuilds its own quality
  artifacts and commits them, and the stale-finding sweep re-probes the
  ledger instead of letting counts drift. 2026-08-28: the FIRST bounded
  agent lane is live — the deployment-evidence gap (sls-079) is worked
  mechanically by the weekly curation pass via the operator-toml chain
  (the project's own stellar.toml -> declared code+issuer -> confirmed on
  Horizon mainnet; full chain or abstain, basis labeled "operator-toml" so
  a machine stamp never impersonates a human one). The lane reproduces the
  2026-08-28 hand-worked queue's mechanical half; judgment cases (operator
  docs, bundles) stay human.
  2026-08-29: the closure rule's METRIC exists — repeat-class rate is
  computed from the ledger and published on /quality (first measurement:
  30-day rate 100%, 168/168 new findings in already-seen classes; lifetime
  98.7% across 6 classes + meta-eval. The treadmill, now with a number).
  *Remaining:* one lane is not a system — the gap matrix's other rows
  (typed, sourced, knowledge notes) still close by hand, and Stage 2
  requires N intervention-free weeks before auto-merge opens for bounded
  lanes; the count starts now, at zero.

- **P4. Basis strength at scale.** `status: in progress`
  The board's own #1 limitation, made the phase: 842/979 rows (86%) rest
  on the weakest honest bases (site-liveness, source-inherited). P3 proved
  one bounded lane (operator-toml); P4 runs the basis-upgrade lanes across
  the population — operator-toml wherever a toml exists, onchain-activity
  from Horizon for issuer/contract rows, dated operator announcements
  where a human already verified one — and pays the 59 untyped rows to
  zero so exact type enumerations see the whole population. A machine
  stamp never impersonates a human one: basis labels stay honest per the
  P3 lane rule.
  *Checks (live before the phase starts):* rowQuality.statusBasisMix +
  basisStrength on /quality measure the weak-basis share — the phase
  ratchet is that share, which may only FALL; done when weak bases are
  under 50% of rows. The untyped count is published in knownLimitations;
  done at 0.
  *Shipped so far:* 2026-08-31→09-01 — the basis-upgrade lanes exist and
  have run against the population: evidence A (asset movement deltas
  between two dated stellar.expert readings), B (DeFiLlama TVL ≤14d) and
  C (Horizon, same day — issuer payments asset-matched over 20 records,
  XLM-pair trade fallback), every probe trinary (hit / checked-empty /
  could-not-check reaches the summary and the exit code). 35 rows now rest
  on onchain-activity; a two-auditor pass (agent + Grok) reverted 4
  uncorrected-probe upgrades, one of which re-earned its upgrade the same
  run under the corrected rule. Asset keys joined from the stablecoin
  registry (12) and operators' own stellar.toml (7) so deltas compound
  weekly. Death receipts: 42 stamped, 8 retracted after audit (a live-200
  page cannot stand as "observed dead"), 2 re-stamped once their domains
  went hard-dead. Untyped 59→2 (both honest residuals). Weak share: read
  `strongBasisSplit` and `strongByBasis` in
  `improvements/quality/entities.json` — the number is no longer
  hand-printed here, because on 2026-09-05 this file said 84%, the board
  62.7% and knownLimitations 62% for one SLO. The 2026-09-04 drop
  (794→617 weak) was 173 rows on two NEW evidence tiers (repo-activity,
  product-integration) plus 4 within the pre-existing onchain-activity
  tier: real evidence, and a change in what counts — reported as two
  numbers from now on, never as the ratchet falling.
  *Remaining:* the done bar is weak bases under 50%. 144 weak rows have a
  website that never answered a successful check — their reason is now
  printed as an owner triage table (relink / Inactive / leave), and that
  is human work, not a lane. operator-announcement is a basis value on 3
  rows: a corpus-announcement lane (dated SDF/operator launch posts →
  basis + receipt) is the unbuilt lever with the most headroom. The
  XLM-denominated channel deposit has no USD ceiling until a price source
  that path may depend on exists.

- **P5. The knowledge layer consumers keep asking for.** `status: in progress`
  The consumer-measured gap, not a wishlist: knowledgeNotes exist on 16 of
  206 curated-pool repos; supersededBy/deprecatedAt exist nowhere;
  contracts join rows only where the P3 lane reached; builder/org identity
  is thinner than project identity. P5 = curated, DATED repo facts
  (supersededBy, deprecatedAt, migration notes) across the curated pool;
  contracts as first-class joined entities; builder/org coverage held to
  the same standard as project rows.
  *Checks (live before the phase starts):* repoQuality.withKnowledgeNotes
  and joinedToMainnetContract are already served on /quality — committed
  as floors that may only RISE. Every fact carries the date that covers
  IT: the answer-dating guard already enforces the dating contract, so an
  undated note never counts toward the floor.
  *Shipped so far:* 2026-09-01 — the curated knowledgeNotes registry grew
  16→~29 repos, every note dated and source-cited, including the
  supersession facts consumers actually ask for as prose (stellar/go →
  go-stellar-sdk, the Horizon monorepo split, the js-sdk deprecation
  chain, protocol ceilings). explainRepo now answers from a dated note
  ahead of an undated DeepWiki walkthrough (`answerSource:
  "knowledge-note"`, `answerAsOf` RFC 3339), matched by exact identifier
  or by hand-authored trigger phrases; the matcher was hijack-hardened
  (citation URLs and bare domains can no longer route a note). sls-080
  closed on the consumer's own probe and independently re-verified by
  Raven on 2026-09-01. 2026-09-04/05 — the product-level knowledge sls-023
  asked for (which product is actually issued on Stellar, by whom, with
  what controls) exists as a verified RWA registry: 97 tokens re-verified
  from the issuer's own stellar.toml or the Soroban contract itself, feeding
  `products`, `deployment` and on-chain `controls` on project rows, pinned
  hourly on production (#1298–#1306). 2026-09-05 — supersededBy /
  deprecatedAt / supersessionKind are FIELDS on repo rows: 50 notes carried
  the prose, 34 became a curated dated map keyed by the superseded repo,
  `successorRepo` is derived from it, and a test holds prose and fields
  together (spec 1.9.36, #1307).
  *Remaining:* contracts as first-class joined entities only where the P3
  lane reached (11 of the 308 expected-tier repos). Builder/org identity is
  still thinner than project identity. Supersession is curated (34 repos):
  a repo archived after its note was written is not covered until the
  note is, which the note-freshness lane does not yet detect. 12,851
  indexed repos carry no note — the long tail is by design, the curated
  pool is the floor that rises.

## State of the program — as of 2026-09-05

Kept current by rule: any PR that adds, changes or retires a lane, moves a
phase status, or opens/closes a blocker updates this block in the same PR.
An agent must be able to answer these six without archaeology.

**What are we actually trying to do.** End the recurring §0 defect classes
by forcing every finding into a layer (guard / SLO / bank / won't-fix), and
earn autonomy until bounded agent lanes run quality without drop — the
owner needed only for contracts, posts, spend and a new §0 class. P1–P5
above are the phases; the done-bars are theirs.

**Who owns it.** The program, /quality and the ledger: Shubh. Lanes —
enrich-repos (weekly, Monday), refresh-stablecoins (6h), refresh-rwa (6h),
basis lanes (onchain / product / repo-activity, dispatch), dedup (manual:
dry-run, then execute with a read-back) — all Shubh until a lane earns its intervention-free weeks. Raven's
router scorer and catalog: upstream (stellar-experimental/stellar-raven).
Golden questions: Raph. External findings: Tyler / kalepail / SDF reviewers.

**What changed this week (2026-08-31 → 09-05).** ~120 merged PRs
(#1229–#1348; the 09-05 day addendum below covers #1311 onward): the RWA product model for sls-023 (registry, products,
deployment, controls, an hourly pin, a six-hour measuring lane);
supersession as fields on repo rows; a partition-sum guard; fixes across
every scout.* surface — hackathon submissions truncated at 300, outcomes
served as 0/0/0/0, a winner's award serving the whole pool, contract
ownership stamped on other people's contracts, builders ranked by a
featured flag, an audit count that was a subset, a chart drawing gaps as
zero. And a cross-vendor audit that found the first sls-023 close-out
overclaimed and 34 one-holder assets served as live — both corrected.

**What's blocked.**
- Raven router: the intended op is excluded when a question contains
  another op's id noun (stellar-raven #124, filed 2026-09-03) — upstream
  scorer; Scout-side vocabulary does not fix this class. Measured
  2026-09-05: 2 misses of this class, 1 named-entity miss and 1 bare-name
  miss (no operation text carries project names), and 3 where a long
  description wins on stopword density — all the scorer's, not vocabulary.
- Raven catalog text: the deployed catalog (manifest 2026-09-03T17:09Z)
  still serves pre-08-31 descriptions for getRfps/explainRepo/getPartners
  and none of the 09-02/09-03 x-routing words — 9 routing misses are
  `catalog-lag`. Not filed — lag, not drift; the artifact's `catalogView`
  says when it clears.
- Raven catalog lag: `getRwaAssets` (since 2026-09-04) and `verifyClaim`
  (since 2026-08-27) not exposed. Not filed — lag, not drift.
- App-only weak rows (`strongBasisSplit.appOnly`; 550 on the 09-05 evening
  board) and the never-answered sites: human triage (relink / Inactive /
  leave). The verification-packet lane is the instrument, under the
  tightened Live rule in the day addendum. Since 2026-09-01.
- 3 dedup clusters vetoed for a human (EURC is a name-only false positive;
  Passport would hide an SDF-verified row; LumosDAO's keeper is a Draft).
  The other 19 executed 2026-09-05. Since 2026-09-04.
- Corpus-announcement lane (P4's named lever): tested 2026-09-05, 2 of 18
  sampled weak projects appear in a dated corpus doc, one a false match —
  our corpus is not where operator launch posts live. Not viable as designed.

**Which commitment is at risk.**
- P4 done-bar (weak < 50%): 57.2% on the 09-05 evening board (563 of 984).
  The day's 54-row drop, decomposed so it is never read as 54 new facts:
  13 propagated from receipted deployment evidence (a copy, not new
  evidence); 38 owner-approved packet stamps, of which 34 kept their status,
  2 Live verdicts were overturned by the owner within the hour (orbitcdp,
  skyhitz) and 8 stamps were withdrawn the same evening because the packet's
  own text showed thin evidence; 3 curated. New status truth today: five
  receipted deaths. Nothing here is a new evidence tier.
- P3 Stage 2 (auto-merge after N intervention-free weeks): counted for
  the first time this week — the per-lane figures are in
  improvements/audits/lane-autonomy-latest.json and on /quality. Nothing
  is promoted on them yet, and the RWA and basis lanes restarted their
  clocks on 09-04/09-05 (improvements/lanes/interventions.json).
- The closure rule's own metric: recurrence after a silence-close is well
  clear of zero, and the majority of this ledger's closures were closed on
  silence rather than re-probed — detection is outrunning remediation exactly
  as §0 warned. Live numbers: `findings.closure.recurredAfterSilence` and
  `closingRate` / `silenceShare` in the /quality artifact. (The old figure
  quoted here, a 100% trailing-30d repeat-CLASS rate, could not have been
  anything else — see §1.)

**What should happen next (ordered).**
1. DONE 2026-09-05 (#1327) — silence-close is out of the headline close
   rate: closingRate counts verified + re-probed only (0.41), silenceShare is
   published apart (0.55), and the steering metric is recurrence after a
   silence-close (findings.closure.recurredAfterSilence). Caveats stated in
   the code: a re-detected verified finding is flagged (regressedFromVerified)
   because applyWaves re-asserts verified; reopenedShareOfClosures is a lower
   bound because a re-clear erases its own reopen stamp.
2. DONE 2026-09-05 — the routing battery grades the INTENDED op. This is a
   NEW series (persona bank + intended-op expectations + evidence-classed
   misses), not the old 32-probe "some scout op present" series: 48/65 overall,
   persona 16/28 (T1 2/7 · T2 3/5 · T3 5/8 · T4 6/8); 9 of 17 misses are
   catalog lag (Raven's manifest is dated 2026-09-03T17:09Z and still serves
   pre-08-31 descriptions for getRfps/explainRepo/getPartners). The old
   series is unchanged at 32/37. Nothing external is closed by this.
3. DONE in kind 2026-09-05: `onchainEligible` 34 → 13 after a snapshot
   refresh (2 awarded, 18 with no movement in the window). The residue is
   could-not-earn until the chain moves; re-run after each weekly snapshot.
4. Human call on the 3 vetoed dedup clusters and the dead repo links
   (owner: Shubh; done = executed or declined per cluster, in the dry-run's
   own format).
5. Act on the intervention-free week counter, which now exists and is
   published (improvements/audits/lane-autonomy-latest.json, on /quality,
   registry improvements/lanes/lanes.json). Done = every lane the artifact
   reports as eligible is promoted or declined with the reason recorded
   here, and the append rule holds — a PR that corrects a lane's output
   logs it in improvements/lanes/interventions.json in that same PR.

### Night-shift addendum (2026-09-05, 04:30–06:30 UTC)

**What changed tonight (2026-09-05, 04:30–06:00 UTC).** 14 merged PRs
(#1311–#1324), seven bounded agents, two cross-vendor audits. Every scout.*
surface touched. Production writes, each dry-run, executed and read back:
dedup 11 records hidden (3 clusters vetoed for a human), deployment→status
propagation 13 rows, curated row facts 12 (142 writes incl. standing
re-applies), all read back 100%. Fixes served live: a typed set no longer
gated by q (Exchange 15→18), unknown partner regions 400 with the vocabulary
(labels/case normalised), material-change counts on /api/changes, builders
admitted by owned-repo language (rust 8→33), two audit reports joined to
their projects, a hijacked website link no longer re-written nightly, the
nightly knowledge-notes backfill actually executing (3 scheduled no-op runs
found), lane autonomy measured (62 lanes; 11 at 4+ weeks; 0 could-not-check),
routing graded on the intended op (48/65; persona 16/28), a partition guard
that names vacuous checks. Truth battery 112/112 (was 110/112); golden 51/51.

**Blocked (unchanged + new).**
- Raven catalog: manifest 2026-09-03T17:09Z, pre-08-31 descriptions still
  served for getRfps/explainRepo/getPartners — every routing-vocabulary fix
  since 08-31 is unmeasured until a re-baseline. Upstream; not filed as drift.
- Raven scorer counts stopwords in its gated pass (evidence in
  improvements/engine/raven-routing-latest.json) — candidate issue, unfiled.
- The Inactive/site-liveness class was triaged (#1326, 31 rows); the
  duplicates among them are Draft shadows since 2026-09-05 (#1337 executed,
  44 rows). Real deaths in that class still need the owner's verdict.
- 2 rows with a strong deployment basis and no citable artifact remain
  (`strongBasisSplit.deploymentStrongStatusWeak`); xoxno and huma earned
  onchain-activity on the 2026-09-05 snapshot refresh.

**At risk.** P4 weak share: tonight moved 13 by propagation and 3 by curated
evidence; the served denominator stayed 984 (shadows are Draft now, and the
board's population did not move). P3 Stage 2: the
counter exists now; curate-projects shows 89 executes in 8 weeks of which 1
was unattended — autonomy is measured, not earned.

**Next (ordered).** 1. DONE (#1325): STRONG_BASES names the five real tiers.
2. DONE (#1337/#1338, executed): duplicates are Draft shadows with one
owner. 3. DONE (#1331): a skipped execute step counts as never-ran.
4. Re-run the routing battery after Raven re-baselines (anything filed
upstream is the owner's call; nothing is drafted). 5. DONE (#1327).

### Day addendum (2026-09-05, 15:00–19:00 UTC)

**What changed.** #1340–#1348. Stablecoin page: USDT0 mark, a header logo
that never rendered, finger scrubbing on bar charts with a haptic tick
(web-haptics), a dollar y-axis. Board: `open` means ours (3), 16 routing
misses carried as waiting-on-upstream, 3 refreshes. Duplicates: one owner
(fold writes Draft + canonicalSlug; search folds by name at any status;
the feed never writes onto a shadow) — 44 rows executed and read back.
Knowledge notes: 47 repos gained dated, sourced notes (nightly backfill
stamps them). Partners: 10 enriched from their own stellar.toml (SEPs,
assets, ramps). Verification packets: 100 built; the owner approved the
high tier (38 rows) and it was executed and read back; within the hour the
owner overturned two Live verdicts (orbitcdp, skyhitz — both pages carry
empty protocol stats under a "live" banner) and a cross-vendor audit showed
8 more stamps rested on evidence the packet's own text called thin; those 8
were withdrawn to site-liveness the same evening. Mirror pushed; the skill
reference documents /api/rwa; the health lane is green.

**Blocked.** Medium (32) and low (30) packet tiers: NOT to be applied under
the old rule; re-grade under the rule below first. Raven catalog lag and
scorer: unchanged, upstream, nothing drafted.

**At risk.** The packet method itself: its Live rule ("a 200 page with
product copy and a repo pushed in 90 days") returned two dead products to
Live and stamped eight more on thin evidence — 10 of 34 high-tier Live
verdicts. The tightened rule: a Live verdict is the product's own state
(stats, app, chain), never a banner, title or CTA; empty or zero metrics on
the page veto Live; the second signal is this product's own repository
(not a hackathon, seeder, fund or shared repo, and never a 404 substitute);
a page rendering under ~300 characters is not substantive.

**Next (ordered).** 1. Re-grade the 32 medium and 30 low packet rows under
the tightened rule, capturing the product-state signal per row, before any
tier is offered for approval. 2. The Draft/Inactive/Live writers: the
curated status step and the on-chain basis lane now skip shadows (#this
PR); verify the 10:58 UTC sync skip live after its first scheduled run.
3. The owner's verdicts on the 8 withdrawn rows and the 11 flagged
small-product rows.

## Lessons — 2026-09-05 evening (owner corrections + cross-vendor audit)

1. A Live verdict is the product's own state, never chrome. orbitcdp went
   Inactive → Live on the banner "Live on Stellar" and a Launch App button
   while the same page served empty protocol stats.
2. Empty or zero metrics on the page veto Live even with a 200 and a
   same-day repo push. skyhitz: title "Gravity. Mainnet", repo pushed that
   day, Total Mass 0.00 HITZ, Balance —.
3. The second live signal is this product's own repository. Not a hackathon
   repo (hot-wallet), a seeder (tala), a shared repo (wagelink/zebec), or an
   org-newest substitute for a 404 (normal, vanna-finance). A page the
   packet itself records at 8, 17 or 40 rendered characters is not
   substantive (wagelink, untangled, fairblock).
4. One field, one writer, registered before either lane runs unattended.
   dedup wrote Draft, curate wrote Inactive, sync wrote Live on the same
   status field in one day; the fix landed in three PRs and two more
   writers were found by audit the same evening.
5. Recategorization is reported as its own number, never as progress. The
   day's 54-row weak-share drop is 13 propagated + 38 stamped + 3 curated;
   the status truths gained are five receipted deaths.
6. Numbers come from the run's own steps or the fetched page, never from an
   agent's note. The packets cited titles while the pages' stats were dashes.

## Lessons — 2026-09-05 cross-vendor audit of the program

Rules an agent follows (each verified against evidence; the auditor's
other claims were checked and, where wrong, are not here):

1. A new enum member and every aggregator that classifies it ship in the
   same PR — or the PR does not merge. (statusBasis gained two tiers; the
   strong-metric ignored both; 173 rows earned evidence and the headline
   moved by 4.)
2. A classifier change never moves a ratchet series. Report
   "recategorized N" and "upgraded M" as two numbers.
3. A close-out on an external finding states the finding's OWN probe and
   its remaining miss count. "Fixed and verified live" without that number
   is banned.
4. A new guard's first alarm is a candidate false alarm. It may not page
   until it has a known-bad and a known-good fixture. (The partition
   guard's first two alarms were its own wrong denominators.)
5. A sum check whose denominator is 0 is vacuous — reported, never counted
   as a pass.
6. A third-party list is asserted against the source's own total; if the
   source ignores paging, the served count is could-not-check, never a
   number. (DoraHacks 50/page; SCF capped at 500.)
7. Live ∧ (holders ≤ 1 ∨ a "coming soon" page ∨ a 200 that is a parked
   domain) is never served as a live market.
8. An independent audit — second agent or human — precedes closing any
   externally-filed finding.
9. A guard artifact under improvements/audits is only as fresh as its
   last local `--json` commit; CI runs do not persist it. Read its date
   before citing it.
10. A bounded-lane count increments only when the PR body carries its
    write-set, a dry-run, an execute and a live read-back.
11. Score routing on the intended operation id. "Some scout op appeared"
    is not a hit.
12. Do not answer a routing miss with vocabulary once the failure mode is
    id-noun exclusion; that is the scorer's, upstream.
13. A lane earns a run only when its execute step concluded `success`; a run
    whose steps were skipped is a no-op, and the health guard reports it as
    never-ran. (3 scheduled note-backfill runs executed nothing; a first count said 18 by reading completed runs, not schedule runs.)
14. An artifact licenses only the tier it can support: asset movement →
    onchain-activity; an operator's toml or a receipt → human-verified /
    product-integration. A strong basis copied across records without a
    tier-consistent artifact is a could-not-propagate.
15. A filter with a closed vocabulary rejects unknown values with the
    vocabulary (400) after normalising case and labels; it never serves an
    unfiltered-looking zero.
16. Evidence date, never observation day, on every provenance stamp — a repo's
    push date, a receipt's date, an announcement's date.
17. One field, one owner: when two lanes can write the same field with
    different verdicts (dedup's Draft vs the merge fold's Inactive), the later
    one wins silently. Register ownership or merge the lanes before either
    runs unattended.

Recorded lessons this week violated (so the loop is honest): verify before
advertise (#494, twice); examples are probes, not targets (11 of 61 treated
as closing a 61-row probe); review new guards adversarially; ledger closure
is not repair (298 silence-closes behind a 0.99 close rate); stale evidence
is not a finding (a guard artifact cited at 08-31 on 09-05; this file's own
P4 number).

What this is not: an org-chart cosplay. Lanes are prompts + charters +
write-sets; the ladder is entry criteria; the scoreboard is generated from
the same ledger everything already writes to. The only new invention is the
closure rule, and it is the one that ends the weekly déjà vu.
