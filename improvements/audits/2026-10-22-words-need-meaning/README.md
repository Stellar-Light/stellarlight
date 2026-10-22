# Words need meaning: prior-art builds admitted on words the meaning search did not score

Evidence for lane G in `improvements/rounds/2026-10-22-prior-art-precision.md`
(part 2 of that round; part 1 is `../2026-10-22-prior-art-precision/`).

**Verdict: not shipped.** Two candidate rules were tested. Both pass the
fresh-set criteria under both blind labelers, and both fail on part 1's
earlier labeled sets: G1 drops Decrow Finance, graded 2 (same idea) for
"recurring subscription payments" on the 36 short ideas; G2 drops 39
builds graded 2 there and Umbra Wallet (graded 2) on the 34 test ideas.
Nothing in `src/` changed. The labels are drafts, pending owner review.

## The rule tested

vetIdea lists a build from the top five of the hybrid ranking when its
meaning score is at least 0.7, it matched two of the idea's words, or its
own name or description uses every word of the idea the search reads
(`textShare` 1); hackathonBrief's winner slots use the first two
(`src/lib/prior-art-rank.ts`). The meaning search reads up to 300
neighbours above 0.68 (`MEANING_NEIGHBOURS`, `BUILD_SEMANTIC_FLOOR`), so a
build with no meaning score in a hybrid result was not close in meaning,
unless that read stopped at the cap or the build is not embedded yet
(embedding coverage of the stored submissions was not checked). Part 1 saw, after its holdout was
opened, that 4 of the 5 wrong builds admitted on two words alone had no
meaning score. This tests that on a fresh set:

- **G1:** when search by meaning ran, the two-word path also needs a meaning
  score (the build is among the meaning neighbours). Keyword mode, where
  meaning could not run, is unchanged.
- **G2:** G1, and the one-word (`textShare`) path also needs a meaning score.

Both are filter-only on vetIdea's five. In the brief, a winner slot a
candidate frees can pull in another build, so the brief can also gain.

## Fresh set

- `fresh-ideas.frozen.json`, committed unchanged: 30 ideas (f01 to f30), 10
  short, 10 medium and 10 long, written by a separate agent (Claude Sonnet
  5.5) that was not told the rule. sha256
  `0c8b95f967c908aee6535631bcf643a004419e3a0b947ca7ff49cdd8f5afa3e5`.
  The file was frozen at 2026-10-22T21:26:20Z (as recorded in the lane log; git keeps no modification times); its
  `writtenAt` field (17:00:00Z) is the writer's guess. No idea was edited or
  dropped.
- Ship criteria, fixed in the lane brief before the capture: on the fresh
  set, no removed build graded 2, removed grade 0 at least removed grade 1,
  and at least one grade-0 build removed; on every earlier set, no build
  graded 2 lost. If both passed, the one removing more grade 0 (G1 on a
  tie).

## Capture and parity

- `capture.mjs`: read-only GETs to https://www.stellarlight.xyz, 2 s apart,
  429 Retry-After honored. Every stored submission in browse mode (1,344);
  per idea the whole hybrid searchHackathonBuilds ranking (2 to 310 rows,
  every row captured), the count of builds with a meaning score
  (`mode=meaning`), live vetIdea `priorArt` and live hackathonBrief builds.
  `/api/status` apiVersion **1.9.91 at the start (21:30:05Z) and 1.9.91 at
  the end (21:36:57Z)**, 2026-10-22. Every request answered 200 and all 30
  ideas were served hybrid.
- `derive.mts`, `derive.txt`: this tree's `priorArtTop` over the live top
  five equals live vetIdea `priorArt.builds` id for id on **30 of 30**
  ideas; this tree's `pickBriefBuilds` over the live ranking equals the
  live brief's builds on **30 of 30**; the scorer's matched words,
  replayed over the corpus, equal live `matchedTerms` on all **1,015** rows
  that matched words; the brief's vet block equals vetIdea on 30 of 30; the
  candidates' "current" rule in `lib.mts` equals this tree's code on 30 of
  30. The raw capture (with upstream descriptions) is not committed;
  `windows-fresh.json` keeps only the fields the rules read.

## Builds with a meaning score, and the 300 cap

| ideas | builds with a meaning score per idea | median | ideas with none |
| --- | --- | --- | --- |
| 10 short | 0 to 29 | 0.5 | f03, f04, f05, f06, f09 |
| 10 medium | 0 to 123 | 19 | f19 |
| 10 long | 8 to 289 | 36.5 | none |

The meaning search keeps a submission entered in several events once, so a
read that stopped at the 300-row cap can hold fewer than 300 builds. f23
(286 builds, lowest score 0.694) and f26 (289, lowest 0.712) stopped at the
cap; f22 (280, lowest 0.681) is near it. No build either candidate removes
is on those three ideas. Per idea: `derive.txt`.

