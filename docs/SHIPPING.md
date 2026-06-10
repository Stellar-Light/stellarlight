# Shipping checklist — surfaces, gates, and the questions to answer first

Two incidents created this doc:

1. **The vapor ship.** We put `npx @stellar-light/scout-mcp` install commands on the site before the npm package — or the npm org — existed. An external partner hit the 404.
2. **The positioning gap.** A technical partner asked *"what does the MCP win me over the API?"* and we couldn't answer crisply, because the layering logic had never been written down.

This doc prevents both. Read it before shipping any new public surface.

## The surface map — who consumes what, and why each exists

```
                 ┌─────────────────────────────────────────────┐
                 │              /api/*  (REST)                  │  ← the actual product:
                 │  data + editorial judgment + verification    │    everything else is
                 └──────┬──────────┬──────────┬────────────────┘    distribution
                        │          │          │
        ┌───────────────┤          │          ├───────────────────┐
        ▼               ▼          ▼          ▼                   ▼
   OpenAPI spec     SKILL.md   scout-mcp   api-client      /skills + /scout
   (contract)      (playbook)  (adapter)     (SDK)          (human pages)
```

| Surface | Consumer | What it wins them | What it deliberately is NOT |
|---|---|---|---|
| **`/api/*` REST** | aggregators, autonomous agents, our own frontend, every other surface | the data: 741 curated projects, SCF history, audit corpus, EC stats, research embeddings | not a brain — returns evidence, not judgment |
| **OpenAPI spec** (`/api/openapi.json`) | codegen tools, aggregator devs | typed clients in any language in seconds; the contract | not documentation prose — that's `/scout/api-reference` |
| **SKILL.md** (`stellar-scout`) | agents that load skills (Claude Code, Codex, OpenClaw, Cursor) | orchestration + judgment: workflows (Deep Dive, SCF Pitch…), output contracts, evidence rules | not for aggregators — they encode their own orchestration; for them it's a design reference at most |
| **scout-mcp** (MCP server) | clients that can't load SKILL.md but speak MCP (Claude Desktop, ChatGPT, Gemini, Cursor MCP mode) | *reach* — tools auto-register in the human's client. It is a thin proxy **by design**; the value is distribution, not capability | not an advantage for API-capable consumers; never claim otherwise |
| **api-client** (TS SDK) | TypeScript aggregators / autonomous agents | types, error handling, zero deps — skips hand-rolled fetch wrappers | not required — the raw API works without it |
| **`/skills`, `/scout`, detail pages** | humans + SEO | discovery, trust, share-ability | not the integration path — they route to the surfaces above |
| **Distribution repos** (`Stellar-Light/*`) | `npx skills add`, npm publish | what strangers actually clone — must match the monorepo | not editable directly: monorepo is canonical, mirrors sync FROM it |

**The one-sentence answer for "why does X exist":** the API is the product; SKILL.md packages our *judgment* for skill-loading agents; the MCP buys *reach* into clients that can't load skills; the SDK buys *ergonomics* for TypeScript consumers; the spec is the *contract* everything else is generated from.

## Pre-ship gates — before ANY public surface mentions an artifact

1. **Does the target exist, right now, in public?**
   `npm view <pkg>` / `gh api repos/<owner>/<repo>` / `curl <url>`. If it returns 404, the marketing does not ship. No exceptions for "we'll publish right after."

2. **Can a stranger complete the full path?**
   Run the exact advertised command from a clean environment (`rm -rf ~/.npm/_npx` first for npx). Click the URL in an incognito window. Generate a client from the spec. *You* are not the test — a stranger with zero context is.

3. **Add it to the gate.**
   New package → `PUBLISHED_PACKAGES` in `scripts/verify-claims.ts`. New mirror → `MIRRORS`. New endpoint → `ENDPOINT_PROBES`. The CI workflow (`verify-claims.yml`) then watches it forever.

4. **Write the positioning in the PR body.**
   Three sentences: who consumes this, what it wins them over the existing surfaces, what it deliberately does not do. If you can't write them, the surface isn't ready.

5. **Run the Tyler test.**
   Name the sharpest question an expert consumer would ask about this surface, and write the honest answer down before they ask it. ("Is this just a wrapper?" → "Yes, by design — here's what the wrapper buys and who shouldn't use it.")

6. **Monorepo hygiene.**
   New top-level directory with its own `package.json` → add `<dir>/**` to root `tsconfig.json` `exclude` **in the same commit**, or the Vercel build breaks (this has happened).

7. **Contract-test new endpoints.**
   If the OpenAPI spec documents a param, the live API must accept it exactly as documented — including array serialization (`?slugs=a,b` is `explode: false`; we shipped the spec wrong once and a generated client produced 400s).

## Known sharp edges (each one cost us real time)

- **npm scoped publish:** the org must exist first (`npmjs.com/org/create`); org names are lowercase-only, no hyphens enforced inconsistently (retry if the form rejects); publish requires 2FA/OTP; `--access public` was silently ignored once — **check the package's visibility on npmjs.com after first publish**; registry propagation takes ~5 minutes.
- **Vercel serves `main`.** A merge to `dev` is not live. Claims that depend on prod behavior aren't true until the `dev → main` sync merges.
- **Distribution sync is manual.** The fine-grained PATs for `sync-scout-skill.yml` / `sync-scout-mcp.yml` were created with the wrong resource owner (personal instead of the `Stellar-Light` org) and fail with 403. Until fixed (classic PAT with `repo` scope works), every SKILL.md / scout-mcp change needs a manual push to the distribution repo — `verify-claims.ts` flags drift.
- **`new Date().getFullYear()`** beats hardcoded years in footers.

## When this doc is out of date

Update it in the same PR that changes the surface map (new package, new endpoint family, new distribution channel). A stale map is how positioning gaps happen.
