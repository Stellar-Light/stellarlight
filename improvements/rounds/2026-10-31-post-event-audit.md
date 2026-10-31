# Post-event benchmarks and audit (2026-10-31)

HackMeridian 2026 is over (2026-10-25 to 2026-10-26). This round re-ran the
three frozen benchmark batteries against live 1.9.111, swept the scheduled
lanes, ran four outside reviews of last week's code on another model
family, and reproduced each of their leads in tests before acting on it.
Findings are leads until reproduced; the verdicts below are the
reproductions'.

## Benchmarks (live 1.9.111, read-only)

| battery | 10-24 | 10-31 | what moved |
| --- | --- | --- | --- |
| v2 (55 q, frozen e8414b70) | 50/55 (working 30/34, held out 20/21) | 49/55 (working 29/34, held out 20/21) | L5-02 "which hackathons are coming up": HackMeridian ended, and the API now says correctly that none are upcoming (between events, with the channels to watch). The battery froze HackMeridian as upcoming, so this is the date, not a regression. |
| priorities (24 q, frozen 9b4ee6be) | 9 strict, 13 lenient (1.9.100/101) | 14 strict, 16 lenient; required 26/40 | Lanes L3, R4, Q1, O2 since then. |
| embarrassment sweep (60 q, frozen 6c3ea6d9) | 59/60 | 60/60, 0 embarrassing | Allbridge Core now carries its exploit and wind-down (lane DQ1). |

Still missing on the priority battery:

- OpenZeppelin stellar-contracts is not indexed for locate (`totalBasis:
  not-indexed`): hm26-sc-03, hm26-sa-04. Needs the owner's first-fill
  dispatch of build-source-locators.
- Winners never reach the top 50 by words: hm26-sa-02 (DeFi Quest, the
  policy-signers playground), hm26-cc-02 (Wraith). Needs a recall change;
  lane RP (reranker reads declared packages) is evidence only.
- Plain-language code questions: every expected symbol is rank 1 by its
  exact name (secp256r1_verify, secp256k1_recover), but the questions miss
  (hm26-sa-06, hm26-cc-05, hm26-cc-06). See the locator leads below.
- "How can my Soroban contract send a message to, or call, a contract on an
  EVM chain?" (hm26-cc-04) serves EVM migration guides, while Scout holds
  the Axelar project, axelarnetwork/axelar-amplifier-stellar and the
  developers.stellar.org cross-chain page.

L2-04 stays partial by its frozen rule: it compares `matched` (64 unique
submissions) with analyze's 65, which counts event entries; the spec
documents that the two differ when a submission entered two events.

## Found and shipped

- **#1888 (spec 1.9.112, live 14:11Z):** locateSource and
  getHackathonSubmission sent no CORS or X-API-Version (a sweep of every
  spec GET path found exactly these two). The drift guard had been red on
  locate for 8 days, and it never probed a `{param}` path. It now does, and
  a unit test fails a PR whose spec GET path lacks the headers. The skill
  reference gained its locate section. HackMeridian 2026 now carries a
  dated "not announced upstream" winners note: no page names its winners
  (checked 2026-10-31). The Sodax SDKs notes key moved to
  gosodax/sodax-sdks, which had reddened the backfill lane since
  2026-10-27. Live: both routes send both headers; the drift guard reads
  234 passed and 0 failed (it was 230 and 4).
- **#1889:** Freighter is now Varial (SDF, 2026-10-29). Scout answered
  `resolveProject?q=Varial` with "not tracked". The sweep's grader caught
  it: SDF's docs chunks said Varial while the directory row did not. The
  directory change lands only when the owner runs curate-projects and
  curate-partners with execute (dry runs: 2 writes each, named in the PR).
  The code half is live: `/api/skills?kind=sdk&q=varial` returns "Varial
  SDK (formerly Freighter API)", and the skill names Varial.
- **#1890 (spec 1.9.113, live 14:35Z):** build search reads each word
  without its edge punctuation. Evidence: `2026-10-31-build-terms.md`.
  Live: `q=--` from 1,356 matches to 0; "lending -- small businesses" from
  1,356 to 24, as without the `--`; "escrow, milestones, freelancers" from 2
  to 8, as without the commas.
- **#1891:** the last served em dash (the Electric Capital source label,
  from its generator, which now strips dashes from anything upstream sends)
  and the dash check reads JSON under `src/`.
- **#1892:** a stored winner link stands only while its own page is unread,
  and link-in-bio, event, form and dashboard hosts are no project's
  identity (G3 findings 1 and 2). No served link changes.

## Lane sweep (last run of every scheduled workflow, 2026-10-25 to 10-31)

| lane | state | cause | who |
| --- | --- | --- | --- |
| API drift guard | red x6 | locate headers, skill reference | fixed, #1888 |
| Backfill knowledge notes | red x5 | registry key icon-project/sodax-sdks moved | fixed, #1888 |
| Task lane, Repair lane | red x4, x6 | "Credit balance is too low" (Anthropic API) | owner: top up |
| gone repos | red x6 (report-only by design) | 234 served repos answer 404 on GitHub (70 new on 10-31; spot-checked 8, all 404) | owner: dispatch with execute |
| Refresh Scout research corpus | red x2 | lumenloop-research and sdf-org re-plan 2 writes each after execute (volatile pages) | queued |
| workflow-health | red (weekly) | the scout-mcp mirror repo has drifted from the monorepo (README, package.json, src/index.ts, test/smoke.mjs) | owner: run the manual sync |
| weak-basis liveness | red (weekly) | command-robotics site answers 404 | owner: curation call |
| Supersession freshness | red (weekly) | 13 archived repos in the curated pool lack a supersession entry | queued |

