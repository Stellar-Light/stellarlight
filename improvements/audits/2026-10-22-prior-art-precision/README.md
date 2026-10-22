# Prior-art precision: why vetIdea lists builds that share only words

Evidence for the round in `improvements/rounds/2026-10-22-prior-art-precision.md`.

**Verdict: not shipped.** No candidate rule met the ship criteria. The
hypothesis (the word path admits builds on two common words) does not hold
on the working set: every wrong build there clears the 0.7 meaning floor,
12 of 17 on meaning alone, so no change to the word path removes one. The
meaning score does not separate wrong builds from same-idea builds, so every
higher meaning floor tried that removes wrong builds also drops same-idea
builds on at least one labeled set (on the holdout only from 0.745).
The labels are drafts, pending owner review.

## Method (fixed before any result was read)

- **Split.** 40 labeled ideas. Every third idea by id is held out (i03,
  i06, ..., i39: 13 ideas); the other 27 are working. The three probes from
  the battery (i01, i04, i11) are in working. Candidates were written and
  read on working; the holdout was read once, after the candidate list in
  `rules.mts` was fixed.
- **Capture.** `capture.mjs`, read-only GETs to https://www.stellarlight.xyz,
  2 s apart, 429 Retry-After honored: every stored submission in browse mode
  (1,344, the pool the scorer weighs words over), and per idea the hybrid
  searchHackathonBuilds ranking (top 100), live vetIdea `priorArt` and live
  hackathonBrief builds. `/api/status` apiVersion was **1.9.91 at the start
  (20:56:40Z) and 1.9.91 at the end (21:03:41Z)**, 2026-10-22.
- **Replay.** `derive.mts` imports this tree's `src/lib` code and writes,
  per idea, the top 20 with every field a rule reads (meaning score, matched
  words, textShare, and per idea word: its weight over the corpus and
  whether the build has it in its name, its own text, as typed, or only in
  track or award text). Upstream descriptions are not copied into the
  window files; the raw capture (2.2 MB) is not committed.
- **Parity.** The current rule (`isPriorArtEvidence` on 1.9.91), replayed,
  equals live vetIdea `priorArt.builds` id for id on **all 40 ideas**, and
  the scorer's matched words, replayed over the corpus, equal the live
  `matchedTerms` on every window row that matched words, of 740 rows
  (`derive.txt`). The earlier captures (1.9.87) replay their rule id for id
  on all 70 ideas, with the same matched words on their 652 window rows.
- **Labels.** `labels.json`: idea id, idea text, buildId and grade (2 same
  idea, 1 related, 0 words only) for 895 builds, with the rubric. Every
  build the current rule lists for the 40 ideas is labeled.

## Which condition admits each wrong build (current rule)

| slice | wrong builds listed | meaning score alone | meaning and two words | two words alone | all three |
| --- | --- | --- | --- | --- | --- |
| working (27) | 17 | 12 | 4 | 0 | 1 |
| holdout (13) | 16 | 6 | 5 | 5 | 0 |

Working: meaning alone admits DeFi Quest (i02), QR Mint (i04), AgroFactoring
(i08), Stellar Automations Studio (i11), ImpactPools (i19), Pacto (i25),
Dropsland (i32), MemeEco (i35), and Crimate Crisis Dashboard, Stellarealize,
Kale-Pulse and StellarPay (i38); meaning and two words admit StellarAgent and
AgentCompute (i16), Stellar Agent marketplace (i22) and TikCoin (i40); all
three admit Delibera (i01). Holdout: two words alone admit SettleZK (i18),
Stellar Rent and PayOnProof (i21), AgroChain LATAM (i30) and clevercon (i39).
Per build detail: `diagnose-working.txt`, `diagnose-holdout.txt`.

## Candidates (all filter-only: each can only remove builds from the same top five)

- **A** two matched words must also cover half the idea's word weight
  (rankPriorArt's weighting); **B** A plus one rare word (rankPriorArt's
  rare-word condition); **C** two words counted only in the build's own name
  or description; **D** C without synonyms; **E** C weighed like A.
- **M f**: a build no word path admits needs a meaning score of f (0.72 to
  0.75) instead of 0.7. **N f**: the same, only for builds that matched no
  word at all.

