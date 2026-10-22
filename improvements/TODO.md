# TODO: the one queue

Every known gap in this repo's own work. A **Now** item carries four parts:
what is wrong, how it was found (a probe anyone can re-run, or a named
source), its state, and what done means. A **Next** item carries what is
wrong and how it was found; it gains a state and a done line when it moves
to Now. New items go here, not in chat, PR threads or private notes. When an
item is done, record it in the Outcome of the round ledger that closed it,
and delete it here. `docs/QUALITY-FINDINGS-QUEUE.md` is the historical queue
this replaces.

A probe is a request plus an assertion that is true now and flips when the
item is fixed. API base URL: https://www.stellarlight.xyz.

## Now

1. **Raven holds our spec at 1.9.61.**
   Probe: `gh api repos/stellar-experimental/stellar-raven/contents/inventory/stellar-light.json`
   decodes to a snapshot whose spec version is 1.9.61 (fetched 2026-10-02);
   Raven's drift issue #223 is open. Its routing gate scored our
   1.9.78 at 220 / 295 / 325 correct at top 1 / 3 / 5 and 111 operation hits,
   against floors of 219 / 298 / 326 and 112 (stellar-raven
   `.agents/rounds/2026-10-15-truth-maintenance.md`, the table at line 46);
   our wording pulled in questions labelled for Lumenloop and Docs. Nothing we changed since 1.9.61
   reaches Raven's agents.
   State: the replica (`pnpm raven:gate`, merged in #1843) reproduces
   Raven's accepted totals exactly; on it 1.9.83 held (five hit-to-miss
   flips). Production's spec passes it: 1.9.84 at about 19:00 UTC on
   2026-10-21 and 1.9.87 from 19:23 UTC, each at 220/298/326/112 with no
   hit-to-miss flip. Waiting on Raven's re-sync.
   Done when: the replica reproduces Raven's baseline exactly, our current
   spec passes every gate in it, and Raven's accepted snapshot moves past
   1.9.61.

2. **HackMeridian 2025 winners are not served, while the 1.9.83 changelog
   says they are.**
   Probe: `/api/hackathons/hackmeridian-2025` has `winners.length == 0`;
   `/api/hackathons/builds/curated-hackmeridian-2025-lance` answers 404.
   State: the curated-builds lane's dry run on 2026-10-20 planned 6 creates,
   0 updates, 0 hides; the execute has not run.
   Done when: the execute ran, every row was read back, and both probes flip.

3. **The `hackathon` filter fails silently.**
   Probe: `/api/hackathons/builds?hackathon=Stellar%20Hacks:%20Agents`
   answers 200 with 0 matched and no warning, while
   `hackathon=stellar-agents-x402-stripe-mpp` matches 249.
   State: not started.
   Done when: an unknown value answers 400 naming the valid slugs, on
   searchHackathonBuilds and analyzeHackathonSubmissions.

4. **vetIdea `priorArt.builds` claims none for short ideas.**
   Probe: `/api/vet-idea?q=remittance%20app` has `priorArt.builds == []`
   while `/api/hackathons/builds?q=remittance%20app` matches 16.
   State: not started.
   Done when: a short idea gets the builds that match every content word, or
   the block says the five nearest did not meet the evidence rule instead of
   claiming none.

5. **Served fields the spec does not declare.**
   Probe: `/api/hackathons/stellar-agents-x402-stripe-mpp` serves
   `winners[0].voteCount == null`, while the spec types it as a non-nullable
   integer. Also found by the contract audit (2026-10-20): `priorArt.builds`,
   `buildsMode` and `via` on the scfPitch, hackathonBrief and
   reviewSubmission vet blocks, and getHackathon `stats.winners` and
   `stats.outcomes`, all served and undeclared.
   State: not started.
   Done when: every served field and every served null is declared.

