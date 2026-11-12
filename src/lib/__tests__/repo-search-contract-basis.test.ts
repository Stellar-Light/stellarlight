/**
 * Repo search serves whose contract a row's mainnetContractId is (2026-11-11:
 * reflector-network/reflector-stellar-connector held the SushiSwap factory
 * its README gives as a config default, served bare as its contract id).
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const ROW = {
	fullName: "reflector-network/reflector-stellar-connector",
	description: "",
	topics: [],
	repoScore: 50,
	stars: 0,
	lastCommitAt: "2026-10-01T00:00:00.000Z",
	codeScanState: "scanned",
	stellarProof: "js-sdk",
	mainnetContractId: "CD3KRKGDRVWPXVB3VXLUMQKMX6XZ6Q2H334IVZD4XXNAMKSRVQL5GLYF",
	mainnetContractBasis: "cited",
};

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: async () => ({ docs: [ROW], totalDocs: 1 }),
	})),
}));

const { GET } = await import("../../app/api/repos/search/route");

describe("repo search contract basis", () => {
	it("serves the basis beside the id", async () => {
		const body = await (
			await GET(new NextRequest("https://x.test/api/repos/search?limit=5"))
		).json();
		expect(body.repos[0].codeVerified.mainnetContractId).toBe(
			ROW.mainnetContractId,
		);
		expect(body.repos[0].codeVerified.mainnetContractBasis).toBe("cited");
	});
});
