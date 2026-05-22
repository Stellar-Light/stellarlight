"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ArrowUpDown, Calendar, Tag } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
	Drawer,
	DrawerTrigger,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerDescription,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

interface Option {
	value: string;
	label: string;
}

interface Props {
	sort: string;
	range: string;
	category: string | null;
	sortOptions: Option[];
	rangeOptions: Option[];
	categoryOptions: Option[];
}

const btnBase =
	"h-11 px-4 inline-flex items-center justify-between gap-2 rounded-xl bg-card border border-border/50 text-foreground hover:bg-white/[0.04] transition-colors";

export function LeaderboardFilters({
	sort,
	range,
	category,
	sortOptions,
	rangeOptions,
	categoryOptions,
}: Props) {
	const router = useRouter();
	const [sortDrawerOpen, setSortDrawerOpen] = useState(false);
	const [rangeDrawerOpen, setRangeDrawerOpen] = useState(false);
	const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);

	const sortLabel =
		sortOptions.find((o) => o.value === sort)?.label ?? sortOptions[0].label;
	const rangeLabel =
		rangeOptions.find((o) => o.value === range)?.label ?? rangeOptions[0].label;
	const categoryLabel =
		category && categoryOptions.find((o) => o.value === category)?.label
			? (categoryOptions.find((o) => o.value === category) as Option).label
			: "All categories";

	const navigate = (next: { sort?: string; range?: string; category?: string | null }) => {
		const sp = new URLSearchParams();
		const finalSort = next.sort ?? sort;
		const finalRange = next.range ?? range;
		const finalCategory =
			next.category === undefined ? category : next.category;
		if (finalSort !== "activity") sp.set("sort", finalSort);
		if (finalRange !== "all") sp.set("range", finalRange);
		if (finalCategory && finalCategory !== "all") sp.set("category", finalCategory);
		const qs = sp.toString();
		router.push(qs ? `/leaderboard?${qs}` : "/leaderboard");
		router.refresh();
	};

	const handleSort = (v: string) => {
		setSortDrawerOpen(false);
		navigate({ sort: v });
	};
	const handleRange = (v: string) => {
		setRangeDrawerOpen(false);
		navigate({ range: v });
	};
	const handleCategory = (v: string | null) => {
		setCategoryDrawerOpen(false);
		navigate({ category: v });
	};

	return (
		<div className="flex flex-col gap-3 mb-6">
			{/* Desktop: inline dropdowns */}
			<div className="hidden md:flex md:items-center md:gap-3">
				{/* Sort */}
				<DropdownMenu>
					<DropdownMenuTrigger className={cn(btnBase, "min-w-[170px]")}>
						<ArrowUpDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
						<span className="flex-1 text-left text-sm truncate">{sortLabel}</span>
						<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-[180px]">
						{sortOptions.map((o) => (
							<DropdownMenuItem
								key={o.value}
								onClick={() => handleSort(o.value)}
								className={
									sort === o.value
										? "bg-white/10 text-foreground"
										: "text-foreground hover:bg-white/5"
								}
							>
								{o.label}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>

				{/* Range */}
				<DropdownMenu>
					<DropdownMenuTrigger className={cn(btnBase, "min-w-[150px]")}>
						<Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
						<span className="flex-1 text-left text-sm truncate">{rangeLabel}</span>
						<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-[160px]">
						{rangeOptions.map((o) => (
							<DropdownMenuItem
								key={o.value}
								onClick={() => handleRange(o.value)}
								className={
									range === o.value
										? "bg-white/10 text-foreground"
										: "text-foreground hover:bg-white/5"
								}
							>
								{o.label}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>

				{/* Category */}
				<DropdownMenu>
					<DropdownMenuTrigger className={cn(btnBase, "min-w-[180px]")}>
						<Tag className="w-4 h-4 text-muted-foreground flex-shrink-0" />
						<span className="flex-1 text-left text-sm truncate">{categoryLabel}</span>
						<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-[200px] max-h-[400px] overflow-y-auto">
						<DropdownMenuItem
							onClick={() => handleCategory(null)}
							className={
								!category
									? "bg-white/10 text-foreground"
									: "text-foreground hover:bg-white/5"
							}
						>
							All categories
						</DropdownMenuItem>
						{categoryOptions
							.filter((o) => o.value !== "all")
							.map((o) => (
								<DropdownMenuItem
									key={o.value}
									onClick={() => handleCategory(o.value)}
									className={
										category === o.value
											? "bg-white/10 text-foreground"
											: "text-foreground hover:bg-white/5"
									}
								>
									{o.label}
								</DropdownMenuItem>
							))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Mobile: drawer triggers, 2-up grid */}
			<div className="md:hidden grid grid-cols-2 gap-2">
				<Drawer open={sortDrawerOpen} onOpenChange={setSortDrawerOpen}>
					<DrawerTrigger asChild>
						<button type="button" className={cn(btnBase, "w-full")}>
							<ArrowUpDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
							<span className="flex-1 text-left text-sm truncate">{sortLabel}</span>
							<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
						</button>
					</DrawerTrigger>
					<DrawerContent>
						<DrawerHeader>
							<DrawerTitle>Sort by</DrawerTitle>
							<DrawerDescription>Choose how to sort projects</DrawerDescription>
						</DrawerHeader>
						<div className="space-y-1 px-4 pb-6 max-h-[60vh] overflow-y-auto">
							{sortOptions.map((o) => (
								<button
									key={o.value}
									type="button"
									onClick={() => handleSort(o.value)}
									className={cn(
										"w-full text-left px-4 py-3 rounded-lg text-sm transition-colors",
										sort === o.value
											? "bg-white/10 text-foreground"
											: "text-foreground hover:bg-white/5",
									)}
								>
									{o.label}
								</button>
							))}
						</div>
					</DrawerContent>
				</Drawer>

				<Drawer open={rangeDrawerOpen} onOpenChange={setRangeDrawerOpen}>
					<DrawerTrigger asChild>
						<button type="button" className={cn(btnBase, "w-full")}>
							<Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
							<span className="flex-1 text-left text-sm truncate">{rangeLabel}</span>
							<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
						</button>
					</DrawerTrigger>
					<DrawerContent>
						<DrawerHeader>
							<DrawerTitle>Time range</DrawerTitle>
							<DrawerDescription>Filter by recent activity window</DrawerDescription>
						</DrawerHeader>
						<div className="space-y-1 px-4 pb-6 max-h-[60vh] overflow-y-auto">
							{rangeOptions.map((o) => (
								<button
									key={o.value}
									type="button"
									onClick={() => handleRange(o.value)}
									className={cn(
										"w-full text-left px-4 py-3 rounded-lg text-sm transition-colors",
										range === o.value
											? "bg-white/10 text-foreground"
											: "text-foreground hover:bg-white/5",
									)}
								>
									{o.label}
								</button>
							))}
						</div>
					</DrawerContent>
				</Drawer>

				<Drawer open={categoryDrawerOpen} onOpenChange={setCategoryDrawerOpen}>
					<DrawerTrigger asChild>
						<button
							type="button"
							className={cn(btnBase, "w-full col-span-2")}
						>
							<Tag className="w-4 h-4 text-muted-foreground flex-shrink-0" />
							<span className="flex-1 text-left text-sm truncate">
								{categoryLabel}
							</span>
							<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
						</button>
					</DrawerTrigger>
					<DrawerContent>
						<DrawerHeader>
							<DrawerTitle>Category</DrawerTitle>
							<DrawerDescription>Filter projects by category</DrawerDescription>
						</DrawerHeader>
						<div className="space-y-1 px-4 pb-6 max-h-[60vh] overflow-y-auto">
							<button
								type="button"
								onClick={() => handleCategory(null)}
								className={cn(
									"w-full text-left px-4 py-3 rounded-lg text-sm transition-colors",
									!category
										? "bg-white/10 text-foreground"
										: "text-foreground hover:bg-white/5",
								)}
							>
								All categories
							</button>
							{categoryOptions
								.filter((o) => o.value !== "all")
								.map((o) => (
									<button
										key={o.value}
										type="button"
										onClick={() => handleCategory(o.value)}
										className={cn(
											"w-full text-left px-4 py-3 rounded-lg text-sm transition-colors",
											category === o.value
												? "bg-white/10 text-foreground"
												: "text-foreground hover:bg-white/5",
										)}
									>
										{o.label}
									</button>
								))}
						</div>
					</DrawerContent>
				</Drawer>
			</div>
		</div>
	);
}
