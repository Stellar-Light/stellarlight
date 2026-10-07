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

- **ramm** — RESOLVED 2026-09-06 by the owner: "RAMM is not related to
  stellar", removed from the directory (Draft). The evidence is kept on the row
  rather than erased, because it was not empty: SCF #22 awarded $38,500, and
  `jamiels/ramm.ai` holds real Soroban contracts (`soroban/factory`,
  `soroban/pool`) with a `@stellar/stellar-sdk` UI. Every network reference in
  it is FUTURENET, the last commit is 2024-04-16, and ramm.ai today sells
  Popupz.ai, an AI marketspace with no Stellar. A funded prototype that never
  left a test network, from a company now doing something else, is not a
  directory row.
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

## Tranche 2 — the registry gate, and a title that lied

**Package registries as product-state evidence.** For the 64 alive rows I
probed npm, crates.io and PyPI for a published release under a name the row's
own repositories carry. 31 rows matched by name; **5 survived the gate** that
requires the package to point back at one of the row's own repositories.
The 26 rejected were collisions of exactly the kind that has cost us all day —
`ripe` matched `markdoc`, `womenbiz` matched `filecoin`, `paychant` matched a
package called `stellar`, `siborg` matched `stellar-client`.

Of the five confirmed, only `rehive` has a recent release (PyPI 1.3.13,
2026-05-26). The others are 1–8 years old, which corroborates the dormancy
rather than lifting it: bidali (2019), solar-wallet (2021), sorobanmath (2024),
assemblyscript-soroban-sdk (2025).

The honest conclusion: these rows sit on a weak basis because most of these
products publish no artifact strong enough to earn a better one, not because
nobody looked. A site that loads IS site-liveness. Refusing to inflate that into
`human-verified` is the point of the tier.

**A default title is not a verdict.** `zilt`'s page title is the unedited
"Create Next App", and reading the title alone would have retired it. The page
itself sells the product: buy and sell USDC with M-Pesa and Eco-cash, on
Stellar. It moves from `unverified` to `site-liveness`, alive.

**One more retirement.** `stellar-token-launchpad`: tokenlaunchpad.eu and its
www form both redirect to cryptix.ag, the parent company's venture-building
site, which carries no launchpad product. The product has no state of its own
left to read. SCF #24, $40,000. Receipt captured.

**paychant** moves from `source-inherited` to `site-liveness` — a claim we had
never checked is now one we have.
