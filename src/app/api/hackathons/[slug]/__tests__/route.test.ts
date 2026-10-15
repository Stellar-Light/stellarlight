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
// Winning rows their teams hid on DoraHacks (sls-092); an Error fails the read.
let hiddenRows: Array<{ placement: string | null }> | Error = [];
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: vi.fn(async ({ collection }: { collection: string }) => {
			if (collection === "hackathon-builds") {
				if (hiddenRows instanceof Error) throw hiddenRows;
				return { docs: hiddenRows };
			}
			return { docs: collection === "hackathon-events" ? [storedEvent] : [] };
		}),
	})),
}));
const getEvent = async () => {
	const { GET } = await import("../route");
	const res = await GET(
		new NextRequest("https://x.test/api/hackathons/stellar-hacks-zk"),
		{ params: Promise.resolve({ slug: "stellar-hacks-zk" }) },
	);
	return res.json();
};
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
		expect(body.hackathon.stats).toMatchObject({
			hiddenWinners: [],
			winnersNote: null,
		});
	});

	it("names a winner its team hid upstream instead of leaving a gap", async () => {
		hiddenRows = [{ placement: "2nd Place" }];
		const body = await getEvent();
		hiddenRows = [];
		expect(body.hackathon.stats.hiddenWinners).toEqual([
			{ placement: "2nd Place", placementRank: 2 },
		]);
		expect(body.hackathon.stats.winnersNote).toMatch(
			/^One winning submission is not served here: .*\(placement: 2nd Place\)\.$/,
		);
	});

	it("with no stored roster the record cannot say none are hidden", async () => {
		const { getHackathonBuildsIndex } = await import("@/lib/hackathon-builds");
		vi.mocked(getHackathonBuildsIndex).mockResolvedValueOnce([]);
		const body = await getEvent();
		expect(body.hackathon.stats).toMatchObject({
			hiddenWinners: null,
			winnersNote: null,
		});
	});

	it("a failed hidden-winner read says nothing, not none", async () => {
		hiddenRows = new Error("db down");
		const body = await getEvent();
		hiddenRows = [];
		expect(body.hackathon.stats).toMatchObject({
			hiddenWinners: null,
			winnersNote: null,
		});
		expect(body.submissions).toHaveLength(2);
	});
});
