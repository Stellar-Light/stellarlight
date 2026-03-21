"use client";

import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

interface ProjectCardProps {
	project: {
		id: string;
		name: string;
		slug: string;
		shortDescription?: string | null;
		category: string;
		types?: string[] | null;
		status: string;
		verificationLevel?: string;
		logo?: string | { id: string; url?: string | null; filename?: string | null } | null | undefined;
	};
	isFeatured?: boolean;
}

export default function ProjectCard({
	project,
	isFeatured = false,
}: ProjectCardProps) {
	const [logoError, setLogoError] = useState(false);
	const types = project.types && project.types.length > 0 ? project.types : null;

	// Get logo URL - handle both string ID and populated object
	let logoUrl = "/logo.png"; // Default fallback
	if (project.logo && !logoError) {
		if (typeof project.logo === "string") {
			// If it's just an ID, use fallback (should be populated in queries)
			logoUrl = "/logo.png";
		} else if (project.logo.url) {
			logoUrl = project.logo.url;
		} else if (project.logo.filename) {
			// PayloadCMS serves media via /media endpoint
			logoUrl = `/media/${project.logo.filename}`;
		}
	}

	return (
		<Link href={`/project/${project.slug}`} className="block h-full group">
			<div className="idea-card rounded-xl p-6 cursor-pointer flex flex-col h-full min-h-[200px]">
				{/* Tag row */}
				<div className="flex justify-between items-center mb-4">
					<div className="flex items-center gap-1.5 flex-wrap">
						{types ? (
							types.map((type) => (
								<span
									key={type}
									className="inline-block px-2.5 py-1 text-xs font-medium rounded-full bg-white/10 text-foreground border border-border backdrop-blur-sm"
								>
									{type}
								</span>
							))
						) : (
							<span className="inline-block px-2.5 py-1 text-xs font-medium rounded-full bg-white/10 text-foreground border border-border backdrop-blur-sm">
								{project.category}
							</span>
						)}
					</div>
					{isFeatured && (
						<Badge className="px-2.5 py-1 text-xs font-semibold rounded-full bg-white text-[#171717] border-0 shadow-sm flex-shrink-0">
							Featured
						</Badge>
					)}
				</div>

				{/* Circle image and name side by side */}
				<div className="flex items-center gap-3 mb-4">
					<div className="relative flex-shrink-0">
						<Image
							src={logoError ? "/logo.png" : logoUrl}
							alt={`${project.name} logo`}
							width={52}
							height={52}
							className="rounded-full object-cover w-[52px] h-[52px] border border-border/50 transition-transform duration-150 group-hover:scale-110 group-hover:border-white/30"
							onError={() => {
								setLogoError(true);
							}}
						/>
					</div>
					<h3 className="text-base md:text-lg font-semibold text-foreground group-hover:text-white transition-all duration-150 leading-tight">
						{project.name}
					</h3>
				</div>

				{/* Description - flex-1 to fill remaining space */}
				<p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed flex-1 mb-5 group-hover:text-foreground/80 transition-all duration-150">
					{project.shortDescription || "No description available."}
				</p>

				{/* View Details with Arrow */}
				<div className="flex items-center justify-between pt-4 border-t border-border group-hover:border-white/20 transition-all duration-150">
					<span className="text-sm font-medium text-foreground group-hover:text-white transition-all duration-150">
						View Details
					</span>
					<ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all duration-150" />
				</div>
			</div>
		</Link>
	);
}
