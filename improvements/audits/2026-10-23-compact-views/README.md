# Compact views for agent scripts (spec 1.9.98)

Lane R, 2026-10-23. Round ledger: `improvements/rounds/2026-10-23-compact-views.md`.

## Problem

An agent that calls Scout from a sandboxed script gets its result cut at
24,000 characters (6,000 tokens at 4 characters each), front kept. On
2026-08-18 a projects/search page was about 90 KB and repos/search about
60 KB; `limit=5` only halved it, `fields=` does not reach `codeReferences`,
and there was no compact view.

## Re-measure (live, read-only)

`measure.ts` runs read-only GETs 2 s apart and records the API version at
the start and the end. Full = the live body's length in characters (the unit
the sandbox cuts at). Compact = the same body passed through the exact
function the routes apply for `view=compact` (`src/lib/compact-view.ts`),
so it is what `view=compact` serves for that body once deployed. Output:
`sizes.md` (table) and `results.json` (raw). Run: apiVersion 1.9.94 at start
and end, 2026-10-23T13:45:12Z to 13:46:37Z.

### Operations that take view=compact

| Operation | Request | Rows | Full chars | Compact chars | Cut |
|---|---|---|---|---|---|
| searchProjects | `q=lending` | 20 | 87,157 | 22,771 | 74% |
| searchProjects | `q=wallet` | 20 | 76,872 | 21,386 | 72% |
| searchProjects | `q=oracle` | 20 | 84,071 | 21,400 | 75% |
| searchProjects | `q=anchor` | 20 | 74,021 | 19,188 | 74% |
| searchProjects | `q=payments` | 20 | 66,016 | 20,192 | 69% |
| searchProjects | `q=dex` | 20 | 70,528 | 18,084 | 74% |
| searchProjects | `type=Wallet` | 20 | 60,316 | 17,770 | 71% |
| searchProjects | `q=lending&limit=5` | 5 | 40,870 | 9,474 | 77% |
| searchRepos | `q=soroban` | 20 | 77,322 | 13,096 | 83% |
| searchRepos | `q=oracle` | 20 | 70,124 | 12,806 | 82% |
| searchRepos | `q=wallet` | 20 | 59,709 | 12,840 | 78% |
| searchRepos | `q=passkey` | 20 | 70,574 | 12,803 | 82% |
| searchRepos | `q=soroban&limit=5` | 5 | 25,868 | 4,165 | 84% |

Every full page is over 24,000, including both `limit=5` pages. Every compact
page at the default limit fits: projects 17,770 to 22,771, repos 12,803 to
13,096, each starting `{"meta":{"view":{"mode":"compact"`. The tightest is
projects `q=lending` at 22,771, 1,229 under the cap: a page whose 20
`shortDescription`s run longer can still go over, and `limit=10` halves it.

The same requests run 11 minutes earlier gave `q=oracle` 64,790 full (18,765
compact) and `q=dex` 94,602 full (20,715 compact): the served rows move between
runs, so read the numbers as typical, not fixed.

Where the bytes go in `q=lending` (87,184 chars, captured 13:21Z):
`codeReferences[].codeVerified` 15,166, `projects[].repos` 10,030,
`projects[].onchain` 8,725, `projects[].shortDescription` 8,473,
`codeReferences[].knowledgeNotes` 2,325. The four detail fields named on
2026-08-18 are 36,246 characters, 42% (was 45%). In repos `q=soroban`,
`codeVerified` is 41,013 and `knowledgeNotes` 11,711 of 77,378 (68%).

### Operations left as they are

