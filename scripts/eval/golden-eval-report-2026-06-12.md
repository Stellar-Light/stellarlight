# Stellar Light Golden-Question Eval — Report

**Run `2026-06-12` · 23 retrieval questions + 2 live-skip · deterministic asserts · graded against the live public API (`stellarlight.xyz`).**

Companion to lumenloop's eval run. **Read the framing in §2 first — the two evals measure different layers and are meant to compose, not be compared head-to-head.**

## 1. Headline

**Retrieval coverage: 23 / 23 PASS.** Every Stellar golden question surfaces the correct primary-source content in the top-k — including *"How do I charge AI agents per API call on Stellar?"*, the x402 question that exposed the docs/code gap. Stellar Light retrieves the agentic-payments + x402 dev-docs and the substantive MPP explainer for it.

The second axis — chunk hygiene (is the surfaced chunk *usable*, not just present) — is where the active work is: this cycle pruned contentless/duplicate chunks and built a nav-card filter + title repair + per-result confidence scoring (corpus fixes live; route-level fixes verified locally, pending deploy — see §4).

## 2. What this eval measures (and how it differs from lumenloop's)

| | **lumenloop eval** | **Stellar Light eval (this report)** |
|---|---|---|
| Layer | **Agent behavior** | **Retrieval quality** |
| Question | Does the *agent* pick the right tools, ground answers, avoid wasting metered $? | Does the right *content* surface for the query, and is it usable? |
| Models | 4 (kimi/deepseek/grok/haiku) — model-dependent | **Model-independent** (embedding retrieval; the same chunks return regardless of caller LLM) |
| Asserts | `toolsAll/toolsAny/forbidden`, metered-spend discipline | `surface` regexes in top-k, vector-score floor, expected-URL, chunk-substance |

This is deliberate: Stellar Light is the **data/index layer**, so our contract is *"the right content surfaces correctly."* lumenloop's surface is **agent-facing research behavior**, so its contract is *"the agent behaves well across models."* An agent consuming both gets: lumenloop checks *it* uses tools well; Stellar Light guarantees *the data it pulls is correct and citable.* We do **not** need lumenloop's model matrix — retrieval is the same for every model — and lumenloop's metered-discipline axis doesn't apply to us (research is not metered per-call today).

## 3. Pass matrix (vector score; flags = chunk-hygiene issues, not retrieval misses)

| Question | Result | Top score | Hygiene flags |
|---|---|---|---|
| agentic-payments-x402 | PASS | 0.760 | 3 bad-title |
| standards-anchor-deposit | PASS | 0.822 | 1 card |
| protocol-trustline | PASS | 0.861 | 4 card |
| soroban-counter | PASS | 0.885 | — |
| dapp-freighter | PASS | 0.837 | thin, 5 card |
| assets-clawback | PASS | 0.788 | — |
| data-rpc-vs-horizon | PASS | 0.800 | 4 card |
| orient-remittance | PASS | 0.753 | — |
| audit-reentrancy | PASS | 0.842 | — |
| consensus-scp | PASS | 0.825 | — |
| soroban-auth | PASS | 0.840 | — |
| passkeys-smart-wallet | PASS | 0.812 | 5 card |
| fees-inclusion | PASS | 0.781 | 2 bad-title |
| path-payments-dex | PASS | 0.815 | — |
| soroban-events | PASS | 0.765 | — |
| scf-build-award | PASS | 0.845 | — |
| audit-defi-findings | PASS | 0.810 | — |
| ec-developer-count | PASS | 0.776 | — |
| ecosystem-rwa-map *(projects)* | PASS | — | — |
| ecosystem-agent-payments-projects *(projects)* | PASS | — | — |
| ecosystem-defi-yield *(projects)* | PASS | — | — |
| ecosystem-stablecoin-anchor *(projects)* | PASS | — | — |
| ecosystem-wallet-passkey *(projects)* | PASS | — | — |
| protocol-current-base-reserve | N/A (live) | — | live network value — adapters/RPC, not the static corpus |
| soroban-sdk-version | N/A (live) | — | today's pinned crate — live fact, not the static corpus |

**Prod totals: 23/23 PASS · 19 card-crowded results · 5 bad-title · 1 thin.**

## 4. Chunk-hygiene axis — this cycle's work

The flags above are the same class of problem lumenloop's report calls out (*"fix tool output gaps the failures exposed"*) — the content is correct, but the *chunk* is a nav stub or carries a useless title, which degrades a synthesized answer + its citation. Remediation this cycle:

| Issue | Fix | State |
|---|---|---|
| **Contentless chunks** (breadcrumb/date/tag stubs ranking on a stray token) | Shared `isLowValueChunk` rule; pruned **95** existing + blocks new at ingest | **Live** (corpus) |
| **Bad titles** (real x402/MPP content titled "58 posts tagged developer" / a bare date) | Salvage title from section/heading; retitled **37**, removed **210** duplicate aggregation rows | **Live** (corpus) |
| **Docusaurus nav-cards** (`📄️` teasers, ~771, out-ranking real guides) | Query-time filter (non-destructive — cards stay in DB, hidden from results) | **Verified locally**, pending deploy → drives card-crowding to ~0 |
| **No trust signal** (raw cosine only) | Per-result `confidence` {score, label, relevance, freshness, authority} — Tyler's "score your data" ask | **Verified locally**, pending deploy |

Post-fix, verified against the real corpus: cards vanish from results, the real 6K-char guides surface, every query still returns a full result set, and each result carries a confidence label. The prod numbers above reflect the *un-deployed* state; the trajectory is junk→0.

## 5. Methodology

- Harness: `scripts/eval/run-golden.ts` (+ `golden-questions.json`). Runs each question against live `/api/research` or `/api/projects/search`, grades deterministic asserts, prints PASS/FAIL + hygiene flags. `--json` for a machine scorecard; `BASE_URL=` to target local.
- Question set adapted from SDF's golden battery, **re-graded for retrieval** (surface-in-top-k + chunk-substance) rather than answer synthesis. `live-skip` marks questions that need a live network value the static corpus isn't meant to answer (base reserve, today's pinned crate) — reported N/A, not failed.
- Self-correcting: the harness's own "junk" metric was first title-based and produced a false positive (real x402 content under a junk title); now content-based, with a separate `bad-title` flag. (Same suite-defect discipline as lumenloop §5.)

## 6. Recommendations / next

- **Deploy the route-level fixes** (card filter + confidence) so the prod hygiene flags clear and every consumer gets trust-scored, card-free results.
- **Expand the question set** continuously (Tyler's #2) — more categories = more surface coverage; this run already grew 12 → 23.
- **Shared schema** with lumenloop (the open base-layer item) so an agent gets consistent project/builder records across both services.
- Confidence is now on research + projects + partners; the natural follow-on is wiring the same trust vocabulary anywhere an agent ranks our data.

---
*Harness + question set: `scripts/eval/` in the stellarlight repo. Reproduce: `pnpm exec tsx scripts/eval/run-golden.ts`.*
