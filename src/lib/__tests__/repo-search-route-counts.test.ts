/**
 * GET /api/repos/search serves the window cut in meta.counts (the #1915
 * class): a browse that ranks only its top rows says so and gives the true
 * eligible count, so a client never reads the window as every match.
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const ROWS = Array.from({ length: 250 }, (_, i) => ({
	fullName: `org/repo-${i}`,
	description: "",
	topics: [],
	repoScore: 250 - i,
	stars: 0,
	lastCommitAt: "2026-10-01T00:00:00.000Z",
}));

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: async (args: { limit?: number }) => ({
			docs: ROWS.slice(0, args.limit ?? ROWS.length),
			totalDocs: ROWS.length,
		}),
	})),
}));

const { GET } = await import("../../app/api/repos/search/route");

describe("repo search counts", () => {
	it("a browse past its window serves truncated and the true eligible count", async () => {
		const res = await GET(
			new NextRequest("https://x.test/api/repos/search?limit=5"),
		);
		const body = await res.json();
		expect(body.meta.counts).toEqual({
			returned: 5,
			total: 200,
			eligible: 250,
			truncated: true,
		});
	});
});
