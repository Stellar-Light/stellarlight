import {
	Activity,
	ArrowLeft,
	Calendar,
	CheckCircle2,
	Clock,
	ExternalLink,
	Trophy,
	XCircle,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { CURATED_HACKATHONS } from "@/data/curated-hackathons";
import { getHackathonDetail } from "@/lib/hackathon-detail";
import {
	type DoraHacksHackathon,
	fetchAllDoraHacksHackathons,
	getHackathonUrl,
} from "@/lib/integrations/dorahacks";
import { getPayloadSafe } from "@/lib/payload-client";
import { clampSentences, plainText } from "@/lib/quality-text";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

/** A winner or submission as GET /api/hackathons/{slug} serves it: the
 * DoraHacks shape, the curated roster's or the hackathons collection's. */
type Row = {
	id: string;
	name: string;
	url: string;
	slug?: string | null;
	project?: { slug: string } | null;
	category?: string | null;
	track?: string | null;
	hackathonPrizeTrack?: string | null;
	shortDescription?: string | null;
	description?: string | null;
	hackathonStatus?: string | null;
	hackathonPlacement?: string | null;
	placementRank?: number | null;
	prizeUsd?: number | null;
	hackathonPrize?: number | null;
};

/** The event as the API serves it; a null count is not known, never 0. */
type Hackathon = {
	name: string;
	slug: string;
	description: string | null;
	startDate: string | null;
	endDate: string | null;
	status: string;
	externalUrl: string | null;
	organizer: { name: string } | null;
	source?: string;
	coverage?: string;
	stats: {
		totalSubmissions: number | null;
		coverageNote: string | null;
		winnersNote: string | null;
		outcomes: {
			built: number;
			inProgress: number;
			abandoned: number;
		} | null;
	};
};

const NOT_KNOWN = "not known";

/** How long the page waits for the API's answer, the store's start
 * included: the bound /hackathons puts on the same DoraHacks reads.
 * Uncached, the answer took 0.7 to 1.6 s for six events (2026-10-23); a cold
 * one chains DoraHacks reads with 5 s timeouts, the store reads and, for an
 * event with no stored submissions (four of the seven curated events,
 * HackMeridian 2026 among them), a live roster read. Past it, or with the
 * store down (the API's 503), the page renders the event's own facts, and
 * the read runs on to warm the caches. */
const DEADLINE_MS = 6000;

/** What the page renders: the API's answer, or without it the event's
 * facts with its winners and submissions not loaded. */
type Loaded =
	| { found: false }
	| {
			found: true;
			late: boolean;
			hackathon: Hackathon;
			winners: readonly Row[];
			submissions: readonly Row[];
	  };

/** An event's facts from its listing row (a curated event's is its record,
 * no DoraHacks read), as the API's DoraHacks branch derives them. */
function factsOf(h: DoraHacksHackathon): Hackathon {
	const now = Math.floor(Date.now() / 1000);
	const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
	return {
		name: h.title,
		slug: h.uname,
		description: h.description ?? null,
		startDate: day(h.start_time),
		endDate: day(h.end_time),
		status:
			h.start_time > now
				? "upcoming"
				: h.end_time < now
					? "completed"
					: "active",
		externalUrl: getHackathonUrl(h),
		organizer: h.organization ? { name: h.organization.name } : null,
		source: h.source === "curated" ? "curated" : "dorahacks",
		stats: {
			totalSubmissions: null,
			coverageNote: null,
			winnersNote: null,
			outcomes: null,
		},
	};
}

/** The API's answer for this slug, read once per request (the metadata and
 * the page share it). */
const load = cache(async (slug: string): Promise<Loaded> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<null>((done) => {
		timer = setTimeout(() => done(null), DEADLINE_MS);
	});
	try {
		const curated = CURATED_HACKATHONS.find((h) => h.uname === slug);
		// A DoraHacks event's facts, in case the answer does not come.
		const listing = curated
			? null
			: fetchAllDoraHacksHackathons().catch(() => null);
		const detail = await Promise.race([
			// The store down is the API's 503, and a read that throws its 500:
			// both are outages, never "no such event".
			getPayloadSafe()
				.then((payload) => (payload ? getHackathonDetail(payload, slug) : null))
				.catch(() => null),
			deadline,
		]);
		if (detail) {
			if (!detail.found) return { found: false };
			const { hackathon, winners, submissions } = detail.body;
			return { found: true, late: false, hackathon, winners, submissions };
		}
		const row =
			curated ??
			(await Promise.race([listing, deadline]))?.find((h) => h.uname === slug);
		// Nothing known is not "no such event": an error, never a 404.
		if (!row) throw new Error(`hackathon ${slug}: no answer, and no facts`);
		return {
			found: true,
			late: true,
			hackathon: factsOf(row),
			winners: [],
			submissions: [],
		};
	} finally {
		clearTimeout(timer);
	}
});

