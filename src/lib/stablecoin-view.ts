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

// ── display forms carried over from the retired explorer ──────────────────
// It served pre-formatted strings ("275.94M", "$467.50M", "2,284,095") and
// the UI was built around them. We store raw numbers, so the shaping happens
// here instead — same output, one place.

/** Supply as the explorer showed it: "467.50M", "2.28B", "146.00". */
export function displaySupply(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n)) return "N/A";
	const abs = Math.abs(n);
	if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
	if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
	if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
	if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
	return n.toFixed(2);
}

/** Market cap / volume as the explorer showed it: "$467.50M". */
export function displayUSD(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n)) return "N/A";
	return `$${displaySupply(n)}`;
}

/** Holders with separators: "2,284,095". */
export function displayHolders(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n)) return "N/A";
	return Math.round(n).toLocaleString("en-US");
}

/** Unit price: "$1.00", "$0.0067". */
export function displayPrice(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n)) return "N/A";
	return `$${n < 0.01 ? n.toFixed(6) : n.toFixed(2)}`;
}

/** Compact holders for the overview tiles: "2.81M", "146K". */
export function displayHoldersCompact(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n)) return "N/A";
	if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
	if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
	return n.toLocaleString("en-US");
}

/**
 * ISO-3166 alpha-2 (or "Global") → flag URL + human label, as the explorer
 * had it.
 *
 * Must carry an entry for every code `PEG_COUNTRY` (stablecoin-registry.ts)
 * can produce, or `countryInfo` below falls through to `Global` for a peg
 * that DOES have a country — the same failure mode from the other side.
 */
export const COUNTRY_INFO: Record<string, { flag: string; label: string }> = {
	US: { flag: flagUrl("us"), label: "United States" },
	EU: { flag: flagUrl("eu"), label: "Europe" },
	JP: { flag: flagUrl("jp"), label: "Japan" },
	AU: { flag: flagUrl("au"), label: "Australia" },
	CH: { flag: flagUrl("ch"), label: "Switzerland" },
	GB: { flag: flagUrl("gb"), label: "United Kingdom" },
	BR: { flag: flagUrl("br"), label: "Brazil" },
	AR: { flag: flagUrl("ar"), label: "Argentina" },
	PE: { flag: flagUrl("pe"), label: "Peru" },
	MX: { flag: flagUrl("mx"), label: "Mexico" },
	ZA: { flag: flagUrl("za"), label: "South Africa" },
	NG: { flag: flagUrl("ng"), label: "Nigeria" },
	CL: { flag: flagUrl("cl"), label: "Chile" },
	UA: { flag: flagUrl("ua"), label: "Ukraine" },
	SG: { flag: flagUrl("sg"), label: "Singapore" },
	AE: { flag: flagUrl("ae"), label: "United Arab Emirates" },
	CA: { flag: flagUrl("ca"), label: "Canada" },
	Global: { flag: flagUrl("un"), label: "Global" },
};

function flagUrl(code: string) {
	return `https://flagicons.lipis.dev/flags/4x3/${code}.svg`;
}

/** Country info for a row, falling back to the peg's home, then Global. */
export function countryInfo(
	country: string | null | undefined,
	peg: string | null | undefined,
) {
	const code =
		(country && COUNTRY_INFO[country] ? country : null) ??
		(peg ? PEG_COUNTRY[peg.toUpperCase()] : null) ??
		"Global";
	return COUNTRY_INFO[code] ?? COUNTRY_INFO.Global;
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
/** Days a coverage reference looks back. */
const ROLLING_WINDOW_DAYS = 14;
/** A day must also reach this share of the corpus-wide median. */
const MEDIAN_FLOOR = 0.5;

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

	// The reference a day is judged against is the best coverage in the
	// TRAILING window, not the all-time peak. 2026-08-22: the imported
	// history measured 17 assets a day; one day after the roster grew
	// measured 22, so an all-time floor of 17.6 erased ten months of history
	// and the "All" chart drew four bars. A roster expansion must never
	// rewrite the past. A second, looser floor against the corpus median
	// keeps a lone one-asset day from drawing as a cliff.
	const counts = all.map((p) => p.assetsCounted).sort((a, b) => a - b);
	const median = counts[Math.floor(counts.length / 2)];
	const points = all.filter((p, i) => {
		const windowStart = Math.max(0, i - (ROLLING_WINDOW_DAYS - 1));
		let best = 0;
		for (let j = windowStart; j <= i; j++)
			best = Math.max(best, all[j].assetsCounted);
		return (
			p.assetsCounted >= best * COVERAGE_FLOOR &&
			p.assetsCounted >= median * MEDIAN_FLOOR
		);
	});
	return { points, droppedLowCoverage: all.length - points.length };
}
