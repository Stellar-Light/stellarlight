/**
 * GET /api/repos/search serves meta.canonical for the query on every page
 * (review of issue #1901): it was built from the page, so offset past the
 * canonical row served null, which the spec reads as "not a canonical-routed
 * query".
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const ROWS = [
	{
		fullName: "someone/hackthon-scaffold-stellar",
		description: "Hackathon dapp",
		codeScanState: "scanned",
		stellarProof: "cargo-sdk",
		repoScore: 16,
		lastCommitAt: "2026-10-01T00:00:00.000Z",
	},
	{
		fullName: "stellar-scaffold/cli",
		description: "The easiest way to build Stellar apps",
		codeScanState: "scanned",
		stellarProof: "cargo-sdk",
		repoScore: 77,
		lastCommitAt: "2026-10-01T00:00:00.000Z",
	},
];

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: async () => ({ docs: ROWS, totalDocs: ROWS.length }),
	})),
}));

const { GET } = await import("../../app/api/repos/search/route");

describe("repo search meta.canonical", () => {
	it("names the query's canonical repo on a page that does not hold it", async () => {
		const res = await GET(
			new NextRequest(
				"https://x.test/api/repos/search?q=scaffold%20stellar&limit=1&offset=1",
			),
		);
		const body = await res.json();
		expect(body.repos.map((r: { fullName: string }) => r.fullName)).toEqual([
			"someone/hackthon-scaffold-stellar",
		]);
		expect(body.meta.canonical?.repos).toEqual(["stellar-scaffold/cli"]);
	});
});
