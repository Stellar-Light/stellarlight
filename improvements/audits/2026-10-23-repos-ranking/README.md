# 2026-10-23: repo search puts low-match rows first

Round ledger: `../../rounds/2026-10-23-repos-ranking.md` (scope, design, the
criteria fixed before any result, and the log).

## Verdict

**Shipped on the branch: D1 plus D3** (usage breaks ties; a successor takes
its old repo's place), a narrow bug fix. The full change (D1, D2 and D3)
failed its dev-set bar and does not ship; D2 stays here as measured, not
shipped.

Narrow ship, against the bars written in the ledger at 21:31Z before it ran
(`measure-narrow.mts`, `narrow-report.txt`, `narrow-results.json`):

| bar | result |
| --- | --- |
| (1) exact names: no rank-1 loss over 60 lookups | **holds**: 0 losses; rank 1 on 58 of 60, base and variant (bare "core" and "aggregator" never led). q=Blend now leads with blend-capital/blend-contracts-v2, q=Reflector with reflector-network/reflector-contract |
| (2) keyword queries with no used row and no successor pair byte-identical to base | **holds**: 17 of 17 (the whole replay record, ranking included) |
| (3) Blend v1 and Reflector no longer lead through usage | **holds**: a used row is rank 1 on 7 of 145 pages, none through usage beyond a score tie (6 lead with usage removed too, q=Reflector wins a tie at score 5); sc-04 Heliobond/frontend (46.2) leads where blend-contracts (16) did, sa-04 Gloriachinedu/lumenflow-contracts (41.8) where blend-contracts (10.4) did, q=smart account stellar/smart-account-kit (13) where reflector-contract (3) did; 11 first rows change in all |
| (4) no battery tools question ranks its repo lower | **holds**: sc-03 71 to 70, sc-04 111 to 110, sa-03 1 to 1, sa-04 72 to 72, cc-03 250 to 250, cc-04 39 to 39 |
| (5) dev set, no bar | 9 to 9 of 25 (tuning 6 to 6, held-out 3 to 3) |

Full change (D1, D2 and D3), against the bars fixed before any result:

| bar | result |
| --- | --- |
| (a) dev set: expected repo in the top 5 rises by 6 of 25 | **fails**: 9 to 10 (tuning 6 to 6, held-out 3 to 4; 1 gained, 0 lost) |
| (b) exact names: 0 losses | holds: 60 of 60 lookups keep rank 1 where they had it; Blend and Reflector keep a repo of the project first |
| (c) keyword queries | holds: 17 of 17 queries with no used row, no successor pair and unchanged tokens answer identically; 42 of 52 identical in all |

D2 made two battery questions rank their repo lower (sc-03 71 to 98, sc-04
111 to 160 on its own) because, without rarity weighting, the common words
it lets through ("token", "contracts") count. Neither change makes
natural-language questions find their repo: most dev-set misses have other
causes (section "Why bar (a) failed").

## The cause, confirmed

From code (`src/lib/repo-search.ts`, the sort in searchRepos) and the
replay:

1. **Usage ranked above the match score.** The sort was crank, alias,
   frank, stellarness, anchorIdentity, **inUse**, score. `inUse` is
   `codeInUse.events > 0`, which only `scripts/data/enrich-onchain-projects.ts`
   writes, for repos joined to directory projects' contracts. In the whole
   index (13,698 rows) two rows carry it, both project-link:
   blend-capital/blend-contracts (Blend v1, superseded by v2, 36,033 events)
   and reflector-network/reflector-contract (44,447). Either one led any page
   where it matched one word and tied on stellarness and identity, which a
   long question makes easy. On live 1.9.101 the base served
   blend-contracts first at score 16 over rows at 46 for hm26-sc-04, first
   for hm26-sa-04 and for q=token contract, and reflector-contract first for
   q=smart account.
2. **Tokens kept their punctuation.** `contentTokens` splits on spaces only,
   so "to," "what's" and "myself?" escaped the stopword list while "token,"
   "account?" "pausable," "(fungible" and "chain?" could never match: the
   boundary matcher needs a word character after the punctuation. A repeated
   word counted twice ("contract" in hm26-cc-04).
3. **Question filler scored.** "fastest", "way", "instead", "myself", "add"
   matched descriptions, fed the coverage multiplier and widened the 600-row
   candidate window.

## The fixes

Shipped:

- **D1, usage breaks ties.** `inUse` moves from above the match score to
  directly below it (AGENTS.md rule 6: authority signals break ties, never
  beat relevance). Every tier above the score is unchanged.
- **D3, successors first.** After the sort, a repo whose successor
  (stored `successorRepo`, else the curated map's `supersededBy`) is also in
  the results gives the successor its place and sits directly below it. A q
  that names the old repo itself keeps it first; a successor that is not in
  the results changes nothing. As first designed, D3 only sank the old row;
  that lost q=Blend to an unrelated repo (bar b), so the pre-registered
  fallback (the successor takes the slot) is what ships.

Measured, not shipped:

- **D2, question tokens.** `repoQueryTokens(q)`: `contentTokens(q)` without
  edge punctuation (a trailing `#` or `+` kept), without a trailing `'s`,
  without contractions, without the shared stopwords (applied again after
  the trim) and a repo-search filler list (rating words, frame nouns,
  function words, pronouns, greetings, verbs about the asker), each word
  once. It fixes a real tokenizer defect (cause 2), but on its own it moved
  the dev set 9 to 9 (gained dev-14, lost dev-20) and ranked two battery
  repos lower. It belongs with rarity weighting, measured together.

Tests: `src/lib/__tests__/repo-search-rank.test.ts`. For the shipped code, 5
new or rewritten tests fail on the base sources (`failing-first.txt`) and
63 of 63 pass here. The full change's run, with the 5 D2 tests, is
`failing-first-with-d2.txt` (10 fail on base). The old test "a mainnet-used
repo outranks a keyword-luckier repo without usage" encoded the bug; it is
replaced by "wins a tie at equal match score" and "never lifts a weak match
above a better one".

## Method

- `capture.mts` (read-only, anonymous, about 2 s apart, 285 GETs, no 429 or
  503, apiVersion 1.9.101 at 18:00:43Z, 18:05:19Z and 18:10:13Z): the whole
  repos collection from its public REST read (depth 0, readmeExcerpt left
  out as searchRepos leaves it out; an anonymous read sees no held rows and
  no internal notes, as searchRepos does), then the live first page of every
  query below. The corpus stays in scratch (upstream descriptions).
- `replay.mts`: a tree's searchRepos over the corpus with a mock payload
  that answers `find` as the MongoDB adapter does (`like` per word,
  case-insensitive substring, any array element; `in`; `not_equals`; `or`;
  sort then Payload's fallback `-createdAt`; limit). Base: origin/main
  d9bd53b5 from a scratch copy. **Fidelity: 145 of 145 base first pages
  identical to live** in rows, order, scores, matchMode and total.
- `measure.mts`: the full change's bars; `report.txt` and `results.json`
  are its output for D1, D2 and D3, and `ablation.txt` runs each fix alone.
  `measure-narrow.mts`: the narrow ship's bars, from the variant's replay
  and a second replay over the corpus with usage cleared (does a used row's
  lead depend on usage?); output `narrow-report.txt`, `narrow-results.json`.
- Sets (`sets.json`, fixed before any result): the dev set
  (`devset.json`, 25 questions written blind from GitHub and docs by a
  separate agent, frozen by sha256 in `FREEZE.json`, 8 held out by the hash
  rule), 30 repos as owner/name and bare name, the project names of the two
  used rows, 52 keyword queries (the live probes, the repos golden questions
  and 36 vertical words), and the six battery tools questions.

## Results

### Dev set, full change (rank of the first expected repo, base to D1, D2 and D3)

| id | slice | expected | rank |
| --- | --- | --- | --- |
| dev-01 | tuning | StellarCN/py-stellar-base | 37 to 52 |
| dev-02 | tuning | stellar/go-stellar-sdk | 2 to 2 |
| dev-03 | tuning | Soneso/stellar_flutter_sdk | 47 to 35 |
| dev-04 | tuning | Creit-Tech/Stellar-Wallets-Kit | 4 to 4 |
| dev-05 | tuning | stellar/freighter | 3 to 2 |
| dev-06 | held-out | stellar-expert/albedo | 30 to 24 |
| dev-07 | held-out | reflector-network/reflector-contract | 4 to 4 |
| dev-08 | tuning | redstone-finance/redstone-oracles-monorepo | not indexed |
| dev-09 | tuning | smartcontractkit/chainlink-stellar | not fetched |
| dev-10 | held-out | soroswap/aggregator | 351 to 43 |
| dev-11 | tuning | blend-capital/blend-sdk-js or blend-contracts-v2 | 2 to 2 |
| dev-12 | tuning | defindex-io/stellar-contracts | not indexed |
| dev-13 | tuning | stellar/stellar-cli | 33 to 36 |
| dev-14 | held-out | stellar/quickstart | **18 to 4** |
| dev-15 | tuning | stellar/stellar-etl | 55 to 87 |
| dev-16 | tuning | stellar/stellar-rpc | 1 to 1 |
| dev-17 | tuning | axelarnetwork/axelar-amplifier-stellar | 27 to 28 |
| dev-18 | held-out | LayerZero-Labs/monorepo-external | not fetched |
| dev-19 | tuning | pendulum-chain/spacewalk | 414 to 414 |
| dev-20 | tuning | OpenZeppelin/stellar-contracts | 4 to 4 |
| dev-21 | tuning | Crossmint/stellar-smart-account | not fetched |
| dev-22 | held-out | OpenZeppelin/openzeppelin-relayer | 147 to 81 |
| dev-23 | held-out | stellar/anchor-platform | 4 to 4 |
| dev-24 | tuning | stellar/typescript-wallet-sdk | 19 to 17 |
| dev-25 | held-out | stellar/stellar-anchor-tests | 2 to 2 |

### Battery tools questions, full change (not tuned on): rank of the expected repo

| id | expected | base | D1, D2, D3 |
| --- | --- | --- | --- |
| hm26-sc-03 | OpenZeppelin/stellar-contracts | 71 of 595 | 97 of 591 |
| hm26-sc-04 | stellar-scaffold/cli (theahaco/scaffold-stellar is not indexed) | 111 of 590 | 159 of 596 |
| hm26-sa-03 | stellar/passkey-kit or stellar/smart-account-kit | 1 | 1 |
| hm26-sa-04 | OpenZeppelin/stellar-contracts | 72 of 515 | 52 of 571 |
| hm26-cc-03 | first row naming CCTP (the battery names no repo) | 250 of 401 | 213 of 528 |
| hm26-cc-04 | axelarnetwork/axelar-amplifier-stellar | 39 of 591 | 29 of 575 |

The first pages changed most: blend-contracts and reflector-contract left
the top of sc-04 and sa-04, and stellar-scaffold/ui (sc-04) and
Crossmint/stellar-smart-account (sa-04) entered the top 5. sc-03 and sc-04
fall further: with the punctuation gone, common words such as "token" and
"contracts" count, and nothing weighs a word by how rare it is.

### What each fix moves (`ablation.txt`)

| run | dev top 5 | exact losses | keyword identical | battery |
| --- | --- | --- | --- | --- |
| D1 only | 9 to 9 | 0 | 42 of 52 | ranks move by 1 |
| D2 only | 9 to 9 (gains dev-14, loses dev-20) | 0 | 52 of 52 | sc-03 98, sc-04 160, sa-04 54, cc-03 214, cc-04 29 |
| D3 only | 9 to 9 | 0 | 48 of 52 | ranks move by 1 |
| all three | 9 to 10 | 0 | 42 of 52 | as above |
| D1 and D3 (shipped) | 9 to 9 | 0 | 42 of 52 (17 of 17 without a mechanism, byte-identical) | sc-03 70, sc-04 110, others unchanged |

## Why bar (a) failed

The 15 dev questions still missing their repo after the change:

- **Not in the index (2):** dev-08 redstone-oracles-monorepo, dev-12
  defindex-io/stellar-contracts (the sc-08 successor, below).
- **Indexed but never fetched (3):** dev-09 chainlink-stellar, dev-18
  LayerZero monorepo-external, dev-21 Crossmint smart account. Each has no
  description and a repoScore of 30 to 43; the 600-row candidate window is
  sorted by repoScore over rows matching any word, and long questions fill
  it first.
- **Fetched and outranked (10):** rows matching many common words (soroban,
  contracts, sign, transactions, submit) in code symbols at weight 4 win
  through the coverage multiplier over the row matching the rare words
  (flutter and dart, python, pipeline); curated floats fire on a word in
  passing ("query Horizon" floats stellar-horizon, "smart wallet" floats
  the wallet flagships, "AMM" the AMM flagships); missing vocabulary
  ("command-line tool" never reaches stellar-cli, "Python library" never
  reaches py-stellar-base); pendulum-chain/spacewalk is unscanned, so the
  stellarness tier puts every scanned row above it; the stored code symbols
  of axelar-amplifier-stellar (capped at 60) do not include "interchain".

Prototypes on the tuning slice only (`prototypes.txt`): rarity weighting
for questions (the formula of `src/lib/prior-art-rank.ts`, three multiplier
variants), a supplement fetching only the rarest anchors, two vocabulary
entries, a multiplier cap and a lower symbol weight. Every variant stayed at
6 of 17 (one at 5), with ranks moving both ways. None met the rule fixed in
the ledger (3 tuning gains, none lost), so none is on the branch.

## Supersession (the sc-08 case)

Checked read-only on 2026-10-23:

- The DeFindex project row (slug `defindex`, Live) links
  `https://github.com/paltalabs/defindex` in `links.github` and
  `github.repos` = [paltalabs/defindex] (`/api/projects?where[slug][equals]=defindex&depth=0`).
- The index holds paltalabs/defindex as archived, tier community (so
  searchProjects still lists it among the project's repos), repoScore 23,
  with `successorRepo` defindex-io/stellar-contracts stamped from the curated
  map (`src/lib/repo-relations.ts`). The successor is not indexed; another
  defindex-io repo is (defindex-io/privy-defindex-guide, from the Electric
  Capital list).
- No writer adds a successor row: `scripts/enrich-repos.ts` only stamps
  `successorRepo` on the old row (line 668), and it indexes repos a project
  names in `github.repos` or `links.github` (`reposOf`, lines 74 to 95).

What it would take (data changes through lanes, none run here):

1. In `scripts/data/curation-maps.ts`, add
   `defindex: [{ owner: "defindex-io", name: "stellar-contracts" }]` to
   `GITHUB_REPOS_ADD` (additive), and, to point the project row at the
   living repo, `defindex: "https://github.com/defindex-io/stellar-contracts"`
   to `GITHUB_LINK_FIX`. A code PR.
2. The curate-projects lane (`.github/workflows/curate-projects.yml`): a
   dry run, its printed diff read, then an execute; read back the project
   through `/api/projects`.
3. The enrich-repos lane (`.github/workflows/enrich-repos.yml`) with
   `only=defindex-io/stellar-contracts`: dry run, then execute (the weekly
   Monday run also picks it up). It creates the row as project-link with
   projectSlug defindex; read back through `/api/repos/search`.
4. The code-scan lane fills its code facts; until then the row ranks in a
   lower stellarness tier. GitHub shows the successor as a fork, which the
   grade demotes; the curated map is the evidence that it is the living
   repo.

Once the row exists, D3 gives it paltalabs/defindex's place wherever both
match, and dev-12's answer is in the index. No check found asserts that a
curated successor is indexed: `scripts/check-supersession-freshness.ts`
checks that archived repos have a map entry, and
`scripts/check-record-completeness.ts` checks audit report successors.

## Limits

- D2's filler list (not shipped) misses inflections ("adding", "writing"
  still score); a stemmed check would catch them. The held-out slice showed
  it, so it was not tuned.
- The replay reads the index as captured (18:00Z to 18:10Z); the lanes
  write daily.
- Usage counts on two rows today; D1 matters more as the on-chain lane
  attributes more contracts.
- Measured on searchRepos only; explainRepo's routing, vetIdea's repos and
  searchProjects' codeReferences call it but were not replayed.

## Data effect

Nothing is written by this lane.
