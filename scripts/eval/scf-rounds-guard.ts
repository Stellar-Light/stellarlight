/**
 * SCF round-membership drift guard (CLI). Reads the scf-crosscheck report JSON
 * (scripts/eval/scf-crosscheck.ts --out) and promotes its `roundsOverstated`
 * finding — awarded records that list an SCF round the official
 * communityfund.stellar.org detail page marks "Not Awarded" on EVERY submission
 * in that round — from buried weekly evidence to a TRACKED signal.
 *
 * Wired into engine-c-health (which already produces the report each week) via
 * the rolling-issue action: a nonzero count upserts ONE "SCF round-membership
 * drift" issue, a return to zero auto-closes it. This is the structural guard
 * for P4 (round membership overstated 14 records, recurring across the
 * 2026-07-19 and 2026-07-21 improvement-loop runs — the finding kept persisting
 * because engine-c recorded it as continue-on-error evidence nobody was paged
 * on). The membership FIX is scripts/data/fix-scf-rounds.ts (dispatch
 * fix-scf-rounds.yml dry-run → execute); this only watches.
 *
 *   pnpm exec tsx scripts/eval/scf-rounds-guard.ts [report=/tmp/scf.json]
 *
 * Exit 1 (drift) when roundsOverstated > 0; exit 0 (clean) otherwise. A missing
 * or unparseable report prints a note and exits 0 — a scrape failure NEVER
 * accuses (the crosscheck's never-accuse-on-ambiguity contract). The report
 * logic lives in src/lib/scf-rounds-guard.ts (unit-tested).
 */
import { readFileSync } from "node:fs";
import { summarize } from "../../src/lib/scf-rounds-guard";

const path = process.argv[2] || "/tmp/scf.json";
let report: unknown;
try {
	report = JSON.parse(readFileSync(path, "utf8"));
} catch {
	console.log(
		`SCF rounds guard: no readable report at ${path} — crosscheck produced nothing; not accusing.`,
	);
	process.exit(0);
}
const { count, text } = summarize(report);
console.log(text);
process.exit(count > 0 ? 1 : 0);
