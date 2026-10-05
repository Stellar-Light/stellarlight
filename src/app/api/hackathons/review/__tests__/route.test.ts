import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import type { IndexedBuild } from "@/lib/hackathon-builds";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
const stored = {
	id: "x",
	buildId: "dorahacks-buidl-42585",
	name: "TollPay",
	vision: "Stripe for MCP servers.",
	description: "x".repeat(900),
	hackathonSlug: "agents",
	hackathonTitle: "Stellar Hacks: Agents",
	endedAt: "2026-04-13",
	placement: "5th Place",
	isWinner: true,
	url: "https://dorahacks.io/buidl/42585",
	githubUrl: "https://github.com/rajkaria/toll",
	repoFullName: "rajkaria/toll",
	linkCheckedAt: "2026-10-05T00:00:00Z",
	projectSlug: "tollpay",
	projectName: "TollPay",
	projectLinkBasis: "repo",
	stack: ["@x402/stellar"],
	stackReadAt: "2026-10-05T00:00:00Z",
	categories: [{ type: "Payments", score: 0.8 }],
	categoriesAt: "2026-10-05T00:00:00Z",
	detailReadAt: "2026-10-05T00:00:00Z",
	firstSeenAt: "2026-10-05T00:00:00Z",
	lastSeenAt: "2026-10-05T00:00:00Z",
	updatedAt: "2026-10-05T00:00:00Z",
	createdAt: "2026-10-05T00:00:00Z",
};
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: vi.fn(async ({ collection }: { collection: string }) =>
			collection === "projects"
				? {
						docs: [{ slug: "tollpay", status: "Live", scf: { awarded: true } }],
					}
				: { docs: [stored] },
		),
	})),
}));
const index: IndexedBuild[] = [];
vi.mock("@/lib/hackathon-builds", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-builds")>()),
	getHackathonBuildsIndex: vi.fn(async () => index),
}));
vi.mock("@/lib/hackathon-build-semantic", () => ({
	similarToBuild: vi.fn(
		async () =>
			new Map([
				["dorahacks-buidl-9", 0.9], // the same repo, entered in another event
				["dorahacks-buidl-7", 0.83],
			]),
	),
	semanticBuildScores: vi.fn(async () => null),
}));
vi.mock("@/lib/scf-pitch", () => ({
	buildScfPitch: vi.fn(async (_p: unknown, idea: string) => ({
		idea,
		angles: [],
	})),
}));

const build = (id: string, over: Partial<IndexedBuild> = {}): IndexedBuild => ({
	id,
	name: id,
	description: null,
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
		title: "Stellar Hacks: Agents",
		slug: "agents",
		endedAt: "2026-04-13",
	},
	haystack: id,
	...over,
});
index.push(
	build("dorahacks-buidl-42585", {
		githubUrl: "https://github.com/rajkaria/toll",
		isWinner: true,
		categories: [{ type: "Payments", score: 0.8 }],
	}),
	build("dorahacks-buidl-7", {
		name: "RenderGate",
		isWinner: true,
		categories: [{ type: "Payments", score: 0.8 }],
	}),
	build("dorahacks-buidl-8", { categories: [{ type: "DEX", score: 0.7 }] }),
	build("dorahacks-buidl-9", {
		name: "TollPay again",
		githubUrl: "https://github.com/rajkaria/toll",
		hackathon: { title: "Older", slug: "older", endedAt: "2025-01-01" },
	}),
);

const get = async (qs: string) => {
	const { GET } = await import("../route");
	const res = await GET(
		new NextRequest(`https://x.test/api/hackathons/review?${qs}`),
	);
	return { status: res.status, body: await res.json() };
};

describe("GET /api/hackathons/review", () => {
	it("reviews a submission from its repo link", async () => {
		const { status, body } = await get("link=github.com/rajkaria/toll");
		expect(status).toBe(200);
		const r = body.review;
		expect(r.resolvedBy).toBe("repo");
		expect(r.submission.project).toMatchObject({
			slug: "tollpay",
			status: "Live",
			scfAwarded: true,
		});
		expect(r.checks.find((c: { id: string }) => c.id === "scf").ok).toBe(true);
		expect(r.similar).toMatchObject({
			checked: true,
			builds: [{ name: "RenderGate", similarity: 0.83 }],
		});
		expect(r.categoryContext).toEqual({
			type: "Payments",
			submissions: 2,
			winners: 2,
			shareOfSubmissions: 0.667,
		});
		expect(r.pitch.idea).toBe("TollPay. Stripe for MCP servers.");
	});

	it("answers 400 without a link and 404 for one it does not hold", async () => {
		expect((await get("")).status).toBe(400);
		expect((await get("link=github.com/nobody/nothing")).status).toBe(404);
		expect((await get("link=x&extra=1")).status).toBe(400);
	});
});
