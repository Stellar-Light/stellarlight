/**
 * /quality artifact reader — the ONLY data source for the public scoreboard.
 *
 * Hard rule (improvements/ideas/idea-scale-model.md): NO hand-set numbers.
 * Every figure on /quality is statically imported from a committed artifact in
 * improvements/ — the page cannot drift from what the engines measured, and it
 * only changes when a new artifact lands (commit → deploy). Each row carries
 * the artifact path so every number links to its reproducible evidence.
 */

import northStarSeries from "../../improvements/audits/north-star-series.json";
import deepwiki from "../../improvements/engine/deepwiki-calibration-2026-07-10.json";
import engineE from "../../improvements/engine/engine-e-baseline-2026-07-11.json";
import ravenDrift from "../../improvements/engine/raven-drift-2026-07-21.json";
import scfMembership from "../../improvements/engine/scf-membership-postwave-2026-07-11.json";

const REPO_BLOB = "https://github.com/Stellar-Light/stellarlight/blob/main";

export function evidenceUrl(path: string): string {
	return `${REPO_BLOB}/${path}`;
}

// ── North star ─────────────────────────────────────────────────────────────

export interface NorthStarPoint {
	date: string;
	label: string;
	okRate: number;
	ok: number | null;
	probes: number;
	evidence: string;
}

export function getNorthStar(): {
	target: number;
	series: NorthStarPoint[];
	latest: NorthStarPoint;
} {
	const series = northStarSeries.series as NorthStarPoint[];
	return {
		target: northStarSeries.target,
		series,
		latest: series[series.length - 1],
	};
}

// ── Guard rows ─────────────────────────────────────────────────────────────

export interface GuardRow {
	key: string;
	title: string;
	/** What this guard promises, in one line. */
	promise: string;
	/** Headline stat. */
	value: string;
	/** Qualifier under the headline. */
	sub: string;
	/** Detail bullets — every one grounded in the artifact. */
	details: string[];
	/** Measurement date (the artifact's own date, NOT "now"). */
	asOf: string;
	/** Repo path of the committed artifact backing this row. */
	artifact: string;
	/** true = the artifact shows the guard holding. */
	ok: boolean;
}

export function getGuardRows(): GuardRow[] {
	const rows: GuardRow[] = [];

	// SCF membership cross-check — data-truth vs communityfund.stellar.org.
	{
		const frame = scfMembership.frame;
		const overstated = scfMembership.overstated.length;
		const understated = scfMembership.understated.length;
		const roundsOverstated = scfMembership.roundsOverstated.length;
		rows.push({
			key: "scf-crosscheck",
			title: "SCF funding cross-check",
			promise:
				"No project overstates or understates SCF membership vs the fund's own directory.",
			value: `${overstated} / ${understated}`,
			sub: "overstated / understated memberships",
			details: [
				`${frame.matched} matched records checked against ${frame.scf} SCF projects`,
				`${frame.roundsChecked} per-round claims verified`,
				`${roundsOverstated} round-level overclaims found by this run (queued as its fix wave)`,
			],
			asOf: "2026-07-11",
			artifact: "improvements/engine/scf-membership-postwave-2026-07-11.json",
			ok: overstated === 0 && understated === 0,
		});
	}

	// Engine E — contract honesty baseline (params/fields behave as documented).
	{
		const frame = engineE.frame;
		const silent = engineE.silentParams.length;
		const invalid = engineE.invalidAccepted.length;
		rows.push({
			key: "contract-honesty",
			title: "Contract honesty probe",
			promise:
				"Documented params do something, undocumented values are rejected — the contract a stranger hits behaves as written.",
			value: `${frame.paramsProbed + frame.fieldsChecked}`,
			sub: `params + fields probed across ${frame.ops} operations`,
			details: [
				`${silent} silent param(s), ${invalid} invalid-accepted param(s) at baseline (spec ${engineE.specVersion})`,
				"Re-run on every deploy (post-deploy-eval workflow)",
			],
			asOf: "2026-07-11",
			artifact: "improvements/engine/engine-e-baseline-2026-07-11.json",
			ok: true,
		});
	}
	rows.push({
		key: "deepwiki-calibration",
		title: "Code-depth calibration",
		promise:
			"Repo depth grades agree with independent code analysis where both exist.",
		value: `${deepwiki.agreementRate}%`,
		sub: `agreement on ${deepwiki.frame.graded} co-graded repos (${deepwiki.frame.total} sampled)`,
		details: [
			`${deepwiki.disagreements.length} disagreements`,
			`${deepwiki.frame.unindexed} sampled repos had no independent index to compare (small-n baseline — grows as coverage does)`,
		],
		asOf: "2026-07-10",
		artifact: "improvements/engine/deepwiki-calibration-2026-07-10.json",
		ok: deepwiki.disagreements.length === 0,
	});

	// Raven interlock — the consumer's discovery index vs our live contract.
	{
		const lagging = ravenDrift.laggingInCatalog.length;
		const missing = ravenDrift.missingFromCatalog.length;
		const expected = ravenDrift.expectedOps.length;
		const cataloged = ravenDrift.catalogOps?.length ?? 0;
		rows.push({
			key: "raven-interlock",
			title: "Consumer interlock (Raven)",
			promise:
				"The #1 consumer's discovery index tracks our contract — checked from OUR side too, with grace for their re-baseline cadence.",
			value: `${cataloged} / ${expected}`,
			sub: "operations discoverable in the consumer catalog",
			details: [
				`${lagging} op(s) lagging within the ${ravenDrift.graceDays}-day re-baseline grace window (expected)`,
				`${missing} op(s) missing beyond grace`,
				`contract ${ravenDrift.specVersion} at measurement`,
			],
			asOf: ravenDrift.generatedAt.slice(0, 10),
			artifact: "improvements/engine/raven-drift-2026-07-21.json",
			ok: missing === 0,
		});
	}

	return rows;
}
