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

- Commit ae098cd1 (S10, packages in every build's matched text), reported to
  the orchestrator.
- Orchestrator decision: not shipped as is. It changes vetIdea's five for 3
  of 140 ideas the wrong way (TalkToStellar 0, Stellaro 0 and Ponte Pay 0
  in; StellarRemit, graded 2, to sixth), and vetIdea's prior-art precision
  is what the round is improving. Revise as a scope change, not a tuning
  change: package matching opt-in, passed only by the builds route; vetIdea,
  hackathonBrief, scfPitch, reviewSubmission and analyze's q unchanged;
  same library cut; re-measure on the same capture with no new thresholds;
  added ship criterion: vetIdea's five and the brief's picks identical to
  the base on all 140 ideas.
- Revision: `searchHackathonBuilds` option `packages`, passed by the builds
  route through `queryBuilds`; the haystack and the index cache key (v5) are
  back to the base. Tests first, against the base source of
  `hackathon-builds.ts`, `hackathon-build-query.ts` and the builds route:
  the lib test (`expected [] to deeply equal [ [ 'Tukar', [ 'passkey' ], +0 ]
  ]`) and the new route test (`expected [] to deeply equal [ [ 'tukar', [
  'passkey' ] ] ]`) fail; with the revision 49 of 49 pass in the two files.
- Replay of base and revision on the same capture (`replay.mts` now also
  hashes the plain rankings): ideas that differ from the base, of 140:
  vetIdea's five 0, the brief's picks 0, plain rankings (every row and
  field) 0. The builds route's rankings equal the first version's on all 140
  ideas and every extra query: 0 grade-2 losses from the matched list or the
  top 20; `q=passkey&winnersOnly=1` returns Tukar and DeFi Quest; battery 20
  / 21, unchanged.
- Text: the builds `q` and `matchedTerms` descriptions say packages match
  there only; analyze's `q` says a declared package does not match there;
  the changelog no longer says analyze or the vet blocks match packages.
  vetIdea and hackathonBrief descriptions unchanged.

## Outcome

- Shipped on branch `lane/k-build-matching` (committed, not pushed), spec
  1.9.93: declared packages match on searchHackathonBuilds only; prior art
  and analyze identical to the base on the 140 labeled ideas.
- Problem 1 (nonsense queries return builds) is unfixed. Every candidate
  that reduced the frozen battery's builds dropped same-idea builds. Lead: a
  rule keyed on query words that occur in no build was conceived only after
  the battery was read, so it needs a fresh battery written before it runs.
- The measurement and the leads are in
  `../audits/2026-10-23-build-matching/README.md`.
- Not verified live: nothing is deployed from this lane.

## Merge with main (orchestrator)

- `update_pr_branch.sh` stopped on six conflicts with #1856 (1.9.92):
  - The builds route, `queryBuilds`' options and the builds route test
    fixtures: both changes kept.
  - The changelog: both entries kept, 1.9.93 above 1.9.92.
  - version.ts: 1.9.93.
  - The generated spec: rebuilt with `pnpm contract:write`.
- Found at the merge: #1856's `meta.counts.entries` re-runs the match without
  this lane's `packages` option, so on the builds route a package match
  counted in matched but not in entries.
  - Fix: the entries pass uses the same `packages` option.
  - The entries description and this changelog entry now say that where q
    matches a package, entries can exceed analyze's total.
  - The test `q=passkey` gives matched 1 and entries 1. It fails with the
    fix reverted.
  - The browse expectation moves from 9 and 10 to 10 and 11 for the added
    tukar fixture.
- Checks on the merged tree: `pnpm exec tsc --noEmit -p tsconfig.json` exit
  0; `npx vitest run src/lib/__tests__ src/app/api` exit 0, 179 files and
  2242 tests; `CONTRACT_BASE=4430f803 pnpm contract:check` exit 0;
  `pnpm raven:gate` exit 0, ACCEPT 1.9.93.
- Review (Claude Fable 5.1, effort high, fresh context, read-only clone at
  53b2e73e): GATE: push. Opt-in isolation, the unread-stack path,
  tokenization and the identity claim (re-derived from the committed
  files) verified. Four low or info findings:
  - The changelog's examples of generic words matching were the mild ones.
    Now fixed: it names tooling packages that answer design, system, xdr and
    utils.
  - The excluded set is a snapshot of the tenth cut (x402 at 11.4%). Left as
    a known ceiling for a later guard.
  - The exclusion test also passes on base.
  - The committed replay files are slimmed.

## Lane L: nonsense queries should find nothing

### Scope

Problem 1 above, with lane K's unmeasured lead: turn a name match off when
most of the query's words appear in no build as whole words. Judged on a
fresh battery written by a separate agent that was told no rule.

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| L: nonsense queries | Claude Opus 5.5, xhigh | own worktree, branch `lane/l-nonsense-queries`: `src/lib/hackathon-builds.ts`, its tests, spec text, changelog, version, `improvements/audits/2026-10-23-nonsense-queries/`, this ledger | a commit on the branch, not pushed |

### Ship criteria (fixed in the brief, before any result)

- (a) Recall: on all 140 labeled ideas, keyword and hybrid, on the builds
  route, no build graded 2 leaves the matched list or the top 20.
- (b) Shared code: if the rule touches shared code, vetIdea's five and
  hackathonBrief's picks are identical to the base on all 140 ideas, or no
  build graded 2 leaves them.
- (c) Nonsense: on the fresh battery, the builds returned fall by at least
  half, and at least 12 of 24 queries return 0, in keyword and in hybrid.
- (d) Probe: `quantum llama sandwich` returns 0 in keyword mode.
- Everything lost and gained named. If no rule meets (a) to (d), an
  honesty-only meta note may ship instead, with (c) reported as not met.

### Log

- 2026-10-23 (lane L): `git fetch origin main && git switch -c
  lane/l-nonsense-queries origin/main`; HEAD 44407222 (spec 1.9.93).
  `pnpm install --frozen-lockfile --prefer-offline`: exit 0;
  `pnpm generate:importmap`: exit 0.
- Fresh battery `nonsense-fresh.frozen.json` (24 queries: 8 plain, 8 with one
  tech word, 8 with a Stellar or payments word; written by Claude Sonnet 5.5,
  told no rule; frozen 2026-10-23T02:09:22Z) copied unchanged, sha256
  `bcf55577f7671d057e5e140a82073715ac8315434992424b587dc294256dc60a`.
- `node improvements/audits/2026-10-23-nonsense-queries/capture.mjs
  <scratch>/fresh-live.json` started (2 s apart, read-only); its log prints
  progress only, and no fresh result was read before the rule below was
  fixed.
- Base replay of lane K's capture (1.9.91, 1,344 submissions, 140 ideas) with
  this tree's code (1.9.93): `replay.mts <live.json> base`. Parity with the
  1.9.91 live answers is lower than lane K's (keyword matched 127 of 140)
  because 1.9.93 matches packages on the builds route; before and after are
  both this tree's code on the same capture.
- Rule L, written once, before any fresh result was read
  (2026-10-23T02:15Z): a query concept is absent when none of its forms
  (plural or singular, synonyms, a hyphenated phrase spaced or joined)
  occurs as a whole word in any build's text (name, description, track,
  award) across the whole index, not the filtered pool. When more than half
  of the concepts are absent, a name match no longer admits a build alone;
  it needs half of the concepts like any other build. One threshold, "more
  than half", read from the lead's "most". In the shared scorer, so vetIdea,
  hackathonBrief and analyze get it too. A one- or two-concept query cannot
  change: half of it is one concept, which any match covers.
