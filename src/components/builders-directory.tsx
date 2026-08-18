"use client";

import {
	Briefcase,
	Code2,
	GitBranch,
	Github,
	Globe,
	MapPin,
	Search,
	Twitter,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/** Serializable row the server builds from Passport + our repos index. */
export type BuilderRowData = {
	handle: string;
	name: string;
	avatar: string | null;
	role: string | null;
	location: string | null;
	bio: string | null;
	twitter: string | null;
	website: string | null;
	featured: boolean;
	commits30d: number;
	passportProjects: number;
	repos: number;
	stars: number;
	commits90d: number;
	lastCommitAt: string | null;
	projects: Array<{ slug: string; name: string }>;
	languages: string[];
	ambassador: { tier: string; region?: string } | null;
	/** ISO-3166 alpha-2 from the free-text location, when we can tell */
	country: { code: string; name: string } | null;
};

const flag = (code: string) =>
	String.fromCodePoint(
		...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
	);

type SortKey = "active" | "repos" | "stars" | "recent" | "name";
const SORTS: Array<{ key: SortKey; label: string }> = [
	{ key: "active", label: "Most active" },
	{ key: "recent", label: "Recently active" },
	{ key: "repos", label: "Most repos" },
	{ key: "stars", label: "Most stars" },
	{ key: "name", label: "A to Z" },
];

function ago(iso: string | null | undefined): string | null {
	if (!iso) return null;
	const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
	if (!Number.isFinite(d)) return null;
	if (d <= 0) return "today";
	if (d === 1) return "yesterday";
	if (d < 30) return `${d}d ago`;
	if (d < 365) return `${Math.floor(d / 30)}mo ago`;
	return `${Math.floor(d / 365)}y ago`;
}

const heat = (r: BuilderRowData) => r.commits30d * 3 + r.commits90d;
const recentCut = () => Date.now() - 90 * 86_400_000;
const isRecent = (r: BuilderRowData) =>
	heat(r) > 0 || Date.parse(r.lastCommitAt ?? "") > recentCut();

export function BuildersDirectory({ rows }: { rows: BuilderRowData[] }) {
	const [q, setQ] = useState("");
	const [sort, setSort] = useState<SortKey>("active");
	const [onlyActive, setOnlyActive] = useState(false);
	const [onlyProjects, setOnlyProjects] = useState(false);
	const [onlyAmbassadors, setOnlyAmbassadors] = useState(false);
	const [country, setCountry] = useState<string | null>(null);

	const hasAmbassadors = rows.some((r) => r.ambassador);
	// the regions people are in, most common first (round flag toggles)
	const countries = useMemo(() => {
		const c = new Map<string, { code: string; name: string; n: number }>();
		for (const r of rows) {
			if (!r.country) continue;
			const e = c.get(r.country.code) ?? { ...r.country, n: 0 };
			e.n += 1;
			c.set(r.country.code, e);
		}
		return [...c.values()].sort((a, b) => b.n - a.n).slice(0, 8);
	}, [rows]);

	const shown = useMemo(() => {
		const needle = q.trim().toLowerCase();
		let list = rows.filter((r) => {
			if (onlyActive && !isRecent(r)) return false;
			if (onlyProjects && r.projects.length === 0 && r.passportProjects === 0)
				return false;
			if (onlyAmbassadors && !r.ambassador) return false;
			if (country && r.country?.code !== country) return false;
			if (needle) {
				const hay =
					`${r.name} ${r.handle} ${r.role ?? ""} ${r.location ?? ""} ${r.bio ?? ""} ${r.projects.map((p) => p.name).join(" ")} ${r.languages.join(" ")}`.toLowerCase();
				if (!hay.includes(needle)) return false;
			}
			return true;
		});
		const t = (iso: string | null) => Date.parse(iso ?? "0") || 0;
		const cmp: Record<
			SortKey,
			(a: BuilderRowData, b: BuilderRowData) => number
		> = {
			active: (a, b) =>
				heat(b) - heat(a) ||
				t(b.lastCommitAt) - t(a.lastCommitAt) ||
				a.name.localeCompare(b.name),
			recent: (a, b) =>
				t(b.lastCommitAt) - t(a.lastCommitAt) || heat(b) - heat(a),
			repos: (a, b) => b.repos - a.repos || b.stars - a.stars,
			stars: (a, b) => b.stars - a.stars || b.repos - a.repos,
			name: (a, b) => a.name.localeCompare(b.name),
		};
		list = [...list].sort(
			(a, b) => Number(b.featured) - Number(a.featured) || cmp[sort](a, b),
		);
		return list;
	}, [rows, q, sort, onlyActive, onlyProjects, onlyAmbassadors, country]);

	const chip = (on: boolean, onClick: () => void, label: string) => (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={on}
			className={`rounded-full border px-3 py-1 text-xs transition-colors ${on ? "border-white/40 bg-white/[0.08] text-foreground" : "border-border text-muted-foreground hover:text-foreground hover:border-white/25"}`}
		>
			{label}
		</button>
	);

	return (
		<div>
			{/* toolbar */}
			<div className="mb-6 space-y-3">
				<div className="flex flex-col md:flex-row gap-3 md:items-center">
					<div className="relative w-full md:max-w-md">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<input
							value={q}
							onChange={(e) => setQ(e.target.value)}
							placeholder="Search builders"
							aria-label="Search builders"
							className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/30"
						/>
					</div>
					<div className="flex flex-wrap items-center gap-1.5">
						<span className="text-xs text-muted-foreground mr-1">Sort</span>
						{SORTS.map((s) =>
							chip(sort === s.key, () => setSort(s.key), s.label),
						)}
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{chip(
						onlyActive,
						() => setOnlyActive((v) => !v),
						"Active in 90 days",
					)}
					{chip(onlyProjects, () => setOnlyProjects((v) => !v), "Has projects")}
					{hasAmbassadors &&
						chip(
							onlyAmbassadors,
							() => setOnlyAmbassadors((v) => !v),
							"Ambassadors",
						)}
					{countries.length > 0 && <span className="mx-1 h-4 w-px bg-border" />}
					{countries.map((c) => (
						<button
							key={c.code}
							type="button"
							onClick={() => setCountry(country === c.code ? null : c.code)}
							aria-pressed={country === c.code}
							title={`${c.name} (${c.n})`}
							aria-label={`Only ${c.name}`}
							className={`h-8 w-8 rounded-full border text-base leading-none flex items-center justify-center transition-colors ${country === c.code ? "border-white/50 bg-white/[0.08]" : "border-border hover:border-white/25"}`}
						>
							{flag(c.code)}
						</button>
					))}
				</div>
				<p className="text-xs text-muted-foreground tabular-nums">
					{shown.length === rows.length
						? `${rows.length} builders`
						: `${shown.length} of ${rows.length} builders`}
				</p>
			</div>

			{shown.length === 0 ? (
				<Card className="border border-border/50 bg-card">
					<CardContent className="py-14 text-center text-sm text-muted-foreground">
						No one matches that yet. Clear a filter, or try a project or
						language name.
					</CardContent>
				</Card>
			) : (
				<div className="space-y-3">
					{shown.map((r) => (
						<BuilderCard key={r.handle} r={r} />
					))}
				</div>
			)}
		</div>
	);
}

function BuilderCard({ r }: { r: BuilderRowData }) {
	const twitterUrl = r.twitter
		? `https://twitter.com/${r.twitter.replace("@", "").replace("https://x.com/", "").replace("https://twitter.com/", "")}`
		: null;
	return (
		<Card
			className={`relative border ${r.featured ? "border-white/20 bg-card" : "border-border/50 bg-card"} hover:border-white/25 hover:bg-white/[0.02] transition-colors duration-150`}
		>
			<Link
				href={`/builders/${r.handle}`}
				className="absolute inset-0 rounded-xl"
				aria-label={`${r.name}'s profile`}
			/>
			<CardContent className="p-5">
				<div className="flex items-center gap-4">
					<div className="flex-shrink-0">
						{r.avatar ? (
							<Image
								src={r.avatar}
								alt={r.name}
								width={48}
								height={48}
								className="rounded-full"
							/>
						) : (
							<div className="w-12 h-12 bg-white/[0.06] border border-border rounded-full flex items-center justify-center text-neutral-300 text-lg font-semibold">
								{r.name.charAt(0).toUpperCase()}
							</div>
						)}
					</div>
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 flex-wrap">
							<h3 className="font-semibold text-foreground truncate">
								{r.name}
							</h3>
							{r.featured && (
								<Badge variant="outline" className="text-xs text-neutral-300">
									Featured
								</Badge>
							)}
							{r.ambassador && (
								<Badge
									variant="outline"
									className="text-xs text-neutral-300"
									title={`Stellar Ambassador${r.ambassador.region ? `, ${r.ambassador.region}` : ""}`}
								>
									Ambassador · {r.ambassador.tier}
								</Badge>
							)}
							{r.languages.slice(0, 2).map((l) => (
								<span
									key={l}
									className="text-[10px] px-1.5 py-0.5 rounded-md border border-border text-muted-foreground"
								>
									{l}
								</span>
							))}
						</div>
						<div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
							{r.role && (
								<span className="flex items-center gap-1 truncate">
									<Briefcase className="w-3 h-3" />
									{r.role}
								</span>
							)}
							{r.location && (
								<span className="flex items-center gap-1">
									<MapPin className="w-3 h-3" />
									{r.location}
								</span>
							)}
							{r.commits30d > 0 && (
								<span className="flex items-center gap-1">
									<GitBranch className="w-3 h-3" />
									{r.commits30d} commits / 30d
								</span>
							)}
							{r.passportProjects > 0 && (
								<span className="flex items-center gap-1">
									<Code2 className="w-3 h-3" />
									{r.passportProjects} project
									{r.passportProjects !== 1 ? "s" : ""}
								</span>
							)}
							{r.repos > 0 && (
								<span className="flex items-center gap-1 tabular-nums">
									<GitBranch className="w-3 h-3" />
									{r.repos} Stellar {r.repos === 1 ? "repo" : "repos"}
									{r.stars > 0 ? `, ${r.stars.toLocaleString()} stars` : ""}
									{r.lastCommitAt ? `, last commit ${ago(r.lastCommitAt)}` : ""}
								</span>
							)}
						</div>
						{r.projects.length > 0 && (
							<div className="relative z-10 mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
								<span className="text-muted-foreground">builds</span>
								{r.projects.slice(0, 4).map((p) => (
									<Link
										key={p.slug}
										href={`/project/${p.slug}`}
										className="rounded-md border border-border bg-white/[0.03] px-1.5 py-0.5 text-foreground/90 hover:border-white/25 transition-colors"
									>
										{p.name}
									</Link>
								))}
								{r.projects.length > 4 && (
									<span className="text-muted-foreground">
										+{r.projects.length - 4} more
									</span>
								)}
							</div>
						)}
					</div>
					<div className="relative z-10 flex items-center gap-2 flex-shrink-0">
						<a
							href={`https://github.com/${r.handle}`}
							target="_blank"
							rel="noopener noreferrer"
							className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
							aria-label="GitHub"
						>
							<Github className="w-4 h-4" />
						</a>
						{twitterUrl && (
							<a
								href={twitterUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
								aria-label="Twitter"
							>
								<Twitter className="w-4 h-4" />
							</a>
						)}
						{r.website && (
							<a
								href={r.website}
								target="_blank"
								rel="noopener noreferrer"
								className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
								aria-label="Website"
							>
								<Globe className="w-4 h-4" />
							</a>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
