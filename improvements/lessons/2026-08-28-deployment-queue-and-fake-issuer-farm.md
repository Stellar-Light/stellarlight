# Lessons — 2026-08-28: the deployment queue pass and the fake-issuer farm

## 1. A fake-issuer farm is squatting institutional RWA tickers on mainnet

Working the sls-079 deployment queue, every single on-chain issuance of
WTGXX (WisdomTree) and USTBL/EUTBL (Spiko) turned out to be fake. Ten+
issuer accounts, with home_domains built to deceive: `treasury.dtcc.company`,
`stellar.dtcc.network`, `xrpl.dtcc.markets` (DTCC impersonation),
`wisdomtree.xlmhq.org`, `rwa.stellarsynth.org`, `lumenvaultx.org`,
`rwa.spacexai.money`, `xminthub.com`, `rwastellar.org`. One fake WTGXX has
98 trustlines — those are victims. stellar.expert has NO curated record for
WTGXX and its only USTBL record is one of the fakes (community rating 3.2!).

**The class:** an asset_code match on Horizon proves nothing. The only
verification chain that counts: operator artifact (their own
`/.well-known/stellar.toml`, or their docs) → declared issuer → that EXACT
issuer's asset on Horizon. The reverse chain also works: issuer account's
own `home_domain` pointing at the operator's real domain.

**The near-miss that proves the trap:** my first Horizon guess for Ondo's
USDY issuer shared the first 12 characters with the toml-declared real one
(`GAJMPX5NBOG6HNT…` fake vs `GAJMPX5NBOG6TQF…` real). Prefix matching is
not matching.

**Follow-up worth building:** a detector for lookalike home_domains against
our directory's project domains (levenshtein/subdomain-stuffing on brand
names), feeding the improvement ledger.

## 2. Our own prose is not deployment evidence either

Two directory descriptions assert mainnet deployments ("RedStone … live on
Stellar/Soroban mainnet (since March 2026)", "CCTP, live on Stellar since
May 2026"). For CCTP the primary artifact existed (Circle's references page
+ contracts live on public). For RedStone none was findable (support docs
and an audited connector exist; no mainnet feed contract citable anywhere).
CCTP got stamped; RedStone stayed unknown — the description now disagrees
with the deployment field, which is exactly the honest state: the FIELD is
evidence-only, and prose that can't be backed stays un-promoted. The sls-079
rule applies to us too.

## 3. Quickstarts lie about networks

Circle's Stellar quickstart embeds TESTNET contract ids with no network
label; their references page carries the real mainnet ones. Citing the
first page found would have stamped mainnet off testnet contracts. Every
contract cited in a receipt must be confirmed to EXIST on the public
network (stellar.expert 404 = it does not).

## Outcome

13-row queue: 7 stamped mainnet with receipts (ondo, stronghold, brale,
glo-dollar, axelar, circle-cctp, stellarterm) · 6 stay unknown with recorded
reasons (dia, redstone-finance, wisdomtree, spiko, redswan, spacewalk).
