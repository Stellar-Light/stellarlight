"use client";

/**
 * The builds of one hackathon event (/hackathons/<slug>): a toolbar
 * (search, what to show, track) over a card grid. The page shapes every row
 * on the server; nothing here reads data. The builders directory's shells:
 * the filter button, the search field and idea-card.
 */

import {
	Boxes,
	ChevronDown,
	ExternalLink,
	Github,
	Layers,
	Link2,
	Search,
	SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryState } from "@/hooks/use-query-state";
import { cn } from "@/lib/utils";

/** One build as its card shows it, shaped by the event page. */
export type BuildCardRow = {
	id: string;
	name: string;
	/** Where its name goes: its repo, else its directory project or page. */
	href: string;
	external: boolean;
	/** Its GitHub repo, when it names one. */
	repo: string | null;
	track: string | null;
	/** A placement badge, its classes the page's placement styles. */
	placement: { label: string; classes: string } | null;
	isWinner: boolean;
	/** The directory's post-event status (Built, In Progress, Abandoned). */
	status: string | null;
	blurb: string | null;
	/** Contracts its repo cites that passed Scout's checks. */
	contracts: number;
	/** Libraries the repo declares, when its repo was read. */
	stack: string[];
	project: { slug: string; name: string } | null;
	links: Array<{ label: string; href: string }>;
};

const SHOWS = ["all", "winners", "onchain", "directory"] as const;
type Show = (typeof SHOWS)[number];
const SHOW_LABEL: Record<Show, string> = {
	all: "All builds",
	winners: "Winners",
	onchain: "With testnet contracts",
	directory: "In the directory",
};
const showing: Record<Show, (r: BuildCardRow) => boolean> = {
	all: () => true,
	winners: (r) => r.isWinner,
	onchain: (r) => r.contracts > 0,
	directory: (r) => r.project !== null,
};

const STATUS_CLASSES: Record<string, string> = {
	Built: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
	"In Progress": "bg-blue-500/15 text-blue-400 border-blue-500/30",
	Abandoned: "bg-white/5 text-muted-foreground border-border/50",
};

// Cards per page, as the builders directory pages them.
const PAGE = 48;

// The site-wide filter-button shell (builders directory).
const btnBase =
	"h-11 px-4 inline-flex items-center justify-between gap-2 rounded-xl bg-card border border-border/50 text-foreground hover:bg-white/[0.04] transition-colors";
const chip =
	"inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full border whitespace-nowrap";

