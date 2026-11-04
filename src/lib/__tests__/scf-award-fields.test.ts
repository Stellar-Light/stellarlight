/**
 * `awarded` and `awardedAnyCount` answer DIFFERENT questions — pinned because
 * reading only the count under-reported funding by 7 of 8 rows.
 *
 * scripts/eval/scf-absence-diff.ts asks one thing of an SCF detail page: is
 * this absent project funded? The obvious field, `awardedAnyCount`, counts
 * submission cards whose status literally reads "Awarded". But SCF leaves a
 * funded project's card in a DISBURSEMENT status ("Information Collection",
 * "Panel Review") long after the award, and the parser recovers those from the
 * page's own awarded/lastAwardedRound/totalAwarded summary into `awarded` —
 * deliberately without touching `awardedAnyCount`, which stays an accusation
 * counter. On 2026-09-14 all 8 standing absences were of exactly that shape,
 * so a count-only test called every one of them an unfunded applicant.
 *
 * The sibling half: a badge is a round ENTERED. A page badges rounds it lost,
 * so award ROUNDS must come from the verdicts, never from page text.
 */
import { describe, expect, it } from "vitest";
import {
	parseRoundVerdicts,
	showsAward,
} from "../../../scripts/eval/scf-official";

const card = (c: {
	id: string;
	status: string;
	round: string;
	budget?: number;
}) =>
	`{"id":"${c.id}","status":"${c.status}","roundName":"${c.round}","awardType":"Build"${
		c.budget === undefined ? "" : `,"budget":${c.budget}`
	}}`;

/** A funded project whose card still sits in a post-award pipeline status —
 *  catlog-ygy, verbatim shape (SCF #45, $97,000, "Information Collection"). */
const disbursing = [
	card({
		id: "rec-catlog",
		status: "Information Collection",
		round: "SCF #45",
		budget: 97000,
	}),
	'{"awarded":true,"lastAwardedRound":45,"totalAwarded":97000}',
].join("\n");

describe("award status of an absent SCF project", () => {
	it("counts a post-award disbursement card as funded via `awarded`", () => {
		const v = parseRoundVerdicts(disbursing);
		expect([...v.awarded]).toEqual(["45"]);
		// The trap: the count stays 0 because no card says "Awarded".
		expect(v.awardedAnyCount).toBe(0);
		// So the funded test must read BOTH — this is the expression
		// scf-absence-diff.ts uses for ScfEntry.awardedAny.
		expect(v.awarded.size > 0 || v.awardedAnyCount > 0).toBe(true);
	});

	it("does not credit a round the project entered and lost", () => {
		// enable-duq: won #45 (disbursing), lost #43 outright. A badge scrape
		// of this page yields both numbers; only #45 is an award.
		const v = parseRoundVerdicts(
			[
				card({
					id: "rec-enable-45",
					status: "Information Collection",
					round: "SCF #45",
					budget: 76000,
				}),
				card({
					id: "rec-enable-43",
					status: "Panel Review Failed",
					round: "SCF #43",
					budget: 100000,
				}),
				'{"awarded":true,"lastAwardedRound":45,"totalAwarded":76000}',
			].join("\n"),
		);
		expect([...v.awarded]).toEqual(["45"]);
		expect([...v.notAwarded]).toEqual(["43"]);
	});

	it("leaves a genuinely unfunded page unfunded", () => {
		const v = parseRoundVerdicts(
			[
				card({
					id: "rec-loser",
					status: "Not Awarded",
					round: "SCF #44",
					budget: 90000,
				}),
				'{"awarded":false,"totalAwarded":0}',
			].join("\n"),
		);
		expect(v.awarded.size).toBe(0);
		expect(v.awardedAnyCount).toBe(0);
		expect([...v.notAwarded]).toEqual(["44"]);
	});
});

describe("award fields in either order (2026-10-03)", () => {
	// SCF moved budget ahead of awardType. An ordered regex read every card in
	// the new order as "no budget", and a dry run planned null amounts over
	// ~550 stored round awards. Both orders must read the same.
	const newOrder =
		'{"id":"rec-new","status":"Awarded","roundName":"SCF #35","budget":93700,"awardType":"Build","isCvvc":false}';
	const oldOrder =
		'{"id":"rec-old","status":"Awarded","roundName":"SCF #32","awardType":"Build","budget":56120}';
	it("reads budget and award type whichever comes first", () => {
		const v = parseRoundVerdicts([newOrder, oldOrder].join("\n"));
		const byRound = Object.fromEntries(v.awards.map((a) => [a.round, a]));
		expect(byRound[35]).toMatchObject({ budgetUSD: 93700, awardType: "Build" });
		expect(byRound[32]).toMatchObject({ budgetUSD: 56120, awardType: "Build" });
	});
	it("never takes a budget from the next card", () => {
		const v = parseRoundVerdicts(
			[
				'{"id":"rec-a","status":"Awarded","roundName":"SCF #40","awardType":"Build"}',
				'{"id":"rec-b","status":"Not Awarded","roundName":"SCF #41","budget":99999,"awardType":"Build"}',
			].join("\n"),
		);
		expect(v.awards.find((a) => a.round === 40)?.budgetUSD).toBeNull();
	});
});

