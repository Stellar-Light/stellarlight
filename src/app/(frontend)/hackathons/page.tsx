import {
	ArrowLeft,
	Building2,
	Calendar,
	Clock,
	Code2,
	DollarSign,
	ExternalLink,
	Trophy,
	Users,
} from "lucide-react";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { HackathonsFilterDropdown } from "@/components/hackathons-filter-dropdown";
import { HackathonsSearchInput } from "@/components/hackathons-search-input";
import { RecentWinnersCarousel } from "@/components/recent-winners-carousel";
import { Badge } from "@/components/ui/badge";
import {
	LATEST_WINNERS,
	type RecentHackathonWinners,
} from "@/data/recent-hackathon-winners";
import {
	fetchAllDoraHacksHackathons,
	fetchLatestHackathonWinners,
	formatPrize,
	formatShortDate,
	getDaysRemaining,
	getHackathonUrl,
	isHackathonActive,
	parseThemes,
} from "@/lib/integrations/dorahacks";
import { getPayloadSafe } from "@/lib/payload-client";

export const metadata: Metadata = {
	title: "Hackathons | Stellar Light",
	description: "Active and past hackathons in the Stellar ecosystem",
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
		const recentWinners =
			(await fetchLatestHackathonWinners(hackathons)) ?? LATEST_WINNERS;
		return { hackathons, recentWinners };
	},
	["hackathons:dora-merge:v1"],
	{ revalidate: 3600, tags: ["hackathons"] },
);

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
	const [dora, curatedData] = await Promise.all([
		getCachedDoraHackathons(),
		fetchCuratedHackathons(),
	]);
	const hackathons = dora.hackathons;
	const curatedMap = curatedData.byName;
	const activeHackathons = hackathons.filter((h) => isHackathonActive(h));
	let pastHackathons = hackathons.filter((h) => !isHackathonActive(h));

	// "Recent Winners" highlight — LIVE from DoraHacks (most-recent ended event
	// whose winners are announced), derived inside the same hourly cache.
	const recentWinners: RecentHackathonWinners = dora.recentWinners;

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

				<div className="mb-10">
					<h1
						className="font-[family-name:var(--font-pixel)] text-6xl sm:text-7xl md:text-8xl lg:text-9xl tracking-tight text-foreground leading-[0.95] mb-4"
						style={{ imageRendering: "pixelated" }}
					>
						stellar hackathons
					</h1>
					<p className="text-muted-foreground">
						Build the future of finance on Stellar — every hackathon tracked
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
							<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
							<h2 className="text-2xl font-bold">Open for Submissions</h2>
							<Badge className="bg-green-500/20 text-green-400 border-green-500/30">
								{activeHackathons.length} Active
							</Badge>
						</div>

						<div className="space-y-6">
							{activeHackathons.map((hackathon) => {
								const daysRemaining = getDaysRemaining(hackathon.end_time);
								const tags = parseThemes(hackathon.field);

								return (
									<a
										key={hackathon.id}
										href={getHackathonUrl(hackathon.uname)}
										target="_blank"
										rel="noopener noreferrer"
										className="block group"
									>
										<div className="rounded-xl border border-primary/30 bg-card overflow-hidden hover:border-primary/60 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
											{/* Banner — full width, aspect-ratio for consistency */}
											{hackathon.image_url && (
												<div className="relative w-full aspect-[3/1] sm:aspect-[4/1] overflow-hidden">
													<Image
														src={hackathon.image_url}
														alt={hackathon.title}
														fill
														className="object-cover group-hover:scale-[1.02] transition-transform duration-500"
													/>
													<div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
													<Badge className="absolute top-3 right-3 bg-green-500 text-white border-0 shadow-md">
														OPEN
													</Badge>
												</div>
											)}

											<div className="p-5 sm:p-6">
												{/* Title + Org */}
												<div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-4">
													<h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
														{hackathon.title}
													</h3>
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

												{/* Stats row — wraps naturally on mobile */}
												<div className="flex flex-wrap gap-x-6 gap-y-2 text-sm mb-4">
													<span className="flex items-center gap-1.5">
														<DollarSign className="w-4 h-4 text-[#FDDA24]" />
														<span className="font-semibold text-foreground">
															{formatPrize(hackathon.bonus_price)}
														</span>
													</span>
													<span className="flex items-center gap-1.5 text-muted-foreground">
														<Clock className="w-4 h-4" />
														{daysRemaining > 0
															? `${daysRemaining} days left`
															: "Ending soon"}
													</span>
													<span className="flex items-center gap-1.5 text-muted-foreground">
														<Users className="w-4 h-4" />
														{hackathon.hackers_count} participants
													</span>
													<span className="flex items-center gap-1.5 text-muted-foreground">
														<Calendar className="w-4 h-4" />
														Ends {formatShortDate(hackathon.end_time)}
													</span>
												</div>

												{/* Tags */}
												{tags.length > 0 && (
													<div className="flex flex-wrap gap-2">
														{tags.slice(0, 6).map((tag, i) => (
															<span
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
									</a>
								);
							})}
						</div>
					</section>
				)}

				{/* Empty active state */}
				{activeHackathons.length === 0 && (
					<div className="mb-16 py-16 text-center rounded-xl border border-border/50 bg-card">
						<Code2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
						<p className="text-muted-foreground">
							No active hackathons right now — check back soon
						</p>
					</div>
				)}

				{/* Past Hackathons */}
				<section>
					<div className="flex items-baseline gap-3 mb-4">
						<h2 className="text-2xl font-bold text-foreground">
							Past Hackathons
						</h2>
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
							No past hackathons match these filters.
						</div>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
							{pastHackathons.map((hackathon) => {
								const curated = findCurated(hackathon.title);
								const tagsForCard = parseThemes(hackathon.field).slice(0, 3);
								const cardInner = (
									<>
										{hackathon.image_url && (
											<div className="relative w-full aspect-[16/9] overflow-hidden bg-white/[0.02]">
												<Image
													src={hackathon.image_url}
													alt={hackathon.title}
													fill
													sizes="(max-width: 768px) 100vw, 33vw"
													className="object-cover group-hover:scale-[1.03] transition-transform duration-300"
												/>
												<div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
												<div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between gap-2">
													<div className="flex flex-wrap items-center gap-1.5">
														{hackathon.winner_announced && (
															<Badge className="bg-[#FDDA24]/90 text-[#171717] border-0 shadow-sm text-[10px] font-semibold px-2 py-0.5">
																<Trophy className="w-3 h-3 mr-0.5" />
																Winners
															</Badge>
														)}
														{curated && curated.trackedProjectCount > 0 && (
															<Badge className="bg-emerald-500/90 text-white border-0 shadow-sm text-[10px] font-semibold px-2 py-0.5">
																{curated.trackedProjectCount} tracked
															</Badge>
														)}
													</div>
													{!curated && (
														<ExternalLink className="w-3.5 h-3.5 text-white/70 flex-shrink-0" />
													)}
												</div>
											</div>
										)}
										<div className="p-4 sm:p-5 flex flex-col flex-1">
											<h3 className="text-base sm:text-lg font-semibold text-foreground group-hover:text-primary transition-colors leading-tight mb-2 line-clamp-2">
												{hackathon.title}
											</h3>
											<div className="text-xs text-muted-foreground flex items-center gap-1.5 mb-3">
												<Building2 className="w-3 h-3" />
												<span className="truncate">
													{hackathon.organization?.name ?? "—"}
												</span>
											</div>
											{tagsForCard.length > 0 && (
												<div className="flex flex-wrap gap-1.5 mb-4">
													{tagsForCard.map((t) => (
														<span
															key={t}
															className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.05] text-muted-foreground border border-border/50"
														>
															{t}
														</span>
													))}
												</div>
											)}
											<div className="mt-auto flex items-center justify-between gap-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
												<span className="inline-flex items-center gap-1 text-foreground/90 font-semibold">
													<DollarSign className="w-3.5 h-3.5 text-[#FDDA24]" />
													{formatPrize(hackathon.bonus_price)}
												</span>
												<span className="inline-flex items-center gap-1">
													<Users className="w-3 h-3" />
													{hackathon.hackers_count.toLocaleString()}
												</span>
												<span className="inline-flex items-center gap-1">
													<Calendar className="w-3 h-3" />
													{formatShortDate(hackathon.end_time)}
												</span>
											</div>
										</div>
									</>
								);

								const cardClass =
									"group flex flex-col rounded-2xl border border-border/50 hover:border-border bg-card overflow-hidden transition-colors";

								return curated ? (
									<Link
										key={hackathon.id}
										href={`/hackathons/${curated.slug}`}
										className={cardClass}
									>
										{cardInner}
									</Link>
								) : (
									<a
										key={hackathon.id}
										href={getHackathonUrl(hackathon.uname)}
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
