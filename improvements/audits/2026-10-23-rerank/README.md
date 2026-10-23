# Rerank hackathon prior-art candidates with a cross-encoder

Evidence for `improvements/rounds/2026-10-23-rerank.md`.

**Verdict: shipped.** Two variants pass the criteria fixed before any result
was read:

- **vetIdea, variant (c).** The reranked top five, keeping the builds the
  reranker scores at least 0.45.
- **The builds route in hybrid mode, variant (a).** The reranked order.

hackathonBrief now lists its winner slots and then vetIdea's builds. That
change was measured on the same grades but was not in the fixed method.
Analyze is unchanged. The labels are drafts, pending owner review.

## Method (fixed before any result was read; the ledger has it in full)

- **Capture and base.** Lane K's capture (`../2026-10-23-build-matching/`):
  - all 1,344 stored submissions and 140 labeled ideas, each idea's whole
    hybrid ranking with its live meaning scores; apiVersion 1.9.91 at the
    start and the end;
  - not committed, because it holds upstream descriptions.

  `candidates.mts` replays this tree's `searchHackathonBuilds` over it,
  hybrid, one row per submission. It produces the plain ranking that
  vetIdea reads and the ranking with package matching that the route reads.
  The plain top-5 set equals live on 132 of 140 ideas (lane K saw the same:
  the API rounds similarity to three decimals).
- **Reranker.** The embedding provider's rerank API, models `rerank-2` and
  `rerank-2-lite`.
  - Query: the idea lowercased and trimmed, as both routes pass q.
  - Document: `name. summary`, the build's name and one-line summary.
    `buildEmbeddingText` also reads the write-up, which is neither in the
    capture nor in the index rows the route ranks. The shipped stage builds
    the same text: `candidates.mts` imports it, and its output is byte for
    byte the same before and after the change.
  - Candidates: the union of the two top 50s, 1 to 78 per idea, scored in one
    call per idea and model (a cross-encoder scores each pair on its own).
- **Variants.**
  - (a): reranked order, top 5.
  - (b): reranked top 5 under the evidence rule (`priorArtTop`).
  - (c): reranked top 5, kept at a reranker score floor.
- **Tuning, on the 27 working ideas only.**
  - Model: the share of differently graded labeled pairs, within vetIdea's
    top 50, ordered correctly, using labels that existed before the run.
  - Floor: the highest 0.01 step that removes no build graded 2 from (a)'s
    working top 5.
  - N: stays 50 unless clearly wrong.
- **Labels.** Every unlabeled build that a variant gained or lost against
  its base was blind-graded: 469 rows, from the idea plus the build's name,
  event and summary cut to 600 characters, with the rubric of
  `../2026-10-22-prior-art-precision/labels.json`.
  - Two passes per row (Claude Sonnet 5.5, effort high); they agree on 430 of
    469, and the stricter grade is kept: 78 graded 2, 215 graded 1, 176
    graded 0.
  - Builds that a variant and its base share move no count and stay
    unlabeled (the "unlabeled" column below).
  - Other grades: the 40 ideas' `labels.json`, the short and test windows,
    the fresh set's `grades.json` (stricter labeler) and
    `../2026-10-23-build-matching/grades.json`.

## Model choice

| order | all pairs | 2 v 0 | 2 v 1 | 1 v 0 |
| --- | --- | --- | --- | --- |
| hybrid (base) | 74.7% | 91.1% | 73.3% | 70.1% |
| rerank-2 | **80.3%** | 91.6% | 77.8% | 78.4% |
| rerank-2-lite | 78.5% | 94.4% | 76.3% | 74.6% |

This was the decision run: 1,641 pairs on working, with the labels that
existed before the run (`pairs-working-before-labels.txt`). rerank-2 was
chosen, and the other model ran on working only.

With the new grades (`pairs-working-after-labels.txt`, 1,912 pairs):

| order | all pairs | 2 v 0 |
| --- | --- | --- |
| hybrid | 72.3% | 89.5% |
| rerank-2 | 78.9% | 86.4% |
| rerank-2-lite | 77.2% | 90.6% |

rerank-2 still leads overall, but it orders same-idea against wrong pairs
below the base across the whole top 50. The gain is in 2 v 1 and 1 v 0.

N: of the 99 working same-idea builds, 89 sit in the base top 50 (45 in the
top 5); 10 are below 50 or unmatched. N stays 50.

Floor: 0.45. The lowest same-idea score in (a)'s working top 5 is 0.4563,
and the new grades did not change it.

## Results: builds in the top 5 per set and variant (`report.txt`)

Cells are same idea (2) / related (1) / wrong (0) / unlabeled.

