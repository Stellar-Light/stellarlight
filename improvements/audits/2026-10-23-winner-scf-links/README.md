# 2026-10-23: winners that became SCF-funded projects

Round ledger: `../../rounds/2026-10-23-winner-scf-links.md`.

## Question

Scout links a stored hackathon submission to the directory project it
became (`project`, with `project.basis` naming the rule). Two winners that
later won SCF awards were served with no project: PayZoll (first place,
Stellar Build Better Hackathon; SCF round 36, USD 100,000) and
YieldBack.Cash (3rd place, Stellar Hacks: Blend; SCF round 38, USD
125,000). Why, and which rules link such winners without one wrong link?

## Why the named cases were unlinked

| submission | project | why no rule linked it |
| --- | --- | --- |
| dorahacks-buidl-25141, PayZoll_Stellar (First Place, build-on-stellar) | payzoll (Live; SCF round 36) | no repo on the submission, and its demo is a Google Drive folder (a shared platform), so the repo, website and owner rules read nothing that names the project; the site the submission lists (payzoll.xyz) is not the directory's (payzoll.finance) |
| dorahacks-buidl-27456, YieldBack.Cash (3rd Place, stellar-hacks-blend) | yieldbackcash (Live; SCF round 38) | its stored repo answers not found since 2026-10-05 (private or deleted, so never taken as moved), the repo's owner is a personal account while the project lists an org, and it has no demo |
| dorahacks-buidl-25271 (Build Better third place) | stellar-ai-agent-kit (SCF round 37) | linked already, by repo: the project's GitHub link is the submission's repo |

Neither unlinked case is a directory gap: both projects are listed.

## The rules

A winner that the five existing rules leave unlinked (no project, no repo
two projects list, no demo site two projects share) is a candidate when
its name is the name, or an alias, of exactly one directory project:
lowercase letters and digits, after dropping a trailing "stellar" or
"soroban" word and then a trailing "on" or "x" (PayZoll_Stellar reads as
payzoll), at least four characters. A candidate links only when a page
says so too, first that holds:

1. `scf-page-and-name`: the project's SCF page links the candidate's
   DoraHacks page (`dorahacks.io/buidl/<number>`) in its own `siteUrls`
   record (a number elsewhere on the page, in a bio or the traction text,
   never counts);
2. `submission-links-and-name`: the candidate's DoraHacks page lists the
   project's website (same site key as the website rule; shared platforms
   never count) or its X account (same handle, profile links only). A
   website or X account two or more projects hold never counts.

A page that could not be read decides nothing: a link these rules stored
for the same project is kept. An SCF page counts as read only when it
carries its `siteUrls` record. A DoraHacks record counts as read only when
it answers with a non-empty links list: a 404, or a record with an empty
or missing list (private and archived records answer so), is could not
check. A links list that holds links but no longer the project's website
or X account is a real reading, and the stored link goes. Submissions that
did not win, and those off DoraHacks, are not considered.

## Method (read-only)

