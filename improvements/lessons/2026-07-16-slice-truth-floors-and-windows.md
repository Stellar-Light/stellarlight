# 2026-07-16 — slice truth, gated floors, windowed guards (quality-week lessons)

Four durable classes surfaced in one week (waves: `quality-week-2026-07-13-16.md`).
Each got a mechanized guard; the classes join the README table (#16–#19).

## 16. Cross-chain headline ≠ chain footprint

**What failed:** the coverage report ranked "missing" DefiLlama protocols by their
headline `tvl` — NEAR Intents showed a $92M "gap" that was **$11.5k on Stellar**
(26 chains). Worse, the SAME bug sat in prod: `enrich-tvl.ts` summed headline `.tvl`
per LLAMA_MAP row, fine for Stellar-natives (total == Stellar) but any multichain
mapping would write the cross-chain total as Stellar TVL — Sentora was one enrich run
from carrying **$2.06B** (real slice: $1,360).

**Root:** an aggregator's chain-membership list plus its headline metric says nothing
about the per-chain footprint. Membership ≠ magnitude.

**Guard:** `stellarTvlOf()` in enrich-tvl (uses `chainTvls.Stellar`, falls back to the
total only when no breakdown exists) + the coverage report floors/ranks on the Stellar
slice and prints both columns. Found by the owner questioning a report row — a reminder
that the metric's consumer is a verification layer too.

## 17. Relevance floors need a discrimination gate AND an intent guard

**What failed:** the brand-lookup fix (full-lexical relevance floor 0.8) shipped clean
on 35 unit tests, then post-deploy golden dropped 46→43. Two distinct over-promotions:
(a) "SCF handbook link" floored SEVEN pages that merely contain scf/handbook/link,
crowding out the actual handbook root (which never says "link"); (b) "latest soroban
release" floored undated evergreen version pages over the dated Protocol-27 posts.

**Root:** coverage of a token set is only lookup evidence when it is *rare*. Unit
fixtures can't see corpus-wide coverage distributions — only a live golden run can.

**Guard:** floor applies only when ≤5 pool chunks carry coverage
(`FULL_LEXICAL_DISCRIMINATING_MAX` — self-calibrating, no stopword list) AND never on
recency-intent queries (`recencyIntent()` — a time-anchored query is not a lookup).
Golden protocol-currency + known-item cases are the permanent net. **Design rule: any
new ranking floor ships with (1) a discrimination condition, (2) an intent exclusion,
(3) a golden case for each.**

## 18. Windowed guards under-report population defects

**What failed:** the self-audit's `bridge corridors` check reads the q=bridge result
window. Fixing its 4 named rows surfaced a 5th (wowmax) the window had hidden behind
them — whack-a-mole by construction.

**Guard/method:** when a windowed check reds, sweep the FULL population once
(`?type=Bridge&limit=100`) and fix every failing row in one pass. Same pattern as the
directory-frame lesson (the search route's ~500-candidate pool truncated per-status
paging; page per-category instead).

## 19. "Not served" verdicts need content-tier evidence, not URL-tier

**What failed:** the coverage report's partner-docs lane judged "served" by result URL
only → declared Alchemy "NOT SERVED at all" while the full Alchemy Data API content was
retrievable from a stellar.org-hosted chunk. A false negative in our own gap metric —
we nearly rebuilt ingestion for content we already served. (Sibling trap, same day:
excerpt truncation made a chunk LOOK like it lacked text it carried — always probe with
a verbatim quote at high limit before concluding content is absent.)

**Guard:** lane verdicts are tiered `own / mention / none`, matching URL **and** served
text; probe depth 15 (the lane measures presence, not rank).

## Ops corollary (not a data class): measure duration × cadence

The Actions-minutes crisis (~2,460/mo pace vs 2,000 free) came from two shapes:
a long job on a short cadence (check-links, 18 min DAILY) and a short job on an
unbounded trigger (content-freshness on EVERY merge). The audit method is two lines of
`gh api …/actions/runs` arithmetic — run it before adding any scheduled/push-triggered
workflow, and prefer local detector runs (all report-*.ts scripts are API-driven and
free) over dispatching Actions.
