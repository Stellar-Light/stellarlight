/**
 * /quality artifact reader, the ONLY data source for the public scoreboard.
 *
 * Hard rule (improvements/ideas/idea-scale-model.md): NO hand-set numbers.
 * Every figure on /quality is statically imported from a committed artifact in
 * improvements/, the page cannot drift from what the engines measured, and it
 * only changes when a new artifact lands (commit → deploy). Each row carries
 * the artifact path so every number links to its reproducible evidence.
 */

import northStarSeries from "../../improvements/audits/north-star-series.json";
import deepwiki from "../../improvements/engine/deepwiki-calibration-2026-07-10.json";
import engineE from "../../improvements/engine/engine-e-baseline-2026-08-28.json";
import ravenDrift from "../../improvements/engine/raven-drift-2026-08-28.json";
// Through-Raven consumer path, golden questions graded via the REAL gateway
// (scripts/raven-loop.ts, local-run). Distinct from the direct-API golden eval:
// this is what the SDF agent actually experiences.
import ravenLoop from "../../improvements/engine/raven-loop-latest.json";
import scfMembership from "../../improvements/engine/scf-membership-2026-08-28.json";
import corpusHealth from "../../improvements/engine/weekly/corpus-health-latest.json";
import engineARecall from "../../improvements/engine/weekly/engine-a-recall-latest.json";
import engineDDemand from "../../improvements/engine/weekly/engine-d-demand-latest.json";
import goldenEval from "../../improvements/engine/weekly/golden-eval-latest.json";
// The improvement ledger, the spine: every detector's findings normalized into
// one status-tracked backlog (scripts/improvement-ledger.ts). This row is the
// SYSTEM's own health, not any single engine's.
import improvementLedger from "../../improvements/engine/weekly/improvement-ledger-latest.json";
import qualityEntities from "../../improvements/quality/entities.json";
import externalFindings from "../../improvements/quality/external-findings.json";
import qualityHistory from "../../improvements/quality/history.json";
// Weekly evidence, fixed -latest paths committed by engine-c-health every
// Sunday (see improvements/engine/weekly/README.md); git history = archive.
import missFunnel from "../../improvements/quality/miss-funnel.json";
import qualityProgress from "../../improvements/quality/progress.json";
import honestyBaseline from "../../specs/honesty-baseline.json";
import opacityBaseline from "../../specs/opacity-baseline.json";
import openapi from "../../specs/openapi.json";
import { EVIDENCE_GRACE_DAYS } from "./improvement-ledger";

const REPO_BLOB = "https://github.com/Stellar-Light/stellarlight/blob/main";

export function evidenceUrl(path: string): string {
	return `${REPO_BLOB}/${path}`;
}

/** Whole days between an ISO date and `now`, floored at 0. */
const daysSince = (iso: string, now: Date) =>
	Math.max(
		0,
		Math.round(
			(now.getTime() - new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime()) /
				86_400_000,
		),
	);

// ── North star ─────────────────────────────────────────────────────────────

export interface NorthStarPoint {
	date: string;
	label: string;
	okRate: number;
	ok: number | null;
	probes: number;
	evidence: string;
}

/** How old the headline number may be before the page must say so. The north
 * star is the one number the whole engine system optimizes; showing it without
 * an age when it is seven weeks old is the failure this page exists to refuse. */
export const NORTH_STAR_MAX_AGE_DAYS = 21;

