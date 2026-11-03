import { describe, expect, it } from "vitest";
import { scfBadgeLabel, scfRoundsOf } from "../project-scf";

describe("SCF rounds", () => {
	it("reads the stored rounds, else the last round, else none", () => {
		expect(scfRoundsOf({ awardedRounds: [27, 29] })).toEqual([27, 29]);
		expect(scfRoundsOf({ awardedRounds: null, lastAwardedRound: 44 })).toEqual([
			44,
		]);
		expect(scfRoundsOf({ lastAwardedRound: 0 })).toEqual([]);
	});

	it("labels the newest three rounds as hashtags and counts the rest", () => {
		expect(scfBadgeLabel([])).toBe("SCF funded");
		expect(scfBadgeLabel([27, 29])).toBe("SCF funded #29 #27");
		expect(scfBadgeLabel([4, 10, 16, 21, 29])).toBe(
			"SCF funded #29 #21 #16 +2",
		);
	});
});
