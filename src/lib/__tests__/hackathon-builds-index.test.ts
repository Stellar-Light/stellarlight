import { describe, expect, it, vi } from "vitest";
import type { HackathonBuild } from "@/payload-types";

// Blitz's three stored rows, saved 2026-11-04: the sync typed each row from
// its own embedding, so two read SDK and one no confident type.
const AT = "2026-11-04T00:00:00.000Z";
const blitz = (slug: string, types: string[]): HackathonBuild =>
	({
		id: slug,
		buildId: "dorahacks-buidl-31669",
		name: "Blitz - QR Code Auction Platform",
		hackathonSlug: slug,
		hackathonTitle: slug,
		url: "https://dorahacks.io/buidl/31669",
		categories: types.map((type) => ({ type, score: 0.8 })),
		categoriesAt: AT,
		stack: ["@stellar/stellar-sdk", "soroban-sdk"],
		stackReadAt: AT,
		firstSeenAt: AT,
		lastSeenAt: AT,
		updatedAt: AT,
		createdAt: AT,
	}) as HackathonBuild;
const rows = [
	blitz("buildonstellarchile", []),
	blitz("buildonstellarhack", ["SDK"]),
	blitz("ideaton2026", ["SDK"]),
];
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: async ({ collection }: { collection: string }) => ({
			docs: collection === "hackathon-builds" ? rows : [],
		}),
	})),
}));

describe("the index a submission's rows are read into", () => {
	it("gives every row of one submission its types and packages", async () => {
		const { buildHackathonBuildsIndex } = await import(
			"@/lib/hackathon-builds"
		);
		const idx = await buildHackathonBuildsIndex();
		expect(
			idx.map((b) => [b.hackathon.slug, b.categories?.map((c) => c.type)]),
		).toEqual([
			["buildonstellarchile", ["SDK"]],
			["buildonstellarhack", ["SDK"]],
			["ideaton2026", ["SDK"]],
		]);
	});
});
