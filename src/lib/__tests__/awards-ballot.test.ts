// @vitest-environment node
// (jsdom's cross-realm Uint8Array breaks @noble/ed25519's byte checks inside
// the Stellar SDK; this suite is pure logic and needs no DOM.)

/**
 * i³ Awards ballot logic — unit tests.
 *
 * Everything here runs offline: transactions are built + signed with
 * throwaway keypairs, Horizon is a mocked fetch. The relay-gate tests
 * (validateSignedBallot) are the security-relevant ones — they pin the
 * exact shapes POST /api/awards/submit will and will not relay.
 */

import {
	Account,
	Asset,
	Keypair,
	Networks,
	Operation,
	TransactionBuilder,
} from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type BallotNominee,
	type BallotRound,
	buildBallotTx,
	dataKey,
	decodeAccountVotes,
	roundOpenState,
	tallyRound,
	validateSelections,
	validateSignedBallot,
} from "../awards/ballot";
import { fetchTestnetAccount, submitToTestnetHorizon } from "../awards/stellar";

const voter = Keypair.random();
const stranger = Keypair.random();

const round: BallotRound = {
	slug: "i3-2026-test",
	status: "open",
	ballotMode: "one-per-category",
	categories: [
		{ key: "impact", name: "Impact", tagline: null },
		{ key: "innovation", name: "Innovation", tagline: null },
		{ key: "interoperability", name: "Interoperability", tagline: null },
	],
	opensAt: null,
	closesAt: null,
};

const nominees: BallotNominee[] = [
	{ category: "impact", slug: "decaf", name: "Decaf" },
	{ category: "impact", slug: "beans", name: "Beans" },
	{ category: "innovation", slug: "blend", name: "Blend" },
	{ category: "innovation", slug: "reflector", name: "Reflector" },
	{ category: "interoperability", slug: "allbridge", name: "Allbridge" },
	{ category: "interoperability", slug: "rubic", name: "Rubic" },
];

const whitelist = new Set([voter.publicKey()]);

/** Build + sign a well-formed ballot (the happy-path artifact). */
function signedBallot(
	selections: Record<string, string>,
	opts: { passphrase?: string; signer?: Keypair } = {},
) {
	const tx = buildBallotTx({
		round,
		address: voter.publicKey(),
		sequence: "1234567890",
		selections,
	});
	if (opts.passphrase && opts.passphrase !== Networks.TESTNET) {
		// Re-build under another network to simulate a mainnet-signed payload.
		const account = new Account(voter.publicKey(), "1234567890");
		const builder = new TransactionBuilder(account, {
			fee: "10000",
			networkPassphrase: opts.passphrase,
		});
		for (const [category, slug] of Object.entries(selections)) {
			builder.addOperation(
				Operation.manageData({
					name: dataKey(round.slug, category),
					value: slug,
				}),
			);
		}
		const other = builder.setTimeout(300).build();
		other.sign(opts.signer ?? voter);
		return other.toXDR();
	}
	tx.sign(opts.signer ?? voter);
	return tx.toXDR();
}

// ── buildBallotTx ────────────────────────────────────────────────────────────

