# 2026-10-23: hackathon battery gaps (spec 1.9.92)

## Scope

A 55-question hackathon battery (kept outside the repo) over 11 question
types (precedents, counts, technology, tools, program, decision, feedback,
literature, compare, honesty, outcomes) scored live Scout 1.9.91 at 44 of
55. Its gap list named small contract and text gaps; this round fixes the
ones below, each with a test that fails without the fix. The orchestrator
reproduced gaps 1, 4 and 8 live before the lane started.

1. analyze: a package name as `value` on `facet=library` counted 0 with no
   warning (`value=soroban-sdk` 0, `value=Soroban Rust SDK` 682).
2. partners: `type=on-off-ramp` returned 0; the ramp providers are typed
   `anchor` and carry `rampTypes`.
3. analyze: the description never named its outcome facets.
4. compare: curated events served `source: dorahacks`; a failed curated read
   was swallowed and missing counts were not mentioned.
5. getHackathon: an unknown slug answered a bare 404.
6. builds and analyze counted different units for the same filter (RWA 64
   against 65) and neither said so.
7. reviewSubmission: no category context and no reason when a submission
   has no confident category.
8. Minor: (a) `/api/status` sdfSkills had no `lastUpdatedAt`; (b) the spec
   did not say what a null `judgingCriteria` means; (c) SEP passages served
   `observedAt` null.

Not in scope: build-to-project link coverage, build search over declared
packages, and keyword precision on multi-word queries (other lanes own
`src/lib/hackathon-builds.ts` matching and `src/lib/prior-art-rank.ts`).

## Lanes

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| J: hackathon battery gaps | Claude Opus 5.5, high | own worktree, branch `lane/j-benchmark-gaps`: the routes and libs named in the log, their tests, spec, changelog, version, skill reference, generated contract, `scripts/ingest-seps.ts`, this ledger | one commit on the branch, not pushed |

The orchestrator holds the push, the PR and the independent review.

## Log

- `git fetch origin main && git switch -c lane/j-benchmark-gaps origin/main`:
  HEAD 83e134b2 (spec 1.9.91). `pnpm install --frozen-lockfile
  --prefer-offline` exit 0; `pnpm generate:importmap` exit 0.
- Item 1, failing first (`npx vitest run src/app/api/hackathons/analyze`):
  2 failed, `expected [ { value: 'soroban-sdk', ... } ] to deeply equal [ {
  value: 'Soroban Rust SDK', ... } ]` and `package: expected '' to contain
  "'no-such-pkg'"`. Fix: `distribution()` maps a library-facet value
  through `libraryOf()`; the analyze route warns on any facet when the
  value matches no stored submission and names the values seen (the
  category warning keeps its text and adds the assigned types). After: 30
  passed.
- Item 2, failing first (`npx vitest run src/app/api/partners/__tests__`,
  a new test with a where evaluator over rows in the live shape of
  `GET /api/partners?all=1`): 2 failed, `expected [] to deeply equal [...]`
  and `expected 'No partner of type 'on-off-ramp' is...' to contain
  'type=anchor'`. Fix: `type=on-off-ramp` matches `partnerType` on-off-ramp
  or (`anchor` and `rampTypes in [on-ramp, off-ramp]`, exact element match,
  not the hasMany `contains` substring test); a warning says an anchor with
  no ramp recorded is left out; the empty advisory points to `type=anchor`.
  After: 3 passed.
