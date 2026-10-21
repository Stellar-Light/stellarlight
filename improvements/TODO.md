# TODO: the one queue

Every known gap in this repo's own work, one item each: what is wrong, how
it was found (a probe anyone can re-run), its state, and what done means.
New items go here, not in chat, PR threads or private notes. When an item is
done, move its line to the round ledger that closed it and delete it here.
`docs/QUALITY-FINDINGS-QUEUE.md` is the historical queue it replaces.

A probe is a GET plus an assertion that is true now and flips when the item
is fixed. Base URL: https://www.stellarlight.xyz.

## Now

1. **Raven holds our spec at 1.9.61.**
   Found: Raven's `inventory/stellar-light.json` (snapshot fetched
   2026-10-02) and its open drift issue #223. Its routing gate scored our
   1.9.78 at 220 / 295 / 325 correct at top 1 / 3 / 5 and 111 operation hits,
   against floors of 219 / 298 / 326 and 112; our wording pulled in
   questions labelled for Lumenloop and Docs. Nothing we changed since 1.9.61
   reaches Raven's agents.
   State: a local replica of Raven's gate is being built.
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

3. **Open PRs #1840, #1841, #1842 and `fix/vet-vertical-map`.**
   State: each passed an independent review; all four claim spec 1.9.84.
   Done when: merged one at a time with versions renumbered so no two merged
   PRs share one, each verified live, and the contract audit's follow-ups
   applied: #1840 declares `voteCount` nullable; #1842's changelog names
   reviewSubmission and is typed as a response-shape change; #1841's
   competitor rows carry the words they matched so a judge can grade them.

4. **The `hackathon` filter fails silently.**
   Probe: `/api/hackathons/builds?hackathon=Stellar%20Hacks:%20Agents`
   answers 200 with 0 matched and no warning; the slug matches 249.
   Done when: an unknown value answers 400 naming valid slugs, or a warning,
   on searchHackathonBuilds and analyzeHackathonSubmissions.

5. **vetIdea `priorArt.builds` claims none for short ideas.**
   Probe: `/api/vet-idea?q=remittance%20app` has `priorArt.builds == []`
   while `/api/hackathons/builds?q=remittance%20app` matches 16.
   Done when: a short idea gets the builds that match every content word, or
   the block says the five nearest did not meet the evidence rule instead of
   claiming none.

6. **Served fields the spec does not declare.**
   Found: contract audit 2026-10-20. `priorArt.builds`, `buildsMode` and
   `via` on the scfPitch, hackathonBrief and reviewSubmission vet blocks;
   getHackathon `stats.winners` and `stats.outcomes`; `winners[].voteCount`
   served null while typed as a non-nullable integer.
   Done when: every served field and every served null is declared.

7. **Missed build-to-project links, one from letter case.**
   Probe: `/api/hackathons/review?link=https://github.com/hoops-finance/cometswap`
   says no project lists the repo, while searchProjects lists
   `Hoops-Finance/cometswap`. Four more confirmed misses: YieldBack.Cash,
   PayZoll, clevercon, Juntta.
   Done when: repo matching ignores case, the link lane re-ran (dry run, then
   execute), and the five links are live.

8. **Events with announced winners show 0 winners.**
   Probe: `/api/hackathons/stellarhack` has `stats.winners == 0` beside a
   prize pool; PULSO, Philippines and four more DoraHacks events too.
   Done when: winners are served, or the response says they are not recorded
   upstream instead of 0.

9. **Research ranking swings on punctuation and lets authority beat
   relevance.**
   Probe: `/api/research?q=Best docs to read before building a Soroban
   lending protocol?` returns 5 scf-proposal rows of 8; the same text without
   "?" returns none. "idea maze for stablecoin remittances" puts unrelated
   CAPs in the top 5.
   State: a lane is measuring against the 53-question golden eval with a
   held-out half.
   Done when: punctuation cannot swing the set, no golden pass regresses, and
   the padded rows are fixed.

10. **No secret scanning on a public repo.**
    Done when: a gitleaks workflow with a checksum-verified install, a
    pre-commit hook, and one full-history audit, clean or triaged.

## Next

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
- A dependency audit workflow; usage logging that survives the response.
- The /quality external-findings block reads only each finding's first issue
  link, so it reports every fix as shipped.
- Handoffs for findings fixed live (sls-085, 086, 088, 094): drafts.
- `maturity.auditedProjects` is not specific to the idea.
- No link from a builder to a build: ingest team handles.
- Event format, location, submission deadline and judges as fields.
- Routing vocabulary for outcome and reading-intent questions, only through
  the Raven gate replica.

## Owner decisions (safe default in brackets)

- Run the curated-builds execute [run].
- Run the gone-repos execute before about 2026-10-28 [run].
- Add Yield as a gap vertical [no].
- Post handoffs to Raven [drafts only until approved].
- Ask Raven to send a key and User-Agent, so its traffic is not held to
  per-IP limits [draft only].
