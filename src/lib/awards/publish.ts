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

import { type RoundTally, tallyRound } from "./ballot";
import { mirrorAccountData } from "./mirror";
import { loadMirroredBallots } from "./record";
import type { LoadedRound } from "./round";
import { fetchTestnetAccounts } from "./stellar";

export type TallySource = "chain" | "mirror";

const HORIZON_CONCURRENCY = 10;

/**
 * Chain first; when the chain shows NO votes for anyone (testnet reset, or
 * Horizon down), the award-ballots mirror. The whitelist stays the
 * denominator either way.
 */
export async function liveTally(
	loaded: LoadedRound,
): Promise<{ tally: RoundTally; source: TallySource }> {
	const addresses = [...loaded.whitelist];
	const probes = await fetchTestnetAccounts(addresses, HORIZON_CONCURRENCY);
	let tally = tallyRound(
		loaded.round,
		loaded.nominees,
		probes.map(({ address, result }) => ({
			address,
			data: result.funded === true ? result.account.data : null,
		})),
	);
	let source: TallySource = "chain";
	if (tally.turnout.voted === 0) {
		const mirror = await loadMirroredBallots(loaded.round.slug);
		if (mirror.size > 0) {
			const fromMirror = tallyRound(
				loaded.round,
				loaded.nominees,
				addresses.map((address) => {
					const selections = mirror.get(address);
					return selections
						? mirrorAccountData(loaded.round, { address, selections })
						: { address, data: null };
				}),
			);
			if (fromMirror.turnout.voted > 0) {
				tally = fromMirror;
				source = "mirror";
			}
		}
	}
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
			"Aggregate only. Ballots are manageData entries on Stellar TESTNET; the award-ballots mirror is the durable record across testnet resets. This file's git commit is anchored on Tansu (testnet) — see /api/awards/anchor?round=" +
			round.slug,
	};
}