| Operation | Request | Rows | Full chars | Fits 24,000 |
|---|---|---|---|---|
| searchResearch | `q=soroban lending` | 8 | 11,708 | yes |
| searchResearch | `q=passkeys` | 8 | 9,238 | yes |
| searchResearch | `q=defi lending` | 8 | 21,225 | yes |
| searchResearch | `q=passkeys&limit=25` | 25 | 24,509 | no |
| searchHackathonBuilds | `q=payments` | 20 | 19,935 | yes |
| searchHackathonBuilds | `q=wallet` | 20 | 17,444 | yes |
| searchHackathonBuilds | `q=nft marketplace` | 20 | 18,004 | yes |
| searchHackathonBuilds | `q=payments&limit=50` | 50 | 44,748 | no |
| listSkills | (default) | 82 | 83,175 | no |
| getPartners | (default) | 43 | 57,263 | no |
| getLeaderboard | (default) | 50 | 51,727 | no |
| getBuilders | (default) | 50 | 50,497 | no |
| listAudits | (default) | 64 | 39,012 | no |
| getStablecoins | (default) | 41 | 27,391 | no |
| getRfps | (default) | 17 | 21,513 | yes |
| analyzeEcosystem | (default) | | 17,723 | yes |
| listContracts | (default) | 20 | 17,623 | yes |
| getHackathons | (default) | 27 | 16,694 | yes |
| getClusters | (default) | 7 | 12,069 | yes |
| getPeople | (default) | 25 | 5,539 | yes |
| getRepoTrust | `repo=blend-capital/blend-contracts-v2` | | 5,413 | yes |
| resolveProject | `q=blend` | | 1,280 | yes |

searchResearch and searchHackathonBuilds fit at their default limits, and
their weight is the passage `content` and build `description` an answer
quotes, so a compact row would drop little but the answer. Builds rows also
leave keys out on purpose (`project`, `stack`: absent is unknown, null is
checked and none), and a compact row that fills every key with null would
turn unknown into none. Neither takes `view`. The six list endpoints over the
cap (skills, partners, leaderboard, builders, audits, stablecoins) are
outside this lane; each can adopt the same helper with a plan of its own.

## The lever

`view=full|compact`, declared once in the spec (`components.parameters.view`)
and read by searchProjects and searchRepos.

- `full`, or no `view`: the response is the same object as before.
- `compact`: each row is rebuilt from a fixed key list
  (`PROJECT_COMPACT`, `REPO_COMPACT` in `src/lib/compact-view.ts`): identity
  (id, name, slug, canonicalSlug, url / fullName, url), rank and score
  (score, confidence score and label, repoScore), and the fields that answer
  the usual question (category, types, shortDescription, status and date,
  deployment network, TVL and date, SCF award, audits / description,
  language, stars, last commit, activity, project, tier, kind, Stellar
  evidence). Left-out lists come back as counts: `reposCount`,
  `onchainContractsCount`, `knowledgeNotesCount`. Same keys on every row,
  null where there is no value.
- `meta.view`, first in meta: `mode: "compact"`, per row array the count keys
  and where the left-out detail is read (the request without `view`, or with
  `fields=<names>`; for `codeReferences`, repos search by fullName), and a
  one-line note.
- `view=compact&fields=...` and any other `view` value answer 400 with
  `validValues`.

## Default unchanged

`replay.test.ts` runs the real GET handlers over live-shaped fixtures
(`fixtures/`: the projects `q=lending` and repos `q=soroban` responses
captured live, with prose fields (`shortDescription`, repo `description`,
`knowledgeNotes[].note`, `tierReason`) set to fixed sentences and dashes
written as hyphens, so the committed files carry no third-party prose; keys,
types and every other value are as captured) with the clock pinned, for
10 requests: default, `limit`,
`offset`, `fields=`, an unknown parameter, and the content-less call, on both
routes. It writes the sha256 of each body.

- `replay-base.json`: the two routes as on the base commit 02d7deba.
- `replay-lane.json`: the lane's final code.
- `cmp replay-base.json replay-lane.json` exits 0: every body is byte
  identical. The same held on the fixtures as captured, with the base run
  on the untouched base checkout before any change was made.

Rerun:

```
REPLAY_OUT=<file> npx vitest run \
  --config improvements/audits/2026-10-23-compact-views/vitest.replay.config.mts
```

The route tests also hold it per operation: no `meta.view`, full rows, and
`view=full` identical to no `view`.

`failing-first.txt` is the new tests run before the implementation: the lib
tests could not import the module, and the 4 projects route tests failed
(`view=full` drew an unknown-parameter warning, no `meta.view`, 200 where 400
was expected).

## Not changed, on purpose

- The unknown-parameter warning text on both routes still lists the
  parameters it listed before, without `view`, so a request with an unknown
  parameter answers exactly as before. The spec declares `view`.
- Operation descriptions (routing text) are untouched.