| set | variant | listed | 2 / 1 / 0 / ? | ideas with none |
| --- | --- | --- | --- | --- |
| working (27) | vetIdea base | 123 | 45 / 61 / 17 / 0 | 0 |
| | vetIdea (a) | 132 | 49 / 68 / 15 / 0 | 0 |
| | vetIdea (b) | 107 | 46 / 54 / 7 / 0 | 2 |
| | vetIdea (c) 0.45 | 118 | 49 / 60 / 9 / 0 | 1 |
| | route base | 132 | 45 / 64 / 23 / 0 | 0 |
| | route (a) | 132 | 49 / 68 / 15 / 0 | 0 |
| holdout (13) | vetIdea base | 57 | 11 / 30 / 16 / 0 | 1 |
| | vetIdea (a) | 65 | 15 / 33 / 17 / 0 | 0 |
| | vetIdea (b) | 48 | 14 / 24 / 10 / 0 | 1 |
| | vetIdea (c) 0.45 | 51 | 14 / 27 / 10 / 0 | 1 |
| | route base | 65 | 11 / 33 / 21 / 0 | 0 |
| | route (a) | 65 | 15 / 33 / 17 / 0 | 0 |
| short (36) | vetIdea base | 108 | 59 / 39 / 10 / 0 | 4 |
| | vetIdea (a) | 168 | 82 / 65 / 21 / 0 | 0 |
| | vetIdea (b) | 100 | 62 / 32 / 6 / 0 | 5 |
| | vetIdea (c) 0.45 | 145 | 79 / 55 / 11 / 0 | 3 |
| | route base | 168 | 73 / 61 / 34 / 0 | 0 |
| | route (a) | 168 | 82 / 65 / 21 / 0 | 0 |
| tests (34) | vetIdea base | 137 | 15 / 33 / 33 / 56 | 2 |
| | vetIdea (a) | 170 | 20 / 53 / 41 / 56 | 0 |
| | vetIdea (b) | 130 | 9 / 36 / 29 / 56 | 2 |
| | vetIdea (c) 0.45 | 144 | 19 / 40 / 29 / 56 | 3 |
| | route base | 170 | 19 / 44 / 51 / 56 | 0 |
| | route (a) | 170 | 20 / 53 / 41 / 56 | 0 |
| fresh (30) | vetIdea base | 101 | 6 / 43 / 24 / 28 | 4 |
| | vetIdea (a) | 147 | 9 / 63 / 47 / 28 | 0 |
| | vetIdea (b) | 76 | 5 / 36 / 7 / 28 | 5 |
| | vetIdea (c) 0.45 | 95 | 6 / 40 / 21 / 28 | 6 |
| | route base | 147 | 8 / 62 / 49 / 28 | 0 |
| | route (a) | 147 | 9 / 63 / 47 / 28 | 0 |

## Against the ship criteria

The criteria were:

- holdout: same idea at least the base's and wrong strictly fewer;
- fresh: wrong fewer or equal;
- short and tests: same idea not fewer.

| variant | holdout 2 / 0 | fresh 0 | short 2 | tests 2 | verdict |
| --- | --- | --- | --- | --- | --- |
| vetIdea (a) | 15 / 17 (base 11 / 16) | 47 (24) | 82 (59) | 20 (15) | fails: holdout wrong 17 > 16 |
| vetIdea (b) | 14 / 10 | 7 | 62 | 9 (15) | fails: tests same idea 9 < 15 |
| **vetIdea (c) 0.45** | 14 / 10 | 21 | 79 | 19 | **passes** |
| **route (a)** | 15 / 17 (base 11 / 21) | 47 (49) | 82 (73) | 20 (19) | **passes** |

## Totals hide swaps

These are gross builds graded 2 and 0 gained and lost against each base,
from the swap lists in `report.txt`.

| set | vetIdea (c): same +/- | wrong +/- | route (a): same +/- | wrong +/- |
| --- | --- | --- | --- | --- |
| working | +20 / -16 | +8 / -16 | +20 / -16 | +11 / -19 |
| holdout | +3 / -0 | +7 / -13 | +4 / -0 | +9 / -13 |
| short | +32 / -12 | +10 / -9 | +25 / -16 | +14 / -27 |
| tests | +17 / -13 | +29 / -33 | +13 / -12 | +38 / -48 |
| fresh | +6 / -6 | +20 / -23 | +7 / -6 | +31 / -33 |

The reranker moves many builds both ways.

