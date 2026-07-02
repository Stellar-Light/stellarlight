import type { CollectionConfig } from "payload";

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
 * to write, admin-only to read. `notified` flips true once a digest includes
 * it, so the next digest doesn't repeat it.
 */
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
		read: ({ req }) => !!req.user,
		update: ({ req }) => !!req.user,
		delete: ({ req }) => !!req.user,
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
