/**
 * i³ Awards, ballot encoding, validation, tally, and the anonymous relay.
 *
 * A ballot is written by the RELAY to its own account under a random id, one
 * entry per category:
 *   key   = `i3.<round>.<ballotId>.<category>`   (≤64 bytes, enforced)
 *   value = the category's picks, comma-joined; when four long slugs do not
 *           fit 64 bytes the rest continue under `.1`, `.2`, … (same key + slot)
 * About three entries per ballot, because a Stellar account holds at most
 * 1,000 subentries and one-per-pick would have exhausted that inside the
 * real rounds. Ballots written one-per-pick before 2026-09-23 carry a
 * `.<slot>` suffix holding a single slug and still decode.
 * The voter never writes to the chain. They sign an AUTHORIZATION, a
 * transaction that can never be submitted (its sequence is already consumed;
 * it expires in ten minutes) whose memo commits to exactly their picks, and
 * the relay verifies that and does the writing. Nothing public links a ballot
 * to an address; the record (address → ballot id) is admin-only.
 *
 * Kept from the original design: the voter-account slot encoding (dataKey),
 * which the record re-encodes through mirrorAccountData so tallyRound has
 * ONE decoder, and the full-slate rule (requiredPicks) every ballot must
 * satisfy.
 */

import { createHash, randomBytes } from "node:crypto";
import {
	Account,
	FeeBumpTransaction,
	Keypair,
	Memo,
	Operation,
	StrKey,
	type Transaction,
	TransactionBuilder,
} from "@stellar/stellar-sdk";
import { AWARDS_NETWORK_PASSPHRASE } from "./stellar";

/** manageData caps both key and value at 64 bytes. */
const MANAGE_DATA_MAX_BYTES = 64;

/**
 * Memo stamped on ballots for a TEST round (round.testMode). It marks the
 * transaction on-chain as a test cast, the whole thing already runs on
 * testnet, but this makes a throwaway pilot-wallet vote obvious in the tx
 * history and distinct from the real round's ballots, which carry NO memo.
 * MEMO_TEXT caps at 28 bytes; this is 7.
 */
export const TEST_BALLOT_MEMO = "i3-test";

/** 100x base fee per op, pennies of testnet XLM, immune to minor surge. */
export const BALLOT_FEE_PER_OP = "10000";

export interface RoundCategory {
	key: string;
	name: string;
	tagline: string | null;
}

export interface BallotRound {
	slug: string;
	status: "draft" | "open" | "closed";
	ballotMode: string;
	/**
	 * How many nominees a voter may pick per category. 1 = the original radio
	 * ballot (final round: 4 finalists, pick the winner). >1 = approval ballot
	 * (shortlist round: pick your N favourites from the nominee pool, order
	 * irrelevant). Absent/0 reads as 1 so every existing round is unchanged.
	 */
	picksPerCategory?: number | null;
	categories: RoundCategory[];
	opensAt?: string | null;
	closesAt?: string | null;
	/**
	 * Test round, ballots are stamped with the TEST_BALLOT_MEMO and the relay
	 * requires it. Defaults false; the real round carries no memo.
	 */
	testMode?: boolean;
}

export interface BallotNominee {
	/** Category KEY this nominee runs in. */
	category: string;
	/** Directory project slug, the on-chain vote value. */
	slug: string;
	name: string;
}

/** category key → the nominee slugs picked in it, in no meaningful order. */
export type BallotSelections = Record<string, string[]>;

/** How many picks this round allows per category. */
export function picksPerCategory(round: BallotRound): number {
	const n = round.picksPerCategory ?? 1;
	return Number.isFinite(n) && n > 1 ? Math.floor(n) : 1;
}

/**
 * How many picks a category requires: the round's picksPerCategory, or every
 * nominee the category has if it has fewer than that.
 *
 * The nominations phase asks each Pilot for a full slate, "a minimum of 4 per
 * category, so 4 can be shortlisted from each", and the final phase asks for
 * exactly one. Both are "fill every slot", so the rule is the same in both:
 * required = picks, with the pool as the ceiling so a thin category cannot
 * make the whole ballot impossible. A category with no nominees requires
 * nothing (see the callers).
 */
