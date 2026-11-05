/** A failed read is an outage, never a 200 with an empty list (#1914's
 * class, swept 2026-11-04): /api/leaderboard, /api/clusters and analyze's
 * toolchain block fell through to an empty 200 when their store read failed,
 * which a CDN then cached as "no projects". A read that succeeds and finds
 * nothing is still a 200: [] asserts emptiness, so it must only follow a
 * read that ran. */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { spec } from "@/lib/openapi-spec";

type Doc = Record<string, unknown>;
const h = vi.hoisted(() => ({
	fail: new Set<string>(),
	storeDown: false,
	docs: {} as Record<string, Record<string, unknown>[]>,
}));
const find = vi.fn(async (args: { collection: string }) => {
	if (h.fail.has(args.collection)) throw new Error("connection reset by peer");
	const docs = h.docs[args.collection] ?? [];
	return { docs, totalDocs: docs.length };
});
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () =>
		h.storeDown ? null : { find, create: vi.fn(async () => ({})) },
	),
}));
vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/integrations/dorahacks", () => ({
	fetchAllDoraHacksHackathons: vi.fn(async () => []),
}));

const routes = {
	leaderboard: (await import("@/app/api/leaderboard/route")).GET,
	clusters: (await import("@/app/api/clusters/route")).GET,
	analyze: (await import("@/app/api/analyze/route")).GET,
};
async function get(route: keyof typeof routes, qs = "") {
	const res = await routes[route](
		new NextRequest(`https://stellarlight.xyz/api/${route}${qs}`),
	);
	return { res, body: (await res.json()) as Doc };
}

const project = (slug: string, extra: Doc = {}) => ({
	id: slug,
	slug,
	name: slug,
	category: "Protocol/Contract",
	types: ["Lending"],
	status: "Live",
	scf: { awarded: true, totalAwarded: 100, awardedRounds: [40] },
	...extra,
});

beforeEach(() => {
	h.fail = new Set();
	h.storeDown = false;
	h.docs = {
		projects: [project("blend"), project("aquarius", { types: ["DEX"] })],
		repos: [
			{
				fullName: "o/blend",
				projectSlug: "blend",
				sorobanSdkVersion: "22.0.0",
				versionStatus: "current",
				ciPresent: true,
				testsPresent: true,
			},
		],
		"funding-snapshots": [],
	};
});

function expectOutage(res: Response, body: Doc) {
	expect(res.status).toBe(503);
	expect(res.headers.get("Retry-After")).toBe("2");
	// Never cached as an answer: apiError sets no public Cache-Control.
	expect(res.headers.get("Cache-Control")).toBeNull();
	expect(body.retryAfterSeconds).toBe(2);
	expect(String(body.advisory)).toMatch(/NOT a claim/);
}

describe("a failed read answers 503, a read that found nothing answers 200", () => {
	const cases: Array<[keyof typeof routes, string, string]> = [
		["leaderboard", "", "projects"],
		["leaderboard", "?format=csv", "projects"],
		// The repos read runs inside the same block: half a read is no ranking.
		["leaderboard", "?sort=stars", "repos"],
		["clusters", "", "projects"],
		["clusters", "?key=Lending", "projects"],
		["analyze", "?dimension=toolchain", "repos"],
		["analyze", "?dimension=all", "repos"],
	];
	for (const [route, qs, collection] of cases)
		it(`${route}${qs}: the ${collection} read threw`, async () => {
			h.fail.add(collection);
			const { res, body } = await get(route, qs);
			expectOutage(res, body);
		});

	for (const [route, qs] of [
		["leaderboard", ""],
		["clusters", ""],
		["analyze", "?dimension=toolchain"],
	] as const)
		it(`${route}${qs}: the store itself is down`, async () => {
			h.storeDown = true;
			const { res, body } = await get(route, qs);
			expectOutage(res, body);
		});

	it("a filter that matches nothing after a read that ran stays a 200", async () => {
		const board = await get("leaderboard", "?type=Wallet");
		expect(board.res.status).toBe(200);
		expect(board.body.projects).toEqual([]);
		const none = await get("clusters", "?key=nothing-like-this");
		expect(none.res.status).toBe(200);
		expect(none.body.clusters).toEqual([]);
		expect((none.body.meta as Doc).advisory).toBeDefined();
	});

	it("reads that succeed serve the rollups", async () => {
		const board = await get("leaderboard");
		expect(board.res.status).toBe(200);
		expect((board.body.projects as Doc[]).map((p) => p.slug)).toContain(
			"blend",
		);
		const clusters = await get("clusters");
		expect(clusters.res.status).toBe(200);
		expect((clusters.body.clusters as Doc[]).length).toBeGreaterThan(0);
		const tool = await get("analyze", "?dimension=toolchain");
		expect(tool.res.status).toBe(200);
		expect((tool.body.toolchain as Doc).scannedRepos).toBe(1);
	});

	it("the spec declares each 503 as a RetryableError", () => {
		for (const path of ["/api/leaderboard", "/api/clusters", "/api/analyze"]) {
			// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
			const r: any = (spec as any).paths[path].get.responses["503"];
			expect(r?.content["application/json"].schema.$ref).toBe(
				"#/components/schemas/RetryableError",
			);
		}
	});
});
