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

import {
	ArrowDown,
	ArrowUpRight,
	CheckCircle2,
	Loader2,
	Pencil,
	Search,
	Send,
	Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	REGION_LABELS,
	SECTOR_LABELS,
	PARTNER_TYPE_LABELS as TYPE_LABELS,
} from "@/lib/partner-labels";

export interface PublicPartner {
	slug: string;
	name: string;
	partnerType: string;
	tagline: string | null;
	description?: string | null;
	websiteUrl: string | null;
	acceptingClients: boolean | null;
	sectors: string[];
	regions: string[];
	assets?: string[];
	seps?: string[];
	rampTypes?: string[];
	country?: string | null;
	contactable?: boolean;
	logoUrl?: string | null;
	freshness: string;
	url: string;
}

interface Msg {
	role: "user" | "assistant";
	content: string;
	matches?: PublicPartner[];
	/** Set when the assistant classified the turn as a general ecosystem
	 * question (intent="chat") — renders a "Research question? Ask Stellar →"
	 * chip carrying the user's question to /ask. */
	askNudge?: string;
}
type Fields = Record<string, unknown>;

// Label maps live in src/lib/partner-labels.ts — shared with the directory
// and the server-rendered profile page (single source of Title-Case truth).

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

const PRICING_LABELS: Record<string, string> = {
	free: "Free",
	freemium: "Freemium",
	subscription: "Subscription",
	"usage-based": "Usage-based",
	fixed: "Fixed fee",
	hourly: "Hourly",
	"rev-share": "Revenue share",
	custom: "Custom",
};

function renderValue(v: unknown, key?: string): string {
	if (v == null || v === "") return "—";
	if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
	if (typeof v === "boolean") return v ? "Yes" : "No";
	// Enum values are stored lowercase — show the human label, not the raw slug.
	if (key === "pricingModel") return PRICING_LABELS[String(v)] ?? String(v);
	return String(v);
}

