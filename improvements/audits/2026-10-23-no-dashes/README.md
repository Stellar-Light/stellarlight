# 2026-10-23: no em or en dashes in served text, part A

The owner reads em dashes (U+2014) and en dashes (U+2013) as a sign of
machine-written text and asked for them to be gone from anything the product
serves or shows. Part A covers `src/lib/repo-knowledge.ts` (the knowledge
notes), `src/app/(frontend)/**`, `src/components/**`, `src/lib/integrations/**`,
`src/lib/quality-artifacts.ts`, `src/blocks/**` and every route under
`src/app/api/**` except `src/app/api/hackathons/**`. Part B (the OpenAPI spec,
changelog, skill text, collections, the hackathon files) is a separate lane.

In this README a dash that is shown as a quote is written `<EM>` (em) or `<EN>`
(en), so no file in this folder carries the character. `⏎` marks a line break
inside a sample.

## Method

`count-dashes.mts` is the measure. It parses every `.ts` and `.tsx` file under
`src/` with the TypeScript compiler and counts a dash only when it sits inside
a string literal, a template string, JSX text or a JSX attribute string, in
literal form or as an escape or entity (`&mdash;` and the like). Comments
(`//`, block, JSDoc, JSX comments) are never counted, even when they share a
line with code. Test files get their own row. It reports lines and dashes by
area, and it accepts a short list (`upstream-text.json`) of dashes left on
purpose, each with a kind. The target is 0 unlisted lines in part A.

`before.txt` is the counter run on an extract of `origin/main` (08dd388c) with
the list ignored. `after.txt` is the run on this branch, with the full list of
the dash lines that remain.

The rewrite was done in four steps. (1) The same parse produced every dash in
part A with its position. (2) Each one was read in context and given a code:
colon, semicolon, comma, period, a pair of parentheses, "to", hyphen, or
"leave". (3) A script applied the codes to the original text, replacing only
the dash, the spaces around it and, for a period, the first letter of the next
word. No other wording was touched. (4) `biome format` re-wrapped the 13 JSX
files whose text got shorter. A dash inside a quote (a README line, a package
or GitHub description) was never rewritten.

## Result

| area | lines before | lines after | dashes before | dashes after |
| --- | --- | --- | --- | --- |
| repo-knowledge | 760 | 45 | 875 | 55 |
| frontend | 124 | 0 | 128 | 0 |
| components | 91 | 2 | 93 | 2 |
| integrations | 28 | 1 | 35 | 1 |
| quality-artifacts | 22 | 0 | 22 | 0 |
| blocks | 1 | 0 | 1 | 0 |
| api (not hackathons) | 140 | 22 | 167 | 25 |
| **part A** | **1,166** | **70** | **1,321** | **83** |

1,238 dashes were rewritten (1,236 by the position-based script, 2 by an
exact-string replacement where a closing parenthesis had to be added). 75 files
under `src/` changed, plus one script (see "What else had to change"). Every one of the
70 lines that remain is listed in `upstream-text.json` with a kind; the counter
reports 0 unlisted lines and 0 stale list entries.

## What was left, and why

| kind | dashes | lines | where | reason |
| --- | --- | --- | --- | --- |
| quote | 55 | 45 | `repo-knowledge.ts` | The dash is inside a quote of an upstream README line, package description or GitHub description (for example a README title). Rule 3: never alter text quoted from upstream. |
| prompt | 24 | 21 | `api/ask/answer`, `api/partners/assistant`, `api/partners/match`, `api/partners/onboard`, `components/partner-portal` | Model instructions, a tool schema and one hidden first chat turn. They are sent to a model and never shown. Rule 1 says to change served or shown text only, and a prompt change moves model output, so it needs a measurement of its own. **Owner decision**, see below. |
| internal | 3 | 3 | `api/research`, `components/dotcut/dot-cut.tsx`, `lib/integrations/dorahacks.ts` | A thrown error that is caught and replaced, an image-load error, and a `console.error` line. None reaches a response or a page. |
| functional | 1 | 1 | `api/admin/fix-descriptions` | `lastIndexOf(" <EM> ")`: a search for the character in stored descriptions, not text we serve. |

