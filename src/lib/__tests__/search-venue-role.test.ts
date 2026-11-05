/**
 * sls-113 (#1905): GET /api/projects/search ignored `venueRole` and said so
 * in meta.warnings, so "list the AMMs" could only be answered by paging the
 * whole DEX type and filtering client-side. The filter is now a hard
 * contract like `status` and `type`: validated against the one vocabulary,
 * applied to the candidate fetch, held on every served row, echoed in
 * meta.filters, and enough on its own to run a search.
 *
 * Lives in src/lib so CI runs it (CI's vitest covers src/lib and
 * src/components only); it drives the real route with Payload mocked.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VENUE_ROLES } from "../project-types";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
// The semantic rung: a fixed query vector and a stubbed $vectorSearch.
vi.mock("@/lib/embed", () => ({ embed: vi.fn(async () => [0.1, 0.2, 0.3]) }));
vi.mock("@/lib/repo-search", async (orig) => ({
	...(await orig<typeof import("@/lib/repo-search")>()),
	searchRepos: vi.fn(async () => ({ repos: [], warnings: [] })),
}));

type FindArgs = {
	collection: string;
	limit?: number;
	where?: unknown;
	select?: { embedding?: boolean };
};
const candidateWheres: unknown[] = [];
/** false = the read returns every row whatever it was asked (a stray). */
let honorWhere = true;
const isCandidate = (a: FindArgs) =>
	a.collection === "projects" && a.limit === 0 && a.select?.embedding === false;

const row = (
	slug: string,
	venueRole: string | null,
	shortDescription: string,
) => ({
	id: slug,
	name: slug,
	slug,
	category: "Protocol/Contract",
	shortDescription,
	status: "Live",
	types: ["DEX"],
	venueRole,
});
// A DEX-typed shadow whose canonical is a Wallet: under ?type=DEX the fold
// would drop it, so it must not be counted either.
const TYPE_SHADOW = {
	...row("olddex", null, "Old exchange."),
	status: "Draft",
	canonicalSlug: "walletapp",
};
const ROWS = [
	row("soroswap", "amm", "AMM swap pools on Soroban."),
	row("aquarius", "amm", "AMM swap pools and liquidity rewards."),
	row("lumagg", "aggregator-router", "Swap aggregator across Soroban AMMs."),
	row("stellarterm", "trading-ui", "Trading client for the SDEX swap market."),
	row("zenex", null, "Perpetuals swap exchange."),
	// A lineage shadow that carries the role while its canonical does not:
	// the fold serves the canonical, so the shadow is never an AMM row.
	{
		...row("legacyswap", "amm", "Legacy swap pools."),
		status: "Draft",
		canonicalSlug: "newproduct",
	},
	TYPE_SHADOW,
];
const CANONICALS = [
	row("newproduct", null, "A product that is not a venue."),
	{ ...row("walletapp", null, "A wallet."), types: ["Wallet"] },
];
/** What the stubbed vector search answers: a near neighbour with no role. */
const NEIGHBOURS = [
	{
		_id: "n1",
		...row("bondingcurve", null, "Bonding curve token launches."),
		score: 0.9,
	},
];
const aggregate = vi.fn(() => ({ toArray: async () => NEIGHBOURS }));
// Like the database: a `venueRole: { equals }` clause in the read holds.
const roleIn = (where: unknown): string | undefined =>
	(where as { venueRole?: { equals?: string } } | undefined)?.venueRole?.equals;
const slugIn = (where: unknown): string[] | undefined =>
	(where as { slug?: { in?: string[] } } | undefined)?.slug?.in;
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		db: { connection: { db: { collection: () => ({ aggregate }) } } },
		find: vi.fn(async (args: FindArgs) => {
			const wanted = slugIn(args.where);
			if (wanted) {
				const docs = [...ROWS, ...CANONICALS].filter((r) =>
					wanted.includes(r.slug),
				);
				return { docs, totalDocs: docs.length };
			}
			if (!isCandidate(args)) return { docs: [], totalDocs: 0 };
			candidateWheres.push(args.where);
			const role = honorWhere ? roleIn(args.where) : undefined;
			// Browse mode leaves lineage shadows out in the read itself.
			const browse =
				(args.where as { canonicalSlug?: { equals?: null } } | undefined)
					?.canonicalSlug?.equals === null;
			const docs = ROWS.filter(
				(r) =>
					(!role || r.venueRole === role) && !(browse && "canonicalSlug" in r),
			);
			return { docs, totalDocs: docs.length };
		}),
	})),
}));

