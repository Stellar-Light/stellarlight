# Weak-basis dormant rows — 2026-09-06

104 Live rows rest on a weak status basis (`site-liveness`, `source-inherited`,
`unverified`) while every repository linked to them has been silent for over a
year. Repo staleness is not death, so each row was re-probed at the product's
own surfaces: its site (rendered in a browser when the HTML is a mount div),
its store listing, its GitHub org.

**Verdicts: 64 alive · 35 could not be read · 11 dead (8 applied, 3 held).**

## The instrument was wrong first

A first pass called 15 rows dead. Eleven were false: the probe did not follow
308 redirects, so a permanent redirect came back as a 0-byte page. `eiger.co`,
`hatom.com`, `wombat.exchange`, `bitwage.com`, `tucambio.app`, `k3-labs.com`,
`siborg.io`, `coalapay.org`, `elementpay.net`, `mojoflower.io` and
`smartdeploy.dev` are all live sites that redirect. A twelfth, a 503 on a Heroku
dyno, is a server failing rather than a product ending. Both classes are fixed
in the probe: 3xx is followed, 5xx is no verdict, and a DNS failure is
distinguished from a TLS or timeout failure.

## Applied — affirmative deaths, each with a receipt

| row | evidence | note |
|---|---|---|
| sorosplits | GoDaddy "is for sale", $399 | SCF #19 + #23, $153,700 |
| sorodrop | GoDaddy "is for sale", $599 | |
| soroban-pulse | "has expired and is parked free, courtesy of GoDaddy.com" | |
| qolaq | qolaq.org 404; qolaq.com redirects to a parked lander | SCF #13, $150,000 |
| stellarpay | stellarpay.io does not resolve (NXDOMAIN) | newest repo commit 2019-10-07 |
| 0xauth | 0xauth.co does not resolve (NXDOMAIN) | |
| digicus | digicus.dev 404 after redirects | newest repo commit 2021-11-23 |
| soroban-optimistic-oracle | its only URL is a GitHub repo that 404s | |

The three parked domains serve their evidence only after JavaScript runs; a
plain fetch sees a redirect stub. They were read in a browser, and the receipts
cite the `/lander` redirect that is present in the raw markup.

## Held for the owner — a judgment, not a dead domain

- **ramm** — ramm.ai is live but is now "Popupz.ai … Launching soon" with a
  waitlist, an AI marketspace. The Stellar retail AMM the row describes is gone;
  the company is not. Its repo `jamiels/ramm.ai` exists and last moved
  2024-04-16. SCF #22, $38,500. Receipt captured.
- **sorosan** — sorosan-dapp.vercel.app serves an unmodified Next.js template
  ("Create Next App", body text "poc for. h1 bc"). The org's nine repos all
  stopped in February 2024. This reads as never-shipped rather than
  withdrawn. SCF #20, $29,000. Receipt captured.
- **venerez** — venerez.com follows a redirect chain onto a Gandi registrar
  placeholder, but the chain did not reproduce cleanly on a second run. Left as
  could-not-check rather than asserted.

`bigger` also has a fresh receipt (Gandi's "biggertech.co is unavailable") but
is already in the pending next-100 queue, so it is not duplicated here.

## Could not be read — 35 rows

Rows whose site is client-rendered and whose data plane could not be reached,
or which carry no website at all (`paysapp`, `blocknify`, `derisk`, `art-club`,
`planet-pay`, `bebop`, `keizai`, `transfuse`, `sorostarter`, `freelii`), plus
`okashi.dev`, `assetdesk.xyz` and `ortege.ai`, which resolve but refuse every
connection variant tried. None of these is evidence of anything and none was
moved.

## Two relevance questions, separate from liveness

- **hatom-protocol** — live, and its own title reads "The First Liquidity
  Protocol on MultiversX". Whether it belongs in a Stellar directory is a
  scoping question, not a status one.
- **wombat** — live multi-chain DEX defaulting to BNB Chain across 26+ chains.
  Same question.