export function HackathonBuildsGrid({ rows }: { rows: BuildCardRow[] }) {
	const [q, setQ] = useQueryState("q", "");
	const [show, setShow] = useQueryState<Show>("show", "all", SHOWS);
	const [track, setTrack] = useQueryState("track", "");
	const [lib, setLib] = useQueryState("library", "");
	const [pages, setPages] = useState(1);

	const counts = useMemo(() => {
		const tracks = new Map<string, number>();
		const libs = new Map<string, number>();
		for (const r of rows) {
			if (r.track) tracks.set(r.track, (tracks.get(r.track) ?? 0) + 1);
			for (const l of r.stack) libs.set(l, (libs.get(l) ?? 0) + 1);
		}
		return {
			libs: [...libs].sort((a, b) => b[1] - a[1]),
			show: Object.fromEntries(
				SHOWS.map((s) => [s, rows.filter(showing[s]).length]),
			) as Record<Show, number>,
			tracks: [...tracks].sort((a, b) => b[1] - a[1]),
		};
	}, [rows]);

	const shown = useMemo(() => {
		const needle = q.trim().toLowerCase();
		return rows.filter(
			(r) =>
				showing[show](r) &&
				(!track || r.track === track) &&
				(!lib || r.stack.includes(lib)) &&
				(!needle ||
					`${r.name} ${r.blurb ?? ""} ${r.track ?? ""} ${r.stack.join(" ")} ${r.project?.name ?? ""}`
						.toLowerCase()
						.includes(needle)),
		);
	}, [rows, q, show, track, lib]);

	const hasFilters =
		q.trim() !== "" || show !== "all" || track !== "" || lib !== "";
	const visible = shown.slice(0, pages * PAGE);
	const shows = SHOWS.filter((s) => s === "all" || counts.show[s] > 0);

	return (
		<div>
			{rows.length > 6 && (
				<div className="flex flex-col md:flex-row gap-3 mb-6">
					<div className="relative flex-1">
						<Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
						<input
							type="text"
							value={q}
							onChange={(e) => {
								setQ(e.target.value);
								setPages(1);
							}}
							placeholder="Search name, description, track or library"
							aria-label="Search builds"
							className="w-full h-11 pl-11 pr-4 bg-card text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-white/30 focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]"
						/>
					</div>
					{(shows.length > 1 ||
						counts.tracks.length > 1 ||
						counts.libs.length > 1) && (
						<div className="grid grid-cols-2 md:flex gap-3">
							{shows.length > 1 && (
								<DropdownMenu>
									<DropdownMenuTrigger
										className={cn(btnBase, "md:min-w-[210px]")}
									>
										<SlidersHorizontal className="w-4 h-4 text-muted-foreground flex-shrink-0" />
										<span className="flex-1 text-left text-sm truncate">
											{SHOW_LABEL[show]}
										</span>
										<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
									</DropdownMenuTrigger>
									<DropdownMenuContent className="w-[230px]">
										{shows.map((s) => (
											<DropdownMenuItem
												key={s}
												onClick={() => {
													setShow(s);
													setPages(1);
												}}
												className={cn(
													"flex items-center justify-between gap-3",
													show === s
														? "bg-white/10 text-foreground"
														: "text-foreground hover:bg-white/5",
												)}
											>
												<span>{SHOW_LABEL[s]}</span>
												<span className="text-xs text-muted-foreground tabular-nums">
													{counts.show[s]}
												</span>
											</DropdownMenuItem>
										))}
									</DropdownMenuContent>
								</DropdownMenu>
							)}
							{counts.tracks.length > 1 && (
								<DropdownMenu>
									<DropdownMenuTrigger
										className={cn(btnBase, "md:min-w-[190px]")}
									>
										<Layers className="w-4 h-4 text-muted-foreground flex-shrink-0" />
										<span className="flex-1 text-left text-sm truncate">
											{track || "All tracks"}
										</span>
										<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
									</DropdownMenuTrigger>
									<DropdownMenuContent className="w-[230px] max-h-[400px] overflow-y-auto">
										<DropdownMenuItem
											onClick={() => {
												setTrack("");
												setPages(1);
											}}
											className={
												track === ""
													? "bg-white/10 text-foreground"
													: "text-foreground hover:bg-white/5"
											}
										>
											All tracks
										</DropdownMenuItem>
										{counts.tracks.map(([t, n]) => (
											<DropdownMenuItem
												key={t}
												onClick={() => {
													setTrack(t);
													setPages(1);
												}}
												className={cn(
													"flex items-center justify-between gap-3",
													track === t
														? "bg-white/10 text-foreground"
														: "text-foreground hover:bg-white/5",
												)}
											>
												<span className="truncate">{t}</span>
												<span className="text-xs text-muted-foreground tabular-nums">
													{n}
												</span>
											</DropdownMenuItem>
										))}
									</DropdownMenuContent>
								</DropdownMenu>
							)}
							{counts.libs.length > 1 && (
								<DropdownMenu>
									<DropdownMenuTrigger
										className={cn(btnBase, "md:min-w-[190px]")}
									>
										<Boxes className="w-4 h-4 text-muted-foreground flex-shrink-0" />
										<span className="flex-1 text-left text-sm truncate">
											{lib || "All libraries"}
										</span>
										<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
									</DropdownMenuTrigger>
									<DropdownMenuContent className="w-[250px] max-h-[400px] overflow-y-auto">
										<DropdownMenuItem
											onClick={() => {
												setLib("");
												setPages(1);
											}}
											className={
												lib === ""
													? "bg-white/10 text-foreground"
													: "text-foreground hover:bg-white/5"
											}
										>
											All libraries
										</DropdownMenuItem>
										{counts.libs.map(([l, n]) => (
											<DropdownMenuItem
												key={l}
												onClick={() => {
													setLib(l);
													setPages(1);
												}}
												className={cn(
													"flex items-center justify-between gap-3",
													lib === l
														? "bg-white/10 text-foreground"
														: "text-foreground hover:bg-white/5",
												)}
											>
												<span className="truncate">{l}</span>
												<span className="text-xs text-muted-foreground tabular-nums">
													{n}
												</span>
											</DropdownMenuItem>
										))}
									</DropdownMenuContent>
								</DropdownMenu>
							)}
						</div>
					)}
				</div>
			)}

			{hasFilters && (
				<div className="flex items-baseline justify-between gap-4 mb-4 text-xs text-muted-foreground">
					<span className="font-semibold uppercase tracking-wider tabular-nums">
						{shown.length === 0
							? "No builds match"
							: `${shown.length} of ${rows.length}`}
					</span>
					<button
						type="button"
						onClick={() => {
							setQ("");
							setShow("all");
							setTrack("");
							setLib("");
							setPages(1);
						}}
						className="hover:text-foreground transition-colors"
					>
						Clear filters
					</button>
				</div>
			)}

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{visible.map((r) => (
					<BuildCard key={r.id} r={r} />
				))}
			</div>

			{visible.length < shown.length && (
				<div className="mt-8 text-center">
					<button
						type="button"
						onClick={() => setPages((p) => p + 1)}
						className={cn(btnBase, "justify-center text-sm")}
					>
						Show {Math.min(PAGE, shown.length - visible.length)} more
						<span className="text-muted-foreground tabular-nums">
							{visible.length} of {shown.length}
						</span>
					</button>
				</div>
			)}
		</div>
	);
}

