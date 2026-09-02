import { curveLinear } from "d3-shape";
import { describe, expect, it } from "vitest";
import {
	computeSeriesPathPoints,
	seriesPathFromPoints,
} from "@/components/charts/series-path-utils";
import {
	capSeriesWithOther,
	stackedBands,
	toShare,
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
	});

	it("a stored NaN never reaches the wire as NaN", () => {
		expect(storeRowToApi({ code: "X", supply: Number.NaN }).supply).toBeNull();
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
