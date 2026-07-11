# Lessons: the sls-020..050 wave (2026-07-11)

**1. Check the whole list before scoping.** The improvements dir was listed with `head -40` and we planned around 21 items when 31 existed — caught by the owner, not the process. Silent caps are already our own engine rule (`log()` what was dropped); apply it to EVERY enumeration, including ls/gh output.

**2. Consumer items are near-perfectly reliable — but verify anyway.** 20/21 reproduced. The one PARTIAL (octoplace already Draft) and the one root-elsewhere (022: OUR record was right; the wrong facts were in a lumenloop article we ingest) both changed the fix. Reproduce-before-fix stays mandatory even at a 95% confirm rate.

**3. Fix classes, not instances, and leave a guard behind.** Each batch converted instances into a mechanism: SCF_FIX (award facts vs official pages), TYPES_SET (taxonomy corrections), status/TVL provenance fields (entity ≠ deployment), golden forbiddenRegex (fact locks). The next instance of each class is now a one-line map entry or an automatic red.

**4. Parallel ship-agents work when each owns the FULL cycle in an isolated worktree.** Three agents shipped 3 merged PRs (#492/#493/#495-in-flight) concurrently: the keys were (a) worktree isolation, (b) explicit rebase-before-PR + version-number negotiation for shared files (version.ts/changelog/openapi-spec), (c) the complete discipline in the prompt (gates, contract:write, PR-number-only check polling, conclusion-gated merge, Action dry-run→execute, live curl proof), (d) honest SKIPPED/BLOCKED reporting rather than silent completion claims.

**5. "Are you sure they're fixed?" deserves a table, not a vibe.** Fixed-and-verified vs in-progress vs blocked must stay explicit at all times — conflating "triaged with a plan" and "fixed" nearly happened in conversation even while the discipline held in the repo.