async function search(qs: string) {
	vi.resetModules();
	const { GET } = await import("../../app/api/projects/search/route");
	const pending = GET(
		new NextRequest(`https://x.test/api/projects/search?${qs}`),
	);
	await vi.advanceTimersByTimeAsync(10_000);
	const res = await pending;
	return { status: res.status, body: await res.json() };
}
const slugs = (body: { projects: Array<{ slug: string }> }) =>
	body.projects.map((p) => p.slug).sort();

describe("GET /api/projects/search?venueRole= (sls-113)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubEnv("VOYAGE_API_KEY", "");
		candidateWheres.length = 0;
		honorWhere = true;
		aggregate.mockClear();
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it("total counts only rows a page can serve: a shadow whose canonical lacks the role is out", async () => {
		const { body } = await search("q=legacyswap&venueRole=amm");
		expect(slugs(body)).not.toContain("newproduct");
		expect(slugs(body)).not.toContain("legacyswap");
		expect(body.meta.counts.total).toBe(body.projects.length);
	});

	it("under ?type= too, a shadow whose canonical lacks the type is not counted", async () => {
		for (const qs of ["q=olddex&type=DEX", "q=x&type=DEX"]) {
			const { body } = await search(qs);
			expect(slugs(body), qs).not.toContain("walletapp");
			expect(body.meta.counts.total, qs).toBe(body.projects.length);
		}
	});

	it("says a venueRole search adds no rows found by meaning", async () => {
		const { body } = await search("q=bondingcurve+launches&venueRole=amm");
		expect(body.meta.matchModeLabel).toMatch(/no rows found by meaning/);
	});

	it("a role filter does not pad the page with vector neighbours", async () => {
		vi.stubEnv("VOYAGE_API_KEY", "test-key");
		// Control: without the filter the semantic rung runs and serves one.
		const open = await search("q=bondingcurve+launches");
		expect(aggregate).toHaveBeenCalled();
		expect(slugs(open.body)).toContain("bondingcurve");
		aggregate.mockClear();
		const { body } = await search("q=bondingcurve+launches&venueRole=amm");
		expect(aggregate).not.toHaveBeenCalled();
		expect(body.meta.counts.semantic).toBe(0);
		expect(slugs(body)).not.toContain("bondingcurve");
	});

	it("type=DEX&venueRole=amm serves only the AMM rows, filtered in the read too", async () => {
		const { status, body } = await search("type=DEX&venueRole=amm");
		expect(status).toBe(200);
		expect(slugs(body)).toEqual(["aquarius", "soroswap"]);
		expect(body.meta.counts.total).toBe(2);
		expect(body.meta.warnings ?? []).toEqual([]);
		expect(body.meta.filters.venueRole).toBe("amm");
		expect(JSON.stringify(candidateWheres)).toContain(
			'"venueRole":{"equals":"amm"}',
		);
	});

	it("a stray row a read returns off the filter is never served", async () => {
		honorWhere = false;
		const { body } = await search("type=DEX&venueRole=amm");
		expect(slugs(body)).toEqual(["aquarius", "soroswap"]);
	});

	it("venueRole alone is a search, not a no_query empty", async () => {
		const { status, body } = await search("venueRole=aggregator-router");
		expect(status).toBe(200);
		expect(body.meta.error).toBeUndefined();
		expect(slugs(body)).toEqual(["lumagg"]);
	});

	it("with q, the role still gates every served row", async () => {
		const { body } = await search("q=swap&venueRole=trading-ui");
		expect(slugs(body)).toEqual(["stellarterm"]);
		expect(body.meta.filters.venueRole).toBe("trading-ui");
	});

	it("an unknown role is a 400 naming every valid one", async () => {
		const { status, body } = await search("type=DEX&venueRole=orderbook");
		expect(status).toBe(400);
		expect(body.error).toMatch(/venueRole 'orderbook'/);
		expect(body.validVenueRoles).toEqual([...VENUE_ROLES]);
	});

	it("an unknown parameter is still named, and venueRole is listed as supported", async () => {
		const { body } = await search("type=DEX&venueRole=amm&country=NG");
		expect(body.meta.warnings[0]).toMatch(
			/Unknown parameter\(s\) ignored: country\./,
		);
		expect(body.meta.warnings[0]).toMatch(/Supported: [^.]*venueRole/);
	});
});
