/**
 * i³ Awards — ballot encoding, validation and tallying. Pure logic.
 *
 * The vote encoding (mirrors communityfund.stellar.org's approach, but
 * cleaner because manageData overwrites in place):
 *
 *   One TESTNET transaction, source = the voter's own account, containing
 *   ONE manageData operation per category voted:
 *
 *     key   = `i3.<roundSlug>.<categoryKey>`   (≤64 bytes, enforced)
 *     value = nominee project slug              (≤64 bytes, enforced)
 *
 *   Changing a vote is just submitting a new ballot — manageData with the
 *   same key overwrites the old value, no delete-then-set dance. The
 *   voter's account IS their ballot; tallying reads every whitelisted
 *   account's data entries straight off Horizon, so the count is
 *   independently verifiable by anyone.
 *
 * Trust boundaries:
 *   - buildBallotTx produces the UNSIGNED tx the wallet signs. Its fee is
 *     modest and the tx is a plain (non-fee-bump) transaction, so SDF
 *     could fee-bump it later if ever needed.
 *   - validateSignedBallot is the relay gate: the submit route accepts an
 *     arbitrary XDR string from the browser, so EVERYTHING is re-checked
 *     server-side — ops are manageData-only under our exact key prefix,
 *     the source is whitelisted, the round is open, one entry per
 *     category, values are real nominees, and at least one signature
 *     verifies against the source key over the TESTNET-passphrase hash
 *     (which structurally refuses mainnet-signed payloads). We never
 *     relay a transaction we couldn't have built ourselves.
 *
 * No Payload, no fetch, no globals — everything the functions need comes
 * in as arguments, which is what makes the unit tests honest.
 */

import {
	Account,
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
 * transaction on-chain as a test cast — the whole thing already runs on
 * testnet, but this makes a throwaway pilot-wallet vote obvious in the tx
 * history and distinct from the real round's ballots, which carry NO memo.
 * MEMO_TEXT caps at 28 bytes; this is 7.
 */
export const TEST_BALLOT_MEMO = "i3-test";

/** Voter gets 5 minutes to review + sign before the tx expires. */
const BALLOT_TIMEOUT_SECONDS = 300;

/** 100x base fee per op — pennies of testnet XLM, immune to minor surge. */
const BALLOT_FEE_PER_OP = "10000";

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
	 * Test round — ballots are stamped with the TEST_BALLOT_MEMO and the relay
	 * requires it. Defaults false; the real round carries no memo.
	 */
	testMode?: boolean;
}

