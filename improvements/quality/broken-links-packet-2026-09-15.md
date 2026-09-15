# Broken links — verified packet, 2026-09-15

The 18 links `check-links` proves broken (404/410/DNS-refused), each traced to
the row and field that carries it, re-probed today, and paired with a
replacement where one exists and could be confirmed.

Nothing here touched the database. Every verdict below is a fresh probe, not a
copy of the detector's output: DNS resolution checked separately from HTTP,
redirects followed, and `bot-protection`, `timeout` and 5xx excluded entirely —
they are not verdicts (see the "27 runs" group in the detector's own output,
which is deliberately left alone).

These findings have been open since **2026-09-06** and still reproduce.

## The correction that changed this packet

The first pass of this used `host` for the DNS check and reported
`github.com` as NXDOMAIN — it would have recorded nine false deaths. Every
verdict here comes from `socket.getaddrinfo` instead, and the GitHub URLs are
now correctly classified as resolving-but-404.

## Entity links — a replacement exists and was confirmed

The page title names the organisation, so these are moves rather than deaths.

| entity | current (broken) | proposed | confirmed by |
|---|---|---|---|
| `stellar-expert` | `https://reflector.world/` (NXDOMAIN) | `https://stellar.expert` | title "StellarExpert \| Stellar XLM block explorer and analytics platform" |
| `eq-lab` | `https://slender.fi/` (NXDOMAIN) | `https://eqlab.io` | title "EQ LAB – Web3 & blockchain development" |
| `clickpesa` | `https://clickpesadebtfund.com/` (NXDOMAIN) | `https://clickpesa.com` | title "Payment Solutions for Microfinance & SMEs — Tanzania" |

`stellar-expert` is the one worth doing first. The entity is the organisation
behind `albedo` and `reflector` — its own linked projects — so the links are
not a different company's, they are one product's dead domain standing in for
the org. The project row for `reflector` already moved to
`reflector.network`; the entity never followed.

## Entity links — a replacement is plausible but is a judgement call

| entity | current (broken) | candidate | why it needs a human |
|---|---|---|---|
| `borderless` | `github.com/elsa-care` (404) | `https://elsa.care` | live, titled "Elsa Care Technologies — Payments technology", and the dead github org is `elsa-care` — but the entity is named **Borderless**, so this is a rename claim, not a link fix |
| `techfiesta` | `https://techfiesta.dev/` (NXDOMAIN) | `https://www.ekolance.io` | live, titled "Get A Job In Blockchain \| Ekolance", and the entity's github is `Ekolance-Official` — but techFiesta is Ekolance's hackathon brand, so pointing the entity at the parent is a decision |
| `jet-protocol` | `github.com/jet-lab/polaris` (404) | `https://github.com/jet-lab` (200) | the org exists, the repo does not; dropping to the org loses the specific attribution |
| `wallet-guru` | `github.com/WalletGuruLLC/paystreme` (404) | `https://github.com/WalletGuruLLC` (200) | same shape |

## No replacement found — removal is the honest action

| owner | field | url | verdict |
|---|---|---|---|
| `entities/xycloo` | website | `https://stex.xycloo.com/` | NXDOMAIN (`xycloo.com` itself does not answer either) |
| `entities/eiger` | website | `https://nebula.eiger.co/` | HTTP 404 (`eiger.co` 308s to something this client cannot read — needs a look by hand) |
| `projects/gameduk` | website | `https://gameduk.com` | NXDOMAIN |
| `projects/deb` | website | `https://demo.drivedeb.com` | NXDOMAIN |
| `partner-accounts/anchor-ping` | websiteUrl | `https://letsping.com` | HTTP 404 |
| `builders/6a9a5e6d…` | website_url | `https://padparadscho.com` | HTTP 404 |
| `builders/6a2a4efa…` | github_username | `github.com/gustavo-f0ntz` | HTTP 404 |
| `builders/69d19a83…` | website_url | `https://blaqshyd.me` | NXDOMAIN |
| `builders/69d19a82…` | website_url | `https://www.grupoamonet.com.br` | NXDOMAIN |

## Already handled, listed so nobody re-opens them

`projects/chainatlas` (`chainsatlas.com`, 404) and
`projects/soroban-optimsitic-oracle` (`github.com/stackman27/soroban-opt-oracle`,
404) still carry dead links, and both look like unfixed duplicates — but each
has a sibling row that WAS repaired (`chainsatlas` and
`soroban-optimistic-oracle`, both with the dead value already cleared), and
both of the unrepaired rows are Draft or Inactive, so neither is served to a
reader. `WEBSITE_REMOVE_DEAD` targeted the repaired sibling in each case.

Checked while here: all 49 keys in `WEBSITE_REMOVE_DEAD` resolve to a live
project row — no stale keys. And among the 890 publicly visible projects there
are **no** punctuation-identical slug duplicates and exactly one near-identical
pair, `mercury` / `mercuryo`, which are different companies.

## Applying

Website fixes go through `WEBSITE_FIXES` in `scripts/data/curation-maps.ts`,
removals through `WEBSITE_REMOVE_DEAD`, github removals through
`GITHUB_LINK_REMOVE` — then `.github/workflows/curate-projects.yml`, dry run
first, then execute, then read the row back.

Those maps are keyed by PROJECT slug. Nine of the eighteen sit on entities,
builders or partner-accounts, which have no equivalent map, so they need either
a new map or a hand edit. That gap is the reason these have been open for nine
days: the detector proves them daily and the repair path only covers projects.
