/**
 * Partner sign-in link (the LoginCard's primary path).
 *
 *   POST /api/partners/magic-link   { email }
 *
 * Browser-only plumbing for the /partners portal — deliberately NOT in
 * /api/openapi.json, /api/status endpoints[], or next.config.mjs publicApi[]
 * (same policy as the Payload auth routes at /api/partner-accounts/*). Adding
 * it to the spec would create a new agent-facing operation and force a policy
 * decision in downstream routing catalogs.
 *
 * Constant-response by design: every outcome past input validation returns the
 * SAME neutral 200 so the endpoint never reveals whether an email has an
 * account. (Timing varies with the email send — the same side-channel profile
 * as Payload's own forgot-password operation; accepted.)
 *
 * Branches, all server-side:
 *   1. exact published, non-placeholder account email → mint 7d token + send
 *      the sign-in email (lands on /partners/reset-password?mode=signin).
 *   2. email DOMAIN matches a published partner whose account still has the
 *      curated+ placeholder → record a claim request + notify admin (approval
 *      = admin sets the real email, which fires the invite hook).
 *   3. anything else → nothing.
 */

import { type NextRequest, NextResponse } from "next/server";
import {
	isPlaceholderEmail,
	mintPartnerLoginToken,
	sendPartnerSignInEmail,
} from "@/lib/partner-invite";
import { getPayloadSafe } from "@/lib/payload-client";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { normalizeUrl } from "@/lib/utils/normalize";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const NEUTRAL = {
	ok: true,
	message:
		"If that email matches a partner account, a sign-in link is on its way — check your inbox.",
};

async function notifyAdmin(
	// biome-ignore lint/suspicious/noExplicitAny: Payload instance
	payload: any,
	subject: string,
	text: string,
): Promise<void> {
	try {
		await payload.sendEmail({
			to: process.env.ADMIN_NOTIFY_EMAIL || "hello@stellarlight.xyz",
			subject,
			text,
		});
	} catch {
		// Console adapter in dev / transient failure — never block the flow.
	}
}

export async function POST(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/partners/magic-link",
		limit: 5,
		windowMs: 10 * 60_000,
	});
	if (!limit.allowed) {
		const retry = Math.ceil((limit.resetAt - Date.now()) / 1000);
		return NextResponse.json(
			{ error: "Too many requests — try again shortly." },
			{
				status: 429,
				headers: { ...rateLimitHeaders(limit), "Retry-After": String(retry) },
			},
		);
	}

	let email = "";
	try {
		const body = await req.json();
		email = String(body?.email ?? "")
			.trim()
			.toLowerCase();
	} catch {
		// fall through to validation
	}
	if (!email || !EMAIL_RE.test(email)) {
		return NextResponse.json(
			{ error: "Enter a valid email address." },
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	// Everything past this point returns the SAME neutral body.
	try {
		const payload = await getPayloadSafe();
		if (!payload) return NextResponse.json(NEUTRAL, { headers: rateLimitHeaders(limit) });

		// 1. Exact account match → sign-in link.
		const exact = await payload.find({
			collection: "partner-accounts",
			where: { email: { equals: email } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const account = exact.docs[0] as any;
		if (
			account &&
			account.status === "published" &&
			!isPlaceholderEmail(account.email)
		) {
			const token = await mintPartnerLoginToken(payload, email);
			if (token) {
				await sendPartnerSignInEmail(
					payload,
					{ email, name: account.name, slug: account.slug },
					token,
				);
			}
			return NextResponse.json(NEUTRAL, { headers: rateLimitHeaders(limit) });
		}

		// 2. Domain matches an unclaimed (placeholder) partner → claim request.
		//    Never auto-approves: the admin setting the real email IS the approval.
		const domain = email.split("@")[1];
		if (domain) {
			const published = await payload.find({
				collection: "partner-accounts",
				where: { status: { equals: "published" } },
				limit: 200,
				depth: 0,
				overrideAccess: true,
			});
			// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
			const target = (published.docs as any[]).find((p) => {
				if (!isPlaceholderEmail(p.email)) return false;
				const host = normalizeUrl(p.websiteUrl);
				return host === domain || domain.endsWith(`.${host}`);
			});
			if (target) {
				await payload.update({
					collection: "partner-accounts",
					id: target.id,
					data: {
						claimRequestedBy: email,
						claimRequestedAt: new Date().toISOString(),
					},
					overrideAccess: true,
				});
				await notifyAdmin(
					payload,
					`Partner claim via sign-in: ${target.name}`,
					[
						`${email} tried to sign in and their domain matches ${target.name} (${target.websiteUrl}).`,
						"",
						"To approve: verify the domain, then set the account Email in the Payload sidebar to this address and Save — that sends them a set-your-password invite.",
					].join("\n"),
				);
			}
		}
	} catch {
		// Constant response even on failure — never leak branch info.
	}
	return NextResponse.json(NEUTRAL, { headers: rateLimitHeaders(limit) });
}

export async function OPTIONS() {
	return new NextResponse(null, { status: 204 });
}
export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
