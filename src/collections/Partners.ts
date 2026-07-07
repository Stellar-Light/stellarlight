import type { CollectionConfig, Field, Where } from "payload";
import {
	isPlaceholderEmail,
	mintPartnerLoginToken,
	sendPartnerInviteEmail,
} from "../lib/partner-invite";
import { getAppUrl } from "../lib/utils/app-url";
import { generateSlug } from "../lib/utils/normalize";

/**
 * Partner Connector — ecosystem partner profiles with login.
 *
 * Anything a builder can integrate with: anchors, on/off ramps,
 * infrastructure providers, tooling, protocols, wallets, audit firms.
 * Partners log in (this is an auth-enabled collection) and maintain their
 * own profile; the system keeps them honest.
 *
 * The core design is the MANUAL / AUTO field split:
 *
 *   manual — partner-owned facts the system can't know (services offered,
 *            pricing model, capacity, contact). Sticky: nothing overwrites
 *            them except the partner (or an admin).
 *   auto   — system-owned signals refreshed by cron (GitHub activity,
 *            on-chain footprint, SCF involvement). Partners can see them
 *            but never edit them — that's what makes profiles trustworthy
 *            to the AI matchmaker and to Tyler-style agents. Buyers see
 *            partner-claimed AND verified-reality side by side.
 *
 * Freshness loop (Anke's quarterly-update requirement):
 *   - any partner-initiated save stamps lastPartnerUpdateAt and resets
 *     freshnessStatus to "fresh"
 *   - a cron walks profiles: >90d → "aging" (reminder email), >180d →
 *     "stale" (public badge), >365d → "archived" (hidden from AI matches,
 *     still publicly listed). Being visibly stale next to competitors is
 *     the long-term incentive to keep profiles current.
 *
 * Pilot cohort: DeFindex (Palta Labs), Etherfuse, Trustless Work.
 *
 * Publishing: partners edit drafts freely; only admins flip status to
 * "published" (after the partner confirms their profile) so wrong info
 * never goes live unreviewed.
 */

/** Admins live in the `users` collection; partners auth against this one. */
const isAdmin = (user: { collection?: string } | null | undefined) =>
	user?.collection === "users";

// Placeholder-email + token/email plumbing lives in src/lib/partner-invite.ts,
// shared with the /api/partners/magic-link sign-in route.

/**
 * Partner-editable field. We mark the system-owned ones explicitly instead
 * (see autoField) so a forgotten access block fails safe: default = editable
 * by the profile owner, which is the common case.
 */
const PARTNER_TYPES = [
	{ label: "Anchor", value: "anchor" },
	{ label: "On/Off Ramp", value: "on-off-ramp" },
	{ label: "Infrastructure", value: "infrastructure" },
	{ label: "Tooling", value: "tooling" },
	{ label: "Protocol", value: "protocol" },
	{ label: "Wallet", value: "wallet" },
	{ label: "Audit firm", value: "audit-firm" },
	{ label: "Legal / Compliance", value: "legal" },
	{ label: "Agency / Dev shop", value: "agency" },
	{ label: "Other", value: "other" },
] as const;

const SECTORS = [
	{ label: "DeFi", value: "defi" },
	{ label: "Payments", value: "payments" },
	{ label: "RWA / Tokenization", value: "rwa" },
	{ label: "Stablecoins", value: "stablecoins" },
	{ label: "Identity", value: "identity" },
	{ label: "Data / Indexing", value: "data" },
	{ label: "AI / Agents", value: "ai" },
	{ label: "Gaming", value: "gaming" },
	{ label: "Other", value: "other" },
] as const;

const REGIONS = [
	{ label: "Global", value: "global" },
	{ label: "North America", value: "north-america" },
	{ label: "Latin America", value: "latam" },
	{ label: "Europe", value: "europe" },
	{ label: "Africa", value: "africa" },
	{ label: "MENA", value: "mena" },
	{ label: "Asia", value: "asia" },
	{ label: "Oceania", value: "oceania" },
] as const;

/** System-owned field: visible to the partner, writable only by admins/cron. */
const autoField = (field: Field): Field =>
	({
		...field,
		access: {
			update: ({ req }) => isAdmin(req.user),
		},
	}) as Field;

