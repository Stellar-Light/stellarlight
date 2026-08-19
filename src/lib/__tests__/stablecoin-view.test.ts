import { describe, expect, it } from "vitest";
import {
	aggregateDaily,
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
