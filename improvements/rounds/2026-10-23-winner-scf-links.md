# 2026-10-23: link winning submissions to the SCF-funded projects they became

## Scope

Builders and press at HackMeridian 2026 will ask what happened to past
Stellar hackathon winners. Scout answers through a stored submission's
`projectSlug` and `projectLinkBasis`, set by the sync lane
(`scripts/sync-hackathon-builds.ts` step 3, rules in
`src/lib/hackathon-build-links.ts`: repo, website, owner-and-name,
moved-repo, moved-owner-and-name). A cold-outsider check found winners that
became SCF-funded projects served with no project: PayZoll (first place at
the Build Better hackathon, later SCF round 36) and YieldBack.Cash (third
place at Stellar Hacks: Blend, later SCF round 38). Scout served one
verifiable winner-to-SCF link (the Build Better third place that became
Stellar AI Agent Kit, SCF round 37). This round finds why each named case is
unlinked and adds only linking rules whose evidence is strong and
checkable, each with its own declared basis.

## Lanes

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| LK: winner to SCF links | Claude Opus 5.5, high | own worktree, branch `lane/lk-winner-scf-links` off origin/main (85843791, spec 1.9.101): `src/lib/hackathon-build-links.ts`, `scripts/sync-hackathon-builds.ts`, their tests, the hackathon-builds collection if a field is needed, spec text, changelog, version (placeholder 1.9.110), `improvements/audits/2026-10-23-winner-scf-links/`, this ledger | one commit on the branch, not pushed |

The orchestrator holds the push, the PR, the independent review and any
production run.

## Review

The orchestrator's independent review, on a model other than the
author's, returned "GATE: fix first" with nine findings; each, and what it
became, is in "Review and fix" below.

## Ship criteria (fixed before any result over the stored winners)

- (a) Zero false links among the links the new rules add. Every new link is
  checked by hand against public sources (the DoraHacks submission page, the
  SCF project page on communityfund.stellar.org, the project's own site or
  GitHub) and recorded with its evidence; precision is reported, and the
  bar is 100% of verified links.
- (b) Existing links unchanged: this tree's linker replayed over the current
  stored submissions and directory rows reproduces every link served today
  (project and basis), and the new rules change none of them (0 lost, 0
  changed).
- (c) Report how many winners gain a link and how many of those are
  SCF-funded; list every candidate the rules or the hand check rejected, and
  why.
- A new link that looks wrong stops the lane: the rule is dropped or made
  stricter, never tuned on the measured set to keep a count.

## Method

- Tuned slice: the three named cases (PayZoll, YieldBack.Cash, Stellar AI
  Agent Kit). The rules are designed on them only.
- Measured set: every stored winning submission, read live from
  `/api/hackathons/builds` (GETs 2 s apart, apiVersion at the start and the
  end), with the directory rows the sync lane links against (the fields its
  linker reads, plus the SCF fields any new rule reads). The rule is fixed
  before this set is read. Rules that read upstream pages (DoraHacks, SCF)
  read them read-only and spaced; their raw output stays in scratch (it
  carries upstream text and personal handles), and the committed evidence
  names submissions by id.
- If a rule can apply beyond winners, it is also replayed over every stored
  submission, and every link it adds there is checked the same way.

## Rule (fixed on the tuned slice, before the measured set is read)

Applies only to a stored DoraHacks submission that is a winner and that
the five existing rules leave with no project: no repo, moved repo, site,
or owner-and-name match, no repo listed by two projects, and no demo site
two projects share. Existing links are untouched by construction.

- Name match: the submission's name equals the name of exactly one
  directory project, or one of that project's aliases, compared as
  lowercase letters and digits after dropping a trailing "stellar" or
  "soroban" word and then a trailing "on" or "x" ("PayZoll_Stellar" reads
  as "payzoll"); at least four characters. A duplicate row resolves to its
  canonical project and a hidden draft is skipped, as the other rules do.
  Two projects with the same key link neither.
- Corroboration, first that holds:
  1. `scf-page-and-name`: the project's SCF page (its `scf.sourceUrl` on
     communityfund.stellar.org), read by the lane, links this
     submission's DoraHacks page (`dorahacks.io/buidl/<number>`).
  2. `submission-links-and-name`: the submission's DoraHacks page, read
     by the lane, lists the project's website (the same site key the
     website rule uses, shared platforms never) or the project's X
     account (the same handle, profile links only).