export function getNorthStar(now: Date = new Date()): {
	target: number;
	series: NorthStarPoint[];
	latest: NorthStarPoint;
	ageDays: number;
	stale: boolean;
	belowTarget: boolean;
	/** null when nothing is wrong; otherwise the sentence the page must show */
	warning: string | null;
	/** The series mixes probe counts (597, 648, 198), so the points are NOT
	 * comparable as a single line. Published so a reader is not invited to
	 * read a trend across changing denominators. */
	comparableSeries: boolean;
} {
	const series = northStarSeries.series as NorthStarPoint[];
	const latest = series[series.length - 1];
	const ageDays = daysSince(latest.date, now);
	const stale = ageDays > NORTH_STAR_MAX_AGE_DAYS;
	const belowTarget = latest.okRate < northStarSeries.target;
	const probeCounts = new Set(series.map((p) => p.probes));
	const warnings: string[] = [];
	if (stale)
		warnings.push(
			`last measured ${ageDays} days ago (${latest.date}), past the ${NORTH_STAR_MAX_AGE_DAYS}-day window this number is meant to hold for`,
		);
	if (belowTarget)
		warnings.push(
			`${latest.okRate}% is below the ${northStarSeries.target}% target`,
		);
	if (probeCounts.size > 1)
		warnings.push(
			`the ${series.length} points were measured over different probe counts (${[...probeCounts].join(", ")}), so they do not form a comparable trend line`,
		);
	return {
		target: northStarSeries.target,
		series,
		latest,
		ageDays,
		stale,
		belowTarget,
		warning: warnings.length ? warnings.join("; ") : null,
		comparableSeries: probeCounts.size === 1,
	};
}

// ── Guard rows ─────────────────────────────────────────────────────────────

/** How often this guard's evidence is supposed to be refreshed. A measurement
 * older than its own cadence allows is not evidence of health, it is absence
 * of measurement, and the two must never render alike. */
export type GuardCadence = "weekly" | "on-deploy" | "baseline";

/** Days of evidence age each cadence tolerates before the row goes `stale`.
 * `baseline` is a one-off measurement of a thing that does not change on its
 * own (a probe of documented behaviour, a calibration against a fixed sample);
 * it still ages, just far more slowly than a weekly sweep. */
export const GUARD_FRESHNESS: Record<GuardCadence, number> = {
	weekly: 10,
	"on-deploy": 14,
	baseline: 120,
};

/** holding = measured and passing. breached = measured and failing.
 * stale = the evidence is too old to support either claim. */
export type GuardState = "holding" | "breached" | "stale";

export interface GuardRow {
	key: string;
	title: string;
	/** What this guard promises, in one line. */
	promise: string;
	/** The headline as NUMBERS, so a consumer never parses prose. `of` is null
	 * for rows whose headline is a rate or a bare count with no denominator. */
	measure: { value: number; of: number | null; unit: string };
	/** Headline stat, rendered for humans. Derived from `measure`. */
	value: string;
	/** Qualifier under the headline. */
	sub: string;
	/** Detail bullets, every one grounded in the artifact. */
	details: string[];
	/** Measurement date, ISO yyyy-mm-dd, read from the ARTIFACT'S own
	 * generatedAt. Never "now", and never prose like "latest weekly run". */
	asOf: string;
	/** Age of the evidence in days, at render time. */
	ageDays: number;
	cadence: GuardCadence;
	/** How old this row's evidence may be before `state` becomes "stale". */
	freshnessDays: number;
	state: GuardState;
	/** What it costs us if this guard is breached. Drives ordering. */
	severity: "high" | "medium" | "low";
	/** Repo path of the committed artifact backing this row. */
	artifact: string;
	/** Kept for existing callers. true ONLY when state === "holding":
	 * a stale row is never green. */
	ok: boolean;
}

/** Single construction path for every guard row. Age, state and the rendered
 * headline are DERIVED here, so a row cannot claim green on evidence too old
 * to support it, and `value` cannot drift from `measure`. */
function guard(
	r: Omit<GuardRow, "value" | "ageDays" | "freshnessDays" | "state" | "ok"> & {
		/** the guard's own pass/fail verdict, IGNORING freshness */
		passing: boolean;
		/** override the rendered headline where numbers alone read badly */
		value?: string;
	},
	now: Date,
): GuardRow {
	const ageDays = daysSince(r.asOf, now);
	const freshnessDays = GUARD_FRESHNESS[r.cadence];
	const state: GuardState =
		ageDays > freshnessDays ? "stale" : r.passing ? "holding" : "breached";
	const value =
		r.value ??
		(r.measure.of === null
			? `${r.measure.value}${r.measure.unit === "%" ? "%" : ""}`
			: `${r.measure.value}/${r.measure.of}`);
	return {
		key: r.key,
		title: r.title,
		promise: r.promise,
		measure: r.measure,
		value,
		sub: r.sub,
		details: r.details,
		asOf: r.asOf.slice(0, 10),
		ageDays,
		cadence: r.cadence,
		freshnessDays,
		state,
		severity: r.severity,
		artifact: r.artifact,
		ok: state === "holding",
	};
}