- Rule L on lane K's capture (`compare.mts`): grade-2 builds lost from the
  matched list, top 20 or top 5, any set, either mode: 0; grade 1: 0.
  vetIdea's five and the brief's picks differ from the base for 0 of 140
  ideas; the plain rankings for 1 (i31 "loyalty points issued as tokens":
  Stellar Health Point, graded 0, leaves keyword and hybrid; loyalty and
  issued occur in no build). Lane K's battery 20 -> 9 keyword, 21 -> 10
  hybrid (reported, not deciding). Probe 2 -> 0 in both modes.
- Fresh capture done: corpus 1,344, 25 queries (the 24 and the probe), 55
  pages, every one 200, every hybrid request served hybrid; apiVersion
  1.9.93 at 02:13:07Z and 1.9.93 at 02:15:48Z. Base replay against these
  live answers: matched count equal on 25 of 25 in both modes, keyword order
  25 of 25, hybrid order 21 of 25 (close-score swaps).
- Rule L on the fresh battery (`compare.mts`, base -> rule L): builds
  returned, keyword 538 -> 436 (down 19%), hybrid 683 -> 584 (down 14%);
  queries returning 0, keyword 9 -> 17, hybrid 9 -> 15. Probe 2 -> 0 in both
  modes. (c) is not met: the total does not fall by half. What remains is
  not name matches: 132 builds match only "pay" for "pay per yodel" (two
  concepts, so half is one word, which no rule of this kind can change),
  144 match "zero" and "knowledge" for "zero knowledge pogo stick" and 67
  "smart" and "contract" for "smart contract hamster wheel" (half of four
  concepts, admitted by the half rule, not a name).
