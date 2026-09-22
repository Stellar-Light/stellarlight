// @vitest-environment node
// (mirror.ts imports ballot.ts, which pulls the Stellar SDK — see
// awards-ballot.test.ts for why that suite runs outside jsdom.)

/**
 * i³ Awards mirror — the DB copy as a tally source after a testnet reset.
 *
 * The invariant that matters: a tally rebuilt from the mirror is IDENTICAL to
 * the tally read from the chain for the same ballots. Everything else here
 * pins the reconcile diff so a class can't silently change meaning.
 */

import { describe, expect, it } from "vitest";
import {
	type BallotNominee,
	type BallotRound,
	type BallotSelections,
	dataKey,
	decodeAccountVotes,
	tallyRound,
} from "../awards/ballot";
import {
	mirrorAccountData,
	normalizeSelections,
	planReconcile,
	sameSelections,
	summarizeReconcile,
} from "../awards/mirror";

const round: BallotRound = {
	slug: "i3-2026-test",
	status: "closed",
	ballotMode: "one-per-category",
	categories: [
		{ key: "impact", name: "Impact", tagline: null },
		{ key: "innovation", name: "Innovation", tagline: null },
	],
	opensAt: null,
	closesAt: null,
};
const shortlist: BallotRound = {
	...round,
	slug: "i3-2026-shortlist",
	ballotMode: "multi-pick",
	picksPerCategory: 2,
};
const nominees: BallotNominee[] = [
	{ category: "impact", slug: "decaf", name: "Decaf" },
	{ category: "impact", slug: "beans", name: "Beans" },
	{ category: "innovation", slug: "blend", name: "Blend" },
	{ category: "innovation", slug: "reflector", name: "Reflector" },
];
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("mirrorAccountData", () => {
	it("round-trips a single-pick ballot through decodeAccountVotes", () => {
		const selections = { impact: ["decaf"], innovation: ["blend"] };
		const acct = mirrorAccountData(round, { address: "GA1", selections });
		expect(acct.data).toEqual({
			[dataKey(round.slug, "impact")]: b64("decaf"),
			[dataKey(round.slug, "innovation")]: b64("blend"),
		});
		expect(decodeAccountVotes(round, nominees, acct.data ?? {})).toEqual(
			selections,
		);
	});

	it("round-trips a multi-pick ballot into slots and drops picks past the cap", () => {
		const acct = mirrorAccountData(shortlist, {
			address: "GA1",
			selections: { impact: ["decaf", "beans", "ghost"] },
		});
		expect(acct.data).toEqual({
			[dataKey(shortlist.slug, "impact", 1)]: b64("decaf"),
			[dataKey(shortlist.slug, "impact", 2)]: b64("beans"),
		});
		expect(decodeAccountVotes(shortlist, nominees, acct.data ?? {})).toEqual({
			impact: ["decaf", "beans"],
		});
	});

	it("mirror-backed tally equals chain-backed tally for the same ballots", () => {
		const chain = [
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
			{ address: "GA4", data: {} },
			{ address: "GA5", data: null },
		];
		const mirror = new Map<string, BallotSelections>([
			["GA1", { impact: ["decaf"], innovation: ["blend"] }],
			["GA2", { impact: ["decaf"] }],
			["GA3", { impact: ["beans"] }],
		]);
		const rebuilt = chain.map(({ address }) => {
			const s = mirror.get(address);
			return s
				? mirrorAccountData(round, { address, selections: s })
				: { address, data: null };
		});
		expect(tallyRound(round, nominees, rebuilt)).toEqual(
			tallyRound(round, nominees, chain),
		);
	});
});

