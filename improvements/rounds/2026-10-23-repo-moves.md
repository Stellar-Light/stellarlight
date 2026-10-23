# 2026-10-23: link submissions whose GitHub repo moved

## Scope

`src/lib/hackathon-build-links.ts` links a stored hackathon submission to
a directory project by three rules: the project lists the submission's
exact repo; the submission's demo site is the project's website; the repo
sits under the project's GitHub owner and the submission carries the
project's name. Rules 1 and 3 read the repo URL stored when the submission
was made. When a team renames or transfers its repo, GitHub redirects the
old URL, but the linker never looks.

Found by a read-only intake review on live 1.9.93: 23 of 128 still-active
unlinked products had a transferred or renamed repo. One case: clevercon's
stored repo redirects to the exact repo the directory row "clevercon"
lists, so it went unlinked. 32 of 1,344 stored submissions are linked, and
those links feed the after-hackathon outcomes (SCF, status, mainnet).

Goal: the sync lane stores each submission's current repo (owner/name after
GitHub's redirect) when it reads the repo; rules 1 and 3 match on the
stored repo or the current one; rule 2 is unchanged; a link made through a
move says so.

## Lane

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| N: repo moves | Claude Opus 5.5, xhigh | own worktree, branch `lane/n-repo-moves`: `src/lib/hackathon-build-links.ts`, `scripts/sync-hackathon-builds.ts`, `scripts/scan/fetch-repo-code.ts`, the hackathon-builds collection, their tests, spec text, changelog, version, `improvements/audits/2026-10-23-repo-moves/`, this ledger | a commit on the branch, not pushed |

## Method and ship criteria (fixed in the brief, before any result)

- Dry run, read-only: every stored submission with a GitHub repo from the
  live API (GETs 2 s apart, apiVersion at start and end); each repo's
  current owner/name from github.com's redirect (unauthenticated, about 1
  request a second, back off on 429; a 404 is unknown, never moved); this
  tree's linker over the directory rows the sync lane links against, with
  and without current repos.
- Ship only if:
  - (a) zero links lost or changed;
  - (b) every gained link is an exact-repo or owner-and-name match on the
    current repo, and a hand check of each shows the same product;
  - (c) at least one gained link (clevercon is expected).
- A gained link that looks wrong stops the lane; no tuning.

## Log

- 2026-10-23 (lane N): `git fetch origin main && git switch -c
  lane/n-repo-moves origin/main`; HEAD 02d7deba (spec 1.9.94).
  `pnpm install --frozen-lockfile --prefer-offline`: exit 0;
  `pnpm generate:importmap`: exit 0.
- Read: the linker runs in the sync lane's step 3, before the repo reads
  (step 5 stack over REST, at most 400 repos a run; step 6 activity over
  GraphQL, every repo every run). The served `basis` is
  `projectLinkBasis` when it is in `LINK_BASES` (`indexedFromStored`), and
  the spec spreads `LINK_BASES` into the enum (parity test). One read-only
  GraphQL query with the owner's CLI token confirmed GitHub's GraphQL
  answers clevercon's stored repo as `clevercon-protocol/clevercon`
  (`nameWithOwner`), so the lane's existing activity read can carry the
  current repo.
- `pnpm exec tsx improvements/audits/2026-10-23-repo-moves/capture.mts
  <scratch>/capture.json`: 1,344 submissions, 1,137 directory rows, 28
  GETs; apiVersion 1.9.94 at 12:58:04Z and 1.9.94 at 12:58:56Z.
- `resolve.mts`: the first serial pass waited on each response and ran at
  about one repo every 4 to 5 s; restarted keeping its saved results, with
  starts still at most one per 1.1 s and up to 4 in flight. 1,173 repos:
  128 reused from the intake review, 1,045 HEADs; 62 moved, 930 not, 181
  unknown (177 404s, 4 `github.com/orgs/<name>` links parsed as repos).
- `dryrun.mts` (this tree's `linkBuild`): parity with the links served
  today 1,344 of 1,344; with current repos 1 gained (clevercon,
  `moved-repo`, matching the project's `links.github`), 0 lost, 0 changed.
  Hand check: same product (agent service marketplace, same event). Ship
  criteria (a), (b) and (c) hold.
- Tests first: 5 new tests in `hackathon-builds.test.ts`, 1 in
  `repo-stack.test.ts` and a new assertion in an existing
  `held-repos.test.ts` test, run against the base
  sources of `hackathon-build-links.ts`, `fetch-repo-code.ts` and
  `held-repos.ts`: 7 failed, 54 passed (`failing-first.txt`). With the fix:
  all pass.
- Implementation:
  - `fetchRepoActivity` asks GraphQL for `nameWithOwner` and returns it
    lowercased as `fullName`.
  - The sync lane's activity read moves ahead of the links and stores
    `repoCurrentFullName` (`currentRepoFor`): the repo it answered under
    when that differs, null when not; with no read, the last value for the
    same repo; never a value stored for another repo.
  - `linkBuild` (pure) holds the rule order the lane ran inline, adding the
    stored-or-current reads: stored repo, moved repo, site, stored owner
    and name, moved owner and name. `LINK_BASES` gains `moved-repo` and
    `moved-owner-and-name`.
  - Collection field `repoCurrentFullName` (one writer, the sync lane);
    `withholdHeldRepo` also withholds it, since the collection's REST read
    is public. `pnpm generate:types`, then biome format, which also picks
    up three lines of unrelated drift already in the configs.
- Spec 1.9.96 (1.9.95 is another lane's): `project` and `basis`
  descriptions, changelog entry; `pnpm contract:write`: exit 0.
- Checks on the final tree (origin/main still 02d7deba):
  `pnpm exec tsc --noEmit -p tsconfig.json` exit 0;
  `pnpm exec tsx scripts/check-scripts-types.ts` exit 0 (GREEN, 28
  baselined); `npx vitest run src/lib/__tests__ src/app/api` exit 0, 179
  files and 2,258 tests; `CONTRACT_BASE=02d7deba pnpm contract:check` exit
  0; `pnpm raven:gate` exit 0, ACCEPT 1.9.96; biome on the changed files:
  no errors (3 warnings, all on the base too); added lines: no em or en
  dashes, no barred names.

## Outcome

- Shipped on branch `lane/n-repo-moves` (committed, not pushed), spec
  1.9.96. Data effect: after the sync lane's next run stores current
  repos, clevercon's submission links to CleverCon (`basis: moved-repo`);
  no other link changes. Links grow from 32 to 33 of 1,344.
- 60 of the 63 moved submissions stay unlinked because no directory row
  lists their new repo or sits under their new owner. Raising links further
  is directory coverage, not linking.
- Leads, not fixed here: `repoFullNameOf` reads `github.com/orgs/<name>` as
  a repo `orgs/<name>` (4 stored submissions); the held-repo check keys on
  the stored repo only, so a held repo that moved is matched only under its
  old name.
- Measurement and outputs: `../audits/2026-10-23-repo-moves/README.md`.
- Not verified live: nothing is deployed from this lane.
