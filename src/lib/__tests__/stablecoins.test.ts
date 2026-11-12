import { curveLinear } from "d3-shape";
import { describe, expect, it } from "vitest";
import {
	computeSeriesPathPoints,
	seriesPathFromPoints,
} from "@/components/charts/series-path-utils";
import { buildYScalesFromDomains } from "@/components/charts/y-axis-scales";
import { niceYDomain } from "@/components/charts/y-domain-utils";
import { STABLECOIN_REGISTRY } from "@/data/stablecoin-registry";
import { spec } from "../openapi-spec";
import {
	capSeriesWithOther,
	issuerLeaderboard,
	measuredDayCount,
	type SeriesRow,
	stackedBands,
	toShare,
	windowed,
} from "../stablecoin-series";
import {
	assetTypeFilter,
	filterByAssetType,
	namedIssuingParty,
	rankStablecoins,
	STABLECOIN_ASSET_TYPES,
	STABLECOIN_QUERY_PARAMS,
	type StoreRow,
	sameParty,
	storeRowToApi,
} from "../stablecoins";

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

	it("carries logoUrl and logoSource — dropped entirely before this fix", () => {
		// The bug: storeRowToApi renamed measuredAt to updatedAt but never
		// carried logoUrl/logoSource at all, so every row read as logo-less to
		// anything reading /api/stablecoins directly, even on rows the pipeline
		// had resolved a real image for.
		const r = storeRowToApi({
			code: "USDT0",
			logoUrl: "https://stellar.myfilebase.com/ipfs/abc",
			logoSource: "toml",
		});
		expect(r.logoUrl).toBe("https://stellar.myfilebase.com/ipfs/abc");
		expect(r.logoSource).toBe("toml");
	});

	it("logoUrl/logoSource are null, not undefined, when nothing resolved", () => {
		const r = storeRowToApi({ code: "ZZZ" });
		expect(r.logoUrl).toBeNull();
		expect(r.logoSource).toBeNull();
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

describe("priceBasis (the USDY understatement, 2026-09-09)", () => {
	it("carries a measured-market basis through to the wire", () => {
		const r = storeRowToApi({
			...USDY,
			priceUSD: 1.14,
			marketCapUSD: 467_502_181 * 1.14,
			priceBasis: "measured-market",
		});
		expect(r.priceBasis).toBe("measured-market");
		expect(r.marketCapUSD).toBeCloseTo(532_952_486, 0);
	});

	it("is null when there is no price to describe — a basis on a null price claims a measurement that never happened", () => {
		const r = storeRowToApi({
			...USDY,
			priceUSD: null,
			marketCapUSD: null,
			priceBasis: "measured-market",
		});
		expect(r.priceUSD).toBeNull();
		expect(r.priceBasis).toBeNull();
	});

	it("is null for a value outside the vocabulary, and for a pre-migration row that stored none", () => {
		expect(
			storeRowToApi({ ...USDC, priceBasis: "coingecko" }).priceBasis,
		).toBeNull();
		expect(storeRowToApi(USDC).priceBasis).toBeNull();
	});
});

/**
 * sls-107 (2026-11-02): one `company` field held a brand, and agents read it
 * as the issuer. The row now carries the brand AND the issuer of record the
 * issuer's own stellar.toml names, each documented for what it is.
 */
describe("company is the brand; issuerOfRecord is what the issuer's toml says", () => {
	it("carries the issuer of record, its toml URL, its date and its note beside the brand", () => {
		const r = storeRowToApi({
			code: "MGUSD",
			company: "MoneyGram",
			issuerOfRecord: "MoneyGram Payment Systems, Inc.",
			issuerOfRecordSourceUrl:
				"https://mgusd.moneygram.com/.well-known/stellar.toml",
			issuerOfRecordAsOf: "2026-11-05T00:25:00.000Z",
			issuerOfRecordNote:
				'stellar.toml desc for MGUSD: "USD-backed stablecoin issued by Bridge on behalf of MoneyGram"',
		});
		expect(r.company).toBe("MoneyGram");
		expect(r.issuerOfRecord).toBe("MoneyGram Payment Systems, Inc.");
		expect(r.issuerOfRecordSourceUrl).toBe(
			"https://mgusd.moneygram.com/.well-known/stellar.toml",
		);
		expect(r.issuerOfRecordAsOf).toBe("2026-11-05T00:25:00.000Z");
		expect(r.issuerOfRecordNote).toContain("issued by Bridge");
	});

	it("an unread issuer of record is null, never the brand", () => {
		const r = storeRowToApi({ code: "AUDD", company: "Novatti Group" });
		expect(r.issuerOfRecord).toBeNull();
		expect(r.issuerOfRecordSourceUrl).toBeNull();
		expect(r.issuerOfRecordAsOf).toBeNull();
		expect(r.issuerOfRecordNote).toBeNull();
	});

	it("namedIssuingParty reads the party after 'issued by', up to 'on behalf of' or the clause end", () => {
		expect(
			namedIssuingParty(
				"USD-backed stablecoin issued by Bridge on behalf of MoneyGram",
			),
		).toBe("Bridge");
		expect(
			namedIssuingParty(
				"Zeam ZAR is a 1:1 fiat-backed stable-coin, issued by Zeam Mint (Pty) Ltd, and operated by Zeam SA",
			),
		).toBe("Zeam Mint (Pty) Ltd");
		expect(
			namedIssuingParty("SBC is a stablecoin issued by Brale. It is"),
		).toBe("Brale");
		expect(namedIssuingParty("Asset backed token pegged 1:1")).toBeNull();
		expect(namedIssuingParty(null)).toBeNull();
	});

	it("sameParty compares whole names: a bare legal suffix or a fragment never matches (review 2026-11-04)", () => {
		// The four inputs the review found matching under substring containment.
		expect(sameParty("Ltd", "AUDC PTY LTD")).toBe(false);
		expect(sameParty("Inc", "MoneyGram Payment Systems, Inc.")).toBe(false);
		expect(sameParty("Cambridge", "Bridge")).toBe(false);
		expect(sameParty("A", "AUDC PTY LTD")).toBe(false);
		// A partial name is not the same name either.
		expect(sameParty("Novatti", "Novatti Group")).toBe(false);
		expect(sameParty("Circle", "Circle Internet Financial, LLC")).toBe(false);
		expect(sameParty("Zeam Mint (Pty) Ltd", "ZEAM LIMITED")).toBe(false);
		expect(sameParty("Bridge", "MoneyGram Payment Systems, Inc.")).toBe(false);
		expect(sameParty("!!!", "Circle")).toBe(false);
		expect(sameParty("Ltd", "Ltd")).toBe(false);
	});

	it("sameParty sets aside case, punctuation, spacing and legal-form suffixes", () => {
		expect(sameParty("Brale", "Brale Inc.")).toBe(true);
		expect(sameParty("VNX Global Ltd", "VNX Global Ltd.")).toBe(true);
		expect(sameParty("AUDC Pty Ltd", "AUDC PTY LTD")).toBe(true);
		expect(sameParty("AUDC", "AUDC PTY LTD")).toBe(true);
		expect(
			sameParty("Kinesis Money Panama S.A", "Kinesis Money Panama S.A."),
		).toBe(true);
		expect(sameParty("MyKobo", "MYKOBO")).toBe(true);
		expect(sameParty("My Kobo", "MYKOBO")).toBe(true);
		expect(sameParty("Zeam Mint", "Zeam Mint (Pty) Ltd")).toBe(true);
		expect(sameParty("the Bank of X", "Bank of X Ltd")).toBe(true);
	});

	it("sameParty reads letters in any script and folds accents (re-check item 3)", () => {
		expect(sameParty("Société Générale", "Societe Generale")).toBe(true);
		expect(sameParty("Société Générale", "SOCIETE GENERALE S.A.")).toBe(true);
		expect(sameParty("Banque Société Générale", "Societe Generale")).toBe(
			false,
		);
		expect(sameParty("Банк Х", "Банк Х")).toBe(true);
		expect(sameParty("Банк Х", "Банк У")).toBe(false);
		expect(sameParty("三菱UFJ信託銀行", "三菱UFJ信託銀行")).toBe(true);
		expect(sameParty("三菱", "三菱UFJ信託銀行")).toBe(false);
	});

	it("sameParty handles spaced forms, keeps English words, and never equates two different legal forms (re-check item 4)", () => {
		expect(
			sameParty("Kinesis Money Panama S A", "Kinesis Money Panama S.A."),
		).toBe(true);
		expect(
			sameParty("Kinesis Money Panama S. A.", "Kinesis Money Panama SA"),
		).toBe(true);
		expect(sameParty("Pay As", "Pay")).toBe(false);
		expect(
			sameParty(
				"Circle Internet Financial, LLC",
				"Circle Internet Financial Inc",
			),
		).toBe(false);
		expect(
			sameParty(
				"Circle Internet Financial Limited",
				"Circle Internet Financial Ltd",
			),
		).toBe(true);
		expect(sameParty("AUDC Ltd", "AUDC PTY LTD")).toBe(false);
		expect(sameParty("Co Op Bank", "Op Bank")).toBe(false);
		expect(sameParty("Plan B", "Plan")).toBe(false);
	});

	it("namedIssuingParty does not cut a name at a dot inside it", () => {
		expect(
			namedIssuingParty(
				"ZUSD, issued by GMO-Z.com Trust Company, Inc. until its wind-down",
			),
		).toBe("GMO-Z.com Trust Company");
		expect(
			namedIssuingParty("issued by Kinesis Money Panama S.A. for holders"),
		).toBe("Kinesis Money Panama S.A");
	});

	it("carries issuerOfRecordCheck; a value outside its vocabulary is null", () => {
		expect(
			storeRowToApi({ code: "USDT0", issuerOfRecordCheck: "not-named" })
				.issuerOfRecordCheck,
		).toBe("not-named");
		expect(
			storeRowToApi({ code: "X", issuerOfRecordCheck: "maybe" })
				.issuerOfRecordCheck,
		).toBeNull();
		expect(storeRowToApi({ code: "X" }).issuerOfRecordCheck).toBeNull();
	});
});

/**
 * sls-107, second half: USDY and YLDS (assetType "Yield Stablecoin") sit in the
 * same list as par coins and ?assetType= answered 400. A class is recorded
 * only where the registry found the unit is not 1:1 with its peg. A row with
 * none served null, and null had stood for two things (a plain peg, in the
 * spec until 1.9.121, and not classified); every row now serves a class, and
 * the rows the registry records none for say so: Unclassified, which is not
 * a verified plain peg.
 */
describe("assetType: a class on every row, and its filter", () => {
	const rows = [
		USDY,
		USDC,
		GYEN,
		{
			...USDC,
			assetId: "USDM1-GDM5QWWX",
			code: "USDM1",
			assetType: "Treasury-Backed",
		},
	].map(storeRowToApi);

	it("resolves a value case-insensitively to its class; none is Unclassified; an unknown value resolves to nothing", () => {
		expect(assetTypeFilter("yield stablecoin")).toBe("Yield Stablecoin");
		expect(assetTypeFilter(" Treasury-Backed ")).toBe("Treasury-Backed");
		expect(assetTypeFilter("unclassified")).toBe("Unclassified");
		expect(assetTypeFilter("NONE")).toBe("Unclassified");
		expect(assetTypeFilter("fiat-backed")).toBe("Fiat-Backed");
		expect(assetTypeFilter("Fiat")).toBeUndefined();
	});

	it("a class keeps only the rows recorded with it; an unclassified row never matches a qualifier", () => {
		expect(
			filterByAssetType(rows, "Yield Stablecoin").map((r) => r.ticker),
		).toEqual(["USDY"]);
		expect(
			filterByAssetType(rows, "Treasury-Backed").map((r) => r.ticker),
		).toEqual(["USDM1"]);
	});

	it("Unclassified keeps only the rows with no class recorded", () => {
		expect(
			filterByAssetType(rows, "Unclassified").map((r) => r.ticker),
		).toEqual(["GYEN"]);
		expect(filterByAssetType(rows, "Fiat-Backed").map((r) => r.ticker)).toEqual(
			["USDC"],
		);
	});

	it("before the refresh writes a class, a row serves the registry's class and source by assetId", () => {
		// Production on 2026-11-11: 38 rows store no class until the next run.
		expect(storeRowToApi(USDC)).toMatchObject({
			assetType: "Fiat-Backed",
			assetTypeSourceUrl: "https://www.circle.com/usdc",
			assetTypeAsOf: "2026-11-11T00:00:00.000Z",
			assetTypeNote: expect.stringContaining("redeemable 1:1"),
		});
		// USDY stores its qualifier but no source yet: the registry's source.
		expect(storeRowToApi(USDY)).toMatchObject({
			assetType: "Yield Stablecoin",
			assetTypeSourceUrl: "https://ondo.finance/usdy",
		});
	});

	it("once the refresh has written a class, the stored values are served", () => {
		expect(
			storeRowToApi({
				...USDC,
				assetType: "Unclassified",
				assetTypeSourceUrl: null,
				assetTypeAsOf: "2026-12-01T00:00:00.000Z",
				assetTypeNote: "Checked 2026-12-01: a stored verdict.",
			}),
		).toMatchObject({
			assetType: "Unclassified",
			assetTypeSourceUrl: null,
			assetTypeNote: "Checked 2026-12-01: a stored verdict.",
		});
	});

	it("a row neither the store nor the registry classes serves Unclassified, never null, and no source", () => {
		expect(storeRowToApi({ code: "X" })).toMatchObject({
			assetType: "Unclassified",
			assetTypeSourceUrl: null,
			assetTypeAsOf: null,
			assetTypeNote: null,
		});
		expect(storeRowToApi({ code: "X", assetType: null }).assetType).toBe(
			"Unclassified",
		);
	});

	it("a stored assetType outside the vocabulary is served as Unclassified, never passed through", () => {
		expect(storeRowToApi({ code: "X", assetType: "Mystery" }).assetType).toBe(
			"Unclassified",
		);
		expect(storeRowToApi(USDY).assetType).toBe("Yield Stablecoin");
	});

	it("over the whole registry: every row has a class with the issuer's statement, or Unclassified with what was checked", () => {
		const bad: string[] = [];
		for (const a of STABLECOIN_REGISTRY) {
			const { url, checkedOn, note } = a.assetTypeSource;
			const id = `${a.code}-${a.issuer.slice(0, 8)}`;
			if (!(STABLECOIN_ASSET_TYPES as readonly string[]).includes(a.assetType))
				bad.push(`${id}: class ${a.assetType}`);
			if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedOn))
				bad.push(`${id}: no read date`);
			if (a.assetType === "Unclassified") {
				if (url !== null) bad.push(`${id}: Unclassified with a source`);
				if (!note.startsWith("Checked ")) bad.push(`${id}: no checked note`);
			} else {
				if (!url?.startsWith("https://")) bad.push(`${id}: no source URL`);
				if (note.length < 40) bad.push(`${id}: no statement`);
			}
		}
		expect(bad).toEqual([]);
		// Read on 2026-11-11: no issuer statement of the backing could be read
		// for these seven; every other row has one.
		expect(
			STABLECOIN_REGISTRY.filter((a) => a.assetType === "Unclassified")
				.map((a) => `${a.code}-${a.issuer.slice(0, 8)}`)
				.sort(),
		).toEqual(
			[
				"APSEURM-GB7OUO5N",
				"APSUSDM-GB7OUO5N",
				"ARST-GCSAZVWX",
				"BRLT-GCHQ3F2B",
				"EURC-GAQRF3UG",
				"MXNe-GCQCNWT2",
				"NGNC-GASBV6W7",
			].sort(),
		);
	});

	it("served as the refresh stores it: the class and its source, never null", () => {
		for (const a of STABLECOIN_REGISTRY) {
			const served = storeRowToApi({
				code: a.code,
				assetType: a.assetType,
				assetTypeSourceUrl: a.assetTypeSource.url,
				assetTypeAsOf: a.assetTypeSource.checkedOn,
				assetTypeNote: a.assetTypeSource.note,
			});
			expect(served.assetType, a.code).toBe(a.assetType);
			expect(served.assetTypeSourceUrl, a.code).toBe(a.assetTypeSource.url);
			expect(served.assetTypeNote, a.code).toBe(a.assetTypeSource.note);
		}
	});
});

/** The contract side: every parameter the route reads and every field a row
 * serves is in the spec, so a filter or field cannot ship undocumented. */
describe("getStablecoins in the spec", () => {
	// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
	const S: any = spec;
	const op = S.paths["/api/stablecoins"].get;

	it("declares exactly the query parameters the route accepts", () => {
		const names = op.parameters.map((p: { name: string }) => p.name).sort();
		expect(names).toEqual([...STABLECOIN_QUERY_PARAMS].sort());
	});

	it("declares every field a row serves", () => {
		const served = Object.keys(storeRowToApi({ code: "X" }));
		const declared = Object.keys(S.components.schemas.Stablecoin.properties);
		expect(served.filter((k) => !declared.includes(k))).toEqual([]);
	});

	it("declares the issuer-of-record and class source fields as nullable strings", () => {
		const p = S.components.schemas.Stablecoin.properties;
		for (const f of [
			"assetTypeSourceUrl",
			"assetTypeAsOf",
			"assetTypeNote",
			"issuerOfRecord",
			"issuerOfRecordCheck",
			"issuerOfRecordSourceUrl",
			"issuerOfRecordAsOf",
			"issuerOfRecordNote",
		])
			expect(p[f], f).toMatchObject({ type: "string", nullable: true });
	});
});
