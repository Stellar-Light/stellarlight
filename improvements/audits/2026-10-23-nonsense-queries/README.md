# Nonsense queries on build search

Evidence for lane L of `improvements/rounds/2026-10-23-build-matching.md`.

**Verdict: the rule that drops rows was not shipped; an honesty-only warning
was.** Rule L (a name match no longer admits a build alone when most of the
query's concepts occur in no build as whole words) empties
`q=quantum llama sandwich` and loses no labeled build, but cuts the fresh
nonsense battery's builds by only 19% in keyword mode and 14% in hybrid,
short of the half it was held to. What ships changes no row: on
searchHackathonBuilds, when most of the words searched in q occur as a whole
word in no submission and a build is listed by its words alone, meta.warnings
names those words and says such a build is not evidence that the idea was
built (spec 1.9.94).

## Ship criteria (fixed in the brief, before any result)

- (a) Recall: on all 140 labeled ideas, keyword and hybrid, on the builds
  route, no build graded 2 leaves the matched list or the top 20.
- (b) Shared code: vetIdea's five and hackathonBrief's picks identical to the
  base on all 140 ideas, or no build graded 2 leaves them.
- (c) Nonsense: on the fresh battery, the builds returned fall by at least
  half, and at least 12 of 24 queries return 0, in keyword and in hybrid.
- (d) Probe: `quantum llama sandwich` returns 0 in keyword mode.
- If no rule meets (a) to (d), an honesty-only change that alters no row may
  ship instead, with (c) reported as not met.

## Data

- **Fresh battery.** `nonsense-fresh.frozen.json.txt`: 24 queries (8 plain, 8
  with one tech word, 8 with a Stellar or payments word), written by a
  separate agent (Claude Sonnet 5.5) told no rule, frozen
  2026-10-23T02:09:22Z. The bytes are unchanged, sha256
  `bcf55577f7671d057e5e140a82073715ac8315434992424b587dc294256dc60a`; the
  `.txt` suffix only keeps biome from reformatting them. No query was edited
  or dropped, and nothing was tuned on it.
- **Fresh capture.** `capture.mjs`: read-only GETs to
  https://www.stellarlight.xyz, 2 s apart: every stored submission in browse
  mode (1,344), and per battery query and the probe the whole keyword and
  hybrid rankings with their meaning scores. 55 ranking pages, every one
  200, every hybrid request served hybrid. `/api/status` apiVersion **1.9.93
  at the start (02:13:07Z) and 1.9.93 at the end (02:15:48Z)**, 2026-10-23
  (`capture.txt`). The raw capture holds upstream descriptions and is not
  committed.
- **Labeled replay.** Lane K's capture of the same 1,344 submissions with 140
  labeled ideas and their live meaning scores (1.9.91), replayed with
  `../2026-10-23-build-matching/replay.mts` and compared with its
  `compare.mts`, unchanged. Before and after are both this tree's code
  (1.9.93) on one capture.
- **Names.** Committed outputs name builds as the API serves them, except
  dorahacks-buidl-42589, whose name holds a product name this repository
  keeps out; it is given by id.
- **Parity of the base replay with live (fresh capture).** Matched count
  equal on 25 of 25 queries in both modes; keyword order 25 of 25; hybrid
  order 21 of 25 (close-score swaps, the API rounds similarity).

## Rule L (measured, not shipped)

Written once, before any fresh result was read (logged at
2026-10-23T02:15Z): a query concept is absent when none of its forms
(plural or singular, synonyms, a hyphenated phrase spaced or joined) occurs
as a whole word in any build's text across the whole index. When more than
half the concepts are absent, a name match no longer admits a build alone;
it needs half the concepts like any other build. Diff: `rule-l/rule-l.diff`.

| criterion | result |
| --- | --- |
| (a) recall, 140 ideas | met: 0 builds graded 2 or 1 move in the matched list, top 20 or top 5, either mode (`rule-l/compare-labeled.txt`) |
| (b) shared code | met: vetIdea's five and the brief's picks identical for 140 of 140 ideas |
| (c) fresh battery | **not met**: builds keyword 538 -> 436 (down 19%), hybrid 683 -> 584 (down 14%); queries at 0, keyword 9 -> 17, hybrid 9 -> 15 |
| (d) probe, keyword | met: 2 -> 0 (hybrid 2 -> 0 too) |

Lost and gained by name:

- **Labeled ideas.** One row changes in all 140: i31 "loyalty points issued
  as tokens" loses Stellar Health Point (graded 0) in keyword and hybrid
  ("loyalty" and "issued" occur in no build). Nothing gained.
- **Fresh battery** (`rule-l/compare-fresh.txt` names every build). Removed
  in keyword mode, 102 builds over 9 queries: blockchain sourdough starter
  7, NFT lawnmower marathon 7, DeFi pancake flipping 18, bitcoin origami
  zeppelin 2, ethereum bagpipe tuner 6, AI toaster opera 37 of 47, wallet for
  pet iguanas 10, lumen bowling alley scheduler 10, stellar kazoo orchestra
  tickets 5. Hybrid removes the same, except 3 of the 7 blockchain builds
  that are close in meaning, 99 in all. Nothing gained.
- **What remains**, and why the rule cannot reach it: pay per yodel 132
  (two concepts, so half is one word: every build that says pay), zero
  knowledge pogo stick 156 (144 match zero and knowledge, half of four
  concepts), smart contract hamster wheel 80, soroban garden gnome registry
  23, soroban pickle juggling 21, anchor ship knot tutorial 14, AI toaster
  opera 10 (ai and "opera" inside longer words). For each, either at most
  half of q's concepts are absent, so a name still admits, or the builds
  cover half the concepts.
- **Lane K's 15-query battery** (reported, not deciding): keyword 20 -> 9,
  hybrid 21 -> 10; queries at 0, keyword 8 -> 14, hybrid 7 -> 13.

No other rule was tried: any rule written after reading the fresh battery's
results would be tuned on it.

## Shipped: a warning, no row changes

`wordsNoBuildUses` in `src/lib/hackathon-builds.ts` returns the concepts of q
that no build in the index uses as a whole word, in any form, in its text or
declared packages (common libraries left out, as matching does). The builds
route adds this to meta.warnings when they are more than half of q's
concepts and at least one listed build matched by words alone (matchedTerms
and no similarity):

> 2 of the 3 words searched in q (llama, sandwich) occur as a whole word in
> no submission in the index (a matchedTerms entry naming one was found
> inside a longer word), so a build listed by its words alone, with no
> similarity, matches only part of q and is not evidence that this idea was
> built

A build found by meaning is scored on the whole query, so it is not covered.
The term building moved into `queryTerms`, shared by the scorer and the new
function.

**Rows are identical.** The replay with and without the change gives the same
output, every field of every ranking: on the 140 labeled ideas (the builds
route in keyword and hybrid, vetIdea's five, the brief's picks and the hash
of the rankings prior art reads) and on the 25 fresh queries. The slim
outputs `labeled/` and `fresh/` `before.json` and `after.json` differ only in
their label line; `compare.txt` in each reports nothing lost or gained.

**Where the line fires** (`note.mts`; `note-fresh.txt`, `note-labeled.txt`):

| set | queries | with rows, keyword / hybrid | line fires, keyword / hybrid |
| --- | --- | --- | --- |
| fresh plain | 8 | 0 / 0 | 0 / 0 |
| fresh tech | 8 | 8 / 8 | 6 / 6 |
| fresh stellar | 8 | 7 / 7 | 3 / 3 |
| probe | 1 | 1 / 1 | 1 / 1 |
| lane K battery | 15 | 7 / 8 | 6 / 6 |
| 140 labeled ideas | 140 | 139 / 140 | 1 / 1 |

The labeled idea is i31 "loyalty points issued as tokens": its only build
listed by words alone is Stellar Health Point, graded 0; Loyal Local, graded
2, is listed by meaning and the line does not cover it. Of the 15 fresh
queries that list builds, it is silent on 6, the queries under "What
remains" other than AI toaster opera: at most half of their words are in no
build.

Against the criteria, for what shipped: (a) met, (b) met (identical), (c) not
met (rows unchanged: 538 and 683 builds, 9 queries at 0), (d) not met (the
probe still lists 2 builds, now with the line).

## Open risks

- The battery's rows are unchanged. An agent that ignores meta.warnings still
  reads "quantum llama sandwich" as two prior-art hits.
- Two-concept queries ("pay per yodel") and queries whose real half covers
  many builds ("zero knowledge pogo stick") get no line: at most half their
  words are in no build. A different rule for those needs its own battery
  written before it runs.
- The vocabulary is the index at request time: a word that a new submission
  uses stops counting as absent, which is intended.
- The line reads the whole index on each q request where a build is listed by
  words alone: one regex pass per absent word over about 1,400 entries.

## Files

- `nonsense-fresh.frozen.json.txt`: the fresh battery, bytes unchanged.
- `capture.mjs`, `capture.txt`: the fresh capture and its log.
- `note.mts`: where the warning fires, per query.
- `note-fresh.txt`, `note-labeled.txt`: its output on the fresh capture and
  on lane K's.
- `labeled/`, `fresh/`: base against the shipped change (`compare.txt`, slim
  `before.json` and `after.json`).
- `rule-l/`: the rule that was not shipped: its diff, both comparisons and
  the fresh battery's slim replay under it.

## Rerun

From the repository root (the capture reads production, read-only; live data
moves, so numbers can change):

```
node improvements/audits/2026-10-23-nonsense-queries/capture.mjs <scratch>/fresh-live.json
pnpm exec tsx improvements/audits/2026-10-23-build-matching/replay.mts <scratch>/fresh-live.json after <scratch>/f-after.json
pnpm exec tsx improvements/audits/2026-10-23-build-matching/compare.mts <scratch>/fresh-live.json <scratch>/f-base.json <scratch>/f-after.json
pnpm exec tsx improvements/audits/2026-10-23-nonsense-queries/note.mts <scratch>/fresh-live.json
```

Run `replay.mts` once with the parent commit's `src/lib/hackathon-builds.ts`
(44407222) for `f-base.json`, and once with `rule-l/rule-l.diff` applied to
it for rule L. The labeled numbers use lane K's capture
(`../2026-10-23-build-matching/capture.mjs`) the same way.
