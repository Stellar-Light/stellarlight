/**
 * Reconciliation against DeFiLlama.
 *
 * Our headline is larger than every other Stellar stablecoin tracker's, and a
 * reader who knows the space will assume that means we are wrong. It does not:
 * the difference is almost entirely INCLUSION, not measurement, and it is
 * checkable line by line. So the page shows the comparison rather than the
 * bare number, computed live instead of written down — a hand-typed "they say
 * $882M" would be stale within a day and would quietly become a false claim.
 *
 * The source is DeFiLlama's public stablecoins endpoint (no key). Per-asset
 * Stellar circulating is compared by TICKER, which is a coarser identity than
 * this codebase normally allows — we key on (code, issuer) everywhere else —
 * so tickers with more than one issuer are SUMMED on our side before the
 * comparison. Circle's EURC and MyKobo's EURC are different assets to us and
 * one line to them; summing is the only honest way to compare at all, and the
 * copy says the comparison is per ticker.
 */
export interface Reconciliation {
	/** Assets each side reports with Stellar circulation. */
	oursTracked: number;
	theirsTracked: number;
	/** Tickers only we carry, biggest first. */
	onlyOurs: Array<{ ticker: string; amount: number }>;
	/** Tickers only they carry — our own coverage gaps, and worth chasing. */
	onlyTheirs: Array<{ ticker: string; amount: number }>;
	/** Where both track a ticker and the figures disagree, biggest gap first. */
	divergences: Array<{ ticker: string; ours: number; theirs: number }>;
	fetchedAt: string;
}

interface LlamaAsset {
	symbol?: string;
	chainCirculating?: Record<string, { current?: Record<string, number> }>;
}

const ENDPOINT = "https://stablecoins.llama.fi/stablecoins?includePrices=false";

/** Sum every numeric peg bucket — an asset reports under its own peg key. */
function circulating(entry: { current?: Record<string, number> }): number {
	return Object.values(entry.current ?? {}).reduce(
		(s, v) => s + (typeof v === "number" ? v : 0),
		0,
	);
}

/**
 * Compare our rows against DeFiLlama's. Returns null when their endpoint is
 * unreachable — the page then shows nothing rather than a stale or invented
 * comparison, which is the same rule the rest of this codebase follows for a
 * measurement it could not take.
 */
export async function reconcileWithDefiLlama(
	rows: Array<{ ticker: string; supply: number | null }>,
): Promise<Reconciliation | null> {
	let assets: LlamaAsset[];
	try {
		const res = await fetch(ENDPOINT, {
			signal: AbortSignal.timeout(12_000),
			next: { revalidate: 3600 },
		});
		if (!res.ok) return null;
		const body = (await res.json()) as { peggedAssets?: LlamaAsset[] };
		assets = body.peggedAssets ?? [];
	} catch {
		return null;
	}

	const theirs = new Map<string, number>();
	for (const a of assets) {
		const stellar = a.chainCirculating?.Stellar;
		if (!a.symbol || !stellar) continue;
		theirs.set(a.symbol, circulating(stellar));
	}
	if (theirs.size === 0) return null;

	// Two issuers can share a ticker here and be one line there, so sum first.
	const ours = new Map<string, number>();
	for (const r of rows) {
		if (r.supply == null) continue;
		ours.set(r.ticker, (ours.get(r.ticker) ?? 0) + r.supply);
	}

	const onlyOurs = [...ours]
		.filter(([t]) => !theirs.has(t))
		.map(([ticker, amount]) => ({ ticker, amount }))
		.sort((a, b) => b.amount - a.amount);
	const onlyTheirs = [...theirs]
		.filter(([t]) => !ours.has(t))
		.map(([ticker, amount]) => ({ ticker, amount }))
		.sort((a, b) => b.amount - a.amount);
	const divergences = [...ours]
		.filter(([t]) => theirs.has(t))
		.map(([ticker, v]) => ({
			ticker,
			ours: v,
			theirs: theirs.get(ticker) as number,
		}))
		// A rounding-level difference is not a disagreement worth showing.
		.filter(
			(d) => Math.abs(d.ours - d.theirs) > Math.max(1000, d.theirs * 0.02),
		)
		.sort((a, b) => Math.abs(b.ours - b.theirs) - Math.abs(a.ours - a.theirs));

	return {
		oursTracked: ours.size,
		theirsTracked: theirs.size,
		onlyOurs,
		onlyTheirs,
		divergences,
		fetchedAt: new Date().toISOString(),
	};
}
