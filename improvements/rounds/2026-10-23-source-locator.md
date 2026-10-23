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