## Outside reviews, reproduced

Reviews ran on another model family, each in a clone with no remote. Agents
reproduced each lead with a failing test or a live read.

**G1, live GitHub reads and judging** (`src/lib/repo-live-read.ts`,
`src/lib/hackathon-judging.ts`). 10 leads. Confirmed, medium: a git
submodule is not expanded and the tree still reads as complete, so a
contract kept in a submodule is served as "no contract crate". Confirmed,
low: a truncated tree is not listed in `unread` and the test count stays a
number (the spec text is wrong, the count is kept on purpose);
`extractStellarDeps` reads fewer manifest fields than `detectStellarProof`
(optionalDependencies, a Cargo soroban-client); a contract id inside an HTML
comment counts as found; the pool lock can outlive the 15-minute token
retry; a refund can land in the next hour; the partner key's 1,200 a minute
contradicts the spec's 20 a minute (spec text). Refuted: the Link header
always carries rel="last" (checked live); Vercel overwrites
X-Forwarded-For. Fix sites: `repo-live-read.ts` 619-620 and 730 (tree
completeness), `stellar-deps.ts` 59-71 and 93-97, `repo-live-read.ts`
261-266, 338 and 396.

**G2, build search matching** (`src/lib/hackathon-builds.ts`). 9 leads.
Confirmed and shipped in #1890: a punctuation-only token matched every
build; edge punctuation stayed on the word; a combining mark was cut as
punctuation (the shipped review's note). Measured and held: a
three-letter word's plural matches inside longer words (q=age lists
"packages"), but holding it to a whole word also dropped relevant compound
names. By design: the half rule admits one of two concepts; the winner edge
works on near equals. Low, queued: `not` counts as a concept; hyphenated
phrase parts typed alone are dropped; camelCase is lowercased before it can
split.

**G3, winner links and award labels** (`src/lib/hackathon-build-links.ts`,
`scripts/sync-hackathon-builds.ts`). 9 leads, all confirmed. Medium:
`pageRuleLink` keeps a stored page link when its own page was re-read and
does not corroborate, as long as the other page is unread (0 served rows
rest on it today). `SHARED_SITES` lacks link-in-bio hosts (beacons.ai,
bio.link, bento.me, about.me, lu.ma), so one project's beacons.ai website
corroborates any beacons.ai link (a live row has such a website; 0 served
links rest on it). Low: a brace inside a siteUrls value misreads the record;
name keys drop accented letters; a pool title with no dollar figure; only
the first award stored per submission; the first dollar figure decides; a
kept link is not copied to the submission's other events; the public log
prints submission titles. Fix sites: 588-592 and 151-181 of
`hackathon-build-links.ts`, 414-426, 358 and 223; `dorahacks.ts` 336-347 and
665-666; `sync-hackathon-builds.ts` 464 and 474. Findings 1 and 2 shipped in
#1892; the rest are queued.

**G4, status checks, locator and dash guard.** The first run hit its turn
limit and was split in three. Not yet reproduced except where noted.

- G4a (`src/lib/status-checks.ts`, `scripts/enrich-tvl.ts`), 7 leads: one
  zero delta reads a contract as fully quiet; a multi-slug TVL sum can drop
  a slug and still be stamped fresh; semantic rows may pass Date objects
  where the checks expect strings (inferred); an unparseable window is a hit
  with "NaN days"; a chain breakdown with no Stellar key reads as the
  cross-chain total; a live parent listing does not save a deprecated
  child; a negative TVL reads as $0.
- G4b (`src/lib/source-locator.ts`), 8 leads: a stopword between the CLI
  name and the command clears the command; the command run takes the first
  two words; `build` continues a command; a one-word typed identifier stays
  on the word tier; the ethereum synonym ranks the curve names above
  eth_abi; the bare alias quickstart lifts every quickstart hit; a page past
  the last says `[]` with a full total; command words are not stemmed.
  These bear on the priority battery's code questions.
- G4c (`scripts/check-no-dashes.ts`), 6 leads: served JSON was not read
  (reproduced, fixed in #1891); report markdown the blog
  publishes is not read and holds em dashes (published content: owner
  review); decoded entity dashes in research titles; entity forms without a
  semicolon; an escaped backslash false-fails; `.test.mts` counts.

## Other leads from the sweep

- A research chunk of minified JSX is served at high confidence (the USDT0
  dev-docs page, chunk 16, query "USDT on Stellar").
- An announced Stellar national online hackathon in Bolivia (November 2026,
  $3,000 pool, registration not yet published) is not in the feed.
- The /hackmeridian page in #1868 (a pre-event draft) is moot now that the
  event is over; HackMeridian 2026 results are not published anywhere we
  could read.

## Process notes

- Grok's balance ran out mid-run (402) on two reviews; the fallback was
  the O2 lane's: an independent reviewer on another model (Fable) in a
  clone with no remote, with a re-check of every fix by the same reviewer.
- The build-terms replay caught a bug in the change itself before review: a
  new optional parameter on a function passed bare to `.map()` received
  the array index. Byte identity on untouched queries is what flagged it.
