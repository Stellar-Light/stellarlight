import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import type { IndexedBuild } from "@/lib/hackathon-builds";
import { spec } from "@/lib/openapi-spec";
import {
	responseSchema,
	undeclaredInServed,
} from "../../../../../../scripts/contract/served-shape";

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

	it("declares every served field and null of the review; the pitch is mocked here", async () => {
		// review.pitch is the scfPitch report, served as built: the real one
		// is checked against this schema in scf-pitch.test.ts.
		const { body } = await get("link=github.com/rajkaria/toll");
		expect(
			undeclaredInServed(
				spec,
				responseSchema(spec, "/api/hackathons/review"),
				body,
			),
		).toEqual([]);
	});

	it("answers 400 without a link and 404 for one it does not hold", async () => {
		expect((await get("")).status).toBe(400);
		expect((await get("link=github.com/nobody/nothing")).status).toBe(404);
		expect((await get("link=x&extra=1")).status).toBe(400);
	});
});

describe("a submission with no confident category", () => {
	it("says why categoryContext is null: uncertain, or not categorized yet", async () => {
		const saved = { ...stored };
		const s = stored as Record<string, unknown>;
		try {
			s.categories = [];
			const uncertain = (await get("link=github.com/rajkaria/toll")).body;
			expect(uncertain.review.categoryContext).toBeNull();
			expect(uncertain.review.categoryNote).toMatch(/uncertain, not missing/);
			expect(
				undeclaredInServed(
					spec,
					responseSchema(spec, "/api/hackathons/review"),
					uncertain,
				),
			).toEqual([]);

			delete s.categories;
			s.categoriesAt = null;
			const unread = (await get("link=github.com/rajkaria/toll")).body;
			expect(unread.review.categoryContext).toBeNull();
			expect(unread.review.categoryNote).toMatch(/not categorized yet/);
		} finally {
			Object.assign(stored, saved);
		}
		const typed = (await get("link=github.com/rajkaria/toll")).body;
		expect(typed.review.categoryNote).toBeNull();
	});
});

describe("how crowded a category is, across every stored submission", () => {
	it("leaves out an event whose stored rows are its winners only", async () => {
		// A curated winner in the same category: its event's other
		// submissions are not stored, so it must not move the share.
		index.push(
			build("curated-hackmeridian-2025-lance", {
				name: "Lance",
				isWinner: true,
				hackathonPlacement: "1st Place",
				categories: [{ type: "Payments", score: 0.8 }],
				hackathon: {
					title: "HackMeridian 2025",
					slug: "hackmeridian-2025",
					endedAt: "2025-09-16",
				},
			}),
		);
		try {
			const { body } = await get("link=github.com/rajkaria/toll");
			expect(body.review.categoryContext).toEqual({
				type: "Payments",
				submissions: 2,
				winners: 2,
				shareOfSubmissions: 0.667,
			});
		} finally {
			index.pop();
		}
	});
});

describe("a submission placed in an award its event's other placements share", () => {
	it("serves the award's title as awardCategory, read from the event's winners in the index", async () => {
		// Stellar Hacks: Agents: five placements in one award, "10K Prize Pool".
		const s = stored as Record<string, unknown>;
		const saved = [...index];
		const placed: Record<string, string> = {
			"dorahacks-buidl-42585": "5th Place",
			"dorahacks-buidl-7": "3rd Place",
		};
		try {
			s.award = "10K Prize Pool";
			index.splice(
				0,
				index.length,
				...saved.map((b) =>
					placed[b.id]
						? {
								...b,
								hackathonPlacement: placed[b.id],
								award: "10K Prize Pool",
							}
						: b,
				),
			);
			const { body } = await get("link=github.com/rajkaria/toll");
			const sub = body.review.submission;
			expect([sub.placement, sub.award, sub.awardCategory]).toEqual([
				"5th Place",
				null,
				"10K Prize Pool",
			]);
			expect(sub.entries[0]).toMatchObject({
				award: null,
				awardCategory: "10K Prize Pool",
			});
			expect(
				undeclaredInServed(
					spec,
					responseSchema(spec, "/api/hackathons/review"),
					body,
				),
			).toEqual([]);
		} finally {
			delete s.award;
			index.splice(0, index.length, ...saved);
		}
	});
});
