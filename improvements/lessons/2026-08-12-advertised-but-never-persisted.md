# 2026-08-12 — Advertised but never persisted: the sdkCapabilities hole

## What happened

`sdkCapabilities` — the JS/TS capability tags advertised in the OpenAPI spec,
the api-client types, the skill reference, and two changelog entries — had
**never persisted once** since it shipped 2026-07-09. Every scan wave computed
the tags and threw them away: `signalsToWrite` (the write-path safety gate)
never carried the key, and the Repos collection never declared the field. The
entire corpus served `[]` for a month while every document said the field was
real.

It surfaced only because the x402 verification demanded a specific nonempty
value: rozo-mpprouter's rescan persisted `symbols`
(`parseStellarX402Header`, `settleStellarX402`, …) and `stellarDeps`
(`@x402/core`, `@stellar/mpp`) **from the same pass** while `sdkCapabilities`
stayed `[]`. That asymmetry — sibling fields from one compute pass, some
arriving, one missing — localizes the fault to the write path with zero
theorizing. Running the exact pipeline locally confirmed compute was always
right (7 tags for rozo).

Fixed in #817: write-shape input+output, Repos schema field, a write-shape
test case, a pinned field-population probe (rozo must serve `x402`). Live the
same hour: all four agent-stack repos serve full capability sets; corpus heals
as the re-scan policy re-reaches repos (repoScore-first, so the head heals in
days).

## Why three guards all missed it

1. **tsc** — `scripts/` runs under tsx outside the app typecheck, so the
   excess property in the `signalsToWrite` call was never flagged. A compile
   error existed in principle; nothing compiled that path.
2. **scan-write-shape test** — it asserts write⇄schema *agreement*. Both
   sides were equally missing the key, so agreement held. An agreement test
   passes when both parties are wrong the same way; it needs a third leg
   pinned to the *compute* output (the fixture now carries the computed key).
3. **field-population guard** — pinned probes only watch fields someone
   thought to pin. The caps field predated the guard and never got a probe;
   "serving `[]`" is indistinguishable from "populated-empty" without a
   known-nonempty pin.

**The class**: *advertised-but-never-persisted*. A field can be in the spec,
the client, the serving path, and the changelog — every surface a reviewer
reads — while the one surface nobody reads (the write mapping) silently drops
it. Payload compounds this: unknown keys are dropped with a success response,
and a schema-defaulted `[]` on read looks identical to honest emptiness.

**The rule it re-proves** (SHIPPING.md already says it; the field predated the
rule): the PR that ships a served field ships its pinned known-nonempty probe
in the same diff. Fields grandfathered before that rule are exactly where this
class lives — this sweep checked the rest of `codeVerified` (symbols,
contractInterface, stellarDeps, protocolCaps, targetProtocol) and all now
have probes or verified population.

## The npm arc (same day): token publishing is dead

