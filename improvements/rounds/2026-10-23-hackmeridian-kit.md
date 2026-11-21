# 2026-10-23: a Scout page for HackMeridian 2026 builders

## Scope

One page that tells a builder at HackMeridian 2026 (Lisbon, 25 to 26 October
2026) how to use Scout during the event, readable in about two minutes: the
event in brief, five prompts with the tool that answers each and an honest
note on what it returned, setup for Claude Desktop, Claude Code and Cursor,
and the limits. Published content: every fact on the page comes from a live
read-only call made today, or from the repo where the table says so.

## Lanes

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| K2: HackMeridian kit | Claude Opus 5.5, high | own worktree, branch `lane/k2-hackmeridian-kit` off origin/main (e196cea1): new `src/app/(frontend)/hackmeridian/page.tsx`, one line in `src/app/sitemap.ts`, this ledger | one commit on the branch, not pushed |

The orchestrator holds the push, the PR (for a preview deploy) and the
independent review. The owner reviews the rendered page before any merge.

## Review

Pending: the orchestrator's independent review on a model other than the
author's, and the owner's read of the preview render.

## Merge gate

The page is written for `@stellar-light/scout-mcp` 1.8.0, which adds the
`locate_source` tool (commit 37777d5e on branch `lane/y-mcp-locate-source`).
npm served `latest: 1.7.0` at 2026-10-23T16:42:17Z (`npm view
@stellar-light/scout-mcp version dist-tags`). **Do not merge this page
before 1.8.0 is on npm**: its `locate_source` prompt and the "needs
scout-mcp 1.8.0 or later" line would point at a tool nobody can install.

## Decisions

- **Route: `/hackmeridian`.** The alternative named in the brief, a section
  on the existing HackMeridian 2026 event page, does not exist on the site:
  `GET /hackathons/hackmeridian-2026` answered 404 at 16:38:45Z. The frontend
  detail route (`src/app/(frontend)/hackathons/[slug]/page.tsx`) reads the
  Payload `hackathons` collection, while the event record lives in the
  curated events the API serves; making that page render is a separate
  change. `/hackmeridian` answered 404 at 16:38:47Z, so the path is free,
  and it is short enough to put on a slide.
- **Sibling: `src/app/(frontend)/scout/examples/page.tsx`.** It is the
  single-topic Scout explainer, and its stacked prompt card (an uppercase
  eyebrow over one block of text) carries every section of this page.
  Copied literally: the `max-w-4xl` main with `pt-28`, the back link to
  `/scout`, the eyebrow, `h1` and intro block, the uppercase `h2` section
  labels with `mb-14` sections, the card shell (`rounded-xl border
  border-border/50 bg-card p-4`, `space-y-2`), the eyebrow class, prompts in
  `font-mono` inside quotes, and the closing back link. The muted note lines
  use the `text-xs text-muted-foreground leading-relaxed` class the sibling
  uses for its response footers. The setup snippets reuse the MCP tab of
  `src/components/scout-install-picker.tsx` (its `pre` classes and inline
  `code` classes) and the existing `CopyCommand` component. Prose cards drop
  `font-mono`, which stays on prompts, tool names and commands.
  The `/scout` landing page (hero, install picker, stats, FAQ) is too long
  for a two-minute read; `/skills` is a client marketplace; the event detail
  page is a data page.
- **Length.** The first draft used the sibling's worked-session card for the
  five questions (eyebrow, title, "You type", "Answered by", a response box)
  and rendered at 1,019 words. The questions moved to the prompt card with
  the tool named at the start of its note, and the copy was cut: 708 words
  as rendered, counting every label, heading and link, code blocks excluded.
  That is about two minutes skimmed and nearer three read closely; the
  longest single card is the categories card (49 words, both judging
  summaries the brief asked for).
- **Sitemap: joined.** Top-level public pages sit in the static list in
  `src/app/sitemap.ts` (`/experiments`, `/quality`, `/ask` and others); the
  sibling is a `/scout` sub-page and is not listed. One line, weekly, 0.5.
- **Navigation: not joined.** The nav groups list standing product surfaces;
  an event page is reached by its link. No Scout sub-page is in the nav.
- **Metadata:** title and description as the sibling, plus
  `alternates.canonical` as the top-level `/scout` and `/skills` pages carry.
- **Tests:** the sibling has no page or metadata test (no file under `tests/`
  or `src/**/*.test.*` imports a frontend page or the sitemap), so there is
  none to mirror.
