# Question filler in hackathon build search

Evidence for `improvements/rounds/2026-10-23-question-filler.md` (lane Q1).

**Verdict: C2 ships** (spec@1.9.115 as a placeholder). It meets (a) to (e)
as the ledger fixed them before any replay. One limit the orchestrator
should weigh: criterion (b) is read before the reranker, as the ledger
says. The live order also runs the reranker, which reorders the first 50
rows by name and summary alone. Read live, the battery questions are
expected to meet 3 of 6, not 4 (see (b)).

## What C2 does

`queryTerms` in `src/lib/hackathon-builds.ts`, so the builds route,
vetIdea, hackathonBrief, analyze's q and rule L's unused-words line all
read it. When q is a question, its question marks become spaces before
tokenizing, and 24 words that ask about an outcome or the past stop
counting as concepts:

- won, win, wins, winner, winners, winning;
- prize, prizes, award, awards, awarded, placed;
- hackathon, hackathons, built, builds;
- past, ever, previous, previously, anyone, someone, already, before.

A question here means q ends with "?" or opens with a question word or an
auxiliary (which, who, has, did, is, can and similar) followed by a
space. If dropping the
words leaves no concept, they stay (q=who won? still searches won). A
query that is not a question is unchanged.

`c2.diff` is the candidate as pinned in the method commit (971c9b78). The
shipped `src/lib/hackathon-builds.ts` is that file with one review fix:
the opener must be followed by a space (`(?=\s)` in place of `\b`), so
"how-to win hackathon prizes" is a topic, not a question. Replayed over
every capture (328 queries), C2 with the fix is byte-identical to the
measured C2, note lines included, so every result below holds. C1
(`c1.diff`) drops the same words in every q, question or not.
`ENTRY_WORDS` is not reused because it also holds topic words (event,
team, leaderboard).

## The cause, confirmed

These are the concepts on main for the three questions. The half rule
needs half of them.

| id | concepts |
| --- | --- |
| sa-02 | passkey, smart-wallet, won, prizes, `hackathons?` |
| sc-02 | past, hackathon, winners, built, blend, lending, `protocol?` |
| cc-02 | cross-chain, bridge, ever, won, prize, `hackathon?` |

The question mark stays on the last token. That makes it a concept no
build holds, and it lets "protocol" escape the shared stopword list.

## Data

- **Frozen captures**, the O2 round's, unchanged: lane Z probes 27,
  labeled 158, fresh 25, adversarial 34, review 23, event-in-q 34,
  battery 4. That is 305 queries over a corpus of 1,356 builds, captured
  live at 1.9.99 to 1.9.101.
- **New live captures**, read-only GETs 2 s apart (`capture.mjs`): the
  three battery questions verbatim with winnersOnly=true, and the fresh
  set. Live was 1.9.108 at the start and end of each capture, and every
  page returned 200. The corpus matches the frozen captures' corpus: the
  same 1,356 ids, winners and text.
- **Raw captures** stay in scratch.

**Fresh set** (`fresh-set.json`, sha256 in `fresh-set.sha256`):

- 20 questions: f01 to f15 winners only, f16 to f20 over all builds.
- Written and labelled by a Claude Sonnet agent that saw neither the
  candidates nor any search result. It labelled from the builds' public
  summaries, read from the stored corpus. DoraHacks answers this agent
  with a human-verification page, so the pages themselves were not read.
- Committed (48b1260b) before its capture.
- f01, f13 and f16 have a prize, a win or a winner as their topic.

## Replay

`../2026-10-23-smart-wallet-o2/replay.mts`, unchanged, swapping
`src/lib/hackathon-builds.ts` for base (4cb05ea2), c1 and c2.
`measure/run-replays.sh` restores the file and checks it with `cmp`.

Before any candidate output was read, this round's base replays equalled
the O2 round's shipped replays on all 305 frozen queries, byte for byte,
note lines too. The reranker is not replayed.

## Results (`report.txt`)

### (a) Byte identity: met, both candidates

297 frozen queries hold none of the 24 words and no question mark. All 297
are byte-identical in every field, note lines included (probes 27,
labeled 156, fresh 25, adversarial 33, review 23, event-in-q 31,
battery 2).

C2 also leaves byte-identical the 5 frozen non-questions that do hold a
word, for example "onchain fantasy sports game where winners are paid in
stablecoins from the prize pool". C2 changes only 3 frozen queries:
x402!!! paywall??? and the battery's sa-01 and sa-02 verbatim. C1 changes
those 3 plus 4 non-questions.