## What the candidates remove on the fresh set

G1 and G2 remove the same builds here: no build vetIdea or the brief lists
passes only on the one-word path without a meaning score. vetIdea lists
101 builds under the current rule and 89 under either candidate; 6 ideas
are left with none (f04, f05, f08, f10, f18, f19). The ideas that lose
builds from vetIdea's five had 0 to 8 builds with a meaning score.

| idea (scored builds) | build | where | labeler 1 | labeler 2 |
| --- | --- | --- | --- | --- |
| f04 DAO grant board (0) | deedao | vetIdea, brief | 0 | 0 |
| f05 game item marketplace (0) | Poison-Game | vetIdea, brief | 0 | 0 |
| f05 | VIVO-RUN | vetIdea, brief | 1 | 1 |
| f05 | NFT DND | vetIdea, brief | 0 | 0 |
| f08 peso stablecoin (1) | Link2Pay | vetIdea, brief | 1 | 1 |
| f10 wallet recovery guardians (3) | PayPulse: Offline-First Bluetooth Payments on Stellar | vetIdea, brief | 0 | 0 |
| f17 Soroban contract template generator from plain English (31) | x402-mcp-stellar-template (a winner ranked 6th) | brief winner slot | 0 | 0 |
| f18 quadratic voting for community grants (1) | Stellar.Gov | vetIdea, brief | 1 | 1 |
| f18 | Dr. T | vetIdea, brief | 1 | 1 |
| f19 pay as you go health insurance for gig workers (0) | Mão na Roda - Mutual Protection for Gig Workers. | vetIdea, brief | 1 | 1 |
| f28 marketplace for renting out tools and equipment with deposits held in escrow contracts (8) | LumenSure - Private Proof-Backed Insurance Payouts on Stellar | vetIdea, brief | 0 | 0 |
| f28 | Stellar AI Escrow Commerce | vetIdea, brief | 1 | 1 |
| f28 | ContractForge | vetIdea, brief | 0 | 0 |

The brief gains one build: on f17, with the winner gone, Blend AI Powered
Smart Monitoring By Sorobanhooks (ranked 5th) takes the fifth slot, graded 0
by both labelers. On f17 the brief swaps one grade-0 build for another.

By idea length, the 13 removed: short 4 graded 0 and 2 graded 1; medium 1
and 3; long 2 and 1.

### Per labeler

Two blind labelers (both Claude Sonnet 5.5, effort high) each read only
the sheet: the idea, the build's name, its event and its description cut
to 600 characters, with part 1's rubric v1 at the top, and no rule, score,
rank or kept or removed marker. The sheet held the 13 removed builds, the 1
gained and 13 decoys: builds vetIdea lists under every rule, 5 from the
same ideas (f17, f28) and 8 from other fresh ideas, since 6 of the ideas
that lose builds are left with none. They agree on 25 of 27 rows; both
disagreements are decoys on f17 (Soride and Soroban to MCP Server in
seconds + Policy Signers Playground: 1 from labeler 1, 0 from labeler 2).

| labeler | removed: graded 2 | graded 1 | graded 0 | brief gain | kept decoys (2 / 1 / 0) | fresh criteria |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | 6 | 7 | 1 graded 0 | 0 / 11 / 2 | G1 pass, G2 pass |
| 2 | 0 | 6 | 7 | 1 graded 0 | 0 / 9 / 4 | G1 pass, G2 pass |

## Earlier sets (these decide the verdict)

Both candidates over vetIdea's five on part 1's window files, with their
labels (every idea there was served hybrid). The same under both labelers.

| set | current lists (2 / 1 / 0) | G1 loses (2 / 1 / 0) | G2 loses (2 / 1 / 0) |
| --- | --- | --- | --- |
| 40 ideas (1.9.91) | 56 / 92 / 33 | 0 / 3 / 4 | 0 / 3 / 4 |
| 36 short ideas (1.9.87) | 59 / 40 / 10 | **1** / 4 / 1 | **39** / 27 / 7, 22 ideas left empty |
| 34 test ideas (1.9.87, mostly unlabeled) | 2 / 4 / 3, 129 unlabeled | 0 / 0 / 0, 7 unlabeled | **1** / 2 / 3, 8 unlabeled |

- **40 ideas, G1 and G2:** graded 0, SettleZK (i18), Stellar Rent and
  PayOnProof (i21), clevercon (i39); graded 1, Micro Lending (i18), Mineral
  Gateway (i30), Soroscan (i38). The brief within the top 20 also loses
  xbid.ai (i05, graded 0) and clevercon for i13 (unlabeled); no build
  graded 2.
- **36 short ideas, G1:** graded 2, Decrow Finance (recurring subscription
  payments: two matched words, no meaning score); graded 1, Stellar Payment
  API (PLUTO) (recurring subscription payments), Turista and MicoPay
  Protocol (merchant payments), Autopilot (stablecoin savings); graded 0,
  RADOX (recurring subscription payments).
