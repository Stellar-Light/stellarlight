/**
 * Public listing submissions — the real pipeline behind the concierge's
 * "Submit for listing".
 *
 *   POST /api/partners/submit-listing
 *   { orgName: string, contactEmail: string, fields?: {...extract output} }
 *
 * Replaces the old hack of dumping a JSON blob into /api/feedback. Instead:
 *
 *   - NEW company  → creates a real partner-accounts DRAFT (random throwaway
 *     password; the account invite is minted later, when an admin publishes —
 *     see the Partners afterChange hook) and emails the admin a review link.
 *   - EXISTING company (slug/name/email already listed — e.g. one of the
 *     pre-seeded anchors) → no duplicate: stamps claimRequestedBy/At on the
 *     existing doc and emails the admin a claim-verification request.
 *
 * Response: { ok: true, mode: "draft" | "claim" } — the chat shows different
 * done-copy per mode. Admin review stays the only gate to publication, so a
 * spam submission can never surface publicly.
 */

import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getPayloadSafe } from "@/lib/payload-client";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { generateSlug } from "@/lib/utils/normalize";

export const dynamic = "force-dynamic";

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const PARTNER_TYPES = [
	"anchor",
	"on-off-ramp",
	"infrastructure",
	"tooling",
	"protocol",
	"wallet",
	"audit-firm",
	"legal",
	"agency",
	"other",
] as const;
type PartnerType = (typeof PARTNER_TYPES)[number];
const isPartnerType = (v: unknown): v is PartnerType =>
	typeof v === "string" && (PARTNER_TYPES as readonly string[]).includes(v);
const SECTORS = [
	"defi", "payments", "rwa", "stablecoins", "identity", "data", "ai", "gaming", "other",
] as const;
const REGIONS = [
	"global", "north-america", "latam", "europe", "africa", "mena", "asia", "oceania",
] as const;

/** Filter unknown input down to members of a const-tuple enum, typed. */
function enumArray<T extends string>(
	v: unknown,
	allowed: readonly T[],
	max = 20,
): T[] {
	if (!Array.isArray(v)) return [];
	return v
		.filter((x): x is string => typeof x === "string")
		.map((x) => x.trim().toLowerCase())
		.filter((x): x is T => (allowed as readonly string[]).includes(x))
		.slice(0, max);
}
const PRICING = [
	"free", "freemium", "subscription", "usage-based", "fixed", "hourly", "rev-share", "custom",
] as const;
type PricingModel = (typeof PRICING)[number];
const isPricing = (v: unknown): v is PricingModel =>
	typeof v === "string" && (PRICING as readonly string[]).includes(v);

/** Trim + cap a string field, or undefined if absent/not a string. */
function str(v: unknown, max = 2000): string | undefined {
	if (typeof v !== "string") return undefined;
	const t = v.trim().slice(0, max);
	return t || undefined;
}

function strArray(v: unknown, max = 20): string[] {
	if (!Array.isArray(v)) return [];
	return v
		.filter((x): x is string => typeof x === "string")
		.map((x) => x.trim().toLowerCase())
		.filter((x) => x.length > 0 && x.length <= 80)
		.slice(0, max);
}

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
		// Console adapter in dev / transient failure — never block the submission.
	}
}

export async function OPTIONS() {
	return new NextResponse(null, { status: 204 });
}

