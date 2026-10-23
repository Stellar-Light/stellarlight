# Build search matching: nonsense matches and declared packages

Evidence for `improvements/rounds/2026-10-23-build-matching.md`.

**Verdict: one of two shipped.** Declared packages are now searchable
(candidate S10): `q=passkey&winnersOnly=1` lists Tukar and DeFi Quest, where
it listed none, and no build graded the same idea leaves the matched list or
the top 20 on any labeled set, in keyword or hybrid mode. Nonsense matches
are not fixed: every candidate that reduced the frozen nonsense battery's
builds also dropped builds graded the same idea, so none shipped. The labels
are drafts, pending owner review.

## Method (fixed before any result was read)

- **Nonsense battery.** `nonsense.frozen.json`: 15 multi-word queries, written
  and frozen at 2026-10-23T01:13:05Z before any query ran; sha256 of the
  frozen bytes `de52ce94d47f404c1ebe7f215530646f0687c323a5a612e73d2ccb411c53ec83`.
  The committed file is the same JSON reformatted by biome (whitespace only,
  sha256 `df390788b49abc561a7149b8b8285ac5548e95e85a3ce59e2b5635832eadae80`).
  Counted, never tuned on. All 15 are three or four words; the battery
  probe `quantum llama sandwich` is reported apart.
- **Labeled sets.** The 40 ideas (`labels.json`, split into 27 working and 13
  held out as that round split them), 36 short and 34 test ideas (their
  window grades) of `../2026-10-22-prior-art-precision/`, and the 30 fresh
  ideas of `../2026-10-22-words-need-meaning/` (`grades.json`, the stricter
  of its two labelers; it holds no build graded 2, so the fresh set checks
  only grade 1).
- **Capture.** `capture.mjs`: read-only GETs to https://www.stellarlight.xyz,
  1.2 s apart, 429 and 503 Retry-After honored. Every stored submission in
  browse mode (1,344, with its declared `stack`; 1,013 repos read), per idea
  the whole hybrid ranking (1 to 349 rows, none cut short) and the first
  keyword page with its matched count, and per extra query (the battery, the
  probe, `passkey` with and without winnersOnly) both whole rankings. Every
  request answered 200 and every idea was served hybrid. `/api/status`
  apiVersion **1.9.91 at the start (01:14:29Z) and 1.9.91 at the end
  (01:24:27Z)**, 2026-10-23 (`capture.txt`). The raw capture (14 MB, with
  upstream descriptions) is not committed.
- **Replay.** `replay.mts` turns the browse rows into stored rows
  (`indexedFromStored`, so the haystack is built the way the store's index
  builds it) and runs this tree's `searchHackathonBuilds` over all 1,344,
  with each idea's live meaning scores as the meaning map. Run once on the
  base and once per candidate.
- **Parity of the base replay with live.** Keyword: order and matched count
  equal on 140 of 140 ideas. Hybrid: matched count equal on 140 of 140; the
  order is equal on 57, the top-5 set on 132 and the top-20 set on 123. The
  differences are swaps between rows whose blended scores are close, as the
  API rounds similarity to three decimals (for example Tukar and AnchorVault
  for "cross-border remittance app cashing out through local anchors",
  ranks 2 and 3). Before and after share the same meaning map, so the
  comparison is not affected.
- **Metric.** Per labeled idea, the builds graded 2 found anywhere in the
  matched list, in the top 20 and in the top 5, before and after, keyword
  and hybrid (`compare.mts`). Ship criteria: on every labeled set no grade-2
  build leaves the matched list or the top 20; the battery returns fewer
  builds; `q=passkey&winnersOnly=1` returns Tukar; everything lost or gained
  named. A fix for one problem that passes ships alone.

## Candidates

