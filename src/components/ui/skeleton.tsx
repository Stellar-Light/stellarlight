import { cn } from "@/lib/utils";

function Skeleton({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn("animate-pulse rounded-md bg-[#262626] border border-[#2F2F2F]", className)}
			{...props}
		/>
	);
}

export { Skeleton };

