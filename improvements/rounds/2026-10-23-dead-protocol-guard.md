# 2026-10-23: a dead upstream protocol must not read as plainly Live

## Scope

`GET /api/projects/search?q=allbridge` serves Allbridge as `status: Live`,
`statusBasis: human-verified` (2026-09-05), `statusConfidence` 0.9 high, with
a description built on Allbridge Core. The same row already stores
`tvlUSD: 0` from DefiLlama slug `allbridge-core`, zero events on both
tracked contracts in the latest window, and `lastActivityAt` 2026-07-06.
`GET /api/verify?type=live&subject=allbridge` answers `supported`, 0.9 high.
Public sources: Allbridge Core was exploited for about $1.65M on
2026-07-19 and paused; its liquidity pools were discontinued in July 2026;
DefiLlama marks `allbridge-core` deprecated with `deadFrom` 2026-08-31;
Allbridge's current app, Allbridge Next, carries a Stellar network.

Question: what guard in the code that decides status confidence keeps a
row whose linked upstream protocol is dead from reading as plainly Live,
without flagging live products, and what is the class's real size?

## Lanes

| lane | author, model and effort | write set | output |
| --- | --- | --- | --- |
| DQ1: dead-protocol guard | agent, Claude Opus 5.5, effort high | own worktree, branch `lane/dq1-dead-protocol-guard` off origin/main: a status guard lib and its tests, the projects search and verify routes, the Projects collection, `scripts/enrich-tvl.ts` and its workflow, `scripts/data/enrich-onchain-projects.ts`, `scripts/data/curation-maps.ts` and `curate-projects.ts` (Allbridge, and the Core routes copied onto Estrela), spec, changelog, version, the skill reference doc, the lane registry in improvements/lanes (write sets, one intervention entry), `improvements/audits/2026-10-23-dead-protocol-guard/`, this ledger, TODO | one commit on the branch, not pushed |

The lane runs nothing that writes production and opens no database
connection. Reads: the public Scout API, DefiLlama's public API,
stellar.expert's public API, the operator's public pages.

## Method and ship criteria (fixed before any guard result)

Written before the guard existed and before any replay or sweep result.

Captures (read-only, recorded with the API version at start and end):
the full public corpus through `/api/projects/search?status=<s>` for the
four public statuses, `https://api.llama.fi/protocols`, and the 30 query
pages below, GETs at least 1.5 s apart.

Lane-simulated data: the guard reads facts the enrich lanes store. Until
the lanes run the new code, the stored DefiLlama listing state is absent on
every row (could not check). The sweep therefore runs twice: (A) on the
corpus as stored, and (B) with the listing state the enrich-tvl lane would
write from the captured DefiLlama list under today's mapping. (C) repeats
B after the Allbridge row fix (mapping repointed).

Ship criteria:

1. True positives. The guard caveats Allbridge in B. Every row the guard
   caveats in B is hand-checked against DefiLlama and the project's own
   site: all of them if fewer than 10, else a sample of 10 chosen by sorted
   slug before reading the evidence. Pass: every checked caveat rests on
   true evidence (the linked slug is deprecated or dead on DefiLlama, or
   TVL 0 with 60 or more days of observed contract silence).
2. No false positives. (a) The 20 highest-prominence Live rows other than
   Allbridge (ties broken by slug) carry no caveat in B and C. (b) Every
   Live row with a DefiLlama link other than Allbridge carries no caveat
   in B and C unless its evidence is true by the hand check in 1. Any
   caveat on a product the evidence shows live stops the lane; no tuning.
3. Rows without a DefiLlama link are unchanged: the real GET handler of
   `/api/projects/search` on origin/main and on this branch, over the same
   captured rows as documents with the clock pinned, for the 30 queries
   below. Pass: every served row without `llamaSlugs` is byte-identical
   (its JSON), and every page with no linked row is byte-identical as a
   whole body. Linked rows: every changed key is reported.
