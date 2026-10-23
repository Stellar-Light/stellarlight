/**
 * The builds route with the reranker (2026-10-23) over 60 matched builds:
 * pages across the 50 the reranker reorders, counts and the package facet
 * under success and failure, and a q that matches nothing. Adapted from the
 * independent review's checks.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexedBuild } from "@/lib/hackathon-builds";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/integrations/dorahacks", async (orig) => ({
	...(await orig<typeof import("@/lib/integrations/dorahacks")>()),
	fetchAllDoraHacksHackathonsChecked: vi.fn(async () => ({
		hackathons: [{ id: 1, uname: "e", title: "E", source: "dorahacks" }],
		complete: true,
	})),
}));
// Search by meaning runs and finds no neighbour, so hybrid serves the word
// matches.
vi.mock("@/lib/hackathon-build-semantic", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-build-semantic")>()),
	semanticBuildScores: vi.fn(async () => new Map<string, number>()),
}));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({ find: async () => ({ docs: [] }) })),
}));
vi.mock("@/lib/hackathon-builds", async (orig) => {
	const o = await orig<typeof import("@/lib/hackathon-builds")>();
	const id = (i: number) => `b${String(i).padStart(2, "0")}`;
	const build = (i: number): IndexedBuild => ({
		id: id(i),
		name: id(i),
		description: `widget tool number ${i}`,
		githubUrl: null,
		demoUrl: null,
		videoUrl: null,
		track: null,
		hackathonPlacement: i % 7 === 0 ? "1st Place" : null,
		award: null,
		isWinner: i % 7 === 0,
		voteCount: null,
		url: `https://dorahacks.io/buidl/${i}`,
		source: "dorahacks",
		hackathon: { title: "E", slug: "e", endedAt: "2025-01-15" },
		haystack: `${id(i)} widget tool number ${i}`,
		...(i % 3 === 0 ? { stack: ["passkey-kit"] } : {}),
	});
	return {
		...o,
		getHackathonBuildsIndex: vi.fn(async () =>
			Array.from({ length: 60 }, (_, i) => build(i)),
		),
	};
});

let fail = false;
beforeEach(() => {
	fail = false;
	vi.stubEnv("VOYAGE_API_KEY", "test");
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init: RequestInit) => {
			if (fail) throw new Error("network");
			const { documents } = JSON.parse(String(init.body)) as {
				documents: string[];
			};
			// Scores rise with position, so the reranker reverses what it gets.
			return {
				ok: true,
				status: 200,
				json: async () => ({
					data: documents.map((_, index) => ({
						index,
						relevance_score: index / 100,
					})),
				}),
			};
		}),
	);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

type Body = {
	builds: { id: string }[];
	meta: Record<string, unknown> & {
		counts: Record<string, number>;
		note: string;
		reranked?: boolean;
		warnings?: string[];
	};
};
const get = async (qs: string): Promise<Body> => {
	const { GET } = await import("../route");
	return (
		await GET(new NextRequest(`https://x.test/api/hackathons/builds?${qs}`))
	).json();
};
const ids = (body: Body) => body.builds.map((b) => b.id);
/** The hybrid order of q, read with no reranker configured. */
const hybridOrder = async (q: string) => {
	vi.stubEnv("VOYAGE_API_KEY", "");
	const body = await get(`q=${q}&limit=100`);
	vi.stubEnv("VOYAGE_API_KEY", "test");
	expect(body.meta.reranked).toBeUndefined();
	return ids(body);
};
const reranked = (hybrid: string[]) => [
	...hybrid.slice(0, 50).reverse(),
	...hybrid.slice(50),
];

describe("GET /api/hackathons/builds pages across the reranked 50", () => {
	it("limit=100: the first 50 reranked, the rest in hybrid order, none lost or doubled", async () => {
		const hybrid = await hybridOrder("widget");
		expect(hybrid).toHaveLength(60);
		const body = await get("q=widget&limit=100");
		expect(body.meta.reranked).toBe(true);
		expect(ids(body)).toEqual(reranked(hybrid));
		expect(body.meta.counts).toMatchObject({ matched: 60, returned: 60 });
		expect(body.meta.note).toMatch(/the first 50 then reordered by a reranker/);
	});

	it("offset=45 limit=10 straddles 50: five reranked rows, then five in hybrid order", async () => {
		const hybrid = await hybridOrder("widget");
		const body = await get("q=widget&limit=10&offset=45");
		expect(ids(body)).toEqual(reranked(hybrid).slice(45, 55));
		expect(body.meta.reranked).toBe(true);
	});

	it("pages of 20 tile the reranked list exactly", async () => {
		const hybrid = await hybridOrder("widget");
		const pages = await Promise.all(
			[0, 20, 40].map((o) => get(`q=widget&limit=20&offset=${o}`)),
		);
		expect(pages.flatMap(ids)).toEqual(reranked(hybrid));
		for (const p of pages) expect(p.meta.reranked).toBe(true);
	});
});

describe("GET /api/hackathons/builds reranker failure and empty matches", () => {
	it("serves the same counts and package facet whether the reranker runs or fails", async () => {
		fail = true;
		const failed = await get("q=widget+failcase&limit=100");
		fail = false;
		const ok = await get("q=widget+failcase&limit=100");
		expect(failed.meta.reranked).toBe(false);
		expect(ok.meta.reranked).toBe(true);
		expect(failed.meta.warnings).toContain(
			"the reranker could not run this request (failed or slower than 2 s), so rows are in hybrid order",
		);
		expect(failed.meta.note).not.toMatch(/reranker/);
		expect(ok.meta.counts).toEqual(failed.meta.counts);
		expect(ok.meta.stack).toEqual(failed.meta.stack);
		expect(new Set(ids(ok))).toEqual(new Set(ids(failed)));
	});

	// Review 2026-10-23: q matching nothing served meta.reranked true and a
	// note that claimed a reorder.
	it("leaves meta.reranked out and makes no call when nothing matched", async () => {
		const body = await get("q=zzzzqqqq&limit=10");
		expect(body.meta.counts.matched).toBe(0);
		expect(body.meta.reranked).toBeUndefined();
		expect(body.meta.note).not.toMatch(/reranker/);
		expect(fetch).not.toHaveBeenCalled();
	});
});
