import { getPayloadSafe } from "@/lib/payload-client";
import ProjectsGridClient from "@/components/projects-grid-client";
import ProjectCardSkeleton from "@/components/project-card-skeleton";

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
	let page = 1;

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
				page: 1,
				sort: "-lastVerifiedAt",
				depth: 1,
			});

			projects = result.docs;
			totalProjects = result.totalDocs;
			totalPages = result.totalPages ?? 1;
			page = result.page ?? 1;
		} catch (error) {
			// Silently handle fetch errors
		}
	}

	return (
		<ProjectsGridClient
			initialProjects={projects}
			initialTotalPages={totalPages}
			initialPage={page}
			limit={limit}
			searchQuery={searchQuery}
			categoryFilter={categoryFilter}
		/>
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

