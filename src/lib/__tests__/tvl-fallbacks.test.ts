/** Review 2026-11-04: two TVL routes served hard-coded figures from March
 * 2026 as current when a read failed or a key was missing: /api/rwa-tvl
 * 1,688,000,000 with five issuer values, /api/defillama/protocol/{slug}
 * Benji 625,861,896 and WisdomTree 20,000,000, and 0 (with change1d 0) for a
 * protocol DefiLlama gave no Stellar figure. Unknown is null or a 503; a
 * real reading is served with its date. */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (url: string) => Response | Promise<Response>;
let handler: Handler;
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status });
const page = (tvl: number) =>
	new Response(
		`<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
			props: {
				pageProps: {
					network: {
						asset_count: 3,
						issuer_stats: [
							{
								name: "Spiko",
								bridged_token_value_dollar: { val: 9 },
								asset_count: 2,
							},
						],
					},
					aggregates: { a: { label: "Distributed Asset Value", value: tvl } },
				},
			},
		})}</script></html>`,
		{ status: 200 },
	);

beforeEach(() => {
	vi.resetModules();
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => handler(String(url))),
	);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

async function rwaTvl() {
	const { GET } = await import("@/app/api/rwa-tvl/route");
	return GET;
}
async function protocol(slug: string) {
	const { GET } = await import("@/app/api/defillama/protocol/[slug]/route");
	const res = await GET(
		new NextRequest(`https://stellarlight.xyz/api/defillama/protocol/${slug}`),
		{ params: Promise.resolve({ slug }) },
	);
	return {
		status: res.status,
		retryAfter: res.headers.get("Retry-After"),
		body: await res.json(),
	};
}

describe("/api/rwa-tvl never serves a figure it did not read", () => {
	it("a failed first read is a 503, not a March 2026 figure", async () => {
		handler = () => new Response("bad gateway", { status: 502 });
		const res = await (await rwaTvl())();
		expect(res.status).toBe(503);
		const body = await res.json();
		expect(body.tvl).toBeUndefined();
		expect(body.retryAfterSeconds).toBeGreaterThan(0);
	});

	it("a page without the figure is a 503 too", async () => {
		handler = () => new Response("<html>no data</html>", { status: 200 });
		expect((await (await rwaTvl())()).status).toBe(503);
	});

	it("a reading is dated, and a later failed read serves it with that date", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-11-04T10:00:00.000Z"));
		handler = () => page(1_200_000_000);
		const GET = await rwaTvl();
		const first = await (await GET()).json();
		expect(first).toMatchObject({
			tvl: 1_200_000_000,
			asOf: "2026-11-04T10:00:00.000Z",
			cached: false,
		});
		// A day later the cache has expired and rwa.xyz fails.
		vi.setSystemTime(new Date("2026-11-05T11:00:00.000Z"));
		handler = () => new Response("bad gateway", { status: 502 });
		const later = await GET();
		expect(later.status).toBe(200);
		expect(await later.json()).toMatchObject({
			tvl: 1_200_000_000,
			asOf: "2026-11-04T10:00:00.000Z",
			cached: true,
		});
		vi.useRealTimers();
	});
});

