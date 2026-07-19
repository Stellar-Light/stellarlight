# Analytics surface + corpus recency — 2026-07-17 → 07-18 (delta wave)

Recorded by the improvement-loop triage on 2026-07-19. Covers the PRs that merged
**after** the quality-week retro wave (which ended at #569) and were not yet reflected
in `improvements/`. Two arcs: corpus recency-measurability closeout, and the first
public usage-analytics surface.

## Arc 1 — Corpus recency becomes measurable (#571–#574)

The staleness root cause found during quality week (a single failing ingest step
aborting the whole refresh) got its final fixes plus the instrumentation to *prove*
freshness going forward.

| PR | Fix |
|---|---|
| #571 | CAP ingest step no longer aborts the whole corpus refresh — the stale-audit root cause; one bad source can't starve every other lane. |
| #572 | Coverage freshness lane stopped conflating **content age** (when the doc was written) with **refresh staleness** (when we last re-ingested it) — they are different failures and were being scored as one. |
| #573 | `observedAt` stamped on audit chunks so refresh recency is measurable per-chunk. |
| #574 | Universal floor: every source gets a default `observedAt` via a bulk re-stamp — no active row left unmeasurable (same universal-floor shape as sls-024's statusBasis). |

Pattern echo: #574 is another **universal floor after a gated partial** — the same class
as sls-024 (boxy's "0/845 or it isn't fixed"). When a provenance/recency field is added,
back-stamp the whole population in the same wave, don't leave a measurement hole.

## Arc 2 — Public usage-analytics surface (#576–#584)

First externally-visible `/analytics` page (live, 200) plus the concierge fix that
shipped alongside it.

| PR | Fix |
|---|---|
| #576 | Concierge greeting no longer 400s on page load; SCF report gained round-level (byRound) data. |
| #577 | Public `/analytics` page + published rate limits on the hosted AI surfaces. |
| #578 | Honest consumer attribution on `/analytics` (no inflated/misattributed buckets). |
| #580–#581 | Analytics redesign: minimal stat-page with 30-day usage chart, bklit-style cards, violet-glow line chart. |
| #582 | Chat scroll engineering — never move the reader against their scroll intent. |
| #583 | Cumulative total-calls chart with a working hover tooltip (boxy directive: usage/adoption surfaces chart **cumulative** totals on a 0-based axis so scale reads honestly; day-deltas live in the tooltip only). |
| #584 | Chart tooltip legibility + no overlapping end ticks. |

No new durable failure class emerged that isn't already a lesson (the cumulative-chart
rule is already `feedback_usage_charts_show_scale`; the universal-floor and
CAP-abort patterns are already recorded). No lessons-table row added this wave.

## Process note

This entry exists because the triage's every-run staleness check
(`git log -1 --format=%ci -- improvements/`) caught the folder sitting at 07-16 while
#571–#584 merged. That check is the mechanized guard against the "folder went dark for
four days" defect the quality-week retro called out.