4. Trinary: a failed or missing read never yields a caveat. Pinned by
   tests: no listing stored, a slug not found on DefiLlama, a TVL that is
   null, contracts never measured, and silence observed for under 60 days
   are each "could not check", never a caveat.

The 30 queries (fixed now): allbridge, bridge, cross-chain bridge, solana
to stellar bridge, lending, dex, amm, yield, stablecoin, wallet, anchor,
payments, remittance, oracle, rwa, tokenized treasury, nft, explorer, sdk,
soroswap, blend, aquarius, lobstr, freighter, etherfuse, mexico on-ramp,
passkey smart wallet, ai agent payments, highest tvl, defi protocol.

## Log

- 2026-10-23 (DQ1): `git fetch origin && git switch -c
  lane/dq1-dead-protocol-guard origin/main` at e94ef292; the session moved
  to a fresh worktree after an API rate-limit stop, where the branch was
  reset to origin/main 724f4e6a (`git switch -C`, no commits lost: the
  branch had none).
- Read-only verification of the miss on live 1.9.101 (18:03Z): the
  Allbridge row and the verify answer above; `https://api.llama.fi/protocols`
  (8,807 protocols, 18:04Z): `allbridge-core` deprecated true, deadFrom
  2026-08-31, tvl null; `allbridge-next` listed 2026-09-11, category Bridge
  Aggregator, no chains, tvl null; `allbridge-classic` listed. Of the 44
  protocols listing Stellar, `allbridge-core` is the only deprecated or
  dead one.
- Captures (read-only): the full public corpus through
  `/api/projects/search?status=<s>&limit=100&offset=<n>`, 1,005 rows (848
  Live, 8 Pre-Release, 49 Development, 100 Inactive), apiVersion 1.9.101 at
  20:31:35Z and 20:32:06Z, 15 GETs 1.5 s apart (sha256 1e0c0182).
  `capture.mjs`: the 30 query pages, 1.9.101 at 20:59:01Z and 21:00:28Z
  (sha256 408895b7). DefiLlama `/protocol/allbridge-core` (Stellar series:
  $468,724 on 2026-07-19, $470 on 07-21, $0 from 08-21, last point 09-03).
  docs-core.allbridge.io, docs.allbridge.io, allbridge.io, the Next app
  bundle (read as text), The Block 2026-07-19, Estrela's SCF page. Captures
  stay in the lane's scratch directory.
- Instrument check before use: stellar.expert's
  `contract/<id>/events?order=desc` returns the newest event of the oldest
  yearly partition (Blend's Fixed V2 pool: 2025-12-31 while its stored
  counter moved by 7,599 events in the week to 2026-10-20), so event
  timestamps are not a last-activity reading. The TVL rule therefore reads
  only stored counter deltas, and enrich-onchain now carries how long they
  have been zero (`onchain.quietSince`).
- Tests first (`failing-first.txt`): against the base sources, 4 files
  failed, 3 tests failed and 40 passed (status-checks.test.ts could not load
  its module). With the fix: 76 of 76.
- Implementation: `src/lib/status-checks.ts` (the checks; `llamaListingOf`,
  `stellarTvlOf`, `tvlFieldsFor` for enrich-tvl; `quietSinceFor` for
  enrich-onchain); the three search row builders and verifyClaim's live
  verdict call `statusChecksFor`; the semantic projection reads
  `llamaListing`; a lineage swap drops the shadow's checks. Collection:
  `llamaListing` group and `onchain.quietSince`; `pnpm generate:types` with a
  dead local database URI, then biome format (20 added lines). enrich-tvl:
  listing from the full list, a floor of 1,000 protocols, null instead of 0
  for a TVL DefiLlama serves as null, a figure stored under slugs the map no
  longer names is cleared, allbridge mapped to allbridge-next, read-back of
  `llamaListing`; its workflow gains a dry-run dispatch (scheduled runs still
  execute). curate: the Allbridge description, Allbridge and Estrela routes
  emptied. Spec 1.9.108: `statusChecks`, `statusCaveat`, statusConfidence and
  tvlUSD notes, verify evidence kind `status-check`.
