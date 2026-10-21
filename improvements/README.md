# improvements/: the self-improvement paper trail

Every engine run, audit, fix wave and design brief lands here, so any session
or cold outsider can reconstruct what was measured, what was fixed, and why.

- **TODO.md** is the one queue: every known gap, how it was found, its state,
  and what done means. Start there.
- **rounds/** holds one dated ledger per multi-step effort: scope, lanes,
  review verdicts, an append-only log, outcome. The rules for both are in
  [AGENTS.md](../AGENTS.md).
- **audits/**: full-surface audit runs and findings JSON (the north-star
  ok-rate measurements: 59%, then 69%, 76% and 82%).
- **engine/**: engine-system analyses, standing-guard baselines (SCF
  cross-check, DeepWiki calibration, codeDepth status) and the coverage plan.
- **waves/**: executed data-fix waves (liveness triage, SCF seeds and
  absence), each with evidence.
- **ideas/**: design briefs for parked experiments (see /experiments for
  status).
- **lessons/**: one file per durable lesson class (not incident): what
  failed, the root, the standing prevention.

Conventions: date-stamp filenames (`YYYY-MM-DD`), commit raw JSON evidence
next to the narrative, and never delete; supersede with a newer dated file.
