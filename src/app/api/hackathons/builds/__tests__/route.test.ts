import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import type { IndexedBuild } from "@/lib/hackathon-builds";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
// What getHackathons lists: one DoraHacks event the index holds, and a
// curated one whose submissions are not stored.
vi.mock("@/lib/integrations/dorahacks", async (orig) => ({
	...(await orig<typeof import("@/lib/integrations/dorahacks")>()),
	fetchAllDoraHacksHackathonsChecked: vi.fn(async () => ({
		hackathons: [
			{ id: 1, uname: "e", title: "E", source: "dorahacks" },
			{
				id: -1007,
				uname: "hackmeridian-2025",
				title: "HackMeridian 2025",
				source: "curated",
			},
		],
		complete: true,
	})),
}));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({ find: async () => ({ docs: [] }) })),
}));

const DAY = 86_400_000;
const build = (id: string, over: Partial<IndexedBuild> = {}): IndexedBuild => ({
	id,
	name: id,
	description: `${id} summary`,
	githubUrl: `https://github.com/t/${id}`,
	demoUrl: null,
	videoUrl: null,
	track: null,
	hackathonPlacement: null,
	award: null,
	isWinner: false,
	voteCount: null,
	url: `https://dorahacks.io/buidl/${id}`,
	source: "dorahacks",
	hackathon: { title: "E", slug: "e", endedAt: "2025-01-15" },
	haystack: id,
	...over,
});
const recentEnd = new Date(Date.now() - 10 * DAY).toISOString().slice(0, 10);
vi.mock("@/lib/hackathon-builds", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-builds")>()),
	getHackathonBuildsIndex: vi.fn(async () => [
		build("kept", {
			activity: { lastCommitAt: "2025-06-01T00:00:00.000Z", archived: false },
		}),
		build("quiet", {
			activity: { lastCommitAt: "2025-01-20T00:00:00.000Z", archived: false },
		}),
		build("gone", { repoMissing: true }),
		build("unread"),
		build("noend", {
			hackathon: { title: "N", slug: "n", endedAt: null },
			activity: { lastCommitAt: "2025-06-01T00:00:00.000Z", archived: false },
		}),
		build("baddate", {
			hackathon: { title: "B", slug: "b", endedAt: "TBA" },
			activity: { lastCommitAt: "2025-06-01T00:00:00.000Z", archived: false },
		}),
		build("recent", {
			hackathon: { title: "R", slug: "r", endedAt: recentEnd },
			activity: { lastCommitAt: null, archived: false },
		}),
		build("titled", {
			hackathon: {
				title: "Stellar Hacks: Agents",
				slug: "stellar-agents-x402-stripe-mpp",
				endedAt: "2026-04-13",
			},
		}),
		build("tukar", {
			isWinner: true,
			hackathonPlacement: "1st Place",
			stack: ["passkey-kit", "@stellar/stellar-sdk"],
		}),
		// One submission entered in two events: one result, two entries.
		build("twin"),
		build("twin", { hackathon: { title: "R", slug: "r", endedAt: recentEnd } }),
	]),
}));

describe("GET /api/hackathons/builds matches declared packages", () => {
	// The 2026-10-22 battery: q=passkey&winnersOnly=1 found no winner, though
	// Tukar's repo declares passkey-kit.
	it("finds a winner by a package its repo declares", async () => {
		const { GET } = await import("../route");
		const res = await GET(
			new NextRequest(
				"https://x.test/api/hackathons/builds?q=passkey&winnersOnly=1&mode=keyword",
			),
		);
		expect(res.status).toBe(200);
		const rows = (await res.json()).builds as Array<Record<string, unknown>>;
		expect(rows.map((r) => [r.id, r.matchedTerms])).toEqual([
			["tukar", ["passkey"]],
		]);
	});
});