/** Committed floor for the real-demand OK-rate. A ratchet, not an aspiration:
 * set 2026-08-28 from that day's reading (84%) rounded down to the nearest 5,
 * so the row goes red on regression rather than never going red at all. It may
 * only be raised, and raising it is how this number improves. */
export const DEMAND_FLOOR = 80;

export function getGuardRows(now: Date = new Date()): GuardRow[] {
	const g = (r: Parameters<typeof guard>[0]) => guard(r, now);
	// The two ratchet rows below are not snapshots. check-schema-opacity.ts and
	// check-honesty-layer.ts run inside contract:check on EVERY pull request and
	// every deploy, so their evidence is the build that produced this page, and
	// dating them to the build is the accurate reading, not a freshness dodge.
	const BUILD_STAMP = now.toISOString();

	return [
		// SCF membership cross-check, data-truth vs communityfund.stellar.org.
		// roundsOverstated is part of the promise, not a footnote: a row-level
		// match with 13 bad per-round claims underneath is still an overclaim,
		// and excluding it from `passing` was how this guard stayed green while
		// its own detail line printed the failures.
		(() => {
			const frame = scfMembership.frame;
			const overstated = scfMembership.overstated.length;
			const understated = scfMembership.understated.length;
			const roundsOverstated = scfMembership.roundsOverstated.length;
			const bad = overstated + understated + roundsOverstated;
			return g({
				key: "scf-crosscheck",
				title: "SCF funding cross-check",
				promise:
					"No project overstates or understates SCF membership, at the project level OR the round level, against the fund's own directory.",
				measure: { value: bad, of: frame.roundsChecked, unit: "claims" },
				value: `${bad}`,
				sub: "bad membership claims (project + round level)",
				details: [
					`${frame.matched} matched records checked against ${frame.scf} SCF projects`,
					`${overstated} overstated / ${understated} understated at project level`,
					`${roundsOverstated} round-level overclaims across ${frame.roundsChecked} verified claims`,
				],
				asOf:
					(scfMembership as { generatedAt?: string }).generatedAt ??
					"2026-08-28",
				cadence: "baseline",
				severity: "high",
				artifact: "improvements/engine/scf-membership-2026-08-28.json",
				passing: bad === 0,
			});
		})(),

		// Engine E, contract honesty probe. A silent param and four
		// invalid-accepted params ARE the failures this promise forbids, so the
		// row fails on them. The old headline was the probe COUNT (229) sitting
		// in the slot every other row uses for a pass ratio.
		(() => {
			const frame = engineE.frame;
			const silent = engineE.silentParams.length;
			const invalid = engineE.invalidAccepted.length;
			const probed = frame.paramsProbed + frame.fieldsChecked;
			return g({
				key: "contract-probe",
				title: "Contract honesty probe (Engine E)",
				promise:
					"Documented params do something, undocumented values are rejected. The contract a stranger hits behaves as written.",
				measure: { value: silent + invalid, of: probed, unit: "violations" },
				value: `${silent + invalid}`,
				sub: `violations across ${probed} params + fields probed on ${frame.ops} operations`,
				details: [
					`${silent} param(s) documented but silently ignored`,
					`${invalid} param(s) accepting values the spec forbids`,
					`spec ${engineE.specVersion} at measurement; re-run on every deploy`,
				],
				asOf: (engineE as { generatedAt?: string }).generatedAt ?? "2026-08-28",
				cadence: "baseline",
				severity: "high",
				artifact: "improvements/engine/engine-e-baseline-2026-08-28.json",
				passing: silent === 0 && invalid === 0,
			});
		})(),

		g({
			key: "deepwiki-calibration",
			title: "Code-depth calibration",
			promise:
				"Repo depth grades agree with independent code analysis where both exist.",
			measure: { value: deepwiki.agreementRate, of: null, unit: "%" },
			sub: `agreement on ${deepwiki.frame.graded} co-graded repos (${deepwiki.frame.total} sampled)`,
			details: [
				`${deepwiki.disagreements.length} disagreements`,
				`${deepwiki.frame.unindexed} sampled repos had no independent index to compare (small-n baseline, grows as coverage does)`,
			],
			asOf: "2026-07-10",
			cadence: "baseline",
			severity: "low",
			artifact: "improvements/engine/deepwiki-calibration-2026-07-10.json",
			passing: deepwiki.disagreements.length === 0,
		}),

		// Raven interlock, the consumer's discovery index vs our live contract.
		(() => {
			const lagging = ravenDrift.laggingInCatalog.length;
			const missing = ravenDrift.missingFromCatalog.length;
			const expected = ravenDrift.expectedOps.length;
			const cataloged = ravenDrift.catalogOps?.length ?? 0;
			return g({
				key: "raven-interlock",
				title: "Consumer interlock (Raven)",
				promise:
					"The #1 consumer's discovery index tracks our contract, checked from OUR side too, with grace for their re-baseline cadence.",
				measure: { value: cataloged, of: expected, unit: "operations" },
				sub: "operations discoverable in the consumer catalog",
				details: [
					`${lagging} op(s) lagging within the ${ravenDrift.graceDays}-day re-baseline grace window (expected)`,
					`${missing} op(s) missing beyond grace`,
					`contract ${ravenDrift.specVersion} at measurement`,
				],
				asOf: ravenDrift.generatedAt,
				cadence: "on-deploy",
				severity: "high",
				artifact: "improvements/engine/raven-drift-2026-08-28.json",
				passing: missing === 0,
			});
		})(),

		// Engine A, recall matrix vs per-bucket floors (the red-line guard).
		(() => {
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
			return g({
				key: "engine-a-recall",
				title: "Recall floors (Engine A)",
				promise:
					"Generated known-item probes per bucket stay above their red-line floors, recall can't silently erode.",
				measure: {
					value: board.length - breaches.length,
					of: board.length,
					unit: "buckets",
				},
				sub: `buckets at/above floor · ${probes.toLocaleString("en-US")} probes`,
				details:
					breaches.length > 0
						? breaches.map(
								(b) =>
									`${b.bucket} at ${b.rate}% vs floor ${b.floor}%, open red`,
							)
						: ["all buckets above floor"],
				asOf: engineARecall.generatedAt,
				cadence: "weekly",
				severity: "high",
				artifact: "improvements/engine/weekly/engine-a-recall-latest.json",
				passing: breaches.length === 0,
			});
		})(),

		// Engine D, OK-rate on REAL consumer demand (replayed, not log-time).
		// This row used to be hardcoded green with the comment "informational,
		// no committed floor". A guard with no floor is not a guard. The floor
		// below is a RATCHET: set from a past reading, so the row goes red on
		// regression. It is not an aspiration, and it must only move up.
		g({
			key: "engine-d-demand",
			title: "Real-demand OK-rate (Engine D)",
			promise:
				"The queries real consumers actually sent are replayed live and keep answering at or above the committed floor. A miss on real demand outranks any synthetic finding.",
			measure: { value: engineDDemand.okRate, of: null, unit: "%" },
			sub: `of the top ${engineDDemand.frame.replayed} of ${engineDDemand.frame.distinctQueries.toLocaleString("en-US")} distinct real queries · floor ${DEMAND_FLOOR}%`,
			details: [
				`${engineDDemand.frame.realHits.toLocaleString("en-US")} real-consumer calls in the ${engineDDemand.windowDays}-day window`,
				`${(engineDDemand.misses as unknown[]).length} queries missing today, the standing fix queue`,
				`floor ${DEMAND_FLOOR}% is a ratchet from a prior reading, it may only move up`,
			],
			asOf: engineDDemand.generatedAt,
			cadence: "weekly",
			severity: "high",
			artifact: "improvements/engine/weekly/engine-d-demand-latest.json",
			passing: engineDDemand.okRate >= DEMAND_FLOOR,
		}),

		// Golden retrieval eval, correctness against a ground-truth answer key.
		// N/A = liveSource questions the static corpus is NOT meant to answer.
		(() => {
			const graded = goldenEval.graded as Array<{ status: string }>;
			const scored = graded.filter((x) => x.status !== "N/A");
			const na = graded.length - scored.length;
			const passed = scored.filter((x) => x.status === "PASS").length;
			return g({
				key: "golden-eval",
				title: "Golden retrieval eval",
				promise:
					"Known-true questions (answer key derived from the canonical directory) keep passing after every ship.",
				measure: { value: passed, of: scored.length, unit: "questions" },
				sub: "golden questions passing (scored)",
				details: [
					passed === scored.length
						? "full pass"
						: `${scored.length - passed} failing, each names its expected evidence`,
					...(na > 0
						? [
								`${na} N/A by design (live-source questions the static corpus doesn't answer)`,
							]
						: []),
					"re-run on every production deploy + weekly",
				],
				asOf: goldenEval.generatedAt,
				cadence: "on-deploy",
				severity: "high",
				artifact: "improvements/engine/weekly/golden-eval-latest.json",
				passing: passed === scored.length,
			});
		})(),

		// Corpus health, S5-S8 hygiene sweeps.
		// These keys do NOT share a shape: s5/s6/s8 are {count}, s7_stalled is a
		// LIST of stalled sources, and s7_coverage is a per-source coverage map
		// with no defect count at all. The old row ran `?.count ?? 0` over all of
		// them, so the list and the map both scored a clean 0 they never claimed.
		// Dispatch on the shape, and read s7_coverage through its own signal.
		(() => {
			// biome-ignore lint/suspicious/noExplicitAny: sweep shapes are heterogeneous by design
			const ch: any = corpusHealth;
			type Sweep = { key: string; defects: number | null; note: string };
			const sweeps: Sweep[] = [];
			// Declared-undateable sources stay visible even when s7 is clean —
			// an exemption the reader can't see is a silent one.
			const declared: string[] = [];
			for (const key of Object.keys(ch).filter((k) => /^s[5-8]_/.test(k))) {
				const v = ch[key];
				if (key === "s7_coverage") {
					// A coverage map's defect signal is its own per-source flags.
					// A source the sweep DECLARES structurally undateable (upstream
					// states no date — reason carried in the artifact) is reported,
					// never counted as a defect.
					const srcs = Object.values(v ?? {}) as Array<{
						undated?: boolean;
						stalled?: boolean;
						undateable?: boolean;
					}>;
					const undateable = srcs.filter((x) => x.undateable).length;
					const bad = srcs.filter(
						(x) => !x.undateable && (x.undated || x.stalled),
					).length;
					if (undateable && bad === 0 && srcs.length > 0)
						declared.push(
							`s7 coverage: ${undateable} source(s) structurally undateable (declared)`,
						);
					sweeps.push({
						key,
						defects: srcs.length === 0 ? null : bad,
						note:
							`${bad} of ${srcs.length} corpus sources undated or stalled` +
							(undateable
								? ` · ${undateable} structurally undateable (declared)`
								: ""),
					});
				} else if (Array.isArray(v)) {
					// An empty list is a CLAIM of emptiness, not a missing reading.
					sweeps.push({
						key,
						defects: v.length,
						note: `${v.length} flagged`,
					});
				} else if (typeof v?.count === "number") {
					sweeps.push({ key, defects: v.count, note: `${v.count} flagged` });
				} else {
					sweeps.push({
						key,
						defects: null,
						note: "NO READING in this artifact, counted as unknown not clean",
					});
				}
			}
			const blind = sweeps.filter((x) => x.defects === null);
			const dirty = sweeps.filter((x) => (x.defects ?? 0) > 0);
			const clean = sweeps.length - blind.length - dirty.length;
			return g({
				key: "corpus-health",
				title: "Corpus hygiene (S5-S8)",
				promise:
					"The research corpus stays clean: junk URLs, broken titles, staleness and mirror drift are swept weekly, and a sweep that returns no reading counts as unknown, never as clean.",
				measure: { value: clean, of: sweeps.length, unit: "sweeps" },
				sub: `sweeps clean · ${corpusHealth.frame.chunks.toLocaleString("en-US")} chunks / ${corpusHealth.frame.docs.toLocaleString("en-US")} docs`,
				details: [
					...[...dirty, ...blind].map(
						(x) => `${x.key.replace(/_/g, " ")}: ${x.note}`,
					),
					...declared,
					...(dirty.length === 0 && blind.length === 0
						? ["all sweeps clean"]
						: []),
				],
				asOf: corpusHealth.generatedAt,
				cadence: "weekly",
				severity: "medium",
				artifact: "improvements/engine/weekly/corpus-health-latest.json",
				passing: dirty.length === 0 && blind.length === 0,
			});
		})(),

		// Through-Raven consumer path: the golden questions run through the LIVE
		// Raven gateway (routing + our op + envelope + coaching), not our API.
		(() => {
			const rl = ravenLoop;
			const misses = rl.misses as Array<{
				query: string;
				mode: string;
				failureMode: string;
			}>;
			return g({
				key: "raven-consumer-path",
				title: "Consumer path (through Raven)",
				promise:
					"The canonical questions answer correctly through the REAL Raven gateway: routing, our op, the response envelope and coaching, not just our direct API.",
				measure: {
					value: rl.frame.passed,
					of: rl.frame.graded,
					unit: "questions",
				},
				sub: `golden Qs answered through the live gateway · ${Math.round(rl.okRate * 100)}%`,
				details:
					misses.length > 0
						? misses.map(
								(m) =>
									`${m.mode}: "${m.query.slice(0, 48)}", ${m.failureMode} → consumer finding`,
							)
						: [
								`every gradeable golden question answers correctly through Raven (${rl.frame.graded} checked)`,
							],
				asOf: rl.generatedAt,
				cadence: "on-deploy",
				severity: "high",
				artifact: "improvements/engine/raven-loop-latest.json",
				passing: rl.okRate >= 0.95,
			});
		})(),

		// The improvement ledger, the spine that unifies every detector above
		// into one tracked backlog, tagged by surface.
		(() => {
			// A fully healthy artifact commits quietSources: [] and TS infers
			// never[] from the JSON literal, breaking .source access — the same
			// empty-array inference the ravenLoop misses cast handles. Omit, not
			// intersect: never[] & T[] still has never elements.
			const L = improvementLedger as Omit<
				typeof improvementLedger,
				"quietSources"
			> & {
				quietSources: Array<{
					source: string;
					days: number | null;
					open: number;
				}>;
			};
			const surfaces = L.bySurface
				.map((x) => `${x.surface} ${x.open}`)
				.join(" · ");
			return g({
				key: "improvement-ledger",
				title: "Improvement ledger",
				promise:
					"Every quality detector's findings land in one tracked backlog by surface. A backlog is fine; a HIGH-severity finding neglected past 30 days is the failure, that's this row's red line.",
				measure: { value: L.open, of: L.total, unit: "findings" },
				value: `${L.open} open`,
				sub: `${L.highOpen} high · ${L.inWave} in a wave · ${Math.round(L.closingRate * 100)}% closed`,
				details: [
					`open by surface: ${surfaces}`,
					`${L.total} tracked · ${L.inWave} in-wave · ${L.verified} verified · ${L.cleared} auto-cleared (detector stopped flagging)`,
					L.staleHighOpen > 0
						? `${L.staleHighOpen} high-severity finding(s) stale >30d, work them down`
						: "no high-severity finding neglected past 30 days",
					// A quiet detector is a DIFFERENT failure from bad data, and
					// the board must never render them alike.
					L.quietSources.length > 0
						? `⚠ ${L.quietSources
								.map(
									(q) =>
										`${q.source} (${q.days === null ? "never stamped" : `${q.days}d`}, ${q.open} open)`,
								)
								.join(
									", ",
								)}, evidence past the ${EVIDENCE_GRACE_DAYS}d window; ${L.unverifiedOpen} open finding(s) unconfirmed`
						: `all detectors reporting within ${EVIDENCE_GRACE_DAYS}d, every open finding is a confirmed one`,
				],
				asOf: L.generatedAt,
				cadence: "weekly",
				severity: "high",
				// This row reads the weekly SNAPSHOT, not the live ledger. Citing
				// findings.json here let the snapshot's stale open-count sit on the
				// same page as the live one, each claiming the same source.
				artifact: "improvements/engine/weekly/improvement-ledger-latest.json",
				// Blind is not green.
				passing: L.staleHighOpen === 0 && L.quietSources.length === 0,
			});
		})(),

		// Contract-opacity ratchet (QUALITY.md L1), enforced by contract:check on
		// every PR. The old row read "0 / 0" and was hardcoded green while its own
		// detail line admitted 47 open maps. 47 undeclared response shapes IS the
		// breach; the ratchet is the plan for closing it, not a reason to call it
		// closed.
		g({
			key: "contract-opacity",
			title: "Response-shape opacity (build-enforced)",
			promise:
				"No silent opacity: every response object declares its shape. Grandfathered open maps are counted here and the count may only fall.",
			measure: { value: opacityBaseline.openMaps, of: null, unit: "open maps" },
			value: `${opacityBaseline.openMaps}`,
			sub: "grandfathered open maps (additionalProperties: true) still undeclared",
			details: [
				`${opacityBaseline.openMaps} response objects still return an undeclared shape`,
				"the ratchet fails the build if that number rises; it may only fall",
				"a NEW operation shipping without a declared shape fails the build outright",
				"scripts/contract/check-schema-opacity.ts, wired into contract:check",
			],
			asOf: BUILD_STAMP,
			cadence: "on-deploy",
			severity: "medium",
			artifact: "specs/opacity-baseline.json",
			passing: opacityBaseline.openMaps === 0,
		}),

		// The match-label ratchet, separate guard, separate key. This one DOES
		// hold: every q-taking operation declares how it matched.
		(() => {
			const ops = Object.values(
				honestyBaseline.operations as Record<string, { exempt: boolean }>,
			);
			const unlabelled = ops.filter((o) => !o.exempt).length;
			return g({
				key: "contract-honesty",
				title: "Match labelling (build-enforced)",
				promise:
					"Every q-taking operation declares HOW it matched, so a caller can tell an exact hit from a semantic neighbour. Enforced in CI.",
				measure: { value: unlabelled, of: ops.length, unit: "operations" },
				value: `${unlabelled}`,
				sub: `q-taking operations still missing a match label, of ${ops.length} tracked`,
				details: [
					`${ops.length} q-taking operation(s) tracked, ${unlabelled} unlabelled`,
					"a new q-taking operation shipping without a match label fails the build",
					"scripts/contract/check-honesty-layer.ts, wired into contract:check",
				],
				asOf: BUILD_STAMP,
				cadence: "on-deploy",
				severity: "medium",
				artifact: "specs/honesty-baseline.json",
				passing: unlabelled === 0,
			});
		})(),
	];
}

