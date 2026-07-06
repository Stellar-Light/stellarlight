"use client";

/**
 * Partner portal — the logged-in home for an ecosystem partner.
 *
 * Three states: loading, logged-out (login card), logged-in (dashboard).
 * All server work is Payload's cookie-auth REST under /api/partner-accounts/*:
 *
 *   POST /api/partner-accounts/login   → sets the auth cookie
 *   GET  /api/partner-accounts/me      → current partner (or user: null)
 *   PATCH /api/partner-accounts/{id}   → save manual fields
 *   POST /api/partner-accounts/logout  → clears the cookie
 *
 * The logged-in dashboard is Anke's spec, made real:
 *   - an "overview of the data collected" the partner can adjust manually
 *     (the Your-profile editor), with a VERIFIED read-only column for the
 *     facts Stellar Light measures (they can't edit those);
 *   - an "AI chatbot UI to acquire dynamic data" — the Update-by-chat tab
 *     interviews them, then drafts field updates they review before saving;
 *   - freshness status + "next nudge" surfaced up top, so the quarterly
 *     reminder loop (the partner-freshness cron) is visible, not a surprise.
 *
 * Visual language matches /ask: narrow focused container, big hero, rounded
 * cards, muted uppercase section headers, subtle borders.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Sparkles, Send, Pencil, CheckCircle2 } from "lucide-react";

const SECTORS = [
	"defi",
	"payments",
	"rwa",
	"stablecoins",
	"identity",
	"data",
	"ai",
	"gaming",
	"other",
];
const REGIONS = [
	"global",
	"north-america",
	"latam",
	"europe",
	"africa",
	"mena",
	"asia",
	"oceania",
];
const PRICING = [
	"free",
	"freemium",
	"subscription",
	"usage-based",
	"fixed",
	"hourly",
	"rev-share",
	"custom",
];

/** Manual, partner-owned fields — the ones the editor + chat can write. */
const MANUAL_KEYS = [
	"tagline",
	"description",
	"websiteUrl",
	"docsUrl",
	"githubOrg",
	"contactEmail",
	"contactChannel",
	"responseSla",
	"services",
	"sectors",
	"regions",
	"acceptingClients",
	"typicalEngagement",
	"leadTime",
	"pricingModel",
	"pricingNotes",
] as const;

interface Partner {
	id: string;
	name: string;
	slug?: string;
	partnerType?: string;
	tagline?: string;
	description?: string;
	websiteUrl?: string;
	docsUrl?: string;
	githubOrg?: string;
	contactEmail?: string;
	contactChannel?: string;
	responseSla?: string;
	services?: { tag: string }[];
	sectors?: string[];
	regions?: string[];
	acceptingClients?: boolean;
	typicalEngagement?: string;
	leadTime?: string;
	pricingModel?: string;
	pricingNotes?: string;
	status?: string;
	freshnessStatus?: string;
	lastPartnerUpdateAt?: string;
	nextReminderAt?: string;
	verified?: {
		githubLastCommitAt?: string | null;
		githubCommits90d?: number | null;
		onchainActive?: boolean | null;
		onchainNote?: string | null;
		scfInvolvement?: string | null;
		lastAutoVerifyAt?: string | null;
	};
}

const FRESHNESS_BADGE: Record<string, { label: string; cls: string }> = {
	fresh: {
		label: "Fresh",
		cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
	},
	aging: {
		label: "Aging — update soon",
		cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
	},
	stale: {
		label: "Stale — please update",
		cls: "bg-orange-500/15 text-orange-400 border-orange-500/30",
	},
	archived: {
		label: "Archived — hidden from matches",
		cls: "bg-red-500/15 text-red-400 border-red-500/30",
	},
};

/* Shell ─────────────────────────────────────────────────────────────── */

