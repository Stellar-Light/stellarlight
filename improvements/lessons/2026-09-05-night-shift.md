# Lessons — the 2026-09-05 night shift (agents in parallel, executes read back, two audits)

Scope: one coordinator, seven bounded agents in isolated worktrees, one
cross-vendor auditor. Every surface of scout.* touched: projects, repos,
builders, partners, hackathons, audits, stablecoins. Everything below is a
thing that was verified, or a mistake that was caught — nothing aspirational.

## What the night proved

1. **A green scheduled run is not a run.** `backfill-knowledge-notes.yml`'s
   only step carried `if: github.event_name == 'workflow_dispatch'`; 18 green
   nightly runs since 08-18 executed nothing. The program text said notes reach
   rows nightly; the coordinator's memory said so twice, once after "verifying"
   the cron and the `--execute` expression. Found by the first run of the lane
   counter, which reads step conclusions. Rule: a lane is credited only for a
   run whose EXECUTE STEP concluded success — `skipped` is a no-op, and the
   health guard must say so.
2. **Two records for one fact drift.** 20 rows carried a strong
   `deployment.basis` with a receipt and a weak `statusBasis` — the record the
   board reads. A lane now propagates the earned tier with the evidence date
   and URL (13 propagated, 6 could-not for lack of a citable artifact, 1
   testnet skip). Reported as "propagated", never as new evidence.
3. **"Inactive" was used to park duplicates.** 21 Inactive rows rest on
   `site-liveness` — a page answered — which is evidence FOR liveness. Most are
   the second half of a near-name pair from before Draft-hide existed. They
   need a human/agent triage (duplicate → Draft; dead → human-verified with a
   receipt); nothing was changed.
4. **A closed typed set must not be gated by q at the DB.** `type=Exchange&
   q=exchange` served 15 of 18 because the text clauses ran before the branch
   that promises "q only ranks". Every other type passed by luck (its rows say
   the type word). The truth battery's G slice caught it; after the fix 112/112.
5. **A silent zero on an unknown filter value is a lie.** `region=Nigeria`
   served 0/0 with an advisory that read as "no partners here"; a country is
   not a region. Now 400 with the vocabulary and a hint to use q (the ramps
   pattern). Grok's follow-up: labels and capitalised values also 400 now —
   normalise them (queued).
6. **"What changed" counted every write.** 943 project rows "changed" in a
   week because lanes bump updatedAt. `byFacet` counts rows whose DATED fact
   moved (status 248, scf-awards 184, deployment 24) beside `counts`, with a
   note; the evidence-date limitation is stated on the response.
7. **Score routing on the intended op.** 48/65 (74%) route to the op that
   should answer; the persona bank 16/28. Nine misses are catalog lag: Raven's
   deployed manifest is dated 2026-09-03T17:09Z and still carries pre-08-31
   descriptions for three ops, so three earlier vocabulary "fixes" were
   measured against a consumer that never read them. New upstream mechanism,
   not filed: Raven scores stopwords in its gated pass.
8. **Prose is not the only evidence of skill.** `?q=rust` returned 8 builders;
   40 carry Rust in their indexed languages and 25 of them own Rust repos and
   had no prose hit. Admission by owned-repo language, labelled
   `code-language`, sorted below prose hits.
9. **Unmatched joins hide in "unmatched".** 7 of 58 audit reports had no
   project; two had rows all along (the report title said "OctoLend -
   Untangled"; FxDAO-SC is FxDAO's contract repo).
10. **Ownership must cover removals.** `WEBSITE_REMOVE` was not in
    `curatedFieldsFor`, so the nightly lumenloop sync wrote a hijacked casino
    link back onto a project row every night (35 removed links restored).

## How the coordinator worked, and what it got wrong

- Agents were briefed as build + dry-run only; every production execute was a
  single standalone dispatch from the coordinator after reading the dry-run
  log, followed by a live read-back of every written row (dedup 11/11,
  deployment 13/13, curate 11/11). The permission classifier blocks agents
  briefed with `execute=true` and blocks compound commands that bundle an
  execute with other steps — the pattern above is what went through.
- A new workflow file cannot be dispatched from its branch (404 until it is on
  the default branch): merge, dry-run from main, then execute.
- Mistakes caught: the coordinator repeated the auditor's "weekly enrich only"
  claim unverified, then "corrected" it wrongly (lesson 1); read
  `counts.measured` from the wrong key and reported it absent; used
  `PIPESTATUS` under zsh (blank exit codes — two agents did the same); an
  agent counted a write before its read-back (fixed before commit); an agent's
  first page-limited fetch reported the busiest lanes as the least autonomous.
- Grok's first-batch audit found the deployment lane's evidence rule could
  pair an asset-payments artifact with a `human-verified` tier (tonight's 13
  writes happened to be consistent; the rule is being tightened), the dedup
  execute counts before read-back, and the region check rejects labels. All
  three are in a hardening PR; none required a data correction.

## Rules that follow (added to QUALITY.md's lessons)

13. A lane earns a run only when its execute step concluded `success`; a run
    whose steps were skipped is a no-op and the health guard reports it as
    never-ran.
14. An artifact licenses only the tier it can support: asset movement →
    onchain-activity; an operator's toml or a receipt → human-verified /
    product-integration. A strong basis copied across records without a
    tier-consistent artifact is a could-not-propagate.
15. A filter with a closed vocabulary rejects unknown values with the
    vocabulary (400), after normalising case and labels; it never serves an
    unfiltered-looking zero.
16. Evidence date, never observation day, on every provenance stamp — a repo's
    push date, a receipt's date, an announcement's date.
