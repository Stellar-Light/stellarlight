# 2026-10-23: a source-locator operation for agents

## Scope

Agents ask where a fact lives in Stellar's own code: a CLI flag, an RPC
option default, an SDK function, a contract interface. Scout has no answer
but explainRepo, which relays a third party's prose. An MCP server that
calls Scout wants scored, verifiable source pointers instead of content
(repo, pinned commit, path, file, symbol or heading locator, blob sha, a
reason it matched, a verification URL), and it named two measured misses:
the quickstart `start` script's `--enable-core-manual-close` default, and
the getTransactions limits in stellar-rpc `options.go`.

Build a read-only Scout operation that serves those pointers over an
allowlisted set of Stellar repos, an index builder lane that fills it, and
measure it on a frozen battery before shipping.

## Lanes

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| O: source locator | Claude Opus 5.5, xhigh | own worktree, branch `lane/o-source-locator`: the new collection, builder script, workflow, route, ranking lib and its tests, spec text, changelog, version, `improvements/audits/2026-10-23-source-locator/`, this ledger | a commit on the branch, not pushed |

The orchestrator's independent review follows on a model other than the
author's.

## Method (fixed before any result was read)

- Allowlist: stellar/stellar-core, stellar/rs-soroban-sdk,
  stellar/rs-soroban-env, stellar/js-stellar-sdk, stellar/stellar-rpc,
  stellar/quickstart, stellar/stellar-cli, stellar/soroban-examples.
- Frozen battery: 20 locator questions, `../audits/2026-10-23-source-locator/battery.frozen.json`,
  sha256 `c4eae9f59ea8a5f1a4fd6e726bd81e6d92cba7e40dcfed25d15592d1614a2a53`,
  frozen 2026-10-23T13:25Z, written before the builder or ranking existed.
  It includes both named misses (m1, m2). Each q is sent as is, with no
  repo or kind filter, over the index of all eight repos.
- Development set: 8 disjoint cases, `dev-set.json`, the only cases tuned on.
- Ship criteria: m1 and m2 found in the top 3, and at least 14 of 20 found
  in the top 10 (found = a top-k pointer names the expected repo and file).
  Otherwise stop and report.

## Log

- 2026-10-23T13:18Z: public tarballs (no token) fetched for all eight repos
  at their default-branch HEAD commits (listed in the battery file), read
  only to label the battery.
- 2026-10-23T13:25Z: battery frozen, then the dev set written.
- 13:36Z: `env -u GITHUB_TOKEN pnpm exec tsx scripts/build-source-locators.ts --no-db --out <scratch>`:
  exit 0, 8 repos, 21,437 pointers.
- 13:36Z to 13:40Z, dev set only (`scripts/source-locator-battery.ts --tarballs <scratch> --battery dev-set.json`):
  weighted sum 6/7/8 of 8 at top 1/3/10; a crash on the word `constructor`
  (the abbreviation table was an object literal, so it read
  Object.prototype) fixed with a Map; ranking by words matched first
  5/6/7, dropped; weighted sum with path words added and a "symbol holds
  the word" tier 8/8/8, kept. Go one-word option names added (inside an
  option table only): 21,440 pointers.
- 13:40Z: the gate run, once: `--battery battery.frozen.json`. top 1 13,
  top 3 18, top 10 19 of 20; m1 rank 2, m2 rank 8; misses outside the top
  3: m2, c09 (rank 12). **Criteria not met (m2 needed the top 3): stop.**
- 13:41Z: builder rerun with the final code, no token, no database, same
  HEAD commits: 21,440 pointers (`builder-dry-run.txt`). Battery rerun from
  those rows (`--rows`): identical ranks on all 20 cases
  (`battery-result.json`); dev set 8/8/8 (`dev-set-result.json`). Run a
  third time after biome reformatted the library: same 13/18/19.
- After the gate: m2's ranks 1 and 2 are rpcv2 `config/config.go`
  `DefaultGetTransactionsMaxItemsPerResponse` (200) and
  `...DefaultItemsPerResponse` (50), the same defaults for the rpcv2
  daemon, a file the frozen label does not list. Not relabelled. Ranks 3 to
  7 expose a defect: the holds tier also fires for a plain word that is a
  whole part of the name (`default` in `DefaultGetFeeStatsQueueLimit`).
  Not fixed or rerun: the battery has been read.
- Failing first: with the abbreviation table reverted to an object lookup,
  `object-prototype words are plain words` fails (`[Function Object]`
  for `constructor`); with the Map, 17 of 17 pass.

## Outcome

Stopped at the measurement gate; nothing shipped and nothing pushed. The
branch holds the extraction and ranking library with its tests, the index
builder (counts-only mode verified; its database modes need collections
that were not built), the offline battery harness, and the evidence in
`../audits/2026-10-23-source-locator/`.