- **Example ideas.** vetIdea and scfPitch were each run on two ideas, both
  on this year's priority list (smart accounts, cross-chain transfers). The
  page uses the cross-chain idea for vet_idea, and the passkey wallet idea
  for scf_pitch because it maps to the Wallet vertical and so shows funded
  peers (on the cross-chain idea scfPitch serves `fundedPeers: null`). The
  passkey idea's vetIdea answer, not used on the page, is row 24, so the
  choice can be checked: 2 builds, neither a winner, one matched by meaning
  alone and one on the word "social".
- **Prompt wording follows the tool descriptions.** "I want to build X. Has
  it been built at a Stellar hackathon?" leads with the vet_idea phrasing
  ("The 'I want to build X on Stellar' check"); "Has anyone built X at a
  Stellar hackathon?" alone is search_hackathon_builds' phrasing. "Which on
  and off ramps" matches the get_partners `type=on-off-ramp` call recorded
  in row 17.
- **"27 events" corrected to 23.** The brief said prior art covers about
  1,356 submissions across 27 events. Live: 1,356 submissions
  (`counts.indexedBuilds`), 1,383 event entries, in 23 events
  (`analyze?by=event` groups). `/api/status` counts 27 hackathon events, but
  that includes events with no stored submissions, HackMeridian 2026 among
  them. The page says 23.
