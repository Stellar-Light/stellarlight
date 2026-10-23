# 2026-10-23: question filler in hackathon build search

## Goal

The HackMeridian 2026 priority battery sends its questions verbatim to
`GET /api/hackathons/builds?q=<question>&winnersOnly=true&limit=20`. On
live 1.9.107 its three "which winners" questions (hm26-sc-02, hm26-sa-02,
hm26-cc-02) meet 1 of their 6 required items (sc-02 1 of 3, sa-02 0 of 2,
cc-02 0 of 1). This round tests whether question and outcome words counted
as concepts cause it, and ships a fix only if it meets the criteria below.

## Lanes

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| Q1: question filler | Claude Opus 5.5, high | own worktree, branch `lane/q1-question-filler` off main 4cb05ea2 (spec 1.9.108): `src/lib/hackathon-builds.ts`, its tests, changelog, version, `improvements/audits/2026-10-23-question-filler/`, this ledger | commits on the branch, not pushed |

The fresh question set is written and labelled by a separate agent (Claude
Sonnet, through the Agent tool) that sees neither the candidates nor any
search result. Blind grading of moved rows is done by separate agents
(Claude Sonnet), two independent passes, which never see which variant
listed a build. The orchestrator's independent review follows.

## Review

(pending: the orchestrator's review of the lane's commits)

## Cause, read from the code before any replay

`queryTerms` (`src/lib/hackathon-builds.ts`) keeps every token of
`contentTokens` (shared stopwords dropped) that is not in
`GENERIC_QUERY_TOKENS` or `QUERY_FILLER` ("like", "similar"). The half rule
(`matched.size >= Math.ceil(terms.length / 2)`) and the rarity weights read
those terms. For the three questions, lowercased as the route does:

| id | concepts today | half rule needs |
| --- | --- | --- |
| sa-02 | passkey, smart-wallet, won, prizes, `hackathons?` | 3 of 5 |
| sc-02 | past, hackathon, winners, built, blend, lending, `protocol?` | 4 of 7 |
| cc-02 | cross-chain, bridge, ever, won, prize, `hackathon?` | 3 of 6 |

Confirmed, with one addition: besides the outcome and question words, the
question mark stays on the last token. `hackathons?` and `hackathon?` are
concepts no build holds (matched by substring with the mark), and
`protocol?` escapes the shared stopword list, which drops "protocol". So a
passkey winner covers at most 2 of 5 concepts on sa-02, and a game build
whose summary says "won" and "prize pool" covers as many.

What no word change can fix, from the stored summaries: the sa-02 winner
"Soroban to MCP Server in seconds + Policy Signers Playground" has no
passkey or smart wallet word in its name, summary or declared packages, and
Wraith's summary on cc-02 is "ZK Privacy on Stellar" (no bridge). Each can
be listed only by meaning. So the reachable ceiling by words is 4 of 6
(sc-02 3, sa-02 1 through DeFi Quest's declared passkey-kit, cc-02 0).

## Method (fixed before any replay, 2026-10-23T23:25Z, live 1.9.108)

**Candidates, pinned as diffs against 4cb05ea2 before any replay** (both
change `queryTerms` only; `src/lib/hackathon-builds.ts` sha256 base
034f08d1..., c1 fdc66422..., c2 040dc4ab...):

- **C2** (`../audits/2026-10-23-question-filler/c2.diff`, sha256
  2cf74b78...). When q is a question (it ends with "?" or opens with which,
  who, whom, whose, what, where, when, why, how, has, have, had, did, does,
  do, is, are, was, were, can, could, will, would, should), its question
  marks become spaces before tokenizing, and 24 words stop counting as
  concepts: won, win, wins, winner, winners, winning, prize, prizes, award,
  awards, awarded, placed, hackathon, hackathons, built, builds, past, ever,
  previous, previously, anyone, someone, already, before. If that leaves no
  concept, the words stay (q=who won? still searches won).
- **C1** (`c1.diff`, sha256 61f4cb5c...). The same, for every q, question
  or not.

`ENTRY_WORDS` (`src/lib/event-in-query.ts`) is not reused: it also holds
topic words a build can be about (event, team, leaderboard, demo, list,
place, first), which it drops only after an event's name. The shared
stopwords and `GENERIC_QUERY_TOKENS` are not changed.

**Data.** Lane Z3's captures as the O2 round used them (lanes Z and Z2:
probes 27 runs, labeled 158, fresh 25, adversarial 34, review 23,
event-in-q 34, battery 4; corpus 1,356). New live captures in the same
shape, read-only GETs 2 s apart, apiVersion recorded at start and end: the
three battery questions verbatim with winnersOnly=true, and the fresh set
(d). Raw captures stay in scratch.

