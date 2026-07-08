"use client";

import { ArrowRight, BookOpen, ChevronDown, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FlickeringGridBg } from "@/components/flickering-grid-bg";
import { IdeaSubmissionModal } from "@/components/idea-submission-modal";
import { PointerHighlight } from "@/components/pointer-highlight";
import { Badge } from "@/components/ui/badge";
import { CATEGORIES, CATEGORY_LABELS, IDEAS, type Quarter } from "@/data/ideas";

export function IdeasListing() {
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedCategory, setSelectedCategory] = useState("all");
	const [selectedQuarter, setSelectedQuarter] = useState<Quarter>("q2-2026");
	const [displayCount, setDisplayCount] = useState(9);
	const [categoryOpen, setCategoryOpen] = useState(false);
	const [showSubmitModal, setShowSubmitModal] = useState(false);

	const filteredIdeas = useMemo(() => {
		let filtered = IDEAS.filter((idea) => idea.quarter === selectedQuarter);

		if (selectedCategory !== "all") {
			filtered = filtered.filter((idea) => idea.category === selectedCategory);
		}

		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			filtered = filtered.filter(
				(idea) =>
					idea.title.toLowerCase().includes(q) ||
					idea.description.toLowerCase().includes(q),
			);
		}

		return filtered;
	}, [selectedQuarter, selectedCategory, searchQuery]);

	const ideasToDisplay = filteredIdeas.slice(0, displayCount);
	const hasMore = displayCount < filteredIdeas.length;

	const selectedCategoryLabel =
		selectedCategory === "all"
			? "All Categories"
			: CATEGORY_LABELS[selectedCategory as keyof typeof CATEGORY_LABELS] ||
				selectedCategory;

	return (
		<>
			{/* Header — grid extends full-width behind nav */}
			<div className="mb-12 text-center relative">
				{/* Flickering grid background — full viewport width, tightly masked to hero area */}
				<div className="absolute left-1/2 -translate-x-1/2 -top-44 w-screen flex items-center justify-center pointer-events-none h-[500px]">
					<div className="[mask-image:radial-gradient(400px_circle_at_center,white,transparent)] w-full flex items-center justify-center">
						<FlickeringGridBg
							squareSize={4}
							gridGap={6}
							color="#60A5FA"
							maxOpacity={0.3}
							flickerChance={0.03}
							width={1400}
							height={500}
						/>
					</div>
				</div>

				<div className="relative z-10 py-12">
					<h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground mb-4">
						Build the Future on{" "}
						<PointerHighlight
							rectangleClassName="border-[#FDDA24] bg-[#FDDA24]/20"
							pointerClassName="text-[#FDDA24] h-4 w-4"
							containerClassName="inline-block"
						>
							<span className="relative z-10 px-1">Stellar</span>
						</PointerHighlight>
					</h1>
					<p className="text-base text-muted-foreground max-w-[62ch] mx-auto mb-6">
						Discover confirmed RFPs for the Stellar ecosystem. Find
						opportunities to build and contribute to high-impact projects.
					</p>
					<button
						type="button"
						onClick={() => setShowSubmitModal(true)}
						className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 transition-opacity"
					>
						Suggest a Need
					</button>
				</div>
			</div>

			{/* SCF Handbook */}
			<a
				href="https://stellar.gitbook.io/scf-handbook/"
				target="_blank"
				rel="noopener noreferrer"
				className="relative z-10 flex items-center justify-between w-full px-5 py-4 rounded-xl bg-card border border-border/50 hover:border-border transition-colors duration-150 group mb-8"
			>
				<div className="flex items-center gap-3">
					<BookOpen className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
					<span className="text-sm font-medium text-foreground">
						SCF Handbook
					</span>
					<span className="text-sm text-muted-foreground hidden sm:inline">
						— Learn how the Stellar Community Fund works
					</span>
				</div>
				<span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
					stellar.gitbook.io →
				</span>
			</a>

			{/* Quarter Tabs */}
			<div className="relative z-10 mb-6 flex items-center gap-2">
				<button
					type="button"
					onClick={() => {
						setSelectedQuarter("q2-2026");
						setSelectedCategory("all");
						setSearchQuery("");
						setDisplayCount(9);
					}}
					className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors duration-150 ${
						selectedQuarter === "q2-2026"
							? "bg-card border-border/50 text-foreground"
							: "bg-transparent border-transparent text-muted-foreground hover:text-foreground"
					}`}
				>
					Q2 2026
					<Badge className="px-1.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border-0">
						Open
					</Badge>
				</button>
				<button
					type="button"
					onClick={() => {
						setSelectedQuarter("q1-2026");
						setSelectedCategory("all");
						setSearchQuery("");
						setDisplayCount(9);
					}}
					className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors duration-150 ${
						selectedQuarter === "q1-2026"
							? "bg-card border-border/50 text-foreground"
							: "bg-transparent border-transparent text-muted-foreground hover:text-foreground"
					}`}
				>
					Q1 2026
					<Badge className="px-1.5 py-0.5 text-xs font-semibold rounded-full bg-white/10 text-muted-foreground border-0">
						Closed
					</Badge>
				</button>
			</div>

			{/* Search & Category Filter */}
			<div className="relative z-10 flex flex-col md:flex-row gap-3 items-stretch md:items-center mb-4">
				<div className="relative w-full md:max-w-[560px]">
					<Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
					<input
						type="text"
						placeholder="Search RFPs by keywords..."
						value={searchQuery}
						onChange={(e) => {
							setSearchQuery(e.target.value);
							setDisplayCount(9);
						}}
						className="w-full h-11 pl-12 pr-4 bg-card text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border/50 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>

				{/* Category Dropdown */}
				<div className="relative">
					<button
						type="button"
						onClick={() => setCategoryOpen(!categoryOpen)}
						className="h-11 px-4 bg-card text-foreground border border-border/50 rounded-xl hover:bg-white/5 transition-all duration-150 flex items-center gap-2 min-w-[160px]"
					>
						<span className="flex-1 text-left text-sm">
							{selectedCategoryLabel}
						</span>
						<ChevronDown
							className={`w-4 h-4 transition-transform ${categoryOpen ? "rotate-180" : ""}`}
						/>
					</button>
					{categoryOpen && (
						<div className="absolute top-full mt-1 z-50 w-[200px] bg-card border border-border rounded-xl shadow-lg p-1">
							<button
								type="button"
								onClick={() => {
									setSelectedCategory("all");
									setCategoryOpen(false);
									setDisplayCount(9);
								}}
								className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
									selectedCategory === "all"
										? "bg-white/10 text-foreground"
										: "text-foreground hover:bg-white/5"
								}`}
							>
								All Categories
							</button>
							{CATEGORIES.map((cat) => (
								<button
									key={cat}
									type="button"
									onClick={() => {
										setSelectedCategory(cat);
										setCategoryOpen(false);
										setDisplayCount(9);
									}}
									className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
										selectedCategory === cat
											? "bg-white/10 text-foreground"
											: "text-foreground hover:bg-white/5"
									}`}
								>
									{CATEGORY_LABELS[cat]}
								</button>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Results Count */}
			<div className="text-sm text-muted-foreground mb-8">
				Showing{" "}
				<span className="text-foreground font-semibold">
					{ideasToDisplay.length}
				</span>{" "}
				RFPs
			</div>

			{/* RFPs Grid */}
			{ideasToDisplay.length > 0 ? (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{ideasToDisplay.map((idea) => (
						<Link
							key={idea.id}
							href={`/ideas/${idea.id}`}
							className="block h-full group"
						>
							<div className="idea-card rounded-xl p-6 cursor-pointer flex flex-col h-full min-h-[200px]">
								{/* Tag row */}
								<div className="flex justify-between items-center mb-4">
									<div className="flex items-center gap-1.5 flex-wrap">
										<span className="inline-block px-2.5 py-1 text-xs font-medium rounded-full bg-white/10 text-foreground border border-border backdrop-blur-sm">
											{CATEGORY_LABELS[idea.category] || idea.category}
										</span>
									</div>
								</div>

								{/* Title */}
								<h3 className="text-base md:text-lg font-semibold text-foreground group-hover:text-white transition-all duration-150 leading-tight mb-4">
									{idea.title}
								</h3>

								{/* Description */}
								<p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed flex-1 mb-5 group-hover:text-foreground/80 transition-all duration-150">
									{idea.description}
								</p>

								{/* View Details with Arrow */}
								<div className="flex items-center justify-between pt-4 border-t border-border group-hover:border-white/20 transition-all duration-150">
									<span className="text-sm font-medium text-foreground group-hover:text-white transition-all duration-150">
										View Details
									</span>
									<ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all duration-150" />
								</div>
							</div>
						</Link>
					))}
				</div>
			) : (
				<div className="text-center py-16">
					<div className="w-24 h-24 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
						<Plus className="w-12 h-12 text-muted-foreground" />
					</div>
					<h3 className="text-lg font-semibold mb-2 text-foreground">
						No RFPs found
					</h3>
					<p className="text-sm text-muted-foreground">
						{searchQuery || selectedCategory !== "all"
							? "Try adjusting your search or filters"
							: "No RFPs available for this quarter."}
					</p>
				</div>
			)}

			{/* Load More */}
			{hasMore && (
				<div className="text-center mt-8">
					<button
						type="button"
						onClick={() => setDisplayCount((prev) => prev + 9)}
						className="px-8 py-3 rounded-xl font-semibold text-sm bg-card border border-border/50 text-foreground hover:bg-white/5 transition-colors"
					>
						Load More RFPs
					</button>
				</div>
			)}

			{/* Submission Modal */}
			<IdeaSubmissionModal
				isOpen={showSubmitModal}
				onClose={() => setShowSubmitModal(false)}
			/>
		</>
	);
}
