# Idea: remote Scout MCP on Cloudflare Workers

Projects from: the "why aren't we on Workers like Tyler" question
(2026-08-13) — answered honestly: our data layer (Payload + Atlas vector
search + 15-60min Actions pipelines) doesn't fit Workers and shouldn't
move. But ONE piece of his pattern fits us exactly: the agent-facing edge.

**What**: a remote MCP endpoint (`mcp.stellarlight.xyz`) — a small
stateless Worker speaking the MCP streamable-HTTP transport, exposing the
same ~20 tools as @stellar-light/scout-mcp, each proxying our public API.
No DB access, no state, no secrets beyond an optional per-consumer key.

**Why**:
- Hosted agents and institutions increasingly want a remote MCP URL, not
  a local npx process — Raven's codemode MCP is exactly this shape, so
  the integration story becomes symmetric ("add our MCP URL" vs "install
  our package").
- Workers' strengths (instant cold start, global edge, ~zero cost at our
  volume) apply fully to a thin proxy; none of its weaknesses (no Mongo
  driver, CPU-time caps) apply.
- Per-consumer keys on the Worker give us the usage attribution and rate
  tiers the institutional trajectory wants, without touching the core API.

**How (v1)**:
- One Worker, TypeScript, using the MCP SDK's streamable-HTTP server; tool
  schemas generated from the same source as scout-mcp (single source of
  truth — the conformance guard should assert parity).
- Tools call https://stellarlight.xyz/api/* with the Worker's UA; responses
  pass through untouched (the API's own caching/versioning does the work).
- Deploy via wrangler in CI (needs a CLOUDFLARE_API_TOKEN secret — user-
  provisioned, per the no-credential rule).
- Advertise on /scout beside the npx install once live-verified end-to-end
  through a real agent session (verify-before-advertise).

**Not in scope**: moving any existing surface off Vercel; auth beyond
simple keys; write tools.

Effort: small-medium (~200 lines + CI + parity guard). Value: the modern
integration door for exactly the consumers the institutional trajectory
predicts — and stack symmetry with the ecosystem's flagship agent.
