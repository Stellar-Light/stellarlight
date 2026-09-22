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

import { createHash } from "node:crypto";
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
import { loadFirstBallotRecord } from "./record";
import type { LoadedRound } from "./round";
import { fetchLatestBallotOp, fetchTestnetAccounts } from "./stellar";

export type TallySource = "chain" | "mirror" | "chain+mirror";

/** One voter's first ballot, as the record holds it. Never published. */
export interface FirstBallotEntry {
	address: string;
	selections: BallotSelections;
	txHash: string | null;
	at: string | null;
}

const DIGEST_HEADER = "i3-first-ballots-v1";

/**
 * A fingerprint of the first-ballot record — the thing the round is decided
 * on, and the thing only WE hold.
 *
 * "The first ballot counts" cannot be checked against the chain: a manageData
 * overwrite destroys the value it replaces, so nothing on chain witnesses a
 * voter's first ballot. That makes the mirror a trusted component. This is how
 * it becomes a CHECKED one instead: the digest goes in the results file, whose
 * git commit is anchored on Tansu, so the record is pinned at publish time. We
 * cannot later change who voted for what — for anyone holding the underlying
 * record, a single altered pick, tx hash or timestamp changes this hash, and
 * the hash is already on chain.
 *
 * It is a hash and nothing else, so publishing it discloses no address→choice:
 * you can only verify it if you were already given the record.
 *
 * Recipe (v1), so an auditor can recompute it without this code:
 *   - one line per voter, sorted by address (uppercase)
 *   - line = address | categories | txHash | at
 *   - categories = each `key=slug,slug` with slugs sorted, keys sorted, joined ";"
 *   - null txHash/at serialize as the empty string
 *   - document = "i3-first-ballots-v1" + "\n" + lines joined by "\n"
 *   - digest = sha256(document) as lowercase hex
 */
export function ballotsDigest(entries: FirstBallotEntry[]): string {
	const lines = entries
		.map((e) => {
			const cats = Object.entries(e.selections)
				.filter(([, slugs]) => slugs.length > 0)
				.map(([key, slugs]): [string, string] => [
					key,
					[...new Set(slugs)].sort().join(","),
				])
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				.map(([key, slugs]) => `${key}=${slugs}`)
				.join(";");
			const address = e.address.trim().toUpperCase();
			return `${address}|${cats}|${e.txHash ?? ""}|${e.at ?? ""}`;
		})
		.sort();
	return createHash("sha256")
		.update(`${DIGEST_HEADER}\n${lines.join("\n")}`)
		.digest("hex");
}

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

/**
 * The whitelist stays the denominator either way.
 *
 * `digest` is null when the first-ballot record could not be READ — never a
 * digest over an empty read, which would publish "this round has no ballots"
 * as a fact. When that happens the mirror is also empty here, so the tally
 * falls back to the chain and `source` says "chain": the two together are the
 * signal that the counted result is latest-ballot, not first-ballot.
 */
export async function liveTally(loaded: LoadedRound): Promise<{
	tally: RoundTally;
	source: TallySource;
	digest: string | null;
	/** Chain-only ballots refused because they post-date the round's close. */
	afterClose: number;
}> {
	const addresses = [...loaded.whitelist];
	const [probes, record] = await Promise.all([
		fetchTestnetAccounts(addresses, HORIZON_CONCURRENCY),
		loadFirstBallotRecord(loaded.round.slug),
	]);
	const mirror = new Map(
		(record ?? []).map((e) => [e.address, e.selections] as const),
	);

	const chain = new Map(
		probes.map(({ address, result }) => [
			address,
			result.funded === true ? result.account.data : null,
		]),
	);
	// A ballot the RELAY accepted was checked against the round's close time
	// before it was built. A ballot written straight to Horizon was not — the
	// account is the voter's own, so nothing stops a manageData op landing the
	// day after voting shut. Those reach the tally through the chain fallback
	// (an address with no mirror row), and until now they counted.
	//
	// Only chain-fallback addresses need dating, which is normally none of
	// them: everyone who used the page has a mirror row, whose timestamp came
	// from a submission the relay had already gated. So this costs one Horizon
	// call per out-of-band voter, not per voter.
	let afterClose = 0;
	if (loaded.round.closesAt) {
		const prefix = `i3.${loaded.round.slug}.`;
		const chainOnly = addresses.filter((a) => {
			if (mirror.has(a)) return false;
			const data = chain.get(a);
			return !!data && hasVote(loaded.round, loaded.nominees, data);
		});
		const dated = await Promise.all(
			chainOnly.map(async (address) => ({
				address,
				op: await fetchLatestBallotOp(address, prefix),
			})),
		);
		for (const { address, op } of dated) {
			if (!ballotCountsAtTime(op?.at, loaded.round.closesAt)) {
				chain.set(address, null);
				afterClose++;
			}
		}
	}

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
	return {
		tally,
		source,
		digest: record ? ballotsDigest(record) : null,
		afterClose,
	};
}

