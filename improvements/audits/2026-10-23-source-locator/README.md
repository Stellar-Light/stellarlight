# Source locator: measured before shipping (2026-10-23)

**Verdict: stopped at the ship gate.** The fixed criteria were both named
misses in the top 3 and at least 14 of 20 cases in the top 10. 19 of 20 are
in the top 10, and m1 is at rank 2, but m2 is at rank 8. The operation
(route, spec, collections, workflow) was not built; see "Not built" below.

## What was measured

A locator index over eight allowlisted Stellar repos and the ranking a
`locateSource` operation would serve, run offline with the same code the
route would run (`src/lib/source-locator.ts`: parseQuery, candidateTerms,
isCandidate, rankRows). Pointers hold a repo, the commit read, a path, a
file, symbol or heading locator, the line, the git blob sha and match
terms. No file body is stored anywhere, in the rows or in these files.

- `battery.frozen.json`: 20 questions, sha256
  `c4eae9f59ea8a5f1a4fd6e726bd81e6d92cba7e40dcfed25d15592d1614a2a53`,
  frozen 2026-10-23T13:25Z, before the builder or the ranking existed.
  Labels (expected repo, files, symbols) were read from the repos at the
  commits it lists. Each q is sent as is, with no repo or kind filter.
- `dev-set.json`: 8 disjoint cases, the only ones tuned on.
- `battery-result.json`, `dev-set-result.json`: per case, the rank of the
  first pointer at the expected file and at an expected symbol, the
  candidate count, and the top 3 pointers (names only).
- `builder-dry-run.txt`: the builder's counts, run with no token and no
  database (2026-10-23T13:41Z; the same HEAD commits as the battery refs).

The battery ran once as the gate (2026-10-23T13:40Z) and once more to
confirm the documented reproduction path (rows from the builder's `--out`
instead of local tarballs): identical ranks on all 20 cases.

## Index size (public tarballs at HEAD, 2026-10-23)

| repo | commit | files indexed | pointers | file | symbol | heading | JSON |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| stellar/stellar-core | 05c6328c13b5 | 658 | 7,228 | 658 | 6,219 | 351 | 2.93 MiB |
| stellar/rs-soroban-sdk | 8e5b425dce5f | 66 | 874 | 66 | 797 | 11 | 0.29 MiB |
| stellar/rs-soroban-env | 0c99950e9612 | 257 | 3,091 | 257 | 2,818 | 16 | 1.20 MiB |
| stellar/js-stellar-sdk | 0f2fd40ba6db | 253 | 3,789 | 253 | 1,551 | 1,985 | 1.38 MiB |
| stellar/stellar-rpc | ec4171d970ac | 263 | 3,258 | 263 | 2,766 | 229 | 1.26 MiB |
| stellar/quickstart | 0ff76e336a43 | 31 | 410 | 31 | 342 | 37 | 0.14 MiB |
| stellar/stellar-cli | 4ff88b7ea11d | 251 | 1,977 | 251 | 1,484 | 242 | 0.70 MiB |
| stellar/soroban-examples | 03d42aa6b973 | 92 | 813 | 92 | 482 | 239 | 0.28 MiB |
| **total** | | **1,871** | **21,440** | 1,871 | 16,459 | 3,110 | 8.18 MiB |

A full build takes about 10 seconds and 45 MB of tarballs. Tests, vendored
and generated trees, changelogs and files over 512 KB are skipped.

## Result on the frozen battery

| | found | of 20 |
| --- | ---: | ---: |
| top 1 | 13 | |
| top 3 | 18 | misses: m2 (rank 8), c09 (rank 12) |
| top 10 | 19 | miss: c09 (rank 12) |
| expected symbol in top 10 | 19 | |

