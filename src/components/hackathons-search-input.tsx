"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

/**
 * Lightweight search input for the hackathons listing. Pushes ?q= into
 * the URL with a small debounce so each keystroke doesn't navigate.
 */
export function HackathonsSearchInput({ initial = "" }: { initial?: string }) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [value, setValue] = useState(initial);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Keep input in sync when the URL changes externally (e.g. clear-all link).
	useEffect(() => {
		const fromUrl = searchParams.get("q") ?? "";
		setValue(fromUrl);
	}, [searchParams]);

	const push = (next: string) => {
		const sp = new URLSearchParams(searchParams.toString());
		if (next) sp.set("q", next);
		else sp.delete("q");
		const qs = sp.toString();
		router.replace(qs ? `/hackathons?${qs}` : "/hackathons", { scroll: false });
	};

	const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const next = e.target.value;
		setValue(next);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => push(next), 250);
	};

	const clear = () => {
		setValue("");
		if (debounceRef.current) clearTimeout(debounceRef.current);
		push("");
	};

	return (
		<div className="relative w-full sm:max-w-xs">
			<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
			<input
				type="text"
				value={value}
				onChange={onChange}
				placeholder="Search past hackathons…"
				className="w-full h-9 pl-9 pr-9 bg-card text-sm text-foreground placeholder:text-muted-foreground rounded-lg border border-border/50 focus:outline-none focus:ring-2 focus:ring-ring transition-all"
			/>
			{value && (
				<button
					type="button"
					onClick={clear}
					aria-label="Clear search"
					className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/[0.06] text-muted-foreground hover:text-foreground transition-colors"
				>
					<X className="w-3.5 h-3.5" />
				</button>
			)}
		</div>
	);
}
