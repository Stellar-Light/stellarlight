/**
 * SCF round-level count check (sls-111): awards per round in our directory
 * versus the SCF awardee listing. The directory carried 24 SCF #45 awards
 * while SCF listed 40, and nothing compared the two.
 */
import { describe, expect, it } from "vitest";
import { compareRoundCounts } from "../scf-round-counts";

const PAGE = "https://communityfund.stellar.org/project/";
const listed = (slug: string, lastAwardedRound: unknown) => ({
	slug,
	title: slug,
	lastAwardedRound,
});
const row = (slug: string, rounds: number[], page: string) => ({
	slug,
	scfAwardedRounds: rounds,
	scfSourceUrl: PAGE + page,
});

describe("compareRoundCounts", () => {
	it("could-not-check when either side was not read in full", () => {
		const ours = [row("a", [45], "a-1")];
		for (const listing of [null, []]) {
			expect(compareRoundCounts(listing, ours).status).toBe("could-not-check");
		}
		expect(compareRoundCounts([listed("a-1", 45)], null).status).toBe(
			"could-not-check",
		);
		expect(compareRoundCounts([listed("a-1", 45)], []).status).toBe(
			"could-not-check",
		);
		// exactly 500 rows is the page cap SCF used to serve: counts are floors
		const capped = Array.from({ length: 500 }, (_, i) => listed(`p-${i}`, 45));
		expect(compareRoundCounts(capped, ours).status).toBe("could-not-check");
		// no numbered round at all (negative codes are non-numbered awards)
		expect(compareRoundCounts([listed("pg-1", -326)], ours).status).toBe(
			"could-not-check",
		);
	});

	it("the latest round is exact and names the SCF pages no row cites", () => {
		const report = compareRoundCounts(
			[
				listed("liqvid-hrr", 45),
				listed("catlog-ygy", 45),
				listed("pods-dxl", 45),
			],
			[row("liqvidxyz", [37], "liqvid-hrr"), row("catlog", [45], "catlog-ygy")],
		);
		expect(report.status).toBe("mismatch");
		if (report.status === "could-not-check") return;
		expect(report.latest).toBe(45);
		expect(report.rounds).toEqual([
			{
				round: 45,
				exact: true,
				scf: 3,
				ours: 1,
				disagrees: true,
				uncited: ["liqvid-hrr", "pods-dxl"],
			},
		]);
	});

	it("an earlier round is a floor: more rows than SCF is fine, fewer disagrees", () => {
		const report = compareRoundCounts(
			[
				listed("x-1", 45),
				listed("y-1", 44),
				listed("z-1", 43),
				listed("w-1", 43),
			],
			[
				row("x", [43, 45], "x-1"),
				row("y", [44], "y-1"),
				row("v", [44], "v-1"),
				row("z", [43], "z-1"),
			],
		);
		if (report.status === "could-not-check") throw new Error(report.reason);
		const by = Object.fromEntries(report.rounds.map((r) => [r.round, r]));
		expect(by[45]).toMatchObject({
			exact: true,
			scf: 1,
			ours: 1,
			disagrees: false,
		});
		expect(by[44]).toMatchObject({
			exact: false,
			scf: 1,
			ours: 2,
			disagrees: false,
		});
		// two SCF pages last awarded in #43, and z cites only one of them
		expect(by[43]).toMatchObject({
			exact: false,
			scf: 2,
			ours: 2,
			disagrees: false,
		});
		expect(report.status).toBe("match");
	});

	it("a latest round we overcount also disagrees", () => {
		const report = compareRoundCounts(
			[listed("a-1", 45)],
			[row("a", [45], "a-1"), row("b", [45], "b-1")],
		);
		expect(report.status).toBe("mismatch");
	});
});