export function requiredPicks(round: BallotRound, poolSize: number): number {
	return Math.min(picksPerCategory(round), Math.max(0, poolSize));
}

/**
 * The manageData key for one vote.
 *
 * A single-pick round keeps the ORIGINAL unslotted key, the encoding that is
 * already signed on-chain and covered by the existing tests, so the final
 * round runs on untouched code. Multi-pick rounds address a fixed slot per
 * category, which keeps overwrite semantics (re-voting rewrites slot 1..N in
 * place) instead of needing a delete-then-set dance for every change.
 */
export function dataKey(
	roundSlug: string,
	categoryKey: string,
	slot?: number,
): string {
	const base = `i3.${roundSlug}.${categoryKey}`;
	return slot === undefined ? base : `${base}.${slot}`;
}

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** Is the round accepting ballots right now? Returns a reason when not. */
export function roundOpenState(
	round: BallotRound,
	now: Date = new Date(),
): { open: boolean; reason: string | null } {
	if (round.status !== "open") {
		return { open: false, reason: `round is ${round.status}` };
	}
	// A date that does not parse fails CLOSED. `now >= Invalid Date` is false,
	// so an unparseable closesAt used to mean the round never closed.
	if (round.opensAt) {
		const opens = Date.parse(round.opensAt);
		if (Number.isNaN(opens)) {
			return { open: false, reason: "round's opensAt is not a valid date" };
		}
		if (now.getTime() < opens) {
			return { open: false, reason: "voting has not opened yet" };
		}
	}
	if (round.closesAt) {
		const closes = Date.parse(round.closesAt);
		if (Number.isNaN(closes)) {
			return { open: false, reason: "round's closesAt is not a valid date" };
		}
		if (now.getTime() >= closes) {
			return { open: false, reason: "voting has closed" };
		}
	}
	return { open: true, reason: null };
}

/**
 * Validate a selections object against the round + nominee list.
 * Returns normalized selections (only valid category keys, trimmed values)
 * or a list of everything wrong, never partially trusts input.
 */