export function PartnerPortal() {
	const [loading, setLoading] = useState(true);
	const [partner, setPartner] = useState<Partner | null>(null);

	const loadMe = useCallback(async () => {
		try {
			const res = await fetch("/api/partner-accounts/me", {
				credentials: "include",
			});
			const data = await res.json();
			setPartner(data.user ?? null);
		} catch {
			setPartner(null);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadMe();
	}, [loadMe]);

	return (
		<main className="max-w-3xl mx-auto px-4 sm:px-6 py-16 pt-28">
			<Link
				href="/partners"
				className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-6 group"
			>
				<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
				<span className="text-sm font-medium">Back to Partners</span>
			</Link>

			<div className="mb-8">
				<div className="flex items-center gap-3 flex-wrap">
					<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
						Partner Portal
					</h1>
					<span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground border border-border">
						Beta
					</span>
				</div>
				<p className="text-sm text-muted-foreground mt-2 max-w-xl">
					Keep your profile current so builders — and their AI agents — find you.
					Update it by chatting with the assistant, or edit the fields directly.
					Facts marked <span className="text-foreground font-medium">verified</span>{" "}
					are measured by Stellar Light and can&apos;t be edited.
				</p>
			</div>

			{loading ? (
				<div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground text-sm">
					Loading…
				</div>
			) : partner ? (
				<Dashboard partner={partner} onSaved={loadMe} onLogout={loadMe} />
			) : (
				<LoginCard onSuccess={loadMe} />
			)}
		</main>
	);
}

/* Login ─────────────────────────────────────────────────────────────── */

function LoginCard({ onSuccess }: { onSuccess: () => void }) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [resetSent, setResetSent] = useState(false);
	// Primary path = emailed sign-in link (nobody was ever handed a password);
	// the password form is a secondary toggle for partners who set one.
	const [linkSent, setLinkSent] = useState(false);
	const [usePassword, setUsePassword] = useState(false);

	const inputCls =
		"w-full h-11 rounded-xl bg-white/[0.02] border border-border px-3.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-white/30 focus:shadow-[0_0_0_3px_rgba(253,218,36,0.12)] transition-all";

	async function sendLink(e: React.FormEvent) {
		e.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			const res = await fetch("/api/partners/magic-link", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
			});
			if (res.status === 429) {
				setError("Too many requests — try again in a few minutes.");
				return;
			}
			if (!res.ok) {
				setError("Enter a valid email address.");
				return;
			}
			// Constant response server-side — never reveals whether an account exists.
			setLinkSent(true);
		} catch {
			setError("Something went wrong. Try again.");
		} finally {
			setSubmitting(false);
		}
	}

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			const res = await fetch("/api/partner-accounts/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ email, password }),
			});
			if (!res.ok) {
				setError("Wrong email or password.");
				return;
			}
			onSuccess();
		} catch {
			setError("Something went wrong. Try again.");
		} finally {
			setSubmitting(false);
		}
	}

	async function forgotPassword() {
		if (!email) {
			setError("Enter your email above first, then tap Forgot password.");
			return;
		}
		setError(null);
		try {
			// Always responds 200 (no account enumeration); the email links to
			// /partners/reset-password via the collection's custom template.
			await fetch("/api/partner-accounts/forgot-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
			});
			setResetSent(true);
		} catch {
			setError("Couldn't send the reset email. Try again.");
		}
	}

	return (
		<div className="max-w-md">
			<form
				onSubmit={usePassword ? submit : sendLink}
				className="rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-5"
			>
				<div>
					<h2 className="text-lg font-semibold text-foreground">Sign in</h2>
					<p className="text-sm text-muted-foreground mt-1">
						{usePassword
							? "Sign in with your email and password."
							: "Enter your work email — if it matches your company's listing we'll email you a sign-in link. Also how you claim an unclaimed profile."}
					</p>
				</div>
				<Field label="Email">
					<input
						type="email"
						value={email}
						required
						onChange={(e) => setEmail(e.target.value)}
						className={inputCls}
						placeholder="you@company.com"
					/>
				</Field>
				{usePassword && (
					<Field label="Password">
						<input
							type="password"
							value={password}
							required
							onChange={(e) => setPassword(e.target.value)}
							className={inputCls}
							placeholder="••••••••"
						/>
					</Field>
				)}
				{error && <div className="text-xs text-red-400">{error}</div>}
				{linkSent && !usePassword && (
					<div className="text-xs text-emerald-400">
						If that email matches a partner account, a sign-in link is on its
						way — check your inbox (and spam). Links expire in 7 days.
					</div>
				)}
				{resetSent && usePassword && (
					<div className="text-xs text-emerald-400">
						If that email has a partner account, a reset link is on its way.
					</div>
				)}
				<button
					type="submit"
					disabled={submitting}
					className="w-full h-11 rounded-xl bg-foreground text-background font-medium text-sm disabled:opacity-50 transition-opacity"
				>
					{submitting
						? usePassword
							? "Signing in…"
							: "Sending…"
						: usePassword
							? "Sign in"
							: "Email me a sign-in link"}
				</button>
				<div className="flex items-center justify-center gap-4">
					<button
						type="button"
						onClick={() => {
							setUsePassword((v) => !v);
							setError(null);
						}}
						className="text-xs text-muted-foreground hover:text-foreground transition-colors"
					>
						{usePassword ? "Email me a link instead" : "Have a password?"}
					</button>
					{usePassword && (
						<button
							type="button"
							onClick={forgotPassword}
							className="text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							Forgot password?
						</button>
					)}
				</div>
			</form>
			<p className="text-xs text-muted-foreground mt-4">
				Not a partner yet?{" "}
				<Link
					href="/partners/chat"
					className="text-foreground underline underline-offset-2 hover:no-underline"
				>
					Get listed
				</Link>{" "}
				— tell us what you do in a quick chat, no account needed to start.
			</p>
		</div>
	);
}

/* Dashboard ─────────────────────────────────────────────────────────── */

type Tab = "profile" | "chat" | "leads";

interface Lead {
	id: string;
	need: string;
	source?: string;
	createdAt?: string;
}

