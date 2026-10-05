import type { CollectionConfig } from "payload";
import { isAdmin } from "./access";

/**
 * Every Stellar hackathon event on DoraHacks, as its organizer published it:
 * dates, prize pool, tracks, the event page, the submission form's
 * requirements, and the requirements and judging sections when the page has
 * them. Upserted by scripts/sync-hackathon-builds.ts and never deleted; a
 * failed read never blanks a stored value. Public facts only: the event
 * API's private fields (password, admin and judge flags) are never read.
 */
export const HackathonEvents: CollectionConfig = {
	slug: "hackathon-events",
	admin: {
		useAsTitle: "title",
		group: "Ecosystem",
		defaultColumns: ["title", "endDate", "prizePoolUsd", "detailReadAt"],
	},
	access: {
		read: () => true,
		create: ({ req }) => isAdmin(req.user),
		update: ({ req }) => isAdmin(req.user),
		delete: ({ req }) => isAdmin(req.user),
	},
	fields: [
		{
			name: "slug",
			type: "text",
			required: true,
			unique: true,
			index: true,
			admin: {
				description:
					"The event's DoraHacks uname: the slug /api/hackathons lists and /api/hackathons/{slug} opens",
			},
		},
		{ name: "title", type: "text", required: true },
		{
			name: "startDate",
			type: "text",
			admin: { description: "YYYY-MM-DD" },
		},
		{ name: "endDate", type: "text", admin: { description: "YYYY-MM-DD" } },
		{ name: "prizePoolUsd", type: "number" },
		{ name: "hackersCount", type: "number" },
		{ name: "summary", type: "textarea" },
		{
			name: "description",
			type: "textarea",
			admin: {
				description:
					"The event page, markdown as the organizer published it (brief, resources, prizes, rules).",
			},
		},
		{ name: "tracks", type: "text", hasMany: true },
		{
			name: "repoRequired",
			type: "checkbox",
			admin: { description: "The submission form requires a public repo." },
		},
		{
			name: "videoRequired",
			type: "checkbox",
			admin: { description: "The submission form requires a demo video." },
		},
		{ name: "submissionQuestions", type: "text", hasMany: true },
		{
			name: "requirementsSection",
			type: "textarea",
			admin: {
				description:
					"The page's own requirements or rules section, verbatim. Empty = the page has none.",
			},
		},
		{
			name: "judgingSection",
			type: "textarea",
			admin: {
				description:
					"The page's own judging criteria section, verbatim. Empty = the organizer published none.",
			},
		},
		{
			name: "detailReadAt",
			type: "text",
			admin: { description: "When the lane last read the event page, ISO" },
		},
		{ name: "firstSeenAt", type: "text", required: true },
		{ name: "lastSeenAt", type: "text", required: true },
	],
};
