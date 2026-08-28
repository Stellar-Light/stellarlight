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
  This document · the opacity lock in CI · class labels in the findings
  ledger · battery lanes on the rounds format.
  *Evidence:* `check-schema-opacity.ts` (zero silent opacity, 47 open maps
  ratcheted), QUALITY.md itself.

- **P1. Honesty layer, eval integrity, the dashboard.** `status: done`
  The list-endpoint honesty layer + conformance ratchet (#1060) with the
  8-op debt paid to zero via one shared vocabulary (#1061) · eval-bank
  freeze with sha256 fingerprints and a vitest gate (#1063) · the bank
  linter with live rot detection · persona rotation in the battery banks ·
  the /quality dashboard with committed trend history (#1075), rebuilt
  around findings, gap matrix and the miss funnel (#1077, #1078).
  *Evidence:* `specs/honesty-baseline.json` (debt 0),
  `scripts/eval/eval-baselines.json`, `improvements/quality/*.json`.

- **P2. Entity truth: dedupe, issuers, receipts.** `status: done`
  sls-033 closed at root, typed enumerations are limit-independent sets
  (#1064, #1065) · stablecoin issuer relations made conflation-proof, with
  the `issued` claim family (#1068, #1069) · receipts-in-repo for
  human-verified corrections (#1073).
  *Evidence:* battery slice G (enumeration integrity), slice H (verify
  grades itself), `improvements/receipts/`.

- **P3. Earned autonomy.** `status: in progress`
  Stage-2 autonomy for bounded work · event-driven freshness (PLAN §5) ·
  steady-state review.
  *Shipped so far:* the daily pipeline now rebuilds its own quality
  artifacts and commits them, and the stale-finding sweep re-probes the
  ledger instead of letting counts drift.
  *Remaining:* no agent yet ACTS on the gap matrix, the gaps are measured,
  named and served, but closing them is still human-initiated. Stage 2
  requires N intervention-free weeks before auto-merge opens for bounded
  lanes, and those weeks have not been served.

What this is not: an org-chart cosplay. Lanes are prompts + charters +
write-sets; the ladder is entry criteria; the scoreboard is generated from
the same ledger everything already writes to. The only new invention is the
closure rule, and it is the one that ends the weekly déjà vu.
