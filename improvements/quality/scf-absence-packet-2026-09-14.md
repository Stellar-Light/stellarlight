# SCF absences — proposed directory rows, 2026-09-14

Nine SCF **awardees** the directory does not serve, one per row, with the evidence a curator needs to accept or refuse each. Nothing here touched the database: every fact below was read from the project's own SCF page, its own website, or our public REST API. Award status comes from SCF's own submission records (`scripts/eval/scf-official.ts`), never from a round badge.

Absences source: `pnpm exec tsx scripts/eval/scf-absence-diff.ts` against production on 2026-09-14 — 514 SCF-listed projects, 981 directory records, 10 absent, all 10 SCF awardees. The tenth is not proposed here: see *Served, but its award is missing* below.

Each was checked absent **twice** — by name (`where[name][contains]`) and by registrable domain (`where[links.website][contains]`) against `/api/projects`. Both returned 0 rows for all nine.

## The nine

| # | proposed slug | name | SCF award | budget | website (HTTP 200, title) |
|---|---|---|---|---|---|
| 1 | `balance` | Balance | SCF #45 | $125,000 | [https://balance.ca/](https://balance.ca/) — Insured Digital Asset Custodian |
| 2 | `micro-be` | Micro Be | SCF #45 | $115,000 | [https://www.micro-be.com/en/entreprise.htm](https://www.micro-be.com/en/entreprise.htm) — Presentation of Micro Be, leading RFID company |
| 3 | `catlog` | Catlog | SCF #45 | $97,000 | [https://catlog.shop](https://catlog.shop) — Catlog - Manage your business without the chaos |
| 4 | `urbanflip` | UrbanFlip | SCF #45 | $120,000 | [https://urbanflip.io/](https://urbanflip.io/) — UrbanFlip Capital — Inversion inmobiliaria de precision en Madrid |
| 5 | `lunar-finance` | Lunar Finance | SCF #45 | $118,000 | [https://lunarfinance.io](https://lunarfinance.io) — Lunar Finance - Seamless cross-chain Trading and Liquidity aggregator |
| 6 | `haven` | Haven | SCF #45 | $97,000 | [https://haven.hn](https://haven.hn) — Haven \| The privacy neobank for the onchain economy |
| 7 | `enable` | Enable | SCF #45 | $76,000 | [https://www.humanity.link/](https://www.humanity.link/) — Humanity Link \| Digital Communication & Payment Platform |
| 8 | `minisend` | Minisend | SCF #45 | $100,000 | [https://minisend.xyz/](https://minisend.xyz/) — Minisend \| Stablecoin payment and settlement infrastructure |
| 9 | `bwb` | BWB Digital Assets | SCF #45 | $150,000 | [https://www.bwbi.com.br/](https://www.bwbi.com.br/) — BWB - Plataforma de Investimentos Imobiliarios |

## Per-row evidence and the proposed entry

### 1. Balance — `balance`

- **SCF page** — https://communityfund.stellar.org/project/balance-institutional-custody-and-payments-for-stellar-syw
- **Submissions on that page** — SCF #45 Panel Review ($125,000)
- **Page's own award summary** — `awarded: true`, `lastAwardedRound: 45`, `totalAwarded: $125,000`
- **Website** — https://balance.ca/ returned HTTP 200 on 2026-09-14 and the page title names the product: "Insured Digital Asset Custodian"
- **Absent from the directory** — name search and domain search both returned 0 rows

```ts
{
	slug: "balance",
	name: "Balance",
	category: "Infrastructure",
	status: "Development",
	types: ["Payments"],
	supportedNetworks: ["stellar"],
	shortDescription:
		"Balance will add institutional-grade custody and payment infrastructure for Stellar assets. The project will enable regulated financial institutions, fintechs, funds, and enterprises to securely hold XLM and Stellar-issued assets, create and manage wallets, enforce transaction policies, and move assets through Balance’s API and institutional interface.",
	links: { website: "https://balance.ca/" },
	provenance: { source: "AdminEdit" },
	statusSourceUrl: "https://communityfund.stellar.org/project/balance-institutional-custody-and-payments-for-stellar-syw",
	statusBasis: "human-verified",
	statusAsOf: "<date the owner read this packet>",
}
```

