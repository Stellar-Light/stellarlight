/** Review 2026-11-04: getLeaderboard's CSV served tvl_usd with no date and no
 * stale flag, and the tvlStale text claimed a cause (the refresh "found no
 * current figure") and a sort rule the code has neither of. The CSV dates
 * each figure, and the text says only what is checked: the date. */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spec } from "@/lib/openapi-spec";
import { responseSchema } from "../../../scripts/contract/served-shape";

const row = (slug: string, tvlUSD: number | null, tvlAsOf: string | null) => ({
	id: slug,
	slug,
	name: slug,
	category: "Protocol/Contract",
	types: ["Lending"],
	shortDescription: null,
	scf: { awarded: false },
	tvlUSD,
	tvlAsOf,
	onchain: null,
});
const find = vi.fn(async (args: { collection: string }) => {
	const docs =
		args.collection === "projects"
			? [
					row("spiko", 1653789314, "2026-09-14T10:30:21.591Z"),
					row("blend", 129334939, "2026-11-02T13:19:15.688Z"),
					row("lobstr", null, null),
				]
			: [];
	return { docs, totalDocs: docs.length };
});
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({ find })),
}));
vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));

const { GET } = await import("@/app/api/leaderboard/route");
const get = (qs: string) =>
	GET(new NextRequest(`https://stellarlight.xyz/api/leaderboard${qs}`));

beforeAll(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-11-04T21:00:00.000Z"));
});
afterAll(() => vi.useRealTimers());

describe("getLeaderboard dates every TVL figure it ranks", () => {
	it("the CSV carries each reading's date and stale flag, appended after the old columns", async () => {
		const [header, ...lines] = (
			await (await get("?format=csv&sort=tvl")).text()
		)
			.trim()
			.split("\n");
		expect(header.endsWith(",short_description,tvl_as_of,tvl_stale")).toBe(
			true,
		);
		const cells = (slug: string) =>
			lines
				.find((l) => l.split(",")[2] === slug)
				?.split(",")
				.slice(-2);
		expect(cells("spiko")).toEqual(["2026-09-14T10:30:21.591Z", "true"]);
		expect(cells("blend")).toEqual(["2026-11-02T13:19:15.688Z", "false"]);
		expect(cells("lobstr")).toEqual(["", ""]);
	});

	it("metricDefinitions.tvl names tvlStale, and the order is tvlUSD alone", async () => {
		const body = await (await get("?sort=tvl")).json();
		expect(body.meta.metricDefinitions.tvl).toMatch(/tvlStale/);
		expect(
			body.projects.map((p: { slug: string }) => p.slug).slice(0, 2),
		).toEqual(["spiko", "blend"]);
	});

	it("the spec's tvlStale text says what is checked, never a cause or a sort rule", () => {
		// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
		const s: any = spec;
		const project = s.components.schemas.Project.properties;
		const board = s.components.schemas.LeaderboardProject.properties;
		// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
		const tvl = (responseSchema(spec, "/api/analyze") as any).properties.tvl
			.properties;
		const texts = [
			project.tvlStale.description,
			project.tvlUSD.description,
			board.tvlStale.description,
			tvl.top10.items.properties.tvlStale.description,
		];
		for (const t of texts) {
			expect(t).not.toMatch(
				/found no current|kept this one|kept the last|kept from an earlier run|ranks it as a past/,
			);
		}
		for (const t of [
			project.tvlStale,
			board.tvlStale,
			tvl.top10.items.properties.tvlStale,
		])
			expect(t.description).toMatch(/only the date is checked/i);
		expect(board.tvlStale.description).toMatch(/orders by tvlUSD alone/);
	});
});
