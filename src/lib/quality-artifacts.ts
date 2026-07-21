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
// Weekly evidence — fixed -latest paths committed by engine-c-health every
// Sunday (see improvements/engine/weekly/README.md); git history = archive.
import corpusHealth from "../../improvements/engine/weekly/corpus-health-latest.json";
import engineARecall from "../../improvements/engine/weekly/engine-a-recall-latest.json";
import engineDDemand from "../../improvements/engine/weekly/engine-d-demand-latest.json";
import goldenEval from "../../improvements/engine/weekly/golden-eval-latest.json";

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

	// ── Weekly evidence rows (fixed -latest artifacts, committed by CI) ─────

	// Engine A — recall matrix vs per-bucket floors (the red-line guard).
	{
		const board = engineARecall.board as Array<{
			bucket: string;
			ok: number;
			total: number;
			rate: number;
			floor: number;
			status: string;
		}>;
		const breaches = board.filter((b) => b.rate < b.floor);
		const probes = board.reduce((n, b) => n + b.total, 0);
		rows.push({
			key: "engine-a-recall",
			title: "Recall floors (Engine A)",
			promise:
				"Generated known-item probes per bucket stay above their red-line floors — recall can't silently erode.",
			value: `${board.length - breaches.length}/${board.length}`,
			sub: `buckets at/above floor · ${probes.toLocaleString("en-US")} probes`,
			details:
				breaches.length > 0
					? breaches.map(
							(b) =>
								`${b.bucket} at ${b.rate}% vs floor ${b.floor}% — open red`,
						)
					: ["all buckets above floor"],
			asOf: "latest weekly run",
			artifact: "improvements/engine/weekly/engine-a-recall-latest.json",
			ok: breaches.length === 0,
		});
	}

	// Engine D — OK-rate on REAL consumer demand (replayed, not log-time).
	{
		const frame = engineDDemand.frame;
		rows.push({
			key: "engine-d-demand",
			title: "Real-demand OK-rate (Engine D)",
			promise:
				"The queries real consumers actually sent are replayed live — a miss on real demand outranks any synthetic finding.",
			value: `${engineDDemand.okRate}%`,
			sub: `top ${frame.replayed} of ${frame.distinctQueries.toLocaleString("en-US")} distinct real queries`,
			details: [
				`${frame.realHits.toLocaleString("en-US")} real-consumer calls in the ${engineDDemand.windowDays}-day window`,
				`${(engineDDemand.misses as unknown[]).length} queries missing today — the standing fix queue`,
			],
			asOf: "latest weekly run",
			artifact: "improvements/engine/weekly/engine-d-demand-latest.json",
			ok: true, // informational — no committed floor; misses feed the queue
		});
	}

	// Golden retrieval eval — correctness against a ground-truth answer key.
	// N/A = liveSource questions the static corpus is NOT meant to answer;
	// run-golden excludes them from scoring and so does this row (counting
	// them as failures was the same rows-only grader bug the consumer report
	// had — read the eval's own semantics, don't re-grade them).
	{
		const graded = goldenEval.graded as Array<{ status: string }>;
		const scored = graded.filter((g) => g.status !== "N/A");
		const na = graded.length - scored.length;
		const passed = scored.filter((g) => g.status === "PASS").length;
		rows.push({
			key: "golden-eval",
			title: "Golden retrieval eval",
			promise:
				"Known-true questions (answer key derived from the canonical directory) keep passing after every ship.",
			value: `${passed}/${scored.length}`,
			sub: "golden questions passing (scored)",
			details: [
				passed === scored.length
					? "full pass"
					: `${scored.length - passed} failing — each names its expected evidence`,
				...(na > 0
					? [
							`${na} N/A by design (live-source questions the static corpus doesn't answer)`,
						]
					: []),
				"re-run on every production deploy + weekly",
			],
			asOf: "latest weekly run",
			artifact: "improvements/engine/weekly/golden-eval-latest.json",
			ok: passed === scored.length,
		});
	}

	// Corpus health — S5-S8 hygiene sweeps over the research corpus.
	{
		const frame = corpusHealth.frame;
		// biome-ignore lint/suspicious/noExplicitAny: sweep keys are dynamic (s5_…s8_)
		const ch: any = corpusHealth;
		const sweeps = Object.keys(ch)
			.filter((k) => /^s[5-8]_/.test(k))
			.map((k) => ({
				key: k,
				count: Number(ch[k]?.count ?? 0),
			}));
		const dirty = sweeps.filter((s) => s.count > 0);
		rows.push({
			key: "corpus-health",
			title: "Corpus hygiene (S5–S8)",
			promise:
				"The research corpus stays clean — junk URLs, broken titles, staleness and mirror drift are swept weekly.",
			value: `${sweeps.length - dirty.length}/${sweeps.length}`,
			sub: `sweeps clean · ${frame.chunks.toLocaleString("en-US")} chunks / ${frame.docs.toLocaleString("en-US")} docs`,
			details:
				dirty.length > 0
					? dirty.map(
							(s) => `${s.key.replace(/_/g, " ")}: ${s.count} flagged — queued`,
						)
					: ["all sweeps clean"],
			asOf: "latest weekly run",
			artifact: "improvements/engine/weekly/corpus-health-latest.json",
			ok: dirty.length === 0,
		});
	}

	return rows;
}
