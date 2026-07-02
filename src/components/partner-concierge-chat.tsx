"use client";

/**
 * Partner concierge — one public chat, two jobs (Anke's "multi-purpose" ask).
 *
 * Open to anyone, no login:
 *   - FIND: describe what you need ("USDC off-ramp in Mexico", "a Rust
 *     auditor") → the assistant (POST /api/partners/assistant) calls a
 *     deterministic search over the published directory and recommends REAL
 *     partners, rendered as cards inline. Every surfaced partner is logged as
 *     a lead so they hear about the demand in the weekly digest.
 *   - LIST: "we're an anchor, list us" → the assistant interviews, then
 *     signals `canList`; "Create my listing" extracts the profile (reusing
 *     /api/partners/onboard) into a draft the team reviews.
 *
 * Degrades gracefully: 503 → point to the directory + mailto.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
	Loader2,
	Send,
	Sparkles,
	CheckCircle2,
	Pencil,
	ArrowUpRight,
	Search,
} from "lucide-react";

interface PublicPartner {
	slug: string;
	name: string;
	partnerType: string;
	tagline: string | null;
	websiteUrl: string | null;
	acceptingClients: boolean | null;
	sectors: string[];
	regions: string[];
	freshness: string;
	url: string;
}

interface Msg {
	role: "user" | "assistant";
	content: string;
	matches?: PublicPartner[];
}
type Fields = Record<string, unknown>;

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

const FIELD_LABELS: Record<string, string> = {
	tagline: "Tagline",
	description: "What you do",
	services: "Services",
	sectors: "Sectors",
	regions: "Regions",
	acceptingClients: "Accepting clients",
	typicalEngagement: "Typical engagement",
	leadTime: "Lead time",
	pricingModel: "Pricing model",
	pricingNotes: "Pricing notes",
	websiteUrl: "Website",
	docsUrl: "Docs",
	githubOrg: "GitHub",
	contactEmail: "Contact email",
	contactChannel: "Contact channel",
	responseSla: "Response SLA",
};
const FIELD_ORDER = Object.keys(FIELD_LABELS);

const EXAMPLES = [
	"I need a USDC off-ramp in Mexico",
	"Who can audit my Soroban contract?",
	"Looking for a wallet SDK",
	"We're an anchor — list us",
];

const MAILTO =
	"mailto:hello@stellarlight.xyz?subject=Partner%20listing%20on%20StellarLight";

function renderValue(v: unknown): string {
	if (v == null || v === "") return "—";
	if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
	if (typeof v === "boolean") return v ? "Yes" : "No";
	return String(v);
}

function renderMarkdownBold(text: string): React.ReactNode[] {
	const parts = text.split(/\*\*(.+?)\*\*/g);
	return parts.map((chunk, i) =>
		i % 2 === 1 ? (
			<strong key={i} className="font-semibold text-foreground">
				{chunk}
			</strong>
		) : (
			<span key={i}>{chunk}</span>
		),
	);
}