/** A DoraHacks event's description is its event page in markdown (23,058
 * characters for Real-World ZK); the page shows its first paragraph of prose
 * as plain text, or nothing when the page has none. Any other event's
 * description is plain text, shown whole. */
function leadOf(h: Hackathon): string | null {
	if (h.source !== "dorahacks") return h.description;
	const prose = h.description
		?.split(/\n\s*\n/)
		.filter((b) => !/^\s*(#|!\[|>|[-*+] |\d+\. |\||<|```|---)/.test(b))
		.map((b) =>
			plainText(
				b
					.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
					.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
					.replace(/__/g, "")
					.replace(
						/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,;:!?]|$)/g,
						"$1$2",
					),
			),
		)
		// A sentence, not a label ("Formação de equipe") or a list of terms.
		.find((t) => t.length >= 60 && /[.!?](\s|$)/.test(t));
	return prose ? clampSentences(prose, 600).text : null;
}

const STATUS_META = {
	Built: {
		label: "Built",
		icon: CheckCircle2,
		classes: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
	},
	"In Progress": {
		label: "In Progress",
		icon: Clock,
		classes: "bg-blue-500/15 text-blue-400 border-blue-500/30",
	},
	Abandoned: {
		label: "Abandoned",
		icon: XCircle,
		classes: "bg-white/5 text-muted-foreground border-border/50",
	},
} as const;

type HackathonStatusKey = keyof typeof STATUS_META;

export async function generateMetadata({
	params,
}: {
	params: Params;
}): Promise<Metadata> {
	const { slug } = await params;
	// An outage renders the error page, under the site's default title.
	const loaded = await load(slug).catch(() => null);
	if (!loaded) return {};
	if (!loaded.found) return { title: "Hackathon Not Found" };
	const h = loaded.hackathon;
	const lead = leadOf(h);
	return {
		title: h.name,
		description: lead
			? clampSentences(lead, 160).text
			: `Dates, winners and submissions of ${h.name}, a Stellar hackathon.`,
		alternates: { canonical: `/hackathons/${h.slug}` },
	};
}

// The API serves calendar dates in UTC; read in the server's zone, a date
// west of UTC printed the day before.
const DAY = { month: "short", day: "numeric", timeZone: "UTC" } as const;

function formatDate(d: string) {
	return new Date(d).toLocaleDateString("en-US", { ...DAY, year: "numeric" });
}

function formatDateRange(start?: string | null, end?: string | null) {
	if (!start || !end) return "";
	const s = new Date(start);
	const e = new Date(end);
	const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
	const sameMonth = sameYear && s.getUTCMonth() === e.getUTCMonth();
	if (sameMonth) {
		return `${s.toLocaleDateString("en-US", DAY)}-${e.getUTCDate()}, ${e.getUTCFullYear()}`;
	}
	if (sameYear) {
		return `${s.toLocaleDateString("en-US", DAY)} to ${e.toLocaleDateString("en-US", DAY)}, ${e.getUTCFullYear()}`;
	}
	return `${formatDate(start)} to ${formatDate(end)}`;
}

const CARD =
	"group block rounded-2xl border border-border/50 hover:border-border bg-card p-5 transition-colors";

/** A row with a directory project opens its page; any other opens its own
 * url (its DoraHacks page, or the page that names the win) in a new tab. */
function RowLink({ p, children }: { p: Row; children: ReactNode }) {
	const slug = p.slug ?? p.project?.slug;
	return slug ? (
		<Link href={`/project/${slug}`} className={CARD}>
			{children}
		</Link>
	) : (
		<a href={p.url} target="_blank" rel="noopener noreferrer" className={CARD}>
			{children}
		</a>
	);
}