/** "owner/repo" of a GitHub URL, or null. */
const repoPath = (url: string | null) =>
	url ? (/github\.com\/([^/?#]+\/[^/?#]+)/i.exec(url)?.[1] ?? null) : null;

function BuildCard({ r }: { r: BuildCardRow }) {
	const path = repoPath(r.repo);
	const owner = path?.split("/")[0];
	const nameClass =
		"hover:text-white hover:underline underline-offset-4 transition-colors";
	return (
		<div className="idea-card rounded-xl p-5 flex flex-col h-full">
			<div className="flex items-start gap-3">
				{owner ? (
					// biome-ignore lint/performance/noImgElement: a GitHub avatar, no optimisation wanted
					<img
						src={`https://github.com/${owner}.png?size=64`}
						alt=""
						width={32}
						height={32}
						loading="lazy"
						className="w-8 h-8 rounded-full border border-border/50 bg-white/[0.04] flex-shrink-0"
					/>
				) : null}
				<div className="min-w-0 flex-1">
					<h3 className="text-base font-semibold text-foreground leading-tight break-words">
						{r.external ? (
							<a
								href={r.href}
								target="_blank"
								rel="noopener noreferrer"
								className={nameClass}
							>
								{r.name}
							</a>
						) : (
							<Link href={r.href} className={nameClass}>
								{r.name}
							</Link>
						)}
					</h3>
					{path && (
						<p className="mt-0.5 text-xs text-muted-foreground truncate">
							{path}
						</p>
					)}
				</div>
				{r.placement && (
					<span
						className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border flex-shrink-0 ${r.placement.classes}`}
					>
						{r.placement.label}
					</span>
				)}
			</div>

			{(r.track || r.status || r.contracts > 0) && (
				<div className="mt-3 flex flex-wrap items-center gap-1.5">
					{r.contracts > 0 && (
						<span
							className={cn(
								chip,
								"border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
							)}
							title="Contracts its repo cites that exist on testnet and were created during the event"
						>
							<span
								className="h-1.5 w-1.5 rounded-full bg-emerald-400"
								aria-hidden
							/>
							{r.contracts === 1
								? "1 contract on testnet"
								: `${r.contracts} contracts on testnet`}
						</span>
					)}
					{r.track && (
						<span className={cn(chip, "border-border/60 text-foreground/80")}>
							{r.track}
						</span>
					)}
					{r.status && (
						<span
							className={cn(
								chip,
								STATUS_CLASSES[r.status] ??
									"border-border/60 text-muted-foreground",
							)}
						>
							{r.status}
						</span>
					)}
				</div>
			)}

			{r.blurb && (
				<p className="mt-3 text-sm text-muted-foreground line-clamp-2 leading-relaxed">
					{r.blurb}
				</p>
			)}

			{r.stack.length > 0 && (
				<div className="mt-3 flex flex-wrap items-center gap-1.5">
					{r.stack.slice(0, 3).map((s) => (
						<span
							key={s}
							className="px-2 py-0.5 text-xs rounded-md border border-border bg-white/[0.06] text-foreground/90 whitespace-nowrap"
						>
							{s}
						</span>
					))}
					{r.stack.length > 3 && (
						<span
							className="text-xs text-muted-foreground"
							title={r.stack.slice(3).join(", ")}
						>
							+{r.stack.length - 3}
						</span>
					)}
				</div>
			)}

			{(r.repo || r.links.length > 0 || r.project) && (
				<div className="mt-auto pt-4">
					<div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-3 border-t border-border text-xs text-muted-foreground">
						{r.repo && (
							<a
								href={r.repo}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white/[0.06] px-2.5 py-1 text-foreground hover:border-white/30 transition-colors"
							>
								<Github className="w-3.5 h-3.5" />
								GitHub
							</a>
						)}
						{r.links.map((l) => (
							<a
								key={l.label}
								href={l.href}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
							>
								{l.label}
								<ExternalLink className="w-3 h-3" />
							</a>
						))}
						{r.project && (
							<Link
								href={`/project/${r.project.slug}`}
								title="In the Stellar Light directory"
								className="ml-auto inline-flex min-w-0 items-center gap-1 rounded-md border border-border/60 px-2 py-0.5 text-foreground/90 hover:border-white/30 transition-colors"
							>
								<Link2 className="w-3 h-3 flex-shrink-0" />
								<span className="truncate">{r.project.name}</span>
							</Link>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
