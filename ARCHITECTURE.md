# Architecture

Code-verified mechanics of the Stellar Light data layer — what feeds it, how records are scored, where the data is served, and what keeps it honest. Paths are real; start from any of them.

```
  sources                    store                      serving
┌──────────────────┐   ┌───────────────────┐   ┌─────────────────────────────┐
│ GitHub GraphQL   │   │ Payload CMS        │   │ web app  src/app/(frontend) │
│ EC taxonomy      │ → │ on MongoDB Atlas   │ → │ REST API src/app/api/**     │
│ stellar.toml     │   │ src/collections/*  │   │ MCP      scout-mcp/  (npm)  │
│ DoraHacks feed   │   └───────────────────┘   │ client   api-client/ (npm)  │
│ SCF awards page  │        ▲                   │ skill    public/skills/     │
│ RSS / Airtable   │        │ scripts/ + GH     └─────────────────────────────┘
│ Stellar Passport │        │ Actions (dry-run
└──────────────────┘        │ → review → execute)
```

## Store — the collections (`src/collections/`)

- **Projects** — the canonical directory (~900 records): status (`Live`/`Inactive`…), category + `types[]`, SCF funding (`scf.awardedRounds`), links, `coverage` (anchor corridors), `supportedNetworks`, `canonicalSlug` (dupe lineage), `prominence` (curated rank weight).
- **Repos** (~2,400) — indexed GitHub repos carrying the `codeVerified` block written by the scanner (below).
- **Partners** — auth-enabled (partners log in): stellar.toml-derived capabilities (`assets`/`seps`/`rampTypes`), curator-verified `compliance`, system-owned `verified` signals, the freshness state machine (`fresh → aging → stale → archived`).
- **Entities, Blog/RSS, Builders** (Passport-synced), transparency logs.

## Scoring — how a record earns rank

**Repos (code-truth):** `scripts/scan/scan-repo-code.ts` fetches a repo's actual source (shared fetch unit `scripts/scan/fetch-repo-code.ts`) →
- `src/lib/code-signals.ts` — `stellarProof` relevance gate (`cargo-sdk → … → none`; keep-when-uncertain, false negatives are the dangerous error) + anti-farm caps.
- `src/lib/code-depth.ts` — 0–1 substance score separating a real contract from a hello-world scaffold (per-crate multi-file union, clone-hardened, fork-capped).
- `src/lib/soroban-versions.ts` — dated SDK version → `current/supported/deprecated`.
- Composite `repoScore` in `src/lib/repo-search.ts` (topic match + freshness + traction + authority; exact-name lookups dominate authority — sls-009).
- Regression gate: `scripts/scan/depth-eval.ts` over the ground-truth key `depth-labels.ts`, CI-enforced (`.github/workflows/depth-eval.yml`).

**Projects:** keyword+synonym search with tiered AND→relaxed matching, semantic (`$vectorSearch`, voyage-3 embeddings) fallback, exact-name boost, Inactive down-rank — `src/app/api/projects/search/route.ts`.

**Partners:** deterministic matcher `src/lib/partner-match.ts` (`scorePartners` — structured-capability weighted, region-gated, word-boundary safe). The list endpoint, matchmaker, and concierge all reuse it — one engine, no drift.

## Serving — the contract

- REST under `src/app/api/**`; spec source `src/app/api/openapi.json/route.ts` → live at `/api/openapi.json`. Changelog `src/lib/changelog.ts` → `/api/changelog` (agent-readable; downstream automation ingests it).
- `scout-mcp/` and `api-client/` are thin wrappers over the REST API, published to npm; the agent skill in `public/skills/` mirrors to the public `Stellar-Light/stellar-scout` repo.
- Contract rules encoded from hard-won findings: structured fields over prose, status enums over ambiguous nulls, self-describing arrays (`placementRank`/`winnersRanked`), `asOf`/`computedAt` stamps, and tool descriptions treated as routing contracts.

## Data ops — how data changes

Bulk writes only via scripts in `scripts/` (mostly `scripts/data/`) run through GitHub Actions with **dry-run → owner review → `--execute`**; scanner writes go through `scripts/scan/write-shape.ts` (zero-demotion by construction). Vercel crons (`vercel.json`) handle scheduled refreshes (GitHub stats, RSS, builders, partner freshness/digest).

## Kept honest — the guards (`.github/workflows/`)

- `self-audit.yml` — daily grounded checks against the **live** API (liveness, freshness thresholds, served-count sanity, ground-truth spot checks).
- `api-drift.yml` — live API ⇄ OpenAPI ⇄ docs agreement.
- `depth-eval.yml` — codeDepth separation on the labeled answer key.
- `content-freshness` + `verify-claims` — no stale CLI commands in authored content; no advertised-but-unshipped claims.
- Experiments Lab (`src/lib/experiments.ts`, `/experiments`) — variants ship behind per-request flags (default off), graduate only after beating baseline on a ground-truth eval.

## Runtime

Next.js 16 App Router + Payload 3 on Vercel (`stellarlight-landing`), MongoDB Atlas, Cloudflare R2 media, Resend email (partner sign-in/reminders). Deployment detail: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md). Shipping discipline: [SHIPPING.md](./SHIPPING.md).