- Item 3, `pnpm raven:gate --raven <stellar-raven checkout>` before any
  spec edit: exit 0, ACCEPT 1.9.91; legacy top1 220, extended top3 112;
  questions moved 2 (0 hit to miss, 2 gains).
  - Description naming the facet `scf` ("scf (SCF funded or not)"): exit 1,
    HOLD; q-scf-rfp-tooling cardHit5 hit to miss (analyze took #3 on the
    word scf).
  - "scf (grant funding)": exit 1, HOLD, same question.
  - "projectStatus (its status today) and its grant funding": exit 0,
    ACCEPT, the same 2 gains, 0 hit to miss.
  - Reworded to "that project's status today), its grant funding" and
    "Filters as": exit 1, HOLD; q-defi-agentic-payment-standards-compare
    and q-scf-sdf-marketing-grant hit to miss. Reverted to the accepted
    wording.
  - Final (whole 1.9.92 spec): exit 0, ACCEPT 1.9.92; legacy top1 220
    top3 298 top5 326 (accepted 219, 298, 326); questions moved 2 (0 hit
    to miss, 2 gains: q-defi-stellarx-what-is, q-edge-scf-v7-centralization-myths,
    the same 2 as the baseline). The description names projectStatus and
    grant funding but not the literal `scf`, which captured an SCF RFP
    question; the facet parameter names `scf`. 597 characters.
- Item 4, failing first (`npx vitest run src/app/api/hackathons/analyze`,
  compare tests): 2 failed, `expected 'dorahacks' to be 'curated'` and
  `expected false to be true` (no note on a failed curated read). Fix: the
  source comes from the event row; a failed curated read and a failed
  listing read each add a `deltas.notes` line; an event with no stored
  submissions is named as absent, not zero. After: 12 passed.
- Item 5, failing first (`npx vitest run src/app/api/hackathons/`): 1
  failed, `expected 'hackathon not found: stellar-hacks-qu...' to contain
  '/api/hackathons?q='`. Fix: the 404 `error` text carries the pointer to
  getHackathons and up to three closest listed slugs (shared slug words,
  listing order breaks ties), also served as `hint` and `closestSlugs`; the
  404 schema declares them. After: 35 passed.
- Item 6, failing first (`npx vitest run src/app/api/hackathons/builds`): 1
  failed, `expected { indexedBuilds: 9, matched: 1, ... } to match object {
  matched: 1, entries: 2 }`. Fix: `queryBuilds(..., { countEntries: true })`
  reruns the same match over every entry (no second meaning search: the
  semantic scores are reused) and builds serves `meta.counts.entries`; both
  descriptions name their unit. After: 69 passed across the hackathon
  routes.
- Item 7, failing first (`npx vitest run src/app/api/hackathons/review`): 1
  failed, `.toMatch() expects to receive a string, but got undefined`.
  Fix: `review.categoryNote` says why `categoryContext` is null (stored
  categories `[]`: uncertain, not missing; absent: not categorized yet),
  null when it is served. After: 12 passed.
- Item 8a: the registry `https://skills.stellar.org/llms.txt` sends
  `last-modified: Wed, 21 Oct 2026 14:31:05 GMT` (`curl -sI`, 2026-10-23).
  Failing first (`npx vitest run src/lib/__tests__/sdf-skill-links.test.ts`):
  1 failed, `expected undefined to be '2026-10-21T14:31:05.000Z'`. Fix: the
  catalog carries the registry's Last-Modified; status serves it as
  `sdfSkills.lastUpdatedAt`. After: 11 passed.
- Item 8b: failing first against the 83e134b2 spec (`npx vitest run
  src/app/api/hackathons/ -t "null section"`): 1 failed. Fix: `requirements`
  and `judgingCriteria` describe null as a read page with no such section,
  as the route's comment does.
- Item 8c: evidence `GET /api/research?q=SEP-24+interactive+deposit+flow&source=sep&limit=5`
  (battery capture): 5 of 5 rows `observedAt` null. `git log -S` shows the
  stamp was added on the embed path only (a4b93f6f3, 2026-08-14), so a
  chunk unchanged since then is never stamped. Fix: the SEP ingester bulk
  re-stamps every unchanged chunk it read (the shared helper
  `restampObservedAt`, extracted from `upsertChunks`), and its metadata
  update stamps it too. `--replan` does not count the re-stamp as a write.
  No unit test: the script runs against Payload on import. It takes effect
  on the next ingest run. `pnpm exec tsx scripts/check-scripts-types.ts`:
  GREEN, 28 baselined errors.
