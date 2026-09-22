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
	ballotCountsAtTime,
	ballotsDigest,
	mergeBallots,
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

describe("mergeBallots", () => {
	const rec = (
		address: string,
		selections: Record<string, string[]>,
		ballotId: string | null,
	) => ({
		address,
		selections,
		txHash: "h",
		at: "2026-10-01T00:00:00.000Z",
		ballotId,
	});

	it("counts every confirmed record row, by its first ballot", () => {
		const { accounts, recordVoters, relayOnly } = mergeBallots(
			loaded.round,
			[
				rec("GA1", { impact: ["decaf"] }, "aaaaaaaa"),
				rec("GA2", { impact: ["beans"] }, "bbbbbbbb"),
			],
			new Map([
				["aaaaaaaa", { impact: ["decaf"] }],
				["bbbbbbbb", { impact: ["beans"] }],
			]),
		);
		expect(recordVoters).toBe(2);
		expect(relayOnly).toEqual([]);
		expect(accounts.map((a) => a.address).sort()).toEqual(["GA1", "GA2"]);
	});

	it("the record wins over the relay for an id it holds — never both", () => {
		// the relay holds the id with different picks (the record was edited,
		// or the relay wrote what was signed and the row drifted): the row is
		// what is counted here, and reconcile is what flags the difference
		const { accounts } = mergeBallots(
			loaded.round,
			[rec("GA1", { impact: ["decaf"] }, "aaaaaaaa")],
			new Map([["aaaaaaaa", { impact: ["beans"] }]]),
		);
		expect(accounts).toHaveLength(1);
		expect(accounts[0].address).toBe("GA1");
	});

	it("counts a relay ballot the record does not hold, anonymously, and reports it", () => {
		const { accounts, relayOnly } = mergeBallots(
			loaded.round,
			[rec("GA1", { impact: ["decaf"] }, "aaaaaaaa")],
			new Map([
				["aaaaaaaa", { impact: ["decaf"] }],
				["cccccccc", { impact: ["beans"] }],
			]),
		);
		expect(relayOnly).toEqual(["cccccccc"]);
		expect(accounts.map((a) => a.address)).toEqual(["GA1", "relay:cccccccc"]);
	});

	it("a record row with no picks is not a voter", () => {
		const { recordVoters } = mergeBallots(
			loaded.round,
			[rec("GA1", {}, "aaaaaaaa")],
			new Map(),
		);
		expect(recordVoters).toBe(0);
	});
});

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

	it("still produces a digest for a loaded.round with no ballots", () => {
		// an empty record is a claim ("nobody voted"), and it gets pinned too
		expect(ballotsDigest([])).toMatch(/^[0-9a-f]{64}$/);
		expect(ballotsDigest([])).not.toBe(ballotsDigest([a]));
	});
});

describe("ballotCountsAtTime", () => {
	const close = "2026-09-23T16:56:18.000Z";

	it("counts a ballot cast before the close", () => {
		expect(ballotCountsAtTime("2026-09-23T16:00:00.000Z", close)).toBe(true);
	});

	it("refuses one written after the close", () => {
		// the relay checks the close time; a manageData op written straight to
		// Horizon never passed that check, and the account is the voter's own
		expect(ballotCountsAtTime("2026-09-23T17:00:00.000Z", close)).toBe(false);
	});

	it("counts one landing exactly on the close", () => {
		expect(ballotCountsAtTime(close, close)).toBe(true);
	});

	it("refuses a ballot it cannot date", () => {
		// the case that is easy to get backwards: no readable operation is not
		// permission to count it. This is only ever asked of out-of-band
		// ballots, which nothing else has checked.
		expect(ballotCountsAtTime(null, close)).toBe(false);
		expect(ballotCountsAtTime(undefined, close)).toBe(false);
		expect(ballotCountsAtTime("not a date", close)).toBe(false);
	});

	it("refuses everything when the close date is set but unparseable", () => {
		// a misconfigured loaded.round must not become one with no deadline
		expect(ballotCountsAtTime("2026-09-23T16:00:00.000Z", "not-a-date")).toBe(
			false,
		);
	});

	it("counts everything when the loaded.round has no close date", () => {
		expect(ballotCountsAtTime("2030-01-01T00:00:00.000Z", null)).toBe(true);
		expect(ballotCountsAtTime(null, null)).toBe(true);
	});
});