export function validateSelections(
	round: BallotRound,
	nominees: BallotNominee[],
	selections: unknown,
):
	| { ok: true; selections: BallotSelections }
	| { ok: false; errors: string[] } {
	const errors: string[] = [];
	if (
		typeof selections !== "object" ||
		selections === null ||
		Array.isArray(selections)
	) {
		return {
			ok: false,
			errors: ["selections must be an object of {categoryKey: nomineeSlug}"],
		};
	}
	const validCategories = new Set(round.categories.map((c) => c.key));
	const nomineesByCategory = new Map<string, Set<string>>();
	for (const n of nominees) {
		const set = nomineesByCategory.get(n.category) ?? new Set<string>();
		set.add(n.slug);
		nomineesByCategory.set(n.category, set);
	}

	const entries = Object.entries(selections as Record<string, unknown>);
	if (entries.length === 0) {
		errors.push("select at least one nominee");
	}
	const picks = picksPerCategory(round);
	const normalized: BallotSelections = {};
	for (const [category, value] of entries) {
		if (!validCategories.has(category)) {
			errors.push(`unknown category "${category}"`);
			continue;
		}
		// Accept a bare slug or a list, the wire form of a one-pick round is
		// still a plain string, so an older client keeps working unchanged.
		const raw = Array.isArray(value) ? value : [value];
		const slugs: string[] = [];
		let bad = false;
		for (const v of raw) {
			const slug = typeof v === "string" ? v.trim() : "";
			if (!slug) {
				errors.push(`no nominee selected for "${category}"`);
				bad = true;
				break;
			}
			if (!nomineesByCategory.get(category)?.has(slug)) {
				errors.push(`"${slug}" is not a nominee in "${category}"`);
				bad = true;
				break;
			}
			if (byteLength(slug) > MANAGE_DATA_MAX_BYTES) {
				errors.push(`nominee slug "${slug}" exceeds 64 bytes`);
				bad = true;
				break;
			}
			// the relay joins a category's picks with commas; a slug carrying
			// one would split into two nominees on the way back
			if (slug.includes(",")) {
				errors.push(`nominee slug "${slug}" contains a comma`);
				bad = true;
				break;
			}
			// Picking the same nominee twice is a client bug, not a double vote:
			// refuse it rather than silently collapsing it, so the voter's ballot
			// never means something different from what they saw.
			if (slugs.includes(slug)) {
				errors.push(`"${slug}" picked twice in "${category}"`);
				bad = true;
				break;
			}
			slugs.push(slug);
		}
		if (bad) continue;
		if (slugs.length > picks) {
			errors.push(
				`"${category}" allows at most ${picks} pick${picks === 1 ? "" : "s"}, got ${slugs.length}`,
			);
			continue;
		}
		// Stellar's 64-byte budget applies to the RELAY key
		// (`i3.<round>.<id>.<category>`) and to the value, which holds the
		// category's picks comma-joined in one entry.
		if (
			byteLength(relayKey(round.slug, "0".repeat(8), category)) >
			MANAGE_DATA_MAX_BYTES
		) {
			errors.push(`ballot key for "${category}" exceeds 64 bytes`);
			continue;
		}
		normalized[category] = slugs;
	}
	// Every category that HAS nominees, not just one. The round is one pick in
	// each, and the first ballot is the only one that counts, so a partial
	// ballot is not a smaller vote, it is a permanent one with categories
	// missing and no way for the voter to fill them in later. The page already
	// requires all of them; this is the half a direct API call was skipping.
	//
	// Scoped to categories that have nominees on purpose: a category whose
	// nominees are absent (none imported yet, or the roster load dropped them)
	// is unvotable, and demanding a pick there would refuse EVERY ballot in the
	// round rather than just that category.
	for (const category of validCategories) {
		const pool = nomineesByCategory.get(category)?.size ?? 0;
		if (!pool) continue;
		const need = requiredPicks(round, pool);
		const got = normalized[category]?.length ?? 0;
		if (got < need) {
			errors.push(
				`"${category}" needs ${need} pick${need === 1 ? "" : "s"}, got ${got}`,
			);
		}
	}
	if (errors.length > 0) return { ok: false, errors };
	return { ok: true, selections: normalized };
}

export interface SignedBallotContext {
	round: BallotRound;
	nominees: BallotNominee[];
	/** Whitelisted voter addresses for this round. */
	whitelist: Set<string>;
	now?: Date;
	/**
	 * ed25519 signer keys (weight > 0) on the SOURCE account, from Horizon.
	 *
	 * Omit and the master key is assumed, which is what this used to check
	 * unconditionally, and which refuses any account that set its master
	 * weight to 0 or delegated to other signers, even though Horizon would
	 * accept its ballot. Supplying the real signer set is what lets a
	 * multisig or delegated Pilot vote.
	 */
	signers?: string[];
}

export type SignedBallotVerdict =
	| {
			ok: true;
			source: string;
			selections: BallotSelections;
			xdr: string;
	  }
	| { ok: false; errors: string[] };

/**
 * The relay gate. Rejects anything that is not exactly a ballot we could
 * have built: manageData-only, our key prefix, whitelisted source, open
 * round, valid nominees, testnet signature. See module doc for the threat
 * model, this is what makes POST /api/awards/submit not an open relay.
 */
/**
 * The source account of a signed ballot, without validating anything else.
 *
 * Exists for one reason: the relay needs the account's SIGNER SET to verify
 * the signature (so a multisig or master-weight-0 Pilot can vote), and it
 * needs the source to fetch the account. Parsing the source first breaks that
 * circle. Returns null on anything unparseable, the full validator is still
 * the thing that decides whether the ballot is acceptable.
 */
export function ballotSourceOf(signedXdr: string): string | null {
	try {
		const parsed = TransactionBuilder.fromXDR(
			signedXdr,
			AWARDS_NETWORK_PASSPHRASE,
		);
		const tx =
			parsed instanceof FeeBumpTransaction
				? parsed.innerTransaction
				: (parsed as Transaction);
		return tx.source ?? null;
	} catch {
		return null;
	}
}

// ── Tallying ───────────────────────────────────────────────────────────────

