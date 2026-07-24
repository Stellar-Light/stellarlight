import type { CollectionConfig } from "payload";

/**
 * i³ Awards — a durable record of every ballot that cleared validation and
 * landed on testnet (one row per address per round, upserted on each vote).
 *
 * The CHAIN is still the source of truth: the tally reads whitelisted
 * accounts' manageData entries straight off Horizon, and a voter can revote
 * by overwriting theirs. This collection mirrors that so the round can be
 * read WITHOUT walking Horizon — "who has voted, for what, and when" in one
 * admin query — and so a vote survives in our own store even if a testnet
 * account is later merged or reset. It is written best-effort AFTER the
 * on-chain submit succeeds; a failure here never fails a vote that already
 * exists on-chain.
 *
 * Read access is admin-only, matching AwardVoters: public payloads stay
 * aggregate-only (turnout + per-nominee tally, never address→choice).
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
			"Recorded ballots (one per address per round, updated on revote). The on-chain testnet entries remain the source of truth; this is the queryable mirror.",
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