- Decision: rule L meets (a), (b) and (d) but not (c), so it does not ship.
  No other rule is tried: any rule written now would be written after
  reading the fresh battery. Its diff and both comparisons are kept in
  `../audits/2026-10-23-nonsense-queries/rule-l/`. Fallback per the brief:
  an honesty-only change on the builds route that alters no row, a
  meta.warnings line when most of the query's concepts occur in no build as
  whole words, with (c) reported as not met.
- Honesty-only change: `wordsNoBuildUses` (the concepts of q no build in the
  index uses as a whole word, text or declared packages) and a builds-route
  meta.warnings line when they are more than half of q's concepts. The term
  building moved into `queryTerms`, shared with the scorer. A first draft
  fired whenever rows were listed; on i31 in hybrid mode it would have said
  that Loyal Local (graded 2, found by meaning) was not evidence. The line
  now fires only when a build is listed by its words alone (matchedTerms, no
  similarity), and says it covers only those.
- Tests first (`npx vitest run
  src/app/api/hackathons/builds/__tests__/route.test.ts -t "most of q matches
  no build"`), with the base `hackathon-builds.ts` and builds route: 2
  failed (`expected undefined to deeply equal [ Array(1) ]`; `.toMatch()
  expects to receive a string, but got undefined`), 2 passed (the silent
  cases). With the change: 11 of 11 in the file pass.
