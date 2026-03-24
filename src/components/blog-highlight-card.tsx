"use client";

import Link from "next/link";
import Image from "next/image";
import { ExternalLink } from "lucide-react";

interface BlogHighlightCardProps {
	post: {
		id: string;
		title: string;
		slug: string;
		excerpt: string;
		author: string;
		publishedAt?: string | null | undefined;
		category?: string | null | undefined;
		featuredImage?: string | { id: string; url?: string | null; filename?: string | null } | null | undefined;
		rssImageUrl?: string | null;
		featured?: boolean | null | undefined;
	};
	isLarge?: boolean;
}

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

	return (
		<Link href={`/blog/${post.slug}`} className="group block h-full">
			<div className="rounded-xl bg-card border border-border hover:border-white/30 transition-all duration-150 h-full flex flex-col cursor-pointer overflow-hidden">
				{/* Image - Top Row */}
				{imageUrl ? (
					<div className="relative w-full h-36 overflow-hidden">
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
							/>
						)}
					</div>
				) : (
					<div className="relative w-full h-36 bg-gradient-to-br from-card via-card/80 to-card/60" />
				)}

				{/* Content - Bottom Row */}
				<div className="flex-1 flex flex-col p-5">
					{/* Title */}
					<h3 className="text-base md:text-lg font-semibold mb-2 text-foreground group-hover:text-white transition-colors duration-150 leading-tight line-clamp-2">
						{post.title}
					</h3>

					{/* Description */}
					<p className="text-sm text-muted-foreground mb-3 line-clamp-3 leading-relaxed flex-1 min-h-0">
						{post.excerpt}
					</p>

					{/* Learn More with External Link Icon */}
					<div className="mt-auto flex items-center gap-2">
						<span className="text-sm font-medium text-foreground group-hover:text-white transition-colors duration-150">
							Learn more
						</span>
						<ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors duration-150" />
					</div>
				</div>
			</div>
		</Link>
	);
}

