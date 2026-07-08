"use client";

/**
 * Entities & Organizations directory — the who-builds-what map of the ecosystem.
 *
 * Server aggregates each org's project signals (SCF raised, funded count,
 * categories, repos) and hands slim items here; this component does search +
 * sort + category filter client-side (only ~46 orgs) and shows an ecosystem
 * summary strip up top. Visual language matches /partners + /ask.
 */

import { ArrowUpRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EntityLogo } from "@/components/entity-logo";
import { type EntityStats, formatUSD } from "@/lib/entity-stats";

export interface EntityItem {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	// biome-ignore lint/suspicious/noExplicitAny: Payload media shape / url string
	logo: any;
	stats: EntityStats;
}

const SORTS = [
	{ key: "scf", label: "Most funded" },
	{ key: "projects", label: "Most projects" },
	{ key: "name", label: "A–Z" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

export function EntitiesDirectory({ items }: { items: EntityItem[] }) {
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<SortKey>("scf");
	const [category, setCategory] = useState<string>("all");

	// Ecosystem summary + the category filter set, from the data itself.
	const { totalScf, fundedOrgs, totalProjects, categories } = useMemo(() => {
		let totalScf = 0;
		let fundedOrgs = 0;
		let totalProjects = 0;
		const cat = new Map<string, number>();
		for (const it of items) {
			totalScf += it.stats.totalScfUSD;
			if (it.stats.fundedCount > 0) fundedOrgs++;
			totalProjects += it.stats.projectCount;
			for (const c of it.stats.categories) cat.set(c, (cat.get(c) ?? 0) + 1);
		}
		const categories = [...cat.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([c]) => c)
			.slice(0, 8);
		return { totalScf, fundedOrgs, totalProjects, categories };
	}, [items]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		const list = items.filter((it) => {
			if (category !== "all" && !it.stats.categories.includes(category))
				return false;
			if (q) {
				const hay =
					`${it.name} ${it.description ?? ""} ${it.stats.categories.join(" ")}`.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		});
		list.sort((a, b) => {
			if (sort === "name") return a.name.localeCompare(b.name);
			if (sort === "projects")
				return (
					b.stats.projectCount - a.stats.projectCount ||
					b.stats.totalScfUSD - a.stats.totalScfUSD
				);
			// scf
			return (
				b.stats.totalScfUSD - a.stats.totalScfUSD ||
				b.stats.projectCount - a.stats.projectCount
			);
		});
		return list;
	}, [items, query, sort, category]);

	return (
		<div>
			{/* Ecosystem summary strip */}
			<div className="grid grid-cols-3 gap-3 mb-6">
				<Stat label="Organizations" value={String(items.length)} />
				<Stat label="SCF tracked" value={formatUSD(totalScf)} />
				<Stat label="Projects" value={String(totalProjects)} />
			</div>

			{/* Search */}
			<div className="relative mb-3">
				<Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
				<input
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="search organizations by name, category…"
					className="w-full h-12 pl-11 pr-4 bg-card text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border outline-none transition-[border-color,box-shadow] duration-150 focus:border-white/30 focus:shadow-[0_0_0_3px_rgba(253,218,36,0.10)]"
					aria-label="Search organizations"
				/>
			</div>

			{/* Sort + category filters */}
			<div className="flex flex-wrap items-center gap-2 mb-6">
				{SORTS.map((s) => (
					<button
						key={s.key}
						type="button"
						onClick={() => setSort(s.key)}
						className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
							sort === s.key
								? "bg-white/10 text-foreground border-white/25"
								: "bg-white/[0.03] text-muted-foreground border-border hover:text-foreground hover:border-white/25"
						}`}
					>
						{s.label}
					</button>
				))}
				<span className="w-px h-4 bg-border mx-1" />
				<button
					type="button"
					onClick={() => setCategory("all")}
					className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
						category === "all"
							? "bg-white/10 text-foreground border-white/25"
							: "bg-white/[0.03] text-muted-foreground border-border hover:text-foreground hover:border-white/25"
					}`}
				>
					All
				</button>
				{categories.map((c) => (
					<button
						key={c}
						type="button"
						onClick={() => setCategory(c)}
						className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
							category === c
								? "bg-white/10 text-foreground border-white/25"
								: "bg-white/[0.03] text-muted-foreground border-border hover:text-foreground hover:border-white/25"
						}`}
					>
						{c}
					</button>
				))}
			</div>

			<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
				{filtered.length === 0
					? "No organizations match"
					: `${filtered.length} organization${filtered.length === 1 ? "" : "s"}`}
			</h2>

			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
				{filtered.map((it) => (
					<EntityCard key={it.id} item={it} />
				))}
			</div>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-xl border border-border bg-card px-4 py-3">
			<div className="text-lg font-semibold text-foreground tracking-tight">
				{value}
			</div>
			<div className="text-[11px] uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
		</div>
	);
}

function EntityCard({ item }: { item: EntityItem }) {
	const { stats } = item;
	return (
		<Link
			href={`/entities/${item.slug}`}
			className="group flex flex-col p-4 rounded-xl bg-card border border-border hover:border-white/25 hover:bg-white/[0.02] transition-all"
		>
			<div className="flex items-start justify-between gap-3 mb-3">
				<div className="flex items-center gap-2.5 min-w-0">
					<div className="h-9 w-9 rounded-full overflow-hidden border border-border/50 flex-shrink-0">
						<EntityLogo
							logo={item.logo}
							name={item.name}
							size={36}
							className="w-full h-full rounded-full"
							showFallbackIcon
						/>
					</div>
					<span className="font-medium text-foreground group-hover:text-white transition-colors truncate">
						{item.name}
					</span>
				</div>
				<ArrowUpRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground flex-shrink-0 transition-colors" />
			</div>

			{item.description && (
				<p className="text-xs text-muted-foreground/90 leading-snug line-clamp-2 mb-3">
					{item.description}
				</p>
			)}

			{/* Aggregated signals — the substance rolled up from projects */}
			<div className="mt-auto flex flex-wrap items-center gap-1.5">
				{stats.totalScfUSD > 0 && (
					<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.06] text-foreground/90 border border-border font-medium">
						{formatUSD(stats.totalScfUSD)} SCF
					</span>
				)}
				<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.03] text-muted-foreground border border-border">
					{stats.projectCount} project{stats.projectCount === 1 ? "" : "s"}
					{stats.fundedCount > 0 ? ` · ${stats.fundedCount} funded` : ""}
				</span>
				{stats.topCategory && (
					<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.03] text-muted-foreground/80 border border-border">
						{stats.topCategory}
					</span>
				)}
			</div>
		</Link>
	);
}
