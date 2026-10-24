# Judging review: a team's repo against an event's criteria (2026-10-23)

**Verdict: review round 1 and re-check 2 fixed; 0 false claims on the final
code over 40 repos.** reviewSubmission takes `hackathon=<slug>` (hackmeridian-2026
today). Each of the event's judging criteria comes with the evidence a judge
would find in the team's GitHub repo, read live, or `checkable: false` with
the reason. A GitHub repo with no stored submission is reviewed from the
live read alone (`stored: false`) instead of answering 404.

- Seven sets, 40 public repos never stored, each set labelled by hand from
  GitHub before its first run: first runs served 10 false evidence items in
  375. Each was fixed by its class with a failing-first test.
- All 40 run again on round 1's final code, and again after re-check 2's
  fixes: 400 items each time, 0 false. Every change since labelling was
  re-read on GitHub and recorded, not counted.
- Every response says `checkable: false`, with its reason, for the three
  criteria the repo cannot show: 120 of 120 on the final code.
- Two live stored reviews, requested without `hackathon`, replay byte for
  byte through the final handler.
- 85 cold live reads in review round 1 all answered 200 inside the
  4-second budget: 478 to 1,842 ms, median 1,030 (all 85 rows under
  `runs/round1/`); re-check 2's 40 took 593 to 1,509 ms.
- `pnpm raven:gate`: Raven would ACCEPT 1.9.102 (`raven-gate.txt`).

