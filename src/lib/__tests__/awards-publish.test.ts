// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
	type BallotNominee,
	type BallotRound,
	dataKey,
	type RoundTally,
	tallyRound,
} from "../awards/ballot";
import {
	ballotsDigest,
	mergeAccounts,
	resultsDocument,
} from "../awards/publish";
import { firstBallotSelections } from "../awards/record";
import type { LoadedRound } from "../awards/round";

const loaded = {
	round: {
		slug: "i3-2026",
		title: "i³ Awards 2026",
		status: "closed",
		ballotMode: "one-per-category",
		picksPerCategory: 1,
		categories: [{ key: "impact", name: "Impact", tagline: null }],
		opensAt: "2026-10-01T00:00:00.000Z",
		closesAt: "2026-10-15T00:00:00.000Z",
	},
	nominees: [],
	whitelist: new Set(["GA1", "GA2", "GA3"]),
} as unknown as LoadedRound;

const tally: RoundTally = {
	turnout: { voted: 2, whitelisted: 3 },
	categories: [
		{
			key: "impact",
			name: "Impact",
			tagline: null,
			totalVotes: 2,
			results: [
				{ slug: "decaf", name: "Decaf", votes: 2 },
				{ slug: "beans", name: "Beans", votes: 0 },
			],
		},
	],
};

describe("resultsDocument", () => {
	it("is aggregate-only and says where the tally came from", () => {
		const doc = resultsDocument(loaded, tally, "mirror", "abc123", new Date(0));
		expect(doc.round).toBe("i3-2026");
		expect(doc.source).toBe("mirror");
		expect(doc.turnout).toEqual({ voted: 2, whitelisted: 3 });
		expect(doc.categories[0].results[0]).toEqual({
			slug: "decaf",
			name: "Decaf",
			votes: 2,
		});
		expect(doc.generatedAt).toBe("1970-01-01T00:00:00.000Z");
		const text = JSON.stringify(doc);
		for (const addr of loaded.whitelist) expect(text).not.toContain(addr);
		expect(text).not.toMatch(/txHash|history/);
		expect(doc.note).toContain("/api/awards/anchor?round=i3-2026");
	});
});

describe("mergeAccounts", () => {
	const round: BallotRound = {
		slug: "i3-2026",
		status: "open",
		ballotMode: "one-per-category",
		categories: [{ key: "impact", name: "Impact", tagline: null }],
		opensAt: null,
		closesAt: null,
	};
	const nominees: BallotNominee[] = [
		{ category: "impact", slug: "decaf", name: "Decaf" },
		{ category: "impact", slug: "beans", name: "Beans" },
	];
	const b64 = (v: string) => Buffer.from(v).toString("base64");
	const vote = (slug: string) => ({
		[dataKey(round.slug, "impact")]: b64(slug),
	});

	it("the mirror wins per address, because it holds the FIRST ballot", () => {
		// G-BOTH is the whole point: they voted decaf, then voted again and the
		// chain now shows beans. A manageData overwrite destroyed the original
		// value, so the chain CANNOT tell you decaf ever happened — only the
		// mirror can, and decaf is what must be counted.
		const chain = new Map<string, Record<string, string> | null>([
			["G-BOTH", vote("beans")], // revoted; chain shows only the latest
			["G-CHAIN", vote("decaf")], // no mirror row — voted outside the relay
			["G-FUNDED-NO-VOTE", {}], // account exists, entries gone
			["G-WIPED", null], // account gone (reset) or Horizon failed
			["G-NEVER", null],
		]);
		const mirror = new Map([
			["G-BOTH", { impact: ["decaf"] }],
			["G-FUNDED-NO-VOTE", { impact: ["decaf"] }],
			["G-WIPED", { impact: ["beans"] }],
		]);
		const m = mergeAccounts(round, nominees, [...chain.keys()], chain, mirror);
		// only G-CHAIN falls through to the chain now
		expect(m.chainVoters).toBe(1);
		expect(m.mirrorVoters).toBe(3);
		const tally = tallyRound(round, nominees, m.accounts);
		expect(tally.turnout).toEqual({ voted: 4, whitelisted: 5 });
		const votes = Object.fromEntries(
			tally.categories[0].results.map((r) => [r.slug, r.votes]),
		);
		// decaf 3 — G-BOTH's FIRST ballot, plus G-FUNDED-NO-VOTE and G-CHAIN.
		// beans 1 — G-WIPED only. G-BOTH's revote to beans is not counted at all.
		expect(votes).toEqual({ decaf: 3, beans: 1 });
		// and the revote is NOT also counted — nobody is counted twice
		expect(tally.categories[0].totalVotes).toBe(4);
	});

	it("counts a voter once when chain and mirror agree", () => {
		const chain = new Map<string, Record<string, string> | null>([
			["G-ONE", vote("decaf")],
		]);
		const mirror = new Map([["G-ONE", { impact: ["decaf"] }]]);
		const m = mergeAccounts(round, nominees, ["G-ONE"], chain, mirror);
		expect(m.mirrorVoters).toBe(1);
		expect(m.chainVoters).toBe(0);
		expect(tallyRound(round, nominees, m.accounts).turnout.voted).toBe(1);
	});

	it("an empty mirror row does not mask a real chain ballot", () => {
		const chain = new Map<string, Record<string, string> | null>([
			["G-X", vote("beans")],
		]);
		const mirror = new Map([["G-X", {}]]);
		const m = mergeAccounts(round, nominees, ["G-X"], chain, mirror);
		expect(m.chainVoters).toBe(1);
		expect(tallyRound(round, nominees, m.accounts).turnout.voted).toBe(1);
	});
});

