"use client";

/**
 * Partner portal client. Three states: loading, logged-out (login form),
 * logged-in (profile editor). All server work is Payload's cookie-auth
 * REST under /api/partner-accounts/*:
 *
 *   POST /api/partner-accounts/login   → sets the auth cookie
 *   GET  /api/partner-accounts/me      → current partner (or user: null)
 *   PATCH /api/partner-accounts/{id}   → save manual fields
 *   POST /api/partner-accounts/logout  → clears the cookie
 *
 * The design point: every field is labelled manual (partner-owned,
 * editable) or VERIFIED (system-computed, read-only with a badge) so the
 * partner sees exactly what they control vs what stellarlight measures.
 */

import { useCallback, useEffect, useState } from "react";

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
	fresh: { label: "Fresh", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
	aging: { label: "Aging — update soon", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
	stale: { label: "Stale — please update", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
	archived: { label: "Archived — hidden from matches", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
};

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

	if (loading) {
		return (
			<main className="max-w-3xl mx-auto px-6 py-20 text-center text-muted-foreground">
				Loading…
			</main>
		);
	}

	return (
		<main className="max-w-3xl mx-auto px-6 py-12">
			<div className="mb-8">
				<h1 className="text-2xl font-bold text-foreground">Partner Portal</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Keep your profile current so builders — and their AI agents — find
					you. Fields marked{" "}
					<span className="text-foreground font-medium">verified</span> are
					measured by Stellar Light and can't be edited.
				</p>
			</div>
			{partner ? (
				<ProfileEditor partner={partner} onSaved={loadMe} onLogout={loadMe} />
			) : (
				<LoginForm onSuccess={loadMe} />
			)}
		</main>
	);
}

/* ─── login ──────────────────────────────────────────────────────────── */

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

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

	return (
		<form
			onSubmit={submit}
			className="max-w-sm rounded-xl border border-border/50 bg-card p-6 space-y-4"
		>
			<div className="text-sm text-muted-foreground">
				Sign in with the credentials Stellar Light shared with you.
			</div>
			<Input label="Email" type="email" value={email} onChange={setEmail} required />
			<Input
				label="Password"
				type="password"
				value={password}
				onChange={setPassword}
				required
			/>
			{error && <div className="text-xs text-red-400">{error}</div>}
			<button
				type="submit"
				disabled={submitting}
				className="w-full rounded-lg bg-foreground text-background font-medium text-sm py-2.5 disabled:opacity-50"
			>
				{submitting ? "Signing in…" : "Sign in"}
			</button>
		</form>
	);
}

/* ─── profile editor ─────────────────────────────────────────────────── */

function ProfileEditor({
	partner,
	onSaved,
	onLogout,
}: {
	partner: Partner;
	onSaved: () => void;
	onLogout: () => void;
}) {
	const [form, setForm] = useState<Partner>(partner);
	const [saving, setSaving] = useState(false);
	const [savedAt, setSavedAt] = useState<string | null>(null);
	const set = <K extends keyof Partner>(k: K, v: Partner[K]) =>
		setForm((f) => ({ ...f, [k]: v }));

	const fresh = FRESHNESS_BADGE[form.freshnessStatus ?? "fresh"];
	const v = form.verified ?? {};

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
		<div className="space-y-8">
			{/* Header — name, status, freshness */}
			<div className="flex items-start justify-between gap-4 rounded-xl border border-border/50 bg-card p-5">
				<div>
					<div className="text-lg font-semibold text-foreground">{form.name}</div>
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
					className={`text-[11px] px-2.5 py-1 rounded-full border ${fresh?.cls ?? ""}`}
				>
					{fresh?.label}
				</span>
			</div>

			{/* Verified signals — read-only */}
			<section>
				<SectionTitle>
					Verified by Stellar Light
					<span className="ml-2 text-[10px] font-normal text-muted-foreground">
						measured automatically · you can't edit these
					</span>
				</SectionTitle>
				<div className="grid grid-cols-2 gap-3 text-sm">
					<Verified label="Last GitHub commit" value={fmtDate(v.githubLastCommitAt)} />
					<Verified label="Commits (90d)" value={v.githubCommits90d ?? "—"} />
					<Verified
						label="On-chain activity"
						value={v.onchainActive == null ? "—" : v.onchainActive ? "active" : "none detected"}
					/>
					<Verified label="SCF involvement" value={v.scfInvolvement ?? "—"} />
				</div>
				{!v.lastAutoVerifyAt && (
					<p className="text-[11px] text-muted-foreground mt-2">
						No verified signals yet — they populate once our crawler reads your
						GitHub org and on-chain footprint.
					</p>
				)}
			</section>

			{/* Manual fields — editable */}
			<section className="space-y-4">
				<SectionTitle>Your profile</SectionTitle>
				<Input label="Tagline" value={form.tagline ?? ""} onChange={(x) => set("tagline", x)} hint="≤140 chars — the first line a builder sees" />
				<TextArea label="Description" value={form.description ?? ""} onChange={(x) => set("description", x)} />
				<div className="grid grid-cols-2 gap-3">
					<Input label="Website" value={form.websiteUrl ?? ""} onChange={(x) => set("websiteUrl", x)} />
					<Input label="Docs URL" value={form.docsUrl ?? ""} onChange={(x) => set("docsUrl", x)} />
					<Input label="GitHub org" value={form.githubOrg ?? ""} onChange={(x) => set("githubOrg", x)} hint="drives your verified signals" />
					<Input label="Contact email" value={form.contactEmail ?? ""} onChange={(x) => set("contactEmail", x)} />
					<Input label="Contact channel" value={form.contactChannel ?? ""} onChange={(x) => set("contactChannel", x)} hint="Discord / Telegram / lead form" />
					<Input label="Response SLA" value={form.responseSla ?? ""} onChange={(x) => set("responseSla", x)} hint="e.g. within 24h weekdays" />
				</div>

				<TagEditor
					label="Services"
					hint="Granular tags the AI matchmaker matches on — e.g. sep-24-ngn, soroban-audit-rust"
					tags={(form.services ?? []).map((s) => s.tag)}
					onChange={(tags) => set("services", tags.map((t) => ({ tag: t })))}
				/>
				<MultiSelect label="Sectors" options={SECTORS} value={form.sectors ?? []} onChange={(x) => set("sectors", x)} />
				<MultiSelect label="Regions" options={REGIONS} value={form.regions ?? []} onChange={(x) => set("regions", x)} />

				<div className="grid grid-cols-2 gap-3">
					<label className="flex items-center gap-2 text-sm text-foreground">
						<input
							type="checkbox"
							checked={!!form.acceptingClients}
							onChange={(e) => set("acceptingClients", e.target.checked)}
						/>
						Currently accepting new clients
					</label>
					<Select label="Pricing model" options={PRICING} value={form.pricingModel ?? ""} onChange={(x) => set("pricingModel", x)} />
					<Input label="Typical engagement" value={form.typicalEngagement ?? ""} onChange={(x) => set("typicalEngagement", x)} />
					<Input label="Lead time" value={form.leadTime ?? ""} onChange={(x) => set("leadTime", x)} />
				</div>
				<TextArea label="Pricing notes" value={form.pricingNotes ?? ""} onChange={(x) => set("pricingNotes", x)} />
			</section>

			{/* Actions */}
			<div className="flex items-center gap-3 pt-2 border-t border-border/40">
				<button
					type="button"
					onClick={save}
					disabled={saving}
					className="rounded-lg bg-foreground text-background font-medium text-sm px-5 py-2.5 disabled:opacity-50"
				>
					{saving ? "Saving…" : "Save profile"}
				</button>
				{savedAt && (
					<span className="text-xs text-emerald-400">Saved at {savedAt}</span>
				)}
				<button
					type="button"
					onClick={logout}
					className="ml-auto text-xs text-muted-foreground hover:text-foreground"
				>
					Sign out
				</button>
			</div>
		</div>
	);
}

