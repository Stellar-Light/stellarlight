import type { CollectionConfig } from "payload";
import { adminOnly } from "./access";

/**
 * SCF's own payment figures as each SCF sync run read them: one row per
 * execute of scripts/enrich-from-scf.ts, its only writer. The history behind
 * projects.scf.paid: a figure that differs between two rows changed after the
 * earlier row's startedAt and by the later row's readAt.
 */
export const ScfPaidReads: CollectionConfig = {
	slug: "scf-paid-reads",
	admin: {
		useAsTitle: "readAt",
		description:
			"System-written by the SCF sync: every SCF project page's awarded and paid totals and Build tranche shares, per run. Do not edit by hand.",
	},
	access: {
		read: adminOnly,
		create: adminOnly,
		update: () => false,
		delete: adminOnly,
	},
	fields: [
		{
			name: "startedAt",
			type: "date",
			required: true,
			admin: { description: "When the run started, before any page read." },
		},
		{
			name: "readAt",
			type: "date",
			required: true,
			index: true,
			admin: { description: "When the run finished reading the pages." },
		},
		{
			// PaidReadPage[] (src/lib/scf-paid.ts), one per page read whole
			name: "pages",
			type: "json",
			required: true,
		},
		{
			// pages whose totals differ from the previous row's
			name: "changes",
			type: "json",
		},
	],
};