describe("buildBallotTx", () => {
	it("emits one manageData op per selected category with the i3.<round>.<category> key", () => {
		const tx = buildBallotTx({
			round,
			address: voter.publicKey(),
			sequence: "7",
			selections: { impact: "decaf", innovation: "blend" },
		});
		expect(tx.operations).toHaveLength(2);
		const ops = tx.operations as Array<{
			type: string;
			name: string;
			value?: Buffer;
		}>;
		expect(ops.every((o) => o.type === "manageData")).toBe(true);
		expect(ops.map((o) => o.name).sort()).toEqual([
			"i3.i3-2026-test.impact",
			"i3.i3-2026-test.innovation",
		]);
		const impactOp = ops.find((o) => o.name.endsWith(".impact"));
		expect(impactOp?.value?.toString("utf8")).toBe("decaf");
	});

	it("uses the voter as source with the next sequence", () => {
		const tx = buildBallotTx({
			round,
			address: voter.publicKey(),
			sequence: "41",
			selections: { impact: "decaf" },
		});
		expect(tx.source).toBe(voter.publicKey());
		expect(tx.sequence).toBe("42");
	});

	it("is a plain (fee-bump-friendly) transaction with a bounded timeout", () => {
		const tx = buildBallotTx({
			round,
			address: voter.publicKey(),
			sequence: "1",
			selections: { impact: "decaf" },
		});
		expect("innerTransaction" in tx).toBe(false);
		const max = Number(tx.timeBounds?.maxTime ?? 0);
		expect(max).toBeGreaterThan(Date.now() / 1000);
		expect(max).toBeLessThanOrEqual(Date.now() / 1000 + 301);
	});

	it("refuses a malformed address", () => {
		expect(() =>
			buildBallotTx({
				round,
				address: "not-an-address",
				sequence: "1",
				selections: { impact: "decaf" },
			}),
		).toThrow(/invalid voter address/);
	});
});

// ── validateSelections ──────────────────────────────────────────────────────

describe("validateSelections", () => {
	it("accepts one valid nominee per category", () => {
		const res = validateSelections(round, nominees, {
			impact: "decaf",
			interoperability: "rubic",
		});
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.selections).toEqual({
				impact: "decaf",
				interoperability: "rubic",
			});
		}
	});

	it("rejects an empty ballot", () => {
		const res = validateSelections(round, nominees, {});
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.errors.join()).toMatch(/at least one/);
	});

	it("rejects unknown categories and cross-category nominees", () => {
		const bogusCategory = validateSelections(round, nominees, {
			vibes: "decaf",
		});
		expect(bogusCategory.ok).toBe(false);

		// blend is an innovation nominee — voting it under impact must fail.
		const crossCategory = validateSelections(round, nominees, {
			impact: "blend",
		});
		expect(crossCategory.ok).toBe(false);
		if (!crossCategory.ok) {
			expect(crossCategory.errors.join()).toMatch(/not a nominee in "impact"/);
		}
	});

	it("rejects non-object shapes (arrays, strings, null)", () => {
		for (const bad of [null, "decaf", ["decaf"], 42]) {
			expect(validateSelections(round, nominees, bad).ok).toBe(false);
		}
	});
});

// ── roundOpenState ──────────────────────────────────────────────────────────

describe("roundOpenState", () => {
	it("only an open round inside its window accepts ballots", () => {
		expect(roundOpenState(round).open).toBe(true);
		expect(roundOpenState({ ...round, status: "draft" }).open).toBe(false);
		expect(roundOpenState({ ...round, status: "closed" }).open).toBe(false);
		expect(
			roundOpenState({
				...round,
				opensAt: new Date(Date.now() + 60_000).toISOString(),
			}).open,
		).toBe(false);
		expect(
			roundOpenState({
				...round,
				closesAt: new Date(Date.now() - 60_000).toISOString(),
			}).open,
		).toBe(false);
	});
});

// ── validateSignedBallot (the relay gate) ───────────────────────────────────