| candidate | change | grade-2 losses (matched or top 20) | battery builds, keyword / hybrid | probe | passkey winners |
| --- | --- | --- | --- | --- | --- |
| base | | | 20 / 21 | 2 | 0 |
| K1 | a name match no longer admits a build alone; half the query's words for every build | 14 | 1 / 2 | 0 | 0 |
| K2 | a name match must start at a word start of the name, camelCase and punctuation split | 2 | 20 / 21 | 1 | 0 |
| K12 | K1 and K2 | 15 | 1 / 2 | 0 | 0 |
| W | a term of four or five letters must start a word anywhere | 1 | 20 / 21 | 1 | 0 |
| K1W | K1 and W | 15 | 1 / 2 | 0 | 0 |
| S | declared packages matched, except libraries over a fifth of read repos | 1 | 20 / 21 | 2 | 2 |
| K1S | K1 and S | 15 | 1 / 2 | 0 | 2 |
| **S10** | declared packages matched, except libraries over a tenth of read repos | **0** | 20 / 21 | 2 | **2** |

Every candidate's diff against the base is in `candidates/<name>.diff` and
its full comparison, every build lost or gained by name, in
`candidates/compare-<name>.txt`; S10 is the shipped code, compared in
`compare-after.txt`.

- **K1** drops 8 builds graded the same idea from keyword matches, all on
  working ideas: Stellar-MCP, StellarSwap MCP Server and Stellar MCP ("MCP
  server that lets AI agents use Stellar"), Nexus ("multisig wallet for team
  treasuries"), zkprediction and Prophecy Predictive Market ("prediction
  market on Soroban"), DeegaGames ZK and Autonomous x402 Research Agent; in
  hybrid mode Stellar-MCP and StellarSwap MCP Server leave the top 20. Each
  is admitted today only by its name holding the idea's key word. The
  battery's base hits are all of that kind: a real word at a word start of a
  name (Insurance, Lottery, Ledger, Exchange, Travel, Orchestra, Cosmic), so
  only K1 moves the battery, and K1 is what loses recall.
- **K2** removes MellaMate from the probe but nothing from the battery, and
  drops zkprediction (a lowercase compound: "prediction" starts no word) and
  moves x402 Stellar MCP from 20th to 21st; it gains StellarMCP for the MCP
  idea ("mcp" becomes a whole word once camelCase is split).
- **W** drops DeegaGames ZK ("game" inside "deegagames").
- **S** (cut at a fifth, chosen from the package distribution before any
  replay): x402 Stellar MCP leaves the keyword top 20 of "AI agent that pays
  for API calls with USDC using x402" (20th to 25th), passed by builds whose
  @x402 packages now match "x402". **S10** also leaves out x402, the next
  library (12% of read repos; then @stellar/design-system at 5%). That cut was
  chosen after reading i01, a working idea; the held-out ideas, the short,
  test and fresh sets lose nothing under either cut.

## The shipped change (S10): recall, before and after

Builds graded 2, found in the matched list, top 20 and top 5:

| set | mode | labeled | matched | top 20 | top 5 |
| --- | --- | --- | --- | --- | --- |
| 40 working | keyword | 99 | 58 -> 58 | 51 -> 51 | 29 -> 27 |
| 40 working | hybrid | 99 | 95 -> 95 | 78 -> 78 | 45 -> 45 |
| 40 holdout | keyword | 19 | 8 -> 8 | 8 -> 8 | 7 -> 7 |
| 40 holdout | hybrid | 19 | 16 -> 16 | 15 -> 15 | 11 -> 11 |
| short | keyword | 73 | 71 -> 71 | 70 -> 70 | 62 -> 62 |
| short | hybrid | 73 | 73 -> 73 | 73 -> 73 | 72 -> 71 |
| tests | keyword | 3 | 1 -> 1 | 1 -> 1 | 1 -> 1 |
| tests | hybrid | 3 | 3 -> 3 | 3 -> 3 | 3 -> 3 |
| fresh | both | 0 | | | |

Lost and gained (grade 2), all within the top 20: "prediction market on
Soroban" keyword top 5 loses Cypher Markets, KALE Markets and Move Markets
(to 6th, 7th, 8th) and gains KALE-ndar (6th to 2nd), as FlashBet and ARS Price
Arena (graded 1) now match "soroban" through packages; "passkey wallet"
hybrid top 5 loses Veil (5th to 16th) to builds that declare passkey-kit.
Grade 1: ARS Price Arena joins the prediction-market matches; Passkey-Kit
integration and lumengate leave the "passkey wallet" top 5; for "soroban sdk"
Accesly leaves the keyword top 20 (8th to 44th) and Buckspay SDK and Soride
leave top 5s. Full list: `compare-after.txt`.

Battery: 20 builds in keyword and 21 in hybrid, before and after (the
change adds no nonsense match). Probe: unchanged, 2. `passkey`: 4 builds, now
15; winnersOnly 0, now Tukar and DeFi Quest.

### What vetIdea and the brief list

vetIdea, hackathonBrief, scfPitch and reviewSubmission read the same
ranking. Over the 140 ideas, vetIdea's five changed for 3 ideas and the
brief's picks for 5. Grades in parentheses are the earlier labels, or, for
builds no earlier label covered, blind grades (`grades.json`, one labeler,
Claude Sonnet 5.5, from name and description only, without the stack):

| idea | vetIdea | brief |
| --- | --- | --- |
| passkey wallet | gained TalkToStellar (0), Stellaro (0), Prism (1) | the same |
| soroban sdk | gained Ponte Pay (0), lost Soride (1) | the same |
| stablecoin wallet for remittances | gained KaleConnect (1), lost StellarRemit (2, now 6th) | the same |
| an overcollateralized stablecoin for lending | | gained Tukar (0), lost BlendScore (1) |
| prediction market on Soroban | | gained ARS Price Arena (1) and KALE-ndar (2), lost Move Markets (2) and clevercon (0) |

Most of these come from a query word found inside a package name: wallet in
stellar-hd-wallet (KaleConnect), sdk in @defindex/sdk and soroban's synonym
contract in stellar-contract-utils (Ponte Pay). TalkToStellar and Stellaro
declare passkey-kit; graded from their descriptions they are not passkey
wallets.

## Open risks and leads

- Generic words inside package names (sdk, wallet, contract, utils) now
  match. On the labeled sets this cost no grade-2 build its top 20, but it
  moved one same-idea build (StellarRemit) out of vetIdea's five and added
  three grade-0 builds to it. Two leads, not measured: index a package by
  its name without generic words (which would also stop `q=passkey-kit`
  matching it), or keep package matches out of vetIdea's two-word evidence
  path.
- The battery and the probe are unfixed: a build whose name holds one real
  word of a nonsense query is still listed. A rule that keys on the
  battery's own words (for example turning name matches off when most query
  words occur in no build) was seen only after the battery was read, so it
  needs a fresh battery written before it is run.
- The fresh set has no build graded 2; its recall rows are vacuous.

## Files

- `nonsense.frozen.json`: the battery.
- `capture.mjs`, `capture.txt`: the capture and its log.
- `replay.mts`: the replay, run per candidate.
- `compare.mts`: the comparison; with a slim directory it writes
  `before.json` and `after.json` (per idea and mode the matched count, the
  top 20 and the rank of every graded build; the extra queries in full).
- `compare-after.txt`: base against the shipped code.
- `candidates/`: each candidate's diff and comparison.
- `grades.json`: the blind grades above.

## Rerun

From the repository root (the capture reads production, read-only; live
data moves, so numbers can change):

```
node improvements/audits/2026-10-23-build-matching/capture.mjs <scratch>/live.json
pnpm exec tsx improvements/audits/2026-10-23-build-matching/replay.mts <scratch>/live.json after <scratch>/out-after.json
pnpm exec tsx improvements/audits/2026-10-23-build-matching/compare.mts <scratch>/live.json <scratch>/out-base.json <scratch>/out-after.json
```

`replay.mts` replays whatever `src/lib/hackathon-builds.ts` holds: run it
once with the parent commit's file for `out-base.json`, and once per
candidate with its diff applied to that file.