- Same-idea builds that vetIdea (c) loses include, on short ideas:
  - Tukar and KaleConnect for "remittance app";
  - Cypher Markets, KALE Markets and Move Markets for "prediction market";
  - StealthPayroll and Tecta for "payroll";
  - FixedRateX for "recurring subscription payments";
  - Identizy and StarProof for "verifiable credentials";
  - KaleShield for "insurance".
- On working ideas it loses four i28 games, three i20 donation platforms and
  four i13 prediction markets.
- Every build lost and gained, with its grade, is in `report.txt`.

The three battery probes (i01, i04, i11), with grades in brackets:

- **i01:** vetIdea (c) drops Delibera (0) and loses AgentPay (2). It gains
  PayWall.ai, VENDLY and Payflow (2 each).
- **i04:** it drops QR Mint (0) and loses BLOCKI (2).
- **i11:** it drops Stellar Automations Studio (0) and gains Chancha+ (2).

Holdout swaps for vetIdea (c), with grades in brackets:

- **i03:** loses Link2Pay (1) and RemitLend (0); gains AnchorFX (1) and
  EazeFi (2).
- **i06:** loses DUST AGGREGATOR (0); gains Swave (1).
- **i09:** loses CarbonXO (0); gains SugarCane (2), AgroCane (1) and
  CarbonChain Morelos (1).
- **i12:** loses Blitz QR Code Auction Platform (0), QR Mint (0) and Stellar
  Micro payment for AI prompt (0); gains BairrouApp! Wallet (0), Blockchain
  Maps (1) and CirclePay (1).
- **i15:** loses Obscura (1); gains StellarVote (0).
- **i18:** loses InvoiceVeil (0), Kryon Network (1), SettleZK (0) and Micro
  Lending (1).
- **i21:** loses Stellar Rent (0) and PayOnProof (0); gains Vyn (1) and
  RemitLend (1).
- **i24:** loses KaleGuardVaults (1) and YieldZap (1); gains KipuFi (0) and
  OrbitYield (1).
- **i27:** loses Playlumen (1) and xray.games (1); gains BalloonFly (1) and
  Harmony (0).
- **i30:** loses Huella (1), Mineral Gateway (1) and AgroChain LATAM (0);
  gains SargaChain (1), Agro Coop (0) and CarbonChain Morelos (0).
- **i33:** loses Why Stellar Feels Boring (0), Stellar Autopay X402 (1) and
  CosmosPay (1); gains LockedIn (2), StellarPay (0) and Abroad (1).
- **i39:** loses Streamr (1), ZeroWage (1), clevercon (0), Sobrecito (1) and
  Nomilar (1); gains PayStream (1).

## hackathonBrief (added after the grades)

The brief's spec text says it lists "the builds vetIdea lists" after its two
winner slots. A reranked vetIdea would have broken that promise if the brief
kept the hybrid rule, so the brief now takes vetIdea's list. Measured on the
same grades:

- holdout: same idea 11 to 13, wrong 16 to 11;
- fresh: wrong 24 to 22;
- short: same idea 59 to 78;
- tests: same idea 15 to 19.

Two unlabeled builds leave the brief on tests: Stellar Payment API (PLUTO),
for two stablecoin ideas. The brief can drop them because it cuts at five
after its winner slots. If both were graded 2, the tests count would be 19
against 17. The winner slots are unchanged.

## What shipped

- **`src/lib/build-rerank.ts`:**
  - `rerankBuilds(q, ranked)` reorders the first `RERANK_TOP` (50) by the
    reranker's score; a tie keeps the hybrid order, and the rest are
    unchanged.
  - If it fails, times out (`RERANK_TIMEOUT_MS`, 2 s), or its answer is not
    exactly one finite score per candidate (malformed JSON, a duplicate,
    out-of-range, negative or non-integer index, a null, string, NaN or
    infinite score, too few scores), it returns today's order with `scores`
    null. Without a key, or with nothing to rerank, it is not attempted
    (`scores` undefined).
  - It keeps a per-instance cache of 200 entries, keyed by
    `JSON.stringify([q, ids])` (a `ponytail:` comment marks it).
