# QUALITY — the progression from "we fix what we trip over" to "agents run it"

Companion to [PLAN.md](./PLAN.md) (what we build) and ARCHITECTURE.md (how it
works). This is the working doc behind the /quality surface: why the same bug classes recur, the
three layers that end that, the machinery that runs it, and the measurable ladder
from human-driven fixing to agent-run operation.

## 0. The honest diagnosis (2026-08-27)

Six classes account for nearly every finding ever filed against us — by SDF
reviewers, by stellar-raven, by our own batteries:

1. **Identity** — a name should find its thing; phrasing must not break it
   (sls-009, -076, the liveness/anchor bugs, slug-not-in-haystack).
2. **Honest degradation** — when we relax, the response must say so
   (matchMode families, vetIdea neighbours, exact-miss honesty).
3. **Evidence population** — the field exists, rows are empty; collectors
   have structural blind spots (redirect hops, bot walls, provenance nulls).
4. **Taxonomy coverage** — a vertical without an enum member is invisible
   (Exchange, Oracle).
5. **Contract completeness** — opaque schemas, silently-ignored params
   (resolver objects, listSkills q).
6. **Cross-surface consistency** — two of our answers disagree (sls-073).

Why fixes did not stick as classes: each fix landed **where the bug fired**,
conventions live in ~35 hand-written operations instead of one enforced
layer, guards **sample** instances instead of enforcing invariants, and the
findings ledger records instances without a class-closure step. Detection
outruns remediation by design; the pile grows.

## 1. The three layers (every finding must land in one)

**L1 — Invariants (CI, cannot regress).** A class is dead only when code
physically cannot ship a violation. Live today: contract freshness, spectral,
routing budget, vocabulary-drift test, **schema opacity zero** (this PR —
the resolver class, locked). Next: the *list-endpoint honesty conformance*
(every list op provides matchMode + honest-empty + advertised params — one
shared layer, one test that walks the spec and probes every op).

**L2 — Coverage SLOs (data, trend-tracked, ratchet-only).** Numbers that may
only move up, published weekly to /quality, regression = red: Live rows with
dated source (98%+ target; 91% → 98% on 2026-08-27), link-evidence coverage,
typed-vertical reachability (every type with ≥2 rows has enum + intent +
rows), scan coverage. A ratchet that dips pages a human.

**L3 — Adversarial discovery (rotating, never green-by-default).** The truth
battery (guard D), golden parity, and **surveyor rounds**: fresh question
sets from rotating personas (hacker, investor, integrator, historian) run
through the live gateway. Slices D–F already derive expectations from
curation instead of hand-written lists — extend that principle everywhere.

**The closure rule (the whole point):** every finding — ours, Tyler's,
kalepail's — gets a class label from §0 and must close as one of:
`invariant-added` (L1) · `slo-added` (L2) · `bank-added` (L3) · `wont-fix`
(with reason). *A fix with no layer is not closed.* The metric that matters
is **repeat-class rate**: findings whose class already had a prior finding.
Steady state means that number reaches zero and stays there.

## 2. The machinery we already have — and the one loop it was missing

We are not short on machinery. Mapping what EXISTS to the functions:

| function | already running |
|---|---|
| daily sentinel | raven-eval-parity (guards A-D), category battery, canary, drift + freshness guards |
| weekly sweeps | check-links, upgrade-status-basis, scan waves, partner freshness |
| discovery engine | engines A-D detectors → improvements ledger → /quality |
| adversarial rounds | the truth-battery waves + externally: stellar-raven's sls pipeline |
| contract gate | contract:check, spectral, routing budget, vocabulary-drift test, opacity lock |

What was missing is not a new lane — it is the **closure rule** (§1) binding
them: today a detector files a finding, a human fixes an instance, the pile
grows. The rule makes every finding terminate in a layer, and the repeat-class
rate measures whether that actually happened.

Two practices adopted from stellar-raven's `.agents/` discipline: dated
append-only **round ledgers** for multi-lane efforts (exact commands and
outputs, verdicts with stamps — "tests passed" is not evidence), and **"done
means"** stated on every queued item.

## 3. The autonomy ladder

