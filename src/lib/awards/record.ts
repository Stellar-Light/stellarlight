/**
 * i³ Awards, the record: address → anonymous ballot, in Payload.
 *
 * Ballots live on the relay account under random ids; this record is the only
 * place an id meets an address, and it is what the tally counts (a voter's
 * FIRST ballot) and what survives a testnet reset. It is also the one-ballot
 * gate, which is why the relay path RESERVES a row before writing and
 * confirms it after, a gate checked now and written later is a race.
 *
 * Writers: reserveBallot / confirmBallot / releaseBallot (the relay path).
 * writeBallotRecord / recordBallot / readCurrentBallots are the pre-relay
 * upsert with no runtime caller left (writeBallotRecord stays pinned by its
 * tests). Readers return the FIRST ballot per address, never the latest, and
 * report an unconfirmed reservation as pending, not as a ballot.
 */
import type { Payload } from "payload";
import { getPayloadSafe } from "@/lib/payload-client";
import type { BallotSelections } from "./ballot";
import { normalizeSelections } from "./mirror";
import type { FirstBallotEntry } from "./publish";
import { fetchLatestBallotOp, fetchTestnetAccount } from "./stellar";

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
 * incoming ballot history[0], i.e. would silently promote a revote to "the
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
 * (a revote never erases what came before). `at` is when the vote landed, * the relay passes now; the reconcile script passes the ledger close time.
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

/**
 * Reserve, confirm, release: the relay's write in three steps.
 *
 * With ballots on a relay account the RECORD is the one-ballot gate, the
 * chain shows ballots by id, not by address, and a gate that is checked and
 * then written later is a race: two submissions read "no row" together and
 * both get relayed. So the row is created FIRST, empty of a tx hash, before
 * anything reaches Horizon. A second attempt now finds it. If the relay then
 * fails, the row is released; if it lands, the row is confirmed with the hash.
 * A row left reserved by a crash in between has txHash null and is not
 * counted (readFirstBallotRecord skips unconfirmed entries), the reconcile
 * lane reports it.
 */
