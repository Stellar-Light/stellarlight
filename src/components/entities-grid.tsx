import { getPayloadSafe } from "@/lib/payload-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import EntityCard from "@/components/entity-card";
import { Skeleton } from "@/components/ui/skeleton";

interface EntitiesGridProps {
	searchQuery?: string;
	page: number;
	limit: number;
}

export default async function EntitiesGrid({
	searchQuery,
	page,
	limit,
}: EntitiesGridProps) {
	const payload = await getPayloadSafe();

	let result: any = { docs: [], totalDocs: 0, totalPages: 0, page: 1, hasNextPage: false, hasPrevPage: false };

	if (payload) {
		try {
			const where: any = {};

			if (searchQuery) {
				where.or = [
					{ name: { contains: searchQuery } },
					{ description: { contains: searchQuery } },
				];
			}

			result = await payload.find({
				collection: "entities",
				where,
				limit,
				page,
				sort: "name",
				depth: 1,
			});
		} catch (error) {
			// Continue with empty result
		}
	}

	if (result.docs.length === 0) {
		return (
			<div className="text-center py-16">
				<p className="text-lg text-muted-foreground">
					No entities found. {searchQuery ? "Try adjusting your search terms." : "Entities will appear here once added."}
				</p>
			</div>
		);
	}

	return (
		<>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
				{result.docs.map((entity: any) => (
					<EntityCard key={entity.id} entity={entity} />
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
							<Link
								href={`/entities?${new URLSearchParams({
									...(searchQuery ? { q: searchQuery } : {}),
									page: String(page - 1),
								}).toString()}`}
							>
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
							<Link
								href={`/entities?${new URLSearchParams({
									...(searchQuery ? { q: searchQuery } : {}),
									page: String(page + 1),
								}).toString()}`}
							>
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

export function EntitiesGridSkeleton() {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
			{Array.from({ length: 6 }).map((_, i) => (
				<Skeleton key={i} className="h-48 rounded-xl" />
			))}
		</div>
	);
}
