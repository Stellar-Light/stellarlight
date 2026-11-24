import { ArrowLeft, ExternalLink, Info, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import {
	type BuildCardRow,
	HackathonBuildsGrid,
} from "@/components/hackathon-builds-grid";
import { Badge } from "@/components/ui/badge";
import { CURATED_HACKATHONS } from "@/data/curated-hackathons";
import { libraryOf } from "@/lib/hackathon-analytics";
import type { LinkedProject } from "@/lib/hackathon-build-links";
import { getHackathonBuildsIndex } from "@/lib/hackathon-builds";
import { getHackathonDetail } from "@/lib/hackathon-detail";
import {
	type DoraHacksHackathon,
	fetchAllDoraHacksHackathons,
	formatDateRange,
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
	project?: LinkedProject | null;
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
	githubUrl?: string | null;
	demoUrl?: string | null;
	videoUrl?: string | null;
	builder?: string | null;
	/** A row of a partial list: why it is stored. */
	entryBasis?: string;
	contracts?: readonly unknown[];
	isWinner?: boolean;
	winnerSource?: string;
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
	prizePoolUSD?: number | null;
	tracks?: Array<{ name: string }> | null;
	stats: {
		totalSubmissions: number | null;
		upstreamSubmissions?: number | null;
		coverageNote: string | null;
		winnersNote: string | null;
		hiddenWinners?: readonly unknown[] | null;
		totalPrizeUSD?: number | null;
		outcomes: {
			built: number;
			inProgress: number;
			abandoned: number;
		} | null;
	};
};

/** How long the page waits for the API's answer, the store's start
 * included: the bound /hackathons puts on the same DoraHacks reads.
 * Uncached, the answer took 0.7 to 1.6 s for six events (2026-10-23); a cold
 * one chains DoraHacks reads with 5 s timeouts, the store reads and, for an
 * event with no stored submissions (four of the seven curated events,
 * HackMeridian 2026 among them), a live roster read. Past it, or with the
 * store down (the API's 503), the page renders the event's own facts, and
 * the read runs on to warm the caches. */
const DEADLINE_MS = 6000;

/** How long the page waits for the builds index, for each build's stack and
 * directory project. The answer above read the same cached index, so this
 * is a cache hit unless that read failed; past it the cards carry neither. */
const INDEX_DEADLINE_MS = 2000;

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
		prizePoolUSD: h.bonus_price || null,
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
		// A slug no listing read could look for is not "no such event": it
		// falls through to the facts below, or an error.
		if (detail && !("unchecked" in detail)) {
			if (!detail.found) return { found: false };
			const { hackathon, winners, submissions } = detail.body;
			// null: no roster held or none read; the page lists none either way.
			return {
				found: true,
				late: false,
				hackathon,
				winners,
				submissions: submissions ?? [],
			};
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

/** Each stored build of the event by id: the Stellar packages its repo
 * declares and the directory project that lists its repo, read from the
 * builds index. Empty when the index does not answer in time. */
async function indexExtras(slug: string) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const index = await Promise.race([
		getHackathonBuildsIndex().catch(() => null),
		new Promise<null>((done) => {
			timer = setTimeout(() => done(null), INDEX_DEADLINE_MS);
		}),
	]);
	clearTimeout(timer);
	return new Map(
		(index ?? [])
			.filter((b) => b.hackathon.slug === slug)
			.map((b) => [b.id, { stack: b.stack, project: b.project }]),
	);
}

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

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** What a build's own page is, as a link label. */
function pageLabel(url: string): string {
	if (url.includes("dorahacks.io")) return "DoraHacks";
	if (/\/hackproof\//i.test(url)) return "HackProof";
	try {
		return new URL(url).host.replace(/^www\./, "");
	} catch {
		return "Source";
	}
}

/** The list a partial event's builds come from, credited by name.
 * ponytail: HackProof is the one list partial rows come from (see
 * entryBasisLine); name each list here when a second lands. */
const PARTIAL_SOURCE = {
	name: "HackProof",
	url: (slug: string) => `https://hackproof-six.vercel.app/hackathon/${slug}`,
	how: "rebuilt from on-chain testnet activity and repos",
};

/** A row opens its repo when it names one, else its directory project,
 * else its own page (its DoraHacks page, or the page that names the win). */
function RowLink({
	p,
	className,
	children,
}: {
	p: Row;
	className: string;
	children: ReactNode;
}) {
	const slug = p.slug ?? p.project?.slug;
	return !p.githubUrl && slug ? (
		<Link href={`/project/${slug}`} className={className}>
			{children}
		</Link>
	) : (
		<a
			href={p.githubUrl ?? p.url}
			target="_blank"
			rel="noopener noreferrer"
			className={className}
		>
			{children}
		</a>
	);
}

/** One fact about the event. A word ("Not stored") where the data holds
 * no count, never a 0 standing in for one. */
function Tile({
	label,
	value,
	hint,
	className = "",
}: {
	label: string;
	value: string;
	hint?: string | null;
	className?: string;
}) {
	const numeric = /^[$\d]/.test(value);
	return (
		<div
			className={`flex flex-col items-start rounded-xl border border-border/50 bg-card p-4 ${className}`}
		>
			<span className="text-xs text-muted-foreground">{label}</span>
			<span
				className={`mt-1.5 block font-semibold tracking-tight tabular-nums text-foreground ${numeric ? "text-2xl md:text-3xl" : "text-lg md:text-xl"}`}
			>
				{value}
			</span>
			{hint && (
				<span className="mt-1 block text-[11px] text-muted-foreground/70 line-clamp-2">
					{hint}
				</span>
			)}
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
 * prize ("1st Place - $5,000 in XLM", which the strip shows from prizeUsd)
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

type Extras = Map<
	string,
	{ stack?: string[]; project?: LinkedProject | null } | undefined
>;

/** A row as its build card shows it: its name opens its repo. */
function cardOf(p: Row, extras: Extras): BuildCardRow {
	const extra = extras.get(p.id);
	// A collection row is a directory project: without a repo its card
	// opens that page.
	const own = p.slug ?? null;
	const linked = own ? null : (extra?.project ?? p.project ?? null);
	const meta = placementMeta(p);
	const links: BuildCardRow["links"] = [];
	if (p.demoUrl) links.push({ label: "Demo", href: p.demoUrl });
	if (p.videoUrl) links.push({ label: "Video", href: p.videoUrl });
	// Its own page, when the name opens the repo instead.
	if (p.githubUrl && !own) links.push({ label: pageLabel(p.url), href: p.url });
	return {
		id: p.id,
		name: p.name,
		href: p.githubUrl ?? (own ? `/project/${own}` : p.url),
		external: !!p.githubUrl || !own,
		repo: p.githubUrl ?? null,
		track: p.category ?? p.track ?? p.hackathonPrizeTrack ?? null,
		placement: meta ? { label: meta.label, classes: meta.classes } : null,
		isWinner: p.isWinner ?? !!p.hackathonPlacement,
		status: p.hackathonStatus ?? null,
		blurb: p.shortDescription ?? p.description ?? null,
		contracts: p.contracts?.length ?? 0,
		stack: [...new Set((extra?.stack ?? []).map(libraryOf))],
		project: linked ? { slug: linked.slug, name: linked.name } : null,
		links,
	};
}

/** A note's own label ("Not announced upstream: ..."), or null. */
const noteLabel = (note: string) => {
	const head = note.split(":")[0];
	return head.length <= 40 && head !== note ? head : null;
};

/** One winner in the strip: place, name, prize, track; it opens the repo. */
function WinnerItem({ p }: { p: Row }) {
	const meta = placementMeta(p);
	const prize = p.prizeUsd ?? p.hackathonPrize;
	// The track a prize was won in: the row's, the collection's, or the
	// roster's category from its placement.
	const line = [
		...new Set(
			[p.category ?? p.track, p.hackathonPrizeTrack ?? meta?.category].filter(
				Boolean,
			),
		),
	].join(" · ");
	const blurb = p.shortDescription ?? p.description;
	const owner = p.githubUrl
		? /github\.com\/([^/?#]+)/i.exec(p.githubUrl)?.[1]
		: undefined;
	return (
		<RowLink
			p={p}
			className="group idea-card rounded-xl p-4 flex flex-col h-full"
		>
			<div className="flex items-start justify-between gap-3">
				<div className="flex items-center gap-2 min-w-0">
					{owner && (
						// biome-ignore lint/performance/noImgElement: a GitHub avatar, no optimisation wanted
						<img
							src={`https://github.com/${owner}.png?size=48`}
							alt=""
							width={24}
							height={24}
							loading="lazy"
							className="w-6 h-6 rounded-full border border-border/50 bg-white/[0.04] flex-shrink-0"
						/>
					)}
					{meta ? (
						<span
							className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border flex-shrink-0 ${meta.classes}`}
						>
							{meta.label}
						</span>
					) : (
						<Trophy className="w-4 h-4 text-[#FDDA24] flex-shrink-0" />
					)}
					<h3 className="text-sm font-semibold text-foreground group-hover:text-white transition-colors leading-tight truncate">
						{p.name}
					</h3>
				</div>
				{prize ? (
					<span className="text-sm font-semibold text-foreground tabular-nums flex-shrink-0">
						{usd(prize)}
					</span>
				) : null}
			</div>
			{(line || p.builder) && (
				<p className="mt-1.5 text-xs text-muted-foreground truncate">
					{line}
					{line && p.builder ? " · " : ""}
					{p.builder ? `by ${p.builder}` : ""}
				</p>
			)}
			{blurb && (
				<div className="mt-1.5 hidden sm:block">
					<p className="text-xs text-muted-foreground/80 line-clamp-2">
						{blurb}
					</p>
				</div>
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
	// A partial list from another source: its rows show, each with its basis,
	// never counted as the event's submissions.
	const partial = hackathon.coverage === "partial";
	// Only its winners on record: they show above, never as its submissions.
	const projects = winnersOnly ? [] : loaded.submissions;
	const submitted = stats.totalSubmissions;

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

	const organizer = hackathon.organizer;
	const lead = leadOf(hackathon);
	const short = lead ? clampSentences(lead, 240) : null;

	const status = hackathon.status as
		| "upcoming"
		| "active"
		| "completed"
		| undefined;
	const completed = status === "completed";

	const extras: Extras =
		late || projects.length === 0 ? new Map() : await indexExtras(slug);
	// A submission row carries no rank; its winner row does, for its badge.
	const rankOf = new Map(winners.map((w) => [w.id, w.placementRank]));
	const cards = projects.map((p) =>
		cardOf(
			{ ...p, placementRank: p.placementRank ?? rankOf.get(p.id) },
			extras,
		),
	);
	const onChain = cards.filter((c) => c.contracts > 0).length;
	// Winners the partial list's source names (a placement it lists).
	const listedWinners =
		partial && winners.some((w) => w.winnerSource && w.entryBasis);
	const source = partial
		? { ...PARTIAL_SOURCE, href: PARTIAL_SOURCE.url(hackathon.slug) }
		: null;

	// The tiles: a count where the data holds one, else a word that says why
	// there is none.
	const upstream = stats.upstreamSubmissions ?? null;
	const submissionsTile = late
		? { label: "Submissions", value: "Not loaded", hint: "reload to try again" }
		: submitted !== null
			? {
					label: "Submissions",
					value: submitted.toLocaleString("en-US"),
					hint:
						upstream !== null && upstream !== submitted
							? `of ${upstream.toLocaleString("en-US")} on DoraHacks`
							: null,
				}
			: partial
				? {
						label: "Builds found",
						value: projects.length.toLocaleString("en-US"),
						hint: `${onChain ? `${onChain} with testnet contracts · ` : ""}not the full field`,
					}
				: winnersOnly
					? {
							label: "Submissions",
							value: "Not listed",
							hint: "only the winners are on record",
						}
					: { label: "Submissions", value: "None on record" };
	const winnersTile = late
		? { label: "Winners", value: "Not loaded" }
		: winners.length > 0
			? {
					label: "Winners",
					value: String(winners.length),
					hint: listedWinners && source ? `as ${source.name} lists them` : null,
				}
			: {
					label: "Winners",
					value: completed ? "None on record" : "Not announced",
					hint: stats.winnersNote
						? (noteLabel(stats.winnersNote)?.toLowerCase() ?? null)
						: null,
				};
	const prize = hackathon.prizePoolUSD ?? stats.totalPrizeUSD ?? null;
	const tracks = hackathon.tracks?.length ? hackathon.tracks : null;
	const tileCount = tracks ? 5 : 4;

	// How these were found: one short line each, from the structured
	// fields; the API's full notes stay on the API.
	const lines: ReactNode[] = [];
	if (!late && source) {
		lines.push(
			<>
				Found by{" "}
				<a
					href={source.href}
					target="_blank"
					rel="noopener noreferrer"
					className="text-foreground underline underline-offset-2"
				>
					{source.name}
				</a>
				, which rebuilt the event from Stellar testnet activity during it and
				the builds' own repos.
			</>,
			`The organizer's submission list is not public, so these ${projects.length} builds are not the full field.`,
			`A build is listed when its repo names ${hackathon.name}, or ${source.name} lists it as a winner.`,
		);
		if (listedWinners) lines.push(`Winners as ${source.name} lists them.`);
	} else if (!late && submitted !== null && hackathon.source === "dorahacks") {
		const gap = upstream === null ? 0 : upstream - submitted;
		lines.push(
			`Submissions from DoraHacks, refreshed daily.${
				gap === 1
					? " 1 more on DoraHacks was hidden or deleted by its team, or resubmitted."
					: gap > 1
						? ` ${gap} more on DoraHacks were hidden or deleted by their teams, or resubmitted.`
						: gap < 0
							? ` ${-gap} are kept here that DoraHacks no longer lists.`
							: ""
			}`,
		);
	}
	if (!late && winnersOnly)
		lines.push(
			"Only this event's winners are stored here, not its full list of submissions.",
		);
	const hidden = stats.hiddenWinners?.length ?? 0;
	if (hidden)
		lines.push(
			hidden === 1
				? "One winning submission is not shown: its team hid or deleted it on DoraHacks."
				: `${hidden} winning submissions are not shown: their teams hid or deleted them on DoraHacks.`,
		);
	else if (stats.winnersNote && !listedWinners)
		lines.push(
			winners.length
				? clampSentences(stats.winnersNote, 170).text
				: `${noteLabel(stats.winnersNote) ?? "No winners on record here"}. That is not a claim that no one won.`,
		);
	if (stats.outcomes && !tracked && submitted !== null)
		lines.push(
			"What happened to these builds after the event is not tracked yet.",
		);
	if (onChain)
		lines.push(
			"Testnet contracts: contracts a build's repo cites that exist on testnet and were created during the event.",
		);

	return (
		<div className="min-h-screen">
			<main className="max-w-6xl mx-auto px-4 sm:px-6 py-16 pt-28">
				<Link
					href="/hackathons"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-8 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">All hackathons</span>
				</Link>

				{/* Header */}
				<div className="mb-8">
					<div className="flex flex-wrap items-center gap-2 mb-3">
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
						{hackathon.externalUrl && (
							<a
								href={hackathon.externalUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
							>
								<ExternalLink className="w-3.5 h-3.5" />
								Official site
							</a>
						)}
					</div>
					<h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
						{hackathon.name}
					</h1>
					{lead &&
						short &&
						(short.clamped ? (
							<details className="group max-w-3xl text-base text-muted-foreground leading-relaxed">
								<summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
									<span className="block group-open:hidden">
										<span className="line-clamp-3 md:line-clamp-none">
											{short.text}
										</span>
										<span className="text-sm text-foreground underline underline-offset-4">
											Read more
										</span>
									</span>
									<span className="hidden group-open:inline text-sm text-foreground underline underline-offset-4">
										Show less
									</span>
								</summary>
								<p className="mt-2">{lead}</p>
							</details>
						) : (
							<p className="text-base text-muted-foreground leading-relaxed max-w-3xl">
								{lead}
							</p>
						))}
					{source && (
						<a
							href={source.href}
							target="_blank"
							rel="noopener noreferrer"
							className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-white/30 transition-colors"
						>
							<span>
								Source: <span className="text-foreground">{source.name}</span>,{" "}
								{source.how}
							</span>
							<ExternalLink className="w-3 h-3 flex-shrink-0" />
						</a>
					)}
				</div>

				{late && (
					<p className="mb-6 inline-flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
						<Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
						This event's winners and submissions could not be loaded right now.
						Reload the page to try again.
					</p>
				)}

				{/* Stat tiles */}
				<div
					className={`grid grid-cols-2 gap-3 ${lines.length ? "mb-3" : "mb-12"} ${tileCount === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
				>
					<Tile {...submissionsTile} />
					<Tile {...winnersTile} />
					<Tile label="Prize pool" value={prize ? usd(prize) : "Not stated"} />
					{tracks && (
						<Tile
							label={tracks.length === 1 ? "Track" : "Tracks"}
							value={String(tracks.length)}
							hint={tracks.map((t) => t.name).join(", ")}
						/>
					)}
					<Tile
						label="Dates"
						value={
							formatDateRange(hackathon.startDate, hackathon.endDate) ||
							"Not stated"
						}
						className={tileCount === 5 ? "col-span-2 lg:col-span-1" : ""}
					/>
				</div>

				{lines.length > 0 && (
					<details className="group mb-12 rounded-xl border border-border/50 bg-card">
						<summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors [&::-webkit-details-marker]:hidden">
							<Info className="w-4 h-4 flex-shrink-0" />
							<span>How these were found</span>
							<span className="ml-auto text-xs group-open:hidden">Show</span>
							<span className="ml-auto text-xs hidden group-open:inline">
								Hide
							</span>
						</summary>
						<ul className="space-y-1.5 border-t border-border/50 px-4 py-3 text-sm text-muted-foreground list-disc pl-8 marker:text-muted-foreground/50">
							{lines.map((line, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed order
								<li key={i} className="max-w-3xl">
									{line}
								</li>
							))}
						</ul>
					</details>
				)}

				{/* Outcomes: only where the directory classified them */}
				{tracked && (
					<section className="mb-12">
						<h2 className="text-xl font-bold text-foreground mb-4">
							Outcomes funnel
						</h2>
						<div className="grid grid-cols-3 gap-3 mb-3">
							<Tile
								label="Still building"
								value={String(builtCount + inProgressCount)}
								hint={`${shippedPct}% of tracked`}
							/>
							<Tile
								label="Shipped"
								value={String(builtCount)}
								hint="status: Built"
							/>
							<Tile
								label="Abandoned"
								value={String(abandonedCount)}
								hint="status: Abandoned"
							/>
						</div>
						<div className="rounded-xl border border-border/50 bg-card p-5">
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
					</section>
				)}

				{/* Winners strip */}
				{winners.length > 0 && (
					<section className="mb-12">
						<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
							<h2 className="text-2xl font-bold text-foreground tracking-tight inline-flex items-center gap-2">
								<Trophy className="w-5 h-5 text-[#FDDA24]" />
								Winners
							</h2>
							<span className="text-sm text-muted-foreground">
								{winners.length} {winners.length === 1 ? "project" : "projects"}
							</span>
							{listedWinners && source && (
								<a
									href={source.href}
									target="_blank"
									rel="noopener noreferrer"
									className="self-center inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
								>
									via {source.name}
									<ExternalLink className="w-3 h-3" />
								</a>
							)}
						</div>
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
							{winners.map((p) => (
								<WinnerItem key={p.id} p={p} />
							))}
						</div>
					</section>
				)}

				{/* Builds */}
				{(projects.length > 0 || (!winnersOnly && !late)) && (
					<section className="mb-12">
						<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-5">
							<h2 className="text-2xl font-bold text-foreground tracking-tight">
								Builds
							</h2>
							{projects.length > 0 && (submitted !== null || partial) && (
								<span className="text-sm text-muted-foreground">
									{submitted !== null
										? `${submitted} submitted`
										: `${projects.length} builds found`}
								</span>
							)}
						</div>
						{projects.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								{completed
									? "No submissions from this event are on record."
									: "No submissions from this event are on record yet."}
							</p>
						) : (
							<HackathonBuildsGrid rows={cards} />
						)}
					</section>
				)}
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
