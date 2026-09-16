// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { RoundTally } from "../awards/ballot";
import { resultsDocument } from "../awards/publish";
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
