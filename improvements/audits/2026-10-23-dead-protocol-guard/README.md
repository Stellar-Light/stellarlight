# A dead upstream protocol must not read as plainly Live (spec 1.9.105)

Lane DQ1, 2026-10-23. Round ledger:
`improvements/rounds/2026-10-23-dead-protocol-guard.md` (criteria written
there before any result).

## The miss (live 1.9.101, read-only, 2026-10-23 18:03Z)

`GET /api/projects/search?q=allbridge` served Allbridge as `status: Live`,
`statusBasis: human-verified` (2026-09-05), `statusConfidence` 0.9 high, with
a description built on Allbridge Core. The same row stored `tvlUSD: 0`
(DefiLlama slug `allbridge-core`, tvlAsOf 2026-10-19), `eventsDelta` 0 on
both tracked contracts (window 2026-10-13 to 2026-10-20) and
`lastActivityAt` 2026-07-06. `GET /api/verify?type=live&subject=allbridge`
answered `supported`, 0.9 high. The 2026-09-05 stamp rested on a 200 page
and a push to the SDK repo.

## Public evidence (read 2026-10-23)

- DefiLlama `/protocols` (8,807 protocols, sha256 07a2eeac):
  `allbridge-core` deprecated, deadFrom 2026-08-31, tvl null, still lists
  Stellar; `allbridge-next` listed 2026-09-11, category Bridge Aggregator, no
  chains, tvl null; `allbridge-classic` listed. Of the 44 protocols that list
  Stellar, `allbridge-core` is the only deprecated or dead one.
- DefiLlama `/protocol/allbridge-core`, Stellar series: $468,724 on
  2026-07-19, $470 on 2026-07-21, $215 from 2026-08-03, $0 from 2026-08-21,
  last point 2026-09-03. Core on Stellar held $0 when the row was stamped
  human-verified.
- The Block, 2026-07-19: Core exploited for about $1.65M and paused;
  Allbridge said Core and Classic would stop in their current form within
  three months as it moves fully to Allbridge Next, and that Next was
  operating normally.
- docs-core.allbridge.io: Core's liquidity pools were discontinued in July
  2026; the relaunched Core routes through CCTP, xReserve and OFT, and Stellar
  support is unavailable on it while its Stellar CCTP version awaits audit.
- docs.allbridge.io: Allbridge Classic is deprecated and stops in November
  2026.
- next.allbridge.io (app bundle, read as text, not run): a Stellar network
  (Horizon, Freighter wallet) beside EVM wallets, Solana, TRON and TON.
  allbridge.io itself still leads with Core and links Next ("8 chains").

## The guard

`src/lib/status-checks.ts`, one function (`statusChecksFor`) called by every
search row builder (keyword, semantic, lineage swap) and by verifyClaim's live
verdict. Two checks, each read from facts the enrich lanes store:

| check | hit | clear | could-not-check |
| --- | --- | --- | --- |
| defillama-listing | DefiLlama marks every linked slug dead: a deadFrom date, or deprecated with nothing locked and no live listing in its parentProtocol family | a linked slug is listed as active | no listing stored yet; a slug missing from the list (a rename or removal); a dead slug beside a missing one; a deprecated slug that looks superseded (no deadFrom while value is locked or a family listing is live) |
| tvl-zero-onchain-quiet (DEX, Lending, Bridge, Yield rows only) | a DefiLlama TVL of 0 read in the last 14 days, and no tracked contract moved for 60+ days of observed time | a fresh TVL above 0, or a contract moved in the latest window | no TVL figure, a TVL reading older than 14 days, no tracked contract, contracts not measured, or under 60 days observed |

A hit on a Live row adds `statusCaveat` (one sentence) and halves
`statusConfidence`; the status never moves (a dead listing can mean the
product moved, as here). `statusChecks` and `statusCaveat` appear only on rows
with a DefiLlama link, so every other row is served byte for byte as before.

Deprecated alone is not a death. DefiLlama also retires listings a successor
replaced: on 2026-10-23 it listed 909 deprecated protocols, 63 of them still
holding value (one $2.9B) and 118 with a live sibling under the same
parentProtocol. Under the rule above, 843 read as dead and 66 as superseded,
including all 63 that hold value (none of which carries a deadFrom).

The facts: enrich-tvl writes `llamaListing` (state listed, deprecated,
superseded, partial or not-found; deadFrom; checkedAt) from the full
`/protocols` list, refuses a list under 1,000 protocols, writes null rather
than 0 for a retired protocol whose TVL DefiLlama serves as null, and keeps
the last good figure when a live row comes back without one; enrich-onchain
writes `onchain.quietSince` (start of the run of readings with no contract
movement, carried across runs) and reads it back. Until those lanes run the new
code, every listing check reads could-not-check, and the TVL rule needs 60
days of readings before it can speak.

## Results

Captures: the full public corpus, first on 1.9.101 (20:31:35Z to 20:32:06Z,
sha256 1e0c0182) and again after review on 1.9.102 (21:51:42Z to 21:52:15Z,
sha256 c4d8d1cc), 1,005 rows each time (848 Live, 8 Pre-Release, 49
Development, 100 Inactive); DefiLlama `/protocols` at 18:04Z (8,807
protocols) and after review at 21:51Z (8,813, sha256 54f8ddc7); the 30 query
pages on 1.9.101 (20:59:01Z to 21:00:28Z, sha256 408895b7). Captures stay in
the lane's scratch directory; `capture.mjs` and the commands below reproduce
them. The numbers below are the post-review run.

