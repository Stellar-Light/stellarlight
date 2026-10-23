# 2026-10-23: submissions whose GitHub repo moved

Round ledger: `../../rounds/2026-10-23-repo-moves.md`.

## Question

`src/lib/hackathon-build-links.ts` links a stored submission to a directory
project by its stored repo URL. When a team renames or transfers the repo,
GitHub redirects the old URL and the linker never follows it. How many
stored submissions moved, and which links does following the move gain,
lose or change?

## Method (read-only)

1. `capture.mts`: every stored submission from `/api/hackathons/builds`
   (1,344) and every directory project the sync lane links against, with
   the fields its linker reads (slug, name, status, canonicalSlug, links,
   github; all 1,137 rows, drafts included, from the collection's public
   REST read, as `scripts/sync-hackathon-builds.ts` step 3 selects them).
   GETs 2 s apart. apiVersion 1.9.94 at 12:58:04Z and 1.9.94 at 12:58:56Z.
2. `resolve.mts`: each submission repo's current owner/name from
   github.com's own redirect, one unauthenticated HEAD per repo, redirects
   not followed, at most one request started every 1.1 s; every repo
   answered 200, 301, 302 or 404.
   128 repos reuse the same-day intake review's redirect reads (a 200 at a
   final URL); 1,045 were read here. A 301 or 302 to a repo is moved, a 200
   is not, a 404 is unknown (private and deleted look the same), never
   moved.
3. `dryrun.mts`: this tree's `linkBuild` over the captured directory, every
   DoraHacks submission, once without current repos and once with them.
   Output: `dryrun.json` (moved submissions by id, with stored and current
   repo and outcome). The capture and the per-repo resolve output stay in
   scratch: they carry upstream titles and repo names.
4. `failing-first.txt`: the new tests run against the base sources.

Ship criteria were fixed before any result (ledger): (a) zero links lost
or changed; (b) every gained link an exact-repo or owner-and-name match on
the current repo, and a hand check shows the same product; (c) at least one
gained link.

## Results

| measure | count |
| --- | --- |
| stored submissions | 1,344 (all DoraHacks; none curated in the served list) |
| with a repo link | 1,185 (1,173 distinct repos) |
| repos moved | 62 (63 submissions: 51 transferred to another owner, 12 renamed under the same owner) |
| repos not moved | 930 |
| repos unknown | 181 (177 answered 404; 4 are `github.com/orgs/<name>` links parsed as a repo) |
| parity: linker without moves vs links served today | 1,344 of 1,344 identical (32 linked) |
| links gained with moves | 1 |
| links lost | 0 |
| links changed (project or basis) | 0 |

The gained link:

| submission | project | rule | stored repo | current repo | project's listing that matched |
| --- | --- | --- | --- | --- | --- |
| dorahacks-buidl-42656 clevercon (2nd Place, Stellar Hacks: Agents) | clevercon (CleverCon, Pre-Release) | moved-repo | bosun-josh121/clevercon | clevercon-protocol/clevercon | `links.github` https://github.com/clevercon-protocol/clevercon |

Hand check: the submission's write-up calls it a trustless AI agent
marketplace where an agent hires and pays for services; the directory row
describes a service marketplace and orchestrator that hires specialist
agents and pays them through x402 or MPP, a winner at the same event. Same
product.

What became of the 63 moved submissions:

| outcome | submissions |
| --- | --- |
| linked before, unchanged | 1 |
| linked now (clevercon) | 1 |
| unlinked: a project sits under the new owner, with another name (owner alone never links) | 1 |
| unlinked: no project lists the new repo or sits under the new owner | 60 |

All three criteria hold. The intake review's 23 moved repos among unlinked
active products are mostly in the last row: the directory does not list
where they went, so following the move cannot link them. That is a
directory coverage gap, not a linker one.

## Limits

- Production reads the current repo from GitHub's GraphQL `nameWithOwner`
  with the lane's token, not from web redirects. A spot check on clevercon's
  stored repo returned `clevercon-protocol/clevercon` both ways; the two were
  not compared repo by repo.
- One held submission serves no GitHub link, so it was not resolved.
- The directory and the stored links are as of the capture; the sync lane
  relinks against the directory as it stands when it runs.

## Data effect

Nothing is written by this lane. After the sync lane's next run stores
each repo's current owner/name, clevercon's submission links to CleverCon
with `basis: moved-repo`; no other stored link changes.
