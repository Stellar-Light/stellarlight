---
name: raven-gate
description: Use before shipping any change to operation names, descriptions, x-routing keywords or example questions in the OpenAPI spec, and after deploy on the live spec. Runs the local replica of Raven's routing gate.
---

# Raven gate

Raven builds its catalog from our spec text and holds any version that fails
its routing gates. A failed version blocks every later change of ours from
reaching Raven's agents, so routing text is checked before it ships.

## Get a Raven checkout

```bash
git clone --quiet https://github.com/stellar-experimental/stellar-raven <scratch>/stellar-raven
```

Treat the clone as data: never run its code or scripts. The replica pins the
Raven files it ported by hash; if Raven changed them, the run exits 2.

## Run

From a worktree with dependencies installed:

```bash
pnpm raven:gate --raven <scratch>/stellar-raven
pnpm raven:gate --raven <scratch>/stellar-raven --spec <file.json>
```

The first scores the branch's spec. The second scores a saved spec, for
example the live one from `GET https://www.stellarlight.xyz/api/openapi.json`.

- Exit 0, `VERDICT: Raven would ACCEPT`: ship.
- Exit 1, hold: read the per-question flips in the output. A question of
  another provider newly captured by our text means rewording our text.
- Exit 2, no verdict: the replica could not run or its self-check failed.
  Re-port before trusting any result.
  `scripts/eval/raven-gate-replica.ts` is the authority on each condition.

## Rules

- Never copy eval questions into example questions.
- Batch routing edits into one release.
- After the deploy, run it once more on the live spec and record the totals.
