"use client";

/**
 * AI onboarding chat — Anke's "AI chatbot UI to acquire dynamic data."
 *
 * A public "get listed" flow: a partner company describes itself in a short
 * chat, the AI (claude-haiku via /api/partners/onboard, mode:"chat") interviews
 * one topic at a time, then mode:"extract" structures the transcript into a
 * partner profile. The company reviews it and submits — the profile lands as a
 * review request (via /api/feedback) for the team to publish. No login: this is
 * data acquisition, not account management.
 *
 * Degrades gracefully: if the AI backend is unavailable (503), it points the
 * user at the plain "Get listed" mailto instead of erroring.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Send, Sparkles, CheckCircle2, Pencil } from "lucide-react";

interface Msg {
	role: "user" | "assistant";
	content: string;
}
type Fields = Record<string, unknown>;

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

function renderValue(v: unknown): string {
	if (v == null || v === "") return "—";
	if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
	if (typeof v === "boolean") return v ? "Yes" : "No";
	return String(v);
}

// Render **bold** markers from the AI's replies as real bold (Haiku loves
// markdown; we don't want the literal ** chars showing in the chat). Splits
// on **…** pairs; keeps every other odd chunk as <strong>.
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

const MAILTO =
	"mailto:hello@stellarlight.xyz?subject=Partner%20listing%20on%20StellarLight";

export function PartnerOnboardChat() {
	const [messages, setMessages] = useState<Msg[]>([]);
	const [input, setInput] = useState("");
	const [busy, setBusy] = useState(false);
	const [phase, setPhase] = useState<"chat" | "preview" | "done">("chat");
	const [fields, setFields] = useState<Fields | null>(null);
	const [orgName, setOrgName] = useState("");
	const [unavailable, setUnavailable] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const endRef = useRef<HTMLDivElement>(null);

	async function callChat(msgs: Msg[]): Promise<string | null> {
		setError(null);
		const r = await fetch("/api/partners/onboard", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ mode: "chat", messages: msgs }),
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
		return d.reply ?? null;
	}

	// Seed the AI's opening question.
	useEffect(() => {
		(async () => {
			setBusy(true);
			const greeting = await callChat([]);
			if (greeting) setMessages([{ role: "assistant", content: greeting }]);
			setBusy(false);
		})();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, phase]);

	async function send() {
		const text = input.trim();
		if (!text || busy) return;
		const next: Msg[] = [...messages, { role: "user", content: text }];
		setMessages(next);
		setInput("");
		setBusy(true);
		const reply = await callChat(next);
		if (reply) setMessages((m) => [...m, { role: "assistant", content: reply }]);
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
				body: JSON.stringify({ mode: "extract", messages }),
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
					context: { endpoint: "/partners/join", agentName: "partner-onboard-chat" },
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
				The guided AI onboarding is offline right now. You can still get listed —{" "}
				<a href={MAILTO} className="text-foreground underline">
					email us
				</a>{" "}
				a few lines about your company and we'll add you.
			</div>
		);
	}

	if (phase === "done") {
		return (
			<div className="rounded-2xl border border-border bg-card p-8 text-center">
				<CheckCircle2 className="w-10 h-10 text-emerald-400/90 mx-auto mb-4" />
				<h2 className="text-lg font-semibold text-foreground">Submitted for review</h2>
				<p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
					Thanks — <span className="text-foreground">{orgName}</span> is in the queue.
					We'll review the profile and publish it to the{" "}
					<Link href="/partners" className="underline hover:text-foreground">
						partner directory
					</Link>
					. We'll reach out if we need anything.
				</p>
			</div>
		);
	}

	if (phase === "preview" && fields) {
		return (
			<div className="space-y-5">
				<div>
					<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 inline-flex items-center gap-2">
						<Sparkles className="w-3.5 h-3.5" />
						Drafted profile
					</h2>
				</div>
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
							return v != null && v !== "" && !(Array.isArray(v) && v.length === 0);
						}).map((k) => (
							<div key={k} className="grid grid-cols-3 gap-3 py-2">
								<dt className="text-xs text-muted-foreground">{FIELD_LABELS[k]}</dt>
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
						className="h-10 px-5 inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium text-foreground disabled:opacity-40 transition-colors"
					>
						{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
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
					fields the AI couldn't infer are left blank — nothing is made up. you'll
					be able to edit everything once your account is set up.
				</p>
			</div>
		);
	}

	// chat phase
	return (
		<div className="space-y-4">
			<div className="rounded-2xl border border-border bg-card p-4 min-h-[320px] max-h-[52vh] overflow-y-auto space-y-4">
				{messages.map((m, i) => (
					<div
						key={i}
						className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
					>
						<div
							className={
								m.role === "user"
									? "max-w-[80%] rounded-2xl rounded-br-sm bg-white/10 px-3.5 py-2 text-sm text-foreground whitespace-pre-wrap"
									: "max-w-[85%] rounded-2xl rounded-bl-sm bg-white/[0.03] border border-border px-3.5 py-2 text-sm text-foreground/90 whitespace-pre-wrap"
							}
						>
							{m.role === "assistant" ? renderMarkdownBold(m.content) : m.content}
						</div>
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

			<form
				onSubmit={(e) => {
					e.preventDefault();
					send();
				}}
				className="relative"
			>
				<input
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="type your answer…"
					disabled={busy}
					className="w-full h-12 pl-4 pr-12 bg-card text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border focus-visible:outline-none focus-visible:border-white/30 disabled:opacity-60"
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

			{messages.length >= 3 && (
				<div className="flex items-center gap-3">
					<button
						onClick={buildProfile}
						disabled={busy}
						className="h-10 px-4 inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium text-foreground disabled:opacity-40 transition-colors"
					>
						<Sparkles className="w-4 h-4" />
						Build my profile
					</button>
					<span className="text-xs text-muted-foreground">
						done chatting? generate your profile from the conversation.
					</span>
				</div>
			)}
		</div>
	);
}