- Sweep (`pnpm exec tsx .../sweep.mts`, `sweep.json`): 18 linked rows, 1
  hit, 1 caveated (allbridge); flagship 20 caveated 0; TVL-0 rows allbridge
  (Live, 6 days of silence on record) and fxdao (Inactive, no contract).
- Replay (`replay.test.ts`, base a `git archive` export of 724f4e6a with
  this tree's node_modules; `compare.mjs`, `replay-results.json`): 514 rows
  served over 30 queries; in A, B and C, 467 of 467 unlinked rows and 10 of
  10 pages with no linked row byte-identical; base A and B bodies identical.
  In B only allbridge changes statusConfidence (0.9 to 0.45) and carries a
  caveat; in C it is clear with no caveat.
- Criteria: 1 pass (1 of 1 caveated row hand-checked true; a class of 1),
  2 pass, 3 pass, 4 pass (tests).
- Checks on the final tree: `pnpm exec tsc --noEmit -p tsconfig.json` exit 0;
  `pnpm exec tsx scripts/check-scripts-types.ts` GREEN (28 baselined);
  `npx vitest run src/lib/ src/components/ src/app/ src/collections/
  src/data/ --maxWorkers=4 --minWorkers=1` 216 files, 2,704 tests passed;
  `pnpm contract:write` then `CONTRACT_BASE=origin/main pnpm contract:check`
  exit 0 (routing-surface-check OK, longest description 600); `pnpm
  raven:gate --raven <stellar-raven checkout>` ACCEPT 1.9.108, exit 0 (2
  questions moved, both gains, 0 hit to miss; the base export of 724f4e6a
  gives the same 2 gains and totals, so this change moves no question);
  biome on the 26 changed code files: no errors, 11 warnings, the same 11
  the base files carry; `pnpm exec tsx scripts/check-writer-conformance.ts`
  all writers conform.

- 2026-10-23 17:16 (DQ1): the resumed session's worktree was shared by
  mistake with lane PL, which ran `git switch -C lane/pl-prize-labels
  origin/main` in it at 16:27:20, 17 s after this lane's own switch; this
  lane's edits were therefore committed under that branch name. Repaired on
  the coordinator's instruction, touching no other lane's work: `git branch
  -f lane/dq1-dead-protocol-guard <commit>`, then `git branch -M
  lane/pl-prize-labels lane/dq1-dead-protocol-guard` (both names held the
  same commit). PL works on its own branch `lane/pl-prize-labels-b`, which
  was not touched. A `git reset --hard` of the PL-named branch was tried
  first, refused by the permission system, and never ran. The commit was
  then amended to add this line.

## Owner steps (not run by the lane)

All after merge and deploy; each lane also runs on its own schedule
(enrich-tvl Monday 05:00 UTC, enrich-onchain Tuesday 06:00 UTC,
curate-projects Tuesday 07:30 UTC), so dispatch the dry runs before those
times to read a plan before the first execute. Before merge, the existing
workflows can be dry-run on the pushed branch with `--ref
lane/dq1-dead-protocol-guard`.

1. `gh workflow run enrich-tvl.yml --ref main -f execute=false`. Read the
   log: allbridge "mapping moved (allbridge-core → allbridge-next) and the
   new slugs carry no Stellar row, so tvlUSD ← null (was 0); listing listed";
   soroswap and sentora "no Stellar llama row resolved ...: TVL left as
   stored; listing not-found"; every other mapped row "listing listed"; no
   row "deprecated". Then `gh workflow run enrich-tvl.yml --ref main -f
   execute=true` and read "✓ all N row(s) hold the values written (tvlUSD,
   tvlAsOf, llamaSlugs, tvlSource, tvlMethod, llamaListing)".
