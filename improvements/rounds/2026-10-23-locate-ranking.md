# 2026-10-23: locateSource ranking, natural questions to exact symbols

## Scope

A frozen priority battery of HackMeridian 2026 builder questions
(sha256 `9b4ee6be767ba63331e66917e8be979cc11d7712b1a1e761a03bf16b4dcf4745`)
scored locateSource's code lookups 0 of 6 strict on live 1.9.100. In every
miss the expected symbol ranks first when searched by its exact name, but
the natural question does not reach it. Five classes: joined identifiers
("token interface" for `TokenInterface`), vocabulary ("passkey" for
`secp256r1_verify`), granularity (`impl TokenInterface for Token` is not a
locator), a repo named in q only lifting results, and coverage
(OpenZeppelin/stellar-contracts is not indexed). Fix them with general
mechanisms, measured before shipping.

## Lanes

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| L3: locate ranking | Claude Opus 5.5, high | own worktree, branch `lane/l3-locate-ranking`: `src/lib/source-locator*.ts`, a synonym file beside them, their tests, the builder and harness scripts, the route only if needed, spec text, changelog, version, `improvements/audits/2026-10-23-locate-ranking/`, this ledger | commits on the branch, not pushed |

The orchestrator's independent review follows on a model other than the
author's. The orchestrator alone pushes, opens PRs and dispatches lanes.

## Method (fixed before any result was read)

Mechanisms to build, each general (no per-question rule):

1. Identifier candidates from q: runs of adjacent words joined into one
   identifier key (PascalCase, camelCase and snake_case all reduce to the
   same separator-blind key), scored on an exact or held match only, above
   word and path hits; an identifier typed in q (camelCase, PascalCase,
   snake_case) dominates plain words.
2. A short synonym map for crypto and auth terms, in one file, with a test
   per entry.
3. A repo named in q: a filter or a strong preference, chosen and argued
   in the audit README.
4. `impl Trait for Type` blocks in Rust files as symbol locators, locator
   text `impl <Trait> for <Type>` with generic arguments dropped. Creates
   only: no existing row may change key, terms, line or blob (proved by a
   dry diff of the old and new builds over the same tarballs).
5. OpenZeppelin/stellar-contracts in the allowlist with the same HEAD and
   ref behaviour as the others; its first fill is a hand-dispatched
   execute after its dry run is read.

Question sets:

- **Dev set**: 20 new questions written for this round across the nine
  repos (eight indexed plus OpenZeppelin), labels (repo, file, symbol) read
  from the public tarballs at the pinned refs below. 14 are tuned on
  (`dev-set.frozen.json`); 6, chosen by a fixed rule before any result
  (every id divisible by 3), are held out and run only at the end
  (`dev-heldout.frozen.json`). Found at k: a top-k pointer with the
  expected repo, one of the expected paths and one of the expected
  symbols (symbol level); file level reported beside it.
- **Regression**: `battery.frozen.json` and `fresh-battery.frozen.json`
  in `../audits/2026-10-23-source-locator/`, offline harness over the same
  tarballs, top 1, 3 and 10 before and after, at file level (their own
  criterion) and symbol level.
- **Check, not tuned on**: the priority battery's six code_lookup
  questions (hm26-sc-05, sc-06, sa-05, sa-06, cc-05, cc-06), graded by
  that battery's own rule for code items (a top-10 pointer at the
  expected repo and path whose locator names the symbol). They found the
  classes, so they are not held out.

Pinned refs: stellar-core `05c6328c13b5`, rs-soroban-sdk `8e5b425dce5f`,
rs-soroban-env `0c99950e9612`, js-stellar-sdk `0f2fd40ba6db`, stellar-rpc
`ec4171d970ac`, quickstart `0ff76e336a43`, stellar-cli `4ff88b7ea11d`,
soroban-examples `03d42aa6b973` (the live index's refs today), and
OpenZeppelin/stellar-contracts `ddc327eb92d6` (its HEAD today).

Bars, fixed here before any result:

1. Dev set (all 20, symbol level): top 10 improves by at least 5 cases
   over the base code on today's eight-repo index. The held-out six and
   the cases won only by the new repo are reported separately.
2. Neither frozen battery loses a top-10 hit, at file or symbol level.
3. Any synonym or joining rule that moves a frozen battery case down
   (its file rank worsens with the rule on, everything else equal) is
   dropped.

## Log

- 2026-10-23T17:57Z: ledger opened with the method and bars above, before
  the dev set was written or any ranking was run on it. Already known at
  this point: the live grades of the six priority questions (0 of 6
  strict, 2 of 12 required items met) and the published base results of
  the two frozen batteries (16/20/20 and 10/12/15 at top 1/3/10). The
  offline base reproduces both batteries and the six live top-10 lists
  exactly over the cached tarballs (their embedded commit ids match the
  refs above).
- 18:00Z: dev set written and frozen, labels checked against the built
  pointers at the pinned refs (every expected path holds at least one
  expected symbol today, except the four `impl ... for ...` locators,
  which this round adds), with no ranking run on it.
  `../audits/2026-10-23-locate-ranking/dev-set.frozen.json` (14 tuned)
  sha256 `d1f2189df6913e7a8424eeafe2cf176f2d7aa1f0ec17c73f67167d7236ebb2b9`;
  `dev-heldout.frozen.json` (6 held out: d03, d06, d09, d12, d15, d18)
  sha256 `364fa03fb3ed9d9151f6aa1212002fe01e807ab24373e2e614ea92a0eebc1082`
  (both after biome formatting, so the committed bytes are the hashed
  bytes).