Not counted as dashes: one U+2212 minus sign (`stablecoin-explorer.tsx`, the
sign in front of a negative change). It is not an em or en dash.

## How the dashes were rewritten

| replacement | edits |
| --- | --- |
| colon | 542 |
| semicolon | 304 |
| comma | 154 |
| period and a new sentence | 102 |
| hyphen, empty-value placeholder | 45 |
| parentheses (opening, 29; closing, 29 of which 13 with a comma) | 58 |
| hyphen, compact range (`A-Z`, `1-10`, `10-160 chars`) | 19 |
| "to" (a range in prose) | 7 |
| middle dot | 4 |
| pipe | 1 |
| total | 1,236 |

Judgment calls:

- A dash before an explanation became a colon; before a clause that continues
  the thought, a semicolon; before a short imperative in an error or a status
  line, a period and a capital ("The assistant hit a snag. Browse /partners
  instead.").
- A dash after a quoted README line became a comma when what follows is a noun
  phrase about the quoted thing, and a semicolon when it is a clause. When the
  comma could have attached to the wrong noun (after a version, a URL or a
  product name) a semicolon was used.
- Two dashes round an aside became parentheses, or commas when the aside had
  parentheses of its own.
- A table cell or label that held only a dash as "no value" became a hyphen.
- A numeric range in prose became "to" (`3.0.0 to 5.0.0`); a compact range kept
  its shape with a hyphen (`1-10`, `A-Z`, `Jan 5-7, 2026`). `COMMIT-REVEAL` was
  a compound word and got a hyphen, not "to".
- A page title with a site name after the dash became `Name | Stellar Skill`,
  matching the `%s | StellarLight` template; a tagline title became a colon.
- A separator between two metadata items (a byline and its date, a label and
  its hint in a flex row) became a middle dot, which `quality/page.tsx` and the
  API docs already use.
- A package fact keeps its shape: `npm @scope/name: 1.2.3 (2026-09-14; ...)`.
- Internal triage notes were rewritten too (48 notes marked `visibility:
  "internal"` and 9 lines in the triage maps, 57 of the 820 edits in
  `repo-knowledge.ts`). They are never served, but the brief names
  knowledge-note fields without a served-only limit, and an internal note can
  be promoted to public later.

## What else had to change

`scripts/check-note-freshness.ts` parses registry claims out of the knowledge
notes. Its first pattern after a package name already accepted a colon, but two
did not: a shared version (`name, name and name: all 0.1.0`) and a version
range (`name: 34 versions from 0.43.1 to 5.0.0`). Run over all 1,273 notes
before and after, with the parser as it was, 3 notes (7 claims of 170) stopped
parsing, which would have dropped them from the nightly check without a
failure. The two patterns now accept a colon, and the self-test gained one
case for each shape. Both shapes fail without the change: the parity run lost
those notes, and with the two patterns reverted the shared-version case
returns `[]`. With the change, all 148 notes that carry a claim parse to the
same 170 claims as before.

Checked and unaffected: `findDirectAnswerNote` and the trigger matcher (whole
words only), the repo-search note scoring (`\b` boundaries), and every other
reader of `REPO_KNOWLEDGE_NOTES`. No test in `src/` asserted a string that
changed (212 test files, 2,602 tests pass), so no test was edited.

## Twenty random edits

Seeded shuffle (seed 20261023) of the 1,236 scripted edits, first twenty. Each
window is cut at a fixed width, so it can start or end mid-word.

1. `src/lib/repo-knowledge.ts` line 7826
   - before: `e variant of rock-paper-scissors on Stellar whose name IS its protocol <EM> commit, take the turn, reveal the move. A second i`
   - after: `e variant of rock-paper-scissors on Stellar whose name IS its protocol: commit, take the turn, reveal the move. A second i`
2. `src/app/api/status/route.ts` line 111
   - before: `"Synced from Stellar Passport <EM> small and growing dataset", ⏎ ), ⏎ collectionS`
   - after: `"Synced from Stellar Passport: small and growing dataset", ⏎ ), ⏎ collectionS`
3. `src/lib/quality-artifacts.ts` line 1009
   - before: `inguishable from a gap nobody asked about again. Spot-check 2026-08-31 <EM> kutana, etesia and octopos sit in it, are still ab`
   - after: `inguishable from a gap nobody asked about again. Spot-check 2026-08-31: kutana, etesia and octopos sit in it, are still ab`
4. `src/lib/repo-knowledge.ts` line 6761
   - before: `s on Stellar with ZK-Noir proofs, whose tagline states the design goal <EM> cryptography, not trust, for immutable anonymity. `
   - after: `s on Stellar with ZK-Noir proofs, whose tagline states the design goal: cryptography, not trust, for immutable anonymity. `
5. `src/lib/repo-knowledge.ts` line 704
   - before: `E 'The Signaler' (2026-04-11): 'Autonomous Signal Acquisition Network' <EM> seller agents post encrypted crypto-price signals,`
   - after: `E 'The Signaler' (2026-04-11): 'Autonomous Signal Acquisition Network'; seller agents post encrypted crypto-price signals,`
6. `src/lib/repo-knowledge.ts` line 1883
   - before: ` README; Cargo package zephyr-phoenix 0.1.0 pinning soroban-sdk 20.2.0 <EM> a Zephyr indexer program for Phoenix; no releases `
   - after: ` README; Cargo package zephyr-phoenix 0.1.0 pinning soroban-sdk 20.2.0: a Zephyr indexer program for Phoenix; no releases `
7. `src/lib/repo-knowledge.ts` line 4838
   - before: `withdrawals and refunds move a configured Stellar Asset Contract token <EM> USDC on testnet. Built with soroban-sdk 23, locked`
   - after: `withdrawals and refunds move a configured Stellar Asset Contract token, USDC on testnet. Built with soroban-sdk 23, locked`
8. `src/lib/repo-knowledge.ts` line 959
   - before: `ry → github.com/Beans-BV/merchant_sdk_javascript, which redirects here <EM> HTTP 301, 2026-09-02). README 'Beans Merchant Java`
   - after: `ry → github.com/Beans-BV/merchant_sdk_javascript, which redirects here; HTTP 301, 2026-09-02). README 'Beans Merchant Java`
9. `src/app/api/audits/route.ts` line 270
   - before: `portal.com. A project absent here has no audit on record at our source <EM> NOT a claim that it is unaudited. findingsTotal/se`
   - after: `portal.com. A project absent here has no audit on record at our source; NOT a claim that it is unaudited. findingsTotal/se`
10. `src/lib/repo-knowledge.ts` line 6129
    - before: `Soroban dApp can be tested headlessly end to end without a real wallet <EM> the missing piece for CI on any wallet-connected f`
    - after: `Soroban dApp can be tested headlessly end to end without a real wallet; the missing piece for CI on any wallet-connected f`
11. `src/lib/repo-knowledge.ts` line 7250
    - before: `solidating the project's official profiles, channels and key resources <EM> useful as the index of where ACTA publishes, when `
    - after: `solidating the project's official profiles, channels and key resources, useful as the index of where ACTA publishes, when `
12. `src/app/api/repos/search/route.ts` line 93
    - before: `hint: "Repo search matches name/description/topics/symbols from q <EM> put language or framework terms in q if the dedica`
    - after: `hint: "Repo search matches name/description/topics/symbols from q; put language or framework terms in q if the dedica`
13. `src/app/api/partners/assistant/route.ts` line 333
    - before: `error: ⏎ "The assistant isn't available right now <EM> browse /partners or use the form.", ⏎ unavailabl`
    - after: `error: ⏎ "The assistant isn't available right now. Browse /partners or use the form.", ⏎ unavailabl`
14. `src/lib/repo-knowledge.ts` line 5405
    - before: `note: "A card-RPG template from the Stellar Game Studio collection <EM> ecosystem-ready game templates and examples meant `
    - after: `note: "A card-RPG template from the Stellar Game Studio collection: ecosystem-ready game templates and examples meant `
15. `src/app/api/partners/onboard/route.ts` line 353
    - before: `{ error: "Extraction produced malformed output <EM> try again." }, ⏎ { status: 502 }, ⏎ ); ⏎ } ⏎ `
    - after: `{ error: "Extraction produced malformed output. Try again." }, ⏎ { status: 502 }, ⏎ ); ⏎ } ⏎ `
16. `src/app/(frontend)/scout/api-reference/page.tsx` line 9
    - before: `point reference for the public read-only APIs that power Stellar Scout <EM> hackathons (curated + DoraHacks), projects search,`
    - after: `point reference for the public read-only APIs that power Stellar Scout: hackathons (curated + DoraHacks), projects search,`
17. `src/lib/repo-knowledge.ts` line 7779
    - before: `ables and accounting data, and prepare payment and invoicing workflows <EM> the same Blaze product surfaced to a different age`
    - after: `ables and accounting data, and prepare payment and invoicing workflows; the same Blaze product surfaced to a different age`
18. `src/lib/repo-knowledge.ts` line 2025
    - before: `"bluxcc/react": [ ⏎ { ⏎ note: "npm @bluxcc/react <EM> published since 2025-02-03. Its npm repository fie`
    - after: `"bluxcc/react": [ ⏎ { ⏎ note: "npm @bluxcc/react: published since 2025-02-03. Its npm repository fie`
19. `src/lib/quality-artifacts.ts` line 434
    - before: `(d: { field: string; why: string }) => 'DEAD: ${d.field} <EM> ${d.why}', ⏎ ), ⏎ "a script or a test does not`
    - after: `(d: { field: string; why: string }) => 'DEAD: ${d.field}: ${d.why}', ⏎ ), ⏎ "a script or a test does not`
20. `src/lib/repo-knowledge.ts` line 1672
    - before: `note: "npm @openzeppelin/adapter-stellar <EM> 6.0.0 (2026-09-09; 13 versions since 2026-03-24 <EM> t`
    - after: `note: "npm @openzeppelin/adapter-stellar: 6.0.0 (2026-09-09; 13 versions since 2026-03-24; t`

## Not done here, for the next part and the owner

- **Model prompts (owner decision).** 24 dashes in five files are instructions
  to a model. The model's own replies (partner concierge, `/ask` answers) are
  shown to users and can contain dashes whatever the prompt says, so changing
  the prompt text alone would not settle it. A prompt change needs the usual
  before and after measurement on the concierge and answer paths.
- **No changelog entry, no spec version.** Part A edits no spec or changelog
  file (out of scope by the brief). The same sentences still appear in the
  OpenAPI spec and its generated schema (`api/contracts` is one example) and in
  `public/skills/references/examples.md`; part B rewrites those and should add
  one changelog entry for A and B together.
- **Outside the part A list but served:** `src/app/not-found.tsx` repeats a
  sentence that this part changed in `src/app/(frontend)/not-found.tsx`. The
  other `src/` files with served dashes are in `after.txt` (top 25 listed;
  `src/lib/changelog.ts`, `openapi-spec.ts` and `stellar-scout-skill.ts` hold
  1,117 of the 1,342 dashes outside part A).
- **Knowledge notes reach the database on the next enrich pass.** The notes are
  merged by the enrich lane (the sanctioned writer); this branch edits the
  source only and ran no lane.
- **A guard.** Once part B lands, `count-dashes.mts` with this list can run in
  CI and fail on a new unlisted dash.
