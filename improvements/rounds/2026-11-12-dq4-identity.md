# 2026-11-12 identity lane (dq4)

## Scope

Resolve the identity problems the 2026-11-12 read-only audits found: rows
that may be duplicates, rows sharing one repo, a repo moved to another
project's org, MoneyGram's demo link, GitHub links naming an account instead
of an org or repo, and a kedgeway seed. Decide each from the project's own
site, repo, README and SCF page. Merge only one product twice; otherwise fix
the shared or wrong link and keep both rows.

Owns: `scripts/data/curation-maps.ts` and `scripts/data/curate-projects.ts`
entries for the slugs below, the new GITHUB_REPOS_SET map and its curate
section, `src/lib/__tests__/identity-resolutions.test.ts`, the TODO items it
touches and one changelog entry. No spec change, no production write.

## Decisions

Folded (DUPE_MERGES): safu-protocol into safu, cryptix into
stellar-token-launchpad, net-sdk into net-stellar-sdk, ios-mac-stellar-sdk
into ios-stellar-sdk, lusty-finance into lusty, autowhale into renesis,
stellar-vrf into vrf-soroban, soroban-elk into stellar-command-insights. The
award moves (copyScf) for safu, net-stellar-sdk, lusty and renesis.

Kept apart, link fixed: estrela (AMM repo; basis withdrawn), inference
(own site) and inferera (renamed soroban-ret, own repo and description),
mystic (basis that cited Octarine's repo withdrawn), chaincred (own repo),
catalyst (Chef's repo removed), wellspring (RampMeDaddy's frontend leaves its
group), pakananet (company org). MoneyGram's demo link removed. The-aha-company's
moved repo rejoins stellar-registry; Allbridge Core's SDK rejoins allbridge.
Pretium links its MCP repo. Left as is, with reasons in GITHUB_LINK_FIX's
comment: benkiko, icanproveit, docking-zone, borderdollar, stellars-finance,
renesis. kedgeway seeded Live on package-release.

## Log

- Evidence, read-only: public API rows (`/api/projects/search`, Payload REST
  `GET /api/projects?where[slug][equals]=`), SCF pages through
  `scripts/eval/scf-official.ts` (`fetchDetailHtml` + `readScfPage`), each
  project's site with curl, raw READMEs, under 150 GitHub API calls (account
  types, repo metadata, org listings), the npm registry record for kedgeway,
  and one Soroban RPC getLedgerEntries read (SAFU's linked vault is on
  mainnet, a DeFindex vault).
- Fail first: `pnpm vitest run src/lib/__tests__/identity-resolutions.test.ts`
  before the maps changed: 15 failed, 1 passed (the never-fold guard).
- After: 16 passed. `zsh ~/.config/stellarlight/merge-tools/checks.sh`:
  CHECKS-GREEN (279 files, 3,924 tests). A first run had one test fail and
  passed on rerun with no change, a load flake.
- Plan: curate-projects dry run over the live Payload REST rows of the 39
  affected slugs (fake Payload, the curate-waslive-callsites harness), on
  origin/main's maps and on this branch: 0 writes before, 34 after, plus 2
  status-source retracts and 1 seed create.

- Gate hold from the independent audit, answered in a second commit:
  B1 spec 1.9.142 stamped (`pnpm contract:write`; only info.version moves),
  `pnpm -s raven:gate --raven ~/Downloads/sl-lanes/raven`: ACCEPT, 0
  questions moved. B2 vrf-soroban: contract
  CAW6KECQMHRTX2GS3JVHWBMOB5JNNOHNOCE635RQS4SWJ72YF56EUPRX on mainnet
  (getLedgerEntries: 1 entry; testnet 0), the README's six transactions
  successful on Horizon (deploy CreateContractV2 2026-09-24, request target
  decodes to the contract), oracle fulfill calls through 2026-10-18: Live,
  human-verified. M2 pakananet: lockb0x-llc's 29 repos hold no Pakana.Net
  repo, so the link is removed instead of pointing at the org. Lows:
  soroban-ret package-release (crates.io 0.0.4, 2026-07-26),
  stellar-command-insights links its SCF-named app, kedgeway comment no
  longer pins a version, a disjointness guard for the two github maps.
  Failing first: 6 of 23 failed before the fix (the disjointness guard
  passed from the start; nothing violated it).

## Outcome

Ready for review; nothing executed. The fixes land when curate-projects
executes, and the repo rejoins when enrich-repos runs after it.
