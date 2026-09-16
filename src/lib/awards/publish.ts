/**
 * i³ Awards — the live tally (chain, else mirror) and the published results
 * document.
 *
 * ONE implementation of "what does this round's tally say right now", used by
 * /api/awards/results and by the publish lane, so the file we commit to the
 * repo and anchor on Tansu can never disagree with what the page shows.
 *
 * The document is AGGREGATE ONLY — per-category counts and turnout, never an
 * address, never a tx hash (a tx resolves to a voter account on the explorer).
 */

import {
	type BallotNominee,
	type BallotRound,
	type BallotSelections,
	decodeAccountVotes,
	type RoundTally,
	tallyRound,
	type VoterAccountData,
} from "./ballot";
import { mirrorAccountData } from "./mirror";
import { loadMirroredBallots } from "./record";
import type { LoadedRound } from "./round";
import { fetchTestnetAccounts } from "./stellar";

export type TallySource = "chain" | "mirror" | "chain+mirror";

const HORIZON_CONCURRENCY = 10;

const hasVote = (
	round: BallotRound,
	nominees: BallotNominee[],
	data: Record<string, string>,
) =>
	Object.values(decodeAccountVotes(round, nominees, data)).some(
		(s) => s.length > 0,
	);

/**
 * Pure. Per address: the MIRROR wins when it holds a ballot, because it holds
 * the voter's FIRST one — and the first ballot is the only one that counts.
 *
 * This is deliberately the opposite of what it used to be. A manageData
 * overwrite destroys the value it replaces, so the chain can only ever show
 * the LATEST ballot; reading it first would count a revote. The chain is now
 * the fallback, for an address that has a vote on chain and no mirror row at
 * all — someone who wrote their own manageData without going through the
 * relay. A testnet reset or a Horizon outage forgets accounts; the mirror does
 * not. Never both, so nobody is counted twice.
 */
export function mergeAccounts(
	round: BallotRound,
	nominees: BallotNominee[],
	addresses: string[],
	chain: Map<string, Record<string, string> | null>,
	mirror: Map<string, BallotSelections>,
): { accounts: VoterAccountData[]; chainVoters: number; mirrorVoters: number } {
	let chainVoters = 0;
	let mirrorVoters = 0;
	const accounts = addresses.map((address): VoterAccountData => {
		const selections = mirror.get(address);
		if (selections && Object.values(selections).some((s) => s.length > 0)) {
			mirrorVoters++;
			return mirrorAccountData(round, { address, selections });
		}
		const data = chain.get(address) ?? null;
		if (data && hasVote(round, nominees, data)) {
			chainVoters++;
			return { address, data };
		}
		return { address, data: null };
	});
	return { accounts, chainVoters, mirrorVoters };
}

/** The whitelist stays the denominator either way. */
export async function liveTally(
	loaded: LoadedRound,
): Promise<{ tally: RoundTally; source: TallySource }> {
	const addresses = [...loaded.whitelist];
	const [probes, mirror] = await Promise.all([
		fetchTestnetAccounts(addresses, HORIZON_CONCURRENCY),
		loadMirroredBallots(loaded.round.slug),
	]);
	const chain = new Map(
		probes.map(({ address, result }) => [
			address,
			result.funded === true ? result.account.data : null,
		]),
	);
	const { accounts, chainVoters, mirrorVoters } = mergeAccounts(
		loaded.round,
		loaded.nominees,
		addresses,
		chain,
		mirror,
	);
	const tally = tallyRound(loaded.round, loaded.nominees, accounts);
	const source: TallySource =
		chainVoters && mirrorVoters
			? "chain+mirror"
			: mirrorVoters
				? "mirror"
				: "chain";
	return { tally, source };
}

export interface ResultsDocument {
	round: string;
	title: string;
	status: string;
	picksPerCategory: number;
	opensAt: string | null;
	closesAt: string | null;
	source: TallySource;
	turnout: { voted: number; whitelisted: number };
	categories: Array<{
		key: string;
		name: string;
		totalVotes: number;
		results: Array<{ slug: string; name: string; votes: number }>;
	}>;
	generatedAt: string;
	note: string;
}

/** Pure. The file that gets committed to awards/results/<round>.json. */
export function resultsDocument(
	loaded: LoadedRound,
	tally: RoundTally,
	source: TallySource,
	now: Date = new Date(),
): ResultsDocument {
	const { round } = loaded;
	return {
		round: round.slug,
		title: round.title,
		status: String(round.status),
		picksPerCategory: round.picksPerCategory ?? 1,
		opensAt: round.opensAt ?? null,
		closesAt: round.closesAt ?? null,
		source,
		turnout: { ...tally.turnout },
		categories: tally.categories.map((c) => ({
			key: c.key,
			name: c.name,
			totalVotes: c.totalVotes,
			results: c.results.map((r) => ({
				slug: r.slug,
				name: r.name,
				votes: r.votes,
			})),
		})),
		generatedAt: now.toISOString(),
		note:
			"Aggregate only. One ballot per voter: the FIRST one cast counts, and a later ballot does not replace it. Ballots are manageData entries on Stellar TESTNET; because an overwrite destroys the value it replaces, the award-ballots mirror — not the chain — is what preserves the first ballot, and it is also the durable record across testnet resets. This file's git commit is anchored on Tansu (testnet) — see /api/awards/anchor?round=" +
			round.slug,
	};
}