2. `gh workflow run curate-projects.yml --ref main -f execute=false`. Read:
   the allbridge description old and new, "allbridge: routes ← 0 row(s)",
   "estrela: routes ← 0 row(s)". Then `-f execute=true`; its Idempotence step
   must report 0 writes planned.
3. enrich-onchain needs no dispatch; optional dry run `gh workflow run
   enrich-onchain.yml --ref main -f execute=false` shows "(contracts quiet
   since 2026-10-13)" on allbridge.
4. Read back through the live API: `/api/projects/search?q=allbridge`
   (description begins "Allbridge is a cross-chain bridge provider",
   `llamaSlugs` [allbridge-next], `tvlUSD` null, `routes` null,
   `statusChecks` defillama-listing clear, `statusCaveat` null);
   `/api/projects/search?q=highest tvl` (every linked row carries
   `statusChecks`, no non-null `statusCaveat`, soroswap and sentora
   could-not-check); `/api/projects/search?q=estrela` (`routes` null);
   `/api/verify?type=live&subject=allbridge` (supported, no caveat once the
   mapping moved).

After the repoint no live row carries a caveat: the caveat path is proven by
the tests and by replay scenario B, and fires live only when a mapped
protocol is deprecated or dead.

## Outcome

- Committed on branch `lane/dq1-dead-protocol-guard`, not pushed; spec
  1.9.108 (placeholder). Data effect after the owner steps: Allbridge reads
  Live via Allbridge Next with the dated exploit line, no Core TVL and no
  Core routes; Estrela loses the copied Core routes; every DefiLlama-linked
  row serves its checks.
- Not verified live: nothing is deployed, no lane has run the new code.
- Moved to `improvements/TODO.md`: Now item 11 (this fix until its live
  re-check), and Next items for the stale and unmatched LLAMA_MAP slugs
  (soroswap, sentora, phoenix-protocol, normal-stellar-amm, whalehub),
  Estrela, the Allbridge Core SDK advice in the skill, compact rows without
  the caveat, the TVL rule's 60-day wait, the guard's 18-row reach, and the
  enrich-onchain read-back; an owner decision on Allbridge's 2026-09-05
  stamp.
