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

import { Keypair } from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type BallotNominee,
	type BallotRound,
	type BallotSelections,
	dataKey,
	decodeAccountVotes,
	roundOpenState,
	TEST_BALLOT_MEMO,
	tallyRound,
	validateSelections,
} from "../awards/ballot";
import {
	fetchTestnetAccount,
	fundViaFriendbot,
	submitToTestnetHorizon,
} from "../awards/stellar";

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

// ── buildBallotTx ────────────────────────────────────────────────────────────

// ── validateSelections ──────────────────────────────────────────────────────

describe("validateSelections", () => {
	it("accepts one valid nominee per category", () => {
		const res = validateSelections(round, nominees, {
			impact: ["decaf"],
			innovation: ["blend"],
			interoperability: ["rubic"],
		});
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.selections).toEqual({
				impact: ["decaf"],
				innovation: ["blend"],
				interoperability: ["rubic"],
			});
		}
	});

	// This used to pass. Under one-ballot-per-voter it must not: the first
	// ballot is the only one that counts, so an incomplete ballot is permanent
	// and the voter can never fill in the categories they left blank.
	it("refuses a ballot that leaves a category blank", () => {
		const res = validateSelections(round, nominees, {
			impact: ["decaf"],
			interoperability: ["rubic"],
		});
		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.errors.join(" ")).toMatch(/"innovation" needs 1 pick, got 0/);
		}
	});

	it("still requires nothing of a category that has no nominees", () => {
		// a category whose nominees never imported is unvotable; demanding a
		// pick there would refuse every ballot in the round, not just that one
		const res = validateSelections(
			round,
			nominees.filter((n) => n.category !== "innovation"),
			{ impact: ["decaf"], interoperability: ["rubic"] },
		);
		expect(res.ok).toBe(true);
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
			impact: ["blend"],
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
		expect(votes).toEqual({ impact: ["decaf"] });
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
			account: { sequence: "99", data: { k: b64("v") }, signers: [] },
		});
	});

	it("fetchTestnetAccount: keeps only ed25519 signers with weight", async () => {
		// the signer set is what lets a delegated or multisig Pilot vote, so a
		// weight-0 key (revoked master) or a non-ed25519 signer must not be in it
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							sequence: "99",
							data: {},
							signers: [
								{
									key: voter.publicKey(),
									type: "ed25519_public_key",
									weight: 0,
								},
								{ key: "GDELEGATE", type: "ed25519_public_key", weight: 1 },
								{ key: "XHASH", type: "sha256_hash", weight: 5 },
							],
						}),
						{ status: 200 },
					),
			),
		);
		const res = await fetchTestnetAccount(voter.publicKey());
		expect(res.funded === true && res.account.signers).toEqual(["GDELEGATE"]);
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

// ── test-round memo marker ──────────────────────────────────────────────────

// ── Shortlist round: pick N per category ───────────────────────────────────
// Emir's phase 1: "vote for their four favorite projects in each category.
// The order won't matter. The top four projects will then move forward."

// ── friendbot, server-side ───────────────────────────────────────────────────

describe("fundViaFriendbot", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("200 = funded", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("{}", { status: 200 })),
		);
		expect(await fundViaFriendbot(voter.publicKey())).toEqual({
			ok: true,
			already: false,
		});
	});

	it("400 op_already_exists = someone funded it first, still success", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							extras: { result_codes: { operations: ["op_already_exists"] } },
						}),
						{ status: 400 },
					),
			),
		);
		expect(await fundViaFriendbot(voter.publicKey())).toEqual({
			ok: true,
			already: true,
		});
	});

	it("rate-limited or down = not funded, with the reason", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("slow down", { status: 429 })),
		);
		expect(await fundViaFriendbot(voter.publicKey())).toEqual({
			ok: false,
			error: "friendbot responded 429",
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("ECONNRESET");
			}),
		);
		const res = await fundViaFriendbot(voter.publicKey());
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.error).toMatch(/unreachable/);
	});
});

describe("roundOpenState fails closed on a bad date", () => {
	it("an unparseable closesAt does not mean the round never closes", () => {
		// `now >= new Date("garbage")` is false, which used to read as OPEN
		const r = roundOpenState({ ...round, closesAt: "not-a-date" });
		expect(r.open).toBe(false);
		expect(r.reason).toMatch(/closesAt/);
	});
	it("an unparseable opensAt does not mean the round is already open", () => {
		const r = roundOpenState({ ...round, opensAt: "soon" });
		expect(r.open).toBe(false);
	});
	it("valid dates still behave", () => {
		const past = new Date(Date.now() - 60_000).toISOString();
		const future = new Date(Date.now() + 60_000).toISOString();
		expect(
			roundOpenState({ ...round, opensAt: past, closesAt: future }).open,
		).toBe(true);
		expect(roundOpenState({ ...round, closesAt: past }).open).toBe(false);
	});
});

describe("multi-pick (shortlist) rounds — validateSelections", () => {
	const shortlist: BallotRound = { ...round, picksPerCategory: 4 };
	const pool: BallotNominee[] = [
		{ category: "impact", slug: "decaf", name: "Decaf" },
		{ category: "impact", slug: "beans", name: "Beans" },
		{ category: "impact", slug: "blend", name: "Blend" },
		{ category: "impact", slug: "rubic", name: "Rubic" },
		{ category: "impact", slug: "allbridge", name: "Allbridge" },
	];

	it("accepts exactly the slate", () => {
		const r = validateSelections(shortlist, pool, {
			impact: ["decaf", "beans", "blend", "rubic"],
		});
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.selections.impact).toHaveLength(4);
	});

	it("refuses a fifth pick rather than silently truncating it", () => {
		const r = validateSelections(shortlist, pool, {
			impact: ["decaf", "beans", "blend", "rubic", "allbridge"],
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.errors.join(" ")).toMatch(/at most 4 picks/);
	});

	it("refuses the same nominee twice — one voter, one voice", () => {
		const r = validateSelections(shortlist, pool, {
			impact: ["decaf", "decaf"],
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.errors.join(" ")).toMatch(/picked twice/);
	});

	it("refuses fewer than the slate — the phase asks for a full one", () => {
		// nominations: "a minimum of 4 per category, so 4 can be shortlisted";
		// under one-ballot-per-voter a short slate would be permanent
		const r = validateSelections(shortlist, pool, { impact: ["decaf"] });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.errors.join(" ")).toMatch(/needs 4 picks, got 1/);
	});

	it("requires only as many as a thin category has", () => {
		const thin = pool.slice(0, 2);
		expect(
			validateSelections(shortlist, thin, { impact: ["decaf", "beans"] }).ok,
		).toBe(true);
		const short = validateSelections(shortlist, thin, { impact: ["decaf"] });
		expect(short.ok).toBe(false);
		if (!short.ok) expect(short.errors.join(" ")).toMatch(/needs 2 picks/);
	});
});