| id | class | expected | file rank | symbol rank | rank 1 served |
| --- | --- | --- | ---: | ---: | --- |
| m1 | named miss: code-level fact the docs omit | quickstart `start` | 2 | 2 | quickstart `common/core/bin/start` (file) |
| m2 | named miss: operator-configurable default | stellar-rpc `cmd/stellar-rpc/internal/rpcv1/config/options.go` | 8 | 8 | stellar-rpc `cmd/stellar-rpc/internal/rpcv2/config/config.go` `DefaultGetTransactionsMaxItemsPerResponse` |
| c03 | SDK function | rs-soroban-sdk `soroban-sdk/src/storage.rs` | 1 | 3 | rs-soroban-sdk `soroban-sdk/src/storage.rs` `Storage` |
| c04 | SDK function | rs-soroban-sdk `soroban-sdk/src/address.rs` | 1 | 2 | rs-soroban-sdk `soroban-sdk/src/address.rs` `Address` |
| c05 | contract interface | rs-soroban-sdk `soroban-sdk/src/token.rs` | 1 | 1 | rs-soroban-sdk `soroban-sdk/src/token.rs` `TokenInterface` |
| c06 | SDK function | js-stellar-sdk `src/rpc/server.ts` | 1 | 2 | js-stellar-sdk `src/rpc/server.ts` `RpcServer` |
| c07 | SDK function | js-stellar-sdk `src/rpc/transaction.ts` | 1 | 1 | js-stellar-sdk `src/rpc/transaction.ts` `assembleTransaction` |
| c08 | SDK function | js-stellar-sdk `src/contract/assembled_transaction.ts` | 2 | 3 | js-stellar-sdk `src/contract/client.ts` `Client` |
| c09 | heading | stellar-core `docs/software/commands.md` | 12 | 12 | stellar-core `src/main/QueryServer.h` `QueryServer` |
| c10 | RPC option | stellar-rpc `cmd/stellar-rpc/internal/rpcv1/config/options.go` | 1 | 1 | the expected option, `history-retention-window` |
| c11 | RPC method | stellar-rpc `cmd/stellar-rpc/internal/methods/simulate_transaction.go` | 1 | 1 | the expected `NewSimulateTransactionHandler` |
| c12 | heading | quickstart `README.md` | 1 | 1 | the expected heading, `Ephemeral mode` |
| c13 | CLI flag | stellar-cli `cmd/soroban-cli/src/config/network.rs` | 1 | 1 | the expected `--rpc-url` |
| c14 | CLI flag | stellar-cli `cmd/soroban-cli/src/commands/contract/deploy/wasm.rs` | 2 | 2 | rs-soroban-env `soroban-test-wasms/src/lib.rs` `DEPLOYER_TEST_CONTRACT` |
| c15 | CLI flag | quickstart `start` | 1 | 1 | quickstart `start` `LIMITS` |
| c16 | contract interface | soroban-examples `token/src/contract.rs` | 1 | 2 | soroban-examples `token/src/contract.rs` `Token` |
| c17 | contract interface | soroban-examples `atomic_swap/src/lib.rs` | 1 | 3 | soroban-examples `atomic_swap/src/lib.rs` `AtomicSwapContract` |
| c18 | core function | stellar-core `src/transactions/TransactionUtils.cpp` | 3 | 3 | stellar-core `src/herder/Upgrades.cpp` `getOfferAccountMinBalances` |
| c19 | operator config default | stellar-core `src/main/Config.cpp` or `docs/stellar-core_example.cfg` | 2 | 2 | stellar-core `src/main/Config.h` `DEFAULT_PEER_PORT` |
| c20 | host function | rs-soroban-env `soroban-env-host/src/host.rs` | 1 | 2 | rs-soroban-env `soroban-env-host/src/host.rs` `Host` |

### The misses, named

- **m2 (rank 8, needed top 3).** Ranks 1 and 2 are
  `cmd/stellar-rpc/internal/rpcv2/config/config.go`
  `DefaultGetTransactionsMaxItemsPerResponse` (200, line 467) and
  `DefaultGetTransactionsDefaultItemsPerResponse` (50, line 468): the same
  getTransactions defaults, for the rpcv2 full-history daemon the repo now
  carries. The frozen label lists only the rpcv1 `options.go` named in the
  consumer's design note, where `default-transactions-limit` is at rank 8
  and `max-transactions-limit` below rank 12. The label was not changed: a
  label is fixed before results are read. If an independent labeler
  accepts the rpcv2 file, m2 is found at rank 1 and both criteria pass (m1
  rank 2, m2 rank 1, 19 of 20 in the top 10). That call is the owner's,
  not the author's.