Criterion 1, true positives. Sweep (`sweep.mts`, output `sweep.json`) with
the listing the enrich-tvl lane would write under today's mapping: 18 rows
have a DefiLlama link; 1 has a hit and is caveated, Allbridge
(defillama-listing hit; its TVL check could-not-check, 6 days of observed
silence). Hand check of that 1 of 1: DefiLlama marks allbridge-core
deprecated, deadFrom 2026-08-31, and its Stellar TVL reads $0 from
2026-08-21; the operator's docs say Core's pools were discontinued in July
2026 and Stellar is unavailable on the relaunched Core. True. The TVL rule
hits no row: the only TVL-0 rows are Allbridge (Live) and FxDAO (Inactive, no
tracked contract). Pass, on a class of 1.

Criterion 2, no false positives. (a) None of the 20 highest-prominence Live
rows other than Allbridge is caveated (3 of them are linked: blend, soroswap,
aquarius). (b) None of the 15 other Live linked rows is caveated in B or C.
Soroswap and Sentora read could-not-check: their mapped slugs are missing
from DefiLlama's list. Pass.

Criterion 3, rows without a DefiLlama link unchanged. Replay
(`replay.test.ts`, the real GET handler; `compare.mjs`, output
`replay-results.json`), base origin/main 724f4e6a against this change, same
rows, pinned clock: 514 rows served over the 30 queries; in each of the
scenarios A, B and C, all 467 rows without a link are byte-identical and all
10 pages with no linked row are byte-identical as whole bodies; the base
gives identical bodies for A and B (it never reads the listing). Linked rows
gain `statusChecks` and `statusCaveat`; only Allbridge in B changes
`statusConfidence` (0.9 to 0.45). Pass.

Criterion 4, trinary: `src/lib/__tests__/status-checks.test.ts` pins each
could-not-check path (no listing, slug not found, a dead slug beside a
missing one, a superseded slug including the review's Live DEX with $35M
locked, null TVL, a TVL reading older than 14 days, no contracts, contracts
not measured, 59 days of silence) and the one-run TVL gap. Tests failed
first, on the base and again for the review fixes (`failing-first.txt`).

After the Allbridge fix (scenario C: mapping allbridge-next, tvlUSD null,
the curated description, routes and networks cleared), Allbridge's listing
check is clear, its TVL check could-not-check, no caveat, statusConfidence
0.9. For "solana to stellar bridge" it moves from rank 1 to rank 19 of 20
(the chain-corridor rule, now that its networks no longer claim Solana); the
top 5 are axelar, circle-cctp, rozo, usdc-swap and rubic, so the golden case
`bridge-solana-to-stellar` drops its "allbridge" expectation (re-baselined in
`scripts/eval/eval-baselines.json`).

## The class beyond the guard

The guard sees only DefiLlama-linked rows. The same dead product reaches the
API elsewhere:

- `estrela` (Live, basis repo-activity) carried Allbridge Core's bridge routes
  and network matrix, copied in curate-projects on the belief that Estrela is
  Core; its SCF page (#22 and #35) describes Allbridge's Soroban stablecoin
  AMM. This change clears both, so its networks serve the derived basis
  (scf-award) instead of a curated claim; its identity and status are left
  for review.
- The served skill recommends the Allbridge Core SDK for EVM to Stellar USDC
  (`src/lib/stellar-scout-skill.ts`; `src/lib/integrations/curated-skills.ts`
  slug allbridge-sdk), while Core on Stellar is unavailable.
- Mapped slugs `soroswap` and `sentora` are missing from DefiLlama's list:
  their TVL freezes (Sentora since 2026-08-10) and the listing check cannot
  read them.
- Three LLAMA_MAP keys match no public row (`phoenix-protocol`,
  `normal-stellar-amm`, `whalehub`), so `phoenix` and `normal` carry no
  DefiLlama link. `normal` is Live while DefiLlama reads its TVL as $0 and
  its own stellar.toml marks all ten currencies dead (read 2026-10-23); the
  guard cannot see it. Linking it would not caveat it today either: no
  contract of it is tracked, so its TVL check could not be checked, and an
  operator's toml verdict is a signal the guard does not read.
- lendwise, for-yield and wowmax name Allbridge in their own pitches; mentions,
  no action.

## Files

- `README.md` (this file), `failing-first.txt`.
- `capture.mjs`: the 30 query pages, read-only.
- `sweep.mts` and `sweep.json`: the full-corpus sweep.
- `replay.test.ts`, `vitest.replay.config.mts`, `compare.mjs`,
  `replay-results.json`: the base against lane replay.

Re-run (corpus from `/api/projects/search?status=<s>&limit=100&offset=<n>`,
protocols from `https://api.llama.fi/protocols`):

    node improvements/audits/2026-10-23-dead-protocol-guard/capture.mjs <dir>/capture-30.json
    pnpm exec tsx improvements/audits/2026-10-23-dead-protocol-guard/sweep.mts <corpus.json> <protocols.json> <out.json>
    REPLAY_CAPTURE=<dir>/capture-30.json REPLAY_SCENARIO=B REPLAY_PROTOCOLS=<protocols.json> \
      REPLAY_OUT=<dir>/replay-lane-B.json npx vitest run \
      --config improvements/audits/2026-10-23-dead-protocol-guard/vitest.replay.config.mts
    (same in a `git archive origin/main` export for replay-base-*.json)
    node improvements/audits/2026-10-23-dead-protocol-guard/compare.mjs <dir> <results.json>

Not verified live: nothing here is deployed, and no lane has run the new code.
