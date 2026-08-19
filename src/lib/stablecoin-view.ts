/**
 * Presentation helpers for /stablecoins — formatting and the daily
 * aggregation behind the overview charts.
 *
 * Pure and dependency-free so the aggregation rule is unit testable. The
 * route reads Payload and calls these.
 */

import { PEG_COUNTRY } from "@/data/stablecoin-registry";

/** Compact USD: $467.5M, $675.8K, $1.2B. Null → em dash. */
export function formatUSD(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n)) return "—";
	const abs = Math.abs(n);
	if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
	if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
	if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
	return `$${n.toFixed(2)}`;
}

/** Thousands-separated integer. Null → em dash. */
export function formatCount(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n)) return "—";
	return Math.round(n).toLocaleString("en-US");
}

/**
 * Supply in its OWN peg, with the unit spelled out — because 100.87M GYEN is
 * yen, not dollars, and a bare number invites exactly that misreading.
 */
export function formatSupply(
	n: number | null | undefined,
	peg: string | null | undefined,
): string {
	if (n == null || !Number.isFinite(n)) return "—";
	const abs = Math.abs(n);
	const v =
		abs >= 1e9
			? `${(n / 1e9).toFixed(2)}B`
			: abs >= 1e6
				? `${(n / 1e6).toFixed(1)}M`
				: abs >= 1e3
					? `${(n / 1e3).toFixed(1)}K`
					: n.toFixed(2);
	return peg ? `${v} ${peg}` : v;
}

/** Signed percent, e.g. "+2.4%" / "−5.8%". Null → em dash (never "0%"). */
export function formatPct(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n)) return "—";
	const sign = n > 0 ? "+" : n < 0 ? "−" : "";
	return `${sign}${Math.abs(n).toFixed(2)}%`;
}

/** Regional-indicator flag for a peg's home, for the currency chips. */
export function pegFlag(peg: string | null | undefined): string {
	const cc = peg ? PEG_COUNTRY[peg.toUpperCase()] : undefined;
	if (!cc || cc.length !== 2) return "";
	if (cc === "EU") return "🇪🇺";
	return String.fromCodePoint(
		...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
	);
}

export interface SnapshotPoint {
	day: string;
	assetId?: string | null;
	marketCapUSD?: number | null;
	holders?: number | null;
}

export interface DailyTotal {
	date: string;
	marketCapUSD: number;
	holders: number;
	/** How many assets contributed a measurement that day. */
	assetsCounted: number;
}

export interface DailySeries {
	points: DailyTotal[];
	/** Days excluded because too few assets reported — see below. */
	droppedLowCoverage: number;
}

/**
 * A day is comparable to its neighbours only if roughly the same assets were
 * measured. Below this fraction of the best-covered day, a total is a
 * measurement gap wearing the costume of a market move.
 */
const COVERAGE_FLOOR = 0.8;

/**
 * Sum each day's measured assets into one total per day.
 *
 * TWO rules keep the chart honest, both instances of the same principle —
 * absent is not zero:
 *   1. A null metric contributes nothing AND doesn't count toward coverage;
 *      it is not summed as 0.
 *   2. A day where materially fewer assets reported is DROPPED, not plotted.
 *      Plotting it would render a partial-measurement day as a cliff in total
 *      market cap — the same class of lie as a missing row reading as a
 *      delisting (sls-066), just at the aggregate level.
 */
export function aggregateDaily(snapshots: SnapshotPoint[]): DailySeries {
	const byDay = new Map<string, DailyTotal>();
	// An asset writing twice for one day must not be counted twice.
	const seen = new Set<string>();

	for (const s of snapshots) {
		if (!s.day) continue;
		const key = `${s.day}:${s.assetId ?? ""}`;
		if (seen.has(key)) continue;
		seen.add(key);

		const row = byDay.get(s.day) ?? {
			date: s.day,
			marketCapUSD: 0,
			holders: 0,
			assetsCounted: 0,
		};
		const mcap =
			typeof s.marketCapUSD === "number" && Number.isFinite(s.marketCapUSD)
				? s.marketCapUSD
				: null;
		const holders =
			typeof s.holders === "number" && Number.isFinite(s.holders)
				? s.holders
				: null;
		if (mcap === null && holders === null) continue; // measured nothing

		if (mcap !== null) row.marketCapUSD += mcap;
		if (holders !== null) row.holders += holders;
		row.assetsCounted += 1;
		byDay.set(s.day, row);
	}

	const all = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
	if (all.length === 0) return { points: [], droppedLowCoverage: 0 };

	const best = Math.max(...all.map((p) => p.assetsCounted));
	const points = all.filter((p) => p.assetsCounted >= best * COVERAGE_FLOOR);
	return { points, droppedLowCoverage: all.length - points.length };
}
