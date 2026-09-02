import { curveLinear } from "d3-shape";
import { describe, expect, it } from "vitest";
import {
	computeSeriesPathPoints,
	seriesPathFromPoints,
} from "@/components/charts/series-path-utils";
import { buildYScalesFromDomains } from "@/components/charts/y-axis-scales";
import { niceYDomain } from "@/components/charts/y-domain-utils";
import {
	capSeriesWithOther,
	issuerLeaderboard,
	measuredDayCount,
	type SeriesRow,
	stackedBands,
	toShare,
	windowed,
} from "../stablecoin-series";
import { rankStablecoins, type StoreRow, storeRowToApi } from "../stablecoins";

// Real rows as our own `stablecoins` collection stores them, values captured
// from the first live write 2026-08-19 — the exact denomination trap.
const USDY: StoreRow = {
	assetId: "USDY-GAJMPX5N",
	code: "USDY",
	name: "USDY",
	issuer: "GAJMPX5NBOG6TQFPQGRABJEEB2YE7RFRLUKJDZAZGAD5GFX4J7TADAZ6",
	domain: "ondo.finance",
	company: "Ondo Finance",
	peg: "USD",
	assetType: "Yield Stablecoin",
	supply: 467_502_181,
	priceUSD: 1,
	marketCapUSD: 467_502_181,
	holders: 2_712,
	basis: "live",
	measuredAt: "2026-08-19T02:51:33.000Z",
};
const USDC: StoreRow = {
	assetId: "USDC-GA5ZSEJY",
	code: "USDC",
	issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
	company: "Circle",
	peg: "USD",
	supply: 336_098_532,
	priceUSD: 1,
	marketCapUSD: 336_098_532,
	holders: 2_337_968,
	basis: "live",
	measuredAt: "2026-08-19T02:51:33.000Z",
};
// The trap: huge raw supply, tiny USD value — it's YEN.
const GYEN: StoreRow = {
	assetId: "GYEN-GDF6VOEG",
	code: "GYEN",
	issuer: "GDF6VOEGRWLOZ64PQQGKD2IYWA22RLT37GJKS2EJXZHT2VLAGWLC5TOB",
	company: "GMO Trust",
	peg: "JPY",
	supply: 100_870_000,
	priceUSD: 0.0067,
	marketCapUSD: 675_829,
	holders: 2_204,
	basis: "live",
	measuredAt: "2026-08-19T02:51:33.000Z",
};

describe("storeRowToApi", () => {
	it("renames store fields to public names, keeping the peg explicit", () => {
		const r = storeRowToApi(GYEN);
		expect(r.ticker).toBe("GYEN");
		expect(r.peg).toBe("JPY");
		expect(r.supply).toBe(100_870_000); // raw YEN units
		expect(r.marketCapUSD).toBe(675_829); // the comparable metric
		expect(r.holders).toBe(2_204);
		// The full issuer, not a truncated display form — it is the join key.
		expect(r.issuer).toBe(
			"GDF6VOEGRWLOZ64PQQGKD2IYWA22RLT37GJKS2EJXZHT2VLAGWLC5TOB",
		);
		expect(r.assetId).toBe("GYEN-GDF6VOEG");
		expect(r.updatedAt).toBe("2026-08-19T02:51:33.000Z");
	});

	it("carries basis so static/unmeasured is never read as a live measurement", () => {
		const audd = storeRowToApi({
			code: "AUDD",
			peg: "AUD",
			supply: 6_962_786,
			basis: "curated-static",
			note: "Figures hand-checked 2026-08-18.",
		});
		expect(audd.basis).toBe("curated-static");
		expect(audd.note).toContain("hand-checked");
	});

	it("rejects an unrecognized basis rather than passing it through", () => {
		expect(
			storeRowToApi({ code: "X", basis: "totally-made-up" }).basis,
		).toBeNull();
	});

	it("missing metrics stay null, never 0 — the class-3 trap", () => {
		const r = storeRowToApi({ code: "ZZZ", peg: "USD" });
		expect(r.supply).toBeNull();
		expect(r.marketCapUSD).toBeNull();
		expect(r.holders).toBeNull();
		expect(r.supplyChange7d).toBeNull();
		// No snapshot ~1 day back yet (fresh asset, or a fresh install) — a
		// missing payments-count history is null, not a claim of zero activity.
		expect(r.paymentsCount24h).toBeNull();
	});

	it("a stored NaN never reaches the wire as NaN", () => {
		expect(storeRowToApi({ code: "X", supply: Number.NaN }).supply).toBeNull();
	});

	it("carries paymentsCount24h — a COUNT of payments, not a dollar volume", () => {
		const r = storeRowToApi({
			code: "USDC",
			peg: "USD",
			volume24hUSD: 46_000_000, // SDEX trade volume — a different metric
			paymentsCount24h: 206_467,
		});
		expect(r.paymentsCount24h).toBe(206_467);
		expect(r.volume24hUSD).toBe(46_000_000);
	});
});

