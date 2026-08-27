# Lesson — the truth battery's first two runs (2026-08-27)

Two batteries ran through the live Raven gateway in one day: a hand-run 44-probe
sweep of all 29 exposed operations, then a wider re-run with different question
sets after the first round's fixes shipped. Between them: **6 real defects, 3
probe bugs (mine), and 2 miscalibrated expectations (also mine).** The score
that matters isn't 42/44 — it's that every failure taught something reusable.

## What was found, in one table

| # | finding | class | fixed |
|---|---------|-------|-------|
| 1 | `"is FlurboSwap live"` → soroswap, sushi, alchemy at `loose-1`, high confidence | fabricated camelCase names: a FRAGMENT ("swap") satisfied the anchor gate | #1046 (splitIdentityGroups) |
| 2 | `"Blue Orion on stellar"` → subject ranked 4th | the liveness float recomputed exact-name WITHOUT the tokens subject path, then sank the Inactive subject | #1046 (float passes tokens) |
| 3 | `"tell me about GetBlockCard"` → bridge #1, we HOLD the row | two holes at once: fragment "block" substring-hit "blockchain" (gate excluded nothing) + the float's subject path couldn't see a group's joined form | this PR (hitsWordToken + group-joined in nameMatchScore) |
| 4 | `"what is OrbitMintX"` → 3 rows at `loose-1` | same class as #3 — substring fragments | this PR |
| 5 | dia, band, redstone-finance: `types: []` | **Oracle is not in the types enum at all** — a whole vertical is invisible to type browse and flagged "no types" by row QA | FILED, needs enum + data pass |
| 6 | nodies: `Live` with no `statusSourceUrl` | the known 51-row provenance residual (sls-024) | tracked |

## The lessons themselves

**L1 — A split word is ONE identity, and its fragments are name-evidence, not
prose.** The tokenizer's camelCase split is good for recall (SoroSwap → soro +
swap + soroswap) and poison for honesty if any lone fragment satisfies an
anchor gate. Two rules fix the class: a row matches the identity only via the
joined form or ALL fragments, and fragments hit as WORDS ("block" must not hit
"blockchain"). Substring-vs-word is the same trap twice — DecentraMind →
nethermind was the ranking flavor, GetBlockCard → bridge was the admission
flavor.

**L2 — Every sort that recomputes a signal is a place the fix didn't land.**
The float recomputed exact-name without tokens; result: #1043 was correct and
prod still wrong. When a fix changes a signal's inputs, grep for every OTHER
computation of that signal (`nameMatchScore(` had four call sites; two were
stale).

**L3 — Grade the surface the question actually routes to.** "smart contract
audit firms" failed 0/3 against searchProjects — because audit firms live on
the PARTNERS surface, and guard A explicitly keeps the two apart. A battery
expectation encodes a routing assumption; wrong assumption, false red.

**L4 — A red right after curation can be cache, not clobber.** gate-io showed
`human-verified/08-21` on one query key and `site-liveness/08-10` on another —
eleven days apart, same row, same minute. Not reverted curation: per-query SWR
cache serving the pre-curation snapshot until refreshed. A red that self-heals
next run is staleness; a red that persists is a real revert. (And 403 on a bare
HEAD is Cloudflare, not death.)

**L5 — Curation is the answer key that doesn't rot.** The battery's best slices
have no hand-written expectations: every prominence≥80 row must be findable by
its own name; every human-verified status must serve exactly what the human
verified. Hand-written cases (slices A-C) find new classes; curated-truth cases
(D-F) guard everything curation touches, automatically, forever.

**L6 — The battery caught in one day what 30+ field-shaped guards missed in
weeks** — because it asks the only two questions that matter: *is this answer
TRUE?* and *should we have answered at all?* Field presence, schema conformance
and link liveness are necessary; they are not sufficient.

## Standing decisions

- The battery runs daily as guard D in `raven-eval-parity.yml`, rotating
  question banks by day-of-year (`--all` runs every bank).
- Probe errors always gate. A battery that could not probe must never look
  green (guard B's `await` lesson, applied at birth).
- Oracle-type enum gap: **do not** quick-patch. It needs the enum member, the
  contract bump, intent mapping ("oracle" currently maps to keywords only),
  and a curated data pass over the 4-6 oracle rows — one deliberate change.

## Addendum — waves 3-4, same day

Three more roots found and fixed, and one lesson about the battery itself:

**L7 — The slug was never identity.** `q="gate-io"` returned semantic
neighbours while the row existed — `buildHaystack` had no slug, so any row
whose slug differs from its display name was unfindable by its own slug. Two
probes then misread the neighbours' provenance as the row's own, producing two
wrong diagnoses (stale cache, curation revert) before the root. Persistent
guard reds are serving defects; chase them to root (#1051).

**L8 — A same-site redirect is a hop, not an outcome.** `nodies.app → 308 →
www → 200` never stamped `lastSuccessAt` because the checker treated the bare
308 as the result — so 386 projects had no evidence and the basis upgrader
could stamp nothing. The most common site config on earth (www/https
canonicalization) was structurally excluded from evidence collection (#1052).
Offsite redirects stay first-class: the hijack detector needs them.

**L9 — Structured membership is worth one word in ranking, as it already is
in admission.** "lending protocol on Stellar" buried Live typed-Lending rows
beneath prose double-matches; admission had believed `type ≈ one prose word`
since sls-018/019 while ranking counted it only as an equal-score tiebreak
(#1053).

**L10 — An eval assertion must encode what retrieval OWES, not what the
author prefers.** The lending red survived #1053 because the bank asserted
two hand-picked members in the top-8 of a 20-row vertical — an ungrounded
canonicality opinion. The red was still productive (it forced L9), but the
recalibrated assertion is the honest one: flagship leads, page is
category-pure. Canonicality within a vertical is prominence curation.

Wave 3 (hacker journey): 23/23 substance; one honesty gap (vetIdea
competitors carried no matchMode — #1049). Wave 4: 19/21, the two "fails"
being one opinion-assertion (L10) and one crude grading regex (SEP-41's #1 is
rightly stellar-protocol — the standard's own text).