- A page that could not be read decides nothing: the row keeps a link
  stored by one of these two rules to the same project, and otherwise
  stays unlinked.
- Not used, and why: a shared GitHub owner is the owner-and-name rule
  already; team member handles are not stored; free-text mentions of an
  event on an SCF page ("Blend" also names a protocol) are not exact
  enough.

## Log

- 2026-10-23 (lane LK): first branch at e94ef292 was abandoned unused after
  the session's worktree changed; `git fetch origin`, then
  `git switch -C lane/lk-winner-scf-links origin/main` at 85843791 (spec
  1.9.101). The linker files are unchanged between the two.
- Named cases, live 1.9.101 (`/api/status` at 21:13Z):
  `/api/hackathons/builds/dorahacks-buidl-25141` (PayZoll_Stellar, First
  Place, build-on-stellar): no GitHub link, demo on Google Drive, `project`
  null. `/api/hackathons/builds/dorahacks-buidl-27456` (YieldBack.Cash, 3rd
  Place, stellar-hacks-blend): repo stored, `repoMissingAt`
  2026-10-05T16:13:34Z, no demo, `project` null. Directory rows `payzoll`
  (website payzoll.finance, `links.github` an org link, SCF round 36, USD
  100,000, official-record) and `yieldbackcash` (website yieldback.cash,
  `links.github` an org link, SCF round 38, USD 125,000, official-record).
- Tuned slice, upstream pages read once each (21:15Z to 21:20Z):
  DoraHacks `/api/v1/hub/buidls/25141` lists `https://www.payzoll.xyz` and
  `https://x.com/PayZoll` among its links; no repo. SCF page payzoll-v4g:
  `siteUrls` website payzoll.finance, x `https://x.com/PayZoll`; no
  DoraHacks link; a team bio names "Stellar Build Better 2025 - 1st Place".
  DoraHacks `buidls/27456`: links are its video, its repo and the
  account that owns the repo. SCF page yieldbackcash-enj: `siteUrls`
  analytics `https://dorahacks.io/buidl/27456`, and its traction text
  says it won 3rd place in the Blend virtual hackathon.
  `/api/hackathons/review` with the link of a fork of stellar/stellar-cli
  under an individual's account:
  Stellar AI Agent Kit's link is `dorahacks-buidl-25271` ("Soroban to MCP
  Server in seconds + Policy Signers Playground"), by repo; its SCF page
  links no DoraHacks submission.
- Why each named case is unlinked: PayZoll's submission has no repo and
  its demo is on Google Drive (a shared platform), so no existing rule
  reads anything that names the project; its site (payzoll.xyz) is not the
  directory's (payzoll.finance). YieldBack.Cash's stored repo answers not
  found since 2026-10-05 (private or deleted, so never taken as moved),
  its owner is a personal account while the project lists an org, and it
  has no demo. Neither is a directory gap: both projects are listed.
- Rule fixed (section above) from these three only.
- Tests first: `src/lib/__tests__/hackathon-winner-links.test.ts`, 17
  tests, run against the base sources: 17 failed (`failing-first.txt`).
  With the pure rules in `hackathon-build-links.ts` (productKeyOf,
  xHandleOf, scfPageOf, buidlNumbersIn, indexProjectNames, namedCandidate,
  pageRuleLink), `pageLinksOf` in `integrations/dorahacks.ts` and the spec
  text: 17 passed.
- `pnpm exec tsx improvements/audits/2026-10-23-winner-scf-links/capture.mts <scratch>/capture.json`:
  1,356 submissions, 1,137 directory rows, 28 requests; apiVersion 1.9.101
  at 21:28:13Z and 1.9.101 at 21:29:05Z. Winners: 80 (68 DoraHacks, 12
  curated, which the sync lane never links); 6 DoraHacks winners linked (5
  repo, 1 website). All links served: 32 (17 website, 13 repo, 2
  owner-and-name); none moved, so the lane has not run since #1859 merged.
  Directory: 600 rows with an SCF page, 622 marked SCF-awarded, 621 with
  an X link, 13 with aliases.
- `pages.mts <capture> <scratch>/pages.json` started 21:35Z: every
  DoraHacks winner's page (3 s apart) and every SCF page in the directory
  (2.5 s apart).
- 21:41Z: the sweep restarted so each SCF read records whether the page
  carries its `siteUrls` record; the lane now counts an SCF read only then
  (a page without it is a format it does not know: could not check, never
  "links none"). DoraHacks reads kept (all 68 winners answered 200).