function StatusBadge({ status }: { status: HackathonStatusKey }) {
	const meta = STATUS_META[status];
	if (!meta) return null;
	const Icon = meta.icon;
	return (
		<span
			className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${meta.classes}`}
		>
			<Icon className="w-3 h-3" />
			{meta.label}
		</span>
	);
}

function StatBlock({
	label,
	value,
	sub,
}: {
	label: string;
	value: string;
	sub?: string;
}) {
	return (
		<div className="rounded-2xl border border-border/50 bg-card p-5">
			<div className="text-xs uppercase tracking-wide text-muted-foreground/80 mb-2">
				{label}
			</div>
			<div className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
				{value}
			</div>
			{sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
		</div>
	);
}

const PLACEMENT_META: Record<string, { label: string; classes: string }> = {
	"grand-prize": {
		label: "Grand Prize",
		classes: "bg-[#FDDA24] text-[#171717] border-[#FDDA24]",
	},
	"1st": {
		label: "1st",
		classes: "bg-[#FDDA24]/20 text-[#FDDA24] border-[#FDDA24]/40",
	},
	"2nd": {
		label: "2nd",
		classes: "bg-zinc-300/15 text-zinc-200 border-zinc-300/30",
	},
	"3rd": {
		label: "3rd",
		classes: "bg-amber-700/20 text-amber-400 border-amber-700/40",
	},
	"track-winner": {
		label: "Track Winner",
		classes: "bg-purple-500/15 text-purple-300 border-purple-500/30",
	},
	"honorable-mention": {
		label: "Honorable Mention",
		classes: "bg-white/5 text-muted-foreground border-border/50",
	},
};

/** The badge style of a placement rank as the API parses it (900 is an
 * honorable mention or finalist); any other rank, or none, a track winner's. */
const RANK_STYLE: Record<number, string> = {
	1: "1st",
	2: "2nd",
	3: "3rd",
	900: "honorable-mention",
};

/** The collection's placement values by name. Any other label (DoraHacks',
 * the curated roster's) is styled by its rank and split at a spaced hyphen,
 * en dash or em dash: the place goes in the badge, and what follows is a
 * prize ("1st Place - $5,000 in XLM", which the footer shows from prizeUsd)
 * or the roster's category ("1st", then "Confidential Wallets"). */
function placementMeta(p: Row) {
	if (!p.hackathonPlacement) return null;
	const known = PLACEMENT_META[p.hackathonPlacement];
	if (known) return { ...known, category: null };
	const [place, ...rest] = p.hackathonPlacement.split(/\s+[-\u2013\u2014]\s+/);
	const after = rest.join(" ");
	const style = RANK_STYLE[p.placementRank ?? 0] ?? "track-winner";
	return {
		label: place,
		classes: PLACEMENT_META[style].classes,
		category: after && !after.includes("$") ? after : null,
	};
}

function WinnerCard({ p }: { p: Row }) {
	const meta = placementMeta(p);
	const prize = p.prizeUsd ?? p.hackathonPrize;
	// The track a prize was won in: the collection's, or the roster's
	// category from its placement. A DoraHacks track shows on the category
	// line instead.
	const track = p.hackathonPrizeTrack ?? meta?.category;
	const blurb = p.shortDescription ?? p.description;
	return (
		<RowLink p={p}>
			<div className="flex items-start justify-between gap-3 mb-3">
				<div className="flex items-center gap-3 min-w-0 flex-1">
					<div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-border/50 flex items-center justify-center flex-shrink-0">
						<Trophy className="w-5 h-5 text-[#FDDA24]" />
					</div>
					<div className="min-w-0">
						<h3 className="text-base font-semibold text-foreground group-hover:text-white transition-colors leading-tight truncate">
							{p.name}
						</h3>
						<div className="text-xs text-muted-foreground truncate">
							{p.category ?? p.track}
						</div>
					</div>
				</div>
				{meta && (
					<span
						className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${meta.classes} flex-shrink-0`}
					>
						{meta.label}
					</span>
				)}
			</div>

			{blurb && (
				<p className="text-sm text-muted-foreground line-clamp-2 mb-3">
					{blurb}
				</p>
			)}

			<div className="flex items-center justify-between text-xs pt-3 border-t border-border/50">
				{prize ? (
					<span className="inline-flex items-center gap-1 text-foreground font-semibold">
						<Trophy className="w-3.5 h-3.5 text-[#FDDA24]" />$
						{prize.toLocaleString()}
					</span>
				) : (
					<span className="text-muted-foreground">Prize not stated</span>
				)}
				{track && (
					<span className="text-muted-foreground truncate ml-2">{track}</span>
				)}
			</div>
		</RowLink>
	);
}