- **A ranking defect the m2 list shows (found after the gate run, not
  fixed).** Ranks 3 to 7 are other rpcv2 `Default*` constants
  (`DefaultGetFeeStatsQueueLimit` and four more). The "symbol holds the
  word" tier (5) was meant for an identifier inside a longer name
  (`getEvents` in `NewGetEventsHandler`), but it also fires for a plain
  word of six letters or more that is already a whole part of the name,
  so `default` scores 5 there instead of the word score 3. Restricting that
  tier to multi-part q words is the candidate fix; it needs a fresh
  held-out set, since this battery has now been read.
- **c09 (rank 12).** "HTTP Query Server" is a heading in
  `docs/software/commands.md`; the `QueryServer` class and its methods in
  `src/main/QueryServer.{h,cpp}` match the same words as symbols and rank
  above it.
- Top-3 hits not at rank 1: m1 (rank 1 is another file named `start`,
  `common/core/bin/start`; rank 2 is `start` line 47
  `ENABLE_CORE_MANUAL_CLOSE`), c08, c14, c18 (rank 1 a longer symbol holding
  the same words, `getOfferAccountMinBalances`), c19 (rank 1
  `DEFAULT_PEER_PORT` in `Config.h`, which is the default's value).

## Ranking (fixed before the gate run)

Each word of q scores by its best match against a pointer: the whole symbol
or file name 8, a symbol holding the word (six letters or more) 5, words
inside a symbol or heading 3 times the share of the word's parts found;
words of the path or repo name add 1 times that share. A repo named in q
(by name or alias, for example `stellar-rpc`, `stellar CLI`, `soroban-sdk`)
adds 3 to its pointers. Ties: symbols and headings before files, then the
shorter path, the repo, the line. Plural endings are folded and a few code
abbreviations map both ways (max, min, config, auth, init, env, tx).

Tuned on the dev set only: a variant that ranked by the number of q words
matched first scored 5 of 8 at top 1 (a path word lifted weak matches
over exact names: d1, d5, d7) against 8 of 8 for the weighted sum, so it was
dropped before the gate run.

## Storage plan (not built)

Two Payload collections on the existing Mongo cluster, the research-docs
pattern: `source-locators` (one row per pointer, unique `key`, a multikey
index on `terms`) and `source-locator-repos` (per repo: the indexed commit,
build time, counts; the basis for `verifiedAt` and for telling "not indexed"
(null) apart from "no match" ([])). Cost: 21,440 rows, 8.2 MiB as JSON,
about 98,000 term index entries (4.6 terms a row), an estimated 15 MB
with indexes (not measured on the cluster); a query
reads its candidates by term (37 to 4,124 rows for these 28 questions) and
ranks them in memory. Writes happen only for new, gone or changed-blob
pointers, so an unchanged HEAD plans 0. A committed JSON artifact was the
alternative; it was not chosen because bot data commits do not deploy here,
so the served index would lag every refresh.

## Not built (stopped at the gate)

The route (`/api/sources/locate`), the spec entry and its routing text,
the two collections and their Payload registration, the scheduled and
dispatchable workflow, the writer-conformance entry, the changelog entry
and version bump, and the Raven gate run on a new operation name.

## Reproduce

```bash
pnpm exec tsx scripts/build-source-locators.ts --no-db --out rows.json
pnpm exec tsx scripts/source-locator-battery.ts --rows rows.json \
  --battery improvements/audits/2026-10-23-source-locator/battery.frozen.json
```

HEAD moves; the battery's refs pin the measured commits. To score those
exact commits, download the tarballs at the listed refs as
`owner_repo.tar.gz` and pass `--tarballs <dir>` instead of `--rows`.
