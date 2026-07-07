"use client";

/**
 * The primary "find a partner" surface — search-first and instant. Pick a type
 * + region + what you need, get REAL published partners ranked by the shared
 * deterministic scorer, each with the concrete "why this matched" reasons. No
 * LLM, so it's fast. Powered by GET /api/partners/matchmaker.
 *
 * The free-form concierge chat is a deliberate ESCALATION from here (via
 * onAskConcierge), not a co-equal mode — so there's one obvious way to start.
 * A query handed off from /ask (initialNeed) pre-fills and auto-runs the search.
 */

import {
	ArrowUpRight,
	Check,
	Loader2,
	MessageCircle,
	Search,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { regionLabel, typeLabel } from "@/lib/partner-labels";
import { cn } from "@/lib/utils";

interface MatchResult {
	slug: string;
	name: string;
	partnerType: string;
	tagline: string | null;
	description?: string | null;
	logoUrl?: string | null;
	acceptingClients?: boolean | null;
	contactable?: boolean;
	reasons: string[];
	score: number;
}

type State =
	| { kind: "idle" }
	| { kind: "loading" }
	| { kind: "done"; matches: MatchResult[]; need: string }
	| { kind: "error" };

const TYPES = [
	"anchor",
	"on-off-ramp",
	"audit-firm",
	"wallet",
	"infrastructure",
	"protocol",
	"tooling",
];
const REGIONS = [
	"latam",
	"africa",
	"europe",
	"asia",
	"north-america",
	"mena",
	"oceania",
	"global",
];

// Goal-shaped starters — a builder recognizes the OUTCOME, not our field names.
const EXAMPLES = [
	"USDC off-ramp in LatAm",
	"Rust / Soroban audit",
	"EUR on-ramp",
	"tokenized treasuries",
	"accept crypto payments in Africa",
];

export function PartnerMatchmaker({
	initialNeed,
	onAskConcierge,
}: {
	initialNeed?: string;
	onAskConcierge?: (need: string) => void;
}) {
	const [type, setType] = useState("");
	const [region, setRegion] = useState("");
	const [need, setNeed] = useState(initialNeed ?? "");
	const [state, setState] = useState<State>({ kind: "idle" });

	const empty = !type && !region && !need.trim();

	async function run(override?: { need?: string }) {
		const n = override?.need ?? need;
		if (!type && !region && !n.trim()) return;
		setState({ kind: "loading" });
		try {
			const qs = new URLSearchParams();
			if (n.trim()) qs.set("q", n.trim());
			if (type) qs.set("type", type);
			if (region) qs.set("region", region);
			const r = await fetch(`/api/partners/matchmaker?${qs.toString()}`);
			const d = await r.json().catch(() => ({}));
			if (!r.ok || d.unavailable) {
				setState({ kind: "error" });
				return;
			}
			setState({
				kind: "done",
				matches: Array.isArray(d.matches) ? d.matches : [],
				need: d.meta?.need ?? n,
			});
		} catch {
			setState({ kind: "error" });
		}
	}

	// A ?q= handoff from /ask pre-fills and runs the search immediately.
	// biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
	useEffect(() => {
		if (initialNeed?.trim()) run({ need: initialNeed });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function chip(
		value: string,
		active: boolean,
		onClick: () => void,
		label: string,
	) {
		return (
			<button
				key={value}
				type="button"
				onClick={onClick}
				className={cn(
					"px-3 py-1.5 rounded-full text-sm border transition-colors",
					active
						? "bg-white text-[#171717] border-white font-medium"
						: "bg-white/[0.03] text-muted-foreground border-border hover:text-foreground hover:border-white/25",
				)}
			>
				{label}
			</button>
		);
	}

	// The one-way escalation to the free-form concierge, seeded with the need.
	const escalate = onAskConcierge ? (
		<button
			type="button"
			onClick={() => onAskConcierge(need.trim() || "")}
			className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
		>
			<MessageCircle className="w-4 h-4" />
			Prefer to describe it in your own words? Ask the concierge
			<ArrowUpRight className="w-3.5 h-3.5" />
		</button>
	) : null;

	return (
		<div className="space-y-6">
			<div className="rounded-2xl border border-border bg-card p-5 space-y-5">
				<div>
					<div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
						I need a…
					</div>
					<div className="flex flex-wrap gap-2">
						{TYPES.map((t) =>
							chip(
								t,
								type === t,
								() => setType(type === t ? "" : t),
								typeLabel(t),
							),
						)}
					</div>
				</div>

				<div>
					<div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
						serving…
					</div>
					<div className="flex flex-wrap gap-2">
						{REGIONS.map((r) =>
							chip(
								r,
								region === r,
								() => setRegion(region === r ? "" : r),
								regionLabel(r),
							),
						)}
					</div>
				</div>

				<div>
					<div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
						for…{" "}
						<span className="text-muted-foreground/60 normal-case">
							(asset, currency, or what you&apos;re building)
						</span>
					</div>
					<input
						value={need}
						onChange={(e) => setNeed(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") run();
						}}
						placeholder="e.g. USDC off-ramp, Rust audit, EUR rails…"
						className="w-full h-11 px-4 bg-white/[0.02] text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border outline-none transition-[border-color] duration-150 focus:border-white/30"
					/>
					<div className="mt-2.5 flex flex-wrap gap-2">
						{EXAMPLES.map((ex) => (
							<button
								key={ex}
								type="button"
								onClick={() => {
									setNeed(ex);
									run({ need: ex });
								}}
								className="text-xs px-2.5 py-1 rounded-full bg-white/[0.02] border border-border text-muted-foreground hover:text-foreground hover:border-white/25 transition-colors"
							>
								{ex}
							</button>
						))}
					</div>
				</div>

				<button
					type="button"
					onClick={() => run()}
					disabled={empty || state.kind === "loading"}
					className="h-10 px-5 inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium text-foreground disabled:opacity-40 transition-colors"
				>
					{state.kind === "loading" ? (
						<Loader2 className="w-4 h-4 animate-spin" />
					) : (
						<Search className="w-4 h-4" />
					)}
					Find matches
				</button>
			</div>

			{state.kind === "error" && (
				<div className="space-y-3">
					<p className="text-sm text-muted-foreground">
						The matchmaker is busy right now —{" "}
						<Link href="/partners" className="text-foreground underline">
							browse the directory
						</Link>{" "}
						instead.
					</p>
					{escalate}
				</div>
			)}

			{state.kind === "done" && (
				<div className="space-y-4">
					<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						{state.matches.length === 0
							? "No partners match — try broadening it"
							: `${state.matches.length} match${state.matches.length === 1 ? "" : "es"}`}
					</h2>
					{state.matches.length === 0 ? (
						<div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground space-y-3">
							<p>
								Nothing fits all of those. Drop a filter, or{" "}
								<Link href="/partners" className="text-foreground underline">
									browse everyone
								</Link>
								.
							</p>
							{escalate}
						</div>
					) : (
						<>
							<div className="grid sm:grid-cols-2 gap-3">
								{state.matches.map((m) => (
									<MatchmakerCard key={m.slug} m={m} />
								))}
							</div>
							{escalate && (
								<div className="pt-1 flex justify-center">{escalate}</div>
							)}
						</>
					)}
				</div>
			)}
		</div>
	);
}

function MatchmakerCard({ m }: { m: MatchResult }) {
	return (
		<Link
			href={`/partners/${m.slug}`}
			className="group block p-4 rounded-xl bg-card border border-border hover:border-white/25 hover:bg-white/[0.02] transition-all"
		>
			<div className="flex items-center gap-2 mb-1.5">
				{m.logoUrl && (
					// Remote logo domain — plain img.
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={m.logoUrl}
						alt=""
						className="w-6 h-6 rounded-md border border-border bg-white/[0.03] object-contain flex-shrink-0"
					/>
				)}
				<span className="font-medium text-foreground group-hover:text-white transition-colors truncate">
					{m.name}
				</span>
				<span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-muted-foreground border border-border whitespace-nowrap flex-shrink-0">
					{typeLabel(m.partnerType)}
				</span>
			</div>
			{(m.tagline || m.description) && (
				<p className="text-xs text-muted-foreground/90 leading-snug line-clamp-2 mb-2">
					{m.tagline || m.description}
				</p>
			)}
			{m.reasons.length > 0 && (
				<div className="flex flex-wrap items-center gap-1.5">
					{m.reasons.map((r) => (
						<span
							key={r}
							className="text-[10px] px-1.5 py-0.5 rounded-md bg-green-500/10 text-green-400/90 border border-green-500/20 inline-flex items-center gap-1 whitespace-nowrap"
						>
							<Check className="w-2.5 h-2.5" />
							{r}
						</span>
					))}
					<ArrowUpRight className="ml-auto w-3.5 h-3.5 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
				</div>
			)}
		</Link>
	);
}
