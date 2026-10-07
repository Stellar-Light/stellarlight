import { describe, expect, it } from "vitest";
import {
	aggregateDaily,
	countryInfo,
	formatPct,
	formatSupply,
	formatUSD,
	pegFlag,
} from "../stablecoin-view";

describe("formatters", () => {
	it("formats USD compactly", () => {
		expect(formatUSD(467_502_181)).toBe("$467.5M");
		expect(formatUSD(675_829)).toBe("$675.8K");
		expect(formatUSD(1_200_000_000)).toBe("$1.20B");
	});

	it("shows an em dash, never $0, for a missing value", () => {
		expect(formatUSD(null)).toBe("—");
		expect(formatUSD(undefined)).toBe("—");
		expect(formatUSD(Number.NaN)).toBe("—");
	});

	it("spells out the peg on supply so yen is never read as dollars", () => {
		expect(formatSupply(100_870_000, "JPY")).toBe("100.9M JPY");
		expect(formatSupply(467_502_181, "USD")).toBe("467.5M USD");
		expect(formatSupply(null, "USD")).toBe("—");
	});

	it("signs percentages and never renders null as 0%", () => {
		expect(formatPct(2.4)).toBe("+2.40%");
		expect(formatPct(-5.8)).toBe("−5.80%");
		expect(formatPct(null)).toBe("—");
	});

	it("maps a peg to its flag", () => {
		expect(pegFlag("USD")).toBe("🇺🇸");
		expect(pegFlag("EUR")).toBe("🇪🇺");
		expect(pegFlag("ZZZ")).toBe("");
		expect(pegFlag(null)).toBe("");
	});
});

describe("countryInfo", () => {
	// CLP and UAH both fell through to the "Global" globe instead of their
	// own flag because PEG_COUNTRY had no entry for either peg — every peg
	// the registry can carry needs one, not just the ones some row happens to
	// use today.
	it("resolves the pegs added 2026-09-02 to their own flag, not Global", () => {
		expect(countryInfo(null, "CLP").label).toBe("Chile");
		expect(countryInfo(null, "UAH").label).toBe("Ukraine");
		expect(countryInfo(null, "SGD").label).toBe("Singapore");
		expect(countryInfo(null, "AED").label).toBe("United Arab Emirates");
		expect(countryInfo(null, "CAD").label).toBe("Canada");
	});

	it("is case-insensitive on the peg", () => {
		expect(countryInfo(null, "clp").label).toBe("Chile");
	});

	it("prefers a stored country over the peg-derived one", () => {
		// PEN's own row is genuinely Peru; a differently-pegged row must never
		// borrow it just because both resolve through the same fallback chain.
		expect(countryInfo("PE", "CLP").label).toBe("Peru");
	});

	it("falls back to Global for a peg with no mapped country, never throws", () => {
		expect(countryInfo(null, "ZZZ").label).toBe("Global");
		expect(countryInfo(undefined, undefined).label).toBe("Global");
	});

	it("falls back to the peg when the stored country isn't a recognized code", () => {
		expect(countryInfo("not-a-code", "UAH").label).toBe("Ukraine");
	});

	it("honors an explicitly stored Global over a peg that does have a country", () => {
		// The literal shape of the CLPX/UAH bug: ingest had already written the
		// string "Global" into the row (PEG_COUNTRY[peg] ?? "Global", before
		// CLP/UAH had entries). "Global" IS a recognized COUNTRY_INFO key, so
		// it wins over the now-fixed peg fallback — adding the table entries
		// fixes the NEXT ingest, not rows already holding a stale "Global";
		// those self-heal when the pipeline recomputes and overwrites `country`
		// on its next run (unconditional, no `keep()` guard on that field).
		expect(countryInfo("Global", "CLP").label).toBe("Global");
	});
});

