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
is **repeat-class rate**: findings whose class already had a prior finding.
Steady state means that number reaches zero and stays there.

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

**Steady state =** 4 consecutive weeks of: all dailies green · repeat-class rate
0 · SLOs at target · zero externally-filed correctness findings. Then the
service runs at Stage 3+ by default and humans do product, not repair.

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
  went hard-dead. Untyped 59→2 (both honest residuals). Weak share
  86%→84% (830 of 984 served rows).
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

What this is not: an org-chart cosplay. Lanes are prompts + charters +
write-sets; the ladder is entry criteria; the scoreboard is generated from
the same ledger everything already writes to. The only new invention is the
closure rule, and it is the one that ends the weekly déjà vu.