export const Partners: CollectionConfig = {
	// Slug is "partner-accounts", NOT "partners", on purpose: Payload
	// auto-mounts auth + CRUD REST under /api/{slug}/* (login, me, logout,
	// :id). If the slug were "partners" those would collide with — and be
	// shadowed by — our public read routes at /api/partners and
	// /api/partners/[slug]. Keeping the slug distinct frees the clean
	// public namespace for agents while auth lives at /api/partner-accounts/*.
	slug: "partner-accounts",
	labels: { singular: "Partner", plural: "Partners" },
	// Email + password login. Accounts are created by admins (pilot) or as
	// drafts by the public listing pipeline (/api/partners/submit-listing).
	// The default forgot-password email links to /admin/reset/:token — a page
	// partners can't use (they're blocked from the admin panel above), so we
	// send our own link to the partner-facing reset page instead. The same
	// reset-token mechanism doubles as the account invite on publish (see
	// afterChange hook).
	auth: {
		forgotPassword: {
			generateEmailHTML: (args) => {
				const token = args?.token ?? "";
				// getAppUrl, not NEXT_PUBLIC_APP_URL — the Vercel env carries a
				// localhost value for that var (2026-07-02 media-URL incident).
				const base = getAppUrl();
				const url = `${base}/partners/reset-password?token=${token}`;
				return `<p>Reset your Stellar Light partner password:</p><p><a href="${url}">${url}</a></p><p>This link expires soon. If you didn't request this, you can ignore it.</p>`;
			},
			generateEmailSubject: () => "Reset your Stellar Light partner password",
		},
	},
	admin: {
		useAsTitle: "name",
		defaultColumns: [
			"name",
			"partnerType",
			"status",
			"pilot",
			"freshnessStatus",
			"lastPartnerUpdateAt",
		],
		group: "Partner Connector",
		description:
			"Ecosystem partners with self-service profiles. Manual fields are partner-owned; the 'Verified signals' group is system-owned and overwrites on cron.",
	},
	access: {
		// Public sees published profiles; a partner additionally sees their
		// own (any status); admins see everything.
		read: ({ req }) => {
			if (isAdmin(req.user)) return true;
			if (req.user?.collection === "partner-accounts") {
				const ownOrPublished: Where = {
					or: [
						{ id: { equals: req.user.id } },
						{ status: { equals: "published" } },
					],
				};
				return ownOrPublished;
			}
			const publishedOnly: Where = { status: { equals: "published" } };
			return publishedOnly;
		},
		// Pilot is invite-only: admins create the account, partner fills it in.
		create: ({ req }) => isAdmin(req.user),
		update: ({ req, id }) => {
			if (isAdmin(req.user)) return true;
			return req.user?.collection === "partner-accounts" && req.user.id === id;
		},
		delete: ({ req }) => isAdmin(req.user),
		// Partners must not see each other in the admin list UI.
		admin: ({ req }) => isAdmin(req.user),
	},
	hooks: {
		beforeValidate: [
			({ data }) => {
				if (data && !data.slug && data.name) {
					data.slug = generateSlug(data.name);
				}
				return data;
			},
		],
		beforeChange: [
			({ data, req, operation }) => {
				// Any partner-initiated save proves the profile is maintained:
				// stamp it and reset the freshness clock. Admin/cron writes
				// (signal refreshes, status flips) must NOT reset the clock —
				// only the partner's own attention counts as freshness.
				if (
					operation === "update" &&
					req.user?.collection === "partner-accounts"
				) {
					data.lastPartnerUpdateAt = new Date().toISOString();
					data.freshnessStatus = "fresh";
				}
				return data;
			},
		],
		afterChange: [
			// Account invite. Two triggers, one action — mint a long-lived
			// password-reset token and email it as "set your password":
			//
			//   1. NEW LISTING: a draft flips to published (submit-listing flow).
			//      The account email is the company's real submitted address.
			//   2. CLAIM APPROVAL: an admin verifies a claim on an ALREADY-published
			//      partner (all 47 seeds are published) and sets the account `email`
			//      from its `curated+slug@stellarlight.xyz` placeholder to the
			//      claimer's real address. Without this, the claim button led
			//      nowhere for every existing partner. Setting a real login email
			//      IS the approval action.
			//
			// A failed email never blocks the save; the nested bookkeeping update
			// changes neither status nor email, so it can't re-trigger (no recursion).
			async ({ doc, previousDoc, operation, req }) => {
				try {
					if (operation !== "update" || !doc.email) return;
					if (isPlaceholderEmail(doc.email)) return; // never invite the curated+ placeholder

					const justPublished =
						doc.status === "published" && previousDoc?.status !== "published";
					// Admin set a real login email on a published partner (claim
					// approval / reassignment). Firing on any real-email change also
					// covers a corrected address — the intended recipient still gets it.
					const emailBecameReal =
						doc.status === "published" &&
						doc.email !== previousDoc?.email &&
						isPlaceholderEmail(previousDoc?.email);

					if (!justPublished && !emailBecameReal) return;
					// Already invited on this exact email and nothing changed → skip.
					if (
						justPublished &&
						doc.invitedAt &&
						doc.email === previousDoc?.email
					)
						return;

					const token = await mintPartnerLoginToken(
						req.payload,
						doc.email,
						req,
					);
					if (!token) {
						// forgotPassword fails silently when no account matches — a
						// race here would otherwise mail a link with a null token.
						req.payload.logger.warn(
							{ partner: doc?.slug },
							"partner invite: no token minted (account not found?)",
						);
						return;
					}
					await sendPartnerInviteEmail(req.payload, doc, token);
					// Stamp invitedAt + clear the (now-actioned) claim request.
					await req.payload.update({
						collection: "partner-accounts",
						id: doc.id,
						data: {
							invitedAt: new Date().toISOString(),
							...(doc.claimRequestedBy
								? { claimRequestedBy: null, claimRequestedAt: null }
								: {}),
						},
						overrideAccess: true,
						req,
					});
				} catch (err) {
					req.payload.logger.error(
						{ err, partner: doc?.slug },
						"partner invite email failed (save not blocked)",
					);
				}
			},
		],
	},
	fields: [
		// ── Identity (partner-owned) ──────────────────────────────────────
		{ name: "name", type: "text", required: true },
		{
			name: "slug",
			type: "text",
			unique: true,
			index: true,
			admin: {
				position: "sidebar",
				description: "Auto-generated from name if left empty.",
			},
		},
		{
			name: "partnerType",
			type: "select",
			required: true,
			options: [...PARTNER_TYPES],
			index: true,
		},
		{
			name: "tagline",
			type: "text",
			maxLength: 140,
			admin: { description: "One line a builder sees first (≤140 chars)." },
		},
		{ name: "description", type: "textarea" },
		{
			name: "logoUrl",
			type: "text",
			admin: {
				description:
					"Hosted logo URL. (Kept as a URL so partners don't need media-upload permissions.)",
			},
		},
		{ name: "websiteUrl", type: "text" },
		{ name: "foundedYear", type: "number", min: 2000, max: 2100 },

		// ── Services & coverage (partner-owned) ───────────────────────────
		{
			name: "services",
			type: "array",
			labels: { singular: "Service", plural: "Services" },
			admin: {
				description:
					"Granular, searchable service tags — e.g. 'sep-24-ngn', 'soroban-audit-rust', 'usdc-off-ramp-mexico'. The AI matchmaker matches on these.",
			},
			fields: [{ name: "tag", type: "text", required: true }],
		},
		{
			name: "sectors",
			type: "select",
			hasMany: true,
			options: [...SECTORS],
		},
		{
			name: "regions",
			type: "select",
			hasMany: true,
			options: [...REGIONS],
		},

		// ── Anchor capabilities (SYSTEM-ENRICHED from stellar.toml, admin-editable) ──
		// Parsed from each anchor's /.well-known/stellar.toml (SEP-1) — the same
		// source anchors.stellar.org uses. CURRENCIES → assets; TRANSFER_SERVER →
		// SEP-6; TRANSFER_SERVER_SEP0024 → SEP-24; DIRECT_PAYMENT_SERVER → SEP-31.
		// The matcher scores on these ("USDC off-ramp in Mexico" hits asset+country
		// instead of description luck). autoField: partners don't hand-edit them —
		// the enrichment run owns them.
		autoField({
			name: "assets",
			type: "array",
			labels: { singular: "Asset", plural: "Assets" },
			admin: {
				description:
					"Assets this anchor issues/supports, from stellar.toml CURRENCIES (e.g. USDC, EURC, NGNT).",
			},
			fields: [{ name: "code", type: "text", required: true }],
		}),
		autoField({
			name: "seps",
			type: "select",
			hasMany: true,
			admin: {
				description: "SEP standards implemented, from stellar.toml keys.",
			},
			options: [
				{ label: "SEP-6 (programmatic deposit/withdraw)", value: "sep-6" },
				{ label: "SEP-24 (interactive deposit/withdraw)", value: "sep-24" },
				{ label: "SEP-31 (cross-border payments)", value: "sep-31" },
			],
		}),
		autoField({
			name: "rampTypes",
			type: "select",
			hasMany: true,
			admin: { description: "Fiat ramps offered." },
			options: [
				{ label: "On-ramp (fiat → Stellar)", value: "on-ramp" },
				{ label: "Off-ramp (Stellar → fiat)", value: "off-ramp" },
			],
		}),
		autoField({
			name: "country",
			type: "text",
			admin: {
				description:
					"Primary jurisdiction/market, from stellar.toml DOCUMENTATION.ORG_* (e.g. 'Mexico', 'Nigeria', 'Global').",
			},
		}),

		// ── Compliance & corridors (curator-maintained; VERIFIED facts only) ──
		// The decision-critical facts for evaluating an anchor/ramp — regulatory
		// standing + corridors — for closed-source partners where GitHub says
		// nothing. NEVER holds a claim that isn't stated on the partner's own site
		// or an official regulator registry (see scripts/data/curate-partners.ts).
		{
			name: "compliance",
			type: "group",
			admin: {
				description:
					"VERIFIED regulatory + corridor facts. Populated by the curator from the partner's own site / a regulator registry — never inferred.",
			},
			fields: [
				{
					name: "licenses",
					type: "array",
					labels: { singular: "License", plural: "Licenses" },
					admin: {
						description:
							"Regulatory licenses/registrations — cite the authority + jurisdiction.",
					},
					fields: [
						{ name: "authority", type: "text", required: true },
						{ name: "jurisdiction", type: "text" },
						{ name: "type", type: "text" },
					],
				},
				{
					name: "kycRequired",
					type: "checkbox",
					admin: { description: "Performs KYC (stated on their own site)." },
				},
				{
					name: "travelRule",
					type: "checkbox",
					admin: {
						description: "Travel Rule / FATF compliant (explicitly stated).",
					},
				},
				{
					name: "currencies",
					type: "text",
					admin: {
						description:
							"Fiat currencies supported, comma-separated (e.g. 'MXN, USD').",
					},
				},
				{
					name: "settlementTime",
					type: "text",
					admin: { description: "e.g. 'instant', '<1hr', 'T+1'." },
				},
				{
					name: "notableCustomers",
					type: "text",
					admin: {
						description: "Publicly-named customers/partners, comma-separated.",
					},
				},
			],
		},

		// ── Capacity & pricing (partner-owned) ────────────────────────────
		{
			name: "acceptingClients",
			type: "checkbox",
			defaultValue: true,
			admin: { description: "Currently taking new integrations/clients?" },
		},
		{
			name: "typicalEngagement",
			type: "text",
			admin: {
				description:
					"e.g. '2-6 week integration', 'self-serve API', 'retainer'",
			},
		},
		{
			name: "leadTime",
			type: "text",
			admin: {
				description:
					"How fast can a new team start? e.g. 'same week', '2-4 weeks'",
			},
		},
		{
			name: "pricingModel",
			type: "select",
			options: [
				{ label: "Free", value: "free" },
				{ label: "Freemium", value: "freemium" },
				{ label: "Subscription", value: "subscription" },
				{ label: "Usage-based", value: "usage-based" },
				{ label: "Fixed-fee", value: "fixed" },
				{ label: "Hourly", value: "hourly" },
				{ label: "Revenue share", value: "rev-share" },
				{ label: "Custom / contact", value: "custom" },
			],
		},
		{ name: "pricingNotes", type: "textarea" },

		// ── Integration & contact (partner-owned) ─────────────────────────
		{ name: "docsUrl", type: "text" },
		{
			name: "githubOrg",
			type: "text",
			admin: {
				description:
					"GitHub org/user (e.g. 'paltalabs'). Drives the verified GitHub signals below.",
			},
		},
		{ name: "contactEmail", type: "text" },
		{
			name: "contactChannel",
			type: "text",
			admin: {
				description:
					"Preferred channel — Discord handle, Telegram, lead form URL…",
			},
		},
		{
			name: "responseSla",
			type: "text",
			admin: { description: "e.g. 'within 24h on weekdays'" },
		},
		{
			name: "caseStudies",
			type: "array",
			fields: [
				{ name: "title", type: "text", required: true },
				{ name: "url", type: "text" },
				{
					name: "projectSlug",
					type: "text",
					admin: {
						description:
							"Slug in the stellarlight projects directory, if listed.",
					},
				},
			],
		},

		// ── Verified signals (SYSTEM-OWNED — cron overwrites, partner read-only) ──
		{
			name: "verified",
			type: "group",
			admin: {
				description:
					"Auto-computed from GitHub / on-chain / SCF data. Partners can see but not edit — this is what makes profiles trustworthy to agents and the matchmaker.",
			},
			fields: [
				autoField({ name: "githubLastCommitAt", type: "date" }),
				autoField({ name: "githubCommits90d", type: "number" }),
				autoField({
					name: "onchainActive",
					type: "checkbox",
					admin: {
						description:
							"Mainnet activity detected for their contracts/accounts.",
					},
				}),
				autoField({ name: "onchainNote", type: "text" }),
				autoField({
					name: "scfInvolvement",
					type: "text",
					admin: {
						description:
							"e.g. 'SCF #38 awardee ($148k)' — read from our SCF data.",
					},
				}),
				autoField({ name: "lastAutoVerifyAt", type: "date" }),
			],
		},

		// ── Freshness (SYSTEM-OWNED) ───────────────────────────────────────
		autoField({
			name: "freshnessStatus",
			type: "select",
			defaultValue: "fresh",
			index: true,
			options: [
				{ label: "Fresh (updated <90d)", value: "fresh" },
				{ label: "Aging (90–180d, reminder sent)", value: "aging" },
				{ label: "Stale (180–365d, public badge)", value: "stale" },
				{
					label: "Archived (>365d, hidden from AI matches)",
					value: "archived",
				},
			],
		}),
		{
			// Stamped by the beforeChange hook on partner saves; admins can
			// correct it manually if needed.
			name: "lastPartnerUpdateAt",
			type: "date",
			admin: {
				description:
					"Last time the PARTNER touched their profile. Drives the freshness loop.",
			},
		},
		autoField({ name: "nextReminderAt", type: "date" }),

		// ── Listing pipeline (system-owned) ────────────────────────────────
		autoField({
			name: "pilot",
			type: "checkbox",
			defaultValue: false,
			index: true,
			admin: {
				position: "sidebar",
				description:
					"Pilot cohort — the select partners Anke tests with. Featured first in the directory with a badge. Admin-set only.",
			},
		}),
		autoField({
			name: "invitedAt",
			type: "date",
			admin: {
				description:
					"Set once the publish-invite email has been sent. Guards re-publish from re-inviting.",
			},
		}),
		autoField({
			name: "claimRequestedBy",
			type: "text",
			admin: {
				description:
					"Someone asked to claim this profile. TO APPROVE: check this email's domain matches the website, then set the account Email (sidebar) to this address and Save — that auto-sends them a set-your-password invite and clears this field.",
			},
		}),
		autoField({ name: "claimRequestedAt", type: "date" }),

		// ── Publishing (admin-controlled) ──────────────────────────────────
		autoField({
			name: "status",
			type: "select",
			required: true,
			defaultValue: "draft",
			index: true,
			admin: { position: "sidebar" },
			options: [
				{ label: "Draft (partner editing)", value: "draft" },
				{ label: "Published", value: "published" },
				{ label: "Archived", value: "archived" },
			],
		}),
	],
	timestamps: true,
};