describe("validateSignedBallot", () => {
	const ctx = { round, nominees, whitelist };

	it("accepts a well-formed testnet ballot signed by a whitelisted voter", () => {
		const verdict = validateSignedBallot(
			signedBallot({ impact: "decaf", innovation: "blend" }),
			ctx,
		);
		expect(verdict.ok).toBe(true);
		if (verdict.ok) {
			expect(verdict.source).toBe(voter.publicKey());
			expect(verdict.selections).toEqual({
				impact: "decaf",
				innovation: "blend",
			});
		}
	});

	it("rejects a non-whitelisted source", () => {
		const account = new Account(stranger.publicKey(), "9");
		const tx = new TransactionBuilder(account, {
			fee: "10000",
			networkPassphrase: Networks.TESTNET,
		})
			.addOperation(
				Operation.manageData({
					name: dataKey(round.slug, "impact"),
					value: "decaf",
				}),
			)
			.setTimeout(300)
			.build();
		tx.sign(stranger);
		const verdict = validateSignedBallot(tx.toXDR(), ctx);
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.errors.join()).toMatch(/whitelist/);
	});

	it("rejects when the round is closed", () => {
		const verdict = validateSignedBallot(signedBallot({ impact: "decaf" }), {
			...ctx,
			round: { ...round, status: "closed" },
		});
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.errors.join()).toMatch(/not open/);
	});

	it("rejects payment operations (never an open relay)", () => {
		const account = new Account(voter.publicKey(), "9");
		const tx = new TransactionBuilder(account, {
			fee: "10000",
			networkPassphrase: Networks.TESTNET,
		})
			.addOperation(
				Operation.payment({
					destination: stranger.publicKey(),
					asset: Asset.native(),
					amount: "1",
				}),
			)
			.setTimeout(300)
			.build();
		tx.sign(voter);
		const verdict = validateSignedBallot(tx.toXDR(), ctx);
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) {
			expect(verdict.errors.join()).toMatch(/manageData only/);
		}
	});

	it("rejects manageData keys outside this round's namespace", () => {
		const account = new Account(voter.publicKey(), "9");
		const tx = new TransactionBuilder(account, {
			fee: "10000",
			networkPassphrase: Networks.TESTNET,
		})
			.addOperation(
				Operation.manageData({ name: "config.webhook_url", value: "evil" }),
			)
			.setTimeout(300)
			.build();
		tx.sign(voter);
		const verdict = validateSignedBallot(tx.toXDR(), ctx);
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.errors.join()).toMatch(/namespace/);
	});

	it("rejects duplicate votes for one category", () => {
		const account = new Account(voter.publicKey(), "9");
		const tx = new TransactionBuilder(account, {
			fee: "20000",
			networkPassphrase: Networks.TESTNET,
		})
			.addOperation(
				Operation.manageData({
					name: dataKey(round.slug, "impact"),
					value: "decaf",
				}),
			)
			.addOperation(
				Operation.manageData({
					name: dataKey(round.slug, "impact"),
					value: "beans",
				}),
			)
			.setTimeout(300)
			.build();
		tx.sign(voter);
		const verdict = validateSignedBallot(tx.toXDR(), ctx);
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.errors.join()).toMatch(/duplicate/);
	});

	it("rejects a vote for a non-nominee", () => {
		const account = new Account(voter.publicKey(), "9");
		const tx = new TransactionBuilder(account, {
			fee: "10000",
			networkPassphrase: Networks.TESTNET,
		})
			.addOperation(
				Operation.manageData({
					name: dataKey(round.slug, "impact"),
					value: "totally-fake-project",
				}),
			)
			.setTimeout(300)
			.build();
		tx.sign(voter);
		const verdict = validateSignedBallot(tx.toXDR(), ctx);
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.errors.join()).toMatch(/not a nominee/);
	});

	it("rejects a transaction signed for MAINNET (structural testnet-only)", () => {
		const xdr = signedBallot(
			{ impact: "decaf" },
			{ passphrase: Networks.PUBLIC },
		);
		const verdict = validateSignedBallot(xdr, ctx);
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) {
			expect(verdict.errors.join()).toMatch(/TESTNET|signed/);
		}
	});

	it("rejects a ballot signed by someone other than the source", () => {
		const xdr = signedBallot({ impact: "decaf" }, { signer: stranger });
		const verdict = validateSignedBallot(xdr, ctx);
		expect(verdict.ok).toBe(false);
	});

	it("rejects unsigned ballots and garbage XDR", () => {
		const tx = buildBallotTx({
			round,
			address: voter.publicKey(),
			sequence: "1",
			selections: { impact: "decaf" },
		});
		expect(validateSignedBallot(tx.toXDR(), ctx).ok).toBe(false);
		expect(validateSignedBallot("not-xdr-at-all", ctx).ok).toBe(false);
	});

	it("rejects entry deletions (manageData with null value)", () => {
		const account = new Account(voter.publicKey(), "9");
		const tx = new TransactionBuilder(account, {
			fee: "10000",
			networkPassphrase: Networks.TESTNET,
		})
			.addOperation(
				Operation.manageData({
					name: dataKey(round.slug, "impact"),
					value: null,
				}),
			)
			.setTimeout(300)
			.build();
		tx.sign(voter);
		const verdict = validateSignedBallot(tx.toXDR(), ctx);
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.errors.join()).toMatch(/deletes/);
	});
});

