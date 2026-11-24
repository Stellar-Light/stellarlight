/**
 * SCF's own payment record (src/lib/scf-paid.ts). Every SCF project page
 * carries totalAwarded and totalPaid; the sync never stored the second. A
 * Build award paid in full is SCF's record that its final (mainnet launch)
 * tranche was paid, so the paid total is split into a share per Build award,
 * by era: rounds 30 to 40 in thirds, 41 and later in the Handbook's four
 * tranches (0.1, 0.3, 0.6, 1). Legacy awards are paid in full. Where the
 * total does not split one way, the share is null, never a guess.
 */
import { describe, expect, it } from "vitest";
import { readScfPage } from "../../../scripts/eval/scf-official";
import {
	nextScfPaid,
	type PaidPage,
	type PreviousPaidRead,
	paidReadPage,
	samePaid,
	servedScfPaid,
	splitPaidPage,
} from "../scf-paid";
import { type CoverageRow, roundCoverage } from "../scf-round-counts";

const PAGE = "https://communityfund.stellar.org/project/";

/** A page's project record as SCF embeds it (liqvid-hrr's shape). */
const page = (
	slug: string,
	totals: { awarded: number; paid: number },
	subs: Array<{
		id: string;
		status?: string;
		round: string;
		budget: number;
		type: string;
	}>,
) =>
	`{"project":{"id":"rec${slug.replace(/-/g, "")}","title":"${slug}","slug":"${slug}","totalAwarded":${totals.awarded},"totalPaid":${totals.paid},"siteUrls":{},"awarded":true,"submissions":[${subs
		.map(
			(s) =>
				`{"id":"${s.id}","title":"t","status":"${s.status ?? "Awarded"}","project":"rec${slug.replace(/-/g, "")}","projectName":"$1","roundName":"${s.round}","budget":${s.budget},"awardType":"${s.type}","isCvvc":false}`,
		)
		.join(",")}]}}`;

const paidOf = (html: string, slug: string): PaidPage => {
	const paid = readScfPage(html, slug)?.paid;
	if (!paid) throw new Error("no paid read");
	return paid[0];
};

// liqvid-hrr as read 2026-11-23: #37 and #45 Build awards, #30 and #44 lost.
const liqvid = page("liqvid-hrr", { awarded: 235000, paid: 166750 }, [
	{ id: "recLau45", round: "SCF #45", budget: 97500, type: "Build" },
	{
		id: "recIPO44",
		status: "Not Awarded",
		round: "SCF #44",
		budget: 97500,
		type: "Build",
	},
	{ id: "rec2aZ37", round: "SCF #37", budget: 137500, type: "Build" },
	{
		id: "rec91j30",
		status: "Not Awarded",
		round: "SCF #30",
		budget: 135000,
		type: "Build",
	},
]);

