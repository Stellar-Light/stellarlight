/**
 * The stablecoin measurement pipeline — ported 2026-08-18 from the
 * Replit-hosted service so the data survives that host being shut down.
 *
 * Per asset in the registry: confirm it exists on Horizon, read supply +
 * holders + 24h trade volume + lifetime payment-op count from Stellar
 * Expert, price it, and pull its logo from the issuer's own stellar.toml.
 * Every number is dated.
 *
 * FAIL-OPEN is the rule, inherited from the original and kept deliberately:
 * one asset's fetch failing must never empty the list, and a missing metric
 * is `null` — "not measured", never 0. The whole reason /api/stablecoins
 * carries meta.coverage is that a dropped row reads as "this asset does not
 * exist" to anyone who does not know better (sls-066).
 *
 * Sources, all public, no keys:
 *   Horizon        — asset existence on mainnet
 *   Stellar Expert — supply, trustline holders, 24h/7d TRADE volume, lifetime
 *                    payment-op count
 *   CoinGecko      — live FX for every peg, via the XLM cross
 *   <domain>/.well-known/stellar.toml — the issuer's own logo
 *
 * NOT a source here: real dollar-denominated PAYMENT (transfer) volume, as
 * opposed to the SDEX trade volume this file already reports. Researched
 * 2026-09-02 against the $612M raw / $171.59M adjusted 24h figures Allium's
 * Stellar dashboard reports:
 *   - Horizon's own root document (GET https://horizon.stellar.org/) shows
 *     neither `payments` nor `operations` accepts an asset filter in its
 *     link template — only `trades`/`trade_aggregations` do, and those are
 *     SDEX trades, not payments. Paging either collection unfiltered to find
 *     one asset's payments is a full-ledger scan, not a cron job.
 *   - Stellar Expert's `payments` and `trades` fields are LIFETIME COUNTS —
 *     its own UI labels them "Total payments count" / "Total trades count" —
 *     not amounts, and not scoped to any period. Twelve candidate
 *     history/stats/volume paths were probed against its public API; all
 *     404, except `/holders` (unrelated).
 *   - The canonical source for this exact metric is SDF's own Hubble
 *     warehouse (BigQuery, `crypto-stellar.crypto_stellar.*`), which needs a
 *     GCP project with a billing account on file, the BigQuery API enabled,
 *     and either a service-account key or OAuth login — none of which this
 *     repo has. Dune has decoded Stellar tables too, but every Dune API call
 *     (even free-tier) needs an API key we don't have either.
 * `paymentsCountLifetime` below is the honest fallback: a real, free,
 * zero-marginal-cost COUNT of payment operations (not SDEX trades, and not
 * adjusted for mint/CEX/DeFi the way Allium's figure is) — pulled off the
 * same Expert call this file already makes for supply/holders. See the PR
 * that added it for the full source-by-source table.
 */

import {
	PEG_COUNTRY,
	type StablecoinAsset,
	stablecoinId,
} from "@/data/stablecoin-registry";

const HORIZON = "https://horizon.stellar.org";
const EXPERT = "https://api.stellar.expert/explorer/public";
const COINGECKO = "https://api.coingecko.com/api/v3";

/** Stellar Expert reports supply/volume in stroops (1e-7). */
const STROOP = 10_000_000;

export interface MeasuredStablecoin {
	id: string;
	code: string;
	issuer: string;
	name: string;
	company: string;
	domain: string;
	website: string;
	peg: string;
	country: string;
	assetType: string | null;
	/** Circulating units in the asset's OWN peg — not comparable across pegs. */
	supply: number | null;
	/** supply × priceUSD. The only cross-asset comparable size metric. */
	marketCapUSD: number | null;
	priceUSD: number | null;
	holders: number | null;
	volume24hUSD: number | null;
	/** Lifetime count of payment operations Stellar Expert has indexed for
	 *  this asset ("Total payments count" in its own UI) — a COUNT, not an
	 *  amount, and not scoped to any period on its own. Not comparable
	 *  across assets of different ages; `refresh-stablecoins.ts` diffs it
	 *  against yesterday's snapshot into the period metric that IS
	 *  comparable, `paymentsCount24h`. */
	paymentsCountLifetime: number | null;
	logoUrl: string | null;
	logoSource: "toml" | "fallback" | "country-flag" | "none";
	/** How each figure was obtained — a consumer can weigh a stale row. */
	basis: "live" | "curated-static" | "unmeasured";
	measuredAt: string;
	/** Set when the row could not be measured; names why. */
	note?: string;
}

