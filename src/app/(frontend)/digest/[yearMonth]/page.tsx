import { getPayloadSafe } from "@/lib/payload-client";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
	ArrowLeft,
	Star,
	Activity,
	Newspaper,
	Plus,
	TrendingUp,
} from "lucide-react";

export const dynamic = "force-dynamic";

type Params = Promise<{
	yearMonth: string;
}>;

export async function generateMetadata({
	params,
}: {
	params: Params;
}): Promise<Metadata> {
	const { yearMonth } = await params;
	const [year, month] = yearMonth.split("-");
	const monthName = new Date(Number(year), Number(month) - 1).toLocaleString(
		"en-US",
		{ month: "long" },
	);

	return {
		title: `${monthName} ${year} Ecosystem Digest | Stellar Light`,
		description: `Monthly digest of Stellar ecosystem activity for ${monthName} ${year}`,
	};
}

export default async function DigestPage({
	params,
}: {
	params: Params;
}) {
	const { yearMonth } = await params;

	// Validate format: YYYY-MM
	const match = yearMonth.match(/^(\d{4})-(\d{2})$/);
	if (!match) notFound();

	const year = Number(match[1]);
	const month = Number(match[2]);
	if (month < 1 || month > 12) notFound();

	const monthStart = new Date(year, month - 1, 1);
	const monthEnd = new Date(year, month, 0, 23, 59, 59);
	const monthName = monthStart.toLocaleString("en-US", { month: "long" });

	const payload = await getPayloadSafe();
	if (!payload) notFound();

	// Fetch all data for the month in parallel
	let newProjects: any[] = [];
	let topByStars: Array<{
		name: string;
		slug: string;
		totalStars: number;
	}> = [];
	let recentBlogPosts: any[] = [];
	let totalProjects = 0;

	try {
		const [projectsResult, signalsResult, blogResult, countResult] =
			await Promise.all([
				// New projects added this month
				payload.find({
					collection: "projects",
					where: {
						and: [
							{
								createdAt: {
									greater_than: monthStart.toISOString(),
								},
							},
							{
								createdAt: {
									less_than: monthEnd.toISOString(),
								},
							},
							{
								status: {
									in: ["Development", "Pre-Release", "Live"],
								},
							},
						],
					},
					sort: "-createdAt",
					limit: 20,
					depth: 1,
				}),
				// Top projects by stars
				payload.find({
					collection: "signals",
					where: {
						"github.totalStars": { greater_than: 0 },
					},
					sort: "-github.totalStars",
					limit: 10,
					depth: 1,
				}),
				// Blog posts published this month
				payload.find({
					collection: "blog",
					where: {
						and: [
							{
								publishedAt: {
									greater_than: monthStart.toISOString(),
								},
							},
							{
								publishedAt: {
									less_than: monthEnd.toISOString(),
								},
							},
							{
								status: {
									equals: "published",
								},
							},
						],
					},
					sort: "-publishedAt",
					limit: 10,
					depth: 1,
				}),
				// Total project count
				payload.find({
					collection: "projects",
					where: {
						status: {
							in: ["Development", "Pre-Release", "Live"],
						},
					},
					limit: 1,
				}),
			]);

		newProjects = projectsResult.docs;
		totalProjects = countResult.totalDocs;

		topByStars = signalsResult.docs
			.map((signal: any) => {
				const project = signal.project;
				if (!project || typeof project === "string") return null;
				if (!["Development", "Pre-Release", "Live"].includes(project.status))
					return null;
				const repoStars = (signal.github?.repos || []).reduce(
					(sum: number, r: any) => sum + (r.stargazerCount || 0),
					0,
				);
				const stars = signal.github?.totalStars || repoStars;
				if (stars === 0) return null;
				return {
					name: project.name,
					slug: project.slug,
					totalStars: stars,
				};
			})
			.filter(Boolean) as typeof topByStars;

		topByStars.sort((a, b) => b.totalStars - a.totalStars);

		recentBlogPosts = blogResult.docs;
	} catch {
		notFound();
	}

	// Navigation: prev/next month
	const prevMonth = new Date(year, month - 2, 1);
	const nextMonth = new Date(year, month, 1);
	const now = new Date();
	const hasNextMonth = nextMonth <= now;
	const prevSlug = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
	const nextSlug = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;

	return (
		<div className="min-h-screen relative">
			<main className="max-w-4xl mx-auto px-4 sm:px-6 py-16 pt-28">
				<Link
					href="/"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">Back to Home</span>
				</Link>

				<div className="mb-10">
					<div className="flex items-center gap-3 mb-2">
						<Newspaper className="w-8 h-8 text-[#FDDA24]" />
						<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
							{monthName} {year} Digest
						</h1>
					</div>
					<p className="text-muted-foreground">
						Monthly ecosystem summary — {totalProjects} total projects in the directory
					</p>
				</div>

				{/* Month Navigation */}
				<div className="flex items-center justify-between mb-8">
					<Link
						href={`/digest/${prevSlug}`}
						className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
					>
						&larr; {prevMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}
					</Link>
					{hasNextMonth && (
						<Link
							href={`/digest/${nextSlug}`}
							className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
						>
							{nextMonth.toLocaleString("en-US", { month: "long", year: "numeric" })} &rarr;
						</Link>
					)}
				</div>

				{/* New Projects */}
				<Card className="mb-8 border border-border/50 bg-card shadow-sm">
					<CardHeader className="pb-4">
						<div className="flex items-center gap-2">
							<Plus className="w-5 h-5 text-green-400" />
							<CardTitle className="text-xl font-bold">
								New Projects ({newProjects.length})
							</CardTitle>
						</div>
						<CardDescription>
							Projects added to the directory in {monthName}
						</CardDescription>
					</CardHeader>
					<CardContent>
						{newProjects.length === 0 ? (
							<p className="text-sm text-muted-foreground py-4 text-center">
								No new projects were added this month.
							</p>
						) : (
							<div className="space-y-2">
								{newProjects.map((project: any) => (
									<Link
										key={project.id}
										href={`/project/${project.slug}`}
										className="group flex items-center justify-between p-3 rounded-lg hover:bg-white/[0.03] transition-colors"
									>
										<div className="flex items-center gap-3 min-w-0">
											<span className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
												{project.name}
											</span>
											<Badge variant="outline" className="text-xs flex-shrink-0">
												{project.status}
											</Badge>
										</div>
										<Badge variant="secondary" className="text-xs flex-shrink-0">
											{project.category}
										</Badge>
									</Link>
								))}
							</div>
						)}
					</CardContent>
				</Card>

				{/* Top Projects by Stars */}
				{topByStars.length > 0 && (
					<Card className="mb-8 border border-border/50 bg-card shadow-sm">
						<CardHeader className="pb-4">
							<div className="flex items-center gap-2">
								<TrendingUp className="w-5 h-5 text-[#FDDA24]" />
								<CardTitle className="text-xl font-bold">
									Top Projects by Stars
								</CardTitle>
							</div>
							<CardDescription>
								Most starred projects in the ecosystem
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								{topByStars.map((project, idx) => (
									<Link
										key={project.slug}
										href={`/project/${project.slug}`}
										className="group flex items-center justify-between p-3 rounded-lg hover:bg-white/[0.03] transition-colors"
									>
										<div className="flex items-center gap-3">
											<span className={`text-sm font-bold w-6 text-center ${idx < 3 ? "text-[#FDDA24]" : "text-muted-foreground"}`}>
												{idx + 1}
											</span>
											<span className="font-semibold text-foreground group-hover:text-primary transition-colors">
												{project.name}
											</span>
										</div>
										<span className="flex items-center gap-1 text-sm text-muted-foreground">
											<Star className="w-3.5 h-3.5 text-[#FDDA24]" />
											{project.totalStars.toLocaleString()}
										</span>
									</Link>
								))}
							</div>
						</CardContent>
					</Card>
				)}

				{/* Blog Highlights */}
				{recentBlogPosts.length > 0 && (
					<Card className="mb-8 border border-border/50 bg-card shadow-sm">
						<CardHeader className="pb-4">
							<div className="flex items-center gap-2">
								<Newspaper className="w-5 h-5 text-blue-400" />
								<CardTitle className="text-xl font-bold">
									Blog Highlights ({recentBlogPosts.length})
								</CardTitle>
							</div>
							<CardDescription>
								Posts published in {monthName}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								{recentBlogPosts.map((post: any) => (
									<Link
										key={post.id}
										href={post.isRSSExternal && post.externalUrl ? post.externalUrl : `/blog/${post.slug}`}
										target={post.isRSSExternal ? "_blank" : undefined}
										rel={post.isRSSExternal ? "noopener noreferrer" : undefined}
										className="group flex items-center justify-between p-3 rounded-lg hover:bg-white/[0.03] transition-colors"
									>
										<div className="min-w-0 flex-1">
											<span className="font-semibold text-foreground group-hover:text-primary transition-colors block truncate">
												{post.title}
											</span>
											<span className="text-xs text-muted-foreground">
												{post.author} — {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
											</span>
										</div>
										{post.category && (
											<Badge variant="outline" className="text-xs flex-shrink-0 ml-3">
												{post.category}
											</Badge>
										)}
									</Link>
								))}
							</div>
						</CardContent>
					</Card>
				)}
			</main>
		</div>
	);
}
