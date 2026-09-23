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
	type BallotRound,
	type BallotSelections,
	decodeRelayBallots,
	type RoundTally,
	tallyRound,
	type VoterAccountData,
} from "./ballot";
import { mirrorAccountData } from "./mirror";
import { loadFirstBallotRecord } from "./record";
import type { LoadedRound } from "./round";
import {
	fetchLatestBallotOp,
	fetchTestnetAccount,
	relayKeypair,
} from "./stellar";

export type TallySource = "chain" | "mirror" | "chain+mirror";

/** One voter's first ballot, as the record holds it. Never published. */
export interface FirstBallotEntry {
	address: string;
	selections: BallotSelections;
	txHash: string | null;
	at: string | null;
	/** The id on the relay account. Not part of the digest (v1 recipe). */
	ballotId?: string | null;
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

/**
 * Pure. The counted ballots of a round, from the two places a ballot can be:
 *
 *   the record   address → first ballot (+ the id it was written under)
 *   the relay    ballot id → selections, decoded off the relay account
 *
 * The record wins wherever it has a confirmed row: it is the only thing that
 * knows a voter's FIRST ballot and the only thing that survives a testnet
 * reset. A relay ballot whose id the record does not hold is one the relay
 * wrote and the record missed (confirmBallot failed after the chain landed);
 * it is counted, as an anonymous voter with no address, and reported so the
 * reconcile lane can attribute it. Never both for one id.
 */
export function mergeBallots(
	round: BallotRound,
	record: FirstBallotEntry[],
	relay: Map<string, BallotSelections>,
): {
	accounts: VoterAccountData[];
	recordVoters: number;
	relayOnly: string[];
} {
	const accounts: VoterAccountData[] = [];
	const seenIds = new Set<string>();
	let recordVoters = 0;
	for (const e of record) {
		if (!Object.values(e.selections).some((s) => s.length > 0)) continue;
		recordVoters++;
		if (e.ballotId) seenIds.add(e.ballotId);
		accounts.push(
			mirrorAccountData(round, {
				address: e.address,
				selections: e.selections,
			}),
		);
	}
	const relayOnly: string[] = [];
	for (const [ballotId, selections] of relay) {
		if (seenIds.has(ballotId)) continue;
		relayOnly.push(ballotId);
		accounts.push(
			mirrorAccountData(round, { address: `relay:${ballotId}`, selections }),
		);
	}
	return { accounts, recordVoters, relayOnly };
}

/**
 * The whitelist is the turnout denominator (passed to tallyRound): `accounts` is the ballot list here and would read as 100% turnout.
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
	/** Relay ballots refused because they post-date the round's close. */
	afterClose: number;
	/** Relay ballots the record does not hold — counted, unattributed. */
	relayOnly: number;
}> {
	const relayPub = relayKeypair()?.publicKey() ?? null;
	const [probe, record] = await Promise.all([
		relayPub ? fetchTestnetAccount(relayPub) : Promise.resolve(null),
		loadFirstBallotRecord(loaded.round.slug),
	]);
	// One Horizon call for the whole round: every ballot is on the relay.
	// No relay configured, or the relay unfunded (never used, or reset) both
	// read as "the chain holds nothing" — the record carries the round.
	const relay =
		probe?.funded === true
			? decodeRelayBallots(loaded.round, loaded.nominees, probe.account.data)
			: new Map<string, BallotSelections>();

	// Rows arrive oldest-first; keep the OLDEST per address (a duplicate row
	// is a race we have no unique index against yet).
	const byAddress = new Map<string, FirstBallotEntry>();
	for (const e of record ?? [])
		if (!byAddress.has(e.address)) byAddress.set(e.address, e);
	const entries = [...byAddress.values()];

	// A ballot the relay wrote was gated on the close time before it was
	// written, so only record-less relay ballots need dating — and those are
	// normally none. Undatable means refused (see ballotCountsAtTime).
	let afterClose = 0;
	const known = new Set(entries.map((e) => e.ballotId).filter(Boolean));
	if (loaded.round.closesAt && relayPub) {
		const unknown = [...relay.keys()].filter((id) => !known.has(id));
		const dated = await Promise.all(
			unknown.map(async (id) => ({
				id,
				op: await fetchLatestBallotOp(
					relayPub,
					`i3.${loaded.round.slug}.${id}.`,
				),
			})),
		);
		for (const { id, op } of dated) {
			if (!ballotCountsAtTime(op?.at, loaded.round.closesAt)) {
				relay.delete(id);
				afterClose++;
			}
		}
	}

	const { accounts, recordVoters, relayOnly } = mergeBallots(
		loaded.round,
		entries,
		relay,
	);
	const tally = tallyRound(
		loaded.round,
		loaded.nominees,
		accounts,
		loaded.whitelist.size,
	);
	const source: TallySource =
		recordVoters && relayOnly.length
			? "chain+mirror"
			: recordVoters
				? "mirror"
				: "chain";
	return {
		tally,
		source,
		digest: record ? ballotsDigest(record) : null,
		afterClose,
		relayOnly: relayOnly.length,
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
	// No closesAt at all: no deadline to miss. A closesAt that does not PARSE
	// is a misconfigured round, and the safe reading is that nothing after
	// "the close" can be shown to be in time — so nothing out-of-band counts.
	if (!closesAt) return true;
	const close = Date.parse(closesAt);
	if (Number.isNaN(close)) return false;
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
	/** Ballots counted from the relay that the record does not name (anonymous,
	 *  not covered by ballotsDigest). Normally 0. */
	relayOnly: number;
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
	relayOnly = 0,
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
		relayOnly,
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
