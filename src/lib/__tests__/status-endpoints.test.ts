/**
 * /api/status's endpoints[] lists exactly the public spec's paths. The live
 * drift guard (scripts/check-api-drift.ts) checks the same both ways, but
 * only after a deploy: /api/tokens/integrations shipped without an entry and
 * the guard went red. This fails the PR instead.
 */
import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/status/route";
import { spec } from "@/lib/openapi-spec";

vi.mock("@/lib/hackathon-builds", () => ({
	getHackathonBuildsIndex: vi.fn(),
	lastBuildsIndexSize: () => null,
}));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => null),
}));
vi.mock("@/lib/api-usage", () => ({ getUsageStats: vi.fn(async () => null) }));
vi.mock("@/lib/integrations/sdf-skills", () => ({
	fetchSdfSkillCatalog: vi.fn(async () => null),
}));

describe("/api/status endpoint registry", () => {
	it("lists every public spec path and nothing else", async () => {
		const { endpoints } = (await (await GET()).json()) as {
			endpoints: string[];
		};
		expect([...endpoints].sort()).toEqual(Object.keys(spec.paths).sort());
	});
});