function Dashboard({
	partner,
	onSaved,
	onLogout,
}: {
	partner: Partner;
	onSaved: () => void;
	onLogout: () => void;
}) {
	const [form, setForm] = useState<Partner>(partner);
	const [tab, setTab] = useState<Tab>("profile");
	const [saving, setSaving] = useState(false);
	const [savedAt, setSavedAt] = useState<string | null>(null);
	const [changed, setChanged] = useState<Set<string>>(new Set());
	const [chatBanner, setChatBanner] = useState<number | null>(null);

	const set = <K extends keyof Partner>(k: K, v: Partner[K]) => {
		setForm((f) => ({ ...f, [k]: v }));
		setChanged((c) => new Set(c).add(k as string));
	};

	const fresh = FRESHNESS_BADGE[form.freshnessStatus ?? "fresh"];
	const v = form.verified ?? {};

	/** Merge AI-extracted (non-null) fields from the chat into the form. */
	const applyExtracted = useCallback((fields: Record<string, unknown>) => {
		let n = 0;
		const touched = new Set<string>();
		setForm((f) => {
			const next = { ...f };
			for (const key of MANUAL_KEYS) {
				const val = fields[key];
				if (val == null) continue;
				if (Array.isArray(val) && val.length === 0) continue;
				if (typeof val === "string" && val.trim() === "") continue;
				if (key === "services") {
					next.services = (val as string[]).map((t) => ({ tag: t }));
				} else {
					// biome-ignore lint/suspicious/noExplicitAny: dynamic assign
					(next as any)[key] = val;
				}
				touched.add(key);
				n++;
			}
			return next;
		});
		setChanged((c) => {
			const nc = new Set(c);
			for (const k of touched) nc.add(k);
			return nc;
		});
		setChatBanner(n);
		setTab("profile");
	}, []);

	async function save() {
		setSaving(true);
		try {
			const res = await fetch(`/api/partner-accounts/${partner.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					tagline: form.tagline,
					description: form.description,
					websiteUrl: form.websiteUrl,
					docsUrl: form.docsUrl,
					githubOrg: form.githubOrg,
					contactEmail: form.contactEmail,
					contactChannel: form.contactChannel,
					responseSla: form.responseSla,
					services: form.services,
					sectors: form.sectors,
					regions: form.regions,
					acceptingClients: form.acceptingClients,
					typicalEngagement: form.typicalEngagement,
					leadTime: form.leadTime,
					pricingModel: form.pricingModel,
					pricingNotes: form.pricingNotes,
				}),
			});
			if (res.ok) {
				setSavedAt(new Date().toLocaleTimeString());
				setChanged(new Set());
				setChatBanner(null);
				onSaved();
			}
		} finally {
			setSaving(false);
		}
	}

	async function logout() {
		await fetch("/api/partner-accounts/logout", {
			method: "POST",
			credentials: "include",
		});
		onLogout();
	}

	return (
		<div className="space-y-6">
			{/* Header — identity, status, freshness, next nudge */}
			<div className="rounded-2xl border border-border bg-card p-5">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						<div className="text-lg font-semibold text-foreground">
							{form.name}
						</div>
						<div className="text-xs text-muted-foreground mt-0.5">
							{form.partnerType} ·{" "}
							{form.status === "published" ? (
								<span className="text-emerald-400">published</span>
							) : (
								<span>draft — visible once Stellar Light publishes it</span>
							)}
						</div>
					</div>
					<span
						className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap ${fresh?.cls ?? ""}`}
					>
						{fresh?.label}
					</span>
				</div>
				<div className="mt-3 pt-3 border-t border-border/60 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
					<span>
						Last updated:{" "}
						<span className="text-foreground/80">
							{fmtDate(form.lastPartnerUpdateAt) || "not yet"}
						</span>
					</span>
					<span>
						Next reminder:{" "}
						<span className="text-foreground/80">
							{fmtDate(form.nextReminderAt) || "—"}
						</span>
					</span>
				</div>
			</div>

			{/* Verified signals — read-only */}
			<section className="rounded-2xl border border-border bg-card p-5">
				<SectionTitle>
					Verified by Stellar Light
					<span className="ml-2 normal-case text-[10px] font-normal tracking-normal text-muted-foreground">
						measured automatically · you can&apos;t edit these
					</span>
				</SectionTitle>
				<div className="grid grid-cols-2 gap-2.5 text-sm">
					{/* GitHub activity only applies to open-source partners (tooling,
					    infra, protocols). Show it only when a GitHub org is set — most
					    anchors/ramps/legal/agencies are closed-source and shouldn't be
					    judged on commits they'll never have. */}
					{form.githubOrg ? (
						<>
							<Verified label="Last GitHub commit" value={fmtDate(v.githubLastCommitAt) || "—"} />
							<Verified label="Commits (90d)" value={v.githubCommits90d ?? "—"} />
						</>
					) : null}
					<Verified
						label="On-chain activity"
						value={
							v.onchainActive == null
								? "—"
								: v.onchainActive
									? "active"
									: "none detected"
						}
					/>
					<Verified label="SCF involvement" value={v.scfInvolvement ?? "—"} />
				</div>
				<p className="text-[11px] text-muted-foreground mt-2.5">
					{form.githubOrg
						? "GitHub activity comes from your public org. On-chain and SCF signals populate as we detect them."
						: "These populate as we detect your on-chain footprint and SCF history. Open-source? Add a GitHub org below to show code activity too — optional, skip it if you're not."}
				</p>
			</section>

			{/* Profile strength — the honest v1 of the partner competition: the
			    same score nudges match ranking, so "add what's missing" is not
			    just cosmetic. */}
			<ProfileStrength partner={form} />

			{/* Tab toggle: overview editor vs AI chat vs leads */}
			<div className="flex items-center gap-2">
				<TabButton
					active={tab === "profile"}
					onClick={() => setTab("profile")}
					icon={<Pencil className="w-3.5 h-3.5" />}
				>
					Your profile
				</TabButton>
				<TabButton
					active={tab === "chat"}
					onClick={() => setTab("chat")}
					icon={<Sparkles className="w-3.5 h-3.5" />}
				>
					Update by chat
				</TabButton>
				<TabButton
					active={tab === "leads"}
					onClick={() => setTab("leads")}
					icon={<CheckCircle2 className="w-3.5 h-3.5" />}
				>
					Leads
				</TabButton>
			</div>

			{tab === "leads" ? (
				<LeadsPanel slug={form.slug} />
			) : tab === "chat" ? (
				<MaintenanceChat partner={form} onApply={applyExtracted} />
			) : (
				<>
					{chatBanner != null && (
						<div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-300 flex items-center gap-2">
							<CheckCircle2 className="w-4 h-4 flex-shrink-0" />
							{chatBanner > 0 ? (
								<span>
									The assistant drafted {chatBanner} update
									{chatBanner === 1 ? "" : "s"} from your chat — review the
									highlighted fields and hit Save.
								</span>
							) : (
								<span>
									Nothing new to change from that chat — your profile already
									covers it.
								</span>
							)}
						</div>
					)}
					<ProfileEditor form={form} set={set} changed={changed} />
				</>
			)}

			{/* Save bar */}
			<div className="flex items-center gap-3 pt-2">
				<button
					type="button"
					onClick={save}
					disabled={saving}
					className="h-11 rounded-xl bg-foreground text-background font-medium text-sm px-5 disabled:opacity-50 transition-opacity"
				>
					{saving ? "Saving…" : "Save profile"}
				</button>
				{savedAt && (
					<span className="text-xs text-emerald-400">Saved at {savedAt}</span>
				)}
				{changed.size > 0 && !savedAt && (
					<span className="text-xs text-muted-foreground">
						{changed.size} unsaved change{changed.size === 1 ? "" : "s"}
					</span>
				)}
				<button
					type="button"
					onClick={logout}
					className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
				>
					Sign out
				</button>
			</div>
		</div>
	);
}

/* Maintenance chat (behind login) ───────────────────────────────────── */

interface ChatMsg {
	role: "user" | "assistant";
	content: string;
}

function MaintenanceChat({
	partner,
	onApply,
}: {
	partner: Partner;
	onApply: (fields: Record<string, unknown>) => void;
}) {
	// A hidden priming turn tells the interviewer what the partner already has,
	// so it asks "what changed?" instead of re-onboarding from scratch. It is
	// sent to the API but never rendered.
	const seed = useMemo<ChatMsg>(
		() => ({
			role: "user",
			content:
				`I already have a Stellar Light partner profile and want to update it. Here is my current profile — ask me what has changed rather than re-asking everything.\n\n` +
				currentProfileSummary(partner),
		}),
		[partner],
	);

	const [messages, setMessages] = useState<ChatMsg[]>([]);
	const [greeting, setGreeting] = useState<string | null>(null);
	const [input, setInput] = useState("");
	const [busy, setBusy] = useState(false);
	const [applying, setApplying] = useState(false);
	const [unavailable, setUnavailable] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	const scrollToEnd = useCallback(() => {
		requestAnimationFrame(() => {
			scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
		});
	}, []);

	const callChat = useCallback(
		async (convo: ChatMsg[]) => {
			const res = await fetch("/api/partners/onboard", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ mode: "chat", messages: [seed, ...convo] }),
			});
			if (res.status === 503) {
				setUnavailable(true);
				return null;
			}
			if (!res.ok) {
				setError("The assistant hit a snag — edit your profile directly instead.");
				return null;
			}
			const data = await res.json();
			return typeof data.reply === "string" ? (data.reply as string) : null;
		},
		[seed],
	);

	// Fetch the opening question once, primed with the partner's current data.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			setBusy(true);
			const reply = await callChat([]);
			if (cancelled) return;
			setGreeting(
				reply ??
					`Hi! Let's keep ${partner.name}'s profile current. What's changed since you last updated — new services, regions, pricing, or availability?`,
			);
			setBusy(false);
			scrollToEnd();
		})();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	async function send() {
		const text = input.trim();
		if (!text || busy) return;
		const next = [...messages, { role: "user" as const, content: text }];
		setMessages(next);
		setInput("");
		setBusy(true);
		setError(null);
		const reply = await callChat(next);
		if (reply) setMessages([...next, { role: "assistant", content: reply }]);
		setBusy(false);
		scrollToEnd();
	}

	async function applyToProfile() {
		if (messages.length === 0 || applying) return;
		setApplying(true);
		setError(null);
		try {
			const res = await fetch("/api/partners/onboard", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ mode: "extract", messages: [seed, ...messages] }),
			});
			if (!res.ok) {
				setError("Couldn't read the changes from that chat — try editing directly.");
				return;
			}
			const data = await res.json();
			if (data.fields) onApply(data.fields as Record<string, unknown>);
		} catch {
			setError("Couldn't read the changes — try editing directly.");
		} finally {
			setApplying(false);
		}
	}

	if (unavailable) {
		return (
			<div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
				The chat assistant isn&apos;t available right now — switch to{" "}
				<span className="text-foreground font-medium">Your profile</span> and edit
				the fields directly.
			</div>
		);
	}

	const display: ChatMsg[] = greeting
		? [{ role: "assistant", content: greeting }, ...messages]
		: messages;

	return (
		<div className="rounded-2xl border border-border bg-card overflow-hidden">
			<div
				ref={scrollRef}
				className="max-h-[420px] min-h-[220px] overflow-y-auto p-4 space-y-3"
			>
				{display.map((m, i) => (
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
						<div className="rounded-2xl rounded-bl-sm bg-white/[0.03] border border-border px-3.5 py-2 text-sm text-muted-foreground">
							<span className="inline-flex gap-1 items-center">
								<Dot /> <Dot /> <Dot />
							</span>
						</div>
					</div>
				)}
			</div>

			{error && (
				<div className="px-4 py-2 text-xs text-red-400 border-t border-border">
					{error}
				</div>
			)}

			<div className="border-t border-border p-3 flex items-center gap-2">
				<input
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							send();
						}
					}}
					placeholder="tell the assistant what changed…"
					className="flex-1 h-10 rounded-xl bg-white/[0.02] border border-border px-3.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-white/30 transition-colors"
				/>
				<button
					type="button"
					onClick={send}
					disabled={busy || !input.trim()}
					className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 text-foreground disabled:opacity-40 transition-colors"
					aria-label="Send"
				>
					<Send className="w-4 h-4" />
				</button>
			</div>

			<div className="border-t border-border px-3 py-2.5 flex items-center justify-between gap-3">
				<span className="text-[11px] text-muted-foreground">
					When you&apos;re done, draft the changes into your profile to review.
				</span>
				<button
					type="button"
					onClick={applyToProfile}
					disabled={applying || messages.length === 0}
					className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-xl bg-foreground text-background text-xs font-medium disabled:opacity-40 transition-opacity whitespace-nowrap"
				>
					<Sparkles className="w-3.5 h-3.5" />
					{applying ? "Drafting…" : "Draft into profile"}
				</button>
			</div>
		</div>
	);
}

