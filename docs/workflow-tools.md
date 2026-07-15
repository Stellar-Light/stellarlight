# Workflow tools — token efficiency

Adopted from Tyler van der Hoeven (@kalepail)'s 2026-07-15 stack for cutting
agent token burn ("I've burned around 15b tokens… installing: headroom /
caveman / ponytail"). Three tools, three different jobs — with the honest fit
for _our_ stack (Vercel-serverless Next.js/Payload app + the Scout API/MCP data
layer that Raven consumes).

## 1. ponytail — write less code · **install this**

Claude Code plugin ([DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail),
83.8k★, MIT). A ruleset that forces the simplest solution that works: YAGNI,
stdlib first, no unrequested abstractions. Its own agentic benchmark (a real
Claude Code session editing a real FastAPI+React repo): ~46% of baseline LOC,
~78% of the tokens, with safety guards held.

Install is **per-user, one time** — Claude Code's first plugin install is
interactive and can't be auto-installed from committed settings (and we
gitignore `.claude/`, so there's nothing to commit anyway). Run these as two
separate prompts in Claude Code:

```
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```

Needs `node` on PATH (two tiny lifecycle hooks). Why us: it's the mechanical
guard against over-building — the exact "you're doing too much" pattern we keep
catching in our own diffs.

## 2. caveman-shrink — compress MCP tool catalogs · opt-in, **not on our own MCP**

[`caveman-shrink`](https://github.com/JuliusBrussee/caveman) (npm, MIT, v0.1.0)
is a stdio MCP proxy that shrinks the `description` prose in an upstream MCP's
tool catalog (`tools/list`), preserving code/URLs/paths. It does **not** touch
tool-call _results_. Wrap a genuinely verbose third-party MCP:

```jsonc
// .mcp.json — example: shrink a bulky third-party catalog
{ "mcpServers": { "fs-shrunk": {
  "type": "stdio", "command": "npx",
  "args": ["caveman-shrink", "npx", "@modelcontextprotocol/server-filesystem", "/path"]
}}}
```

**Do not wrap our own `@stellar-light/scout-mcp`.** Its tool descriptions are the
deliberately-tuned Raven routing surface (≤600 chars, routing-tested by the
`routing-surface-check`). Compressing them would degrade the very thing we
tuned. Use caveman-shrink only where catalog tokens actually hurt — and treat it
as experimental (pre-1.0).

## 3. headroom — compress tool/DB/RAG outputs · Scout-product follow-up, **needs a vendor call**

[`headroom-ai`](https://www.npmjs.com/package/headroom-ai) (npm, Apache-2.0,
v0.22.4) — `compress(messages, { model })` cuts input tokens on large payloads,
"aggressive but reversible" (compressed content is cached; a `headroom_retrieve`
tool fetches the original when needed). SDK adapters exist for the
Anthropic/OpenAI/Vercel AI SDKs.

The catch: `compress()` **requires a running `headroom proxy` OR a Headroom
Cloud API key** — it is _not_ self-contained. For our Vercel-serverless Scout
API that means one of:

- **Self-host the proxy** — run `headroom proxy` as its own always-on service and
  point `headroomMiddleware({ baseUrl })` at it. Keeps data in-house; adds infra.
- **Headroom Cloud** — an API key; simplest, but Scout response data transits an
  external service (privacy + latency + cost + a third-party dependency in the
  request path).

Highest-leverage target if adopted: compress the large payloads Scout returns
(`search_projects` / `search_repos` / `search_research`) before they reach
Raven, so agents burn fewer tokens on our data — a real differentiator.
**Blocked on an owner decision:** pick proxy-vs-cloud (account/key creation is
the owner's, not Claude's). Until then, our own `?fields=` selection (planned)
is the self-contained lever with zero external dependency.
