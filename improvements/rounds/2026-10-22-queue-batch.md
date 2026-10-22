# 2026-10-22: queue batch (errors, spec honesty, short ideas, missing winners)

## Scope

Work the queue items found on 2026-10-20 to 2026-10-22 that need no owner
action first: unknown hackathon filter values answer 400 (Now 3); rate-limit
waits in text an agent keeps (Next); served fields and nulls declared and
matchPartners marked not side-effecting (Now 5, Next); short ideas get prior
art or an honest absence (Now 4); and a read-only evidence pass on events
whose pages announce winners we serve as 0 (Now 7). Owner actions stay open:
curated-builds execute, gone-repos execute before 2026-10-27T10:59Z, push
protection, the Raven issue note, Grok credits.

## Lanes

Orchestrator: Claude Opus 5.5. Each lane gets the common brief plus its own,
in its own worktree, and returns results and evidence, not a transcript.

| lane | model | write set | version |
| --- | --- | --- | --- |
| A: errors agents can act on | Claude Opus 5.5 | `src/lib/hackathon-build-query.ts`, `src/lib/api-error.ts`, 429 routes, spec error schemas, tests | 1.9.88 |
| B: the spec says what we serve | Claude Opus 5.5 | `src/lib/openapi-spec.ts` response schemas, `scripts/contract/`, tests | 1.9.89 |
| C: short ideas, honest prior art | Claude Opus 5.5 | `src/lib/vet-idea.ts`, tests, its spec block | 1.9.90 |
| D: announced winners served as 0 | Claude Sonnet 5.5 | none (report only) | none |

Versions are provisional; the merge train renumbers them.

## Review

Each branch gets a fresh-context Claude review on a different model from the
author's. Grok, the other-family challenger, returns 402 (usage balance
exhausted) until its credits are restored; reviews say so.

## Log

- 16:15 UTC (orch): #1848 merged as 5c589e06 (16:11:45Z) after its five
  check-runs read success on head 9602b399. Lanes A, B and C started in
  their own worktrees from 5c589e06 (Claude Opus 5.5 each); lane D started
  read-only (Claude Sonnet 5.5).

- 16:15 UTC (orch): queue item 10, cause measured, read-only. "recent"
  fires recency intent (`RECENCY_INTENT_RE`, `src/lib/research-rank.ts`),
  which sorts by 0.6 x confidence + 0.4 x dated freshness (half-life 120
  days). With the live confidence values the Bell posts (0.53, 2 days old)
  score 0.713 and the Zipper guide (0.82, 140 days) 0.670, below four
  fresher and less relevant rows. A multiplicative blend would lift the
  undated "Software Versions" page back to the top, the failure the dated
  re-sort was built to stop, so the fix needs an A/B on the golden set and
  the recency questions before it ships.

- About 16:53 UTC (lanes): A on `lane/a-actionable-errors` (9cc8023c,
  b2213aab, 1.9.88), B on `lane/b-spec-honesty` (c9ef671f, 1.9.89), C on
  `lane/c-short-idea-prior-art` (e6431d06, 1.9.90); each reported tsc 0,
  contract:check 0, vitest passing except tests/int/api.int.spec.ts (Payload
  secret), raven:gate ACCEPT, and a failing-first run. C measured 36 short
  ideas written before results (23 working, 13 held out): builds served 47
  to 75 and 22 to 39, 0 lost; a blind labeler graded the 45 added builds 25
  same idea, 11 related, 9 words only. D read 13 past events served with 0
  winners: 4 have winners on readable pages, 9 have none announced on any
  readable page (each DoraHacks-sourced one reports winner_announced false).
- (orch) D's non-DoraHacks winners confirmed by fetching each source:
  build-on-stellar-philippines-2026 (AbotPera champion, PinkRaft first
  runner-up, Axial second runner-up, Sobre and TyFi best use of Stellar;
  bitpinas.com, 2026-06-08); alebrije2026 (Mañana Seguro, Seyf, Gibbor named
  as winning projects, no places; BAF newsletter, 2026-05-04);
  apac-stellar-hackathon-2026 (Olio, first in the Payment and Consumer
  Application track; risein.com, 2026-09-01; other tracks not found).
  Queue item 7's "stellar-pulso-hackathon says winners were announced" was
  a planned timeline row on its DoraHacks page, not an announcement.