/* Profile editor (overview) ─────────────────────────────────────────── */

function ProfileEditor({
	form,
	set,
	changed,
}: {
	form: Partner;
	set: <K extends keyof Partner>(k: K, v: Partner[K]) => void;
	changed: Set<string>;
}) {
	return (
		<section className="rounded-2xl border border-border bg-card p-5 space-y-4">
			<SectionTitle>Your profile</SectionTitle>
			<Input
				label="Tagline"
				value={form.tagline ?? ""}
				onChange={(x) => set("tagline", x)}
				hint="≤140 chars — the first line a builder sees"
				changed={changed.has("tagline")}
			/>
			<TextArea
				label="Description"
				value={form.description ?? ""}
				onChange={(x) => set("description", x)}
				changed={changed.has("description")}
			/>
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<Input label="Website" value={form.websiteUrl ?? ""} onChange={(x) => set("websiteUrl", x)} changed={changed.has("websiteUrl")} />
				<Input label="Docs URL" value={form.docsUrl ?? ""} onChange={(x) => set("docsUrl", x)} changed={changed.has("docsUrl")} />
				<Input label="GitHub org" value={form.githubOrg ?? ""} onChange={(x) => set("githubOrg", x)} hint="optional — open-source only" changed={changed.has("githubOrg")} />
				<Input label="Contact email" value={form.contactEmail ?? ""} onChange={(x) => set("contactEmail", x)} changed={changed.has("contactEmail")} />
				<Input label="Contact channel" value={form.contactChannel ?? ""} onChange={(x) => set("contactChannel", x)} hint="Discord / Telegram / lead form" changed={changed.has("contactChannel")} />
				<Input label="Response SLA" value={form.responseSla ?? ""} onChange={(x) => set("responseSla", x)} hint="e.g. within 24h weekdays" changed={changed.has("responseSla")} />
			</div>

			<TagEditor
				label="Services"
				hint="Granular tags the AI matchmaker matches on — e.g. sep-24-ngn, soroban-audit-rust"
				tags={(form.services ?? []).map((s) => s.tag)}
				onChange={(tags) => set("services", tags.map((t) => ({ tag: t })))}
				changed={changed.has("services")}
			/>
			<MultiSelect label="Sectors" options={SECTORS} value={form.sectors ?? []} onChange={(x) => set("sectors", x)} changed={changed.has("sectors")} />
			<MultiSelect label="Regions" options={REGIONS} value={form.regions ?? []} onChange={(x) => set("regions", x)} changed={changed.has("regions")} />

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						checked={!!form.acceptingClients}
						onChange={(e) => set("acceptingClients", e.target.checked)}
					/>
					Currently accepting new clients
				</label>
				<Select label="Pricing model" options={PRICING} value={form.pricingModel ?? ""} onChange={(x) => set("pricingModel", x)} changed={changed.has("pricingModel")} />
				<Input label="Typical engagement" value={form.typicalEngagement ?? ""} onChange={(x) => set("typicalEngagement", x)} changed={changed.has("typicalEngagement")} />
				<Input label="Lead time" value={form.leadTime ?? ""} onChange={(x) => set("leadTime", x)} changed={changed.has("leadTime")} />
			</div>
			<TextArea label="Pricing notes" value={form.pricingNotes ?? ""} onChange={(x) => set("pricingNotes", x)} changed={changed.has("pricingNotes")} />
		</section>
	);
}

