import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import type { IndexedBuild } from "@/lib/hackathon-builds";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
const storedEvent = {
	id: "e1",
	slug: "stellar-hacks-zk",
	title: "Stellar Hacks: Real-World ZK",
	description: "# Brief\nBuild with ZK.\n\n# Prizes\n- 1st Place: $5,000",
	repoRequired: true,
	videoRequired: true,
	submissionQuestions: ["Is your repo public?"],
	requirementsSection: "1. An open-source repo.",
	judgingSection: null,
	detailReadAt: "2026-10-05T18:00:00.000Z",
	firstSeenAt: "2026-10-05T18:00:00.000Z",
	lastSeenAt: "2026-10-05T18:00:00.000Z",
};
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: vi.fn(async ({ collection }: { collection: string }) => ({
			docs: collection === "hackathon-events" ? [storedEvent] : [],
		})),
	})),
}));
const live = vi.fn(async () => []);
vi.mock("@/lib/integrations/dorahacks", async (orig) => ({
	...(await orig<typeof import("@/lib/integrations/dorahacks")>()),
	fetchAllDoraHacksHackathons: vi.fn(async () => [
		{
			id: 2198,
			uname: "stellar-hacks-zk",
			title: "Stellar Hacks: Real-World ZK",
			start_time: 1_750_000_000,
			end_time: 1_760_000_000,
			bonus_price: 10_000,
			hackers_count: 300,
			status: 2,
		},
	]),
	fetchHackathonSubmissions: live,
}));
const build = (id: string, over: Partial<IndexedBuild> = {}): IndexedBuild => ({
	id,
	name: id,
	description: `${id} summary`,
	githubUrl: null,
	demoUrl: null,
	videoUrl: null,
	track: null,
	hackathonPlacement: null,
	award: null,
	isWinner: false,
	voteCount: null,
	url: `https://dorahacks.io/buidl/${id}`,
	source: "dorahacks",
	hackathon: {
		title: "Stellar Hacks: Real-World ZK",
		slug: "stellar-hacks-zk",
		endedAt: "2025-10-09",
	},
	haystack: id,
	...over,
});
vi.mock("@/lib/hackathon-builds", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-builds")>()),
	getHackathonBuildsIndex: vi.fn(async () => [
		build("w", {
			isWinner: true,
			hackathonPlacement: "1st Place",
			stack: ["soroban-sdk"],
		}),
		build("x", { stack: [] }),
		build("other", { hackathon: { title: "O", slug: "other", endedAt: null } }),
	]),
}));

describe("GET /api/hackathons/{slug} for a DoraHacks event", () => {
	it("serves the stored submissions, page, rules and profile without a live roster read", async () => {
		const { GET } = await import("../route");
		const res = await GET(
			new NextRequest("https://x.test/api/hackathons/stellar-hacks-zk"),
			{
				params: Promise.resolve({ slug: "stellar-hacks-zk" }),
			},
		);
		const body = await res.json();
		expect(res.status).toBe(200);
		expect(live).not.toHaveBeenCalled();
		expect(body.submissions.map((s: { id: string }) => s.id)).toEqual([
			"w",
			"x",
		]);
		// The submission shape this endpoint always served: no stored-only facts.
		expect("stack" in body.submissions[0]).toBe(false);
		expect(body.hackathon.description).toMatch(/Build with ZK/);
		expect(body.hackathon.rules).toMatchObject({
			repoRequired: true,
			requirements: "1. An open-source repo.",
			judgingCriteria: null,
		});
		expect(body.hackathon.profile).toMatchObject({
			submissions: 2,
			winners: 1,
		});
		expect(body.hackathon.profile.package.known).toBe(2);
		expect(body.meta.note).toMatch(/stored copy/);
	});
});
