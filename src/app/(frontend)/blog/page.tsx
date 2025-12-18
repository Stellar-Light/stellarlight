import { Suspense } from "react";
import { getPayloadSafe } from "@/lib/payload-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import BlogPostsGrid, { BlogPostsGridSkeleton } from "@/components/blog-posts-grid";

type SearchParams = Promise<{
	page?: string;
	category?: string;
	tag?: string;
}>;

// Force dynamic rendering to prevent build-time MongoDB connection errors
export const dynamic = "force-dynamic";

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

	const categories = [
		"Announcement",
		"Tutorial",
		"News",
		"Technical",
		"Community",
		"Partnership",
		"Update",
	];

	// Fetch all tags from all published posts (not filtered)
	let allTags: string[] = [];
	if (payload) {
		try {
			const allPostsResult = await payload.find({
				collection: "blog",
				where: {
					status: {
						equals: "published",
					},
				},
				limit: 1000, // Get enough to collect all tags
				depth: 0,
			});
			allTags = Array.from(
				new Set(allPostsResult.docs.flatMap((post: any) => post.tags || [])),
			) as string[];
		} catch (error) {
			// Silently handle fetch errors
		}
	}

	return (
		<div className="min-h-screen relative">
			<main className="max-w-7xl mx-auto px-6 py-16 pt-28">
				{/* Header */}
				<div className="mb-12">
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
							Stay updated with the latest news, tutorials, and insights from the
							Stellar ecosystem.
						</p>
					</div>
				</div>

				{/* Filters */}
				<div className="mb-12 flex flex-wrap gap-4">
					{(category || tag) && (
						<Button
							asChild
							variant="outline"
							className="rounded-xl border-border hover:border-white/20"
						>
							<Link href="/blog">Clear Filters</Link>
						</Button>
					)}
					{categories.map((cat) => (
						<Button
							key={cat}
							asChild
							variant={category === cat ? "default" : "outline"}
							className="rounded-xl"
						>
							<Link href={`/blog?category=${cat}${tag ? `&tag=${tag}` : ""}`}>{cat}</Link>
						</Button>
					))}
					{allTags.length > 0 && (
						<>
							{allTags.map((t) => (
								<Button
									key={t}
									asChild
									variant={tag === t ? "default" : "outline"}
									className="rounded-xl"
								>
									<Link href={`/blog?tag=${t}${category ? `&category=${category}` : ""}`}>
										{t}
									</Link>
								</Button>
							))}
						</>
					)}
				</div>

				{/* Posts Grid */}
				<Suspense fallback={<BlogPostsGridSkeleton />}>
					<BlogPostsGrid page={page} category={category} tag={tag} />
				</Suspense>
			</main>
		</div>
	);
}