describe("firstBallotSelections", () => {
	it("takes history[0] — the first ballot — not the current selections", () => {
		expect(
			firstBallotSelections({
				selections: { impact: ["beans"] }, // the revote
				history: [
					{ selections: { impact: ["decaf"] } }, // the one that counts
					{ selections: { impact: ["beans"] } },
				],
			}),
		).toEqual({ impact: ["decaf"] });
	});

	it("falls back to selections when there is no history", () => {
		// rows written before the trail existed, and rows the reconcile lane
		// creates straight from chain
		expect(
			firstBallotSelections({ selections: { impact: ["decaf"] } }),
		).toEqual({ impact: ["decaf"] });
		expect(
			firstBallotSelections({ selections: { impact: ["decaf"] }, history: [] }),
		).toEqual({ impact: ["decaf"] });
	});

	it("skips empty history entries rather than zeroing the voter out", () => {
		expect(
			firstBallotSelections({
				selections: { impact: ["beans"] },
				history: [
					{ selections: null },
					{ selections: {} },
					{ selections: { impact: ["decaf"] } },
				],
			}),
		).toEqual({ impact: ["decaf"] });
	});

	it("accepts the string shape the JSON column also allows", () => {
		expect(
			firstBallotSelections({
				selections: {},
				history: [{ selections: { impact: "decaf" } }],
			}),
		).toEqual({ impact: ["decaf"] });
	});
});

describe("ballotsDigest", () => {
	const a = {
		address: "GA1",
		selections: { impact: ["decaf"] },
		txHash: "h1",
		at: "2026-10-01T00:00:00.000Z",
	};
	const b = {
		address: "GA2",
		selections: { impact: ["beans"], innovation: ["blend"] },
		txHash: "h2",
		at: "2026-10-02T00:00:00.000Z",
	};

	it("is stable and independent of row order", () => {
		// the DB returns rows in whatever order it likes; the digest must not
		expect(ballotsDigest([a, b])).toBe(ballotsDigest([b, a]));
		expect(ballotsDigest([a, b])).toMatch(/^[0-9a-f]{64}$/);
	});

	it("changes if any counted fact changes", () => {
		const base = ballotsDigest([a, b]);
		// a different pick
		expect(
			ballotsDigest([{ ...a, selections: { impact: ["beans"] } }, b]),
		).not.toBe(base);
		// a different tx
		expect(ballotsDigest([{ ...a, txHash: "h9" }, b])).not.toBe(base);
		// a different timestamp
		expect(
			ballotsDigest([{ ...a, at: "2026-10-09T00:00:00.000Z" }, b]),
		).not.toBe(base);
		// a voter removed, or added
		expect(ballotsDigest([a])).not.toBe(base);
		expect(ballotsDigest([a, b, { ...a, address: "GA3" }])).not.toBe(base);
	});

	it("ignores orderings that carry no meaning", () => {
		// pick order within a category, and category order, are not facts
		expect(
			ballotsDigest([
				{ ...a, selections: { impact: ["x", "y"], innovation: ["z"] } },
			]),
		).toBe(
			ballotsDigest([
				{ ...a, selections: { innovation: ["z"], impact: ["y", "x"] } },
			]),
		);
	});

	it("normalises the address the way the record stores it", () => {
		expect(ballotsDigest([{ ...a, address: " ga1 " }])).toBe(
			ballotsDigest([a]),
		);
	});

	it("still produces a digest for a round with no ballots", () => {
		// an empty record is a claim ("nobody voted"), and it gets pinned too
		expect(ballotsDigest([])).toMatch(/^[0-9a-f]{64}$/);
		expect(ballotsDigest([])).not.toBe(ballotsDigest([a]));
	});
});
