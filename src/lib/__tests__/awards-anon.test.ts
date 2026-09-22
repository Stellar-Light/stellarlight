// @vitest-environment node

/**
 * The anonymous ballot: a random id on the relay account, and a voter
 * authorization that proves eligibility without ever touching the chain.
 */
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
	authorizationDigest,
	type BallotNominee,
	type BallotRound,
	buildAuthorizationTx,
	decodeRelayBallots,
	newBallotId,
	relayBallotOps,
	relayKey,
	validateSelections,
	verifyAuthorization,
} from "../awards/ballot";
import { AWARDS_NETWORK_PASSPHRASE } from "../awards/stellar";

const round = {
	slug: "i3-2026-nominations",
	status: "open",
	ballotMode: "one-per-category",
	picksPerCategory: 2,
	categories: [
		{ key: "impact", name: "Impact", tagline: null },
		{ key: "interoperability", name: "Interoperability", tagline: null },
	],
	opensAt: null,
	closesAt: null,
} as unknown as BallotRound;
const single = { ...round, picksPerCategory: 1 } as BallotRound;
const nominees: BallotNominee[] = [
	{ category: "impact", slug: "decaf", name: "Decaf" },
	{ category: "impact", slug: "beans", name: "Beans" },
	{ category: "interoperability", slug: "defindex", name: "DeFindex" },
	{ category: "interoperability", slug: "rubic", name: "Rubic" },
];
const picks = {
	impact: ["decaf", "beans"],
	interoperability: ["rubic", "defindex"],
};
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("relay key scheme", () => {
	it("fits the 64-byte manageData budget for the longest real key", () => {
		const k = relayKey(
			"i3-2026-nominations",
			newBallotId(),
			"interoperability",
			4,
		);
		expect(Buffer.byteLength(k)).toBeLessThanOrEqual(64);
		expect(k).toMatch(
			/^i3\.i3-2026-nominations\.[0-9a-f]{8}\.interoperability\.4$/,
		);
	});

	it("round-trips a multi-pick ballot through the relay's data map", () => {
		const id = newBallotId();
		const data: Record<string, string> = {};
		for (const op of relayBallotOps(round, id, picks)) {
			// biome-ignore lint/suspicious/noExplicitAny: op shape
			const o = op as any;
			data[o.body().value().dataName().toString()] = b64(
				o.body().value().dataValue().toString(),
			);
		}
		const decoded = decodeRelayBallots(round, nominees, data);
		expect(decoded.get(id)).toEqual(picks);
	});

	it("keeps ballots apart and drops what does not belong", () => {
		const data = {
			[relayKey(single.slug, "aaaaaaaa", "impact")]: b64("decaf"),
			[relayKey(single.slug, "bbbbbbbb", "impact")]: b64("beans"),
			// a slotted key on a single-pick round is not a ballot
			[relayKey(single.slug, "cccccccc", "impact", 1)]: b64("decaf"),
			// a nominee that is no longer on the ballot
			[relayKey(single.slug, "dddddddd", "impact")]: b64("gone"),
			// somebody else's key on the same account
			"i3.other-round.eeeeeeee.impact": b64("decaf"),
			unrelated: b64("x"),
		};
		const decoded = decodeRelayBallots(single, nominees, data);
		expect([...decoded.keys()].sort()).toEqual(["aaaaaaaa", "bbbbbbbb"]);
		expect(decoded.get("aaaaaaaa")).toEqual({ impact: ["decaf"] });
	});
});

describe("relay storage: one entry per category (1,000-subentry cap)", () => {
	it("writes one entry per category with the picks comma-joined, not one per pick", () => {
		const ops = relayBallotOps(round, "abcd1234", picks);
		expect(ops).toHaveLength(2);
		// biome-ignore lint/suspicious/noExplicitAny: op shape
		const body = (o: any) => o.body().value();
		expect(ops.map((o) => body(o).dataName().toString())).toEqual([
			"i3.i3-2026-nominations.abcd1234.impact",
			"i3.i3-2026-nominations.abcd1234.interoperability",
		]);
		expect(ops.map((o) => body(o).dataValue().toString())).toEqual([
			"decaf,beans",
			"rubic,defindex",
		]);
	});

	it("still reads ballots written one entry per pick before the change", () => {
		const data = {
			[relayKey(round.slug, "aaaaaaaa", "impact", 1)]: b64("decaf"),
			[relayKey(round.slug, "aaaaaaaa", "impact", 2)]: b64("beans"),
			[relayKey(round.slug, "aaaaaaaa", "interoperability", 1)]: b64("rubic"),
		};
		expect(decodeRelayBallots(round, nominees, data).get("aaaaaaaa")).toEqual({
			impact: ["decaf", "beans"],
			interoperability: ["rubic"],
		});
	});

	it("drops unknown slugs inside a joined value and caps at the round's picks", () => {
		const data = {
			[relayKey(round.slug, "bbbbbbbb", "impact")]: b64(
				"decaf,gone,beans,decaf,extra",
			),
		};
		expect(decodeRelayBallots(round, nominees, data).get("bbbbbbbb")).toEqual({
			impact: ["decaf", "beans"],
		});
	});

	it("refuses a slate whose joined picks would not fit the 64-byte entry", () => {
		const long = Array.from({ length: 4 }, (_, i) => `${"n".repeat(15)}${i}`);
		const r = { ...round, picksPerCategory: 4 } as BallotRound;
		const noms = long.map((slug) => ({ category: "impact", slug, name: slug }));
		const v = validateSelections(r, noms, { impact: long });
		expect(v.ok).toBe(false);
		if (!v.ok) expect(v.errors.join()).toMatch(/exceed 64 bytes together/);
	});
});

