"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export interface FilterOption {
	value: string;
	label: string;
}

interface Props {
	paramKey: string;
	current: string | null;
	options: FilterOption[];
	buttonLabel: string;
	preserve: Record<string, string | undefined>;
}

/**
 * Client-side filter dropdown for the hackathons page.
 * - Single dropdown open at a time (closes siblings via document click)
 * - Closes on outside click + Escape key
 * - Each option is a Link so navigation stays server-driven
 */
export function HackathonsFilterDropdown({
	paramKey,
	current,
	options,
	buttonLabel,
	preserve,
}: Props) {
	const [open, setOpen] = useState(false);
	const wrapperRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onClick = (e: MouseEvent) => {
			if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onClick);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onClick);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const buildHref = (value: string) => {
		const sp = new URLSearchParams();
		for (const [k, v] of Object.entries(preserve)) {
			if (v) sp.set(k, v);
		}
		if (value !== "all") sp.set(paramKey, value);
		const qs = sp.toString();
		return qs ? `/hackathons?${qs}` : "/hackathons";
	};

	return (
		<div ref={wrapperRef} className="relative inline-block">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="listbox"
				aria-expanded={open}
				className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/50 bg-card hover:bg-white/[0.04] text-sm text-foreground transition-colors"
			>
				{buttonLabel}
				<ChevronDown
					className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
				/>
			</button>
			{open && (
				<div
					role="listbox"
					className="absolute z-20 mt-1 min-w-[180px] rounded-lg border border-border bg-card shadow-lg overflow-hidden max-h-72 overflow-y-auto"
				>
					{options.map((opt) => {
						const isCurrent =
							(opt.value === "all" && !current) || opt.value === current;
						return (
							<Link
								key={opt.value}
								href={buildHref(opt.value)}
								className={`block px-3 py-2 text-sm transition-colors ${
									isCurrent
										? "bg-white/10 text-foreground"
										: "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
								}`}
							>
								{opt.label}
							</Link>
						);
					})}
				</div>
			)}
		</div>
	);
}
