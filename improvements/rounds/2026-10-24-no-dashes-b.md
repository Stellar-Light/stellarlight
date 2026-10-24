# 2026-10-24: no em or en dashes in served text, part B, and the guard

## Scope

Part A (`improvements/rounds/2026-10-23-no-dashes.md`, #1867) cleaned the
knowledge notes, the pages, the components, the integrations, the quality
artifacts and every API route except `api/hackathons`. This round does the rest
of the served text and adds the check that keeps it clean: the OpenAPI spec
(`src/lib/openapi-spec.ts`, with `specs/openapi.json` and
`api-client/src/schema.ts` regenerated), the changelog (every entry), the skill
markdown under `public/skills/**` and its inlined mirror, the MCP tool text
(`scout-mcp/src/index.ts`), `src/app/api/hackathons/**`, the hackathon libs,
`src/collections/**`, `src/data/**` and the other `src` files. Out of scope:
code comments, test files (updated only where they pin a changed string),
stored database text, and model prompts (left, listed as kind `prompt`).

Measure: `improvements/audits/2026-10-24-no-dashes-b/` (README first). Target: 0
unlisted lines, enforced by `scripts/check-no-dashes.ts --check` in the contract
gate.

## Lanes

| lane | author (model, effort) | write set | output |
| --- | --- | --- | --- |
| W2: no dashes, part B | Claude Sonnet 5.5 as reported by the runtime, effort default (the brief named the commit trailer Claude Opus 5.5; the trailer follows the brief) | own worktree, branch `lane/w-no-dashes-b` off `origin/main` (08543ae9, spec 1.9.110): the files above, `scripts/check-no-dashes.ts`, `scripts/no-dashes-allowed.json`, `.github/workflows/contract-gate.yml`, the audit folder, this ledger | commits on the branch, not pushed |

## Review

Not reviewed yet. Points a reviewer should break: the choice of a semicolon
over a colon where a label already carries a colon (hundreds of changelog
entries); the two code formats that changed their separator (the degraded-read
warning, whose parser moved with it, and `composeAuditTitle`); the 28 new
`prompt` entries for the repair and task lane prompts; and the Raven gate's two
gains (below), which come from punctuation alone.

## Log

Append-only. Counts are exact; times are omitted.

- Base `origin/main` 08543ae9 (spec 1.9.110); worktree `dash-wt`, branch
  `lane/w-no-dashes-b`. Part A's counter does not export its logic, so
  `scripts/check-no-dashes.ts` carries the same scan (TypeScript parse, strings,
  templates, JSX text, a dash as a literal, an escape or an entity) and widens
  it to the markdown under `public/skills/**` and `scout-mcp/src/index.ts`.
- Test first. On main, with part A's 81-entry list:
  `pnpm exec tsx scripts/check-no-dashes.ts --check` exit 1,
  `no-dashes: 1333 unlisted line(s) with an <EM> or <EN> in served text.`
  (`before.txt`: 1,403 lines and 1,808 dashes in all, 70 lines listed.)
- Extracted every served-text dash with its offset (1,580 outside the generated
  skill mirror), proposed a code from the context, then read all 1,580 in
  context and overrode the proposal on 426 (a label with a colon already took a
  semicolon, a pair round a list took a colon and a comma, and so on).
  Applied by offset: only the dash, the spaces round it and, for six sentence
  starts, the first letter of the next word changed.
- `scripts/sync-scout-skill-mirror.ts` regenerated `stellar-scout-skill.ts` from
  the markdown (34,420 chars).
- 32 dashes left on purpose and listed: 28 prompt (the repair lane and task
  lane prompts), 3 functional (the entity table, a clause cut), 1 quote (a
  README header quoted in a successor note).
- Rewrote the two code formats that carried a dash: `degradedWarning` and its
  parser (`degraded-read.ts`), and `composeAuditTitle` (`audit-identity.ts`,
  called only from its test). Updated the five tests that pinned a changed
  string.
- Normalizing diff over 60 changed files: 0 files whose words changed (see
  `normalized-diff.txt`); case-sensitive, 6 sentence-start capitals and two
  ranges the tokenizer splits.
- Version `src/lib/version.ts` 1.9.110 to 1.9.116 (placeholder, renumbered at
  merge); changelog entry (api, mcp, skill; type changed) naming the guard and
  saying no meaning changed; `pnpm contract:write`: `specs/openapi.json` and
  `api-client/src/schema.ts` regenerated.

### Checks

| check | result |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run src/lib/ src/components/ src/app/ src/collections/ src/data/ --maxWorkers=4 --minWorkers=1` | 222 files, 2,882 tests passed (first run: 18 failures in 6 files, 5 of them pinned strings, 1 a capital in a hackathon-brief sentence fixed in the source) |
| `pnpm contract:write` then `CONTRACT_BASE=origin/main pnpm contract:check` | exit 0; includes `routing-surface-check: OK` (every operation description at most 600 characters) |
| `scripts/check-writer-conformance.ts` | all writers conform |
| `scripts/check-answer-dating.ts` | GREEN: 70/100 dated, no new undated, 30 carried as debt |
| `scripts/eval/route-exports-check.ts` | 86 route files export only handlers and config |
| `scripts/eval/changelog-contract-check.ts` | newest entry quotes 0 identifiers, all exist |
| `scripts/check-no-dashes.ts --check` | exit 0: 95 listed, 0 unlisted, 0 stale. A planted dash in a string of a new `src/lib` file and in a new skill markdown file: exit 1 with file and line; a dash in a comment: ignored |
| `pnpm raven:gate --raven <raven-src>/stellar-raven` | Raven would ACCEPT 1.9.116: legacy top1 220 (accepted 219), top3 298, top5 326; skills, holdout unchanged; extended top3 112 (baseline 111); 2 questions moved, both gains, 0 hit to miss; 64 top-5 lists changed. The gate's own cause lines: `q-defi-stellarx-what-is` (a gain, searchHackathonBuilds #1 to #4, "words +keywords[development, foundation]") and `q-edge-scf-v7-centralization-myths` (a gain, scfPitch #5 to #2, "words +routingKeywords[take]"). The words are the same on both sides; the lexical index reads them differently once the dash is a colon, a semicolon or a parenthesis |
| `cd scout-mcp && pnpm install --frozen-lockfile --offline && SMOKE_READ_ONLY=1 pnpm test` | 85 passed, 1 failed, 3 skipped. The failure, "audit covered every tool and parameter: 89 parameters of 88", is on main too: #1881 added the `hackathon` parameter to `review_submission` without updating `DECLARED_PARAMETERS` in `test/smoke.mjs`; no parameter changed here. (The suite reads the live API, read only; run with `SMOKE_READ_ONLY=1`, so its feedback session posted nothing.) |
| `biome check --linter-enabled=false` on the 57 changed ts/tsx/mts files and the new script | clean (no fixes applied); `biome lint` on the 56 changed files: 14 warnings (not compared with main; no code line was touched) |
| `gitleaks git --log-opts="origin/main..HEAD" --redact --no-banner` | no leaks found |

## Left on purpose

| kind | dashes | lines | files | why |
| --- | --- | --- | --- | --- |
| quote | 56 | 46 | `repo-knowledge.ts`, `repo-relations.ts` | quoted verbatim from upstream |
| prompt | 52 | 42 | part A routes and component; `repair-lane.ts`, `task-lanes.ts` | model instructions; measuring a change needs model credit |
| internal | 3 | 3 | part A | caught error, image-load error, console line |
| functional | 4 | 4 | `fix-descriptions` route, `decode-entities.ts`, `quality-text.ts` | handles the character |

## Outcome

Nothing is pushed, no PR is open. Part B and the guard are on `lane/w-no-dashes-b`.
The product is at 95 lines and 115 dashes, all listed; the check is 0 unlisted.

Left for the orchestrator and the owner:

- Renumber the spec version and the changelog date at merge (placeholder 1.9.116).
- The prompts (52 dashes) and the 28 new prompt entries: rewrite only with a
  measurement on the concierge and `/ask` paths (and, for the lane prompts, a
  repair or task run).
- Raven re-baselines on the new descriptions after merge; the gate says ACCEPT
  with two gains and 64 changed top-5 lists, and Raven is pinned at 1.9.61.
- Fix `DECLARED_PARAMETERS` in `scout-mcp/test/smoke.mjs` (88 to 89), a
  failure that predates this branch.
- External readers of the degraded-read warning (it is served in
  `meta.warnings`): the separator changed from a dash to a semicolon.
- Stored text (titles, labels, descriptions in Mongo) changes when the lanes
  that write it run again; `scout-mcp` is not republished by this branch.