Not built: the route, spec entry and routing text, the two Payload
collections, the workflow, the changelog entry and version bump, and a
Raven gate run on a new operation name.

Owner decision, safe default first:

1. Default: keep the gate failed and leave the operation unbuilt.
2. Or have an independent labeler rule on whether rpcv2
   `cmd/stellar-rpc/internal/rpcv2/config/config.go` answers m2. If it
   does, the criteria pass as measured (m2 rank 1), and the lane can build
   the operation; the holds-tier defect should then be fixed and measured
   on a fresh held-out battery, not on this one.

## Log, continued (second pass)

- 13:57Z: blind ruling on m2 (an independent judge, Claude Sonnet 5.5,
  high effort, saw no ranks, read both files at the pinned commit): rpcv1
  `config/options.go` YES, it defines `max-transactions-limit` (200) and
  `default-transactions-limit` (50) as operator options of the released
  rpcv1 daemon; rpcv2 `config/config.go` PARTIAL, the compiled defaults of
  the unreleased rpcv2 daemon, which operators override through TOML, not
  there. The frozen label stands and the first gate failed as fixed.
  Option 2 above is closed by this ruling.
- 13:57Z: orchestrator brief for this pass. Fix the holds-tier defect,
  designed on the dev set and the old battery only (the old battery is a
  dev set now: it has been read). A fresh held-out battery of 20 questions
  is written by a separate agent that has not seen the code; it is not
  read until the orchestrator says go, then it runs once. Ship criteria,
  fixed: m1 and m2 in the top 3 by their frozen labels; at least 14 of 20
  fresh questions found in the top 10 (a top-10 pointer with the expected
  repo and one of the full-answer paths); partial-path hits reported
  separately.
- 13:58Z, tests first: three new ranking tests fail on the old code (3
  failed, 17 passed): a plain word that is a whole part of a name scored
  as held (`prefix:1` for `default` in `DefaultGetFeeStatsQueueLimit`); a
  six-letter word inside a name it is not a part of outranked a word match
  (`network` in `networking`); between equal matches the longer name won
  on line order.
- 13:59Z, the fix in `scoreRow`: the held tier (5) only for a q word of
  several parts (`getEvents`); a single word held inside a name without
  being one of its parts scores as a word (3), never above one; and the
  share of the name's own parts that q accounts for adds up to 1. 20 of 20
  tests pass.
- 14:00Z, measured on the dev data only (the 8 dev cases and the 20 read
  battery cases, rows from the 13:41Z build):
  | variant | old battery top 1/3/10 | m1 | m2 (file, symbol) | dev top 1/3/10 |
  | --- | --- | --- | --- | --- |
  | first pass (gate run) | 13/18/19 | 2 | 8, 8 | 8/8/8 |
  | held tier fix only | 15/20/20 | 2 | 3, 10 | 8/8/8 |
  | fix and name share (kept) | 16/20/20 | 1 | 2, 4 | 8/8/8 |
  m2's margin is thin: rank 2 is `max-get-transactions-execution-duration`
  in the right file (total 12.6), ranks 3 to 6 tie at 12.5
  (`DefaultGetTransactionsDefaultItemsPerResponse` in rpcv2, then
  `max-transactions-limit` and `default-transactions-limit`); rank 1 stays
  rpcv2 `DefaultGetTransactionsMaxItemsPerResponse` (15.6). Saved as
  `pass2-old-battery-as-dev.json` and `pass2-dev-set.json`.
- Released versus unreleased code, considered and not built: rpcv2 is
  compiled into the default build and chosen at run time by
  `--enable-rpcv2` (off by default; `main.go` says so in a comment, and a
  build can hide the flag through ldflags). No build tag, cargo feature or
  path convention in the tree marks it, so telling it apart would take a
  rule for this one repo, which the brief rules out. Go build tags and
  non-default cargo features are generic signals, but neither applies to
  any battery case, so they were left out (no evidence either way).
- Harness: cases may list `partialPaths`; partial hits are reported
  (`partialRank`, `partialOnlyTop10`) and never counted as found.
- 14:05Z: fresh held-out battery frozen by a separate agent (Claude Opus
  5.5) that never saw the code or ranking:
  `../audits/2026-10-23-source-locator/fresh-battery.frozen.json`, copied
  unchanged, sha256
  `b051ae9ebed38ee6200406164a71741c128262ad8a2704484513f9a322637081`. Its
  pinned refs are the same eight commits as the first battery and the
  13:41Z build.
- 14:06Z: harness only adapted to its field names (`questions`,
  `headings`, `misleadingPaths`); ranking untouched since `9083b2fd`.
