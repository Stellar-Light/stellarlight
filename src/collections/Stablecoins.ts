import type { CollectionConfig } from "payload";

/**
 * Stellar stablecoin inventory — one row per (asset code, issuer), written by
 * scripts/refresh-stablecoins.ts from the registry in
 * src/data/stablecoin-registry.ts.
 *
 * Migrated off the Replit-hosted snapshot service 2026-08-18. Owning the data
 * is the point: that service silently dropped Circle USDC for hours while the
 * asset was live on-chain, and a missing row reads to a consumer as "this
 * asset does not exist on Stellar" (stellar-raven sls-066).
 *
 * Field semantics an agent must not misread:
 *   - `assetId` is `CODE-<first 8 of issuer>`. Identity is (code, issuer):
 *     Circle's EURC and MyKobo's EURC are DIFFERENT assets that share a
 *     ticker. Never merge on ticker alone.
 *   - Any metric null = NOT MEASURED at `measuredAt`, never zero.
 *   - `supply` is denominated in the asset's own peg and is comparable only
 *     within a peg (GYEN's supply is yen). `marketCapUSD` is the only
 *     cross-asset comparable size metric.
 *   - `basis`: live = measured this run; curated-static = human-checked
 *     figures for an asset no public API reports; unmeasured = the fetch
 *     failed and the row is kept so its absence is never read as delisting.
 *   - `retiredAt` set = we stopped tracking it. Still NOT a claim the issuer
 *     stopped issuing.
 */
export const Stablecoins: CollectionConfig = {
	slug: "stablecoins",
	admin: {
		useAsTitle: "assetId",
		defaultColumns: ["assetId", "company", "peg", "marketCapUSD", "measuredAt"],
	},
	access: { read: () => true },
	fields: [
		{
			name: "assetId",
			type: "text",
			required: true,
			index: true,
			unique: true,
			admin: { description: "CODE-<issuer[0:8]> — the natural key" },
		},
		{ name: "code", type: "text", required: true, index: true },
		{
			name: "issuer",
			type: "text",
			required: true,
			index: true,
			admin: {
				description:
					"Mainnet issuer account. With `code` this IS the asset's identity.",
			},
		},
		{ name: "name", type: "text" },
		{ name: "company", type: "text", index: true },
		{ name: "domain", type: "text" },
		{ name: "website", type: "text" },
		{
			name: "peg",
			type: "text",
			index: true,
			admin: { description: "Fiat the asset claims parity with (USD, EUR, …)" },
		},
		{ name: "country", type: "text" },
		{
			name: "assetType",
			type: "text",
			admin: {
				description:
					"Qualifier where the asset is not a pure peg (e.g. 'Yield Stablecoin' for USDY)",
			},
		},

		// ── measured values; null always means "not measured" ──
		{
			name: "supply",
			type: "number",
			admin: {
				description:
					"Circulating units in the asset's OWN peg. NOT comparable across pegs.",
			},
		},
		{
			name: "priceUSD",
			type: "number",
			admin: {
				description:
					"USD per unit AT ITS PEG (live FX). Assumes the peg holds; peg deviation is not measured here.",
			},
		},
		{
			name: "marketCapUSD",
			type: "number",
			index: true,
			admin: {
				description:
					"supply × priceUSD — the only cross-asset comparable size metric.",
			},
		},
		{ name: "holders", type: "number", admin: { description: "Trustlines" } },
		{
			name: "volume24hUSD",
			type: "number",
			admin: {
				description:
					"24h on-chain TRADE volume in USD (SDEX), not payments; falls back to 7d/7 when the 24h figure is absent (an estimate — see basis).",
			},
		},
		{
			name: "paymentsCountLifetime",
			type: "number",
			admin: {
				description:
					"Stellar Expert's lifetime count of payment operations for this asset (not SDEX trades, not an amount). Internal bookkeeping — refresh-stablecoins.ts diffs it against yesterday's snapshot into paymentsCount24h below; not comparable across assets on its own.",
			},
		},
		{
			name: "paymentsCount24h",
			type: "number",
			admin: {
				description:
					"Count of payment operations in the last ~24h (delta of paymentsCountLifetime vs the closest snapshot ~1 day back). A COUNT, not a dollar amount — includes mint, redemption and peer-to-peer payments undifferentiated; not adjusted for CEX/DeFi/infrastructure activity the way a figure like Allium's 'adjusted transfers' is. Null until two snapshots roughly a day apart exist.",
			},
		},
		{
			name: "supplyChange7d",
			type: "number",
			admin: {
				description:
					"Percent change vs the snapshot ~7 days ago. Null until two snapshots exist — never 0 for 'no data'.",
			},
		},

		{ name: "logoUrl", type: "text" },
		{
			name: "logoSource",
			type: "select",
			options: ["toml", "toml-org", "fallback", "country-flag", "none"],
			admin: {
				description:
					"Where the logo came from; toml = the issuer's own per-currency image, toml-org = the same toml's org-level mark (no per-currency image, but the org one resolves)",
			},
		},

		// ── provenance ──
		{
			name: "basis",
			type: "select",
			required: true,
			index: true,
			options: ["live", "curated-static", "unmeasured"],
			admin: {
				description:
					"How this row's numbers were obtained. Never present curated-static or unmeasured as a live measurement.",
			},
		},
		{
			name: "measuredAt",
			type: "date",
			required: true,
			index: true,
			admin: { description: "When these figures were taken. Always cite it." },
		},
		{
			name: "note",
			type: "text",
			admin: {
				description: "Why a row is unmeasured or static, in plain words",
			},
		},
		{
			name: "retiredAt",
			type: "date",
			admin: {
				description:
					"Set when we stop tracking an asset. Not a claim the issuer stopped issuing it.",
			},
		},
	],
	timestamps: true,
};