export function PartnerConciergeChat() {
	const [messages, setMessages] = useState<Msg[]>([]);
	const [input, setInput] = useState("");
	const [busy, setBusy] = useState(false);
	const [phase, setPhase] = useState<"chat" | "preview" | "done">("chat");
	const [fields, setFields] = useState<Fields | null>(null);
	const [orgName, setOrgName] = useState("");
	const [canList, setCanList] = useState(false);
	const [unavailable, setUnavailable] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const endRef = useRef<HTMLDivElement>(null);

	async function callAssistant(
		msgs: Msg[],
	): Promise<{ reply: string; matches?: PublicPartner[]; canList?: boolean } | null> {
		setError(null);
		const r = await fetch("/api/partners/assistant", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				messages: msgs.map((m) => ({ role: m.role, content: m.content })),
			}),
		});
		if (r.status === 429) {
			setError("Too many messages just now — give it a moment and try again.");
			return null;
		}
		const d = await r.json().catch(() => ({}));
		if (d.unavailable) {
			setUnavailable(true);
			return null;
		}
		if (typeof d.reply !== "string") {
			setError("The assistant hit a snag — browse the directory below instead.");
			return null;
		}
		return { reply: d.reply, matches: d.matches, canList: d.canList };
	}

	// Seed the opening message.
	useEffect(() => {
		(async () => {
			setBusy(true);
			const res = await callAssistant([]);
			if (res?.reply)
				setMessages([
					{ role: "assistant", content: res.reply, matches: res.matches },
				]);
			setBusy(false);
		})();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, phase]);

	async function sendText(text: string) {
		if (!text.trim() || busy) return;
		const next: Msg[] = [...messages, { role: "user", content: text.trim() }];
		setMessages(next);
		setInput("");
		setBusy(true);
		const res = await callAssistant(next);
		if (res?.reply) {
			setMessages((m) => [
				...m,
				{ role: "assistant", content: res.reply, matches: res.matches },
			]);
			if (res.canList) setCanList(true);
		}
		setBusy(false);
	}

	async function buildProfile() {
		if (busy) return;
		setBusy(true);
		setError(null);
		try {
			const r = await fetch("/api/partners/onboard", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					mode: "extract",
					messages: messages.map((m) => ({ role: m.role, content: m.content })),
				}),
			});
			const d = await r.json().catch(() => ({}));
			if (d.unavailable) {
				setUnavailable(true);
				return;
			}
			if (d.fields) {
				setFields(d.fields);
				setPhase("preview");
			} else {
				setError("Couldn't build the profile — add a bit more detail and retry.");
			}
		} finally {
			setBusy(false);
		}
	}

	async function submit() {
		if (busy || !orgName.trim()) return;
		setBusy(true);
		try {
			const profile = { orgName: orgName.trim(), ...fields };
			await fetch("/api/feedback", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					kind: "other",
					message: `PARTNER LISTING REQUEST — ${orgName.trim()}\n\n${JSON.stringify(profile, null, 2)}`,
					context: {
						endpoint: "/partners/chat",
						agentName: "partner-concierge-chat",
					},
				}),
			});
			setPhase("done");
		} finally {
			setBusy(false);
		}
	}

	if (unavailable) {
		return (
			<div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
				The concierge is offline right now. You can still{" "}
				<Link href="/partners" className="text-foreground underline">
					browse the directory
				</Link>{" "}
				or{" "}
				<a href={MAILTO} className="text-foreground underline">
					email us
				</a>{" "}
				to get listed.
			</div>
		);
	}

	if (phase === "done") {
		return (
			<div className="rounded-2xl border border-border bg-card p-8 text-center">
				<CheckCircle2 className="w-10 h-10 text-emerald-400/90 mx-auto mb-4" />
				<h2 className="text-lg font-semibold text-foreground">
					Submitted for review
				</h2>
				<p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
					Thanks — <span className="text-foreground">{orgName}</span> is in the
					queue. We&apos;ll review the profile and publish it to the{" "}
					<Link href="/partners" className="underline hover:text-foreground">
						partner directory
					</Link>
					.
				</p>
			</div>
		);
	}

	if (phase === "preview" && fields) {
		return (
			<div className="space-y-5">
				<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-2">
					<Sparkles className="w-3.5 h-3.5" />
					Drafted profile
				</h2>
				<div className="rounded-2xl border border-border bg-card p-5">
					<label className="block text-xs text-muted-foreground mb-1.5">
						Organization name
					</label>
					<input
						value={orgName}
						onChange={(e) => setOrgName(e.target.value)}
						placeholder="e.g. Etherfuse"
						className="w-full h-10 px-3 mb-5 bg-white/[0.02] text-sm text-foreground placeholder-muted-foreground rounded-lg border border-border focus-visible:outline-none focus-visible:border-white/30"
					/>
					<dl className="divide-y divide-border/60">
						{FIELD_ORDER.filter((k) => {
							const v = fields[k];
							return (
								v != null && v !== "" && !(Array.isArray(v) && v.length === 0)
							);
						}).map((k) => (
							<div key={k} className="grid grid-cols-3 gap-3 py-2">
								<dt className="text-xs text-muted-foreground">
									{FIELD_LABELS[k]}
								</dt>
								<dd className="col-span-2 text-sm text-foreground/90">
									{renderValue(fields[k])}
								</dd>
							</div>
						))}
					</dl>
				</div>
				<div className="flex items-center gap-3">
					<button
						onClick={submit}
						disabled={busy || !orgName.trim()}
						className="h-10 px-5 inline-flex items-center gap-2 rounded-xl bg-foreground text-background text-sm font-medium disabled:opacity-40 transition-opacity"
					>
						{busy ? (
							<Loader2 className="w-4 h-4 animate-spin" />
						) : (
							<CheckCircle2 className="w-4 h-4" />
						)}
						Submit for listing
					</button>
					<button
						onClick={() => setPhase("chat")}
						className="h-10 px-4 inline-flex items-center gap-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						<Pencil className="w-4 h-4" />
						Add more detail
					</button>
				</div>
				<p className="text-[11px] text-muted-foreground/60">
					Fields the AI couldn&apos;t infer are left blank — nothing is made up.
				</p>
			</div>
		);
	}

	// chat phase
	return (
		<div className="space-y-4">
			<div className="rounded-2xl border border-border bg-card p-4 min-h-[340px] max-h-[56vh] overflow-y-auto space-y-4">
				{messages.map((m, i) => (
					<div key={i} className="space-y-3">
						<div
							className={
								m.role === "user" ? "flex justify-end" : "flex justify-start"
							}
						>
							<div
								className={
									m.role === "user"
										? "max-w-[80%] rounded-2xl rounded-br-sm bg-white/10 px-3.5 py-2 text-sm text-foreground whitespace-pre-wrap"
										: "max-w-[85%] rounded-2xl rounded-bl-sm bg-white/[0.03] border border-border px-3.5 py-2 text-sm text-foreground/90 whitespace-pre-wrap"
								}
							>
								{m.role === "assistant"
									? renderMarkdownBold(m.content)
									: m.content}
							</div>
						</div>
						{m.matches && m.matches.length > 0 && (
							<div className="grid sm:grid-cols-2 gap-2.5">
								{m.matches.map((p) => (
									<MatchCard key={p.slug} p={p} />
								))}
							</div>
						)}
					</div>
				))}
				{busy && (
					<div className="flex justify-start">
						<div className="rounded-2xl bg-white/[0.03] border border-border px-3.5 py-2">
							<Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
						</div>
					</div>
				)}
				<div ref={endRef} />
			</div>

			{error && <div className="text-xs text-red-400">{error}</div>}

			{/* Example prompts — only before the user has said anything */}
			{messages.length <= 1 && !busy && (
				<div className="flex flex-wrap gap-2">
					{EXAMPLES.map((ex) => (
						<button
							key={ex}
							onClick={() => sendText(ex)}
							className="text-xs px-3 py-1.5 rounded-full bg-white/[0.03] border border-border text-muted-foreground hover:text-foreground hover:border-white/25 transition-colors"
						>
							{ex}
						</button>
					))}
				</div>
			)}

			<form
				onSubmit={(e) => {
					e.preventDefault();
					sendText(input);
				}}
				className="relative"
			>
				<Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
				<input
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="describe what you need, or tell us about your company…"
					disabled={busy}
					className="w-full h-12 pl-11 pr-12 bg-card text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border focus-visible:outline-none focus-visible:border-white/30 disabled:opacity-60"
				/>
				<button
					type="submit"
					disabled={busy || !input.trim()}
					className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/15 text-foreground disabled:opacity-30 transition-colors"
					aria-label="Send"
				>
					<Send className="w-4 h-4" />
				</button>
			</form>

			{canList && (
				<div className="flex items-center gap-3">
					<button
						onClick={buildProfile}
						disabled={busy}
						className="h-10 px-4 inline-flex items-center gap-2 rounded-xl bg-foreground text-background text-sm font-medium disabled:opacity-40 transition-opacity"
					>
						<Sparkles className="w-4 h-4" />
						Create my listing
					</button>
					<span className="text-xs text-muted-foreground">
						turn this chat into a draft profile to review.
					</span>
				</div>
			)}
		</div>
	);
}

