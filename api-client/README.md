# `@stellar-light/api-client`

Typed TypeScript client for the [Stellar Scout API](https://stellarlight.xyz/scout) — projects, builders, hackathons, SCF funding, audits, and research for the Stellar ecosystem.

**Zero runtime dependencies.** Native `fetch`, works in Node 20+, browsers, and edge runtimes. Types are generated from the live [OpenAPI 3.1 spec](https://stellarlight.xyz/api/openapi.json).

## Which package do I want?

| You are building… | Use |
|---|---|
| An autonomous agent or aggregator that calls the API directly | **this package** |
| A human-driven MCP client (Claude Desktop, Cursor, ChatGPT) | [`@stellar-light/scout-mcp`](https://www.npmjs.com/package/@stellar-light/scout-mcp) |
| With an agent that loads `SKILL.md` (Claude Code, Codex, OpenClaw) | `npx skills add Stellar-Light/stellar-scout` |
| Your own client from the spec | `npx openapi-typescript https://stellarlight.xyz/api/openapi.json -o scout.d.ts` |

## Install

```bash
npm install @stellar-light/api-client
```

## Quickstart

```ts
import { ScoutClient } from "@stellar-light/api-client";

const scout = new ScoutClient();

// Has anyone already built this?
const { projects, meta } = await scout.searchProjects({
  q: "stablecoin off-ramp",
  scfAwarded: true,
  limit: 5,
});
console.log(meta.matchMode, projects.map((p) => p.name));

// What's currently fundable?
const { rfps } = await scout.getRfps({ status: "open" });

// Search the research corpus (SEPs, audits, papers, SCF Handbook…)
const research = await scout.searchResearch({
  q: "SEP-24 anchor security",
  source: "audit",
});
```

## All methods

| Method | Endpoint |
|---|---|
| `getStatus()` | `GET /api/status` |
| `searchProjects(params)` | `GET /api/projects/search` |
| `searchRepos(params)` | `GET /api/repos/search` |
| `getPartners(params)` | `GET /api/partners` |
| `getHackathons(params)` | `GET /api/hackathons` |
| `getHackathon(slug)` | `GET /api/hackathons/{slug}` |
| `compareHackathons(slugs)` | `GET /api/hackathons/compare` |
| `getBuilders(params)` | `GET /api/builders` |
| `getRfps(params)` | `GET /api/rfps` |
| `searchResearch(params)` | `GET /api/research` |
| `listSkills(params)` | `GET /api/skills` |
| `getSkill(name)` | `GET /api/skills/{name}` |
| `getClusters(params)` | `GET /api/clusters` |
| `analyzeEcosystem(params)` | `GET /api/analyze` |
| `getLeaderboard(params)` | `GET /api/leaderboard` |
| `submitFeedback(body)` | `POST /api/feedback` |

All endpoints are public, read-only (except feedback), no auth, edge-cached.

## Options

```ts
const scout = new ScoutClient({
  baseUrl: "https://stellarlight.xyz", // default
  timeoutMs: 30_000,                   // default
  headers: { "x-agent-name": "my-aggregator" }, // identify yourself (appreciated!)
  fetch: customFetch,                  // testing / instrumentation
});
```

## Errors

Non-2xx responses throw `ScoutApiError` with `.status`, `.url`, and the parsed error `.body`:

```ts
import { ScoutApiError } from "@stellar-light/api-client";

try {
  await scout.getSkill("nope");
} catch (err) {
  if (err instanceof ScoutApiError && err.status === 404) {
    // handle unknown slug
  }
}
```

## Data sources behind the API

The endpoints merge: the stellarlight directory (~741 curated Stellar projects), Stellar Passport builder profiles, Electric Capital developer activity, the Soroban audit corpus (Certora, OtterSec, Halborn, OpenZeppelin, Code4rena…), SDF's skills.stellar.org catalog, lumenloop ecosystem data, and primary research (SEPs, Mazières SCP paper, dev docs, SCF Handbook) — 4,541 embedded chunks searchable via `searchResearch`.

## Regenerating types

Types live in `src/schema.ts`, generated from the live spec:

```bash
pnpm generate
```

## License

MIT — [stellarlight.xyz](https://stellarlight.xyz)
