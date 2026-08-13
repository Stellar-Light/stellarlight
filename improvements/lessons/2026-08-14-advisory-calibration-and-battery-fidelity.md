# 2026-08-14 — Three calibrations to one honest signal (+ the battery's four probe lessons)

## What happened

Closing the last battery weak case (an agent-conduct question: "how should
category-scoped search report corpus-wide matches?") we built the fix on
our own tool: `meta.sourceAdvisory` on /api/research — when a source
filter returns only weak neighbors while stronger corpus-wide matches
exist, SAY so. The feature took **three calibration rounds** to become
trustworthy, and each round was caught by live probing with a
positive-AND-control pair before any claim was repeated:

1. **Composite-confidence pre-gate (`< 0.6`) — never fired.** Authority
   (1.0 for CAPs/SEPs) plus freshness compose most in-source tops above
   0.6 even when relevance is ~0.5. A threshold on a COMPOSITE hides the
   component you actually mean.
2. **Raw-score gap (`+0.05`) — over-fired on perfect matches.** The
   control (asset clawback → CAP-35, the exact right answer) still drew
   an advisory: some corpus-wide chunk out-cosined it by 0.07. A
   relevance conjunct (`< 0.7`) didn't save it — short queries sit at
   relevance ~0.5 even for canonical hits.
3. **Measured, then fixed the real flaw: two ranking regimes.** The
   wide comparison used the RAW pipeline top (0.73 — a chunk the real
   ranking demotes as dupe/low-value) against the SERVED in-source top
   (0.656). The plain unfiltered API's served top was the SAME CAP chunk
   — gap zero. Fix: rank the corpus-wide pool through the identical
   `rankResearchChunks` path (shared `rowOfDoc` mapper) and compare
   served-confidence to served-confidence, gap > 0.1. Positive fires,
   both controls silent, verified live in three directions.

## The lessons

- **Never compare quantities from different ranking regimes.** A raw
  retrieval score and a served, ranked, deduped score are different
  units that happen to share a scale. Any advisory/guard comparing "our
  answer vs the alternative" must produce both sides through the SAME
  pipeline. (This is the guard-side twin of the write-side rule "verify
  the row you wrote, by id".)
- **Calibrate from measured pairs, not assumptions.** Two rounds were
  designed from beliefs about score distributions; the third started by
  printing the actual anatomy (raw, relevance, composite, both sides)
  for one positive and one control. Ten minutes of measurement beats
  two deploy cycles of guessing.
- **A conduct signal needs a control case in its verification, always.**
  "It fires when it should" is half a test. The clawback control caught
  both bad calibrations; without it we'd have shipped an advisory that
  second-guesses correct answers — the cried-wolf class in a new coat.
- **Fix the conduct, not the scoreboard.** The battery case still scores
  weak (it grades agent behavior, not corpus content) and stays visibly
  filed. The deliverable was our tool modeling the right behavior for
  consumers, not a prettier number.

## The battery's four probe-fidelity lessons (same arc, one instrument)

Of 14 "weak coverage" findings, TEN were the measuring instrument:

1. **Route to the surface the question targets** — their `surface` field
   names THEIR tool registry; grading docs questions against the wrong
   endpoint produced a wall of phantom zeros.
2. **Your own rate limiter is an error, not a finding** — the sweep
   429'd itself into 312 fake gaps; throttled probes must retry-or-error,
   never score.
3. **A natural-language question never matches an event NAME via ?q=** —
   probe rosters by anchor overlap, not name-lookup luck.
4. **Token floors drop load-bearing short tech tokens** — `sdk`, `zk`,
   `cli`, `rpc` are 2-3 chars; a 4-char floor blinded the anchor scorer
   to exactly the vocabulary the questions are about.

The residue after honest instrumentation: 1 real content gap (Java SDK
Maven coordinates — ingested the README, 0.51 → 0.86 on the exact
battery question), 2 routing corrections (`skills.lumenloop.*` is their
namespace), and 1 conduct case (above). Nothing suppressed; every fix
live-verified; all four probe lessons baked into the detector.

**The class, named**: *instrument-first triage.* When an eval says
"weak", the first suspect is the probe, the second is the routing, and
only the residue is the corpus. Uniform scores (all-zero, all-one-band)
are the tell that the instrument, not the subject, is speaking.