describe("aggregateDaily", () => {
	// Two full days of three assets.
	const full = [
		{ day: "2026-08-17", assetId: "A", marketCapUSD: 100, holders: 10 },
		{ day: "2026-08-17", assetId: "B", marketCapUSD: 200, holders: 20 },
		{ day: "2026-08-17", assetId: "C", marketCapUSD: 300, holders: 30 },
		{ day: "2026-08-18", assetId: "A", marketCapUSD: 110, holders: 11 },
		{ day: "2026-08-18", assetId: "B", marketCapUSD: 210, holders: 21 },
		{ day: "2026-08-18", assetId: "C", marketCapUSD: 310, holders: 31 },
	];

	it("sums each day and counts contributing assets", () => {
		const { points } = aggregateDaily(full);
		expect(points).toHaveLength(2);
		expect(points[0]).toEqual({
			date: "2026-08-17",
			marketCapUSD: 600,
			holders: 60,
			assetsCounted: 3,
		});
		expect(points[1].marketCapUSD).toBe(630);
	});

	it("returns days in ascending date order", () => {
		const { points } = aggregateDaily([...full].reverse());
		expect(points.map((p) => p.date)).toEqual(["2026-08-17", "2026-08-18"]);
	});

	it("DROPS a low-coverage day rather than plotting a fake cliff", () => {
		// Only one of three assets measured on the 19th. Summing it would show
		// total market cap collapsing 630 → 110 — a measurement gap wearing the
		// costume of a market crash.
		const withGap = [
			...full,
			{ day: "2026-08-19", assetId: "A", marketCapUSD: 110, holders: 11 },
		];
		const { points, droppedLowCoverage } = aggregateDaily(withGap);
		expect(points.map((p) => p.date)).toEqual(["2026-08-17", "2026-08-18"]);
		expect(droppedLowCoverage).toBe(1);
	});

	it("a null metric contributes nothing and is not summed as zero", () => {
		const { points } = aggregateDaily([
			{ day: "2026-08-17", assetId: "A", marketCapUSD: 100, holders: null },
			{ day: "2026-08-17", assetId: "B", marketCapUSD: 200, holders: 20 },
		]);
		expect(points[0].marketCapUSD).toBe(300);
		expect(points[0].holders).toBe(20); // not 20 + 0-for-A as a real reading
		expect(points[0].assetsCounted).toBe(2);
	});

	it("an all-null row measured nothing and does not count toward coverage", () => {
		const { points } = aggregateDaily([
			{ day: "2026-08-17", assetId: "A", marketCapUSD: 100, holders: 10 },
			{ day: "2026-08-17", assetId: "B", marketCapUSD: null, holders: null },
		]);
		expect(points[0].assetsCounted).toBe(1);
	});

	it("an asset writing twice for one day is counted once", () => {
		const { points } = aggregateDaily([
			{ day: "2026-08-17", assetId: "A", marketCapUSD: 100, holders: 10 },
			{ day: "2026-08-17", assetId: "A", marketCapUSD: 100, holders: 10 },
		]);
		expect(points[0].marketCapUSD).toBe(100);
		expect(points[0].assetsCounted).toBe(1);
	});

	it("empty in, empty out — no NaN, no Infinity from Math.max", () => {
		expect(aggregateDaily([])).toEqual({ points: [], droppedLowCoverage: 0 });
	});
});

describe("aggregateDaily coverage floor is rolling, not all-time", () => {
	const day = (date: string, n: number) =>
		Array.from({ length: n }, (_, i) => ({
			day: date,
			assetId: `A${i}`,
			marketCapUSD: 100,
			holders: 1,
		}));
	it("a later roster expansion does not erase earlier days (the 4-bar bug)", () => {
		const snaps = [
			...Array.from({ length: 30 }, (_, i) =>
				day(`2026-02-${String(i + 1).padStart(2, "0")}`, 17),
			).flat(),
			...day("2026-03-01", 22),
			...day("2026-03-02", 19),
		];
		const { points, droppedLowCoverage } = aggregateDaily(snaps);
		expect(points.length).toBe(32);
		expect(droppedLowCoverage).toBe(0);
	});
	it("a lone one-asset day still cannot draw as a cliff", () => {
		const snaps = [
			...day("2025-11-28", 1),
			...Array.from({ length: 20 }, (_, i) =>
				day(`2026-01-${String(i + 1).padStart(2, "0")}`, 17),
			).flat(),
		];
		const { points } = aggregateDaily(snaps);
		expect(points.some((p) => p.date === "2025-11-28")).toBe(false);
		expect(points.length).toBe(20);
	});
	it("a genuinely partial day inside a stable roster is still dropped", () => {
		const snaps = [
			...Array.from({ length: 10 }, (_, i) =>
				day(`2026-04-${String(i + 1).padStart(2, "0")}`, 20),
			).flat(),
			...day("2026-04-11", 9),
		];
		const { points } = aggregateDaily(snaps);
		expect(points.some((p) => p.date === "2026-04-11")).toBe(false);
	});
});
