// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
	type BallotNominee,
	type BallotRound,
	dataKey,
	type RoundTally,
	tallyRound,
} from "../awards/ballot";
import { mergeAccounts, resultsDocument } from "../awards/publish";
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
		const doc = resultsDocument(loaded, tally, "mirror", new Date(0));
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

	it("chain wins per address; the mirror fills what the chain forgot; nobody is counted twice", () => {
		const chain = new Map<string, Record<string, string> | null>([
			["G-BOTH", vote("beans")], // voted again after a reset → chain's ballot
			["G-CHAIN", vote("decaf")],
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
		expect(m.chainVoters).toBe(2);
		expect(m.mirrorVoters).toBe(2);
		const tally = tallyRound(round, nominees, m.accounts);
		expect(tally.turnout).toEqual({ voted: 4, whitelisted: 5 });
		const votes = Object.fromEntries(
			tally.categories[0].results.map((r) => [r.slug, r.votes]),
		);
		expect(votes).toEqual({ beans: 2, decaf: 2 });
	});
});
