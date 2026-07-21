# Weekly engine evidence — committed, fixed-path artifacts

The engine-c-health workflow (Sunday 09:00 UTC + dispatch) commits each eval's
JSON here at a **fixed `<name>-latest.json` path** so `/quality` can statically
import it under the committed-artifacts-only rule. Git history is the dated
archive — every past week is one `git log -- <file>` away; nothing is deleted.
Only output that parses as JSON is committed (a crashed eval's partial file
stays out), and red weeks commit too — a red the scoreboard can show is the
point.

| File | Eval | Script |
|---|---|---|
| `engine-a-recall-latest.json` | Recall matrix vs floors | `scripts/eval/generated-recall.ts` |
| `engine-b-sweeps-latest.json` | Data sweeps | `scripts/eval/engine-b-sweeps.ts` |
| `engine-d-demand-latest.json` | Demand-side miss mining | `scripts/eval/engine-d-demand.ts` |
| `corpus-health-latest.json` | Research-docs S5–S8 | `scripts/eval/engine-b-corpus.ts` |
| `scf-crosscheck-latest.json` | scfAwarded vs communityfund | `scripts/eval/scf-crosscheck.ts` |
| `golden-eval-latest.json` | Golden retrieval eval | `scripts/eval/run-golden.ts` |
| `engine-e-contract-latest.json` | Contract honesty probes | `scripts/eval/engine-e-contract.ts` |
| `corpus-coverage-latest.json` | Canonical page families (sls-055) | `scripts/eval/corpus-coverage-check.ts` |