- Replay with the change against the base on both captures: identical, every
  field of every ranking (140 ideas: the builds route in both modes,
  vetIdea's five, the brief's picks, the prior-art rankings' hash; 25 fresh
  queries; lane K's extra queries).
- Where the line fires (`note.mts`): fresh battery 9 of the 15 queries that
  list builds, in keyword and hybrid; the probe; lane K's battery 6 of 7
  keyword and 6 of 8 hybrid; labeled ideas 1 of 140 (i31, whose only
  words-alone build, Stellar Health Point, is graded 0).
- Spec 1.9.94: the builds `q` text says a name holding one of q's words lists
  a build and a word of four letters or more matches inside a longer word;
  meta.warnings names the new line. Changelog entry. `pnpm contract:write`:
  exit 0.
- The battery file is committed as `nonsense-fresh.frozen.json.txt`, bytes
  unchanged (sha256 above): biome reformats `.json` and ignores `.txt`.

### Outcome (lane L)

- Rule L, the row-dropping rule, is not shipped: (a), (b) and (d) met, (c)
  not met (538 -> 436 keyword, 683 -> 584 hybrid; 17 and 15 of 24 at 0).
- Shipped on branch `lane/l-nonsense-queries` (committed, not pushed), spec
  1.9.94: the honesty-only meta.warnings line, no row changed. Against the
  criteria: (a) met, (b) met, (c) not met, (d) not met (the probe still lists
  2, now with the line).
- Not verified live: nothing is deployed from this lane.
- Evidence: `../audits/2026-10-23-nonsense-queries/README.md`.

### Lane L, second commit: compareHackathons counts as null (same spec, 1.9.94)

- Found live on 1.9.93 (orchestrator):
  `/api/hackathons/compare?slugs=stellar-hacks-zk,hackmeridian-2025` gives
  stellar-hacks-zk `submissionCount` 319, and the hackmeridian-2025 row has
  no such key, while deltas.notes calls the counts "absent, not zero".
- Cause: a listed event with no stored submissions and no curated event
  record gets no count from any source, and the route left the keys out.
  prizePoolUSD and hackersCount were left out for the same reason (the event
  listing publishes none, a 0 read as none, or the row comes from a curated
  event record, which carries neither), so they get the same treatment.
  stillActiveCount, liveCount and activeRatePct (curated only) and
  prizePerWinnerUSD (derived) are left out where they do not apply, a
  different reason, and are unchanged.
- Tests first (`npx vitest run
  src/app/api/hackathons/analyze/__tests__/route.test.ts -t "compare:
  curated events"`), base route: 1 failed (`submissionCount: expected {
  slug: 'hackmeridian-2025', ...(6) } to have property "submissionCount"
  with value null`, received undefined), 2 passed. With the change: 13 of 13
  in the file pass. The old assertion that the key is undefined was removed.
- Change: every row carries submissionCount, winnerCount, prizePoolUSD and
  hackersCount, null when no source gave the value; the deltas note now says
  "null, not zero". Spec: the row description says so, hackersCount and
  winnerCount gain descriptions of null, submissionCount's says null instead
  of absent. Skill reference (`public/skills/references/api-reference.md`):
  the compare paragraph said the keys are absent; it now says null.
  Changelog: a line in the 1.9.94 entry.
- Live baseline before deploy (read-only GET, apiVersion 1.9.93,
  2026-10-23T12:10:07Z):
  `/api/hackathons/compare?slugs=hackmeridian-2025,hackmeridian-2026`:
  hackmeridian-2025 has no submissionCount, winnerCount or prizePoolUSD key
  (hackersCount 400); hackmeridian-2026 has no submissionCount, winnerCount
  or hackersCount key (prizePoolUSD 30000); deltas.notes names both as
  absent, not zero.
- Live check to run after deploy: on the same URL, both rows carry
  submissionCount and winnerCount as keys, null for hackmeridian-2025.
  hackmeridian-2026 has no stored submissions today either, so it will
  also show null unless they are stored by then.

## Live verification of #1857 (orchestrator's check)

- 1.9.93 was live at 02:11:24Z on 2026-10-23.
- `/api/hackathons/builds?q=passkey&winnersOnly=1&mode=keyword` lists Tukar
  and "DeFi Quest - From Zero to DeFi in Minutes", each with matchedTerms
  passkey; it was empty on 1.9.92.
- meta.counts shows matched 2 and entries 2.
- vetIdea's priorArt.builds for "passkey wallet", "soroban sdk" and
  "stablecoin wallet for remittances" equals the 1.9.92 capture, id for id.

### Lane L review (Claude Fable 5.1, effort high, fresh context)

- GATE: fix. Verified: the term-building refactor is byte-identical, the
  trigger logic, the compare keys on every row, and that each test fails
  with its fix reverted. Four findings, all fixed in a fourth commit on top
  of the orchestrator's comment-only third commit (87be134e):
  1. Medium: the warning could say something false. Its whole-word test
     used the scorer's `\b`, ASCII-only and needing a word character beside
     the token, while the scorer admits a token of four or more letters by
     substring. `q=agents, payments` lists Agent Pay with matchedTerms
     ["agents,", "payments"] yet reported "agents," absent; "café" the same;
     `q=AI agents, payments, café` fired the line with both clauses false.
     Fix, in the warning path only: a form counts as used when it occurs
     with no letter or digit on either side (Unicode lookarounds), edge
     punctuation dropped. termMatcher is back to its base text; rankings
     do not change.
  2. Low: prizePoolUSD's description gains "(a 0 counts as none)": the
     listing's 0 pool is served as null.
  3. Low: the skill reference said an event with no stored submissions has
     null counts; a curated record serves directory counts, a real 0
     included. It now says "no stored submissions and no curated record".
  4. Low: for a one-word q the line said "1 of the 1 words ... matches only
     part of q". When every word is in no submission it now says "the word
     searched in q (...) ... holds it only inside a longer word", or "none
     of the <m> words ... holds them only inside longer words".
- Tests first, against 87be134e: `npx vitest run
  src/lib/__tests__/hackathon-builds.test.ts -t "words no build uses"`: 2
  failed (`expected { absent: [ 'agents,', 'café' ], ...(1) } to deeply
  equal { absent: [], concepts: 2 }`; `expected { absent: [ 'gents',
  'cafés' ], ...(1) } to deeply equal { absent: [ 'gents' ], concepts: 3
  }`). `npx vitest run src/app/api/hackathons/builds/__tests__/route.test.ts
  -t "most of q matches no build"`: 2 failed (`expected [ Array(1) ] to be
  undefined` for `AI agents, payments, café`; the one-word line received
  "1 of the 1 words searched in q (nread) ..."), 4 passed. With the fixes:
  58 of 58 in the two files pass.
- Replay with the fixes on lane K's capture (140 ideas) and the fresh
  capture: every ranking identical to the base; `note.mts` output identical
  to the committed `note-fresh.txt` and `note-labeled.txt`, so where the
  line fires did not change anywhere measured.
- Spec: prizePoolUSD clause; meta.warnings names the all-absent wordings.
  Changelog 1.9.94: the wordings and the whole-word rule.
- Re-check (same reviewer) of db1ff05d: GATE: push. Rankings cannot move,
  since termMatcher is byte-identical to base. Every earlier probe now
  reports nothing absent.
  - One low residual: a token with no letter or digit ("!!!") counted as a
    word and read as absent through its plural form, so q=`agents !!! ???`
    would warn about "2 of the 3 words".
  - Fixed by the orchestrator: wordsNoBuildUses drops such tokens before
    counting.
  - Test first: `wordsNoBuildUses(pool, "agents !!! ???")` gave absent
    ['!!!', '???'] on db1ff05d, and absent [] with 1 concept after the fix.
    The two touched test files pass (59).

## Lane L2: ship rule L, and widen the warning (spec 1.9.95)

### Scope and decision

- Owner decision, in chat: ship rule L, "don't ship it half-ass". Rule L
  missed criterion (c)'s volume bar (builds returned 538 -> 436 keyword and
  683 -> 584 hybrid on the fresh battery, against a required half). The
  owner's call overrides that bar and only that one; every other bar stands
  and was re-measured on the final code.