### (b) The three battery questions: met as fixed (replay); 3 of 6 expected live

Required items in the replayed route, hybrid, winners only, first 20
rows:

| id | required | live 1.9.107 | base replay | C2 replay (positions) |
| --- | --- | --- | --- | --- |
| sc-02 | 3 | 1 | 1 | 3 (1, 4, 5) |
| sa-02 | 2 | 0 | 1 (DeFi Quest 10th) | 1 (DeFi Quest 3rd) |
| cc-02 | 1 | 0 | 0 | 0 |
| total | 6 | 1 | 2 | **4** |

In keyword mode the total goes from 1 to 4. C1 gives the same numbers.

Read live, the expected count is 3 of 6:

- **sc-02 should hold all 3 live.** It matches 19 builds, so a page of 20
  serves all of them in any order.
- **sa-02 likely loses DeFi Quest live.** sa-02 matches 32 builds, all
  inside the reranker's 50. Live, their order is the cross-encoder's score
  on name and summary alone, and our change cannot move that score.
  DeFi Quest's summary names no passkey; its passkey-kit is a declared
  package, which the reranker does not read. Live 1.9.107 already left
  DeFi Quest out of 20 when 31 builds matched, so with one more match it
  very likely stays out.
- **Not reachable by words.** The sa-02 policy-signers winner has no
  passkey or smart wallet word in its name, summary or packages. Wraith's
  summary on cc-02 is "ZK Privacy on Stellar". Both are reachable only by
  meaning, and neither is among the meaning neighbours captured for its
  question.

What would close the live gap is out of this lane's scope: give the
reranker a build's declared packages, or keep a word match the reranker
would drop.

### (c) No real loss on any frozen set: met

| | C2 | C1 |
| --- | --- | --- |
| graded-2 exits | 6 | 6 |
| swaps (paired with a graded-2 entry) | 6 | 6 |
| real losses | 0 | 0 |
| graded-0 entries into a top 5 | 0 | 0 |

All 6 swaps are on x402!!! paywall???. PayWall.ai, Agent Paywall Router
and Heekowave (each graded 2) take the hybrid top 5, vetIdea's five and
the brief's picks. They replace x402kit and mindVault (graded 2) and
Robots que tributan (graded 1). In C1, event-in-q's "HackMeridian 2025
winners" loses CouvePIX (graded 1) from vetIdea's five, which is not a
real loss under (c).

Reported apart, on the new captures (not frozen sets), these builds
graded 0 enter a top 5 with C2:

- **Battery capture: 4 rows, one build.** On sc-02, Stellar Onboarding
  Hub writes "Blending". A word of four letters or more matches inside a
  longer word, and blend is now that question's only distinctive concept.
  In the same windows, 11 rows graded 0 leave.
- **Fresh set: 5 rows; 12 rows graded 0 leave.**
  - f06: vetIdea's five grows from 4 to 5 with xray.games.
  - f14: GlobalCare enters for "care" inside its name, beside the
    required VETCHAIN.
  - f19: YieldBack.Cash enters in keyword mode.

If the battery counts as a frozen set, the "none may enter" part of (c)
fails on sc-02's 4 rows.

### (d) Fresh question-form set: met

| | base | C2 |
| --- | --- | --- |
| required met, hybrid first 20 (of 37) | 33 | 34 |
| required met, keyword | 5 | 13 |

f14 VETCHAIN enters the hybrid first 20. No question loses a required
item. C1 gives the same numbers. In hybrid the set is mostly carried by
meaning (the base already meets 33).

### (e) Rule L's claims and adversarial probes: met

- `check-unused.py` over C2's lines, with lane K's replay run with C2 and
  rule L off and on: 0 false of 592 claims. The battery and probes captures
  make no claims. C1 also has 0 false (`unused.txt`).
- Lane Z's z09 to z13, winners only and not: byte-identical. The whole
  probes capture is unchanged.

### Why C2 over C1

Both meet every criterion. The ledger's rule picks the narrower scope.
The data shows why gating matters:

- C1 changes 4 frozen non-questions, among them the labeled fantasy-sports
  idea, which loses winners and prize, its own topic.
- The guard test fails with C1.

## Grades (`grades.json`, `grader-prompt.txt`)

- **81 rows** in `grades.json`: every row a criterion or the report reads
  that had no earlier grade. They came from 77 rows on one shuffled sheet
  with no mark of which variant listed a build; the 4 rows of the
  battery's sa-02 question appear twice in the file, once under each
  capture's id (held out sa02-verbatim, held out hm26-sa-02).
  The rows are every build entering or leaving a top 5, top 20 or matched
  list on a changed query (frozen sets, battery capture, fresh set), base
  to c1 or c2.