export interface VoterAccountData {
	address: string;
	/** Horizon account data entries: key → base64 value. Null = unfunded. */
	data: Record<string, string> | null;
}

export interface CategoryTally {
	key: string;
	name: string;
	tagline: string | null;
	totalVotes: number;
	results: Array<{ slug: string; name: string; votes: number }>;
}

export interface RoundTally {
	categories: CategoryTally[];
	turnout: { voted: number; whitelisted: number };
}

/** Decode a voter's current selections from raw Horizon data entries. */
export function decodeAccountVotes(
	round: BallotRound,
	nominees: BallotNominee[],
	data: Record<string, string>,
): BallotSelections {
	const prefix = `i3.${round.slug}.`;
	const validCategories = new Set(round.categories.map((c) => c.key));
	const nomineesByCategory = new Map<string, Set<string>>();
	for (const n of nominees) {
		const set = nomineesByCategory.get(n.category) ?? new Set<string>();
		set.add(n.slug);
		nomineesByCategory.set(n.category, set);
	}
	const picks = picksPerCategory(round);
	const votes: BallotSelections = {};
	for (const [key, b64] of Object.entries(data)) {
		if (!key.startsWith(prefix)) continue;
		const rest = key.slice(prefix.length);
		// One-pick rounds keep the unslotted key; multi-pick rounds append
		// `.<slot>`. Read only the shape this round writes, so a leftover entry
		// from a differently-configured round never leaks into the tally.
		let category = rest;
		if (picks > 1) {
			const m = rest.match(/^(.+)\.(\d+)$/);
			if (!m) continue;
			const slot = Number(m[2]);
			if (slot < 1 || slot > picks) continue;
			category = m[1];
		}
		if (!validCategories.has(category)) continue;
		let slug: string;
		try {
			slug = Buffer.from(b64, "base64").toString("utf8");
		} catch {
			continue;
		}
		// A vote for a since-removed nominee simply stops counting.
		if (!nomineesByCategory.get(category)?.has(slug)) continue;
		const bucket = votes[category] ?? [];
		// Two slots holding the same nominee count once, one voter, one voice.
		if (!bucket.includes(slug)) bucket.push(slug);
		votes[category] = bucket;
	}
	return votes;
}

/**
 * Aggregate tally across all whitelisted accounts. AGGREGATE ONLY, the
 * public results payload never maps an address to its choices (anyone can
 * read the chain themselves, but we don't hand it out pre-joined).
 */
export function tallyRound(
	round: BallotRound,
	nominees: BallotNominee[],
	accounts: VoterAccountData[],
	/** Turnout denominator. `accounts` is the BALLOT list on the relay path,
	 *  so without this every round would publish 100% turnout. */
	whitelisted?: number,
): RoundTally {
	const nomineeNames = new Map(nominees.map((n) => [n.slug, n.name]));
	const counts = new Map<string, Map<string, number>>(); // category → slug → votes
	let voted = 0;
	for (const account of accounts) {
		if (!account.data) continue;
		const votes = decodeAccountVotes(round, nominees, account.data);
		const entries = Object.entries(votes);
		if (entries.length === 0) continue;
		voted++;
		// Approval tally: every pick is one vote for that nominee. A voter with
		// four picks in a category adds one to each of four nominees, nobody
		// gets four votes, and the top N by count are the finalists.
		for (const [category, slugs] of entries) {
			const perCat = counts.get(category) ?? new Map<string, number>();
			for (const slug of slugs) {
				perCat.set(slug, (perCat.get(slug) ?? 0) + 1);
			}
			counts.set(category, perCat);
		}
	}
	const categories: CategoryTally[] = round.categories.map((cat) => {
		const perCat = counts.get(cat.key) ?? new Map<string, number>();
		const results = nominees
			.filter((n) => n.category === cat.key)
			.map((n) => ({
				slug: n.slug,
				name: nomineeNames.get(n.slug) ?? n.slug,
				votes: perCat.get(n.slug) ?? 0,
			}))
			.sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
		return {
			key: cat.key,
			name: cat.name,
			tagline: cat.tagline ?? null,
			totalVotes: results.reduce((sum, r) => sum + r.votes, 0),
			results,
		};
	});
	return {
		categories,
		turnout: { voted, whitelisted: whitelisted ?? accounts.length },
	};
}

