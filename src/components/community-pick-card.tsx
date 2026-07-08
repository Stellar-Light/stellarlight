"use client";

import { X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

interface CommunityPickCardProps {
	project: {
		id: string;
		name: string;
		shortDescription?: string | null;
		logo?:
			| string
			| { id: string; url?: string | null; filename?: string | null }
			| null
			| undefined;
		links?: {
			twitter?: string | null;
		};
	};
}

export default function CommunityPickCard({ project }: CommunityPickCardProps) {
	const [logoError, setLogoError] = useState(false);

	// Get logo URL - handle both string ID and populated object
	let logoUrl = "/logo.png"; // Default fallback
	if (project.logo && !logoError) {
		if (typeof project.logo === "string") {
			logoUrl = "/logo.png";
		} else if (project.logo.url) {
			logoUrl = project.logo.url;
		} else if (project.logo.filename) {
			logoUrl = `/media/${project.logo.filename}`;
		}
	}

	// Extract X handle from URL and construct full URL
	const getXHandleAndUrl = () => {
		if (!project.links?.twitter) return { handle: null, url: null };
		const twitterUrl = project.links.twitter;
		// Handle both x.com and twitter.com URLs
		const match = twitterUrl.match(/(?:x\.com|twitter\.com)\/([^/?]+)/i);
		if (match) {
			const handle = match[1];
			return { handle, url: `https://x.com/${handle}` };
		}
		// If it's already just a handle (without URL), extract it
		const handle = twitterUrl
			.replace(/^@/, "")
			.replace(/^https?:\/\//, "")
			.split("/")[0];
		return { handle, url: `https://x.com/${handle}` };
	};

	const { handle: xHandle, url: xUrl } = getXHandleAndUrl();

	if (!xHandle || !xUrl) {
		// If no X handle or URL, don't render the card
		return null;
	}

	return (
		<a
			href={xUrl}
			target="_blank"
			rel="noopener noreferrer"
			className="block h-full group"
		>
			<div className="idea-card rounded-xl p-4 cursor-pointer flex flex-col h-full hover:border-white/20 transition-all duration-150">
				{/* Logo and name */}
				<div className="flex items-center gap-3 mb-3">
					<div className="relative flex-shrink-0">
						<Image
							src={logoError ? "/logo.png" : logoUrl}
							alt={`${project.name} logo`}
							width={40}
							height={40}
							className="rounded-full object-cover w-10 h-10 border border-border/50 transition-transform duration-150 group-hover:scale-110 group-hover:border-white/30"
							onError={() => {
								setLogoError(true);
							}}
						/>
					</div>
					<h3 className="text-base md:text-lg font-semibold text-foreground group-hover:text-white transition-colors duration-150 leading-tight">
						{project.name}
					</h3>
				</div>

				{/* Description */}
				<p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed mb-3 group-hover:text-foreground/80 transition-colors duration-150 flex-1">
					{project.shortDescription || "No description available."}
				</p>

				{/* X Handle */}
				<div className="flex items-center gap-1.5 pt-2 border-t border-border/50 group-hover:border-white/20 transition-colors duration-150">
					<X className="w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors duration-150" />
					<span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors duration-150">
						@{xHandle}
					</span>
				</div>
			</div>
		</a>
	);
}
