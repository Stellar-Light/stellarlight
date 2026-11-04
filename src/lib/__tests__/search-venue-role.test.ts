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
const ROWS = [
	row("soroswap", "amm", "AMM swap pools on Soroban."),
	row("aquarius", "amm", "AMM swap pools and liquidity rewards."),
	row("lumagg", "aggregator-router", "Swap aggregator across Soroban AMMs."),
	row("stellarterm", "trading-ui", "Trading client for the SDEX swap market."),
	row("zenex", null, "Perpetuals swap exchange."),
];
// Like the database: a `venueRole: { equals }` clause in the read holds.
const roleIn = (where: unknown): string | undefined =>
	(where as { venueRole?: { equals?: string } } | undefined)?.venueRole?.equals;
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: vi.fn(async (args: FindArgs) => {
			if (!isCandidate(args)) return { docs: [], totalDocs: 0 };
			candidateWheres.push(args.where);
			const role = honorWhere ? roleIn(args.where) : undefined;
			const docs = role ? ROWS.filter((r) => r.venueRole === role) : ROWS;
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
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
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
