# 2026-10-23: repo search puts low-match rows first

## Scope

searchRepos (`GET /api/repos/search`, also the code references of
searchProjects, vetIdea's repos and explainRepo's routing) puts weakly
matching rows at the top for natural-language questions. A frozen battery of
HackMeridian 2026 builder questions (sha256 9b4ee6be...4745, run on live
1.9.100) found:

- blend-capital/blend-contracts (Blend v1, superseded by v2) at score 10 to
  16 ranked first for scaffolding a Soroban dapp (hm26-sc-04) and smart
  account spending limits (hm26-sa-04), above rows scoring 40 to 46;
  explainRepo then offered it as the alternate repo;
- OpenZeppelin/stellar-contracts ranked 71 of 595 for the audited contracts
  library question (hm26-sc-03) and 72 for smart account policies;
  axelarnetwork/axelar-amplifier-stellar ranked 39 of 591 for contract
  messaging to an EVM chain (hm26-cc-04); each is rank 1 by its own name.

This round finds the cause, fixes it in the ranking, and measures the fix on
a new dev set, exact-name lookups, keyword queries and the six battery tools
questions. Data changes (indexing a missing successor repo) are reported,
not run.

## Lanes

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| R4: repos ranking | Claude Opus 5.5, high | own worktree, branch `lane/r4-repos-ranking` off origin/main: `src/lib/repo-search.ts` and its tests, spec text if needed, changelog, version, generated contract, `improvements/audits/2026-10-23-repos-ranking/`, this ledger, `improvements/TODO.md` | one commit on the branch, not pushed |
| R4-dev: blind dev-set writer | Claude Opus 5.5, high | scratch only (`r4/devset/devset.json`) | 25 questions with expected repos from GitHub and docs, blind to the API and this code |
| R4-x: supersession path research | Claude Sonnet (the `sonnet` alias), medium | none (read-only) | how a successor repo would enter the index and reach a project row |

The orchestrator holds the push, the PR and the independent review.

## Review

Pending: the orchestrator's independent review, on a model other than the
author's.

## Cause, from code (before any replay)

`src/lib/repo-search.ts`, searchRepos' sort, most to least decisive: crank,
alias, frank, stellarness, anchorIdentity, **inUse**, score, arch,
superseded, stale2y, alive, sdf, mention, repoScore, stars.

1. `inUse` is 1 when a row's attributed mainnet contract has events
   (`codeInUse.events > 0`). It sits above `score`, so such a row outranks
   every row of its stellarness and identity class whatever its match
   score. Only `scripts/data/enrich-onchain-projects.ts` writes `codeInUse`,
   for repos joined to curated projects' contracts, so these rows are
   project-link rows. Usage is an authority signal; AGENTS.md rule 6 says
   authority signals break ties and never beat relevance.
2. `contentTokens` splits on whitespace and never trims punctuation. In the
   six tools questions, "to," "what's" and "myself?" escape the stopword
   list, while "token," "account?" "pausable," "(fungible" and "chain?" can
   never match: the scorer's boundary regex needs a word character after
   the punctuation. A repeated word counts twice ("contract" in hm26-cc-04).
3. Question-frame words outside the stopword list (fastest, way, instead,
   myself, add) score, feed the coverage multiplier, and widen the
   600-row candidate window, which is sorted by repoScore.

## Design (fixed before any replay)

- **D1, usage.** `inUse` moves from above `score` to directly below it:
  usage breaks ties at equal match score and never beats a better match.
  Every tier above score (canonical, alias identity, flagship, stellarness,
  anchor identity) is unchanged, so exact-name lookups keep their paths.
