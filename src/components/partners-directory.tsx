"use client";

/**
 * Public partner directory — a clean, browse-first list that matches the
 * project directory's visual language (idea-card shell, circular logo,
 * one tag row, "View profile →" footer).
 *
 * ONE job: browse + filter. The search box ONLY filters the grid (name,
 * assets, SEPs, country, sectors, regions) — it never asks anything. Finding
 * a partner by describing a need lives on its own page, the concierge
 * (/partners/chat), reached by an obvious button. Listing a company lives on
 * that same concierge. Managing your profile is "Partner login". Three clearly
 * separate doors — no more search-vs-ask confusion.
 *
 * Human twin of GET /api/partners.
 */

import {
	ArrowRight,
	ChevronDown,
	Globe,
	LogIn,
	Search,
	Sparkles,
	Tag,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
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
import {
	FRESHNESS_COLOR,
	FRESHNESS_LABELS,
	REGION_LABELS,
	rampLabel,
	regionLabel,
	sectorLabel,
	typeLabel,
} from "@/lib/partner-labels";
import { cn } from "@/lib/utils";

interface DirectoryPartner {
	slug: string;
	name: string;
	partnerType: string;
	tagline: string | null;
	description: string | null;
	sectors: string[];
	regions: string[];
	assets: string[];
	seps: string[];
	rampTypes: string[];
	country: string | null;
	acceptingClients: boolean | null;
	contactable: boolean;
	logoUrl: string | null;
	freshness: { status: string };
	verified: { scfInvolvement: string | null; onchainActive: boolean | null };
	websiteUrl: string | null;
	pilot: boolean;
	/** Passes the directory quality bar (default view shows only these). */
	quality: boolean;
}

const TYPE_OPTIONS = [
	{ value: "all", label: "All types" },
	{ value: "anchor", label: "Anchors" },
	{ value: "on-off-ramp", label: "Ramps" },
	{ value: "infrastructure", label: "Infrastructure" },
	{ value: "tooling", label: "Tooling" },
	{ value: "protocol", label: "Protocols" },
	{ value: "wallet", label: "Wallets" },
	{ value: "audit-firm", label: "Audit" },
];

const REGION_OPTIONS = [{ value: "all", label: "All regions" }].concat(
	Object.entries(REGION_LABELS).map(([value, label]) => ({ value, label })),
);

// The site-wide filter-button shell (leaderboard/directory pattern).
const btnBase =
	"h-11 px-4 inline-flex items-center justify-between gap-2 rounded-xl bg-card border border-border/50 text-foreground hover:bg-white/[0.04] transition-colors";

export function PartnersDirectory({
	initial,
}: {
	initial: DirectoryPartner[];
}) {
	const [typeFilter, setTypeFilter] = useState("all");
	const [regionFilter, setRegionFilter] = useState("all");
	const [showAll, setShowAll] = useState(false);
	const [query, setQuery] = useState("");
	const [typeDrawerOpen, setTypeDrawerOpen] = useState(false);
	const [regionDrawerOpen, setRegionDrawerOpen] = useState(false);

	// Type/region/query matcher WITHOUT the quality gate — shared by the visible
	// list and the hidden-count so "view all" stays accurate per-filter.
	const matchesFilters = useMemo(() => {
		const q = query.trim().toLowerCase();
		return (p: DirectoryPartner) => {
			if (typeFilter !== "all") {
				if (typeFilter === "on-off-ramp") {
					// Real ramp providers are mostly partnerType=="anchor" with
					// stellar.toml-verified rampTypes; the filter matches CAPABILITY,
					// not just the self-declared type (which almost nobody picks).
					if (p.partnerType !== "on-off-ramp" && p.rampTypes.length === 0)
						return false;
				} else if (p.partnerType !== typeFilter) return false;
			}
			if (regionFilter !== "all" && !p.regions.includes(regionFilter))
				return false;
			if (q) {
				const hay =
					`${p.name} ${p.tagline ?? ""} ${p.description ?? ""} ${p.sectors.join(" ")} ${p.regions.join(" ")} ${p.assets.join(" ")} ${p.seps.join(" ")} ${p.rampTypes.join(" ")} ${p.country ?? ""}`.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		};
	}, [typeFilter, regionFilter, query]);

	const visible = useMemo(
		() => initial.filter((p) => matchesFilters(p) && (showAll || p.quality)),
		[initial, matchesFilters, showAll],
	);
	const hiddenCount = useMemo(
		() =>
			showAll
				? 0
				: initial.filter((p) => matchesFilters(p) && !p.quality).length,
		[initial, matchesFilters, showAll],
	);

	const hasFilters =
		query.trim() !== "" || typeFilter !== "all" || regionFilter !== "all";
	const typeSelectedLabel =
		TYPE_OPTIONS.find((o) => o.value === typeFilter)?.label ?? "All types";
	const regionSelectedLabel =
		REGION_OPTIONS.find((o) => o.value === regionFilter)?.label ??
		"All regions";

	return (
		<main className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-16">
			{/* Hero + login */}
			<div className="mb-6 flex items-start justify-between gap-4">
				<div className="min-w-0">
					<div className="flex items-center gap-3 flex-wrap">
						<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
							Stellar Partners
						</h1>
						<span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground border border-border">
							Beta
						</span>
					</div>
					<p className="text-sm text-muted-foreground mt-2 max-w-xl">
						Anchors, ramps, auditors, infrastructure and protocols builders can
						integrate with — each profile partner-maintained and
						freshness-checked.
					</p>
				</div>
				<Link
					href="/partners/dashboard"
					className="hidden sm:inline-flex h-9 px-3.5 items-center gap-1.5 rounded-lg border border-border/50 text-sm text-muted-foreground hover:text-foreground hover:border-white/25 transition-colors flex-shrink-0"
				>
					<LogIn className="w-3.5 h-3.5" />
					Partner login
				</Link>
			</div>

			{/* Concierge CTA — a clearly distinct DOOR, not another search box */}
			<Link
				href="/partners/chat"
				className="group flex items-center gap-3 mb-6 p-4 rounded-xl border border-border bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.03] transition-colors"
			>
				<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] flex-shrink-0">
					<Sparkles className="w-4 h-4 text-foreground" />
				</span>
				<span className="min-w-0 flex-1">
					<span className="block text-sm font-semibold text-foreground">
						Not sure who you need? Ask the concierge
					</span>
					<span className="block text-xs text-muted-foreground">
						Describe what you&apos;re building and get matched to real partners
						— or list your own company.
					</span>
				</span>
				<ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all flex-shrink-0" />
			</Link>

			{/* Search — filters the grid live (no ask, no navigation) */}
			<form onSubmit={(e) => e.preventDefault()} className="relative mb-3">
				<Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
				<input
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search partners by name, asset, region…"
					className="w-full h-11 pl-11 pr-4 bg-card text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border outline-none transition-[border-color,box-shadow] duration-150 focus:border-white/30 focus:shadow-[0_0_0_3px_rgba(253,218,36,0.10)]"
					aria-label="Search partners"
				/>
			</form>

			{/* Filters — site-standard dropdowns (desktop) / drawers (mobile) */}
			<div className="mb-8">
				<div className="hidden md:flex md:items-center md:gap-3">
					<DropdownMenu>
						<DropdownMenuTrigger className={cn(btnBase, "min-w-[170px]")}>
							<Tag className="w-4 h-4 text-muted-foreground flex-shrink-0" />
							<span className="flex-1 text-left text-sm truncate">
								{typeSelectedLabel}
							</span>
							<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-[180px]">
							{TYPE_OPTIONS.map((o) => (
								<DropdownMenuItem
									key={o.value}
									onClick={() => setTypeFilter(o.value)}
									className={
										typeFilter === o.value
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
						<DropdownMenuTrigger className={cn(btnBase, "min-w-[170px]")}>
							<Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
							<span className="flex-1 text-left text-sm truncate">
								{regionSelectedLabel}
							</span>
							<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-[190px] max-h-[400px] overflow-y-auto">
							{REGION_OPTIONS.map((o) => (
								<DropdownMenuItem
									key={o.value}
									onClick={() => setRegionFilter(o.value)}
									className={
										regionFilter === o.value
											? "bg-white/10 text-foreground"
											: "text-foreground hover:bg-white/5"
									}
								>
									{o.label}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>

					{hasFilters && (
						<button
							type="button"
							onClick={() => {
								setQuery("");
								setTypeFilter("all");
								setRegionFilter("all");
							}}
							className="h-11 px-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
						>
							Clear
						</button>
					)}
				</div>

				<div className="md:hidden grid grid-cols-2 gap-2">
					<Drawer open={typeDrawerOpen} onOpenChange={setTypeDrawerOpen}>
						<DrawerTrigger asChild>
							<button type="button" className={cn(btnBase, "w-full")}>
								<Tag className="w-4 h-4 text-muted-foreground flex-shrink-0" />
								<span className="flex-1 text-left text-sm truncate">
									{typeSelectedLabel}
								</span>
								<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
							</button>
						</DrawerTrigger>
						<DrawerContent>
							<DrawerHeader>
								<DrawerTitle>Type</DrawerTitle>
								<DrawerDescription>Filter partners by type</DrawerDescription>
							</DrawerHeader>
							<div className="space-y-1 px-4 pb-6 max-h-[60vh] overflow-y-auto">
								{TYPE_OPTIONS.map((o) => (
									<button
										key={o.value}
										type="button"
										onClick={() => {
											setTypeFilter(o.value);
											setTypeDrawerOpen(false);
										}}
										className={cn(
											"w-full text-left px-4 py-3 rounded-lg text-sm transition-colors",
											typeFilter === o.value
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

					<Drawer open={regionDrawerOpen} onOpenChange={setRegionDrawerOpen}>
						<DrawerTrigger asChild>
							<button type="button" className={cn(btnBase, "w-full")}>
								<Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
								<span className="flex-1 text-left text-sm truncate">
									{regionSelectedLabel}
								</span>
								<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
							</button>
						</DrawerTrigger>
						<DrawerContent>
							<DrawerHeader>
								<DrawerTitle>Region</DrawerTitle>
								<DrawerDescription>
									Filter partners by region served
								</DrawerDescription>
							</DrawerHeader>
							<div className="space-y-1 px-4 pb-6 max-h-[60vh] overflow-y-auto">
								{REGION_OPTIONS.map((o) => (
									<button
										key={o.value}
										type="button"
										onClick={() => {
											setRegionFilter(o.value);
											setRegionDrawerOpen(false);
										}}
										className={cn(
											"w-full text-left px-4 py-3 rounded-lg text-sm transition-colors",
											regionFilter === o.value
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

			{/* Results header */}
			<div className="flex items-center justify-between gap-3 mb-4">
				<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{visible.length === 0
						? "No partners match"
						: `${visible.length} partner${visible.length === 1 ? "" : "s"}`}
				</h2>
			</div>

			{/* Empty state */}
			{visible.length === 0 && (
				<div className="rounded-2xl border border-border bg-card p-10 text-center">
					<p className="text-muted-foreground text-sm">
						{hiddenCount > 0 ? (
							<>
								No complete profiles match this filter.{" "}
								<button
									type="button"
									onClick={() => setShowAll(true)}
									className="text-foreground underline"
								>
									View all {hiddenCount}{" "}
									{hiddenCount === 1 ? "profile" : "profiles"}
								</button>{" "}
								or{" "}
								<Link
									href="/partners/chat"
									className="text-foreground underline"
								>
									ask the concierge
								</Link>
								.
							</>
						) : (
							<>
								Nothing matches. Try a broader filter or{" "}
								<Link
									href="/partners/chat"
									className="text-foreground underline"
								>
									ask the concierge
								</Link>
								.
							</>
						)}
					</p>
				</div>
			)}

			{/* Cards — same grid + shell as the project directory */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
				{visible.map((p) => (
					<PartnerCard key={p.slug} p={p} />
				))}
			</div>

			{/* Quiet view-all — surfaces unclaimed/thin profiles on demand */}
			{!showAll && hiddenCount > 0 && visible.length > 0 && (
				<div className="mt-8 text-center">
					<button
						type="button"
						onClick={() => setShowAll(true)}
						className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
					>
						view {hiddenCount} more {hiddenCount === 1 ? "profile" : "profiles"}{" "}
						→
					</button>
				</div>
			)}

			{/* Get-listed CTA */}
			<div className="mt-12 rounded-2xl border border-border bg-card p-5 flex items-center justify-between gap-4 flex-wrap">
				<div className="min-w-0">
					<div className="flex items-center gap-2 mb-1">
						<Sparkles className="w-4 h-4 text-muted-foreground" />
						<h3 className="text-sm font-semibold text-foreground">
							Are you a Stellar partner?
						</h3>
					</div>
					<p className="text-xs text-muted-foreground">
						Get listed in a short AI-guided chat — no account needed to start.
					</p>
				</div>
				<Link
					href="/partners/chat"
					className="h-10 px-4 inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium text-foreground transition-colors"
				>
					<Sparkles className="w-4 h-4" />
					List your company
				</Link>
			</div>
		</main>
	);
}

/** Up to 4 capability chips, Title-Case — the useful partner facts, compact. */
function capabilityChips(p: DirectoryPartner): string[] {
	const chips: string[] = [];
	for (const a of p.assets) chips.push(a.toUpperCase());
	for (const r of p.rampTypes) chips.push(rampLabel(r));
	if (p.country) chips.push(p.country);
	for (const s of p.sectors) chips.push(sectorLabel(s));
	for (const r of p.regions) chips.push(regionLabel(r));
	// De-dupe (country can repeat a region label) and cap.
	return [...new Set(chips)].slice(0, 4);
}

/**
 * Partner card — mirrors ProjectCard: idea-card shell, top tag row, circular
 * logo + name, description, "View profile →" footer. Partner-specific facts
 * (capabilities, freshness) live in one compact row above the footer.
 */
function PartnerCard({ p }: { p: DirectoryPartner }) {
	const chips = capabilityChips(p);
	const freshLabel = FRESHNESS_LABELS[p.freshness.status];
	const available = Boolean(p.acceptingClients && p.contactable);

	return (
		<Link href={`/partners/${p.slug}`} className="block h-full group">
			<div className="idea-card rounded-xl p-6 cursor-pointer flex flex-col h-full min-h-[200px]">
				{/* Tag row */}
				<div className="flex justify-between items-center gap-2 mb-4">
					<span className="inline-block px-2.5 py-1 text-xs font-medium rounded-full bg-white/10 text-foreground border border-border backdrop-blur-sm whitespace-nowrap">
						{typeLabel(p.partnerType)}
					</span>
					{available ? (
						<span className="px-2.5 py-1 text-xs font-medium rounded-full bg-white/[0.06] text-foreground/80 border border-border whitespace-nowrap flex-shrink-0">
							Available
						</span>
					) : (
						freshLabel && (
							<span
								className={cn(
									"px-2.5 py-1 text-xs rounded-full bg-white/[0.03] border border-border whitespace-nowrap flex-shrink-0",
									FRESHNESS_COLOR[p.freshness.status],
								)}
							>
								{freshLabel}
							</span>
						)
					)}
				</div>

				{/* Logo + name */}
				<div className="flex items-center gap-3 mb-4">
					{p.logoUrl ? (
						// Arbitrary remote domains (stellar.toml ORG_LOGO) — plain img.
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={p.logoUrl}
							alt={`${p.name} logo`}
							className="w-[52px] h-[52px] rounded-full object-cover border border-border/50 bg-white/[0.03] transition-transform duration-150 group-hover:scale-110 group-hover:border-white/30 flex-shrink-0"
						/>
					) : (
						<div className="w-[52px] h-[52px] rounded-full border border-border/50 bg-white/[0.04] flex items-center justify-center text-lg font-semibold text-muted-foreground transition-transform duration-150 group-hover:scale-110 group-hover:border-white/30 flex-shrink-0">
							{p.name.charAt(0).toUpperCase()}
						</div>
					)}
					<h3 className="text-base md:text-lg font-semibold text-foreground group-hover:text-white transition-all duration-150 leading-tight">
						{p.name}
					</h3>
				</div>

				{/* Description */}
				<p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed flex-1 mb-4 group-hover:text-foreground/80 transition-all duration-150">
					{p.tagline || p.description || "No description available."}
				</p>

				{/* Capability chips */}
				{chips.length > 0 && (
					<div className="flex flex-wrap gap-1.5 mb-4">
						{chips.map((c) => (
							<span
								key={c}
								className="px-2 py-0.5 text-xs rounded-full bg-white/[0.03] text-muted-foreground border border-border/50 whitespace-nowrap"
							>
								{c}
							</span>
						))}
					</div>
				)}

				{/* Footer */}
				<div className="flex items-center justify-between pt-4 border-t border-border group-hover:border-white/20 transition-all duration-150">
					<span className="text-sm font-medium text-foreground group-hover:text-white transition-all duration-150">
						View profile
					</span>
					<ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all duration-150" />
				</div>
			</div>
		</Link>
	);
}