function MatchCard({ p }: { p: PublicPartner }) {
	return (
		<div className="rounded-xl bg-white/[0.02] border border-border p-3.5 hover:border-white/25 transition-colors">
			<div className="flex items-start justify-between gap-2 mb-1">
				<Link
					href={`/partners/${p.slug}`}
					className="font-medium text-foreground hover:text-white transition-colors truncate"
				>
					{p.name}
				</Link>
				<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-muted-foreground border border-border whitespace-nowrap">
					{TYPE_LABELS[p.partnerType] ?? p.partnerType}
				</span>
			</div>
			{p.tagline && (
				<p className="text-xs text-muted-foreground/90 leading-snug line-clamp-2 mb-2">
					{p.tagline}
				</p>
			)}
			<div className="flex flex-wrap items-center gap-1.5">
				{p.acceptingClients && (
					<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400/90 border border-emerald-500/20">
						Available
					</span>
				)}
				{p.sectors.slice(0, 2).map((s) => (
					<span
						key={s}
						className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.03] text-muted-foreground/90 border border-border"
					>
						{SECTOR_LABELS[s] ?? s}
					</span>
				))}
				{p.regions.slice(0, 1).map((r) => (
					<span
						key={r}
						className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.03] text-muted-foreground/70 border border-border"
					>
						{REGION_LABELS[r] ?? r}
					</span>
				))}
				<Link
					href={`/partners/${p.slug}`}
					className="ml-auto text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
				>
					view <ArrowUpRight className="w-3 h-3" />
				</Link>
			</div>
		</div>
	);
}
