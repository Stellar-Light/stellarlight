---
title: "the state of stellar — h1 2026"
slug: state-of-stellar-h1-2026
author: StellarLight
excerpt: "889 active projects, $40.7m in scf grants, 2,070 active devs. a data-driven map of what's being built on stellar, who's funding it, and who's shipping — measured live from the stellarlight index, not a slide deck."
category: ecosystem
tags: ecosystem-map, data, scf, developers, stellar
featured: true
contentType: markdown
---

# the state of stellar — h1 2026

most people can't tell you how big stellar's builder ecosystem actually is. the numbers exist, they're just scattered across airtable, github, scf rounds, and a dozen dashboards that don't talk to each other. stellarlight pulls them into one index. this is the first read off it.

everything below is live. every number is one api call away — no screenshotting a spreadsheet and calling it research. where a figure is a running total or carries a caveat, we say so.

## the numbers

| metric | value |
|---|---|
| active projects | **889** |
| scf-funded projects | **400** |
| total scf distributed (cumulative) | **$40.7m** |
| mean scf award | **$101,842** |
| indexed repos | **2,301** |
| active devs (28d) | **2,070** |
| commits (28d) | **43,207** |
| hackathons tracked | **12** (11 done) |
| hackathon prize pool | **$97k** |
| registered hackers | **2,717** |

*source: `/api/analyze`, `/api/status`, electric capital snapshot. queryable at stellarlight.xyz.*

## where the building actually happens

stellar gets typecast as "payments." the project mix says otherwise. across 889 active projects, apps lead on volume and dollars — but the capital concentrates per-project in protocols and infra.

| category | projects | scf-funded | scf $ | avg $ / funded |
|---|---:|---:|---:|---:|
| user-facing app | 350 | 168 | $16.9m | $100.6k |
| infrastructure | 195 | 80 | $8.0m | $100.3k |
| tooling | 161 | 71 | $6.2m | $88.0k |
| protocol / contract | 130 | 70 | $8.3m | $118.1k |
| asset | 32 | 5 | $0.22m | $44.2k |
| anchor | 19 | 5 | $1.07m | $214.4k |
| partner integration | 2 | 1 | — | — |

the read:

1. **apps run the ecosystem by count.** 350 projects, 39% of everything active, and the biggest single slice of scf money ($16.9m). this is wallets, payment apps, consumer products — the surface builders and users actually touch.
2. **protocol work is where the money gets serious.** 130 projects, but the highest average grant of any large category at $118k. shipping soroban logic on-chain costs more and carries more risk than shipping a front end, and the funding reflects it.
3. **anchors are rare and expensive.** only 19 indexed, but the fattest average award on the board — $214k. moving real money on and off stellar is a regulatory and integration grind, and it prices like one.

## scf is the engine, not a subsidy

the community fund has put out a cumulative **$40.7m across 400 projects**, averaging **$101,842** a grant. that's not spread evenly — apps, protocols, and infra soak up ~82% of every dollar.

here's the part builders should sit with: **~45% of all active indexed projects have taken scf money** at some point (400 of 889). scf isn't a fringe grant program on stellar. it's the dominant capital source for the on-chain builder base. if you're building here, funding is a path, not a lottery ticket.

> the $40.7m is a running cumulative total across all historical scf rounds, not a single quarter. per-round breakdowns are getting wired into the index and land in a dedicated scf funding report later in this series.

## developers are the leading indicator

grants and project counts tell you what already happened. commits tell you what's happening. latest electric capital snapshot in the index:

- **2,070 active devs** in the trailing 28 days
- **1,204 stellar-focused, 866 multichain** — a healthy split, because multichain devs are how new patterns get dragged into the ecosystem
- **43,207 commits** in the same window

the 2,301 repos stellarlight indexes and scores are a second, independent lens on the same activity — and they power the live [dev-activity leaderboard](https://stellarlight.xyz/leaderboard), which ranks projects by recent commits, stars, and issues.

## hackathons are the top of the funnel

hackathons are where most builders touch stellar first. the index tracks **12 events** (11 done, 1 live), **$97k in prizes**, and **2,717 registered hackers**. winners now carry a numeric placement, so "who won kale x reflector" is a lookup, not a guessing game.

the question that actually matters — *how many hackathon projects become funded, maintained products?* — is exactly what a data layer should answer. wiring that built → in-progress → abandoned funnel is in flight, and it anchors a dedicated hackathon-to-product report in this series.

## how we counted

no black boxes. all of it is live right now:

- ecosystem rollups → `stellarlight.xyz/api/analyze`
- source freshness + sizes → `stellarlight.xyz/api/status`
- the whole machine-readable spec → `stellarlight.xyz/api/openapi.json`

two honest caveats. "active projects" (889) means live / pre-release / development status, and it intentionally differs from the full indexed collection (918), which includes inactive entries — we never merge the two without labeling. and dev counts follow electric capital's method (≥1 commit to a stellar repo in the trailing 28 days), refreshed on a snapshot cadence, not real-time.

---

*report #1 in the stellarlight ecosystem series. next: the **stellar defi landscape** and a dedicated **scf funding analysis**. all of it comes off the same live index that runs stellarlight.xyz. want the raw data? it's an api call away.*
