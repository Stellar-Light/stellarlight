import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { GET } from "../route";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
// The unknown-parameter warning is decided before any read: no database.
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => null),
}));

async function meta(qs: string) {
	const res = await GET(
		new NextRequest(`https://stellarlight.xyz/api/leaderboard?${qs}`),
	);
	expect(res.status).toBe(200);
	return (await res.json()).meta;
}

describe("GET /api/leaderboard unknown-parameter warning", () => {
	it("applies type without calling it ignored", async () => {
		const m = await meta("type=DEX");
		expect(m.filters.type).toEqual(["DEX"]);
		expect(m.warnings).toBeUndefined();
	});

	it("warns on none of the parameters the route reads", async () => {
		const m = await meta(
			"sort=stars&range=30d&category=Tooling&type=DEX,Lending&limit=5&format=json",
		);
		expect(m.warnings).toBeUndefined();
	});

	it("still names a parameter it does not read, and lists type as supported", async () => {
		const m = await meta("type=DEX&include=hackathons");
		expect(m.warnings).toHaveLength(1);
		expect(m.warnings[0]).toContain("Unknown parameter(s) ignored: include.");
		expect(m.warnings[0]).toMatch(/Supported: [^.]*\btype\b/);
	});
});