/** What a 429-exhausted `fetchJson` throws — distinct from the plain `null`
 *  a 404 returns. Collapsing them into the same `null` is exactly the bug
 *  that made BRL, APSUSDM, APSEURM and their batch-mates read "Supply
 *  unavailable" on every refresh when the real story was "the batch ahead of
 *  them had already spent Stellar Expert's rate-limit bucket" (found
 *  2026-09-02: each fetches fine standalone). A rate limit is "could not
 *  check"; a 404 is "checked, not there" — see
 *  reference_trinary_probe_invariant in project memory. */
export const RATE_LIMIT_MARK = "rate-limited (429)";
class RateLimitedError extends Error {
	constructor(url: string, retries: number) {
		// fetchJson is shared by Horizon, Stellar Expert and CoinGecko calls, so
		// name the actual host rather than assuming which one — the only path
		// that currently turns this into a stored row note is the Stellar
		// Expert one (supplyAndHolders), but this stays correct if that changes.
		let host = "upstream";
		try {
			host = new URL(url).hostname;
		} catch {
			// keep the "upstream" fallback
		}
		super(
			`${host} ${RATE_LIMIT_MARK} after ${retries} attempt${retries === 1 ? "" : "s"} — not evidence the asset is gone`,
		);
		this.name = "RateLimitedError";
	}
}

