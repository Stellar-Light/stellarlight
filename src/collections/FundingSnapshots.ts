import type { CollectionConfig } from "payload";

/**
 * Funding-v2 snapshot ledger (sls-044, #520).
 *
 * /api/analyze?dimension=funding serves a reconstructed cumulative SCF total
 * whose distinct-project SET can legitimately change between reads (dupe
 * merges, status reclassification, award corrections). Without a persisted
 * baseline a consumer cannot tell an intended correction from accidental
 * project loss. This collection stores ONE row per observed project-set state
 * (keyed by projectSetHash — the same sha256-prefix digest the funding block
 * serves), written best-effort by the analyze route when it computes a hash
 * it hasn't stored yet. The route then serves current-vs-previous added/
 * removed slug lists as answer-visible delta provenance.
 *
 * Deliberately small: a new row only when membership changes (~weekly, not
 * per-request), no versions, slugs as one JSON array — M0-tier friendly.
 */
export const FundingSnapshots: CollectionConfig = {
	slug: "funding-snapshots",
	admin: {
		useAsTitle: "projectSetHash",
		description:
			"System-written funding-v2 snapshot ledger (sls-044): one row per distinct awarded-project set, used by /api/analyze?dimension=funding to serve added/removed delta provenance. Do not edit by hand.",
	},
	access: {
		read: () => true,
		// Writes come from the analyze route via the local API (overrideAccess);
		// no user-facing create/update path.
		create: ({ req }) => !!req.user,
		update: () => false,
		delete: ({ req }) => !!req.user,
	},
	fields: [
		{
			name: "projectSetHash",
			type: "text",
			required: true,
			index: true,
			admin: {
				description:
					"sha256-prefix digest of the sorted awarded-project slug set — identical to funding.projectSetHash in the API response.",
			},
		},
		{
			name: "scfAwardedProjects",
			type: "number",
			required: true,
		},
		{
			name: "scfTotalDistributedUSD",
			type: "number",
			required: true,
		},
		{
			name: "methodologyVersion",
			type: "text",
			required: true,
		},
		{
			// JSON array of the awarded-project slugs in this snapshot (sorted).
			// json (not hasMany text) keeps ~400 slugs as one compact value.
			name: "awardedSlugs",
			type: "json",
			required: true,
		},
		{
			name: "computedAt",
			type: "date",
			required: true,
			index: true,
			admin: {
				description: "When this project-set state was first observed.",
			},
		},
	],
};