- **`queryBuilds`** takes `rerank` and runs the stage only when hybrid
  served and a build matched. It returns `rerank` (scores, null or absent)
  and adds a warning when the stage did not run. It skips the stage
  (`rerank` null, a warning naming the budget) when search by meaning has
  already taken longer than `RERANK_SKIP_AFTER_MS` (3 s).
  - Live on 1.9.96 (six ideas, read-only), meaning added 0.10 to 0.26 s to
    the builds route's server time, and a whole vetIdea request took 1.4 to
    2.0 s (1.7 to 2.8 s in the orchestrator's earlier probe).
  - So a healthy request never skips, and the rerank never pushes external
    waiting past about 5 s (the embedding alone may wait 5 s, the vector
    read 4 s).
- **vetIdea:**
  - When reranked, it lists the builds of the reranked top five that score
    at least `RERANK_FLOOR` (0.45), and the near-miss note names the
    reranker.
  - Otherwise it uses the hybrid five under the evidence rule, as before.
  - New field: `priorArt.buildsReranked`.
- **The builds route:** reranked order in hybrid mode; `meta.reranked`;
  `meta.note` says so.
- **`pickBriefBuilds(scored, vetListed)`:** the winner slots, then vetIdea's
  builds in vetIdea's order. Without vetIdea's list it falls back to
  `priorArtTop`, as before.
- **`vetBuildsIn`** resolves each of vetIdea's builds in the brief's own
  ranking, then in the index (vetIdea's event entry first). The brief
  therefore lists a build vetIdea found by meaning even when its own search
  served keyword. A build neither holds (the index was rebuilt between the
  two reads) is named in whatNotToClaim.
- **Parity (`shipped.mts`, `shipped.txt`).** The shipped stage, answered
  from the recorded scores, gives vetIdea's listed builds equal to (c) and
  the route's top 5 equal to (a) on 140 of 140 ideas.

## Cost

- 167 rerank calls and 281,243 tokens, with no retries: 54 calls for both
  models on working, then 113 for rerank-2 on the other 113 ideas.
- Calls averaged under half a second, including a 250 ms pause between
  calls.

## Open risks

- **Draft labels.** One model family labeled every grade (two passes). The
  test and fresh sets keep 56 and 28 shared builds unlabeled, which moves
  no delta.
- **Short summaries.** The document is the one-line summary. A build with a
  slogan for a summary (most DoraHacks summaries are short) reads as
  unrelated, which is likely behind the known same-idea losses above.
  Reading the write-up was not measured.
- **Winners in the top 50.** The reranker does not read placement, so
  winners keep no edge inside the top 50 except on a tie. The operation now
  says so: "Winners first among equals; in hybrid mode a reranker orders the
  top 50". Not measured: `winnersOnly`, track, package, hackathon and
  category filters with hybrid. The stage runs there too.
- **Rough fallback.** A reranker failure on one page and success on the
  next would order two pages differently, so rows can repeat or be skipped
  across them. Each page's `meta.reranked` says which order it holds, and
  the spec tells a caller paging to read it on every page.
- **The floor.** It was tuned on 27 ideas and is set by one build
  (0.4563).
- **Latency.** Each hybrid vetIdea and builds request adds one rerank call,
  up to 2 s, unless the cache answers or search by meaning already took
  over 3 s.

## Files

| file | what it holds |
| --- | --- |
| `candidates.mts` | the base replay and candidate sets (output not committed) |
| `score.mts` | the rerank calls |
| `scores.json` | build id to score per idea and model, and tokens; no text |
| `evaluate.mts` | `pairs`, `sheet` and `report` |
| `shipped.mts`, `shipped.txt` | parity of the shipped stage |
| `pairs-working-before-labels.txt`, `pairs-working-after-labels.txt` | the model-choice tables |
| `report.txt` | every table and every swap by name and grade (one build, dorahacks-buidl-42589, is printed as its id because its name carries a product name the repo's text rules bar) |
| `grades.json` | the 469 blind grades: set, idea id, build id, both passes and the grade |
| `timing.py`, `timing.txt` | read-only live timings behind the 3 s budget: wall time and Server-Timing of the builds route in keyword and hybrid mode and of vetIdea, six ideas, apiVersion at start and end |

## Rerun

From the repository root, with lane K's capture at `<live.json>`:

```
pnpm exec tsx improvements/audits/2026-10-23-rerank/candidates.mts <live.json> <scratch>/candidates.json
pnpm exec tsx improvements/audits/2026-10-23-rerank/evaluate.mts pairs <scratch>/candidates.json improvements/audits/2026-10-23-rerank/scores.json
pnpm exec tsx improvements/audits/2026-10-23-rerank/evaluate.mts report <scratch>/candidates.json improvements/audits/2026-10-23-rerank/scores.json rerank-2 auto <out.txt>
pnpm exec tsx improvements/audits/2026-10-23-rerank/shipped.mts <scratch>/candidates.json improvements/audits/2026-10-23-rerank/scores.json
```

Scoring again calls the API (`score.mts`, needs VOYAGE_API_KEY via
`DOTENV_CONFIG_PATH=<.env.local> pnpm exec tsx -r dotenv/config`). It skips
anything already in the scores file.