export interface BallotNominee {
	/** Category KEY this nominee runs in. */
	category: string;
	/** Directory project slug — the on-chain vote value. */
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
 * The manageData key for one vote.
 *
 * A single-pick round keeps the ORIGINAL unslotted key — the encoding that is
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

/** Every key a category can occupy for a round, slot order. */
export function categoryKeys(
	round: BallotRound,
	categoryKey: string,
): string[] {
	const picks = picksPerCategory(round);
	if (picks === 1) return [dataKey(round.slug, categoryKey)];
	return Array.from({ length: picks }, (_, i) =>
		dataKey(round.slug, categoryKey, i + 1),
	);
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
	if (round.opensAt && now < new Date(round.opensAt)) {
		return { open: false, reason: "voting has not opened yet" };
	}
	if (round.closesAt && now >= new Date(round.closesAt)) {
		return { open: false, reason: "voting has closed" };
	}
	return { open: true, reason: null };
}

/**
 * Validate a selections object against the round + nominee list.
 * Returns normalized selections (only valid category keys, trimmed values)
 * or a list of everything wrong — never partially trusts input.
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
		// Accept a bare slug or a list — the wire form of a one-pick round is
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
		for (const key of categoryKeys(round, category)) {
			if (byteLength(key) > MANAGE_DATA_MAX_BYTES) {
				errors.push(`vote key for "${category}" exceeds 64 bytes`);
				bad = true;
				break;
			}
		}
		if (bad) continue;
		normalized[category] = slugs;
	}
	if (errors.length > 0) return { ok: false, errors };
	return { ok: true, selections: normalized };
}

/**
 * Build the UNSIGNED ballot transaction the wallet will sign.
 * Caller has already validated round-open, whitelist and selections.
 */
export function buildBallotTx(params: {
	round: BallotRound;
	address: string;
	/** Current on-chain sequence (Horizon string form). */
	sequence: string;
	selections: BallotSelections;
	/**
	 * The manageData keys the voter's account already carries. Only used to
	 * decide which now-unused slots are safe to delete (see below).
	 */
	existingKeys?: Set<string>;
}): Transaction {
	const { round, address, sequence, selections, existingKeys } = params;
	if (!StrKey.isValidEd25519PublicKey(address)) {
		throw new Error("invalid voter address");
	}
	const account = new Account(address, sequence);
	const builder = new TransactionBuilder(account, {
		fee: BALLOT_FEE_PER_OP,
		networkPassphrase: AWARDS_NETWORK_PASSPHRASE,
	});
	// Stable key order → deterministic XDR for the same selections.
	const picks = picksPerCategory(round);
	for (const category of Object.keys(selections).sort()) {
		const chosen = selections[category];
		if (picks === 1) {
			builder.addOperation(
				Operation.manageData({
					name: dataKey(round.slug, category),
					value: chosen[0],
				}),
			);
			continue;
		}
		// Multi-pick: write slot 1..N. A slot the voter no longer uses is
		// DELETED, but only when it actually exists on-chain — manageData
		// refuses to delete a key that was never set, which would fail the
		// whole ballot for anyone voting for the first time or picking fewer
		// than last time.
		for (let slot = 1; slot <= picks; slot++) {
			const name = dataKey(round.slug, category, slot);
			const slug = chosen[slot - 1];
			if (slug !== undefined) {
				builder.addOperation(Operation.manageData({ name, value: slug }));
			} else if (existingKeys?.has(name)) {
				builder.addOperation(Operation.manageData({ name, value: null }));
			}
		}
	}
	// Test round → stamp the ballot as a test cast (see TEST_BALLOT_MEMO).
	if (round.testMode) {
		builder.addMemo(Memo.text(TEST_BALLOT_MEMO));
	}
	return builder.setTimeout(BALLOT_TIMEOUT_SECONDS).build();
}

export interface SignedBallotContext {
	round: BallotRound;
	nominees: BallotNominee[];
	/** Whitelisted voter addresses for this round. */
	whitelist: Set<string>;
	now?: Date;
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
 * model — this is what makes POST /api/awards/submit not an open relay.
 */
export function validateSignedBallot(
	signedXdr: string,
	ctx: SignedBallotContext,
): SignedBallotVerdict {
	const { round, nominees, whitelist } = ctx;
	const errors: string[] = [];

	// Round must be open (same wall the ballot-xdr route enforces — a voter
	// can't sign at 23:59 and relay at 00:01).
	const openState = roundOpenState(round, ctx.now);
	if (!openState.open) {
		return { ok: false, errors: [`voting is not open: ${openState.reason}`] };
	}

	// Parse strictly as a testnet transaction. Fee-bumps are refused: we only
	// relay the exact shape we build (a fee-bump wrapper would be someone
	// else's construction).
	let tx: Transaction;
	try {
		const parsed = TransactionBuilder.fromXDR(
			signedXdr,
			AWARDS_NETWORK_PASSPHRASE,
		);
		if (!("operations" in parsed)) {
			return {
				ok: false,
				errors: ["fee-bump transactions are not accepted by this relay"],
			};
		}
		tx = parsed as Transaction;
	} catch {
		return { ok: false, errors: ["could not parse transaction XDR"] };
	}

	// Source must be a whitelisted voter for this round.
	const source = tx.source;
	if (!whitelist.has(source)) {
		return {
			ok: false,
			errors: ["source account is not on the voter whitelist for this round"],
		};
	}

	// Signature check: at least one signature must verify against the SOURCE
	// account's key over the TESTNET-passphrase hash. This is the structural
	// mainnet refusal — a tx signed for any other network hashes differently
	// and never verifies here.
	try {
		const hash = tx.hash();
		const kp = Keypair.fromPublicKey(source);
		const signedBySource = tx.signatures.some((sig) => {
			try {
				return kp.verify(hash, sig.signature());
			} catch {
				return false;
			}
		});
		if (!signedBySource) {
			return {
				ok: false,
				errors: [
					"transaction is not signed by the voter account for TESTNET (wrong network or wrong key)",
				],
			};
		}
	} catch {
		return { ok: false, errors: ["could not verify transaction signatures"] };
	}

	// Memo policy. Real round: NO memo (anti-smuggling). Test round: exactly the
	// TEST_BALLOT_MEMO text, so a test cast self-identifies on-chain while an
	// arbitrary smuggled memo is still refused.
	// biome-ignore lint/suspicious/noExplicitAny: memo type narrows awkwardly
	const memo = tx.memo as any;
	const memoType = memo?.type as string | undefined;
	if (round.testMode) {
		const memoText =
			memoType === "text"
				? Buffer.isBuffer(memo.value)
					? memo.value.toString("utf8")
					: String(memo.value ?? "")
				: null;
		if (memoText !== TEST_BALLOT_MEMO) {
			errors.push(
				`test-round ballots must carry the "${TEST_BALLOT_MEMO}" memo`,
			);
		}
	} else if (memoType && memoType !== "none") {
		errors.push("ballots must not carry a memo");
	}

	// Every operation must be a manageData under our exact prefix.
	const prefix = `i3.${round.slug}.`;
	const validCategories = new Set(round.categories.map((c) => c.key));
	const nomineesByCategory = new Map<string, Set<string>>();
	for (const n of nominees) {
		const set = nomineesByCategory.get(n.category) ?? new Set<string>();
		set.add(n.slug);
		nomineesByCategory.set(n.category, set);
	}

	if (tx.operations.length === 0) {
		errors.push("transaction has no operations");
	}
	if (tx.operations.length > round.categories.length) {
		errors.push(
			`too many operations (${tx.operations.length}) for ${round.categories.length} categories`,
		);
	}

	const seenCategories = new Set<string>();
	const selections: BallotSelections = {};
	for (const op of tx.operations) {
		if (op.type !== "manageData") {
			errors.push(`operation "${op.type}" is not allowed — manageData only`);
			continue;
		}
		// An op-level source could target a different account than the tx source
		// (it would need that account's signature anyway, but we refuse the
		// shape outright — ballots only ever write to the voter's own account).
		if (op.source && op.source !== source) {
			errors.push("operation source differs from the voter account");
			continue;
		}
		if (!op.name.startsWith(prefix)) {
			errors.push(`data key "${op.name}" is outside this round's namespace`);
			continue;
		}
		// `<category>` on a one-pick round, `<category>.<slot>` on a multi-pick
		// one. Anything else is outside the shape we build.
		const rest = op.name.slice(prefix.length);
		const picks = picksPerCategory(round);
		let category = rest;
		let slot: number | null = null;
		if (picks > 1) {
			const m = rest.match(/^(.+)\.(\d+)$/);
			if (!m) {
				errors.push(`data key "${op.name}" is not a slotted vote key`);
				continue;
			}
			category = m[1];
			slot = Number(m[2]);
			if (slot < 1 || slot > picks) {
				errors.push(`vote slot ${slot} is outside 1..${picks}`);
				continue;
			}
		}
		if (!validCategories.has(category)) {
			errors.push(`"${category}" is not a category of this round`);
			continue;
		}
		const seenKey = slot === null ? category : `${category}.${slot}`;
		if (seenCategories.has(seenKey)) {
			errors.push(`duplicate vote for "${seenKey}"`);
			continue;
		}
		seenCategories.add(seenKey);
		// A multi-pick ballot legitimately CLEARS a slot the voter dropped;
		// a one-pick ballot has nothing to clear, so a delete there is bogus.
		if (op.value === undefined || op.value === null) {
			if (picks > 1) continue;
			errors.push(
				`vote for "${category}" deletes the entry — ballots must set a nominee`,
			);
			continue;
		}
		const slug = Buffer.from(op.value).toString("utf8");
		if (!nomineesByCategory.get(category)?.has(slug)) {
			errors.push(`"${slug}" is not a nominee in "${category}"`);
			continue;
		}
		const bucket = selections[category] ?? [];
		if (bucket.includes(slug)) {
			errors.push(`"${slug}" appears twice in "${category}"`);
			continue;
		}
		bucket.push(slug);
		selections[category] = bucket;
	}

	for (const [category, picked] of Object.entries(selections)) {
		const max = picksPerCategory(round);
		if (picked.length > max) {
			errors.push(
				`"${category}" allows at most ${max} pick${max === 1 ? "" : "s"}, got ${picked.length}`,
			);
		}
	}

	if (errors.length > 0) return { ok: false, errors };
	return { ok: true, source, selections, xdr: signedXdr };
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
		// Two slots holding the same nominee count once — one voter, one voice.
		if (!bucket.includes(slug)) bucket.push(slug);
		votes[category] = bucket;
	}
	return votes;
}

/**
 * Aggregate tally across all whitelisted accounts. AGGREGATE ONLY — the
 * public results payload never maps an address to its choices (anyone can
 * read the chain themselves, but we don't hand it out pre-joined).
 */
export function tallyRound(
	round: BallotRound,
	nominees: BallotNominee[],
	accounts: VoterAccountData[],
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
		// four picks in a category adds one to each of four nominees — nobody
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
	return { categories, turnout: { voted, whitelisted: accounts.length } };
}
