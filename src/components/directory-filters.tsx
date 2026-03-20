"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, ChevronDown, ArrowUpDown, X } from "lucide-react";
import { useDebounce } from "@/lib/hooks/use-debounce";
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

const categories = [
	{ id: "all", label: "All Categories" },
	{ id: "Infrastructure", label: "Infrastructure" },
	{ id: "Tooling", label: "Tooling" },
	{ id: "Partner Integration", label: "Partner Integration" },
	{ id: "User-Facing App", label: "User-Facing App" },
	{ id: "Asset", label: "Asset" },
	{ id: "Protocol/Contract", label: "Protocol/Contract" },
	{ id: "Anchor", label: "Anchor" },
];

const sortOptions = [
	{ id: "featured", label: "Featured" },
	{ id: "name-asc", label: "Name (A–Z)" },
	{ id: "name-desc", label: "Name (Z–A)" },
	{ id: "newest", label: "Newest" },
];

export function DirectoryFilters() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const searchQuery = searchParams.get("q") || "";
	const categoryFilter = searchParams.get("category") || "all";
	const sortFilter = searchParams.get("sort") || "featured";
	const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
	const [sortDrawerOpen, setSortDrawerOpen] = useState(false);
	const [inputValue, setInputValue] = useState(searchQuery);
	const debouncedSearch = useDebounce(inputValue, 300);

	const buildUrl = useCallback((overrides: Record<string, string>) => {
		const params = new URLSearchParams();
		const q = overrides.q ?? searchQuery;
		const cat = overrides.category ?? categoryFilter;
		const sort = overrides.sort ?? sortFilter;
		if (q) params.set("q", q);
		if (cat !== "all") params.set("category", cat);
		if (sort !== "featured") params.set("sort", sort);
		return `/directory?${params.toString()}`;
	}, [searchQuery, categoryFilter, sortFilter]);

	// Single effect for search-as-you-type
	useEffect(() => {
		// Skip if URL already matches what we'd navigate to
		if (debouncedSearch === searchQuery) return;
		router.replace(buildUrl({ q: debouncedSearch }));
	}, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

	// Sync input with URL when navigating back/forward
	useEffect(() => {
		setInputValue(searchQuery);
	}, [searchQuery]);

	const clearSearch = () => {
		setInputValue("");
		router.replace(buildUrl({ q: "" }));
	};

	const handleCategoryChange = (value: string) => {
		router.push(buildUrl({ category: value }));
		setCategoryDrawerOpen(false);
	};

	const handleSortChange = (value: string) => {
		router.push(buildUrl({ sort: value }));
		setSortDrawerOpen(false);
	};

	const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		router.replace(buildUrl({ q: inputValue }));
	};

	const selectedCategoryLabel = categories.find((c) => c.id === categoryFilter)?.label ?? "All Categories";
	const selectedSortLabel = sortOptions.find((s) => s.id === sortFilter)?.label ?? "Featured";

	return (
		<form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
			<div className="relative w-full md:max-w-[560px]">
				<Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
				<input
					type="text"
					name="q"
					placeholder="Search projects or organizations..."
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
					className="w-full h-11 pl-12 pr-10 bg-card text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border transition-all duration-150 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]"
				/>
				{inputValue && (
					<button
						type="button"
						onClick={clearSearch}
						className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground transition-colors duration-150"
					>
						<X className="w-4 h-4" />
					</button>
				)}
			</div>

			{/* Desktop: Category Dropdown */}
			<div className="hidden md:block">
				<DropdownMenu>
					<DropdownMenuTrigger className="h-11 px-4 min-w-[180px] bg-card text-foreground border border-border rounded-xl hover:bg-white/5 transition-all duration-150 flex items-center gap-2 outline-none focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]">
						<span className="flex-1 text-left text-sm truncate">
							{selectedCategoryLabel}
						</span>
						<ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-[200px]">
						{categories.map((category) => (
							<DropdownMenuItem
								key={category.id}
								onClick={() => handleCategoryChange(category.id)}
								className={
									categoryFilter === category.id
										? "bg-white/10 text-foreground"
										: "text-foreground hover:bg-white/5"
								}
							>
								{category.label}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Desktop: Sort Dropdown */}
			<div className="hidden md:block">
				<DropdownMenu>
					<DropdownMenuTrigger className="h-11 px-4 min-w-[150px] bg-card text-foreground border border-border rounded-xl hover:bg-white/5 transition-all duration-150 flex items-center gap-2 outline-none focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]">
						<ArrowUpDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
						<span className="flex-1 text-left text-sm truncate">
							{selectedSortLabel}
						</span>
						<ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-[180px]">
						{sortOptions.map((option) => (
							<DropdownMenuItem
								key={option.id}
								onClick={() => handleSortChange(option.id)}
								className={
									sortFilter === option.id
										? "bg-white/10 text-foreground"
										: "text-foreground hover:bg-white/5"
								}
							>
								{option.label}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Mobile: Category + Sort Drawers */}
			<div className="md:hidden flex gap-3">
				<Drawer open={categoryDrawerOpen} onOpenChange={setCategoryDrawerOpen}>
					<DrawerTrigger asChild>
						<button
							type="button"
							className="flex-1 h-11 px-4 bg-card text-foreground border border-border rounded-xl hover:bg-white/5 transition-all duration-150 flex items-center gap-2 outline-none focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]"
						>
							<span className="flex-1 text-left text-sm truncate">
								{selectedCategoryLabel}
							</span>
							<ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
						</button>
					</DrawerTrigger>
					<DrawerContent>
						<DrawerHeader>
							<DrawerTitle>Category</DrawerTitle>
							<DrawerDescription>Filter projects by category</DrawerDescription>
						</DrawerHeader>
						<div className="mt-4 space-y-1 pb-4">
							{categories.map((category) => (
								<button
									key={category.id}
									type="button"
									onClick={() => handleCategoryChange(category.id)}
									className={cn(
										"w-full text-left px-3 py-3 rounded-xl text-sm transition-all duration-150",
										categoryFilter === category.id
											? "bg-[#262626] text-[#E5E5E5]"
											: "text-[#A3A3A3] hover:bg-[#222222] hover:text-[#E5E5E5]",
									)}
								>
									{category.label}
								</button>
							))}
						</div>
					</DrawerContent>
				</Drawer>

				<Drawer open={sortDrawerOpen} onOpenChange={setSortDrawerOpen}>
					<DrawerTrigger asChild>
						<button
							type="button"
							className="h-11 px-4 bg-card text-foreground border border-border rounded-xl hover:bg-white/5 transition-all duration-150 flex items-center gap-2 outline-none focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]"
						>
							<ArrowUpDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
							<span className="text-sm truncate">{selectedSortLabel}</span>
						</button>
					</DrawerTrigger>
					<DrawerContent>
						<DrawerHeader>
							<DrawerTitle>Sort by</DrawerTitle>
							<DrawerDescription>Choose how to sort projects</DrawerDescription>
						</DrawerHeader>
						<div className="mt-4 space-y-1 pb-4">
							{sortOptions.map((option) => (
								<button
									key={option.id}
									type="button"
									onClick={() => handleSortChange(option.id)}
									className={cn(
										"w-full text-left px-3 py-3 rounded-xl text-sm transition-all duration-150",
										sortFilter === option.id
											? "bg-[#262626] text-[#E5E5E5]"
											: "text-[#A3A3A3] hover:bg-[#222222] hover:text-[#E5E5E5]",
									)}
								>
									{option.label}
								</button>
							))}
						</div>
					</DrawerContent>
				</Drawer>
			</div>
		</form>
	);
}
