import {
	ArrowLeft,
	Building2,
	Calendar,
	Clock,
	DollarSign,
	ExternalLink,
	Info,
	Trophy,
	Users,
} from "lucide-react";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { HackathonCover } from "@/components/hackathon-cover";
import { HackathonsFilterDropdown } from "@/components/hackathons-filter-dropdown";
import { HackathonsSearchInput } from "@/components/hackathons-search-input";
import { RecentWinnersCarousel } from "@/components/recent-winners-carousel";
import { Badge } from "@/components/ui/badge";
import {
	LATEST_WINNERS,
	type RecentHackathonWinners,
} from "@/data/recent-hackathon-winners";
import { rosterSummary } from "@/lib/hackathon-analytics";
import {
	getHackathonBuildsIndex,
	type IndexedBuild,
} from "@/lib/hackathon-builds";
import {
	EVENT_KIND_LABEL,
	fetchAllDoraHacksHackathons,
	fetchLatestHackathonWinners,
	formatDateRange,
	formatPrize,
	formatShortDate,
	getDaysRemaining,
	getHackathonUrl,
	isHackathonActive,
	parseThemes,
} from "@/lib/integrations/dorahacks";
import { getPayloadSafe } from "@/lib/payload-client";
import { newestWinners, winnersFromIndex } from "@/lib/recent-winners";

export const metadata: Metadata = {
	title: "Stellar Hackathons & Winners",
	description:
		"Stellar hackathons with their winning builds, prize tracks and the teams behind them, indexed from the organisers' own results.",
	alternates: { canonical: "/hackathons" },
};

// The DoraHacks assembly — 2 org listings + 2 winner-submission fetches, run
// sequentially — was the page's whole cost: ~15-20s per request, because the
// page was `force-dynamic`, which disables the `revalidate: 3600` already set
// on each underlying fetch(), so every hit refetched live. Cache the MERGED
// result for an hour instead: the external calls happen once per window and are
// shared across every request, and unstable_cache serves stale-while-
// revalidating, so no request blocks on the refresh after warm-up. Our own
// curated data (fetchCuratedHackathons) stays uncached — it's a fast Mongo read
// and we want it fresh. Bump the key suffix to force an early refresh.
const getCachedDoraHackathons = unstable_cache(
	async () => {
		const hackathons = await fetchAllDoraHacksHackathons();
		// Newest wins across BOTH sources: the live DoraHacks pick keeps its
		// auto-update property, but a curated event that ended more recently
		// (e.g. Builder Summit SP 26, which never ran on DoraHacks) is not
		// shadowed by an older DoraHacks event forever. ISO dates compare as
		// strings.
		const live = await fetchLatestHackathonWinners(hackathons);
		const recentWinners =
			live && live.endedAt > LATEST_WINNERS.endedAt ? live : LATEST_WINNERS;
		return { hackathons, recentWinners };
	},
	["hackathons:dora-merge:v3"],
	{ revalidate: 3600, tags: ["hackathons"] },
);

// Cold-cache guard. Caching fixed the steady state (0.3-0.8s), but the FIRST
// request after a deploy still paid the full uncached assembly — measured 28s,
// which is both a bad first impression and enough to trip the 15s liveness
// check. So bound how long any single render will wait for DoraHacks: past the
// deadline we render from curated data instead of blocking.
//
// The abandoned promise is deliberately NOT cancelled — it keeps running and
// still populates unstable_cache, so the visitor who eats the timeout warms the
// cache for everyone behind them. Only a genuinely cold render degrades, and it
// degrades to real curated content rather than a spinner or an error.
const DORA_DEADLINE_MS = 6000;

async function getDoraWithDeadline(): Promise<{
	hackathons: Awaited<ReturnType<typeof fetchAllDoraHacksHackathons>>;
	recentWinners: RecentHackathonWinners;
	degraded: boolean;
}> {
	const real = getCachedDoraHackathons().then((d) => ({
		...d,
		degraded: false,
	}));
	const fallback = new Promise<{
		hackathons: Awaited<ReturnType<typeof fetchAllDoraHacksHackathons>>;
		recentWinners: RecentHackathonWinners;
		degraded: boolean;
	}>((resolve) =>
		setTimeout(
			() =>
				resolve({
					hackathons: [],
					recentWinners: LATEST_WINNERS,
					degraded: true,
				}),
			DORA_DEADLINE_MS,
		),
	);
	return Promise.race([real, fallback]);
}

