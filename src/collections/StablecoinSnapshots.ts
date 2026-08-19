import type { CollectionConfig } from "payload";

/**
 * One dated row per stablecoin per UTC day — the history the charts and the
 * 7-day supply change are computed from.
 *
 * Migrated 2026-08-18 from the Replit service's Postgres table. The daily
 * grain is deliberate: the writer runs more often than once a day, and each
 * run OVERWRITES that day's row rather than appending, so a run every hour
 * still yields exactly one point per day and the series can't be skewed by
 * how often the job happened to fire.
 *
 * `assetId` + `day` is the natural key. `day` is a plain YYYY-MM-DD string,
 * not a timestamp: the point is "the value on this date", and storing a
 * datetime invites timezone drift into a series that is meant to be daily.
 *
 * Null metrics mean not measured that day — never zero. A gap in the series
 * is a gap in measurement, not a report that supply fell to nothing.
 */
export const StablecoinSnapshots: CollectionConfig = {
	slug: "stablecoin-snapshots",
	admin: {
		useAsTitle: "key",
		defaultColumns: ["assetId", "day", "supply", "marketCapUSD", "holders"],
	},
	access: { read: () => true },
	fields: [
		{
			name: "key",
			type: "text",
			required: true,
			index: true,
			unique: true,
			admin: {
				description:
					"`${assetId}:${day}` — the natural key the writer upserts on, one row per asset per UTC day",
			},
		},
		{ name: "assetId", type: "text", required: true, index: true },
		{ name: "code", type: "text", index: true },
		{ name: "issuer", type: "text" },
		{
			name: "day",
			type: "text",
			required: true,
			index: true,
			admin: { description: "UTC date, YYYY-MM-DD" },
		},

		{ name: "supply", type: "number" },
		{ name: "priceUSD", type: "number" },
		{ name: "marketCapUSD", type: "number" },
		{ name: "holders", type: "number" },
		{ name: "volume24hUSD", type: "number" },

		{
			name: "basis",
			type: "select",
			options: ["live", "curated-static", "unmeasured"],
			index: true,
			admin: {
				description:
					"Provenance of THIS day's point. A chart should not silently mix live and static points.",
			},
		},
		{
			name: "measuredAt",
			type: "date",
			required: true,
			admin: {
				description:
					"Exact instant of the measurement that produced this day's row (the last one that day).",
			},
		},
		{
			name: "source",
			type: "text",
			admin: {
				description:
					"Which pipeline wrote it — 'stellarlight' now; 'replit-import' for history imported from the retired service.",
			},
		},
	],
	timestamps: true,
};
