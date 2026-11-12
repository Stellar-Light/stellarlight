/** Review 2026-11-04: two TVL routes served hard-coded figures from March
 * 2026 as current when a read failed or a key was missing: /api/rwa-tvl
 * 1,688,000,000 with five issuer values, /api/defillama/protocol/{slug}
 * Benji 625,861,896 and WisdomTree 20,000,000, and 0 (with change1d 0) for a
 * protocol DefiLlama gave no Stellar figure. Unknown is null or a 503; a
 * real reading is served with its date. */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// #1912 (2026-11-11): the project page's TVL card reads the project's own
// row by slug, so the store is mocked; DefiLlama serves only page history.
const db = vi.hoisted(() => ({
	rows: [] as Record<string, unknown>[],
	down: false,
}));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () =>
		db.down
			? null
			: {
					find: vi.fn(async (a: { where: { slug: { equals: string } } }) => ({
						docs: db.rows.filter((r) => r.slug === a.where.slug.equals),
					})),
				},
	),
}));

type Handler = (
	url: string,
	init?: RequestInit,
) => Response | Promise<Response>;
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
	db.rows = [];
	db.down = false;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init?: RequestInit) =>
			handler(String(url), init),
		),
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
	// DefiLlama's Stellar list as the old name lookup read it (Stellar slices
	// of 2026-11-11): the protocols a project NAME used to match.
	const protocols = [
		["Blend Pools V2", "blend-pools-v2", 116_448_444],
		["Binance CEX", "binance-cex", 218_389_415],
		["Aquarius", "aquarius-stellar", 37_887_387],
		["Stellar DeFi Hub", "stellar-defi-hub", 80_769_055],
	].map(([name, slug, stellar]) => ({
		name,
		slug,
		chains: ["Stellar"],
		chainTvls: { Stellar: stellar },
		change_1d: 1.5,
		change_7d: -2,
		logo: null,
		category: "Lending",
	}));
	const series = (page: string) =>
		json({
			name: page,
			chainTvls: {
				Stellar: {
					tvl: [
						{ date: 1_762_732_800, totalLiquidityUSD: 79_000_000 },
						{ date: 1_762_819_200, totalLiquidityUSD: 80_769_055 },
					],
				},
			},
		});
	const llama = (url: string) =>
		url.endsWith("/protocols")
			? json(protocols)
			: series(url.slice(url.lastIndexOf("/") + 1));
	const daysAgo = (n: number) =>
		new Date(Date.now() - n * 86_400_000).toISOString();
	const row = (slug: string, more: Record<string, unknown>) => ({
		slug,
		name: slug,
		category: "Lending",
		status: "Live",
		tvlUSD: null,
		tvlAsOf: null,
		llamaSlugs: null,
		llamaListing: null,
		...more,
	});

	// 2026-11-07: Benji is its Horizon supply at $1.00 a share, read for the
	// registry's verified issuer (rwa.xyz's asset API moved off its v4 path).
	const BENJI_ISSUER =
		"GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5";
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

	it("a project's card is its own row: figure, date, freshness, and its page's Stellar history (#1912)", async () => {
		const asked: string[] = [];
		handler = (url) => {
			asked.push(url);
			return llama(url);
		};
		const at = daysAgo(2);
		db.rows = [
			row("sentora", {
				name: "Sentora",
				tvlUSD: 80_769_055,
				tvlAsOf: at,
				llamaSlugs: ["stellar-defi-hub"],
				llamaListing: { state: "listed", parent: null },
			}),
		];
		const { status, body } = await protocol("sentora");
		expect(status).toBe(200);
		expect(body).toMatchObject({
			found: true,
			name: "Sentora",
			currentTVL: 80_769_055,
			asOf: at,
			stale: false,
			unavailable: null,
			change1d: null,
			change7d: null,
			sourceUrl: "https://defillama.com/protocol/stellar-defi-hub",
			method: null,
		});
		expect(body.historicalTVL).toEqual([
			{ date: 1_762_732_800_000, tvl: 79_000_000 },
			{ date: 1_762_819_200_000, tvl: 80_769_055 },
		]);
		// Only the page that shows the figure is read, never the name list.
		expect(asked).toEqual(["https://api.llama.fi/protocol/stellar-defi-hub"]);
	});

	it("a linked row DefiLlama gives no Stellar figure: null with its dated reason, never 0 (#1912)", async () => {
		handler = (url) =>
			url.endsWith("/protocol/spiko")
				? json({ chainTvls: {}, currentChainTvls: {} })
				: llama(url);
		const why =
			"DefiLlama lists spiko but publishes no Stellar TVL figure for it (checked 2026-11-11).";
		db.rows = [
			row("spiko", {
				name: "Spiko",
				tvlAsOf: daysAgo(1),
				tvlUnavailable: why,
				llamaSlugs: ["spiko"],
			}),
		];
		const { status, body } = await protocol("spiko");
		expect(status).toBe(200);
		expect(body).toMatchObject({
			found: true,
			currentTVL: null,
			stale: null,
			unavailable: why,
			historicalTVL: [],
			sourceUrl: "https://defillama.com/protocol/spiko",
		});
	});

	it("a project name never borrows another protocol's TVL (#1912)", async () => {
		const asked: string[] = [];
		handler = (url) => {
			asked.push(url);
			return llama(url);
		};
		// "Lend" matched Blend Pools V2 ($116M) by name, "Binance" its own
		// exchange reserves; neither row is linked to DefiLlama.
		db.rows = [
			row("lend", { name: "Lend" }),
			row("binance", { name: "Binance" }),
		];
		for (const slug of ["lend", "binance", "stellar-defi-hub"]) {
			const { status, body } = await protocol(slug);
			expect(status, slug).toBe(404);
			expect(body.found, slug).toBe(false);
		}
		expect(asked).toEqual([]);
	});

	it("a multi-protocol row serves its own sum, cites the page that sums it, and says so (#1912)", async () => {
		const asked: string[] = [];
		handler = (url) => {
			asked.push(url);
			return llama(url);
		};
		const slugs = [
			"blend-pools",
			"blend-pools-v2",
			"blend-backstop",
			"blend-backstop-v2",
		];
		db.rows = [
			row("blend", {
				name: "Blend",
				tvlUSD: 115_148_044,
				tvlAsOf: daysAgo(2),
				llamaSlugs: slugs,
				llamaListing: { state: "listed", parent: "blend" },
			}),
		];
		const { body } = await protocol("blend");
		expect(body).toMatchObject({
			currentTVL: 115_148_044,
			sourceUrl: "https://defillama.com/protocol/blend",
			method: `the sum of 4 DefiLlama protocols: ${slugs.join(", ")}`,
		});
		expect(asked).toEqual(["https://api.llama.fi/protocol/blend"]);
		// No page sums the rows: no history and no page cited, the sum named.
		db.rows = [
			row("blend", {
				tvlUSD: 115_148_044,
				tvlAsOf: daysAgo(2),
				llamaSlugs: slugs,
			}),
		];
		const none = (await protocol("blend")).body;
		expect(none).toMatchObject({
			currentTVL: 115_148_044,
			historicalTVL: null,
			sourceUrl: null,
		});
		expect(none.method).toContain("the sum of 4 DefiLlama protocols");
	});

	it("an old row figure is served with its date and flagged stale (#1912)", async () => {
		handler = llama;
		db.rows = [
			row("sentora", {
				tvlUSD: 10_393_904,
				tvlAsOf: "2026-08-10T06:16:01.283Z",
				llamaSlugs: ["stellar-defi-hub"],
			}),
		];
		const { body } = await protocol("sentora");
		expect(body).toMatchObject({
			currentTVL: 10_393_904,
			asOf: "2026-08-10T06:16:01.283Z",
			stale: true,
		});
	});

	it("a failed or thrown history read keeps the row's figure and serves no history (#1912)", async () => {
		db.rows = [
			row("aquarius", {
				name: "Aquarius",
				tvlUSD: 37_359_057,
				tvlAsOf: daysAgo(2),
				llamaSlugs: ["aquarius-stellar"],
			}),
		];
		handler = (url) =>
			url.endsWith("/protocols") ? json(protocols) : json({}, 502);
		const failed = await protocol("aquarius");
		expect(failed.status).toBe(200);
		expect(failed.body).toMatchObject({
			currentTVL: 37_359_057,
			historicalTVL: null,
		});
		handler = (url) => {
			if (url.endsWith("/protocols")) return json(protocols);
			throw new Error("connection reset");
		};
		expect((await protocol("aquarius")).body.historicalTVL).toBeNull();
	});

	it("a history read past 8 s is abandoned: the row's figure stands, with no chart (#1912 audit)", async () => {
		db.rows = [
			row("aquarius", {
				tvlUSD: 37_359_057,
				tvlAsOf: daysAgo(2),
				llamaSlugs: ["aquarius-stellar"],
			}),
		];
		const asked: number[] = [];
		const timeout = vi
			.spyOn(AbortSignal, "timeout")
			.mockImplementation((ms: number) => {
				asked.push(ms);
				const c = new AbortController();
				c.abort(new DOMException("The operation timed out.", "TimeoutError"));
				return c.signal;
			});
		// The page never answers; only the timeout's signal ends the read.
		handler = (url, init) =>
			url.endsWith("/protocols")
				? json(protocols)
				: new Promise<Response>((_, reject) => {
						const signal = init?.signal;
						if (!signal) return;
						if (signal.aborted) reject(signal.reason);
						signal.addEventListener("abort", () => reject(signal.reason));
					});
		try {
			const { status, body } = await protocol("aquarius");
			expect(status).toBe(200);
			expect(body).toMatchObject({
				currentTVL: 37_359_057,
				historicalTVL: null,
			});
			expect(asked).toContain(8000);
		} finally {
			timeout.mockRestore();
		}
	});

	it("a failed project store read answers 503 with Retry-After, not a 404 or a zero (#1912)", async () => {
		handler = llama;
		db.down = true;
		const { status, retryAfter } = await protocol("sentora");
		expect(status).toBe(503);
		expect(Number(retryAfter)).toBeGreaterThan(0);
	});
});
