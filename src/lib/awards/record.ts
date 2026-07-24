/**
 * i³ Awards — mirror a validated, on-chain ballot into Payload.
 *
 * The CHAIN stays the source of truth (the tally reads testnet Horizon). This
 * is a convenience mirror so a round can be read — "who voted, for what, when"
 * — without walking Horizon, and so a vote survives in our own store. It is
 * strictly best-effort: called AFTER the testnet submit succeeds, it must
 * never throw, because the vote already exists on-chain and a DB hiccup must
 * not make the API report failure for a vote that landed.
 */

import { getPayloadSafe } from "@/lib/payload-client";
import type { BallotSelections } from "./ballot";

export async function recordBallot(params: {
	roundSlug: string;
	address: string;
	selections: BallotSelections;
	txHash: string;
}): Promise<void> {
	const { roundSlug, address, selections, txHash } = params;
	try {
		const payload = await getPayloadSafe();
		if (!payload) return;

		// Resolve the round id — award-ballots.round is a relationship, and the
		// submit route only carries the slug.
		const rounds = await payload.find({
			collection: "award-rounds",
			where: { slug: { equals: roundSlug } },
			limit: 1,
			depth: 0,
		});
		const roundId = rounds.docs[0]?.id;
		if (!roundId) return;

		const now = new Date().toISOString();
		const existing = await payload.find({
			collection: "award-ballots",
			where: {
				and: [{ round: { equals: roundId } }, { address: { equals: address } }],
			},
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});

		const prior = existing.docs[0] as
			| {
					id: string | number;
					submissions?: number | null;
					history?: Array<{
						txHash?: string | null;
						selections?: BallotSelections | null;
						at?: string | null;
					}> | null;
			  }
			| undefined;

		const entry = { txHash, selections, at: now };

		if (prior) {
			// Revote: overwrite the current selections, bump the counter, keep
			// firstSubmittedAt, and APPEND to the trail (never lose a prior vote).
			await payload.update({
				collection: "award-ballots",
				id: prior.id,
				data: {
					selections,
					txHash,
					submissions: (prior.submissions ?? 1) + 1,
					lastSubmittedAt: now,
					history: [...(prior.history ?? []), entry],
				},
				overrideAccess: true,
			});
			return;
		}

		await payload.create({
			collection: "award-ballots",
			data: {
				round: roundId,
				address,
				selections,
				txHash,
				submissions: 1,
				firstSubmittedAt: now,
				lastSubmittedAt: now,
				history: [entry],
			},
			overrideAccess: true,
		});
	} catch (err) {
		// The vote is already on-chain — recording is a mirror, so a failure here
		// is logged and swallowed, never surfaced to the voter.
		console.error(
			"[awards] recordBallot failed (vote is still on-chain):",
			err,
		);
	}
}
