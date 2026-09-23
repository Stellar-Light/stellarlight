/**
 * i³ Awards — the DB mirror as a tally source, and the chain↔mirror diff.
 *
 * `award-ballots` outranks the chain for the tally — the first ballot counts
 * and only the mirror remembers it (see publish.ts). The chain still matters
 * as public, independently verifiable evidence, and as the fallback for an
 * address with no mirror row. It is also fragile: Stellar resets testnet 2–4×
 * a year, and a reset clears every ledger entry AND all history from Core and
 * Horizon — so at the first reset after a round every whitelisted account
 * reads unfunded and the chain tally is zero. The mirror outlives that.
 *
 * Two jobs live here, both pure so they are unit-tested offline:
 *
 *   mirrorAccountData — re-encode a mirrored ballot as the exact Horizon
 *     data map the chain carried, so tallyRound has ONE implementation and
 *     the mirror-backed tally cannot drift from the chain-backed one.
 *
 *   planReconcile — diff what the chain says against what the mirror holds,
 *     per address, into explicit classes. The mirror is best-effort by
 *     design (a DB hiccup must never fail a vote that already landed), so it
 *     can silently miss a ballot; the reconcile script backfills those gaps
 *     while the chain still exists. It never deletes: a mirror row the chain
 *     no longer shows is reported, not removed — after a reset that is every
 *     row, and those rows are the point.
 */

import {
	type BallotRound,
	type BallotSelections,
	dataKey,
	picksPerCategory,
	type VoterAccountData,
} from "./ballot";

export interface MirroredBallot {
	address: string;
	selections: BallotSelections;
}

/**
 * The mirror's `selections` is a JSON column: normally the validated
 * `{ category: [slug, ...] }` the relay recorded, but it is admin-editable
 * and one early description documented it as `{ category: slug }`. Accept
 * both, drop anything else — the DB is an input here, not a trusted shape.
 */
export function normalizeSelections(raw: unknown): BallotSelections {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
	const out: BallotSelections = {};
	for (const [category, value] of Object.entries(raw)) {
		const slugs = Array.isArray(value)
			? value.filter((v): v is string => typeof v === "string" && v !== "")
			: typeof value === "string" && value !== ""
				? [value]
				: [];
		if (slugs.length) out[category] = [...new Set(slugs)];
	}
	return out;
}

/** Same picks, ignoring order and empty categories. */
export function sameSelections(
	a: BallotSelections,
	b: BallotSelections,
): boolean {
	const norm = (s: BallotSelections) =>
		JSON.stringify(
			Object.entries(s)
				.filter(([, slugs]) => slugs.length > 0)
				.map(([c, slugs]): [string, string[]] => [
					c,
					[...new Set(slugs)].sort(),
				])
				.sort(([x], [y]) => x.localeCompare(y)),
		);
	return norm(a) === norm(b);
}

/** Re-encode a mirrored ballot as the Horizon data map the chain carried. */
export function mirrorAccountData(
	round: BallotRound,
	ballot: MirroredBallot,
): VoterAccountData {
	const data: Record<string, string> = {};
	const picks = picksPerCategory(round);
	const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
	for (const [category, slugs] of Object.entries(ballot.selections)) {
		if (picks === 1) {
			if (slugs[0]) data[dataKey(round.slug, category)] = b64(slugs[0]);
			continue;
		}
		slugs.slice(0, picks).forEach((slug, i) => {
			data[dataKey(round.slug, category, i + 1)] = b64(slug);
		});
	}
	return { address: ballot.address, data };
}

