import { getPayloadSafe } from "@/lib/payload-client";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
	Card,
	CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
	ArrowLeft,
	Star,
	AlertCircle,
	Activity,
	Trophy,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Leaderboard | Stellar Light",
	description: "GitHub activity leaderboard for Stellar ecosystem projects",
};

type SearchParams = Promise<{
	sort?: string;
	range?: string;
}>;

export default async function LeaderboardPage({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	const params = await searchParams;
	const sortBy = params.sort || "stars";
	const range = params.range || "all";

	const payload = await getPayloadSafe();

	let leaderboard: Array<{
		id: string;
		name: string;
		slug: string;
		category: string;
		totalStars: number;
		openIssuesTotal: number;
		lastActivityAt: string | null;
		repoCount: number;
		logoUrl: string | null;
	}> = [];

	if (payload) {
		try {
			const where: any = {};

			if (range === "7d") {
				const sevenDaysAgo = new Date();
				sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
				where["github.lastActivityAt"] = {
					greater_than: sevenDaysAgo.toISOString(),
				};
			} else if (range === "30d") {
				const thirtyDaysAgo = new Date();
				thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
				where["github.lastActivityAt"] = {
					greater_than: thirtyDaysAgo.toISOString(),
				};
			}

			let sortField = "-github.totalStars";
			if (sortBy === "issues") sortField = "-github.openIssuesTotal";
			if (sortBy === "activity") sortField = "-github.lastActivityAt";

			const signalsResult = await payload.find({
				collection: "signals",
				where,
				sort: sortField,
				limit: 50,
				depth: 1,
			});

			leaderboard = signalsResult.docs
				.map((signal: any) => {
					const project = signal.project;
					if (!project || typeof project === "string") return null;
					if (!["Development", "Pre-Release", "Live"].includes(project.status))
						return null;
					const repoStars = (signal.github?.repos || []).reduce(
						(sum: number, r: any) => sum + (r.stargazerCount || 0),
						0,
					);

					let logoUrl: string | null = null;
					if (project.logo && typeof project.logo === "object" && project.logo.url) {
						logoUrl = project.logo.url;
					}

					return {
						id: project.id,
						name: project.name,
						slug: project.slug,
						category: project.category,
						totalStars: signal.github?.totalStars || repoStars,
						openIssuesTotal: signal.github?.openIssuesTotal ?? 0,
						lastActivityAt: signal.github?.lastActivityAt ?? null,
						repoCount: signal.github?.repos?.length ?? 0,
						logoUrl,
					};
				})
				.filter(Boolean) as typeof leaderboard;

			if (sortBy === "stars") {
				leaderboard.sort((a, b) => b.totalStars - a.totalStars);
			}
		} catch {
			// Handle silently
		}
	}

	const formatDate = (dateString: string | null): string => {
		if (!dateString) return "—";
		const diffMs = Date.now() - new Date(dateString).getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
		if (diffDays === 0) return "Today";
		if (diffDays === 1) return "Yesterday";
		if (diffDays < 7) return `${diffDays}d ago`;
		if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
		return `${Math.floor(diffDays / 30)}mo ago`;
	};

	const sortOptions = [
		{ value: "stars", label: "Stars", icon: Star },
		{ value: "issues", label: "Issues", icon: AlertCircle },
		{ value: "activity", label: "Activity", icon: Activity },
	];

	const rangeOptions = [
		{ value: "7d", label: "7 days" },
		{ value: "30d", label: "30 days" },
		{ value: "all", label: "All time" },
	];

	const top3 = leaderboard.slice(0, 3);
	const rest = leaderboard.slice(3);

	const medalColors = [
		"from-[#FDDA24]/30 to-[#FDDA24]/10 border-[#FDDA24]/40", // Gold
		"from-gray-300/20 to-gray-400/10 border-gray-400/30",     // Silver
		"from-amber-700/20 to-amber-800/10 border-amber-700/30",  // Bronze
	];

	const medalLabels = ["1st", "2nd", "3rd"];

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
					<div className="flex items-center gap-3 mb-2">
						<Trophy className="w-8 h-8 text-[#FDDA24]" />
						<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
							Leaderboard
						</h1>
					</div>
					<p className="text-muted-foreground">
						GitHub activity rankings for Stellar ecosystem projects
					</p>
				</div>

				{/* Filters */}
				<div className="flex flex-wrap items-center gap-3 mb-8">
					<div className="flex items-center gap-1 p-1 rounded-lg bg-card border border-border/50">
						{sortOptions.map((option) => {
							const Icon = option.icon;
							return (
								<Link
									key={option.value}
									href={`/leaderboard?sort=${option.value}&range=${range}`}
									className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
										sortBy === option.value
											? "bg-white/10 text-foreground"
											: "text-muted-foreground hover:text-foreground hover:bg-white/5"
									}`}
								>
									<Icon className="w-3.5 h-3.5" />
									{option.label}
								</Link>
							);
						})}
					</div>

					<div className="flex items-center gap-1 p-1 rounded-lg bg-card border border-border/50">
						{rangeOptions.map((option) => (
							<Link
								key={option.value}
								href={`/leaderboard?sort=${sortBy}&range=${option.value}`}
								className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
									range === option.value
										? "bg-white/10 text-foreground"
										: "text-muted-foreground hover:text-foreground hover:bg-white/5"
								}`}
							>
								{option.label}
							</Link>
						))}
					</div>
				</div>

				{leaderboard.length === 0 ? (
					<Card className="border border-border/50 bg-card">
						<CardContent className="py-16 text-center">
							<Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
							<p className="text-muted-foreground">
								No projects with GitHub data found for this time range.
							</p>
						</CardContent>
					</Card>
				) : (
					<>
						{/* Top 3 Podium */}
						{top3.length > 0 && (
							<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
								{top3.map((entry, idx) => (
									<Link
										key={entry.id}
										href={`/project/${entry.slug}`}
										className={`group relative rounded-xl border bg-gradient-to-b ${medalColors[idx]} p-5 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ${idx === 0 ? "sm:order-2" : idx === 1 ? "sm:order-1" : "sm:order-3"}`}
									>
										{/* Rank badge */}
										<div className={`absolute -top-3 left-1/2 -translate-x-1/2 flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${idx === 0 ? "bg-[#FDDA24] text-black" : idx === 1 ? "bg-gray-300 text-black" : "bg-amber-700 text-white"}`}>
											{medalLabels[idx]}
										</div>

										<div className="flex flex-col items-center text-center pt-4">
											{/* Logo */}
											{entry.logoUrl ? (
												<Image
													src={entry.logoUrl}
													alt={entry.name}
													width={idx === 0 ? 56 : 48}
													height={idx === 0 ? 56 : 48}
													className={`rounded-xl object-cover border border-border/50 mb-3 ${idx === 0 ? "w-14 h-14" : "w-12 h-12"}`}
												/>
											) : (
												<div className={`flex items-center justify-center rounded-xl bg-card border border-border/50 mb-3 text-lg font-bold text-muted-foreground ${idx === 0 ? "w-14 h-14" : "w-12 h-12"}`}>
													{entry.name.charAt(0)}
												</div>
											)}

											<h3 className={`font-bold text-foreground group-hover:text-primary transition-colors truncate w-full ${idx === 0 ? "text-lg" : "text-base"}`}>
												{entry.name}
											</h3>

											<Badge variant="outline" className="text-xs mt-1.5 mb-3">
												{entry.category}
											</Badge>

											{/* Stats */}
											<div className="flex items-center justify-center gap-4 text-sm">
												<span className="flex items-center gap-1 font-semibold text-foreground">
													<Star className="w-4 h-4 text-[#FDDA24]" />
													{entry.totalStars.toLocaleString()}
												</span>
												<span className="text-muted-foreground">
													{entry.repoCount} {entry.repoCount === 1 ? "repo" : "repos"}
												</span>
											</div>
										</div>
									</Link>
								))}
							</div>
						)}

						{/* Rest of the leaderboard — table */}
						{rest.length > 0 && (
							<Card className="border border-border/50 bg-card shadow-sm overflow-hidden">
								<CardContent className="p-0">
									<div className="overflow-x-auto">
										<table className="w-full">
											<thead>
												<tr className="border-b border-border/50 text-left">
													<th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-12">
														#
													</th>
													<th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
														Project
													</th>
													<th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">
														Stars
													</th>
													<th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right hidden md:table-cell">
														Issues
													</th>
													<th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right hidden sm:table-cell">
														Repos
													</th>
													<th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right hidden lg:table-cell">
														Last Active
													</th>
												</tr>
											</thead>
											<tbody>
												{rest.map((entry, idx) => (
													<tr
														key={entry.id}
														className="border-b border-border/30 last:border-0 hover:bg-white/[0.02] transition-colors"
													>
														<td className="px-6 py-4">
															<span className="text-sm font-bold text-muted-foreground">
																{idx + 4}
															</span>
														</td>
														<td className="px-6 py-4">
															<Link
																href={`/project/${entry.slug}`}
																className="group flex items-center gap-3"
															>
																{entry.logoUrl ? (
																	<Image
																		src={entry.logoUrl}
																		alt={entry.name}
																		width={28}
																		height={28}
																		className="rounded-md object-cover w-7 h-7 border border-border/50 flex-shrink-0"
																	/>
																) : (
																	<div className="w-7 h-7 rounded-md bg-card border border-border/50 flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
																		{entry.name.charAt(0)}
																	</div>
																)}
																<span className="font-semibold text-foreground group-hover:text-primary transition-colors">
																	{entry.name}
																</span>
																<Badge
																	variant="outline"
																	className="text-xs px-2 py-0.5 hidden sm:inline-flex"
																>
																	{entry.category}
																</Badge>
															</Link>
														</td>
														<td className="px-6 py-4 text-right">
															<span className="flex items-center justify-end gap-1 text-sm font-medium text-foreground">
																<Star className="w-3.5 h-3.5 text-[#FDDA24]" />
																{entry.totalStars.toLocaleString()}
															</span>
														</td>
														<td className="px-6 py-4 text-right hidden md:table-cell">
															<span className="text-sm text-muted-foreground">
																{entry.openIssuesTotal}
															</span>
														</td>
														<td className="px-6 py-4 text-right hidden sm:table-cell">
															<span className="text-sm text-muted-foreground">
																{entry.repoCount}
															</span>
														</td>
														<td className="px-6 py-4 text-right hidden lg:table-cell">
															<span className="text-sm text-muted-foreground">
																{formatDate(entry.lastActivityAt)}
															</span>
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</CardContent>
							</Card>
						)}
					</>
				)}
			</main>
		</div>
	);
}