### 2. Micro Be — `micro-be`

- **SCF page** — https://communityfund.stellar.org/project/micro-be-k9o
- **Submissions on that page** — SCF #45 Information Collection ($115,000)
- **Page's own award summary** — `awarded: true`, `lastAwardedRound: 45`, `totalAwarded: $115,000`
- **Website** — https://www.micro-be.com/en/entreprise.htm returned HTTP 200 on 2026-09-14 and the page title names the product: "Presentation of Micro Be, leading RFID company"
- **Absent from the directory** — name search and domain search both returned 0 rows

```ts
{
	slug: "micro-be",
	name: "Micro Be",
	category: "Infrastructure",
	status: "Development",
	types: ["RWA", "Payments"],
	supportedNetworks: ["stellar"],
	shortDescription:
		"Problem French marinas use clonable RFID cards to distribute water and electricity to boaters, causing ~€385K in annual losses across our 11 contracted marinas. Credit purchases also depend on marina office opening hours: ~25% of high-season arrivals occur outside these hours, limiting access to utilities and representing ~€1.2M in potential annual revenue.",
	links: { website: "https://www.micro-be.com/en/entreprise.htm" },
	provenance: { source: "AdminEdit" },
	statusSourceUrl: "https://communityfund.stellar.org/project/micro-be-k9o",
	statusBasis: "human-verified",
	statusAsOf: "<date the owner read this packet>",
}
```

### 3. Catlog — `catlog`

- **SCF page** — https://communityfund.stellar.org/project/catlog-ygy
- **Submissions on that page** — SCF #45 Information Collection ($97,000)
- **Page's own award summary** — `awarded: true`, `lastAwardedRound: 45`, `totalAwarded: $97,000`
- **Website** — https://catlog.shop returned HTTP 200 on 2026-09-14 and the page title names the product: "Catlog - Manage your business without the chaos"
- **Absent from the directory** — name search and domain search both returned 0 rows

```ts
{
	slug: "catlog",
	name: "Catlog",
	category: "User-Facing App",
	status: "Development",
	types: ["Payments"],
	supportedNetworks: ["stellar"],
	shortDescription:
		"Catlog is a commerce operating system for Africa's social sellers. 2,000+ merchants across Nigeria, Ghana, Kenya, and South Africa use us to take orders, manage inventory, and collect payments from their phones. Payments remain their hardest problem. Millions of consumers in our markets hold crypto but must off-ramp to fiat before spending with local merchants.",
	links: { website: "https://catlog.shop" },
	provenance: { source: "AdminEdit" },
	statusSourceUrl: "https://communityfund.stellar.org/project/catlog-ygy",
	statusBasis: "human-verified",
	statusAsOf: "<date the owner read this packet>",
}
```

### 4. UrbanFlip — `urbanflip`

- **SCF page** — https://communityfund.stellar.org/project/urbanflip-compliant-on-chain-real-estate-co-investment-p6d
- **Submissions on that page** — SCF #45 Information Collection ($120,000)
- **Page's own award summary** — `awarded: true`, `lastAwardedRound: 45`, `totalAwarded: $120,000`
- **Website** — https://urbanflip.io/ returned HTTP 200 on 2026-09-14 and the page title names the product: "UrbanFlip Capital — Inversion inmobiliaria de precision en Madrid"
- **Absent from the directory** — name search and domain search both returned 0 rows

```ts
{
	slug: "urbanflip",
	name: "UrbanFlip",
	category: "User-Facing App",
	status: "Development",
	types: ["RWA"],
	supportedNetworks: ["stellar"],
	shortDescription:
		"Urbanflip is a live real estate co-investment platform with over $90M invested through it in the last 12 months. Each operation sits in a Spanish SPV holding legal title to one asset; verified professional investors participate as creditors via private placements.",
	links: { website: "https://urbanflip.io/" },
	provenance: { source: "AdminEdit" },
	statusSourceUrl: "https://communityfund.stellar.org/project/urbanflip-compliant-on-chain-real-estate-co-investment-p6d",
	statusBasis: "human-verified",
	statusAsOf: "<date the owner read this packet>",
}
```

