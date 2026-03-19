"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Select } from "@/components/ui/select";

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

	const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const params = new URLSearchParams();
		if (searchQuery) {
			params.set("q", searchQuery);
		}
		if (e.target.value !== "all") {
			params.set("category", e.target.value);
		}
		router.push(`/directory?${params.toString()}`);
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

			<Select
				name="category"
				value={categoryFilter}
				onChange={handleCategoryChange}
				className="h-11 min-w-[180px] bg-card text-foreground border border-border rounded-xl focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]"
			>
				{categories.map((category) => (
					<option key={category.id} value={category.id}>
						{category.label}
					</option>
				))}
			</Select>
		</form>
	);
}