export interface TrendPoint {
	date: string;
	value: number | null;
}
export interface TrendSeries {
	key: string;
	title: string;
	/** which direction is improvement, labels the delta honestly */
	goodWhen: "up" | "down";
	unit?: string;
	points: TrendPoint[];
}

/** The committed entity + findings artifact behind /quality's Findings and
 * Per-entity sections (scripts/quality/build-quality-artifact.ts). */

// ── Per-operation quality ──────────────────────────────────────────────────
// An agent calls `searchProjects`. It does not call "the retrieval surface".
// Every quality number we published was rolled up to surfaces, so a caller
// holding an operationId had no way to ask "is THIS call trustworthy?".
// Everything below is real evidence from the contract probe, joined by the
// operation string the probe itself records ("GET /api/projects/search"), and
// an operation the probe never reached is reported as UNMEASURED, never clean.

export interface OperationQuality {
	operationId: string;
	method: string;
	path: string;
	/** "clean" | "violations" | "skipped" | "unmeasured" */
	contractProbe: "clean" | "violations" | "skipped" | "unmeasured";
	/** why the probe skipped it, verbatim from the artifact */
	skipReason: string | null;
	violations: Array<{ kind: string; name: string; evidence: string }>;
	/** documented-but-absent and served-but-undocumented response fields */
	fieldDrift: Array<{ kind: string; field: string }>;
	probedAt: string;
}