`publish-packages.yml` had **never succeeded** — six failures across three
credential configurations (granular token, replacement token, classic
automation token + package-access flip), all `EOTP`/`ENEEDAUTH`. npm's
post-2025 supply-chain hardening OTP-walls every token publish on 2FA
accounts. The fix was structural, not another token: **Trusted Publishing
(OIDC)** — `id-token: write`, npm ≥ 11.5.1, no secret at all (#814).

Operational truths that cost round-trips to learn:

- Trusted-publisher config is **per-package** on npmjs.com. A `404` from
  `POST /-/npm/v1/oidc/token/exchange/package/<pkg>` means NO config exists
  for that package — not a field mismatch. One package publishing while its
  sibling `ENEEDAUTH`s in the same run = the sibling's config didn't save.
- `npm publish --loglevel http` puts the registry's own answer in the run
  log. One diagnostic merge ended four blind retries; earlier, run logs
  already contained the answer (`Open this URL in your browser` = the OTP
  wall) before any theory did.
- `package.json repository` must match the **publishing** repo (monorepo +
  `directory:`), not the standalone mirror — provenance validates them
  against each other.
- npm 11 rejects `./`-prefixed bin values and silently **removes the bin**
  from the tarball ("script name … was invalid"), breaking `npx` — visible
  only as a `npm warn publish` line nobody reads.

## Dispatch truths (the wasted chains)

- **Workflow inputs are the file's truth, not memory.** Post-compaction I
  reconstructed the scan dispatch as `-f only=…`; the workflow takes
  `-f extra="--only …"`. All four dispatches 422'd.
- **A failed dispatch + newest-run read = fake success.** The first chain
  read the *previous* run's conclusion after each failed dispatch and
  printed four greens. Capture the newest run id BEFORE dispatching and
  require a NEW id to appear before polling anything.
- **A concurrency group holds ONE pending run.** N rapid dispatches collapse
  to first+last; the middle ones are silently cancelled. Serialize dispatches
  into a group — dispatch, wait for completion, dispatch next.

## The tee/pipefail hole (found by the ledger feed, hours later)

nightly-health's first fed run produced a contradiction: the committed drift
artifact said `failures: 4` while the drift STEP said success. Cause: the
detector steps pipe through `tee`, and GitHub's **default** shell for `run:`
is `bash -e` — **no pipefail**. The pipeline's exit is tee's 0, so every
detector step has exited green since the workflow shipped and the red-issue
path never fired once. (`shell: bash` is the fix — GitHub expands it to
`bash --noprofile --norc -eo pipefail`; the two shells differ exactly there.)

The sweep found the same unguarded `| tee` in **14 workflows** — every
watcher (liveness, tag-watch, coverage, self-audit, engine-c, …) had a
mute alarm. Zero-work-green again, this time in the watchers themselves:
the exit code is a log line; the committed artifact is the evidence. Only
making the evidence a FILE exposed the contradiction the log-only design
could never see.

Process note, recorded on purpose: the first "fix" PR (#821) *claimed* the
pipefail change in its commit message, but the patch script had aborted on
an earlier assertion before reaching the workflow edit — and the
verification grep output (`0` matches) was misread in passing. The commit
message describes the intent; only the DIFF describes the change. Verify
the diff.

## The read-back that cried wolf (772 "not found", zero data lost)

The chase-enrich reds behind the failure emails: the write-verification
guard reported `772 field(s) did NOT persist` — but every row had persisted
fine. The guard keyed `sentByRepo` by the iteration name (`full`, spelled as
the project URL spells it, usually lowercase) while rows store GitHub-
canonical `nameWithOwner`; the read-back's `$in` is case-sensitive, so every
repo with an uppercase letter (772/2093, 37%) read back "not found".

This is the asymmetric half-fix class: the #788 convergence made the
LOOKUP case-insensitive (`equals` → `like` fallback) but left the read-back
key on the old spelling. When a mechanism is made case-insensitive at one
end, sweep every other place the same identity is compared — lookup, write,
verify, dedupe. Fix: key the guard by the fullName actually WRITTEN.

Also worth keeping: a guard that goes red for a month teaches people to
ignore it. False alarms in verification layers are near-P1 — the guard's
credibility is the mechanism.

## The matcher that poisoned 18 rows (same day, the email thread)

The failure-email investigation ended at the deepest bug of the day: the
SCF partial matcher compares SPACELESS normalized names by substring, so
official titles matched across word seams — "Soroban Disassembler"
(soro·band·issassembler) wrote r41/$100k onto **Band Protocol** (the
sls-043 self-audit red), "ars" absorbed FOUR projects (stell·ars·urge,
stell·ars· finance, …), "lemon" got "Unstoppab·lemon·ey". Full-corpus
audit: 125 partial matches → 100 legitimate, **18 poisoned rows** — some
feeding sls-063's "awarded but no record" residuals (deb, merkl, trace,
trak, usdc were poison, not missing records).

Rules that came out of it:

- **Word-boundary is not enough for generic names.** "Basilic — Stablecoin
  Rails…" boundary-matches the project "Rails" and is still wrong. The
  rule the data supports is TITLE-PREFIX at a token boundary; legit tail
  matches ("…by Gateway.fm") become explicit overrides.
- **Repair is allowlist + evidence, never inference** (POISON_CLEARS: each
  slug carries the page whose data landed on it, live row cross-checked
  against that page's cards). Ambiguous same-entity pairs (muwp/MUWPAY,
  attest/Attestation Service) were left untouched for human judgment.
- **A fixed matcher heals as well as protects**: with Convexity rejected,
  huma immediately matched its REAL page (r27/$50k) — recall loss from
  precision rules is smaller than it looks, because exact layers and
  overrides carry the legitimate volume.
- **Canonical-vs-dupe routing is part of matching**: official "Band
  Protocol" exact-matched the dupe row by name while the canonical `band`
  matched nothing and kept its poison; identity work isn't done until the
  write lands on the row the directory actually serves.

## Projections (class → where else it lives)

- Any served-from-scan field added before the probe rule: swept this time for
  `codeVerified`; the same sweep applies when projects/partners gain
  pipeline-written fields.
- Any "agreement" test (write⇄schema, spec⇄client, mirror⇄source): ask what
  anchors it to reality; two generated artifacts can agree on the same
  omission.
- Any CI credential older than 2026: assume the provider's auth model moved;
  read the service's own error channel (`--loglevel http` equivalents) before
  rotating blindly.
