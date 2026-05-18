"use client";

import { useState, useEffect, useCallback } from "react";
import { Trophy, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	type CarouselApi,
} from "@/components/ui/carousel";
import {
	LATEST_WINNERS,
	getWinnerLink,
	type RecentWinner,
} from "@/data/recent-hackathon-winners";

function placementBadgeClasses(rank: number): string {
	if (rank === 1) return "bg-[#FDDA24] text-[#171717] border-[#FDDA24]";
	if (rank === 2) return "bg-zinc-300/15 text-zinc-200 border-zinc-300/30";
	if (rank === 3) return "bg-amber-700/20 text-amber-400 border-amber-700/40";
	return "bg-white/5 text-muted-foreground border-border/50";
}

function WinnerCard({ winner }: { winner: RecentWinner }) {
	const href = getWinnerLink(winner);

	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="group h-full flex flex-col rounded-2xl border border-border/50 hover:border-border bg-card p-5 transition-colors no-underline"
		>
			<div className="flex items-start justify-between gap-3 mb-3">
				<div className="min-w-0 flex-1">
					<h3 className="text-base font-semibold text-foreground group-hover:text-white transition-colors leading-tight truncate">
						{winner.projectName}
					</h3>
					<p className="text-xs text-muted-foreground mt-0.5 truncate">
						by{" "}
						{winner.builderPassportUrl ? (
							<a
								href={winner.builderPassportUrl}
								target="_blank"
								rel="noopener noreferrer"
								onClick={(e) => e.stopPropagation()}
								className="text-foreground hover:text-white hover:underline underline-offset-2"
							>
								{winner.builder}
							</a>
						) : (
							<span className="text-foreground/80">{winner.builder}</span>
						)}
					</p>
				</div>
				<span
					className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border flex-shrink-0 ${placementBadgeClasses(winner.rank)}`}
				>
					{winner.placementLabel}
				</span>
			</div>

			<p className="text-sm text-muted-foreground line-clamp-3 mb-3 flex-1">
				{winner.description}
			</p>

			<div className="pt-3 border-t border-border/50 flex items-center justify-between">
				<span className="inline-flex items-center gap-1.5 text-sm text-foreground font-semibold">
					<Trophy className="w-3.5 h-3.5 text-[#FDDA24]" />$
					{winner.prizeUsd.toLocaleString()}
				</span>
				<span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors inline-flex items-center gap-1">
					DoraHacks
					<ArrowUpRight className="w-3 h-3" />
				</span>
			</div>
		</a>
	);
}

export function RecentWinnersCarousel() {
	const [api, setApi] = useState<CarouselApi | undefined>();
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
	const [canPrev, setCanPrev] = useState(false);
	const [canNext, setCanNext] = useState(false);

	const onSelect = useCallback((api: CarouselApi) => {
		if (!api) return;
		setSelectedIndex(api.selectedScrollSnap());
		setCanPrev(api.canScrollPrev());
		setCanNext(api.canScrollNext());
	}, []);

	useEffect(() => {
		if (!api) return;
		setScrollSnaps(api.scrollSnapList());
		onSelect(api);
		api.on("select", onSelect);
		api.on("reInit", onSelect);
	}, [api, onSelect]);

	return (
		<section className="mb-12">
			{/* Header */}
			<div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
				<div>
					<h2 className="text-2xl font-bold text-foreground tracking-tight">
						Recent Winners
					</h2>
					<p className="text-sm text-muted-foreground mt-1">
						{LATEST_WINNERS.hackathonName}
					</p>
				</div>
				<div className="flex items-center gap-3 mt-1">
					<a
						href={`https://dorahacks.io/hackathon/${LATEST_WINNERS.hackathonUname}/winner`}
						target="_blank"
						rel="noopener noreferrer"
						className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
					>
						See all on DoraHacks
						<ArrowUpRight className="w-3.5 h-3.5" />
					</a>
					<div className="flex items-center gap-1.5 ml-2">
						<button
							type="button"
							onClick={() => api?.scrollPrev()}
							disabled={!canPrev}
							aria-label="Previous winners"
							className="w-8 h-8 rounded-full border border-border/50 bg-card text-muted-foreground hover:text-foreground hover:border-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center"
						>
							<ChevronLeft className="w-4 h-4" />
						</button>
						<button
							type="button"
							onClick={() => api?.scrollNext()}
							disabled={!canNext}
							aria-label="Next winners"
							className="w-8 h-8 rounded-full border border-border/50 bg-card text-muted-foreground hover:text-foreground hover:border-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center"
						>
							<ChevronRight className="w-4 h-4" />
						</button>
					</div>
				</div>
			</div>

			{/* Carousel */}
			<Carousel
				opts={{ align: "start", loop: false }}
				setApi={setApi}
				className="w-full"
			>
				<CarouselContent className="-ml-4">
					{LATEST_WINNERS.winners.map((w) => (
						<CarouselItem
							key={w.projectName}
							className="pl-4 basis-full sm:basis-1/2 lg:basis-1/3"
						>
							<WinnerCard winner={w} />
						</CarouselItem>
					))}
				</CarouselContent>
			</Carousel>

			{/* Pagination dots */}
			{scrollSnaps.length > 1 && (
				<div className="flex items-center justify-center gap-2 mt-5">
					{scrollSnaps.map((_, i) => (
						<button
							key={i}
							type="button"
							onClick={() => api?.scrollTo(i)}
							aria-label={`Go to slide ${i + 1}`}
							className={`h-2 rounded-full transition-all ${
								i === selectedIndex
									? "w-8 bg-foreground"
									: "w-2 bg-muted-foreground/70 hover:bg-foreground"
							}`}
						/>
					))}
				</div>
			)}
		</section>
	);
}