// ── Anonymous ballots: the relay key scheme and the voter's authorization ──
//
// A ballot no longer lives on the voter's account. It is written to the RELAY
// account under a random ballot id, so the chain holds N unlinkable ballots and
// nothing public connects one to an address. The voter proves eligibility by
// signing a transaction that can never be submitted; the relay verifies it and
// does the writing.

/** 8 hex chars, 32 bits: ids never collide within one round's few hundred. */
export function newBallotId(): string {
	return randomBytes(4).toString("hex");
}

const BALLOT_ID = /^[0-9a-f]{8}$/;

/**
 * `i3.<round>.<ballotId>.<category>[.<slot>]` on the relay account.
 * Same 64-byte budget as dataKey; the id costs 9 bytes of it.
 */
export function relayKey(
	roundSlug: string,
	ballotId: string,
	categoryKey: string,
	slot?: number,
): string {
	const base = `i3.${roundSlug}.${ballotId}.${categoryKey}`;
	return slot === undefined ? base : `${base}.${slot}`;
}

/**
 * Every ballot on the relay for this round: ballotId → selections. Unknown
 * categories and since-removed nominees are dropped, as decodeAccountVotes
 * does; a ballot with nothing valid left is omitted, never returned empty.
 */
export function decodeRelayBallots(
	round: BallotRound,
	nominees: BallotNominee[],
	data: Record<string, string>,
): Map<string, BallotSelections> {
	const prefix = `i3.${round.slug}.`;
	const valid = new Set(round.categories.map((c) => c.key));
	const pool = new Map<string, Set<string>>();
	for (const n of nominees) {
		const set = pool.get(n.category) ?? new Set<string>();
		set.add(n.slug);
		pool.set(n.category, set);
	}
	const picks = picksPerCategory(round);
	// ballotId → category → slot → slugs. Slot 0 is today's form (one entry,
	// picks comma-joined); slots 1..N are the pre-2026-09-23 one-per-pick
	// form. Both read back in order.
	const raw = new Map<string, Map<string, Map<number, string[]>>>();
	for (const [key, b64] of Object.entries(data)) {
		if (!key.startsWith(prefix)) continue;
		const [ballotId, category, slotStr, extra] = key
			.slice(prefix.length)
			.split(".");
		if (extra !== undefined) continue;
		if (!ballotId || !BALLOT_ID.test(ballotId) || !category) continue;
		if (!valid.has(category)) continue;
		let slot = 0;
		if (slotStr !== undefined) {
			// per-pick slots only ever existed on multi-pick rounds
			if (picks === 1) continue;
			slot = Number(slotStr);
			if (!Number.isInteger(slot) || slot < 1 || slot > picks) continue;
		}
		const slugs = Buffer.from(b64, "base64")
			.toString("utf8")
			.split(",")
			.map((x) => x.trim())
			.filter((x) => pool.get(category)?.has(x));
		if (!slugs.length) continue;
		const cats = raw.get(ballotId) ?? new Map<string, Map<number, string[]>>();
		const slots = cats.get(category) ?? new Map<number, string[]>();
		slots.set(slot, slugs);
		cats.set(category, slots);
		raw.set(ballotId, cats);
	}
	const out = new Map<string, BallotSelections>();
	for (const [ballotId, cats] of raw) {
		const selections: BallotSelections = {};
		for (const [category, slots] of cats) {
			const slugs = [
				...new Set(
					[...slots.entries()]
						.sort((a, b) => a[0] - b[0])
						.flatMap(([, list]) => list),
				),
			].slice(0, picks);
			if (slugs.length) selections[category] = slugs;
		}
		if (Object.keys(selections).length) out.set(ballotId, selections);
	}
	return out;
}