**Replay.** `../audits/2026-10-23-smart-wallet-o2/replay.mts`, unchanged
(sha256 b2e7d59c...), per capture for base, c1 and c2, swapping
`src/lib/hackathon-builds.ts` (restore checked with `cmp`). Before any
candidate output is read, this round's base replays of the frozen captures
are compared with the O2 round's shipped (o2m) replays in scratch, byte for
byte. The reranker is not replayed: windows are before it.

**Criteria. A candidate ships only if all hold, base to candidate.**

- **(a) Byte identity.** Every frozen query that holds none of the 24 words
  and no question mark is byte-identical in every field, note lines
  included. Tightened: the same scope for both candidates, so under C2 a
  non-question that holds a listed word must be byte-identical too.
- **(b) The three battery questions.** Required (`must`) items met in the
  replayed builds route, hybrid, winners only, first 20 rows (the window
  the battery grades), from base to at least 4 of 6. For cc-02, Wraith
  counts when listed (the battery also wants its bridge in the served
  detail, which the replay cannot read). Also reported: keyword mode, and
  the live count (1 of 6 at 1.9.107). The battery found this class, so it
  is not held out.
- **(c) No real loss on any frozen set.** A real loss is a build graded 2
  that leaves a top 5 (the route's keyword and hybrid rankings, vetIdea's
  five, the brief's picks), a route top 20 or a route matched list with no
  build graded 2 entering the same window. Swaps (one graded-2 build
  replacing another in the same window) are reported apart, not deciding.
  Builds graded 0 entering a top 5 are reported, and none may enter.
- **(d) A fresh question-form set.** At least 15 questions, written and
  labelled before anything runs on them, committed with their sha256 before
  the capture. Required items met (route hybrid, first 20 rows, as captured
  winners only or not) must rise in total, and no question may lose a
  required item. This set is held out: nothing is tuned on it.
- **(e)** Rule L's unused-words claims stay true (`check-unused.py`, 0
  false) and lane Z's adversarial probes z09 to z13, winners only and not,
  are byte-identical.

If both candidates meet every criterion, C2 ships (narrower scope). If
neither does, nothing ships and the evidence says what would.

**Grading.** Existing grades first (O2's `grades.json` and the lane Z3
grades it names; the labeled sets' labels). Every other row a criterion
reads goes on one shuffled sheet with no mark of which variant listed a
build, graded 2 same, 1 related, 0 words only (ties to the stricter grade)
by two independent Claude Sonnet passes; the stricter grade is kept.

## Log

- 2026-10-23T23:25Z live 1.9.108; candidates pinned; no replay has run.
- 2026-10-23T23:29Z fresh set (d) written and labelled by Claude Sonnet,
  blind to the search system, the candidates and every result, from the
  submission summaries (as published on DoraHacks or curated event pages;
  DoraHacks itself answers this agent with a human-verification page, so
  the summaries were read from the stored corpus, 1,356 submissions, live
  1.9.108, unchanged from the frozen captures' corpus):
  `../audits/2026-10-23-question-filler/fresh-set.json`, sha256
  278ceeee773540b05c3ac9278682ff2a106f497b7344440ee5e37f80315c48d0. 20 questions: f01 to f15 winners only, f16 to
  f20 over all submissions; f01, f13 and f16 are about a prize, a win or a
  winner as the topic itself. Committed before its capture; no query of it
  has run.
- 2026-10-23T23:28Z battery questions captured (3, winners only, live
  1.9.108 at both ends, 6 pages, all 200). Base replays of every frozen
  capture run; no candidate replay has run.
