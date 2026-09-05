import type { CollectionConfig } from "payload";

/**
 * Measured state of the verified RWA registry (P3: the second bounded lane).
 *
 * `src/data/rwa-registry.ts` is the IDENTITY source — which assets exist and
 * how each was verified. This collection is what the refresh cron MEASURES
 * about them every six hours: supply, holders, activity, dated. One row per
 * registry id, upserted; a row is never deleted, and an asset the fetch could
 * not read is still written with basis "unmeasured" and a note, so a bad
 * fetch can never look like a delisting. /api/rwa merges these onto the
 * registry row where present.
 */
export const RwaAssets: CollectionConfig = {
	slug: "rwa-assets",
	admin: { useAsTitle: "assetId", group: "Ecosystem" },
	access: { read: () => true },
	fields: [
		{
			name: "assetId",
			type: "text",
			required: true,
			index: true,
			unique: true,
			admin: { description: "Registry id: CODE-GISSUER or the contract id" },
		},
		{
			name: "kind",
			type: "select",
			options: ["classic", "soroban"],
			required: true,
		},
		{ name: "symbol", type: "text", index: true },
		{ name: "issuerEntity", type: "text", index: true },
		{
			name: "supply",
			type: "number",
			admin: {
				description:
					"Classic: authorized supply (stellar.expert). Soroban: total_supply() where the contract exposes it. null = not measured",
			},
		},
		{
			name: "holders",
			type: "number",
			admin: {
				description:
					"Classic: trustlines. Soroban: null unless a holder count is readable. null = not measured",
			},
		},
		{
			name: "activityCount",
			type: "number",
			admin: {
				description:
					"Classic: lifetime payment operations. Soroban: lifetime contract events (stellar.expert). A COUNT, not an amount; not comparable across kinds",
			},
		},
		{
			name: "measureBasis",
			type: "select",
			options: ["live", "unmeasured"],
			required: true,
			admin: {
				description:
					"live = read this cycle; unmeasured = the fetch failed and the previous good numbers were kept (or none exist). Never 'zero'.",
			},
		},
		{ name: "measuredAt", type: "text", required: true },
		{
			name: "note",
			type: "text",
			admin: {
				description: "Set when the row could not be measured; names why",
			},
		},
	],
};
