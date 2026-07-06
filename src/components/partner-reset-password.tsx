"use client";

/**
 * Set/reset a partner-accounts password from an emailed token.
 * POSTs Payload's auto-mounted /api/partner-accounts/reset-password.
 * On success Payload logs the partner in (sets the auth cookie), so we
 * route straight to the dashboard.
 */

import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const INPUT_CLS =
	"w-full h-11 rounded-xl bg-white/[0.02] border border-border px-3.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-white/30 focus:shadow-[0_0_0_3px_rgba(253,218,36,0.12)] transition-all";

export function PartnerResetPassword() {
	const router = useRouter();
	const params = useSearchParams();
	const token = params.get("token") ?? "";
	// mode=signin: the magic-link flow — same mechanics (Payload has no
	// passwordless login op; setting a password IS the sign-in), softer copy.
	const signin = params.get("mode") === "signin";
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [done, setDone] = useState(false);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		if (password.length < 8) {
			setError("Password needs at least 8 characters.");
			return;
		}
		if (password !== confirm) {
			setError("Passwords don't match.");
			return;
		}
		setSubmitting(true);
		try {
			const res = await fetch("/api/partner-accounts/reset-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include", // Payload sets the auth cookie on success
				body: JSON.stringify({ token, password }),
			});
			if (!res.ok) {
				setError(
					"This link is invalid or has expired. Request a new one from the sign-in page.",
				);
				return;
			}
			setDone(true);
			setTimeout(() => router.push("/partners/dashboard"), 1200);
		} catch {
			setError("Something went wrong. Try again.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<main className="max-w-3xl mx-auto px-4 sm:px-6 py-16 pt-28">
			<Link
				href="/partners/dashboard"
				className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-6 group"
			>
				<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
				<span className="text-sm font-medium">Partner portal</span>
			</Link>

			<div className="mb-8">
				<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
					{signin ? "Sign in to your dashboard" : "Set your password"}
				</h1>
				<p className="text-sm text-muted-foreground mt-2 max-w-xl">
					{signin
						? "Choose a password to finish signing in — next time you can use either it or an emailed link."
						: "Choose a password for your Stellar Light partner account."}
				</p>
			</div>

			<div className="max-w-md">
				{!token ? (
					<div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
						This page needs the link from your email. If yours expired, use
						“Forgot password?” on the{" "}
						<Link
							href="/partners/dashboard"
							className="text-foreground underline underline-offset-2 hover:no-underline"
						>
							sign-in page
						</Link>{" "}
						to get a fresh one.
					</div>
				) : done ? (
					<div className="rounded-2xl border border-border bg-card p-8 text-center">
						<CheckCircle2 className="w-10 h-10 text-emerald-400/90 mx-auto mb-3" />
						<p className="text-sm text-foreground">
							{signin
								? "Signed in — taking you to your dashboard…"
								: "Password set — taking you to your dashboard…"}
						</p>
					</div>
				) : (
					<form
						onSubmit={submit}
						className="rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-5"
					>
						<label className="block">
							<span className="block text-xs font-medium text-foreground mb-1.5">
								New password
							</span>
							<input
								type="password"
								value={password}
								required
								minLength={8}
								onChange={(e) => setPassword(e.target.value)}
								className={INPUT_CLS}
								placeholder="at least 8 characters"
							/>
						</label>
						<label className="block">
							<span className="block text-xs font-medium text-foreground mb-1.5">
								Confirm password
							</span>
							<input
								type="password"
								value={confirm}
								required
								onChange={(e) => setConfirm(e.target.value)}
								className={INPUT_CLS}
								placeholder="same again"
							/>
						</label>
						{error && <div className="text-xs text-red-400">{error}</div>}
						<button
							type="submit"
							disabled={submitting}
							className="w-full h-11 rounded-xl bg-foreground text-background font-medium text-sm disabled:opacity-50 transition-opacity inline-flex items-center justify-center gap-2"
						>
							{submitting && <Loader2 className="w-4 h-4 animate-spin" />}
							{submitting ? "Signing in…" : signin ? "Sign in" : "Set password"}
						</button>
					</form>
				)}
			</div>
		</main>
	);
}
