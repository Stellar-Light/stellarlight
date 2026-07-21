# The data-layer interlock — conventions between an agent data layer and its consumers

**Status: reference implementation.** These are the working conventions between
StellarLight (data layer) and Stellar Raven (agent gateway/consumer), written
down so they can be adopted by any provider⇄consumer pair. The claim they
enable: *co-verified* quality — not "vendor asserts an SLA," but each side's
automation continuously checking the other's surface, with the evidence public
on both sides.

## 1. The spec IS the discovery index

The consumer builds its routing catalog from the provider's OpenAPI text —
descriptions, param docs, and enums are not documentation *about* the API, they
are the material the consumer's agent routes on. Consequences for the provider:

- Descriptions are written for routing ("Use when: … Not for: → use X") and
  vocabulary is curated per operation (`x-routing`).
- Every response field added spends the consumer's per-op token/keyword budget
  — additive is not free; ship fields the consumer can rank on.
- Identifiers must be callable: reference `operationId`s, never internal names
  or raw paths the consumer can't invoke.

## 2. The version handshake

- The provider bumps `info.version` on **every** observable contract change —
  including description-only rewrites — and writes a dated `/api/changelog`
  entry (`GET /api/changelog?since=…` is the machine re-baseline feed).
- The consumer's drift CI diffs the live surface against its baked inventory;
  byte-identical text re-absorbs silently, rewordings trigger a routing
  re-evaluation before absorption.
- A consumer drift alert is **not** evidence the provider broke contract, and
  a provider ship the consumer hasn't absorbed is **not** evidence the
  consumer is broken — see §5.

## 3. The findings ledger

- The consumer files findings against the provider as issue-tracked, id'd
  items (sls-NNN style) with a reproducible probe each.
- The provider closes an item only with: the fix live, a changelog entry, and
  a verification issue carrying re-runnable probes.
- The provider's own audits use the same ledger discipline (dated runs, raw
  findings JSON committed, fix waves referencing finding ids) — one paper
  trail, whoever found it.

## 4. Per-ship eval expectation

Every provider deploy re-runs the contract-honesty probe (documented params do
something, invalid input is rejected) and the recall guards (golden questions
+ generated known-item probes) against production. A ship that regresses
retrieval is caught by the deploy that made it, not by the consumer.

## 5. The cadence contract

Each side has a clock, and the interlock only works if neither side reads the
other's clock as a defect:

| Signal | Owner's cadence | Correct interpretation |
|---|---|---|
| Provider ships a new op; consumer catalog lacks it | consumer re-baseline (days) | **lag, not drift** — expected inside the grace window |
| Consumer drift CI fires on provider text churn | provider ship rhythm | schema-class change? routing-eval; value churn? absorb |
| Provider guard reds on consumer catalog | beyond grace window only | now it's a finding — file it with the cadence assumption stated |

- Provider-side guards encode the grace explicitly (reference:
  [`scripts/check-raven-drift.ts`](../scripts/check-raven-drift.ts) warns
  "lagging" inside a 10-day window and only fails beyond it).
- Escalation etiquette: before filing on the other side's repo, ask *"would
  their own automation already know this?"* If yes, it's their queue.
- Over-files happen; the norm is same-day, plain-language retraction keeping
  whatever fragment was genuinely useful.

## 6. Co-verification (what makes this bilateral)

- Consumer → provider: their CI lints our live contract daily; their routing
  gate re-evaluates our description changes; their findings ledger is public.
- Provider → consumer: our guard enumerates their discovery catalog against
  our spec weekly; our per-ship evals protect what they route to; our
  changelog is their re-baseline feed.
- Neither side's quality claim rests on its own assertion — the other side's
  commit log is the testimonial.

## Reference implementation map

| Convention | Provider-side implementation |
|---|---|
| Routing-grade spec text + `x-routing` | `src/lib/openapi-spec.ts` |
| Version + changelog handshake | `src/lib/version.ts`, `src/lib/changelog.ts`, `/api/changelog` |
| Contract drift guard (own surfaces) | `scripts/check-api-drift.ts` (daily) |
| Data-sanity guard | `scripts/self-audit.ts` (daily) |
| Per-ship evals | `scripts/eval/engine-e-contract.ts`, `scripts/eval/run-golden.ts` (post-deploy) |
| Consumer-catalog guard w/ grace | `scripts/check-raven-drift.ts` (weekly, credentialed) |
| Findings/evidence ledger | `improvements/` (dated runs, raw JSON, waves, lessons) |
| Standing promises | [`DATA_SLA.md`](../DATA_SLA.md) · rendered at `/quality` |
