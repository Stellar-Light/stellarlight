import type { CollectionConfig } from "payload";
import { isAdmin } from "./access";

/**
 * Every Stellar hackathon submission read from DoraHacks, stored so the
 * prior-art layer no longer depends on DoraHacks keeping it listed (its
 * 2026-08 API change emptied every DoraHacks-backed surface for a day).
 *
 * One row per DoraHacks buidl, upserted by scripts/sync-hackathon-builds.ts
 * and never deleted. A failed read never blanks a stored value. A submission
 * the team deleted or made private stays stored with hiddenUpstream and is
 * not served.
 */
export const HackathonBuilds: CollectionConfig = {
	slug: "hackathon-builds",
	admin: {
		useAsTitle: "name",
		group: "Ecosystem",
		defaultColumns: ["name", "hackathonTitle", "placement", "projectSlug"],
	},
	access: {
		read: ({ req }) =>
			isAdmin(req.user) ? true : { hiddenUpstream: { not_equals: true } },
		create: ({ req }) => isAdmin(req.user),
		update: ({ req }) => isAdmin(req.user),
		delete: ({ req }) => isAdmin(req.user),
	},
	fields: [
		{
			name: "buildId",
			type: "text",
			required: true,
			unique: true,
			index: true,
			admin: {
				description:
					"dorahacks-buidl-<id>, the id the builds API has always served",
			},
		},
		{ name: "name", type: "text", required: true },
		{
			name: "vision",
			type: "textarea",
			admin: {
				description:
					"DoraHacks' one-line summary (about 256 characters at most upstream). Served as `description`.",
			},
		},
		{
			name: "description",
			type: "textarea",
			admin: {
				description:
					"The team's full write-up from the submission page, markdown as published. Empty until the lane has read the page.",
			},
		},
		{
			name: "selfTags",
			type: "text",
			hasMany: true,
			admin: {
				description:
					'What the team tagged itself with on DoraHacks ("layer1:Stellar", "category:..."). Self-reported.',
			},
		},
		{
			name: "hackathonSlug",
			type: "text",
			required: true,
			index: true,
			admin: {
				description:
					"The event's DoraHacks uname: the slug /api/hackathons lists and /api/hackathons/{slug} opens",
			},
		},
		{ name: "hackathonTitle", type: "text", required: true },
		{
			name: "endedAt",
			type: "text",
			admin: { description: "Event end date, YYYY-MM-DD" },
		},
		{ name: "track", type: "text" },
		{
			name: "placement",
			type: "text",
			admin: {
				description:
					"This build's own placement as DoraHacks published it ('1st Place'); empty when not a winner",
			},
		},
		{
			name: "award",
			type: "text",
			admin: {
				description:
					"Award category title, shared by every placement inside it; not this build's payout",
			},
		},
		{ name: "isWinner", type: "checkbox", defaultValue: false, index: true },
		{ name: "url", type: "text", required: true },
		{ name: "githubUrl", type: "text" },
		{ name: "demoUrl", type: "text" },
		{ name: "videoUrl", type: "text" },
		{
			name: "repoFullName",
			type: "text",
			index: true,
			admin: {
				description:
					"owner/name parsed from githubUrl, lowercased. Empty for an account or org link.",
			},
		},
		{
			name: "projectSlug",
			type: "text",
			index: true,
			admin: {
				description:
					"The directory project that lists this exact repo as its own. Empty after a check = no project lists it. A shared GitHub owner never counts.",
			},
		},
		{ name: "projectName", type: "text" },
		{
			name: "projectLinkBasis",
			type: "text",
			admin: {
				description:
					"Which rule linked projectSlug: repo (the project lists this exact repo) or website (the submission's demo site is the project's website).",
			},
		},
		{
			name: "linkCheckedAt",
			type: "text",
			admin: {
				description:
					"When projectSlug was last derived, ISO. Empty = never checked.",
			},
		},
		{
			name: "detailReadAt",
			type: "text",
			admin: {
				description: "When the lane last read the submission page, ISO",
			},
		},
		{
			name: "hiddenUpstream",
			type: "checkbox",
			defaultValue: false,
			admin: {
				description:
					"Deleted or made private on DoraHacks: kept here, not served",
			},
		},
		{
			// voyage-3, 1024 dims, over buildEmbeddingText (name, summary, track,
			// start of the write-up). Written by the sync lane, read raw by
			// $vectorSearch on hackathon_build_vector_index. Never served: the
			// field is admin-read and the index read leaves it out.
			name: "embedding",
			type: "json",
			access: { read: ({ req }) => isAdmin(req.user) },
			admin: { hidden: true },
		},
		{
			name: "embeddingTextHash",
			type: "text",
			admin: {
				hidden: true,
				description:
					"sha1 of the embedded text; the lane re-embeds a row only when it changes",
			},
		},
		{
			name: "stack",
			type: "text",
			hasMany: true,
			admin: {
				description:
					"Stellar packages the repo's package.json and Cargo.toml files declare (the src/lib/stellar-deps.ts allowlist). Meaningful only when stackReadAt is set: empty after a read = declares none.",
			},
		},
		{
			name: "stackReadAt",
			type: "text",
			admin: {
				description:
					"When the lane last read the repo's manifests, ISO. Empty = never read: no repo link, not public, or not read yet.",
			},
		},
		{
			name: "repoMissingAt",
			type: "text",
			admin: {
				description:
					"When the repo last answered not found (deleted, renamed away or private), ISO. Cleared by the next successful read.",
			},
		},
		{
			// [{ type, score }], best first: directory project types (the
			// PROJECT_TYPES vocabulary) from the build's nearest directory
			// projects. Written by the sync lane only after the method passes its
			// leave-one-out check on the directory's own hand-set types.
			name: "categories",
			type: "json",
			admin: {
				description:
					"Directory project types this submission was sorted into, best first, each with a 0 to 1 score. Read only when categoriesAt is set.",
			},
		},
		{
			name: "categoriesAt",
			type: "text",
			admin: {
				description:
					"When the lane last categorized this submission, ISO. Empty = not categorized.",
			},
		},
		{
			name: "categoriesMethod",
			type: "text",
			admin: {
				description:
					"How the categories were assigned, with the version and its measured precision.",
			},
		},
		{
			name: "repoLastCommitAt",
			type: "text",
			admin: {
				description:
					"Date of the last commit on the repo's default branch, ISO. Read only when activityCheckedAt is set.",
			},
		},
		{
			name: "repoArchived",
			type: "checkbox",
			admin: { description: "The repo is archived on GitHub." },
		},
		{
			name: "activityCheckedAt",
			type: "text",
			admin: {
				description:
					"When the lane last read the repo's activity, ISO. Empty = never read.",
			},
		},
		{ name: "firstSeenAt", type: "text", required: true },
		{
			name: "lastSeenAt",
			type: "text",
			required: true,
			admin: {
				description:
					"Last time the event's DoraHacks roster listed this build, ISO",
			},
		},
	],
};
