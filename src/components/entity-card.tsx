"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { EntityLogo } from "./entity-logo";

interface EntityCardProps {
	entity: {
		id: string;
		name: string;
		slug: string;
		description?: string | null;
		logo?:
			| string
			| { id: string; url?: string | null; filename?: string | null }
			| null
			| undefined;
		domains?: Array<{ domain: string }> | null | undefined;
		projects?:
			| Array<
					| string
					| {
							id: string;
							name?: string;
							slug?: string;
					  }
			  >
			| null
			| undefined;
	};
}

export default function EntityCard({ entity }: EntityCardProps) {
	const projectCount = entity.projects?.length || 0;

	// Format description - show description or fallback message
	const getDescription = () => {
		if (entity.description) {
			return entity.description;
		}
		return "No description available.";
	};

	return (
		<Link href={`/entities/${entity.slug}`} className="block h-full group">
			<div className="idea-card rounded-xl p-6 cursor-pointer flex flex-col h-full min-h-[200px]">
				{/* Tag row - occupies its own horizontal space */}
				<div className="flex justify-start mb-4">
					{projectCount > 0 ? (
						<span className="inline-block px-2.5 py-1 text-xs font-medium rounded-full bg-white/10 text-foreground border border-border backdrop-blur-sm">
							{projectCount} {projectCount === 1 ? "Project" : "Projects"}
						</span>
					) : (
						<span className="inline-block px-2.5 py-1 text-xs font-medium rounded-full bg-white/10 text-foreground border border-border backdrop-blur-sm">
							Organization
						</span>
					)}
				</div>

				{/* Icon and name side by side */}
				<div className="flex items-center gap-3 mb-4">
					<div className="flex-shrink-0">
						<div className="h-[52px] w-[52px] rounded-full overflow-hidden border border-border/50 transition-transform duration-300 group-hover:scale-110 group-hover:border-white/30">
							<EntityLogo
								logo={entity.logo}
								name={entity.name}
								size={52}
								className="w-full h-full rounded-full"
								showFallbackIcon={true}
							/>
						</div>
					</div>
					<h3 className="text-base md:text-lg font-semibold text-foreground group-hover:text-white transition-colors duration-300 leading-tight">
						{entity.name}
					</h3>
				</div>

				{/* Description - flex-1 to fill remaining space */}
				<p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed flex-1 mb-5 group-hover:text-foreground/80 transition-colors duration-300">
					{getDescription()}
				</p>

				{/* View Details with Arrow */}
				<div className="flex items-center justify-between pt-4 border-t border-border group-hover:border-white/20 transition-colors duration-300">
					<span className="text-sm font-medium text-foreground group-hover:text-white transition-colors duration-300">
						View Details
					</span>
					<ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all duration-300" />
				</div>
			</div>
		</Link>
	);
}
