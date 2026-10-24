# 2026-10-24: no em or en dashes in served text, part B, and the guard

Part A (`improvements/audits/2026-10-23-no-dashes/`, #1867) cleaned the knowledge
notes, the pages, the components, the integrations and every API route except
`api/hackathons`. Part B finishes the served text and adds the check that keeps
it clean.

A dash shown as a quote is written `<EM>` (U+2014) or `<EN>` (U+2013), so no file
in this folder carries the character.

## What part B covers

- `src/lib/openapi-spec.ts` (the spec; `specs/openapi.json` and
  `api-client/src/schema.ts` regenerated with `pnpm contract:write`);
- `src/lib/changelog.ts`, every entry including old ones (served at
  `/api/changelog`);
- the skill: the markdown under `public/skills/**` is canonical, and
  `src/lib/stellar-scout-skill.ts` was regenerated from it with
  `scripts/sync-scout-skill-mirror.ts` (not edited by hand);
  `src/lib/stellar-developer-activity-skill.ts` was edited with its markdown twin;
- the tool text in `scout-mcp/src/index.ts`;
- `src/app/api/hackathons/**`, the hackathon libs, `src/collections/**`,
  `src/data/**` and the other `src` files with served text (51 `src` files edited in all, plus 5 test files, the generated mirror and the markdown);
- the guard: `scripts/check-no-dashes.ts`, its list `scripts/no-dashes-allowed.json`,
  and one step in `.github/workflows/contract-gate.yml`.

Not touched: code comments, test files (five tests pin a string that changed and
were updated, see below), stored database text, `scout-mcp/README.md`.

## Result

`before.txt` is the new counter run on `origin/main` (08543ae9) with the part A
list; `after.txt` is the run on this branch. Both carry the per-file counts and
every dash line, tagged.

| area | lines before | lines after | dashes before | dashes after |
| --- | --- | --- | --- | --- |
| api/hackathons | 5 | 0 | 5 | 0 |
| hackathon libs | 11 | 0 | 11 | 0 |
| spec, changelog, skill text (`.ts`) | 828 | 0 | 1,111 | 0 |
| skills (markdown, `public/skills/**`) | 263 | 0 | 351 | 0 |
| scout-mcp tool text | 29 | 0 | 38 | 0 |
| collections | 77 | 0 | 77 | 0 |
| data | 20 | 0 | 22 | 0 |
| other src | 100 | 25 | 110 | 32 |
| **part B total** | **1,333** | **25** | **1,725** | **32** |

The spec/changelog/skill row includes `stellar-scout-skill.ts`, a generated copy
of `stellar-scout.md` (118 lines, 145 dashes, counted in both rows). The 1,333
lines on main are the 1,333 unlisted lines the check failed on (below). With the
70 part A lines that were already listed the whole product was 1,403 lines and
1,808 dashes; it is now 95 lines and 115 dashes, all listed, 0 unlisted.

1,580 dashes in part B were read in context and given a code; 1,548 were
rewritten and 32 left on purpose.

## What was left, and why

The list is `scripts/no-dashes-allowed.json`: file, a snippet of the line around
the dash, and a kind. It is the part A list plus 32 entries. Whole product:

| kind | dashes | lines | where | reason |
| --- | --- | --- | --- | --- |
| quote | 56 | 46 | `repo-knowledge.ts` (55), `repo-relations.ts` (1, new) | quoted verbatim from an upstream README line, package description or GitHub description |
| prompt | 52 | 42 | part A: `api/ask`, `api/partners/*`, `partner-portal`; new: `repair-lane.ts` (15), `task-lanes.ts` (13) | instructions to a model (the answer paths, the concierge, and the two headless-agent prompts of the repair and task lanes). Owner decision: measuring a prompt change needs model credit. |
| internal | 3 | 3 | part A | a caught error, an image-load error, a `console.error` line |
| functional | 4 | 4 | `fix-descriptions` route (part A), `decode-entities.ts` (2, the `mdash` and `ndash` entity table), `quality-text.ts` (1, a clause cut that looks for the character) | patterns that handle the character, not served text |

No event record or curated hackathon sentence needed a `quote` entry: the
curated judging sentence (`hackmeridian-2026`) holds no dash.

## The guard

`scripts/check-no-dashes.ts` counts a dash only where it is served text: a
string, template, JSX text or JSX attribute string in a non-test `.ts`, `.tsx`
or `.mts` file under `src/` and in `scout-mcp/src/index.ts` (parsed with the
TypeScript compiler, so a comment is never counted, even on a code line), and
every line of the markdown under `public/skills/**`. A dash counts in literal
form, as a unicode escape or as an entity.

- `pnpm exec tsx scripts/check-no-dashes.ts` prints the table (the same shape
  as part A, with `--files` and `--lines`).
- `--check` exits 1 and names each unlisted line (`file:line` and the text,
  with `<EM>` and `<EN>` in place of the character), and also fails on a listed
  entry that matches no dash (stale), so the list cannot outlive its text.
- It is the step "No em or en dashes in served text" in
  `.github/workflows/contract-gate.yml`, after "Served values are datable".

Written test-first: on main the check exited 1 with 1,333 unlisted lines (the
head of that output is in the ledger). On the branch it exits 0 (95 listed, 0
unlisted, 0 stale). Planting a dash in a string of a new `src/lib` file and in a
new skill markdown file made it exit 1 with the file and line; a dash in a
comment of the same file was ignored.

`improvements/audits/2026-10-23-no-dashes/count-dashes.mts` and its
`upstream-text.json` stay as the record of part A. The live list is the new one.

## How the dashes were rewritten

Same method as part A (README of that folder): the parse gave every dash its
position; each was read in context and given a code; a script applied the codes
to the original text, replacing only the dash and the spaces around it. 1,580
occurrences, 1,548 rewritten:

| replacement | edits |
| --- | --- |
| semicolon | 689 |
| colon | 577 |
| comma | 141 |
| hyphen, a range with no spaces (`1-500`, `0-1`, `Feb 3-7`) | 64 |
| parentheses (opening 21, closing 21; one closing is `), `) | 43 |
| period | 26 (20 where the next word was already a capital, 6 where it was capitalized, listed below) |
| hyphen, an empty value (`-` in a table cell, `formatUSD(null)`) | 8 |
| "to" | 0 (ranges kept a hyphen so the routing text keeps its tokens) |

Judgment calls, in addition to part A's:

- A dash after a "label:" prefix became a semicolon, not a second colon
  ("projects: per-product deployment records; products[] with ...").
- A pair of dashes round an aside became parentheses, or two commas when the
  aside already held parentheses of its own (nested parentheses were avoided).
- A pair round a list that introduces a clause became a colon and a comma
  ("the stage: passing / ranking / admission, each naming its owning area").
- A dash before a fragment that could not stand alone ("e.g.", a noun list)
  became a comma or a colon, never a period.
- A dash right after a URL or an identifier became a period or a semicolon,
  whichever read cleanly beside it.
- Six sentences start with a capital that was lowercase: four in
  `resolve-project.ts` ("Nothing to resolve.", "Resolve by slug instead." twice,
  "Look at ... instead."), two in `scf-pitch.ts` ("Rules in the SCF Handbook.",
  "Verify at ...") and none other. (A seventh, in `hackathon-brief.ts`, was put back to a
  semicolon because a test matches its lowercase form.)

## Meaning, and what was restructured beyond punctuation

`normalized-diff.txt` compares the words of every changed file before and after
(letters and digits, case folded): 60 files, 0 files whose words changed. The
only non-punctuation differences are the six capitals above (and two ranges the tokenizer reads differently).

Nothing was restructured. Where a punctuation change is more than a swap:

- 21 asides became parentheses (the dash pair had no parentheses inside);
- three sentences in `hackathon-brief.ts` were hand-edited after a test run,
  still punctuation only: "unavailable; do not say" (no capital),
  "for this domain: evidence-gated registry; absence ..." and
  "showing up to 5, full list at ...";
- two formats that are code, not prose, changed their separator and their
  readers with them: the degraded-read warning (`<op> <EM> results may be
  incomplete (class)` is now `<op>; results may be incomplete (class)`, writer and
  parser in `degraded-read.ts`) and the audit title (`Protocol <EM> Auditor` is now
  `Protocol: Auditor`, `composeAuditTitle`, which only its test calls).

Five test files pinned a string that changed and were edited to the new string,
nothing else: `audit-title`, `degraded-read`, `stablecoin-view` (the missing-value
placeholder), `structured-data`, `team-cards`. (`hackathon-brief.test.ts` passes
unchanged.)

## Checks

See the ledger (`improvements/rounds/2026-10-24-no-dashes-b.md`).

## Not done here

- Model prompts (52 dashes, 42 lines): owner decision, see above.
- `scout-mcp/README.md` (13 dashes) is the npm page of the package, not tool
  text; left. The comment on line 2 of the generated `api-client/src/schema.ts`
  comes from `scripts/contract/build-contract.ts`.
- Stored database text: the knowledge notes, titles and labels already in Mongo
  keep their dashes until the lanes that write them run again. `canonical-pages.ts`
  titles, the placement labels in `recent-hackathon-winners.ts` and the
  collection descriptions change at the next ingest or enrich pass.
- `scout-mcp` is not republished: the tool text reaches clients with the next
  `scout-mcp` release (`package.json` unchanged).
- The version is a placeholder (1.9.116) and the changelog entry is dated
  2026-10-24; both are renumbered at merge.
