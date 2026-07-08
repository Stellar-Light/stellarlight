# Stellar Light

The **data layer for the Stellar ecosystem** — a curated, always-fresh index of what's been built and who to work with, exposed to both people (a fast web app) and AI agents (the **Stellar Scout** API, MCP, and skill). It powers assistants like **Stellar Raven**.

Built with Next.js 16 + Payload CMS on MongoDB. Live at **[stellarlight.xyz](https://stellarlight.xyz)**.

## Start here

Depending on what you're here for:

| You want… | Go to |
|---|---|
| **How it all works** (code-verified mechanics) | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| **The agent data layer** (endpoints an agent queries) | `src/app/api/**` · spec at [`/api/openapi.json`](https://stellarlight.xyz/api/openapi.json) |
| **The repo code-truth scoring** (real-contract-vs-scaffold grading) | `src/lib/code-depth.ts`, `code-signals.ts`, `soroban-versions.ts` · scanner + gate in `scripts/scan/` |
| **The published packages** | `scout-mcp/` (MCP), `api-client/` (typed client) |
| **The agent skill** | `public/skills/stellar-scout.md` (mirrored to [Stellar-Light/stellar-scout](https://github.com/Stellar-Light/stellar-scout)) |
| **Deploy / run it** | [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) · [Quick start](#quick-start) below |
| **Admin / data ops** | [docs/ADMIN.md](./docs/ADMIN.md) |

## What's inside

### For people — the web app

- **Project & entity directory** (`/directory`) — projects + the orgs behind them, with GitHub activity, on-chain data, SCF funding, and live/inactive status.
- **Ask Stellar** (`/ask`) — natural-language search across the knowledge corpus (SEPs, dev docs, audits, ecosystem writing) + the directory, answered with a grounded, **cited** synthesis.
- **Partner Connector** (`/partners`) — vetted providers a builder hires or integrates (anchors, ramps, auditors, infra, tooling, wallets), with capabilities, compliance & corridors, a guided **matchmaker**, and an AI **concierge**. Partners log in and maintain their own profile.
- **Skills marketplace** (`/skills`) and **ecosystem reports** (`/blog`).

### For agents — Stellar Scout

The same curated data, built to be consumed by AI agents:

- **REST API** — projects, repos, research, partners, hackathons, builders, RFPs, leaderboard, clusters, status. Spec: [`/api/openapi.json`](https://stellarlight.xyz/api/openapi.json); changelog: [`/api/changelog`](https://stellarlight.xyz/api/changelog).
- **MCP server** — [`@stellar-light/scout-mcp`](https://www.npmjs.com/package/@stellar-light/scout-mcp).
- **Typed client** — [`@stellar-light/api-client`](https://www.npmjs.com/package/@stellar-light/api-client).
- **Agent skill** — [`public/skills/stellar-scout.md`](./public/skills/stellar-scout.md).

### Kept honest

- A **freshness loop** (fresh → aging → stale → archived) so nothing dead surfaces as live.
- **Verified** system signals shown next to **partner-claimed** facts; **code-truth** grading from a repo's actual source, not just stars.
- Curator data changes run **dry-run → review → execute**; every change is transparency-logged.

## Repository structure

```
stellarlight/
├── src/
│   ├── app/
│   │   ├── (frontend)/         # public web app — /directory, /ask, /partners, /scout, /skills, /blog
│   │   ├── (payload)/          # Payload CMS admin
│   │   └── api/                # ← the Stellar Scout REST API (projects, repos, research, partners, …)
│   ├── collections/           # Payload collections (Projects, Entities, Partners, Repos, Blog, …)
│   ├── components/            # React components (+ ui/ = shadcn)
│   └── lib/                   # core logic
│       ├── code-depth.ts      # ← code-truth: real-contract-vs-scaffold depth score (0–1)
│       ├── code-signals.ts    #   stellarProof / code-facts / anti-farm signals
│       ├── soroban-versions.ts#   dated Soroban SDK version → status
│       ├── repo-search.ts     #   graded repo ranking
│       └── partner-match.ts   #   deterministic partner matchmaker
├── scripts/                   # data curation, enrichment, cron logic (dry-run → execute)
│   └── scan/                  # ← code-depth scanner + CI regression gate (depth-eval, depth-labels)
├── content/reports/           # long-form ecosystem reports (the /blog content)
├── public/skills/             # the Stellar Scout agent skill + references
├── scout-mcp/                 # @stellar-light/scout-mcp — MCP server (npm)
├── api-client/                # @stellar-light/api-client — typed client (npm)
├── tests/ · docs/             # Vitest/Playwright · operating docs
└── .github/workflows/         # CI + scheduled data Actions (curation, scans, guards)
```

## Key collections

- **Projects** — every project/product; status (live/inactive), category, SCF funding, links, on-chain info, GitHub stats, verification/provenance.
- **Entities** — orgs/teams that build multiple projects.
- **Partners** — vetted providers (**auth-enabled** — partners log in). Capabilities (assets/SEPs/ramps from stellar.toml), curator-verified compliance & corridors, freshness, verified-vs-claimed signals. Powers the directory, matchmaker, and concierge.
- **Repos** — indexed GitHub repos with the `codeVerified` block (stellarProof, codeDepth, SDK version status).
- **Blog / RSS** — reports + auto-imported ecosystem writing.

Full detail: [docs/COLLECTIONS.md](./docs/COLLECTIONS.md).

## Tech stack

Next.js 16 (App Router) · Payload CMS 3 · MongoDB Atlas · Cloudflare R2 (media) · Tailwind + shadcn/ui · TypeScript · Vitest + Playwright · Biome.

## Quick start

```bash
git clone <repository-url> && cd stellarlight
pnpm install
cp .env.example .env         # set DATABASE_URI, PAYLOAD_SECRET, (optional) NEXT_PUBLIC_APP_URL
pnpm dev                     # http://localhost:3000 · admin at /admin
```

Required env: `DATABASE_URI` (or `MONGODB_URI`), `PAYLOAD_SECRET` (≥32 chars), `CRON_SECRET`. Full list + optional keys (R2, GitHub, Voyage, Anthropic, Resend, Airtable) in [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).

### Common scripts

`pnpm dev` · `pnpm build` · `pnpm test` · `pnpm test:e2e` · `pnpm lint` · `pnpm format` · `pnpm generate:types` · `pnpm cron:github`.

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — how the data layer works: sources → collections → scoring → serving → guards.
- **[SHIPPING.md](./SHIPPING.md)** — the ship-gate discipline (verify before advertising; the surface map).
- **[docs/](./docs/)** ([index](./docs/README.md)) — operating the app: deployment, admin, collections.
- **[improvements/](./improvements/)** — the live-services improvement backlog + self-improvement loop.
- **[ideas/](./ideas/)** — proposals not yet committed.
- **[/api/changelog](https://stellarlight.xyz/api/changelog)** — the live, agent-readable API changelog.

## Contributing

Fork → feature branch → `pnpm typecheck && pnpm build && pnpm test` → PR. Data changes go through the dry-run → review → execute Action flow, not blind writes.

## License

MIT
