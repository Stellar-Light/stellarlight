"use client";

/**
 * "Is this your company?" — claim CTA on public partner profiles.
 *
 * Most of the directory was seeded curated (the companies never signed up),
 * so every profile offers a claim path: enter your work email → recorded as a
 * claim request via POST /api/partners/submit-listing (same dedupe pipeline
 * the concierge uses — the slug match routes it to claim, never a duplicate).
 * The team verifies the email's domain against the website, then publishes /
 * invites.
 */

import { useState } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";

export function PartnerClaimProfile({ orgName }: { orgName: string }) {
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (busy || !email.trim()) return;
		setBusy(true);
		setError(null);
		try {
			const r = await fetch("/api/partners/submit-listing", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ orgName, contactEmail: email.trim() }),
			});
			const d = await r.json().catch(() => ({}));
			if (!r.ok) {
				setError(d.error ?? "Couldn't send the claim — try again shortly.");
				return;
			}
			setDone(true);
		} finally {
			setBusy(false);
		}
	}

	if (done) {
		return (
			<div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
				<span className="text-foreground font-medium">Claim received.</span>{" "}
				Once we verify you&apos;re with {orgName}, we&apos;ll email{" "}
				<span className="text-foreground">{email}</span> an invite to manage
				this profile.
			</div>
		);
	}

	return (
		<div className="rounded-xl border border-border bg-card p-4">
			{!open ? (
				<div className="flex items-center justify-between gap-3 flex-wrap">
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<BadgeCheck className="w-4 h-4" />
						Is this your company? Claim the profile to keep it current.
					</div>
					<button
						onClick={() => setOpen(true)}
						className="h-9 px-4 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium text-foreground transition-colors"
					>
						Claim this profile
					</button>
				</div>
			) : (
				<form onSubmit={submit} className="flex items-center gap-2 flex-wrap">
					<input
						type="email"
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder="your work email @company domain"
						className="flex-1 min-w-[220px] h-10 px-3 bg-white/[0.02] text-sm text-foreground placeholder-muted-foreground rounded-lg border border-border outline-none transition-[border-color] duration-150 focus:border-white/30"
					/>
					<button
						type="submit"
						disabled={busy || !email.trim()}
						className="h-10 px-4 inline-flex items-center gap-2 rounded-lg bg-foreground text-background text-sm font-medium disabled:opacity-40"
					>
						{busy && <Loader2 className="w-4 h-4 animate-spin" />}
						Request access
					</button>
					{error && <div className="w-full text-xs text-red-400">{error}</div>}
				</form>
			)}
		</div>
	);
}