- Lane wiring in `scripts/sync-hackathon-builds.ts`: step 2 keeps each
  page's links in memory; step 3 selects `aliases` and `scf` too, finds
  the named winners (a submission that won any of its entries, so its
  rows link alike) and calls `linkByPages`: the SCF page and the
  submission page (step 2's read, else one read), 1 s apart, then
  `pageRuleLink` per row with the row's stored link for carry-over. The
  dry run prints one line per named winner and counts by basis.
- Also: the collection's `projectLinkBasis` description (mirrored in
  `src/payload-types.ts` by hand: generating types loads the Payload
  config, and this lane opens no database connection); the analyze
  `project` facet label, which named two of the link rules, now names all;
  spec 1.9.110 (placeholder) with a changelog entry.
- Checks so far (origin/main 85843791): `pnpm exec tsc --noEmit -p tsconfig.json`
  exit 0; `pnpm exec tsx scripts/check-scripts-types.ts` exit 0 (GREEN, 28
  baselined); `npx vitest run src/lib/ src/components/ src/app/ src/collections/ src/data/ --maxWorkers=4 --minWorkers=1`
  exit 0, 218 files, 2,703 tests; `pnpm contract:write` exit 0;
  `CONTRACT_BASE=origin/main pnpm contract:check` exit 0;
  `pnpm raven:gate --raven <stellar-raven at b1dc866>` exit 0, ACCEPT
  1.9.110 (legacy 220/298/326/112, holdout unchanged, 2 gains, 0
  hit-to-miss). The same gate on origin/main's spec snapshot: ACCEPT
  1.9.101 with the same totals and gains; the only difference is one held
  out question (q-holdout-b-10-nextjs-payment) whose 4th and 5th picks
  swap (searchHackathonBuilds and getStatus), top 3 unchanged.
- Two silent-loss paths closed: an SCF page without its `siteUrls`
  record, and a DoraHacks record without its `links` list (`pageLinksOf`
  now answers null), each count as could not check, so a format change
  upstream keeps a stored page link instead of removing it. The second
  was added after the partial dry run had shown the two candidates;
  neither guard changes a measured link (both candidates' records carry
  the list, and their SCF pages carry the record). A test for the second (18 tests now) failed first, then
  passed. The lane also skips the submission-page read when the SCF page
  already links the submission.
