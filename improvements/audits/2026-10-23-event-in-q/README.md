# An event named in q becomes the builds hackathon filter

Evidence for `improvements/rounds/2026-10-23-event-in-q.md`.

**Verdict: every criterion met.** On a replay of this branch's builds route
over a fresh capture of production (1.9.97 at the start and the end), all
24 probes behave as the table written before the capture says, the six
curated HackMeridian 2025 winners are served for `q=HackMeridian 2025`
with their tracks, and every one of the 724 frozen builds-search requests
answers byte for byte as the base commit does (`cmp` exit 0). After the
independent review's fixes, on the branch merged with main and a third
capture (1.9.99 at both ends): 30 of 30 probes, `cmp` exit 0 again (see
"Review fixes" below).

## Results

- **Capture** (`summary.txt`): 2026-10-23T14:55:33Z to 15:08:00Z, apiVersion
  1.9.97 at both ends. 27 events listed (20 DoraHacks, 7 curated), 1,356
  stored submissions, 204 rankings, every page 200, every query served with
  meaning. The six curated hackmeridian-2025 rows are in it: Lance, Star
  Lends, Panorama Block (Composability, 1st to 3rd), The Simple Fund,
  4Bridge, Stellar Forge (Open Innovation, 1st to 3rd), each a winner with
  no repo link and no project link. One ranking ("a stablecoin with dollar
  collateral for payments") holds 271 rows against its first page's count
  of 275; base and branch read the same rows.
- **Base parity.** The base replay of `q=HackMeridian 2025&limit=20` serves
  the same 5 builds in the same order as live (one from
  stellar-hacks-kale-reflector, one from stellar-agents-x402-stripe-mpp,
  three from stellar-hacks-zk-gaming; none from hackmeridian-2025).
- **(a) Probes: 24 of 24 as specified.**

| probe | q | before (base) | after (branch) |
| --- | --- | --- | --- |
| p01 | HackMeridian 2025 | 5 builds, none from the event | inferred hackmeridian-2025; q empty; its 6 winners |
| p02 | hackmeridian-2025 | 20 builds from other events | inferred hackmeridian-2025; its 6 winners |
| p03 | HackMeridian 2025 winners | 9 builds from other events | inferred hackmeridian-2025; nothing left; its 6 winners |
| p04 | HackMeridian 2025 payments app | 277 builds across events | inferred hackmeridian-2025; q "payments app" inside it: 0 (its rows hold no text) |
| p05 | hackmeridian | 0 | partial: hackmeridian-2025, hackmeridian-2026; 0 |
| p06 | Stellar Hacks | 15 | partial: the 6 Stellar Hacks events; the same 15 |
| p07 | blend lending vault | 70 | unchanged, no event line |
| p08 | Stellar Hacks: Blend | 56; 13 of the first 20 from the event | inferred stellar-hacks-blend; its 36 |
| p09 | stellar hacks blend | 119; none of the first 20 from the event | inferred stellar-hacks-blend; its 36 |
| p10 | ZK Gaming | 286 | unchanged, no event line |
| p11 | Ideaton Fin de Ano Powered by Stellar Chile | 24; 2 of the first 20 from the event | inferred ideaton2026; its 63 |
| p12 | HackMeridian 2024 | 6 | no filter; partial: hackmeridian-2025, hackmeridian-2026; the same 6 |
| p13 | HackMeridian 2025, hackathon=stellar-hacks-zk | 0 | 0; line: q names hackmeridian-2025, which hackathon= does not select |
| p14 | (empty) | 1,356 | unchanged |
| p15 | !!! and ": , \|" | 0 | unchanged |
| p16 | build on stellar lending app | 316 | unchanged, no event line |
| p17 | stellar latam remittances | 156 | no filter; partial: ideatontelluscoop, stellar-latam; the same 156 |
| p18 | real world assets tokenization | 121 | unchanged, no event line |
| p19 | Meridian | 2 | unchanged, no event line |
| p20 | KALE Markets | 118 | unchanged, no event line |
| p21 | scaffold stellar templates | 58 | unchanged, no event line |
| p22 | HackMeridian 2025 vs HackMeridian 2026 | 5 | no filter; several: both slugs; the same 5 |
| p23 | HackMeridian 2025, hackathon= (empty) | 5 | unchanged, no event line |

"Unchanged" and "the same" mean the same count and the same events in the
first rows; the full rows are in each replay's `probes.jsonl` (not
committed). Probes p16 to p21 are this lane's false-positive probes.
"Stellar Hacks" starts 6 titles, not 7.

