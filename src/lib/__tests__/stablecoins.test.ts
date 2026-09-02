import { describe, expect, it } from "vitest";
import { toShare } from "../stablecoin-series";
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
