# 2026-10-23: opt-in compact rows for agent scripts (spec 1.9.98)

## Scope

An agent calling Scout from a sandboxed script gets its result cut at
24,000 characters, front kept. A measurement on 2026-08-18 found
projects/search `q=lending` about 90 KB and repos/search `q=soroban` about
60 KB, with no lever to shrink them: `limit=5` only halved the page and
`fields=` does not reach `codeReferences`. The owner had parked any change to
the response shape and has now asked for the safe form: opt-in only, with
default responses byte identical.

Done means: sizes re-measured live for the operations an agent script calls;
one opt-in lever; a typical compact page at the default limit under 24,000
with meta first; defaults proven unchanged by a replay; spec, changelog and
contract in step; the Raven gate accepts.

## Lanes

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| R: compact views | Claude Opus 5.5, high | own worktree, branch `lane/r-compact-views`: `src/lib/compact-view.ts`, the projects and repos search routes and their tests, spec, changelog, version, contract artifacts, `improvements/audits/2026-10-23-compact-views/`, this ledger | a commit on the branch, not pushed |

Not touched: `src/lib/hackathon-builds.ts`, `src/lib/hackathon-build-links.ts`
and the sync scripts (lanes L2 and N). The builds route needed no change.

## Method (fixed before any result was read)

- Sizes: read-only GETs 2 s apart against the live API, API version read at
  the start and the end. Full = the body's length in characters. Compact =
  the same body through the function the routes apply, so the number is what
  `view=compact` serves for that body.
- Default unchanged: the real handlers replayed over live-shaped fixtures with
  the clock pinned; sha256 of every body on the base commit, before any
  change, and on the final code; they must be identical.
- Ship only if every compact page at the default limit is under 24,000 and
  starts with meta, and the replay is identical.

## Log

- Base: `origin/main` 02d7deba (spec 1.9.94). Raven checkout pinned at
  Scout 1.9.61 (gate port b1dc866).
- Catalog check: Raven exposes 30 Scout operations; the four search
  operations plus the default list endpoints were measured.
- First live probe (13:20Z): projects `q=lending` 87,184 chars, repos
  `q=soroban` 77,378, research `q=soroban lending` 11,731, builds
  `q=payments` 19,963. Field breakdown in the audit README.
- Captured `fixtures/` (projects `q=lending`, repos `q=soroban`).
- `replay.test.ts` on the base commit, before any change:
  `replay-base.json`, 10 requests; run twice, identical (`cmp` exit 0).
- Tests first: `src/lib/__tests__/compact-view.test.ts`,
  `src/app/api/repos/search/__tests__/route.test.ts`, a view block in
  `src/app/api/projects/search/__tests__/route.test.ts`. Run before the
  implementation: 2 files could not import `@/lib/compact-view`, 4 projects
  tests failed (`failing-first.txt`).
- Decision: research and builds take no `view`. Both fit at their default
  limits (9,238 to 21,225 and 17,444 to 19,935); their weight is the passage
  text and build descriptions an answer quotes; builds rows leave keys out on
  purpose (absent is unknown), which a same-keys compact row would turn into
  null (checked, none).
- Implemented `src/lib/compact-view.ts` (plans, `viewParamError`,
  `withView`) and two-line hooks in each route. The first form re-indented
  the response literals (425 changed lines in projects/search); reverted and
  redone curried, `view({...})`, so the literal keeps its indentation (22
  lines).
- The param-list parity test (`unknown-param-warning.test.ts`) failed on
  repos/search: `view` declared but not read by the route source. The lib
  now takes the raw values, so the route reads `sp.get("view")` itself.
- `measure.ts` final run, apiVersion 1.9.94 at start and end, 13:45:12Z to
  13:46:37Z: projects compact 17,770 to 22,771 over 7 default requests (full
  60,316 to 87,157), repos compact 12,803 to 13,096 over 4 (full 59,709 to
  77,322). Tables in the audit README.
- `replay-lane.json` on the final code: `cmp` with `replay-base.json` exit 0.
- The captured fixtures carry third-party prose (one project description
  names a person) and 27 dashes. Prose fields set to fixed sentences, dashes
  to hyphens; replay rerun with the base commit's two route files
  (`git checkout 02d7deba -- <routes>`, then the lane files restored from a
  copy) and with the lane's: `cmp` exit 0. These are the committed
  `replay-base.json` and `replay-lane.json`.
- Spec 1.9.98: `components.parameters.view`, `CompactView` schema (meta.view;
  its description lists the compact keys from the plans), count keys on
  Project and Repo, `meta.view` on both search responses. A literal
  `enum: ["compact"]` tripped the enum-literal ratchet (99 against 98);
  replaced by a description.
- `pnpm raven:gate --raven <checkout>`: ACCEPT 1.9.98. Same totals as the base
  spec 1.9.94 (also ACCEPT), the same 2 questions moved (gains, both from
  earlier releases); top-5 lists changed 59 against 58 on the base, so this
  change reorders one top-5 list and moves no hit.

## Checks

| check | exit |
| --- | --- |
| `pnpm exec tsc --noEmit -p tsconfig.json` | 0 |
| `npx vitest run src/lib/__tests__ src/app/api --maxWorkers=4 --minWorkers=1` (181 files, 2266 tests) | 0 |
| `pnpm contract:write`, then `CONTRACT_BASE=02d7deba pnpm contract:check` | 0 |
| `pnpm raven:gate --raven <checkout>` | 0 (ACCEPT) |
| `pnpm exec biome check` on the changed files | 0 |
| replay `cmp replay-base.json replay-lane.json` | 0 |

## Outcome

`view=compact` on searchProjects and searchRepos; defaults byte identical on
the replay. Open: projects `q=lending` compact is 1,229 under the cap, so a
page of long descriptions can exceed it (`limit=10` halves it); the six list
endpoints over the cap (skills, partners, leaderboard, builders, audits,
stablecoins) can adopt the helper later; not deployed, so the compact sizes
are computed from live bodies, not served.