- Review: not reviewed yet. Points a reviewer should break: the halving
  rule, the 60-day observed-silence rule and its `quietSince` carry, the
  repoint clearing in `tvlFieldsFor`, the lineage-swap strip, and whether
  Allbridge Next truly serves Stellar (the evidence is the app bundle and the
  operator's posts, not a transfer).

## Review and fix

- Review of e73109bf (independent, reported by the coordinator): GATE: fix
  first. It reproduced tsc, the 2,704 tests, the contract, the Raven gate,
  writer conformance, the scripts types, the replay (467 of 467) and the
  sweep against today's DefiLlama list, and found:
  1. MEDIUM: `deprecated === true` alone was a hit, while DefiLlama also
     retires superseded listings (909 deprecated rows, 63 with TVL above 0,
     one $2.9B, 118 with a live sibling by parentProtocol); one dead slug
     plus one missing slug read deprecated.
  2. MEDIUM: the Allbridge description ("its current app, Allbridge Next",
     "moving its products to Next") contradicted the operator's pages:
     docs.allbridge.io calls Core "our current bridge", allbridge.io presents
     Next as new, and Stellar on Next rested on a wallet adapter in the app
     bundle.
  3. MEDIUM: SUPPORTED_NETWORKS (exact-sync) still held Core's matrix for
     allbridge and estrela, sourced to the pool API this branch declares
     ended.
  4. LOW: a one-run upstream gap (a live row with tvl null) wrote tvlUSD
     null.
  5. LOW: the TVL rule read tvlUSD whatever its tvlAsOf, so a frozen 0 could
     hit.
  6. LOW: onchain.quietSince had no read-back.
  7. Compact rows without the caveat: stays in TODO.
- 2026-10-23 17:45 (DQ1): the session's primary directory moved again, to a
  worktree holding lane R4's branch `lane/r4-repos-ranking` with 4 unpushed
  commits; it was not touched. The fixes were made in the worktree that
  holds `lane/dq1-dead-protocol-guard` (`.claude/worktrees/agent-a6d44a355da768cdd`,
  untouched by anyone since the amend at 17:21:19 by its reflog).
- Tests first (`failing-first.txt`, second section), against e73109bf: 7
  failed, 35 passed. With the fixes: 42 of 42 in that file.
- Fixes:
  1. `llamaListingOf`: a slug is dead only with a deadFrom date, or when
     deprecated with nothing locked (tvl 0 or null) and no live listing in
     its parentProtocol family. New states: superseded (all retired, one not
     dead) and partial (retired slugs plus a missing one), both
     could-not-check. This is stricter than the review's wording (deadFrom,
     or tvl 0/null, or no live sibling): with OR, a deprecated row holding
     $35M and no family would still hit, which the review's own test rules
     out. On today's list: 843 deprecated rows dead, 66 superseded, including
     all 63 that hold value.
  2. Description reworded clause by clause to the operator's pages (read
     again on 2026-10-23 after the review): Core exploited on 2026-07-19 (about $1.65M, The Block),
     pools discontinued in July 2026, the relaunched Core routes through CCTP
     and LayerZero OFT, Stellar support unavailable pending audit of the
     Stellar CCTP implementation, and Allbridge Next a newer bridge, with no
     claim that Next serves Stellar.
  3. SUPPORTED_NETWORKS `allbridge: []` and `estrela: []`: exact-sync clears
     the curated matrix, so allbridge serves derived networks (basis
     onchain-activity, its Stellar contracts) and estrela derived networks
     (basis scf-award); neither claims a curated list. With Solana gone from
     Allbridge's networks, the chain-corridor rule moves it from rank 1 to
     rank 19 of 20 for "solana to stellar bridge" in replay C, so the golden
     case `bridge-solana-to-stellar` drops "allbridge" from its expectation
     with a dated note, and `scripts/eval/eval-baselines.json` is
     re-baselined (`update-eval-baselines.ts`; `lint-eval-banks.ts` clean).
  4. `tvlFieldsFor`: a sum is written only when every live row carries a
     figure; a retired row without one counts as none (upstream stopped
     computing it); a live row without one leaves the stored figure under
     the same slugs, and is cleared only when the mapping moved.
  5. TVL rule: a TVL reading older than 14 days (TVL_FRESH_DAYS) is
     could-not-check, for 0 and for above 0.
  6. enrich-onchain reads back `asOf` and `quietSince` after each project
     write (diffWritten) and exits 1 on a mismatch.
