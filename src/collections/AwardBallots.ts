import type { CollectionConfig } from "payload";
import { isAdmin } from "./access";

/**
 * i³ Awards — a durable record of every ballot that cleared validation and
 * landed on testnet (one row per address per round, upserted on each vote).
 *
 * THIS is what decides the round. One ballot per voter and the FIRST one
 * counts — and a manageData overwrite destroys the value it replaces, so the
 * chain can only ever show the LATEST ballot. `history[0]` is the only record
 * of the first one anywhere, which makes this collection the tally's primary
 * source; the chain is the fallback, for an address that wrote its own
 * manageData without going through the relay.
 *
 * It also means the round can be read WITHOUT walking Horizon — "who has
 * voted, for what, and when" in one admin query — and that a vote survives
 * even if a testnet account is later merged or reset. It is written
 * best-effort AFTER the on-chain submit succeeds; a failure there never fails
 * a vote that already exists on-chain, and the reconcile lane closes the gap.
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
			"Recorded ballots, one per address per round. The FIRST entry in `history` is the ballot that counts — nothing on chain remembers it, because a manageData overwrite destroys what it replaces.",
	},
	access: {
		read: ({ req }) => isAdmin(req.user),
		create: ({ req }) => isAdmin(req.user),
		update: ({ req }) => isAdmin(req.user),
		delete: ({ req }) => isAdmin(req.user),
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
