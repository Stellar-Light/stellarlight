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

const projectTypes = [
	{ id: "all", label: "All Types" },
	{ id: "Wallet", label: "Wallet" },
	{ id: "DEX", label: "DEX" },
	{ id: "Lending", label: "Lending" },
	{ id: "Bridge", label: "Bridge" },
	{ id: "Payments", label: "Payments" },
	{ id: "Anchor", label: "Anchor" },
	{ id: "SDK", label: "SDK" },
	{ id: "Indexer", label: "Indexer" },
	{ id: "Explorer", label: "Explorer" },
	{ id: "Analytics", label: "Analytics" },
	{ id: "AI", label: "AI" },
	{ id: "Gaming", label: "Gaming" },
	{ id: "Education", label: "Education" },
	{ id: "Security", label: "Security" },
	{ id: "NFT", label: "NFT" },
	{ id: "RWA", label: "RWA" },
	{ id: "Stablecoin", label: "Stablecoin" },
	{ id: "Social Impact", label: "Social Impact" },
];

const sortOptions = [
	{ id: "featured", label: "Relevant" },
	{ id: "name-asc", label: "Name (A–Z)" },
	{ id: "name-desc", label: "Name (Z–A)" },
	{ id: "newest", label: "Newest" },
];

export function DirectoryFilters() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const searchQuery = searchParams.get("q") || "";
	const typeFilter = searchParams.get("type") || "all";
	const sortFilter = searchParams.get("sort") || "featured";
	const [typeDrawerOpen, setTypeDrawerOpen] = useState(false);
	const [sortDrawerOpen, setSortDrawerOpen] = useState(false);
	const [inputValue, setInputValue] = useState(searchQuery);
	const debouncedSearch = useDebounce(inputValue, 300);

	const buildUrl = useCallback((overrides: Record<string, string>) => {
		const params = new URLSearchParams();
		const q = overrides.q ?? searchQuery;
		const typ = overrides.type ?? typeFilter;
		const sort = overrides.sort ?? sortFilter;
		if (q) params.set("q", q);
		if (typ !== "all") params.set("type", typ);
		if (sort !== "featured") params.set("sort", sort);
		const qs = params.toString();
		return qs ? `/directory?${qs}` : "/directory";
	}, [searchQuery, typeFilter, sortFilter]);

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

	const handleTypeChange = (value: string) => {
		router.push(buildUrl({ type: value }));
		setTypeDrawerOpen(false);
	};

	const handleSortChange = (value: string) => {
		router.push(buildUrl({ sort: value }));
		setSortDrawerOpen(false);
	};

	const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		router.replace(buildUrl({ q: inputValue }));
	};

	const selectedTypeLabel = projectTypes.find((t) => t.id === typeFilter)?.label ?? "All Types";
	const selectedSortLabel = sortOptions.find((s) => s.id === sortFilter)?.label ?? "Relevant";

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

			{/* Desktop: Type Dropdown */}
			<div className="hidden md:block">
				<DropdownMenu>
					<DropdownMenuTrigger className="h-11 px-4 min-w-[150px] bg-card text-foreground border border-border rounded-xl hover:bg-white/5 transition-all duration-150 flex items-center gap-2 outline-none focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]">
						<span className="flex-1 text-left text-sm truncate">
							{selectedTypeLabel}
						</span>
						<ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-[180px]">
						{projectTypes.map((type) => (
							<DropdownMenuItem
								key={type.id}
								onClick={() => handleTypeChange(type.id)}
								className={
									typeFilter === type.id
										? "bg-white/10 text-foreground"
										: "text-foreground hover:bg-white/5"
								}
							>
								{type.label}
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

			{/* Mobile: Type + Sort Drawers */}
			<div className="md:hidden flex gap-3">
				<Drawer open={typeDrawerOpen} onOpenChange={setTypeDrawerOpen}>
					<DrawerTrigger asChild>
						<button
							type="button"
							className="flex-1 h-11 px-4 bg-card text-foreground border border-border rounded-xl hover:bg-white/5 transition-all duration-150 flex items-center gap-2 outline-none focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]"
						>
							<span className="flex-1 text-left text-sm truncate">
								{selectedTypeLabel}
							</span>
							<ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
						</button>
					</DrawerTrigger>
					<DrawerContent>
						<DrawerHeader>
							<DrawerTitle>Type</DrawerTitle>
							<DrawerDescription>Filter projects by type</DrawerDescription>
						</DrawerHeader>
						<div className="mt-4 space-y-1 pb-4">
							{projectTypes.map((type) => (
								<button
									key={type.id}
									type="button"
									onClick={() => handleTypeChange(type.id)}
									className={cn(
										"w-full text-left px-3 py-3 rounded-xl text-sm transition-all duration-150",
										typeFilter === type.id
											? "bg-[#262626] text-[#E5E5E5]"
											: "text-[#A3A3A3] hover:bg-[#222222] hover:text-[#E5E5E5]",
									)}
								>
									{type.label}
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
