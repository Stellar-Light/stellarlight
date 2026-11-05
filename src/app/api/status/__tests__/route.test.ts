import { describe, expect, it, vi } from "vitest";

// Final re-check 2026-11-05: status loaded and serialised the whole builds
// index on every call, and a cold cache made a monitor poll pay the store read.
const loadIndex = vi.fn(async () => {
	throw new Error("status must not load the index");
});
let recorded: { rows: number; bytes: number; measuredAt: string } | null = null;
vi.mock("@/lib/hackathon-builds", () => ({
	getHackathonBuildsIndex: loadIndex,
	lastBuildsIndexSize: () => recorded,
}));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => null),
}));
vi.mock("@/lib/api-usage", () => ({ getUsageStats: vi.fn(async () => null) }));
vi.mock("@/lib/integrations/sdf-skills", () => ({
	fetchSdfSkillCatalog: vi.fn(async () => null),
}));

const builds = async () => {
	const { GET } = await import("../route");
	const body = await (await GET()).json();
	return (body.sources as Array<Record<string, unknown>>).find(
		(s) => s.name === "hackathonBuilds",
	);
};

describe("GET /api/status reads the builds index size a build recorded", () => {
	it("serves the recorded size and its date, never loading the index", async () => {
		recorded = {
			rows: 1480,
			bytes: 1_469_664,
			measuredAt: "2026-11-05T14:00:00.000Z",
		};
		expect(await builds()).toMatchObject({
			count: 1480,
			indexBytes: 1_469_664,
			lastUpdatedAt: "2026-11-05T14:00:00.000Z",
		});
		expect(loadIndex).not.toHaveBeenCalled();
	});

	it("serves null when no build has recorded one yet", async () => {
		recorded = null;
		expect(await builds()).toMatchObject({ count: null, indexBytes: null });
		expect(loadIndex).not.toHaveBeenCalled();
	});
});
