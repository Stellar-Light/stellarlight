import type { CollectionConfig } from "payload";

/**
 * i³ Awards — voter whitelist (one row per eligible Stellar address per round).
 *
 * ~98 SCF Pilot addresses will come from SDF later (CSV import can be added
 * then); until then the mock seed creates a few TESTNET keypairs. The
 * address is the ONLY identity a ballot needs: the vote transaction's
 * source account must match a row here or the relay refuses it.
 *
 * Read access is admin-only on purpose. The whitelist is effectively
 * public on-chain once people vote, but our public payloads stay
 * aggregate-only (results tally + turnout count, never address→choice),
 * and there's no reason to hand the raw list out via Payload's auto REST.
 * Server code reads it through the local API (overrideAccess).
 */

const ED25519_PUBLIC_KEY = /^G[A-Z2-7]{55}$/;

export const AwardVoters: CollectionConfig = {
	slug: "award-voters",
	labels: { singular: "Award Voter", plural: "Award Voters" },
	admin: {
		useAsTitle: "address",
		defaultColumns: ["address", "label", "round"],
		group: "Awards",
		description:
			"Whitelisted voter addresses per round. A ballot is only relayed if its source account is listed here.",
	},
	access: {
		read: ({ req }) => !!req.user,
		create: ({ req }) => !!req.user,
		update: ({ req }) => !!req.user,
		delete: ({ req }) => !!req.user,
	},
	fields: [
		{
			name: "round",
			type: "relationship",
			relationTo: "award-rounds",
			required: true,
			index: true,
			admin: { position: "sidebar" },
		},
		{
			name: "address",
			type: "text",
			required: true,
			index: true,
			admin: {
				description:
					"Stellar public key (G...). TESTNET account for the pilot.",
			},
			validate: (value: unknown) => {
				const v = typeof value === "string" ? value.trim().toUpperCase() : "";
				if (!ED25519_PUBLIC_KEY.test(v)) {
					return "Must be a Stellar ed25519 public key: G + 55 base32 chars.";
				}
				return true;
			},
		},
		{
			name: "label",
			type: "text",
			admin: {
				description: 'Human label, e.g. "Pilot — Decaf team" (never public).',
			},
		},
	],
	hooks: {
		beforeValidate: [
			({ data }) => {
				if (typeof data?.address === "string") {
					return { ...data, address: data.address.trim().toUpperCase() };
				}
				return data;
			},
		],
	},
};
