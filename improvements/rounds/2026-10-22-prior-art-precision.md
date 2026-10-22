# 2026-10-22: prior-art precision (vetIdea builds that share only words)

## Scope

vetIdea's `priorArt.builds`, and every route that shares its evidence rule
(the vet block of scfPitch, hackathonBrief and reviewSubmission, and
hackathonBrief's builds), lists hackathon builds that are not the idea. Make
the rule stricter where it is wrong without losing builds that are the same
idea, measured on the full 40-idea labeled set with a held-out slice.

Found by the 32-question battery on live 1.9.90 (2026-10-22): three ideas
list builds graded 0 against draft labels (i01 x402 agent payments, i11
savings circle, i04 tokenized real estate). They are probes into a class of
error, not targets: no idea text, word or build id is special-cased.

## Lanes

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| F: prior-art precision | Claude Opus 5.5, xhigh | own worktree, branch `lane/f-prior-art-precision`: `src/lib/prior-art-rank.ts`, `src/lib/hackathon-builds.ts`, callers, tests, spec text, changelog, version, `improvements/audits/2026-10-22-prior-art-precision/`, this ledger, one TODO item | a commit on the branch, not pushed: the evidence directory, this ledger and one TODO item; nothing shipped, so no `src/` change |

The orchestrator's independent review follows on a model other than the
author's.

## Method (fixed before any result was read)

- Split: every third idea by id is held out (i03, i06, ..., i39: 13
  ideas); the other 27 are working. The three probes are in working. Tune
  on working only; report both.
- Capture: read-only GETs to https://www.stellarlight.xyz, apiVersion read
  at start and end, 429 Retry-After honored, a 2 s pause between requests.
- Replay with this tree's code; parity with live vetIdea first.
- Ship only if, on the holdout, fewer grade-0 builds are listed and no
  grade-2 build is lost; on working, the probes lose their grade-0 builds
  and keep i01 >= 2, i11 >= 2, i04 >= 1 same-idea builds; on the earlier
  sets (36 short ideas, 34 test ideas) no build labeled 2 is lost.
- Prefer a filter-only change, which needs no new labels.

## Log

- 2026-10-22 (lane F): `git fetch origin main && git switch -c
  lane/f-prior-art-precision origin/main`; HEAD d1d8788e (spec 1.9.91).
  `pnpm install --frozen-lockfile --prefer-offline`: exit 0.
- `python3 tmp/split.py labels-draft.json tmp/ideas.json tmp/labels.json`:
  40 ideas, 13 held out (i03 i06 i09 i12 i15 i18 i21 i24 i27 i30 i33 i36
  i39), 895 graded builds; notes and reasons dropped.
- `node tmp/capture.mjs tmp/ideas.json tmp/live-40.json`: started; corpus
  1344 stored submissions read in browse mode.
- Capture done: 40 ideas, every request 200, buildsMode hybrid on all 40;
  apiVersion 1.9.91 at 20:56:40Z and 1.9.91 at 21:03:41Z.
- `pnpm exec tsx tmp/derive.mts tmp/live-40.json tmp/labels.json
  improvements/audits/2026-10-22-short-idea-prior-art tmp/out`: vetIdea
  parity failures 0 of 40 (the current rule replayed equals live
  `priorArt.builds` id for id); replayed matched words differ from live on 0
  window rows; the 1.9.87 captures replay with 0 parity failures on 36 and
  34 ideas.
- `pnpm exec tsx tmp/diagnose.mts ... working`: of 17 wrong builds listed
  for the 27 working ideas, 12 pass on the meaning score alone, 4 on the
  meaning score and two words, 1 (i01 Delibera) on all three conditions,
  0 on words alone. The hypothesis (common words admit them) does not hold
  on working.
- Candidates fixed in `rules.mts` before the holdout was read: A, B, E (the
  word path weighed by rarity, rankPriorArt style), C, D (own-text words),
  M and N (a higher meaning floor for builds no word path admits, 0.72 to
  0.75). `pnpm exec tsx tmp/evaluate.mts windows-40.json working`: A to E
  change nothing; M 0.735 (the lowest floor tried that removes the i04 and
  i11 wrong builds) lists 96 instead of 123, 8 wrong instead of 17, and
  drops 4 same-idea builds (CBRprotocolo, Loyal Local, Nexus, Stellar
  Vault) and 14 related.
- `pnpm exec tsx tmp/evaluate.mts windows-40.json holdout --detail` (read
  once): current 58 listed, 16 wrong (27.6%); A, B, E 51 listed, 12 wrong,
  no same-idea build lost; M 0.735 48 listed, 13 wrong, no same-idea build
  lost; C, D and N remove no wrong build.
- `pnpm exec tsx tmp/evaluate.mts windows-short.json all` and
  `windows-tests.json all`: A, B, E drop FixedRateX (graded 2, coverage
  0.487) on the short ideas; M 0.735 drops Aniverse, ZK-Tix and StarProof
  (graded 2) on the short ideas and Micro Lending (graded 2) on the test
  ideas.
- Verdict: no candidate meets the ship criteria; nothing in `src/` changed.
  Evidence in `improvements/audits/2026-10-22-prior-art-precision/`;
  `bash tmp/rerun.sh` reproduced every committed output byte for byte.
- Checks on the branch: `pnpm generate:importmap` (the gitignored import
  map tsc needs) exit 0; `pnpm exec tsc --noEmit -p tsconfig.json` exit 0;
  `npx vitest run src/lib/__tests__ src/app/api` exit 0, 178 files and
  2225 tests passed (tests/int/api.int.spec.ts not run: it needs a Payload
  secret); `pnpm contract:write` exit 0 with no diff; `CONTRACT_BASE=d1d8788e
  pnpm contract:check` exit 0; `pnpm raven:gate --raven <stellar-raven
  checkout>` exit 0, ACCEPT 1.9.91; `npx biome check --linter-enabled=false`
  on the changed .mts, .mjs and .json files exit 0.

## Outcome

Not shipped. The wrong builds the battery found are admitted by the meaning
score, and the meaning score does not separate them from same-idea builds
on these labels: on working, a same-idea build admitted on meaning alone
scores 0.701 and another ties a wrong one at 0.733; on the holdout a wrong
build (0.755) scores above a same-idea one (0.744). Weighing the word path
by rarity helps only on the holdout (4 fewer wrong, no same-idea lost),
fixes no probe, and drops one same-idea build on the short-idea set. i01's
Delibera uses every word of the idea and scores 0.788 by meaning, so no
rule over these signals removes it. Moved to `improvements/TODO.md` Now 9.

## Part 2: words need meaning (lane G)

Scope: test, on a fresh labeled set, part 1's lead that when search by
meaning ran, a build passing only on two matched words should also have a
meaning score (be among the meaning neighbours). G1: the two-word path
needs a meaning score; G2: G1 plus the one-word (textShare) path. Keyword
mode unchanged. Ship criteria fixed in the lane brief before the capture:
on the fresh set no removed build graded 2, removed grade 0 at least
removed grade 1, at least one grade-0 build removed; on every earlier set no
build graded 2 lost.

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| G: words need meaning | Claude Opus 5.5, xhigh | own worktree, branch `lane/g-words-need-meaning` from 9635f6c8: `improvements/audits/2026-10-22-words-need-meaning/`, this ledger (append), one TODO item | a commit on the branch, not pushed; nothing shipped, so no `src/` change |

Fresh ideas written by a separate agent (Claude Sonnet 5.5) not told the
rule; blind grades from two labelers (Claude Sonnet 5.5, effort high, each
reading only the sheet).

### Log

- 2026-10-22 (lane G): `git switch -c lane/g-words-need-meaning
  9635f6c87ccb71a22220b2819d1cab7b44ed377c`; `pnpm install
  --frozen-lockfile --prefer-offline` exit 0; `pnpm generate:importmap`
  exit 0.
- Fresh set copied unchanged to
  `improvements/audits/2026-10-22-words-need-meaning/fresh-ideas.frozen.json`:
  sha256 0c8b95f967c908aee6535631bcf643a004419e3a0b947ca7ff49cdd8f5afa3e5,
  file frozen 2026-10-22T21:26:20Z; 30 ideas, 10 short, 10 medium, 10
  long.
- `node improvements/audits/2026-10-22-words-need-meaning/capture.mjs
  .../fresh-ideas.frozen.json scratchpad/lane-g/live-fresh.json`: exit 0;
  corpus 1344; every request 200; all 30 ideas served hybrid; whole
  rankings captured (2 to 310 rows); apiVersion 1.9.91 at 21:30:05Z and
  1.9.91 at 21:36:57Z.
- `pnpm exec tsx .../derive.mts scratchpad/lane-g/live-fresh.json
  .../windows-fresh.json`: vetIdea parity failures 0 of 30; brief parity
  failures 0 of 30; replayed matched words differ from live on 0 of 1,015
  rows; the brief's vet block equals vetIdea on 30 of 30. Builds with a
  meaning score per idea: short 0 to 29 (median 0.5), medium 0 to 123
  (median 19), long 8 to 289 (median 36.5). f23 (286, lowest 0.694) and f26
  (289, lowest 0.712) stopped at the 300 cap; f22 (280, lowest 0.681) near
  it.
- `pnpm exec tsx .../removals.mts .../windows-fresh.json
  scratchpad/lane-g/live-fresh.json
  improvements/audits/2026-10-22-prior-art-precision/labels.json <sheet>
  <key>`: G1 and G2 remove the same 13 builds (12 from vetIdea's five, 1
  brief winner slot on f17) and the brief gains 1 (f17); vetIdea lists 101
  under the current rule and 89 under either; 6 ideas left empty; none on
  f22, f23 or f26. Sheet of 27 rows (13 removed, 1 gained, 13 kept decoys),
  seed 20261022, sent for blind labels.
- `pnpm exec tsx .../evaluate.mts .../windows-fresh.json <no grades> ...`
  over part 1's earlier sets (before the grades arrived): G1 loses Decrow
  Finance (graded 2, recurring subscription payments) on the 36 short
  ideas; G2 loses 39 graded 2 there and Umbra Wallet (graded 2) on the 34
  test ideas. Both fail the earlier-set criterion whatever the fresh grades.
- One read-only check, after that and not used to tune:
  `GET /api/hackathons/builds?q=recurring%20subscription%20payments` on
  1.9.91 still lists Decrow Finance third with no meaning score;
  `mode=meaning` scores 7 builds for the idea.
- Grades returned (two labelers, agreement 25 of 27, both disagreements
  kept decoys on f17), joined by sheet row with the key's status into
  `grades.json`. `pnpm exec tsx .../evaluate.mts
  .../windows-fresh.json .../grades.json labeler1|labeler2
  improvements/audits/2026-10-22-prior-art-precision`: removed 0 graded 2,
  6 graded 1, 7 graded 0 under both labelers; brief gain graded 0; decoys
  0 / 11 / 2 (labeler 1) and 0 / 9 / 4 (labeler 2). Fresh criteria pass
  for G1 and G2; earlier sets fail both.
- `npx biome check --linter-enabled=false --write` on the new scripts and
  JSON (not the frozen file); a rerun of derive, removals and both
  evaluate runs reproduced every committed output (derive.txt and the
  evaluate files byte for byte, the window data equal once parsed).
- Checks: `pnpm exec tsc --noEmit -p tsconfig.json` exit 0; `npx vitest
  run src/lib/__tests__ src/app/api` exit 0, 178 files and 2225 tests
  (tests/int/api.int.spec.ts not run: it needs a Payload secret).
- TODO Now 10 probe rechecked at 23:15Z on 1.9.91: `GET /api/vet-idea?q=
  marketplace for renting out tools and equipment with deposits held in
  escrow contracts` lists LumenSure (`dorahacks-buidl-46284`) and
  ContractForge (`dorahacks-buidl-36190`) with matched words and no
  similarity, `buildsMode` hybrid.

### Outcome

Not shipped; nothing in `src/` changed. On the fresh set both candidates
remove 13 builds, 7 graded 0 and 6 graded 1, none graded 2, under both
labelers, and the brief swaps a grade-0 winner for a grade-0 build on f17.
On part 1's 40 ideas G1 removes 4 graded 0 and 3 graded 1 and none graded
2. But on the 36 short ideas G1 drops Decrow Finance (graded 2): short
ideas get few meaning scores (7 builds scored for "recurring subscription
payments"), so a same-idea build matching two words can have none. G2 also
drops 39 graded 2 there, 38 of them kept by G1 only through the one-word
path. Only
G1 and G2 were measured. Evidence in
`improvements/audits/2026-10-22-words-need-meaning/`; moved to
`improvements/TODO.md` Now 10.