export function renderMarkdownBold(text: string): React.ReactNode[] {
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

export function PartnerConciergeChat({
	initialQuery,
}: {
	/** Question handed off from the directory's Ask box — auto-sent on mount. */
	initialQuery?: string;
} = {}) {
	const [messages, setMessages] = useState<Msg[]>([]);
	const [input, setInput] = useState("");
	const [busy, setBusy] = useState(false);
	const [phase, setPhase] = useState<"chat" | "preview" | "done">("chat");
	const [fields, setFields] = useState<Fields | null>(null);
	const [orgName, setOrgName] = useState("");
	const [contactEmail, setContactEmail] = useState("");
	const [doneMode, setDoneMode] = useState<"draft" | "claim">("draft");
	const [canList, setCanList] = useState(false);
	const [unavailable, setUnavailable] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Scroll engineering (shadcn's "never move the reader against their intent"):
	// each sent message becomes the ANCHOR turn, positioned near the top of the
	// box with reserved space below it (the spacer) that the reply grows into —
	// so nothing on screen moves when the answer, cards, or an error arrive.
	const [anchorIdx, setAnchorIdx] = useState<number | null>(null);
	const [belowFold, setBelowFold] = useState(false);
	const chatBoxRef = useRef<HTMLDivElement>(null);
	const spacerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	// Guards the mount effect against React's double-invoke (StrictMode /
	// remount), which otherwise auto-sent the opener twice → two answers to the
	// first prompt.
	const initialized = useRef(false);

	async function callAssistant(msgs: Msg[]): Promise<{
		reply: string;
		matches?: PublicPartner[];
		canList?: boolean;
		intent?: string;
	} | null> {
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
			setError(
				"The assistant hit a snag — browse the directory below instead.",
			);
			return null;
		}
		return {
			reply: d.reply,
			matches: d.matches,
			canList: d.canList,
			intent: d.intent,
		};
	}

	// Seed the conversation: a handed-off question (from the directory's Ask
	// box) is sent immediately as the user's first message — the visitor lands
	// mid-conversation, already being answered. Otherwise open with a greeting.
	useEffect(() => {
		if (initialized.current) return; // exactly once, even if the effect re-fires
		initialized.current = true;
		(async () => {
			setBusy(true);
			const handoff = initialQuery?.trim();
			if (handoff) {
				const first: Msg[] = [{ role: "user", content: handoff }];
				setMessages(first);
				setAnchorIdx(0);
				const res = await callAssistant(first);
				if (res?.reply) {
					setMessages((m) => [
						...m,
						{
							role: "assistant",
							content: res.reply,
							matches: res.matches,
							askNudge: res.intent === "chat" ? handoff : undefined,
						},
					]);
					if (res.canList) setCanList(true);
				}
			} else {
				// Static greeting - no API call. The assistant endpoint (correctly)
				// rejects an empty `messages` array since the strict-param work, so the
				// old callAssistant([]) greeting 400'd and every cold visitor saw "hit
				// a snag" on page load (the bug the Q2 review reported). A greeting
				// needs no LLM anyway - this is faster and free.
				setMessages([
					{
						role: "assistant",
						content:
							"Tell me what you're building and I'll match you with real Stellar partners - anchors, on/off-ramps, auditors, wallets, infrastructure. If you're a partner yourself, say \"list us\" and I'll help you get listed.",
					},
				]);
			}
			setBusy(false);
		})();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Sliver of the previous turn kept visible above the anchor, so the reader
	// always knows where they are in the conversation.
	const CONTEXT_PX = 48;

	/** Content below the fold that ISN'T just reserved empty space → show the pill. */
	function updateBelowFold() {
		const box = chatBoxRef.current;
		if (!box) return;
		const spacer = spacerRef.current?.offsetHeight ?? 0;
		const dist = box.scrollHeight - spacer - box.scrollTop - box.clientHeight;
		setBelowFold(dist > 40);
	}

	// Size the spacer so the anchor turn + its incoming reply fill the box from
	// CONTEXT_PX down. The reply then renders INTO that reserved space — zero
	// scrolling on arrival, and errors/retries never move the conversation.
	// The spacer height is set directly on the DOM (not state) to avoid render loops.
	// biome-ignore lint/correctness/useExhaustiveDependencies: content deps are re-measure triggers, not reads
	useLayoutEffect(() => {
		const box = chatBoxRef.current;
		const spacer = spacerRef.current;
		if (!box || !spacer) return;
		const el =
			anchorIdx != null
				? box.querySelector<HTMLElement>(`[data-mi="${anchorIdx}"]`)
				: null;
		if (!el) {
			spacer.style.height = "0px";
			updateBelowFold();
			return;
		}
		// Real content ends where the spacer begins — scrollHeight can't be used
		// here because it never reads below clientHeight (a box sitting at its
		// min-height would inflate the measure with empty slack). Sizing the
		// spacer can grow the box up to its max-height, which changes
		// clientHeight, so iterate to a fixed point (2 passes in practice).
		for (let pass = 0; pass < 3; pass++) {
			const contentBelow = spacer.offsetTop - el.offsetTop;
			const next = Math.max(0, box.clientHeight - CONTEXT_PX - contentBelow);
			if (next === spacer.offsetHeight) break;
			spacer.style.height = `${next}px`;
		}
		updateBelowFold();
	}, [messages, busy, anchorIdx, canList, phase]);

	// The ONE programmatic scroll: when the user sends a message (that's them
	// asking to move), bring the new turn near the top of the box so the answer
	// can be read from its beginning as it grows into the space below.
	useLayoutEffect(() => {
		if (anchorIdx == null) return;
		const box = chatBoxRef.current;
		const el = box?.querySelector<HTMLElement>(`[data-mi="${anchorIdx}"]`);
		if (!box || !el) return;
		// Instant, not smooth: throttled tabs pause smooth-scroll animations
		// indefinitely, which would leave the box unpositioned.
		box.scrollTop = Math.max(0, el.offsetTop - CONTEXT_PX);
	}, [anchorIdx]);

	function jumpToLatest() {
		const box = chatBoxRef.current;
		if (!box) return;
		box.scrollTop = box.scrollHeight;
	}

	async function sendText(text: string) {
		if (!text.trim() || busy) return;
		const next: Msg[] = [...messages, { role: "user", content: text.trim() }];
		setMessages(next);
		setAnchorIdx(next.length - 1);
		setInput("");
		setBusy(true);
		const res = await callAssistant(next);
		if (res?.reply) {
			setMessages((m) => [
				...m,
				{
					role: "assistant",
					content: res.reply,
					matches: res.matches,
					askNudge: res.intent === "chat" ? text.trim() : undefined,
				},
			]);
			if (res.canList) setCanList(true);
		}
		setBusy(false);
		// Keep the keyboard in the conversation — no click needed between messages.
		inputRef.current?.focus();
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
				// Pre-fill the contact email if the AI picked one up in the chat.
				if (typeof d.fields.contactEmail === "string" && d.fields.contactEmail)
					setContactEmail(d.fields.contactEmail);
				setPhase("preview");
			} else {
				setError(
					"Couldn't build the profile — add a bit more detail and retry.",
				);
			}
		} finally {
			setBusy(false);
		}
	}

	async function submit() {
		if (busy || !orgName.trim() || !contactEmail.trim()) return;
		setBusy(true);
		setError(null);
		try {
			// Creates a real draft partner account (or a claim request when the
			// company is already listed) — reviewed by the team before publish.
			const r = await fetch("/api/partners/submit-listing", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					orgName: orgName.trim(),
					contactEmail: contactEmail.trim(),
					fields,
				}),
			});
			const d = await r.json().catch(() => ({}));
			if (!r.ok) {
				setError(d.error ?? "Couldn't submit — try again shortly.");
				return;
			}
			setDoneMode(d.mode === "claim" ? "claim" : "draft");
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
					{doneMode === "claim"
						? "Looks like you're already listed"
						: "Submitted for review"}
				</h2>
				<p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
					{doneMode === "claim" ? (
						<>
							<span className="text-foreground">{orgName}</span> is already in
							the{" "}
							<Link
								href="/partners"
								className="underline hover:text-foreground"
							>
								directory
							</Link>
							. We&apos;ve logged your claim — once we verify you&apos;re with
							the company, we&apos;ll email{" "}
							<span className="text-foreground">{contactEmail}</span> an invite
							to manage the profile.
						</>
					) : (
						<>
							Thanks — <span className="text-foreground">{orgName}</span> is in
							the queue. Once reviewed and published, we&apos;ll email{" "}
							<span className="text-foreground">{contactEmail}</span> an invite
							to set a password and manage the profile.
						</>
					)}
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
					<div className="grid sm:grid-cols-2 gap-4 mb-5">
						<div>
							<label className="block text-xs text-muted-foreground mb-1.5">
								Organization name
							</label>
							<input
								value={orgName}
								onChange={(e) => setOrgName(e.target.value)}
								placeholder="e.g. Etherfuse"
								className="w-full h-10 px-3 bg-white/[0.02] text-sm text-foreground placeholder-muted-foreground rounded-lg border border-border outline-none transition-[border-color] duration-150 focus:border-white/30"
							/>
						</div>
						<div>
							<label className="block text-xs text-muted-foreground mb-1.5">
								Work email{" "}
								<span className="text-muted-foreground/60">
									— becomes your account login
								</span>
							</label>
							<input
								type="email"
								value={contactEmail}
								onChange={(e) => setContactEmail(e.target.value)}
								placeholder="you@company.com"
								className="w-full h-10 px-3 bg-white/[0.02] text-sm text-foreground placeholder-muted-foreground rounded-lg border border-border outline-none transition-[border-color] duration-150 focus:border-white/30"
							/>
						</div>
					</div>
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
									{renderValue(fields[k], k)}
								</dd>
							</div>
						))}
					</dl>
				</div>
				<div className="flex items-center gap-3">
					<button
						onClick={submit}
						disabled={busy || !orgName.trim() || !contactEmail.trim()}
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
				{error && <div className="text-xs text-red-400">{error}</div>}
				<p className="text-[11px] text-muted-foreground/60">
					Fields the AI couldn&apos;t infer are left blank — nothing is made up.
				</p>
			</div>
		);
	}

	// chat phase
	return (
		<div className="space-y-4">
			<div className="relative">
				<div
					ref={chatBoxRef}
					onScroll={updateBelowFold}
					role="log"
					aria-label="Concierge conversation"
					className="relative rounded-2xl border border-border bg-card p-4 min-h-[340px] max-h-[60vh] overflow-y-auto space-y-4"
				>
					{messages.map((m, i) => (
						<div key={i} data-mi={i} className="space-y-3">
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
							{m.askNudge && (
								<div className="flex justify-start">
									<Link
										href={`/ask?q=${encodeURIComponent(m.askNudge)}`}
										className="text-xs px-3 py-1.5 rounded-full bg-white/[0.03] border border-border text-muted-foreground hover:text-foreground hover:border-white/25 transition-colors"
									>
										Research question? Ask Stellar →
									</Link>
								</div>
							)}
						</div>
					))}
					{busy && (
						<div className="flex justify-start">
							<div className="rounded-2xl bg-white/[0.03] border border-border px-3.5 py-2">
								<Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
								<output className="sr-only">Assistant is replying…</output>
							</div>
						</div>
					)}
					{/* Reserved space the current turn's reply renders into — sized by
					    the layout effect, shrinks as content arrives so nothing moves. */}
					<div ref={spacerRef} aria-hidden="true" />
				</div>
				{belowFold && (
					<button
						type="button"
						onClick={jumpToLatest}
						className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/85 backdrop-blur px-3 py-1.5 text-xs text-muted-foreground shadow-lg hover:text-foreground transition-colors"
					>
						{busy ? "Streaming below" : "Jump to latest"}
						<ArrowDown className="w-3.5 h-3.5" />
					</button>
				)}
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
					ref={inputRef}
					autoFocus
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="describe what you need, or tell us about your company…"
					className="w-full h-12 pl-11 pr-12 bg-card text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border outline-none transition-[border-color] duration-150 focus:border-white/30 disabled:opacity-60"
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

export function MatchCard({ p }: { p: PublicPartner }) {
	return (
		<div className="rounded-xl bg-white/[0.02] border border-border p-3.5 hover:border-white/25 transition-colors">
			<div className="flex items-start justify-between gap-2 mb-1">
				<div className="flex items-center gap-2 min-w-0">
					{p.logoUrl && (
						// Arbitrary remote domains (stellar.toml ORG_LOGO) — plain img.
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={p.logoUrl}
							alt=""
							className="w-6 h-6 rounded-md border border-border bg-white/[0.03] object-contain flex-shrink-0"
						/>
					)}
					<Link
						href={`/partners/${p.slug}`}
						className="font-medium text-foreground hover:text-white transition-colors truncate"
					>
						{p.name}
					</Link>
				</div>
				<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-muted-foreground border border-border whitespace-nowrap">
					{TYPE_LABELS[p.partnerType] ?? p.partnerType}
				</span>
			</div>
			{(p.tagline || p.description) && (
				<p className="text-xs text-muted-foreground/90 leading-snug line-clamp-2 mb-2">
					{p.tagline ?? p.description}
				</p>
			)}
			<div className="flex flex-wrap items-center gap-1.5">
				{/* Available only with a real contact path — no dead-end matches. */}
				{p.acceptingClients && p.contactable && (
					<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.06] text-foreground/80 border border-border">
						Available
					</span>
				)}
				{(p.assets ?? []).slice(0, 3).map((a) => (
					<span
						key={`a-${a}`}
						className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.06] text-foreground/90 border border-border font-medium"
					>
						{a}
					</span>
				))}
				{(p.rampTypes ?? []).map((r) => (
					<span
						key={`rt-${r}`}
						className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.03] text-muted-foreground/90 border border-border"
					>
						{r === "on-ramp" ? "On-ramp" : r === "off-ramp" ? "Off-ramp" : r}
					</span>
				))}
				{p.country && (
					<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.03] text-muted-foreground/70 border border-border">
						{p.country}
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
