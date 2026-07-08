import { Skeleton } from "@/components/ui/skeleton";

interface BlogCardSkeletonProps {
	isLarge?: boolean;
}

export default function BlogCardSkeleton({
	isLarge = false,
}: BlogCardSkeletonProps) {
	if (isLarge) {
		return (
			<div className="relative overflow-hidden rounded-2xl bg-[#262626] border border-[#2F2F2F] h-full flex flex-col">
				{/* Image skeleton */}
				<Skeleton className="w-full h-80 md:h-96" />

				{/* Content */}
				<div className="flex-1 p-8 md:p-10 flex flex-col">
					{/* Category badge */}
					<div className="mb-4">
						<Skeleton className="h-6 w-24 rounded-full" />
					</div>

					{/* Title */}
					<Skeleton className="h-8 w-full mb-4" />
					<Skeleton className="h-8 w-3/4 mb-4" />

					{/* Excerpt */}
					<div className="flex-1 space-y-2 mb-6">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-5/6" />
					</div>

					{/* Meta & CTA */}
					<div className="flex items-center justify-between pt-6 border-t border-[#2F2F2F]/50">
						<div className="flex items-center gap-6">
							<Skeleton className="h-4 w-20" />
							<Skeleton className="h-4 w-24" />
						</div>
						<Skeleton className="h-5 w-5 rounded" />
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="relative overflow-hidden rounded-2xl bg-[#262626] border border-[#2F2F2F] h-full flex flex-col">
			{/* Image skeleton */}
			<Skeleton className="w-full h-64 md:h-72" />

			{/* Content */}
			<div className="flex-1 p-6 md:p-8 flex flex-col">
				{/* Category badge */}
				<div className="mb-4">
					<Skeleton className="h-5 w-20 rounded-full" />
				</div>

				{/* Title */}
				<Skeleton className="h-6 w-full mb-3" />
				<Skeleton className="h-6 w-4/5 mb-3" />

				{/* Excerpt */}
				<div className="flex-1 space-y-2 mb-6">
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-3/4" />
				</div>

				{/* Meta & CTA */}
				<div className="flex items-center justify-between pt-4 border-t border-[#2F2F2F]/50">
					<div className="flex items-center gap-4">
						<Skeleton className="h-3 w-16" />
						<Skeleton className="h-3 w-20" />
					</div>
					<Skeleton className="h-4 w-4 rounded" />
				</div>
			</div>
		</div>
	);
}