/** The relay's manageData ops for one ballot. */
export function relayBallotOps(
	round: BallotRound,
	ballotId: string,
	selections: BallotSelections,
): ReturnType<typeof Operation.manageData>[] {
	// ONE entry per category, the picks comma-joined. A Stellar account holds
	// at most 1,000 subentries and every entry is one: one-per-pick was
	// 76 Pilots × 12 = 912 for the nominations round alone, and the final
	// round on top of it would have failed after the first ballot. Three per
	// ballot keeps a round near 230. (Ballots written one-per-pick before
	// 2026-09-23 carry a `.<slot>` suffix; decodeRelayBallots still reads them.)
	const picks = picksPerCategory(round);
	const ops: ReturnType<typeof Operation.manageData>[] = [];
	for (const category of Object.keys(selections).sort()) {
		const slugs = selections[category].slice(0, picks);
		if (!slugs.length) continue;
		// Pack the picks into as few ≤64-byte values as they fit: the first
		// under the category key, the rest under `.1`, `.2`, … There are never
		// more chunks than picks, so a continuation slot stays inside what the
		// decoder accepts. (Four long slugs on the real slate did not fit one
		// value, audit 2026-09-23, and were being refused outright.)
		const chunks: string[] = [];
		for (const slug of slugs) {
			const last = chunks[chunks.length - 1];
			if (
				last !== undefined &&
				byteLength(`${last},${slug}`) <= MANAGE_DATA_MAX_BYTES
			) {
				chunks[chunks.length - 1] = `${last},${slug}`;
			} else {
				chunks.push(slug);
			}
		}
		chunks.forEach((value, i) => {
			ops.push(
				Operation.manageData({
					name:
						i === 0
							? relayKey(round.slug, ballotId, category)
							: relayKey(round.slug, ballotId, category, i),
					value,
				}),
			);
		});
	}
	return ops;
}

export const AUTHORIZATION_KEY = "i3-awards.ballot-authorization";
const AUTHORIZATION_TTL_SECONDS = 600;
/** Verify-side slack on the expiry bound, for the builder's clock vs ours. */
const CLOCK_SKEW_SECONDS = 60;

/**
 * What the voter's signature commits to: this round, these exact picks. It
 * rides in the authorization's memo as a hash, so the relay cannot write a
 * different ballot than the one that was signed.
 */
export function authorizationDigest(
	roundSlug: string,
	selections: BallotSelections,
): Buffer {
	const cats = Object.entries(selections)
		.filter(([, slugs]) => slugs.length > 0)
		.map(([key, slugs]): [string, string] => [
			key,
			[...new Set(slugs)].sort().join(","),
		])
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([key, slugs]) => `${key}=${slugs}`)
		.join(";");
	return createHash("sha256")
		.update(`i3-authorization-v1\n${roundSlug}\n${cats}`)
		.digest();
}

/**
 * The transaction the voter signs. It can NEVER be submitted:
 *   - its sequence number is the account's CURRENT one (a valid transaction
 *     needs current + 1), or 1 for an account that does not exist on-chain, *     which is also why the voter's account never needs funding;
 *   - it expires ten minutes after it is built.
 * It carries one self-describing op, so a wallet shows the voter what they
 * are signing, and the ballot's digest in the memo. Nothing in it names the
 * ballot id, so even a submitted copy could never link a voter to a ballot.
 */
export function buildAuthorizationTx(params: {
	round: BallotRound;
	address: string;
	/** The account's current sequence from Horizon, or null if unfunded. */
	sequence: string | null;
	selections: BallotSelections;
	now?: Date;
}): Transaction {
	const { round, address, sequence, selections } = params;
	if (!StrKey.isValidEd25519PublicKey(address)) {
		throw new Error("invalid voter address");
	}
	// TransactionBuilder signs base + 1; base = current − 1 ⇒ tx.seq == current.
	const base = sequence === null ? "0" : (BigInt(sequence) - 1n).toString();
	const nowSec = Math.floor((params.now ?? new Date()).getTime() / 1000);
	return new TransactionBuilder(new Account(address, base), {
		fee: BALLOT_FEE_PER_OP,
		networkPassphrase: AWARDS_NETWORK_PASSPHRASE,
		memo: Memo.hash(authorizationDigest(round.slug, selections)),
		timebounds: { minTime: 0, maxTime: nowSec + AUTHORIZATION_TTL_SECONDS },
	})
		.addOperation(
			Operation.manageData({ name: AUTHORIZATION_KEY, value: round.slug }),
		)
		.build();
}