describe("GET /api/hackathons/builds hackathon filter", () => {
	const get = async (qs: string) => {
		const { GET } = await import("../route");
		const res = await GET(
			new NextRequest(`https://x.test/api/hackathons/builds?${qs}`),
		);
		return { status: res.status, body: await res.json() };
	};

	it("takes an event's exact title as its slug", async () => {
		const { status, body } = await get("hackathon=Stellar%20Hacks:%20Agents");
		expect(status).toBe(200);
		expect(body.meta.filters.hackathon).toEqual([
			"stellar-agents-x402-stripe-mpp",
		]);
		expect(body.meta.counts.matched).toBe(1);
	});

	it("answers a value that names no listed event with 400 and the valid slugs", async () => {
		const { status, body } = await get("hackathon=Stellar%20Hacks:%20Agent,e");
		expect(status).toBe(400);
		expect(body.error).toBe(
			"hackathon value(s) name no event getHackathons lists: 'Stellar Hacks: Agent'.",
		);
		expect(body.validHackathons).toEqual([
			"b",
			"e",
			"n",
			"r",
			"stellar-agents-x402-stripe-mpp",
		]);
	});

	it("answers a listed event with no stored submissions with 0 matched and a warning", async () => {
		const { status, body } = await get("hackathon=hackmeridian-2025");
		expect(status).toBe(200);
		expect(body.meta.counts.matched).toBe(0);
		expect(body.meta.filters.hackathon).toEqual(["hackmeridian-2025"]);
		expect(body.meta.warnings).toEqual([
			"no submissions are stored for hackmeridian-2025; 0 matched from it is not evidence that nothing was built",
		]);
	});

	it("says a value could not be checked when the listing cannot be read", async () => {
		const { getPayloadSafe } = await import("@/lib/payload-client");
		vi.mocked(getPayloadSafe).mockResolvedValueOnce(null);
		const { status, body } = await get("hackathon=nope");
		expect(status).toBe(200);
		expect(body.meta.counts.matched).toBe(0);
		expect(body.meta.warnings?.[0]).toMatch(
			/^could not check hackathon 'nope'/,
		);
	});
});

describe("GET /api/hackathons/builds rows say what the repo did after the event", () => {
	it("serves analyze's activity value and the last commit, absent when unknown", async () => {
		const { GET } = await import("../route");
		const res = await GET(
			new NextRequest("https://x.test/api/hackathons/builds?limit=10"),
		);
		expect(res.status).toBe(200);
		const rows = new Map(
			((await res.json()).builds as Array<Record<string, unknown>>).map((r) => [
				r.id,
				r,
			]),
		);
		expect(rows.get("kept")).toMatchObject({
			afterEvent: "commits 90+ days after",
			lastCommitAt: "2025-06-01T00:00:00.000Z",
		});
		expect(rows.get("quiet")?.afterEvent).toBe("no commits 90+ days after");
		expect(rows.get("gone")?.afterEvent).toBe("repo not found");
		// Repo never read: unknown, so neither field is served.
		expect("afterEvent" in (rows.get("unread") ?? {})).toBe(false);
		expect("lastCommitAt" in (rows.get("unread") ?? {})).toBe(false);
		// Read, but with no usable end date there is no mark to measure from.
		expect("afterEvent" in (rows.get("noend") ?? {})).toBe(false);
		expect("afterEvent" in (rows.get("baddate") ?? {})).toBe(false);
		expect(rows.get("noend")?.lastCommitAt).toBe("2025-06-01T00:00:00.000Z");
		// A repo not found has no activity to read.
		expect("lastCommitAt" in (rows.get("gone") ?? {})).toBe(false);
		// Read, but the event ended too recently to say the team stopped.
		expect("afterEvent" in (rows.get("recent") ?? {})).toBe(false);
		expect(rows.get("recent")?.lastCommitAt).toBeNull();
	});
});

describe("GET /api/hackathons/builds counts both units", () => {
	it("serves event entries beside unique submissions, the unit analyze counts", async () => {
		const { GET } = await import("../route");
		const read = async (qs: string) =>
			(
				await (
					await GET(
						new NextRequest(`https://x.test/api/hackathons/builds?${qs}`),
					)
				).json()
			).meta.counts;
		expect(await read("q=twin&mode=keyword")).toMatchObject({
			matched: 1,
			entries: 2,
		});
		// Every fixture, the passkey winner (tukar) included.
		expect(await read("limit=50")).toMatchObject({ matched: 10, entries: 11 });
		// entries uses the route's own matching: a declared package counts in both.
		expect(await read("q=passkey&mode=keyword")).toMatchObject({
			matched: 1,
			entries: 1,
		});
		expect(await read("hackathon=r")).toMatchObject({ matched: 2, entries: 2 });
	});
});
