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
		status: string;
		verificationLevel?: string;
		logo?: string | { id: string; url?: string; filename?: string } | null;
	};
	isFeatured?: boolean;
}

const categoryLabels: Record<string, string> = {
	Infrastructure: "Infrastructure",
	Tooling: "Tooling",
	"Partner Integration": "Partner Integration",
	"User-Facing App": "User-Facing App",
	Asset: "Asset",
	"Protocol/Contract": "Protocol/Contract",
	Anchor: "Anchor",
};

export default function ProjectCard({
	project,
	isFeatured = false,
}: ProjectCardProps) {
	const displayCategory = categoryLabels[project.category] || project.category;
	const [logoError, setLogoError] = useState(false);
	
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
		<Link href={`/project/${project.slug}`} className="block h-full">
			<div className="idea-card rounded-xl p-6 cursor-pointer flex flex-col h-full min-h-[200px]">
				{/* Tag row - occupies its own horizontal space */}
				<div className="flex justify-end mb-4">
					{isFeatured ? (
						<Badge className="px-2 py-0.5 text-xs font-semibold rounded-full bg-white text-[#171717] border-0">
							Featured
						</Badge>
					) : (
						<span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-white/10 text-foreground border border-border">
							{displayCategory}
						</span>
					)}
				</div>

				{/* Circle image and name side by side */}
				<div className="flex items-center gap-3 mb-3">
					<Image
						src={logoError ? "/logo.png" : logoUrl}
						alt={`${project.name} logo`}
						width={48}
						height={48}
						className="rounded-full object-cover w-12 h-12 flex-shrink-0"
						onError={() => {
							setLogoError(true);
						}}
					/>
					<h3 className="text-base md:text-lg font-semibold text-foreground hover:text-white transition-colors duration-150">
						{project.name}
					</h3>
				</div>

				{/* Description - flex-1 to fill remaining space */}
				<p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed flex-1 mb-4">
					{project.shortDescription || "No description available."}
				</p>

				{/* View Details with Arrow */}
				<div className="flex items-center justify-between pt-3 border-t border-border">
					<span className="text-sm font-medium text-foreground">View Details</span>
					<ArrowRight className="w-5 h-5 text-muted-foreground" />
				</div>
			</div>
		</Link>
	);
}