The ledger with every command and time is
`improvements/rounds/2026-10-23-judging-review.md`. Individuals' repos are
named by pseudonym (`repo-01` to `repo-21`) in every file here; the map is
held by the operator, outside the repository. Their commit SHAs are
redacted too (`"commit": "<redacted>"`, "Read at the default branch's
newest commit."), since a SHA finds its repository. Organizations' repos
keep their names and SHAs.

## Design

reviewSubmission is extended, not joined by a sibling operation. The
question a team asks ("here is my repo for HackMeridian: what will the
judges find, what is missing?") is the question reviewSubmission's routing
text already owns ("review my project", "what is missing"). A sibling
operation would compete for those same words in Raven's lexical index. The
404 for a repo never stored was the gap, and it lived here. The new block
appears only with the new parameter, so every existing response stays as
it was.

- **Criteria as data.** `src/data/curated-hackathons.ts` gives HackMeridian
  2026 `judging.criteria`: Genesis and Scale, four criteria each, in the
  judging sentence's words and order.
  `src/data/__tests__/curated-hackathons.test.ts` holds each category and
  its list to one clause of the sentence ("Genesis on a, b, c and d", ended
  by ; or .), and no criterion may hold ", " or " and ", so two criteria
  merged into one entry fail without any count pinned. The test rejects a
  criterion moved between categories, a reordered list, a cut-short list, a
  criterion cut short, merged or invented.
- **Mapping** (`src/lib/hackathon-judging.ts`):

  | criterion | evidence |
  | --- | --- |
  | problem clarity | `checkable: false`: judged from the pitch deck, demo video and submission answers, which Scout does not read |
  | MVP quality | testFiles, ciConfig, releases, contractIds, website, demoLinks |
  | Stellar integration | stellarPackages (with the SDK versions declared), contractCrates, contractIds |
  | continued development potential | lastCommit (commits on the default branch, the last one's date, the repo's creation date, archived) |
  | milestones against goals set at pre-event intake | `checkable: false`: the goals are set at intake and not published |
  | SCF eligibility | scfRound: the live SCF round state, the source scfPitch reads; eligibility itself is SCF's prescreen, and the finding points at the scf-prescreen-checker skill |
  | production readiness | testFiles, ciConfig, releases, contractCrates, contractIds, website, demoLinks |
  | ecosystem impact | `checkable: false`: a judgment on the pitch, from what Scout does not read |

  Each item is `{id, state, finding, values, count}`. `state` is `found`,
  `not-found` (only within what the finding says was read) or
  `could-not-check` (never a no). `count` is null whenever the part read
  was partial. There is no score and no pass or fail.
  - `website` is the repo's website field, whatever it points at: never
    called a demo (a library's docs site is a website).
  - `demoLinks` are README links Scout reads as labelled a demo or live app:
    the link's own text and its own line only; "live" and "hosted" only as
    a label ("Live:", "hosted version"); never a link whose words say docs.
    Both demo sentences speak of what Scout reads ("Scout reads N link(s)
    as labelled ...; a link labelled in other words is not listed"), so a
    README label in other words ("Livedemo", "Live at") leaves no false
    sentence, only a link listed as not judged. Links inside HTML comments
    are not read, since GitHub does not show them (contract ids are still
    read from the whole file); fenced code blocks are read as before.
  - A cited SDK version is a version: an npm alias
    (`npm:@stellar/stellar-sdk@17.0.1`) is kept, a workspace, file or git
    reference is not cited.
- **The live read** (`src/lib/repo-live-read.ts`):
  - It is read-only. Four GitHub REST calls: the repo (and nothing more
    unless it is public), its default branch's newest commit and its newest
    release, then the tree at that commit. Never the ref `HEAD`, which
    GitHub resolves to a branch named HEAD when one exists
    (stellar/stellar-cli has one, 338 commits behind main).
  - The README and up to 12 manifests come from raw.githubusercontent.com
    at the same commit, off the REST pool, asked for uncompressed and read
    as a stream cut at a byte cap (100,000 bytes of README; a manifest over
    512 KB is not read and says so).
  - `repo.commit` names the commit; every finding read from the files ends
    "Read at commit abc1234."
  - A raw file that is not UTF-8 text (a UTF-16 byte order mark, or NUL
    bytes) is not read and says so, so it can never yield a not-found.
  - Facts come from the scan lane's own parsers: `extractStellarDeps`, and
    `detectStellarProof` for the SDK versions, other languages' SDKs and
    deployable crates.
  - One deadline for the whole read: 4,000 ms. A read is kept 5 minutes
    per repo, or 1 minute when a part was not read. Each part in `unread`
    gives its own reason in the findings resting on it (GitHub's answer or
    silence for that part, a body that did not arrive before the deadline,
    a listing cut short, a file that is not UTF-8 text, a manifest over
    512 KB, more manifests than the 12 a read takes). Over a listing cut short, a
    README missing from the part listed is unread, not absent.
  - The token is the app's (`githubToken()` in `src/lib/github.ts`, the
    same order every GitHub read here uses).
- **Keeping the scan lane's token budget.** That token has starved before.
  The read takes at most 240 REST calls per server instance per hour, and
  one caller (a partner key, or else an IP, keyed as the rate limiter keys
  it) at most a quarter of them; past it, that caller's reads answer
  could-not-check. It makes no call while GitHub reports the token's pool
  under 1,500, until GitHub's reset time; with no token, the floor is the
  empty pool. Requests with `hackathon` are held to 20 a minute per caller
  (429). A repo held for malware is not read. What a caller with many
  addresses can still do is in the ledger (review round 1).
- **Route** (`src/app/api/hackathons/review/route.ts`): the
  `hackathon` window is checked before any store or GitHub work. Without
  `hackathon` the stored path runs the same code as before. Only the 404's
  advisory for an unstored link changed, to name the parameter.
- **Spec, docs and MCP.** The parameter, `stored`, `security`, `repo`
  (with `commit`), `judging`, the 429, and the 400 with `validHackathons`
  are declared in `src/lib/openapi-spec.ts`. New enums spread code
  constants and are pinned in `spec-enum-parity.test.ts`. The skill
  reference (`public/skills/references/api-reference.md`), scout-mcp's
  `review_submission` (input `hackathon`) and its README say the same. The
  package version is not bumped.

## The sets, first runs and fixes

Each set was labelled from GitHub's own answers before its first run
(`labels*.json`), then run once on the code of the moment; each fix was
gated by the next set.

| set (first run) | repos | items | false | class | fix | failing-first |
| --- | ---: | ---: | ---: | --- | --- | --- |
| the ten | 10 | 90 | 2 | a test count from a name heuristic served as a total | the rule is each ecosystem's named conventions only, stated in the finding; the count is a floor | `failing-first-testrule.txt` |
| held-out five | 5 | 45 | 2 | a count over a partial manifest read | no count over a partial read, anywhere; the finding says how many were not read | `failing-first-partial-counts.txt` |
| third five | 5 | 45 | 1 | a demo label lent from the line above | a label is only the link's own text and its own line; "live" counts only as a label | `failing-first-labels.txt` |
| fourth five | 5 | 45 | 0 | gate | none needed | |
| reviewer's five (round 1) | 5 | 50 | 1 | a workspace reference (`workspace:*`) cited as an SDK version | no version cited for a workspace, file or git reference | `failing-first-review1.txt` |
| fifth five | 5 | 50 | 1 | a docs portal whose specs "are hosted at" a link, served as a labelled demo | "hosted" only as a label; a link whose words say docs is not a demo | `failing-first-review1.txt` |
| sixth five | 5 | 50 | 3 | the demo sentences spoke of every label a README uses ("Livedemo", "Live at", "this is the demonstration" are labels Scout does not read) | both sentences speak of what Scout reads | `failing-first-review1.txt` |

Items per repo went from 9 to 10 in round 1, when `website` became its own
item. The last fix only narrows two sentences to Scout's own reading, so it
cannot add a claim; it was verified by running all 40 repos again, not by
a seventh fresh set.

Review round 1 also fixed the reviewer's ten findings. The tests for the
code findings (1 to 6 and 9) fail on the old code
(`failing-first-review1.txt`); finding 7 is a rule in the data test, whose
companion test exercises it on crafted records and passes on the old code
too; 8 and 10 are not code. In order: the tree at the newest commit, not
the ref HEAD; a README missing from a cut listing is
unread; the raw byte cap counts uncompressed bytes on a cut stream; one
caller's share of the hour; the website as its own item; an npm alias kept;
the criteria rule instead of a count pin; the gate re-run (ACCEPT 1.9.102);
each unread part's own reason; individuals' handles out of every file.

Re-check 2 fixed eight more items (`failing-first-review2.txt` for the
code): individuals' commit SHAs redacted, a personal account's GitHub link
in a label replaced, YouTube share parameters stripped, the timing rows
behind "85" committed, the finding-7 wording made exact, a file that is not
UTF-8 text left unread, a stalled body's true reason, and links inside HTML
comments not read. All 40 run again after it: 0 false, 3 items changed, each
a repo that moved (`runs/recheck2/diffs.md`).

The item diffs between runs are in `runs/round1/diffs.md` (and
`runs/final/diff-*.txt` for the first round).

## The ten pre-registered repos, hand-checked

Labels (`labels.json`) were written from GitHub's own answers before the
live-read code existed. "Served" is pass 1; "final" is the same repo on
the first round's final code. Packages: Scout's list; a package off the
list is not listed, and the finding says "Scout recognises".

| repo | Stellar packages | test files (label, served, final) | CI | last commit | releases | demo links | contract ids | result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| repo-01 | 4 on the list (label 8 in all): agree | 38, 38, 46 (repo moved) | 1: agree | 143, 17:40Z (repo moved 2 commits after labelling) | 0 | none: not-found, agree | 2 (one the native XLM SAC; the finding says it does not confirm ownership) | agree |
| repo-02 | empty repository: every item not-found "empty" | 0, 0, 0 | none | no commits | 0 | none | none | agree |
| repo-03 | 2: agree | 7, 7, 1 (named conventions only) | none | 162, 2026-05-22 | 0 | website plus Live App and Demo Video | 2 | agree |
| repo-04 | 3: agree | 2, **1 (false count)**, 1 (true under named conventions) | none | 22 | 0 | website | 1 | **1 false, fixed** |
| repo-05 | 2: agree | 26 (label recounted from 28), 26, 26 | none | 61 | 0 | website | none | agree |
| repo-06 | wallets kit and Python `stellar-sdk`: agree | 0, 0, 0 | none | 26 | 0 | website | none | agree |
| repo-07 | 2 on the list (2 more off it): agree | 4, 4, 4 | none | 19 | 0 | website | none | agree |
| DocForum/docforum-escrow | 3 and a Go Stellar SDK (`go:go.mod`): agree | 40, 40, 40 | 8 | 83 | 2, sdk-v0.2.0 | none: not-found, agree | 1 | agree |
| Foryield/soroban-yield-vault | 4: agree | 23, **24 (false count)**, 23 | 2 | 144 | 0 | the README's demo (found in pass 1; could-not-check on the final code, the stated cost of the label-window fix) | 11 | **1 false, fixed** |
| Presago-Labs/presago-contracts | 1: agree | 8, 8, 8 | 1 | 298 | 0 | none: not-found, agree | none | agree |

In round 1, repo-01's README was rewritten (its two contract ids are gone,
re-read at its newest commit) and the served not-found agrees with it.

## Time budget

In review round 1, all 85 cold reads answered 200 inside the 4,000 ms
deadline (every row is committed under `runs/round1/`): the live read took 478 to 1,842 ms (median 1,030), the slowest
stellar/stellar-cli with 37 manifests. On the final code the 40 took 478 to
1,542 ms (median 988, 90th percentile 1,364), and the handler 479 to 1,545
ms. A warm read from the cache took 0 to 2 ms. Timings are in each
`runs/*/timings.json`, `runs/round1/*` and `runs/recheck2/`; re-check 2's 40
cold reads took 593 to 1,509 ms (median 947). A test with a GitHub that never
answers (`repo-live-read.test.ts`) returns at a 300 ms budget within 250 ms
of slack, with nothing claimed; another holds a body that never ends to its
byte cap.

## Byte identity

Live production ran the base code (apiVersion 1.9.101 at capture). Two of
its stored reviews were captured without `hackathon`:

- repo-16, asked as a bare github.com link: 13,088 bytes, sha256
  8f9f396b1de507b296382be7928596cc05e744c8321d041bc399c45c8bdf4190
- repo-15, asked as a full https link: 11,357 bytes, sha256
  e1a162aa333fcb13dc0c862df6b8310a3affb3c52882aa2570990a55dadd01e6

`stored-replay.test.ts` passes each body's review object and generatedAt
back through the lane's handler. Both come out byte identical, on the first
round's code and again on the final code. The bodies are not committed
(they carry teams' write-ups); their hashes are.

## Files

| file | what |
| --- | --- |
| `labels.json`, `labels-heldout.json`, `labels-third.json`, `labels-fourth.json`, `labels-reviewer.json`, `labels-fifth.json`, `labels-sixth.json` | hand labels, each written before its set's first run |
| `runs/{pass1,heldout,third,fourth}/` | the first round's first-run bodies and timings |
| `runs/final/` | the first round's re-run timings and item diffs |
| `runs/round1/{reviewer,fifth,sixth}/` | review round 1's first-run bodies and timings for its three fresh sets |
| `runs/round1/final/`, `runs/round1/reruns/`, `runs/round1/diffs.md` | round 1's timings for the final 40 and for its re-runs, and every item diff of round 1 |
| `runs/recheck2/` | re-check 2's timings for all 40 and its item diffs |
| `measure.test.ts`, `stored-replay.test.ts`, `vitest.measure.config.mts` | the live measurement and the byte replay |
| `scf-round.json` | the live SCF round state the runs used, read from live scfPitch (unchanged when read again at 22:11Z) |
| `failing-first-*.txt` | each test failing before its change (`-review1` for round 1, `-review2` for re-check 2) |
| `raven-gate.txt` | `pnpm raven:gate`: ACCEPT 1.9.102, 0 hit-to-miss flips, 2 gains |
| `scripts/` | the label and comparison helpers (gh CLI dumps at the newest commit, the Python convention counter, manifest order, package and README link listers, run viewer and diff) |

Reproduce a run from the repo root:
`OUT=<dir> MEASURE_REPOS=owner/a,owner/b bash improvements/audits/2026-10-23-judging-review/scripts/run-measure.sh`
(organizations' repos are named in the labels; individuals' need the
operator's map). One caller's share is 60 REST calls an hour, so a set
over 15 repos runs in more than one process. Then
`python3 scripts/view.py <dir>` and
`python3 scripts/diff_runs.py <old> <new>`. The byte replay is
`STORED_OUT=<dir with stored-N.json and stored-N.link> npx vitest run
--config improvements/audits/2026-10-23-judging-review/vitest.measure.config.mts
stored-replay`.

## Not measured

- Recall: a demo, test or package Scout does not see is not a false claim.
  The findings say what was read, and the eye scans list what the
  conventions leave out.
- Production: the runs used the operator's token, not the deployed app's,
  and no live deploy was checked.
- The SCF round was mocked from live scfPitch, so the runs called only
  GitHub.
- The per-caller share and the server cap were tested with a scripted
  GitHub, not under real concurrent load.
