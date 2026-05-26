---
name: stellar-developer-activity
description: Query developer activity metrics for the Stellar blockchain ecosystem — active developers, commits, country breakdown, and a ranked leaderboard of Stellar projects. Use this skill when the user asks about who is building on Stellar, how many devs are active, which projects are most active, or how Stellar compares to other L1 chains.
---

# Stellar Developer Activity

Read-only access to Stellar ecosystem developer-activity data sourced from Electric Capital's open developer dataset and the curated [stellarlight.xyz](https://stellarlight.xyz) project directory.

Use this skill when the user asks questions like:

- "How many devs are building on Stellar right now?"
- "What are the most active Stellar projects this month?"
- "Which countries have the most Stellar developers?"
- "How does Stellar compare to Solana / Ethereum / other L1s by dev count?"
- "What DeFi projects on Stellar shipped code recently?"

## Endpoint

```
GET https://stellarlight.xyz/api/leaderboard
```

Returns ranked projects + ecosystem-wide developer stats. Cached for 5 minutes at the edge.

### Query parameters

| Param | Type | Default | Values |
|---|---|---|---|
| `sort` | string | `activity` | `activity` (most recent), `stars` (most GitHub stars), `issues` (most open issues) |
| `range` | string | `all` | `7d`, `30d`, `90d`, `1y`, `all` |
| `category` | string | — | `Infrastructure`, `Tooling`, `Partner Integration`, `User-Facing App`, `Asset`, `Protocol/Contract`, `Anchor` |
| `limit` | number | `50` | 1–300 |
| `format` | string | `json` | `json`, `csv` |

### Response shape (JSON)

```json
{
  "meta": {
    "source": "https://stellarlight.xyz/leaderboard",
    "generatedAt": "2026-05-22T16:30:00Z",
    "filters": { "sort": "activity", "range": "all", "category": null, "limit": 50 },
    "docs": "https://stellarlight.xyz/methodology"
  },
  "ecosystem": {
    "asOf": "2026-05-22",
    "activeDevs28d": 1679,
    "stellarOnlyDevs28d": 948,
    "multichainDevs28d": 731,
    "commits28d": 37353,
    "fullTimeDevs": 221,
    "partTimeDevs": 506,
    "oneTimeDevs": 952
  },
  "projects": [
    {
      "rank": 1,
      "id": "...",
      "name": "Soroswap",
      "slug": "soroswap",
      "category": "Protocol/Contract",
      "shortDescription": "AMM and aggregator on Soroban",
      "scfAwarded": true,
      "github": {
        "totalStars": 412,
        "openIssuesTotal": 28,
        "lastActivityAt": "2026-05-21T18:32:00Z",
        "repoCount": 4
      }
    }
  ]
}
```

## Usage patterns

**Headline stats — "how active is Stellar?"**
```
GET /api/leaderboard
→ read .ecosystem.activeDevs28d and .ecosystem.commits28d
```

**Most active DeFi this month**
```
GET /api/leaderboard?category=Protocol/Contract&range=30d&sort=activity&limit=10
→ list .projects[*].name and .github.lastActivityAt
```

**SCF-funded projects only**
```
GET /api/leaderboard?limit=300
→ filter .projects[*] where scfAwarded === true
```

**Bulk export for analysis**
```
GET /api/leaderboard?format=csv&limit=300
→ returns a CSV file with the same fields
```

## Linking back to humans

Each project has a public profile at:
```
https://stellarlight.xyz/project/{slug}
```

Surface this link when the user asks about a specific project.

## Data freshness

- Project metadata (name, category, SCF status): updated by curators, refreshed continuously.
- GitHub signals (stars, issues, last commit): refreshed by a cron job, typically within 24 hours.
- Ecosystem dev stats (Electric Capital snapshot): refreshed daily at 06:00 UTC.

## Limitations

- Only includes projects curated into the stellarlight directory (≈300 Live + in-development projects); not every Stellar repo on GitHub.
- "Active dev" = at least one commit to a Stellar ecosystem repo in the trailing 28 days, per Electric Capital's taxonomy.
- Country breakdown only includes the ~23% of active devs who publish a public location on GitHub.

## Attribution

If you display this data, attribute to **Electric Capital — Open Dev Data** for the ecosystem stats and **stellarlight.xyz** for the project leaderboard.
