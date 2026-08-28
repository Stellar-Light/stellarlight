import { ArrowUpRight, Check, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import {
	AreaChart,
	BarList,
	SplitBarList,
	StackedRamp,
} from "@/components/quality/charts";
import {
	evidenceUrl,
	getEntities,
	getGuardRows,
	getNorthStar,
	getTrends,
	type TrendSeries,
} from "@/lib/quality-artifacts";

/**
 * /quality — the public quality scoreboard (idea-scale-model deliverable 1).
 *
 * Every number on this page is statically imported from a COMMITTED artifact
 * in improvements/ (see src/lib/quality-artifacts.ts) — no hand-set figures,
 * no live recomputation. The page changes only when a new engine run commits
 * its evidence. Each stat links the artifact that produced it.
 *
 * HIDDEN until boxy review (the idea's graduation gate): noindex, absent from
 * the sitemap allow-list, no nav/footer links. Flip = link it + drop noindex.
 */

export const metadata: Metadata = {
	title: "Data Quality | Stellar Light",
	description:
		"The StellarLight quality scoreboard — measured recall, data-truth cross-checks, contract honesty and consumer-interlock guards, every number linked to its reproducible run.",
	robots: {
		index: false,
		follow: false,
		googleBot: { index: false, follow: false },
	},
};

/** Borderless stat — same idiom as /analytics. */
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

/** bklit-style card with corner crosshair dots — same idiom as /analytics. */
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
					Every number below is read from a committed engine artifact — this
					page cannot say anything the runs didn&apos;t measure. Each stat links
					its reproducible evidence; each figure carries the date it was
					measured. The standing promises behind these guards live in{" "}
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

			{/* north star */}
			<Card
				title="North star — full-surface audit ok-rate"
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
								title={`${p.label} — ${p.date}`}
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

			{/* ── findings: what we actually found, cleared, and still owe ── */}
			<Card
				title="Findings — what the engines caught"
				description="Every detector writes here. Open means still reproducing; cleared means a later run stopped reproducing it. This is the work queue, not a score."
				className="mb-6"
			>
				<div className="flex flex-wrap items-end gap-x-8 gap-y-4 mb-6">
					<Stat
						label="open"
						value={String(entities.findings.open)}
						sub="still reproducing"
					/>
					<Stat
						label="cleared"
						value={String(entities.findings.cleared)}
						sub="stopped reproducing"
					/>
					<Stat
						label="verified closed"
						value={String(entities.findings.verified)}
						sub="re-probed after the fix"
					/>
				</div>
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
					<div className="flex flex-col gap-3">
						<p className="text-xs text-muted-foreground">
							By failure mode — open vs ever-cleared
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
								<div
									key={`${c.probe}-${c.clearedAt}`}
									className="flex items-baseline justify-between gap-4 text-xs"
								>
									<span className="text-foreground truncate">{c.probe}</span>
									<span className="text-muted-foreground shrink-0 tabular-nums">
										{c.failureMode} · {c.clearedAt}
									</span>
								</div>
							))}
						</div>
					</div>
				)}
			</Card>

			{/* ── per-entity quality: rows and repos, not just totals ── */}
			<Card
				title="Row quality — the evidence behind each record"
				description="Every project row scores on five facts we either hold or don't: a provenance basis, a date, a source URL, a type, and a link. A low score names exactly what is missing."
				className="mb-6"
			>
				<div className="flex flex-wrap items-end gap-x-8 gap-y-4 mb-6">
					<Stat
						label="mean row score"
						value={`${entities.projects.meanScore}%`}
						sub={`across ${entities.projects.sampled} sampled rows`}
					/>
				</div>
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
					<div className="flex flex-col gap-3">
						<p className="text-xs text-muted-foreground">
							Status provenance — strongest evidence first
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
							<span className="text-foreground">site-liveness</span> — a page
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
					<p className="text-xs text-muted-foreground mb-3">
						Weakest evidence on prominent rows — the curation queue
					</p>
					<div className="flex flex-col gap-1.5">
						{entities.projects.weakest.slice(0, 8).map((p) => (
							<div
								key={p.slug}
								className="flex items-baseline justify-between gap-4 text-xs"
							>
								<span className="text-foreground truncate">
									{p.name}
									<span className="text-muted-foreground">
										{" "}
										· {p.statusBasis ?? "no basis"}
									</span>
								</span>
								<span className="shrink-0 text-muted-foreground tabular-nums">
									missing {p.missing.join(", ")} · {p.score}%
								</span>
							</div>
						))}
					</div>
				</div>
			</Card>

			{/* ── repo quality ── */}
			<Card
				title="Repo quality — code truth"
				description="Indexed repositories carry their own evidence: a graded score, scan depth, curated knowledge notes, and whether a verified mainnet contract is joined to them."
				className="mb-6"
			>
				<div className="flex flex-wrap items-end gap-x-8 gap-y-4 mb-6">
					<Stat
						label="scanned for depth"
						value={`${entities.repos.withCodeDepth}/${entities.repos.sampled}`}
						sub="have a code-depth reading"
					/>
					<Stat
						label="with knowledge notes"
						value={String(entities.repos.withNotes)}
						sub="dated facts with sources"
					/>
					<Stat
						label="joined to mainnet"
						value={String(entities.repos.withMainnet)}
						sub="verified contract on chain"
					/>
				</div>
				<p className="text-xs text-muted-foreground mb-3">
					Highest-graded sampled repos
				</p>
				<div className="flex flex-col gap-1.5">
					{entities.repos.top.slice(0, 8).map((r) => (
						<div
							key={r.fullName}
							className="flex items-baseline justify-between gap-4 text-xs"
						>
							<span className="text-foreground truncate">{r.fullName}</span>
							<span className="shrink-0 text-muted-foreground tabular-nums">
								score {r.repoScore} · depth {r.codeDepth ?? "—"}% · {r.notes}{" "}
								note
								{r.notes === 1 ? "" : "s"}
							</span>
						</div>
					))}
				</div>
			</Card>

			{/* ── trends: real charts, and honest when there is no line yet ── */}
			<Card
				title="Trends"
				description="Daily history appended by the eval pipeline and committed — red days included. Battery probe counts rotate with the daily banks, so the pass line moves by design; the failure line and the ratchets are the signal."
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
					and this page statically renders those files — a number here can only
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