- Re-measure on today's data: corpus re-pulled on 1.9.102 (21:51:42Z to
  21:52:15Z, 1,005 rows, sha256 c4d8d1cc); DefiLlama /protocols at 21:51:25Z
  (8,813 protocols, sha256 54f8ddc7). Sweep: 18 linked rows, 1 hit, 1
  caveated (allbridge, 0.9 to 0.45); flagship 20: 0 caveated; soroswap and
  sentora could-not-check (slugs missing upstream). Replay (base export
  724f4e6a and this tree, the 30 captured pages, today's list): in A, B and
  C, 467 of 467 unlinked rows and 10 of 10 pages with no linked row
  byte-identical; base A and B bodies identical.
- Checks on the final tree: `pnpm exec tsc --noEmit -p tsconfig.json` exit
  0; `pnpm exec tsx scripts/check-scripts-types.ts` GREEN (28 baselined);
  `npx vitest run src/lib/ src/components/ src/app/ src/collections/
  src/data/ --maxWorkers=4 --minWorkers=1` 216 files, 2,713 tests passed;
  `pnpm contract:write`, then `CONTRACT_BASE=origin/main pnpm
  contract:check` exit 0; `pnpm raven:gate` ACCEPT 1.9.108, exit 0 (the same
  2 gains and totals as the base); biome on the 28 changed code files: no
  errors, the same 11 warnings the base carries; writer conformance: all
  writers conform.

## Owner steps (supersede the section above)

Unchanged in order and timing; what the dry runs should show changed:

1. `gh workflow run enrich-tvl.yml --ref main -f execute=false`. Read:
   allbridge "mapping moved (allbridge-core → allbridge-next) and the new
   slugs carry no Stellar TVL figure, so tvlUSD ← null (was 0); listing
   listed"; soroswap and sentora "no Stellar llama row resolved ...: TVL
   left as stored; listing not-found"; every other mapped row "listing
   listed"; no row "deprecated", "superseded" or "partial"; any "came back
   without a TVL figure (a one-run gap upstream)" line means that row keeps
   its stored figure. Then `-f execute=true` and read "✓ all N row(s) hold
   the values written (tvlUSD, tvlAsOf, llamaSlugs, tvlSource, tvlMethod,
   llamaListing)".
2. `gh workflow run curate-projects.yml --ref main -f execute=false`. Read:
   the allbridge description old and new (new begins "Allbridge is a
   cross-chain bridge provider. Its stablecoin bridge, Allbridge Core");
   "allbridge: [stellar, evm, solana, tron, sui] → []" and the same for
   estrela under the networks section; "allbridge: routes ← 0 row(s)" and
   "estrela: routes ← 0 row(s)". Then `-f execute=true`; the Idempotence
   step must report 0 writes planned.
3. enrich-onchain: no dispatch needed; a dry run (`-f execute=false`) shows
   "(contracts quiet since 2026-10-13)" on allbridge; an execute must end
   without "RED: ... did not read back as sent".
4. Read back through the live API: `/api/projects/search?q=allbridge`
   (the new description, `llamaSlugs` [allbridge-next], `tvlUSD` null,
   `routes` null, `supportedNetworks` [stellar] with `networksBasis`
   onchain-activity, `statusChecks` defillama-listing clear, `statusCaveat`
   null); `/api/projects/search?q=estrela` (`routes` null,
   `supportedNetworks` [stellar] with `networksBasis` scf-award);
   `/api/projects/search?q=highest tvl` (every linked row carries
   `statusChecks`, no non-null `statusCaveat`); `/api/verify?type=live&subject=allbridge`
   (supported, no caveat once the mapping moved); and the golden case
   `bridge-solana-to-stellar` in the next nightly-health run.

## Outcome (after review)

- Committed on `lane/dq1-dead-protocol-guard` on top of e73109bf, not
  pushed; spec 1.9.108 (placeholder). Allbridge reads Live with a
  description limited to what the operator's pages say, no Core TVL, routes
  or network matrix; estrela loses the copied Core routes and matrix.
- Not verified live. TODO keeps Estrela's identity and status, the research
  golden `bridge-evm-to-stellar` (it still expects Allbridge as a current
  EVM to Stellar route), the skill's Allbridge Core SDK advice, compact rows
  and the other leads above.

## Merge (2026-10-23)

- main merged in (cb6c4d63, spec 1.9.104 there); this change is spec
  1.9.105, renumbered from the 1.9.108 placeholder. Checks on the merged
  tree: tsc exit 0; contract:write no diff; contract:check exit 0; Raven
  gate ACCEPT 1.9.105. vitest (src/lib, src/components, the projects and
  verify routes) failed one test, the eval fingerprint pin: the wording
  commit c91ac844 edited golden-questions.json without re-baselining its
  hash. Re-baselined with update-eval-baselines.ts (5f017a8a); the pin
  passes.