describe("/api/defillama/protocol/{slug} never serves a figure it did not read", () => {
	const protocols = [
		{
			name: "Blend",
			slug: "blend-pools",
			chains: ["Stellar"],
			chainTvls: { Stellar: 129_334_939 },
			change_1d: 1.5,
			change_7d: -2,
			logo: null,
			category: "Lending",
		},
		{
			name: "Quiet",
			slug: "quiet",
			chains: ["Stellar"],
			chainTvls: {},
			logo: null,
			category: "Dexes",
		},
	];

	// 2026-11-07: Benji is its Horizon supply at $1.00 a share, read for the
	// registry's verified issuer (rwa.xyz's asset API moved off its v4 path).
	const BENJI_ISSUER = "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5";
	const benjiRecord = {
		asset_code: "BENJI",
		asset_issuer: BENJI_ISSUER,
		balances: {
			authorized: "1150573406.8338513",
			authorized_to_maintain_liabilities: "0.0000000",
			unauthorized: "25.0775957",
		},
		claimable_balances_amount: "0.0000000",
		liquidity_pools_amount: "0.0000000",
		contracts_amount: "0.0000000",
	};

	it("Benji is its Horizon supply at $1.00 a share, dated at the read", async () => {
		const asked: string[] = [];
		handler = (url) => {
			asked.push(url);
			return json({ _embedded: { records: [benjiRecord] } });
		};
		const { status, body } = await protocol("benji");
		expect(status).toBe(200);
		expect(body.currentTVL).toBeCloseTo(1150573431.911447, 6);
		expect(Number.isNaN(Date.parse(body.asOf))).toBe(false);
		expect(body).toMatchObject({
			change1d: null,
			change7d: null,
			historicalTVL: null,
		});
		expect(body.sourceUrl).toContain("horizon.stellar.org/assets");
		// Token supply, not the fund's reported shares outstanding: said so.
		expect(body.method).toBe("Stellar token supply at $1.00 per share");
		expect(asked).toHaveLength(1);
		expect(asked[0]).toContain(`asset_issuer=${BENJI_ISSUER}`);
	});

	it("Benji with no Horizon record for the issuer answers 503, not a zero", async () => {
		handler = () => json({ _embedded: { records: [] } });
		expect((await protocol("benji")).status).toBe(503);
	});

	it("WisdomTree: the hard-coded 20,000,000 is gone", async () => {
		handler = () => json({}, 500);
		const { body } = await protocol("wisdomtree");
		expect(body.currentTVL).toBeNull();
		expect(body.change1d).toBeNull();
	});

	it("a DefiLlama protocol with no Stellar figure serves null, not 0", async () => {
		handler = (url) =>
			url.endsWith("/protocols")
				? json(protocols)
				: json({ chainTvls: {}, currentChainTvls: {} });
		const { status, body } = await protocol("quiet");
		expect(status).toBe(200);
		expect(body).toMatchObject({
			currentTVL: null,
			change1d: null,
			change7d: null,
		});
	});

	it("a failed detail read is a 503, not not-found", async () => {
		handler = (url) =>
			url.endsWith("/protocols") ? json(protocols) : json({}, 502);
		const { status, body } = await protocol("blend");
		expect(status).toBe(503);
		expect(body.found).toBeUndefined();
	});

	// Re-check 2026-11-05: not configured (no key) and failed (key set, read
	// failed) both served 200 with nulls; a failed list read was a bare 500.
	it("Benji with a failed Horizon read answers 503 with Retry-After", async () => {
		handler = () => json({ error: "upstream" }, 500);
		const { status, retryAfter } = await protocol("benji");
		expect(status).toBe(503);
		expect(Number(retryAfter)).toBeGreaterThan(0);
	});

	it("Benji with a thrown Horizon read answers 503 too", async () => {
		handler = () => {
			throw new Error("socket hang up");
		};
		expect((await protocol("benji")).status).toBe(503);
	});

	it("a failed DefiLlama protocols list read answers 503 with Retry-After, not a 500", async () => {
		handler = (url) =>
			url.endsWith("/protocols") ? json({ error: "down" }, 500) : json({});
		const { status, retryAfter, body } = await protocol("blend");
		expect(status).toBe(503);
		expect(Number(retryAfter)).toBeGreaterThan(0);
		expect(body.retryAfterSeconds).toBeGreaterThan(0);
	});

	it("a thrown DefiLlama detail read answers 503", async () => {
		handler = (url) => {
			if (url.endsWith("/protocols")) return json(protocols);
			throw new Error("connection reset");
		};
		expect((await protocol("blend")).status).toBe(503);
	});

	it("a full reading is served with its figures and the date of its last point", async () => {
		handler = (url) =>
			url.endsWith("/protocols")
				? json(protocols)
				: json({
						chainTvls: {
							Stellar: {
								tvl: [
									{ date: 1_761_955_200, totalLiquidityUSD: 120_000_000 },
									{ date: 1_762_041_600, totalLiquidityUSD: 129_334_939 },
								],
							},
						},
					});
		const { status, body } = await protocol("blend");
		expect(status).toBe(200);
		expect(body).toMatchObject({
			currentTVL: 129_334_939,
			change1d: 1.5,
			change7d: -2,
			asOf: new Date(1_762_041_600 * 1000).toISOString(),
		});
		expect(body.historicalTVL).toHaveLength(2);
	});
});
