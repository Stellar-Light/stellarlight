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
  parser (`degraded-read.ts`), and `composeAuditTitle` (`audit-identity.ts`;
  corrected in review: it is called by `scripts/ingest-soroban-security.ts` for every audit chunk's title and H1, not only by its test). Updated the five tests that pinned a changed
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
- The next run of `scripts/ingest-soroban-security.ts` retitles the chunks of all
  58 audit reports ("Protocol: Auditor") and re-embeds the first chunk of each.
- Stored text (titles, labels, descriptions in Mongo) changes when the lanes
  that write it run again; `scout-mcp` is not republished by this branch.

## Review and fix

Independent review (Claude Fable 5.1, high effort, about 1,190 of the 1,548
edits read) of `6ea34fe7`: "GATE: fix first". Seven items; all done in a third
commit on the same branch. Tests first where code is involved.

| item | finding | result |
| --- | --- | --- |
| 1 HIGH | `recent-hackathon-winners.ts`: 12 `placementLabel` values became "1st: Confidential Wallets"; `placementMeta` in the hackathon page splits at a spaced hyphen, en dash or em dash, so the track chip vanished for all 12 winners (`hackathon-detail.ts:227` maps the label at request time). The page test passed because its fixture kept the old form | Added `src/data/__tests__/winner-labels.test.ts` (every roster label splits into a place and a track): red on the colon form (`expected '1st: Confidential Wallets' to match /^\d+(st\|nd\|rd\|th)$/`), green after the labels were written "1st - Confidential Wallets". Page test fixture changed to the same real form. Both pass |
| 1 sweep | every other rewritten string read at runtime | see "Reader sweep" below; one more regression found and none other |
| 2 MEDIUM | `composeAuditTitle` is called by `scripts/ingest-soroban-security.ts:401` for every audit chunk title and H1 | Corrected in the README and in the Log above; the rewrite stays; the changelog entry says the next ingest retitles all 58 reports and re-embeds the first chunk of each; added to "Left for the owner" |
| 3 MEDIUM | changelog entry did not name the `meta.warnings` format change | Added: the degraded-read warning now reads `<prefix>: <op>; results may be incomplete (<class>)`, where a dash separated the op before. `changelog-contract-check`: 0 quoted identifiers, ok |
| 4 LOW | developer-activity skill copies disagreed (`md:3,125` against `ts:12,104`) | Description now uses a colon in both; the attribution is "**Electric Capital's Open Dev Data**" in both. No sync script exists for this pair (only the Scout one), so both were edited; the Scout mirror was regenerated |
| 5 LOW | wording | All applied (list below) |
| 6 LOW | guard scope | `api-client/src/index.ts` added to the guard (area "api-client error text"); the `ScoutApiError` message is now `Scout API <status> on <url>: <error>`. Red then green: with the old line restored the check exits 1 naming `api-client/src/index.ts:89`. Gaps named in the script header: other markdown, JSON, MDX |
| 7 LOW | `ideas.ts:188, 221, 223, 232, 234` possible upstream quotes | Kept as our rewrite. `git log -S"LayerZero DVN"` gives befeb7fa3 (2026-07-31, #751, "Q3 2026 rollover"), whose message says the briefs are "distilled faithfully from the published RFP text", authored as "SCF Delegates": condensed, not pasted. The published page could not be compared (no network). Listed as an open risk with the lines, so the owner can restore them as `quote` |

Item 5, as applied (words unchanged except the possessive the review asked for):
`openapi-spec.ts` "can lag it; where they disagree, the dated fact wins" and
"VERIFIED mainnet contracts as entities: which contracts exist"; `api-reference.md`
the two field-name list items take a colon like their siblings and "prototype-layer
prior art; DoraHacks submissions" (a semicolon inside the parenthetical);
`stellar-scout.md` "3 projects in this space: interesting; study how they
failed/succeeded."; `hackathons/route.ts` "feed right now: between events.";
`AwardVoters.ts` "Pilot: Decaf team"; `scf-pitch.ts` "Apply via
https://communityfund.stellar.org (rules in the SCF Handbook)." with no period
after the URL; "Electric Capital's Open Dev Data" in the Scout skill, the
developer-activity skill and its copy. The optional double colons: one became a
semicolon in `openapi-spec.ts` (five sentences), `scout-mcp/src/index.ts` (two)
and `repo-relations.ts` (one).

### Reader sweep (item 1)

How: (a) every code line in `src`, `scripts`, `scout-mcp/src`, `api-client/src`
that holds a dash character or escape together with a reader call (`split`,
`match`, `test`, `replace`, `indexOf`, `includes`, `startsWith`, `RegExp`,
`===`); (b) every removed line of the first-pass diff that held a reader call;
(c) every consumer of each module whose strings changed; (d) every workflow line
with a dash.

- `hackathons/[slug]/page.tsx:359` `placementMeta`: reads the roster label.
  Broken by the colon, fixed (above).
- `src/lib/integrations/dorahacks.ts:626` `parsePlacement`: splits DoraHacks'
  own placement text, upstream input. Not affected.
- `src/lib/degraded-read.ts` parser: moved with its writer (first pass); its
  tests updated.
- `scripts/ingest-soroban-security.ts` and `composeAuditTitle`: a writer; no
  reader splits the title. Re-title and re-embed effect noted (item 2).
- `scripts/build-sdf-people.ts` and `ingest-sdf-org.ts` read `extractPersonCards`
  objects (name, role), not the rendered "- name: role" line. Not affected.
- `engine-c-health.yml` opens the SCF drift issue by `title-prefix: "SCF
  round-membership drift"`; the header the guard prints still starts with it.
  Not affected.
- `scripts/refresh-stablecoins.ts` reads `RATE_LIMIT_MARK` in the note, a marker
  constant, not the separator. `scripts/fix-corpus-mirrors.ts` and
  `engine-b-corpus.ts` print the mirror `reason`, no parse.
- `scripts/eval/raven-truth-battery.ts`, `raven-honest-absence.ts` read
  `matchModeLabel` values by enum (`semantic`), not by the label text.
- `scripts/ingest-scf-handbook.ts:48`, `ingest-developers-docs.ts:98`,
  `check-packet-stamps.ts:189,407`: split or decode upstream page titles.
  `research-ingest.ts:678` trims trailing separators from any title. `check-lessons-guarded.ts:59`, `quality/build-progress-artifact.ts:206-215`:
  read repository markdown. `check-note-freshness.ts:98`: part A. Not affected.
- `stablecoin-view.ts` placeholder `-` and `structured-data.ts` name
  `TICKER: Name`: no comparison against the old string in `src`.
- `src/app/api/admin/fix-descriptions`, `quality-text.ts`: functional, listed.
- Workflows: the dash lines in `.github/workflows` are step names, echo text and
  comments; none matches a served string.
- Tests that pinned a string: the five from the first pass, plus the hackathon
  page fixture (item 1). The full run is green.

### Checks after the fix

| check | result |
| --- | --- |
| normalizing check, 62 modified files | words identical except the possessive "s" in 4 files; capitals: 4 in `resolve-project.ts`, 1 in `scf-pitch.ts`; 2 range tokens (`normalized-diff.txt` rewritten) |
| `npx tsc --noEmit` | exit 0 |
| vitest, `src/lib`, `src/components`, `src/app`, `src/collections`, `src/data` | 223 files, 2,883 tests pass |
| `pnpm contract:write`, `CONTRACT_BASE=origin/main pnpm contract:check` | exit 0, routing-surface-check OK |
| contract-gate steps | writer conformance, answer dating (GREEN), route exports, changelog contract and `check-no-dashes --check` (95 listed, 0 unlisted, 0 stale) all exit 0 |
| Raven gate | ACCEPT 1.9.116, same as before: 2 gains, 0 hit to miss, 64 top-5 lists changed |
| `SMOKE_READ_ONLY=1 pnpm test` in `scout-mcp` | 85 passed, 1 failed, 3 skipped; the failure is the 89 vs 88 `DECLARED_PARAMETERS` mismatch from #1881, fixed on main since; stays until the merge |
| biome | `check --linter-enabled=false` on 60 changed or new files: clean; `lint` on the 59 changed: 14 warnings as before |
| gitleaks | see the final run below |
| dash grep | 0 dash characters in the new or edited prose files and in the commit messages |

### Open risks added by the review

- The five `ideas.ts` lines (item 7) rest on a commit message, not on a
  comparison with the published RFP.
- `origin/main` has moved (#1885, api-client 1.10.0, and others) since this
  branch was cut; this branch is still based on 08543ae9. `api-client/src/index.ts`
  is edited at line 89 only.

## Merge (2026-10-24)

- Re-check of c6aabcd1 (same reviewer, Claude Fable 5.1, high effort):
  GATE push. Every label now splits under the page's own pattern; the new
  label test fails on the colon form; its own reader sweep found no other
  runtime reader of a rewritten string; the normalizing check shows only the
  requested possessive inserted.
- Merge: main merged in at 5b1ea34f (spec 1.9.110; the token fallback,
  scout-mcp 1.8.1 and api-client 1.10.0 since this branch's base). This
  change is spec 1.9.111, renumbered from the 1.9.116 placeholder. The
  changelog was merged entry by entry with this branch's file kept (its
  rewritten history) and main's three new entries inserted below this one:
  342 entries, this branch's 339 plus main's 3. The usual merge rule (main's
  file, the branch's entries on top) would have restored the dashes in every
  old entry. Main's new code and entries carry no dash: the guard passes on
  the merged tree.
- Checks on the merged tree: tsc exit 0; vitest (src/lib, src/components,
  src/app, src/collections, src/data) 224 files, 2,888 tests passed;
  contract:write, contract:check exit 0; writer conformance, answer
  dating, route exports, changelog contract, scripts types and the new
  check-no-dashes all exit 0 (95 listed, 0 unlisted, 0 stale); Raven gate
  ACCEPT 1.9.111 (2 gains, 0 hit to miss, 64 top-5 lists changed);
  scout-mcp SMOKE_READ_ONLY=1 smoke 86 passed, 0 failed, 3 skipped (main
  fixed the parameter count); api-client smoke 21 passed.

