# improvements/waves/ledger/ — wave manifests (ledger slice 3)

A **wave manifest** declares which improvement-ledger findings a fix wave
resolves, and to what status. It's how the loop closes: the automatic detectors
open findings, a wave (a human + a fix) transitions them, and `/quality`'s
closing rate reflects real **detect → verified** work, not just auto-clear.

`scripts/improvement-ledger.ts` reads every `*.json` here and overlays the
statuses onto `../findings.json` on each run. A wave's assertion wins over the
detector's automatic status (a human said "this is fixed").

## Format

```json
{
  "wave": "contract-overdoc-cleanup",   // short slug (matches the filename)
  "date": "2026-07-22",
  "lesson": "optional-memory-lesson-slug",
  "findings": [
    { "id": "<finding-id from findings.json>", "status": "in-wave", "note": "…" }
  ]
}
```

Filenames: `YYYY-MM-DD-<wave-slug>.json`. Never delete — supersede with a newer
dated manifest (same convention as the rest of `improvements/`).

## Status meaning

| status     | meaning                                                        |
|------------|----------------------------------------------------------------|
| `in-wave`  | triaged into an active fix wave (still open, but being worked) |
| `fixed`    | the fix has shipped; awaiting confirmation                     |
| `verified` | a re-run / live check confirmed it — **counts as closed**      |

`cleared` is NOT set here — it's automatic (a detector stops reporting a
finding). Only the deliberate transitions live in these manifests.

## Honesty guard

The orchestrator warns (and does not silently trust) when a manifest marks a
finding `verified` that a detector **still reports this run** — the fix didn't
take, so the loop must not claim victory. Only mark `verified` when you've
actually confirmed it (a re-run, or a live check with a real pass criterion —
substring matches lie: `bridge` ⊄ `allbridge`).
