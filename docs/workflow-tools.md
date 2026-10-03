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

## 4. Jev: typed decisions over our data · **wired in, needs a gateway key**

[Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) is
TypeSafe AI's typed-decision model, released 2026-09-15 and served through
Vercel AI Gateway as `typesafe-ai/jev`. It is not a chat model. It reads one
block of state and answers typed questions (boolean, a choice of up to 255
options, or a score), each with a calibrated probability. It costs about $0.04
per million input tokens with free output and answers in 70 to 500 ms. It
cannot return free text, so it cannot invent a name or a URL.

It fits the decisions in our pipeline that a regex gets wrong and a human
makes too slowly.

- **What a project's website actually shows.** Wired in as
  `scripts/eval/jev-eval.ts --task page` (client: `src/lib/jev.ts`).
  `classifyPage` settles parked, spam and scaffold pages and calls the rest
  "product" or "unknown". Jev reads the page against the record and answers
  product, shut down, parked, unrelated or placeholder, plus whether the page
  is about the same project. It is measured first against pages a human
  already judged. The regex baseline on 2026-10-03 read 178 labeled pages and
  caught 16 of 28 bad sites with 6 false alarms (57% recall, 73% precision).
  Its misses are what Jev is for: a betting site in Chinese, a "Page not
  found" page, company sites whose Stellar product is gone. Most of its false
  alarms are rebrands to a new domain, which the same-project answer settles.
- **Which project types fit.** Wired in as `--task types`: one yes or no per
  type for each of the 25 types, scored against 129 rows a human typed (50
  exact type sets, 79 added types). Review mode lists published rows where
  Jev confidently disagrees with the stored types.
- **Does a repo build on Stellar.** Wired in as `--task repos`: Jev reads a
  repo's README, description and topics. It is scored against the code scan's
  proof and compared with the keyword gate that admits repos from multi-chain
  orgs. The gate's baseline on 2026-10-03, 205 repos: 43 of 105 code-proven
  Stellar repos found (41% recall), 17 false alarms (72% precision).
- **Next uses, same pattern.** Whether two records are one product (duplicate
  rows inflate the listed and launched counts) and whether a linked GitHub org
  is this project's code.

Rules. A Jev answer is a triage signal: it routes a row to review or decides
between two readings we already have. It never writes over curated data and
never flips a status by itself. An answer below the confidence bar (default
0.9) reads "unknown". Every new use is measured on labeled data before it
goes live.

Setup (owner). Create an AI Gateway key in the Vercel team (AI Gateway, API
keys), store it with `gh secret set AI_GATEWAY_API_KEY -R
Stellar-Light/stellarlight`, then dispatch "Jev evals (manual)" in eval
mode, once per task. What leaves our infrastructure: a project's name, short description
and website, and the first 1.5 KB of that public page's text. No database
content and no user data.