export async function POST(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/partners/submit-listing",
		limit: RATE_LIMIT_MAX,
		windowMs: RATE_LIMIT_WINDOW_MS,
	});
	if (!limit.allowed) {
		const retry = Math.ceil((limit.resetAt - Date.now()) / 1000);
		return NextResponse.json(
			{ error: "Too many submissions — give it a moment.", retryAfterSeconds: retry },
			{ status: 429, headers: { ...rateLimitHeaders(limit), "Retry-After": String(retry) } },
		);
	}

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json(
			{ error: "Invalid JSON" },
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	const b = body as { orgName?: unknown; contactEmail?: unknown; fields?: unknown };
	const orgName = str(b.orgName, 120);
	const contactEmail = str(b.contactEmail, 200)?.toLowerCase();
	if (!orgName || orgName.length < 2) {
		return NextResponse.json(
			{ error: "orgName is required (2-120 chars)." },
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}
	if (!contactEmail || !EMAIL_RE.test(contactEmail)) {
		return NextResponse.json(
			{ error: "A valid contactEmail is required — it becomes your account login." },
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	const payload = await getPayloadSafe();
	if (!payload) {
		return NextResponse.json(
			{ error: "Service unavailable — try again shortly.", unavailable: true },
			{ status: 503, headers: rateLimitHeaders(limit) },
		);
	}

	const base = process.env.NEXT_PUBLIC_APP_URL || "https://stellarlight.xyz";
	const slug = generateSlug(orgName); // same fn as the collection's slug hook

	try {
		// ── Dedupe: existing listing → claim request, never a duplicate ─────
		const existing = await payload.find({
			collection: "partner-accounts",
			where: {
				or: [
					{ slug: { equals: slug } },
					{ name: { equals: orgName } },
					{ email: { equals: contactEmail } },
				],
			},
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		if (existing.docs.length > 0) {
			// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
			const doc = existing.docs[0] as any;
			await payload.update({
				collection: "partner-accounts",
				id: doc.id,
				data: {
					claimRequestedBy: contactEmail,
					claimRequestedAt: new Date().toISOString(),
				},
				overrideAccess: true,
			});
			await notifyAdmin(
				payload,
				`Claim request: ${doc.name}`,
				[
					`${contactEmail} asked to claim the "${doc.name}" partner profile (${doc.status}).`,
					"",
					`Verify the email's domain against ${doc.websiteUrl ?? "their website"} before inviting.`,
					`Review: ${base}/admin/collections/partner-accounts/${doc.id}`,
				].join("\n"),
			);
			return NextResponse.json(
				{ ok: true, mode: "claim" },
				{ headers: rateLimitHeaders(limit) },
			);
		}

		// ── New draft ────────────────────────────────────────────────────────
		const f = (b.fields ?? {}) as Record<string, unknown>;
		const partnerType: PartnerType = isPartnerType(f.partnerType)
			? f.partnerType
			: "other";
		const created = await payload.create({
			collection: "partner-accounts",
			data: {
				name: orgName,
				email: contactEmail,
				// Throwaway — never stored in plaintext or communicated. The real
				// credential is the publish-invite reset link (afterChange hook).
				password: randomBytes(32).toString("hex"),
				partnerType,
				status: "draft",
				tagline: str(f.tagline, 140),
				description: str(f.description, 4000),
				services: strArray(f.services).map((tag) => ({ tag })),
				sectors: enumArray(f.sectors, SECTORS),
				regions: enumArray(f.regions, REGIONS),
				acceptingClients:
					typeof f.acceptingClients === "boolean" ? f.acceptingClients : undefined,
				typicalEngagement: str(f.typicalEngagement, 300),
				leadTime: str(f.leadTime, 300),
				pricingModel: isPricing(f.pricingModel) ? f.pricingModel : undefined,
				pricingNotes: str(f.pricingNotes, 1000),
				websiteUrl: str(f.websiteUrl, 300),
				docsUrl: str(f.docsUrl, 300),
				githubOrg: str(f.githubOrg, 100),
				contactEmail,
				contactChannel: str(f.contactChannel, 200),
				responseSla: str(f.responseSla, 200),
				// A brand-new draft is by definition maintained right now.
				lastPartnerUpdateAt: new Date().toISOString(),
			},
			overrideAccess: true,
			disableVerificationEmail: true,
		});
		await notifyAdmin(
			payload,
			`New partner draft: ${orgName}`,
			[
				`"${orgName}" (${partnerType}) submitted a listing via the concierge.`,
				`Contact: ${contactEmail}`,
				"",
				"Publishing it will automatically email them an account invite.",
				`Review: ${base}/admin/collections/partner-accounts/${created.id}`,
			].join("\n"),
		);
		return NextResponse.json(
			{ ok: true, mode: "draft" },
			{ headers: rateLimitHeaders(limit) },
		);
	} catch (err) {
		// Duplicate account email can race past the find() above — Payload
		// throws a ValidationError on the unique email; fold it into the claim path.
		const msg = err instanceof Error ? err.message : "";
		if (/email/i.test(msg) && /registered|unique|duplicate/i.test(msg)) {
			return NextResponse.json(
				{ ok: true, mode: "claim" },
				{ headers: rateLimitHeaders(limit) },
			);
		}
		return NextResponse.json(
			{ error: "Couldn't submit the listing — try again shortly." },
			{ status: 500, headers: rateLimitHeaders(limit) },
		);
	}
}
