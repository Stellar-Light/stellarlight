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
  Evidence in `improvements/audits/2026-10-22-prior-art-precision/`.
- Checks on the branch: `pnpm generate:importmap` (the gitignored import
  map tsc needs) exit 0; `pnpm exec tsc --noEmit -p tsconfig.json` exit 0;
  `npx vitest run src/lib/__tests__ src/app/api` exit 0, 178 files and
  2225 tests passed (tests/int/api.int.spec.ts not run: it needs a Payload
  secret); `pnpm contract:write` exit 0 with no diff; `CONTRACT_BASE=d1d8788e
  pnpm contract:check` exit 0; `pnpm raven:gate --raven <stellar-raven
  checkout>` exit 0, ACCEPT 1.9.91; `npx biome check --linter-enabled=false`
  on the changed .mts, .mjs and .json files exit 0.
- Review (Claude Fable 5.1, effort high, fresh context, read-only clone at
  9635f6c8): every number recomputed from the committed data matched.
  GATE: fix, four wording findings, all fixed: "drops same-idea builds on
  every set" was too broad (the holdout loses none below a 0.745 floor);
  the queue item's condition counts now read 12 / 4 / 1 / 0 as the README
  does; a rerun claim that pointed at an uncommitted local script was
  removed (the README's Rerun block is the reproducible path); the README's
  derive command now uses `tmp/out` as run, and warns that `tmp/` is not
  ignored by git.

## Outcome

Not shipped. The wrong builds the battery found are admitted by the meaning
score, and the meaning score does not separate them from same-idea builds
on these labels: on working, a same-idea build admitted on meaning alone
scores 0.701 and another ties a wrong one at 0.733; on the holdout a wrong
build (0.755) scores above a same-idea one (0.744). Weighing the word path
by rarity helps only on the holdout (4 fewer wrong, no same-idea lost),
fixes no probe, and drops one same-idea build on the short-idea set. i01's
Delibera uses every word of the idea and scores 0.788 by meaning, so a
floor high enough to remove it also drops same-idea builds on other ideas. Moved to `improvements/TODO.md` Now 9.