- Lane: Claude Opus 5.5, xhigh, own worktree, branch `lane/l2-rule-l` from
  main 02d7deba (1.9.94). Not pushed.
- Bars: (a) on 140 labeled ideas, keyword and hybrid, no build graded 2 or 1
  leaves the matched list, top 20 or top 5; (b) vetIdea's five and the
  brief's picks identical to base except drops of builds graded 0, each
  named; (c) the fresh battery's zero counts and builds, every removed
  build named; (d) the probe returns 0; (e) where the line fires on the 140
  ideas, each word checked; (f) adversarial probes.

### Log

- `git fetch origin main && git switch -c lane/l2-rule-l origin/main`: HEAD
  02d7deba.
- 13:08:08Z: `probes.json` written (34 probes: one word, product names,
  typos, accents and punctuation, two and five words, only "stellar",
  hyphenated phrases, package names) before any probe ran.
  `capture.mjs <out> probes.json`: 34 queries, 98 pages, every one 200,
  apiVersion 1.9.94 at 13:08:36Z and 1.9.94 at 13:12:50Z.
- Shared or builds route only: shared. Rule L in searchHackathonBuilds
  reaches vetIdea, hackathonBrief and analyze's q with no option, so
  meta.counts.entries, which re-runs the match, stays equal to analyze's
  total; a builds-route option would need passing to that re-run too (the
  #1856 merge found that class of bug).
- Tests first, against main's code:
  `npx vitest run src/lib/__tests__/hackathon-builds.test.ts -t "a name
  alone does not list a build"`: 1 failed (`expected [ 'Quantum Shield
  Exchange', ...(1) ] to deeply equal []`), 2 passed.
  `npx vitest run src/app/api/hackathons/builds/__tests__/route.test.ts -t
  "words are in no build"`: 4 failed (`tukar llama sandwich: expected 1 to
  be +0`; three warnings `expected undefined to deeply equal [ Array(1) ]`
  or `.toMatch() expects to receive a string, but got undefined`), 2 passed.
  Later, `-t "charity for charities"`: 1 failed (`expected { absent: [
  'charities', ...(3) ], ...(1) } to deeply equal { absent: [ 'rosca' ],
  concepts: 4 }`).
- Rule L: `namesAdmit` from `wordsNoBuildUses(indexed, query)`, absent * 2
  <= concepts; a name match admits only when it holds. The rest of the
  scorer is unchanged.
- First replay of the 140 ideas named 33 ideas for the warning, among them
  "charities" (charity is used), "family" (families is used) and "(rosca,";
  the probes named "soroban-sdk" and "@creit.tech/stellar-wallets-kit"
  unused, though 66% and 27% of read repos declare them. Fixed in
  wordsNoBuildUses only: every declared package counts, the plural or
  singular wordForms misses is read (ies and y, es), and a word is named
  without edge punctuation. Every number below is from the final code.
- (a) `compare.mts` on lane K's capture: nothing lost or gained, grade 2 or
  grade 1, at any depth, any set, either mode.
- (b) vetIdea's five 0 and the brief's picks 0 of 140 differ; the prior-art
  rankings differ for 1 (i31: Stellar Health Point, graded 0, leaves keyword
  and hybrid).
- (c) Fresh battery: keyword 538 -> 436 builds, 9 -> 17 queries at 0; hybrid
  683 -> 584, 9 -> 15; nothing added; every removed build named in
  `shipped/compare-fresh.txt`. Lane K's battery 20 -> 9 and 21 -> 10.
- (d) Probe 2 -> 0, keyword and hybrid.
- (e) The warning fires for 30 ideas in keyword mode and 29 in hybrid.
  `check-unused.py`, a separate Python search, finds each of the 37 named
  words in 0 submissions; for 12 a related form is used (cash for cashing,
  hedge for hedging, mint for minted).
- (f) 34 probes: rows change for 3 (paiement mobile sécurisé loses a build
  named for "mobile"; loyalty points for coffee shops loses two; the
  hyphenated zero-knowledge pogo stick loses four, three in hybrid); the
  warning fires for 10 in keyword mode and 9 in hybrid, each named word
  used by no submission. Product names and package names are used words
  and change nothing.
- Text: builds `q` and `meta.warnings` descriptions; changelog 1.9.95
  (says the owner chose to ship past the bar, with the numbers);
  api-reference.md; `pnpm contract:write`.

### Lane L2, second commit: three gaps the first left open (spec 1.9.95)

- Orchestrator, on the owner's "not half done": close three of the first
  commit's own open risks, rows unchanged, tests first. (1) Builds found by
  meaning had no caveat (blockchain sourdough starter, 99 in hybrid mode).
  (2) A word with a used related form (cashing, cash) could be over-read.
  (3) A query that listed nothing said nothing (remitance app).
- Tests first, against 499988e9: `npx vitest run
  src/lib/__tests__/hackathon-builds.test.ts -t "related forms"`: 2 failed
  (`unusedWordsWarning is not a function`); `npx vitest run
  src/app/api/hackathons/builds/__tests__/route.test.ts -t "words are in no
  build"`: 4 failed (three `expected undefined to deeply equal [ Array(1) ]`
  for the zero-row, meaning and spelling lines; the related-form line
  differed), 5 passed. The spelling-clarity tests were added with the
  frequency rule and fail on 499988e9 the same way.
- Change: `unusedWordsWarning` in `src/lib/hackathon-builds.ts` builds the
  one line; the route pushes it. It fires whenever any word of q is in no
  submission, whatever found the rows, and words the rows by kind (words,
  meaning, both, none); names related forms; when nothing is listed, asks
  to check the spelling.
- Two rules were narrowed after their first measurement, before shipping,
  both on what a claim may say, not on rows:
  - spelling: any word within two edits named summarise for submarine,
    royalty for loyalty, gambling for gargling and tempo for teapot. Now:
    one edit (a swap of adjacent letters counts as one), the same first
    letter, neither a prefix of the other, and no other such word used more
    than a fifth as often. Remittance for remitance is named (the corpus
    also holds remmitance once against remittance 9 times);
  - related forms: tractor named traction. Now a stem found by dropping er,
    or or ic takes back only inflections.
- Re-measured on the final code:
  - rows: every replay output identical to 499988e9's (lane K's capture, 140
    ideas; the fresh battery; the 34 probes);
  - the line fires for 32 of 140 ideas in keyword mode and 32 in hybrid (was
    30 and 29), 24 of 24 battery queries in both modes (was 7 and 7), 15 of
    15 on lane K's battery (was 1), and 16 of 34 probes in both modes (was
    10 and 9). Every line's text is in `shipped/note-*.txt`;
  - `check-unused.py`, rewritten to read back every claim in every line
    (each named word unused, each related form used, each spelling used and
    one edit away): 0 false on all three sets. Related forms named: 12
    ideas (cash, shopping, issue, back, mint, algorithms, cheap, generate,
    rent, hedge, delegation and their forms), 4 battery queries (start,
    flips, schedules, whisper), 1 probe (shopping). Spellings named: one,
    remittance for remitance.
