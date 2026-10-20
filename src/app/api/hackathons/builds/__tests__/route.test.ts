import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import type { IndexedBuild } from "@/lib/hackathon-builds";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));

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
		build("recent", {
			hackathon: { title: "R", slug: "r", endedAt: recentEnd },
			activity: { lastCommitAt: null, archived: false },
		}),
	]),
}));

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
		// Read, but the event ended too recently to say the team stopped.
		expect("afterEvent" in (rows.get("recent") ?? {})).toBe(false);
		expect(rows.get("recent")?.lastCommitAt).toBeNull();
	});
});
