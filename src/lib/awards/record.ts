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
import type { FirstBallotEntry } from "./publish";

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
 * The existing trail, seeded if it is empty.
 *
 * A row written before the history field existed keeps its first ballot in
 * `selections` and NOWHERE else. Appending to an empty trail would make the
 * incoming ballot history[0] — i.e. would silently promote a revote to "the
 * first ballot" and change who the round counts. So an empty trail is seeded
 * from the row's own current state first.
 */
function priorTrail(prior: {
	selections?: BallotSelections | null;
	txHash?: string | null;
	firstSubmittedAt?: string | null;
	history?: Array<{
		txHash?: string | null;
		selections?: BallotSelections | null;
		at?: string | null;
	}> | null;
}): Array<{
	txHash?: string | null;
	selections?: BallotSelections | null;
	at?: string | null;
}> {
	if (prior.history?.length) return prior.history;
	if (!prior.selections) return [];
	return [
		{
			txHash: prior.txHash ?? null,
			selections: prior.selections,
			at: prior.firstSubmittedAt ?? null,
		},
	];
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
		/** The id the ballot was written under on the relay account. */
		ballotId?: string | null;
	},
): Promise<"created" | "updated"> {
	const { roundId, address, selections, txHash, at, ballotId = null } = params;
	const existing = await payload.find({
		collection: "award-ballots",
		where: {
			and: [{ round: { equals: roundId } }, { address: { equals: address } }],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});

	type HistoryEntry = {
		txHash?: string | null;
		selections?: BallotSelections | null;
		at?: string | null;
	};
	const prior = existing.docs[0] as
		| {
				id: string | number;
				submissions?: number | null;
				selections?: BallotSelections | null;
				txHash?: string | null;
				firstSubmittedAt?: string | null;
				history?: HistoryEntry[] | null;
		  }
		| undefined;

	const entry = { txHash, selections, at, ballotId };

	if (prior) {
		await payload.update({
			collection: "award-ballots",
			id: prior.id,
			data: {
				selections,
				txHash,
				...(ballotId ? { ballotId } : {}),
				submissions: (prior.submissions ?? 1) + 1,
				lastSubmittedAt: at,
				history: [...priorTrail(prior), entry],
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
			ballotId,
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
	ballotId?: string | null;
}): Promise<void> {
	const { roundSlug, address, selections, txHash, ballotId = null } = params;
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
			ballotId,
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

/**
 * The FIRST ballot this row recorded — the only one that counts.
 *
 * `history` is append-only and oldest-first, so history[0] is it. Empty
 * entries are skipped so a malformed one can't zero a voter out, and a row
 * with no usable history (written before the trail existed, or created by the
 * reconcile lane straight from chain) falls back to `selections`.
 *
 * This is the whole reason the mirror outranks the chain now: a manageData
 * overwrite destroys the value it replaces, so the chain can only ever show
 * the LATEST ballot. Nothing on chain remembers the first one.
 */
export function firstBallotSelections(row: {
	selections?: unknown;
	history?: Array<{ selections?: unknown } | null> | null;
}): BallotSelections {
	for (const entry of row.history ?? []) {
		const picks = normalizeSelections(entry?.selections);
		if (Object.values(picks).some((s) => s.length > 0)) return picks;
	}
	return normalizeSelections(row.selections);
}

/**
 * Has this address already cast a ballot we hold, for this round?
 *
 * TRINARY — true / false / **null = could not check**. Null is not "no": the
 * vote gate refuses on null rather than let a second ballot be signed blind,
 * because a second ballot would land on chain, overwrite the first on the
 * voter's account, and then not count. Better a 503 they can retry than a
 * signature that silently does nothing.
 */
export async function readFirstBallotFor(
	roundSlug: string,
	address: string,
): Promise<{ voted: boolean; selections: BallotSelections } | null> {
	try {
		const payload = await getPayloadSafe();
		if (!payload) return null;
		const roundId = await findRoundId(payload, roundSlug);
		// A slug we cannot resolve is NOT "this voter has no ballot" — it is a
		// read we could not perform, and the gate has to treat it that way.
		if (!roundId) return null;
		const rows = await payload.find({
			collection: "award-ballots",
			where: {
				and: [{ round: { equals: roundId } }, { address: { equals: address } }],
			},
			// oldest first: if a race ever produced two rows for one address,
			// the earliest is the one whose history[0] really is first. The
			// default sort is newest-first, which would pick the wrong one.
			sort: "createdAt",
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		const row = rows.docs[0];
		if (!row) return { voted: false, selections: {} };
		const selections = firstBallotSelections(row);
		return {
			voted: Object.values(selections).some((s) => s.length > 0),
			selections,
		};
	} catch (err) {
		console.error("[awards] readFirstBallotFor failed:", err);
		return null;
	}
}

export async function hasMirroredBallot(
	roundSlug: string,
	address: string,
): Promise<boolean | null> {
	const found = await readFirstBallotFor(roundSlug, address);
	return found === null ? null : found.voted;
}

/**
 * Every ballot row for a round, paged.
 *
 * A fixed `limit` truncates in silence, and these rows ARE the tally under
 * one-ballot-per-voter: a dropped row is a voter who silently stops being
 * counted and starts reading as "hasn't voted". Paging costs one extra query
 * per 200 rows and removes the cliff entirely.
 */
async function allBallotRows(
	payload: Payload,
	roundId: string,
): Promise<Record<string, unknown>[]> {
	const out: Record<string, unknown>[] = [];
	for (let page = 1; ; page++) {
		const res = await payload.find({
			collection: "award-ballots",
			where: { round: { equals: roundId } },
			// Oldest first. Readers collapse rows by address with last-write-wins
			// into a Map, so without an order a duplicate row (there is no unique
			// index on round+address) could win by insertion luck. Ascending means
			// the earliest row — the real first ballot — is the one that lands.
			sort: "createdAt",
			limit: 200,
			page,
			depth: 0,
			overrideAccess: true,
		});
		out.push(...(res.docs as unknown as Record<string, unknown>[]));
		if (!res.hasNextPage || res.docs.length === 0) return out;
	}
}

/**
 * The round's first-ballot record: one entry per address, carrying the picks
 * that count plus the tx hash and timestamp of the submission they came from.
 *
 * This is the input to the published digest (see ballotsDigest), so it has to
 * include everything the digest commits to — changing any of it later must
 * change the hash.
 */
export async function readFirstBallotRecord(
	payload: Payload,
	roundId: string,
): Promise<FirstBallotEntry[]> {
	const rows = await allBallotRows(payload, roundId);
	const out: FirstBallotEntry[] = [];
	for (const row of rows) {
		const address = String(row.address ?? "")
			.trim()
			.toUpperCase();
		if (!address) continue;
		const trail = (row.history ?? []) as Array<{
			txHash?: string | null;
			selections?: unknown;
			at?: string | null;
		} | null>;
		const first = trail.find((e) =>
			Object.values(normalizeSelections(e?.selections)).some(
				(s) => s.length > 0,
			),
		);
		out.push({
			address,
			selections: firstBallotSelections(row),
			txHash: (first?.txHash ?? row.txHash ?? null) as string | null,
			at: (first?.at ?? row.firstSubmittedAt ?? null) as string | null,
			ballotId: ((first as { ballotId?: string | null } | undefined)
				?.ballotId ??
				(row as { ballotId?: string | null }).ballotId ??
				null) as string | null,
		});
	}
	return out;
}

/**
 * Safe wrapper: **null means the record could not be read**, which is not the
 * same as "there are no ballots". An empty array is a claim that the round has
 * none; publishing a digest computed over a failed read would assert exactly
 * that, in a file we then anchor on chain.
 */
export async function loadFirstBallotRecord(
	roundSlug: string,
): Promise<FirstBallotEntry[] | null> {
	try {
		const payload = await getPayloadSafe();
		if (!payload) return null;
		const roundId = await findRoundId(payload, roundSlug);
		if (!roundId) return null;
		return await readFirstBallotRecord(payload, roundId);
	} catch (err) {
		console.error("[awards] loadFirstBallotRecord failed:", err);
		return null;
	}
}

/**
 * Every mirrored ballot for a round: address → the address's CURRENT ballot.
 *
 * The other reader for a different question. The TALLY wants the first ballot
 * (readFirstBallotRecord); the RECONCILE lane wants the current one, because its
 * job is "does the mirror reflect what the chain says right now". Handing it
 * first-ballots would make every out-of-band revote look like an unfixed
 * correction on every single run — a daily phantom diff, and a duplicate
 * history entry appended each time.
 */
export async function readCurrentBallots(
	payload: Payload,
	roundId: string,
): Promise<Map<string, BallotSelections>> {
	const rows = await allBallotRows(payload, roundId);
	const out = new Map<string, BallotSelections>();
	for (const row of rows) {
		const address = String(row.address ?? "")
			.trim()
			.toUpperCase();
		if (!address) continue;
		out.set(address, normalizeSelections(row.selections));
	}
	return out;
}