/* Atoms ─────────────────────────────────────────────────────────────── */

function TabButton({
	active,
	onClick,
	icon,
	children,
}: {
	active: boolean;
	onClick: () => void;
	icon: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={
				"inline-flex items-center gap-1.5 text-sm px-3.5 py-2 rounded-xl border transition-colors " +
				(active
					? "bg-white/10 text-foreground border-white/25"
					: "bg-white/[0.02] text-muted-foreground border-border hover:text-foreground hover:border-white/25")
			}
		>
			{icon}
			{children}
		</button>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label className="block">
			<span className="block text-xs font-medium text-foreground mb-1.5">{label}</span>
			{children}
		</label>
	);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
			{children}
		</div>
	);
}

function Verified({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="rounded-lg border border-border bg-white/[0.015] px-3 py-2">
			<div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
				{label}
			</div>
			<div className="text-foreground/90">{value}</div>
		</div>
	);
}

function inputCls(changed?: boolean): string {
	return (
		"w-full rounded-lg bg-white/[0.02] border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-white/30 transition-colors " +
		(changed ? "border-emerald-500/40" : "border-border")
	);
}

function Input({
	label,
	value,
	onChange,
	type = "text",
	hint,
	changed,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	type?: string;
	hint?: string;
	changed?: boolean;
}) {
	return (
		<label className="block">
			<span className="block text-xs font-medium text-foreground mb-1">
				{label}
				{hint && (
					<span className="ml-2 text-[10px] text-muted-foreground font-normal">
						{hint}
					</span>
				)}
			</span>
			<input
				type={type}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={inputCls(changed)}
			/>
		</label>
	);
}

