# Tansu on mainnet as the notary of the i³ result — proposal (2026-09-16)

**Status: proposal, nothing built.** Answers "we will not use the Tansu platform,
but maybe in the backend?" with the one role that is real, safe, and visible.

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

## Two ways to sign, pick one

1. **Owner's wallet, via Tansu's dApp (recommended to start).** Register
   `stellarlight` on tansu.dev with your wallet (5 XLM), and commit the results
   SHA the same way. Zero secrets in our infra, and the usage lands in Tupui's
   product, which is the point.
2. **A lane with a purpose-made maintainer key.** A fresh keypair holding ~6
   XLM, listed as a second maintainer at registration, stored as a GitHub
   secret; `award-anchor.yml` commits the SHA after the results are published.
   Repeatable and hands-off, at the cost of one funded key in CI.

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
