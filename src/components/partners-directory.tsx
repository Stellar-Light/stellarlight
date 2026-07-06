"use client";

/**
 * Public partner directory — ONE page, browse-first with an inline ask.
 *
 *   - typing filters the grid live (name/assets/SEPs/country/sectors/regions);
 *   - submitting a real question (Enter / the Ask button / an example chip)
 *     asks the concierge ONCE and renders a "Matched for you" panel inline
 *     above the grid — no navigation, no separate chat page for FIND;
 *   - /partners/chat remains ONLY the "get listed" onboarding surface (plus
 *     the single "ask a follow-up" continuation link from the inline panel).
 *
 * Visual language matches the site's directory pages: dropdown filters
 * (Radix DropdownMenu on desktop, Drawer bottom-sheet on mobile — the
 * leaderboard/directory pattern), 3-col card grid, Title-Case tags.
 * Human twin of GET /api/partners.
 */

import {
	ArrowUpRight,
	ChevronDown,
	Globe,
	Loader2,
	Search,
	Sparkles,
	Tag,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	MatchCard,
	type PublicPartner,
	renderMarkdownBold,
} from "@/components/partner-concierge-chat";
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
	sepLabel,
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
	/** Pilot cohort — featured first with a badge. */
	pilot: boolean;
	/** Passes the directory quality bar (default view shows only these). */
	quality: boolean;
}

const EXAMPLES = [
	"I need a USDC off-ramp in Mexico",
	"Who can audit my Soroban contract?",
	"EUR on/off ramp with SEP-24",
	"Tokenized treasury assets",
];

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

type AskState =
	| { kind: "idle" }
	| { kind: "loading"; need: string }
	| { kind: "answer"; need: string; reply: string; matches: PublicPartner[] }
	| { kind: "unavailable"; need: string };