- **Two independent Claude Sonnet passes**, each in its own order, agree
  on 80 of the 81 rows (76 of the 77 sheet rows). The one disagreement,
  4Bridge on held out hm26-cc-02 (2 against 1), keeps the stricter 1.
- **Earlier grades reused:** the O2 round's `grades.json` and the labeled
  sets' labels.
- Battery questions are named by id; their text stays in scratch.
- Same caveat as O2: one model family for both passes, and the grades are
  drafts pending owner review.

## Tests

`failing-first.txt` holds the new tests on main's matcher: 4 fail, and the
guard (non-questions keep the words) passes. With C2 all 5 pass. With C1
the guard fails.

## Checks

| check | result |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run src/lib/ src/components/ src/app/ src/collections/ src/data/ --maxWorkers=4 --minWorkers=1` | 2,829 of 2,829, 220 files |
| `pnpm contract:write`, `CONTRACT_BASE=origin/main pnpm contract:check` | exit 0, routing-surface-check OK |
| `pnpm raven:gate --raven <stellar-raven checkout>` | ACCEPT 1.9.115 (exit 0), 2 gains and no losses against Raven's baseline |
| biome on the changed files | clean |

The gate's 2 gains come from text already on main; this change edits only
the q parameter's description.

## Open risks

- **Live (b) is expected at 3 of 6** (above). The reranker is not
  replayed, so every window here is before it.
- **The word list is a hand list.** Question phrasings outside it still
  count their words as concepts: "Did any team...", "first place",
  "entries", "exist". A question whose topic is one of the 24 words (a game
  where players win prizes) searches that word only by meaning. f01 and f13
  are such questions; neither loses its required item. So does a question
  asked without its mark: "is prize pool game live" searches pool and game.
- **The opener list is a hand list too.** Not read as questions, so their
  outcome words still count: an imperative ("show me winners that...",
  "list winners who..."), a leading "any", a quoted question, and a q whose
  only "?" is mid-query. An opener joined by a hyphen or an apostrophe
  ("how-to", "do-it-yourself", "who's") is read as a topic (review fix).
  No frozen or fresh query has any of these shapes.
- **Labels come from summaries.** The fresh set was labelled from stored
  summaries (identical to the public DoraHacks text), not from the full
  write-ups.
- **Thin all-builds coverage.** All-builds question form is measured on 5
  fresh questions and the battery's sa-01 verbatim only.

## Files

- `c1.diff`, `c2.diff`: the candidates as pinned.
- `capture.mjs`: the live capture, the nonsense-queries capture with
  winnersOnly per query.
- `fresh-set.json`, `fresh-set.sha256`: the fresh set.
- `measure/`:
  - `run-replays.sh`: replays a variant.
  - `rule-l.sh`: rule L off and on, then `check-unused.py`.
  - `changed.py`: (a).
  - `required.py`: (b) and (d).
  - `moves.py`: (c), every graded move, swaps and real losses.
- `report.txt`: the outputs of all of the above, with battery questions
  by id.
- `unused.txt`: check-unused.py on every capture, c2 and c1.
- `grades.json`, `grader-prompt.txt`, `failing-first.txt`.

## Rerun

1. Set `S` to a scratch folder holding:
   - `captures.json`: capture name to path, the O2 round's seven plus
     `qbattery` and `qfresh`;
   - `hb.<variant>.ts`: `base` is main's file, `c1` and `c2` are main's
     file with `c1.diff` or `c2.diff` applied;
   - `corpus-108.json`: the corpus of any capture;
   - `battery-queries.json`;
   - `grades-q1.json`: `grades.json` with battery ids mapped back to
     their text.
2. Set `WT` to the worktree root.
3. Run the commands below.

```
node improvements/audits/2026-10-23-question-filler/capture.mjs <queries.json> <kind> $S/<capture>.json
for v in base c1 c2; do WT=$WT S=$S improvements/audits/2026-10-23-question-filler/measure/run-replays.sh $v probes labeled fresh2 adv review eventq battery qbattery qfresh; done
for v in c1 c2; do WT=$WT S=$S improvements/audits/2026-10-23-question-filler/measure/rule-l.sh $v; done
cd $S && for f in changed required moves; do python3 -I $WT/improvements/audits/2026-10-23-question-filler/measure/$f.py qbattery qfresh; done
```
