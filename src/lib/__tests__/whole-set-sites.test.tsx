// @vitest-environment node

/**
 * Reads that fed a finished-looking answer from a capped find, and now go
 * through findWholeSet: a set past the ceiling is reported, never passed off
 * as all of it. The double caps at the limit and, with pagination on, counts
 * every match in totalDocs, as Payload does.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

type Doc = Record<string, unknown>;
const data: Record<string, Doc[]> = {};
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: async (args: { collection: string; limit?: number }) => {
			const rows = data[args.collection] ?? [];
			const limit = args.limit ?? 10;
			const docs = limit === 0 ? rows : rows.slice(0, limit);
			return {
				docs,
				totalDocs: rows.length,
				hasNextPage: docs.length < rows.length,
			};
		},
		count: async (args: { collection: string }) => ({
			totalDocs: (data[args.collection] ?? []).length,
		}),
	})),
}));
vi.mock("@/lib/integrations/dorahacks", async (orig) => ({
	...(await orig<typeof import("@/lib/integrations/dorahacks")>()),
	fetchAllDoraHacksHackathonsChecked: vi.fn(async () => ({
		hackathons: [],
		complete: true,
	})),
}));
vi.mock("@/lib/api-usage", () => ({
	getUsageStats: vi.fn(async () => null),
	getUsageUaSplit: vi.fn(async () => null),
}));
vi.mock("@/components/usage-chart", () => ({
	LINE_COLOR: "#000",
	UsageChart: () => null,
}));

describe("a cut read is reported, not passed off as the whole set", () => {
	it("builderCodeActivity will not return a join over a cut repo read", async () => {
		data.repos = Array.from({ length: 5001 }, (_, i) => ({
			owner: "dev",
			fullName: `dev/r${i}`,
			codeScanState: "scanned",
			tier: "core",
		}));
		data.projects = [];
		const { builderCodeActivity } = await import("@/lib/builder-code");
		const { getPayloadSafe } = await import("@/lib/payload-client");
		const payload = await getPayloadSafe();
		await expect(
			builderCodeActivity(payload as never, [{ github_username: "dev" }]),
		).rejects.toThrow(/5000 of 5001 repos/);
	});

	it("listedEvents is not complete when stored events pass its ceiling", async () => {
		data.hackathons = Array.from({ length: 301 }, (_, i) => ({
			slug: `h${i}`,
			name: `Hack ${i}`,
		}));
		const { listedEvents } = await import("@/lib/hackathon-build-query");
		const listed = await listedEvents();
		expect(listed.events).toHaveLength(300);
		expect(listed.complete).toBe(false);
	});

	it("/analytics counts every SCF-funded project and leaves a cut sum unknown", async () => {
		data.projects = Array.from({ length: 1001 }, (_, i) => ({
			scf: { awarded: true, totalAwarded: 1000 },
			id: `p${i}`,
		}));
		const { default: AnalyticsPage } = await import(
			"@/app/(frontend)/analytics/page"
		);
		const html = renderToStaticMarkup(await AnalyticsPage());
		const stat = (label: string) =>
			html.match(new RegExp(`${label}</[^>]+>\\s*<[^>]+>([^<]*)<`))?.[1];
		expect(stat("SCF-funded projects")).toBe("1,001");
		expect(stat("SCF funding tracked")).toBe("-");
	});
});
