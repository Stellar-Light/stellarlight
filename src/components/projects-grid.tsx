import { getPayloadSafe } from "@/lib/payload-client";
import ProjectCard from "@/components/project-card";
import ProjectCardSkeleton from "@/components/project-card-skeleton";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface ProjectsGridProps {
	limit?: number;
	searchQuery?: string;
	categoryFilter?: string;
}

export default async function ProjectsGrid({
	limit = 12,
	searchQuery,
	categoryFilter,
}: ProjectsGridProps) {
	const payload = await getPayloadSafe();
	let projects: any[] = [];
	let totalProjects = 0;
	let totalPages = 1;

	if (payload) {
		try {
			const where: any = {
				status: {
					in: ["Development", "Pre-Release", "Live"],
				},
			};

			if (searchQuery) {
				where.or = [
					{
						name: {
							contains: searchQuery,
						},
					},
					{
						shortDescription: {
							contains: searchQuery,
						},
					},
					{
						"github.orgLogin": {
							contains: searchQuery,
						},
					},
				];
			}

			if (categoryFilter && categoryFilter !== "all") {
				where.category = { equals: categoryFilter };
			}

			const result = await payload.find({
				collection: "projects",
				where,
				limit,
				sort: "-lastVerifiedAt",
				depth: 1,
			});

			projects = result.docs;
			totalProjects = result.totalDocs;
			totalPages = result.totalPages;
		} catch (error) {
			console.error("Error fetching projects:", error);
		}
	}

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
				{projects.map((project: any, index: number) => (
					<ProjectCard
						key={project.id}
						project={project}
						isFeatured={
							index === 0 &&
							!project.verificationLevel?.includes("Unverified")
						}
					/>
				))}
			</div>

			{totalPages > 1 && (
				<div className="text-center">
					<Button
						asChild
						className="px-10 py-3.5 rounded-xl font-semibold bg-[#404040] text-foreground border border-border hover:bg-[#525252] hover:border-white/20 transition-all duration-300 shadow-lg hover:shadow-xl"
					>
						<Link href="/directory">View All Projects</Link>
					</Button>
				</div>
			)}
		</>
	);
}

export function ProjectsGridSkeleton() {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
			{Array.from({ length: 6 }).map((_, i) => (
				<ProjectCardSkeleton key={i} />
			))}
		</div>
	);
}

