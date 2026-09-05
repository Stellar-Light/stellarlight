import { ArrowUpRight, Check, CircleSlash, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import {
	BarList,
	GapMatrix,
	Info,
	Metric,
	PhaseProgress,
	QueueRow,
	Sankey,
	StackedRamp,
	StatusSplit,
} from "@/components/quality/charts";
import {
	CoverageBar,
	GuardStateStrip,
	MiniHistogram,
	QualityScatter,
	StageBreakdown,
	StateHeatmap,
} from "@/components/quality/quality-charts-client";
import {
	LibraryComposed,
	TrendComposed,
} from "@/components/quality/quality-trend-composed";
import {
	evidenceUrl,
	getEntities,
	getExternalFindings,
	getGuardRows,
	getLaneAutonomy,
	getLanes,
	getMissFunnel,
	getNorthStar,
	getProgress,
	getTrendHistory,
} from "@/lib/quality-artifacts";

/**
 * /quality, the public quality scoreboard (idea-scale-model deliverable 1).
 *
 * Every number on this page is statically imported from a COMMITTED artifact
 * in improvements/ (see src/lib/quality-artifacts.ts) - no hand-set figures,
 * no live recomputation. The page changes only when a new engine run commits
 * its evidence. Each stat links the artifact that produced it.
 *
 * HIDDEN until boxy review (the idea's graduation gate): noindex, absent from
 * the sitemap allow-list, no nav/footer links. Flip = link it + drop noindex.
 */

export const metadata: Metadata = {
	title: "Data Quality | Stellar Light",
	description:
		"The StellarLight quality scoreboard, measured recall, data-truth cross-checks, contract honesty and consumer-interlock guards, every number linked to its reproducible run.",
	robots: {
		index: false,
		follow: false,
		googleBot: { index: false, follow: false },
	},
};

/** Borderless stat, same idiom as /analytics. */
function Stat({
	label,
	value,
	sub,
}: {
	label: string;
	value: string;
	sub?: string;
}) {
	return (
		<div>
			<div className="text-xs text-muted-foreground mb-1.5">{label}</div>
			<div className="text-3xl font-bold text-foreground tabular-nums tracking-tight leading-none">
				{value}
			</div>
			{sub && <div className="text-xs text-muted-foreground mt-1.5">{sub}</div>}
		</div>
	);
}

/** bklit-style card with corner crosshair dots, same idiom as /analytics. */
function Card({
	title,
	description,
	right,
	children,
	className = "",
}: {
	title: string;
	description?: string;
	right?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}) {
	const dot =
		"absolute w-[5px] h-[5px] rounded-full bg-foreground/25 border border-background";
	return (
		<div
			className={`relative rounded-xl border border-border bg-white/[0.02] ${className}`}
		>
			<span className={`${dot} -top-[3px] -left-[3px]`} />
			<span className={`${dot} -top-[3px] -right-[3px]`} />
			<span className={`${dot} -bottom-[3px] -left-[3px]`} />
			<span className={`${dot} -bottom-[3px] -right-[3px]`} />
			<div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
				<div>
					<h2 className="text-base font-semibold text-foreground">{title}</h2>
					{description && (
						<p className="text-xs text-muted-foreground mt-1 max-w-xl">
							{description}
						</p>
					)}
				</div>
				{right && (
					<div className="text-xs text-muted-foreground shrink-0">{right}</div>
				)}
			</div>
			<div className="px-5 pb-5">{children}</div>
		</div>
	);
}

function EvidenceLink({ path }: { path: string }) {
	return (
		<a
			href={evidenceUrl(path)}
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
		>
			evidence
			<ArrowUpRight className="h-3 w-3" />
		</a>
	);
}

export default function QualityPage() {
	const northStar = getNorthStar();
	const guards = getGuardRows();
	const qualityHistory = getTrendHistory();
	const entities = getEntities();
	const funnel = getMissFunnel();
	const progress = getProgress();
	const external = getExternalFindings();
	const laneAutonomy = getLaneAutonomy();

	return (
		<div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
			{/* header */}
			<header className="mb-10">
				<p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground mb-2">
					Measured, not asserted
				</p>
				<h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-3">
					Data quality
				</h1>
				<p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
					Every number below is read from a committed engine artifact, this page
					cannot say anything the runs didn&apos;t measure. Each stat links its
					reproducible evidence; each figure carries the date it was measured.
					The standing promises behind these guards live in{" "}
					<a
						href={evidenceUrl("DATA_SLA.md")}
						target="_blank"
						rel="noopener noreferrer"
						className="text-foreground underline underline-offset-2 hover:no-underline"
					>
						DATA_SLA.md
					</a>
					.
				</p>
			</header>

			{/* ── THE VERDICT, first. A reader deciding whether to trust a result
			     should not need 900 lines of breakdowns to find out. Derived from
			     the same guard states the cards at the bottom render. ── */}
			{(() => {
				const breached = guards.filter((g) => g.state === "breached");
				const stale = guards.filter((g) => g.state === "stale");
				const holding = guards.filter((g) => g.state === "holding");
				return (
					<Card
						title="Verdict: where this data stands right now"
						description="Derived from the guard states below, not written by hand. A guard is at target only when its evidence is both passing and fresh; below-target rows carry their own work queue, and aged evidence counts as unmeasured, never as passing."
						right={
							<a
								href="/api/quality"
								className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
							>
								same block as JSON
								<ArrowUpRight className="h-3 w-3" />
							</a>
						}
						className="mb-6"
					>
						<div className="mb-5">
							<GuardStateStrip
								guards={guards.map((g) => ({
									key: g.key,
									title: g.title,
									value: g.value,
									state: g.state,
								}))}
							/>
						</div>
						<div className="flex flex-wrap items-end gap-x-8 gap-y-4 mb-5">
							<Stat
								label="At target"
								value={String(holding.length)}
								sub="Passing on fresh evidence"
							/>
							<Stat
								label="Below target"
								value={String(breached.length)}
								sub="Measured, with an open work queue"
							/>
							<Stat
								label="Needs re-measure"
								value={String(stale.length)}
								sub="Evidence older than its own window"
							/>
							<Stat
								label="Open findings"
								value={String(entities.findings.open)}
								sub="Still reproducing on the latest run"
							/>
						</div>
						<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
							<div>
								<p className="text-xs font-medium text-foreground mb-2">
									Safe to rely on
								</p>
								<ul className="space-y-1.5">
									{holding.map((g) => (
										<li
											key={g.key}
											className="text-xs text-muted-foreground leading-relaxed"
										>
											<span className="text-foreground">{g.title}</span> ·{" "}
											{g.value} · measured {g.asOf}
										</li>
									))}
									<li className="text-xs text-muted-foreground leading-relaxed">
										<span className="text-foreground">Row coverage</span> · this
										page reads all {entities.projects.population} project rows
										from the unranked listing, a census, so no row hides by
										being hard to retrieve
									</li>
								</ul>
							</div>
							<div>
								<p className="text-xs font-medium text-foreground mb-2">
									Below target, being worked
								</p>
								<ul className="space-y-1.5">
									{breached.map((g) => (
										<li
											key={g.key}
											className="text-xs text-muted-foreground leading-relaxed"
										>
											<span className="text-foreground">{g.title}</span> is
											below target: {g.value} {g.measure.unit}, measured{" "}
											{g.asOf}
										</li>
									))}
									{stale.map((g) => (
										<li
											key={g.key}
											className="text-xs text-muted-foreground leading-relaxed"
										>
											<span className="text-foreground">{g.title}</span> needs a
											re-measure: last run {g.ageDays}d ago, past its{" "}
											{g.freshnessDays}d window, so its {g.value} is a reading
											of the past, not the present
										</li>
									))}
									{/* Only RELIABILITY problems belong in this column: staleness
									     and below-target. The probe-frame comparability caveat is
									     about how to read the chart, and it renders at the chart. */}
									{(northStar.stale || northStar.belowTarget) &&
										northStar.warning && (
											<li className="text-xs text-muted-foreground leading-relaxed">
												<span className="text-foreground">North star</span>:{" "}
												{northStar.warning}
											</li>
										)}
								</ul>
							</div>
						</div>
					</Card>
				);
			})()}

			{/* ── where we are against the stated plan, and how an agent reads this ── */}
			<Card
				title="Progress against the quality plan"
				description="Phase status is read from QUALITY.md itself, a phase cannot show green here without being green there. Remaining work is shown in the same weight as completed work."
				right={
					<a
						href="https://github.com/Stellar-Light/stellarlight/blob/main/QUALITY.md"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
					>
						The plan
						<ArrowUpRight className="h-3 w-3" />
					</a>
				}
				className="mb-6"
			>
				<PhaseProgress phases={progress.phases} />
			</Card>

			{/* ── the agent door, deliberately at the top, not a footnote ── */}
			<div className="mb-6 rounded-lg border border-border bg-card/40 p-4 sm:p-5">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div className="min-w-0">
						<p className="text-sm font-medium text-foreground mb-1">
							Reading this as an agent?
						</p>
						<p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
							Every number on this page is served as JSON: the verdict block
							first, then the north star with its age, per-operation contract
							state, known limitations, the gap matrix with real identifiers,
							the miss funnel, consumer findings, guard state and the trend
							history. No parameters, no key. Cached one hour and served stale
							up to a day while revalidating, so read meta.measuredAt, not the
							clock.
						</p>
					</div>
					<a
						href="/api/quality"
						className="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:border-muted-foreground transition-colors"
					>
						GET /api/quality
						<ArrowUpRight className="h-3.5 w-3.5" />
					</a>
				</div>
			</div>

			{/* north star — its own age check must render, not just exist in JSON */}
			<Card
				title="North star: full-surface audit ok-rate"
				description="Hundreds of cold, natural probes across every retrieval surface, graded against ground truth. The one number the whole engine system optimizes."
				right={<EvidenceLink path={northStar.latest.evidence} />}
				className="mb-6"
			>
				{/* Amber only for reliability problems (stale / below target). A
				     comparability caveat alone is a reading note, not an alarm. */}
				{northStar.warning &&
					(northStar.stale || northStar.belowTarget ? (
						<p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-amber-400">
							<TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
							<span>{northStar.warning}</span>
						</p>
					) : (
						<p className="mb-4 text-[11px] leading-relaxed text-muted-foreground">
							Reading note: {northStar.warning}
						</p>
					))}
				<div className="flex flex-wrap items-end gap-x-8 gap-y-4">
					<Stat
						label={`latest (${northStar.latest.date})`}
						value={`${northStar.latest.okRate}%`}
						sub={
							northStar.latest.ok != null
								? `${northStar.latest.ok}/${northStar.latest.probes} probes ok · target ≥${northStar.target}%`
								: `${northStar.latest.probes} probes · target ≥${northStar.target}%`
						}
					/>
					<div className="flex items-end gap-3 pb-1">
						{/* labelled per-point, NOT drawn as a line: the probe counts differ
						    (597/648/198) so these are separate measurements, not a trend */}
						{northStar.series.map((p) => (
							<a
								key={`${p.date}-${p.label}`}
								href={evidenceUrl(p.evidence)}
								target="_blank"
								rel="noopener noreferrer"
								title={`${p.label} - ${p.date}`}
								className="group text-center"
							>
								<div
									className={`text-lg font-semibold tabular-nums leading-none ${
										p === northStar.latest
											? "text-foreground"
											: "text-muted-foreground group-hover:text-foreground"
									} transition-colors`}
								>
									{p.okRate}%
								</div>
								<div className="text-[10px] text-muted-foreground mt-1">
									{p.date.slice(5)} · n={p.probes}
								</div>
							</a>
						))}
					</div>
				</div>
			</Card>

			{/* ── for consumers: read this before trusting a result ── */}
			<Card
				title="Known limitations: read before relying on this data"
				description="Derived from the measurements below, not written by hand: if a number improves, the entry changes or disappears. Each says what to do instead."
				right={
					<a
						href="/api/quality"
						className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
					>
						machine-readable
						<ArrowUpRight className="h-3 w-3" />
					</a>
				}
				className="mb-6"
			>
				<div className="flex flex-col gap-4">
					{entities.knownLimitations.map((l) => (
						<div key={l.area} className="flex flex-col gap-1">
							<div className="flex items-baseline gap-2 flex-wrap">
								<span className="text-xs font-medium text-foreground capitalize">
									{l.area}
								</span>
								<span className="text-[11px] text-muted-foreground tabular-nums">
									{l.measurement}
								</span>
							</div>
							<p className="text-xs text-muted-foreground leading-relaxed">
								{l.limit}
							</p>
							<p className="text-xs text-foreground/80 leading-relaxed">
								<span className="text-muted-foreground">Instead: </span>
								{l.instead}
							</p>
						</div>
					))}
				</div>
				<div className="mt-5 pt-5 border-t border-border">
					<p className="text-xs text-muted-foreground mb-3">
						Open findings by surface. A work queue, not an outage
					</p>
					<BarList
						rows={entities.surfaces.map((s) => ({
							label: s.surface,
							value: s.openFindings,
							note: s.means ?? undefined,
						}))}
						unit="open"
					/>
					<p className="text-[11px] text-muted-foreground leading-relaxed mt-3">
						An agent can fetch all of this, limitations, surface health, guard
						state, the score definitions and the trend, from{" "}
						<a
							href="/api/quality"
							className="text-foreground underline underline-offset-2 hover:no-underline"
						>
							GET /api/quality
						</a>
						, so trust calibration does not require reading a webpage.
					</p>
				</div>
			</Card>

			{/* ── the gap matrix: what is missing, where, and who closes it ── */}
			<Card
				title="Gap matrix: what is missing, by entity and field"
				description="One row per hole. Counts are samples with their denominator, and every row carries real identifiers so the gap can be worked or independently checked."
				right={
					<a
						href="/api/quality"
						className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
					>
						same data as JSON
						<ArrowUpRight className="h-3 w-3" />
					</a>
				}
				className="mb-6"
			>
				<GapMatrix rows={entities.gapMatrix.rows} />
			</Card>

			{/* ── the autonomy ladder: bounded agent lanes, counters measured ── */}
			<Card
				title="Agent lanes: autonomy earned, not assumed"
				description="A lane is a bounded, evidence-only job an agent runs on schedule. Advancement is measured — a lane earns auto-merge only after consecutive weeks where a human reviewed and changed nothing."
				className="mb-6"
			>
				{getLanes().map((lane) => (
					<div
						key={lane.lane}
						className="flex flex-wrap items-end gap-x-8 gap-y-4"
					>
						<Stat
							label={`Lane: ${lane.lane}`}
							value={`${lane.stamps.length} stamps`}
							sub="deployment facts, full-chain-or-abstain"
						/>
						<Stat
							label="Intervention-free weeks"
							value={`${lane.cleanWeeks} / ${lane.stageEntryThresholdWeeks}`}
							sub="to Stage 2 (auto-merge for bounded work)"
						/>
						<Stat
							label="Last run"
							value={lane.lastRun ? lane.lastRun.conclusion : "unknown"}
							sub={
								lane.lastRun
									? `${lane.lastRun.event} · ${lane.lastRun.at.slice(0, 10)}`
									: "no run recorded"
							}
						/>
						<Stat
							label="Corrections"
							value={String(lane.corrections.length)}
							sub="human had to fix a stamp — resets the counter"
						/>
					</div>
				))}
				<p className="text-[11px] text-muted-foreground leading-relaxed mt-4">
					Weeks are counted only from successful scheduled runs, and the counter
					is derived daily from the lane&apos;s live write-set diffed against
					the committed snapshot — a quiet failure reads as a red week, never a
					clean one. A stamp a human upgrades to human-verified stays clean; a
					stamp a human removes or changes resets the count to zero.
				</p>
			</Card>

			{/* ── the same counter, for EVERY lane that can write to production ── */}
			<Card
				title="Lane autonomy — intervention-free weeks"
				description="Every workflow in this repo that can write to production data, and the weeks each has earned toward running its execute unattended. Built by reading the workflow files, counted from GitHub's own run history, and reset by the intervention log — no lane's number is asserted here."
				right={
					<EvidenceLink path="improvements/audits/lane-autonomy-latest.json" />
				}
				className="mb-6"
			>
				<p className="text-xs text-muted-foreground mb-5">
					A week counts only when the lane executed and nothing it wrote was
					corrected.
				</p>
				<div className="flex flex-wrap items-end gap-x-8 gap-y-4 mb-5">
					<Stat
						label="Lanes that write to production"
						value={String(laneAutonomy.summary.lanes)}
						sub="derived from .github/workflows each run, not from a list"
					/>
					<Stat
						label={`At ${laneAutonomy.thresholdWeeks}+ clean weeks`}
						value={String(laneAutonomy.summary.eligibleForStage2)}
						sub="eligible — the promotion is still a human call"
					/>
					<Stat
						label="Could not check"
						value={String(laneAutonomy.summary.couldNotCheck)}
						sub="API refused; not counted as clean or broken"
					/>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full text-xs min-w-[640px]">
						<thead>
							<tr className="text-muted-foreground text-left">
								<th className="font-normal pb-2 pr-4">Lane</th>
								<th className="font-normal pb-2 pr-4">Cadence</th>
								<th className="font-normal pb-2 pr-4 text-right">
									Runs ({laneAutonomy.windowWeeks}w)
								</th>
								<th className="font-normal pb-2 pr-4 text-right">
									Clean weeks
								</th>
								<th className="font-normal pb-2">Last intervention</th>
							</tr>
						</thead>
						<tbody>
							{laneAutonomy.lanes.map((l) => (
								<tr key={l.id} className="border-t border-border align-top">
									<td className="py-2 pr-4 text-foreground">{l.id}</td>
									<td className="py-2 pr-4 text-muted-foreground tabular-nums">
										{l.cadence}
									</td>
									<td className="py-2 pr-4 text-right text-muted-foreground tabular-nums">
										{l.unattendedRuns === null
											? "—"
											: `${l.unattendedRuns} self-started (${l.attendedRuns} hand-dispatched)`}
									</td>
									<td className="py-2 pr-4 text-right text-foreground tabular-nums">
										{l.interventionFreeWeeks === null
											? "could not check"
											: l.interventionFreeWeeks}
									</td>
									<td className="py-2 text-muted-foreground max-w-md">
										{l.lastInterventionAt
											? `${l.lastInterventionAt} — ${l.lastInterventionWhat}`
											: "none logged"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<p className="text-[11px] text-muted-foreground leading-relaxed mt-4">
					Elapsed time earns nothing. The weeks must be consecutive and must run
					up to this one, so a lane nobody has run sits at zero however long it
					has been quiet, and four scattered good weeks are not four clean
					weeks. Only runs the lane started ITSELF count — a hand-dispatched
					execute is a person operating the lane, and is reported here rather
					than counted. The run counts are runs, not writes: which of them wrote
					is what the week count is proven from. Every counted execute is proven
					from that run&apos;s own job steps, never from today&apos;s copy of
					the workflow file: a step that was skipped moved nothing, whatever the
					file says now. A &ldquo;+&rdquo; marks a floor: GitHub does not expose
					a run&apos;s commands, so a step the author named and that actually
					ran could not be classified. Corrections live in{" "}
					<a
						href={evidenceUrl("improvements/lanes/interventions.json")}
						target="_blank"
						rel="noopener noreferrer"
						className="underline hover:text-foreground transition-colors"
					>
						improvements/lanes/interventions.json
					</a>
					, appended by the same PR that makes the correction.
				</p>
			</Card>

			{/* ── findings: what we actually found, cleared, and still owe ── */}
			<Card
				title="Findings: what the engines caught"
				description="Every detector writes here. This is the work queue, not a score."
				className="mb-6"
			>
				<div className="flex flex-wrap items-end gap-x-8 gap-y-4 mb-6">
					<Stat
						label="Open"
						value={String(entities.findings.open)}
						sub="Still reproducing"
					/>
					<Stat
						label="Cleared"
						value={String(entities.findings.cleared)}
						sub="stopped reproducing"
					/>
					<Stat
						label="Verified closed"
						value={String(entities.findings.verified)}
						sub="Re-probed after the fix"
					/>
				</div>
				<p className="text-[11px] text-muted-foreground leading-relaxed mb-5">
					The three states are disjoint and sum to {entities.findings.total}.
					Cleared is NOT confirmation the fix works; only verified means it was
					deliberately re-probed after a fix.
				</p>
				{/* The closure rule's metric (QUALITY.md §1), stated so it can move.
				    The old headline here was "repeat-class rate": a new finding counted
				    as a repeat when its §0 class had ANY prior finding. Across 8 broad
				    classes that is pinned near 100% however much repair lands, so it
				    is demoted to context below. What replaces it asks the question the
				    closure rule actually cares about: did something we closed WITHOUT
				    repairing come back? */}
				<div className="mb-6 pb-5 border-b border-border">
					<div className="flex flex-wrap items-end gap-x-8 gap-y-4 mb-3">
						<Stat
							label="Recurred after a silence-close (30d)"
							value={`${entities.findings.closure.recurredAfterSilence.last30d.ratePct}%`}
							sub={`${entities.findings.closure.recurredAfterSilence.last30d.recurred} of ${entities.findings.closure.recurredAfterSilence.last30d.newFindings} new findings`}
						/>
						<Stat
							label="Lifetime"
							value={`${entities.findings.closure.recurredAfterSilence.lifetime.ratePct}%`}
							sub={`${entities.findings.closure.recurredAfterSilence.lifetime.recurred} of ${entities.findings.closure.recurredAfterSilence.lifetime.newFindings} findings`}
						/>
						<Stat
							label="Reopened after closing"
							value={String(entities.findings.closure.reopened.count)}
							sub={`${entities.findings.closure.reopened.regressedFromVerified} of them had been VERIFIED`}
						/>
					</div>
					<p className="text-[11px] text-muted-foreground leading-relaxed">
						A recurrence is a NEW finding on a surface-and-failure-mode pair we
						had already closed <em>on silence</em> — the detector went quiet and
						nobody re-probed. It is the closure rule's real question: did we
						close without repairing, and did the same kind of failure come back?
						Steady state is that rate at zero. Reopened counts the exact-id
						version and is a lower bound, because re-clearing a reopened finding
						erases its stamp. These numbers are expected to start ugly;
						publishing them is the point.
					</p>
					<p className="text-[11px] text-muted-foreground leading-relaxed mt-2">
						For context, the repeat-<em>class</em> rate — a finding whose §0
						class (identity, taxonomy coverage, contract completeness…) already
						had any prior finding — is{" "}
						{entities.findings.closure.classRecurrence.last30d.ratePct}% over 30
						days across{" "}
						{entities.findings.closure.classRecurrence.byClass.length} classes.
						With classes that broad it cannot fall, so it is reported as context
						rather than steered by.
					</p>
				</div>
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
					<div className="flex flex-col gap-3">
						<p className="text-xs text-muted-foreground">
							By failure mode and state
						</p>
						<StateHeatmap rows={entities.findings.byFailureMode.slice(0, 9)} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-xs text-muted-foreground">
							How long the open ones have been open
						</p>
						<BarList
							rows={entities.findings.openByAge.map((b) => ({
								label: b.bucket,
								value: b.count,
							}))}
							unit="findings"
						/>
						<p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
							A tall bar on the right is the treadmill this page exists to end:
							detection outrunning remediation. An empty right bar just after a
							stale-findings sweep means old entries were re-probed and cleared,
							not remediated.
						</p>
					</div>
				</div>
				{entities.findings.recentlyCleared.length > 0 && (
					<div className="mt-6 pt-5 border-t border-border">
						<p className="text-xs text-muted-foreground mb-3">
							Recently cleared
						</p>
						<div className="flex flex-col gap-1.5">
							{entities.findings.recentlyCleared.map((c) => (
								<QueueRow
									key={`${c.probe}-${c.clearedAt}`}
									href={evidenceUrl("improvements/ledger/findings.json")}
									primary={c.probe}
									trailing={`${c.failureMode} · ${c.clearedAt}`}
								/>
							))}
						</div>
					</div>
				)}
			</Card>

			{/* ── what our biggest consumer files against us ── */}
			<Card
				title="Consumer findings from Raven"
				description="Defects filed against this service by stellar-raven, its largest agent consumer, from that project's own evaluation battery. These carry more signal than our internal detectors because the answer key is not ours."
				right={
					<a
						href="https://github.com/stellar-experimental/stellar-raven/tree/main/improvements/stellar-light-scout"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
					>
						Their records
						<ArrowUpRight className="h-3 w-3" />
					</a>
				}
				className="mb-6"
			>
				<div className="flex flex-wrap items-end gap-x-8 gap-y-4 mb-5">
					<Metric
						label="Filed against us"
						value={String(external.total)}
						sub="Across the project's lifetime"
						explain="Each is a defect their evaluation battery reproduced against a live surface of ours, with the probe and evidence recorded in their repository."
					/>
					<Metric
						label="Their answer key"
						value={`${(external.counts as Record<string, number>)["reported-upstream"] ?? 0} open`}
						sub={`${(external.counts as Record<string, number>)["declined-upstream"] ?? 0} declined by them`}
						explain="Status as THEIR records state it. A record stays reported-upstream until their re-verification runs; we never mark their findings closed."
					/>
					<Metric
						label="Fix shipped (our side)"
						value={`${external.ourResponse.fixShipped}/${external.ourResponse.fixApplicable}`}
						sub="Of the findings a fix applies to"
						goodWhen="higher"
						explain={`Scored by ${external.ourResponse.scoredBy} ${external.ourResponse.note}`}
					/>
				</div>
				<div className="mb-5">
					<p className="text-xs text-muted-foreground mb-2">
						Their answer key, by status
					</p>
					<StatusSplit
						counts={external.counts as Record<string, number>}
						total={external.total}
						order={[
							{
								key: "verified",
								label: "verified by them",
								color: "#c4b5fd",
							},
							{
								key: "fixed-upstream",
								label: "fixed, awaiting their re-check",
								color: "#a78bfa",
							},
							{
								key: "reported-upstream",
								label: "open",
								color: "#7c3aed",
							},
							{
								key: "declined-upstream",
								label: "declined by them",
								color: "#5b21b6",
								outline: true,
							},
						]}
					/>
				</div>
				<div className="flex flex-col">
					{external.records.map((r) => {
						const resp = (
							r as {
								ourResponse?: {
									state: string;
									url: string;
									closedAt: string | null;
								};
							}
						).ourResponse;
						const shipped = resp?.state === "closed";
						return (
							<QueueRow
								key={r.id}
								href={resp?.url ?? r.sourceUrl}
								primary={`${r.id.toUpperCase()} ${r.title}`}
								secondary={r.discovered ? `filed ${r.discovered}` : undefined}
								trailing={
									r.status === "declined-upstream"
										? "Declined by them"
										: shipped
											? `Fix shipped ${resp?.closedAt ?? ""}`
											: "Open on our side"
								}
							/>
						);
					})}
				</div>
				<p className="text-[11px] text-muted-foreground leading-relaxed mt-3">
					{external.ourResponse.note}
				</p>
			</Card>

			{/* ── the flow: where defects come from and where they end up ── */}
			<Card
				title="Defect flow: detector to surface to outcome"
				description="Every finding in the ledger traced through the system: which detector caught it, which surface it lives on, and whether it closed. Ribbon thickness is the count; whole-ledger, not a sample."
				right={
					<a
						href={evidenceUrl("improvements/ledger/findings.json")}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
					>
						The ledger
						<ArrowUpRight className="h-3 w-3" />
					</a>
				}
				className="mb-6"
			>
				{/* min-width only protects label legibility on phones; on anything
			     wider the chart measures its container and fills it. */}
				<div className="overflow-x-auto">
					<div className="min-w-[560px]">
						<Sankey
							nodes={entities.flow.nodes}
							links={entities.flow.links}
							height={360}
						/>
					</div>
				</div>
				<p className="text-[11px] text-muted-foreground leading-relaxed mt-3">
					Read left to right: a detector produces findings, they land on a
					surface, and they end Cleared, Open, or Verified. A fat ribbon into
					Open is a surface carrying real debt; a fat ribbon into Cleared is a
					detector whose class has been closed.
				</p>
			</Card>

			{/* ── WHERE a miss dies, not just how many ── */}
			<Card
				title="Where open recall misses die"
				description="Each open recall finding replayed live and classified at the FIRST stage that fails - mutually exclusive classes with different owners, not a funnel or a sequence."
				right={
					<a
						href="/api/quality"
						className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
					>
						same data as JSON
						<ArrowUpRight className="h-3 w-3" />
					</a>
				}
				className="mb-6"
			>
				<p className="text-xs text-muted-foreground mb-4">
					{funnel.population.sampled} of {funnel.population.openRecallMisses}{" "}
					open recall findings replayed
					{(funnel.population.unclassified ?? 0) > 0 && (
						<span className="text-amber-400">
							{" "}
							· {funnel.population.unclassified} more have probe shapes this
							replay cannot handle, so its coverage is{" "}
							{funnel.population.coveragePct}%, not 100%
						</span>
					)}
				</p>
				<StageBreakdown
					stages={funnel.stages}
					sampled={funnel.population.sampled}
				/>
			</Card>

			{/* ── per-entity quality: rows and repos, not just totals ── */}
			<Card
				title="Row quality: the evidence behind each record"
				description="Every project row scores on five facts we either hold or don't: a provenance basis, a date, a source URL, a type, and a link. A low score names exactly what is missing."
				className="mb-6"
			>
				<div className="flex flex-wrap items-end gap-x-8 gap-y-4 mb-6">
					<Metric
						label="Mean row evidence score"
						value={`${entities.projects.meanScore}%`}
						sub={`across all ${entities.projects.population} rows, a census, not a sample`}
						goodWhen="higher"
						explain="Per row: the count of five BINARY evidence facts present, times 20 - a strong provenance basis, a status date, a source URL, at least one type, at least one link. Scores land only on 0/20/40/60/80/100. 100 means all five present; it does NOT rate the project, only how well we can back what we publish about it."
					/>
				</div>
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
					<div className="flex flex-col gap-3">
						<p className="text-xs text-muted-foreground">
							Status provenance, strongest evidence first
						</p>
						<StackedRamp
							rows={entities.projects.basisMix.map((b) => ({
								label: b.basis,
								value: b.count,
							}))}
							total={entities.projects.population}
						/>
						<p className="text-[11px] text-muted-foreground leading-relaxed mt-1 inline-flex items-start gap-1.5">
							<span>
								Deployment fact (sls-079):{" "}
								{entities.projects.deploymentMix.map((m, i) => (
									<span key={m.network}>
										{i > 0 && " · "}
										<span className="text-foreground tabular-nums">
											{m.count}
										</span>{" "}
										{m.network}
									</span>
								))}
							</span>
							<Info text="Which network a product is deployed on, as a separate fact from lifecycle status. Populated ONLY from evidence (verified mainnet contract joins, on-chain readings, human-verified operator artifacts); unknown is the honest default and a work queue, never a score. The gap matrix carries the prominent rows to work first." />
						</p>
						<p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
							Most rows rest on{" "}
							<span className="text-foreground">site-liveness</span> - a page
							answered. That is the weakest honest basis we serve, and moving
							rows up this ramp is the standing data job.
						</p>
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-xs text-muted-foreground">
							What is missing, across all rows
						</p>
						<BarList
							rows={entities.projects.missingCounts.map((m) => ({
								label: m.field,
								value: m.count,
							}))}
							unit="rows missing it"
						/>
					</div>
				</div>
				<div className="mt-6 pt-5 border-t border-border">
					<p className="text-xs text-muted-foreground mb-3">
						Every row as one dot. The marked region is the curation queue.
					</p>
					<QualityScatter rows={entities.projects.scatter} />
				</div>
				<div className="mt-6 pt-5 border-t border-border">
					<p className="text-xs text-muted-foreground mb-3 inline-flex items-center gap-1.5">
						Curation queue: rows whose evidence is thinnest, prominent first
						<Info text="Sorted by evidence score ascending, then by curated prominence, so the most-seen thin rows surface first. Each line names exactly which of the five facts is missing." />
					</p>
					<div className="flex flex-col gap-1.5">
						{entities.projects.weakest.slice(0, 8).map((p) => (
							<QueueRow
								key={p.slug}
								href={`/project/${p.slug}`}
								primary={p.name}
								secondary={p.statusBasis ?? "no basis"}
								trailing={`missing ${p.missing.join(", ")} · ${p.score}%`}
							/>
						))}
					</div>
				</div>
			</Card>

			{/* ── repo quality ── */}
			<Card
				title="The code index: what it holds, how deeply we know it"
				description="2,920 curated repos (claimed by a project or a tracked builder) plus a 10,018-row Electric Capital tail indexed for completeness. The charts read over the curated index only - mixing the tail in made the curated index look unscanned when it is not."
				className="mb-6"
			>
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-6 mb-8">
					<div className="flex flex-col gap-3">
						<p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
							Repo score distribution, curated index
							<Info text="repoScore (0-100) grades freshness, traction and builder authority. A long low tail is EXPECTED in an open ecosystem - hackathon one-offs and early experiments are real code references worth indexing; the score is what keeps them ranked below production repos." />
						</p>
						<MiniHistogram
							buckets={entities.repos.curatedShape.scoreHistogram}
							unit="repos"
						/>
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
							Commit activity, curated index
							<Info text="Derived from each repo's last commit: active (<=90d), slowing (<=1y), dormant (older), archived, or unknown (no commit date held - not knowing is its own state, never counted as dormant)." />
						</p>
						<StackedRamp
							rows={entities.repos.curatedShape.activityMix.map((m) => ({
								label: m.label,
								value: m.count,
							}))}
							total={entities.repos.curatedShape.repos}
						/>
						<p className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1.5">
							Languages
						</p>
						<BarList
							rows={entities.repos.curatedShape.languageMix
								.slice(0, 6)
								.map((m) => ({ label: m.label, value: m.count }))}
							unit="repos"
						/>
					</div>
				</div>

				<p className="text-xs text-muted-foreground mb-3 inline-flex items-center gap-1.5">
					How deeply we know each layer
					<Info text="Three different jobs with three different denominators. Depth scanning aims at the whole curated index. Knowledge notes are a hand-curated research layer being built over the highest-scored repos - a small number is early progress, not missing homework. Mainnet joins are deliberately strict: only a verified on-chain attribution counts, so the number grows slowly and every unit of it is proof." />
				</p>
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10 gap-y-5 mb-6">
					<CoverageBar
						label="Depth-scanned"
						value={entities.repos.coverage.curatedIndex.withCodeDepth}
						of={entities.repos.coverage.curatedIndex.repos}
						intent="Curated repos with a code-depth reading (entry files, symbols, SDK usage). The scan waves aim at all of them."
					/>
					<CoverageBar
						label="Deep-researched notes"
						value={entities.repos.coverage.knowledgeNotes.withNotes}
						of={entities.repos.coverage.knowledgeNotes.pool}
						intent="Hand-curated dated facts with sources, written over the top-scored pool one repo at a time. An enrichment layer under construction, newest additions first."
					/>
					<CoverageBar
						label="Verified mainnet joins"
						value={entities.repos.coverage.mainnetJoin.joined}
						of={entities.repos.coverage.mainnetJoin.pool}
						intent="Deployable contracts with a PROVEN on-chain attribution. Strict by design: absence is absence of a join, never proof of disuse."
					/>
				</div>
				<p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
					Notes pool, honestly split: of{" "}
					{entities.repos.coverage.knowledgeNotes.pool.toLocaleString("en-US")}{" "}
					pool repos,{" "}
					{entities.repos.coverage.knowledgeNotes.withNotes.toLocaleString(
						"en-US",
					)}{" "}
					carry dated facts,{" "}
					{(entities.repos.coverage.knowledgeNotes.triaged ?? 0).toLocaleString(
						"en-US",
					)}{" "}
					were examined and yielded nothing durable (judged, recorded
					internally), and{" "}
					{(
						entities.repos.coverage.knowledgeNotes.missing?.length ?? 0
					).toLocaleString("en-US")}{" "}
					are still unexamined. A judged repo is not a gap.
				</p>
				<p className="text-[11px] text-muted-foreground leading-relaxed mb-6">
					Plus the Electric Capital tail:{" "}
					{entities.repos.coverage.tail.withCodeDepth.toLocaleString("en-US")}{" "}
					of {entities.repos.coverage.tail.repos.toLocaleString("en-US")} rows
					scanned opportunistically as budget allows - indexed for completeness,
					no coverage target attached.
				</p>
				{(entities.repos.duplicateRows ?? 0) > 0 && (
					<p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-amber-400">
						<TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
						<span>{entities.repos.duplicateNote}</span>
					</p>
				)}
				<p className="text-xs text-muted-foreground mb-3">
					Highest-graded repos
				</p>
				<div className="flex flex-col gap-1.5">
					{entities.repos.top.slice(0, 10).map((r) => (
						<QueueRow
							key={r.fullName}
							href={`https://github.com/${r.fullName}`}
							primary={r.fullName}
							trailing={`score ${r.repoScore} · depth ${r.codeDepth ?? "-"}% · ${r.notes} note${r.notes === 1 ? "" : "s"}`}
						/>
					))}
				</div>
			</Card>

			{/* ── the written record: why things are the way they are ── */}
			<Card
				title="Lessons and research"
				description="Every recurring defect class was written up when it was found, and every human-verified correction carries a committed receipt. These are the documents behind the numbers above."
				right={
					<a
						href={evidenceUrl("improvements/lessons")}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
					>
						All lessons
						<ArrowUpRight className="h-3 w-3" />
					</a>
				}
				className="mb-6"
			>
				{/* The record as growth: weekly stacked columns by kind under a
				     cumulative line that only rises. Weekly buckets keep quiet days
				     from reading as a dead surface. Dates come from the files. */}
				<div className="mb-6">
					<LibraryComposed
						entries={[
							...progress.library.lessons.map((l) => ({
								date: l.date,
								label: l.title.replace(/^Lessons?\s*[--]\s*/i, ""),
								kind: "lesson" as const,
							})),
							...progress.library.audits.map((a) => ({
								date: (a.name.match(/\d{4}-\d{2}-\d{2}/) ?? [""])[0],
								label: a.name,
								kind: "audit" as const,
							})),
							...progress.library.receipts.map((r) => ({
								date: r.fetchedAt ?? "",
								label: r.slug,
								kind: "receipt" as const,
							})),
						].filter((e) => e.date)}
					/>
				</div>
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
					<div className="flex flex-col gap-3">
						<p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
							Lesson write-ups
							<Info text="Each file records defects found on one day: what broke, the root cause, and the invariant or probe added so the class cannot silently return." />
						</p>
						<div className="flex flex-col">
							{progress.library.lessons.slice(0, 8).map((l) => (
								<QueueRow
									key={l.file}
									href={evidenceUrl(l.file)}
									primary={l.title.replace(/^Lessons?\s*[--]\s*/i, "")}
									trailing={
										l.lessonCount != null
											? `${l.date} · ${l.lessonCount} lessons`
											: l.date
									}
								/>
							))}
						</div>
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
							Correction receipts
							<Info text="A human-verified status change commits its evidence: the URL fetched, the time, response identity headers, and the exact markers on the page that decided the verdict. Re-run the capture to diff what a page says now against what it said then." />
						</p>
						<div className="flex flex-col">
							{progress.library.receipts.map((r) => (
								<QueueRow
									key={r.file}
									href={evidenceUrl(r.file)}
									primary={r.slug}
									secondary={r.markers.slice(0, 2).join(", ") || undefined}
									trailing={r.fetchedAt}
								/>
							))}
						</div>
						<p className="text-xs text-muted-foreground inline-flex items-center gap-1.5 mt-3">
							Audits
						</p>
						<div className="flex flex-col">
							{progress.library.audits.slice(0, 4).map((a) => (
								<QueueRow
									key={a.file}
									href={evidenceUrl(a.file)}
									primary={a.name}
									trailing="report"
								/>
							))}
						</div>
					</div>
				</div>
			</Card>

			{/* ── trends: real charts, and honest when there is no line yet ── */}
			<Card
				title="Trends"
				description="Daily history appended by the eval pipeline and committed, red days included. Battery probe counts rotate with the daily banks, so the pass line moves by design; the failure line and the ratchets are the signal."
				className="mb-6"
			>
				{/* One composed chart (bklit composed-chart form): stacked daily
				     battery outcomes as columns, the opacity ratchet as the line,
				     one shared scale, crosshair tooltip. Honest at any length -
				     the line waits for its second point. */}
				<TrendComposed
					rows={qualityHistory.map((r) => ({
						date: r.date,
						batteryPass: r.batteryPass ?? null,
						batteryFail: r.batteryFail ?? null,
						batteryErrors:
							(r as { batteryErrors?: number | null }).batteryErrors ?? null,
						openMaps: r.openMaps ?? null,
					}))}
				/>
				{qualityHistory.length < 2 && (
					<p className="text-[11px] text-muted-foreground leading-relaxed mt-3">
						The series began {qualityHistory[0]?.date}; the ratchet line appears
						with its second day. Today&apos;s snapshot:{" "}
						{qualityHistory[0]?.sampled} rows sampled ·{" "}
						{qualityHistory[0]?.liveRows} Live ·{" "}
						{qualityHistory[0]?.humanVerified} human-verified.
					</p>
				)}
			</Card>

			<div className="grid sm:grid-cols-2 gap-6">
				{guards.map((g) => (
					<Card
						key={g.key}
						title={g.title}
						description={g.promise}
						right={<EvidenceLink path={g.artifact} />}
					>
						<div className="flex items-start justify-between gap-4">
							<Stat
								label={`measured ${g.asOf} · ${g.ageDays}d ago · ${g.cadence}`}
								value={g.value}
								sub={g.sub}
							/>
							{/* THREE states, not two. Stale evidence renders as its own
							    thing: a guard we stopped measuring is not a guard that is
							    holding, and it is not one that is failing either. */}
							<span
								className={`mt-0.5 inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
									g.state === "holding"
										? "border-border text-foreground"
										: g.state === "breached"
											? "border-red-500/40 text-red-400"
											: "border-amber-500/40 text-amber-400"
								}`}
								title={
									g.state === "stale"
										? `evidence is ${g.ageDays} days old, past this guard's ${g.freshnessDays}-day window`
										: g.state
								}
							>
								{g.state === "holding" ? (
									<Check className="h-3 w-3" strokeWidth={3} />
								) : g.state === "breached" ? (
									<TriangleAlert className="h-3 w-3" />
								) : (
									<CircleSlash className="h-3 w-3" />
								)}
								{/* Internal state names stay exact (holding / breached /
								    stale; the API serves them verbatim). The RENDERED words
								    are for a community reader, where "breached" reads as an
								    incident instead of a metric below its committed floor. */}
								{g.state === "holding"
									? "at target"
									: g.state === "breached"
										? "below target"
										: "needs re-measure"}
							</span>
						</div>
						<ul className="mt-4 space-y-1.5">
							{g.details.map((d) => (
								<li
									key={d}
									className="text-xs text-muted-foreground leading-relaxed pl-3 relative before:absolute before:left-0 before:top-[7px] before:h-1 before:w-1 before:rounded-full before:bg-muted-foreground/50"
								>
									{d}
								</li>
							))}
						</ul>
					</Card>
				))}
			</div>

			{/* provenance footer */}
			<footer className="mt-10 text-xs text-muted-foreground leading-relaxed max-w-2xl">
				<p>
					How this page works: scheduled runs measure, write their JSON evidence
					to{" "}
					<a
						href={evidenceUrl("improvements")}
						target="_blank"
						rel="noopener noreferrer"
						className="underline underline-offset-2 hover:no-underline"
					>
						improvements/
					</a>{" "}
					and commit it; this page statically renders those committed files, so
					a number here changes only when a new dated artifact lands. Entity
					counts are a census of the collections; guard rows are point-in-time
					measurements that carry their own age and go stale rather than
					silently reading as current. The consumer-side interlock conventions
					(spec-as-discovery-index, version handshake, cadence contract) are
					specified in{" "}
					<a
						href={evidenceUrl("docs/interlock-spec.md")}
						target="_blank"
						rel="noopener noreferrer"
						className="underline underline-offset-2 hover:no-underline"
					>
						docs/interlock-spec.md
					</a>
					.
				</p>
			</footer>
		</div>
	);
}