- `pnpm exec tsx scripts/check-writer-conformance.ts` exit 0 (all writers
  conform). The three audit scripts type-check clean under the repo's
  config with node types (a scratch config; the only errors it shows are
  three existing `next: { revalidate }` fetch options in
  `integrations/dorahacks.ts`, which need Next's types that config drops).
- Recorded late, in order: at about 21:37Z a partial dry run (all 68
  winner pages, 84 of 600 SCF pages) showed the two named candidates and
  four winners whose page lists a project's site or X account under
  another name. The rule was not changed after it; the two guards above
  are the only code changes since, and the beyond-winners view (the same
  rule on the 17 non-winners it would consider without the winner limit,
  not shipped) was added to the scripts then, to test the corroboration
  on generic names.
- 22:05:50Z: the sweep finished; `pages.mts` resumed for the 17
  non-winner pages: 85 DoraHacks records (68 winners, 17 non-winners), all
  200; 598 SCF pages (the 600 rows with an SCF page name 598; two
  duplicate rows share their canonical's), all 200, two without a
  `siteUrls` record (vaquita-gamified-savings-pqq, smilepay-global-7gh;
  neither project is a candidate).
- `dryrun.mts <capture> <pages> <repo-moves resolve output> dryrun.json`:
  parity 1,344 of 1,344 (32 linked); forecast with the same-day current
  repos +1 (clevercon, `moved-repo`), winners linked 7 of 68; named
  candidates 2, gained 2 (dorahacks-buidl-27456 to yieldbackcash by
  `scf-page-and-name`, the link in the SCF page's `siteUrls`;
  dorahacks-buidl-25141 to payzoll by `submission-links-and-name`, its X
  account), both SCF-funded; rejected 0; lost or changed 0; 59 unlinked
  winners carry no project's name. Recall view: 0 SCF pages link a winner
  the rules leave out (2 of 598 link any DoraHacks submission: YieldBack's,
  and one not in the store); 4 winner pages list a project's site or X
  account under another name (Comet x Hoops Finance to hoops, a true
  link; two that list the X account the directory holds for another
  product; one via a beacons.ai page). Beyond winners (not shipped): 17 considered, 17 pages
  read, 0 would link (Juntta is one of the 17).
- Hand check of both new links against the DoraHacks record, the SCF page
  and the directory row: same product each (README table). Precision 2 of
  2. Ship criteria (a), (b) and (c) hold.
- Verified for the README: 25271 is Build Better's Third Place, linked by
  repo; hoops lists the hoops-finance org and hoops.finance; every served
  link carries a basis (so the lane's dry run should change no other
  basis); the YieldBack SCF page carries the directory's description.

## Outcome

- Committed on branch `lane/lk-winner-scf-links` (not pushed), spec
  1.9.110 as a placeholder for the version at merge.
- Data effect, after the sync lane's next run (dispatch steps in the audit
  README): dorahacks-buidl-27456 (YieldBack.Cash) links to yieldbackcash
  by `scf-page-and-name` and dorahacks-buidl-25141 (PayZoll_Stellar) to
  payzoll by `submission-links-and-name`, both SCF-funded; no other link
  changes from this round (clevercon's `moved-repo` lands on the same run,
  from 1.9.95). Winners linked: 6 served today, 7 after that run without
  this change, 9 of 68 with it.
- Not verified live: nothing is deployed or run from this lane.
- Queue: item 3's state updated; a Next item for link-in-bio hosts missing
  from the shared-platform list. Leads, not built: a whole-word name rule
  (the project's name inside the submission's) would reach Comet x Hoops;
  59 unlinked winners are a directory coverage question.
- Measurement and outputs: `../audits/2026-10-23-winner-scf-links/README.md`.

## Review and fix

Fixed on the same branch, tests first: five new tests (23 in the file)
failed on 32801488 and pass after the fix (`failing-first.txt`, second
section). Line numbers are the fix commit's.

1. MEDIUM, a DoraHacks 404 cleared a stored page link: fixed. Step 2 now
   records a 404 as could not check (`scripts/sync-hackathon-builds.ts:588`,
   `pageLinks.set(id, d?.links ?? undefined)`), step 3 reuses that read
   instead of a second one (`:450`) and a fresh read that answers 404
   leaves the links unset (`:454`). The review's failing input,
   `pageRuleLink(..., {scfBuidls: Set(), pageLinks: []}, payzoll by
   submission-links-and-name)`, now keeps the link (test "an empty links
   list ... is could-not-check").
2. MEDIUM, a page edit or an empty list dropped a stored link silently:
   fixed as decided. `pageRuleLink` counts an empty or missing links list
   as could not check (`src/lib/hackathon-build-links.ts:589`), and the
   lane's unread tally agrees (`scripts/sync-hackathon-builds.ts:461`). A
   non-empty list without the project's site or X account is a real
   reading and drops the link (same test). Every stored link a run leaves
   unlinked, from any rule, gets a reason (`linkDropReason`,
   `src/lib/hackathon-build-links.ts:517`; filled at
   `scripts/sync-hackathon-builds.ts:698` and `:725` to `:737`) and prints as
   `dropped <entryKey>: <slug> (<basis>) -> none: <why>` in the summary,
   with the count (`:1026`). The run's exit code is unchanged by a drop.
3. MEDIUM, the dry run could not identify a changed or lost link: fixed.
   One line per row whose `projectSlug` or `projectLinkBasis` changes in
   the FIELDS diff, old to new, for every rule (`linkChangeLine`,
   `src/lib/hackathon-build-links.ts:538`; printed at
   `scripts/sync-hackathon-builds.ts:1010` to `:1029`), after a
   `link changes: N rows; D stored links dropped` line. The README's
   expected dry-run log names them.
4. LOW, ordering and base drift: answered, no code. The orchestrator
   merges main and renumbers the spec version at merge time. The daily
   schedule (04:43 UTC) executes from main, so the merge's deploy must be
   live before the next 04:43 UTC run, or that run writes bases the old
   API drops; the orchestrator merges outside that window and checks
   `/api/status` first. The README says so (How it takes effect, step 4;
   Limits, Ordering).
5. LOW, a shared X handle still corroborated: fixed, and the same hole for
   a shared website closed with it. `indexProjectNames` nulls a site or X
   handle two or more projects hold
   (`src/lib/hackathon-build-links.ts:457`), as `indexProjectSites` does
   for the website rule. Capture count: 19 handles and 36 site keys are
   held by two or more projects; payzoll's handle and site, and
   yieldbackcash's site, are each held by one. Both dry-run links still
   link (below). In `dryrun.json` two beyond-winners rows (nebula,
   sanctum) now show `projectHasX: false`, since their handle is shared;
   neither would link before or after.
6. LOW, a directory change dropped a stored page link with no trace:
   behavior kept (ambiguity unlinks), and the drop now prints with its
   reason, for example "its name is carried by two or more projects" or
   "no project carries its name" (test "names why a stored link is
   dropped, for every rule").
7. LOW, `scf-page-and-name` counted a buidl number anywhere on the SCF
   page: fixed. The lane reads numbers from the page's own `siteUrls`
   record only (`scfSiteUrlsBuidls`, `src/lib/hackathon-build-links.ts:414`,
   brace-matched as `scripts/enrich-from-scf.ts` and `pages.mts` read it;
   called at `scripts/sync-hackathon-builds.ts:439`), and `dryrun.mts`
   now judges candidates on `inSiteUrls`, as the audit measured. The
   recall view still reads whole pages, since its job is to show what the
   rule leaves out.
8. LOW, an individual's GitHub handle in committed text: replaced at the
   Log line that named it with "a fork of stellar/stellar-cli under an
   individual's account". A grep of every added line against 85843791
   for GitHub, X and Telegram account paths and at-handles finds only
   project accounts (PayZoll, YieldBack.Cash, Blend) and test fixtures.
9. LOW, `dryrun.json` not biome-formatted: formatted; the formatted file
   parses to the same JSON as before (checked by deep comparison), then
   was refreshed from the fixed `dryrun.mts` (item 5's two fields) and
   formatted again.

Re-run of `dryrun.mts` over the committed capture (the same capture,
pages and repo-moves files as the round): parity 1,344 of 1,344; linked
32 served, 33 forecast; named candidates 2, gained 2 (dorahacks-buidl-27456
to yieldbackcash by `scf-page-and-name`, its link in the SCF page's
`siteUrls`; dorahacks-buidl-25141 to payzoll by
`submission-links-and-name`, its X account), both SCF-funded; rejected 0;
lost or changed 0; recall 0 and 4; beyond winners 17 considered, 17 pages
read, 0 would link. Every summary number is unchanged.

Review notes A to D are unchanged by these fixes (clevercon stays the one
`moved-repo` forecast link).

## Re-check and merge (2026-10-23)

- Re-check of f940e75d (the same reviewer): GATE push. Each fix holds
  against its original failing input; no DoraHacks page link, social URL or
  handle reaches a log line (every new interpolation is an entryKey, a
  slug, a basis or a fixed reason); a non-empty list without the project's
  site or X drops a link, so the empty-list rule keeps no contradicted
  link; parity reproduced independently on a fresh capture: 1,344 of 1,344,
  gained 2 (25141 to payzoll, 27456 to yieldbackcash), lost or changed 0.
  Two residuals, low and neither a false link: an SCF siteUrls naming a
  different buidl while the DoraHacks list is empty keeps a stored page
  link (a project can enter several hackathons); a closing brace inside a
  siteUrls URL ends the brace match early and reads as links none
  (false-negative direction only).
- Merge: main merged in at 36b1bc89 (spec 1.9.107 there, the smart wallet
  concept); this change is spec 1.9.108, renumbered from the 1.9.110
  placeholder. Checks on the merged tree: tsc exit 0; vitest (src/lib,
  src/components, src/app, src/collections, src/data) 220 files, 2,824
  tests passed; contract:write no diff; contract:check exit 0; Raven gate
  ACCEPT 1.9.108; writer conformance and scripts types green.
- Timing: merged about 23:20Z on 2026-10-23, so the deploy is live well
  before the 04:43 UTC scheduled run, which writes the two links.
- The secret scan (gitleaks generic-api-key) flagged a normalized name in
  dryrun.json: a field named with "key" holding a long run of letters and
  digits. Not a secret. The two fields are renamed in dryrun.mts and
  dryrun.json (nameKey to nameNorm, projectNameKey to projectNameNorm);
  no value changed. gitleaks 8.30.1 over the branch's commit range: no
  leaks. A fingerprint in .gitleaksignore would not have covered the
  squash-merged commit on main, whose hash differs.

