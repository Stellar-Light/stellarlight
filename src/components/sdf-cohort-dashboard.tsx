"use client";

import { ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";
import type {
	CohortProject,
	CohortRetention,
	JourneyEvent,
	RegisterRow,
} from "@/lib/sdf-cohort";

/**
 * The cohort dashboard. Holds the partner's key in memory only and reads
 * /api/cohort/retention, /api/cohort/projects and /api/cohort/journey with
 * it. Card, Stat and table styles are /lifecycle's.
 */

type Meta = {
	asOf: string;
	launchAgesCountedTo: string;
	cannotSee: string[];
	sources: string[];
	definitions?: Record<string, string>;
};
type Retention = CohortRetention & { meta: Meta; register: RegisterRow[] };
type Journey = {
	meta: Meta & { strengths: Record<string, string> };
	project: { slug: string; name: string | null; gaps: string[] };
	events: JourneyEvent[];
};

const pct = (n: number, d: number) =>
	d ? `${Math.round((100 * n) / d)}%` : "n/a";
const fmt = (n: number) => n.toLocaleString("en-US");

function Card({
	title,
	description,
	children,
	className = "",
}: {
	title: string;
	description?: string;
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
			<div className="px-5 pt-5 pb-3">
				<h2 className="text-base font-semibold text-foreground text-balance">
					{title}
				</h2>
				{description && (
					<p className="text-xs text-muted-foreground mt-1 max-w-xl leading-relaxed">
						{description}
					</p>
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

function Table({
	head,
	rows,
}: {
	head: string[];
	rows: Array<Array<React.ReactNode>>;
}) {
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
							key={String(r[0])}
							className="border-b border-border/40 last:border-0"
						>
							{r.map((c, i) => (
								<td
									// biome-ignore lint/suspicious/noArrayIndexKey: fixed columns
									key={i}
									className={`py-2 pr-4 ${i ? "text-right" : "text-foreground whitespace-nowrap"}`}
								>
									{c}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

const ofCell = (n: number, d: number) => (
	<>
		{fmt(n)} <span className="text-muted-foreground">of {fmt(d)}</span>{" "}
		<span className="text-muted-foreground">{pct(n, d)}</span>
	</>
);

type Group = CohortRetention["operatingNow"]["byFirstAwardType"][number];
const operatingRows = (groups: Group[], label = (g: string) => g) =>
	groups.map((g) => [
		label(g.group),
		ofCell(g.operating, g.projects),
		ofCell(g.observable.operating, g.observable.projects),
		ofCell(g.notObservable.operating, g.notObservable.projects),
	]);
const OPERATING_HEAD = [
	"Operating now",
	"With an on-chain id or app",
	"Without one",
];
const AWARD_TYPE: Record<string, string> = {
	build: "Build",
	legacy: "Legacy (v1 to v5)",
	unknown: "Unknown",
};

export function SdfCohortDashboard() {
	const [key, setKey] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [data, setData] = useState<Retention | null>(null);
	const [projects, setProjects] = useState<CohortProject[]>([]);
	const [q, setQ] = useState("");
	const [journey, setJourney] = useState<Journey | null>(null);

	const get = async <T,>(path: string): Promise<T> => {
		const r = await fetch(path, {
			headers: { Authorization: `Bearer ${key.trim()}` },
		});
		if (r.status === 401) throw new Error("That key cannot read the cohort.");
		if (!r.ok) throw new Error(`The cohort did not answer (${r.status}).`);
		return r.json() as Promise<T>;
	};

	async function unlock(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError(null);
		try {
			const retention = await get<Retention>("/api/cohort/retention");
			const rows: CohortProject[] = [];
			for (let offset = 0; ; offset += 1000) {
				const page = await get<{
					projects: CohortProject[];
					meta: { counts: { total: number } };
				}>(`/api/cohort/projects?limit=1000&offset=${offset}`);
				rows.push(...page.projects);
				if (rows.length >= page.meta.counts.total || !page.projects.length)
					break;
			}
			setData(retention);
			setProjects(rows);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}

	async function open(slug: string) {
		try {
			setJourney(
				await get<Journey>(
					`/api/cohort/journey?slug=${encodeURIComponent(slug)}`,
				),
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}

	const matches = useMemo(() => {
		const s = q.trim().toLowerCase();
		if (!s) return [];
		return projects
			.filter(
				(p) => p.slug.includes(s) || (p.name ?? "").toLowerCase().includes(s),
			)
			.slice(0, 12);
	}, [q, projects]);

	if (!data)
		return (
			<div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
				<form
					onSubmit={unlock}
					className="max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-5"
				>
					<div>
						<h1 className="text-lg font-semibold text-foreground">
							Cohort data
						</h1>
						<p className="text-sm text-muted-foreground mt-1">
							Partner-only. Enter your API key to read it. The key stays in this
							tab and is sent only to this site's cohort API.
						</p>
					</div>
					<input
						type="password"
						value={key}
						required
						autoComplete="off"
						onChange={(e) => setKey(e.target.value)}
						className="w-full h-11 rounded-xl bg-white/[0.02] border border-border px-3.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-white/30 focus:shadow-[0_0_0_3px_rgba(253,218,36,0.12)] transition-all"
						placeholder="API key"
						aria-label="API key"
					/>
					{error && <div className="text-xs text-red-400">{error}</div>}
					<button
						type="submit"
						disabled={loading}
						className="w-full h-11 rounded-xl bg-foreground text-background font-medium text-sm disabled:opacity-50 transition-opacity"
					>
						{loading ? "Reading…" : "Read the cohort"}
					</button>
				</form>
			</div>
		);

	const { meta, funnel, operatingNow, scfConfirmedRetention: c } = data;
	const top = funnel[0].projects;

	return (
		<div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
			<header className="mb-10">
				<p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground mb-2">
					Partner-only
				</p>
				<h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-3">
					Launched, and still operating
				</h1>
				<p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
					SCF-funded and other directory projects: when each launched, how we
					know, and what we can see of them now. A dated snapshot as of{" "}
					{meta.asOf}; launch ages are counted to {meta.launchAgesCountedTo}.
					Every figure comes from the same rows the cohort API serves, and every
					one has its denominator.
				</p>
			</header>

			<Card
				title="SCF-funded: launched, past day 180, operating now"
				description="Each stage is a share of the stage before it. Operating now counts on-chain, product, a person's check and app evidence; code alone is not counted."
				className="mb-6"
			>
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-6">
					{funnel.map((s, i) => (
						<div key={s.stage}>
							<Stat
								label={s.stage}
								value={fmt(s.projects)}
								sub={
									i
										? `${pct(s.projects, s.of)} of ${fmt(s.of)}`
										: `of ${fmt(s.of)} in the cohort`
								}
							/>
							<div className="mt-3 h-1.5 rounded-full bg-white/[0.06]">
								<div
									className="h-1.5 rounded-full bg-white/50"
									style={{ width: pct(s.projects, top) }}
								/>
							</div>
						</div>
					))}
				</div>
				<p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
					Past day 180, by evidence today:{" "}
					{Object.entries(data.funnelPastDay180Evidence)
						.sort((a, b) => b[1] - a[1])
						.map(([k, v]) => `${k} ${fmt(v)}`)
						.join(", ")}
					. not eligible: the first award is under 180 days old, so operating
					now was not read.
				</p>
			</Card>

			<Card
				title="After a launch SCF confirmed"
				description={meta.definitions?.scfConfirmedRetention}
				className="mb-6"
			>
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
					<Stat
						label="Operating now"
						value={pct(c.operatingNow, c.launchAtLeast180DaysOld)}
						sub={`${fmt(c.operatingNow)} of ${fmt(c.launchAtLeast180DaysOld)} launches at least 180 days old`}
					/>
					<Stat label="Code activity only" value={fmt(c.codeOnly)} />
					<Stat
						label="No reading"
						value={fmt(c.noReading)}
						sub="mostly closed-source apps, anchors and wallets"
					/>
					<Stat label="Recorded inactive" value={fmt(c.recordedInactive)} />
				</div>
				<p className="text-xs text-muted-foreground mt-4">
					{fmt(c.paidInFull)} directory projects have a Build award SCF paid in
					full. Launch date: ours for {fmt(c.launchBasis.dated)}, bounded by
					SCF's payment for {fmt(c.launchBasis.scfPaidBy)}.
				</p>
			</Card>

			<Card
				title="SCF-funded, by year of first award"
				description="Launch known, past day 180 and operating now are counted the way the stages above are. Day-180 readings are for dated launches only."
				className="mb-6"
			>
				<Table
					head={[
						"First award",
						"Projects",
						"Launch known",
						"Past day 180",
						"Operating now",
						"Day 180: activity",
						"No activity",
						"Too early",
					]}
					rows={data.scfByFirstAwardYear.map((y) => [
						y.year,
						fmt(y.projects),
						ofCell(y.launchKnown, y.projects),
						fmt(y.pastDay180),
						ofCell(y.operatingNowPastDay180, y.pastDay180),
						fmt(y.day180.activitySeen),
						fmt(y.day180.noActivitySeen),
						fmt(y.day180.tooEarly),
					])}
				/>
			</Card>

			<Card
				title="Operating now, 180 or more days after the first award"
				description={meta.definitions?.observable}
				className="mb-6"
			>
				<div className="grid gap-6">
					<Table
						head={["First award", ...OPERATING_HEAD]}
						rows={operatingRows(operatingNow.byFirstAwardYear)}
					/>
					<Table
						head={["Award type", ...OPERATING_HEAD]}
						rows={operatingRows(
							operatingNow.byFirstAwardType,
							(g) => AWARD_TYPE[g] ?? g,
						)}
					/>
					<Table
						head={["First award size", ...OPERATING_HEAD]}
						rows={operatingRows(operatingNow.byFirstAwardSize)}
					/>
				</div>
			</Card>

			<Card
				title="SCF-funded against everyone else"
				description={meta.definitions?.day180}
				className="mb-6"
			>
				<Table
					head={[
						"Group",
						"Projects",
						"On-chain launch",
						"Product launch",
						"Planned only",
						"No evidence",
						"Day 180: activity",
						"No activity",
						"Could not check",
						"Too early",
					]}
					rows={(
						[
							["SCF-funded", data.scf],
							["Everyone else", data.notScf],
						] as const
					).map(([label, g]) => [
						label,
						fmt(g.projects),
						fmt(g.launchBasis.onChain),
						fmt(g.launchBasis.product),
						fmt(g.launchBasis.plannedOnly),
						fmt(g.launchBasis.none),
						fmt(g.day180.activitySeen),
						fmt(g.day180.noActivitySeen),
						fmt(g.day180.couldNotCheck),
						fmt(g.day180.tooEarly),
					])}
				/>
			</Card>

			<Card
				title="SCF delivery by round"
				description={meta.definitions?.deliveryByRound}
				className="mb-6"
			>
				<Table
					head={["Round", "Build awards read", "Mainnet tranche paid"]}
					rows={data.deliveryByRound.rounds.map((r) => [
						`#${r.round}`,
						fmt(r.read),
						ofCell(r.mainnetPaid, r.read),
					])}
				/>
			</Card>

			<Card
				title="One project's journey"
				description="Search by name or slug, then open a project for its dated events, each with the record it was read from."
				className="mb-6"
			>
				<input
					type="text"
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder="Search projects…"
					aria-label="Search projects"
					className="w-full sm:max-w-xs h-9 px-3 bg-card text-sm text-foreground placeholder:text-muted-foreground rounded-lg border border-border/50 focus:outline-none focus:ring-2 focus:ring-ring transition-all"
				/>
				{matches.length > 0 && (
					<ul className="mt-3 grid gap-1 text-sm">
						{matches.map((p) => (
							<li key={p.slug}>
								<button
									type="button"
									onClick={() => open(p.slug)}
									className="text-foreground underline underline-offset-2 hover:no-underline"
								>
									{p.name ?? p.slug}
								</button>{" "}
								<span className="text-muted-foreground">
									{p.slug} · {p.status ?? "not in the cohort"}
									{p.scfAwarded ? " · SCF-funded" : ""}
								</span>
							</li>
						))}
					</ul>
				)}
				{journey && (
					<div className="mt-6">
						<h3 className="text-sm font-semibold text-foreground">
							{journey.project.name ?? journey.project.slug}:{" "}
							{fmt(journey.events.length)} events
						</h3>
						{journey.project.gaps.length > 0 && (
							<p className="text-xs text-muted-foreground mt-1">
								Not known: {journey.project.gaps.join("; ")}.
							</p>
						)}
						<div className="overflow-x-auto mt-3">
							<table className="w-full text-sm">
								<thead>
									<tr className="text-left text-xs text-muted-foreground border-b border-border">
										<th className="py-2 pr-4 font-medium">Date</th>
										<th className="py-2 pr-4 font-medium">Stage</th>
										<th className="py-2 pr-4 font-medium">Event</th>
										<th className="py-2 pr-4 font-medium">Strength</th>
										<th className="py-2 font-medium">Evidence</th>
									</tr>
								</thead>
								<tbody>
									{journey.events.map((e, i) => (
										<tr
											// biome-ignore lint/suspicious/noArrayIndexKey: events can repeat a date and label
											key={i}
											className="border-b border-border/40 last:border-0 align-top"
										>
											<td className="py-2 pr-4 whitespace-nowrap tabular-nums">
												{e.date}
												{e.dateUpper ? ` to ${e.dateUpper}` : ""}
											</td>
											<td className="py-2 pr-4 text-muted-foreground">
												{e.stage}
											</td>
											<td className="py-2 pr-4">
												<div className="text-foreground">{e.event}</div>
												{e.detail && (
													<div className="text-xs text-muted-foreground break-all">
														{e.detail}
													</div>
												)}
												<div className="text-xs text-muted-foreground">
													{e.basis}
												</div>
											</td>
											<td className="py-2 pr-4 text-muted-foreground">
												{e.strength}
											</td>
											<td className="py-2">
												{e.evidenceUrl ? (
													<a
														href={e.evidenceUrl}
														target="_blank"
														rel="noopener noreferrer"
														className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
													>
														{e.source}
														<ArrowUpRight className="h-3 w-3" />
													</a>
												) : (
													<span className="text-xs text-muted-foreground">
														{e.source}
													</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				)}
			</Card>

			<Card
				title="What this data cannot see"
				description="Absence of a reading is never inactivity."
				className="mb-6"
			>
				<ul className="grid gap-2 text-sm text-muted-foreground leading-relaxed list-disc pl-5">
					{meta.cannotSee.map((s) => (
						<li key={s}>{s}</li>
					))}
				</ul>
			</Card>

			<Card
				title="The facts register"
				description="Each figure as the register states it, with what it was measured from, when, and what it cannot see."
				className="mb-6"
			>
				<dl className="grid gap-4 text-sm">
					{data.register.map((r) => (
						<div
							key={r.fact}
							className="grid sm:grid-cols-[14rem_1fr] gap-1 sm:gap-4"
						>
							<dt className="text-foreground font-medium">{r.fact}</dt>
							<dd className="text-muted-foreground leading-relaxed">
								<span className="text-foreground">{r.value}</span>. Measured
								from: {r.measuredFrom}. As of {r.asOf}.
								{r.cannotSee ? ` Cannot see: ${r.cannotSee}.` : ""}
							</dd>
						</div>
					))}
				</dl>
			</Card>

			<p className="text-[11px] text-muted-foreground/80 leading-relaxed max-w-2xl">
				Sources: {meta.sources.join(" ")}
			</p>
		</div>
	);
}
