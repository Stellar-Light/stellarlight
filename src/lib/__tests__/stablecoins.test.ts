import { describe, expect, it } from "vitest";
import {
	normalizeSnapshotRow,
	parseAbbrevNumber,
	rankStablecoins,
	type SnapshotRow,
} from "../stablecoins";

describe("parseAbbrevNumber", () => {
	it("parses currency + abbreviation forms", () => {
		expect(parseAbbrevNumber("$275.94M")).toBe(275_940_000);
		expect(parseAbbrevNumber("275.94M")).toBe(275_940_000);
		expect(parseAbbrevNumber("$243.12K")).toBe(243_120);
		expect(parseAbbrevNumber("2,284,095")).toBe(2_284_095);
		expect(parseAbbrevNumber("146.00")).toBe(146);
		expect(parseAbbrevNumber("$552.14")).toBeCloseTo(552.14);
		expect(parseAbbrevNumber("1.2B")).toBe(1_200_000_000);
	});
	it("returns null (never 0) for missing/unparseable — the class-3 trap", () => {
		expect(parseAbbrevNumber(null)).toBeNull();
		expect(parseAbbrevNumber(undefined)).toBeNull();
		expect(parseAbbrevNumber("")).toBeNull();
		expect(parseAbbrevNumber("n/a")).toBeNull();
	});
});

// Real snapshot rows captured live 2026-07-21 — the exact denomination trap.
const USDY: SnapshotRow = {
	ticker: "USDY",
	name: "USDY",
	issuerCode: "GAJM...DAZ6",
	issuerDomain: "ondo.finance",
	company: "Ondo Finance",
	supply: "467.50M",
	marketCap: "$467.50M",
	holders: "2,527",
	peg: "USD",
	cachedPriceUSD: "1",
	updatedAt: "2026-07-21T20:29:32.000Z",
	verified: true,
};
const USDC: SnapshotRow = {
	ticker: "USDC",
	issuerCode: "GA5Z...KZVN",
	company: "Circle",
	supply: "275.94M",
	marketCap: "$275.94M",
	holders: "2,284,095",
	peg: "USD",
	cachedPriceUSD: "1",
	updatedAt: "2026-07-21T20:29:31.000Z",
	verified: true,
};
// The trap: huge raw supply, tiny USD value — it's YEN.
const GYEN: SnapshotRow = {
	ticker: "GYEN",
	issuerCode: "GDF6...5TOB",
	company: "GMO Trust",
	supply: "100.87M",
	marketCap: "$675.82K",
	holders: "2,204",
	peg: "JPY",
	cachedPriceUSD: "0.0067",
	updatedAt: "2026-07-21T20:29:30.000Z",
	verified: true,
};

describe("normalizeSnapshotRow", () => {
	it("turns display strings into raw numbers, keeping the peg explicit", () => {
		const r = normalizeSnapshotRow(GYEN);
		expect(r.ticker).toBe("GYEN");
		expect(r.peg).toBe("JPY");
		expect(r.supply).toBe(100_870_000); // raw YEN units
		expect(r.marketCapUSD).toBeCloseTo(675_820); // the comparable metric
		expect(r.holders).toBe(2_204);
		expect(r.issuer).toBe("GDF6...5TOB");
	});
	it("derives marketCapUSD from supply × price when the feed omits it", () => {
		const r = normalizeSnapshotRow({
			ticker: "X",
			supply: "1,000",
			cachedPriceUSD: "2",
			peg: "USD",
		});
		expect(r.marketCapUSD).toBe(2_000);
	});
});

describe("rankStablecoins — USD market cap is the comparable order", () => {
	const norm = [GYEN, USDC, USDY].map(normalizeSnapshotRow);

	it("ranks by USD market cap, NOT raw supply (the GYEN/yen trap)", () => {
		// GYEN's raw supply (100.87M yen) dwarfs many USD coins, but in USD it
		// is ~$676K — so under the default (comparable) order it sits last.
		const ranked = rankStablecoins(norm, "marketcap");
		expect(ranked.map((r) => r.ticker)).toEqual(["USDY", "USDC", "GYEN"]);
	});

	it("sort=supply ranks raw peg units (documented as within-peg only)", () => {
		const ranked = rankStablecoins(norm, "supply");
		// USDY 467.5M > USDC 275.94M > GYEN 100.87M by raw units.
		expect(ranked.map((r) => r.ticker)).toEqual(["USDY", "USDC", "GYEN"]);
	});

	it("nulls always sort last, never treated as 0", () => {
		const noMcap = normalizeSnapshotRow({ ticker: "ZZZ", peg: "USD" });
		const ranked = rankStablecoins(
			[noMcap, normalizeSnapshotRow(USDC)],
			"marketcap",
		);
		expect(ranked[ranked.length - 1].ticker).toBe("ZZZ");
	});
});
