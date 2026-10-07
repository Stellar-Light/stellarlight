# Tansu as the notary of the i³ result — proposal (2026-09-16)

**Status (2026-09-16, final): BUILT ON TESTNET, ready to register.** Owner's
corrections, both now rules: *everything* about i³ is testnet (Pilots vote
with testnet-ASSIGNED wallets, not their real ones), and nobody opens a dApp —
not a voter, not the owner. So the anchor lives where the vote lives: Tansu's
TESTNET deployment (`CBXKUSLQ…`, the repo's configured id, where Tupui's real
activity is — 34 projects, 700+ votes). The lane friendbots its own key, so
there are zero owner steps and zero real XLM. After a testnet reset the chain
forgets it, like every ballot; the award-ballots mirror is the durable record
and the lane just registers again. The mainnet section below stays as a
courtesy bug report for Tupui — it is no longer on our path.

Verified on testnet 2026-09-16 (simulation read properly this time):
`register(...)` OK from a funded test key (fee 177,649 stroops), `stellarlight`
free, `get_project(key("tansu"))` resolves to its 5 maintainers and latest
hash `86f0ce8d…`, commit's maintainer gate refuses a stranger.

## The role

The vote stays exactly where it is: classic `manageData` on testnet, one
signature, tallied from Horizon, mirrored to `award-ballots`, reconciled daily
(#1630, #1631, #1632). Tansu never touches a voter.

Tansu's own tagline is *"track and verify the latest commit hash for any
project, with links to the canonical code repository."* So: **register
`stellarlight` as a project on Tansu mainnet, and when the round closes, commit
the git SHA of the published results file.** The i³ Awards 2026 result becomes
a permanent mainnet record, on Tupui's contract, verifiable by anyone with
`get_commit` — and it outlives the testnet reset for real, not via our mirror.

It is Tansu used for exactly what it is for, on mainnet, where the deployed
contract has 8 projects and no activity to speak of. Tupui gets a real, visible
project on tansu.dev. Nothing about our ballot changes.

## Verified facts (deployed mainnet contract, read via Soroban RPC today)

- Contract `CDXINK2T3P46M4LWK35FVIXXHJ2XHAS4FOVCGVPJ63YV5OVTM24IY5BI`, 41
  functions. Deployed `register(maintainer, name, maintainers, url, ipfs)` is
  OLDER than the repo HEAD (HEAD adds voting-period/attestation params) —
  `commit(maintainer, project_key, hash)` and `get_commit(project_key) → String`
  are identical in both.
- Registration = **5 XLM collateral** (README + `REGISTER_COLLATERAL = 5 *
  10_000_000`), name ≤ 30 chars, `[A-Za-z0-9]` only, `maintainer` must be in
  `maintainers`, `maintainer.require_auth()`. No domain step in the code (the
  docstring saying so is stale).
- `commit` accepts a 40-hex (SHA-1) or 64-hex (SHA-256) string, stores
  `LastHash(project_key)`, emits a `Commit` event. `project_key =
  keccak256(name)`.
- In practice commits are pushed by Tansu's git hook, with the dApp handling
  the wallet signature. The dApp shows `LatestCommit` / `CommitHistory` per
  project.

## Finding (mainnet, courtesy report for Tupui): `register()` traps on the current wasm — for everyone

Read via Soroban RPC simulation on 2026-09-16 (never submitted):

- `register(maintainer, "stellarlight", [maintainer], url, "")` fails with
  `Error(WasmVm, InvalidAction)` — `VM call trapped: UnreachableCodeReached` —
  from a Kraken hot wallet, from Tupui's own maintainer account
  `GD4FXNCY…QF3ER`, on `mainnet.sorobanrpc.com` and gateway.fm alike, for every
  name/url/ipfs variant tried. The diagnostic log shows the trap inside
  `register` with **no sub-call** (no domain call, no collateral transfer).
- Registering an EXISTING name (`tansu`) returns the typed
  `Error(Contract, #201)` = ProjectAlreadyExist. So the trap sits **after** the
  exists-check: the next thing v2.0.2's `register` does is
  `retrieve_contract(ContractKey::Domain)`, which is
  `env.storage().instance().get(&key).unwrap()`.
- The live instance storage holds the refs under the symbols
  **`DomainContract`** and **`CollateralContract`**; v2.0.2's `ContractKey` enum
  is `Domain` / `Collateral` / `Nqg`, and current `main` has dropped `Domain`
  entirely. A lookup under the wrong symbol returns `None`, the `unwrap()`
  panics, and with `panic = "abort"` that is exactly `UnreachableCodeReached`.
- Contract created 2025-10-25; wasm upgraded 2026-05-11, 05-12 and **05-14**
  (current `83feef85…`, 4th version); 63 invocations total, 7 projects.
- **Pinned.** The deployed wasm `83feef85…` is byte-identical to the
  `tansu_v2.0.2.wasm` release asset (GitHub's asset digest). v2.0.2's
  `ContractKey` is `Domain / Collateral / Nqg`. The FIRST deploy (tag `v1`,
  2025-10) had `DomainContract / CollateralContract` — which is exactly how
  the refs sit in instance storage today. They were set under v1 and never
  re-set after the May upgrades, so every `register()` since 2026-05-14 has
  unwrapped `None`. The fix is one admin call each to `set_domain_contract`
  and `set_collateral_contract` (both in the deployed interface), or a wasm
  whose keys match what is stored.

The read paths (`get_project`, `get_commit`) work — our keccak key resolves
`tansu` to its maintainer and latest hash `7de4027c…` — and `commit()`'s
maintainer gate works (a non-maintainer is refused). Only registration is
broken, and it is broken upstream. The fix is Tansu's: either re-set the two
contract refs under the symbols the deployed code reads, or ship a wasm whose
`ContractKey` matches the stored ones. Our lane fails loudly (`assertSimulated`)
until then and will register the moment it is fixed.

This is the first thing worth sending Tupui: a reproducible bug on his mainnet
deployment, found by trying to use it.

## Two ways to sign, pick one

~~1. Owner's wallet via Tansu's dApp.~~ Rejected by the owner: no dApp step for
anyone. The voter flow is connect → sign; the backend does the rest.

2. **A lane with a purpose-made maintainer key — the one we built.** A fresh
   keypair (secret set straight into the repo secret `TANSU_MAINTAINER_SECRET`,
   never printed; public key in the repo variable `TANSU_MAINTAINER_PUBLIC`),
   funded by the owner with ~10 XLM (5 collateral + reserves + fees).
   `tansu-anchor.yml` registers once and commits the SHA after each round's
   results are published; dry-run simulates with the public key alone.

## What we build on our side (small, none of it voter-facing)

- **Results artifact lane** — after close + reconcile, export the aggregate
  tally (turnout, per-category counts, closesAt, reconcile run id — NO
  addresses, NO tx hashes) to `awards/<round>-results.json` and commit it to
  the public repo. Its commit SHA is what gets anchored.
- **`GET /api/awards/anchor?round=`** — reads `get_commit(keccak256
  ("stellarlight"))` via RPC simulate, compares to the SHA recorded on the
  round (`award-rounds.anchor = { commitSha, txHash, at }`, written when the
  anchor lands), returns `{ anchored, sha, explorer }`. ~60 lines.
- **Results page link** — "Result anchored on Stellar mainnet via Tansu ·
  verify". That is in `src/components/awards/*` and waits for an explicit ask.

## What this does NOT claim

Anchoring proves the published result was fixed at a point in time and has not
changed. It does not make the testnet ballots themselves permanent — the mirror
+ daily reconcile is what does that, and that is already shipped.
