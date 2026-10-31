# Build search terms: edge punctuation and short plurals (lane Q2)

Opened 2026-10-31, after an outside review of `src/lib/hackathon-builds.ts`
(another model family, findings as leads) and a reproduction of each lead
in tests and live reads. This file is written before any replay output is
read; the criteria below are fixed here.

## The defects (reproduced 2026-10-31, live 1.9.111)

1. **A token with no letter or digit matches every build.** `q=--` matched
   1,356 of 1,356 builds with no warning, because `phraseForms` turns the
   token into the empty form and `termMatcher("")` matches at every word
   boundary. A `--` written as a dash inside a longer q lists every build
   through the name rule. `q=the-` matched 420: a trailing hyphen keeps a
   stopword as a concept.
2. **Edge punctuation stays on the token.** `q=escrow, milestones,
   freelancers` lists nothing against "Escrow with milestones for
   freelancers", and nothing warns, because the scorer searches `escrow,`
   with its comma. The unused-words line already strips edge punctuation
   (`wordCore`), so the two disagree.
3. **A three-letter word's plural matches inside longer words.** A term of
   three letters or fewer is meant to match as a whole word only, but
   `wordForms` adds a four-letter plural that `termMatcher` matches as a
   substring: `q=age` lists builds that hold only "packages" or
   "leverages" (6 of its 16 rows), `q=ent` matches "payments".

## The change

In `queryTerms` only (the builds route, vetIdea, hackathonBrief, analyze's
q and rule L all read it): each token is cut to its core with `wordCore`, a
token with no core is dropped, and a core that is a stopword, a generic
word or query filler is dropped, as a bare word is today. `termMatcher`
decides whole-word matching by the length of the query word, not of the
form, so a short word's plural is whole-word too. `contentTokens` (shared
with project and repo search) is not changed.

## Criteria, fixed before the replay

Replay: `../audits/2026-10-23-smart-wallet-o2/replay.mts`, unchanged, over
705 queries gathered from every committed query set under
`improvements/audits/2026-10-2*` and the three benchmark batteries, against
the live corpus captured 2026-10-31 (1,356 builds, 876 with declared
packages, api 1.9.111). Hybrid rows replay with an empty meaning map in both
arms, so any difference comes from word matching.

- **(a) Byte identity.** Every query with no targeted shape is
  byte-identical in every replayed field (both route rankings with every row
  field, held rows, the unused-words line, the plain rankings, vetIdea's
  five and the brief's picks). A targeted shape is a token whose core
  differs from the token (edge punctuation, or no letter or digit), or a
  content word of exactly three letters.
- **(b) Every change explained.** Each changed query is listed with its
  counts before and after, and each listed or dropped row is one the change
  predicts: a row that matched only through an empty form, an edge
  punctuation form or a short plural inside a longer word is gone; a row
  that holds the word without its punctuation is listed.
- **(c) Tests.** The reproduction tests for defects 1 to 3 pass, and the
  full `src/lib` suite passes.
- **(d) No false absence.** No changed query gains an unused-words line
  naming a word the corpus holds as a whole word.

Independent review on another model family before any PR, with a re-check
of fixes. Live check after deploy: `q=--`, `q=the-`, `q=age` and the comma
query above, read before and after.

## Results (2026-10-31, after the replay)

Evidence in `../audits/2026-10-31-build-terms/`: the query pool and its
sha256 (committed before the replay), `compare.py` and its report
`compare.txt`, `changed-counts.tsv` (keyword and hybrid row counts before
and after for every changed query) and `concepts-changed.json` (the
concepts each changed query was searched by, before and after).

**Shipped: defects 1 and 2.** **Held: defect 3** (see below).

- **(a) Byte identity: met.** 603 of 705 queries are byte-identical in
  every replayed field. All 102 that changed hold a targeted shape; 0
  changed without one.
- **(b) Every change explained: met.** In each of the 102, the concept list
  changed and every new concept is the core of a token it had before
  (edge punctuation cut), while the dropped ones had no core ("--") or a
  core that is a stopword, a generic word or a duplicate ("stellar,",
  "app.", "this,"). The rest of the scorer is unchanged, so the rows follow
  from the concepts. Keyword rows: 69 queries list more, 5 fewer, 28 the
  same count in another order. The 5 fewer are all stopword or generic
  cores that had counted as concepts: for example "Is USDC issued natively
  on Stellar, and by whom?" goes from 11 rows to 2 once "stellar," stops
  being a concept, and "Where is the `stellar contract deploy` subcommand
  implemented in stellar-cli?" goes from 21 to 0: its backticked tokens
  had padded the concept count, so rule L now withholds the 21 builds that
  matched by the name word "contract" alone and its warning says so.
- **(c) Tests: met.** Three tests in
  `src/lib/__tests__/hackathon-builds.test.ts` fail on main and pass with
  the change (q=--, a "--" in prose, "the-", the comma list); the suite
  passes (203 files, 2,630 tests at the time of writing).
- **(d) No false absence: met.** No changed query names a new word as
  unused.

**Defect 3 held.** Holding a three-letter word's plural to a whole word
(the same rule the word already has) was replayed too: it changed 30 more
queries and dropped 22 rows. Most were noise ("out" in payouts, "bot" in
robots, "set" in assets, "let" in wallets), but some were relevant
compound names the plural had found by accident: AidShield for "refugee
aid vouchers" (which then lists nothing), RWAsset for "rwa tokenization",
PayStream for "pay per article paywall", SpringNFTs for "NFT ticketing".
Whether a short word should match the start of a compound is a design
call that needs labeled queries; it is not made here.
