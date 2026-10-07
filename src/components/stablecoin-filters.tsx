"use client";

/**
 * Peg + sort controls for /stablecoins. Same idiom as LeaderboardFilters —
 * URL params drive a server re-render, dropdowns on desktop, drawers on
 * mobile — so the page stays shareable and server-rendered.
 */

import { ArrowUpDown, ChevronDown, Coins } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Option {
	value: string;
	label: string;
}

interface Props {
	sort: string;
	peg: string | null;
	sortOptions: Option[];
	pegOptions: Option[];
}

const btnBase =
	"h-11 px-4 inline-flex items-center justify-between gap-2 rounded-xl bg-card border border-border/50 text-foreground hover:bg-white/[0.04] transition-colors";

export function StablecoinFilters({
	sort,
	peg,
	sortOptions,
	pegOptions,
}: Props) {
	const router = useRouter();
	const [sortOpen, setSortOpen] = useState(false);
	const [pegOpen, setPegOpen] = useState(false);

	const sortLabel =
		sortOptions.find((o) => o.value === sort)?.label ?? sortOptions[0].label;
	const pegLabel = peg
		? (pegOptions.find((o) => o.value === peg)?.label ?? peg)
		: "All currencies";

	const navigate = (next: { sort?: string; peg?: string | null }) => {
		const sp = new URLSearchParams();
		const finalSort = next.sort ?? sort;
		const finalPeg = next.peg === undefined ? peg : next.peg;
		if (finalSort !== "marketcap") sp.set("sort", finalSort);
		if (finalPeg) sp.set("peg", finalPeg);
		const qs = sp.toString();
		router.push(qs ? `/stablecoins?${qs}` : "/stablecoins");
		router.refresh();
	};

	const handleSort = (v: string) => {
		setSortOpen(false);
		navigate({ sort: v });
	};
	const handlePeg = (v: string | null) => {
		setPegOpen(false);
		navigate({ peg: v });
	};

	return (
		<div className="flex flex-col gap-3 mb-6">
			<div className="hidden md:flex md:items-center md:gap-3">
				<DropdownMenu>
					<DropdownMenuTrigger className={cn(btnBase, "min-w-[190px]")}>
						<ArrowUpDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
						<span className="flex-1 text-left text-sm truncate">
							{sortLabel}
						</span>
						<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-[210px]">
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

				<DropdownMenu>
					<DropdownMenuTrigger className={cn(btnBase, "min-w-[180px]")}>
						<Coins className="w-4 h-4 text-muted-foreground flex-shrink-0" />
						<span className="flex-1 text-left text-sm truncate">
							{pegLabel}
						</span>
						<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-[200px] max-h-[400px] overflow-y-auto">
						<DropdownMenuItem
							onClick={() => handlePeg(null)}
							className={
								!peg
									? "bg-white/10 text-foreground"
									: "text-foreground hover:bg-white/5"
							}
						>
							All currencies
						</DropdownMenuItem>
						{pegOptions.map((o) => (
							<DropdownMenuItem
								key={o.value}
								onClick={() => handlePeg(o.value)}
								className={
									peg === o.value
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

			<div className="md:hidden grid grid-cols-2 gap-2">
				<Drawer open={sortOpen} onOpenChange={setSortOpen}>
					<DrawerTrigger asChild>
						<button type="button" className={cn(btnBase, "w-full")}>
							<ArrowUpDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
							<span className="flex-1 text-left text-sm truncate">
								{sortLabel}
							</span>
							<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
						</button>
					</DrawerTrigger>
					<DrawerContent>
						<DrawerHeader>
							<DrawerTitle>Sort by</DrawerTitle>
							<DrawerDescription>
								Market cap is the only order comparable across currencies
							</DrawerDescription>
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

				<Drawer open={pegOpen} onOpenChange={setPegOpen}>
					<DrawerTrigger asChild>
						<button type="button" className={cn(btnBase, "w-full")}>
							<Coins className="w-4 h-4 text-muted-foreground flex-shrink-0" />
							<span className="flex-1 text-left text-sm truncate">
								{pegLabel}
							</span>
							<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
						</button>
					</DrawerTrigger>
					<DrawerContent>
						<DrawerHeader>
							<DrawerTitle>Currency</DrawerTitle>
							<DrawerDescription>
								Filter by the fiat pegged to
							</DrawerDescription>
						</DrawerHeader>
						<div className="space-y-1 px-4 pb-6 max-h-[60vh] overflow-y-auto">
							<button
								type="button"
								onClick={() => handlePeg(null)}
								className={cn(
									"w-full text-left px-4 py-3 rounded-lg text-sm transition-colors",
									!peg
										? "bg-white/10 text-foreground"
										: "text-foreground hover:bg-white/5",
								)}
							>
								All currencies
							</button>
							{pegOptions.map((o) => (
								<button
									key={o.value}
									type="button"
									onClick={() => handlePeg(o.value)}
									className={cn(
										"w-full text-left px-4 py-3 rounded-lg text-sm transition-colors",
										peg === o.value
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