1. `capture.mts`: every stored submission from `/api/hackathons/builds`
   (1,356) and every directory row the sync lane links against, with the
   fields its linker reads plus `aliases` and `scf` (1,137 rows, drafts
   included, from the collection's public REST read). GETs 2 s apart;
   apiVersion 1.9.101 at 21:28:13Z and 1.9.101 at 21:29:05Z.
2. `pages.mts`: every DoraHacks winner's page record (the read the sync
   lane already makes), every SCF page a directory row names (all of them,
   for the recall view; the rule needs only its candidates'), and the page
   of every non-winner the rules would consider without the winner limit.
   One request at a time per host, DoraHacks 3 s apart, SCF 2.5 s apart.
   Its output stays in scratch: it holds upstream links, personal social
   accounts among them.
3. `dryrun.mts`: this tree's linker over the capture, the way the sync
   lane's step 3 runs it: parity with the links served today; the forecast
   with the current repos the repo-moves lane read the same day (its
   resolve output), which the lane's next run stores; then the page rules.
   Output `dryrun.json`: submissions by id, projects by slug, accounts
   never named.
4. `failing-first.txt`: the new tests against the base sources.

The rule and the ship criteria were written in the ledger before the
measured set was read; the three named cases were the only tuning input.

## Results

Live 1.9.101 at both ends of the capture; pages read 21:30Z to 22:05Z.

| measure | count |
| --- | --- |
| stored submissions | 1,356 (1,344 DoraHacks, 12 curated) |
| DoraHacks winners | 68 (the 12 curated winners are events off DoraHacks, which the sync lane never links) |
| winners linked today | 6 (5 by repo, 1 by website) |
| winners linked after the lane's next run without this change | 7 (clevercon by 1.9.95's `moved-repo`) |
| winners still unlinked | 61 |
| named for exactly one project (candidates) | 2 |
| linked by the page rules | 2 (1 `scf-page-and-name`, 1 `submission-links-and-name`), both SCF-funded |
| candidates rejected | 0 |
| unlinked winners whose name no project carries | 59 |
| parity: this tree's linker against the links served today | 1,344 of 1,344 identical (32 linked) |
| links lost or changed by the page rules | 0 |
| pages read | 85 DoraHacks records (68 winners, 17 non-winners), all 200; 598 SCF pages, all 200, 2 of them without a `siteUrls` record (the 600 directory rows with an SCF page name 598 pages: two duplicate rows share their canonical's) |

Winners linked after the next run: 9 of 68 (6 today, clevercon, and these
two).

## Links gained, each checked by hand

| submission | project | basis | evidence on the pages | hand check |
| --- | --- | --- | --- | --- |
| dorahacks-buidl-27456 YieldBack.Cash, 3rd Place, Stellar Hacks: Blend (Blend Composability Award) | yieldbackcash (Live), SCF round 38, USD 125,000 | `scf-page-and-name` | communityfund.stellar.org/project/yieldbackcash-enj: its `siteUrls` analytics entry is `https://dorahacks.io/buidl/27456`, and its traction text says the project won 3rd place in the Blend virtual hackathon | same product: the submission is a "Blend Coupon Bond"; the directory row and the SCF page describe coupon bonds backed by Blend pools; names identical |
| dorahacks-buidl-25141 PayZoll_Stellar, First Place, Stellar Build Better Hackathon (Better Finance track) | payzoll (Live), SCF round 36, USD 100,000 | `submission-links-and-name` | the DoraHacks record lists `https://x.com/PayZoll`; the directory's X link for payzoll is `https://x.com/payzoll`; the SCF page's own `siteUrls` x entry is `https://x.com/PayZoll` | same product: payroll on Stellar paid in stablecoins (submission write-up, directory row, the SCF submission "Universal Payroll Infrastructure"); a team bio on the SCF page names "Stellar Build Better 2025 - 1st Place" |

Precision: 2 of 2 new links are the same product (100%), each checked
against the DoraHacks record, the SCF page and the directory row. The SCF
amounts are the directory's official-record values.

## Candidates rejected, and what the rules leave out

No winner named for exactly one project was rejected. Left out on
purpose, with the reason:

| submission | what points at a project | why no link |
| --- | --- | --- |
| dorahacks-buidl-27417 Comet x Hoops Finance, 2nd Place, Blend | its page lists the X account of hoops (Hoops Finance, SCF-funded); repo under the project's GitHub org; demo on a subdomain of its site | its name is not the project's name (a true link; queue item 3) |
| dorahacks-buidl-32404 Stratum, 7th Place, KALE x Reflector | its page lists the X account the directory holds for tansu, a personal account | Stratum is not Tansu; names differ |
| dorahacks-buidl-32688 Kale on Zenex, 8th Place, KALE x Reflector | its page lists the X account the directory holds for orbitcdp (Inactive) | Kale on Zenex is not OrbitCDP; names differ |
| dorahacks-buidl-38036, Winners, ideaton2026 | its page lists a beacons.ai page; the directory's noticias-trading website is a beacons.ai page | a link-in-bio host, not an identity (queue, Next); names differ |
| 59 winners | none | no directory project carries their name |

No SCF page links a stored winner that the rules leave unlinked: across
all 598 SCF pages, two link any DoraHacks submission at all, YieldBack's
(linked above) and one that links a submission not in the store.

## Beyond winners (not shipped)

Without the winner limit, the same rules would consider 17 non-winners
whose name is exactly one project's (StellarPay four times, Orion, Prism,
Sentinel, Nebula, Velo, Trace and others). All 17 pages were read; none
shows the project's site, X account or an SCF link, so the rules would
link none of them. Juntta is among them: the same product by an earlier
hand check, but only its name says so. Lifting the limit would add reads
and no link today.

## How it takes effect

Links are written only by the sync lane
(`.github/workflows/sync-hackathon-builds.yml`, `scripts/sync-hackathon-builds.ts`).
Nothing changes in the data until it runs with this code.

1. Merge (owner's go). Spec 1.9.108 (the placeholder 1.9.110 while in
   review).
2. Wait for the deploy: `GET /api/status` reports the merged version. The
   API serves a basis only when it is in its own `LINK_BASES`, so a run
   that writes before the deploy serves these two links with no basis
   until the new code rebuilds the builds index (up to an hour after the
   deploy; the index is cached for an hour and the cache outlives deploys).
