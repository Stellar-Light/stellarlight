import { getPayloadSafe } from "@/lib/payload-client";
import { rankedProjectSearch } from "@/lib/search/ranked-project-search";
import ProjectCard from "@/components/project-card";
import ProjectCardSkeleton from "@/components/project-card-skeleton";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DirectoryProjectsGridProps {
	searchQuery?: string;
	typeFilter?: string;
	scfFilter?: string;
	sortOption?: string;
	page: number;
	limit: number;
}

/** Map sort option to Payload sort string */
function getPayloadSort(sortOption: string): string {
	switch (sortOption) {
		case "name-asc":
			return "name";
		case "name-desc":
			return "-name";
		case "newest":
			return "-lastVerifiedAt";
		case "featured":
		default:
			return "-relevanceScore";
	}
}

/** Apply type filter to a Payload where clause */
function applyTypeFilter(baseWhere: any, typeFilter?: string) {
	if (!typeFilter || typeFilter === "all") return;

	const typeValues = typeFilter === "Payments"
		? ["Payments", "Payment Rail"]
		: [typeFilter];
	baseWhere.types = { in: typeValues };
}

/** Apply SCF filter to a Payload where clause (combinable with type) */
function applyScfFilter(baseWhere: any, scfFilter?: string) {
	if (!scfFilter) return;

	baseWhere["scf.awarded"] = { equals: true };
	if (scfFilter !== "all") {
		const round = parseInt(scfFilter, 10);
		if (!isNaN(round)) {
			baseWhere["scf.awardedRounds"] = { in: [round] };
		}
	}
}

/** Build pagination URL params preserving all active filters */
function buildPaginationParams(props: {
	searchQuery?: string;
	typeFilter?: string;
	scfFilter?: string;
	sortOption?: string;
	page: number;
}): string {
	const params: Record<string, string> = {};
	if (props.searchQuery) params.q = props.searchQuery;
	if (props.typeFilter && props.typeFilter !== "all") params.type = props.typeFilter;
	if (props.scfFilter) params.scf = props.scfFilter;
	if (props.sortOption && props.sortOption !== "featured") params.sort = props.sortOption;
	params.page = String(props.page);
	return new URLSearchParams(params).toString();
}

export default async function DirectoryProjectsGrid({
	searchQuery,
	typeFilter,
	scfFilter,
	sortOption = "featured",
	page,
	limit,
}: DirectoryProjectsGridProps) {
	const payload = await getPayloadSafe();

	let result: any = { docs: [], totalDocs: 0, totalPages: 0, page: 1, hasNextPage: false, hasPrevPage: false };

	if (payload) {
		try {
			const baseWhere: any = {
				status: {
					in: ["Development", "Pre-Release", "Live"],
				},
			};

			applyTypeFilter(baseWhere, typeFilter);
			applyScfFilter(baseWhere, scfFilter);

			if (searchQuery) {
				result = await rankedProjectSearch(payload, {
					query: searchQuery,
					typeFilter,
					scfFilter,
					page,
					limit,
					sort: getPayloadSort(sortOption),
				});
			} else {
				result = await payload.find({
					collection: "projects",
					where: baseWhere,
					limit,
					page,
					sort: getPayloadSort(sortOption),
					depth: 1,
				});
			}
		} catch (error) {
			// Silently handle fetch errors
		}
	}

	if (result.docs.length === 0) {
		return (
			<div className="text-center py-16">
				<p className="text-lg text-muted-foreground">
					No projects found. {searchQuery ? "Try adjusting your search terms." : "Projects will appear here once approved."}
				</p>
			</div>
		);
	}

	return (
		<>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
				{result.docs.map((project: any) => (
					<ProjectCard
						key={project.id}
						project={project}
						isFeatured={project.featured === true}
					/>
				))}
			</div>

			{/* Pagination */}
			{result.totalPages > 1 && (
				<div className="flex items-center justify-center gap-2">
					{page > 1 ? (
						<Button
							asChild
							variant="ghost"
							size="default"
							className="rounded-lg bg-[#262626] border border-[#2F2F2F] hover:bg-white/5 hover:border-white/20 hover:text-foreground transition-all duration-150"
						>
							<Link href={`/directory?${buildPaginationParams({ searchQuery, typeFilter, scfFilter, sortOption, page: page - 1 })}`}>
								<ChevronLeft className="h-3.5 w-3.5" />
								Previous
							</Link>
						</Button>
					) : (
						<Button
							variant="ghost"
							size="default"
							disabled
							className="rounded-lg bg-[#262626] border border-[#2F2F2F] opacity-40"
						>
							<ChevronLeft className="h-3.5 w-3.5" />
							Previous
						</Button>
					)}
					<div className="flex items-center px-4 py-2 rounded-lg bg-[#262626] border border-[#2F2F2F]">
						<span className="text-xs font-medium text-muted-foreground">
							{page} / {result.totalPages}
						</span>
					</div>
					{page < result.totalPages ? (
						<Button
							asChild
							variant="ghost"
							size="default"
							className="rounded-lg bg-[#262626] border border-[#2F2F2F] hover:bg-white/5 hover:border-white/20 hover:text-foreground transition-all duration-150"
						>
							<Link href={`/directory?${buildPaginationParams({ searchQuery, typeFilter, scfFilter, sortOption, page: page + 1 })}`}>
								Next
								<ChevronRight className="h-3.5 w-3.5" />
							</Link>
						</Button>
					) : (
						<Button
							variant="ghost"
							size="default"
							disabled
							className="rounded-lg bg-[#262626] border border-[#2F2F2F] opacity-40"
						>
							Next
							<ChevronRight className="h-3.5 w-3.5" />
						</Button>
					)}
				</div>
			)}
		</>
	);
}

export function DirectoryProjectsGridSkeleton() {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
			{Array.from({ length: 6 }).map((_, i) => (
				<ProjectCardSkeleton key={i} />
			))}
		</div>
	);
}
