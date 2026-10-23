# 2026-10-23: a prize category served as a winner's award

Round ledger: `../../rounds/2026-10-23-prize-labels.md`.

## Question

Live 1.9.101 served every Stellar Hacks: Real-World ZK winner
`award: "$10,000 XLM Prize"` beside its own prize (Umbra Wallet:
`hackathonPlacement` "3rd Place - $1,250 in XLM", `prizeUsd` 1250). The
text is the title of the DoraHacks award the event's five placements sit
in. An agent reading `award` reports each winner as having won $10,000.
Which surfaces serve it, where does it come from, on which events does the
pattern occur, and what change stops it without touching award text that
is a winner's own prize?

## Where the field comes from

`fetchWinnerPrizeMap` (`src/lib/integrations/dorahacks.ts`) reads DoraHacks'
`/api/v1/hub/hackathon-winner-assignments`: `award_list[]` entries, each
with a `title` and `prizes[]`, each prize with a `name` and its buidl ids.
Each winning buidl gets `placement` = its prize's name and `award` = the
entry's title; `scripts/sync-hackathon-builds.ts` stores both. An organizer
who puts several placements in one award makes that title a category, often
named for the whole pool ("$10,000 XLM Prize", "10K Prize Pool").

## Surfaces that served `award`

| surface | field | changed |
| --- | --- | --- |
| searchHackathonBuilds | `builds[].award` | yes |
| getHackathon | `winners[].award`, `submissions[].award`, `hackathon.stats.hiddenWinners[].award`, and `stats.winnersNote` (text built from hidden winners) | yes |
| getHackathonSubmission | `build.award`, `build.entries[].award` | yes |
| reviewSubmission | `review.submission.award` and its `entries` (same shape) | yes |
| `/builders/{username}` page | "placement · award" line | yes |
| vetIdea prior art, hackathonBrief (and its vet block) | `placement` only, no award | no |
| analyzeHackathonSubmissions, compareHackathons | no award | no |

## The rule and the fix

Rule (from the brief): within one event, the same award text on winners of
different placements names their category. Amounts are parsed from
placements, so different amounts are different placements. The same text
on winners of one placement is each one's own prize, as is an award that
holds a single winner.

Fix: `prizeCategories` and `prizeLabels` (`src/lib/integrations/dorahacks.ts`)
apply the rule at read time over the winners each surface holds (the index
for search, review and the builder page; the event's roster for
getHackathon; a read of the submission's events' winners for
getHackathonSubmission, which answers 503 when that read fails). Every row
that serves `award` also serves `awardCategory`. On a category row `award`
is null and the title is `awardCategory`; otherwise `award` is unchanged and
`awardCategory` null. Stored data, the sync and search matching are
unchanged (matchedTerms still reads the title's words). Additive key; one
semantic narrowing of `award`, declared in the spec field descriptions and
the changelog.

## Sweep (`sweep.mjs`, `sweep.txt`)

Every listed event's getHackathon, read-only, 2 s apart, 27 events,
apiVersion 1.9.101 at the start and the end (21:01 to 21:02Z). Same award
text on winners of different placements: 7 events, 34 winners.

| event | award text | winners | placements |
| --- | --- | ---: | --- |
| stellar-hacks-zk | $10,000 XLM Prize | 5 | 1st to 5th, $5,000 to $750 in the placement |
| stellar-agents-x402-stripe-mpp | 10K Prize Pool | 5 | 1st to 5th Place |
| scaffoldstellar | Hackathon Winners | 5 | 1st to 5th Place |
| stellar-hacks-kale-reflector | KALE x Reflector Winners | 10 | 1st to 10th Place |
| stellar-hacks-paltalabs | Soroswap - Defindex Composability Award | 3 | 1st to 3rd Place |
| stellar-hacks-blend | Blend Composability Award | 3 | 1st to 3rd Place |
| build-on-stellar | Build Better Prizes | 3 | First to Third Place |

Unchanged, award text that is each winner's own prize: 19 award texts on 32
served winners and 1 hidden winner in 5 events (stellar-hacks-zk-gaming,
one award per winner with its place and amount; buildonstellarchile, two
prize texts given to 10 and 5 winners of one placement, the hidden winner
among the 10; ideaton2026; ideatontelluscoop; stellar-latam, whose Track 2
prize has two co-winners). No award text: 5 events with winners
(alebrije2026 and four events off DoraHacks). No winner served: 10 events.

## Method (read-only, no database)

1. `capture.ts <dir>`: 39 GETs 2 s apart, apiVersion 1.9.101 at the start
   and the end. The listing, `analyze?facet=category`, the 10 replay
   events' pages and every builds row of them (981), and the 10
   hand-checked winners' detail. The capture stays in scratch: it carries
   third-party project text.
2. `replay.test.ts` (config `vitest.replay.config.mts`): the real GET
   handlers of getHackathon, searchHackathonBuilds and
   getHackathonSubmission over an index and store rebuilt from the
   capture, the clock pinned, no network. 37 requests: 10 event pages, 15
   builds pages by event (every row), `winnersOnly=1`, a q on award text
   (`q=xlm prize` in stellar-hacks-zk), and 10 submission details. Run on
   the base tree before any code change (`replay-base.json`) and on the
   lane's (`replay-lane.json`, two runs identical).
3. `diff.mjs`: lists every difference between the two runs' bodies and
   classes each against the criteria fixed in the ledger; also checks the
   base replay against the live bodies.
4. `handcheck.mjs`: 10 winners' served fields (the lane replay's
   getHackathonSubmission bodies) against DoraHacks' winner assignments for
   their events, read live at 20:59Z: the data behind each event's winner
   page.

## Results

- Fidelity (`diff.txt`, first section): every base replay body equals the
  live body it was rebuilt from, generatedAt aside, except one detail's
  `project.factsReadAt` (a read-time stamp).
- Replay (`diff.txt`): 0 unintended differences. Two kinds only: the key
  `awardCategory` added beside every served `award`, and 155 award values
  moved to `awardCategory`, all on rows of the 7 listed events: 34 builds
  rows by event, 34 in `winnersOnly=1`, 5 in the q search, 68 on event
  pages (34 winners and 34 submissions rows), 14 in details (7 top level, 7
  entries). The three unchanged events show only the added null key.
- Criterion (a): of 1,741 rows with an award field on the listed events,
  0 serve award text; 155 serve `awardCategory`. Criterion (b): 371 rows
  elsewhere, 0 with `awardCategory`, every `award` byte-identical.
- Hand check (`handcheck.txt`): 10 of 10 pass. The 7 changed winners' award
  entries each hold several differently named prizes (5, 5, 5, 3, 10, 3,
  3), and the served placement is the prize the buidl holds; the 3
  unchanged winners' entries hold one prize, held by that buidl.
- Tests first (`failing-first.txt`): 13 failed, 133 passed, before any
  implementation; all pass after. With the fix reverted
  (`fix-reverted.txt`, the final 7 test files on origin/main's code): 13
  failed, 141 passed.
- Routing (`raven-gate.txt`): ACCEPT 1.9.109; the same command on
  origin/main prints the same lines but the candidate version, so these
  field descriptions move no routing.

## Not changed, noted

- `prizeUsd` stays parsed from the placement alone, so it is null on the
  22 winners whose own award names the amount (zk-gaming 5,
  ideatontelluscoop 3, buildonstellarchile 14); their `award` serves it as
  text. vetIdea and hackathonBrief serve `placement` only, "Winners" for
  those.
- A hidden winner's placement does not count toward the rule (search reads
  only served rows). No event has a hidden winner in a category today.
