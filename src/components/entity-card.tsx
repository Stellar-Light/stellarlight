"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Building2, Code } from "lucide-react";

interface EntityCardProps {
	entity: {
		id: string;
		name: string;
		slug: string;
		domains?: Array<{ domain: string }> | null;
		projects?: Array<{
			id: string;
			name: string;
			slug: string;
		}> | null;
	};
}

export default function EntityCard({ entity }: EntityCardProps) {
	const projectCount = entity.projects?.length || 0;

	return (
		<Link href={`/entities/${entity.slug}`} className="block h-full">
			<div className="idea-card rounded-xl p-6 cursor-pointer flex flex-col h-full min-h-[200px]">
				{/* Tag row - occupies its own horizontal space */}
				<div className="flex justify-end mb-4">
					{projectCount > 0 ? (
						<span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-white/10 text-foreground border border-border">
							{projectCount} {projectCount === 1 ? "Project" : "Projects"}
						</span>
					) : (
						<span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-white/10 text-foreground border border-border">
							Organization
						</span>
					)}
				</div>

				{/* Icon and name side by side */}
				<div className="flex items-center gap-3 mb-3">
					<div className="flex-shrink-0">
						<div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
							<Building2 className="h-6 w-6 text-primary" />
						</div>
					</div>
					<h3 className="text-base md:text-lg font-semibold text-foreground hover:text-white transition-colors duration-150">
						{entity.name}
					</h3>
				</div>

				{/* Description - flex-1 to fill remaining space */}
				<div className="flex-1 mb-4 space-y-2">
					{entity.domains && entity.domains.length > 0 && (
						<div className="text-sm text-muted-foreground">
							<span className="line-clamp-2">
								{entity.domains
									.slice(0, 2)
									.map((d) => d.domain)
									.join(", ")}
								{entity.domains.length > 2 &&
									` +${entity.domains.length - 2} more`}
							</span>
						</div>
					)}
					{projectCount > 0 && (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Code className="h-3.5 w-3.5" />
							<span>
								{projectCount} {projectCount === 1 ? "project" : "projects"}
							</span>
						</div>
					)}
					{projectCount === 0 && (
						<p className="text-sm text-muted-foreground italic">
							No projects linked yet
						</p>
					)}
				</div>

				{/* View Details with Arrow */}
				<div className="flex items-center justify-between pt-3 border-t border-border">
					<span className="text-sm font-medium text-foreground">View Details</span>
					<ArrowRight className="w-5 h-5 text-muted-foreground" />
				</div>
			</div>
		</Link>
	);
}

