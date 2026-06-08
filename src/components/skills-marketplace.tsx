"use client";

import {
	ArrowRight,
	Box,
	Cpu,
	ExternalLink,
	FileCode,
	Github,
	Layers,
	Package,
	Search,
	Sparkles,
	TerminalSquare,
	Wrench,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CopyCommand } from "@/components/copy-command";

export interface UnifiedSkill {
	slug: string;
	name: string;
	tagline?: string;
	description: string;
	source: string;
	kind: string;
	install: string;
	installAlt?: { label: string; command: string }[];
	repository?: string;
	homepage?: string;
	docs?: string;
	compatibility?: string[];
	targetUser?: string[];
	tags?: string[];
	featured?: boolean;
}

const SOURCE_FILTERS = [
	{ key: "all", label: "All" },
	{ key: "stellarlight", label: "Stellarlight" },
	{ key: "sdf", label: "SDF" },
	{ key: "external", label: "Stellar ecosystem" },
	{ key: "lumenloop", label: "Lumenloop" },
] as const;

const KIND_FILTERS = [
	{ key: "all", label: "All", icon: Layers },
	{ key: "skill-md", label: "SKILL.md", icon: FileCode },
	{ key: "mcp-server", label: "MCP server", icon: Box },
	{ key: "sdk", label: "SDK", icon: Package },
	{ key: "cli", label: "CLI", icon: TerminalSquare },
	{ key: "agent-kit", label: "Agent kit", icon: Cpu },
	{ key: "tool", label: "Other", icon: Sparkles },
] as const;

function sourceBadgeClass(_source: string): string {
	// Neutral palette across the board so no source competes visually with
	// the card content. Community submissions are paused in the UI — when we
	// re-enable them, give them a subtle accent here to make them scannable.
	return "bg-white/5 text-muted-foreground border-border/50";
}

function kindIcon(kind: string) {
	switch (kind) {
		case "mcp-server":
			return Box;
		case "sdk":
			return Package;
		case "cli":
			return TerminalSquare;
		case "agent-kit":
			return Cpu;
		case "tool":
			return Wrench;
		default:
			return FileCode;
	}
}

