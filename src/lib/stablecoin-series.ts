/**
 * Per-token daily series and the issuer leaderboard behind the four analytics
 * panels on /stablecoins.
 *
 * The explorer this replaces got these pre-computed from its own Postgres
 * (`historicalMarketShareByToken`, `historicalHoldersByToken`,
 * `issuerLeaders`). We derive them from `stablecoin-snapshots` instead, which
 * means one rule has to be stated rather than inherited: a token that was NOT
 * measured on a day is `null` for that day, never 0. A line that dives to zero
 * and comes back is a measurement gap drawn as a collapse in supply.
 *
 * Pure — no Payload, no fetch — so the rules are unit testable.
 */

export interface TokenSnapshot {
	day: string;
	assetId?: string | null;
	code?: string | null;
	marketCapUSD?: number | null;
	holders?: number | null;
	supply?: number | null;
}

/** One row per day: { _date, <TICKER>: value | null, … }. */
export type SeriesRow = Record<string, string | number | null>;

export type Timeframe = "14D" | "30D" | "90D" | "1Y";
export const TIMEFRAMES: Timeframe[] = ["14D", "30D", "90D", "1Y"];
const DAYS: Record<Timeframe, number> = {
	"14D": 14,
	"30D": 30,
	"90D": 90,
	"1Y": 365,
};