- Text: the builds `q` and `meta.warnings` descriptions, the 1.9.95
  changelog entry and api-reference.md describe the line's forms, the
  related-form rule and the spelling rule.

### Lane L2 review (Claude Fable 5.1, effort high) and third commit (spec 1.9.96)

- The review replayed b63a697a on the live corpus (1,356 submissions):
  GATE: fix. Verified tsc, tests, contract, entries parity, multi-word
  product names, package queries and the meaning-row sentences. Findings:
  1. Medium: related forms named unrelated words (port portal, mill
     million, miner mineral, strip stripe, center cent, stalling stale,
     wither with).
  2. Medium: the zero-row tail read as a correction; a 2,410-word
     dictionary sweep named one for 70 words spelled right (gamer games,
     routine routing, discard discord, monkey money, thorough through,
     inventor investor, garantie garantir).
  3. Medium: rule L withheld real name matches silently (church tithe
     donations app: Donation Management; Sorobix IDE plugin: Stellar-IDE).
  4. Low: otherNumber read notes, modes, planes, themes, hopes, toes, does
     and uses as used through not, mod, plan, them, hop, to, do, us.
  5. Low: the spec's spelling clause omitted conditions; analyze's q text
     did not say a package-only word counts as used for rule L.
  6. Nit: the corpus was tokenized about three times per request.