// ── tallying ────────────────────────────────────────────────────────────────

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("decodeAccountVotes / tallyRound", () => {
	it("decodes only this round's valid entries", () => {
		const votes = decodeAccountVotes(round, nominees, {
			[dataKey(round.slug, "impact")]: b64("decaf"),
			[dataKey(round.slug, "innovation")]: b64("no-such-nominee"),
			"i3.other-round.impact": b64("beans"),
			unrelated_key: b64("noise"),
		});
		expect(votes).toEqual({ impact: "decaf" });
	});

	it("aggregates votes per category with turnout, no address mapping", () => {
		const accounts = [
			{
				address: "GA1",
				data: {
					[dataKey(round.slug, "impact")]: b64("decaf"),
					[dataKey(round.slug, "innovation")]: b64("blend"),
				},
			},
			{
				address: "GA2",
				data: { [dataKey(round.slug, "impact")]: b64("decaf") },
			},
			{
				address: "GA3",
				data: { [dataKey(round.slug, "impact")]: b64("beans") },
			},
			{ address: "GA4", data: {} }, // funded, never voted
			{ address: "GA5", data: null }, // unfunded
		];
		const tally = tallyRound(round, nominees, accounts);
		expect(tally.turnout).toEqual({ voted: 3, whitelisted: 5 });
		const impact = tally.categories.find((c) => c.key === "impact");
		expect(impact?.results[0]).toEqual({
			slug: "decaf",
			name: "Decaf",
			votes: 2,
		});
		expect(impact?.results[1]).toEqual({
			slug: "beans",
			name: "Beans",
			votes: 1,
		});
		expect(impact?.totalVotes).toBe(3);
		// aggregate-only shape: no address appears anywhere in the tally
		expect(JSON.stringify(tally)).not.toContain("GA1");
	});
});

// ── Horizon helpers (mocked fetch) ──────────────────────────────────────────

describe("Horizon helpers", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("fetchTestnetAccount: funded account returns sequence + data", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({ sequence: "99", data: { k: b64("v") } }),
						{ status: 200 },
					),
			),
		);
		const res = await fetchTestnetAccount(voter.publicKey());
		expect(res).toEqual({
			funded: true,
			account: { sequence: "99", data: { k: b64("v") } },
		});
	});

	it("fetchTestnetAccount: 404 means unfunded (friendbot case)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("{}", { status: 404 })),
		);
		expect(await fetchTestnetAccount(voter.publicKey())).toEqual({
			funded: false,
		});
	});

	it("submitToTestnetHorizon: success returns the hash", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(JSON.stringify({ hash: "abc123" }), { status: 200 }),
			),
		);
		expect(await submitToTestnetHorizon("AAAA")).toEqual({
			ok: true,
			hash: "abc123",
		});
	});

	it("submitToTestnetHorizon: surfaces Horizon result codes on failure", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							detail: "tx failed",
							extras: {
								result_codes: { transaction: "tx_bad_seq", operations: [] },
							},
						}),
						{ status: 400 },
					),
			),
		);
		const res = await submitToTestnetHorizon("AAAA");
		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.resultCodes).toContain("tx_bad_seq");
			expect(res.status).toBe(400);
		}
	});
});