// sls-111 (2026-11-04). Saved copies of the live page data: each card object
// verbatim from liqvid-hrr and enable-duq, under the page's own project
// record. Only the latest card's status is a parameter: on 2026-10-03 both
// cards still sat in a pipeline status (the lane stored Liqvid with
// lastAwardedRound 45, totalAwarded 235000 and rounds [37]; its log held
// Enable at awarded=false). Both read "Awarded" by 2026-11-04.
const liqvidPage = (status45: string, totalAwarded = 235000) =>
	`{"project":{"id":"recGQNG0gXyv5aHrR","title":"Liqvid","slug":"liqvid-hrr","totalAwarded":${totalAwarded},"totalPaid":147250,"siteUrls":{"website":"https://liqvid.xyz/"},"awarded":true,"lastAwardedRound":45,"eligible":"Build","buildAwardRounds":["SCF #30","SCF #37","SCF #44","SCF #45"],"submissions":[` +
	[
		`{"id":"recLauVL3boo779AG","title":"Liqvid X Stellar RWA Lending Market","status":"${status45}","project":"recGQNG0gXyv5aHrR","projectName":"$24","roundName":"SCF #45","budget":97500,"awardType":"Build","isCvvc":false,"isOwnedByUser":false,"thumbnail":"$25"}`,
		'{"id":"recIPO2uN2oa0uitf","title":"Stellar RWA Lending Market","status":"Not Awarded","project":"recGQNG0gXyv5aHrR","projectName":"$27","roundName":"SCF #44","budget":97500,"awardType":"Build","isCvvc":false,"isOwnedByUser":false,"thumbnail":"$28"}',
		'{"id":"rec2aZKPZ8SmvFoGS","title":"Committed Yield RWAs on Stellar","status":"Awarded","project":"recGQNG0gXyv5aHrR","projectName":"$2a","roundName":"SCF #37","budget":137500,"awardType":"Build","isCvvc":false,"isOwnedByUser":false,"thumbnail":"$2b"}',
		'{"id":"rec91jnTCLjHH1ssP","title":"Cross-Chain Interoperability (GMP) infrastructure and Liquidity for RWAs on Stellar","status":"Not Awarded","project":"recGQNG0gXyv5aHrR","projectName":"$2d","roundName":"SCF #30","budget":135000,"awardType":"Build","isCvvc":false,"isOwnedByUser":false,"thumbnail":"$2e"}',
	].join(",") +
	"]}}";

const enablePage = (status45: string) =>
	`{"project":{"id":"rec6DnJ4it4NQrDuQ","title":"Enable","slug":"enable-duq","totalAwarded":76000,"totalPaid":7600,"siteUrls":{"website":"https://www.humanity.link/"},"awarded":true,"lastAwardedRound":45,"buildAwardRounds":["SCF #43","SCF #45"],"submissions":[` +
	[
		`{"id":"recZeBSnr1JqjPt4C","title":"Humanitarian Aid Payments on Stellar","status":"${status45}","project":"rec6DnJ4it4NQrDuQ","projectName":"$25","roundName":"SCF #45","budget":76000,"awardType":"Build","isCvvc":false,"isOwnedByUser":false,"thumbnail":"$26"}`,
		'{"id":"recbyuKM3UBIMEWYp","title":"Stellar Off-Ramps for Communities","status":"Panel Review Failed","project":"rec6DnJ4it4NQrDuQ","projectName":"$28","roundName":"SCF #43","budget":100000,"awardType":"Build","isCvvc":false,"isOwnedByUser":false,"thumbnail":"$29"}',
	].join(",") +
	"]}}";

/** The per-page detail enrich-from-scf builds from the parse. */
const detailOf = (html: string) => {
	const v = parseRoundVerdicts(html);
	return {
		awardedRounds: [...v.awarded].map(Number).sort((a, b) => a - b),
		roundAwards: v.awards,
		verdictSubmissions: v.submissions,
		verdictAwardedAny: v.awardedAnyCount,
	};
};

describe("SCF #45 coverage (sls-111)", () => {
	it("award rounds come from the verdicts, never from buildAwardRounds", () => {
		// The page lists #30, #37, #44 and #45 in buildAwardRounds, but #30 and
		// #44 read "Not Awarded", and its own total is #37 + #45 exactly.
		const v = parseRoundVerdicts(liqvidPage("Awarded"));
		expect([...v.awarded].sort()).toEqual(["37", "45"]);
		expect([...v.notAwarded].sort()).toEqual(["30", "44"]);
	});

	it("a pinned latest round still disbursing is an award beside an earlier Awarded round", () => {
		const v = parseRoundVerdicts(liqvidPage("Information Collection"));
		expect([...v.awarded].sort()).toEqual(["37", "45"]);
		expect(v.awards).toEqual([
			{ round: 37, budgetUSD: 137500, awardType: "Build" },
			{ round: 45, budgetUSD: 97500, awardType: "Build" },
		]);
		// The count stays the accusation counter: one card says "Awarded".
		expect(v.awardedAnyCount).toBe(1);
	});

	it("the pinned round needs the page total to match exactly", () => {
		const v = parseRoundVerdicts(liqvidPage("Information Collection", 240000));
		expect([...v.awarded]).toEqual(["37"]);
	});

	it("a pinned disbursing award beside a failed round shows an award", () => {
		// The no-resurrect guard read only the Awarded-card count, so on
		// 2026-10-03 it held Enable at awarded=false over its #45 award.
		const detail = detailOf(enablePage("Information Collection"));
		expect(detail.awardedRounds).toEqual([45]);
		expect(detail.verdictSubmissions).toBe(1);
		expect(detail.verdictAwardedAny).toBe(0);
		expect(showsAward(detail)).toBe(true);
		expect(showsAward(detailOf(enablePage("Awarded")))).toBe(true);
	});

	it("a page whose every decided card lost shows no award", () => {
		const detail = detailOf(
			'{"id":"rec-coop","status":"Not Awarded","roundName":"SCF #30","budget":50000,"awardType":"Build"}',
		);
		expect(detail.verdictSubmissions).toBe(1);
		expect(showsAward(detail)).toBe(false);
	});
});