export function SkillsMarketplace({ initialSkills }: { initialSkills: UnifiedSkill[] }) {
	const [sourceFilter, setSourceFilter] = useState<string>("all");
	const [kindFilter, setKindFilter] = useState<string>("all");
	const [query, setQuery] = useState("");

	const featuredSkills = useMemo(
		() => initialSkills.filter((s) => s.featured),
		[initialSkills],
	);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		const noFiltersActive =
			sourceFilter === "all" && kindFilter === "all" && q.length === 0;
		return initialSkills.filter((s) => {
			// Default-state behaviour: hide featured from the grid when no
			// filter or search is active, since they're already prominent in
			// the Featured row above. When the user filters or searches,
			// featured skills join the grid like any other card so they show
			// up alongside their peers (e.g. filter = Stellarlight → Scout +
			// Scout MCP appear in both the Featured row AND the grid).
			if (noFiltersActive && s.featured) return false;
			if (sourceFilter !== "all" && s.source !== sourceFilter) return false;
			if (kindFilter !== "all" && s.kind !== kindFilter) return false;
			if (q) {
				const hay = `${s.name} ${s.tagline ?? ""} ${s.description} ${(s.tags ?? []).join(" ")}`.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		});
	}, [initialSkills, sourceFilter, kindFilter, query]);

	const countBySource = useMemo(() => {
		const m: Record<string, number> = {};
		for (const s of initialSkills) m[s.source] = (m[s.source] ?? 0) + 1;
		return m;
	}, [initialSkills]);

	const kindsCount = useMemo(
		() => new Set(initialSkills.map((s) => s.kind)).size,
		[initialSkills],
	);
	const sourcesCount = useMemo(
		() => new Set(initialSkills.map((s) => s.source)).size,
		[initialSkills],
	);

	return (
		<div className="min-h-screen relative">
			<main className="container mx-auto px-6 py-12 pt-24 max-w-6xl">
				{/* Hero — opencode.ai-style: clean statement, install-first */}
				<div className="mb-12">
					<h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.05] mb-6 max-w-3xl">
						Every Stellar AI tool, in one place.
					</h1>
					<p className="text-base md:text-lg text-muted-foreground max-w-2xl mb-10 leading-relaxed">
						Install SKILL.md files, MCP servers, and SDKs for Stellar in one
						command. SDF's official skills, Stellarlight tools, lumenloop's
						MCP + 8 companion skills, and the broader Stellar ecosystem — all
						in one marketplace.
					</p>

					{/* Stats row — opencode-style metrics */}
					<div className="grid grid-cols-3 gap-px rounded-xl border border-border/40 bg-border/40 overflow-hidden">
						<div className="bg-card px-4 py-3">
							<div className="text-xl md:text-2xl font-bold text-foreground tabular-nums">
								{initialSkills.length}
							</div>
							<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mt-0.5">
								Skills
							</div>
						</div>
						<div className="bg-card px-4 py-3">
							<div className="text-xl md:text-2xl font-bold text-foreground tabular-nums">
								{sourcesCount}
							</div>
							<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mt-0.5">
								Sources
							</div>
						</div>
						<div className="bg-card px-4 py-3">
							<div className="text-xl md:text-2xl font-bold text-foreground tabular-nums">
								{kindsCount}
							</div>
							<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mt-0.5">
								Kinds
							</div>
						</div>
					</div>

					{/* Secondary CTAs */}
					<div className="flex flex-wrap items-center gap-3 mt-6">
						<a
							href="/api/skills"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-white/5 hover:border-white/20 transition-colors"
						>
							API <ExternalLink className="w-3.5 h-3.5" />
						</a>
					</div>
				</div>

				{/* "What is a skill?" explainer — tight inline block */}
				<p className="text-xs text-muted-foreground leading-relaxed mb-12 max-w-3xl">
					<span className="text-foreground font-medium">
						New to AI skills?
					</span>{" "}
					A skill is a small file your AI agent loads to gain a specific
					capability — researching Stellar projects, swapping on Soroswap,
					writing Soroban contracts. Install with{" "}
					<code className="text-foreground font-mono text-[11px] px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
						npx skills add …
					</code>{" "}
					(SKILL.md) or{" "}
					<code className="text-foreground font-mono text-[11px] px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
						npx @some/mcp-server
					</code>{" "}
					(MCP), and your agent learns to do that thing.
				</p>

				{/* Featured row — Scout + Scout MCP at the top.
				    Always visible regardless of filter state. Filter chips
				    narrow only the "Browse all" grid below — the Featured row
				    + advantage block are persistent Scout positioning that
				    every /skills visitor should see. */}
				{featuredSkills.length > 0 && (
					<div className="mb-12">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-4">
							Featured
						</div>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							{featuredSkills.map((s) => (
								<FeaturedCard key={s.slug} skill={s} />
							))}
						</div>

						{/* Stellarlight advantage — what makes Scout different from competing
						    Stellar AI tools. Opencode-style bullets, text-first. */}
						<div className="mt-6 rounded-xl border border-border/40 bg-card/40 p-5">
							<div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-3">
								Why Stellar Scout
							</div>
							<ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5 text-xs leading-relaxed">
								{[
									"4,541-chunk research corpus across 9 primary sources",
									"Severity-tagged Soroban audit findings (Certora · OtterSec · Halborn · Code4rena · 9 more)",
									"Electric Capital macro data + SCF Handbook + Mazières SCP paper",
									"14 open REST endpoints — anyone can build on stellarlight's data layer",
									"Both SKILL.md and MCP — install in Claude Code, Cursor, Claude.ai, ChatGPT, Gemini, Continue, Zed",
									"8-step Deep Dive workflow with gap classification + evidence floor",
								].map((line) => (
									<li
										key={line}
										className="flex items-start gap-2 text-muted-foreground"
									>
										<span className="font-mono text-muted-foreground/50 select-none">
											[+]
										</span>
										<span>{line}</span>
									</li>
								))}
							</ul>
						</div>
					</div>
				)}

				{/* All skills heading + search + filters — consolidated block */}
				<div className="mb-6">
					<div className="flex items-baseline justify-between mb-4">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
							Browse all
						</div>
						<div className="text-[10px] text-muted-foreground/60 tabular-nums">
							Showing {filtered.length} of {initialSkills.length}
						</div>
					</div>

					<div className="rounded-xl border border-border/40 bg-card overflow-hidden">
						{/* Search bar */}
						<div className="relative border-b border-border/40">
							<Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
							<input
								type="text"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Search skills…"
								className="w-full pl-11 pr-4 py-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
							/>
						</div>

						{/* Source filter row */}
						<div className="border-b border-border/40 px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
							<span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 w-14 flex-shrink-0">
								Source
							</span>
							<div className="flex flex-wrap gap-1.5">
								{SOURCE_FILTERS.map((f) => {
									const active = sourceFilter === f.key;
									const count =
										f.key === "all"
											? initialSkills.length
											: (countBySource[f.key] ?? 0);
									return (
										<button
											type="button"
											key={f.key}
											onClick={() => setSourceFilter(f.key)}
											className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors ${
												active
													? "bg-white text-[#171717] border-white"
													: "bg-transparent text-muted-foreground border-border/60 hover:border-white/30 hover:text-foreground"
											}`}
										>
											{f.label}
											<span
												className={`text-[9px] font-mono tabular-nums ${active ? "text-[#171717]/60" : "text-muted-foreground/60"}`}
											>
												{count}
											</span>
										</button>
									);
								})}
							</div>
						</div>

						{/* Kind filter row */}
						<div className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
							<span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 w-14 flex-shrink-0">
								Kind
							</span>
							<div className="flex flex-wrap gap-1.5">
								{KIND_FILTERS.map((f) => {
									const Icon = f.icon;
									const active = kindFilter === f.key;
									return (
										<button
											type="button"
											key={f.key}
											onClick={() => setKindFilter(f.key)}
											className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors ${
												active
													? "bg-white text-[#171717] border-white"
													: "bg-transparent text-muted-foreground border-border/60 hover:border-white/30 hover:text-foreground"
											}`}
										>
											<Icon className="w-3 h-3" />
											{f.label}
										</button>
									);
								})}
							</div>
						</div>
					</div>
				</div>

				{/* Cards */}
				{filtered.length === 0 ? (
					<div className="rounded-xl border border-border/40 bg-card/50 p-12 text-center">
						<p className="text-sm text-muted-foreground">
							No skills match this filter. Try widening your search.
						</p>
					</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{filtered.map((s) => (
							<SkillCard key={s.slug} skill={s} />
						))}
					</div>
				)}

			</main>
		</div>
	);
}

