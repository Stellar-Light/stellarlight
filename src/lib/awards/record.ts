/**
 * i³ Awards — mirror a validated, on-chain ballot into Payload.
 *
 * The CHAIN is the source of truth while it exists (the tally reads testnet
 * Horizon first). This mirror is how a round can be read — "who voted, for
 * what, when" — without walking Horizon, and it is the ONLY record that
 * outlives a testnet reset, which clears every ledger entry and all history.
 * After the reset following a round, /api/awards/results serves the tally
 * from here (see mirror.ts).
 *
 * `recordBallot` is strictly best-effort: called AFTER the testnet submit
 * succeeds, it must never throw, because the vote already exists on-chain and
 * a DB hiccup must not make the API report failure for a vote that landed.
 * That is also why it can silently miss a ballot — scripts/data/award-reconcile.ts
 * closes those gaps while the chain still exists, through the same writer
 * (`writeBallotRecord`), which DOES throw so a script run is loud.
 */

import type { Payload } from "payload";
import { getPayloadSafe } from "@/lib/payload-client";
import type { BallotSelections } from "./ballot";
import { normalizeSelections } from "./mirror";

export async function findRoundId(
	payload: Payload,
	roundSlug: string,
): Promise<string | null> {
	const rounds = await payload.find({
		collection: "award-rounds",
		where: { slug: { equals: roundSlug } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	return rounds.docs[0]?.id ?? null;
}

/**
 * Upsert one address's ballot for a round and APPEND to its history trail
 * (a revote never erases what came before). `at` is when the vote landed —
 * the relay passes now; the reconcile script passes the ledger close time.
 * Throws on failure.
 */
export async function writeBallotRecord(
	payload: Payload,
	params: {
		roundId: string;
		address: string;
		selections: BallotSelections;
		txHash: string | null;
		at: string;
	},
): Promise<"created" | "updated"> {
	const { roundId, address, selections, txHash, at } = params;
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

	const entry = { txHash, selections, at };

	if (prior) {
		await payload.update({
			collection: "award-ballots",
			id: prior.id,
			data: {
				selections,
				txHash,
				submissions: (prior.submissions ?? 1) + 1,
				lastSubmittedAt: at,
				history: [...(prior.history ?? []), entry],
			},
			overrideAccess: true,
		});
		return "updated";
	}

	await payload.create({
		collection: "award-ballots",
		data: {
			round: roundId,
			address,
			selections,
			txHash,
			submissions: 1,
			firstSubmittedAt: at,
			lastSubmittedAt: at,
			history: [entry],
		},
		overrideAccess: true,
	});
	return "created";
}

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
		// award-ballots.round is a relationship; the submit route only carries
		// the slug.
		const roundId = await findRoundId(payload, roundSlug);
		if (!roundId) return;
		await writeBallotRecord(payload, {
			roundId,
			address,
			selections,
			txHash,
			at: new Date().toISOString(),
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

/** Every mirrored ballot for a round: address → current selections. */
export async function readMirroredBallots(
	payload: Payload,
	roundId: string,
): Promise<Map<string, BallotSelections>> {
	const rows = await payload.find({
		collection: "award-ballots",
		where: { round: { equals: roundId } },
		limit: 2000,
		depth: 0,
		overrideAccess: true,
	});
	const out = new Map<string, BallotSelections>();
	for (const row of rows.docs) {
		const address = String(row.address ?? "")
			.trim()
			.toUpperCase();
		if (!address) continue;
		out.set(address, normalizeSelections(row.selections));
	}
	return out;
}

/** Safe wrapper for request paths: empty map when Payload is unavailable. */
export async function loadMirroredBallots(
	roundSlug: string,
): Promise<Map<string, BallotSelections>> {
	try {
		const payload = await getPayloadSafe();
		if (!payload) return new Map();
		const roundId = await findRoundId(payload, roundSlug);
		if (!roundId) return new Map();
		return await readMirroredBallots(payload, roundId);
	} catch (err) {
		console.error("[awards] loadMirroredBallots failed:", err);
		return new Map();
	}
}