- `update_pr_branch.sh <worktree> 1.9.96`: merged origin/main (925f47f9,
  #1859 took 1.9.95) at c776bb7a; changelog entry renumbered to 1.9.96.
- Tests first, against b63a697a's code: 7 failed (`withheldByName`
  missing twice; the zero-row wording; `notes: expected [] to deeply equal
  [ 'notes' ]`; `minter` named mint; `port` named a related form; the
  spelling wording), 70 passed. With the fixes all pass.
- Fixes: (1) the word itself grows only s, es, ed, ing; a stem from er or
  or grows e, es, ed, ing; an undone double grows no e; while measuring,
  themes named them, so es is stripped only after ss, x, z, ch or sh and a
  dropped e is not left off (theme is not them). center keeps centered, its
  past tense. (2) ", and no build is listed; if it is (one of them is)
  misspelled, correct it (X is the used word one edit from w)"; the naming
  rule unchanged. (3) searchHackathonBuilds fills an optional `withheld`
  list; queryBuilds returns those not listed by meaning; the line adds "N
  builds matched by name for W are not listed, because most of the words
  searched in q occur in no submission"; meta.counts.withheldByName
  (declared). (4) otherNumber as the review asked, with ss in place of s so
  uses is not us. (5) spec and analyze q text. (6) a WeakMap per index,
  with a ponytail comment.
