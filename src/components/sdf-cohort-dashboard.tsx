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
	asOfDates?: Record<string, string>;
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
	"public-goods": "Public Goods",
	liquidity: "Liquidity",
	unknown: "Unknown (SCF records no type)",
};
/** "operatingAndDay180ReadingsTo" -> "operating and day 180 readings to" */
const words = (k: string) =>
	k
		.replace(/([a-z])([A-Z0-9])/g, "$1 $2")
		.replace(/([0-9])([A-Z])/g, "$1 $2")
		.toLowerCase();

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
	const defs = meta.definitions ?? {};
	const open_ = journey
		? projects.find((p) => p.slug === journey.project.slug)
		: undefined;
	const timingRows = (rows: CohortRetention["funnelByLaunchTiming"]) =>
		rows.map((t) => [
			t.group,
			fmt(t.pastDay180),
			ofCell(t.operating, t.read),
			fmt(t.pastDay180 - t.read),
		]);

	return (
		<div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
			<header className="mb-10">
				<p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground mb-2">
					Partner-only
				</p>
				<h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-3">
					Launches, day 180, and what operates today
				</h1>
				<p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
					SCF-funded and other directory projects: when each launched, how we
					know, what the 60 days around day 180 show, and what we can see of
					them today. Day 180 is shown by SDF's plan definition first and ours
					beside it; operating today is one reading, not continuity since
					launch. Every figure comes from the same rows the cohort API serves,
					with its denominator.
				</p>
				<dl className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground max-w-2xl">
					{Object.entries(meta.asOfDates ?? {}).map(([k, v]) => (
						<div key={k} className="flex justify-between gap-3">
							<dt>{words(k)}</dt>
							<dd className="tabular-nums text-foreground">{v}</dd>
						</div>
					))}
				</dl>
			</header>

			<Card
				title="Day 180: SDF's plan definition, and ours"
				description={defs.day180TwoSignals}
				className="mb-6"
			>
				<div className="grid gap-6">
					<Table
						head={[
							"SDF's plan definition",
							"Projects",
							"Active",
							"One signal kind",
							"No activity",
							"Could not check",
							"Too early",
							"No launch date",
						]}
						rows={(
							[
								["SCF-funded", data.scf],
								["Everyone else", data.notScf],
							] as const
						).map(([label, g]) => [
							label,
							fmt(g.projects),
							fmt(g.day180TwoSignals.active),
							fmt(g.day180TwoSignals.oneSignalKind),
							fmt(g.day180TwoSignals.noActivitySeen),
							fmt(g.day180TwoSignals.couldNotCheck),
							fmt(g.day180TwoSignals.tooEarly),
							fmt(g.day180TwoSignals.noLaunchDate),
						])}
					/>
					<Table
						head={[
							"Ours (one signal)",
							"Projects",
							"Activity seen",
							"No activity",
							"Could not check",
							"Too early",
							"No launch date",
						]}
						rows={(
							[
								["SCF-funded", data.scf],
								["Everyone else", data.notScf],
							] as const
						).map(([label, g]) => [
							label,
							fmt(g.projects),
							fmt(g.day180.activitySeen),
							fmt(g.day180.noActivitySeen),
							fmt(g.day180.couldNotCheck),
							fmt(g.day180.tooEarly),
							fmt(g.day180.noLaunchDate),
						])}
					/>
					<p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
						SCF-funded launches on or after the first award: by SDF's plan
						definition{" "}
						{fmt(data.scf.launchedOnOrAfterFirstAward.activeTwoSignals)} of{" "}
						{fmt(data.scf.launchedOnOrAfterFirstAward.withTwoSignalVerdict)}{" "}
						with a reading are active (
						{pct(
							data.scf.launchedOnOrAfterFirstAward.activeTwoSignals,
							data.scf.launchedOnOrAfterFirstAward.withTwoSignalVerdict,
						)}
						); by ours{" "}
						{fmt(data.scf.launchedOnOrAfterFirstAward.activeAtDay180)} of{" "}
						{fmt(data.scf.launchedOnOrAfterFirstAward.withDay180Verdict)} (
						{pct(
							data.scf.launchedOnOrAfterFirstAward.activeAtDay180,
							data.scf.launchedOnOrAfterFirstAward.withDay180Verdict,
						)}
						). {defs.day180}
					</p>
				</div>
			</Card>

			<Card
				title="SCF-funded: launch known, past day 180, operating now"
				description="Each stage is a share of the stage before it, except operating now, which is a share of the rows past day 180 whose operating state was read. Operating now counts on-chain, product, a person's check and app evidence; code alone is not counted."
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
										? `${pct(s.projects, s.of)} of ${fmt(s.of)}${i === 3 ? " read" : ""}`
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
				<p className="text-xs text-muted-foreground leading-relaxed max-w-2xl mb-4">
					Past day 180 and read, by evidence today:{" "}
					{Object.entries(data.funnelPastDay180Evidence)
						.sort((a, b) => b[1] - a[1])
						.map(([k, v]) => `${k} ${fmt(v)}`)
						.join(", ")}
					. Not read: {fmt(data.funnelNotRead)} past day 180 whose first award
					is under 180 days old, left out of the denominator.
				</p>
				<Table
					head={[
						"Launch against the first award",
						"Past day 180",
						"Operating now, of those read",
						"Not read",
					]}
					rows={timingRows(data.funnelByLaunchTiming)}
				/>
			</Card>

			<Card
				title="After a launch SCF confirmed"
				description={defs.scfConfirmedRetention}
				className="mb-6"
			>
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
					<Stat
						label="Operating now"
						value={pct(c.operatingNow, c.read)}
						sub={`${fmt(c.operatingNow)} of ${fmt(c.read)} read launches at least 180 days old`}
					/>
					<Stat
						label="Code activity only"
						value={fmt(c.codeOnly)}
						sub={`of ${fmt(c.read)}`}
					/>
					<Stat
						label="No reading"
						value={fmt(c.noReading)}
						sub={`of ${fmt(c.read)}: ${Object.entries(c.noReadingByCode)
							.map(([k, v]) => `${k.split(" (")[0]} ${fmt(v)}`)
							.join(", ")}`}
					/>
					<Stat
						label="Recorded inactive"
						value={fmt(c.recordedInactive)}
						sub={`of ${fmt(c.read)}`}
					/>
				</div>
				<p className="text-xs text-muted-foreground mt-4 mb-4">
					{fmt(c.paidInFull)} directory projects have a Build award SCF paid in
					full; {fmt(c.launchAtLeast180DaysOld)} of them launched at least 180
					days ago ({fmt(c.notRead)} not read). Launch date: ours for{" "}
					{fmt(c.launchBasis.dated)}, bounded by SCF's payment for{" "}
					{fmt(c.launchBasis.scfPaidBy)}.
				</p>
				<Table
					head={[
						"Launch against the first award",
						"Past day 180",
						"Operating now, of those read",
						"Not read",
					]}
					rows={timingRows(c.byLaunchTiming)}
				/>
			</Card>

			<Card
				title="SCF-funded, by year of first award"
				description="Launch known, past day 180 and operating now are counted the way the stages above are. The day-180 columns are SDF's plan definition and sum to the year's projects."
				className="mb-6"
			>
				<Table
					head={[
						"First award",
						"Projects",
						"Launch known",
						"Past day 180",
						"Operating now, of read",
						"Active",
						"One signal kind",
						"No activity",
						"Could not check",
						"Too early",
						"No launch date",
					]}
					rows={data.scfByFirstAwardYear.map((y) => [
						y.year,
						fmt(y.projects),
						ofCell(y.launchKnown, y.projects),
						fmt(y.pastDay180),
						ofCell(y.operatingNowPastDay180, y.pastDay180Read),
						fmt(y.day180TwoSignals.active),
						fmt(y.day180TwoSignals.oneSignalKind),
						fmt(y.day180TwoSignals.noActivitySeen),
						fmt(y.day180TwoSignals.couldNotCheck),
						fmt(y.day180TwoSignals.tooEarly),
						fmt(y.day180TwoSignals.noLaunchDate),
					])}
				/>
			</Card>

			<Card
				title="Operating now, 180 or more days after the first award"
				description={defs.operatingNow}
				className="mb-6"
			>
				<div className="grid gap-6">
					<p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
						{fmt(operatingNow.operating)} of {fmt(operatingNow.eligible)}{" "}
						eligible SCF projects operate now (
						{pct(operatingNow.operating, operatingNow.eligible)}). Of the{" "}
						{fmt(
							operatingNow.onChainByCallers.measured +
								operatingNow.onChainByCallers.notMeasured,
						)}{" "}
						counted on chain, by distinct callers outside the team in 90 days:{" "}
						{operatingNow.onChainByCallers.bands
							.map((b) => `${b.band}: ${fmt(b.projects)}`)
							.join(", ")}
						; not measured {fmt(operatingNow.onChainByCallers.notMeasured)}.{" "}
						{defs.observable}
					</p>
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
				title="SCF-funded, by kind of award and by SDF's plan type"
				description={`${defs.scfFunded ?? ""} ${defs.planType ?? ""}`}
				className="mb-6"
			>
				<div className="grid gap-6">
					<Table
						head={["Award kind held", "Projects in the cohort"]}
						rows={Object.entries(data.scf.byAwardKind).map(([k, v]) => [
							AWARD_TYPE[k] ?? k,
							ofCell(v, data.scf.projects),
						])}
					/>
					<p className="text-xs text-muted-foreground">
						A project can hold several kinds. SCF-funded but not launched, so
						outside the cohort:{" "}
						{Object.entries(data.cohort.scfFundedOutsideCohort)
							.map(([k, v]) => `${k} ${fmt(v)}`)
							.join(", ")}
						.
					</p>
					<Table
						head={[
							"SDF's plan type",
							"Projects",
							"Launch known",
							"Past day 180",
							"Operating now, of read",
							"Named in other projects' code",
						]}
						rows={data.scfByPlanType.map((t) => [
							t.type,
							fmt(t.projects),
							ofCell(t.launchKnown, t.projects),
							fmt(t.pastDay180),
							ofCell(t.operatingNowPastDay180, t.pastDay180Read),
							ofCell(t.withDownstreamUser, t.projects),
						])}
					/>
				</div>
			</Card>

			<Card
				title="Use by others: distinct callers outside the team"
				description={defs.usage}
				className="mb-6"
			>
				<Table
					head={[
						"Distinct callers in 90 days",
						"Projects measured",
						"SCF-funded in the cohort",
					]}
					rows={data.usage.all.bands.map((b, i) => [
						b.band,
						ofCell(b.projects, data.usage.all.measured),
						ofCell(
							data.usage.scf.bands[i]?.projects ?? 0,
							data.usage.scf.measured,
						),
					])}
				/>
				<p className="text-xs text-muted-foreground mt-4 leading-relaxed max-w-2xl">
					{fmt(data.usage.eventsLatest60dAtLeast1000)} projects have 1,000 or
					more events in the latest 60 days, every caller counted. Each row of
					the cohort API carries its contract ids, the deployers to leave out
					(onchainIds) and this reading (usage).
				</p>
			</Card>

			<Card
				title="SCF delivery by round"
				description={defs.deliveryByRound}
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
									{p.slug} · {p.status ?? "no status"}
									{p.inCohort ? "" : " (not in the cohort)"}
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
						{open_?.confidence && (
							<p className="text-xs text-muted-foreground mt-1">
								Confidence {open_.confidence}: {open_.confidenceBasis}.
							</p>
						)}
						{open_?.evidenceNotes.map((n) => (
							<p key={n} className="text-xs text-foreground mt-1">
								{n}
							</p>
						))}
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
				title="Definitions"
				description="Whose each definition is, and where ours differs from SDF's plan."
				className="mb-6"
			>
				<dl className="grid gap-4 text-sm">
					{Object.entries(defs).map(([k, v]) => (
						<div
							key={k}
							className="grid sm:grid-cols-[14rem_1fr] gap-1 sm:gap-4"
						>
							<dt className="text-foreground font-medium">{k}</dt>
							<dd className="text-muted-foreground leading-relaxed">{v}</dd>
						</div>
					))}
				</dl>
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
