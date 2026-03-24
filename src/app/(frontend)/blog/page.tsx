import { Suspense } from "react";
import { getPayloadSafe } from "@/lib/payload-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import BlogPostsGrid, { BlogPostsGridSkeleton } from "@/components/blog-posts-grid";
import BlogHeroCard from "@/components/blog-hero-card";
import EcosystemReports, { EcosystemReportsSkeleton } from "@/components/ecosystem-reports";
import ChangelogFeed, { ChangelogFeedSkeleton } from "@/components/changelog-feed";

type SearchParams = Promise<{
	page?: string;
	category?: string;
	tag?: string;
	source?: string;
	tab?: string;
}>;

export const dynamic = "force-dynamic";

const categories = [
	"Announcement",
	"Tutorial",
	"News",
	"Technical",
	"Community",
	"Partnership",
	"Update",
];

const sourceFilters = [
	{ id: "sdf-blog", label: "SDF Blog" },
	{ id: "medium", label: "Medium" },
	{ id: "stablecoin-report", label: "Stablecoin" },
	{ id: "rwa-report", label: "RWA" },
];

export default async function BlogPage({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	const payload = await getPayloadSafe();
	const resolvedSearchParams = await searchParams;

	const page = Number(resolvedSearchParams.page) || 1;
	const category = resolvedSearchParams.category;
	const tag = resolvedSearchParams.tag;
	const source = resolvedSearchParams.source;
	const tab = resolvedSearchParams.tab || "posts";

	// Fetch featured hero post
	let heroPost: any = null;
	if (payload && tab === "posts" && page === 1 && !category && !tag && !source) {
		try {
			const heroResult = await payload.find({
				collection: "blog",
				where: {
					status: { equals: "published" },
					featured: { equals: true },
					contentType: { not_equals: "changelog" },
				},
				limit: 1,
				sort: "-publishedAt",
				depth: 1,
			});
			if (heroResult.docs.length > 0) {
				heroPost = heroResult.docs[0];
			}
		} catch {
			// silently handle
		}
	}

	// Fetch all tags from published posts
	let allTags: string[] = [];
	if (payload) {
		try {
			const allPostsResult = await payload.find({
				collection: "blog",
				where: { status: { equals: "published" } },
				limit: 1000,
				depth: 0,
			});
			allTags = Array.from(
				new Set(allPostsResult.docs.flatMap((post: any) => post.tags || [])),
			) as string[];
		} catch {
			// silently handle
		}
	}

	const hasFilters = category || tag || source;

	return (
		<div className="min-h-screen relative">
			<main className="max-w-7xl mx-auto px-4 sm:px-6 py-16 pt-28">
				{/* Header */}
				<div className="mb-8">
					<Link
						href="/"
						className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-200 mb-6"
					>
						<ArrowLeft className="w-4 h-4" />
						<span className="text-sm font-medium">Back to Home</span>
					</Link>
					<div className="space-y-4">
						<h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
							Blog
						</h1>
						<p className="text-lg text-muted-foreground max-w-2xl">
							Ecosystem updates, reports, and project activity from the
							Stellar network.
						</p>
					</div>
				</div>

				{/* Tabs */}
				<div className="flex items-center gap-1 mb-6 border-b border-border">
					<Link
						href="/blog"
						className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
							tab === "posts"
								? "text-foreground border-foreground"
								: "text-muted-foreground border-transparent hover:text-foreground"
						}`}
					>
						Posts
					</Link>
					<Link
						href="/blog?tab=changelog"
						className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
							tab === "changelog"
								? "text-foreground border-foreground"
								: "text-muted-foreground border-transparent hover:text-foreground"
						}`}
					>
						Changelog
					</Link>
				</div>

				{tab === "changelog" ? (
					/* Changelog Tab */
					<Suspense fallback={<ChangelogFeedSkeleton />}>
							<ChangelogFeed page={page} />
					</Suspense>
				) : (
					/* Posts Tab */
					<>
						{/* Hero Post (only on first page, no filters) */}
						{heroPost && !hasFilters && (
							<BlogHeroCard post={heroPost} />
						)}

						{/* Ecosystem Report Sections (only on first page, no filters) */}
						{!hasFilters && page === 1 && (
							<Suspense fallback={<EcosystemReportsSkeleton />}>
								<EcosystemReports />
							</Suspense>
						)}

						{/* Filters */}
						<div className="mb-8 sm:mb-10 space-y-3 sm:space-y-4">
							{hasFilters && (
								<div>
									<Button
										asChild
										variant="outline"
										className="rounded-xl border-border hover:border-white/20 h-9 text-sm sm:h-10"
									>
										<Link href="/blog">Clear Filters</Link>
									</Button>
								</div>
							)}

							{/* Source filters */}
							<div className="flex flex-wrap items-center gap-2 sm:gap-3">
								<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-full sm:w-auto">
									Source
								</span>
								{sourceFilters.map((s) => (
									<Button
										key={s.id}
										asChild
										variant={source === s.id ? "default" : "outline"}
										className="rounded-xl h-8 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm"
									>
										<Link
											href={`/blog?source=${s.id}${category ? `&category=${category}` : ""}${tag ? `&tag=${tag}` : ""}`}
										>
											{s.label}
										</Link>
									</Button>
								))}
							</div>

							{/* Category filters */}
							<div className="flex flex-wrap items-center gap-2 sm:gap-3">
								<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-full sm:w-auto">
									Categories
								</span>
								{categories.map((cat) => (
									<Button
										key={cat}
										asChild
										variant={category === cat ? "default" : "outline"}
										className="rounded-xl h-8 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm"
									>
										<Link
											href={`/blog?category=${cat}${source ? `&source=${source}` : ""}${tag ? `&tag=${tag}` : ""}`}
										>
											{cat}
										</Link>
									</Button>
								))}
							</div>

							{/* Tag filters */}
							{allTags.length > 0 && (
								<div className="flex flex-wrap items-center gap-2 sm:gap-3">
									<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-full sm:w-auto">
										Tags
									</span>
									{allTags.slice(0, 15).map((t) => (
										<Button
											key={t}
											asChild
											variant={tag === t ? "default" : "outline"}
											className="rounded-xl h-8 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm"
										>
											<Link
												href={`/blog?tag=${encodeURIComponent(t)}${source ? `&source=${source}` : ""}${category ? `&category=${category}` : ""}`}
											>
												#{t}
											</Link>
										</Button>
									))}
								</div>
							)}
						</div>

						{/* Posts Grid */}
						<Suspense fallback={<BlogPostsGridSkeleton />}>
							<BlogPostsGrid
								page={page}
								category={category}
								tag={tag}
								source={source}
								excludeSlug={heroPost?.slug}
							/>
						</Suspense>
					</>
				)}
			</main>
		</div>
	);
}