export async function reserveBallot(params: {
	roundSlug: string;
	address: string;
	ballotId: string;
	selections: BallotSelections;
	/** The Pilot's signed authorization, kept as proof of authorship. */
	authorization: string;
}): Promise<{ ok: true; id: string | number } | { ok: false; reason: string }> {
	try {
		const payload = await getPayloadSafe();
		if (!payload) return { ok: false, reason: "database unavailable" };
		const roundId = await findRoundId(payload, params.roundSlug);
		if (!roundId) return { ok: false, reason: "round not found" };
		const existing = await payload.find({
			collection: "award-ballots",
			where: {
				and: [
					{ round: { equals: roundId } },
					{ address: { equals: params.address } },
				],
			},
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		if (existing.docs[0]) return { ok: false, reason: "already_voted" };
		// The find above is a courtesy; the compound unique index on
		// (round, address) is the gate, two reserves racing past the find both
		// reach create, and exactly one of them gets the duplicate-key error.
		const at = new Date().toISOString();
		const doc = await payload.create({
			collection: "award-ballots",
			data: {
				round: roundId,
				address: params.address,
				selections: params.selections,
				txHash: null,
				ballotId: params.ballotId,
				submissions: 1,
				firstSubmittedAt: at,
				lastSubmittedAt: at,
				history: [
					{
						txHash: null,
						selections: params.selections,
						at,
						ballotId: params.ballotId,
						authorization: params.authorization,
					},
				],
			},
			overrideAccess: true,
		});
		return { ok: true, id: doc.id };
	} catch (err) {
		if (isDuplicateKey(err)) return { ok: false, reason: "already_voted" };
		console.error("[awards] reserveBallot failed:", err);
		return { ok: false, reason: "database error" };
	}
}

/** Mongo's E11000, or the ValidationError Payload's adapter turns it into. */
function isDuplicateKey(err: unknown): boolean {
	const e = err as {
		code?: unknown;
		message?: unknown;
		data?: unknown;
	} | null;
	if (e?.code === 11000) return true;
	const text = `${String(e?.message ?? "")} ${JSON.stringify(e?.data ?? "")}`;
	return /E11000|duplicate key|must be unique/i.test(text);
}

/** The relay landed: stamp the hash on the row and its trail entry. */
export async function confirmBallot(
	id: string | number,
	txHash: string,
): Promise<boolean> {
	try {
		const payload = await getPayloadSafe();
		if (!payload) return false;
		const row = (await payload.findByID({
			collection: "award-ballots",
			id,
			depth: 0,
			overrideAccess: true,
		})) as { history?: Array<Record<string, unknown>> | null };
		const history = (row.history ?? []).map((e, i, all) =>
			i === all.length - 1 ? { ...e, txHash } : e,
		);
		await payload.update({
			collection: "award-ballots",
			id,
			data: { txHash, history },
			overrideAccess: true,
		});
		return true;
	} catch (err) {
		// The ballot IS on chain. Reconcile finds a reserved row whose ballot id
		// the relay holds and confirms it; the vote is not lost, only late.
		console.error("[awards] confirmBallot failed (ballot is on chain):", err);
		return false;
	}
}

/** The relay refused: give the address its turn back. */
export async function releaseBallot(id: string | number): Promise<boolean> {
	try {
		const payload = await getPayloadSafe();
		if (!payload) return false;
		await payload.delete({
			collection: "award-ballots",
			id,
			overrideAccess: true,
		});
		return true;
	} catch (err) {
		console.error("[awards] releaseBallot failed:", err);
		return false;
	}
}

/** A reserved row the relay has not confirmed: not a ballot, not nothing. */
export interface PendingReservation {
	id: string | number;
	ballotId: string | null;
	reservedAt: string | null;
}

/** Past this the relay transaction behind a reservation (120s time bound)
 *  can no longer land, so an unconfirmed row is settled, not waited on. */
export const PENDING_STALE_MS = 3 * 60_000;

/**
 * Settle a reservation the relay never confirmed, against the relay itself.
 * Younger than PENDING_STALE_MS it may still be in flight and is left alone.
 * Older: if the relay holds the ballot id, the write landed and only the
 * confirmation was lost, confirm it (with the op's hash, or a `relay:<id>`
 * marker when Horizon's reachable history no longer has it); if the relay
 * does not hold it, the write never happened and never can, release the
 * row so the voter's next attempt goes through. The ballot id joins the two
 * sides, so nothing here can count a vote twice.
 */
export async function settlePendingBallot(
	roundSlug: string,
	pending: PendingReservation,
	relayPub: string | null,
): Promise<"in-flight" | "confirmed" | "released" | "unknown"> {
	const age = pending.reservedAt
		? Date.now() - Date.parse(pending.reservedAt)
		: Number.NaN;
	if (Number.isNaN(age) || age < PENDING_STALE_MS) return "in-flight";
	if (!relayPub || !pending.ballotId) return "unknown";
	const probe = await fetchTestnetAccount(relayPub);
	if (probe.funded === null) return "unknown";
	const prefix = `i3.${roundSlug}.${pending.ballotId}.`;
	const onRelay =
		probe.funded === true &&
		Object.keys(probe.account.data).some((k) => k.startsWith(prefix));
	if (!onRelay) {
		return (await releaseBallot(pending.id)) ? "released" : "unknown";
	}
	const op = await fetchLatestBallotOp(relayPub, prefix);
	const ok = await confirmBallot(
		pending.id,
		op?.txHash ?? `relay:${pending.ballotId}`,
	);
	return ok ? "confirmed" : "unknown";
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
		// The vote is already on-chain, recording is a mirror, so a failure here
		// is logged and swallowed, never surfaced to the voter.
		console.error(
			"[awards] recordBallot failed (vote is still on-chain):",
			err,
		);
	}
}

/**
 * The FIRST ballot this row recorded, the only one that counts.
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
 * TRINARY, true / false / **null = could not check**. Null is not "no": the
 * vote gate refuses on null rather than let a second ballot be signed blind,
 * because a second ballot would land on chain, overwrite the first on the
 * voter's account, and then not count. Better a 503 they can retry than a
 * signature that silently does nothing.
 */
export async function readFirstBallotFor(
	roundSlug: string,
	address: string,
): Promise<{
	voted: boolean;
	selections: BallotSelections;
	pending: PendingReservation | null;
	/** The first ballot's relay id and transaction, for the voter's receipt. */
	ballotId: string | null;
	txHash: string | null;
} | null> {
	try {
		const payload = await getPayloadSafe();
		if (!payload) return null;
		const roundId = await findRoundId(payload, roundSlug);
		// A slug we cannot resolve is NOT "this voter has no ballot", it is a
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
		if (!row)
			return {
				voted: false,
				selections: {},
				pending: null,
				ballotId: null,
				txHash: null,
			};
		const trail = (row.history ?? []) as Array<{
			txHash?: string | null;
			ballotId?: string | null;
		} | null>;
		if (!(trail[0]?.txHash ?? row.txHash)) {
			// reserved, never confirmed: nothing is known to be on chain yet
			return {
				voted: false,
				selections: {},
				ballotId: null,
				txHash: null,
				pending: {
					id: row.id as string | number,
					ballotId: ((row as { ballotId?: string | null }).ballotId ?? null) as
						| string
						| null,
					reservedAt: (row.firstSubmittedAt ?? null) as string | null,
				},
			};
		}
		const selections = firstBallotSelections(row);
		return {
			voted: Object.values(selections).some((s) => s.length > 0),
			selections,
			pending: null,
			ballotId: (trail[0]?.ballotId ??
				(row as { ballotId?: string | null }).ballotId ??
				null) as string | null,
			txHash: (trail[0]?.txHash ?? row.txHash ?? null) as string | null,
		};
	} catch (err) {
		console.error("[awards] readFirstBallotFor failed:", err);
		return null;
	}
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
			// the earliest row, the real first ballot, is the one that lands.
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
 * include everything the digest commits to, changing any of it later must
 * change the hash.
 */
export async function readFirstBallotRecord(
	payload: Payload,
	roundId: string,
): Promise<FirstBallotEntry[]> {
	const rows = await allBallotRows(payload, roundId);
	const out: FirstBallotEntry[] = [];
	// rows arrive oldest-first; one entry per address, the earliest, so the
	// digest and the tally read the same list
	const seen = new Set<string>();
	for (const row of rows) {
		const address = String(row.address ?? "")
			.trim()
			.toUpperCase();
		if (!address || seen.has(address)) continue;
		const trail = (row.history ?? []) as Array<{
			txHash?: string | null;
			selections?: unknown;
			at?: string | null;
		} | null>;
		// A reservation the relay never confirmed (txHash null) is not a ballot:
		// nothing landed on chain for it. Skipped here, reported by reconcile.
		const first = trail.find(
			(e) =>
				!!e?.txHash &&
				Object.values(normalizeSelections(e?.selections)).some(
					(s) => s.length > 0,
				),
		);
		if (!first) continue;
		seen.add(address);
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
 * Every record row for a round as the RECONCILE lane sees it: the first
 * ballot's picks and id, whether the relay ever confirmed it, and when it
 * was reserved, so an abandoned reservation can be told from one in flight.
 */
export async function readRecordRows(
	payload: Payload,
	roundId: string,
): Promise<
	Array<{
		id: string | number;
		address: string;
		ballotId: string | null;
		selections: BallotSelections;
		confirmed: boolean;
		reservedAt: string | null;
		/** The first submission carries the Pilot's signed authorization. */
		authorized: boolean;
	}>
> {
	const rows = await allBallotRows(payload, roundId);
	const out: Awaited<ReturnType<typeof readRecordRows>> = [];
	for (const row of rows) {
		const address = String(row.address ?? "")
			.trim()
			.toUpperCase();
		if (!address) continue;
		const trail = (row.history ?? []) as Array<{
			txHash?: string | null;
			selections?: unknown;
			ballotId?: string | null;
			authorization?: string | null;
		} | null>;
		const first = trail[0] ?? null;
		out.push({
			id: row.id as string | number,
			address,
			ballotId: (first?.ballotId ??
				(row as { ballotId?: string | null }).ballotId ??
				null) as string | null,
			selections: normalizeSelections(first?.selections ?? row.selections),
			confirmed: !!(first?.txHash ?? row.txHash),
			reservedAt: (row.firstSubmittedAt ?? null) as string | null,
			authorized:
				typeof first?.authorization === "string" &&
				first.authorization.length > 0,
		});
	}
	return out;
}

/**
 * Every mirrored ballot for a round: address → the address's CURRENT ballot.
 *
 * The other reader for a different question. The TALLY wants the first ballot
 * (readFirstBallotRecord); the RECONCILE lane wants the current one, because its
 * job is "does the mirror reflect what the chain says right now". Handing it
 * first-ballots would make every out-of-band revote look like an unfixed
 * correction on every single run, a daily phantom diff, and a duplicate
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
