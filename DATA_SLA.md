# Data SLA — the standing promises, and what enforces them

StellarLight is a data layer for agents. Agents can't eyeball a directory and
sense that it's stale — they inherit whatever we serve. So every promise below
is only listed because a **named, runnable guard** enforces it; a promise with
no red-capable check is marketing, and none of those appear here. The measured
state of these guards is rendered (from committed artifacts only) on
[/quality](https://stellarlight.xyz/quality).

## The promises

### 1. The contract a stranger reads is the contract the API serves
Live API ⇄ OpenAPI spec (`/api/openapi.json`) ⇄ skill docs agree — endpoints,
params, enums, field names.
**Enforced by** [`scripts/check-api-drift.ts`](scripts/check-api-drift.ts) —
daily + on demand ([`api-drift.yml`](.github/workflows/api-drift.yml)). Red =
any divergence between the three surfaces.

### 2. Every observable contract change is versioned and announced
`info.version` bumps on **every** observable change (including description-only
rewrites), and `/api/changelog` carries a dated entry — this is the re-baseline
signal downstream consumers key on.
**Enforced by** the contract CI gate (`contract` check on every PR) + the
versioning rule in [`src/lib/version.ts`](src/lib/version.ts).

### 3. The data behind the contract stays sane
Liveness + response shape, sane counts, per-source freshness ceilings, and
ground-truth spot checks derived from facts we know are true. Deliberately
**not** adversarial "find the worst" judging — grounded checks only.
**Enforced by** [`scripts/self-audit.ts`](scripts/self-audit.ts) — daily
([`self-audit.yml`](.github/workflows/self-audit.yml)). Red = a failure an
agent would actually hit.

### 4. Documented params do something; garbage is rejected
Every documented parameter observably changes the response; undocumented or
invalid values are rejected, not silently absorbed.
**Enforced by** `scripts/eval/engine-e-contract.ts` — on every production
deploy ([`post-deploy-eval.yml`](.github/workflows/post-deploy-eval.yml)).

### 5. Known-true answers stay retrievable
Golden questions (with a ground-truth answer key derived from the canonical
directory) and generated recall probes must keep passing after every ship.
**Enforced by** `scripts/eval/run-golden.ts` + `scripts/eval/generated-recall.ts`
— on every production deploy (same workflow as #4).

### 6. Funding claims match the funder
No project overstates or understates SCF membership or round participation vs
communityfund.stellar.org's own directory. Divergence in either direction is a
red finding, not a rounding error.
**Enforced by** `scripts/eval/scf-crosscheck.ts` — weekly engine pass
([`engine-c-health.yml`](.github/workflows/engine-c-health.yml)).

### 7. Empties are honest
A query we can't answer says so (`matchMode`, honest empty states) — no
fabricated relevance, no silent substitution. `EMPTY-DISHONEST` is a red
finding class in the full-surface audit taxonomy.
**Enforced by** the north-star full-surface audits (dated runs + findings JSON
committed under [`improvements/audits/`](improvements/audits/)).

### 8. The #1 consumer can actually discover what we ship
The consumer's discovery catalog is checked from **our** side against the live
contract — with an explicit grace window for their re-baseline cadence, because
lag inside their normal rhythm is *their clock, not a defect*.
**Enforced by** [`scripts/check-raven-drift.ts`](scripts/check-raven-drift.ts)
— weekly local run (credentialed; artifact committed to
[`improvements/engine/`](improvements/engine/)). Red = an op invisible beyond
the grace window.

## When a guard goes red

1. The red is the work queue — fixes land as PRs referencing the failing run.
2. The fix ships with a `/api/changelog` entry and an `info.version` bump (#2).
3. Externally-reported findings get a verification issue with reproducible
   probes on close ([precedent](https://github.com/Stellar-Light/stellar-scout)).
4. The next dated artifact — not prose — is what says it's fixed.

## Cadence

| Guard | Cadence |
|---|---|
| Contract drift (#1) | daily |
| Data sanity (#3) | daily |
| Contract honesty + recall (#4, #5) | every production deploy |
| SCF cross-check (#6) | weekly |
| Full-surface audit (#7) | per improvement wave (dated runs) |
| Consumer interlock (#8) | weekly (local, credentialed) |

Consumer-facing conventions (spec-as-discovery-index, the version handshake,
the findings ledger, the cadence contract) are specified in
[`docs/interlock-spec.md`](docs/interlock-spec.md).