/** Does any signature on `tx` verify for a key allowed to sign for `source`? */
function signedFor(
	tx: Transaction,
	source: string,
	signers: string[] | undefined,
): boolean {
	const hash = tx.hash();
	const allowed = signers?.length ? signers : [source];
	const keys = allowed.flatMap((k) => {
		try {
			return [Keypair.fromPublicKey(k)];
		} catch {
			return [];
		}
	});
	return tx.signatures.some((sig) =>
		keys.some((kp) => {
			try {
				return kp.verify(hash, sig.signature());
			} catch {
				return false;
			}
		}),
	);
}

export type AuthorizationVerdict =
	| { ok: true; source: string }
	| { ok: false; errors: string[] };

/**
 * Check a signed authorization against the ballot it claims to authorize.
 * Everything the old relay enforced on the ballot transaction is enforced
 * here on the authorization: testnet passphrase, whitelisted source, and a
 * signature from a key that controls the account, plus that the memo
 * commits to exactly these picks and that the transaction is unusable
 * on-chain. The picks themselves go through validateSelections separately.
 */
export function verifyAuthorization(
	signedXdr: string,
	ctx: {
		round: BallotRound;
		whitelist: Set<string>;
		selections: BallotSelections;
		/** The account's current sequence, or null if it does not exist. */
		sequence: string | null;
		signers?: string[];
		now?: Date;
	},
): AuthorizationVerdict {
	let tx: Transaction;
	try {
		const parsed = TransactionBuilder.fromXDR(
			signedXdr,
			AWARDS_NETWORK_PASSPHRASE,
		);
		tx =
			parsed instanceof FeeBumpTransaction
				? parsed.innerTransaction
				: (parsed as Transaction);
	} catch {
		return { ok: false, errors: ["could not parse authorization XDR"] };
	}
	const source = tx.source;
	if (!ctx.whitelist.has(source)) {
		return {
			ok: false,
			errors: ["source account is not on the voter whitelist for this round"],
		};
	}
	if (!signedFor(tx, source, ctx.signers)) {
		return {
			ok: false,
			errors: [
				"authorization is not signed by a signer on the voter account for TESTNET",
			],
		};
	}
	const errors: string[] = [];
	try {
		const seq = BigInt(tx.sequence);
		if (ctx.sequence === null) {
			// no account on chain: the builder signs at sequence 1, anything
			// else was not built here
			if (seq !== 1n) {
				errors.push("authorization for a new account must sign at sequence 1");
			}
		} else if (seq >= BigInt(ctx.sequence) + 1n) {
			errors.push("authorization must not be a submittable transaction");
		}
	} catch {
		errors.push("authorization has no readable sequence");
	}
	const maxTime = Number(tx.timeBounds?.maxTime ?? 0);
	const nowSec = Math.floor((ctx.now ?? new Date()).getTime() / 1000);
	if (!maxTime || maxTime < nowSec) {
		errors.push("authorization has expired");
	} else if (
		maxTime >
		nowSec + AUTHORIZATION_TTL_SECONDS + CLOCK_SKEW_SECONDS
	) {
		// the builder gives ten minutes; a hand-made one that lasts longer is
		// a standing permission, and a captured one would work until the vote
		errors.push("authorization lasts longer than the ten minutes it is given");
	}
	const op = tx.operations[0];
	if (
		tx.operations.length !== 1 ||
		op?.type !== "manageData" ||
		op.name !== AUTHORIZATION_KEY
	) {
		errors.push("authorization must carry exactly the authorization op");
	}
	const expected = authorizationDigest(ctx.round.slug, ctx.selections);
	// biome-ignore lint/suspicious/noExplicitAny: memo type narrows awkwardly
	const memo = tx.memo as any;
	const got: Buffer | null =
		memo?.type === "hash" && memo.value ? Buffer.from(memo.value) : null;
	if (!got || !got.equals(expected)) {
		errors.push("authorization does not commit to these picks");
	}
	return errors.length ? { ok: false, errors } : { ok: true, source };
}
