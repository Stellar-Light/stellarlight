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
	Operation,
	StrKey,
	type Transaction,
	TransactionBuilder,
} from "@stellar/stellar-sdk";
import { AWARDS_NETWORK_PASSPHRASE } from "./stellar";

/** manageData caps both key and value at 64 bytes. */
const MANAGE_DATA_MAX_BYTES = 64;

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
	categories: RoundCategory[];
	opensAt?: string | null;
	closesAt?: string | null;
}

export interface BallotNominee {
	/** Category KEY this nominee runs in. */
	category: string;
	/** Directory project slug — the on-chain vote value. */
	slug: string;
	name: string;
}

/** category key → nominee slug. One entry per category (radio semantics). */
export type BallotSelections = Record<string, string>;

export function dataKey(roundSlug: string, categoryKey: string): string {
	return `i3.${roundSlug}.${categoryKey}`;
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
	const normalized: BallotSelections = {};
	for (const [category, value] of entries) {
		if (!validCategories.has(category)) {
			errors.push(`unknown category "${category}"`);
			continue;
		}
		const slug = typeof value === "string" ? value.trim() : "";
		if (!slug) {
			errors.push(`no nominee selected for "${category}"`);
			continue;
		}
		if (!nomineesByCategory.get(category)?.has(slug)) {
			errors.push(`"${slug}" is not a nominee in "${category}"`);
			continue;
		}
		if (byteLength(slug) > MANAGE_DATA_MAX_BYTES) {
			errors.push(`nominee slug "${slug}" exceeds 64 bytes`);
			continue;
		}
		if (byteLength(dataKey(round.slug, category)) > MANAGE_DATA_MAX_BYTES) {
			errors.push(`vote key for "${category}" exceeds 64 bytes`);
			continue;
		}
		// Object semantics already guarantee at most one value per category —
		// the "one per category" rule of ballotMode one-per-category.
		normalized[category] = slug;
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
}): Transaction {
	const { round, address, sequence, selections } = params;
	if (!StrKey.isValidEd25519PublicKey(address)) {
		throw new Error("invalid voter address");
	}
	const account = new Account(address, sequence);
	const builder = new TransactionBuilder(account, {
		fee: BALLOT_FEE_PER_OP,
		networkPassphrase: AWARDS_NETWORK_PASSPHRASE,
	});
	// Stable key order → deterministic XDR for the same selections.
	for (const category of Object.keys(selections).sort()) {
		builder.addOperation(
			Operation.manageData({
				name: dataKey(round.slug, category),
				value: selections[category],
			}),
		);
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

	// No memo smuggling: ballots carry no memo.
	// biome-ignore lint/suspicious/noExplicitAny: memo type narrows awkwardly
	if ((tx.memo as any)?.type && (tx.memo as any).type !== "none") {
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
		const category = op.name.slice(prefix.length);
		if (!validCategories.has(category)) {
			errors.push(`"${category}" is not a category of this round`);
			continue;
		}
		if (seenCategories.has(category)) {
			errors.push(`duplicate vote for category "${category}"`);
			continue;
		}
		seenCategories.add(category);
		if (op.value === undefined || op.value === null) {
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
		selections[category] = slug;
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
	const votes: BallotSelections = {};
	for (const [key, b64] of Object.entries(data)) {
		if (!key.startsWith(prefix)) continue;
		const category = key.slice(prefix.length);
		if (!validCategories.has(category)) continue;
		let slug: string;
		try {
			slug = Buffer.from(b64, "base64").toString("utf8");
		} catch {
			continue;
		}
		// A vote for a since-removed nominee simply stops counting.
		if (!nomineesByCategory.get(category)?.has(slug)) continue;
		votes[category] = slug;
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
		for (const [category, slug] of entries) {
			const perCat = counts.get(category) ?? new Map<string, number>();
			perCat.set(slug, (perCat.get(slug) ?? 0) + 1);
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
