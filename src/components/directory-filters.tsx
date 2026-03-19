"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, ChevronDown } from "lucide-react";
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

export function DirectoryFilters() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const searchQuery = searchParams.get("q") || "";
	const categoryFilter = searchParams.get("category") || "all";
	const [drawerOpen, setDrawerOpen] = useState(false);

	const handleCategoryChange = (value: string) => {
		const params = new URLSearchParams();
		if (searchQuery) {
			params.set("q", searchQuery);
		}
		if (value !== "all") {
			params.set("category", value);
		}
		router.push(`/directory?${params.toString()}`);
		setDrawerOpen(false);
	};

	const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.currentTarget);
		const params = new URLSearchParams();
		const query = formData.get("q") as string;
		if (query) {
			params.set("q", query);
		}
		if (categoryFilter !== "all") {
			params.set("category", categoryFilter);
		}
		router.push(`/directory?${params.toString()}`);
	};

	const selectedLabel = categories.find((c) => c.id === categoryFilter)?.label ?? "All Categories";

	return (
		<form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
			<div className="relative w-full md:max-w-[560px]">
				<Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
				<input
					type="text"
					name="q"
					placeholder="Search projects or organizations..."
					defaultValue={searchQuery}
					className="w-full h-11 pl-12 pr-4 bg-card text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border transition-all duration-150 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]"
				/>
			</div>

			{/* Desktop: DropdownMenu */}
			<div className="hidden md:block">
				<DropdownMenu>
					<DropdownMenuTrigger className="h-11 px-4 min-w-[180px] bg-card text-foreground border border-border rounded-xl hover:bg-white/5 transition-all duration-150 flex items-center gap-2 outline-none focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]">
						<span className="flex-1 text-left text-sm truncate">
							{selectedLabel}
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

			{/* Mobile: Vaul Drawer (drag to dismiss) */}
			<div className="md:hidden">
				<Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
					<DrawerTrigger asChild>
						<button
							type="button"
							className="w-full h-11 px-4 bg-card text-foreground border border-border rounded-xl hover:bg-white/5 transition-all duration-150 flex items-center gap-2 outline-none focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]"
						>
							<span className="flex-1 text-left text-sm truncate">
								{selectedLabel}
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
			</div>
		</form>
	);
}