- **(b) Byte-identical.** First, how many frozen queries hold an event name
  or slug, read broadly (a title's words as a run, or a slug with or without
  its hyphens): **0 of 180**. Then `cmp <scratch>/base/frozen.jsonl
  <scratch>/branch/frozen.jsonl`: exit 0; both 724 lines, sha256
  `b411d6e98c53dae04987e45bad148ef60ad008563e6cd7bbd03cb339950d1dfc`; every
  request 200; no meaning lookup the capture could not answer.
- **(c) v1 questions.** `q=HackMeridian 2025&limit=20` on the branch: the 6
  hackmeridian-2025 builds and nothing else, each a winner with its track
  (Composability 3, Open Innovation 3); the names q08 checks are all there;
  no repo link (q08, q11) and no project link (q12).
- **Build names as q** (`names-as-q.mts`, added after the criteria, so a
  check, not a criterion): of 1,331 distinct stored build names sent as q,
  none infers an event and one, "zkNexus: Private Multilateral Settlement on
  Stellar (Stellar Hacks)", gets the partial-name line, which its name
  earns.

## Review fixes (after the independent review, on 71802a4f)

The review (GATE: push) asked for two code changes, tests first, and doc
corrections. The branch was then merged with main by the orchestrator
(33769bc1, bringing the reranker of #1864; this lane is spec 1.9.100).

- **Words that mean "list the entries".** place, placement, first to third,
  1st to 3rd, award, top, ranking, leaderboard, participant, demo (and
  plurals) joined the entry words.
- **Rows with no text.** When the rest of q, searched inside an inferred
  event, matches none of its rows and none of them holds a description, a
  line says so and that `hackathon=<slug>` alone lists them.
- **Failing first** (`failing-first-review.txt`, on 71802a4f): the new
  module test and two of the three new route tests failed; the third (an
  event whose rows hold text gets no such line) passed, as it should.
- **Re-run.** Probes p24 to p29 (the review's six failing q) were added to
  `probes.json`, and p04's expectation gained the new line, at 15:47Z
  before the re-run. Capture 3: 2026-10-23T15:46:56Z to 16:00:00Z, apiVersion
  1.9.99 at both ends, 1,356 stored submissions, 212 rankings, every page
  200. Base: a clean export of 0735c116 (the main merged into the branch).
  `summary-review.txt`:
  - **30 of 30 probes as specified.** p25 to p28 (awards, first place,
    leaderboard, participants) now list the six winners. p24 (top three),
    p29 (give me) and p04 (payments app) still match 0 inside the event,
    and each now carries the line: "'top three' matched no stored
    submission of hackmeridian-2025: its 6 stored submissions hold no
    description to search; hackathon=hackmeridian-2025 alone lists them".
  - **Byte-identical:** `cmp` exit 0 on the 724 frozen requests, sha256
    `3546ab4f2032d47cd940ca984727dfd31067f6be6ad94090d42dd0aa966b1925`; 0 of
    the 180 frozen queries holds an event name or slug, so neither change
    can reach them.
  - **v1 questions:** unchanged, met.
  - **Base parity:** the base replay of `q=HackMeridian 2025` serves the
    same 5 ids as live, in another order. Live 1.9.99 reranks hybrid rows
    with the reranker key; the replay pins the key empty, so it serves the
    hybrid order.
  - Build names as q: unchanged (1,331 names, 0 inferred, 1 partial line).

## Open risks

- The partial line also fires on topic queries that start two titles: "Stellar
  LATAM remittances" names the two Stellar LATAM events. It changes no row
  and says q was searched as text, but it is noise for a region query.
- A topic searched inside an event whose rows hold no text answers 0: p04
  ("payments app" inside HackMeridian 2025, whose six curated rows have no
  description). Closed after the review for inferred events whose rows all
  lack a description: a line now says so. Still unsaid: the same search
  under an explicit `hackathon=`, and an event where only some rows lack a
  description.
- The words that leave nothing after a name are a hand list; a rest such as
  "give me" is searched as text (inside a text-less event the line above
  then says why it found none).
- A DoraHacks event with no stored submissions is not inferred (none today;
  the index plus the curated file hold all 27 listed events).
- Titles made of common words infer on topic queries ("scaffold stellar
  hackathon projects", "apac stellar hackathon"); "stellar hacks zk" gets the
  partial line naming 6 events where one title holds every word. Both found
  by the review and queued.
- A q that repeats an event name is quadratic (176 KB: 1 s); live URLs stop
  near 16 KB (15 ms), so it is unreachable today (`ponytail:` comments).
- Filter-only answers keep today's note ("prize winners first across all
  Stellar hackathons") under an event filter, inferred or explicit, as the
  brief asked.

## Method (fixed before any result was read)

- **Criteria and probes.** The ledger's design, criteria and probe table
  were written at 14:38Z and `probes.json` (each probe with its expected
  outcome) at 14:45Z, before any capture, replay or implementation. biome
  later reformatted `probes.json`: sha256 as written
  `1d586876ac6bae82cbf5d704830e58d8787bdd933e49f8bf6b2a0c8c6b982a86`, as
  committed `0eca445e3a41d24b7b554802dba29057c6bb68e7f06209bfb1e2b4ce7127c86f`,
  the same JSON when parsed.
- **Capture.** `capture.mjs`: read-only GETs to https://www.stellarlight.xyz,
  2 s apart, 429 and 503 Retry-After honored. The event listing, every stored
  submission in browse mode, and per query the whole hybrid ranking (up to
  600 rows), whose meaning scores are the meaning map the replay hands the
  route: every frozen builds-search query below, every probe q and the rest
  a probe leaves. The output holds upstream submission text and is not
  committed. A first capture (14:40:45Z to 14:53:11Z) spanned 1.9.96 and
  1.9.97 (#1863, rule L, deployed during it), so it was not used as
  evidence, only to debug the harness; the branch was rebased onto the new
  main (bf8262db) and captured again.
- **Replay.** `replay.test.ts` runs the real GET handler of
  `/api/hackathons/builds`: the captured browse rows as the stored index
  (`indexedFromStored`, as `../2026-10-23-build-matching/replay.mts` builds
  it), each query's live meaning scores as the meaning map (a query live
  served without meaning gets none), the captured listing as the event
  listing, an empty curated collection (production holds none: 7 curated
  events, all from the curated file), the usage log off and the clock
  pinned. Base: a clean export of bf8262db (`git archive`, its own
  `pnpm install --frozen-lockfile`); branch: this tree.
- **Frozen sets.** Every builds-search q in `improvements/audits/*/`: the 40
  ideas, 36 short and 34 test ideas of `2026-10-22-prior-art-precision`, the
  30 fresh ideas of `2026-10-22-words-need-meaning` (the 140 labeled ideas
  the build-matching and rerank lanes replay), the 15-query nonsense battery
  of `2026-10-23-build-matching` with its probe and the two passkey checks,
  the 24-query fresh battery of `2026-10-23-nonsense-queries`, the 15
  one-word queries and the 36 short and 34 test ideas of
  `2026-10-22-short-idea-prior-art`, and the three size probes of
  `2026-10-23-compact-views`: 270 entries, 180 unique queries. Each is
  replayed by default (hybrid, limit 20), with limit 100, and in keyword and
  meaning mode (passkey-winners with winnersOnly=1): 724 requests.
- **Identity.** `cmp` of the base and branch `frozen.jsonl` (each line the
  request, the status and the body as served).

## Design decisions

- **Slugs only with their hyphens.** Titles are compared without case,
  accents or punctuation; a slug only with its hyphens, in any case. Of the
  27 slugs, two are made of common words: `build-on-stellar` (the title is
  "Stellar Build Better Hackathon") and `stellar-latam`. With hyphens
  ignored they would turn "build on Stellar lending app" (probe p16) and
  "Stellar LATAM remittances" (p17) into event filters. A title made of
  common words is still matched: the review found "scaffold stellar
  hackathon projects" inferring scaffoldstellar and "apac stellar
  hackathon" inferring apac-stellar-hackathon-2026 (queued in the ledger).
  The frozen sets hold none.
- **ZK Gaming (p10).** It is the end of one title ("Stellar Hacks: ZK
  Gaming"). The whole-name rule infers nothing, and the partial warning
  stays silent too, because it reads only words that start the titles of
  two or more events. A run in the middle of a title, even one unique to an
  event, is as often a topic as a name: read that way, "real world" (from
  "Stellar Hacks: Real-World ZK") would warn on every real-world-asset query
  (p18), and "blend" (p07) on every Blend lending query. The event's own
  builds already match "zk gaming" by their own words.
- **Stopwords in a partial name.** A name start counts only if it holds a
  word other than a stopword: "Stellar" starts 17 titles and "Build on
  Stellar" 3, and either would put an event warning on ordinary topic
  queries.
- **Nothing left.** After the name, a rest made only of words the search
  skips (stopwords and the scorer's generic words: app, project, tool,
  token, crypto, money, stellar, github) and words that ask for the event's
  own entries is nothing to search: the event is served as
  `hackathon=<slug>` alone serves it, winners first. The entry words:
  winners, builds, projects, submissions, teams, won, hackathon, list and
  their forms; after the review also place, placement, first to third (and
  1st to 3rd), award, top, ranking, leaderboard, participant, demo and their
  plurals. Searched as text, "winners" matched none of the six HackMeridian
  2025 rows, which hold no description (p03 would have served nothing). The
  list is a hand list (a `ponytail:` comment says so): a rest such as "give
  me" or "top three" is still searched, and the next line covers what that
  finds.
- **Rows with no text** (added after the review). When an inferred event's
  search of the rest matches 0 and none of the event's stored rows holds a
  description, one more line says so and that `hackathon=<slug>` alone lists
  them ("'give me' matched no stored submission of hackmeridian-2025: its 6
  stored submissions hold no description to search; ..."). It reads the
  rows, so it holds for any event, curated or not. Only inferred events get
  it, and only when every row lacks a description.
- **Event list.** The events the cached builds index holds plus the curated
  events off DoraHacks (`src/data/curated-hackathons.ts`, which holds
  hackmeridian-2026, an event with no stored submissions), found with no
  read. Inferring an event with no stored submissions makes
  `parseBuildFilters` read the event listing, the same read an explicit
  `hackathon=<that slug>` makes. Today the list is all 27 events
  getHackathons lists; a DoraHacks event with no stored submissions would
  not be inferred (none today).
- **Opt-out.** Any `hackathon` parameter turns inference off; empty, it
  searches q's words as text in every event, as before. scout-mcp's
  search_hackathon_builds forwards an empty hackathon so MCP callers can
  opt out too.
- **Usage log.** The route logs the q the caller sent, not the rest, so
  demand reports still see the event names callers type.

## Files

- `probes.json`: the probes and their expected outcomes.
- `capture.mjs`: the capture.
- `replay.test.ts`, `vitest.replay.config.mts`: the replay.
- `summarize.mjs`: reads the capture and both replays and prints
  `summary.txt`.
- `summary.txt`: its output for the first run (capture 2, base bf8262db).
- `summary-review.txt`: its output for the review re-run (capture 3, base
  0735c116).
- `failing-first-review.txt`: the review's new tests failing before its
  fixes.
- `names-as-q.mts`, `names-as-q.txt`: every stored build name as q, and its
  output.
- `failing-first.txt`: the new tests failing before the implementation
  (on eb9ef225, before the rebase onto bf8262db; on bf8262db the same tests
  without the change: the module test cannot import its module, and 6 of
  the 7 new route tests fail, the opt-out test passing as it asserts
  today's behaviour).

## Rerun

From the repository root (the capture reads production, read-only; live
data moves, so numbers can change):

```
node improvements/audits/2026-10-23-event-in-q/capture.mjs <scratch>/live.json
# in a clean export of the base commit, with this directory copied in:
REPLAY_LIVE=<scratch>/live.json REPLAY_OUT_DIR=<scratch>/base npx vitest run --config improvements/audits/2026-10-23-event-in-q/vitest.replay.config.mts
# in this tree:
REPLAY_LIVE=<scratch>/live.json REPLAY_OUT_DIR=<scratch>/branch npx vitest run --config improvements/audits/2026-10-23-event-in-q/vitest.replay.config.mts
cmp <scratch>/base/frozen.jsonl <scratch>/branch/frozen.jsonl
node improvements/audits/2026-10-23-event-in-q/summarize.mjs <scratch>/live.json <scratch>/base <scratch>/branch
```