### 5. Lunar Finance — `lunar-finance`

- **SCF page** — https://communityfund.stellar.org/project/lunar-finance-oir
- **Submissions on that page** — SCF #45 Information Collection ($118,000) · SCF #46 Draft
- **Page's own award summary** — `awarded: true`, `lastAwardedRound: 45`, `totalAwarded: $118,000`
- **Website** — https://lunarfinance.io returned HTTP 200 on 2026-09-14 and the page title names the product: "Lunar Finance - Seamless cross-chain Trading and Liquidity aggregator"
- **Absent from the directory** — name search and domain search both returned 0 rows

```ts
{
	slug: "lunar-finance",
	name: "Lunar Finance",
	category: "Protocol/Contract",
	status: "Development",
	types: ["DEX", "Bridge"],
	supportedNetworks: ["stellar"],
	shortDescription:
		"Lunar Finance is building the execution layer for on-chain transactions: a unified meta-aggregation platform that abstracts the complexity of fragmented liquidity across blockchains and delivers optimal trade and bridging outcomes. Our vision is to become the default infrastructure for value movement across Web3. As liquidity fragments across chains, bridges, and DEXs, inefficiencies increase.",
	links: { website: "https://lunarfinance.io" },
	provenance: { source: "AdminEdit" },
	statusSourceUrl: "https://communityfund.stellar.org/project/lunar-finance-oir",
	statusBasis: "human-verified",
	statusAsOf: "<date the owner read this packet>",
}
```

### 6. Haven — `haven`

- **SCF page** — https://communityfund.stellar.org/project/haven-privacy-first-crypto-neobank-rol
- **Submissions on that page** — SCF #45 Panel Review ($97,000)
- **Page's own award summary** — `awarded: true`, `lastAwardedRound: 45`, `totalAwarded: $97,000`
- **Website** — https://haven.hn returned HTTP 200 on 2026-09-14 and the page title names the product: "Haven \| The privacy neobank for the onchain economy"
- **Absent from the directory** — name search and domain search both returned 0 rows

```ts
{
	slug: "haven",
	name: "Haven",
	category: "User-Facing App",
	status: "Development",
	types: ["Wallet", "Payments"],
	supportedNetworks: ["stellar"],
	shortDescription:
		"Haven - privacy-first crypto neobank ------------------------------------------- Everyday banking on public blockchains, without exposing the user's financial life on a public ledger. problem Every on-chain payment exposes the payer. Anyone can look up a wallet and see salary, balances, and purchase history. solution Haven packages private, compliant payments into a product people already know how to use, a neobank.",
	links: { website: "https://haven.hn" },
	provenance: { source: "AdminEdit" },
	statusSourceUrl: "https://communityfund.stellar.org/project/haven-privacy-first-crypto-neobank-rol",
	statusBasis: "human-verified",
	statusAsOf: "<date the owner read this packet>",
}
```

### 7. Enable — `enable`

- **SCF page** — https://communityfund.stellar.org/project/enable-duq
- **Submissions on that page** — SCF #43 Panel Review Failed ($100,000) · SCF #45 Information Collection ($76,000)
- **Page's own award summary** — `awarded: true`, `lastAwardedRound: 45`, `totalAwarded: $76,000`
- **Website** — https://www.humanity.link/ returned HTTP 200 on 2026-09-14 and the page title names the product: "Humanity Link \| Digital Communication & Payment Platform"
- **Absent from the directory** — name search and domain search both returned 0 rows

```ts
{
	slug: "enable",
	name: "Enable",
	category: "User-Facing App",
	status: "Development",
	types: ["Payments", "Social Impact"],
	supportedNetworks: ["stellar"],
	shortDescription:
		"Here’s a tightened version under 1100 characters: Humanity Link is building Enable, a financial infrastructure layer designed to improve how aid and value move globally. Over the past several years, we have worked with organizations such as the Red Cross and Norwegian Refugee Council, supporting more than $70 million in aid delivery through digital communication and cash assistance systems.",
	links: { website: "https://www.humanity.link/" },
	provenance: { source: "AdminEdit" },
	statusSourceUrl: "https://communityfund.stellar.org/project/enable-duq",
	statusBasis: "human-verified",
	statusAsOf: "<date the owner read this packet>",
}
```

