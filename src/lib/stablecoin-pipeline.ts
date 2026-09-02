/**
 * The stablecoin measurement pipeline — ported 2026-08-18 from the
 * Replit-hosted service so the data survives that host being shut down.
 *
 * Per asset in the registry: confirm it exists on Horizon, read supply +
 * holders + 24h volume from Stellar Expert, price it, and pull its logo from
 * the issuer's own stellar.toml. Every number is dated.
 *
 * FAIL-OPEN is the rule, inherited from the original and kept deliberately:
 * one asset's fetch failing must never empty the list, and a missing metric
 * is `null` — "not measured", never 0. The whole reason /api/stablecoins
 * carries meta.coverage is that a dropped row reads as "this asset does not
 * exist" to anyone who does not know better (sls-066).
 *
 * Sources, all public, no keys:
 *   Horizon        — asset existence on mainnet
 *   Stellar Expert — supply, trustline holders, 24h/7d volume
 *   CoinGecko      — live FX for every peg, via the XLM cross
 *   <domain>/.well-known/stellar.toml — the issuer's own logo
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
	logoUrl: string | null;
	logoSource: "toml" | "fallback" | "country-flag" | "none";
	/** How each figure was obtained — a consumer can weigh a stale row. */
	basis: "live" | "curated-static" | "unmeasured";
	measuredAt: string;
	/** Set when the row could not be measured; names why. */
	note?: string;
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
	return null;
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

async function supplyAndHolders(
	code: string,
	issuer: string,
	suffix = "",
): Promise<{ supply: number | null; holders: number | null }> {
	const data = await fetchJson(`${EXPERT}/asset/${code}-${issuer}${suffix}`);
	if (!data) return { supply: null, holders: null };
	const supply = data.supply != null ? Number(data.supply) / STROOP : null;
	const holders =
		typeof data.trustlines === "object"
			? (data.trustlines?.total ?? null)
			: (data.trustlines ?? null);
	return {
		supply: Number.isFinite(supply) ? supply : null,
		holders: Number.isFinite(Number(holders)) ? Number(holders) : null,
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
					logoUrl,
					logoSource,
					basis: "unmeasured",
					note: "Not confirmed on Horizon at measurement time. This is a lookup failure, not a claim the asset was retired — the row stays so its absence is never read as delisting.",
				};
			}
		}

		const { supply, holders } = await supplyAndHolders(
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
			logoUrl,
			logoSource,
			basis: "unmeasured",
			note: `Measurement failed: ${String((err as Error).message).slice(0, 120)}`,
		};
	}
}

/**
 * Measure the whole registry with bounded concurrency.
 *
 * Serial-ish on purpose: Stellar Expert rate-limits, and the original burned
 * retries fighting it. Four at a time with a small stagger is well inside the
 * limit and finishes the 23-asset set in well under a minute.
 */
export async function measureRegistry(
	assets: StablecoinAsset[],
	{ concurrency = 4 }: { concurrency?: number } = {},
): Promise<MeasuredStablecoin[]> {
	const out: MeasuredStablecoin[] = [];
	for (let i = 0; i < assets.length; i += concurrency) {
		const batch = assets.slice(i, i + concurrency);
		out.push(...(await Promise.all(batch.map(measureStablecoin))));
		if (i + concurrency < assets.length) await sleep(400);
	}
	return out;
}
