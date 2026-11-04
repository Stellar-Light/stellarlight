# SCF #45 awardees with no directory row: intake list (2026-11-04)

For the owner, from issue #1903 (sls-111). No rows were created.

Source for every line: the project's own SCF page, read 2026-11-04. Round,
amount and award type are the page's own submission card; website and repo
are the page's `siteUrls` record. Each name was checked before listing: GET
`/api/projects/resolve` for the name and for the website's brand answered
`found: false`, and no directory row lists the website's domain (one
domain is a builder's company site, noted on its line).

| # | Name (SCF title) | SCF page | Website | Repo listed | Round | Award on the page | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Pollar | https://communityfund.stellar.org/project/pollar-nqe | https://www.pollar.xyz/ | none | SCF #45 | $89,500, Build | its SCF #42 entry was Not Awarded |
| 2 | Pods | https://communityfund.stellar.org/project/pods-dxl | https://deframe.io | none | SCF #45 | $125,000, Build | card still in Information Collection; the page's own total pins the award |
| 3 | AgentSmith x402: Stellar Facilitator and Bazaar Discovery | https://communityfund.stellar.org/project/agentsmith-x402-stellar-facilitator-and-bazaar-discovery-kdw | https://57blocks.com/blockchain | none | SCF #45 | $122,000, Build | the site is the builder's (57Blocks), which three unrelated rows also list: soroban-timelock-contract, soroban-resource-usage-reporter, autoaction |
| 4 | Cara7 | https://communityfund.stellar.org/project/cara7-yyx | https://cara7.com/ | none | SCF #45 | $127,900, Build | |
| 5 | Astrolabe | https://communityfund.stellar.org/project/astrolabe-bzg | https://stellar-explorer-tau.vercel.app/ | none | SCF #45 | $117,900, Build | the site is a vercel.app deployment |
| 6 | Onboard | https://communityfund.stellar.org/project/onboard-kvj | https://onboard.xyz | none | SCF #45 | $89,000, Build | not our onboarding-club row (no shared site or GitHub org) |
| 7 | Nila | https://communityfund.stellar.org/project/nila-fwc | https://nila.land | none | SCF #45 | $95,000, Build | |
| 8 | Principal | https://communityfund.stellar.org/project/principal-vzt | none (the page gives its repo as the website) | a GitHub repo named principal-protocol under a personal account; the URL is the page's website field | SCF #45 | $116,000, Build | its SCF #44 entry was Not Awarded |
| 9 | ZKELLA Protocol - Compliance-Ready Confidential Finance Infrastructure for Stellar | https://communityfund.stellar.org/project/zkella-protocol-compliance-ready-confidential-finance-infrastructure-for-stellar-sib | https://www.zaiffer.org/ | none | SCF #45 | $127,800, Build | |
| 10 | Canary Protocol | https://communityfund.stellar.org/project/canary-protocol-y4l | https://www.canaryprotocol.com/ | none | SCF #45 | $120,000, Build | card still in Information Collection; the page's own total pins the award |
| 11 | Fermah Pay | https://communityfund.stellar.org/project/fermah-pay-w3c | https://fermah.xyz/ | none | SCF #45 | $65,000, Build | |
| 12 | Open RWA Vault Infrastructure | https://communityfund.stellar.org/project/open-rwa-vault-infrastructure-nis | https://bootnode.dev | none | SCF #45 | $69,000, Build | the site is a company site (bootnode.dev); the submission is titled "Strata, a Vault Kit for RWA" |

## Reviewed out: already in the directory

| Name (SCF title) | SCF page | Website | Award on the page | Why it is not intake |
| --- | --- | --- | --- | --- |
| The Merchant Settlement Rail for Africa | https://communityfund.stellar.org/project/the-merchant-settlement-rail-for-africa-bzf | https://slimepay.com/ | SCF #45 $35,000, Build (its SCF #44 entry was Not Awarded) | this is our `slimepay` row: same site, and `resolve?q=SlimePay` finds it. The page is submission-named, so the name matcher never joined it; branch `lane/r1104-scf-rounds` adds an `SCF_SLUG_OVERRIDES` entry, and the next enrich-scf execute writes the award. |

## After intake

- A row named as the SCF title, or as its leading words ("AgentSmith",
  "ZKELLA Protocol", "Open RWA Vault"), joins on the next enrich-scf run by
  title prefix. A row named for something else (for example "Strata" or
  "Deframe") needs an `SCF_SLUG_OVERRIDES` entry in
  `scripts/enrich-from-scf.ts`, verified against the page's site.
- Then dry-run and execute enrich-scf, and run
  `pnpm exec tsx scripts/eval/scf-round-counts.ts`. Its SCF #45 line should
  read `exact: SCF 40, ours 40` (it read SCF 40, ours 24 on 2026-11-04).
