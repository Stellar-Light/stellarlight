/**
 * sls-102 (#1913): Blend's tvlUSD sums four DefiLlama rows while
 * tvlMethodUrl linked the first of them, the V1 pools child (on 2026-11-04
 * DefiLlama put $43,591 of the four rows' $127.59M on it). A citation for a
 * sum must show the sum: one mapped row cites its own page; several cite
 * the parent page whose children are exactly those rows, as the TVL writer
 * last read DefiLlama's list (llamaListing.parent); with no such parent, or
 * none read yet, there is no single page, so the URL is null and llamaSlugs
 * lists each contributing row. The status checks cite that page, else the
 * first linked row's. A multi-row sum with no page is a nightly finding.
 *
 * Lives in src/lib so CI runs it; the route half drives the real route with
 * Payload mocked.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	llamaPageFor,
	llamaParentOf,
	statusChecksFor,
	tvlCitationGaps,
} from "../status-checks";

const BLEND = [
	"blend-pools",
	"blend-pools-v2",
	"blend-backstop",
	"blend-backstop-v2",
];
const SPIKO_WHY =
	"DefiLlama lists spiko but publishes no Stellar TVL figure for it (checked 2026-11-02).";

describe("llamaPageFor: the page that shows the whole tvlUSD", () => {
	it("one mapped row cites its own page", () => {
		expect(llamaPageFor(["aquarius-stellar"], null)).toBe(
			"https://defillama.com/protocol/aquarius-stellar",
		);
	});
	it("several rows cite the parent the writer verified", () => {
		expect(llamaPageFor(BLEND, "blend")).toBe(
			"https://defillama.com/protocol/blend",
		);
	});
	it("several rows with no verified parent: no single page", () => {
		expect(llamaPageFor(BLEND, null)).toBeNull();
		expect(llamaPageFor(BLEND, undefined)).toBeNull();
		expect(llamaPageFor(BLEND, "")).toBeNull();
	});
	it("not mapped is null", () => {
		expect(llamaPageFor(null, "blend")).toBeNull();
		expect(llamaPageFor([], null)).toBeNull();
	});
});

describe("llamaParentOf: the writer's read of DefiLlama's list", () => {
	// Shape of api.llama.fi/protocols on 2026-11-04 (parentProtocol only).
	const list = [
		...BLEND.map((slug) => ({ slug, parentProtocol: "parent#blend" })),
		{ slug: "soroswap-amm", parentProtocol: "parent#soroswap" },
		{ slug: "soroswap-aggregator", parentProtocol: "parent#soroswap" },
		{ slug: "aquarius-stellar", parentProtocol: null },
	];
	it("finds the parent whose children are exactly the mapped rows", () => {
		expect(llamaParentOf(BLEND, list)).toBe("blend");
	});
	it("a parent with a child the map lacks does not cover the sum", () => {
		const grown = [
			...list,
			{ slug: "blend-pools-v3", parentProtocol: "parent#blend" },
		];
		expect(llamaParentOf(BLEND, grown)).toBeNull();
	});
	it("rows from different families, or with no family, have no parent page", () => {
		expect(llamaParentOf(["blend-pools", "soroswap-amm"], list)).toBeNull();
		expect(llamaParentOf(["aquarius-stellar", "x"], list)).toBeNull();
	});
	it("one row needs no parent", () => {
		expect(llamaParentOf(["soroswap-amm"], list)).toBeNull();
	});
});

describe("status checks cite the same page", () => {
	const blend = (parent?: string | null) => ({
		status: "Live",
		types: ["Lending"],
		llamaSlugs: BLEND,
		tvlUSD: 127_588_232,
		tvlAsOf: "2026-11-02T13:19:15.688Z",
		llamaListing: {
			state: "listed",
			checkedAt: "2026-11-02T13:19:15Z",
			parent,
		},
	});
	const urls = (p: unknown) =>
		statusChecksFor(p, new Date("2026-11-04T12:00:00Z")).statusChecks?.map(
			(c) => c.sourceUrl,
		);
	it("Blend's checks link the verified parent page", () => {
		expect(urls(blend("blend"))).toEqual([
			"https://defillama.com/protocol/blend",
			"https://defillama.com/protocol/blend",
		]);
	});
	it("with no verified parent they fall back to the first row's page", () => {
		expect(urls(blend(null))).toEqual([
			"https://defillama.com/protocol/blend-pools",
			"https://defillama.com/protocol/blend-pools",
		]);
	});
});

describe("tvlCitationGaps: a multi-row sum with no page is a finding", () => {
	const rows = [
		{ slug: "blend", tvlUSD: 1, llamaSlugs: BLEND, tvlMethodUrl: null },
		{
			slug: "ok",
			tvlUSD: 1,
			llamaSlugs: BLEND,
			tvlMethodUrl: "https://defillama.com/protocol/blend",
		},
		{ slug: "one", tvlUSD: 1, llamaSlugs: ["x"], tvlMethodUrl: null },
		{ slug: "untracked", tvlUSD: null, llamaSlugs: BLEND },
	];
	const list = BLEND.map((slug) => ({ slug, parentProtocol: "parent#blend" }));
	it("DefiLlama still confirms a parent: not read yet, so the fix is to run the TVL lane", () => {
		expect(tvlCitationGaps(rows, list)).toEqual([
			{
				slug: "blend",
				family: BLEND,
				cause: "parent-not-read",
				action: expect.stringMatching(/enrich-tvl\.yml with execute=true/),
			},
		]);
	});
	it("DefiLlama no longer sums exactly these rows: the fix is the map", () => {
		const grown = [
			...list,
			{ slug: "blend-pools-v3", parentProtocol: "parent#blend" },
		];
		expect(tvlCitationGaps(rows, grown)).toEqual([
			{
				slug: "blend",
				family: BLEND,
				cause: "family-drift",
				action: expect.stringMatching(/LLAMA_MAP/),
			},
		]);
	});
	it("an unread DefiLlama list tells neither apart", () => {
		expect(tvlCitationGaps(rows, null)).toEqual([
			expect.objectContaining({ slug: "blend", cause: "could-not-check" }),
		]);
	});
});

describe("every TVL citation goes through the shared helpers", () => {
	// The class: a writer or route building https://defillama.com/protocol/
	// from llamaSlugs[0] cites one row of a sum. Only status-checks.ts builds
	// the URL. The project page's TVL card no longer builds one (#1912): it
	// links the page its route cites for the row, or none.
	const ROOT = process.cwd();
	const files = ["src", "scripts"].flatMap((dir) =>
		(readdirSync(join(ROOT, dir), { recursive: true }) as string[])
			.filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("node_modules"))
			.map((f) => join(dir, f)),
	);
	it("no other file builds a protocol URL from a slug", () => {
		const builders = files.filter((f) =>
			/defillama\.com\/protocol\/\$\{/.test(
				readFileSync(join(ROOT, f), "utf8"),
			),
		);
		expect(files.length).toBeGreaterThan(100); // the scan must not pass vacuously
		expect(builders.sort()).toEqual(["src/lib/status-checks.ts"]);
	});
	it("the project page keys its TVL card by the project's slug, never its name (#1912)", () => {
		// A name lookup across DefiLlama's Stellar list put Blend's pools on
		// "Lend" and Binance's exchange reserves on its page as TVL.
		const page = readFileSync(
			join(ROOT, "src/app/(frontend)/project/[slug]/page.tsx"),
			"utf8",
		);
		expect(page).toMatch(/<ProjectTVLChart projectSlug=\{project\.slug\} \/>/);
		const route = readFileSync(
			join(ROOT, "src/app/api/defillama/protocol/[slug]/route.ts"),
			"utf8",
		);
		expect(route).not.toMatch(
			/startsWith|\.includes\(lowerSlug\)|toLowerCase\(\) ===/,
		);
	});
});

// ── the served field ──────────────────────────────────────────────────────
vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/repo-search", async (orig) => ({
	...(await orig<typeof import("@/lib/repo-search")>()),
	searchRepos: vi.fn(async () => ({ repos: [], warnings: [] })),
}));
const lending = (slug: string, llamaSlugs: string[], parent?: string) => ({
	id: slug,
	name: slug,
	slug,
	category: "Protocol/Contract",
	shortDescription: "Lending pools on Soroban.",
	status: "Live",
	types: ["Lending"],
	tvlUSD: 1000,
	tvlAsOf: "2026-11-02T13:19:15.688Z",
	llamaSlugs,
	llamaListing: { state: "listed", checkedAt: "2026-11-02", parent },
});
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: vi.fn(async (a: { collection: string; limit?: number }) =>
			a.collection === "projects" && a.limit === 0
				? {
						docs: [
							lending("blend", BLEND, "blend"),
							lending("unverified", BLEND),
							lending("slender", ["slender"]),
							lending("two-families", ["blend-pools", "slender"]),
							// #1912: linked, and DefiLlama publishes no Stellar figure
							{
								...lending("spiko", ["spiko"]),
								tvlUSD: null,
								tvlUnavailable: SPIKO_WHY,
							},
						],
						totalDocs: 5,
					}
				: { docs: [], totalDocs: 0 },
		),
	})),
}));

describe("GET /api/projects/search tvlMethodUrl (sls-102)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubEnv("VOYAGE_API_KEY", "");
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it("cites the page that shows the sum, or none", async () => {
		vi.resetModules();
		const { GET } = await import("../../app/api/projects/search/route");
		const pending = GET(
			new NextRequest("https://x.test/api/projects/search?type=Lending"),
		);
		await vi.advanceTimersByTimeAsync(10_000);
		const body = await (await pending).json();
		const url = Object.fromEntries(
			body.projects.map((p: { slug: string; tvlMethodUrl: string | null }) => [
				p.slug,
				p.tvlMethodUrl,
			]),
		);
		expect(url).toEqual({
			blend: "https://defillama.com/protocol/blend",
			unverified: null,
			slender: "https://defillama.com/protocol/slender",
			"two-families": null,
			spiko: "https://defillama.com/protocol/spiko",
		});
	});

	it("a linked row with no figure serves why, dated, never 0 or an old figure (#1912)", async () => {
		vi.resetModules();
		const { GET } = await import("../../app/api/projects/search/route");
		const pending = GET(
			new NextRequest("https://x.test/api/projects/search?type=Lending"),
		);
		await vi.advanceTimersByTimeAsync(10_000);
		const body = await (await pending).json();
		const by = Object.fromEntries(
			body.projects.map((p: { slug: string }) => [p.slug, p]),
		);
		expect(by.spiko).toMatchObject({
			tvlUSD: null,
			tvlStale: null,
			tvlUnavailable: SPIKO_WHY,
			llamaSlugs: ["spiko"],
		});
		expect(by.blend).toMatchObject({ tvlUSD: 1000, tvlUnavailable: null });
	});
});
