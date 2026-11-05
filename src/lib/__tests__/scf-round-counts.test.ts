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
	lastAwardedRound,
});
const row = (rounds: number[] | null, page: string) => ({
	scfAwardedRounds: rounds,
	scfSourceUrl: PAGE + page,
});

describe("compareRoundCounts", () => {
	it("could-not-check when either side was not read in full", () => {
		const ours = [row([45], "a-1")];
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
	});

	it("a value it cannot read is could-not-check, never a skipped row", () => {
		// "45" as a string used to be skipped, so SCF's count shrank to ours
		// and the round read as a match.
		const report = compareRoundCounts(
			[listed("paid-1", 45), listed("other-1", "45")],
			[row([45], "paid-1")],
		);
		expect(report).toMatchObject({ status: "could-not-check" });
		if (report.status === "could-not-check")
			expect(report.reason).toContain("other-1");
		expect(
			compareRoundCounts([{ lastAwardedRound: 45 }], [row([45], "a-1")]).status,
		).toBe("could-not-check");
	});

	it("a page listed twice counts once", () => {
		// SCF has one #45 page; two rows of ours claim #45 from it. Counted
		// twice, the listing matched our two rows.
		const report = compareRoundCounts(
			[listed("a-1", 45), listed("a-1", 45)],
			[row([45], "a-1"), row([45], "a-1")],
		);
		expect(report.status).toBe("mismatch");
		expect(
			compareRoundCounts(
				[listed("a-1", 45), listed("a-1", 44)],
				[row([45], "a-1")],
			).status,
		).toBe("could-not-check");
	});

	it("a listing that lacks a page our rows cite for the latest round is could-not-check", () => {
		// The listing gives no total, so a cut one is caught by a witness: a
		// row claiming the latest round whose own SCF page is not listed.
		const report = compareRoundCounts(
			[listed("x-1", 45)],
			[row([45], "x-1"), row([45], "y-1")],
		);
		expect(report).toMatchObject({ status: "could-not-check" });
		if (report.status === "could-not-check")
			expect(report.reason).toContain("y-1");
	});

	it("the latest round is exact: short and over are both findings", () => {
		const report = compareRoundCounts(
			[
				listed("liqvid-hrr", 45),
				listed("catlog-ygy", 45),
				listed("pods-dxl", 45),
			],
			[row([37], "liqvid-hrr"), row([45], "catlog-ygy")],
		);
		expect(report.status).toBe("mismatch");
		if (report.status === "could-not-check") return;
		expect(report.latest).toBe(45);
		expect(report.rounds[0]).toEqual({
			round: 45,
			exact: true,
			scf: 3,
			ours: 1,
			verdict: "short",
			uncited: ["liqvid-hrr", "pods-dxl"],
		});
		// Liqvid's #37: no page in this listing was last awarded in it
		expect(report.rounds[1]).toMatchObject({
			round: 37,
			scf: 0,
			verdict: "unconfirmed",
		});
		const over = compareRoundCounts(
			[listed("a-1", 45), listed("b-1", 44)],
			[row([45], "a-1"), row([44, 45], "b-1")],
		);
		expect(over.status).toBe("mismatch");
		if (over.status !== "could-not-check")
			expect(over.rounds[0]).toMatchObject({ round: 45, verdict: "over" });
	});

	it("an earlier round above its SCF floor is unconfirmed, not a match", () => {
		const report = compareRoundCounts(
			[
				listed("x-1", 45),
				listed("y-1", 44),
				listed("z-1", 43),
				listed("w-1", 43),
			],
			[
				row([43, 45], "x-1"),
				row([44], "y-1"),
				row([44], "v-1"),
				row([43], "z-1"),
			],
		);
		if (report.status === "could-not-check") throw new Error(report.reason);
		const by = Object.fromEntries(report.rounds.map((r) => [r.round, r]));
		expect(by[45]).toMatchObject({ exact: true, verdict: "agrees" });
		// SCF lists one page last awarded in #44; two rows of ours claim it.
		// The listing is a floor there, so it cannot confirm the second.
		expect(by[44]).toMatchObject({
			exact: false,
			scf: 1,
			ours: 2,
			verdict: "unconfirmed",
		});
		expect(by[43]).toMatchObject({
			exact: false,
			scf: 2,
			ours: 2,
			verdict: "agrees",
		});
		expect(report.status).toBe("match");
		const short = compareRoundCounts(
			[listed("x-1", 45), listed("y-1", 44), listed("u-1", 44)],
			[row([45], "x-1"), row([44], "y-1")],
		);
		expect(short.status).toBe("mismatch");
	});

	it("an awarded row with no rounds and no SCF page cited is counted as rounds unread", () => {
		// The shapes the API serves: rounds [] either way. A row citing a page
		// read that page (blend-mfy: a Liquidity award, no numbered round); a
		// row citing none has rounds nobody read.
		const report = compareRoundCounts(
			[listed("a-1", 45)],
			[
				row([45], "a-1"),
				{ scfAwardedRounds: [], scfSourceUrl: `${PAGE}blend-mfy` },
				{ scfAwardedRounds: [], scfSourceUrl: null },
			],
		);
		if (report.status === "could-not-check") throw new Error(report.reason);
		expect(report.roundsUnread).toBe(1);
	});

	it("a round only we claim, past the listing's latest, is over", () => {
		const report = compareRoundCounts(
			[listed("a-1", 45)],
			[row([45], "a-1"), row([46], "b-1")],
		);
		expect(report.status).toBe("mismatch");
		if (report.status === "could-not-check") return;
		expect(report.rounds.find((r) => r.round === 46)).toMatchObject({
			exact: true,
			scf: 0,
			ours: 1,
			verdict: "over",
		});
	});

	it("a listed page whose last round is 0 is named, not dropped", () => {
		const report = compareRoundCounts(
			[listed("a-1", 45), listed("z-1", 0)],
			[row([45], "a-1")],
		);
		if (report.status === "could-not-check") throw new Error(report.reason);
		expect(report.roundZero).toEqual(["z-1"]);
	});
});