6. **Five confirmed build-to-project links are missing.**
   Probe: `/api/hackathons/review?link=https://github.com/hoops-finance/cometswap`
   says no project lists the repo, while searchProjects lists
   `Hoops-Finance/cometswap` among the hoops project's repos.
   Found: the previous-attempts lane (2026-10-20), confirming each by reading
   both descriptions. The causes differ, so no one rule fixes them: the link
   rule reads a project's own `github.repos` and its `links.github`, never
   its indexed repos (Comet x Hoops; letter case is not the cause, both sides
   are lowercased in `src/lib/hackathon-build-links.ts`); the repo moved
   (YieldBack.Cash, clevercon); the build has no repo and a different demo
   host (PayZoll); only the name matches (Juntta). Broad rules measured badly
   in that lane: name-only links were right 3 of 15 times, indexed-repo
   links about 1 of 5.
   State: not started.
   Done when: the five verified links are recorded as a curated link basis
   the link lane reads (a spec enum entry for the basis), the lane re-ran
   (dry run, then execute), and the five links are live.

7. **Events with announced winners show 0 winners.**
   Probe: `/api/hackathons/stellarhack` has `stats.winners == 0` beside a
   prize pool of 15,000; so do `stellar-pulso-hackathon` (its page says
   winners were announced) and `build-on-stellar-philippines-2026` (its page
   names five winners).
   State: not started.
   Done when: winners are served, or the response says they are not recorded
   upstream instead of 0.

8. **Secret scanning covers new commits only.**
   Probe: `gh api repos/Stellar-Light/stellarlight --jq
   .security_and_analysis.secret_scanning_push_protection.status` answers
   `disabled`, and `grep -l -i gitleaks .githooks/*` prints nothing (the
   one hook there, `pre-push`, scans nothing for secrets).
   State: `.github/workflows/secret-scan.yml` (merged in #1844) runs
   gitleaks 8.30.1, its checksum pinned in the workflow, on every PR range
   and every push to main; from its own PR on, it ran 13 times on
   2026-10-21 and passed every time (#1843 merged before the workflow
   reached main). A local full-history scan on 2026-10-21 (gitleaks
   reported 2,474 commits scanned) found 10 findings, none a credential; `.gitleaksignore` records each
   with its reason. GitHub's own secret scanning and push protection are
   owner settings.
   Done when: a secret is stopped before it is public, by GitHub push
   protection or a hook in `.githooks/` that runs gitleaks on staged
   changes (either flips the probe); CI scans only after the push, when
   the commit is already public.

9. **Repos deleted on GitHub are still served.**
   Found: the gone-repos probe (`improvements/audits/gone-repos-latest.json`,
   `tally`, the same counts on 2026-10-20 and 2026-10-22) counts 56 newly
   gone repos still served and 2 that came back. The ledger calls a high
   finding stale once it has been open more than 30 days (`STALE_DAYS` in
   `src/lib/improvement-ledger.ts`); the oldest open gone-repos finding was
   first seen 2026-09-27T10:59Z, so the first turns stale at
   2026-10-27T10:59Z.
   State: the execute would mark the 56 `gone` (out of search and builder
   results; a lookup by name still answers, marked gone) and set the 2 back
   to `error` for a rescan, reading every row back; it has not run.
   Done when: the execute ran (dry run read first) and its read-back
   passed.

10. **"Recent mainnet upgrade" leads with an upgrade not yet on mainnet.**
    Probe: in `/api/research?q=recent mainnet upgrade&limit=5`, no row
    names Protocol 26 to 29 or Zipper. Rows 1 and 2 are "Introducing Bell,
    Protocol 30 on Stellar" and the Bell upgrade guide (published
    2026-10-20; the mainnet vote is 2026-11-23); with `limit=8` the
    Zipper (Protocol 27) guide is sixth. The golden case `recent-mainnet-upgrade` fails on 1.9.87
    (2026-10-21): the one research failure among 37 graded (2 more were
    N/A).
    State: not started. Inferred cause, not verified: freshness outweighs
    relevance here (the two-day-old Bell rows have relevance 0.37 and 0.36,
    the 140-day-old Zipper guide 0.85), and no field on a row says whether
    an upgrade is announced or live; the vote dates sit only in the posts'
    prose.
    Done when: the latest upgrade live on mainnet is in the top 5 for that
    question, an announced upgrade is labelled with its vote date or ranked
    below it, and the golden case accepts Protocol 30 once its mainnet vote
    passes.

