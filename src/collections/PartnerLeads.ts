import type { CollectionConfig, Where } from "payload";

/**
 * PartnerLeads — demand-side signal for the partner flywheel.
 *
 * Every time the public concierge chat (`/api/partners/assistant`) surfaces a
 * partner in response to a builder's stated need, we log a lead here: "someone
 * was looking for what you offer." The weekly partner digest
 * (`/api/cron/partner-digest`) batches each partner's unnotified leads into a
 * single email so partners see real demand — the incentive to keep their
 * profile fresh and stay listed.
 *
 * Written system-side (overrideAccess) from the concierge route; never public
 * to write. Admins read everything; a logged-in partner reads ONLY their own
 * slug's leads (Payload auto-mounts /api/partner-leads, and the dashboard's
 * Leads panel queries it with the partner's cookie — without the row scope
 * any partner could read every other partner's demand signal). `notified`
 * flips true once a digest includes it, so the next digest doesn't repeat it.
 */
const isAdmin = (user: { collection?: string } | null | undefined) =>
	user?.collection === "users";

export const PartnerLeads: CollectionConfig = {
	slug: "partner-leads",
	admin: {
		useAsTitle: "need",
		defaultColumns: ["partnerSlug", "need", "source", "notified", "createdAt"],
		group: "Partners",
		description:
			"Builder searches that surfaced a partner. Batched into the weekly partner digest.",
	},
	access: {
		create: () => false, // system-only (overrideAccess from the concierge route)
		read: ({ req }) => {
			if (isAdmin(req.user)) return true;
			if (req.user?.collection === "partner-accounts") {
				// biome-ignore lint/suspicious/noExplicitAny: partner-accounts user doc carries slug
				const slug = (req.user as any)?.slug;
				if (!slug) return false;
				const ownOnly: Where = { partnerSlug: { equals: slug } };
				return ownOnly;
			}
			return false;
		},
		update: ({ req }) => isAdmin(req.user),
		delete: ({ req }) => isAdmin(req.user),
	},
	fields: [
		{
			name: "partnerSlug",
			type: "text",
			required: true,
			index: true,
			admin: { description: "Slug of the partner that was surfaced." },
		},
		{
			name: "partnerName",
			type: "text",
			admin: { description: "Denormalized name for the digest email." },
		},
		{
			name: "need",
			type: "textarea",
			required: true,
			admin: { description: "The builder's stated need that matched." },
		},
		{
			name: "source",
			type: "select",
			defaultValue: "concierge",
			options: [
				{ label: "Concierge chat", value: "concierge" },
				{ label: "Match API", value: "match-api" },
			],
			admin: { description: "Which surface generated the lead." },
		},
		{
			name: "notified",
			type: "checkbox",
			defaultValue: false,
			index: true,
			admin: {
				description: "True once a weekly digest has included this lead.",
			},
		},
	],
	timestamps: true,
};
