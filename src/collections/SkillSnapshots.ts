import type { CollectionConfig } from "payload";
import { adminOnly } from "./access";

/**
 * The last reviewed copy of each live-fetched skill. A SKILL.md is fetched
 * live from a repo or the skills.stellar.org registry and served to agents
 * as instructions they run. When a fetch carries a risky line its accepted
 * copy did not (src/lib/skill-scan.ts), the serving guard
 * (src/lib/skill-guard.ts) serves this copy instead, flagged, until a human
 * accepts the change; every other update is served live as it lands.
 *
 * One writer: the skill-content lane (scripts/check-skill-content.ts).
 */
export const SkillSnapshots: CollectionConfig = {
	slug: "skill-snapshots",
	admin: {
		useAsTitle: "slug",
		group: "Ecosystem",
		defaultColumns: ["slug", "source", "held", "checkedAt"],
	},
	access: {
		read: adminOnly,
		create: adminOnly,
		update: adminOnly,
		delete: adminOnly,
	},
	fields: [
		{ name: "slug", type: "text", required: true, unique: true, index: true },
		{
			name: "source",
			type: "select",
			required: true,
			options: ["curated", "registry"],
		},
		{
			name: "content",
			type: "textarea",
			admin: {
				description:
					"The last accepted SKILL.md, served in place of a held newer fetch",
			},
		},
		{
			name: "acceptedRisky",
			type: "json",
			admin: {
				description:
					"Normalized risky lines accepted with this copy (an official installer piped to sh). A newer fetch is held only for a line not in this list.",
			},
		},
		{
			name: "acceptedAt",
			type: "text",
			admin: { description: "When this copy was accepted, ISO" },
		},
		{
			name: "checkedAt",
			type: "text",
			admin: { description: "When the lane last read the live skill, ISO" },
		},
		{
			name: "held",
			type: "checkbox",
			defaultValue: false,
			index: true,
			admin: {
				description:
					"The live copy carries a risky line this copy did not: the guard serves this copy until a human accepts the change",
			},
		},
		{ name: "heldAt", type: "text" },
		{ name: "heldRules", type: "json" },
	],
};