describe("rankStablecoins — USD market cap is the comparable order", () => {
	const norm = [GYEN, USDC, USDY].map(storeRowToApi);

	it("ranks by USD market cap, NOT raw supply (the GYEN/yen trap)", () => {
		// GYEN's raw supply (100.87M yen) dwarfs many USD coins, but in USD it
		// is ~$676K — so under the default (comparable) order it sits last.
		const ranked = rankStablecoins(norm, "marketcap");
		expect(ranked.map((r) => r.ticker)).toEqual(["USDY", "USDC", "GYEN"]);
	});

	it("sort=supply ranks raw peg units (documented as within-peg only)", () => {
		const ranked = rankStablecoins(norm, "supply");
		// USDY 467.5M > USDC 336.1M > GYEN 100.87M by raw units.
		expect(ranked.map((r) => r.ticker)).toEqual(["USDY", "USDC", "GYEN"]);
	});

	it("nulls always sort last, never treated as 0", () => {
		const noMcap = storeRowToApi({ code: "ZZZ", peg: "USD" });
		const ranked = rankStablecoins([noMcap, storeRowToApi(USDC)], "marketcap");
		expect(ranked[ranked.length - 1].ticker).toBe("ZZZ");
	});
});

describe("toShare (market-share panel)", () => {
	it("turns per-token values into percent of that day's measured total", () => {
		const rows = toShare([
			{ _date: "2026-09-01", USDC: 75, EURC: 25 },
			{ _date: "2026-09-02", USDC: 60, EURC: 20, USDT0: 20 },
		]);
		expect(rows[0]).toEqual({ _date: "2026-09-01", USDC: 75, EURC: 25 });
		expect(rows[1]).toEqual({
			_date: "2026-09-02",
			USDC: 60,
			EURC: 20,
			USDT0: 20,
		});
	});

	it("leaves an unmeasured token absent — never 0 — so a gap is not a collapse", () => {
		const [row] = toShare([{ _date: "2026-09-02", USDC: 100 }]);
		expect(row.EURC).toBeUndefined();
		expect(Object.keys(row)).toEqual(["_date", "USDC"]);
	});

	it("emits a date-only row when nothing was measured", () => {
		expect(toShare([{ _date: "2026-09-02" }])).toEqual([
			{ _date: "2026-09-02" },
		]);
	});
});

