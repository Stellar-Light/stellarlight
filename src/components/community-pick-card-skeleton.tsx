import { Skeleton } from "@/components/ui/skeleton";

export default function CommunityPickCardSkeleton() {
	return (
		<div className="idea-card rounded-xl p-4 flex flex-col h-full">
			{/* Logo and name skeleton */}
			<div className="flex items-center gap-3 mb-3">
				<Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
				<Skeleton className="h-4 w-24" />
			</div>

			{/* Description skeleton */}
			<div className="flex-1 mb-3 space-y-1.5">
				<Skeleton className="h-3 w-full" />
				<Skeleton className="h-3 w-5/6" />
			</div>

			{/* X handle skeleton */}
			<div className="flex items-center gap-1.5 pt-2 border-t border-[#2F2F2F]/50">
				<Skeleton className="h-3 w-3 rounded" />
				<Skeleton className="h-3 w-16" />
			</div>
		</div>
	);
}