async function fetchJson(
	url: string,
	{ retries = 3, timeoutMs = 10_000 } = {},
): Promise<any | null> {
	for (let i = 0; i < retries; i++) {
		try {
			const res = await fetch(url, {
				signal: AbortSignal.timeout(timeoutMs),
				headers: {
					accept: "application/json",
					"user-agent": "stellarlight-stablecoins",
				},
			});
			if (res.status === 404) return null;
			if (res.status === 429) {
				// Stellar Expert rate-limits hard; back off further than usual.
				await sleep(Math.min(2000 * 2.5 ** i, 30_000));
				continue;
			}
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return await res.json();
		} catch (err) {
			if (i === retries - 1) throw err;
			await sleep(Math.min(1000 * 2 ** i, 8000));
		}
	}
	// Every attempt landed here via the 429 branch (any other outcome above
	// returns or re-throws before the loop ends) — so this is specifically
	// "we got rate-limited every time", never "we don't know why it failed".
	throw new RateLimitedError(url, retries);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Confirm the asset is really issued on mainnet before reporting on it. */
async function existsOnHorizon(code: string, issuer: string): Promise<boolean> {
	try {
		const data = await fetchJson(
			`${HORIZON}/assets?asset_code=${encodeURIComponent(code)}&asset_issuer=${issuer}&limit=1`,
			{ retries: 2, timeoutMs: 6000 },
		);
		return (data?._embedded?.records ?? []).length > 0;
	} catch {
		// A Horizon wobble is NOT evidence the asset is gone. Caller keeps the
		// row and marks it unmeasured rather than dropping it.
		return false;
	}
}

/**
 * One Stellar Expert call, three fields off it: supply, trustline-holder
 * count, and — new 2026-09-02 — the lifetime payment-operation counter
 * (`paymentsCountLifetime`) that `refresh-stablecoins.ts` diffs against
 * yesterday's snapshot to derive `paymentsCount24h`. Free: it's the same
 * response body this function already fetched.
 */
async function supplyAndHolders(
	code: string,
	issuer: string,
	suffix = "",
): Promise<{
	supply: number | null;
	holders: number | null;
	paymentsCountLifetime: number | null;
}> {
	const data = await fetchJson(`${EXPERT}/asset/${code}-${issuer}${suffix}`);
	if (!data)
		return { supply: null, holders: null, paymentsCountLifetime: null };
	const supply = data.supply != null ? Number(data.supply) / STROOP : null;
	const holders =
		typeof data.trustlines === "object"
			? (data.trustlines?.total ?? null)
			: (data.trustlines ?? null);
	const payments = Number(data.payments);
	return {
		supply: Number.isFinite(supply) ? supply : null,
		holders: Number.isFinite(Number(holders)) ? Number(holders) : null,
		paymentsCountLifetime: Number.isFinite(payments) ? payments : null,
	};
}

async function volume24hUSD(
	code: string,
	issuer: string,
	priceUSD: number | null,
	suffix = "",
): Promise<number | null> {
	if (priceUSD == null) return null;
	try {
		const data = await fetchJson(`${EXPERT}/asset/${code}-${issuer}${suffix}`, {
			retries: 2,
			timeoutMs: 6000,
		});
		if (!data) return null;
		let native: number | null = null;
		if (data.volume24h != null) native = Number(data.volume24h) / STROOP;
		// 7-day rolling / 7 is an ESTIMATE, used only when the 24h figure is
		// absent. Callers should not present it as an exact daily number.
		else if (data.volume7d != null) native = Number(data.volume7d) / STROOP / 7;
		return native == null || !Number.isFinite(native)
			? null
			: native * priceUSD;
	} catch {
		return null;
	}
}

/**
 * Live FX, derived from one CoinGecko call.
 *
 * CoinGecko quotes XLM in many fiats at once, so XLM/USD ÷ XLM/EUR gives
 * USD-per-EUR without a second provider or an API key. Covers 10 of the 12
 * pegs in the registry; PEN is not quoted, so PEN-pegged assets price null.
 */
const FX_VS = [
	"usd",
	"eur",
	"jpy",
	"gbp",
	"aud",
	"chf",
	"brl",
	"ars",
	"mxn",
	"zar",
	"ngn",
	"sgd",
	"aed",
	"cad",
] as const;

let fxCache: { rates: Record<string, number>; at: number } | null = null;

async function fxUsdPerPeg(): Promise<Record<string, number>> {
	if (fxCache && Date.now() - fxCache.at < 10 * 60_000) return fxCache.rates;
	try {
		const d = await fetchJson(
			`${COINGECKO}/simple/price?ids=stellar&vs_currencies=${FX_VS.join(",")}`,
			{ retries: 2, timeoutMs: 8000 },
		);
		const xlm = d?.stellar ?? {};
		const usd = Number(xlm.usd);
		if (!Number.isFinite(usd) || usd <= 0) return fxCache?.rates ?? {};
		const rates: Record<string, number> = { USD: 1 };
		for (const k of FX_VS) {
			if (k === "usd") continue;
			const v = Number(xlm[k]);
			if (Number.isFinite(v) && v > 0) rates[k.toUpperCase()] = usd / v;
		}
		fxCache = { rates, at: Date.now() };
		return rates;
	} catch {
		return fxCache?.rates ?? {};
	}
}

/**
 * Price one unit in USD, AT ITS PEG.
 *
 * A stablecoin claims 1 unit = 1 unit of its peg, so the honest USD value is
 * the peg's live FX rate. The Replit original hardcoded these (EUR 1.08 when
 * the live rate is 1.16 — 7% stale and drifting), and an earlier draft of
 * this port priced from the asset's Stellar orderbook instead, which is
 * WRONG for thin books: EURS came out at $4.6e-8 per unit, turning a ~$1M
 * asset into $0.05. A shallow book is an illiquidity fact, not a valuation.
 *
 * What this does NOT measure is peg deviation — whether the asset actually
 * trades at its peg. `basis: "live"` means supply is measured and the peg is
 * ASSUMED to hold. Measuring deviation is a separate signal, not this.
 */
async function priceUSD(peg: string): Promise<number | null> {
	if (peg === "USD") return 1;
	const rates = await fxUsdPerPeg();
	return rates[peg] ?? null;
}

const tomlCache = new Map<string, { text: string | null; at: number }>();

async function issuerToml(domain: string): Promise<string | null> {
	const hit = tomlCache.get(domain);
	if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.text;
	try {
		const res = await fetch(`https://${domain}/.well-known/stellar.toml`, {
			signal: AbortSignal.timeout(8000),
		});
		const text = res.ok ? await res.text() : null;
		tomlCache.set(domain, { text, at: Date.now() });
		return text;
	} catch {
		return hit?.text ?? null;
	}
}

/**
 * Pull the asset's logo from its issuer's TOML.
 *
 * Deliberately a small hand parser rather than a TOML dependency: we need
 * exactly one field out of `[[CURRENCIES]]`, and issuer TOMLs in the wild are
 * frequently malformed enough that a strict parser throws on the whole file.
 */
function logoFromToml(
	toml: string,
	code: string,
	issuer: string,
	domain: string,
): string | null {
	const blocks = toml.split(/\[\[\s*(?:CURRENCIES|ASSETS)\s*\]\]/i).slice(1);
	for (const b of blocks) {
		const val = (k: string) =>
			b.match(new RegExp(`^\\s*${k}\\s*=\\s*["']([^"']+)`, "im"))?.[1] ?? null;
		const c = val("code") ?? val("asset_code");
		const iss = val("issuer") ?? val("asset_issuer") ?? val("issuer_account");
		if (c !== code) continue;
		// Only trust the block when the issuer matches too — a TOML can list
		// several assets and matching on code alone crosses identities.
		if (iss && iss !== issuer) continue;
		const img = val("image") ?? val("logo");
		if (!img) continue;
		return img.startsWith("http") ? img : `https://${domain}${img}`;
	}
	return null;
}

/** Measure one asset. Never throws: a failure comes back as an unmeasured row. */
export async function measureStablecoin(
	asset: StablecoinAsset,
): Promise<MeasuredStablecoin> {
	const now = new Date().toISOString();
	const base = {
		id: stablecoinId(asset),
		code: asset.code,
		issuer: asset.issuer,
		name: asset.code,
		company: asset.company,
		domain: asset.domain,
		website: `https://${asset.domain}`,
		peg: asset.peg,
		country: PEG_COUNTRY[asset.peg] ?? "Global",
		assetType: asset.assetType ?? null,
		measuredAt: now,
	};

	// Logo first — cheap, cached, and useful even on an unmeasured row.
	let logoUrl: string | null = null;
	let logoSource: MeasuredStablecoin["logoSource"] = "none";
	if (asset.useCountryFlag) {
		logoUrl = `flag:${asset.peg}`;
		logoSource = "country-flag";
	} else {
		const toml = await issuerToml(asset.domain);
		const fromToml = toml
			? logoFromToml(toml, asset.code, asset.issuer, asset.domain)
			: null;
		if (fromToml) {
			logoUrl = fromToml;
			logoSource = "toml";
		} else if (asset.fallbackImageUrl) {
			logoUrl = asset.fallbackImageUrl;
			logoSource = "fallback";
		}
	}

	// An asset carrying human-checked static figures reports them as such —
	// never dressed up as a live measurement.
	if (asset.hardcodedData) {
		const price = await priceUSD(asset.peg);
		return {
			...base,
			supply: asset.hardcodedData.supply,
			priceUSD: price,
			marketCapUSD: price == null ? null : asset.hardcodedData.supply * price,
			holders: asset.hardcodedData.holders,
			volume24hUSD: null,
			paymentsCountLifetime: null,
			logoUrl,
			logoSource,
			basis: "curated-static",
			note: `Figures hand-checked ${asset.hardcodedData.checkedAt}; no public API reports this asset reliably. Treat as an as-of estimate, not a live measurement.`,
		};
	}

	try {
		if (!asset.skipHorizonValidation) {
			const live = await existsOnHorizon(asset.code, asset.issuer);
			if (!live) {
				return {
					...base,
					supply: null,
					marketCapUSD: null,
					priceUSD: null,
					holders: null,
					volume24hUSD: null,
					paymentsCountLifetime: null,
					logoUrl,
					logoSource,
					basis: "unmeasured",
					note: "Not confirmed on Horizon at measurement time. This is a lookup failure, not a claim the asset was retired — the row stays so its absence is never read as delisting.",
				};
			}
		}

		const { supply, holders, paymentsCountLifetime } = await supplyAndHolders(
			asset.code,
			asset.issuer,
			asset.stellarExpertSuffix ?? "",
		);
		const price = await priceUSD(asset.peg);
		const vol = await volume24hUSD(
			asset.code,
			asset.issuer,
			price,
			asset.stellarExpertSuffix ?? "",
		);

		return {
			...base,
			supply,
			priceUSD: price,
			marketCapUSD: supply != null && price != null ? supply * price : null,
			holders,
			volume24hUSD: vol,
			paymentsCountLifetime,
			logoUrl,
			logoSource,
			basis: supply == null ? "unmeasured" : "live",
			...(supply == null
				? {
						note: "Supply unavailable from Stellar Expert at measurement time.",
					}
				: {}),
		};
	} catch (err) {
		return {
			...base,
			supply: null,
			marketCapUSD: null,
			priceUSD: null,
			holders: null,
			volume24hUSD: null,
			paymentsCountLifetime: null,
			logoUrl,
			logoSource,
			basis: "unmeasured",
			note: `Measurement failed: ${String((err as Error).message).slice(0, 120)}`,
		};
	}
}

async function measureBatch(
	assets: StablecoinAsset[],
	concurrency: number,
	staggerMs: number,
): Promise<MeasuredStablecoin[]> {
	const out: MeasuredStablecoin[] = [];
	for (let i = 0; i < assets.length; i += concurrency) {
		const batch = assets.slice(i, i + concurrency);
		out.push(...(await Promise.all(batch.map(measureStablecoin))));
		if (i + concurrency < assets.length) await sleep(staggerMs);
	}
	return out;
}

/**
 * Measure the whole registry with bounded concurrency, then mop up whatever
 * Stellar Expert rate-limited in one slower retry pass.
 *
 * This comment used to say "four at a time... finishes the 23-asset set in
 * well under a minute". The roster is 41 now (2026-09-02) and keeps growing
 * (23 → 37 → 41 inside one day), and the growth is exactly what broke it:
 * concurrency 4 with a 400ms stagger, two Stellar Expert calls per asset,
 * burns through Stellar Expert's (undocumented) rate limit by the tail of a
 * 41-asset run. Nine rows — APSUSDM, APSEURM, AUDD, ZARZ, BRL, USDV, USDM,
 * UAH, CLPX — came back "unmeasured" on the run right before this fix, not
 * because anything is wrong with those assets (each fetches fine standalone)
 * but because the batches ahead of them had already spent the bucket. Two of
 * them (USDV, USDM) had never been measured at all, so they sat on the
 * dashboard with an em dash where their supply should be.
 *
 * To be clear about what was NOT wrong: nulled fields stored as null and
 * `basis: "unmeasured"` correctly — nothing was published as a false zero.
 * This is an availability fix, not a correctness fix.
 *
 * Lower concurrency and a longer stagger reduce how hard the first pass
 * bursts; the second pass is the actual fix — it only re-asks the rows that
 * came back rate-limited (never the rows Horizon or curated-static already
 * resolved), after a pause long enough for the bucket to plausibly refill,
 * one at a time.
 *
 * ponytail: concurrency/staggerMs/the 15s cooldown are a heuristic tuned
 * against a limit Stellar Expert does not publish, not a measured one — if
 * the roster keeps growing and rows still come back unmeasured after the
 * second pass, drop concurrency further or widen the stagger before reaching
 * for anything smarter (a token-bucket client, a request queue).
 */
export async function measureRegistry(
	assets: StablecoinAsset[],
	{
		concurrency = 3,
		staggerMs = 700,
	}: { concurrency?: number; staggerMs?: number } = {},
): Promise<MeasuredStablecoin[]> {
	const out = await measureBatch(assets, concurrency, staggerMs);

	const retryAt = out
		.map((m, i) => (m.note?.includes(RATE_LIMIT_MARK) ? i : -1))
		.filter((i) => i >= 0);
	if (retryAt.length === 0) return out;

	await sleep(15_000);
	const retried = await measureBatch(
		retryAt.map((i) => assets[i]),
		1,
		1000,
	);
	retryAt.forEach((origIndex, j) => {
		out[origIndex] = retried[j];
	});
	return out;
}
