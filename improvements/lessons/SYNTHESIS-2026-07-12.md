# Lessons synthesis — what 26 classes say when read together (2026-07-12)

The mistake corpus now holds 26 classes from ~5 weeks of incidents (51 externally-filed sls items, 3 cold audits, 597-probe self-audit, demo feedback, our own postmortems). Read as one document, they reduce to **one root, five families, and three meta-lessons** — this is the strategic layer above the per-class checklist in [README.md](./README.md).

## The one root

Every class is a variant of a single defect: **a gap between what is true and what the system asserts** — in a field (1–4, 8, 23), a ranking (5–7, 19, 24), a contract (9, 11–13), an identity (10, 14, 21, 22), or a process's own claims about itself (16–18, 20, 25, 26). The engine's entire job, stated once: *find assertion-truth gaps before consumers do, close them, and install a guard that keeps each one closed.* Everything else — engines A–E, cross-checks, golden, cadence — is machinery for that sentence.

## The five families (grouping the 26)

| Family | Classes | One-line rule |
|---|---|---|
| **Representation honesty** | 1,2,3,4,8,23 | A fact must be structured, dated, disambiguated, self-describing — and live in rows, not commentary |
| **Retrieval honesty** | 5,6,7,19,24 | Matching reads structured truth; every rung labels itself and caps its trust below the rung above |
| **Contract honesty** | 9,11,12,13 | The spec is the product; descriptions route; advertise only what's verified; grade committed artifacts |
| **Identity discipline** | 10,14,21,22 | Same name ≠ same thing; one record ≠ one product; the instance ≠ the class |
| **Process honesty** | 16,17,18,20,25,26 | Evals need ground truth; writes fail-safe; pipelines classify by what a thing IS, not how it was found |

## The three meta-lessons

**1. Fixes are the largest source of new defects.** The 1.7.15 description enrichment fixed editorial capture and *created* docs capture (sls-051). The rarible networks fill fixed a gap and created an overstatement. The status filter shipped while the identical `type` defect sat untouched (class 22 at contract scale). The seed waves that grew the directory injected 8 of 12 bridge mis-types. **Moving forward:** every fix must answer two questions before shipping — *"which siblings share this shape?"* (kill the class, not the instance) and *"which surface does my fix enlarge?"* (the sls-051 question). The per-ship eval cadence (post-deploy-eval) is the mechanized backstop; these two questions are the human one.

**2. Guards compound; incidents don't.** 74 corrupted SCF records cost one day to fix *because* the verdict parser, curation Action, dry-run discipline, and cross-check already existed. The next corruption of that shape costs one weekly red. The economics of the engine are now visibly right: every guard is written once and runs forever, while every incident class can only be suffered once. The corollary: **guard-writing is never overhead** — it is the highest-leverage work we do, and "fix + guard + projection" (loop step 4) must stay the non-negotiable close-out shape.

**3. The sharpest findings come from a different vantage point, not more effort.** Tyler's routing captures were structurally invisible from our side; his GT lanes read pages ours summarized; DeepWiki judged repos our scorer labeled; SCF verdicts corrected our badge scrapes. Internal probing converges on our own blind spots. **Moving forward:** every quality dimension needs at least one *external referee* (consumer CI, primary-source verdicts, independent model), and the referee's disagreements are the highest-value queue we have — pay them first.

## What this means for the roadmap

The reactive engine is built (A–E, cross-checks, golden, per-ship cadence, this corpus). The next capability tier, in priority order, is: (1) **projection at scale** — walk the 26 classes against every surface *before* incidents, as a standing sweep, not a loop step; (2) **demand-graded evals** — Engine D queries upgraded to graded golden cases (steal #4); (3) **cross-surface fact register** (steal #3) — kill the disagreement family wholesale; (4) **statusBasis backfill** — the largest known assertion-truth gap still open (sls-024 recurrence).