## Next

Found by the 2026-10-20 round's consumer-style QA round and contract audit
unless noted.

- Research authority weighting: a 75/15/10 weighting held out best in
  simulation and changes about 10% of confidence labels (the 2026-10-20
  research lane), but the question that motivated it no longer reproduces:
  on 1.9.87 (2026-10-21) the top 8 for "idea maze for stablecoin
  remittances" are all about stablecoins or remittances, with or without a
  trailing "?". Needs a question that reproduces before any change.
- The research corpus refresh fails its idempotence step on some days
  (failed on 2026-10-16 to 10-19 and on 10-22, passed on 10-20 and
  10-21): after the execute, a re-plan still wants writes. On 10-22 (run
  39767218973) lumenloop-research planned 3 updates and sdf-org 23 (21
  meta-only); every other source planned 0. The lane names three possible
  causes: a step that died mid-run, a writer that is not idempotent, or
  two writers on one row.
- vetIdea competitor rows do not carry the idea words they matched, so a
  judge cannot grade a row from the response alone (contract audit,
  2026-10-20; the follow-up left on #1841).
- Substring matching: `track=AI` matches "Main Track"; q "Star Lends" marks
  "Blend" and "starting". Done when short terms match whole words on build
  search and analyze.
- compareHackathons labels curated events "dorahacks", leaves durability
  empty, and names a highest and a lowest for tied pools.
- getHackathon `stats.outcomes.built` is 0 for Agents while
  `profile.project` says 12 became directory projects.
- Winners-only search is not in placement order; its rows carry no
  `placementRank`.
- HackMeridian 2026 tracks, categories, venue, deadline hour and judging live
  only in prose while `tracks` and `prizeTiers` are `[]`.
- Curated event pages say "live submission feed unavailable".
- `meta.counts.indexedBuilds` is 1,344 in search and 1,371 in analyze under
  one name; the analyze `q` description says it matches like search while its
  default mode differs.
- Evidence gates count Spanish stopwords ("de", "para").
- `organizer=<name>` on getHackathons returns 0 with no warning.
- Skill text: the read-only skill tells agents to post feedback (sk-019);
  "7 SDF skills" (sk-027); Builders "in the dozens" (sk-028), in
  `public/skills/stellar-scout.md` and `public/skills/references/api-reference.md`;
  the skill omits build search params.
- Consumer safety in `contract:check`: every non-GET operation declares
  `x-side-effecting` (matchPartners does not); an operationId removal or
  rename fails unless the changelog marks it breaking.
- The golden eval gate counts questions (its floor was set at 37; the set has
  53); eval runs record the API version; the battery's held-out rows become a
  frozen routing holdout.
- No dependency audit runs (stellar-raven keeps one rolling issue with a
  fingerprint of the findings); the Dependabot alerts API lists 405 open
  alerts on main (25 critical, 162 high, 188 medium, 30 low; 2026-10-21
  19:38 UTC); API usage logging is a voided promise
  (`src/lib/api-usage.ts`) that can be dropped after the response.
- The /quality external-findings block reads only each finding's first issue
  link, so it reports every fix as shipped.
- Handoffs for findings fixed live (sls-085, 086, 088, 094): drafts.
- `maturity.auditedProjects` is not specific to the idea.
- No link from a builder to a build: ingest team handles.
- Events carry no format, location, submission deadline or judges fields,
  while curated rows already store format tags the API drops
  (`src/data/curated-hackathons.ts`).
- Routing vocabulary for outcome and reading-intent questions, only through
  the Raven gate replica.

## Owner decisions (safe default in brackets)

- Run the curated-builds execute [run].
- Run the gone-repos execute before 2026-10-27 10:59 UTC [run].
- Turn on GitHub secret scanning and push protection; repository settings
  only the owner can change [on].
- Add Yield as a gap vertical [no].
- Post handoffs to Raven [drafts only until approved].
- Ask Raven to send a key and User-Agent, so its traffic is not held to
  per-IP limits [draft only].
