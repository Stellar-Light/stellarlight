import { describe, expect, it } from "vitest";
import { LATEST_WINNERS } from "@/data/recent-hackathon-winners";
import { newestWinners, winnersFromIndex } from "@/lib/recent-winners";

const row = (
	id: string,
	slug: string,
	endedAt: string | null,
	over: Record<string, unknown> = {},
) => ({
	id,
	name: id,
	description: null,
	githubUrl: null,
	url: `https://example.test/${id}`,
	isWinner: true,
	hackathonPlacement: null,
	award: null,
	project: undefined,
	hackathon: { slug, title: slug, endedAt },
	...over,
});

describe("Recent Winners: the event that ended last with winners on record", () => {
	// 2026-11-24: the block showed the August roster in code while
	// HackMeridian 2026 (ended 2026-10-26) had six winners stored.
	const index = [
		row(
			"curated-hackmeridian-2026-alloy",
			"hackmeridian-2026",
			"2026-10-26T12:00:00.000Z",
			{
				hackathonPlacement: "Runner-up",
				githubUrl: "https://github.com/OxDanomite/alloy-stellar",
			},
		),
		row(
			"curated-hackmeridian-2026-nest",
			"hackmeridian-2026",
			"2026-10-26T12:00:00.000Z",
			{
				hackathonPlacement: "First place",
				githubUrl: "https://github.com/ethan-r13n/nest",
			},
		),
		row("dorahacks-buidl-1", "stellar-hacks-zk", "2026-07-03", {
			hackathonPlacement: "1st Place - $5,000 in XLM",
		}),
		// An event that ended later with no stored winner does not lead.
		row("curated-waterloo-x", "waterloo", "2026-11-18", { isWinner: false }),
	];

	it("leads with the stored event that ended last, its winners ranked, each opening its repo", () => {
		const w = winnersFromIndex(index);
		expect(w?.hackathonUname).toBe("hackmeridian-2026");
		expect(w?.endedAt).toBe("2026-10-26");
		expect(w?.winnersPageUrl).toBeNull();
		expect(w?.winners.map((x) => [x.projectName, x.rank])).toEqual([
			["curated-hackmeridian-2026-nest", 1],
			["curated-hackmeridian-2026-alloy", 2],
		]);
		expect(w?.winners[0].dorahacksBuidlUrl).toBe(
			"https://github.com/ethan-r13n/nest",
		);
		expect(w?.winners[0].builder).toBe("ethan-r13n");
		// No amount stated is not a prize of 0.
		expect(w?.winners[0].prizeUsd).toBeNull();
	});

	it("beats the roster in code when it ended later, and loses when it did not", () => {
		const stored = winnersFromIndex(index);
		expect(newestWinners([LATEST_WINNERS, stored])?.hackathonUname).toBe(
			"hackmeridian-2026",
		);
		const older = winnersFromIndex(index.slice(2, 3));
		expect(older?.winners[0].prizeUsd).toBe(5000);
		expect(older?.winnersPageUrl).toBeUndefined();
		expect(newestWinners([LATEST_WINNERS, older])).toBe(LATEST_WINNERS);
	});

	it("no stored winner is null, and the roster in code stands", () => {
		expect(winnersFromIndex(index.slice(3))).toBeNull();
		expect(newestWinners([LATEST_WINNERS, null])).toBe(LATEST_WINNERS);
	});
});
