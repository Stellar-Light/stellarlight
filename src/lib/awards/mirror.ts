/**
 * i³ Awards — the DB mirror as a tally source, and the chain↔mirror diff.
 *
 * The chain is the source of truth while it exists. Stellar resets testnet
 * 2–4× a year, and a reset clears every ledger entry AND all history from
 * Core and Horizon — so at the first reset after a round, every whitelisted
 * account reads unfunded and the chain tally is zero. `award-ballots` (the
 * mirror recordBallot writes after each successful submit) is the only
 * record that outlives the reset.
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
	type BallotNominee,
	type BallotRound,
	type BallotSelections,
	dataKey,
	decodeAccountVotes,
	picksPerCategory,
	type VoterAccountData,
} from "./ballot";
import type { FetchAccountResult } from "./stellar";

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

export interface ChainProbe {
	address: string;
	result: FetchAccountResult;
}

export type ReconcileAction =
	/** On-chain ballot with no mirror row — the gap this exists to close. */
	| { kind: "create"; address: string; selections: BallotSelections }
	/** Mirror row disagrees with the chain (a revote that failed to mirror). */
	| {
			kind: "update";
			address: string;
			selections: BallotSelections;
			prior: BallotSelections;
	  }
	| { kind: "ok"; address: string }
	/** Funded, whitelisted, never voted. */
	| { kind: "no-vote"; address: string }
	/** Mirror has a ballot the chain no longer shows. Reported, never deleted. */
	| { kind: "chain-empty"; address: string }
	/** Horizon 404 and nothing mirrored — never on-network. */
	| { kind: "unfunded"; address: string }
	/** Horizon failed — this address could not be judged. */
	| { kind: "unreachable"; address: string; error: string };

export function planReconcile(
	round: BallotRound,
	nominees: BallotNominee[],
	probes: ChainProbe[],
	mirror: Map<string, BallotSelections>,
): ReconcileAction[] {
	return probes.map(({ address, result }): ReconcileAction => {
		const mirrored = mirror.get(address);
		if (result.funded === null) {
			return { kind: "unreachable", address, error: result.error };
		}
		const onChain =
			result.funded === true
				? decodeAccountVotes(round, nominees, result.account.data)
				: {};
		const hasVotes = Object.values(onChain).some((s) => s.length > 0);
		if (!hasVotes) {
			if (mirrored) return { kind: "chain-empty", address };
			return result.funded
				? { kind: "no-vote", address }
				: { kind: "unfunded", address };
		}
		if (!mirrored) return { kind: "create", address, selections: onChain };
		if (sameSelections(mirrored, onChain)) return { kind: "ok", address };
		return { kind: "update", address, selections: onChain, prior: mirrored };
	});
}

export interface ReconcileSummary {
	counts: Record<ReconcileAction["kind"], number>;
	/** Addresses the chain shows a ballot for (create + update + ok). */
	chainVoters: number;
	/**
	 * The mirror holds ballots, Horizon answered for at least one account, and
	 * NOT ONE of them carries a vote. That is what the chain looks like after a
	 * testnet reset — there is nothing left to reconcile FROM, and treating the
	 * mirror rows as stale would be exactly wrong.
	 */
	resetSuspected: boolean;
}

export function summarizeReconcile(
	actions: ReconcileAction[],
	mirrorSize: number,
): ReconcileSummary {
	const counts: ReconcileSummary["counts"] = {
		create: 0,
		update: 0,
		ok: 0,
		"no-vote": 0,
		"chain-empty": 0,
		unfunded: 0,
		unreachable: 0,
	};
	for (const a of actions) counts[a.kind]++;
	const chainVoters = counts.create + counts.update + counts.ok;
	const reachable = actions.length - counts.unreachable;
	return {
		counts,
		chainVoters,
		resetSuspected: mirrorSize > 0 && chainVoters === 0 && reachable > 0,
	};
}