describe("chart kit gap rendering (series-path-utils) — the sudden-drops bug", () => {
	// range [100, 0]: domain value 0 -> pixel 100 (bottom/baseline), value 10
	// -> pixel 0 (top). The old bug hard-coded a gap's pixel to 0 regardless
	// of scale — this test only needs the gap to never draw a real vertex.
	const xAccessor = (d: Record<string, unknown>) => new Date(d.date as string);
	const xScale = (d: Date) => d.getTime() / 1e10;
	const yScale = (v: number) => 100 - v * 10;
	// Two real points on each side of one gap — enough for a visible line
	// segment on each side, so "broken in two" is distinguishable from
	// "two isolated dots".
	const rows = [
		{ date: "2026-09-01", USDC: 5 },
		{ date: "2026-09-02", USDC: 5.5 },
		{ date: "2026-09-03" }, // not measured — must stay a gap, never 0
		{ date: "2026-09-04", USDC: 6 },
		{ date: "2026-09-05", USDC: 6.2 },
	];

	it("marks a missing value undefined rather than the zero pixel", () => {
		const points = computeSeriesPathPoints(
			rows,
			xAccessor,
			xScale,
			yScale,
			"USDC",
		);
		expect(points.map((p) => p.defined)).toEqual([
			true,
			true,
			false,
			true,
			true,
		]);
	});

	it("breaks the path into two subpaths instead of drawing through the gap", () => {
		const points = computeSeriesPathPoints(
			rows,
			xAccessor,
			xScale,
			yScale,
			"USDC",
		);
		const d = seriesPathFromPoints(points, curveLinear);
		// A continuous line through a fake gap-point (the bug) is one M
		// followed by four L's. A correctly-broken line is two independent
		// two-point segments: one M + one L on each side of the gap.
		expect(d.match(/M/g)?.length).toBe(2);
		expect(d.match(/L/g)?.length).toBe(2);
	});
});

describe("capSeriesWithOther (market-share and holders panels)", () => {
	it("passes tickers under the cap through untouched, no Other key", () => {
		const { rows, tickers } = capSeriesWithOther(
			[{ _date: "2026-09-01", USDC: 90, EURC: 10 }],
			5,
		);
		expect(tickers).toEqual(["USDC", "EURC"]);
		expect(rows[0]).toEqual({ _date: "2026-09-01", USDC: 90, EURC: 10 });
	});

	it("folds everything past the cap into a real Other sum", () => {
		const { rows, tickers } = capSeriesWithOther(
			[{ _date: "2026-09-01", A: 40, B: 30, C: 15, D: 10, E: 5 }],
			2,
		);
		expect(tickers).toEqual(["A", "B", "Other"]);
		expect(rows[0]).toEqual({ _date: "2026-09-01", A: 40, B: 30, Other: 30 });
	});

	it("leaves Other absent, not 0, on a day none of the folded tickers were measured", () => {
		const { rows } = capSeriesWithOther(
			[
				{ _date: "2026-09-01", A: 40, B: 30, C: 10 },
				{ _date: "2026-09-02", A: 40, B: 30 }, // C unmeasured this day
			],
			2,
		);
		expect(rows[1].Other).toBeUndefined();
		expect(Object.keys(rows[1])).toEqual(["_date", "A", "B"]);
	});
});

describe("stackedBands (100% stacked market-share area)", () => {
	it("turns per-ticker shares into a running cumulative total", () => {
		const rows = stackedBands(
			[{ _date: "2026-09-01", USDC: 60, EURC: 25, Other: 15 }],
			["USDC", "EURC", "Other"],
		);
		expect(rows[0]).toEqual({
			_date: "2026-09-01",
			USDC: 60,
			EURC: 85,
			Other: 100,
		});
	});

	it("an absent ticker contributes 0 to the stack — a real 0-width band, not a rendering gap", () => {
		const rows = stackedBands(
			[{ _date: "2026-09-01", USDC: 100 }],
			["USDC", "EURC"],
		);
		// EURC wasn't part of that day's measured 100%, so its band is flat
		// at USDC's own top — not the "gap drawn as 0" mistake, because a
		// stack is only ever a share of what was actually measured that day.
		expect(rows[0]).toEqual({ _date: "2026-09-01", USDC: 100, EURC: 100 });
	});
});

describe("issuerLeaderboard exclusions", () => {
	const rows = [
		{ company: "Circle", ticker: "USDC", marketCapRaw: 331e6, basis: "live" },
		{
			company: "Montelibero",
			ticker: "EURMTL",
			marketCapRaw: 3.8e6,
			basis: "live",
		},
		{ company: "Montelibero", ticker: "USDM", marketCapRaw: 0, basis: "live" },
		{ company: "Zeam", ticker: "USDZ", marketCapRaw: 0.31e6, basis: "live" },
	];

	it("keeps an excluded issuer out of the ranking entirely", () => {
		const out = issuerLeaderboard(rows);
		expect(out.map((r) => r.company)).toEqual(["Circle", "Zeam"]);
	});

	it("does not disturb the other issuers' totals", () => {
		const out = issuerLeaderboard(rows);
		expect(out[0].totalMarketCapUSD).toBe(331e6);
		expect(out[1].tokens).toEqual(["USDZ"]);
	});
});