describe("voter authorization", () => {
	const voter = Keypair.random();
	const whitelist = new Set([voter.publicKey()]);
	const seq = "12345678901234567";

	function signed(sel = picks, sequence: string | null = seq) {
		const tx = buildAuthorizationTx({
			round,
			address: voter.publicKey(),
			sequence,
			selections: sel,
		});
		tx.sign(voter);
		return tx.toXDR();
	}

	it("accepts a fresh authorization for exactly these picks", () => {
		const v = verifyAuthorization(signed(), {
			round,
			whitelist,
			selections: picks,
			sequence: seq,
		});
		expect(v.ok ? null : v.errors).toBeNull();
		expect(v.ok && v.source).toBe(voter.publicKey());
	});

	it("is not a submittable transaction", () => {
		const tx = buildAuthorizationTx({
			round,
			address: voter.publicKey(),
			sequence: seq,
			selections: picks,
		});
		// a valid tx needs current + 1; this one carries current
		expect(tx.sequence).toBe(seq);
	});

	it("works for an account that does not exist on-chain (no funding)", () => {
		const v = verifyAuthorization(signed(picks, null), {
			round,
			whitelist,
			selections: picks,
			sequence: null,
		});
		expect(v.ok).toBe(true);
	});

	it("refuses when the picks differ from what was signed", () => {
		const v = verifyAuthorization(signed(), {
			round,
			whitelist,
			selections: { ...picks, impact: ["beans", "decaf"] }, // same set, reordered
			sequence: seq,
		});
		expect(v.ok).toBe(true); // order is not a fact
		const w = verifyAuthorization(signed(), {
			round,
			whitelist,
			selections: { ...picks, impact: ["decaf"] },
			sequence: seq,
		});
		expect(w.ok).toBe(false);
		if (!w.ok) expect(w.errors.join(" ")).toMatch(/commit to these picks/);
	});

	it("refuses a submittable sequence, an expiry, and a wrong op", () => {
		// hand-rolled with current + 1: the relay could submit it
		const submittable = new TransactionBuilder(
			// biome-ignore lint/suspicious/noExplicitAny: test-only account
			new (require("@stellar/stellar-sdk").Account)(
				voter.publicKey(),
				seq,
			) as any,
			{
				fee: "10000",
				networkPassphrase: AWARDS_NETWORK_PASSPHRASE,
				memo: require("@stellar/stellar-sdk").Memo.hash(
					authorizationDigest(round.slug, picks),
				),
				timebounds: {
					minTime: 0,
					maxTime: Math.floor(Date.now() / 1000) + 600,
				},
			},
		)
			.addOperation(
				require("@stellar/stellar-sdk").Operation.manageData({
					name: "i3-awards.ballot-authorization",
					value: round.slug,
				}),
			)
			.build();
		submittable.sign(voter);
		const v = verifyAuthorization(submittable.toXDR(), {
			round,
			whitelist,
			selections: picks,
			sequence: seq,
		});
		expect(v.ok).toBe(false);
		if (!v.ok) expect(v.errors.join(" ")).toMatch(/submittable/);

		const expired = verifyAuthorization(signed(), {
			round,
			whitelist,
			selections: picks,
			sequence: seq,
			now: new Date(Date.now() + 11 * 60_000),
		});
		expect(expired.ok).toBe(false);
	});

	it("accepts an authorization a wallet wrapped in a fee-bump, crediting the inner source", () => {
		// some wallet kits return a fee-bumped envelope when sponsorship is on;
		// the inner transaction is what the voter signed and what is checked
		const inner = buildAuthorizationTx({
			round,
			address: voter.publicKey(),
			sequence: seq,
			selections: picks,
		});
		inner.sign(voter);
		const payer = Keypair.random();
		const bumped = TransactionBuilder.buildFeeBumpTransaction(
			payer,
			"100000",
			inner,
			AWARDS_NETWORK_PASSPHRASE,
		);
		bumped.sign(payer);
		const v = verifyAuthorization(bumped.toXDR(), {
			round,
			whitelist,
			selections: picks,
			sequence: seq,
		});
		expect(v.ok ? null : v.errors).toBeNull();
		expect(v.ok && v.source).toBe(voter.publicKey());
		// the payer signing the WRAPPER is not the voter signing the ballot
		const unsigned = buildAuthorizationTx({
			round,
			address: voter.publicKey(),
			sequence: seq,
			selections: picks,
		});
		const wrapped = TransactionBuilder.buildFeeBumpTransaction(
			payer,
			"100000",
			unsigned,
			AWARDS_NETWORK_PASSPHRASE,
		);
		wrapped.sign(payer);
		expect(
			verifyAuthorization(wrapped.toXDR(), {
				round,
				whitelist,
				selections: picks,
				sequence: seq,
			}).ok,
		).toBe(false);
	});

	it("refuses an outsider and a stranger's signature, accepts a listed delegate", () => {
		const stranger = Keypair.random();
		const tx = buildAuthorizationTx({
			round,
			address: stranger.publicKey(),
			sequence: seq,
			selections: picks,
		});
		tx.sign(stranger);
		expect(
			verifyAuthorization(tx.toXDR(), {
				round,
				whitelist,
				selections: picks,
				sequence: seq,
			}).ok,
		).toBe(false);

		const delegate = Keypair.random();
		const d = buildAuthorizationTx({
			round,
			address: voter.publicKey(),
			sequence: seq,
			selections: picks,
		});
		d.sign(delegate);
		expect(
			verifyAuthorization(d.toXDR(), {
				round,
				whitelist,
				selections: picks,
				sequence: seq,
			}).ok,
		).toBe(false);
		expect(
			verifyAuthorization(d.toXDR(), {
				round,
				whitelist,
				selections: picks,
				sequence: seq,
				signers: [delegate.publicKey()],
			}).ok,
		).toBe(true);
	});
});