export function PartnersDirectory({
	initial,
}: {
	initial: DirectoryPartner[];
}) {
	const searchParams = useSearchParams();
	const [typeFilter, setTypeFilter] = useState("all");
	const [regionFilter, setRegionFilter] = useState("all");
	const [showAll, setShowAll] = useState(false);
	const [query, setQuery] = useState("");
	const [askState, setAskState] = useState<AskState>({ kind: "idle" });
	const [typeDrawerOpen, setTypeDrawerOpen] = useState(false);
	const [regionDrawerOpen, setRegionDrawerOpen] = useState(false);
	const askAbort = useRef<AbortController | null>(null);
	// Handoff (?q= from /ask) runs exactly once.
	const handedOff = useRef(false);

	/** One-shot concierge FIND — inline, no navigation. */
	async function runAsk(needRaw: string) {
		const need = needRaw.trim();
		if (!need) return;
		askAbort.current?.abort();
		const ac = new AbortController();
		askAbort.current = ac;
		setAskState({ kind: "loading", need });
		try {
			const r = await fetch("/api/partners/assistant", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ messages: [{ role: "user", content: need }] }),
				signal: ac.signal,
			});
			const d = await r.json().catch(() => ({}));
			if (ac.signal.aborted) return;
			if (!r.ok || d.unavailable || typeof d.reply !== "string") {
				setAskState({ kind: "unavailable", need });
				return;
			}
			setAskState({
				kind: "answer",
				need,
				reply: d.reply,
				matches: Array.isArray(d.matches) ? d.matches : [],
			});
		} catch {
			if (!ac.signal.aborted) setAskState({ kind: "unavailable", need });
		}
	}

	// /ask hands off with ?q= — land mid-answer, client-side (page stays static).
	useEffect(() => {
		if (handedOff.current) return;
		handedOff.current = true;
		const q = searchParams.get("q")?.trim();
		if (q) {
			setQuery(q);
			runAsk(q);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

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

	const filtered = useMemo(
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

	// Featured pilots lead ONLY in the pure browse state; once the user filters
	// or asks, pilots simply sort first in the normal grid (page.tsx sort).
	const browsing =
		typeFilter === "all" && regionFilter === "all" && !query.trim();
	const featured = browsing ? filtered.filter((p) => p.pilot) : [];
	const rest = browsing ? filtered.filter((p) => !p.pilot) : filtered;

	const typeSelectedLabel =
		TYPE_OPTIONS.find((o) => o.value === typeFilter)?.label ?? "All types";
	const regionSelectedLabel =
		REGION_OPTIONS.find((o) => o.value === regionFilter)?.label ??
		"All regions";

	return (
		<main className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-16">
			{/* Hero */}
			<div className="mb-8">
				<div className="flex items-center gap-3 flex-wrap">
					<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
						Stellar Partners
					</h1>
					<span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground border border-border">
						Beta
					</span>
				</div>
				<p className="text-sm text-muted-foreground mt-2 max-w-xl">
					Anchors, ramps, auditors, infrastructure — browse the directory or ask
					for a match. Are you a partner?{" "}
					<Link
						href="/partners/chat"
						className="text-foreground underline underline-offset-2 hover:no-underline"
					>
						List your company →
					</Link>
				</p>
			</div>

			{/* Search: typing filters live, submitting asks inline */}
			<form
				onSubmit={(e) => {
					e.preventDefault();
					runAsk(query);
				}}
				className="relative mb-3"
			>
				<Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
				<input
					type="text"
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						if (askState.kind !== "idle") setAskState({ kind: "idle" });
					}}
					placeholder="Search the directory — or describe what you need and press Ask"
					className="w-full h-11 pl-11 pr-24 bg-card text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border outline-none transition-[border-color,box-shadow] duration-150 focus:border-white/30 focus:shadow-[0_0_0_3px_rgba(253,218,36,0.10)]"
					aria-label="Search partners or describe what you need"
				/>
				<button
					type="submit"
					disabled={!query.trim() || askState.kind === "loading"}
					className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 px-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium text-foreground disabled:opacity-30 transition-colors"
					title="Ask for a match — answered right here"
				>
					<Sparkles className="w-3.5 h-3.5" />
					Ask
				</button>
			</form>

			{/* Example asks — answered inline */}
			<div className="flex flex-wrap gap-2 mb-5">
				{EXAMPLES.map((ex) => (
					<button
						key={ex}
						type="button"
						onClick={() => {
							setQuery(ex);
							runAsk(ex);
						}}
						className="text-xs px-3 py-1.5 rounded-full bg-white/[0.03] border border-border text-muted-foreground hover:text-foreground hover:border-white/25 transition-colors"
					>
						{ex}
					</button>
				))}
			</div>

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

			{/* Inline concierge answer */}
			{askState.kind === "loading" && (
				<section className="mb-8 rounded-xl border border-border bg-card p-5">
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="w-4 h-4 animate-spin" />
						Matching “{askState.need}”…
					</div>
				</section>
			)}
			{askState.kind === "unavailable" && (
				<section className="mb-8 rounded-xl border border-border bg-card p-4">
					<p className="text-xs text-muted-foreground">
						The concierge is busy right now — showing keyword matches below.
					</p>
				</section>
			)}
			{askState.kind === "answer" && (
				<section className="mb-8 rounded-xl border border-white/15 bg-white/[0.02] p-5">
					<div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
						<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							Matched for you
						</h2>
						<div className="flex items-center gap-4">
							<Link
								href={`/partners/chat?q=${encodeURIComponent(askState.need)}`}
								className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
							>
								Ask a follow-up →
							</Link>
							<button
								type="button"
								onClick={() => setAskState({ kind: "idle" })}
								className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
							>
								Clear
							</button>
						</div>
					</div>
					<p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap mb-3">
						{renderMarkdownBold(askState.reply)}
					</p>
					{askState.matches.length > 0 && (
						<div className="grid md:grid-cols-2 gap-2.5">
							{askState.matches.map((p) => (
								<MatchCard key={p.slug} p={p} />
							))}
						</div>
					)}
				</section>
			)}

			{/* Featured pilots — pure browse state only */}
			{featured.length > 0 && (
				<section className="mb-10">
					<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
						Featured
					</h2>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
						{featured.map((p) => (
							<PartnerCard key={p.slug} p={p} isFeatured />
						))}
					</div>
				</section>
			)}

			{/* Results header */}
			<div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
				<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{rest.length === 0
						? "No partners match"
						: browsing && featured.length > 0
							? `All partners (${rest.length})`
							: `${rest.length} partner${rest.length === 1 ? "" : "s"}`}
				</h2>
				{rest.length === 0 &&
					(query || typeFilter !== "all" || regionFilter !== "all") && (
						<button
							type="button"
							onClick={() => {
								setQuery("");
								setTypeFilter("all");
								setRegionFilter("all");
								setAskState({ kind: "idle" });
							}}
							className="text-xs text-muted-foreground hover:text-foreground underline"
						>
							Clear filters
						</button>
					)}
			</div>

			{/* Empty state */}
			{rest.length === 0 && featured.length === 0 && (
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
									View all {hiddenCount} unclaimed{" "}
									{hiddenCount === 1 ? "profile" : "profiles"}
								</button>{" "}
								or{" "}
								<Link
									href="/partners/chat"
									className="text-foreground underline"
								>
									get your company listed
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
									get your company listed
								</Link>
								.
							</>
						)}
					</p>
				</div>
			)}

			{/* Cards */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
				{rest.map((p) => (
					<PartnerCard key={p.slug} p={p} />
				))}
			</div>

			{/* Quiet view-all — replaces the old toggle button */}
			{!showAll && hiddenCount > 0 && rest.length > 0 && (
				<div className="mt-8 text-center">
					<button
						type="button"
						onClick={() => setShowAll(true)}
						className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
					>
						view all {filtered.length + hiddenCount} partners →
					</button>
				</div>
			)}

			{/* Get-listed CTA */}
			{rest.length > 0 && (
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
						Get listed
					</Link>
				</div>
			)}
		</main>
	);
}