### 8. Minisend — `minisend`

- **SCF page** — https://communityfund.stellar.org/project/minisend-7tt
- **Submissions on that page** — SCF #45 Panel Review ($100,000)
- **Page's own award summary** — `awarded: true`, `lastAwardedRound: 45`, `totalAwarded: $100,000`
- **Website** — https://minisend.xyz/ returned HTTP 200 on 2026-09-14 and the page title names the product: "Minisend \| Stablecoin payment and settlement infrastructure"
- **Absent from the directory** — name search and domain search both returned 0 rows

```ts
{
	slug: "minisend",
	name: "Minisend",
	category: "Infrastructure",
	status: "Development",
	types: ["Payments", "Stablecoin"],
	supportedNetworks: ["stellar"],
	shortDescription:
		"Minisend is a cross-chain stablecoin settlement infrastructure for Africa. Users and businesses send USDC or USDT to a single address and settle to M-Pesa, Airtel Money, or a bank account in Kenya, Nigeria, or Ghana in seconds, with an onramp in the other direction. Minisend is live today across 26 EVM chains and solana , serving traders, freelancers, and businesses that receive cross-border payments.",
	links: { website: "https://minisend.xyz/" },
	provenance: { source: "AdminEdit" },
	statusSourceUrl: "https://communityfund.stellar.org/project/minisend-7tt",
	statusBasis: "human-verified",
	statusAsOf: "<date the owner read this packet>",
}
```

### 9. BWB Digital Assets — `bwb`

- **SCF page** — https://communityfund.stellar.org/project/bwb-brazilian-real-estate-yields-on-stellar-zab
- **Submissions on that page** — SCF #45 Panel Review ($150,000)
- **Page's own award summary** — `awarded: true`, `lastAwardedRound: 45`, `totalAwarded: $150,000`
- **Website** — https://www.bwbi.com.br/ returned HTTP 200 on 2026-09-14 and the page title names the product: "BWB - Plataforma de Investimentos Imobiliarios"
- **Absent from the directory** — name search and domain search both returned 0 rows

```ts
{
	slug: "bwb",
	name: "BWB Digital Assets",
	category: "User-Facing App",
	status: "Development",
	types: ["RWA"],
	supportedNetworks: ["stellar"],
	shortDescription:
		"BWB Digital Assets is a real estate private equity investment platform that uses tokenization to optimize performance and enhance transparency, financial returns, and user experience. The investments are public offerings compliant with CVM (SEC equivalent).",
	links: { website: "https://www.bwbi.com.br/" },
	provenance: { source: "AdminEdit" },
	statusSourceUrl: "https://communityfund.stellar.org/project/bwb-brazilian-real-estate-yields-on-stellar-zab",
	statusBasis: "human-verified",
	statusAsOf: "<date the owner read this packet>",
}
```
## Why every proposal says `status: "Development"`

All nine awards are SCF #45, the round now disbursing: each page's own summary
says `awarded: true` while the submission card still reads "Panel Review" or
"Information Collection", which are payment-pipeline stages, not verdicts. Every
company's website is live, but a live *company* is not a live *Stellar product* —
no Stellar deployment, contract, issued asset or Stellar-facing repo was found
for any of the nine. `Development` is the defensible reading; the approver should
move any row they can evidence past it, and the `statusAsOf` blank is theirs to
fill with the date they read this.

## Served, but its award is missing

`regulated-brl-settlement-for-fx-and-institutional-payments-on-stellar-2vu` was
the tenth absence and is **not** absent. We serve it as `pagfinance`, which
carries the SCF page's description near-verbatim. Two things are wrong with that
row:

- `scf: { awarded: false, roundAwards: [] }` — the SCF page records **Awarded,
  SCF #42, $96,000**, with a submission card whose status is literally "Awarded".
  We are hiding real funding from agents on a row we already hold.
  **Corrected 2026-09-15:** the award is not missing from the index, it is on a
  DUPLICATE. `pagcrypto` is the same company — same website `pag.finance`, same
  types — and carries the #42 award and the github link, while `pagfinance`
  carries the brand name and no award. One entity, seeded twice, and an agent
  that finds the brand-named row is told it has no SCF funding. Queued as a
  DUPE_MERGE (pagcrypto → pagfinance, copyScf) rather than a hand-written
  award.
