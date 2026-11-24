# 2026-11-24: hackathon truth (TODO Now items 3, 4 and 10)

## Scope

Three hackathon items in `improvements/TODO.md`: five build-to-project
links missing (3), events with announced winners serving 0 winners (4), and
winners-only events serving their winners as their whole field (10). Each
probe re-run live first; fix at the root, data through the curated files and
the lane that applies them, a dry run read-only, no production write.

## Lane

`lane/r1124-hackathon-truth` off origin/main 0b3effea (spec 1.9.163), one
agent (Claude Opus 5.5). Placeholder spec 1.9.164.

## Log

- Live 1.9.163, 2026-11-24 02:39Z to 02:53Z, every probe re-run:
  - Item 3: `/api/hackathons/builds/dorahacks-buidl-{27456,25141,42656}`
    link yieldbackcash (scf-page-and-name), payzoll
    (submission-links-and-name) and clevercon (moved-repo). The item's
    probe, `/api/hackathons/review?link=https://github.com/hoops-finance/cometswap`,
    serves `project` null for Comet x Hoops Finance (`dorahacks-buidl-27417`,
    2nd place, Stellar Hacks: Blend); Juntta (`dorahacks-buidl-30931`,
    telluscoop-ideaton) serves `project` null.
  - Item 4: every one of the 29 events' detail read. The four named events
    serve their winners (Philippines 5, hackmeridian-2025 6, alebrije2026 2
    with a note naming the third, APAC 1 with a one-track note); the 9
    serve "Not announced upstream". One more ended event serves a bare 0:
    blockchain-innovation-challenge-waterloo-2026 (ended 2026-11-18),
    `stats.winners` 0, `winnersNote` null.
  - Item 10: compare over all 29 events and `analyze?facet=placement`. The
    done line holds (see Outcome).
- Evidence read for the two unlinked submissions (2026-11-24):
  - DoraHacks record 27417 lists the repo hoops-finance/cometswap, a demo
    on comet.hoops.finance and x.com/hoops_finance; the directory's hoops
    row has links.github github.com/hoops-finance, website hoops.finance, X
    hoops_finance, and the repo among its indexed repos. Directory search
    for comet, cometswap and "blend backstop" finds the comet row
    (cometdex, Inactive): the AMM the build swaps through, not its maker.
  - DoraHacks record 30931 lists instagram.com/junttaperu and
    linkedin.com/company/juntta and no repo; juntta.org's footer (its
    Layout bundle) links x.com/junttaperu, instagram.com/junttaperu and
    linkedin.com/company/juntta; the directory's juntta row has website
    juntta.org and X junttaperu. No other row matches junttaperu.
  - Re-read for the three rule-linked ones: the yieldbackcash-enj SCF
    page's siteUrls still link dorahacks.io/buidl/27456; DoraHacks record
    25141 still lists x.com/PayZoll; GitHub resolves the clevercon
    submission's repo to clevercon-protocol/clevercon, the project's link.
- Waterloo: the organizer's event page (velocityincubator.com) and a web
  search, 2026-11-24, name no winner; the page still describes the 18
  November awards as scheduled.
- Fail-first: `src/lib/__tests__/hackathon-truth.test.ts` on a detached
  worktree of origin/main 0b3effea (with the new data file copied in so it
  imports): 6 of 8 fail (no `curated` basis or curated link helpers;
  Waterloo serves `winnersNote` null); on the lane 8 of 8 pass.
- Sync lane dry run on the lane code, read-only, local, 2026-11-24 from
  02:52Z (no GitHub, Voyage or Anthropic key, so repo activity and the
  embedding check were not read and stored values stood): 1,525 builds
  read; `link changes: 2 rows; 0 stored links dropped`, the two lines
  `link dorahacks-buidl-30931@telluscoop-ideaton: none -> juntta (curated)`
  and `link dorahacks-buidl-27417@stellar-hacks-blend: none -> hoops (curated)`;
  the three rule links print `a rule finds it` and keep their basis; 43
  builds link after, 2 by a curated record. The run also plans categories
  on 958 rows, the lane's routine daily reassignment, unrelated to links.

## Outcome

- Item 3: all five links recorded in `src/data/curated-build-links.ts`
  with their evidence; basis `curated` in LINK_BASES and the spec. Takes
  effect on the sync lane's next run after deploy (dry run, then execute,
  then read back the two builds and the review probe).
- Item 4: Waterloo's dated note in CURATED_WINNERS_NOTES; any ended event
  off DoraHacks with no winner and no dated note serves a note that its 0
  is not a count. Live after deploy; no lane run needed.
- Item 10: closed. Re-checked live on 1.9.163 by this lane, not the
  author's: compare serves hackmeridian-2025 `submissionCount` null with
  `coverage: "winners-only"`; APAC `prizePerWinnerUSD` null with a note;
  `facet=placement` 68 winners of 1,344 (field smaller than the done line's
  1,371 because hackmeridian-2026's 97 partial rows and Istanbul's 7
  winners are left out too, each named in meta.warnings); hackmeridian-2026
  serves Genesis, Scale, Stellar Unlocked and Stellar Composed and
  `prizeTiers` null. Deleted from TODO. Its round's leads (a prize per
  winner over the winners served on alebrije2026 and buildonstellarchile)
  are now a Next item.