function ProjectCard({ p }: { p: Row }) {
	const status = (p.hackathonStatus ?? undefined) as
		| HackathonStatusKey
		| undefined;
	const blurb = p.shortDescription ?? p.description;

	return (
		<RowLink p={p}>
			<div className="flex items-start gap-4 mb-3">
				<div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-border/50 flex items-center justify-center flex-shrink-0">
					<Activity className="w-5 h-5 text-muted-foreground" />
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-start justify-between gap-2 mb-1">
						<h3 className="text-base font-semibold text-foreground group-hover:text-white transition-colors leading-tight truncate">
							{p.name}
						</h3>
						{status && <StatusBadge status={status} />}
					</div>
					<div className="text-xs text-muted-foreground">
						{p.category ?? p.track}
					</div>
				</div>
			</div>
			{blurb && (
				<p className="text-sm text-muted-foreground line-clamp-2">{blurb}</p>
			)}
		</RowLink>
	);
}

export default async function HackathonDetailPage({
	params,
}: {
	params: Params;
}) {
	const { slug } = await params;
	const loaded = await load(slug);
	if (!loaded.found) notFound();
	// Winners ranked best first by the API; placementRank says when that is
	// a ranking.
	const { hackathon, winners, late } = loaded;
	const { stats } = hackathon;
	const winnersOnly = hackathon.coverage === "winners-only";
	// Only its winners on record: they show above, never as its submissions.
	const projects = winnersOnly ? [] : loaded.submissions;
	const submitted = stats.totalSubmissions;
	// A record can state the field's size ("110+ submissions") that is not
	// stored here, so the line says what is stored, not that it is unknown.
	const coverageLine = late
		? "This event's winners and submissions could not be loaded right now. Reload the page to try again."
		: winnersOnly
			? "Only this event's winners are stored here, not its full list of submissions."
			: stats.coverageNote;

	// Beside a count of unknowns, built, in progress and abandoned all 0 say
	// nothing was classified, not that nothing survived: not known, not 0.
	const builtCount = stats.outcomes?.built ?? 0;
	const inProgressCount = stats.outcomes?.inProgress ?? 0;
	const abandonedCount = stats.outcomes?.abandoned ?? 0;
	const trackedCount = builtCount + inProgressCount + abandonedCount;
	const tracked = trackedCount > 0;
	const shippedPct = tracked
		? Math.round(((builtCount + inProgressCount) / trackedCount) * 100)
		: 0;
	const ifTracked = (n: number) => (tracked ? n.toString() : NOT_KNOWN);

	const organizer = hackathon.organizer;
	const lead = leadOf(hackathon);

	const status = hackathon.status as
		| "upcoming"
		| "active"
		| "completed"
		| undefined;

	return (
		<div className="min-h-screen">
			<main className="max-w-5xl mx-auto px-4 sm:px-6 py-16 pt-28">
				<Link
					href="/hackathons"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-8 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">All hackathons</span>
				</Link>

				{/* Hero */}
				<div className="mb-10">
					<div className="flex items-center gap-2 mb-3">
						{status && (
							<Badge
								className={
									status === "active"
										? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
										: status === "upcoming"
											? "bg-blue-500/15 text-blue-400 border-blue-500/30"
											: "bg-white/5 text-muted-foreground border-border/50"
								}
							>
								{status === "active"
									? "Live"
									: status === "upcoming"
										? "Upcoming"
										: "Completed"}
							</Badge>
						)}
						{organizer?.name && (
							<span className="text-xs text-muted-foreground">
								organized by{" "}
								<span className="text-foreground">{organizer.name}</span>
							</span>
						)}
					</div>
					<h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
						{hackathon.name}
					</h1>
					<div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-6">
						<span className="inline-flex items-center gap-1.5">
							<Calendar className="w-4 h-4" />
							{formatDateRange(hackathon.startDate, hackathon.endDate)}
						</span>
						{hackathon.externalUrl && (
							<a
								href={hackathon.externalUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 text-foreground hover:underline underline-offset-4"
							>
								<ExternalLink className="w-4 h-4" />
								Official site
							</a>
						)}
					</div>
					{lead && (
						<p className="text-base text-muted-foreground leading-relaxed max-w-3xl">
							{lead}
						</p>
					)}
				</div>

				{/* Winners highlight */}
				{(winners.length > 0 || stats.winnersNote) && (
					<section className="mb-12">
						<div className="flex items-baseline gap-3 mb-5">
							<h2 className="text-2xl font-bold text-foreground tracking-tight inline-flex items-center gap-2">
								<Trophy className="w-5 h-5 text-[#FDDA24]" />
								Winners
							</h2>
							{winners.length > 0 && (
								<span className="text-sm text-muted-foreground">
									{winners.length}{" "}
									{winners.length === 1 ? "project" : "projects"}
								</span>
							)}
						</div>
						{stats.winnersNote && (
							<p className="text-sm text-muted-foreground leading-relaxed max-w-3xl mb-5">
								{stats.winnersNote}
							</p>
						)}
						{winners.length > 0 && (
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
								{winners.map((p) => (
									<WinnerCard key={p.id} p={p} />
								))}
							</div>
						)}
					</section>
				)}

				{/* Stats banner */}
				{(submitted !== null || tracked) && (
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
						<StatBlock
							label="Submitted projects"
							value={submitted === null ? NOT_KNOWN : submitted.toString()}
						/>
						<StatBlock
							label="Still building"
							value={ifTracked(builtCount + inProgressCount)}
							sub={tracked ? `${shippedPct}% of tracked` : undefined}
						/>
						<StatBlock
							label="Shipped"
							value={ifTracked(builtCount)}
							sub="status: Built"
						/>
						<StatBlock
							label="Abandoned"
							value={ifTracked(abandonedCount)}
							sub="status: Abandoned"
						/>
					</div>
				)}

				{/* Conversion funnel */}
				{tracked && (
					<div className="mb-12">
						<h2 className="text-xl font-bold text-foreground mb-4">
							Outcomes funnel
						</h2>
						<div className="rounded-2xl border border-border/50 bg-card p-5">
							<FunnelBar
								label="Built (still alive)"
								count={builtCount}
								total={trackedCount}
								color="bg-emerald-500"
							/>
							<FunnelBar
								label="In Progress"
								count={inProgressCount}
								total={trackedCount}
								color="bg-blue-500"
							/>
							<FunnelBar
								label="Abandoned"
								count={abandonedCount}
								total={trackedCount}
								color="bg-white/20"
							/>
						</div>
					</div>
				)}

				{/* Projects gallery */}
				<section className="mb-12">
					<div className="flex items-baseline gap-3 mb-5">
						<h2 className="text-2xl font-bold text-foreground tracking-tight">
							Projects
						</h2>
						{projects.length > 0 && submitted !== null && (
							<span className="text-sm text-muted-foreground">
								{submitted} submitted
							</span>
						)}
					</div>
					{coverageLine && (
						<p className="text-sm text-muted-foreground leading-relaxed max-w-3xl mb-5">
							{coverageLine}
						</p>
					)}

					{projects.length === 0 ? (
						!winnersOnly &&
						!late && (
							<div className="rounded-2xl border border-border/50 bg-card p-8 text-center">
								<Trophy className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
								<p className="text-sm text-muted-foreground">
									{status === "completed"
										? "No submissions from this event are on record."
										: "No submissions from this event are on record yet."}
								</p>
							</div>
						)
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{projects.map((p) => (
								<ProjectCard key={p.id} p={p} />
							))}
						</div>
					)}
				</section>
			</main>
		</div>
	);
}

function FunnelBar({
	label,
	count,
	total,
	color,
}: {
	label: string;
	count: number;
	total: number;
	color: string;
}) {
	const pct = total > 0 ? Math.round((count / total) * 100) : 0;
	return (
		<div className="mb-3 last:mb-0">
			<div className="flex items-center justify-between text-sm mb-1.5">
				<span className="text-foreground">{label}</span>
				<span className="text-muted-foreground">
					{count} · {pct}%
				</span>
			</div>
			<div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
				<div
					className={`h-full ${color} rounded-full transition-all`}
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}