/** One tidy capability line, Title-Case, capped with an overflow count. */
function capabilityTags(
	p: DirectoryPartner,
): { label: string; strong: boolean }[] {
	const tags: { label: string; strong: boolean }[] = [];
	for (const a of p.assets) tags.push({ label: a.toUpperCase(), strong: true });
	for (const r of p.rampTypes)
		tags.push({ label: rampLabel(r), strong: false });
	for (const s of p.seps) tags.push({ label: sepLabel(s), strong: false });
	if (p.country) tags.push({ label: p.country, strong: false });
	for (const s of p.sectors)
		tags.push({ label: sectorLabel(s), strong: false });
	for (const r of p.regions)
		tags.push({ label: regionLabel(r), strong: false });
	return tags;
}

function PartnerCard({
	p,
	isFeatured = false,
}: {
	p: DirectoryPartner;
	isFeatured?: boolean;
}) {
	const tags = capabilityTags(p);
	const shown = tags.slice(0, 5);
	const overflow = tags.length - shown.length;
	const freshLabel = FRESHNESS_LABELS[p.freshness.status];

	return (
		<Link
			href={`/partners/${p.slug}`}
			className={cn(
				"group flex flex-col p-6 rounded-xl border transition-all hover:-translate-y-px",
				isFeatured
					? "bg-white/[0.03] border-white/15 hover:border-white/30"
					: "bg-card border-border hover:border-white/25 hover:bg-white/[0.02]",
			)}
		>
			<div className="flex items-start justify-between gap-3 mb-2">
				<div className="min-w-0">
					<div className="flex items-center gap-2 mb-1.5 flex-wrap">
						{p.logoUrl && (
							// Arbitrary remote domains (stellar.toml ORG_LOGO) — plain img.
							// eslint-disable-next-line @next/next/no-img-element
							<img
								src={p.logoUrl}
								alt=""
								className="w-6 h-6 rounded-md border border-border bg-white/[0.03] object-contain flex-shrink-0"
							/>
						)}
						<span className="font-semibold text-foreground group-hover:text-white transition-colors truncate">
							{p.name}
						</span>
					</div>
					<div className="flex items-center gap-1.5 flex-wrap">
						<span className="px-2 py-0.5 text-xs font-medium rounded-full bg-white/10 text-foreground border border-border whitespace-nowrap">
							{typeLabel(p.partnerType)}
						</span>
						{p.pilot && (
							<span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-white text-[#171717] whitespace-nowrap">
								Pilot
							</span>
						)}
						{p.acceptingClients && p.contactable && (
							<span className="px-2 py-0.5 text-xs rounded-full bg-white/[0.06] text-foreground/80 border border-border whitespace-nowrap">
								Available
							</span>
						)}
						{freshLabel && (
							<span
								className={cn(
									"px-2 py-0.5 text-xs rounded-full bg-white/[0.03] border border-border whitespace-nowrap",
									FRESHNESS_COLOR[p.freshness.status],
								)}
							>
								{freshLabel}
							</span>
						)}
					</div>
				</div>
				<ArrowUpRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground flex-shrink-0 transition-colors" />
			</div>
			{(p.tagline || p.description) && (
				<p className="text-sm text-muted-foreground leading-snug line-clamp-2 mb-3 flex-1">
					{p.tagline ?? p.description}
				</p>
			)}
			{shown.length > 0 && (
				<div className="mt-auto flex flex-wrap gap-1.5">
					{shown.map((t) => (
						<span
							key={t.label}
							className={cn(
								"px-2 py-0.5 text-xs rounded-full border whitespace-nowrap",
								t.strong
									? "font-medium bg-white/[0.06] text-foreground/90 border-border"
									: "bg-white/[0.03] text-muted-foreground border-border/50",
							)}
						>
							{t.label}
						</span>
					))}
					{overflow > 0 && (
						<span className="px-1 py-0.5 text-xs text-muted-foreground/60">
							+{overflow}
						</span>
					)}
				</div>
			)}
		</Link>
	);
}
