"use client";

/**
 * Public builders directory. One job: find a person and see what they ship.
 *
 * Three parts, top to bottom: a pulse strip of counts that double as the
 * filters people reach for first, a toolbar (search, sort, country), and a
 * card grid. A card says who the person is, what they say about themselves,
 * which listed projects they build, and what the repos we index show.
 *
 * A profile with nothing to show (no bio, no role, no indexed repo, no
 * project) is held back behind "view more profiles", the same quality gate
 * the partner directory uses: 99 of 419 profiles on 2026-11-22.
 *
 * Human twin of GET /api/builders.
 */

import {
	ArrowRight,
	ArrowUpDown,
	ChevronDown,
	Globe,
	Search,
	Trophy,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryState } from "@/hooks/use-query-state";
import { agoSentence } from "@/lib/builder-code";
import { cn } from "@/lib/utils";

/** Serializable row the server builds from Passport + our repos index. */
export type BuilderRowData = {
	handle: string;
	name: string;
	avatar: string | null;
	role: string | null;
	location: string | null;
	bio: string | null;
	twitter: string | null;
	website: string | null;
	featured: boolean;
	commits30d: number;
	passportProjects: number;
	/** null: the activity read did not run or was cut, so not known */
	repos: number | null;
	stars: number | null;
	commits90d: number | null;
	lastCommitAt: string | null;
	projects: Array<{ slug: string; name: string }>;
	/** projects they only contribute to (org repos they committed to) */
	contributesTo: Array<{ slug: string; name: string }>;
	languages: string[];
	ambassador: { tier: string; region?: string } | null;
	/** hackathon builds whose repo is one of theirs (the profile page's rule);
	 * null: the hackathon index or the code read did not run, so not known */
	hackathons: { builds: number; wins: number; events: string[] } | null;
	/** ISO-3166 alpha-2 from the free-text location, when we can tell */
	country: { code: string; name: string } | null;
};

const flag = (code: string) =>
	String.fromCodePoint(
		...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
	);

type SortKey = "top" | "active" | "repos" | "stars" | "recent" | "name";
const SORTS: Array<{ key: SortKey; label: string }> = [
	{ key: "top", label: "Top builders" },
	{ key: "active", label: "Most commits" },
	{ key: "recent", label: "Recently active" },
	{ key: "repos", label: "Most repos" },
	{ key: "stars", label: "Most stars" },
	{ key: "name", label: "A to Z" },
];
const SORT_KEYS = SORTS.map((s) => s.key);

/** How many cards a page of the grid holds before "show more". */
const PAGE = 48;

const heat = (r: BuilderRowData) => r.commits30d * 3 + (r.commits90d ?? 0);
/** The default order. Raw commit counts put automated committers first (one
 * profile: 5,713 commits in 90 days across two repos, 2026-11-22), so each
 * count is log-damped: ten times the commits is a few points, not ten times
 * the weight. Building a listed project counts for more than committing to
 * one, a winning hackathon build for more than an entry, and a written bio
 * breaks near ties. No clock in it, so the server and the browser sort
 * alike. */
const top = (r: BuilderRowData) =>
	Math.log2(1 + heat(r)) +
	Math.log2(1 + (r.stars ?? 0)) +
	(r.projects.length > 0 ? 4 : r.contributesTo.length > 0 ? 2 : 0) +
	(r.hackathons?.wins ? 2 : r.hackathons?.builds ? 1 : 0) +
	(r.bio ? 1 : 0);
const enteredHackathon = (r: BuilderRowData) => (r.hackathons?.builds ?? 0) > 0;
// an unknown count sorts below every known one, zero included
const known = (n: number | null) => n ?? -1;
const within = (iso: string | null, days: number) =>
	Date.parse(iso ?? "") > Date.now() - days * 86_400_000;
const isRecent = (r: BuilderRowData) =>
	heat(r) > 0 || within(r.lastCommitAt, 90);
const onListedProject = (r: BuilderRowData) =>
	r.projects.length > 0 || r.contributesTo.length > 0;
/** Something a visitor can use: words about the person, code, a project or
 * recent commits. An unknown repo count is not a zero, so it never hides a
 * profile. Everything a pulse tile counts passes, so a tile's number and the
 * list its filter shows agree by construction. */