/** Each event's stored rows, for its card's counts, bounded like the feed:
 * past the deadline the cards carry no counts (not read, never 0), and the
 * read runs on to warm the cache. */
function getIndexWithDeadline(): Promise<IndexedBuild[] | null> {
	return Promise.race([
		getHackathonBuildsIndex().catch(() => null),
		new Promise<null>((resolve) =>
			setTimeout(() => resolve(null), DORA_DEADLINE_MS),
		),
	]);
}

/** A URL's host, no "www.", or null. */
function hostOf(url?: string): string | null {
	try {
		return url ? new URL(url).host.replace(/^www\./, "") : null;
	} catch {
		return null;
	}
}

/** An ISO calendar day of a listing timestamp, for formatDateRange. */
const isoDay = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

const CHIP =
	"inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full border whitespace-nowrap";

/**
 * Normalize a hackathon name to a comparable key so we can match a DoraHacks
 * entry to a curated Payload Hackathon (which has its own slug + tracks
 * post-hackathon project status).
 */
function normalizeForMatch(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

interface CuratedHackathon {
	id: string;
	name: string;
	slug: string;
	trackedProjectCount: number;
}

interface CuratedData {
	byName: Map<string, CuratedHackathon>;
	trackedProjectsTotal: number;
	builtCount: number;
	inProgressCount: number;
	abandonedCount: number;
}

async function fetchCuratedHackathons(): Promise<CuratedData> {
	const byName = new Map<string, CuratedHackathon>();
	const data: CuratedData = {
		byName,
		trackedProjectsTotal: 0,
		builtCount: 0,
		inProgressCount: 0,
		abandonedCount: 0,
	};

	const payload = await getPayloadSafe();
	if (!payload) return data;

	try {
		const result = await payload.find({
			collection: "hackathons",
			limit: 200,
			depth: 0,
		});

		for (const h of result.docs as any[]) {
			let count = 0;
			try {
				const projRes = await payload.find({
					collection: "projects",
					where: { hackathon: { equals: h.id } },
					limit: 0,
					depth: 0,
				});
				count = projRes.totalDocs ?? 0;
			} catch {
				// ignore
			}
			byName.set(normalizeForMatch(h.name), {
				id: String(h.id),
				name: h.name,
				slug: h.slug,
				trackedProjectCount: count,
			});
		}

		// Cross-hackathon status counts for the global funnel.
		const all = await payload.find({
			collection: "projects",
			where: {
				hackathon: { exists: true },
			},
			limit: 0,
			depth: 0,
		});
		data.trackedProjectsTotal = all.totalDocs ?? 0;

		for (const status of ["Built", "In Progress", "Abandoned"] as const) {
			try {
				const res = await payload.find({
					collection: "projects",
					where: {
						and: [
							{ hackathon: { exists: true } },
							{ hackathonStatus: { equals: status } },
						],
					},
					limit: 0,
					depth: 0,
				});
				const n = res.totalDocs ?? 0;
				if (status === "Built") data.builtCount = n;
				else if (status === "In Progress") data.inProgressCount = n;
				else if (status === "Abandoned") data.abandonedCount = n;
			} catch {
				// ignore
			}
		}
	} catch (err) {
		console.error("fetchCuratedHackathons error:", err);
	}
	return data;
}

interface HackathonsPageProps {
	searchParams: Promise<{
		year?: string;
		org?: string;
		tag?: string;
		sort?: string;
		q?: string;
	}>;
}

type SortKey = "recent" | "oldest" | "prize-desc" | "participants-desc";
const VALID_SORTS: SortKey[] = [
	"recent",
	"oldest",
	"prize-desc",
	"participants-desc",
];

export default async function HackathonsPage({
	searchParams,
}: HackathonsPageProps) {
	const params = await searchParams;
	const filterYear = params.year && params.year !== "all" ? params.year : null;
	const filterOrg = params.org && params.org !== "all" ? params.org : null;
	const filterTag = params.tag && params.tag !== "all" ? params.tag : null;
	const sortKey: SortKey =
		params.sort && (VALID_SORTS as string[]).includes(params.sort)
			? (params.sort as SortKey)
			: "recent";
	const searchQuery = (params.q ?? "").trim().toLowerCase();

	// DoraHacks assembly comes from the hourly cache (see getCachedDoraHackathons);
	// our own curated data stays a fresh Mongo read.
	const [dora, curatedData, index] = await Promise.all([
		getDoraWithDeadline(),
		fetchCuratedHackathons(),
		getIndexWithDeadline(),
	]);
	const rowsBySlug = new Map<string, IndexedBuild[]>();
	for (const b of index ?? []) {
		const rows = rowsBySlug.get(b.hackathon.slug);
		if (rows) rows.push(b);
		else rowsBySlug.set(b.hackathon.slug, [b]);
	}
	const hackathons = dora.hackathons;
	const curatedMap = curatedData.byName;
	// status 1 covers both "open now" and "announced, starts later"; show live
	// ones first, then upcoming by start date, and label each honestly
	const nowSec = Date.now() / 1000;
	const activeHackathons = hackathons
		.filter((h) => isHackathonActive(h))
		.sort((a, b) => {
			const al = a.start_time <= nowSec ? 0 : 1;
			const bl = b.start_time <= nowSec ? 0 : 1;
			return (
				al - bl ||
				(al === 0 ? a.end_time - b.end_time : a.start_time - b.start_time)
			);
		});
	const liveCount = activeHackathons.filter(
		(h) => h.start_time <= nowSec,
	).length;
	let pastHackathons = hackathons.filter((h) => !isHackathonActive(h));

	// "Recent Winners": the event that ended last with winners on record,
	// stored (the builds index), live on DoraHacks or in the roster in code.
	const recentWinners: RecentHackathonWinners =
		newestWinners([
			dora.recentWinners,
			index ? winnersFromIndex(index) : null,
		]) ?? dora.recentWinners;

	// Build the set of distinct years, organizers, and tags from past hackathons (for filter UI).
	const years = Array.from(
		new Set(
			pastHackathons.map((h) => new Date(h.end_time * 1000).getFullYear()),
		),
	).sort((a, b) => b - a);
	const organizers = Array.from(
		new Set(
			pastHackathons
				.map((h) => h.organization?.name)
				.filter((n): n is string => Boolean(n)),
		),
	).sort();
	const tagCounts = pastHackathons.reduce<Record<string, number>>((acc, h) => {
		for (const tag of parseThemes(h.field)) {
			acc[tag] = (acc[tag] ?? 0) + 1;
		}
		return acc;
	}, {});
	const tags = Object.entries(tagCounts)
		.sort((a, b) => b[1] - a[1])
		.map(([t]) => t);

	if (filterYear) {
		pastHackathons = pastHackathons.filter(
			(h) => String(new Date(h.end_time * 1000).getFullYear()) === filterYear,
		);
	}
	if (filterOrg) {
		pastHackathons = pastHackathons.filter(
			(h) => h.organization?.name === filterOrg,
		);
	}
	if (filterTag) {
		const needle = filterTag.toLowerCase();
		pastHackathons = pastHackathons.filter((h) =>
			parseThemes(h.field).some((t) => t.toLowerCase() === needle),
		);
	}
	if (searchQuery) {
		pastHackathons = pastHackathons.filter((h) =>
			h.title.toLowerCase().includes(searchQuery),
		);
	}

	// Sort.
	switch (sortKey) {
		case "oldest":
			pastHackathons = [...pastHackathons].sort(
				(a, b) => a.end_time - b.end_time,
			);
			break;
		case "prize-desc":
			pastHackathons = [...pastHackathons].sort(
				(a, b) => (b.bonus_price ?? 0) - (a.bonus_price ?? 0),
			);
			break;
		case "participants-desc":
			pastHackathons = [...pastHackathons].sort(
				(a, b) => (b.hackers_count ?? 0) - (a.hackers_count ?? 0),
			);
			break;
		case "recent":
		default:
			pastHackathons = [...pastHackathons].sort(
				(a, b) => b.end_time - a.end_time,
			);
			break;
	}

	const findCurated = (title: string) =>
		curatedMap.get(normalizeForMatch(title));
	// Every event has its own page: a Payload-curated one under its slug, any
	// other under its uname (the detail page finds DoraHacks events in the
	// feed and file-curated events in CURATED_HACKATHONS). Only an event with
	// no uname links out.
	const eventPage = (h: (typeof hackathons)[number]): string | null => {
		const curated = findCurated(h.title);
		if (curated) return `/hackathons/${curated.slug}`;
		return h.uname ? `/hackathons/${encodeURIComponent(h.uname)}` : null;
	};

	// Cross-hackathon aggregate stats.
	const totalHackathons = hackathons.length;
	const totalPrizePool = hackathons.reduce(
		(sum, h) => sum + (typeof h.bonus_price === "number" ? h.bonus_price : 0),
		0,
	);
	const totalParticipants = hackathons.reduce(
		(sum, h) =>
			sum + (typeof h.hackers_count === "number" ? h.hackers_count : 0),
		0,
	);
	const trackedStatusTotal =
		curatedData.builtCount +
		curatedData.inProgressCount +
		curatedData.abandonedCount;
	const shippedPct =
		trackedStatusTotal > 0
			? Math.round(
					((curatedData.builtCount + curatedData.inProgressCount) /
						trackedStatusTotal) *
						100,
				)
			: null;
	// Show the post-hackathon tracking stat only when we actually have data.
	// Otherwise fall back to "Winners announced" which has real numbers today.
	const showTrackedStat = trackedStatusTotal > 0;

	return (
		<div className="min-h-screen relative">
			<main className="max-w-6xl mx-auto px-4 sm:px-6 py-16 pt-28">
				<Link
					href="/"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">Back to Home</span>
				</Link>

				{/* An empty list because we timed out reads as "no hackathons exist",
				    which is a different and false claim. Say which one it is. */}
				{dora.degraded && (
					<p className="mb-8 inline-flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
						<Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
						The live feed is still loading: this list is incomplete, not empty.{" "}
						<strong className="text-foreground">Refresh in a moment.</strong>
					</p>
				)}

				<div className="mb-10">
					<h1
						className="font-[family-name:var(--font-pixel)] text-6xl sm:text-7xl md:text-8xl lg:text-9xl tracking-tight text-foreground leading-[0.95] mb-4"
						style={{ imageRendering: "pixelated" }}
					>
						stellar hackathons
					</h1>
					<p className="text-muted-foreground">
						Build the future of finance on Stellar: every hackathon tracked
						through to whether the projects actually shipped.
					</p>
				</div>

				{/* Recent winners highlight */}
				<RecentWinnersCarousel data={recentWinners} />

				{/* Cross-hackathon stats banner */}
				<div
					className={`grid grid-cols-2 ${showTrackedStat ? "md:grid-cols-4" : "md:grid-cols-3"} gap-4 mb-12`}
				>
					<StatBlock
						label="Hackathons tracked"
						value={totalHackathons.toString()}
					/>
					<StatBlock
						label="Total prize pool"
						value={
							totalPrizePool >= 1_000_000
								? `$${(totalPrizePool / 1_000_000).toFixed(1)}M`
								: `$${Math.round(totalPrizePool / 1000)}K`
						}
					/>
					<StatBlock
						label="Hackers participated"
						className={showTrackedStat ? "" : "col-span-2 md:col-span-1"}
						value={
							totalParticipants >= 1000
								? `${(totalParticipants / 1000).toFixed(1)}K`
								: totalParticipants.toString()
						}
					/>
					{showTrackedStat && (
						<StatBlock
							label="Projects tracked"
							value={curatedData.trackedProjectsTotal.toString()}
							sub={
								shippedPct !== null
									? `${shippedPct}% still building`
									: undefined
							}
						/>
					)}
				</div>

				{/* Active Hackathons */}
				{activeHackathons.length > 0 && (
					<section className="mb-16">
						<div className="flex items-center gap-3 mb-6">
							<h2 className="text-2xl font-semibold">
								{liveCount > 0 ? "Open now and upcoming" : "Upcoming"}
							</h2>
							<Badge
								variant="outline"
								className="tabular-nums text-neutral-300"
							>
								{liveCount > 0
									? `${liveCount} live`
									: `${activeHackathons.length} announced`}
							</Badge>
						</div>

						<div className="space-y-6">
							{activeHackathons.map((hackathon) => {
								const daysRemaining = getDaysRemaining(hackathon.end_time);
								const tags = parseThemes(hackathon.field);
								const upcoming = hackathon.start_time > nowSec;

								const page = eventPage(hackathon);
								const body = (
									<div
										key={hackathon.id}
										className="rounded-xl border border-white/15 bg-card overflow-hidden hover:border-white/30 transition-colors duration-200"
									>
										{/* Banner: full width, aspect ratio for consistency */}
										<HackathonCover
											src={hackathon.image_url}
											title={hackathon.title}
											organization={hackathon.organization?.name}
											aspect="aspect-[3/1] sm:aspect-[4/1]"
											sizes="100vw"
										>
											<Badge className="absolute top-3 right-3 bg-neutral-100 text-black border-0 shadow-md">
												{upcoming ? "Upcoming" : "Open"}
											</Badge>
										</HackathonCover>

										<div className="p-5 sm:p-6">
											{/* Title + Org */}
											<div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-4">
												<h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
													{hackathon.title}
												</h3>
												{hackathon.kind && hackathon.kind !== "hackathon" && (
													<span className="inline-flex flex-shrink-0 self-start rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
														{EVENT_KIND_LABEL[hackathon.kind]}
													</span>
												)}
												{hackathon.organization && (
													<div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-shrink-0">
														{hackathon.organization.logo && (
															<Image
																src={hackathon.organization.logo}
																alt={hackathon.organization.name}
																width={16}
																height={16}
																className="rounded-full"
															/>
														)}
														<span>{hackathon.organization.name}</span>
													</div>
												)}
											</div>

											{/* Stats row: wraps naturally on mobile */}
											<div className="flex flex-wrap gap-x-6 gap-y-2 text-sm mb-4">
												<span className="flex items-center gap-1.5">
													<DollarSign className="w-4 h-4 text-neutral-400" />
													<span className="font-semibold text-foreground">
														{hackathon.bonus_price > 0
															? formatPrize(hackathon.bonus_price)
															: "Prizes TBA"}
													</span>
												</span>
												<span className="flex items-center gap-1.5 text-muted-foreground">
													<Clock className="w-4 h-4" />
													{upcoming
														? `Starts ${formatShortDate(hackathon.start_time)}`
														: daysRemaining > 0
															? `${daysRemaining} days left`
															: "Ending soon"}
												</span>
												{hackathon.hackers_count > 0 && (
													<span className="flex items-center gap-1.5 text-muted-foreground">
														<Users className="w-4 h-4" />
														{hackathon.hackers_count} participants
													</span>
												)}
												<span className="flex items-center gap-1.5 text-muted-foreground">
													<Calendar className="w-4 h-4" />
													{upcoming
														? `${formatShortDate(hackathon.start_time)} to ${formatShortDate(hackathon.end_time)}`
														: `Ends ${formatShortDate(hackathon.end_time)}`}
												</span>
												{hackathon.source === "curated" && (
													<span
														className="flex items-center gap-1.5 text-muted-foreground"
														title="Not on DoraHacks; hand-tracked from the organizer's page"
													>
														{hackathon.external_url
															? new URL(hackathon.external_url).host.replace(
																	/^www\./,
																	"",
																)
															: "organizer page"}
													</span>
												)}
											</div>

											{/* Tags */}
											{tags.length > 0 && (
												<div className="flex flex-wrap gap-2">
													{tags.slice(0, 6).map((tag, i) => (
														<span
															// biome-ignore lint/suspicious/noArrayIndexKey: themes can repeat
															key={i}
															className="inline-block px-2.5 py-1 text-xs font-medium rounded-full bg-white/10 text-foreground border border-border"
														>
															{tag}
														</span>
													))}
												</div>
											)}
										</div>
									</div>
								);
								return page ? (
									<Link key={hackathon.id} href={page} className="block group">
										{body}
									</Link>
								) : (
									<a
										key={hackathon.id}
										href={getHackathonUrl(hackathon)}
										target="_blank"
										rel="noopener noreferrer"
										className="block group"
									>
										{body}
									</a>
								);
							})}
						</div>
					</section>
				)}

				{/* Empty active state */}
				{activeHackathons.length === 0 && (
					<div className="mb-12 flex flex-wrap items-center gap-x-3 gap-y-2">
						<span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1 text-sm text-foreground/90">
							<span
								className="h-1.5 w-1.5 rounded-full bg-neutral-500"
								aria-hidden
							/>
							Nothing open or announced right now
						</span>
						<span className="text-xs text-muted-foreground">
							Watching DoraHacks, Rise In, HackMeridian and Luma residencies
						</span>
					</div>
				)}

				{/* Past Hackathons */}
				<section>
					<div className="flex items-baseline gap-3 mb-4">
						<h2 className="text-2xl font-bold text-foreground">Past events</h2>
						<span className="text-sm text-muted-foreground">
							{pastHackathons.length}{" "}
							{pastHackathons.length === 1 ? "result" : "results"}
						</span>
					</div>

					{/* Search + Filters + Sort */}
					<div className="mb-6 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
						<HackathonsSearchInput initial={searchQuery} />
						<div className="flex flex-wrap items-center gap-3">
							{years.length > 1 && (
								<HackathonsFilterDropdown
									paramKey="year"
									current={filterYear}
									options={[
										{ value: "all", label: "All years" },
										...years.map((y) => ({
											value: String(y),
											label: String(y),
										})),
									]}
									buttonLabel={filterYear ?? "All years"}
									preserve={{
										org: filterOrg ?? undefined,
										tag: filterTag ?? undefined,
										sort: sortKey !== "recent" ? sortKey : undefined,
										q: searchQuery || undefined,
									}}
								/>
							)}
							{organizers.length > 1 && (
								<HackathonsFilterDropdown
									paramKey="org"
									current={filterOrg}
									options={[
										{ value: "all", label: "All organizers" },
										...organizers.map((o) => ({ value: o, label: o })),
									]}
									buttonLabel={filterOrg ?? "All organizers"}
									preserve={{
										year: filterYear ?? undefined,
										tag: filterTag ?? undefined,
										sort: sortKey !== "recent" ? sortKey : undefined,
										q: searchQuery || undefined,
									}}
								/>
							)}
							{tags.length > 1 && (
								<HackathonsFilterDropdown
									paramKey="tag"
									current={filterTag}
									options={[
										{ value: "all", label: "All themes" },
										...tags.slice(0, 20).map((t) => ({
											value: t,
											label: `${t} (${tagCounts[t]})`,
										})),
									]}
									buttonLabel={filterTag ?? "All themes"}
									preserve={{
										year: filterYear ?? undefined,
										org: filterOrg ?? undefined,
										sort: sortKey !== "recent" ? sortKey : undefined,
										q: searchQuery || undefined,
									}}
								/>
							)}
							<HackathonsFilterDropdown
								paramKey="sort"
								current={sortKey === "recent" ? null : sortKey}
								options={[
									{ value: "all", label: "Most recent" },
									{ value: "oldest", label: "Oldest first" },
									{ value: "prize-desc", label: "Largest prize" },
									{ value: "participants-desc", label: "Most participants" },
								]}
								buttonLabel={
									sortKey === "recent"
										? "Most recent"
										: sortKey === "oldest"
											? "Oldest first"
											: sortKey === "prize-desc"
												? "Largest prize"
												: "Most participants"
								}
								preserve={{
									year: filterYear ?? undefined,
									org: filterOrg ?? undefined,
									tag: filterTag ?? undefined,
									q: searchQuery || undefined,
								}}
							/>
							{(filterYear ||
								filterOrg ||
								filterTag ||
								searchQuery ||
								sortKey !== "recent") && (
								<Link
									href="/hackathons"
									className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
								>
									Clear all
								</Link>
							)}
						</div>
					</div>

					{pastHackathons.length === 0 ? (
						<div className="rounded-xl border border-border/50 bg-card p-8 text-center text-muted-foreground">
							No past events match these filters.
						</div>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
							{pastHackathons.map((hackathon) => {
								const curated = findCurated(hackathon.title);
								const page = eventPage(hackathon);
								const themes = parseThemes(hackathon.field).slice(0, 2);
								// Its stored rows, as its page counts them; nothing when
								// the index was not read or holds none (not stored, never
								// 0). An event whose winners live in code (the roster its
								// page serves) has winners and no stored field.
								const roster = index
									? rosterSummary(rowsBySlug.get(hackathon.uname) ?? [])
									: null;
								const winners =
									roster?.winners ||
									(hackathon.uname === LATEST_WINNERS.hackathonUname
										? LATEST_WINNERS.winners.length
										: 0);
								const dates = formatDateRange(
									isoDay(hackathon.start_time),
									isoDay(hackathon.end_time),
								);
								const cardInner = (
									<>
										<HackathonCover
											src={hackathon.image_url}
											title={hackathon.title}
											organization={hackathon.organization?.name}
											aspect="aspect-[16/9]"
											sizes="(max-width: 768px) 100vw, 33vw"
										>
											{!page && (
												<ExternalLink className="absolute top-2.5 right-2.5 w-3.5 h-3.5 text-white/70" />
											)}
										</HackathonCover>
										<div className="p-4 sm:p-5 flex flex-col flex-1">
											<h3 className="text-base sm:text-lg font-semibold text-foreground group-hover:text-primary transition-colors leading-tight mb-2 line-clamp-2">
												{hackathon.title}
											</h3>
											<div className="text-xs text-muted-foreground flex items-center gap-1.5">
												<Building2 className="w-3 h-3 flex-shrink-0" />
												<span className="truncate">
													{hackathon.organization?.name ??
														"Organizer not stated"}
												</span>
												{hackathon.kind && hackathon.kind !== "hackathon" && (
													<span className="flex-shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium">
														{EVENT_KIND_LABEL[hackathon.kind]}
													</span>
												)}
											</div>
											<div className="mt-1.5 text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
												<span className="inline-flex items-center gap-1.5">
													<Calendar className="w-3 h-3" />
													{dates}
												</span>
												{hackathon.hackers_count > 0 && (
													<span className="inline-flex items-center gap-1">
														<Users className="w-3 h-3" />
														{hackathon.hackers_count.toLocaleString()} hackers
													</span>
												)}
											</div>
											<div className="mt-3 mb-4 flex flex-wrap items-center gap-1.5">
												{roster?.coverage === "full" && (
													<span
														className={`${CHIP} border-border/60 text-foreground/90`}
													>
														{roster.rows.toLocaleString()}{" "}
														{roster.rows === 1 ? "submission" : "submissions"}
													</span>
												)}
												{roster?.coverage === "partial" && (
													<span
														className={`${CHIP} border-border/60 text-foreground/90`}
														title="Builds found from on-chain testnet activity and repos; not the full field"
													>
														{roster.rows.toLocaleString()} builds found
													</span>
												)}
												{winners > 0 ? (
													<span
														className={`${CHIP} border-[#FDDA24]/40 bg-[#FDDA24]/10 text-[#FDDA24]`}
													>
														<Trophy className="w-3 h-3" />
														{winners} {winners === 1 ? "winner" : "winners"}
													</span>
												) : (
													hackathon.winner_announced && (
														<span
															className={`${CHIP} border-[#FDDA24]/40 text-[#FDDA24]/90`}
															title="DoraHacks marks this event's winners as announced; none is stored here"
														>
															<Trophy className="w-3 h-3" />
															Winners announced
														</span>
													)
												)}
												{curated && curated.trackedProjectCount > 0 && (
													<span
														className={`${CHIP} border-emerald-500/30 bg-emerald-500/10 text-emerald-400`}
													>
														{curated.trackedProjectCount} tracked
													</span>
												)}
												<span
													className={`${CHIP} border-border/50 text-muted-foreground`}
													title={
														hackathon.source === "curated"
															? "The organizer's own page; not on DoraHacks"
															: "Listed on DoraHacks"
													}
												>
													{hackathon.source === "curated"
														? (hostOf(hackathon.external_url) ??
															"Organizer page")
														: "DoraHacks"}
												</span>
											</div>
											<div className="mt-auto flex items-center justify-between gap-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
												{hackathon.bonus_price > 0 ? (
													<span className="inline-flex items-center gap-1 text-foreground/90 font-semibold">
														<DollarSign className="w-3.5 h-3.5 text-neutral-400" />
														{formatPrize(hackathon.bonus_price)}
													</span>
												) : (
													<span>Prize not stated</span>
												)}
												{themes.length > 0 && (
													<span className="truncate">{themes.join(" · ")}</span>
												)}
											</div>
										</div>
									</>
								);

								const cardClass =
									"group flex flex-col rounded-2xl border border-border/50 hover:border-border bg-card overflow-hidden transition-colors";

								return page ? (
									<Link key={hackathon.id} href={page} className={cardClass}>
										{cardInner}
									</Link>
								) : (
									<a
										key={hackathon.id}
										href={getHackathonUrl(hackathon)}
										target="_blank"
										rel="noopener noreferrer"
										className={cardClass}
									>
										{cardInner}
									</a>
								);
							})}
						</div>
					)}
				</section>
			</main>
		</div>
	);
}

// ─── tiny inline components ──────────────────────────────────────────────────

function StatBlock({
	label,
	value,
	sub,
	className = "",
}: {
	label: string;
	value: string;
	sub?: string;
	className?: string;
}) {
	return (
		<div
			className={`rounded-2xl border border-border/50 bg-card p-5 ${className}`}
		>
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
