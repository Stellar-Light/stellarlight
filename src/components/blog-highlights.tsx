import { getPayloadSafe } from "@/lib/payload-client";
import BlogHighlightCard from "@/components/blog-highlight-card";
import BlogCardSkeleton from "@/components/blog-card-skeleton";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "@/components/ui/carousel";

export default async function BlogHighlights() {
	const payload = await getPayloadSafe();
	let featuredPosts: any[] = [];

	if (payload) {
		try {
			const blogResult = await payload.find({
				collection: "blog",
				where: {
					and: [
						{
							featured: {
								equals: true,
							},
						},
						{
							status: {
								equals: "published",
							},
						},
					],
				},
				limit: 10,
				sort: "-publishedAt",
				depth: 2,
			});

			featuredPosts = blogResult.docs;
		} catch (error) {
			console.error("Error fetching blog posts:", error);
		}
	}

	if (featuredPosts.length === 0) {
		return null;
	}

	return (
		<section className="mb-24">
			<div className="flex items-center justify-between mb-8">
				<div>
					<h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
						Highlights
					</h2>
				</div>
				<Button
					asChild
					variant="outline"
					className="hidden sm:flex px-6 py-2 rounded-xl font-medium border-border hover:border-white/20 transition-all duration-300"
				>
					<Link href="/blog">View All Posts</Link>
				</Button>
			</div>
			<Carousel
				opts={{
					align: "start",
					loop: true,
				}}
				className="w-full"
			>
				<CarouselContent className="-ml-2 md:-ml-4">
					{featuredPosts.map((post: any) => (
						<CarouselItem
							key={post.id}
							className="pl-2 md:pl-4 basis-full md:basis-1/2 lg:basis-1/3"
						>
							<BlogHighlightCard post={post} />
						</CarouselItem>
					))}
				</CarouselContent>
				<CarouselPrevious className="hidden md:flex" />
				<CarouselNext className="hidden md:flex" />
			</Carousel>
			<div className="mt-6 text-center sm:hidden">
				<Button
					asChild
					variant="outline"
					className="px-8 py-3 rounded-xl font-semibold border-border hover:border-white/20 transition-all duration-300"
				>
					<Link href="/blog">View All Posts</Link>
				</Button>
			</div>
		</section>
	);
}

export function BlogHighlightsSkeleton() {
	return (
		<section className="mb-24">
			<div className="flex items-center justify-between mb-8">
				<div>
					<div className="h-10 w-32 bg-[#262626] rounded animate-pulse" />
				</div>
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
				{Array.from({ length: 3 }).map((_, i) => (
					<BlogCardSkeleton key={i} />
				))}
			</div>
		</section>
	);
}