function TextArea({
	label,
	value,
	onChange,
	changed,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	changed?: boolean;
}) {
	return (
		<label className="block">
			<span className="block text-xs font-medium text-foreground mb-1">{label}</span>
			<textarea
				value={value}
				rows={3}
				onChange={(e) => onChange(e.target.value)}
				className={inputCls(changed) + " resize-y"}
			/>
		</label>
	);
}

function Select({
	label,
	options,
	value,
	onChange,
	changed,
}: {
	label: string;
	options: string[];
	value: string;
	onChange: (v: string) => void;
	changed?: boolean;
}) {
	return (
		<label className="block">
			<span className="block text-xs font-medium text-foreground mb-1">{label}</span>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={inputCls(changed)}
			>
				<option value="">—</option>
				{options.map((o) => (
					<option key={o} value={o}>
						{o}
					</option>
				))}
			</select>
		</label>
	);
}

function MultiSelect({
	label,
	options,
	value,
	onChange,
	changed,
}: {
	label: string;
	options: string[];
	value: string[];
	onChange: (v: string[]) => void;
	changed?: boolean;
}) {
	const toggle = (o: string) =>
		onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
	return (
		<div>
			<span className="block text-xs font-medium text-foreground mb-1.5">
				{label}
				{changed && <span className="ml-2 text-[10px] text-emerald-400">updated</span>}
			</span>
			<div className="flex flex-wrap gap-1.5">
				{options.map((o) => {
					const on = value.includes(o);
					return (
						<button
							type="button"
							key={o}
							onClick={() => toggle(o)}
							className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
								on
									? "bg-foreground text-background border-foreground"
									: "bg-white/[0.02] border-border text-muted-foreground hover:text-foreground hover:border-white/25"
							}`}
						>
							{o}
						</button>
					);
				})}
			</div>
		</div>
	);
}

function TagEditor({
	label,
	hint,
	tags,
	onChange,
	changed,
}: {
	label: string;
	hint?: string;
	tags: string[];
	onChange: (tags: string[]) => void;
	changed?: boolean;
}) {
	const [input, setInput] = useState("");
	const add = () => {
		const t = input.trim().toLowerCase().replace(/\s+/g, "-");
		if (t && !tags.includes(t)) onChange([...tags, t]);
		setInput("");
	};
	return (
		<div>
			<span className="block text-xs font-medium text-foreground mb-1">
				{label}
				{hint && (
					<span className="ml-2 text-[10px] text-muted-foreground font-normal">
						{hint}
					</span>
				)}
				{changed && <span className="ml-2 text-[10px] text-emerald-400">updated</span>}
			</span>
			<div className="flex flex-wrap gap-1.5 mb-2">
				{tags.map((t) => (
					<span
						key={t}
						className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-border bg-white/[0.03] text-foreground"
					>
						{t}
						<button
							type="button"
							onClick={() => onChange(tags.filter((x) => x !== t))}
							className="text-muted-foreground hover:text-foreground"
						>
							×
						</button>
					</span>
				))}
			</div>
			<div className="flex gap-2">
				<input
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							add();
						}
					}}
					placeholder="add a tag, press Enter"
					className="flex-1 rounded-lg bg-white/[0.02] border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-white/30 transition-colors"
				/>
				<button
					type="button"
					onClick={add}
					className="rounded-lg border border-border px-3 text-sm text-foreground hover:bg-white/[0.04]"
				>
					Add
				</button>
			</div>
		</div>
	);
}

function Dot() {
	return (
		<span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-pulse" />
	);
}

/* Helpers ───────────────────────────────────────────────────────────── */

/** Render **bold** markers as real bold (Haiku emits markdown). */
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

/** Compact, model-readable summary of the partner's current manual fields. */
function currentProfileSummary(p: Partner): string {
	const lines: string[] = [];
	const add = (k: string, val: unknown) => {
		if (val == null || val === "" || (Array.isArray(val) && val.length === 0))
			return;
		lines.push(`- ${k}: ${Array.isArray(val) ? val.join(", ") : String(val)}`);
	};
	add("tagline", p.tagline);
	add("description", p.description);
	add("services", (p.services ?? []).map((s) => s.tag));
	add("sectors", p.sectors);
	add("regions", p.regions);
	add("accepting clients", p.acceptingClients);
	add("typical engagement", p.typicalEngagement);
	add("lead time", p.leadTime);
	add("pricing model", p.pricingModel);
	add("pricing notes", p.pricingNotes);
	add("website", p.websiteUrl);
	add("docs", p.docsUrl);
	add("github org", p.githubOrg);
	add("contact channel", p.contactChannel);
	add("response SLA", p.responseSla);
	return lines.length ? lines.join("\n") : "(profile is mostly empty)";
}

function fmtDate(d?: string | null): string {
	if (!d) return "";
	try {
		return new Date(d).toLocaleDateString();
	} catch {
		return "";
	}
}

/* Profile strength ──────────────────────────────────────────────────── */

/** Mirrors profileStrength() in src/lib/partner-match.ts — the matcher gives
 *  complete profiles a small ranking boost, so this meter is the visible half
 *  of the same incentive. Keep the checks in sync. */
function strengthChecks(p: Partner): Array<{ label: string; ok: boolean }> {
	return [
		{ label: "Tagline", ok: Boolean(p.tagline) },
		{ label: "Description", ok: Boolean(p.description) },
		{ label: "Service tags", ok: (p.services ?? []).length > 0 },
		{ label: "Sectors", ok: (p.sectors ?? []).length > 0 },
		{ label: "Regions", ok: (p.regions ?? []).length > 0 },
		{
			label: "Contact path",
			ok: Boolean(p.contactEmail || p.contactChannel),
		},
		{ label: "Website", ok: Boolean(p.websiteUrl) },
		{ label: "Fresh profile", ok: (p.freshnessStatus ?? "fresh") === "fresh" },
	];
}

function ProfileStrength({ partner }: { partner: Partner }) {
	const checks = strengthChecks(partner);
	const done = checks.filter((c) => c.ok).length;
	const pct = Math.round((done / checks.length) * 100);
	const missing = checks.filter((c) => !c.ok).slice(0, 3);
	return (
		<section className="rounded-2xl border border-border bg-card p-5">
			<div className="flex items-center justify-between gap-3 mb-2">
				<h3 className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
					Profile strength
				</h3>
				<span className="text-xs text-foreground font-medium">{pct}%</span>
			</div>
			<div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
				<div
					className={`h-full rounded-full transition-all ${
						pct >= 80
							? "bg-emerald-400/80"
							: pct >= 50
								? "bg-yellow-400/70"
								: "bg-orange-400/70"
					}`}
					style={{ width: `${pct}%` }}
				/>
			</div>
			<p className="text-xs text-muted-foreground mt-2.5">
				{missing.length === 0 ? (
					<>Complete profiles rank higher in concierge matches — yours is all set.</>
				) : (
					<>
						Complete profiles rank higher in concierge matches. Next:{" "}
						<span className="text-foreground/90">
							{missing.map((m) => m.label).join(" · ")}
						</span>
					</>
				)}
			</p>
			<CompletenessRank
				slug={partner.slug}
				partnerType={partner.partnerType}
				ownStrength={done / checks.length}
			/>
		</section>
	);
}

/* Competition rank ───────────────────────────────────────────────────── */

const TYPE_PLURAL: Record<string, string> = {
	anchor: "anchors",
	"on-off-ramp": "ramps",
	infrastructure: "infrastructure providers",
	tooling: "tooling partners",
	protocol: "protocols",
	wallet: "wallets",
	"audit-firm": "audit firms",
	legal: "legal partners",
	agency: "agencies",
	other: "partners",
};

/** Completeness score on the PUBLIC partner shape — mirrors strengthChecks()
 *  / profileStrength() so the rank agrees with the meter and the matcher. */
// biome-ignore lint/suspicious/noExplicitAny: public API partner shape
function publicStrength(p: any): number {
	const checks = [
		Boolean(p.tagline),
		Boolean(p.description),
		(p.services ?? []).length > 0,
		(p.sectors ?? []).length > 0,
		(p.regions ?? []).length > 0 || Boolean(p.country),
		Boolean(p.contactEmail || p.contactChannel),
		Boolean(p.websiteUrl),
		Boolean(p.logoUrl),
		(p.freshness?.status ?? "fresh") === "fresh",
	];
	return checks.filter(Boolean).length / checks.length;
}

/**
 * "You rank #3 of 29 anchors" — the honest, live competition signal (Anke's
 * P6). Ranks the partner against published peers of the same type by the same
 * completeness score the matcher boosts. Draft/unpublished → a publish nudge.
 */
function CompletenessRank({
	slug,
	partnerType,
	ownStrength,
}: {
	slug?: string;
	partnerType?: string;
	ownStrength: number;
}) {
	const [state, setState] = useState<
		{ rank: number; total: number } | "loading" | "unranked" | "error"
	>("loading");

	useEffect(() => {
		if (!slug || !partnerType) {
			setState("unranked");
			return;
		}
		(async () => {
			try {
				const r = await fetch(
					// all=1: rank against the FULL peer pool — a partner failing the
					// directory quality bar must still see itself in its own ranking.
					`/api/partners?type=${encodeURIComponent(partnerType)}&limit=200&all=1`,
				);
				const d = await r.json().catch(() => ({}));
				// biome-ignore lint/suspicious/noExplicitAny: public API shape
				const peers: any[] = Array.isArray(d.partners) ? d.partners : [];
				if (!peers.length) {
					setState("unranked");
					return;
				}
				// Rank = 1 + peers strictly stronger than me (dense, ties share).
				const stronger = peers.filter(
					(p) => p.slug !== slug && publicStrength(p) > ownStrength + 1e-9,
				).length;
				const inList = peers.some((p) => p.slug === slug);
				setState({
					rank: stronger + 1,
					total: inList ? peers.length : peers.length + 1,
				});
			} catch {
				setState("error");
			}
		})();
	}, [slug, partnerType, ownStrength]);

	if (state === "loading" || state === "error") return null;
	const label = TYPE_PLURAL[partnerType ?? "other"] ?? "partners";

	if (state === "unranked") {
		return (
			<p className="text-xs text-muted-foreground mt-2">
				Publish your profile to compete for the top spot among {label}.
			</p>
		);
	}

	const top = state.rank === 1;
	return (
		<div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-2 text-xs">
			<span
				className={`inline-flex items-center justify-center min-w-[2rem] h-6 px-1.5 rounded-md font-semibold ${
					top
						? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
						: "bg-white/[0.06] text-foreground border border-border"
				}`}
			>
				#{state.rank}
			</span>
			<span className="text-muted-foreground">
				of {state.total} {label} by profile completeness
				{top ? " — you're leading 🎉" : ". Fill the gaps above to climb."}
			</span>
		</div>
	);
}

/* Leads panel ────────────────────────────────────────────────────────── */

/** Builder searches that surfaced this partner (via the public concierge).
 *  Reads Payload's auto-mounted /api/partner-leads with cookie auth — the
 *  collection's read access row-scopes to the partner's own slug. */
function LeadsPanel({ slug }: { slug?: string }) {
	const [leads, setLeads] = useState<Lead[] | null>(null);

	useEffect(() => {
		if (!slug) {
			setLeads([]);
			return;
		}
		(async () => {
			try {
				const r = await fetch(
					`/api/partner-leads?where[partnerSlug][equals]=${encodeURIComponent(slug)}&sort=-createdAt&limit=25&depth=0`,
					{ credentials: "include" },
				);
				const d = await r.json().catch(() => ({}));
				setLeads(Array.isArray(d.docs) ? d.docs : []);
			} catch {
				setLeads([]);
			}
		})();
	}, [slug]);

	if (leads === null) {
		return (
			<div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
				Loading leads…
			</div>
		);
	}

	if (leads.length === 0) {
		return (
			<div className="rounded-2xl border border-border bg-card p-8 text-center">
				<p className="text-sm text-muted-foreground max-w-md mx-auto">
					No leads yet. When a builder asks the concierge for something you
					offer, it shows up here (and in your weekly digest). A complete,
					fresh profile gets matched more.
				</p>
			</div>
		);
	}

	return (
		<div className="rounded-2xl border border-border bg-card p-5">
			<h3 className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-4">
				Builders were looking for this ({leads.length})
			</h3>
			<ul className="divide-y divide-border/60">
				{leads.map((l) => (
					<li key={l.id} className="py-2.5 flex items-baseline justify-between gap-3">
						<span className="text-sm text-foreground/90">“{l.need}”</span>
						<span className="text-[11px] text-muted-foreground whitespace-nowrap">
							{fmtDate(l.createdAt)}
						</span>
					</li>
				))}
			</ul>
			<p className="text-[11px] text-muted-foreground/60 mt-3">
				Anonymous searches from the partner concierge — shown so you know the
				demand is real. Keep your services current to catch more of them.
			</p>
		</div>
	);
}
