# StellarLight — live-services improvement plan

How we keep improving the live services, continuously — modeled on how Raven
self-improves. Two engines drive it:

- **The Guard** — `scripts/self-audit.ts` + `.github/workflows/self-audit.yml` (daily + on-demand). Grounded checks against the live API (liveness, freshness thresholds, served-count sanity, ground-truth spot checks). Finds **real** regressions, files an Issue with a reproducible probe, never manufactures problems. Complements `api-drift.yml` (API ⇄ spec ⇄ docs) + `verify-claims.yml`.
- **The Experiments Lab** — `src/lib/experiments.ts` + `/experiments` + `scripts/experiment-eval.ts`. Try a variant behind a flag (default off), score it against a ground-truth metric, graduate winners into the contract, kill the rest.

**The loop, each cycle:** run the Guard → triage findings → pick the top gap → fix it, or turn a hypothesis into an experiment → verify → repeat. Run manually any time:

```bash
SCOUT_BASE=https://stellarlight.xyz pnpm exec tsx scripts/self-audit.ts       # Guard
SCOUT_BASE=https://stellarlight.xyz pnpm exec tsx scripts/experiment-eval.ts  # Experiments
```

---

## Prioritized backlog (grounded)

### Ranking / relevance
- **Repo-search relevance** — ranking is authority-dominated (scfAwarded / repoScore beat topic match), so narrow verticals surface off-topic repos (`rwa→dfns`, `amm→rango`, `stablecoin→x402`). Down-weight authority vs topic match; measure top-3 hit rate on a golden query set. → the next experiment (`repo-search-relevance`).
- **Freshness** — the Guard watches for stalled refresh crons; backfill thin fields as they surface.

### Partner data (the layer just built out)
- **Expose compliance to agents** — running now as experiment `partner-compliance-api` (gated **off**). Graduate once the eval wins **and** it's added to the OpenAPI spec.
- **On-chain "live on Stellar" proof** — resolve each anchor's asset issuers (from stellar.toml CURRENCIES) → Horizon / stellar.expert for live-on-mainnet + supply + holders. The git-free trust signal we deferred (`project.onchain` is empty, so it needs its own ingest).
- **Compliance coverage** — extend verified compliance beyond the top ~9 anchors (cite-or-null, same as the first pass).

### Agent contract
- **Field selection** (`?fields=`) — let agents request only what they need.
- **Confidence scores everywhere** — extend the trust/confidence vocabulary to every endpoint.
- **Webhooks** (`POST /api/subscribe`) — push change notifications instead of poll.

### Coverage / ingest
- **Code-depth scan waves** — continue over the ~1,900 non-Rust repos.
- **Hackathons** — served live via DoraHacks today (`curated: 0` is by design); curating historical winners/tracks/placements would deepen golden-question answers (a data-gathering effort).
- **Golden-question eval** — expand the Guard's ground-truth set to mirror Tyler's cf-flue eval, so our score tracks the score he grades us on.

---

## How an idea becomes shipped

1. Add it to `src/lib/experiments.ts` (`status: "proposed"`).
2. Wire the variant behind its flag (`defaultOn: false`) so it's testable via `?exp=<id>` without touching prod.
3. Run `scripts/experiment-eval.ts` → it must **WIN** vs baseline on a ground-truth metric.
4. **Graduate:** flip `defaultOn` → add the field/behavior to the OpenAPI contract → PR + merge. Or **kill** it and record why.
