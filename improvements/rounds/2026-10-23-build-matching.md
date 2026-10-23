# 2026-10-23: build search matching (nonsense matches, declared packages)

## Scope

Two gaps in searchHackathonBuilds' word matching, found by a private
55-question hackathon battery on live 1.9.91:

1. Nonsense queries return builds. `q=quantum llama sandwich&mode=keyword`
   returned Quantum Shield Exchange (the name holds "quantum", one word of
   three) and MellaMate ("llama" found inside the name). A name hit admits a
   build on its own, and a term longer than three letters matches inside
   other words.
2. Declared packages are not searchable. `q=passkey&winnersOnly=1` returned
   0 though the winner Tukar declares passkey-kit: the matched text holds
   the name, summary, track and award, not the declared stack.

Fix what can be fixed without losing a same-idea build, measured on the
full stored corpus with the labeled prior-art sets. Prior-art recall comes
first: a missed existing build is the costly error.

## Lanes

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| K: build matching | Claude Opus 5.5, xhigh | own worktree, branch `lane/k-build-matching`: `src/lib/hackathon-builds.ts`, its tests, spec text, changelog, version, `improvements/audits/2026-10-23-build-matching/`, this ledger | a commit on the branch, not pushed |

The orchestrator's independent review follows on a model other than the
author's.

## Method (fixed before any result was read)

- Labeled sets: the 40 ideas (`labels.json`), 36 short and 34 test ideas
  (their window grades) of `../audits/2026-10-22-prior-art-precision/`, and
  the 30 fresh ideas of `../audits/2026-10-22-words-need-meaning/`
  (`grades.json`, the stricter of its two labelers).
- Recall: per labeled idea, the builds graded 2 (same idea) found anywhere
  in the matched list, in the top 20 and in the top 5; keyword and hybrid;
  before and after. Replayed over a fresh capture of every stored
  submission, with each idea's live meaning scores, so the whole matched
  list is measured, not only the windows the labels were read on.
- Nonsense battery: 15 multi-word queries written and frozen before any
  run, `nonsense.frozen.json`, sha256
  `de52ce94d47f404c1ebe7f215530646f0687c323a5a612e73d2ccb411c53ec83`,
  frozen 2026-10-23T01:13:05Z. Counted, never tuned on.
- Ship only if: on every labeled set no grade-2 build leaves the matched
  list or the top 20 that was in it before; the nonsense battery returns
  fewer builds; `q=passkey&winnersOnly=1` returns Tukar; everything lost or
  gained is named. A fix for one problem that passes ships alone.

## Log

- 2026-10-23 (lane K): `git fetch origin main && git switch -c
  lane/k-build-matching origin/main`; HEAD 83e134b2 (spec 1.9.91).
  `pnpm install --frozen-lockfile --prefer-offline`: exit 0;
  `pnpm generate:importmap`: exit 0.
- 01:13:05Z: nonsense battery frozen (sha256 above), before any query ran.
- `node improvements/audits/2026-10-23-build-matching/capture.mjs
  <scratch>/live.json`: started.
- Capture done: corpus 1,344 (1,013 repos read for `stack`), 140 ideas, 18
  extra queries, every request 200, every idea served hybrid; apiVersion
  1.9.91 at 01:14:29Z and 1.9.91 at 01:24:27Z.
- Candidates written before the replay: K1 (no name bypass), K2 (name match
  at a word start, camelCase split), K12, W (terms of four or five letters
  at a word start), K1W, S (declared packages, libraries over a fifth of
  read repos left out, cut chosen from the package distribution), K1S.
  Unit tests (`npx vitest run src/lib/__tests__ src/app/api/hackathons`): 2,213
  pass under each of K1, K2, K12 and W.
- `replay.mts` on the base: parity with live, keyword order and count 140 of
  140; hybrid count 140 of 140, order 57, top-5 set 132, top-20 set 123
  (similarity rounded to three decimals by the API).
- `compare.mts` per candidate, grade-2 losses from the matched list or top
  20: K1 14, K2 2, K12 15, W 1, K1W 15, S 1, K1S 15. Battery builds
  (keyword / hybrid, base 20 / 21): K1, K12, K1W, K1S 1 / 2; K2, W, S 20 / 21.
  No candidate for problem 1 passes.
- S lost x402 Stellar MCP from i01's keyword top 20 (a working idea). S10
  also leaves out x402 (12% of read repos, the next library): 0 grade-2
  losses on every set, holdout included; battery unchanged at 20 / 21;
  `passkey` winners 0 -> 2 (Tukar, DeFi Quest). The cut was chosen after
  reading i01.
- Tests first: `npx vitest run src/lib/__tests__/hackathon-builds.test.ts -t
  "package the repo declares|libraries most repos declare"` on the base:
  1 failed (`expected [] to deeply equal [ [ 'Tukar', [ 'passkey' ], +0 ] ]`),
  1 passed. With S10 in `src/lib/hackathon-builds.ts`: 43 of 43 pass. The
  tree's code replays identically to S10.
- Blind grades (Claude Sonnet 5.5, effort high, sheet only) for the 9 builds
  vetIdea's five or the brief's picks gain or lose that no label covered:
  TalkToStellar 0, Stellaro 0, Prism 1, Ponte Pay 0, KaleConnect 1,
  StellarRemit 2 (lost from vetIdea's five, now 6th), Tukar 0, BlendScore 1,
  clevercon 0.
- Spec 1.9.93 (1.9.92 is another lane's): q and matchedTerms text, changelog
  entry; `pnpm contract:write`: exit 0.

## Outcome

- Shipped on branch `lane/k-build-matching` (committed, not pushed): declared
  packages are matched (S10), spec 1.9.93. Nonsense matches not fixed; the
  measurement and the leads are in
  `../audits/2026-10-23-build-matching/README.md`.
- Not verified live: nothing is deployed from this lane.