describe("the paid total split into Build tranche shares", () => {
	it("reads totalPaid and the awarded submissions off the page", () => {
		const p = paidOf(liqvid, "liqvid-hrr");
		expect(p.totalPaid).toBe(166750);
		expect(p.awards.map((a) => a.round).sort()).toEqual([37, 45]);
	});

	it("splits both eras: #37 (thirds) paid in full, #45 (four tranches) at 30%", () => {
		const s = splitPaidPage(paidOf(liqvid, "liqvid-hrr"));
		expect(s.split).toBe("exact");
		const by = Object.fromEntries(s.builds.map((b) => [b.award.round, b]));
		expect(by[37]).toMatchObject({ schedule: "thirds", paidShare: 1 });
		expect(by[45]).toMatchObject({ schedule: "four-tranche", paidShare: 0.3 });
	});

	it("a thirds-era award two thirds paid", () => {
		const s = splitPaidPage(
			paidOf(
				page("x-a1b", { awarded: 90000, paid: 60000 }, [
					{ id: "rec36", round: "SCF #36", budget: 90000, type: "Build" },
				]),
				"x-a1b",
			),
		);
		expect(s.builds[0].paidShare).toBeCloseTo(2 / 3);
	});

	it("a Legacy award beside a Build award is paid in full, so the rest is the Build share", () => {
		const s = splitPaidPage(
			paidOf(
				page("lb-c2d", { awarded: 210000, paid: 170000 }, [
					{
						id: "rec27",
						round: "SCF #27",
						budget: 90000,
						type: "Legacy v5.0 Community Award",
					},
					{ id: "rec33", round: "SCF #33", budget: 120000, type: "Build" },
				]),
				"lb-c2d",
			),
		);
		expect(s.split).toBe("exact");
		expect(s.builds).toHaveLength(1);
		expect(s.builds[0].paidShare).toBeCloseTo(2 / 3);
	});

	it("paid above awarded fits no schedule: null, not a guess", () => {
		// pg-atlas-dse, 2026-11-23: one #41 Build award, $150,000 awarded,
		// $168,500 paid.
		const s = splitPaidPage(
			paidOf(
				page("pg-atlas-dse", { awarded: 150000, paid: 168500 }, [
					{ id: "rec41", round: "SCF #41", budget: 150000, type: "Build" },
				]),
				"pg-atlas-dse",
			),
		);
		expect(s.split).toBe("no-fit");
		expect(s.builds[0].paidShare).toBeNull();
		const served = servedScfPaid(
			nextScfPaid({
				pages: [
					paidOf(
						page("pg-atlas-dse", { awarded: 150000, paid: 168500 }, [
							{ id: "rec41", round: "SCF #41", budget: 150000, type: "Build" },
						]),
						"pg-atlas-dse",
					),
				],
				now: "2026-11-24T00:00:00.000Z",
			}),
		);
		expect(served?.buildAwards[0]).toMatchObject({
			paidShare: null,
			finalTranchePaid: null,
			tranchesPaid: null,
		});
	});

	it("a total that splits two ways names no share", () => {
		// two #44 awards of the same budget, one at 0.6 and one at 0.3: the
		// page cannot say which
		const s = splitPaidPage(
			paidOf(
				page("amb-e3f", { awarded: 200000, paid: 90000 }, [
					{ id: "recA", round: "SCF #44", budget: 100000, type: "Build" },
					{ id: "recB", round: "SCF #44", budget: 100000, type: "Build" },
				]),
				"amb-e3f",
			),
		);
		expect(s.split).toBe("ambiguous");
		expect(s.builds.map((b) => b.paidShare)).toEqual([null, null]);
	});

	it("a non-Build award SCF marks part paid is held to its share", () => {
		const s = splitPaidPage(
			paidOf(
				page("pg-g4h", { awarded: 200000, paid: 110000 }, [
					{
						id: "recPG",
						status: "Awarded (50%)",
						round: "Public Goods Award Q2 '26",
						budget: 100000,
						type: "Public Goods Award",
					},
					{ id: "rec44", round: "SCF #44", budget: 100000, type: "Build" },
				]),
				"pg-g4h",
			),
		);
		// read as paid in full it would fit #44 at 0.1
		expect(s.builds[0].paidShare).toBe(0.6);
	});

	it("a page with only a Liquidity award has no Build award to read", () => {
		const s = splitPaidPage(
			paidOf(
				page("blend-i5j", { awarded: 50000, paid: 50000 }, [
					{
						id: "recLQ",
						round: "Liquidity Award - '24 Q1",
						budget: 50000,
						type: "Liquidity Award",
					},
				]),
				"blend-i5j",
			),
		);
		expect(s).toEqual({ split: "exact", builds: [] });
	});
});