- Re-measured: rows identical to b63a697a on lane K's capture, the fresh
  battery, the 34 probes, and the review's 23 examples captured live
  (1.9.95 to 1.9.95, 46 pages, every one 200). Where the line fires is
  unchanged; the examples fire 19 of 23. `check-unused.py` checks every
  word, related form, spelling and withheld count (against the builds the
  replays differ by): 0 false on all four sets.

### Renumbered at merge (2026-10-23)

#1862 (compact views) took 1.9.96 first, so `update_pr_branch.sh <worktree> 1.9.97` merged origin/main at eb9ef225 into this line (88d7160b) and the change ships as **spec 1.9.97**. The entries above keep the number they were written with.

### Lane L2 re-check of 5023b236 and fourth commit (spec 1.9.97)

- The re-check (same reviewer) confirmed the six fixes; GATE: fix first on
  four new findings. The orchestrator merged main (88d7160b, #1862 took
  1.9.96, renumbered to 1.9.97) and noted it (838e6706).
  1. Medium: a word's own inflection bypassed the bare-word fix: ports
     named portal and portion (83 rows), mills million, forming and formed
     formal, strips stripe, miners mineral and minerals; with no rows,
     milling and billed billion, porting and ported portal, planning
     planes.
  2. Low: in meaning mode the withheld clause fired for a build the mode
     never lists by name.
  3. Nit: "the used word" claimed one candidate; the rule allows a second
     used a fifth as often.
  4. Nit: "matched by name for llama" when llama was inside MellaMate.
- Tests first, against 838e6706: 7 failed (the nread line, the meaning-mode
  withheldByName, the spelling wording twice, `renting` named rental,
  `ports` named a related form, planning did not name plan alone), 72
  passed. With the fixes, 114 of 114 in the hackathon files.
- Fixes: (1) `growsFor`: a stem from s, ing, ed or est grows "", s, ed,
  ing, e only after ing or ed, es only after ss, x, z, ch or sh; the e, ic,
  er and or stems keep theirs. (2) queryBuilds passes no withheld list when
  meaning served. (3) "is a used word one edit from". (4) a withheld word
  is "by name for" when some held name holds it whole, else "inside a
  longer word for".
- Re-measured: rows identical to 5023b236 on lane K's capture, the fresh
  battery, the 34 probes and the 23 review examples. Related forms gone
  from those sets' lines: issues for issued, rental and rentals for
  renting. On the live corpus (keyword, `shipped/recheck-words.txt`) the
  re-check's words name only form, bill, bills, billing, plan and plans.
  `check-unused.py` checks every claim, now including each "inside a
  longer word": 0 false on all four sets.

### Lane L2 third re-check of a042c41d and fifth commit (spec 1.9.97)

- The re-check confirmed the four fixes (a 514-word inflection sweep found
  no wrong related form; meaning mode serves 0; the wording holds). GATE:
  fix first on one finding, plus one text error from the orchestrator:
  1. Medium: a word a held build matched only in its description or
     packages was called "inside a longer word": index {name Donation
     Management, description gifts tracker}, q=church tithe zakat donations
     tracker said "matched by name for donations, or inside a longer word
     for tracker".
  2. Text: the 1.9.97 changelog said es is dropped after s, x, z, ch or sh;
     the code uses ss. The code comment and the README said the same; the
     spec and api-reference.md did not.
- Test first, against a042c41d: the probe as a route test failed (received
  "... matched by name for donations, or inside a longer word for tracker,
  is not listed ..."). With the fix, 115 of 115 in the hackathon files.
- Fix: only a word that hits a held build's name at all (termMatcher, as
  the scorer matches) is classified, whole in a name by name, else inside a
  longer word; a word matched only outside the name is left out. The
  withheld count and withheldByName still count the build (1 in the test).
  Texts say ss.
- Re-measured: rows identical to a042c41d on all four sets, and every line
  text identical too. `check-unused.py` now also fails an inside claim
  unless some held name holds the word: 0 false claims on all four sets.