describe("measuredDayCount (thin-window detection)", () => {
	it("counts a row as measured when any ticker has a number", () => {
		const rows: SeriesRow[] = [
			{ _date: "2026-09-01", USDC: 100 },
			{ _date: "2026-09-02" }, // nothing measured that day
			{ _date: "2026-09-03", EURC: 5 },
		];
		expect(measuredDayCount(rows)).toBe(2);
	});

	it("an empty series measures 0 days", () => {
		expect(measuredDayCount([])).toBe(0);
	});
});

describe("windowed() never truncates below what's real", () => {
	it("returns every available row when fewer exist than the requested timeframe", () => {
		// "1Y" asks for 365 rows; only 3 exist — the panel must show all 3,
		// not pretend there's a full year and draw 362 phantom gaps.
		const rows = [
			{ _date: "2026-01-01", USDC: 1 },
			{ _date: "2026-01-02", USDC: 2 },
			{ _date: "2026-01-03", USDC: 3 },
		];
		expect(windowed(rows, "1Y")).toEqual(rows);
	});
});

describe("log y-axis (Holders by Token) — kit-level support", () => {
	it("niceYDomain never rounds a log domain's floor down to (or through) 0", () => {
		const [min, max] = niceYDomain([83, 2_603_000], "log");
		expect(min).toBeGreaterThan(0);
		expect(max).toBeGreaterThan(min);
	});

	it("a linear domain is unaffected by log support (default behaviour unchanged)", () => {
		const [min, max] = niceYDomain([0, 97]);
		expect(min).toBe(0);
		expect(max).toBeGreaterThanOrEqual(97);
	});

	it("buildYScalesFromDomains(scaleType: 'log') is genuinely logarithmic — equal RATIOS map to equal pixel steps", () => {
		const scales = buildYScalesFromDomains({
			lines: [{ dataKey: "USDC", stroke: "#fff", strokeWidth: 2 }],
			innerHeight: 300,
			domainsByAxis: { left: [1, 1_000_000] },
			scaleType: "log",
		});
		const scale = scales.left;
		// 10→100 and 100→1000 are both ×10. A log scale spaces equal
		// multiples equally; a linear scale would not.
		const step1 = (scale(10) ?? 0) - (scale(100) ?? 0);
		const step2 = (scale(100) ?? 0) - (scale(1000) ?? 0);
		expect(Math.abs(step1 - step2)).toBeLessThan(0.01);
	});
});

describe("log-scale zero clamp — never silently coerced into an undefined log domain", () => {
	it("clamps a measured 0 to the scale's own domain floor instead of asking the scale to log(0)", () => {
		const domain = [10, 1000]; // a strictly-positive, log-style domain
		const calls: number[] = [];
		const yScale = Object.assign(
			(v: number) => {
				calls.push(v);
				return 100 - v;
			},
			{ domain: () => domain },
		);
		const points = computeSeriesPathPoints(
			[{ date: "2026-09-01", X: 0 }],
			(d) => new Date(d.date as string),
			() => 0,
			yScale,
			"X",
		);
		// The scale is never asked to evaluate the raw 0 — only the domain's
		// own floor (10) or higher.
		expect(calls).toEqual([10]);
		// A real 0 measurement is still a measurement, not an absence.
		expect(points[0].defined).toBe(true);
	});

	it("a value already inside the domain passes through untouched", () => {
		const domain = [10, 1000];
		const calls: number[] = [];
		const yScale = Object.assign(
			(v: number) => {
				calls.push(v);
				return 0;
			},
			{ domain: () => domain },
		);
		computeSeriesPathPoints(
			[{ date: "2026-09-01", X: 500 }],
			(d) => new Date(d.date as string),
			() => 0,
			yScale,
			"X",
		);
		expect(calls).toEqual([500]);
	});
});
