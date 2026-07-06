"use client";

/**
 * Public partner directory — the front door.
 *
 * One big input, two clear behaviors (no mixed modes):
 *   - typing filters the grid live (name/assets/SEPs/country/sectors);
 *   - hitting Ask (or an example chip) HANDS OFF to the concierge chat —
 *     /partners/chat?q=… — where the question is auto-sent and answered in a
 *     real conversation the user can continue. Search stays search; chat
 *     stays chat.
 *
 * Human twin of GET /api/partners. Visual language matches /ask.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Sparkles, ArrowUpRight } from "lucide-react";

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

const RAMP_LABELS: Record<string, string> = {
	"on-ramp": "On-ramp",
	"off-ramp": "Off-ramp",
};
const SEP_LABELS: Record<string, string> = {
	"sep-6": "SEP-6",
	"sep-24": "SEP-24",
	"sep-31": "SEP-31",
};

const TYPE_LABELS: Record<string, string> = {
	anchor: "Anchor",
	"on-off-ramp": "On/Off Ramp",
	infrastructure: "Infrastructure",
	tooling: "Tooling",
	protocol: "Protocol",
	wallet: "Wallet",
	"audit-firm": "Audit firm",
	legal: "Legal",
	agency: "Agency",
	other: "Other",
};

const TYPE_FILTERS = [
	{ key: "all", label: "All" },
	{ key: "anchor", label: "Anchors" },
	{ key: "on-off-ramp", label: "Ramps" },
	{ key: "infrastructure", label: "Infrastructure" },
	{ key: "tooling", label: "Tooling" },
	{ key: "protocol", label: "Protocols" },
	{ key: "wallet", label: "Wallets" },
	{ key: "audit-firm", label: "Audit" },
];

const FRESH_BADGE: Record<string, string> = {
	fresh: "text-emerald-400/90",
	aging: "text-yellow-400/90",
	stale: "text-orange-400/90",
	archived: "text-red-400/90",
};

const SECTOR_LABELS: Record<string, string> = {
	defi: "DeFi",
	payments: "Payments",
	rwa: "RWA",
	stablecoins: "Stablecoins",
	identity: "Identity",
	data: "Data",
	ai: "AI",
	gaming: "Gaming",
	other: "Other",
};
const REGION_LABELS: Record<string, string> = {
	global: "Global",
	"north-america": "North America",
	latam: "LatAm",
	europe: "Europe",
	africa: "Africa",
	mena: "MENA",
	asia: "Asia",
	oceania: "Oceania",
};
const sectorLabel = (s: string) => SECTOR_LABELS[s] ?? s;
const regionLabel = (r: string) => REGION_LABELS[r] ?? r;

export function PartnersDirectory({ initial }: { initial: DirectoryPartner[] }) {
	const router = useRouter();
	const [typeFilter, setTypeFilter] = useState("all");
	const [regionFilter, setRegionFilter] = useState("all");
	const [showAll, setShowAll] = useState(false);
	const [query, setQuery] = useState("");

	// Type/region/query matcher WITHOUT the quality gate — used by both the
	// visible list and the hidden-count so "show all (+N)" is accurate for the
	// current filters.
	const matchesFilters = useMemo(() => {
		const q = query.trim().toLowerCase();
		return (p: DirectoryPartner) => {
			if (typeFilter !== "all") {
				if (typeFilter === "on-off-ramp") {
					// Real ramp providers are mostly partnerType=="anchor" with
					// stellar.toml-verified rampTypes; the chip matches CAPABILITY,
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
	// How many the quality gate is hiding under the CURRENT filters.
	const hiddenCount = useMemo(
		() =>
			showAll
				? 0
				: initial.filter((p) => matchesFilters(p) && !p.quality).length,
		[initial, matchesFilters, showAll],
	);

	/** Hand off to the concierge chat with the question pre-sent. */
	function ask(q: string) {
		const need = q.trim();
		if (!need) return;
		router.push(`/partners/chat?q=${encodeURIComponent(need)}`);
	}

	return (
		<main className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 pb-16">
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
					Anchors, ramps, auditors, infrastructure — describe what you need and
					get matched, or browse the directory. Prefer a conversation?{" "}
					<Link
						href="/partners/chat"
						className="text-foreground underline underline-offset-2 hover:no-underline"
					>
						Open the concierge chat
					</Link>
					.
				</p>
			</div>

			{/* Search filters the grid; Ask hands off to the concierge chat */}
			<form
				onSubmit={(e) => {
					e.preventDefault();
					ask(query);
				}}
				className="relative mb-3"
			>
				<Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
				<input
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="search the directory — or ask, and we'll open a chat…"
					className="w-full h-14 pl-14 pr-24 bg-card text-base text-foreground placeholder-muted-foreground rounded-2xl border border-border outline-none transition-[border-color,box-shadow] duration-150 focus:border-white/30 focus:shadow-[0_0_0_3px_rgba(253,218,36,0.10)]"
					aria-label="Search partners, or ask the concierge"
				/>
				<button
					type="submit"
					disabled={!query.trim()}
					className="absolute right-2.5 top-1/2 -translate-y-1/2 h-9 px-3.5 inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium text-foreground disabled:opacity-30 transition-colors"
					title="Ask the concierge — opens a chat with your question"
				>
					<Sparkles className="w-4 h-4" />
					Ask
				</button>
			</form>

			{/* Example asks — one tap opens the concierge chat with the question */}
			<div className="flex flex-wrap gap-2 mb-4">
				{EXAMPLES.map((ex) => (
					<button
						key={ex}
						type="button"
						onClick={() => ask(ex)}
						className="text-xs px-3 py-1.5 rounded-full bg-white/[0.03] border border-border text-muted-foreground hover:text-foreground hover:border-white/25 transition-colors"
					>
						{ex}
					</button>
				))}
			</div>

			{/* Type filter chips (matches /ask example chips) */}
			<div className="flex flex-wrap gap-2 mb-3">
				{TYPE_FILTERS.map((f) => {
					const active = typeFilter === f.key;
					return (
						<button
							key={f.key}
							onClick={() => setTypeFilter(f.key)}
							className={
								"text-xs px-3 py-1.5 rounded-full transition-colors border " +
								(active
									? "bg-white/10 text-foreground border-white/25"
									: "bg-white/[0.03] text-muted-foreground border-border hover:text-foreground hover:border-white/25")
							}
						>
							{f.label}
						</button>
					);
				})}
			</div>

			{/* Region filter chips */}
			<div className="flex flex-wrap gap-2 mb-8">
				{[{ key: "all", label: "All regions" }].concat(
					Object.entries(REGION_LABELS).map(([key, label]) => ({ key, label })),
				).map((f) => {
					const active = regionFilter === f.key;
					return (
						<button
							key={f.key}
							onClick={() => setRegionFilter(f.key)}
							className={
								"text-[11px] px-2.5 py-1 rounded-full transition-colors border " +
								(active
									? "bg-white/10 text-foreground border-white/25"
									: "bg-white/[0.02] text-muted-foreground/80 border-border hover:text-foreground hover:border-white/25")
							}
						>
							{f.label}
						</button>
					);
				})}
			</div>

			{/* Results header (muted, ask-style) + quality-gate toggle */}
			<div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
				<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{filtered.length === 0
						? "No partners match"
						: `${filtered.length} partner${filtered.length === 1 ? "" : "s"}`}
				</h2>
				<div className="flex items-center gap-3">
					{(hiddenCount > 0 || showAll) && (
						<button
							onClick={() => setShowAll((v) => !v)}
							className="text-xs text-muted-foreground hover:text-foreground underline"
						>
							{showAll
								? "showing all · show quality only"
								: `showing quality profiles · show all (+${hiddenCount})`}
						</button>
					)}
					{filtered.length === 0 &&
						(query || typeFilter !== "all" || regionFilter !== "all") && (
							<button
								onClick={() => {
									setQuery("");
									setTypeFilter("all");
									setRegionFilter("all");
								}}
								className="text-xs text-muted-foreground hover:text-foreground underline"
							>
								clear filters
							</button>
						)}
				</div>
			</div>

			{/* Empty state */}
			{filtered.length === 0 && (
				<div className="rounded-2xl border border-border bg-card p-10 text-center">
					<p className="text-muted-foreground text-sm">
						{hiddenCount > 0 ? (
							<>
								No complete profiles match, but {hiddenCount} unclaimed{" "}
								{hiddenCount === 1 ? "profile does" : "profiles do"}.{" "}
								<button
									onClick={() => setShowAll(true)}
									className="text-foreground underline"
								>
									Show all
								</button>{" "}
								or{" "}
								<Link href="/partners/chat" className="text-foreground underline">
									get your company listed
								</Link>
								.
							</>
						) : (
							<>
								Nothing matches. Try a broader filter or{" "}
								<Link href="/partners/chat" className="text-foreground underline">
									get your company listed
								</Link>
								.
							</>
						)}
					</p>
				</div>
			)}

			{/* Cards */}
			<div className="grid sm:grid-cols-2 gap-3">
				{filtered.map((p) => (
					<Link
						key={p.slug}
						href={`/partners/${p.slug}`}
						className="group block p-4 rounded-xl bg-card border border-border hover:border-white/25 hover:bg-white/[0.02] transition-all"
					>
						<div className="flex items-start justify-between gap-3 mb-1.5">
							<div className="min-w-0">
								<div className="flex items-center gap-2 mb-1 flex-wrap">
									{p.logoUrl && (
										// Arbitrary remote domains (stellar.toml ORG_LOGO) — plain img.
										// eslint-disable-next-line @next/next/no-img-element
										<img
											src={p.logoUrl}
											alt=""
											className="w-6 h-6 rounded-md border border-border bg-white/[0.03] object-contain flex-shrink-0"
										/>
									)}
									<span className="font-medium text-foreground group-hover:text-white transition-colors truncate">
										{p.name}
									</span>
									<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-muted-foreground border border-border whitespace-nowrap">
										{TYPE_LABELS[p.partnerType] ?? p.partnerType}
									</span>
									{p.pilot && (
										<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.08] text-foreground border border-white/20 whitespace-nowrap">
											Pilot
										</span>
									)}
									{/* Available only when there's an actual contact path —
									    an "available" partner you can't reach is a dead end. */}
									{p.acceptingClients && p.contactable && (
										<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.06] text-foreground/80 border border-border whitespace-nowrap">
											Available
										</span>
									)}
								</div>
							</div>
							<ArrowUpRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground flex-shrink-0 transition-colors" />
						</div>
						{(p.tagline || p.description) && (
							<p className="text-xs text-muted-foreground/90 leading-snug line-clamp-2">
								{p.tagline ?? p.description}
							</p>
						)}
						{/* stellar.toml-verified capabilities: assets + SEPs + ramps + country */}
						{(p.assets.length > 0 ||
							p.seps.length > 0 ||
							p.rampTypes.length > 0 ||
							p.country) && (
							<div className="mt-3 flex flex-wrap gap-1.5">
								{p.assets.slice(0, 4).map((a) => (
									<span
										key={`a-${a}`}
										className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.06] text-foreground/90 border border-border font-medium"
									>
										{a}
									</span>
								))}
								{p.assets.length > 4 && (
									<span className="text-[10px] px-1 py-0.5 text-muted-foreground/70">
										+{p.assets.length - 4}
									</span>
								)}
								{p.rampTypes.map((r) => (
									<span
										key={`rt-${r}`}
										className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.03] text-muted-foreground/90 border border-border"
									>
										{RAMP_LABELS[r] ?? r}
									</span>
								))}
								{p.seps.map((s) => (
									<span
										key={`sep-${s}`}
										className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.03] text-muted-foreground/70 border border-border"
									>
										{SEP_LABELS[s] ?? s}
									</span>
								))}
								{p.country && (
									<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.03] text-muted-foreground/70 border border-border">
										{p.country}
									</span>
								)}
							</div>
						)}
						{(p.sectors.length > 0 || p.regions.length > 0) && (
							<div className="mt-2 flex flex-wrap gap-1.5">
								{p.sectors.slice(0, 3).map((s) => (
									<span
										key={`s-${s}`}
										className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.03] text-muted-foreground/90 border border-border"
									>
										{sectorLabel(s)}
									</span>
								))}
								{p.regions.slice(0, 2).map((r) => (
									<span
										key={`r-${r}`}
										className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.03] text-muted-foreground/70 border border-border"
									>
										{regionLabel(r)}
									</span>
								))}
							</div>
						)}
						{FRESH_BADGE[p.freshness.status] && p.freshness.status !== "fresh" && (
							<div
								className={`mt-2 text-[10px] ${FRESH_BADGE[p.freshness.status]}`}
							>
								profile is {p.freshness.status}
							</div>
						)}
					</Link>
				))}
			</div>

			{/* Get-listed CTA at the bottom (mirrors /ask's Ask box position) */}
			{filtered.length > 0 && (
				<div className="mt-10 rounded-2xl border border-border bg-card p-5 flex items-center justify-between gap-4 flex-wrap">
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
