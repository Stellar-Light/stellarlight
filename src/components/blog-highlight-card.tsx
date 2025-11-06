"use client";

import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Calendar, User } from "lucide-react";
import { format } from "date-fns";

interface BlogHighlightCardProps {
	post: {
		id: string;
		title: string;
		slug: string;
		excerpt: string;
		author: string;
		publishedAt: string;
		category?: string;
		featuredImage?: string | { id: string; url?: string; filename?: string } | null;
		rssImageUrl?: string | null;
		featured?: boolean;
	};
	isLarge?: boolean;
}

const categoryColors: Record<string, string> = {
	Announcement: "bg-blue-500/20 text-blue-400 border-blue-500/30",
	Tutorial: "bg-purple-500/20 text-purple-400 border-purple-500/30",
	News: "bg-green-500/20 text-green-400 border-green-500/30",
	Technical: "bg-orange-500/20 text-orange-400 border-orange-500/30",
	Community: "bg-pink-500/20 text-pink-400 border-pink-500/30",
	Partnership: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
	Update: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export default function BlogHighlightCard({
	post,
	isLarge = false,
}: BlogHighlightCardProps) {
	let imageUrl = null;
	let isExternalImage = false;
	// First check for RSS image URL (fastest - direct URL)
	if (post.rssImageUrl) {
		imageUrl = post.rssImageUrl;
		isExternalImage = imageUrl.startsWith("http://") || imageUrl.startsWith("https://");
	} else if (post.featuredImage) {
		// Fall back to uploaded image
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
		? format(new Date(post.publishedAt), "MMM d, yyyy")
		: "Coming soon";

	const categoryColor = post.category
		? categoryColors[post.category] || categoryColors.Update
		: categoryColors.Update;

	if (isLarge) {
		return (
			<Link href={`/blog/${post.slug}`} className="group block h-full col-span-1 md:col-span-2 lg:col-span-3">
				<div className="relative overflow-hidden rounded-2xl bg-card border border-border hover:border-white/30 transition-all duration-500 h-full flex flex-col cursor-pointer group-hover:shadow-2xl group-hover:shadow-[#FDDA24]/20 group-hover:-translate-y-2">
					{/* Featured Image - Full Width */}
					{imageUrl && (
						<div className="relative w-full h-80 md:h-96 overflow-hidden">
							{isExternalImage ? (
								<img
									src={imageUrl}
									alt={post.title}
									className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
								/>
							) : (
								<Image
									src={imageUrl}
									alt={post.title}
									fill
									className="object-cover transition-transform duration-700 group-hover:scale-105"
									priority
								/>
							)}
							{/* Subtle gradient overlay */}
							<div className="absolute inset-0 bg-gradient-to-t from-background via-background/0 to-transparent opacity-60" />
						</div>
					)}

					{/* Content */}
					<div className="flex-1 p-8 md:p-10 flex flex-col">
						{/* Category Badge */}
						{post.category && (
							<div className="mb-4">
								<Badge className={`${categoryColor} px-3 py-1.5 text-xs font-semibold border`}>
									{post.category}
								</Badge>
							</div>
						)}

						{/* Title */}
						<h3 className="text-3xl md:text-4xl font-bold mb-4 text-foreground group-hover:text-white transition-colors duration-300 leading-tight">
							{post.title}
						</h3>

						{/* Excerpt */}
						<p className="text-lg text-muted-foreground mb-6 line-clamp-3 leading-relaxed flex-1">
							{post.excerpt}
						</p>

						{/* Meta & CTA */}
						<div className="flex items-center justify-between pt-6 border-t border-border/50">
							<div className="flex items-center gap-6 text-sm text-muted-foreground">
								<div className="flex items-center gap-2">
									<User className="w-4 h-4" />
									<span className="font-medium">{post.author}</span>
								</div>
								<div className="flex items-center gap-2">
									<Calendar className="w-4 h-4" />
									<span>{publishedDate}</span>
								</div>
							</div>
							<ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-[#FDDA24] group-hover:translate-x-1 transition-all duration-300" />
						</div>
					</div>
				</div>
			</Link>
		);
	}

	return (
		<Link href={`/blog/${post.slug}`} className="group block h-full">
			<div className="relative overflow-hidden rounded-2xl bg-card border border-border hover:border-white/30 transition-all duration-500 h-full flex flex-col cursor-pointer group-hover:shadow-xl group-hover:shadow-[#FDDA24]/10 group-hover:-translate-y-2">
				{/* Featured Image - Full Width */}
				{imageUrl ? (
					<div className="relative w-full h-64 md:h-72 overflow-hidden">
						{isExternalImage ? (
							<img
								src={imageUrl}
								alt={post.title}
								className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
							/>
						) : (
							<Image
								src={imageUrl}
								alt={post.title}
								fill
								className="object-cover transition-transform duration-700 group-hover:scale-105"
							/>
						)}
						{/* Subtle gradient overlay */}
						<div className="absolute inset-0 bg-gradient-to-t from-background/60 via-background/0 to-transparent opacity-50" />
					</div>
				) : (
					<div className="relative w-full h-64 md:h-72 bg-gradient-to-br from-card via-card/80 to-card/60" />
				)}

				{/* Content */}
				<div className="flex-1 p-6 md:p-8 flex flex-col">
					{/* Category Badge */}
					{post.category && (
						<div className="mb-4">
							<Badge className={`${categoryColor} px-3 py-1 text-xs font-semibold border`}>
								{post.category}
							</Badge>
						</div>
					)}

					{/* Title */}
					<h3 className="text-xl md:text-2xl font-bold mb-3 text-foreground group-hover:text-white transition-colors duration-300 leading-tight">
						{post.title}
					</h3>

					{/* Excerpt */}
					<p className="text-sm md:text-base text-muted-foreground mb-6 line-clamp-3 leading-relaxed flex-1">
						{post.excerpt}
					</p>

					{/* Meta & CTA */}
					<div className="flex items-center justify-between pt-4 border-t border-border/50">
						<div className="flex items-center gap-4 text-xs md:text-sm text-muted-foreground">
							<div className="flex items-center gap-1.5">
								<User className="w-3.5 h-3.5 md:w-4 md:h-4" />
								<span className="font-medium">{post.author}</span>
							</div>
							<div className="flex items-center gap-1.5">
								<Calendar className="w-3.5 h-3.5 md:w-4 md:h-4" />
								<span>{publishedDate}</span>
							</div>
						</div>
						<ArrowRight className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground group-hover:text-[#FDDA24] group-hover:translate-x-1 transition-all duration-300" />
					</div>
				</div>
			</div>
		</Link>
	);
}