describe("normalizeSelections / sameSelections", () => {
	it("accepts the recorded array shape and the legacy single-slug shape", () => {
		expect(
			normalizeSelections({ impact: ["decaf", "decaf"], innovation: "blend" }),
		).toEqual({ impact: ["decaf"], innovation: ["blend"] });
	});

	it("drops junk rather than trusting the JSON column", () => {
		expect(normalizeSelections(null)).toEqual({});
		expect(normalizeSelections("decaf")).toEqual({});
		expect(normalizeSelections(["decaf"])).toEqual({});
		expect(
			normalizeSelections({ impact: [1, null, ""], innovation: 7, x: [] }),
		).toEqual({});
	});

	it("compares picks ignoring order and empty categories", () => {
		expect(
			sameSelections(
				{ impact: ["beans", "decaf"], innovation: [] },
				{ impact: ["decaf", "beans"] },
			),
		).toBe(true);
		expect(sameSelections({ impact: ["decaf"] }, { impact: ["beans"] })).toBe(
			false,
		);
		expect(
			sameSelections(
				{ impact: ["decaf"] },
				{ impact: ["decaf"], innovation: ["blend"] },
			),
		).toBe(false);
	});
});

describe("planReconcile — relay ↔ record", () => {
	const row = (
		address: string,
		ballotId: string | null,
		selections: Record<string, string[]>,
		confirmed = true,
	) => ({ address, ballotId, selections, confirmed });

	it("classifies every way the two can disagree", () => {
		const rows = [
			row("GA1", "aaaaaaaa", { impact: ["decaf"] }),
			row("GA2", "bbbbbbbb", { impact: ["decaf"] }),
			row("GA3", "cccccccc", { impact: ["decaf"] }),
			row("GA4", "dddddddd", { impact: ["decaf"] }, false),
			row("GA5", "eeeeeeee", { impact: ["decaf"] }, false),
		];
		const relay = new Map([
			["aaaaaaaa", { impact: ["decaf"] }], // ok
			["bbbbbbbb", { impact: ["beans"] }], // differs
			// cccccccc missing → chain-empty
			["dddddddd", { impact: ["decaf"] }], // unconfirmed, on relay → confirmable
			// eeeeeeee missing → unconfirmed, abandoned
			["ffffffff", { impact: ["beans"] }], // orphan
		]);
		const actions = planReconcile(rows, relay);
		const kinds = Object.fromEntries(
			actions.map((a) => ["ballotId" in a ? a.ballotId : "", a.kind]),
		);
		expect(kinds).toEqual({
			aaaaaaaa: "ok",
			bbbbbbbb: "differs",
			cccccccc: "chain-empty",
			dddddddd: "unconfirmed",
			eeeeeeee: "unconfirmed",
			ffffffff: "orphan",
		});
		const unconfirmed = actions.filter(
			(a) => a.kind === "unconfirmed",
		) as Array<{ ballotId: string; onRelay: boolean }>;
		expect(unconfirmed.find((a) => a.ballotId === "dddddddd")?.onRelay).toBe(
			true,
		);
		expect(unconfirmed.find((a) => a.ballotId === "eeeeeeee")?.onRelay).toBe(
			false,
		);
	});

	it("a row with no ballot id is reported as legacy, not misfiled", () => {
		expect(
			planReconcile([row("GA1", null, { impact: ["decaf"] })], new Map()),
		).toEqual([{ kind: "legacy", address: "GA1" }]);
	});

	it("suspects a reset only when confirmed rows exist and the relay holds none of them", () => {
		const rows = [row("GA1", "aaaaaaaa", { impact: ["decaf"] })];
		expect(
			summarizeReconcile(planReconcile(rows, new Map())).resetSuspected,
		).toBe(true);
		expect(
			summarizeReconcile(
				planReconcile(rows, new Map([["aaaaaaaa", { impact: ["decaf"] }]])),
			).resetSuspected,
		).toBe(false);
		// an orphan on the relay means the relay was NOT wiped
		expect(
			summarizeReconcile(
				planReconcile(rows, new Map([["zzzzzzzz", { impact: ["decaf"] }]])),
			).resetSuspected,
		).toBe(false);
		// no confirmed rows at all is not a reset, it is an empty round
		expect(
			summarizeReconcile(planReconcile([], new Map())).resetSuspected,
		).toBe(false);
	});
});
