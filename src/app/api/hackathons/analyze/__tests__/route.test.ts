import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexedBuild } from "@/lib/hackathon-builds";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/hackathon-build-semantic", () => ({
	semanticBuildScores: vi.fn(async () => null),
}));
const index: IndexedBuild[] = [];
vi.mock("@/lib/hackathon-builds", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-builds")>()),
	getHackathonBuildsIndex: vi.fn(async () => index),
}));
vi.mock("@/lib/integrations/dorahacks", async (orig) => ({
	...(await orig<typeof import("@/lib/integrations/dorahacks")>()),
	fetchAllDoraHacksHackathons: vi.fn(async () => [
		{
			uname: "kale",
			title: "KALE",
			start_time: 1,
			end_time: 2,
			bonus_price: 10_000,
			hackers_count: 50,
		},
		{
			uname: "agents",
			title: "Agents",
			start_time: 1,
			end_time: 3,
			bonus_price: 20_000,
			hackers_count: 90,
		},
	]),
}));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => null),
}));

const build = (
	id: string,
	event: string,
	endedAt: string,
	over: Partial<IndexedBuild> = {},
): IndexedBuild => ({
	id,
	name: id,
	description: `${id} builds payments`,
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
	hackathon: { title: event.toUpperCase(), slug: event, endedAt },
	haystack: `${id} builds payments`.toLowerCase(),
	...over,
});
const cat = (type: string) => [{ type, score: 0.8 }];

beforeEach(() => {
	index.length = 0;
	index.push(
		build("k1", "kale", "2025-06-01", {
			categories: cat("DEX"),
			stack: ["soroban-sdk"],
		}),
		build("k2", "kale", "2025-06-01", {
			categories: cat("Payments"),
			stack: [],
		}),
		build("a1", "agents", "2026-04-13", {
			isWinner: true,
			categories: cat("Payments"),
			stack: ["@x402/stellar"],
		}),
		build("a2", "agents", "2026-04-13", { categories: cat("Payments") }),
		build("a3", "agents", "2026-04-13", { categories: cat("AI") }),
		build("a4", "agents", "2026-04-13"),
	);
});

const get = async (path: string, qs: string) => {
	const { GET } =
		path === "analyze"
			? await import("../route")
			: await import("../../compare/route");
	const res = await GET(
		new NextRequest(`https://x.test/api/hackathons/${path}?${qs}`),
	);
	return { status: res.status, body: await res.json() };
};

describe("GET /api/hackathons/analyze", () => {
	it("answers payments share event by event, oldest first, with known and unknown apart", async () => {
		const { status, body } = await get(
			"analyze",
			"facet=category&value=payments&by=event",
		);
		expect(status).toBe(200);
		expect(body.total).toMatchObject({
			field: 6,
			builds: 6,
			known: 5,
			unknown: 1,
		});
		expect(body.total.values).toEqual([
			{ value: "Payments", builds: 3, winners: 1, share: 0.6 },
		]);
		expect(
			body.groups.map(
				(g: {
					value: string;
					field: number;
					known: number;
					values: Array<{ builds: number }>;
				}) => [g.value, g.field, g.known, g.values[0].builds],
			),
		).toEqual([
			["kale", 2, 2, 1],
			["agents", 4, 3, 2],
		]);
		expect(body.meta.facet.unknownMeans).toBe("not categorized yet");
		expect(body.winnersVsOthers.values[0]).toMatchObject({
			value: "Payments",
			lift: 2,
		});
	});

	it("counts packages over the builds whose repo was read", async () => {
		const { body } = await get("analyze", "facet=package");
		expect(body.total).toMatchObject({ known: 3, unknown: 3 });
	});

	it("rejects what it cannot honour", async () => {
		expect((await get("analyze", "facet=vibes")).status).toBe(400);
		expect((await get("analyze", "by=category")).status).toBe(400);
		expect((await get("analyze", "category=defi")).status).toBe(400);
		expect((await get("analyze", "sort=new")).status).toBe(400);
	});
});

describe("GET /api/hackathons/compare", () => {
	it("gives DoraHacks events their stored counts, a profile and the shifts between them", async () => {
		const { status, body } = await get("compare", "slugs=kale,agents");
		expect(status).toBe(200);
		const [kale, agents] = body.hackathons;
		expect(kale).toMatchObject({
			source: "dorahacks",
			submissionCount: 2,
			winnerCount: 0,
		});
		expect(agents).toMatchObject({
			submissionCount: 4,
			winnerCount: 1,
			prizePerWinnerUSD: 20_000,
		});
		expect(agents.profile.category.known).toBe(3);
		const dex = body.deltas.facetShifts.find(
			(s: { value: string }) => s.value === "DEX",
		);
		expect(dex.shares).toEqual([
			{ slug: "kale", share: 0.5 },
			{ slug: "agents", share: 0 },
		]);
	});
});