- **36 short ideas, G2:** G1's six and 67 more, each one G1 keeps only
  through the one-word path without a meaning score (among them builds for
  payroll, kyc, remittance app, crowdfunding, insurance and escrow); every
  one by name in `evaluate-labeler1.txt`.
- **34 test ideas, G1:** unlabeled, PayOnProof, StealthPayroll, Contextio,
  Twin Ticket, Dropsland, Be A Stellar, KaleGuardVaults. **G2** also loses
  Umbra Wallet (graded 2), Cards402.com and CALCY (graded 1), ANCHORSHIELD,
  Soroswap Pro Trader and Kale Grab Rush (graded 0) and Stellar Stake House
  (unlabeled).

The short-idea set was captured on 1.9.87. One read-only check on 1.9.91
(2026-10-22, after the criteria were applied and not used to tune
anything): `/api/hackathons/builds?q=recurring subscription payments`
still lists Decrow Finance third with matched words recurring and payments
and no meaning score, and `mode=meaning` scores 7 builds for that idea, far
from the cap.

## Against the ship criteria

- **G1:** fresh set pass under both labelers (13 removed, none graded 2, 7
  graded 0 to 6 graded 1); fails on the 36 short ideas (Decrow Finance,
  graded 2).
- **G2:** the same on the fresh set; fails on the 36 short ideas (39 graded
  2) and the 34 test ideas (Umbra Wallet, graded 2).

## What was measured, and what was not

- Measured: G1 and G2 as stated above. On part 1's 40 ideas G1 removes 4
  builds graded 0 and 3 graded 1 and no build graded 2; on the fresh set 7
  graded 0 and 6 graded 1 and none graded 2. On short ideas, where the
  meaning search scores few builds (none for 5 of the 10 short fresh ideas,
  7 for "recurring subscription payments"), G1 also drops a same-idea build.
- Not measured: any other form of the rule, for example applying it only
  when the meaning search scored enough builds for the idea. A form chosen
  after reading these sets would be tuned on them and would need another
  fresh set.
- Every build G1 removes on the fresh set comes from an idea where the
  meaning search scored 0 to 8 builds, or (f17) from a brief winner slot.
  Both labelers are the same model; the grades are drafts.

## Files

- `fresh-ideas.frozen.json`: the fresh set, unchanged.
- `capture.mjs`: the capture (raw output not committed).
- `derive.mts`, `derive.txt`: window file, parity, meaning counts and cap.
- `windows-fresh.json`: per idea the rows the rules read (top 20 plus every
  winner covering half the idea's words), with live meaning score and
  matched words, and textShare and share from this tree's scorer. Dashes in
  upstream names are JSON unicode escapes.
- `lib.mts`: the current rule and the two candidates, for vetIdea and the
  brief.
- `removals.mts`, `removals.txt`: what each candidate removes and gains,
  and the blind sheet and key (written outside the repository, not
  committed).
- `grades.json`: per row ideaId, buildId, kept, removed or gained, and each
  labeler's grade.
- `evaluate.mts`, `evaluate-labeler1.txt`, `evaluate-labeler2.txt`: the
  tables above and the earlier sets, per labeler.

The scripts and the JSON they write are biome-formatted.
`fresh-ideas.frozen.json` is kept byte for byte as frozen, so its hash holds;
it is not biome-formatted.

## Rerun

From the repository root, with no network (reads committed files only):

```
pnpm exec tsx improvements/audits/2026-10-22-words-need-meaning/evaluate.mts improvements/audits/2026-10-22-words-need-meaning/windows-fresh.json improvements/audits/2026-10-22-words-need-meaning/grades.json labeler1 improvements/audits/2026-10-22-prior-art-precision
pnpm exec tsx improvements/audits/2026-10-22-words-need-meaning/evaluate.mts improvements/audits/2026-10-22-words-need-meaning/windows-fresh.json improvements/audits/2026-10-22-words-need-meaning/grades.json labeler2 improvements/audits/2026-10-22-prior-art-precision
```

A fresh capture (live data moves, so numbers can change):

```
node improvements/audits/2026-10-22-words-need-meaning/capture.mjs improvements/audits/2026-10-22-words-need-meaning/fresh-ideas.frozen.json scratchpad/live-fresh.json
pnpm exec tsx improvements/audits/2026-10-22-words-need-meaning/derive.mts scratchpad/live-fresh.json scratchpad/windows-fresh.json
pnpm exec tsx improvements/audits/2026-10-22-words-need-meaning/removals.mts scratchpad/windows-fresh.json scratchpad/live-fresh.json improvements/audits/2026-10-22-prior-art-precision/labels.json [sheet.md key.json]
```