- **Not on the page, on purpose:** the organizer company's name (the record
  names two organizers, see findings), partner names (counts only, so the
  list does not read as an endorsement), line numbers (they move with the
  daily index rebuild), the "28 hours" figure (the record itself says the
  organizer's schedule gives 27).

## Content sources

All calls are read-only GETs to `https://www.stellarlight.xyz`, about 2 s
apart, made 2026-10-23 by a stdlib script. API version 1.9.100 at the start
(status generated 16:38:01Z) and at the end (16:44:09Z). Raw bodies were
kept in the lane's scratch directory, not committed.

| # | page claim | call | time (UTC) | value served |
| --- | --- | --- | --- | --- |
| 1 | 09:00 Sunday 25 October to 12:00 Monday 26 October; the 12:00 deadline is final, no late submissions | `/api/hackathons/hackmeridian-2026` (description) | 16:38:17 | "check-in and hacking open at 09:00 on Sunday 25 October 2026, and hacking ends at 12:00 on Monday 26 October, the submission deadline (no late submissions)" |
| 2 | "Lisbon time" | same | 16:38:17 | the record gives the times without a zone for a Lisbon venue; the page reads them as local time |
| 3 | Warehouse ONE16, Marvila | same | 16:38:17 | "Warehouse ONE16 in Marvila, Lisbon" |
| 4 | Genesis and Scale, what each takes, and each one's judging criteria | same | 16:38:17 | "Genesis takes a new idea or early prototype to a working MVP; Scale moves an existing product or advanced prototype toward production"; Genesis judged "on problem clarity, MVP quality, Stellar integration and continued development potential"; Scale "on milestones against goals set at pre-event intake, SCF eligibility, production readiness and ecosystem impact" |
| 5 | Tracks Stellar Unlocked and Stellar Composed | same | 16:38:17 | "Stellar Unlocked (new uses of Stellar's core protocol features) and Stellar Composed (two or more ecosystem tools or projects combined)" |
| 6 | Priorities: smart contracts, smart accounts, cross-chain transfers | same | 16:38:17 | "This year's priorities are smart contracts, smart accounts and cross-chain transfers" |
| 7 | Async review of demo video, pitch deck, GitHub repo and submission answers | same | 16:38:17 | "Judging is an async review of the demo video, pitch deck, GitHub repo and submission answers" |
| 8 | Up to $30,000 across six winners, set in USD and paid in XLM | same | 16:38:17 | "Up to $30,000 across 6 winners, set in USD and paid in XLM"; `prizePoolUSD: 30000` |
| 9 | Finalists pitch live at the Meridian conference on 28 October | same | 16:38:17 | "Finalists pitch live at the Meridian conference on 28 October" |
| 10 | AI-assisted development is allowed | same | 16:38:17 | "AI-assisted development is allowed" |
| 11 | Official pages: meridian.stellar.org/hackmeridian and hackmeridian.com, the organizer's site | same | 16:38:17 | `externalUrl: https://meridian.stellar.org/hackmeridian`; "Organized by Grow with Guava LLC (hackmeridian.com); apply at meridian.stellar.org/hackmeridian" |
| 12 | vet_idea: five past builds, best first, with event, placement and repo, all from Stellar Hacks: Real-World ZK; one placed (Tukar, 5th); live competitors among them Circle CCTP, Allbridge and Axelar | `/api/vet-idea?q=cross-chain USDC transfers between Stellar and EVM chains` | 16:39:33 | `priorArt.builds` (reranked, best first): Nebula Relay, Zephyr Bridge, Shade, Tukar ("5th Place - $750 in XLM", isWinner true), Xorr, each with `hackathon: "Stellar Hacks: Real-World ZK"`, `placement` and `githubUrl`; `competitors.projects` 8 rows, all status Live, including "Circle CCTP (Cross-Chain Transfer Protocol)", Allbridge, Axelar |
| 13 | get_hackathon: the winners, first to third per track, with a link to SDF's recap; Open Innovation: The Simple Fund, 4Bridge, Stellar Forge; Composability: Lance, Star Lends, Panorama Block | `/api/hackathons/hackmeridian-2025` | 16:38:43 | `winners` 6 rows with `track` and `hackathonPlacement` 1st to 3rd Place per track; every `url` is stellar.org/blog/foundation-news/the-blueprint-at-meridian-2025 |
| 14 | Scout holds only these six, not the 110+ entries | `/api/hackathons/builds?hackathon=hackmeridian-2025&limit=20`; row 1 call | 16:39:59 | `counts.matched: 6`, all ids `curated-hackmeridian-2025-*`; 2026 description: "The 2025 edition in Rio drew more than 400 builders and 110+ submissions" |
| 15 | locate_source: pointers, best first, each with file, line and a GitHub link pinned to a commit; the top hit was the host implementation in rs-soroban-env | `/api/sources/locate?q=require_auth` | 16:40:34 | rank 1: `stellar/rs-soroban-env` `soroban-env-host/src/auth.rs`, `locator: require_auth`, `authorityRole: implementation`, score 95, `line` and `verificationUrl` at commit 0c99950e; ranks 2 and 3 in `stellar/rs-soroban-sdk` |
| 16 | Code lookup covers eight repos (named on the page) | same | 16:40:34 | `meta.index`: stellar-core, rs-soroban-sdk, rs-soroban-env, js-stellar-sdk, stellar-rpc, quickstart, stellar-cli, soroban-examples (built 15:44Z) |
| 17 | Code and Markdown headings only, not JSON configs | repo, not a call: `src/lib/source-locator-extract.ts` `EXT_TYPES` at e196cea1 | n/a | indexed extensions: rs, go, c/cc/cpp/cxx/h/hh/hpp, ts/tsx/mts/js/mjs/cjs/jsx, md/mdx, sh/bash, cfg/ini; json, toml and yaml absent |
| 18 | get_partners: eight ramp partners, all anchors; four in Latin America, two global, one in Africa, one in Africa and Europe; all eight listings flagged as aging; anchors with no recorded ramp are left out | `/api/partners?type=on-off-ramp` | 16:40:37 | `counts.total: 8`; every `partnerType: "anchor"`; regions: latam x4, global x2, africa x1, africa + europe x1; every `freshness.status: "aging"`; `meta.warnings[0]`: anchors with no ramp type recorded are not included, type=anchor lists every anchor |
| 19 | scf_pitch: SCF Round 46, deadline 8 November 2026; the 45 active wallet projects with SCF awards, $5,553,425 in all, the eight largest named; vet_idea's competitors and prior art; four pitch angles, each tied to a fact | `/api/scf-pitch?q=passkey smart wallet with social recovery` | 16:41:41 | `round.open[0]`: round 46, phase Submission, submissionDeadline 2026-11-08; `fundingBar`: fundedProjects 45, totalAwardedUSD 5553425, basis "Every ACTIVE directory project in the vertical with a structured SCF award record ... fundedPeers lists the 8 largest"; `vet` block; `angles` 4 |
| 20 | It writes no pitch | MCP tool description and spec | n/a | scf_pitch description: "Writes no prose for you."; spec scfPitch description: "No prose generation." |
| 21 | Prior art covers 1,356 submissions to 23 past Stellar hackathons, mostly from DoraHacks | `/api/hackathons/builds?limit=1`; `/api/hackathons/analyze?by=event` | 16:39:37, 16:39:56 | `counts.indexedBuilds: 1356`, `entries: 1383`, `upstream: "dorahacks.io"`; 23 groups summing to 1,383 entries, of which 12 (HackMeridian 2025 6, Philippines 5, APAC 1) are curated rows off DoraHacks |
| 22 | HackMeridian 2026 submissions are not in the index during the event | `/api/hackathons/builds?hackathon=hackmeridian-2026&limit=5` | 16:44:42 | `counts.matched: 0`; warning "no submissions are stored for hackmeridian-2026" |
| 23 | Node.js 20 or later | `npm view @stellar-light/scout-mcp engines` | 16:44:46 | `{"node": ">=20.0.0"}` on 1.7.0; commit 37777d5e changes only the version line of `scout-mcp/package.json` |
| 24 | (not on the page) vetIdea on the passkey wallet idea | `/api/vet-idea?q=passkey smart wallet with social recovery` | 16:39:13 | vertical Wallet; 2 builds (Stelakey by meaning only, SoroSocial on "social"), neither a winner, 3 below the evidence rule; gap 71 active, 45 SCF-funded |
| 25 | (not on the page) scfPitch on the cross-chain idea | `/api/scf-pitch?q=cross-chain USDC transfers between Stellar and EVM chains` | 16:41:19 | `vertical: null`, `fundedPeers: null`, `fundingBar: null`; 2 angles |
| 26 | (not on the page) partners in Europe with both ramps | `/api/partners?ramps=on-ramp,off-ramp&region=europe` | 16:40:39 | 1 partner |
| 27 | No API key | `scout-mcp/README.md` | n/a | "They're rate-limited but require no API key." |
| 28 | Setup config | `scout-mcp/README.md` (Claude Desktop and Cursor JSON, config paths); `claude mcp add --help` (`claude mcp add [options] <name> <commandOrUrl> [args...]`, stdio example `claude mcp add my-server -- npx my-mcp-server`) | n/a | the README's `mcpServers.stellar-scout` block, with args `["-y", "@stellar-light/scout-mcp@latest"]` |
| 29 | Linked pages exist | `/skills/stellar-scout`, `/scout/api-reference`, `/scout` | 16:41:45 to 16:41:53 | 200 each |
| 30 | The four 1.7.0 tools return what the API returned | local Scout MCP (scout-mcp 1.7.0): `vet_idea` (cross-chain idea), `get_partners` (type on-off-ramp), `get_hackathon` (hackmeridian-2025), `scf_pitch` (passkey idea) | 16:55:00 to 16:55:32 | identical builds, partners, winners, round, funding bar and angles to rows 12, 18, 13 and 19; `locate_source` is not in 1.7.0 and was checked through the API only (row 15) |

## Findings for the queue (not fixed here)

- The hackmeridian-2026 record names two organizers: `organizer.name` is
  "Stellar Development Foundation" while the description says "Organized by
  Grow with Guava LLC (hackmeridian.com)". The page names neither and links
  the organizer's site.
- Its `meta.note` says "DoraHacks-sourced: live submission feed
  unavailable", while the record is `source: "curated"`.
- `/hackathons/hackmeridian-2026` and the other event slugs 404 on the
  frontend while the API serves them, as the comment in `src/app/sitemap.ts`
  already records for the `hackathons` collection.

## Log

- 16:3x Z: `git fetch origin`; branch `lane/k2-hackmeridian-kit` from
  origin/main e196cea1.
- 16:38:15Z to 16:44:45Z: the 23 GETs in rows 1 to 26 and 29 (stdlib
  `urllib`, 2 s sleep between calls, User-Agent
  `stellarlight-lane-k2-content-check`); every status 200 except the two
  route probes (404, both expected).
- 16:42:17Z: `npm view @stellar-light/scout-mcp version dist-tags`:
  `latest: 1.7.0`.
- 16:5x Z: draft 1 rendered to static text (react-dom/server over the page
  module, scratch script): 1,019 words. Cut to the prompt-card layout.
- 16:55:00Z to 16:55:32Z: the four MCP tool calls in row 30.
- 17:0x Z: final render: 708 words, 0 en or em dashes in the HTML.
- `pnpm install --frozen-lockfile --prefer-offline` (the worktree had no
  node_modules); `payload generate:importmap` with placeholder
  `PAYLOAD_SECRET` and an unreachable `DATABASE_URI` (it writes only the
  gitignored `src/app/(payload)/admin/importMap.js`; no database contact).
- `pnpm exec tsc --noEmit -p tsconfig.json`: exit 0, no output. Before the
  import map existed it failed with 3 TS2307 errors, all on the missing
  generated `importMap.js`.
- `pnpm exec biome check "src/app/(frontend)/hackmeridian/page.tsx"
  src/app/sitemap.ts`: page clean; one warning, `noExplicitAny` at
  sitemap.ts:162, which is origin/main's line 161 (`} as any);`), not this
  change.
- A grep for the en and em dash characters over the page, this ledger and
  the sitemap diff: no matches. A grep for the names the brief forbids: no
  matches in any changed file.
