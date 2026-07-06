/**
 * Shared partner invite / sign-in-link plumbing.
 *
 * One token mechanism, two front doors:
 *   - the Partners.ts afterChange INVITE hook (draft→published, claim approval)
 *   - the /api/partners/magic-link sign-in route (LoginCard's primary path)
 *
 * Both mint a long-lived Payload password-reset token and email a link to the
 * partner-facing /partners/reset-password page (partners are blocked from
 * /admin, so Payload's default reset email would strand them). Payload has no
 * passwordless-login operation, so the "sign-in link" lands on set-password —
 * the user confirms a password once and Payload sets the auth cookie.
 */

import type { Payload, PayloadRequest } from "payload";
import { getAppUrl } from "@/lib/utils/app-url";

/**
 * Seeded/curated partners carry a `curated+<slug>@stellarlight.xyz` placeholder
 * login (see scripts/enrich-partners-toml.ts). It's not a real inbox, so invite
 * and sign-in mail must never target it — and swapping it for a real address is
 * how an admin approves a claim.
 */
export const isPlaceholderEmail = (email: string | null | undefined): boolean =>
	!email ||
	(email.startsWith("curated+") && email.endsWith("@stellarlight.xyz"));

/**
 * Mint a 7-day password-reset token for a partner account WITHOUT sending
 * Payload's default email (we compose our own copy).
 *
 * Returns null when no account matches the email — Payload's forgotPassword
 * deliberately fails silently ("we prefer to fail silently"), which is exactly
 * the constant-response behavior the magic-link route needs. Callers MUST
 * branch on null and never interpolate it into a URL.
 *
 * NOTE: if a collection-level `auth.forgotPassword.expiration` is ever added to
 * Partners.ts it silently overrides the expiration passed here (collection
 * config wins in Payload) — keep the 7d in one place or update both.
 */
export async function mintPartnerLoginToken(
	payload: Payload,
	email: string,
	req?: PayloadRequest,
): Promise<string | null> {
	const token = await payload.forgotPassword({
		collection: "partner-accounts",
		data: { email },
		disableEmail: true,
		expiration: 7 * 24 * 60 * 60 * 1000, // 7d — default 1h is too short for an invite
		req,
	});
	return token ?? null;
}

/** The publish/claim invite: "you're live — set your password". */
export async function sendPartnerInviteEmail(
	payload: Payload,
	doc: { email: string; name: string; slug: string },
	token: string,
): Promise<void> {
	const base = getAppUrl();
	const url = `${base}/partners/reset-password?token=${token}`;
	await payload.sendEmail({
		to: doc.email,
		subject: "You're live on Stellar Light — set your password",
		text: [
			`${doc.name} is now yours to manage in the Stellar Light partner directory.`,
			"",
			`Set your password to edit your profile: ${url}`,
			"",
			`Your profile: ${base}/partners/${doc.slug}`,
			`Your dashboard: ${base}/partners/dashboard`,
			"",
			"This link expires in 7 days.",
		].join("\n"),
	});
}

/** The magic-link sign-in: same token, sign-in framing (mode=signin only changes page copy). */
export async function sendPartnerSignInEmail(
	payload: Payload,
	doc: { email: string; name: string; slug: string },
	token: string,
): Promise<void> {
	const base = getAppUrl();
	const url = `${base}/partners/reset-password?token=${token}&mode=signin`;
	await payload.sendEmail({
		to: doc.email,
		subject: "Sign in to your Stellar Light partner dashboard",
		text: [
			`Here's your sign-in link for ${doc.name} on Stellar Light:`,
			"",
			url,
			"",
			`Your profile: ${base}/partners/${doc.slug}`,
			`Your dashboard: ${base}/partners/dashboard`,
			"",
			"This link expires in 7 days. If you didn't request it, you can ignore this email.",
		].join("\n"),
	});
}
