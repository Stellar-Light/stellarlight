import { getPayloadSafe } from "@/lib/payload-client";
import BlogHighlightCard from "@/components/blog-highlight-card";
import BlogCardSkeleton from "@/components/blog-card-skeleton";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface BlogPostsGridProps {
	page?: number;
	category?: string;
	tag?: string;
	source?: string;
	excludeSlug?: string;
}

export default async function BlogPostsGrid({
	page = 1,
	category,
	tag,
	source,
	excludeSlug,
}: BlogPostsGridProps) {
	const payload = await getPayloadSafe();
	const limit = 12;

	let posts: any[] = [];
	let result: any = { docs: [], totalDocs: 0, totalPages: 0, page: 1, hasNextPage: false, hasPrevPage: false };

	if (payload) {
		try {
			const where: any = {
				status: { equals: "published" },
				contentType: { not_equals: "changelog" },
			};

			if (category) {
				where.category = { equals: category };
			}

			if (tag) {
				where.tags = { in: [tag] };
			}

			if (source) {
				where.source = { equals: source };
			}

			if (excludeSlug) {
				where.slug = { not_equals: excludeSlug };
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
		} catch {
			// Silently handle fetch errors
		}
	}

	if (posts.length === 0) {
		return (
			<div className="text-center py-20">
				<p className="text-lg text-muted-foreground">
					No posts found.
					{category || tag || source
						? " Try adjusting your filters."
						: " Check back soon for updates!"}
				</p>
			</div>
		);
	}

	const buildPageUrl = (p: number) => {
		const params = new URLSearchParams();
		if (p > 1) params.set("page", String(p));
		if (category) params.set("category", category);
		if (tag) params.set("tag", tag);
		if (source) params.set("source", source);
		const qs = params.toString();
		return qs ? `/blog?${qs}` : "/blog";
	};

	return (
		<>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
				{posts.map((post: any) => (
					<BlogHighlightCard key={post.id} post={post} />
				))}
			</div>

			{/* Pagination */}
			{result.totalPages > 1 && (
				<div className="flex items-center justify-center gap-2">
					{page > 1 ? (
						<Button
							asChild
							variant="ghost"
							size="default"
							className="rounded-lg bg-[#262626] border border-[#2F2F2F] hover:bg-white/5 hover:border-white/20 hover:text-foreground transition-all duration-150"
						>
							<Link href={buildPageUrl(page - 1)}>Previous</Link>
						</Button>
					) : (
						<Button
							variant="ghost"
							size="default"
							disabled
							className="rounded-lg bg-[#262626] border border-[#2F2F2F] opacity-40"
						>
							Previous
						</Button>
					)}
					<div className="flex items-center px-4 py-2 rounded-lg bg-[#262626] border border-[#2F2F2F]">
						<span className="text-xs font-medium text-muted-foreground">
							{page} / {result.totalPages}
						</span>
					</div>
					{page < result.totalPages ? (
						<Button
							asChild
							variant="ghost"
							size="default"
							className="rounded-lg bg-[#262626] border border-[#2F2F2F] hover:bg-white/5 hover:border-white/20 hover:text-foreground transition-all duration-150"
						>
							<Link href={buildPageUrl(page + 1)}>Next</Link>
						</Button>
					) : (
						<Button
							variant="ghost"
							size="default"
							disabled
							className="rounded-lg bg-[#262626] border border-[#2F2F2F] opacity-40"
						>
							Next
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
				<BlogCardSkeleton key={i} isLarge={false} />
			))}
		</div>
	);
}
