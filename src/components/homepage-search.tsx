"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

export function HomepageSearch() {
	const router = useRouter();
	const [searchQuery, setSearchQuery] = useState("");
	const [categoryFilter, setCategoryFilter] = useState("all");

	const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const params = new URLSearchParams();
		if (searchQuery) {
			params.set("q", searchQuery);
		}
		if (categoryFilter !== "all") {
			params.set("category", categoryFilter);
		}
		router.push(`/directory?${params.toString()}`);
	};

	const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		setCategoryFilter(e.target.value);
		const params = new URLSearchParams();
		if (searchQuery) {
			params.set("q", searchQuery);
		}
		if (e.target.value !== "all") {
			params.set("category", e.target.value);
		}
		router.push(`/directory?${params.toString()}`);
	};

	return (
		<form
			onSubmit={handleSearchSubmit}
			className="flex flex-col md:flex-row gap-4 items-stretch md:items-center"
		>
			<div className="relative w-full md:max-w-[600px]">
				<Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
				<input
					type="text"
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder="Search projects or organizations..."
					className="w-full h-12 pl-12 pr-4 bg-card text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border transition-all duration-200 focus-visible:outline-none focus-visible:border-white/30 focus-visible:shadow-[0_0_0_3px_rgba(253,218,36,0.1)]"
				/>
			</div>

			<Select
				value={categoryFilter}
				onChange={handleCategoryChange}
				className="h-12 min-w-[200px] bg-card text-foreground border border-border rounded-xl focus-visible:outline-none focus-visible:border-white/30 focus-visible:shadow-[0_0_0_3px_rgba(253,218,36,0.1)]"
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