function SkillCard({ skill }: { skill: UnifiedSkill }) {
	const Icon = kindIcon(skill.kind);
	return (
		<div className="group rounded-xl border border-border/40 bg-card p-5 hover:border-white/20 transition-colors flex flex-col">
			{/* Header — name + source badge */}
			<div className="flex items-start justify-between gap-3 mb-3">
				<div className="flex items-start gap-3 min-w-0">
					<div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/5 border border-border/50 flex items-center justify-center">
						<Icon className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
					</div>
					<div className="min-w-0">
						<h3 className="text-sm font-semibold text-foreground truncate">
							<Link
								href={`/skills/${skill.slug}`}
								className="hover:underline focus:outline-none focus:underline"
							>
								{skill.name}
							</Link>
						</h3>
						{skill.tagline && (
							<p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
								{skill.tagline}
							</p>
						)}
					</div>
				</div>
				<span
					className={`flex-shrink-0 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${sourceBadgeClass(skill.source)}`}
				>
					{skill.source === "sdf" ? "SDF" : skill.source}
				</span>
			</div>

			{/* Compatibility badges */}
			{skill.compatibility && skill.compatibility.length > 0 && (
				<div className="flex flex-wrap items-center gap-1 mb-3">
					<span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mr-1">
						Works in
					</span>
					{skill.compatibility.slice(0, 3).map((c) => (
						<span
							key={c}
							className="text-[10px] text-muted-foreground bg-white/[0.03] border border-border/40 rounded px-1.5 py-0.5"
						>
							{c}
						</span>
					))}
					{skill.compatibility.length > 3 && (
						<span className="text-[10px] text-muted-foreground/60">
							+{skill.compatibility.length - 3}
						</span>
					)}
				</div>
			)}

			{/* Install — terminal-y */}
			<div className="mb-3">
				<CopyCommand
					command={skill.install}
					className="flex items-center gap-2 rounded-lg bg-black/40 border border-border/30 px-3 py-2 font-mono text-xs text-foreground overflow-hidden"
				/>
			</div>

			{/* Footer — tags + links */}
			<div className="mt-auto pt-3 border-t border-border/30 flex items-center justify-between gap-2 flex-wrap">
				<div className="flex flex-wrap gap-1">
					{(skill.tags ?? []).slice(0, 3).map((tag) => (
						<span
							key={tag}
							className="text-[10px] text-muted-foreground bg-white/[0.03] border border-border/40 rounded px-1.5 py-0.5"
						>
							{tag}
						</span>
					))}
				</div>
				<div className="flex items-center gap-3">
					{skill.repository && (
						<a
							href={skill.repository}
							target="_blank"
							rel="noopener noreferrer"
							className="text-muted-foreground hover:text-foreground transition-colors"
							aria-label="Repository"
							title="Repository"
						>
							<Github className="w-3.5 h-3.5" />
						</a>
					)}
					<Link
						href={`/skills/${skill.slug}`}
						className="text-muted-foreground hover:text-foreground transition-colors text-[11px] font-medium inline-flex items-center gap-1"
					>
						Details <ArrowRight className="w-3 h-3" />
					</Link>
				</div>
			</div>
		</div>
	);
}

