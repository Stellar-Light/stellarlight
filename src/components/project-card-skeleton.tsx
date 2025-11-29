import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectCardSkeleton() {
	return (
		<div className="idea-card rounded-xl p-6 flex flex-col h-full min-h-[200px]">
			{/* Badge skeleton */}
			<div className="flex justify-end mb-4">
				<Skeleton className="h-6 w-20 rounded-full" />
			</div>

			{/* Logo and title skeleton */}
			<div className="flex items-center gap-3 mb-4">
				<Skeleton className="w-[52px] h-[52px] rounded-full flex-shrink-0" />
				<Skeleton className="h-5 w-32" />
			</div>

			{/* Description skeleton */}
			<div className="flex-1 mb-5 space-y-2">
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-5/6" />
				<Skeleton className="h-4 w-4/6" />
			</div>

			{/* Footer skeleton */}
			<div className="flex items-center justify-between pt-4 border-t border-[#2F2F2F]">
				<Skeleton className="h-4 w-24" />
				<Skeleton className="h-5 w-5 rounded" />
			</div>
		</div>
	);
}

