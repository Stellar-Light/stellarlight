import type { CollectionConfig } from "payload";
import { isAdmin } from "./access";

/**
 * i³ Awards — the record of every ballot: WHO cast WHICH anonymous ballot.
 *
 * Ballots are written by the relay to ITS account under a random ballot id,
 * so the chain shows N unlinkable ballots and nothing public connects one to
 * an address. This collection is the only place an id meets an address, which
 * makes it three things at once:
 *
 *   - the one-ballot gate: a row is RESERVED before the relay writes, so two
 *     submissions cannot both get through;
 *   - the source of truth for the tally: it alone knows a voter's FIRST
 *     ballot (the counted one), and it alone survives a testnet reset, which
 *     clears every ledger entry and all history;
 *   - the private half of the anonymity: readable by admins only. Public
 *     surfaces stay aggregate — turnout and per-nominee counts, never
 *     address→choice — and what gets anchored on Tansu is a DIGEST of this
 *     record, which pins it without disclosing it.
 *
 * A row whose history[0] has no txHash is a reservation the relay never
 * confirmed; it is not counted, and the reconcile lane confirms or releases it.
 */
const ED25519_PUBLIC_KEY = /^G[A-Z2-7]{55}$/;

export const AwardBallots: CollectionConfig = {
	slug: "award-ballots",
	labels: { singular: "Award Ballot", plural: "Award Ballots" },
	admin: {
		useAsTitle: "address",
		defaultColumns: ["address", "round", "submissions", "lastSubmittedAt"],
		group: "Awards",
		description:
			"Recorded ballots, one per address per round. The FIRST entry in `history` is the ballot that counts — nothing on chain remembers it, because a manageData overwrite destroys what it replaces.",
	},
	access: {
		read: ({ req }) => isAdmin(req.user),
		create: ({ req }) => isAdmin(req.user),
		update: ({ req }) => isAdmin(req.user),
		delete: ({ req }) => isAdmin(req.user),
	},
	// The one-ballot gate, enforced by the database: two reserves racing past
	// the find-then-create in reserveBallot both reach create, and exactly one
	// gets the duplicate-key error. Without this the gate is a race.
	indexes: [{ fields: ["round", "address"], unique: true }],
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
				description: "Voter's Stellar public key (G...). TESTNET account.",
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
			name: "selections",
			type: "json",
			required: true,
			admin: {
				description:
					"The validated ballot as { categoryKey: nomineeSlug }, mirroring the on-chain manageData entries.",
			},
		},
		{
			// The random id the ballot was written under on the RELAY account.
			// This row is the only place it meets an address: the chain shows
			// ballots by id, the record shows who cast which. Admin-only, like
			// the rest of the row.
			name: "ballotId",
			type: "text",
			index: true,
			admin: {
				description:
					"Ballot id on the relay account (i3.<round>.<ballotId>.<category>). The address→ballot link lives here and nowhere public.",
			},
		},
		{
			name: "txHash",
			type: "text",
			index: true,
			admin: {
				description: "Testnet transaction hash of the most recent submission.",
			},
		},
		{
			name: "submissions",
			type: "number",
			defaultValue: 1,
			admin: {
				description: "How many times this address has cast/changed its ballot.",
			},
		},
		{
			name: "firstSubmittedAt",
			type: "date",
			admin: { position: "sidebar", description: "First recorded vote." },
		},
		{
			name: "lastSubmittedAt",
			type: "date",
			admin: { position: "sidebar", description: "Most recent vote." },
		},
		{
			// Append-only trail — one entry per submission, so a revote doesn't
			// erase what came before and a "voting history" view has a timeline
			// with a per-vote explorer link. The top-level `selections`/`txHash`
			// remain the current ballot; this is the record of how it got there.
			name: "history",
			type: "array",
			admin: {
				description: "Every submission this address made, oldest first.",
			},
			fields: [
				{ name: "txHash", type: "text" },
				{ name: "selections", type: "json" },
				{ name: "at", type: "date" },
				// which relay ballot this submission became; Payload drops keys
				// the config does not declare, so this has to be here
				{ name: "ballotId", type: "text" },
			],
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