const hasSubstance = (r: BuilderRowData) =>
	!!r.bio ||
	!!r.role ||
	r.repos === null ||
	r.repos > 0 ||
	r.commits30d > 0 ||
	onListedProject(r) ||
	r.passportProjects > 0 ||
	enteredHackathon(r) ||
	!!r.ambassador;

// The site-wide filter-button shell (leaderboard/directory pattern).
const btnBase =
	"h-11 px-4 inline-flex items-center justify-between gap-2 rounded-xl bg-card border border-border/50 text-foreground hover:bg-white/[0.04] transition-colors";

export function BuildersDirectory({
	rows,
	total,
}: {
	rows: BuilderRowData[];
	/** the directory's size as its source counts it; rows can be fewer when
	 * the read stops at its ceiling */
	total: number;
}) {
	const [q, setQ] = useQueryState("q", "");
	const [sort, setSort] = useQueryState("sort", "top", SORT_KEYS);
	const [active, setActive] = useQueryState("active", "");
	const onlyActive = active === "1";
	const [projectsOnly, setProjectsOnly] = useQueryState("projects", "");
	const onlyProjects = projectsOnly === "1";
	const [ambassadorsOnly, setAmbassadorsOnly] = useQueryState(
		"ambassadors",
		"",
	);
	const onlyAmbassadors = ambassadorsOnly === "1";
	const [hackathonsOnly, setHackathonsOnly] = useQueryState("hackathons", "");
	const onlyHackathons = hackathonsOnly === "1";
	const [countryParam, setCountry] = useQueryState("country", "");
	const country = countryParam || null;
	const [shownAll, setShownAll] = useQueryState("all", "");
	const showAll = shownAll === "1";
	const [pages, setPages] = useState(1);

	// The counts in the pulse strip describe the whole directory, whatever
	// the filters say, so each one names what its filter would show.
	const pulse = useMemo(() => {
		const countries = new Map<
			string,
			{ code: string; name: string; n: number }
		>();
		let activeN = 0;
		let listedN = 0;
		let ambassadorN = 0;
		let hackathonN = 0;
		// unknown on every row = the hackathon read did not run: no count to show
		let hackathonsKnown = false;
		for (const r of rows) {
			if (r.hackathons) hackathonsKnown = true;
			if (enteredHackathon(r)) hackathonN += 1;
			if (isRecent(r)) activeN += 1;
			if (onListedProject(r)) listedN += 1;
			if (r.ambassador) ambassadorN += 1;
			if (r.country) {
				const e = countries.get(r.country.code) ?? { ...r.country, n: 0 };
				e.n += 1;
				countries.set(r.country.code, e);
			}
		}
		return {
			activeN,
			listedN,
			ambassadorN,
			hackathonN,
			hackathonsKnown,
			countries: [...countries.values()].sort(
				(a, b) => b.n - a.n || a.name.localeCompare(b.name),
			),
		};
	}, [rows]);

	const matches = useMemo(() => {
		const needle = q.trim().toLowerCase();
		return (r: BuilderRowData) => {
			if (onlyActive && !isRecent(r)) return false;
			if (onlyProjects && !onListedProject(r)) return false;
			if (onlyAmbassadors && !r.ambassador) return false;
			if (onlyHackathons && !enteredHackathon(r)) return false;
			if (country && r.country?.code !== country) return false;
			if (needle) {
				const hay =
					`${r.name} ${r.handle} ${r.role ?? ""} ${r.location ?? ""} ${r.bio ?? ""} ${r.projects.map((p) => p.name).join(" ")} ${r.contributesTo.map((p) => p.name).join(" ")} ${r.languages.join(" ")} ${r.hackathons?.events.join(" ") ?? ""}`.toLowerCase();
				if (!hay.includes(needle)) return false;
			}
			return true;
		};
	}, [q, onlyActive, onlyProjects, onlyAmbassadors, onlyHackathons, country]);

	// A search by name should find the person even when their profile is
	// empty, so the gate only applies while nobody is typing.
	const gated = !showAll && q.trim() === "";
	const shown = useMemo(() => {
		const t = (iso: string | null) => Date.parse(iso ?? "0") || 0;
		const cmp: Record<
			SortKey,
			(a: BuilderRowData, b: BuilderRowData) => number
		> = {
			top: (a, b) =>
				top(b) - top(a) ||
				t(b.lastCommitAt) - t(a.lastCommitAt) ||
				a.name.localeCompare(b.name),
			active: (a, b) =>
				heat(b) - heat(a) ||
				t(b.lastCommitAt) - t(a.lastCommitAt) ||
				a.name.localeCompare(b.name),
			recent: (a, b) =>
				t(b.lastCommitAt) - t(a.lastCommitAt) || heat(b) - heat(a),
			repos: (a, b) =>
				known(b.repos) - known(a.repos) || known(b.stars) - known(a.stars),
			stars: (a, b) =>
				known(b.stars) - known(a.stars) || known(b.repos) - known(a.repos),
			name: (a, b) => a.name.localeCompare(b.name),
		};
		return rows
			.filter((r) => matches(r) && (!gated || hasSubstance(r)))
			.sort(
				(a, b) => Number(b.featured) - Number(a.featured) || cmp[sort](a, b),
			);
	}, [rows, matches, gated, sort]);
	const heldBack = useMemo(
		() =>
			gated ? rows.filter((r) => matches(r) && !hasSubstance(r)).length : 0,
		[rows, matches, gated],
	);

	const hasFilters =
		q.trim() !== "" ||
		onlyActive ||
		onlyProjects ||
		onlyAmbassadors ||
		onlyHackathons ||
		country !== null;
	const clear = () => {
		setQ("");
		setActive("");
		setProjectsOnly("");
		setAmbassadorsOnly("");
		setHackathonsOnly("");
		setCountry("");
		setPages(1);
	};
	const visible = shown.slice(0, pages * PAGE);
	const sortLabel = SORTS.find((s) => s.key === sort)?.label ?? "Top builders";
	const countryPicked = pulse.countries.find((c) => c.code === country);

	return (
		<div>
			{/* Pulse: the directory in a few numbers; all but the last filter it */}
			<div
				className={cn(
					"grid grid-cols-2 gap-3 mb-6",
					pulse.ambassadorN > 0 && pulse.hackathonsKnown
						? "lg:grid-cols-5"
						: "lg:grid-cols-4",
				)}
			>
				<PulseTile
					value={total}
					label="Builders"
					hint="every profile in the directory"
					pressed={!hasFilters}
					onClick={clear}
				/>
				<PulseTile
					value={pulse.activeN}
					label="Active in 90 days"
					hint="pushed code we can see"
					pressed={onlyActive}
					onClick={() => {
						setActive(onlyActive ? "" : "1");
						setPages(1);
					}}
					live
				/>
				<PulseTile
					value={pulse.listedN}
					label="On a listed project"
					hint="build or contribute to one"
					pressed={onlyProjects}
					onClick={() => {
						setProjectsOnly(onlyProjects ? "" : "1");
						setPages(1);
					}}
				/>
				{pulse.hackathonsKnown && (
					<PulseTile
						value={pulse.hackathonN}
						label="Hackathon builders"
						hint="entered one with their code"
						pressed={onlyHackathons}
						onClick={() => {
							setHackathonsOnly(onlyHackathons ? "" : "1");
							setPages(1);
						}}
					/>
				)}
				{pulse.ambassadorN > 0 ? (
					<PulseTile
						value={pulse.ambassadorN}
						label="Ambassadors"
						hint="Stellar ambassador programme"
						pressed={onlyAmbassadors}
						onClick={() => {
							setAmbassadorsOnly(onlyAmbassadors ? "" : "1");
							setPages(1);
						}}
					/>
				) : (
					!pulse.hackathonsKnown && (
						<PulseTile
							value={pulse.countries.length}
							label="Countries"
							hint="read from profile locations"
						/>
					)
				)}
			</div>

			{/* Toolbar */}
			<div className="flex flex-col md:flex-row gap-3 mb-8">
				<div className="relative flex-1">
					<Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
					<input
						type="text"
						value={q}
						onChange={(e) => {
							setQ(e.target.value);
							setPages(1);
						}}
						placeholder="Search name, project, language or place"
						aria-label="Search builders"
						className="w-full h-11 pl-11 pr-4 bg-card text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-white/30 focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]"
					/>
				</div>
				<div className="grid grid-cols-2 md:flex gap-3">
					<DropdownMenu>
						<DropdownMenuTrigger className={cn(btnBase, "md:min-w-[190px]")}>
							<ArrowUpDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
							<span className="flex-1 text-left text-sm truncate">
								{sortLabel}
							</span>
							<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-[190px]">
							{SORTS.map((s) => (
								<DropdownMenuItem
									key={s.key}
									onClick={() => setSort(s.key)}
									className={
										sort === s.key
											? "bg-white/10 text-foreground"
											: "text-foreground hover:bg-white/5"
									}
								>
									{s.label}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
					<DropdownMenu>
						<DropdownMenuTrigger className={cn(btnBase, "md:min-w-[190px]")}>
							<Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
							<span className="flex-1 text-left text-sm truncate">
								{countryPicked
									? `${flag(countryPicked.code)} ${countryPicked.name}`
									: "All countries"}
							</span>
							<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-[230px] max-h-[400px] overflow-y-auto">
							<DropdownMenuItem
								onClick={() => {
									setCountry("");
									setPages(1);
								}}
								className={
									country === null
										? "bg-white/10 text-foreground"
										: "text-foreground hover:bg-white/5"
								}
							>
								All countries
							</DropdownMenuItem>
							{pulse.countries.map((c) => (
								<DropdownMenuItem
									key={c.code}
									onClick={() => {
										setCountry(c.code);
										setPages(1);
									}}
									className={cn(
										"flex items-center justify-between gap-3",
										country === c.code
											? "bg-white/10 text-foreground"
											: "text-foreground hover:bg-white/5",
									)}
								>
									<span>
										{flag(c.code)} {c.name}
									</span>
									<span className="text-xs text-muted-foreground tabular-nums">
										{c.n}
									</span>
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{/* Results header */}
			<div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 mb-4">
				<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
					<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground tabular-nums">
						{shown.length === 0
							? "No builders match"
							: `${shown.length.toLocaleString("en-US")} builder${shown.length === 1 ? "" : "s"}`}
					</h2>
					{sort === "top" && shown.length > 1 && (
						<p className="text-xs text-muted-foreground/70">
							ordered by recent commits, stars on their own repos, listed
							projects and hackathon builds
						</p>
					)}
				</div>
				<div className="flex items-center gap-4 text-xs text-muted-foreground">
					{heldBack > 0 && shown.length > 0 && (
						<button
							type="button"
							onClick={() => setShownAll("1")}
							className="hover:text-foreground transition-colors"
						>
							Show {heldBack} empty {heldBack === 1 ? "profile" : "profiles"}
						</button>
					)}
					{showAll && (
						<button
							type="button"
							onClick={() => setShownAll("")}
							className="hover:text-foreground transition-colors"
						>
							Hide empty profiles
						</button>
					)}
					{hasFilters && (
						<button
							type="button"
							onClick={clear}
							className="hover:text-foreground transition-colors"
						>
							Clear filters
						</button>
					)}
				</div>
			</div>

			{shown.length === 0 ? (
				<div className="rounded-2xl border border-border bg-card p-10 text-center">
					<p className="text-muted-foreground text-sm">
						No one matches that yet.{" "}
						{heldBack > 0 ? (
							<button
								type="button"
								onClick={() => setShownAll("1")}
								className="text-foreground underline"
							>
								View {heldBack} more {heldBack === 1 ? "profile" : "profiles"}
							</button>
						) : (
							"Clear a filter, or try a project or language name."
						)}
					</p>
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
					{visible.map((r) => (
						<BuilderCard key={r.handle} r={r} />
					))}
				</div>
			)}

			{visible.length < shown.length && (
				<div className="mt-8 text-center">
					<button
						type="button"
						onClick={() => setPages((p) => p + 1)}
						className={cn(btnBase, "justify-center text-sm")}
					>
						Show {Math.min(PAGE, shown.length - visible.length)} more
						<span className="text-muted-foreground tabular-nums">
							{visible.length} of {shown.length.toLocaleString("en-US")}
						</span>
					</button>
				</div>
			)}

			{/* Quiet view-all: profiles with nothing to show yet */}
			{heldBack > 0 && shown.length > 0 && visible.length >= shown.length && (
				<div className="mt-8 text-center">
					<button
						type="button"
						onClick={() => setShownAll("1")}
						className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
					>
						view {heldBack} more {heldBack === 1 ? "profile" : "profiles"} with
						no bio, code or project yet
					</button>
				</div>
			)}
		</div>
	);
}

/** One number about the directory. With onClick it is also a filter. */
function PulseTile({
	value,
	label,
	hint,
	pressed,
	onClick,
	live = false,
}: {
	value: number;
	label: string;
	hint: string;
	pressed?: boolean;
	onClick?: () => void;
	live?: boolean;
}) {
	const body = (
		<>
			<span className="flex items-center gap-2 text-xs text-muted-foreground">
				{live && (
					<span
						className="h-1.5 w-1.5 rounded-full bg-emerald-400"
						aria-hidden
					/>
				)}
				{label}
			</span>
			<span className="mt-1.5 block text-2xl md:text-3xl font-semibold tracking-tight tabular-nums text-foreground">
				{value.toLocaleString("en-US")}
			</span>
			<span className="mt-1 block text-[11px] text-muted-foreground/70">
				{hint}
			</span>
		</>
	);
	const shell =
		"flex h-full flex-col items-start rounded-xl border p-4 text-left transition-colors";
	if (!onClick)
		return <div className={cn(shell, "border-border/50 bg-card")}>{body}</div>;
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={!!pressed}
			className={cn(
				shell,
				pressed
					? "border-white/40 bg-white/[0.06]"
					: "border-border/50 bg-card hover:border-white/25 hover:bg-white/[0.03]",
			)}
		>
			{body}
		</button>
	);
}

/** "Founder · 🇨🇱 Chile", or the handle when the profile says neither. */
function tagline(r: BuilderRowData): string {
	const place = r.location
		? `${r.country ? `${flag(r.country.code)} ` : ""}${r.location}`
		: null;
	return [r.role, place].filter(Boolean).join(" · ") || `@${r.handle}`;
}

function BuilderCard({ r }: { r: BuilderRowData }) {
	const [avatarFailed, setAvatarFailed] = useState(false);
	// builds first: a project of their own says more than one they commit to
	const projects = [
		...r.projects.map((p) => ({ ...p, own: true })),
		...r.contributesTo.map((p) => ({ ...p, own: false })),
	];
	const activeNow = r.commits30d > 0 || within(r.lastCommitAt, 30);
	// a bio that only repeats the role line above it says nothing twice
	const flat = (v: string | null) => (v ?? "").toLowerCase().trim();
	const bio = r.bio && flat(r.role).startsWith(flat(r.bio)) ? null : r.bio;
	const facts: Array<{ value: string; label: string; title?: string }> = [];
	if (r.repos !== null && r.repos > 0) {
		facts.push({
			value: r.repos.toLocaleString("en-US"),
			label: r.repos === 1 ? "Stellar repo" : "Stellar repos",
		});
		facts.push({
			value: (r.stars ?? 0).toLocaleString("en-US"),
			label: r.stars === 1 ? "star" : "stars",
		});
	}
	if (r.commits30d > 0)
		facts.push({
			value: r.commits30d.toLocaleString("en-US"),
			label: "commits, 30d",
			title: "their commits in the last 30 days, from Stellar Passport",
		});
	else if (r.commits90d !== null && r.commits90d > 0)
		facts.push({
			value: r.commits90d.toLocaleString("en-US"),
			label: "commits, 90d",
			title: "commits on the repos they own, last 90 days",
		});
	else if (r.passportProjects > 0)
		facts.push({
			value: String(r.passportProjects),
			label: r.passportProjects === 1 ? "project" : "projects",
		});

	return (
		<Link href={`/builders/${r.handle}`} className="block h-full group">
			<div className="idea-card rounded-xl p-5 cursor-pointer flex flex-col h-full">
				{/* Who */}
				<div className="flex items-start gap-3.5">
					{r.avatar && !avatarFailed ? (
						<Image
							src={r.avatar}
							alt=""
							width={52}
							height={52}
							onError={() => setAvatarFailed(true)}
							className="w-[52px] h-[52px] rounded-full object-cover border border-border/50 flex-shrink-0 transition-colors duration-150 group-hover:border-white/30"
						/>
					) : (
						<div className="w-[52px] h-[52px] rounded-full border border-border/50 bg-white/[0.04] flex items-center justify-center text-lg font-semibold text-muted-foreground flex-shrink-0">
							{r.name.charAt(0).toUpperCase()}
						</div>
					)}
					<div className="min-w-0 flex-1 pt-0.5">
						<div className="flex items-center gap-2">
							<h3 className="text-base font-semibold text-foreground group-hover:text-white transition-colors duration-150 leading-tight truncate">
								{r.name}
							</h3>
							{r.featured && (
								<span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-white text-[#171717] flex-shrink-0">
									Featured
								</span>
							)}
						</div>
						<p className="mt-1 text-xs text-muted-foreground truncate">
							{tagline(r)}
						</p>
					</div>
					{activeNow && (
						<span className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] rounded-full border border-border/60 text-emerald-400/90 flex-shrink-0">
							<span
								className="h-1.5 w-1.5 rounded-full bg-emerald-400"
								aria-hidden
							/>
							Active
						</span>
					)}
				</div>

				{/* What they say */}
				{bio && (
					<p className="mt-4 text-sm text-muted-foreground line-clamp-2 leading-relaxed group-hover:text-foreground/80 transition-colors duration-150">
						{bio}
					</p>
				)}

				{/* What they ship */}
				{projects.length > 0 && (
					<div className="mt-4 flex flex-wrap items-center gap-1.5">
						{projects.slice(0, 3).map((p) => (
							<span
								key={`${p.own ? "b" : "c"}-${p.slug}`}
								title={p.own ? "builds" : "contributes to"}
								className={cn(
									"px-2 py-0.5 text-xs rounded-md border whitespace-nowrap",
									p.own
										? "border-border bg-white/[0.06] text-foreground/90"
										: "border-border/60 text-muted-foreground",
								)}
							>
								{p.name}
							</span>
						))}
						{projects.length > 3 && (
							<span className="text-xs text-muted-foreground">
								+{projects.length - 3}
							</span>
						)}
					</div>
				)}
				{r.hackathons && r.hackathons.builds > 0 && (
					<p
						className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"
						title={r.hackathons.events.join(", ")}
					>
						<Trophy
							className={cn(
								"w-3.5 h-3.5 flex-shrink-0",
								r.hackathons.wins > 0 && "text-foreground/90",
							)}
							aria-hidden
						/>
						<span className="truncate">
							{r.hackathons.builds === 1
								? `Built at ${r.hackathons.events[0]}`
								: `${r.hackathons.builds} hackathon builds`}
							{r.hackathons.wins > 0 && (
								<span className="text-foreground/90">
									{" · "}
									{r.hackathons.wins === 1
										? "1 winning build"
										: `${r.hackathons.wins} winning builds`}
								</span>
							)}
						</span>
					</p>
				)}
				{r.ambassador && (
					<p className="mt-3 text-xs text-muted-foreground">
						Stellar Ambassador · {r.ambassador.tier}
						{r.ambassador.region ? ` · ${r.ambassador.region}` : ""}
					</p>
				)}

				{/* What the code shows */}
				{facts.length > 0 && (
					<dl
						className={cn(
							"mt-4 grid gap-2",
							facts.length >= 3 ? "grid-cols-3" : "grid-cols-2",
						)}
					>
						{facts.slice(0, 3).map((f) => (
							<div
								key={f.label}
								title={f.title}
								className="rounded-lg bg-white/[0.03] border border-border/40 px-2.5 py-2"
							>
								<dd className="text-sm font-semibold tabular-nums text-foreground">
									{f.value}
								</dd>
								<dt className="text-[10px] text-muted-foreground truncate">
									{f.label}
								</dt>
							</div>
						))}
					</dl>
				)}

				{/* Footer: languages, last commit, the way in */}
				<div className="mt-auto pt-4">
					<div className="flex items-center justify-between gap-3 pt-4 border-t border-border group-hover:border-white/20 transition-colors duration-150">
						<span className="min-w-0 truncate text-xs text-muted-foreground">
							{r.languages.slice(0, 2).join(" · ") ||
								(r.lastCommitAt ? "" : "View profile")}
							{r.languages.length > 0 && r.lastCommitAt ? " · " : ""}
							{r.lastCommitAt
								? `last commit ${agoSentence(r.lastCommitAt)}`
								: ""}
						</span>
						<ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all duration-150 flex-shrink-0" />
					</div>
				</div>
			</div>
		</Link>
	);
}
