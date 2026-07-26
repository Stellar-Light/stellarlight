# Skills, on-chain fields, and the silent revert — 2026-07-24/26 (#697–#726)

Paper-trail catch-up for the three days after the ledger/Raven wave
(./ledger-and-raven-loop-2026-07-22-23.md, #646–#696). Written by the
improvement-loop agent on 2026-07-26.

The shipping half of this window was routine and good. The finding half is not:
a daily sync added in this window has been **silently reverting the entire
owner-reviewed curation layer**, and every green signal we had said otherwise.
That is lessons class 32.

## Arc 1 — skills become a served product, not a file

| PR | What |
|---|---|
| #707 | SCF skills move to Stellar-Light + two new reviewer skills |
| #708 | serve SKILL.md content for repo-hosted skills + Scout cross-link |
| #709 | gate published skill instructions against the live API |
| #713 | 5-minute content cache + eval covers all 12, minus two false alarms |
| #714 | SCF skills are multi-agent — stop advertising them Claude-only |
| #717 | the downloadable skill and the served skill were different documents |

#717 is class 12 (verify-before-advertise) in a new place: the artifact a
consumer downloads and the artifact we serve were two documents that had drifted
apart. Advertising is not one surface.

## Arc 2 — on-chain activity reaches consumers

| PR | What |
|---|---|
| #704 | transaction volume + active address counts on project profiles |
| #705 | expose on-chain activity fields on searchProjects (were DB-only) |
| #718 | api-client 1.8.0 — publish the on-chain asset fields consumers can't see |

#705/#718 are the recurring "we have the data, the consumer can't see it" shape —
class 11 seen from the field side rather than the spec side.

## Arc 3 — retrieval and verification honesty

| PR | What |
|---|---|
| #712 | a query for "300000" missed the page that says "$300,000" |
| #715 | exact-figure retrieval guarantee — in the vector path this time |
| #719 | a multi-skill repo is a valid `npx skills add` target |
| #720 | a documented MCP tool that npm doesn't ship is a broken promise |
| #721 | a rate-limited check is not evidence the repo is missing |
| #725 | the ledger couldn't tell "still broken" from "not re-checked" |
| #726 | a semantic neighbour is not a match, and must not read like one |

#721 and #725 are the same idea landing in two places in one window: **absence of
confirmation is not confirmation of absence.** A rate-limited probe and an
un-re-checked ledger row both look exactly like a real failure unless the artifact
says which one it is. #715 is class 22 (instance-calibrated fixes) caught late —
#712 fixed the lexical path, the vector path had the same hole.

## Arc 4 — data and awards

| PR | What |
|---|---|
| #716 | verify 3 stale "Live" labels — quiet repos, live products (class 18 held) |
| #723 | awards: wallet menu, DB-recorded ballots, verify-on-chain links |
| #700 | un-break 3 workflows rejected for duplicate YAML keys + guard the class |

## The finding: curation has not reached production since at least 07-11

Discovered while triaging the self-audit's red `bridge corridors` check. The check
named 6 Bridge-typed projects with empty `supportedNetworks`; the full-population
sweep (class 18) found **17**. The fix looked like a routine `TYPES_SET` row —
until every one of those slugs turned out to *already have* a verified row, added
by boxy on 2026-07-11 (#414).

The rows are merged to `main`. The curate Action ran `--execute` successfully on
2026-07-24 and its log says, in order:

```
tezoro: types [Bridge] → [Lending]
...
wrote: tezoro
DONE: 125 write(s) applied.
```

Two days later the live API serves `tezoro types = ['Bridge']`. The same run
queued a `range` description rewrite; live still serves the old proposal text
("This proposal seeks to build a Steller Bridge Explorer…"). Two independent
registries, same result: **the write reports success and the value is gone.**

Mechanism, from `scripts/sync-lumenloop.ts:157-181` — the daily
`sync-lumenloop.yml` cron (added #700, 07:00 UTC) updates any project whose
`provenance.source === "LumenloopSeed"` **or** `verificationLevel === "Unverified"`
with a whole-record spread:

```ts
await payload.update({ collection: "projects", id: doc.id,
  data: { ...mapped, slug, provenance: {...} } })
```

`mapped` is the upstream feed record, and it carries `types` and
`shortDescription`. Curation via `curate-projects.ts` writes those fields but
never bumps `verificationLevel` or `provenance.source` — so a curated record stays
eligible and is overwritten by the feed every single day. The guard that was meant
to protect verified records silently excludes curated ones, because curating a
record was never wired to mark it curated.

Why nothing caught it: the sync logs `UPDATED`, the curate run logs `wrote`, both
jobs exit 0, and no detector compares a registry row against the live value it is
supposed to produce. The self-audit's bridge check is the closest thing we have,
and it reads as "6 rows need curating" — the one reading under which the correct
response is to write rows that will also be reverted.

**No data rows were written this run.** Writing them would have produced a green
PR, a merge, a successful curate run, and no change in production — which is
exactly what the last three weeks already produced.

Queued as the top code-class item with probes; see the improvement-loop triage
issue (#586). The fix is code (ownership of curated fields), not a registry row.

## Process note

The paper trail went stale again across this window — last wave entry 07-21, ~30
PRs merged since. Same failure the 07-13/16 wave called out. It is now the first
thing this agent checks each run, which is how this entry exists.
