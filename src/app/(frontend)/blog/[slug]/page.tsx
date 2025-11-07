import { getPayloadSafe } from "@/lib/payload-client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, User, Tag } from "lucide-react";
import { format } from "date-fns";
import { LexicalContent } from "@/components/lexical-content";
import { MarkdownContent } from "@/components/markdown-content";

type Params = Promise<{
	slug: string;
}>;

const categoryColors: Record<string, string> = {
	Announcement: "bg-blue-500/20 text-blue-400 border-blue-500/30",
	Tutorial: "bg-purple-500/20 text-purple-400 border-purple-500/30",
	News: "bg-green-500/20 text-green-400 border-green-500/30",
	Technical: "bg-orange-500/20 text-orange-400 border-orange-500/30",
	Community: "bg-pink-500/20 text-pink-400 border-pink-500/30",
	Partnership: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
	Update: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

// Force dynamic rendering to prevent build-time MongoDB connection errors
export const dynamic = "force-dynamic";

export default async function BlogDetailPage({
	params,
}: {
	params: Params;
}) {
	const { slug } = await params;
	const payload = await getPayloadSafe();

	if (!payload) {
		notFound();
	}

	let result;
	try {
		result = await payload.find({
			collection: "blog",
			where: {
				and: [
					{
						slug: {
							equals: slug,
						},
					},
					{
						status: {
							equals: "published",
						},
					},
				],
			},
			limit: 1,
			depth: 2, // Populate relationships including featuredImage and rssFeed
		});
	} catch (error) {
		console.error("Error fetching blog post:", error);
		notFound();
	}

	if (result.docs.length === 0) {
		notFound();
	}

	const post = result.docs[0];

	// If this is an external RSS post, redirect to original URL
	if (post.isRSSExternal && post.externalUrl) {
		redirect(post.externalUrl);
	}

	// Get featured image URL - prioritize RSS image URL
	let imageUrl = null;
	let isExternalImage = false;
	if (post.rssImageUrl) {
		imageUrl = post.rssImageUrl;
		isExternalImage = imageUrl.startsWith("http://") || imageUrl.startsWith("https://");
	} else if (post.featuredImage) {
		if (typeof post.featuredImage === "string") {
			imageUrl = "/logo.png";
		} else if (post.featuredImage.url) {
			imageUrl = post.featuredImage.url;
			isExternalImage = imageUrl.startsWith("http://") || imageUrl.startsWith("https://");
		} else if (post.featuredImage.filename) {
			imageUrl = `/media/${post.featuredImage.filename}`;
		}
	}

	const publishedDate = post.publishedAt
		? format(new Date(post.publishedAt), "MMMM d, yyyy")
		: "Coming soon";

	const categoryColor = post.category
		? categoryColors[post.category] || categoryColors.Update
		: categoryColors.Update;

	// Fetch related posts (same category, excluding current)
	const relatedPosts = post.category
		? await payload.find({
				collection: "blog",
				where: {
					and: [
						{
							category: {
								equals: post.category,
							},
						},
						{
							id: {
								not_equals: post.id,
							},
						},
						{
							status: {
								equals: "published",
							},
						},
					],
				},
				limit: 3,
				sort: "-publishedAt",
				depth: 1,
			})
		: { docs: [] };

	return (
		<div className="min-h-screen relative">
			<main className="max-w-4xl mx-auto px-6 py-16 pt-28">
				{/* Back Button */}
				<Link
					href="/blog"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-200 mb-8"
				>
					<ArrowLeft className="w-4 h-4" />
					<span className="text-sm font-medium">Back to Blog</span>
				</Link>

				{/* Header */}
				<article>
					{/* Category Badge */}
					{post.category && (
						<div className="mb-6">
							<Badge className={`${categoryColor} px-3 py-1 text-xs font-semibold border`}>
								{post.category}
							</Badge>
						</div>
					)}

					{/* Title */}
					<h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 text-foreground leading-tight">
						{post.title}
					</h1>

					{/* Meta Information */}
					<div className="flex flex-wrap items-center gap-6 mb-8 text-sm text-muted-foreground">
						<div className="flex items-center gap-2">
							<User className="w-4 h-4" />
							<span>{post.author}</span>
						</div>
						<div className="flex items-center gap-2">
							<Calendar className="w-4 h-4" />
							<span>{publishedDate}</span>
						</div>
						{post.tags && post.tags.length > 0 && (
							<div className="flex items-center gap-2 flex-wrap">
								<Tag className="w-4 h-4" />
								{post.tags.map((tag, index) => (
									<span key={index} className="px-2 py-0.5 rounded bg-card border border-border">
										{tag}
									</span>
								))}
							</div>
						)}
					</div>

					{/* Featured Image */}
					{imageUrl && (
						<div className="relative w-full h-[400px] md:h-[500px] rounded-2xl overflow-hidden mb-12">
							{isExternalImage ? (
								<img
									src={imageUrl}
									alt={post.title}
									className="absolute inset-0 w-full h-full object-cover"
								/>
							) : (
								<Image
									src={imageUrl}
									alt={post.title}
									fill
									className="object-cover"
									priority
								/>
							)}
							<div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
						</div>
					)}

					{/* Excerpt */}
					{post.excerpt && (
						<p className="text-xl md:text-2xl text-muted-foreground leading-relaxed mb-12 font-light">
							{post.excerpt}
						</p>
					)}

					{/* Content */}
					<div className="prose-content mb-12">
						{post.contentType === "richText" && post.content ? (
							<LexicalContent content={post.content} />
						) : post.contentType === "markdown" && post.markdownContent ? (
							<MarkdownContent content={post.markdownContent} />
						) : (
							<p className="text-muted-foreground">No content available.</p>
						)}
					</div>

					{/* RSS Feed Attribution */}
					{post.rssFeed && (
						<div className="mt-12 pt-8 border-t border-border">
							<p className="text-sm text-muted-foreground">
								Originally published via{" "}
								{typeof post.rssFeed === "object" && post.rssFeed.name
									? post.rssFeed.name
									: "RSS Feed"}
							</p>
						</div>
					)}
				</article>

				{/* Related Posts */}
				{relatedPosts.docs.length > 0 && (
					<section className="mt-20 pt-12 border-t border-border">
						<h2 className="text-2xl md:text-3xl font-bold mb-8 text-foreground">
							Related Posts
						</h2>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
							{relatedPosts.docs.map((relatedPost) => {
								let relatedImageUrl = null;
								let isRelatedExternal = false;
								if (relatedPost.rssImageUrl) {
									relatedImageUrl = relatedPost.rssImageUrl;
									isRelatedExternal = relatedImageUrl.startsWith("http://") || relatedImageUrl.startsWith("https://");
								} else if (relatedPost.featuredImage) {
									if (typeof relatedPost.featuredImage === "string") {
										relatedImageUrl = "/logo.png";
									} else if (relatedPost.featuredImage.url) {
										relatedImageUrl = relatedPost.featuredImage.url;
										isRelatedExternal = relatedImageUrl.startsWith("http://") || relatedImageUrl.startsWith("https://");
									} else if (relatedPost.featuredImage.filename) {
										relatedImageUrl = `/media/${relatedPost.featuredImage.filename}`;
									}
								}

								return (
									<Link
										key={relatedPost.id}
										href={`/blog/${relatedPost.slug}`}
										className="group block"
									>
										<div className="rounded-xl bg-card border border-border hover:border-white/20 transition-all duration-300 overflow-hidden group-hover:shadow-xl group-hover:-translate-y-1">
											{relatedImageUrl && (
												<div className="relative w-full h-48 overflow-hidden">
													{isRelatedExternal ? (
														<img
															src={relatedImageUrl}
															alt={relatedPost.title}
															className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
														/>
													) : (
														<Image
															src={relatedImageUrl}
															alt={relatedPost.title}
															fill
															className="object-cover transition-transform duration-500 group-hover:scale-110"
														/>
													)}
												</div>
											)}
											<div className="p-6">
												{relatedPost.category && (
													<Badge
														className={`${
															categoryColors[relatedPost.category] ||
															categoryColors.Update
														} px-2 py-0.5 text-xs font-semibold border mb-3`}
													>
														{relatedPost.category}
													</Badge>
												)}
												<h3 className="text-lg font-semibold mb-2 text-foreground group-hover:text-white transition-colors line-clamp-2">
													{relatedPost.title}
												</h3>
												<p className="text-sm text-muted-foreground line-clamp-2">
													{relatedPost.excerpt}
												</p>
											</div>
										</div>
									</Link>
								);
							})}
						</div>
					</section>
				)}
			</main>
		</div>
	);
}

