# A value wearing provenance that does not cover it (2026-08-31)

Raven filed [#1134](https://github.com/Stellar-Light/stellarlight/issues/1134):
`explainRepo` answered `MaxSupportedProtocolVersion = 25` for
`stellar/stellar-horizon` while the source at our own
`codeVerified.scannedRef` (`82660510`) defines `28`. Three independent
reproductions, pinned SHAs. Verified before acting — read the file myself at
that ref and at `2abda012`; both say 28.

**The stale number was DeepWiki's. The defect was ours, and it was underneath.**

The response carried three timestamps:

| field | what it actually dates |
|---|---|
| `meta.generatedAt` | the moment of the request |
| `codeVerified.scannedAt` | when WE scanned the source |
| `repoMeta.lastCommitAt` | when the repo last moved |

Every one describes the code scan. Not one dates the **answer**. A consumer
reading `scannedAt: 2026-08-14` beside `answerSource: "deepwiki"` reasonably
concludes the answer reflects the code as of that scan — and a DeepWiki answer
can be both older than the scanned ref and contradict it.

## The class

**Nearby provenance is worse than none.** No date makes a consumer cautious. A
date that belongs to something else makes them confidently wrong, and hands
them a citation for it. The failure is not the missing field; it is the
*adjacent* field that invites a specific wrong inference.

This is the same shape as three other things found the same week:

- `cleared` in the improvement ledger meant "a detector stopped reporting",
  and was counted beside `verified` in a single "90% closed" figure. 69
  genuine high-severity findings sat in the closed column.
- A code comment asserted the page-size dependence was fixed. It had changed
  the numerator and kept `limit` as the threshold; the claim outlived the code
  by five weeks because nothing checked the invariant the file states twice.
- `matchMode: "semantic"` once returned neighbours with no advisory —
  presenting a near-match as an answer. (Fixed earlier; the advisory now says
  outright "NEIGHBOURS, not matches.")

In each, the artifact was *accurate about itself* and misleading in context.

## The fix, and the interesting half

`answerAsOf` sits beside `answerSource`, and is **null for every DeepWiki
answer**. `DeepWikiAnswer` carries `{repo, answer, searchUrl}`; the MCP
envelope exposes no index date. The age is genuinely unknown, and emitting a
timestamp would be worse than the original defect — it would make an unknown
look measured. It is populated from `scannedAt` on the code-scan path, where
the answer *is* the scan.

**The asymmetry is the information.** A field that is null in one branch and
populated in another tells a consumer something a uniformly-populated field
never could.

## Sweeping the class

The naive detector is wrong, and measuring proved it. "Response carries
several dates AND a value" flags 12 endpoints — and `verifyClaim`, with the
most dates (five) and the sharpest value (a verdict), is **correct**: its
`confidence` object holds `ageDays`, so the verdict dates its own evidence.

Scoping is the discriminator, not count:

> a value must have a date **in its own object**, or be documented as undatable.

By that rule **40 of 55 served values cannot be dated by a consumer**. Ratcheted
in `scripts/check-answer-dating.ts`, on the contract gate and on `/quality` as
`answer-dating`.

## What testing the guard taught, that reading it would not

Its first version reported **"0/0 values dated"** and exited 0. It had walked
`responses` as though it were a schema — `responses → 200 → content →
application/json → schema` are wrappers, not scopes — found zero properties,
and passed **having read nothing**. The hunter had the defect it hunts. It now
exits 2 on a zero-value sweep rather than calling that a clean bill of health.

Then a planted `grade` beside `answerAsOf` did not fire, which exposed a real
limit rather than a bug: "some date in this object" is a heuristic, and
`answerAsOf` dates `answer`, not a sibling. Tightening to a per-field date
would flag far more than anyone would fix, so the guard deliberately catches
the sharper shape. Both limits are written into the file, because a guard whose
blind spots are undocumented gets trusted past them.

## Carry forward

1. **When you serve a value, ask what dates it — and what a reader will
   *think* dates it.** The second question is the one that catches this.
2. **Null is an admission; a fabricated date is a lie with a citation.** Prefer
   the admission, and say why in the field's own description.
3. **Test a new guard by triggering it.** Three of this week's guards passed
   review and failed their first planted defect. Reading a checker tells you
   what it intends; planting a defect tells you what it does.
4. **Sweep the class, but measure the sweep.** The obvious detector here would
   have filed 12 findings of which the sharpest was a false positive.