/* ─── small UI atoms ─────────────────────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-3">
			{children}
		</div>
	);
}

function Verified({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="rounded-lg border border-border/40 bg-card/40 px-3 py-2">
			<div className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
				{label}
			</div>
			<div className="text-foreground/90">{value}</div>
		</div>
	);
}

function Input({
	label,
	value,
	onChange,
	type = "text",
	hint,
	required,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	type?: string;
	hint?: string;
	required?: boolean;
}) {
	return (
		<label className="block">
			<span className="block text-xs font-medium text-foreground mb-1">
				{label}
				{hint && <span className="ml-2 text-[10px] text-muted-foreground font-normal">{hint}</span>}
			</span>
			<input
				type={type}
				value={value}
				required={required}
				onChange={(e) => onChange(e.target.value)}
				className="w-full rounded-lg bg-black/30 border border-border/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-border"
			/>
		</label>
	);
}

function TextArea({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<label className="block">
			<span className="block text-xs font-medium text-foreground mb-1">{label}</span>
			<textarea
				value={value}
				rows={3}
				onChange={(e) => onChange(e.target.value)}
				className="w-full rounded-lg bg-black/30 border border-border/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-border resize-y"
			/>
		</label>
	);
}

function Select({
	label,
	options,
	value,
	onChange,
}: {
	label: string;
	options: string[];
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<label className="block">
			<span className="block text-xs font-medium text-foreground mb-1">{label}</span>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="w-full rounded-lg bg-black/30 border border-border/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-border"
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
}: {
	label: string;
	options: string[];
	value: string[];
	onChange: (v: string[]) => void;
}) {
	const toggle = (o: string) =>
		onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
	return (
		<div>
			<span className="block text-xs font-medium text-foreground mb-1.5">{label}</span>
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
									: "border-border/50 text-muted-foreground hover:text-foreground"
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
}: {
	label: string;
	hint?: string;
	tags: string[];
	onChange: (tags: string[]) => void;
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
				{hint && <span className="ml-2 text-[10px] text-muted-foreground font-normal">{hint}</span>}
			</span>
			<div className="flex flex-wrap gap-1.5 mb-2">
				{tags.map((t) => (
					<span
						key={t}
						className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-border/50 bg-white/[0.03] text-foreground"
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
					className="flex-1 rounded-lg bg-black/30 border border-border/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-border"
				/>
				<button
					type="button"
					onClick={add}
					className="rounded-lg border border-border/50 px-3 text-sm text-foreground hover:bg-white/[0.04]"
				>
					Add
				</button>
			</div>
		</div>
	);
}

function fmtDate(d?: string | null): string {
	if (!d) return "—";
	try {
		return new Date(d).toLocaleDateString();
	} catch {
		return "—";
	}
}
