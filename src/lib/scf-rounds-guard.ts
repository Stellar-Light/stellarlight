/**
 * SCF round-membership drift guard — pure report logic (no I/O), so it's
 * unit-testable. The CLI wrapper is scripts/eval/scf-rounds-guard.ts, wired into
 * engine-c-health via the rolling-issue action.
 *
 * Input: a parsed scf-crosscheck report (scripts/eval/scf-crosscheck.ts --out).
 * `roundsOverstated` = awarded records that list an SCF round the official
 * communityfund.stellar.org detail page marks "Not Awarded" on EVERY submission
 * in that round (precision-verified — ambiguous rounds are never in this list).
 * The membership FIX is scripts/data/fix-scf-rounds.ts.
 */

export interface RoundsOverstated {
	slug: string;
	name?: string;
	ourRounds?: (number | string)[];
	officialAwardedRounds?: (number | string)[];
	url?: string;
}

/** Build the guard's rolling-issue body + the drift count from a crosscheck
 * report. count > 0 → the CLI exits 1 (engine-c opens the rolling issue); 0 →
 * exit 0 (auto-close). A report missing the key counts as clean (never accuse). */
export function summarize(report: unknown): { count: number; text: string } {
	const raw = (report as { roundsOverstated?: unknown } | null)
		?.roundsOverstated;
	const rows: RoundsOverstated[] = Array.isArray(raw)
		? (raw as RoundsOverstated[])
		: [];
	const n = rows.length;
	const lines: string[] = [
		`# SCF round-membership drift — ${n} record(s) overstated`,
		"",
	];
	if (n === 0) {
		lines.push(
			"Every awarded record's scfAwardedRounds matches the official per-submission verdicts. ✓",
		);
		return { count: 0, text: lines.join("\n") };
	}
	lines.push(
		'We list an SCF round the official communityfund.stellar.org page marks "Not Awarded" ' +
			"on every submission in that round (precision-verified — ambiguous rounds are never accused). " +
			"Fix: dispatch `fix-scf-rounds.yml` (dry-run → execute); it syncs scf.awardedRounds to the " +
			"official per-submission verdicts.",
		"",
	);
	const fmt = (xs: (number | string)[] | undefined) =>
		(xs ?? []).map((x) => `#${x}`).join(" ");
	for (const r of rows) {
		const off = fmt(r.officialAwardedRounds) || "(none awarded)";
		lines.push(
			`- ${r.slug}: ours [${fmt(r.ourRounds)}] → official awarded [${off}] — ${r.url ?? ""}`,
		);
	}
	return { count: n, text: lines.join("\n") };
}