- `links.website` is `https://pag.finance/` while SCF lists
  `https://pagcrypto.finance/`. Different registrable domains, which is exactly
  why the domain-equality pass never connected the two and why the crosscheck
  never examined the row.

Worth knowing while reviewing it: the operator runs a full anchor at
`brlp.money` — `.well-known/stellar.toml` publishes `ORG_NAME = "PagFinance"`
with SEP-24, SEP-31 and SEP-38 endpoints. On Horizon the BRLP asset has exactly
one issuer (`GDD3ZAU3…NPRF`, `home_domain` `brlp.money`) with 2 trustlines and
nothing issued, so the anchor infrastructure is deployed but unused. That TOML
also has a defect of its own: the `[[CURRENCIES]]` issuer string is 61
characters and does not match the `ACCOUNTS` entry, so do not copy it.

## Three more rows understate their SCF award

Found while checking the diff's domain-matched pairs — 21 pairs, 6 of which
carry `scf.awarded: false` against an SCF page showing an award. Two of the six
turned out to be false identity matches (fixed separately) and one is an RFP with
no numbered award. These three look real and need a human to confirm the identity
before any write:

| our row | SCF submission | SCF says | we say |
|---|---|---|---|
| `soundness` | post-quantum-secure-wallets-for-stellar-97o | Awarded, #40 | `awarded: false` |
| `arrel` | institutional-treasury-xlm-wyu | Awarded, #27 and #38 | `awarded: false` |
| `runtime-verification` | advanced-debugging-for-soroban-contracts-5sr | Awarded, #41 | `awarded: false` |

`soundness` and `arrel` publish the same registrable domain on both sides
(`soundness.xyz`, `arreltech.com`). `runtime-verification` does not — the SCF
submission's website is `simbolik.dev`, Runtime Verification's product — so that
one is the weakest of the three and should be confirmed by hand.

## Why nobody caught these

`scripts/eval/scf-crosscheck.ts` is the guard for "is X SCF-funded?", and it
deliberately matches at high precision: exact slug-base or exact canonical name,
"NOT the absence diff's fuzzy match, which is tuned for recall not precision".
That is the right instinct — a fuzzy match must never accuse a row. The cost is
coverage: its last artifact matched **310 of 514** SCF projects, and it reported
0 overstated and 0 understated across those 310. Both numbers are true and
neither covers `pagfinance`, `soundness` or `arrel`, because a descriptive
submission title ("Regulated BRL Settlement for FX and Institutional Payments on
Stellar") matches no slug and no name.

So roughly 200 SCF projects we *do* serve have never had their award data
checked against the source, and the guard reports clean because it never looked.
The absence diff already computes strong, non-fuzzy evidence for a chunk of that
gap — its domain-equality pairs — which the crosscheck could consume without
loosening its own matcher. That is a proposal, not a change: feeding it in would
widen an accusing guard, and it should be a decision, not a side effect.

## How an approval is applied

Nothing in this file touched the database. The owner marks rows approved; a
curator pastes each accepted block into `SEEDS` in
`scripts/data/curation-maps.ts`, then applies via
`.github/workflows/curate-projects.yml` — dry run first, then `execute` — and
reads the row back off `/api/projects`.

Before pasting, two slug checks worth a second of care:

- `balance` sits next to the existing `balanced` and `balanced-network` rows
  (Balanced Network, an unrelated project). The names are close enough that a
  search for one will surface the other; consider `balance-custody` if that
  bothers you.
- `enable` is the SCF project's name; the company and website are Humanity Link.
  Either add `"Humanity Link"` as an alias or name the row for the company.

The `scf.awarded` corrections in the two sections above are **not** seed rows and
should not be written by hand: `scf` fields have their own writer, and a
hand-written value will fight it on the next run. Fix the identity (alias or
website) so the SCF ingest matches the row, and let the ingest write the award.