### Working (27 ideas)

| rule | listed | same idea (2) | related (1) | words only (0) | wrong share | ideas with a wrong build | empty ideas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| current | 123 | 45 | 61 | 17 | 13.8% | 13 | 0 |
| A, B, C, D, E | 123 | 45 | 61 | 17 | 13.8% | 13 | 0 |
| M 0.72 | 111 | 43 | 55 | 13 | 11.7% | 9 | 3 |
| M 0.73 | 100 | 42 | 48 | 10 | 10.0% | 7 | 3 |
| M 0.735 | 96 | 41 | 47 | 8 | 8.3% | 5 | 3 |
| M 0.74 | 92 | 41 | 44 | 7 | 7.6% | 5 | 4 |
| M 0.745 | 89 | 40 | 44 | 5 | 5.6% | 4 | 4 |
| M 0.75 | 87 | 40 | 42 | 5 | 5.7% | 4 | 4 |
| N 0.735 | 98 | 42 | 47 | 9 | 9.2% | 5 | 3 |
| N 0.74 | 94 | 42 | 44 | 8 | 8.5% | 5 | 4 |
| N 0.745 | 91 | 41 | 44 | 6 | 6.6% | 5 | 4 |

### Holdout (13 ideas, read once)

| rule | listed | same idea (2) | related (1) | words only (0) | wrong share | ideas with a wrong build | empty ideas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| current | 58 | 11 | 31 | 16 | 27.6% | 9 | 1 |
| A, B, E | 51 | 11 | 28 | 12 | 23.5% | 7 | 1 |
| C, D | 58 | 11 | 31 | 16 | 27.6% | 9 | 1 |
| M 0.72, 0.73, 0.735 | 48 | 11 | 24 | 13 | 27.1% | 8 | 1 |
| M 0.74 | 45 | 11 | 22 | 12 | 26.7% | 8 | 1 |
| M 0.745 | 44 | 10 | 22 | 12 | 27.3% | 8 | 1 |
| M 0.75 | 43 | 10 | 22 | 11 | 25.6% | 8 | 1 |
| N 0.735 | 51 | 11 | 24 | 16 | 31.4% | 9 | 1 |
| N 0.74 | 49 | 11 | 22 | 16 | 32.7% | 9 | 1 |
| N 0.745 | 48 | 10 | 22 | 16 | 33.3% | 9 | 1 |

### Earlier sets (1.9.87 captures, their blind labels)

| rule | 36 short ideas: listed (2/1/0) | 34 test ideas: listed (2/1/0, unlabeled) |
| --- | --- | --- |
| current | 109 (59/40/10) | 138 (2/4/3, 129) |
| A, B, E | 107 (58/39/10) | 138 (2/4/3, 129) |
| C | 109 (59/40/10) | 138 (2/4/3, 129) |
| D | 105 (59/37/9) | 136 (2/4/3, 127) |
| M 0.72 | 102 (57/36/9) | 128 (2/2/3, 121) |
| M 0.735 | 96 (56/33/7) | 113 (1/2/3, 107) |
| N 0.735 | 105 (59/37/9) | 124 (1/2/3, 118) |

Every row for every candidate, with each build lost and gained by name:
`evaluate-working.txt`, `evaluate-holdout.txt`, `evaluate-short.txt`,
`evaluate-tests.txt`. No candidate gains a build.

## Against the ship criteria

- **A, B, E** (the word path weighed by rarity). Holdout: 4 fewer wrong
  builds (SettleZK, PayOnProof, AgroChain LATAM, clevercon), no same-idea
  build lost, 3 related lost (Stellar Vote, Micro Lending for i18, ZeroWage).
  Working: no change. Fails: no probe is fixed, and on the short ideas it
  drops FixedRateX (graded 2 for "recurring subscription payments"), whose
  two words cover 0.487 of the idea's weight, and the related Stellar
  Payment API (PLUTO). Moving the threshold to keep FixedRateX would be
  tuned on a check set: no working build depends on the word path alone
  with a coverage below 0.66, so working gives the threshold no information.
- **C, D.** No change on the holdout. D drops 3 related builds and 1 wrong
  one on the short ideas.