/**
 * Should a ballot dated `opAt` count in a round closing at `closesAt`?
 *
 * Pure, because the interesting case is the one that is easy to get backwards:
 * a ballot we cannot DATE does not count. This is only ever asked about
 * out-of-band ballots — ones written straight to Horizon, which no close-time
 * check has ever seen — so "we could not read when it happened" is not grounds
 * to admit it. A round with no closesAt has no deadline to miss.
 */
export function ballotCountsAtTime(
	opAt: string | null | undefined,
	closesAt: string | null | undefined,
): boolean {
	const close = closesAt ? Date.parse(closesAt) : Number.NaN;
	if (Number.isNaN(close)) return true;
	const at = opAt ? Date.parse(opAt) : Number.NaN;
	if (Number.isNaN(at)) return false;
	return at <= close;
}

const MANIFEST_HEADER = "i3-round-manifest-v1";

/**
 * A fingerprint of the ELECTORATE AND THE BALLOT, as they stood.
 *
 * The results digest proves nobody edited the ballots after the fact. It says
 * nothing about the round they were cast in — a nominee quietly added
 * mid-round, an address slipped onto the whitelist, a close date moved. Those
 * are exactly the things a losing party would contest, and until now none of
 * them was checkable.
 *
 * Commit this at OPEN and the round is fixed in public before anyone votes;
 * recompute it later and any change to the roster, the categories, the pick
 * count or the dates gives a different hash than the one already on chain.
 *
 * It is a hash, so it publishes nothing: the whitelist goes in (that is the
 * point — the electorate is what is being fixed) but only as an input.
 *
 * Recipe (v1):
 *   round   = slug
 *   cats    = each `key:name`, sorted by key, joined ";"
 *   picks   = picksPerCategory
 *   dates   = `opensAt|closesAt`, null as empty string
 *   noms    = each `category/slug`, sorted, joined ";"
 *   voters  = uppercased addresses, sorted, joined ";"
 *   document = header + "\n" + those six, each on its own line, in that order
 *   digest   = sha256(document) as lowercase hex
 */
export function roundManifestDigest(loaded: LoadedRound): string {
	const { round, nominees, whitelist } = loaded;
	const cats = [...round.categories]
		.map((c) => `${c.key}:${c.name}`)
		.sort()
		.join(";");
	const noms = nominees
		.map((n) => `${n.category}/${n.slug}`)
		.sort()
		.join(";");
	const voters = [...whitelist]
		.map((a) => a.trim().toUpperCase())
		.sort()
		.join(";");
	const doc = [
		MANIFEST_HEADER,
		round.slug,
		cats,
		String(round.picksPerCategory ?? 1),
		`${round.opensAt ?? ""}|${round.closesAt ?? ""}`,
		noms,
		voters,
	].join("\n");
	return createHash("sha256").update(doc).digest("hex");
}

/** What the manifest covers, for a human reading a dry-run. Counts only. */
export function roundManifestSummary(loaded: LoadedRound): string {
	return [
		`${loaded.round.categories.length} categories`,
		`${loaded.round.picksPerCategory ?? 1} pick(s) each`,
		`${loaded.nominees.length} nominees`,
		`${loaded.whitelist.size} whitelisted voters`,
		`closes ${loaded.round.closesAt ?? "—"}`,
	].join(" · ");
}

export interface ResultsDocument {
	round: string;
	title: string;
	status: string;
	picksPerCategory: number;
	opensAt: string | null;
	closesAt: string | null;
	source: TallySource;
	/** sha256 of the first-ballot record; null = the record could not be read. */
	ballotsDigest: string | null;
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
	digest: string | null,
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
		ballotsDigest: digest,
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
			"Aggregate only. One ballot per voter: the FIRST one cast counts, and a later ballot does not replace it. Ballots are manageData entries on Stellar TESTNET; because an overwrite destroys the value it replaces, the award-ballots mirror — not the chain — is what preserves the first ballot, and it is also the durable record across testnet resets. ballotsDigest is sha256 of that first-ballot record (recipe: see ballotsDigest in src/lib/awards/publish.ts) — publishing the hash pins the record without disclosing any address→choice, so the record cannot be changed after the fact. This file's git commit is anchored on Tansu (testnet) — see /api/awards/anchor?round=" +
			round.slug,
	};
}
