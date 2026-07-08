# docs/

Deep documentation for Stellar Light. The root [README](../README.md) is the
overview + "Start here" map; these are the details.

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Vercel + MongoDB Atlas + Cloudflare R2 + cron setup, environment variables, and deployment troubleshooting.
- **[ADMIN.md](./ADMIN.md)** — Payload admin workflows (approving projects, RSS feeds, cron jobs) and the one-off data imports.
- **[COLLECTIONS.md](./COLLECTIONS.md)** — every Payload collection in detail.
- **[SHIPPING.md](./SHIPPING.md)** — the ship-gate / claim-verification discipline (why we dry-run → review → execute, and never advertise unverified claims).

Related, elsewhere in the repo:

- **[../improvements/](../improvements/)** — the live-services improvement backlog + the self-improvement loop.
- **[../ideas/](../ideas/)** — proposals not yet committed.
- **[/api/changelog](https://stellarlight.xyz/api/changelog)** — the live, agent-readable API changelog (source: `src/lib/changelog.ts`).
- **[/api/openapi.json](https://stellarlight.xyz/api/openapi.json)** — the OpenAPI spec (source: `src/app/api/openapi.json/route.ts`).
