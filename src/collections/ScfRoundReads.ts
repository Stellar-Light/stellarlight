import type { CollectionConfig } from "payload";
import { adminOnly } from "./access";

/**
 * What SCF's round pages list (sls-116): one row per whole read the SCF sync
 * (scripts/enrich-from-scf.ts) makes on an execute, its only writer. GET
 * /api/projects/scf-rounds serves the newest against the project rows it
 * reads at request time. A partial read is never stored, so the newest row is
 * always a whole one, dated by readAt.
 */
export const ScfRoundReads: CollectionConfig = {
	slug: "scf-round-reads",
	admin: {
		useAsTitle: "readAt",
		description:
			"System-written by the SCF sync (sls-116): each numbered SCF round's listed awards, by project page. Served by /api/projects/scf-rounds. Do not edit by hand.",
	},
	access: {
		// served only through /api/projects/scf-rounds (local API)
		read: adminOnly,
		create: adminOnly,
		update: () => false,
		delete: adminOnly,
	},
	fields: [
		{
			name: "readAt",
			type: "date",
			required: true,
			index: true,
			admin: { description: "When the sync finished reading the rounds." },
		},
		{
			// ListedRound[] (src/lib/scf-round-counts.ts): about 900 awards in
			// 46 rounds, one compact value
			name: "rounds",
			type: "json",
			required: true,
		},
	],
};
