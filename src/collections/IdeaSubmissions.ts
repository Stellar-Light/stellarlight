import type { CollectionConfig } from "payload";

export const IdeaSubmissions: CollectionConfig = {
	slug: "idea-submissions",
	admin: {
		useAsTitle: "name",
		defaultColumns: ["name", "needSize", "approach", "createdAt"],
		group: "Content",
	},
	access: {
		// Anyone can create (public form)
		// Direct REST create disabled — only POST /api/idea-submissions writes
		// (rate-limited, overrideAccess). See ScoutFeedback for the same pattern.
		create: () => false,
		// Only admins can read/update/delete
		read: ({ req }) => !!req.user,
		update: ({ req }) => !!req.user,
		delete: ({ req }) => !!req.user,
	},
	fields: [
		{
			name: "name",
			type: "text",
			required: true,
			label: "Name",
		},
		{
			name: "email",
			type: "email",
			label: "Email",
		},
		{
			name: "ecosystemNeed",
			type: "textarea",
			required: true,
			label: "Ecosystem Need",
		},
		{
			name: "needSize",
			type: "select",
			required: true,
			label: "Need Size",
			options: [
				{ label: "Critical — Essential for ecosystem growth", value: "critical" },
				{ label: "Important — Would significantly improve ecosystem", value: "important" },
				{ label: "Nice to have — Better suited for bounties or hackathons", value: "nice-to-have" },
			],
		},
		{
			name: "approach",
			type: "select",
			required: true,
			label: "Approach",
			options: [
				{ label: "Net-new build via RFP", value: "net-new-rfp" },
				{ label: "Ask an existing team to add the feature", value: "existing-team" },
				{ label: "Not sure — reviewers should decide", value: "unsure" },
			],
		},
		{
			name: "additionalContext",
			type: "textarea",
			label: "Additional Context",
		},
	],
	timestamps: true,
};
