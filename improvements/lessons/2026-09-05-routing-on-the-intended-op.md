# Routing on the intended op, and the consumer that had not read our fixes (2026-09-05)

The 2026-09-03 persona battery asked Raven 32 questions the way four builders
ask them and scored **"did any scout op appear"**: 12/32 had a scout op as the
top hit, 32/32 had one somewhere in the ten hits. Both numbers were wrong in
opposite directions. Re-graded on the **intended operation id** (a pass only
when an op that truly holds the answer is within the top-3 scout hits; four
docs questions moved to the observed list because no scout op holds them):

| persona | 09-03 "scout is top hit" | intended op, 09-05 |
|---|---|---|
| T1 brand-new | 1/8 | **2/7** |
| T2 knows-a-little | 2/8 | **3/5** |
| T3 experienced | 5/8 | **5/8** |
| T4 SDF-level | 4/8 | **6/8** |
| persona total | 12/32 | **16/28** |
| whole bank (37 old + 28 persona) | — | **48/65 (74%)**; the old bank unchanged at 32/37 |

"Reachable" (32/32) counted compareHackathons as the answer to "who are the
most active contributors" and searchHackathonBuilds as the answer to "what
percentage of hackathon winners are still building". "Top hit" (12/32) missed
four questions where the intended op sat second or third among scout hits. The
gradient by expertise is real but flatter than the 09-03 read: 2/7 → 3/5 →
5/8 → 6/8.

## Every miss now carries a class, with the evidence that earned it

`scripts/eval/raven-scorer-replica.ts` is Raven's own scoring math (vendored
codemode scorer, its stopword rescue, its x-routing flattening — read from
their public repo) run over two texts: our current spec, and the text Raven
actually indexes (the description `codemode.catalog()` serves, plus the
routing keywords in their committed manifest). The replica reproduces Raven's
live score exactly for 206/269 scout hits, so the evidence layer is itself
measured. The 17 misses:

| class | n | evidence in the artifact | whose |
|---|---|---|---|
| catalog-lag | 9 | our text ranks the op #1–2, Raven's text lacks the words (`lagTokens`) | wait |
| outscored | 3 | every word covered, replica rank 5, lost to a sibling | see below |
| id-noun-exclusion | 2 | "projects" → searchProjects #1; "build" → searchHackathonBuilds #1 | upstream #124 |
| no-scout-op | 1 | "freighter": no field anywhere carries the token | upstream |
| named-entity | 1 | "reflector": the only missing word resolves as a project name | upstream |
| vocabulary | 1 | "soroban" is the only missing word — fix declined, measured below | ours, declined |

## L1 — The 08-31 lesson was applied to the field, not to the time

The 08-31 lesson said *measure the consumer's actual view*. It was applied to
WHICH field (descriptions, not x-routing) and not to WHEN. Raven's catalog
(manifest generated 2026-09-03T17:09Z) still serves the getRfps description
from before 08-31 ("past rounds kept for context"), and its routing keywords
contain none of the words #1226 (09-02) and #1282 (09-03) added: no `year`
or `published` on listAudits, no `awarded`/`community` on analyzeEcosystem,
no `calculate` on explainRepo, no `jobs` on getRfps. Three routing fixes were
shipped, re-measured live, found "still missing", and worked again — against
a consumer that had not read any of them.

**Rule.** A routing fix is done when the consumer's catalog shows the words,
read back from the consumer (`codemode.catalog()` + the manifest), not when
our spec carries them. The artifact now records `catalogView` (which ops lag,
which words are unseen) and classifies such misses `catalog-lag`, so the next
run says "not yet absorbed" instead of "still broken" — and nobody fixes it a
third time.

## L2 — Newcomer phrasing loses on stopword density, not on vocabulary

"is anyone actually building on Stellar or is it dead?" — after this PR
analyzeEcosystem covers every content word. On the full query listContracts
scores 211 with four content words missing; analyzeEcosystem scores 171 with
none. On the stopword-filtered query analyzeEcosystem is #1 (125). Raven's
gated pass scores stopwords like any token (5 × 4 per description hit) and
only strips them on the rescue path, so a long description rich in "is / it /
on / or" outscores a short one that has every content word. Newcomers write
full sentences; that is the persona gradient's mechanism, and it is the
scorer's, upstream. Our side: nothing to add — "should", "what", "which" are
their stopwords and can never be vocabulary.

## L3 — Widening the widest op: measure the capture before shipping it

"which Stellar wallets support Soroban contracts?" lacks exactly one word on
searchProjects: `soroban`. Adding it fixed that question on the replica (6 →
2) with zero pass/fail flips across the other 64 — the check that would have
shipped it. A rank-level check showed searchProjects entering #1 for
"security audit reports for Soroban projects" (listAudits pushed to #2) and
climbing into ranks 4–8 on five code/docs questions: 8 of the bank's 14
Soroban questions shifted. Raven delists an op for capturing unrelated
results (sls-078). Reverted; the miss stays classified `vocabulary` with the
declined fix recorded on the bank item.

**Rule.** Before any x-routing widening, run the replica over the whole bank
and read RANK movement on questions sharing the token, not only pass/fail
flips. Four edits passed that bar (getClusters `verticals`/`least`,
getPartners `implement SEP-24`, getRfps `gives out grants`, searchRepos
`copy`): 51 → 55/65 on our text, no sibling moved.

## L4 — Bank errors found while re-grading

- The 09-03 hint "changelog" for "what changed in the Stellar ecosystem"
  named the API-surface changelog; the ops that hold ecosystem change are
  getChanges (rows moved since a time) and analyzeEcosystem (snapshot delta).
- "how does the Blend lending pool calculate interest rates in the code"
  accepted searchRepos — a first hop, not the answer. Narrowed to explainRepo.
- "freighter" and "reflector oracle on Stellar" expected only searchProjects;
  resolveProject is the op built for names and is now expected too. Both stay
  misses by construction (no operation text carries project names) and are
  reported as the upstream named-entity class.
- "jobs bounties and freelance work for Stellar contributors": checked against
  the DATA, not the description — live RFP rows are SCF sponsor briefs, the
  bounty half of the question. getRfps stays the intended op; "jobs" in its
  description is the over-claim to remove, not the expectation.
- Four persona questions with no scout answer (Solidity, Horizon vs RPC,
  testnet USDC, how to write a contract) were in a graded battery. Observed
  now, never graded.

## Standing decisions

- `raven-routing.ts` grades every item on its `expect` list with `rank`,
  `topAll`, per-persona rates, and a `missClass` with evidence; the ledger
  ingests misses unchanged. Classes beyond the four asked for (`catalog-lag`,
  `named-entity`, `outscored`) exist because forcing those misses into
  "vocabulary" would have produced three more fixes into a lagging catalog.
- The replica is evidence, never the grade. Its agreement with live scores is
  printed every run; when it drops, re-read Raven's scorer before trusting a
  class.
- Re-run after Raven re-baselines: the nine `catalog-lag` rows are the
  read-back that closes #1141/#1226/#1282 — or reopens them honestly.
