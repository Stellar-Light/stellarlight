import { getPayloadSafe } from "@/lib/payload-client";
import BlogHighlightCard from "@/components/blog-highlight-card";
import BlogCardSkeleton from "@/components/blog-card-skeleton";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface BlogPostsGridProps {
	page?: number;
	category?: string;
	tag?: string;
}

export default async function BlogPostsGrid({
	page = 1,
	category,
	tag,
}: BlogPostsGridProps) {
	const payload = await getPayloadSafe();
	const limit = 12;

	let posts: any[] = [];
	let result: any = { docs: [], totalDocs: 0, totalPages: 0, page: 1, hasNextPage: false, hasPrevPage: false };

	if (payload) {
		try {
			const where: any = {
				status: {
					equals: "published",
				},
			};

			if (category) {
				where.category = {
					equals: category,
				};
			}

			if (tag) {
				where.tags = {
					in: [tag],
				};
			}

			result = await payload.find({
				collection: "blog",
				where,
				limit,
				page,
				sort: "-publishedAt",
				depth: 2,
			});

			posts = result.docs;
		} catch (error) {
			// Silently handle fetch errors
		}
	}

	if (posts.length === 0) {
		return (
			<div className="text-center py-20">
				<p className="text-lg text-muted-foreground">
					No posts found.
					{category || tag
						? " Try adjusting your filters."
						: " Check back soon for updates!"}
				</p>
			</div>
		);
	}

	return (
		<>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
				{posts.map((post: any, index: number) => (
					<BlogHighlightCard
						key={post.id}
						post={post}
						isLarge={index === 0 && !category && !tag}
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
							<Link href={`/blog?page=${page - 1}${category ? `&category=${category}` : ""}${tag ? `&tag=${tag}` : ""}`}>
								Previous
							</Link>
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
							<Link href={`/blog?page=${page + 1}${category ? `&category=${category}` : ""}${tag ? `&tag=${tag}` : ""}`}>
								Next
							</Link>
						</Button>
					)}
				</div>
			)}
		</>
	);
}

export function BlogPostsGridSkeleton() {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
			{Array.from({ length: 6 }).map((_, i) => (
				<BlogCardSkeleton key={i} isLarge={i === 0} />
			))}
		</div>
	);
}

