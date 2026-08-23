import type { CollectionConfig } from "payload";

/**
 * Paid HTTP endpoints an agent can actually pay for ON STELLAR.
 *
 * x402 and MPP are shared standards, so "supports x402" says nothing about
 * whether a Stellar wallet can pay: the 402 challenge names the networks it
 * accepts, and a caller holding USDC on Stellar can only pay a door that
 * lists `stellar:pubnet`. Measured 2026-08-22 across the whole public
 * surface: of 38 pay.sh providers whose 402 could be read, ZERO accept
 * Stellar, and 3 of 1,611 hosts in Coinbase's x402 Bazaar do. The ecosystem
 * has the rails (@x402/stellar, @stellar/mpp, OpenZeppelin Channels,
 * Veridex) and no index of what is actually purchasable with them.
 *
 * This is that index, and its whole value is the LIVENESS: every row is a
 * URL we re-probed, with the challenge we read back. A directory of paid
 * APIs that never re-checks is a list of dead links within a quarter —
 * agent endpoints are demos far more often than products.
 *
 * DISCIPLINE, learned the expensive way on this codebase:
 *   - `accepts` is what the 402 SAID, verbatim. Never inferred from a
 *     README, a registry listing, or the operator's own claim.
 *   - `lastStatus` distinguishes a 402 (paid, alive) from 200 (free or
 *     open), 401/403 (auth-walled — we cannot see the terms), and a
 *     transport failure. Absence of a 402 is never reported as "not paid".
 *   - a row that stops answering is marked, never silently dropped: an
 *     endpoint going dark is the single most useful thing this can tell a
 *     caller, and deleting it destroys exactly that signal.
 */
export const PaidEndpoints: CollectionConfig = {
	slug: "paid-endpoints",
	admin: {
		useAsTitle: "url",
		defaultColumns: [
			"url",
			"protocol",
			"acceptsStellar",
			"lastStatus",
			"lastCheckedAt",
		],
	},
	// PRIVATE. Payload auto-generates a public REST route at /api/<slug> for
	// every collection, so access control — not the absence of a custom route
	// — is what keeps this off the public surface. It is also deliberately
	// absent from the OpenAPI spec: Raven builds its catalog from that spec,
	// so an operation that is not in it cannot be discovered or called. The
	// data accumulates; nothing advertises it until we choose to.
	access: {
		read: ({ req }) => !!req.user,
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	fields: [
		{
			name: "url",
			type: "text",
			required: true,
			index: true,
			unique: true,
			admin: {
				description:
					"The resource URL that answers the payment challenge — the natural key.",
			},
		},
		{ name: "host", type: "text", index: true },
		{ name: "title", type: "text" },
		{ name: "description", type: "textarea" },
		{
			name: "protocol",
			type: "select",
			options: ["x402", "mpp", "x402+mpp", "unknown"],
			index: true,
			admin: {
				description:
					"Which challenge the endpoint actually returned. `unknown` = we never read one.",
			},
		},
		{
			name: "acceptsStellar",
			type: "checkbox",
			index: true,
			admin: {
				description:
					"TRUE only when a read challenge listed stellar:pubnet (or an MPP stellar method). The point of the whole index.",
			},
		},
		{
			name: "accepts",
			type: "array",
			admin: {
				description:
					"Payment options exactly as the challenge stated them. Empty = no challenge read, NEVER 'accepts nothing'.",
			},
			fields: [
				{ name: "network", type: "text" },
				{ name: "asset", type: "text" },
				{ name: "amount", type: "text" },
				{ name: "scheme", type: "text" },
			],
		},
		{
			name: "priceUSD",
			type: "number",
			admin: {
				description:
					"Per-call price when the challenge states one in a USD stablecoin. Null = not stated.",
			},
		},
		{
			name: "source",
			type: "select",
			options: [
				"bazaar",
				"sextant",
				"stellar-directory",
				"curated",
				"openapi-discovery",
			],
			index: true,
			admin: {
				description:
					"Where we learned of the endpoint. Discovery source, never evidence of liveness.",
			},
		},
		{
			name: "sourceUrl",
			type: "text",
			admin: {
				description: "The listing we found it in, so a caller can go upstream.",
			},
		},
		{
			name: "lastStatus",
			type: "text",
			index: true,
			admin: {
				description:
					"HTTP status of the last probe, or a transport error. 402 = paid and alive.",
			},
		},
		{ name: "lastCheckedAt", type: "date", index: true },
		{
			name: "lastPaidAt",
			type: "date",
			admin: { description: "Last time this URL actually returned a 402." },
		},
		{
			name: "consecutiveFailures",
			type: "number",
			defaultValue: 0,
			admin: {
				description:
					"Probes in a row that did not return a challenge. A streak is the going-dark signal.",
			},
		},
		{ name: "note", type: "textarea" },
	],
	timestamps: true,
};
