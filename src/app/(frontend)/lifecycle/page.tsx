import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { GroupCounts } from "@/lib/lifecycle-metrics";
import { getLifecycleReport } from "@/lib/lifecycle-report";

/**
 * /lifecycle: how many listed projects launched, and how many are alive now,
 * measured from dated snapshots of what the directory serves. The report is
 * computed daily by the snapshot lane (scripts/data/snapshot-project-status.ts)
 * and read here; nothing on this page is set by hand.
 *
 * HIDDEN, like /quality: noindex, absent from the sitemap, no nav or footer
 * links. Shared by direct link only.
 */
export const metadata: Metadata = {
	title: "Project Lifecycle",
	description:
		"How many Stellar projects launched and how many are still alive, SCF-funded and not, measured from dated snapshots.",
	robots: {
		index: false,
		follow: false,
		googleBot: { index: false, follow: false },
	},
	alternates: { canonical: "/lifecycle" },
};

export const revalidate = 3600;

const REPO = "https://github.com/Stellar-Light/stellarlight/tree/main";

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
			<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5 sm:gap-4 px-5 pt-5 pb-3">
				<div className="min-w-0">
					<h2 className="text-base font-semibold text-foreground text-balance">
						{title}
					</h2>
					{description && (
						<p className="text-xs text-muted-foreground mt-1 max-w-xl leading-relaxed">
							{description}
						</p>
					)}
				</div>
				{right && (
					<div className="text-xs text-muted-foreground shrink-0 order-first sm:order-none self-start">
						{right}
					</div>
				)}
			</div>
			<div className="px-5 pb-5">{children}</div>
		</div>
	);
}

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

const pct = (n: number, d: number) =>
	d ? `${Math.round((100 * n) / d)}%` : "n/a";
const fmt = (n: number) => n.toLocaleString("en-US");