/**
 * Featured card — taller, more prominent variant for hero placement. Shows
 * the alt install commands (`-a codex`, `-a openclaw`) and a longer
 * description than the regular grid card.
 */
function FeaturedCard({ skill }: { skill: UnifiedSkill }) {
	const Icon = kindIcon(skill.kind);
	return (
		<div className="group rounded-xl border border-border/40 bg-card p-6 hover:border-white/20 transition-colors flex flex-col">
			{/* Header */}
			<div className="flex items-start gap-3 mb-4">
				<div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/5 border border-border/50 flex items-center justify-center">
					<Icon className="w-5 h-5 text-foreground" />
				</div>
				<div className="min-w-0 flex-1">
					<h3 className="text-base font-semibold text-foreground mb-1">
						<Link
							href={`/skills/${skill.slug}`}
							className="hover:underline focus:outline-none focus:underline"
						>
							{skill.name}
						</Link>
					</h3>
					{skill.tagline && (
						<p className="text-xs text-muted-foreground leading-relaxed">
							{skill.tagline}
						</p>
					)}
				</div>
			</div>

			{/* Compatibility */}
			{skill.compatibility && skill.compatibility.length > 0 && (
				<div className="flex flex-wrap items-center gap-1 mb-4">
					<span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mr-1">
						Works in
					</span>
					{skill.compatibility.slice(0, 4).map((c) => (
						<span
							key={c}
							className="text-[10px] text-muted-foreground bg-white/[0.03] border border-border/40 rounded px-1.5 py-0.5"
						>
							{c}
						</span>
					))}
					{skill.compatibility.length > 4 && (
						<span className="text-[10px] text-muted-foreground/60">
							+{skill.compatibility.length - 4}
						</span>
					)}
				</div>
			)}

			{/* Primary install — terminal-y aesthetic */}
			<div className="mb-2">
				<CopyCommand
					command={skill.install}
					className="flex items-center gap-2 rounded-lg bg-black/40 border border-border/30 px-3 py-2 font-mono text-xs text-foreground overflow-hidden"
				/>
			</div>

			{/* Alt installs (e.g. -a codex, -a openclaw) */}
			{skill.installAlt && skill.installAlt.length > 0 && (
				<div className="mb-4 space-y-1">
					{skill.installAlt.map((alt) => (
						<div
							key={alt.label}
							className="flex items-center gap-2 text-[11px] text-muted-foreground"
						>
							<span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 w-14 flex-shrink-0">
								{alt.label}
							</span>
							<code className="font-mono text-muted-foreground/80 text-[10.5px] truncate">
								{alt.command}
							</code>
						</div>
					))}
				</div>
			)}

			{/* Footer — tags + links */}
			<div className="mt-auto pt-3 border-t border-border/30 flex items-center justify-between gap-2 text-[11px]">
				<div className="flex flex-wrap gap-1">
					{(skill.tags ?? []).slice(0, 4).map((tag) => (
						<span
							key={tag}
							className="text-[10px] text-muted-foreground bg-white/[0.03] border border-border/40 rounded px-1.5 py-0.5"
						>
							{tag}
						</span>
					))}
				</div>
				<div className="flex items-center gap-3 flex-shrink-0">
					{skill.repository && (
						<a
							href={skill.repository}
							target="_blank"
							rel="noopener noreferrer"
							className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
						>
							<Github className="w-3.5 h-3.5" />
							<span className="hidden sm:inline">Repo</span>
						</a>
					)}
					<Link
						href={`/skills/${skill.slug}`}
						className="text-foreground font-medium hover:text-foreground/80 transition-colors inline-flex items-center gap-1"
					>
						Details <ArrowRight className="w-3 h-3" />
					</Link>
				</div>
			</div>
		</div>
	);
}
