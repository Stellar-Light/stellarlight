import type { CollectionConfig, Field, Where } from "payload";
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
				const base = process.env.NEXT_PUBLIC_APP_URL || "https://stellarlight.xyz";
				const url = `${base}/partners/reset-password?token=${token}`;
				return `<p>Reset your Stellar Light partner password:</p><p><a href="${url}">${url}</a></p><p>This link expires soon. If you didn't request this, you can ignore it.</p>`;
			},
			generateEmailSubject: () => "Reset your Stellar Light partner password",
		},
	},
	admin: {
		useAsTitle: "name",
		defaultColumns: ["name", "partnerType", "status", "freshnessStatus", "lastPartnerUpdateAt"],
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
				if (operation === "update" && req.user?.collection === "partner-accounts") {
					data.lastPartnerUpdateAt = new Date().toISOString();
					data.freshnessStatus = "fresh";
				}
				return data;
			},
		],
		afterChange: [
			// Publish = invite. When an admin flips a draft to published for a
			// partner who has never been invited, mint a long-lived password-reset
			// token and email it as the account invite ("set your password").
			// Guards: draft→published transition only, once per account
			// (invitedAt), and a failed email can never block the publish.
			async ({ doc, previousDoc, operation, req }) => {
				try {
					if (operation !== "update") return;
					if (doc.status !== "published" || previousDoc?.status === "published")
						return;
					if (doc.invitedAt || !doc.email) return;
					const token = await req.payload.forgotPassword({
						collection: "partner-accounts",
						data: { email: doc.email },
						disableEmail: true, // we compose our own invite copy below
						expiration: 7 * 24 * 60 * 60 * 1000, // 7d — default 1h is too short for an invite
						req,
					});
					const base =
						process.env.NEXT_PUBLIC_APP_URL || "https://stellarlight.xyz";
					const url = `${base}/partners/reset-password?token=${token}`;
					await req.payload.sendEmail({
						to: doc.email,
						subject: "You're live on Stellar Light — set your password",
						text: [
							`${doc.name} is now published in the Stellar Light partner directory.`,
							"",
							`Set your password to manage your profile: ${url}`,
							"",
							`Your profile: ${base}/partners/${doc.slug}`,
							`Your dashboard: ${base}/partners/dashboard`,
							"",
							"This link expires in 7 days.",
						].join("\n"),
					});
					// Nested update doesn't touch status, so the transition guard
					// above short-circuits — no recursion.
					await req.payload.update({
						collection: "partner-accounts",
						id: doc.id,
						data: { invitedAt: new Date().toISOString() },
						overrideAccess: true,
						req,
					});
				} catch (err) {
					req.payload.logger.error(
						{ err, partner: doc?.slug },
						"partner invite email failed (publish not blocked)",
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
			admin: { position: "sidebar", description: "Auto-generated from name if left empty." },
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
			admin: { description: "Hosted logo URL. (Kept as a URL so partners don't need media-upload permissions.)" },
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
			admin: { description: "e.g. '2-6 week integration', 'self-serve API', 'retainer'" },
		},
		{
			name: "leadTime",
			type: "text",
			admin: { description: "How fast can a new team start? e.g. 'same week', '2-4 weeks'" },
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
			admin: { description: "Preferred channel — Discord handle, Telegram, lead form URL…" },
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
					admin: { description: "Slug in the stellarlight projects directory, if listed." },
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
					admin: { description: "Mainnet activity detected for their contracts/accounts." },
				}),
				autoField({ name: "onchainNote", type: "text" }),
				autoField({
					name: "scfInvolvement",
					type: "text",
					admin: { description: "e.g. 'SCF #38 awardee ($148k)' — read from our SCF data." },
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
				{ label: "Archived (>365d, hidden from AI matches)", value: "archived" },
			],
		}),
		{
			// Stamped by the beforeChange hook on partner saves; admins can
			// correct it manually if needed.
			name: "lastPartnerUpdateAt",
			type: "date",
			admin: { description: "Last time the PARTNER touched their profile. Drives the freshness loop." },
		},
		autoField({ name: "nextReminderAt", type: "date" }),

		// ── Listing pipeline (system-owned) ────────────────────────────────
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
					"Email of whoever asked to claim this profile via the public listing flow. Verify domain vs website before inviting.",
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
