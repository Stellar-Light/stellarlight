# The consumer's view, and the two-auditor loop (2026-08-31)

Twelve PRs (#1141–#1152), the ledger 54 → 43 open, Raven routing 76% → 86%,
and six confirmed defects found in the day's own diffs by independent review.
Five lessons with teeth.

## L1 — A consumer indexes only what it reads; measure ITS view, not yours

A month of routing vocabulary sat in the spec's `x-routing` blocks — the field
sls-051 deliberately created for machine routers — while the #1 consumer's
discovery index embeds **only `summary` + `description`**. Measured by
interrogating the live gateway's `search` tool: no x-routing content appears in
any hit. The getRfps spec even carried an inline comment *documenting* the
exact jobs/bounties vocabulary gap without the fix ever being applied where the
consumer could see it.

The fix (#1141, spec 1.9.11) put demand vocabulary back into five
descriptions; okRate rose 76% → 86% on the next through-gateway run. The class:
**never assume a consumer reads the field you designed for it — probe the
consumer's actual view.** Corollary shipped the same day: scout-mcp's own tool
descriptions had none of the vocabulary either (#1151), because MCP clients
index description text too.

## L2 — Count is the wrong invariant: reconcile the quantity that actually lies

The RSC chunk-split class (prism-dxb: a card's `"id"` value split mid-stream,
re-matched as `"r"`, doubled a round to exactly 2× the page's own total) was
fixed with prefix-merge + a rendered-counter gate (#1142) — and the audit then
**reproduced a wrong-host variant the count gate provably cannot see**: `"r"`
prefixes every Airtable id, so the fragment of the larger card could
Math.max-inflate the *smaller* one while the count stayed 2 = 2.

Both independent auditors converged on the same repair: reconcile against the
page's rendered **"Total awarded" dollars** — the quantity that actually
doubled — and null on excess (#1151). Count gates only on OVER-count now:
pages count neutral-status cards we honestly exclude, and never-accuse must
not become never-report. **When a guard checks an invariant, ask whether the
observed failure would have moved that invariant at all.**

## L3 — Eval expectations must track row lifecycle and service scope

Two detectors manufactured findings no fix on their surface could close
(#1149): engine-a's P-ATTR bucket kept expecting an **Inactive** record
(ping — dead site, human-verified) to surface for its coverage attributes,
firing nightly against a down-rank that is by design; and battery-coverage
graded our research corpus on another service's **adapter-conduct** questions
(how stellarDocs should report a category-filtered soft-empty — no corpus
content can answer that). Skips are counted and logged, never silent.
Name-identity probes deliberately KEEP Inactive subjects: a name lookup must
return the record whatever its status.

## L4 — A rescue that narrows one guard must preserve the other guard's reason

The dd fix (#1145) rescued single tokens that anchor reduction dropped for
LENGTH — and silently also rescued tokens dropped for GENERICITY: "what is
sol" scored exact-identity against a row named Sol, bypassing the vocabulary's
own sol-is-never-a-lone-anchor rule (audit, reproduced by execution). The
rescue now asks WHY the token was dropped (#1151). When a guard drops something
for two reasons, an exception carved for one reason must re-check the other.

## L5 — The two-auditor loop, and the pipe that swallowed a failed build

Process lessons from running the loop itself:

- **Bundle → fresh-context audit → cross-vendor verify** worked: auditor one
  (agent, full repo read access, read-only) confirmed six real defects by
  executing modules; auditor two (Grok, hard-scoped to the bundle) verified
  5/6, refused the one it couldn't prove from the bundle alone — the correct
  epistemic move — and contributed one genuinely new finding (fragment-host
  type preference, #1152). Convergent independent findings are strong signal;
  scope the external tool hard or it wanders (round one burnt every turn
  exploring the filesystem).
- **Never pipe a gating command.** `pnpm build | tail && git commit && git
  push` pushed a broken-build commit: the pipe's exit status is `tail`'s. CI
  (the authoritative gate) caught it. Fourth entry in this class.
- A local `.env` credential going stale mid-session makes local builds lie in
  BOTH directions — the CI lanes with real secrets are the only build verdict
  that counts.
