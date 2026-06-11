"use client";

/**
 * Public partner directory — browsable grid + filters. Human twin of
 * GET /api/partners. opencode.ai-style: terminal-ish, monochrome,
 * filter chips, every card carries a freshness badge so a builder never
 * reaches out to a dead integration.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

interface DirectoryPartner {
	slug: string;
	name: string;
	partnerType: string;
	tagline: string | null;
	sectors: string[];
	regions: string[];
	acceptingClients: boolean | null;
	freshness: { status: string };
	verified: { scfInvolvement: string | null; onchainActive: boolean | null };
	websiteUrl: string | null;
}

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

const FRESH_BADGE: Record<string, { label: string; cls: string }> = {
	fresh: { label: "Fresh", cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
	aging: { label: "Aging", cls: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" },
	stale: { label: "Stale", cls: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
	archived: { label: "Archived", cls: "text-red-400 border-red-500/30 bg-red-500/10" },
};

export function PartnersDirectory({ initial }: { initial: DirectoryPartner[] }) {
	const [typeFilter, setTypeFilter] = useState("all");
	const [query, setQuery] = useState("");

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return initial.filter((p) => {
			if (typeFilter !== "all" && p.partnerType !== typeFilter) return false;
			if (q) {
				const hay = `${p.name} ${p.tagline ?? ""} ${p.sectors.join(" ")} ${p.regions.join(" ")}`.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		});
	}, [initial, typeFilter, query]);

	return (
		<main className="max-w-5xl mx-auto px-6 py-12">
			{/* Header */}
			<div className="mb-8">
				<h1 className="text-3xl font-bold text-foreground tracking-tight">
					Stellar Partners
				</h1>
				<p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
					Ecosystem partners you can integrate with — anchors, ramps,
					infrastructure, tooling, protocols. Every profile is
					partner-maintained and freshness-verified, so you never reach out to
					a dead integration. Are you a partner?{" "}
					<Link href="/partners/dashboard" className="text-foreground underline">
						Manage your profile
					</Link>
					.
				</p>
			</div>

			{/* Stats row */}
			<div className="grid grid-cols-3 gap-3 mb-8">
				<Stat n={initial.length} label="partners" />
				<Stat
					n={initial.filter((p) => p.acceptingClients).length}
					label="accepting clients"
				/>
				<Stat
					n={initial.filter((p) => p.freshness.status === "fresh").length}
					label="fresh profiles"
				/>
			</div>

			{/* Search + filters */}
			<div className="rounded-xl border border-border/40 bg-card overflow-hidden mb-6">
				<div className="relative border-b border-border/40">
					<Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
					<input
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search partners…"
						className="w-full pl-11 pr-4 py-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
					/>
				</div>
				<div className="px-4 py-3 flex flex-wrap gap-1.5">
					{TYPE_FILTERS.map((f) => {
						const active = typeFilter === f.key;
						return (
							<button
								type="button"
								key={f.key}
								onClick={() => setTypeFilter(f.key)}
								className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
									active
										? "bg-foreground text-background border-foreground"
										: "border-border/50 text-muted-foreground hover:text-foreground"
								}`}
							>
								{f.label}
							</button>
						);
					})}
				</div>
			</div>

			{/* Grid */}
			{filtered.length === 0 ? (
				<div className="rounded-xl border border-border/40 bg-card/50 p-12 text-center">
					<p className="text-sm text-muted-foreground">
						{initial.length === 0
							? "The partner directory is launching soon — pilot partners are onboarding now."
							: "No partners match this filter. Try widening your search."}
					</p>
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{filtered.map((p) => (
						<PartnerCard key={p.slug} p={p} />
					))}
				</div>
			)}
		</main>
	);
}

function Stat({ n, label }: { n: number; label: string }) {
	return (
		<div className="rounded-xl border border-border/40 bg-card/40 px-4 py-3">
			<div className="text-2xl font-bold text-foreground tabular-nums">{n}</div>
			<div className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
				{label}
			</div>
		</div>
	);
}

function PartnerCard({ p }: { p: DirectoryPartner }) {
	const fresh = FRESH_BADGE[p.freshness.status] ?? FRESH_BADGE.fresh;
	return (
		<Link
			href={`/partners/${p.slug}`}
			className="group block rounded-xl border border-border/40 bg-card p-5 hover:border-white/20 transition-colors"
		>
			<div className="flex items-start justify-between gap-3 mb-2">
				<div className="min-w-0">
					<h3 className="text-sm font-semibold text-foreground truncate group-hover:underline">
						{p.name}
					</h3>
					<div className="text-[11px] text-muted-foreground mt-0.5">
						{TYPE_LABELS[p.partnerType] ?? p.partnerType}
					</div>
				</div>
				<span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border ${fresh.cls}`}>
					{fresh.label}
				</span>
			</div>
			{p.tagline && (
				<p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3">
					{p.tagline}
				</p>
			)}
			{/* sectors + regions chips */}
			{(p.sectors.length > 0 || p.regions.length > 0) && (
				<div className="flex flex-wrap gap-1 mb-3">
					{p.sectors.slice(0, 3).map((s) => (
						<span
							key={s}
							className="text-[10px] text-muted-foreground bg-white/[0.03] border border-border/40 rounded px-1.5 py-0.5"
						>
							{s}
						</span>
					))}
					{p.regions.slice(0, 2).map((r) => (
						<span
							key={r}
							className="text-[10px] text-muted-foreground/70 bg-white/[0.02] border border-border/30 rounded px-1.5 py-0.5"
						>
							{r}
						</span>
					))}
				</div>
			)}
			{/* verified signal + accepting badge */}
			<div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
				{p.verified.onchainActive && (
					<span className="text-emerald-400/80">● on-chain active</span>
				)}
				{p.verified.scfInvolvement && (
					<span className="truncate">· {p.verified.scfInvolvement}</span>
				)}
				{p.acceptingClients && (
					<span className="ml-auto text-foreground/80">accepting clients →</span>
				)}
			</div>
		</Link>
	);
}