export type ReconcileAction =
	/** Record row confirmed and the relay holds its ballot, matching. */
	| { kind: "ok"; address: string; ballotId: string }
	/** Record row confirmed, relay holds the id, but the picks DIFFER. The relay
	 *  writes exactly what was signed, so one side was changed after the fact —
	 *  the record by an admin, or the relay by whoever holds its key; this lane
	 *  cannot tell which. Reported loudly, never overwritten. */
	| { kind: "differs"; address: string; ballotId: string }
	/** Record row confirmed, relay does not hold the id. After a reset that is
	 *  every row, and those rows are the point. Kept. */
	| { kind: "chain-empty"; address: string; ballotId: string }
	/** Record row RESERVED but never confirmed (txHash null): the relay was
	 *  asked and the confirmation was lost, or the write never happened. If the
	 *  relay holds the id it can be confirmed; if not, the reservation should
	 *  be released so the voter can vote. */
	| { kind: "unconfirmed"; address: string; ballotId: string; onRelay: boolean }
	/** A ballot on the relay that no record row names. Counted by the tally
	 *  as an anonymous voter; cannot be attributed from here. */
	| { kind: "orphan"; ballotId: string }
	/** A row from before the relay (no ballot id): its ballot sits on the
	 *  voter's own account, not the relay. The tally counts it through the
	 *  record; there is nothing on the relay to check it against. */
	| { kind: "legacy"; address: string };

export interface RecordRow {
	address: string;
	ballotId: string | null;
	selections: BallotSelections;
	confirmed: boolean;
}

/**
 * Diff the relay against the record. Reads only; the script decides what
 * to do about "unconfirmed", and nothing else is ever written back.
 */
export function planReconcile(
	rows: RecordRow[],
	relay: Map<string, BallotSelections>,
	/**
	 * Ballot ids the relay holds by RAW key. A ballot whose picks no longer
	 * decode (a nominee removed or renamed) is still ON the relay; judged by
	 * the decoded map alone it read as missing, and the lane would then have
	 * released its reservation and let the voter cast a second, counted ballot.
	 * Omitted = the decoded map's keys (tests, older callers).
	 */
	present?: ReadonlySet<string>,
): ReconcileAction[] {
	const actions: ReconcileAction[] = [];
	const seen = new Set<string>();
	const held = present ?? new Set(relay.keys());
	for (const r of rows) {
		if (!r.ballotId) {
			actions.push({ kind: "legacy", address: r.address });
			continue;
		}
		seen.add(r.ballotId);
		const decoded = relay.get(r.ballotId);
		const onRelay = held.has(r.ballotId);
		if (!r.confirmed) {
			actions.push({
				kind: "unconfirmed",
				address: r.address,
				ballotId: r.ballotId,
				onRelay,
			});
			continue;
		}
		if (!onRelay) {
			actions.push({
				kind: "chain-empty",
				address: r.address,
				ballotId: r.ballotId,
			});
			continue;
		}
		// present but undecodable is a disagreement, not an absence
		actions.push({
			kind: decoded && sameSelections(r.selections, decoded) ? "ok" : "differs",
			address: r.address,
			ballotId: r.ballotId,
		});
	}
	for (const ballotId of held) {
		if (!seen.has(ballotId)) actions.push({ kind: "orphan", ballotId });
	}
	return actions;
}

export interface ReconcileSummary {
	counts: Record<ReconcileAction["kind"], number>;
	/**
	 * The record holds confirmed ballots and the relay holds NONE of them.
	 * That is what the relay looks like after a testnet reset — there is
	 * nothing to reconcile FROM, and treating the rows as stale would be
	 * exactly wrong.
	 */
	resetSuspected: boolean;
}

export function summarizeReconcile(
	actions: ReconcileAction[],
): ReconcileSummary {
	const counts: ReconcileSummary["counts"] = {
		ok: 0,
		differs: 0,
		"chain-empty": 0,
		unconfirmed: 0,
		orphan: 0,
		legacy: 0,
	};
	for (const a of actions) counts[a.kind]++;
	const confirmedRows = counts.ok + counts.differs + counts["chain-empty"];
	return {
		counts,
		resetSuspected:
			confirmedRows > 0 &&
			counts.ok + counts.differs === 0 &&
			counts.orphan === 0,
	};
}