describe("dating a payment between two sync reads", () => {
	const at45 = (paid: number) =>
		paidOf(
			page("liqvid-hrr", { awarded: 235000, paid }, [
				{ id: "recLau45", round: "SCF #45", budget: 97500, type: "Build" },
				{ id: "rec2aZ37", round: "SCF #37", budget: 137500, type: "Build" },
			]),
			"liqvid-hrr",
		);
	const T0 = "2026-11-25T06:40:00.000Z";
	const T1 = "2026-12-02T06:40:00.000Z";
	const T1end = "2026-12-02T06:55:00.000Z";
	const first = nextScfPaid({
		pages: [at45(166750)],
		now: "2026-11-25T06:50:00.000Z",
	});
	const previous: PreviousPaidRead = {
		startedAt: T0,
		pages: new Map([["liqvid-hrr", paidReadPage(at45(166750))]]),
	};

	it("the first read dates nothing before it", () => {
		expect(first?.notSeenAt).toBeNull();
		expect(first?.builds.every((b) => b.paidShareNotSeenAt === null)).toBe(
			true,
		);
	});

	it("an unchanged read keeps its dates and plans no write", () => {
		const again = nextScfPaid({
			pages: [at45(166750)],
			stored: first,
			previous,
			now: T1end,
		});
		expect(samePaid(again, first)).toBe(true);
		expect(again?.seenBy).toBe(first?.seenBy);
	});

	it("a tranche paid between two reads is dated to that window", () => {
		// #45 moves from 0.3 to 0.6 of $97,500: +$29,250
		const next = nextScfPaid({
			pages: [at45(196000)],
			stored: first,
			previous: { ...previous, startedAt: T1 },
			now: T1end,
		});
		expect(samePaid(next, first)).toBe(false);
		expect(next).toMatchObject({ seenBy: T1end, notSeenAt: T1 });
		const b45 = next?.builds.find((b) => b.round === 45);
		expect(b45).toMatchObject({
			paidShare: 0.6,
			paidShareSeenBy: T1end,
			paidShareNotSeenAt: T1,
		});
		// #37's share did not move: its dates stand
		const b37 = next?.builds.find((b) => b.round === 37);
		expect(b37?.paidShareSeenBy).toBe(first?.builds[1]?.paidShareSeenBy);
		const served = servedScfPaid(next);
		expect(served?.buildAwards.find((b) => b.round === 45)).toMatchObject({
			tranchesPaid: 3,
			tranches: 4,
			finalTranchePaid: false,
		});
		expect(served?.buildAwards.find((b) => b.round === 37)).toMatchObject({
			tranchesPaid: 3,
			tranches: 3,
			finalTranchePaid: true,
		});
	});

	it("no window when the previous read did not show another share", () => {
		// the stored row lagged (a failed write): the previous read already
		// showed 0.6, so the change is dated only by now
		const next = nextScfPaid({
			pages: [at45(196000)],
			stored: first,
			previous: {
				startedAt: T1,
				pages: new Map([["liqvid-hrr", paidReadPage(at45(196000))]]),
			},
			now: T1end,
		});
		expect(
			next?.builds.find((b) => b.round === 45)?.paidShareNotSeenAt,
		).toBeNull();
	});
});

describe("Build awards whose final tranche SCF paid, per round", () => {
	const row = (slug: string, paid: unknown): CoverageRow => ({
		slug,
		status: "Live",
		scf: {
			awarded: true,
			awardedRounds: [45],
			sourceUrl: `${PAGE}${slug}`,
			paid,
		},
	});
	const listed = [
		{
			round: 45,
			phase: "Ended",
			pageUrl: null,
			readAt: null,
			undecided: 0,
			awards: [
				{ page: "a", submission: null },
				{ page: "b", submission: null },
			],
		},
	];
	const build = (slug: string, paidShare: number | null) => ({
		builds: [
			{
				submission: `rec${slug}`,
				sourceUrl: `${PAGE}${slug}`,
				round: 45,
				paidShare,
			},
		],
	});

	it("counts read shares and paid finals", () => {
		const [r] = roundCoverage(listed, [
			row("a", build("a", 1)),
			row("b", build("b", 0.3)),
		]);
		expect(r).toMatchObject({ buildSharesRead: 2, buildFinalTranchePaid: 1 });
	});

	it("null before any paid read is stored, never 0", () => {
		const [r] = roundCoverage(listed, [
			row("a", undefined),
			row("b", undefined),
		]);
		expect(r.buildSharesRead).toBeNull();
		expect(r.buildFinalTranchePaid).toBeNull();
	});
});
