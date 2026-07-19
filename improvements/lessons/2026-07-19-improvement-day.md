# 2026-07-19 — the improvement day (classes 27–30)

Fifteen PRs in one day (#589–#603): the audits registry + findings extraction,
the mention-vs-identity ranking fix, engine rolling-issues, protocol-release
visibility, the mechanical guards, repo-search vertical repair, and the
loop-agent PR triage. Four new durable classes came out of it.

## Class 27 — post-filter after a capped pool (#596)

The new /api/research audit filters (auditor/protocol/severity) were applied
AFTER vector retrieval. The pool is bounded; when its top-K happened to hold
no audit chunks, the filter produced 0 — indistinguishable from "this firm
never audited this protocol", even when perfectly-matching chunks existed one
fetch away. **A filter on a bounded pool must narrow the FETCH, not the
page.** Fix: audit-metadata filters imply `source=audit` at retrieval;
a contradictory explicit `source=` is a 400 instead of a guaranteed-empty page.

## Class 28 — single-affix extraction assumptions (#593)

stellar.org serves two title templates: developers posts are
`Real Title | Stellar`, foundation-news posts are `Stellar | Real Title`.
The title cleanup only knew the suffix form — on the prefix form it deleted
everything after the first `| Stellar`, leaving ~50 posts titled just
"Stellar". Titles carry 3× retrieval weight, so the Protocol 27 "Zipper"
upgrade guide was invisible while an actual mainnet vote happened.
**Test extraction against every template family the source serves, not the
first sample that parsed.**

## Class 29 — hardcoded-count assertions rot into pipeline blockers (#599)

The npm-publish smoke test asserted `tools/list returns 15 tools`. The server
(correctly) grew to 20 — and the stale literal blocked BOTH pending releases.
The check failed precisely because the system improved. **A count literal in
a test is a rot timer**: derive expected counts from the source of truth
(`registerTool(` occurrences) plus invariants (name uniqueness), never a
number that was true once.

## Class 30 — checklist omissions recur in pairs (#594)

/api/audits shipped without its `next.config.mjs` publicApi entry (no CORS,
no X-API-Version). Hours later the weekly improvement-loop agent's
/api/people PR — written independently — missed the exact same entry. The
un-enforced checklist step gets skipped by every author, human or agent, in
the same week. **When review catches a checklist miss, build the guard the
same day** — the extended drift check now flags missing headers per endpoint,
and it caught the second instance before merge.

## Ops footnotes (not classes, but they cost time today)

- GitHub's check rollup includes a **nameless phantom entry** (`name: null`);
  a jq filter of `.name != ""` passes null. Filter with `(.name // "") != ""`.
- Loop-agent PRs can be **stacked** (base = another PR's branch); after the
  base squash-merges, GitHub reports phantom CONFLICTING forever. Fix:
  `gh pr edit --base main`.
- Python `"\b"` in a non-raw string is a BACKSPACE, not a regex word
  boundary — it produced silently-never-matching regexes. Sweep with
  `grep -rlP '\x08'`.
- No poll loops on GitHub — `gh pr merge --squash --auto` (with branch
  protection) or a single bounded pass when next active.
