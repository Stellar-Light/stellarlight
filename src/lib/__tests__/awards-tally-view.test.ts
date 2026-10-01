import { describe, expect, it } from "vitest";
import { tallyViewRows } from "../awards/tally-view";

const A = "GA3CQIS2URXWHWXLM34IKLTQFOLCMC4UGWG3SPRGT67PEFDGV2FFT5SO";
const B = "GDZDVDJPPA5SEIAV2KPUEZT75AXZI5W4TOYCAX7YFXSJIJLR4BH7UDP6";
const C = "GCUZBB5KKEGA5YQHDXDBF7GPDFQ36J7YTZ444WJBDKBCMO5Y5YT7PWHB";

describe("tallyViewRows", () => {
	const voters = [
		{ address: A, label: "Pilot" },
		{ address: B.toLowerCase(), label: "Pilot" },
	];
	const ballots = [
		{
			address: A,
			selections: { impact: ["later"] },
			submissions: 2,
			firstSubmittedAt: "2026-10-01T10:00:00.000Z",
			txHash: "ff",
			history: [
				{
					selections: { impact: ["first"] },
					txHash: "aa",
					at: "2026-10-01T09:00:00.000Z",
				},
				{
					selections: { impact: ["later"] },
					txHash: "ff",
					at: "2026-10-01T10:00:00.000Z",
				},
			],
		},
		{
			address: C,
			selections: { impact: ["walk-in"] },
			submissions: 1,
			firstSubmittedAt: "2026-10-01T11:00:00.000Z",
			txHash: "cc",
		},
	];
	const out = tallyViewRows(voters, ballots);

	it("counts the first ballot, flags a revote, and lists who has not voted", () => {
		const a = out.rows.find((r) => r.address === A);
		expect(a?.picks).toEqual({ impact: ["first"] });
		expect(a?.revoted).toBe(true);
		expect(a?.txHash).toBe("aa");
		expect(out.rows.find((r) => r.address === B)).toMatchObject({
			voted: false,
			whitelisted: true,
		});
		expect(out).toMatchObject({
			whitelisted: 2,
			voted: 2,
			notVoted: 1,
			revoted: 1,
			walkIns: 1,
		});
	});

	it("shows a walk-in from an open rehearsal as voted but not whitelisted", () => {
		expect(out.rows.find((r) => r.address === C)).toMatchObject({
			voted: true,
			whitelisted: false,
			picks: { impact: ["walk-in"] },
		});
		expect(out.rows[0].voted).toBe(true);
	});
});