function num(v: unknown): number | null {
	return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Pivot snapshots into one row per day keyed by ticker.
 *
 * `metric` picks which column. Tokens absent on a day stay absent (undefined)
 * rather than 0 — see the module note.
 */
export function pivotByToken(
	snaps: TokenSnapshot[],
	metric: "marketCapUSD" | "holders" | "supply",
): SeriesRow[] {
	const byDay = new Map<string, SeriesRow>();
	for (const s of snaps) {
		if (!s.day) continue;
		const ticker = (s.code ?? s.assetId?.split("-")[0] ?? "").trim();
		if (!ticker) continue;
		const v = num(s[metric]);
		if (v === null) continue; // not measured — leave the gap
		const row = byDay.get(s.day) ?? { _date: s.day };
		// An asset writing twice for a day must not double-count.
		if (row[ticker] === undefined) row[ticker] = v;
		byDay.set(s.day, row);
	}
	return [...byDay.values()].sort((a, b) =>
		String(a._date).localeCompare(String(b._date)),
	);
}

/** Sum every measured token per day → [{ _date, total }]. */
export function totalPerDay(
	snaps: TokenSnapshot[],
	metric: "marketCapUSD" | "holders" | "supply",
): SeriesRow[] {
	return pivotByToken(snaps, metric).map((row) => {
		let total = 0;
		for (const [k, v] of Object.entries(row))
			if (k !== "_date" && typeof v === "number") total += v;
		return { _date: row._date, total };
	});
}

/**
 * Percent-of-day share per token.
 *
 * A "market share" panel that plots absolute market cap is not a share chart:
 * on a linear axis USDC's hundreds of millions flatten every other token onto
 * the baseline, and the reader cannot see the split the title promises. The
 * denominator is the sum of tokens MEASURED that day — a token absent that day
 * stays absent rather than counting as 0, so a measurement gap never reads as
 * a share collapse.
 */
export function toShare(rows: SeriesRow[]): SeriesRow[] {
	return rows.map((row) => {
		let total = 0;
		for (const [k, v] of Object.entries(row))
			if (k !== "_date" && typeof v === "number") total += v;
		const out: SeriesRow = { _date: row._date };
		if (total <= 0) return out;
		for (const [k, v] of Object.entries(row))
			if (k !== "_date" && typeof v === "number") out[k] = (v / total) * 100;
		return out;
	});
}

/** The last N days of a series. */
export function windowed(rows: SeriesRow[], tf: Timeframe): SeriesRow[] {
	return rows.slice(-DAYS[tf]);
}

/** Every ticker that appears in a series, biggest last-value first. */
export function tickersIn(rows: SeriesRow[]): string[] {
	const last = rows[rows.length - 1] ?? {};
	const seen = new Set<string>();
	for (const r of rows)
		for (const k of Object.keys(r)) if (k !== "_date") seen.add(k);
	return [...seen].sort((a, b) => {
		const av = typeof last[a] === "number" ? (last[a] as number) : -1;
		const bv = typeof last[b] === "number" ? (last[b] as number) : -1;
		return bv - av;
	});
}

export interface IssuerLeader {
	company: string;
	/** Issuer's domain from the first of its assets — for a logo and a link. */
	domain: string | null;
	tokens: string[];
	totalMarketCapUSD: number;
	/** True when ANY of the issuer's rows is not a live measurement. */
	hasEstimate: boolean;
}

/**
 * Group current rows by issuing company, biggest USD market cap first.
 *
 * Market cap is the only cross-currency comparable, so an issuer with a peso
 * coin and a dollar coin sums correctly here and would not if we added raw
 * supply. An issuer whose total includes a hand-checked or unmeasured row is
 * flagged rather than silently blended in.
 */
export function issuerLeaderboard(
	rows: Array<{
		company?: string | null;
		ticker: string;
		marketCapRaw?: number | null;
		basis?: string | null;
		issuerDomain?: string | null;
	}>,
): IssuerLeader[] {
	const by = new Map<string, IssuerLeader>();
	for (const r of rows) {
		const company = (r.company ?? "").trim();
		if (!company) continue;
		const e = by.get(company) ?? {
			company,
			domain: r.issuerDomain?.trim() || null,
			tokens: [],
			totalMarketCapUSD: 0,
			hasEstimate: false,
		};
		if (!e.tokens.includes(r.ticker)) e.tokens.push(r.ticker);
		e.totalMarketCapUSD += num(r.marketCapRaw) ?? 0;
		if (r.basis && r.basis !== "live") e.hasEstimate = true;
		by.set(company, e);
	}
	return [...by.values()].sort(
		(a, b) => b.totalMarketCapUSD - a.totalMarketCapUSD,
	);
}

/** Stable per-ticker line colours, carried over from the explorer. */
export const TOKEN_COLORS: Record<string, string> = {
	USDC: "hsl(140, 70%, 58%)",
	PYUSD: "hsl(200, 75%, 60%)",
	USDY: "hsl(270, 72%, 62%)",
	EURC: "hsl(180, 75%, 58%)",
	ZUSD: "hsl(220, 78%, 62%)",
	GYEN: "hsl(30, 80%, 58%)",
	EURS: "hsl(160, 70%, 55%)",
	AUDD: "hsl(45, 72%, 55%)",
	USDGLO: "hsl(160, 68%, 52%)",
	VEUR: "hsl(240, 75%, 60%)",
	VCHF: "hsl(0, 75%, 60%)",
	BRLT: "hsl(120, 70%, 55%)",
	ARST: "hsl(280, 72%, 60%)",
	USDx: "hsl(150, 70%, 55%)",
	EURx: "hsl(190, 75%, 60%)",
	GBPx: "hsl(260, 78%, 62%)",
	mZAR: "hsl(90, 75%, 58%)",
	SBC: "hsl(140, 75%, 62%)",
	MXNe: "hsl(310, 78%, 60%)",
	PEN: "hsl(15, 75%, 58%)",
	ARS: "hsl(205, 70%, 62%)",
	NGNC: "hsl(100, 70%, 55%)",
};

export function colorFor(ticker: string): string {
	if (TOKEN_COLORS[ticker]) return TOKEN_COLORS[ticker];
	// Deterministic fallback so a new asset keeps one colour across renders.
	let h = 0;
	for (let i = 0; i < ticker.length; i++)
		h = (h * 31 + ticker.charCodeAt(i)) % 360;
	return `hsl(${h}, 72%, 60%)`;
}
