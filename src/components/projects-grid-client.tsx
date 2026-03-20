"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import ProjectCard from "@/components/project-card";
import ProjectCardSkeleton from "@/components/project-card-skeleton";

interface ProjectsGridClientProps {
	initialProjects: any[];
	initialTotalPages: number;
	initialPage: number;
	limit: number;
	searchQuery?: string;
	categoryFilter?: string;
}

export default function ProjectsGridClient({
	initialProjects,
	initialTotalPages,
	initialPage,
	limit,
	searchQuery,
	categoryFilter,
}: ProjectsGridClientProps) {
	const [projects, setProjects] = useState(initialProjects);
	const [currentPage, setCurrentPage] = useState(initialPage);
	const [isLoading, setIsLoading] = useState(false);
	const [hasMore, setHasMore] = useState(initialPage < initialTotalPages);

	const loadMore = async () => {
		if (isLoading || !hasMore) return;

		setIsLoading(true);
		try {
			const params = new URLSearchParams({
				page: String(currentPage + 1),
				limit: String(limit),
			});
			if (searchQuery) params.set("q", searchQuery);
			if (categoryFilter && categoryFilter !== "all") {
				params.set("category", categoryFilter);
			}

			const response = await fetch(`/api/public/projects?${params.toString()}`);
			if (!response.ok) throw new Error("Failed to load projects");

			const data = await response.json();
			setProjects((prev) => [...prev, ...data.docs]);
			setCurrentPage(data.page);
			setHasMore(data.page < data.totalPages);
		} catch (error) {
			// Silently handle fetch errors
		} finally {
			setIsLoading(false);
		}
	};

	if (projects.length === 0) {
		return (
			<div className="text-center py-20">
				<p className="text-lg text-muted-foreground">
					No projects found. {searchQuery ? "Try adjusting your search terms." : "Projects will appear here once approved."}
				</p>
			</div>
		);
	}

	return (
		<>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
				{projects.map((project: any) => (
					<ProjectCard
						key={project.id}
						project={project}
						isFeatured={project.featured === true}
					/>
				))}
				{isLoading &&
					Array.from({ length: limit }).map((_, i) => (
						<ProjectCardSkeleton key={`loading-${i}`} />
					))}
			</div>

			{hasMore && (
				<div className="text-center">
					<Button
						onClick={loadMore}
						disabled={isLoading}
						className="px-10 py-3.5 rounded-xl font-semibold bg-[#404040] text-foreground border border-border hover:bg-[#525252] hover:border-white/20 transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isLoading ? "Loading..." : "Load More"}
					</Button>
				</div>
			)}
		</>
	);
}