- 14:07Z: the fresh run, once, rows built from tarballs at the pinned
  refs (21,440 pointers): top 1 10, top 3 12, **top 10 15 of 20**; missed
  in the top 10: f01 (rank 40), f07 (none: `env.json`, a file type the
  index does not cover), f12 (13; a partial path at rank 1), f15 (25),
  f16 (36). Partial-only in the top 10: f12. Decoys in the top 10: none
  (f14 decoy at 148, f16 at 122). `fresh-battery-result.json`.
- Same rows, frozen labels: m1 rank 1, m2 rank 2 (`pass2-old-battery-as-dev.json`).
- **Criteria met** (m1 and m2 in the top 3; 15 of 20 fresh in the top
  10, needed 14): build the operation at spec 1.9.99.
- 14:08Z, tests first: `src/app/api/sources/locate/__tests__/route.test.ts`
  written before the route; it fails to resolve `../route`. Then the route,
  the collections (`src/collections/SourceLocators.ts`, registered in
  `payload.config.ts`, `payload-types.ts` regenerated: the two new types
  plus three stale descriptions the generator refreshed), the spec entry
  and `SourcePointer` schema, status endpoints, the 429 route list, the
  writer-conformance entry, the workflow, version 1.9.99 and the changelog.
  9 of 9 route tests pass.
- Raven gate, `locateSource`: ACCEPT, but one gain was a false capture: a
  docs question on Instance storage went to locateSource top 1, admitted by
  the example question "Where is the Map type defined in soroban-sdk?".
  That example was dropped; rerun ACCEPT 1.9.99 at 220/298/326/112, 0
  hit-to-miss, the 2 gains the base spec already had, locateSource top 1
  on no gate question (in 5 more top-5 lists).
- `pnpm contract:check` first failed the enum-literal ratchet (100 against
  98): matchMode and totalBasis were literals. Both now spread
  `LOCATE_MATCH_MODES` and `LOCATE_TOTAL_BASES`, the collection spreads
  `LOCATOR_KINDS`, and `spec-enum-parity.test.ts` pins all five enums.
  Then exit 0.
- Routing observed on the Scout-only replica (not a gate): locateSource
  top 1 for 10 of 28 dev questions, top 3 for 22; fresh questions top 1
  for 0, top 3 for 4. Topic words are never in the operation's text, so the
  coverage gate admits it mostly for short, intent-worded questions. Not
  tuned on the fresh battery.
- 14:24Z, checks: `tsc --noEmit -p tsconfig.json` 0; scripts type
  ratchet 0 (no new errors, 28 known); `vitest run src/lib/__tests__
  src/app/api src/collections/__tests__` 0 (182 files, 2294 tests);
  `pnpm contract:write` 0; `CONTRACT_BASE=02d7deba pnpm contract:check` 0;
  writer conformance 0; Raven gate ACCEPT 1.9.99; biome: no errors on the
  changed files (warnings only on untouched lines of `payload.config.ts`
  and the generated `payload-types.ts`); no en or em dash and no named
  product in added lines; both frozen battery hashes unchanged. Committed
  as `011b9c76`.

## Outcome (second pass)

Built and committed on `lane/o-source-locator`, not pushed: the
locateSource operation (route, spec 1.9.99 with routing text, two
collections, the builder lane and its workflow, changelog). The index is
empty in production until its lane runs: every answer is pointers null
with a note until then. To fill it, after merge: dispatch
`build-source-locators.yml` dry, read the plan (about 21,440 creates),
dispatch it with execute=true on its own (the Idempotence step must plan
0), then read pointers back through `/api/sources/locate`. The daily
schedule maintains it after that first fill.

Open: the builder's database modes have not run against a database (no
local Mongo; the driver calls are covered only by the route test's mock);
m2 passes by a thin margin; JSON files (env.json) have no locator rule;
routing reaches the operation mostly for short, intent-worded questions.

## Log, continued (review fixes)

