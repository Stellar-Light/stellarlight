"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useDebounce } from "@/lib/hooks/use-debounce";

export function EntitiesSearch() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const searchQuery = searchParams.get("q") || "";
	const [inputValue, setInputValue] = useState(searchQuery);
	const debouncedSearch = useDebounce(inputValue, 300);

	const buildUrl = useCallback(
		(q: string) => {
			const params = new URLSearchParams();
			if (q) params.set("q", q);
			return `/entities?${params.toString()}`;
		},
		[],
	);

	useEffect(() => {
		if (debouncedSearch !== searchQuery) {
			router.replace(buildUrl(debouncedSearch));
		}
	}, [debouncedSearch, searchQuery, router, buildUrl]);

	// Instant reset when input is cleared
	useEffect(() => {
		if (inputValue === "" && searchQuery !== "") {
			router.replace(buildUrl(""));
		}
	}, [inputValue, searchQuery, router, buildUrl]);

	useEffect(() => {
		setInputValue(searchQuery);
	}, [searchQuery]);

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		router.replace(buildUrl(inputValue));
	};

	return (
		<form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
			<div className="relative w-full md:max-w-[560px]">
				<Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
				<input
					type="text"
					name="q"
					placeholder="Search entities..."
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
					className="w-full h-11 pl-12 pr-4 bg-card text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border transition-all duration-150 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]"
				/>
			</div>
		</form>
	);
}
