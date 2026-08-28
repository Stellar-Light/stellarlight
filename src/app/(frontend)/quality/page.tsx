import { ArrowUpRight, Check, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import {
	AreaChart,
	BarList,
	GapMatrix,
	Info,
	Metric,
	MissFunnel,
	PhaseProgress,
	QueueRow,
	Sankey,
	SplitBarList,
	StackedRamp,
} from "@/components/quality/charts";
import {
	evidenceUrl,
	getEntities,
	getExternalFindings,
	getGuardRows,
	getMissFunnel,
	getNorthStar,
	getProgress,
	getTrends,
	type TrendSeries,
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
	const trends = getTrends();
	const entities = getEntities();
	const funnel = getMissFunnel();
	const progress = getProgress();
	const external = getExternalFindings();

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
							Every number on this page is served as JSON, known limitations
							first, then the gap matrix with real identifiers, the miss funnel,
							per-surface findings, guard state and the trend history. No
							parameters, no key, cached hourly.
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

			{/* north star */}
			<Card
				title="North star: full-surface audit ok-rate"
				description="Hundreds of cold, natural probes across every retrieval surface, graded against ground truth. The one number the whole engine system optimizes."
				right={<EvidenceLink path={northStar.latest.evidence} />}
				className="mb-6"
			>
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
									{p.date.slice(5)}
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

			{/* ── findings: what we actually found, cleared, and still owe ── */}
			<Card
				title="Findings: what the engines caught"
				description="Every detector writes here. Open means still reproducing; cleared means a later run stopped reproducing it. This is the work queue, not a score."
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
					The open count leads reality on purpose: a fix clears findings only
					when their detector next runs. The miss funnel below replays them live
					-{" "}
					<span className="text-foreground">
						{funnel.stages.find((st) => st.stage === "passing")?.count ?? 0} of{" "}
						{funnel.population.sampled} sampled no longer reproduce
					</span>{" "}
					- so read this number as an upper bound on real debt.
				</p>
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
					<div className="flex flex-col gap-3">
						<p className="text-xs text-muted-foreground">
							By failure mode, open vs ever-cleared
						</p>
						<SplitBarList
							rows={entities.findings.byFailureMode.slice(0, 8).map((m) => ({
								label: m.mode,
								open: m.open,
								cleared: m.cleared,
							}))}
						/>
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-xs text-muted-foreground">
							How long the open ones have been open
						</p>
						<BarList
							rows={entities.findings.openByAge.map((b, i) => ({
								label: b.bucket,
								value: b.count,
							}))}
							unit="findings"
						/>
						<p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
							A tall bar on the right is the treadmill this page exists to end:
							detection outrunning remediation. The closure rule (QUALITY.md)
							says every finding must terminate in an invariant, an SLO, a
							probe, or a documented won&apos;t-fix.
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
						label="Fix shipped"
						value={`${external.ourResponse.fixShipped}/${external.total}`}
						sub="Our linked issue is closed"
						goodWhen="higher"
						explain={external.ourResponse.note}
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
				<div className="overflow-x-auto">
					<div className="min-w-[680px]">
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

			{/* ── the miss funnel: WHERE a miss dies, not just how many ── */}
			<Card
				title="Miss funnel: where a known-item miss actually dies"
				description="Every open recall finding replayed live and classified at the FIRST stage that fails, so the stages are mutually exclusive. 'We have 200 recall misses' hides four different problems with four different owners."
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
					open recall findings replayed · shares are of the sample
				</p>
				<MissFunnel
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
						sub={`across ${entities.projects.sampled} sampled rows`}
						goodWhen="higher"
						explain="Per row: the share of five evidence facts we hold, a provenance basis, a status date, a source URL, at least one type, at least one link. 100% means all five are present; it does NOT rate the project, only how well we can back what we publish about it."
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
							total={entities.projects.sampled}
						/>
						<p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
							Most rows rest on{" "}
							<span className="text-foreground">site-liveness</span> - a page
							answered. That is the weakest honest basis we serve, and moving
							rows up this ramp is the standing data job.
						</p>
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-xs text-muted-foreground">
							What is missing, across sampled rows
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
					<p className="text-xs text-muted-foreground mb-3 inline-flex items-center gap-1.5">
						Curation queue: rows whose evidence is thinnest, prominent first
						<Info text="Sorted by evidence score ascending, then by curated prominence, so the most-seen thin rows surface first. Each line names exactly which of the five facts is missing." />
					</p>
					<div className="flex flex-col gap-1.5">
						{entities.projects.weakest.slice(0, 30).map((p) => (
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
				title="Repo quality: code truth"
				description="Indexed repositories carry their own evidence: a graded score, scan depth, curated knowledge notes, and whether a verified mainnet contract is joined to them."
				className="mb-6"
			>
				<div className="flex flex-wrap items-end gap-x-8 gap-y-4 mb-6">
					<Metric
						label="Scanned for depth"
						value={`${entities.repos.withCodeDepth}/${entities.repos.sampled}`}
						sub="Have a code-depth reading"
						goodWhen="higher"
						explain="Code depth is a scan-derived measure of real implementation signal (entry files, symbols, SDK usage) - not a quality judgement of the project."
					/>
					<Metric
						label="With knowledge notes"
						value={`${entities.repos.withNotes}/${entities.repos.sampled}`}
						sub="Curated dated facts with sources"
						goodWhen="higher"
						explain="knowledgeNotes are hand-curated dated facts with a source URL. Absence means nobody curated this repo yet, never a statement about the repo itself."
					/>
					<Metric
						label="Joined to a mainnet contract"
						value={`${entities.repos.withMainnet}/${entities.repos.sampled}`}
						sub="Verified contract attributed"
						goodWhen="higher"
						explain="A verified mainnet contract attributed to this repo, the difference between 'code exists' and 'code is used'. Absence is absence of a join, never proof of disuse."
					/>
				</div>
				<p className="text-xs text-muted-foreground mb-3">
					Highest-graded sampled repos
				</p>
				<div className="flex flex-col gap-1.5">
					{entities.repos.top.slice(0, 25).map((r) => (
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
										l.lessonCount > 0
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
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
					{trends.map((t) => (
						<AreaChart
							key={t.key}
							label={t.title}
							goodWhen={t.goodWhen}
							points={t.points}
						/>
					))}
				</div>
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
							<Stat label={`as of ${g.asOf}`} value={g.value} sub={g.sub} />
							<span
								className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border ${
									g.ok
										? "border-border text-foreground"
										: "border-amber-500/40 text-amber-400"
								}`}
								title={g.ok ? "guard holding" : "open finding"}
							>
								{g.ok ? (
									<Check className="h-3.5 w-3.5" strokeWidth={3} />
								) : (
									<TriangleAlert className="h-3.5 w-3.5" />
								)}
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
					How this page works: engine runs commit their raw JSON evidence to{" "}
					<a
						href={evidenceUrl("improvements")}
						target="_blank"
						rel="noopener noreferrer"
						className="underline underline-offset-2 hover:no-underline"
					>
						improvements/
					</a>{" "}
					and this page statically renders those files, a number here can only
					change when a new dated artifact lands. The consumer-side interlock
					conventions (spec-as-discovery-index, version handshake, cadence
					contract) are specified in{" "}
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
