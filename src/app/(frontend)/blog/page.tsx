import { getPayload } from "payload";
import configPromise from "@/payload.config";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import BlogHighlightCard from "@/components/blog-highlight-card";
import BaseFeeDisplay from "@/components/base-fee-display";
import { ArrowLeft } from "lucide-react";

type SearchParams = Promise<{
	page?: string;
	category?: string;
	tag?: string;
}>;

export default async function BlogPage({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	const payload = await getPayload({ config: configPromise });
	const resolvedSearchParams = await searchParams;

	const page = Number(resolvedSearchParams.page) || 1;
	const limit = 12;

	const where: any = {
		status: {
			equals: "published",
		},
	};

	if (resolvedSearchParams.category) {
		where.category = {
			equals: resolvedSearchParams.category,
		};
	}

	if (resolvedSearchParams.tag) {
		where.tags = {
			contains: resolvedSearchParams.tag,
		};
	}

	const result = await payload.find({
		collection: "blog",
		where,
		limit,
		page,
		sort: "-publishedAt",
		depth: 2, // Populate featuredImage relationship
	});

	const posts = result.docs;
	const categories = [
		"Announcement",
		"Tutorial",
		"News",
		"Technical",
		"Community",
		"Partnership",
		"Update",
	];

	// Get all unique tags from posts
	const allTags = Array.from(
		new Set(posts.flatMap((post) => post.tags || [])),
	) as string[];

	return (
		<div className="min-h-screen relative">
			<BaseFeeDisplay />

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
					{(resolvedSearchParams.category || resolvedSearchParams.tag) && (
						<Button
							asChild
							variant="outline"
							className="rounded-xl border-border hover:border-white/20"
						>
							<Link href="/blog">Clear Filters</Link>
						</Button>
					)}
					{categories.map((category) => (
						<Button
							key={category}
							asChild
							variant={
								resolvedSearchParams.category === category ? "default" : "outline"
							}
							className="rounded-xl"
						>
							<Link href={`/blog?category=${category}`}>{category}</Link>
						</Button>
					))}
				</div>

				{/* Posts Grid */}
				{posts.length === 0 ? (
					<div className="text-center py-20">
						<p className="text-lg text-muted-foreground">
							No posts found.
							{resolvedSearchParams.category || resolvedSearchParams.tag
								? " Try adjusting your filters."
								: " Check back soon for updates!"}
						</p>
					</div>
				) : (
					<>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
							{posts.map((post, index) => (
								<BlogHighlightCard
									key={post.id}
									post={post}
									isLarge={index === 0 && !resolvedSearchParams.category && !resolvedSearchParams.tag}
								/>
							))}
						</div>

						{/* Pagination */}
						{result.totalPages > 1 && (
							<div className="flex items-center justify-center gap-4">
								{page > 1 && (
									<Button
										asChild
										variant="outline"
										className="rounded-xl"
									>
										<Link href={`/blog?page=${page - 1}`}>Previous</Link>
									</Button>
								)}
								<span className="text-sm text-muted-foreground">
									Page {page} of {result.totalPages}
								</span>
								{page < result.totalPages && (
									<Button
										asChild
										variant="outline"
										className="rounded-xl"
									>
										<Link href={`/blog?page=${page + 1}`}>Next</Link>
									</Button>
								)}
							</div>
						)}
					</>
				)}
			</main>
		</div>
	);
}