Stage advancement is earned per lane: **N consecutive intervention-free
weeks** (human reviewed, changed nothing), then the gate opens.

- **Stage 0 (past):** human does the work, agents assist.
- **Stage 1 (now):** agents do the work end-to-end; human merges. Every PR
  carries live verification in its body.
- **Stage 2 (entry: 2 clean weeks/lane):** auto-merge on green for
  bounded work — guard banks, lessons, docs, dry-run reports. Contract and
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

- **P0 (this week):** this document · opacity lock in CI · class labels in
  the findings ledger · battery lanes adopt the rounds format.
- **P1 (+2 weeks):** the list-endpoint honesty layer + conformance test
  (kills classes 2+5 by construction) — *contract half shipped 2026-08-28:
  check-honesty-layer.ts ratchets 8 debt ops and blocks new unlabelled
  surface; paying the debt (adding the labels) is the remaining half* ·
  /quality trend dashboard with ratchets · persona rotation formalized in
  the existing battery.
- **P2 (+1 month):** Stage 2 autonomy for bounded work · the
  dry→execute→verify data loop agentized · Verify v1 slices 2-3.
- **P3:** Stage 3 · event-driven freshness (PLAN §5) · steady-state review.

## 5. External calibration — the Raven QA deep-dive (folded in 2026-08-28)

Their five-model research panel over 55 QA misses (`research/qa-deep-dive-2026-08-25/`,
read in full) plus their shipped product lane changes both of what our answers
flow through and what is asked of us. The items below are IN the phases above —
this section records why, so the map carries its own provenance.

**What changed on their side that binds us:**
- Their host now captures an exact-path allowlist from OUR responses into the
  judge-visible SOURCE METADATA block: `generatedAt`, `dataAsOf`, `asOf`,
  `matchMode`, `counts.count/total`. A field absent from `meta` is invisible to
  their evidence chain even when the agent retrieved it. Our matchMode work is
  load-bearing there now; dialect gaps (getChanges) are fixed as found.
- Their answering contract now REQUIRES dating volatile claims, copying exact
  identifiers, and scoping absence claims — our `asOf`/provenance coverage and
  exact-ID indexing are graded downstream.
- Their most adversarial lane (grok-xhigh) cited our live `/api/rfps` as
  class-A arbitration evidence against their own golden. Endpoints used as
  truth sources get golden-parity protection.

**Adopted into the phases:**
- P1: sidecar-dialect census + fixes (getChanges shipped; analyze/vetIdea
  counts pending honest semantics — a forced `total` that misleads is worse
  than absence) · eval-bank freeze + sha256 input fingerprints with
  re-baseline-as-explicit-act (their gates.json discipline) · bank linter for
  authoring defects (compound predicates, self-referential dates — their
  R2/R12 classes).
- P2: canonical entity envelope + enumeration dedup (their top-10 rank 5 ask,
  our sls-033, open since July — dated identity, lifecycle, availability,
  dedup status) · stablecoin issuer-relation truth (an issuer credited across
  another issuer's asset is the sls-066 class) · receipts-in-repo for
  human-verified corrections (fetch date + ETag + observed value beside the
  curation entry, their WisdomTree pattern).
- Watch, do not build: their source-pointer lane (`sources.locate`) is still
  CHANGES-REQUESTED with open findings. If phase 0 ships, our position is the
  ecosystem long tail their canonical-only allowlist cannot cover, and
  pointer-shaped evidence (repo@ref path#symbol) in explainRepo/verify is the
  move. Their Option-D critique of explainRepo ("an answer, not a pointer")
  is the requirements doc for that change.

**Meter honesty (grok's essay, our L10 restated harder):** measurement-side
movement is never booked as product movement. When /quality trends ship (P1),
bank/golden edits and grading changes are reported in their own column,
separate from data and serving changes — their ceiling decomposition found
13.5 of 35.5 lost points were measurement artifacts, and the same discipline
applies to our own scoreboard.

What this is not: an org-chart cosplay. Lanes are prompts + charters +
write-sets; the ladder is entry criteria; the scoreboard is generated from
the same ledger everything already writes to. The only new invention is the
closure rule — and it is the one that ends the weekly déjà vu.
