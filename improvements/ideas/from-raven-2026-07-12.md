# Steal-list from Raven's 2026-07-11/12 build sprint

Tyler shipped ~30 commits in 36 hours professionalizing his *judging* layer while we professionalized the *data* layer. Four of his patterns transplant directly. Source: kalepail/stellar-raven commit log 07-11T13:00 → 07-12T21:36.

## 1. Saved-answer re-judge (his `feat(eval): add saved-answer re-judge tool`)

**His pattern:** cache every eval round's raw answers; when the judge improves, re-grade the cached answers instead of re-running the round. Judgment iterates for free; API spend only buys new *answers*, never re-buys old ones.

**Our transplant:** golden eval currently re-fetches live on every run and keeps only pass/fail. Persist the top-K responses per question per run (a JSONL snapshot in the evidence artifact); when we tighten `answerRegex`/`forbiddenRegex` or add judges, re-score history offline. Bonus: the snapshots become a drift TIMELINE (when did the corpus stop serving X?), which no current engine captures.
**Size:** S — run-golden already has the responses in hand; write them out + a re-judge script.

## 2. Pre-spend plan review gate (his `run-evals — pre-spend plan review launch gate for paid rounds`)

**His pattern:** paid eval rounds don't launch until a plan-review step approves the spend against the expected information gain.

**Our transplant:** multi-agent waves (6-agent audits, fix fleets) launch on a prompt today. Add a lightweight convention: any wave projected >50k tokens states {agents, est. tokens, expected artifact} in one message before launch — the human (or a budget check) acks. Formalizable later as a Workflow budget guard.
**Size:** XS (convention) → S (mechanized).

## 3. Consistency register + numeric corroboration (his `eval: enforce numeric corroboration`, `rebuild consistency register`)

**His pattern:** a standing register of facts asserted across surfaces; any NUMBER an answer cites must corroborate across ≥2 sources or be flagged.

**Our transplant:** we have pairwise parity guards (clusters=analyze). Generalize: a nightly register that extracts every numeric fact served on flagship records (TVL, SCF totals, counts, dev-counts) across ALL endpoints serving it and asserts equality — the sls-011/013/026/042 class (cross-surface disagreement) killed wholesale rather than pairwise.
**Size:** M — an Engine B sweep over endpoint pairs with a fact-extraction map.

## 4. Behavioral eval lanes harvested from real users (his P4 campaign: `H1 Boxy and core harvest`, H3 retail, N1 gap-ops, N3 safety)

**His pattern:** eval cases harvested from REAL user sessions, organized by user lane, with per-lane coverage floors. (Boxy's own questions are literally lane H1.)

**Our transplant:** Engine D already mines real queries but replays them mechanically (did rows return?). Upgrade the top recurring queries into GRADED golden cases (expected content, not just non-empty) — per consumer-lane floors (raven / claude-desktop / browser). Demand-mined golden = the eval writes itself from production traffic.
**Size:** M — Engine D output → golden-question generator with human confirmation of expectations.

## Adopted-by-them (for the record)

Our `x-routing` extension (sls-051 fix, spec 1.7.16) was absorbed within a day: his catalog now scores it as **"lever 7"** in routing. The interlock is now bidirectional at the protocol level — see the Scale-model verdict addendum in [idea-scale-model.md](./idea-scale-model.md).