/** One row per group or cohort; percentages are of launched projects. */
function CountsTable({
	rows,
	firstHeader,
}: {
	rows: Array<{ label: string } & GroupCounts>;
	firstHeader: string;
}) {
	const head = [
		firstHeader,
		"Listed",
		"Launched",
		"Marked live",
		"Live on strong evidence",
		"Observed active",
		"No activity data",
	];
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm tabular-nums">
				<thead>
					<tr className="text-left text-xs text-muted-foreground border-b border-border">
						{head.map((h, i) => (
							<th
								key={h}
								className={`py-2 pr-4 font-medium ${i ? "text-right" : ""} whitespace-nowrap`}
							>
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => (
						<tr
							key={r.label}
							className="border-b border-border/40 last:border-0"
						>
							<td className="py-2 pr-4 text-foreground whitespace-nowrap">
								{r.label}
							</td>
							<td className="py-2 pr-4 text-right">{fmt(r.listed)}</td>
							<td className="py-2 pr-4 text-right">{fmt(r.launched)}</td>
							<td className="py-2 pr-4 text-right">
								{fmt(r.markedLive)}{" "}
								<span className="text-muted-foreground">
									{pct(r.markedLive, r.launched)}
								</span>
							</td>
							<td className="py-2 pr-4 text-right">
								{fmt(r.liveOnStrongEvidence)}{" "}
								<span className="text-muted-foreground">
									{pct(r.liveOnStrongEvidence, r.launched)}
								</span>
							</td>
							<td className="py-2 pr-4 text-right">
								{fmt(r.observedActive)}{" "}
								<span className="text-muted-foreground">
									{pct(r.observedActive, r.launched)}
								</span>
							</td>
							<td className="py-2 text-right text-muted-foreground">
								{fmt(r.noActivityData)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function SlugList({ slugs }: { slugs: string[] }) {
	if (!slugs.length) return <span className="text-muted-foreground">none</span>;
	const shown = slugs.slice(0, 24);
	return (
		<span>
			{shown.map((s, i) => (
				<span key={s}>
					{i ? ", " : ""}
					<Link
						href={`/project/${s}`}
						className="text-foreground underline underline-offset-2 hover:no-underline"
					>
						{s}
					</Link>
				</span>
			))}
			{slugs.length > shown.length
				? ` and ${slugs.length - shown.length} more`
				: ""}
		</span>
	);
}

export default async function LifecyclePage() {
	const { report } = await getLifecycleReport();
	const { groups, cohorts, changes, survival, definitions } = report;
	const latestReadings = survival.readings.filter(
		(r) => r.from === survival.readings.at(-1)?.from,
	);
	const listedKnown = cohorts.nonScfByListedYear.some(
		(c) => !c.cohort.includes("unknown"),
	);

	return (
		<div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
			<header className="mb-10">
				<p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground mb-2">
					Measured, not asserted
				</p>
				<h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-3">
					Project lifecycle
				</h1>
				<p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
					How many listed Stellar projects launched, and how many are alive now,
					SCF-funded and not. Every count comes from a dated snapshot of what
					the directory serves, taken daily. Three definitions of alive sit side
					by side because they disagree, and the gap between them is part of the
					answer. Latest snapshot {report.latestSnapshot}, history since{" "}
					{report.historyStart}.
				</p>
			</header>

			<Card
				title="Launched, and alive now"
				description="Percentages are of launched projects."
				right={
					<a
						href="/api/lifecycle"
						className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
					>
						same report as JSON
						<ArrowUpRight className="h-3 w-3" />
					</a>
				}
				className="mb-6"
			>
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-6">
					<Stat
						label="Launched"
						value={fmt(groups.all.launched)}
						sub={`of ${fmt(groups.all.listed)} listed`}
					/>
					<Stat
						label="Marked live"
						value={pct(groups.all.markedLive, groups.all.launched)}
						sub={`${fmt(groups.all.markedLive)} projects`}
					/>
					<Stat
						label="Live on strong evidence"
						value={pct(groups.all.liveOnStrongEvidence, groups.all.launched)}
						sub={`${fmt(groups.all.liveOnStrongEvidence)} projects`}
					/>
					<Stat
						label="Observed active"
						value={pct(groups.all.observedActive, groups.all.launched)}
						sub={`${fmt(groups.all.observedActive)} projects`}
					/>
				</div>
				<CountsTable
					firstHeader="Group"
					rows={[
						{ label: "All listed projects", ...groups.all },
						{ label: "SCF-funded", ...groups.scf },
						{ label: "Everyone else", ...groups.nonScf },
					]}
				/>
			</Card>

			<Card title="What each number means" className="mb-6">
				<dl className="grid gap-3 text-sm">
					{(
						[
							["Launched", definitions.launched],
							["Marked live", definitions.markedLive],
							["Live on strong evidence", definitions.liveOnStrongEvidence],
							["Observed active", definitions.observedActive],
							["No activity data", definitions.noActivityData],
						] as const
					).map(([term, text]) => (
						<div
							key={term}
							className="grid sm:grid-cols-[12rem_1fr] gap-1 sm:gap-4"
						>
							<dt className="text-foreground font-medium">{term}</dt>
							<dd className="text-muted-foreground leading-relaxed">{text}</dd>
						</div>
					))}
				</dl>
			</Card>

			<Card
				title="SCF-funded projects by first funded round"
				description="Each project counted once, in the era of its first SCF award."
				className="mb-6"
			>
				<CountsTable
					firstHeader="First funded"
					rows={cohorts.scfByFirstRound.map((c) => ({ label: c.cohort, ...c }))}
				/>
			</Card>

			<Card
				title="Everyone else, by year first listed"
				description={
					listedKnown
						? "When each project first appeared in the directory: a listing date, not a launch date."
						: "First-listed dates arrive with the first snapshot taken by the daily lane."
				}
				className="mb-6"
			>
				<CountsTable
					firstHeader="First listed"
					rows={cohorts.nonScfByListedYear.map((c) => ({
						label: c.cohort,
						...c,
					}))}
				/>
			</Card>

			<Card
				title={`Changes since ${changes.since}`}
				description="Status moves between the first snapshot and the latest one."
				className="mb-6"
			>
				<div className="grid gap-3 text-sm">
					<div>
						<span className="text-foreground font-medium">
							Newly launched ({changes.newlyLaunched.length}):
						</span>{" "}
						<SlugList slugs={changes.newlyLaunched} />
					</div>
					<div>
						<span className="text-foreground font-medium">
							Went inactive ({changes.newlyInactive.length}):
						</span>{" "}
						<SlugList slugs={changes.newlyInactive} />
					</div>
					<div>
						<span className="text-foreground font-medium">
							Came back ({changes.revived.length}):
						</span>{" "}
						<SlugList slugs={changes.revived} />
					</div>
				</div>
			</Card>

			<Card
				title={`Still alive ${survival.windowDays} days later`}
				description="Of the projects alive on one snapshot day, how many are alive on the snapshot taken that many days later."
				className="mb-6"
			>
				{latestReadings.length ? (
					<div className="overflow-x-auto">
						<table className="w-full text-sm tabular-nums">
							<thead>
								<tr className="text-left text-xs text-muted-foreground border-b border-border">
									<th className="py-2 pr-4 font-medium">Group</th>
									<th className="py-2 pr-4 font-medium">Definition</th>
									<th className="py-2 pr-4 font-medium text-right">
										Alive at start
									</th>
									<th className="py-2 font-medium text-right">Still alive</th>
								</tr>
							</thead>
							<tbody>
								{latestReadings.map((r) => (
									<tr
										key={`${r.group}-${r.definition}`}
										className="border-b border-border/40 last:border-0"
									>
										<td className="py-2 pr-4">
											{r.group === "all"
												? "All"
												: r.group === "scf"
													? "SCF-funded"
													: "Everyone else"}
										</td>
										<td className="py-2 pr-4 text-muted-foreground">
											{r.definition}
										</td>
										<td className="py-2 pr-4 text-right">
											{fmt(r.aliveAtStart)}
										</td>
										<td className="py-2 text-right">
											{fmt(r.stillAlive)}{" "}
											<span className="text-muted-foreground">
												{pct(r.stillAlive, r.aliveAtStart)}
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
						The first reading is due {survival.availableFrom}: of the projects
						alive on {report.historyStart}, how many are still alive{" "}
						{survival.windowDays} days later, under each definition above.
					</p>
				)}
			</Card>

			<p className="text-[11px] text-muted-foreground/80 leading-relaxed max-w-2xl">
				Snapshots and the report are committed daily to{" "}
				<a
					href={`${REPO}/data/snapshots/projects`}
					target="_blank"
					rel="noopener noreferrer"
					className="text-foreground underline underline-offset-2 hover:no-underline"
				>
					data/snapshots/projects
				</a>
				. Report generated {report.generatedAt}.
			</p>
		</div>
	);
}