- 17:14 UTC (reviews, Claude Fable 5.1 each, fresh context, read-only
  clones): A "push" with fixes (a listed event with no stored submissions
  should answer 200 with a warning, not a 400 that calls it unrecognised;
  an unbounded model Retry-After; a form showing people the agent hint);
  B "do not push" (the removal check counted every word of any entry that
  mentions BREAKING as announced, so its own entry would let matchPartners
  vanish unannounced; a pinned operation count); C "push" (the old [] was
  a false absence on 12 of 36 ideas), with a guard to add: a one-word idea
  must appear in a build's name or description, not only its prize-track
  text. Each lane got its fix list on the same agent.
- (orch) Item 7's data step needs its own lane after this batch: winners
  for build-on-stellar-philippines-2026 and apac-stellar-hackathon-2026 can
  go in `src/data/curated-builds.ts`, but alebrije2026's submissions are
  already stored from DoraHacks, so marking them winners needs an override
  rather than new rows; the 9 events with none announced need a
  `winnersNote` instead of a bare 0.

- 17:53 UTC (reviews): re-checks returned "push" on all three branches.
  B at adc5b433: the announcement parser failed safe on every fooling
  attempt. C at 7196ef7e: the reviewer re-ran the replay offline and
  reproduced every number (working 47 to 70, held out 22 to 39, 0 lost; the
  guard dropped 5 builds, none labelled same idea). A at 58183086, with
  one small should-fix sent back: a transient partial DoraHacks failure can
  give a listed event a one-off false 400, because the DoraHacks read
  swallows sub-read failures.

- 18:07 UTC (review): A's should-fix landed as aa082cdb (a failed DoraHacks
  sub-read now means could-not-check, not a 400); re-check "push", with all
  nine callers of that read confirmed to receive the same list as before.
  All three branches are reviewed and waiting for the owner's go.

- 18:27:47 UTC (orch): `gh pr merge 1849 --repo Stellar-Light/stellarlight --squash --match-head-commit aa082cdb126f3620d0504de5a2c7e82bbb01d6bd`
  after its nine check-runs read success; merged as 37be24bc, deployed
  18:30:42. Live on 1.9.88, on builds and analyze: `hackathon=Stellar%20Hacks:%20Agents`
  answers 200 with the filter echo `stellar-agents-x402-stripe-mpp` (249
  matched on builds); `hackathon=hackmeridian-2025` answers 200 with the
  "no submissions are stored" warning; `hackathon=nope` answers 400 with 20
  `validHackathons`.
- 18:34:25 UTC (orch): #1850 merged as 439da909 at head
  0a6e077fb5c494f2fd097efd96c848970d77fe8c, after main was merged in (its
  spec diff against main equal to its own change: 94 lines added, 1
  removed) and its eight check-runs read success; deployed 18:37:14. Live
  on 1.9.89: matchPartners declares `x-side-effecting: false`; no non-GET
  operation lacks the flag; getHackathon declares `voteCount` nullable and
  `stats.outcomes` with its four buckets; vetIdea declares `via`.
- 18:41:03 UTC (orch): #1851 merged as ef82a1fb at head
  5f3dade6a26246b20705206359cdac222f9a7dfd, after main was merged in. One
  hunk conflicted in the vet block's `priorArt`; it was resolved to the
  shared `VET_PRIOR_ART_SCHEMA`, which declares every field #1850's inline
  block did plus `buildsBelowEvidenceRule`, and #1850's served-shape tests
  passed on the merged tree (60 of 60 in the five related files). Deployed
  18:44:23. Live on 1.9.90, vetIdea builds listed: "remittance app" 5 (was
  []), "payroll" 5, "escrow" 4 with 1 below the rule, "stablecoin" 1 with 4
  below the rule, "send money home" 2; one-word ideas carry the note; a
  longer idea is unchanged. `pnpm raven:gate --raven <clone> --spec <live
  1.9.90>`: ACCEPT, 220/298/326/112, skills 17, holdout at 10 forbidden
  captures.

## Outcome

Shipped on 2026-10-22: #1849 (1.9.88, actionable errors), #1850 (1.9.89,
the spec says what four operations serve, consumer safety in
contract:check) and #1851 (1.9.90, short ideas get prior art or a
near-miss count), each reviewed by Claude Fable 5.1 on a fresh clone,
fixed, re-checked, merged on green check-runs and verified live. Grok could
not review this round (402, usage balance exhausted). Queue items 3, 4 and
the named fields of 5 are closed; what remains, and what this round found,
is in `improvements/TODO.md`.