- **D2, tokens.** Repo search scores `repoQueryTokens(q)`: `contentTokens(q)`,
  then each token loses edge punctuation (leading and trailing characters
  other than letters and digits; a trailing `#` or `+` stays), a trailing
  `'s` is removed, a token still holding an apostrophe is dropped (don't,
  i'm), the shared STOPWORDS apply again, a repo-search filler set is
  dropped, and duplicates go. When nothing is left, `contentTokens(q)` as
  today. The shared `contentTokens` and STOPWORDS are not changed (projects,
  builds, locate and the reports keep today's tokens). Filler set:
  - rating words: easy, easier, easiest, simple, simpler, simplest, quick,
    quicker, quickest, fast, faster, fastest;
  - frame nouns: way, ways;
  - function words the shared list lacks: if, but, so, than, then, not,
    without, also, just, really, actually, already, even, else, instead,
    own;
  - reflexive and indefinite pronouns: myself, yourself, ourselves,
    themselves, itself, someone, anyone, anybody, something, anything,
    everything, everyone;
  - conversation: please, thanks, thank, hi, hello, hey, whats;
  - verbs about the asker, not the thing: add, get, make, let, lets, try,
    trying, looking, start, started, help, able, possible, recommend,
    suggest.
  Amendments come only from the dev set's tuning slice and are logged here.
- **D3, supersession.** After the sort, a row whose known successor (stored
  `successorRepo`, else the curated map's `supersededBy`) is also on the
  list moves to directly below that successor, repeated until no row sits
  above its successor. A successor that is not on the list (not indexed, or
  not matched) changes nothing.

## Measurement (fixed before any result)

**Replay.** The full repos corpus is read from the collection's public REST
read (`/api/repos`, depth 0, readmeExcerpt left out as searchRepos leaves it
out; anonymous reads see what searchRepos sees: no held rows, no internal
notes). A mock payload answers searchRepos' `find` calls over it the way the
MongoDB adapter does (`like`: every space-separated word a case-insensitive
substring, any element of an array field; `in`: exact; `not_equals`; `or`;
sort `-repoScore` then `-createdAt`, Payload's fallback; limit). The base is
origin/main d9bd53b5 run from a scratch copy; the branch is this tree.
Fidelity: the base replay's top 20 against live's top 20 for every captured
query, reported; if fewer than 90% match exactly, the harness is fixed
before any result is read. apiVersion is read at the start and end of each
capture. GETs are anonymous, read-only, about 2 s apart.

**Sets.**
- **Dev set.** 25 questions written blind (lane R4-dev) from GitHub and
  docs, frozen by sha256 before any replay. Held out: the 8 ids with the
  smallest sha256 of the id string (`dev-01`...), fixed now; tuning on the
  other 17 only. Pass: any expected repo in the top 5. Expected repos the
  index does not hold are reported; those questions stay in the counts.
- **Exact names.** 30 repos, each as `owner/name` and as the bare name (60
  lookups): stellar/js-stellar-sdk, stellar/rs-soroban-sdk,
  stellar/stellar-cli, stellar/stellar-core, stellar/freighter,
  stellar/passkey-kit, stellar/smart-account-kit, stellar/anchor-platform,
  stellar/stellar-rpc, stellar/quickstart, stellar/soroban-examples,
  stellar/js-stellar-base, stellar/go-stellar-sdk, StellarCN/py-stellar-base,
  OpenZeppelin/stellar-contracts, OpenZeppelin/openzeppelin-relayer,
  axelarnetwork/axelar-amplifier-stellar, blend-capital/blend-contracts-v2,
  blend-capital/blend-contracts, soroswap/core, soroswap/aggregator,
  reflector-network/reflector-contract, Creit-Tech/Stellar-Wallets-Kit,
  Creit-Tech/xBull-Wallet, script3/soroban-governor,
  Phoenix-Protocol-Group/phoenix-contracts,
  allbridge-io/allbridge-core-soroban-contracts,
  Trustless-Work/trustlesswork-smart-contract-stellar, fazzatti/colibri,
  circlefin/stellar-cctp. Plus project names: for every project whose repo
  has `codeInUse.events > 0` in the corpus, q = its served projectName; pass
  = a repo of that project at rank 1.
- **Keyword queries (default output).** 52 queries with no filler: the 11
  live probes of `scripts/eval/repo-search-live-probes.ts`, the 5 distinct
  repos-mode golden questions of `scripts/eval/golden-questions.json`, and
  amm, dex, lending, bridge, cross-chain bridge, escrow, dao governance, rwa
  tokenization, nft marketplace, indexer, sep-10, sep-24, passkey, smart
  wallet, multisig, stablecoin, payments, price feed, vault, staking, yield,
  launchpad, faucet, explorer, zero-knowledge, account abstraction, smart
  account, soroban cli, python sdk, go sdk, flutter sdk, token contract,
  liquidity pool, remittance, micropayments, invoice. Default request
  (limit 20).
- **Battery check, not tuned on.** hm26-sc-03, sc-04, sa-03, sa-04, cc-03,
  cc-04, sent as written with limit 20; the rank of each expected repo
  before and after.

**Bars.**
- (a) Dev set: questions with an expected repo in the top 5 rise by at least
  6 of 25 (tuning and held-out reported apart, gains and losses listed).
- (b) Exact names: 0 losses (rank 1 on the base replay, not rank 1 on the
  branch), over the 60 lookups and the project-name lookups.
- (c) Keyword queries: a query whose candidate list holds no `inUse` row and
  no row with a successor on the list answers identically (rows, order,
  scores, top 20). Any change elsewhere is listed with its mechanism; a
  change from no mechanism of D1 to D3 fails the bar.
- (d) Battery: reported before and after; no bar.

## Log

- 17:25Z: `git fetch origin`; `git checkout -b lane/r4-repos-ranking
  origin/main`; HEAD d9bd53b5 (spec 1.9.101). `pnpm install
  --frozen-lockfile --prefer-offline`: exit 0.
- 17:47Z, problem confirmed live, read-only: `/api/status` apiVersion
  1.9.101; hm26-sc-04 sent as written with limit 10 serves
  blend-capital/blend-contracts first at score 16 (codeInUse.events 36,033,
  source project-link) above Heliobond/frontend at 46.2.
- 17:50Z: `/api/repos?limit=1&depth=0&select[readmeExcerpt]=false` answers
  200 with totalDocs 13,698: the collection's public read can serve the
  replay corpus.
- 17:52Z: lanes R4-dev and R4-x started.
- 17:54Z: this ledger, with the cause from code, the design, the sets and
  the bars above, written before any replay or dev-set result.
- 17:56Z: lane R4-x returned (read-only): no writer adds a successor row;
  `scripts/enrich-repos.ts` stamps `successorRepo` on the old row only, and
  a project reaches a repo through its `github.repos` or `links.github`.
  Findings go to the audit README after they are checked against the code.
- 17:58Z: lane R4-dev wrote 25 questions (sha256 310633b3...deab). Topics:
  tooling 4, sdk 3, wallet 3, oracle 3, defi 3, bridge 3, smart account 3,
  anchor 3. The writer flagged five answers as less certain (dev-09, 18, 19,
  22, 24); they stay as written.
- 18:00Z: dev set reformatted by biome (parsed JSON identical) and frozen:
  `devset.json` sha256 4eb55ac5...090f, `FREEZE.json`. Held out by the rule
  above: dev-06, 07, 10, 14, 18, 22, 23, 25.
- 18:01Z, design amendment before any replay: under D3 a row the query names
  exactly (alias identity: owner, name or full path) is never moved, or the
  exact-name lookup of a superseded repo (blend-capital/blend-contracts is
  in the 60) would put its successor first. D3 sinks the old row below its
  successor and lifts nothing. If that loses a project-name lookup, the
  fallback (the successor takes the old row's slot, the old row directly
  below) is measured on the same sets and logged here.
- 18:00Z to 18:10Z: `capture.mts` (285 GETs, about 2 s apart, no 429 or
  503): 13,698 corpus rows and 145 live first pages (25 dev, 6 battery, 60
  exact names, 2 project names, 52 keyword). apiVersion 1.9.101 at 18:00:43Z,
  18:05:19Z and 18:10:13Z. No live page carried a warning other than the
  cache buster. Only two corpus rows have `codeInUse.events > 0`, both
  project-link: blend-capital/blend-contracts (Blend, 36,033 events, stored
  successor blend-capital/blend-contracts-v2) and
  reflector-network/reflector-contract (Reflector, 44,447). So the project
  names are Blend and Reflector.
- 18:03Z: failing first. The new tests in
  `src/lib/__tests__/repo-search-rank.test.ts` run against the base sources
  (origin/main d9bd53b5, scratch copy): 9 failed, 58 passed
  (`failing-first.txt`): D1 weak match 1, D3 3, D2 5. The old test "a
  mainnet-used repo outranks a keyword-luckier repo without usage" encoded
  the bug and is replaced by "wins a tie at equal match score" and "never
  lifts a weak match above a better one". On the branch: 67 of 67 pass.
- 18:10Z to 20:55Z: lane paused (the agent's own API rate limit); no work.
- 20:57Z: base replay (`replay.mts`, base tree): 145 queries in 85 s.
  Fidelity: 145 of 145 first pages identical to live in rows, order, scores,
  matchMode and total. The harness stands; results are read from here on.
- 20:58Z: branch replay (D1 to D3 as designed) and `measure.mts`:
  - bar (a) fails: dev set 9 to 10 of 25 (tuning 6 to 6, held-out 3 to 4;
    1 gained, 0 lost);
  - bar (b) fails on one lookup: exact names 0 losses of 60 (rank 1: 30 of
    30 owner/name, 28 of 30 bare names, before and after), but the project
    name "Blend" lost rank 1: base blend-capital/blend-contracts (used, rank
    1 by usage), branch kalepail/ohloss. D3 sank v1 below v2 and v2 was not
    next;
  - bar (c) holds: 17 of 17 keyword queries with no used row, no successor
    pair and unchanged tokens answer identically; the other 10 change, each
    through a used row or a successor pair (42 of 52 identical in all).
    On base, reflector-contract was rank 1 for "smart account" and
    blend-contracts rank 1 for "token contract"; both leave the first page;
  - battery: sa-03 1 to 1, sa-04 72 to 52, cc-04 39 to 29, cc-03 250 to 213,
    sc-03 71 to 97, sc-04 111 to 159.
- 21:00Z to 21:07Z, tuning-slice diagnosis only (held-out rows not read):
  per-token weights on the 11 tuning misses. Two expected repos are not in
  the index (dev-08 redstone, dev-12 defindex-io/stellar-contracts), two are
  indexed but never enter the 600-row candidate window (dev-09, dev-21:
  null description, repoScore 42 and 43). In the rest, rows matching many
  common words (soroban, contracts, sign, transactions, submit, keys) in
  code symbols (weight 4) win through the coverage multiplier over the row
  that matches the rare words (flutter and dart, pipeline, python);
  canonical floats fire on a word mentioned in passing ("query Horizon",
  "through RPC"); and two answers need vocabulary the index lacks
  ("command-line" for stellar-cli, "python" for py-stellar-base).
  Prototypes on the tuning slice (scratch copy, not on the branch): rarity
  weighting for questions of 4 or more words (each token weighted by its
  rarity in the candidate pool, the formula of `src/lib/prior-art-rank.ts`,
  with and without a coverage multiplier), and a supplement fetching only
  the rarest anchors: 6 of 17 in every variant, ranks moving both ways
  (dev-03 35 to 6, dev-15 87 to 10; dev-13 36 to 70, dev-17 28 to 58).
- 21:08Z, decision rule fixed before the next prototype: a mechanism beyond
  D1 to D3 joins the branch only if it gains at least 3 tuning questions in
  the top 5 with none lost; only then are held-out, battery and the
  regressions read for it.
- 21:09Z to 21:12Z, more tuning-slice prototypes after the rule: two
  synonyms (python also py, command-line also cli), rarity with the
  rare-anchor supplement and the synonyms, a coverage multiplier capped at
  3 words, a code-symbol weight of 2 for questions. 6 of 17 each, one 5 of
  17. None meets the rule; none joins the branch (`prototypes.txt`).
- 21:09Z: D3 fallback applied, as the 18:01Z amendment fixed: the successor
  takes the old row's slot and the old row sits directly below. New test
  "the successor takes the old row's place, so a name query keeps the
  project first". Failing first again: 10 failed, 58 passed of 68 on the
  base sources (`failing-first.txt`); 68 of 68 on the branch.
- 21:10Z: branch replay and `measure.mts` (`report.txt`, `results.json`):
  - bar (a) fails: 9 to 10 of 25 (tuning 6 to 6, held-out 3 to 4;
    stellar/quickstart 18 to 4 gained, none lost);
  - bar (b) holds: 60 of 60 lookups keep rank 1 where they had it, and Blend
    and Reflector keep a repo of the project first;
  - bar (c) holds: 17 of 17, 42 of 52 identical in all;
  - battery as at 20:58Z.
- 21:12Z to 21:17Z: ablation on a scratch copy with one switch per fix; all
  three off reproduces the base replay (145 of 145 pages and full rankings).
  D1 alone 9 to 9; D2 alone 9 to 9 (gains dev-14, loses dev-20); D3 alone 9
  to 9 (`ablation.txt`).
- 21:18Z: held-out rows read after the design was closed; nothing changed
  from them. They show the filler list misses inflections ("adding" in
  dev-10), recorded as a limit.
- 21:19Z, read-only: the DeFindex project row (`/api/projects?where[slug]
  [equals]=defindex&depth=0`) links paltalabs/defindex in links.github and
  github.repos; the index holds that repo archived, tier community, with
  successorRepo defindex-io/stellar-contracts, which is not indexed. The
  data change and its lanes are in the audit README; nothing run.
- 21:21Z to 21:24Z, checks: `pnpm contract:write`, then
  `CONTRACT_BASE=origin/main pnpm contract:check`: OK (descriptions 42
  operations, longest 600). `pnpm typecheck`: exit 0. `npx vitest run
  src/lib/ src/components/ src/app/ src/collections/ src/data/
  --maxWorkers=4 --minWorkers=1`: 214 files, 2,678 tests passed, none
  skipped, exit 0. `pnpm exec biome check` on the changed files and the
  audit folder: 0 errors, 1 warning on an unchanged line. `pnpm raven:gate
  --raven <scratch stellar-raven>`: "Raven would ACCEPT 1.9.106", exit 0
  (2 questions moved, both gains; 0 hit to miss). The only description
  edited is the Repo schema's `successorRepo` field.

## Outcome

One commit on `lane/r4-repos-ranking`, not pushed. Bars: (a) fails (dev set
9 to 10, needed 15), (b) holds, (c) holds. The fixes remove the defect the
battery found (a used project-linked row leading pages it barely matches;
punctuation that kept stopwords in and content words out; a superseded
repo above its successor) but do not make natural-language questions find
their repo. Shipping is the orchestrator's call on that basis. Moved to
`improvements/TODO.md` (Next): natural-language repo questions (the 15
misses and why), and the DeFindex successor data change.