- **M** (a higher floor for meaning-only builds). Of the floors tried, 0.735
  is the lowest that removes the wrong builds of i04 and i11 (0.727 and
  0.733). Holdout: 3 fewer
  wrong (CarbonXO, QR Mint, Stellar Micro payment for AI prompt), no
  same-idea build lost, 7 related lost. Fails: on working it drops 4
  same-idea builds (CBRprotocolo, Loyal Local, Nexus, Stellar Vault) and 14
  related to remove 9 wrong; on the short ideas it drops Aniverse, ZK-Tix
  and StarProof (graded 2); on the test ideas Micro Lending (graded 2). At
  0.745 and above it also drops Micro Lending (graded 2) on the holdout.
- **N.** No wrong build fewer on the holdout: its meaning-only wrong builds
  either match one word (DUST AGGREGATOR, CarbonXO, QR Mint, Stellar Micro
  payment for AI prompt) or score above every floor tried (RemitLend 0.755,
  Calypso 0.747).

## The probes

On 1.9.91 the three probe ideas list these wrong builds; the top five moved
since the battery read 1.9.90 (Autopilot is no longer in i11's five).

- **i01** Delibera: every word of the idea is in its own description (DAO
  deliberation by agents, charged per call over x402 in USDC), and its
  meaning score, 0.788, sits among the same-idea builds (StellarAgent
  0.821, Stellar Agent Gateway 0.816, AgentPay 0.814). The label turns on
  what the product is for, which neither words nor the meaning score
  carry. No general rule over these signals removes it.
- **i11** Stellar Automations Studio (0.733) and **i04** QR Mint (0.727) are
  admitted on meaning alone and match no word. On working, a same-idea
  build admitted on meaning alone scores as low as 0.701 (Loyal Local),
  and Stellar Vault (same idea, i37) scores 0.733 like Stellar Automations
  Studio. On the holdout RemitLend (wrong, 0.755) scores above Micro
  Lending (same idea, 0.744). `meaning-only-working.txt` and
  `meaning-only-holdout.txt` list every meaning-only admission by score.

## Leads (not measured here)

- On the holdout, 4 of the 5 builds admitted on two words alone have no
  meaning score at all (below the 0.68 floor or outside the 300 nearest),
  while on working the one such admission is related (Soroscan, i38).
  Requiring a meaning score for word matches when meaning ran was seen
  only after the holdout was read, so it needs a fresh held-out set.
- The meaning-only errors are generic descriptions close to many ideas
  (QR Mint is wrong for both i04 and i12). A fix needs a signal the meaning
  score lacks.

## Files

- `split.py`: the split and the derived `ideas.json` and `labels.json` from
  the draft label file (not committed; its notes are drafts).
- `capture.mjs`, `capture.txt`: the capture and its log.
- `derive.mts`, `derive.txt`: window files and parity.
- `windows-40.json`, `windows-short.json`, `windows-tests.json`: per idea,
  the top 20 (top 10 for the earlier sets) with the fields the rules read
  and each row's grade. Dashes in upstream names are JSON unicode escapes.
- `lib.mts`, `rules.mts`: shared helpers and the candidate rules.
- `evaluate.mts`, `diagnose.mts`, `sim-only.mts` and their `*.txt` outputs.

## Rerun

Copy this directory to `tmp/` at the repository root (the scripts import
`src/lib` by a path relative to `tmp/`; git does not ignore `tmp/`, so do
not commit it). From the root:

```
pnpm exec tsx tmp/evaluate.mts improvements/audits/2026-10-22-prior-art-precision/windows-40.json working
pnpm exec tsx tmp/evaluate.mts improvements/audits/2026-10-22-prior-art-precision/windows-40.json holdout --detail
pnpm exec tsx tmp/evaluate.mts improvements/audits/2026-10-22-prior-art-precision/windows-short.json all
pnpm exec tsx tmp/diagnose.mts improvements/audits/2026-10-22-prior-art-precision/windows-40.json working
```

A fresh capture (live data moves, so numbers can change):
`node tmp/capture.mjs tmp/ideas.json tmp/live-40.json`, then
`pnpm exec tsx tmp/derive.mts tmp/live-40.json tmp/labels.json improvements/audits/2026-10-22-short-idea-prior-art tmp/out`.
