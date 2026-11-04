/**
 * sls-102 (#1913): Blend's tvlUSD sums four DefiLlama rows while
 * tvlMethodUrl linked the first of them, the V1 pools child, which held
 * about $43k of the $127M. A citation for a sum must show the sum: one
 * mapped row cites its own page; several cite the parent page whose
 * children are exactly those rows; with no such parent there is no single
 * page, so the URL is null and llamaSlugs lists each contributing row.
 * The status checks cite the same page.
 *
 * Lives in src/lib so CI runs it; the route half drives the real route with
 * Payload mocked.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	LLAMA_PARENT_PAGES,
	llamaPageFor,
	llamaParentOf,
	statusChecksFor,
} from "../status-checks";

const BLEND = [
	"blend-pools",
	"blend-pools-v2",
	"blend-backstop",
	"blend-backstop-v2",
];

describe("llamaPageFor: the page that shows the whole tvlUSD", () => {
	it("one mapped row cites its own page", () => {
		expect(llamaPageFor(["aquarius-stellar"])).toBe(
			"https://defillama.com/protocol/aquarius-stellar",
		);
	});
	it("Blend's four rows cite the parent page, in any order", () => {
		expect(llamaPageFor(BLEND)).toBe("https://defillama.com/protocol/blend");
		expect(llamaPageFor([...BLEND].reverse())).toBe(
			"https://defillama.com/protocol/blend",
		);
	});
	it("several rows without a parent that sums exactly them: no single page", () => {
		expect(llamaPageFor(["blend-pools", "aquarius-stellar"])).toBeNull();
		expect(llamaPageFor(BLEND.slice(0, 2))).toBeNull();
	});
	it("not mapped is null", () => {
		expect(llamaPageFor(null)).toBeNull();
		expect(llamaPageFor([])).toBeNull();
	});
});

describe("llamaParentOf: the writer's check against DefiLlama's list", () => {
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
	it("every curated parent page agrees with the rule it stands for", () => {
		for (const [key, parent] of Object.entries(LLAMA_PARENT_PAGES)) {
			const slugs = key.split(",");
			const fam = slugs.map((slug) => ({
				slug,
				parentProtocol: `parent#${parent}`,
			}));
			expect(llamaParentOf(slugs, fam)).toBe(parent);
			expect(key).toBe([...slugs].sort().join(","));
		}
	});
});

describe("status checks cite the same page", () => {
	it("Blend's listing and TVL checks link the parent page", () => {
		const out = statusChecksFor(
			{
				status: "Live",
				types: ["Lending"],
				llamaSlugs: BLEND,
				tvlUSD: 127_588_232,
				tvlAsOf: "2026-11-02T13:19:15.688Z",
				llamaListing: { state: "listed", checkedAt: "2026-11-02T13:19:15Z" },
			},
			new Date("2026-11-04T12:00:00Z"),
		);
		expect(out.statusChecks?.map((c) => c.sourceUrl)).toEqual([
			"https://defillama.com/protocol/blend",
			"https://defillama.com/protocol/blend",
		]);
	});
});

// ── the served field ──────────────────────────────────────────────────────
vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/repo-search", async (orig) => ({
	...(await orig<typeof import("@/lib/repo-search")>()),
	searchRepos: vi.fn(async () => ({ repos: [], warnings: [] })),
}));
const lending = (slug: string, llamaSlugs: string[]) => ({
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
});
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: vi.fn(async (a: { collection: string; limit?: number }) =>
			a.collection === "projects" && a.limit === 0
				? {
						docs: [
							lending("blend", BLEND),
							lending("slender", ["slender"]),
							lending("two-families", ["blend-pools", "slender"]),
						],
						totalDocs: 3,
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
			slender: "https://defillama.com/protocol/slender",
			"two-families": null,
		});
	});
});