- The orchestrator merged origin/main into the branch as `9949c58b` (one
  conflict, a generated comment in `payload-types.ts`, main's text kept)
  and renumbered it to spec 1.9.98. It ships as 1.9.98: the 1.9.99 in the
  lines above is the number it carried before the renumber.
- Provenance of the fresh run: the fresh battery's sha256
  (`b051ae9e...`) was fixed in the orchestrator's brief before the run;
  the ranking fix `9083b2fd` was committed at 14:00:47Z, before the battery
  was frozen (14:05:01Z) and before the run; the battery file and its
  result landed together in `f4843849` (14:07:39Z).
- Independent review verdict: GATE, fix first (re-run battery identical,
  15/20). Fixes, tests first (failing outputs, then green):
  1. Data safety in the builder. A tarball yielding no indexable file
     (an empty archive, entries outside a top directory) is treated as
     unreadable: no write, the state row kept, exit 1. A plan deleting
     more than max(50, half the stored pointers) is refused the same way
     unless `--allow-shrink`, which the schedule never passes; the
     workflow gains an `allow_shrink` input, default false.
     `src/lib/__tests__/build-source-locators.test.ts` drives the script
     against in-memory models and a stubbed fetch (adapted from the
     reviewer's scenarios): before the fix, the empty-tar, flat-tar and
     shrink cases failed (exit 0 with the deletes carried out).
  2. `--scheduled` checks a state row per repo, not one for any repo; a
     repo without its own stays dry. Same test file: failed first.
  3. The route reads only `repo, ref, path, locatorKind, locator, line,
     blobSha` (an inclusion projection from `RANK_FIELDS`), never `key` or
     `terms`; ranking now types rows as `RankRow`. Route test pins the
     projection: failed first (it saw the exclusion projection).
  4. `repo` text recommends only what the enum allows (owner/name) in the
     spec, the 400 hint and the changelog; the route still resolves a bare
     name but no longer advertises it. Enum parity unchanged.
  5. `page` accepts digits only, 1 to 2000 (the candidate cap over the
     page size); anything else answers 400 with `validRange`. Route test
     covers 1e2, 0x2, +1, " 1", 1.5, 2001, empty and a 20-digit value:
     failed first (1e2 answered 200).
  6. README version text: 1.9.98.
- 14:55Z, checks: `tsc --noEmit -p tsconfig.json` 0; scripts type ratchet
  0 (no new errors, 28 known); `vitest run src/lib/__tests__ src/app/api
  src/collections/__tests__` 0 (193 files, 2432 tests); `pnpm
  contract:write` 0; `CONTRACT_BASE=origin/main pnpm contract:check` 0
  (base resolved to `eb9ef225`); writer conformance 0; biome clean on the
  changed files; Raven gate ACCEPT 1.9.98 at 220/298/326/112, 0
  hit-to-miss, full output in `../audits/2026-10-23-source-locator/raven-gate.txt`
  (local paths replaced by placeholders). Committed as `1208c63b`.
- Re-check of `1208c63b`: GATE push, with five LOW findings, closed on top
  of it, tests first (7 tests failed before the change, all pass after):
  1. The workflow gains a `repo` input (default empty), forwarded as
     `--repo` so an allowed shrink covers exactly the repo whose plan was
     read; the Idempotence step replans the same repo. The schedule
     forwards neither.
  2. `--allow-shrink` is forwarded only on an execute dispatch, so a dry
     plan always shows its refusals. Both steps now read the event and
     inputs through env and build the argument list in bash, so a repo
     value is one argument, never shell. Tested by running the workflow's
     own run scripts with bash and a stand-in pnpm that prints its
     arguments (schedule, dry with allow_shrink, execute with
     allow_shrink and repo, a repo value holding `; echo pwned`).
  3. The spec's page maximum and its "1 to 2000" texts now come from
     `LOCATE_MAX_PAGE` (`CANDIDATE_CAP / LOCATE_PAGE_SIZE`), shared with the
     route; the parity test pins the schema and both texts to it. The
     served spec JSON is byte-identical, so the routing text did not change
     and the Raven gate was not rerun.
  4. The builder's summary says `replan: writes=N` only under `--replan`
     (refused plans included, so the Idempotence check still fails on any
     difference); every other mode prints `writes planned: N`, without the
     refused repos, and names them (`refused, nothing written: <repo> (<n>
     planned)`). Tested on the shrink refusal (0 planned, 122 refused), a
     first fill, and a replan after a stored row drifted (exit 1, `replan:
     writes=1`).
  5. A comment beside the shrink cap: below 100 stored rows the floor of 50
     is the cap; none of the eight is under 410 rows.
- 15:12Z, checks: `tsc --noEmit -p tsconfig.json` 0; scripts type ratchet
  0; `vitest run src/lib/__tests__ src/app/api src/collections/__tests__`
  0 (193 files, 2438 tests); `pnpm contract:write` 0 (no snapshot change);
  `CONTRACT_BASE=origin/main pnpm contract:check` 0; writer conformance 0;
  biome clean on the changed files.

## Renumbered at merge (2026-10-23)

#1864 (rerank) took 1.9.98 first, so main (0735c116) was merged in again and this lane ships as **spec 1.9.99**. The Raven gate was re-run on the merged tree: ACCEPT 1.9.99, legacy totals 220/298/326/112, 2 questions moved (0 hit to miss), and `raven-gate.txt` now holds that run. The entries above keep the number they were written with.