3. Dry run, read the diff: `gh workflow run sync-hackathon-builds.yml --repo Stellar-Light/stellarlight --ref main -f execute=false`.
   Expected in its log: two `page rules:` lines, YieldBack.Cash named for
   yieldbackcash by `scf-page-and-name (https://communityfund.stellar.org/project/yieldbackcash-enj)`
   and PayZoll_Stellar named for payzoll by `submission-links-and-name`;
   `page rules: 2 winners named for exactly one project and linked by no
   other rule; 2 linked; 0 with a page that could not be read (a stored
   page link to the same project kept)`; and `projectSlug`, `projectName`
   and `projectLinkBasis` changed on 3 rows (these two and clevercon's
   `moved-repo` from 1.9.95), beside `repoCurrentFullName` on the moved
   repos (also 1.9.95's first run) and the lane's routine changes. The
   log names every link change, one line per row, old to new, for every
   rule: `link changes: 3 rows; 0 stored links dropped`, then a
   `link <entryKey>: none -> <slug> (<basis>)` line for each of the three.
   A stored link that leaves a row unlinked prints as
   `dropped <entryKey>: <slug> (<basis>) -> none: <why>`; a drop never
   fails the run (a page edit is a normal reading), so read the lines.
   Every served link carries a basis today, so any other link change is a
   surprise: stop and read it before the execute.
4. Execute: `gh workflow run sync-hackathon-builds.yml --repo Stellar-Light/stellarlight --ref main -f execute=true`,
   or let the daily schedule (04:43 UTC) run it, which always writes. The
   lane reads every write back and exits 1 on a mismatch. The schedule
   runs from main, so the first 04:43 UTC run after the merge writes the
   new bases whatever the deploy's state: the merge's deploy must be live
   (`/api/status` reports the merged version) before then, or that run
   writes bases the old API drops (step 2). Merge outside that window and
   check the deploy first.
5. Read back through the live API (the submission endpoint reads the store
   directly, so at once):
   - `/api/hackathons/builds/dorahacks-buidl-27456`: `project.slug`
     yieldbackcash, `project.basis` scf-page-and-name;
   - `/api/hackathons/builds/dorahacks-buidl-25141`: `project.slug`
     payzoll, `project.basis` submission-links-and-name;
   - `/api/hackathons/builds/dorahacks-buidl-42656`: clevercon,
     moved-repo (1.9.95's rule, on the same run).
   Search, the event pages and analyze read the cached index and follow
   within the hour.

## Limits and open risks

- Recall is low by design. Most unlinked winners carry no directory
  project's name at all; that is directory coverage, not linking. A
  renamed product links only when the directory records the old name as
  an alias. Comet x Hoops Finance is a true link these rules leave out:
  its name is not the project's name, though its page lists the project's
  X account, its repo sits under the project's GitHub org and its demo is
  on a subdomain of the project's site (queue item 3). A rule that reads
  the project's name as whole words inside the submission's name would
  reach it; it is not measured here.
- Two winners in the recall view list the X account the directory holds
  for a project with another name (one of them a personal account). A
  shared account alone would have linked both to the wrong project; the
  name requirement is what keeps them out.
- The rules lean on two upstream page formats. An SCF page counts as read
  only when it carries its `siteUrls` record, and a DoraHacks record only
  when it answers with a non-empty links list; anything else is "could
  not check", which keeps a stored page link. A format change that keeps
  those fields but moves the evidence elsewhere, or a page edit that
  removes it, reads as "no signal" and drops the page link on the next
  run. Every dropped stored link, from any rule, prints in the run log
  with its entryKey, old project, old basis and why, and the summary
  counts them; a drop does not turn the lane red.
- Ordering: a run that writes before the API that knows the two bases is
  deployed serves those links with no basis until the builds index is
  rebuilt by the new code (up to an hour; the cache outlives deploys). The
  daily 04:43 UTC run executes from main, so the merge's deploy must be
  live before the next one (How it takes effect, step 4).
- The shared-platform list misses link-in-bio hosts (beacons.ai and
  others); the website half of `submission-links-and-name` and the existing
  website rule share it. No served link is affected today (queue, Next).
- Curated submissions (events off DoraHacks, 12 winners) are never linked
  by the sync lane, these rules included.
- The measurement is as of the capture; the lane relinks against the
  directory and the pages as they stand when it runs.

## Files

- `capture.mts`, `pages.mts`, `dryrun.mts`: the measurement, read-only.
- `dryrun.json`: its output (submissions by id, projects by slug),
  formatted with biome.
- `failing-first.txt`: the new tests against the base sources.
