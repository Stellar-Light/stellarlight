import { beforeEach, describe, expect, it, vi } from "vitest";

const index = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hackathon-builds", () => ({ getHackathonBuildsIndex: index }));

import { hackathonsOfProject } from "../project-hackathons";

const build = (
	slug: string,
	project: string,
	placement: string | null,
	endedAt: string,
) => ({
	project: { slug: project },
	hackathon: { slug, title: slug.toUpperCase(), endedAt },
	hackathonPlacement: placement,
	isWinner: !!placement,
});

describe("hackathonsOfProject", () => {
	beforeEach(() => {
		index.mockReset();
	});

	it("names each event once, placed ones first, then the newest", async () => {
		index.mockResolvedValue([
			build("a", "p", null, "2026-01-01"),
			build("b", "p", "1st Place", "2025-01-01"),
			build("c", "p", null, "2026-06-01"),
			build("c", "p", null, "2026-06-01"),
			build("d", "other", "1st Place", "2026-09-01"),
		]);

		const found = await hackathonsOfProject("p", []);

		expect(found.map((h) => `${h.slug}:${h.placement}`)).toEqual([
			"b:1st Place",
			"c:null",
			"a:null",
		]);
	});

	it("adds HackMeridian 2026 by repo, even when the build index is down", async () => {
		index.mockRejectedValue(new Error("down"));

		const found = await hackathonsOfProject("p", ["Troqpay/Private-Yield"]);

		expect(found).toMatchObject([
			{
				slug: "hackmeridian-2026",
				placement: "Runner-Up",
				track: "Scale",
				url: "https://hackproof-six.vercel.app/data/2026/private-yield.yml",
			},
		]);
	});
});
