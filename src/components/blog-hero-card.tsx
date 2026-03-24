import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

interface BlogHeroCardProps {
	post: {
		title: string;
		slug: string;
		excerpt: string;
		author: string;
		publishedAt?: string | null;
		category?: string | null;
		featuredImage?: string | { url?: string | null; filename?: string | null } | null;
		rssImageUrl?: string | null;
		source?: string | null;
	};
}

const sourceLabels: Record<string, string> = {
	"sdf-blog": "SDF Blog",
	medium: "Medium",
	"stablecoin-report": "Stablecoin Report",
	"rwa-report": "RWA Report",
	editorial: "Editorial",
	changelog: "Changelog",
};

export default function BlogHeroCard({ post }: BlogHeroCardProps) {
	let imageUrl: string | null = null;
	let isExternal = false;

	if (post.rssImageUrl) {
		imageUrl = post.rssImageUrl;
		isExternal = true;
	} else if (post.featuredImage && typeof post.featuredImage === "object") {
		if (post.featuredImage.url) {
			imageUrl = post.featuredImage.url;
			isExternal = imageUrl.startsWith("http");
		} else if (post.featuredImage.filename) {
			imageUrl = `/media/${post.featuredImage.filename}`;
		}
	}

	const date = post.publishedAt
		? new Date(post.publishedAt).toLocaleDateString("en-US", {
				month: "long",
				day: "numeric",
				year: "numeric",
			})
		: null;

	return (
		<Link href={`/blog/${post.slug}`} className="group block mb-10">
			<div className="rounded-2xl bg-card border border-border hover:border-white/30 transition-all duration-200 overflow-hidden md:flex md:h-[320px]">
				{/* Image */}
				<div className="relative w-full md:w-1/2 h-48 md:h-full overflow-hidden">
					{imageUrl ? (
						isExternal ? (
							<img
								src={imageUrl}
								alt={post.title}
								className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
							/>
						) : (
							<Image
								src={imageUrl}
								alt={post.title}
								fill
								className="object-cover group-hover:scale-105 transition-transform duration-300"
							/>
						)
					) : (
						<div className="absolute inset-0 bg-gradient-to-br from-white/5 to-white/0" />
					)}
				</div>

				{/* Content */}
				<div className="flex-1 p-6 md:p-8 flex flex-col justify-center">
					<div className="flex items-center gap-2 mb-3">
						{post.category && (
							<span className="text-xs font-medium px-2 py-0.5 rounded-md bg-white/10 text-muted-foreground">
								{post.category}
							</span>
						)}
						{post.source && post.source !== "editorial" && (
							<span className="text-xs font-medium px-2 py-0.5 rounded-md bg-white/5 text-muted-foreground">
								{sourceLabels[post.source] || post.source}
							</span>
						)}
					</div>
					<h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3 leading-tight group-hover:text-white transition-colors line-clamp-2">
						{post.title}
					</h2>
					<p className="text-muted-foreground mb-4 line-clamp-3 leading-relaxed">
						{post.excerpt}
					</p>
					<div className="flex items-center justify-between mt-auto">
						<div className="flex items-center gap-3 text-sm text-muted-foreground">
							<span>{post.author}</span>
							{date && (
								<>
									<span>·</span>
									<span>{date}</span>
								</>
							)}
						</div>
						<ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
					</div>
				</div>
			</div>
		</Link>
	);
}