- Version 1.9.92, one changelog entry, `public/skills/references/api-reference.md`
  updated. `pnpm contract:write`: exit 0.
- First `CONTRACT_BASE=83e134b2 pnpm contract:check`: exit 1, enum
  literals 99 against baseline 98 (a literal enum on compare's `source`);
  the enum was dropped for a description. Rerun: exit 0.
- Final checks (after every edit): see Outcome.

## Live checks after deploy

Against https://www.stellarlight.xyz with apiVersion 1.9.92:

1. `GET /api/hackathons/analyze?facet=library&value=soroban-sdk`:
   `total.values[0]` is `{value: "Soroban Rust SDK", builds: N}` with N
   equal to `?facet=library&value=Soroban%20Rust%20SDK` (682 on 1.9.91), no
   `meta.warnings`. `GET /api/hackathons/analyze?facet=package&value=no-such-pkg`:
   `total.values[0].builds` 0 and `meta.warnings` contains `No stored
   submission has package 'no-such-pkg'`.
2. `GET /api/partners?type=on-off-ramp&region=latam`: at least 4 rows (5
   LATAM anchors carried `rampTypes` on 2026-10-23, one may sit behind the
   quality bar), every row with non-null `rampTypes`, and `meta.warnings`
   contains `type=anchor lists every anchor`.
   `GET /api/partners?type=on-off-ramp&region=asia`: 0 rows and
   `meta.advisory.summary` contains `try type=anchor`.
3. `GET /api/openapi.json`: analyzeHackathonSubmissions description
   contains `projectStatus (its status today) and its grant funding` and
   `Unit: event entries`; Raven's own gate accepts 1.9.92.
4. `GET /api/hackathons/compare?slugs=hackmeridian-2025,hackmeridian-2026`:
   both `hackathons[].source` are `curated`; `deltas.notes` contains
   `submission and winner counts unavailable for` naming each event with no
   stored submissions (hackmeridian-2025 at least).
5. `GET /api/hackathons/stellar-hacks-quantum-2031`: 404; `error` contains
   `GET /api/hackathons?q=` and `Closest known slugs:`; `closestSlugs` is a
   non-empty array.
6. `GET /api/hackathons/builds?category=RWA`: `meta.counts.matched` 64 and
   `meta.counts.entries` equal to `GET /api/hackathons/analyze?facet=category&value=RWA`
   `total.builds` (65 on 1.9.91).
7. `GET /api/hackathons/review?link=https://dorahacks.io/buidl/42765`:
   `review.categoryContext` null and `review.categoryNote` contains
   `uncertain, not missing`.
8. (a) `GET /api/status`: the `sdfSkills` source's `lastUpdatedAt` is an
   ISO date (2026-10-21T14:31:05.000Z as of 2026-10-23).
   (b) `GET /api/openapi.json`:
   `components.schemas.HackathonDetailResponse.properties.hackathon.properties.rules.properties.judgingCriteria.description`
   contains `null = the page was read`.
   (c) After the next research refresh run that ingests SEPs:
   `GET /api/research?q=SEP-24+interactive+deposit+flow&source=sep&limit=5`
   returns every row with a non-null `observedAt` at or after that run.

## Outcome

All eight items fixed on `lane/j-benchmark-gaps` in one commit, not pushed.
Item 3 ships without the literal word `scf` in the description: with it,
Raven's gate holds 1.9.92 on an SCF RFP question. Checks on the final
tree: `pnpm exec tsc --noEmit -p tsconfig.json` exit 0; `npx vitest run
src/lib/__tests__ src/app/api` exit 0 (179 files, 2237 tests; the
integration suite tests/int/api.int.spec.ts is not in these paths and was
not run); `pnpm contract:write` then `CONTRACT_BASE=83e134b2 pnpm
contract:check` exit 0; `pnpm raven:gate` exit 0, ACCEPT 1.9.92; biome
check (formatter, linter off) on every changed ts and json file clean; the
scripts ratchet GREEN. Verified only after deploy, by someone other than
the author, with the live checks above.