type OpFinding = {
	op: string;
	param?: string;
	field?: string;
	evidence?: string;
};

export function getOperationQuality(): OperationQuality[] {
	const e = engineE as unknown as {
		frame: { skipped: string[]; opsReached?: string[] };
		silentParams: OpFinding[];
		invalidAccepted: OpFinding[];
		missingFields: OpFinding[];
		undocumentedFields: OpFinding[];
	};
	const paths = (
		openapi as unknown as {
			paths: Record<string, Record<string, { operationId?: string }>>;
		}
	).paths;

	const collect = (list: OpFinding[], key: string) =>
		list.map((x) => ({
			op: x.op,
			kind: key,
			name: x.param ?? x.field ?? "",
			evidence: x.evidence ?? "",
		}));
	const all = [
		...collect(e.silentParams, "documented param silently ignored"),
		...collect(e.invalidAccepted, "invalid value accepted"),
	];
	const drift = [
		...collect(e.missingFields, "documented but absent"),
		...collect(e.undocumentedFields, "served but undocumented"),
	];

	// The probe records the operations it reached (engine-e-contract.ts). Until
	// the artifact carrying that list is regenerated, opsReached is absent and
	// every op without a finding reads UNMEASURED. That is the safe direction:
	// it under-claims coverage rather than presenting silence as a clean bill.
	const PROBE_REACHED = new Set(e.frame.opsReached ?? []);

	const rows: OperationQuality[] = [];
	for (const [path, methods] of Object.entries(paths)) {
		for (const [method, def] of Object.entries(methods)) {
			if (!def?.operationId) continue;
			const opKey = `${method.toUpperCase()} ${path}`;
			const skipped = e.frame.skipped.find((sx) => sx.startsWith(opKey));
			const violations = all
				.filter((x) => x.op === opKey)
				.map(({ kind, name, evidence }) => ({ kind, name, evidence }));
			const fieldDrift = drift
				.filter((x) => x.op === opKey)
				.map(({ kind, name }) => ({ kind, field: name }));
			// An operation with no violations is only CLEAN if the probe actually
			// reached it. Absence of a finding from an unprobed op is absence of
			// measurement, and the two must never render alike.
			const reached =
				violations.length > 0 ||
				fieldDrift.length > 0 ||
				PROBE_REACHED.has(opKey);
			rows.push({
				operationId: def.operationId,
				method: method.toUpperCase(),
				path,
				contractProbe: skipped
					? "skipped"
					: violations.length > 0
						? "violations"
						: reached
							? "clean"
							: "unmeasured",
				skipReason: skipped ? skipped.slice(opKey.length).trim() : null,
				violations,
				fieldDrift,
				probedAt:
					(engineE as { generatedAt?: string }).generatedAt?.slice(0, 10) ??
					"2026-08-28",
			});
		}
	}
	return rows.sort(
		(a, b) =>
			b.violations.length - a.violations.length ||
			a.operationId.localeCompare(b.operationId),
	);
}

export function getEntities() {
	return qualityEntities;
}

/** Where known-item misses die, measured by replaying every open recall
 * finding live (scripts/quality/classify-misses.ts). */
export function getMissFunnel() {
	return missFunnel;
}

/** Phase progress + the written library (lessons, audits, receipts), read
 * from QUALITY.md and the repo (scripts/quality/build-progress-artifact.ts). */
export function getProgress() {
	return qualityProgress;
}

/** Defects filed against this service by stellar-raven, its largest agent
 * consumer, from that project's own evaluation battery. */
export function getExternalFindings() {
	return externalFindings;
}

/** The raw daily history rows for the composed trend chart. */
export function getTrendHistory() {
	return qualityHistory;
}
