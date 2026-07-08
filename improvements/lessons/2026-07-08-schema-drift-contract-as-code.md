# 2026-07-08 — Schema drift: the spec lied about the live API

**Classes:** 11 (contract under-documentation), 3 (null-in-enum), 13 (deploy-race CI)

## What happened

Tyler's drift detector (stellar-raven) diffed our OpenAPI spec daily and flagged a change. Investigating OUR side of it found we'd shipped three real contract defects:

1. **#353 deleted `anchorProfile` from the spec's Project component**, with a changelog entry calling it "never-implemented" — but the live API serves it on every Anchor-typed search row, and the Etherfuse fix made it load-bearing the same day. Downstream catalogs generated from our spec now believed the field didn't exist.
2. `canonicalSlug` and `lifecycle` were served live but **never documented at all**.
3. `getPartners`' 200 response was spec'd as a bare `{type: "object"}` — **31 live fields undocumented**, which is why Tyler's catalog could only resolve `Project`.

Bonus finds while fixing: a `null` literal inside the `scfAmountStatus` enum **crashed spectral** (`Cannot use 'in' operator`), which had silently killed the OpenAPI-lint workflow for 3 days — red the whole time, nobody noticed. And the push-triggered lint graded the **live URL minutes after merge, before the deploy landed**, so it false-failed on exactly the run that shipped the fix.

## Root cause

The spec was hand-maintained prose about the API, verified only by memory and partial checks. Nothing structurally tied "what the route serves" to "what the spec says" — so they drifted, in both directions, and the consumer's detector caught it before ours did.

## The fix (mechanized)

- **Contract-as-code**: the spec object lives in `src/lib/openapi-spec.ts`; `pnpm contract:write` snapshots it to `specs/openapi.json` (committed — PR diffs SHOW contract changes) and generates `api-client/src/schema.ts` from it. `contract-gate.yml` fails any PR where the artifacts are stale or where the spec changed without a changelog entry. Silent contract drift is unmergeable.
- **Field coverage**: the daily api-drift guard fetches live sample rows and asserts every field served is documented in its spec component (live ⊆ spec).
- **Committed-artifact CI**: push/PR lint grades `specs/openapi.json`; only the daily schedule grades the live URL.
- **Advertised-versions guard** (see the npm lesson): the same "advertise ⊆ reality" idea applied to package versions.

## The transferable rule

A contract you don't generate or gate WILL drift from the implementation — the only question is who notices first, you or your consumer. Make the contract an artifact in the repo, diffed in PRs, gated in CI.
