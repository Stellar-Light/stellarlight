# `@stellar-light/scout-mcp`

> Stellar Scout, as an MCP server. Use it in Claude desktop, Cursor, ChatGPT, Gemini, Cline, Continue, Zed, or any [Model Context Protocol](https://modelcontextprotocol.io) client.

Exposes 19 tools that wrap [stellarlight.xyz](https://stellarlight.xyz)'s public APIs — the same data that powers the [`stellar-scout`](https://stellarlight.xyz/scout) skill, available as native callable functions for any MCP-compatible AI client.

```
npx @stellar-light/scout-mcp
```

---

## What you can ask

**Research, audits, and primary sources**

> *"What audit findings have been reported for Blend's oracle?"*
> Calls `search_research` with `source=audit`. Returns severity-tagged chunks citing Certora / OtterSec / Halborn audits with inline finding IDs.

> *"How does Stellar's developer count compare to other L1s?"*
> Calls `search_research` with `source=ec-developer-report`. Returns Electric Capital data for 2019–2023.

**Project discovery + idea validation**

> *"Has anyone built a stablecoin off-ramp for Africa on Stellar?"*
> Calls `search_projects`. Returns ranked projects with SCF status, hackathon placement, and a tiered match-mode signal so you know how confident the result is.

> *"What's the most crowded category on Stellar right now?"*
> Calls `get_clusters`. Returns log-scaled crowdedness scores 1–10 across categories.

> *"Show me the Stellar repos / open-source code for zk proofs."*
> Calls `search_repos`. Returns ~1,900 indexed GitHub repos ranked by repoScore (freshness + traction + hackathon/SCF/builder authority), with synonym expansion and a language filter.

**Hackathons + SCF prep**

> *"Are there any open Stellar hackathons I can enter?"*
> Calls `get_hackathons` with `status=upcoming`. Returns curated + DoraHacks events; falls back to BuildOnStellar / stellarlight / DoraHacks live channels when zero match.

> *"Compare Stellar Hacks: Agents vs the Chile Ideatón."*
> Calls `compare_hackathons`. Returns side-by-side with delta notes (prize spread, hacker count, prize per winner).

**SCF RFPs**

> *"Is there an open SCF RFP for a real-time price API?"*
> Calls `get_rfps` with `status=open`. Returns quarter-aware list with the active SCF round flagged.

**Macro ecosystem**

> *"What's Stellar's total SCF-distributed funding to date?"*
> Calls `analyze_ecosystem`. Returns rollup analytics across hackathons + projects + funding rounds.

---

## Install

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "stellar-scout": {
      "command": "npx",
      "args": ["-y", "@stellar-light/scout-mcp"]
    }
  }
}
```

Restart Claude Desktop. The 19 Scout tools appear in the slash-menu.

### Cursor

In your Cursor MCP config (`Cursor Settings → MCP`):

```json
{
  "mcpServers": {
    "stellar-scout": {
      "command": "npx",
      "args": ["-y", "@stellar-light/scout-mcp"]
    }
  }
}
```

### ChatGPT (custom GPT)

Use the [official MCP connector for ChatGPT custom GPTs](https://platform.openai.com/docs/mcp) and point it at this package. Same npx command.

### Continue, Cline, Zed, and others

Any client that follows the MCP spec works. Point them at `npx -y @stellar-light/scout-mcp`.

### Self-hosted (optional)

```bash
git clone https://github.com/Stellar-Light/scout-mcp
cd scout-mcp
pnpm install
pnpm build
# point your client at:  node /path/to/scout-mcp/dist/index.js
```

---

## Tools

All 19 tools wrap stellarlight.xyz public APIs. They're rate-limited but require no API key.

| Tool | What it does |
|------|--------------|
| `search_research` | Vector search over the 4,541-chunk Stellar research corpus (SEPs, SCF Handbook, dev docs, papers, lumenloop, audits, EC reports). Use `source=audit` for security, `source=ec-developer-report` for ecosystem stats. |
| `get_hackathons` | List curated Stellar hackathons + live DoraHacks events. Status-scoped queries include fallback channels when empty. |
| `get_hackathon` | One hackathon's full detail (submissions, winners, prize tracks, status funnel). |
| `compare_hackathons` | Side-by-side comparison of 2–5 hackathons with delta notes. |
| `get_builders` | Stellar Passport builder directory (GitHub contributors). Filter by location or skill. |
| `get_people` | SDF team/people index — leadership, board of directors, advisors (name → role → org). Filter by `q` or `section`. |
| `search_projects` | Prior-art / competitor lookup across 741+ curated projects. Tiered match-mode (strict → loose → majority) surfaced in `.meta.matchMode`. |
| `search_repos` | Code-reference index: ~1,900 indexed-and-scored Stellar GitHub repos ranked by repoScore. Synonym expansion + `language` / `minScore` filters. The repo layer beneath the project directory. |
| `explain_repo` | Architectural explainer for one Stellar GitHub repo — structure, entry points, and key modules. |
| `get_rfps` | Open + closed Stellar RFPs (SCF-funded sponsor briefs). Quarter-aware. |
| `list_skills` | Catalog of [skills.stellar.org](https://skills.stellar.org)'s 7 official skills. |
| `get_skill` | Full content of one SDF skill. |
| `get_leaderboard` | Ecosystem dev activity (28-day active devs, commits, peer L1 comparison). |
| `get_status` | Scout API health + freshness per data source + endpoint enumeration. |
| `submit_feedback` | In-skill feedback loop. Lands in stellarlight's curator queue. |
| `get_clusters` | Project topic clusters with log-scaled crowdedness scores 1–10. |
| `analyze_ecosystem` | Cross-event analytics rollup (hackathons + projects + funding + status funnel). |
| `get_partners` | Curated ecosystem partner directory — vetted providers to hire or integrate (audit firms, anchors, on/off-ramps, infrastructure, tooling, wallets). Filter by `type` / `sector` / `region` / `q`. |
| `get_changelog` | Contract-change feed — recent additions/changes to the Scout API so agents can detect drift. |

---

## Configuration

Optional environment variables:

```
SCOUT_API_BASE       # API base URL (default: https://stellarlight.xyz)
SCOUT_USER_AGENT     # User-Agent sent on each call (default: stellar-scout-mcp/1.0.0)
```

Useful for local dev when running stellarlight against `http://localhost:3000`.

---

## Companion: `Stellar-Light/stellar-scout`

This MCP server is for clients that speak MCP. If you're in Claude Code, Codex, OpenClaw, Cursor (skills mode), or any agent that loads `SKILL.md` files, install the SKILL.md instead:

```bash
npx skills add Stellar-Light/stellar-scout
```

Both surfaces hit the same backend.

---

## License

MIT. Built as a public good for Stellar builders by [stellarlight.xyz](https://stellarlight.xyz).

---

## Links

- [stellarlight.xyz/scout](https://stellarlight.xyz/scout) — the Scout landing page
- [GitHub: Stellar-Light/stellar-scout](https://github.com/Stellar-Light/stellar-scout) — the SKILL.md mirror
- [skills.stellar.org](https://skills.stellar.org) — SDF's 7 official Stellar skills
- [Model Context Protocol](https://modelcontextprotocol.io) — the spec this implements
