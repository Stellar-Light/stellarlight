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
 *   <issuer account's home_domain>/.well-known/stellar.toml: the issuer of
 *                    record (ORG_NAME), read off the account Horizon reports
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
import {
	type IssuerOfRecordCheck,
	namedIssuingParty,
	type PriceBasis,
	sameParty,
} from "./stablecoins";
import { parseStellarToml } from "./stellar-toml";

const HORIZON = "https://horizon.stellar.org";
const EXPERT = "https://api.stellar.expert/explorer/public";
const COINGECKO = "https://api.coingecko.com/api/v3";

/** Stellar Expert reports supply/volume in stroops (1e-7). */
const STROOP = 10_000_000;

/** What the writer stores about the issuer of record: one check. */
export interface IssuerOfRecordFields {
	/** ORG_NAME in the stellar.toml at the issuer account's home_domain, when
	 *  that toml lists the issuer account. Null unless the check is named. */
	issuerOfRecord: string | null;
	issuerOfRecordCheck: IssuerOfRecordCheck | null;
	issuerOfRecordSourceUrl: string | null;
	issuerOfRecordAsOf: string | null;
	/** Named: the toml's desc for this currency, quoted, when it names another
	 *  issuing party. Not named: why. */
	issuerOfRecordNote: string | null;
}

/**
 * One attempt to read the issuer of record. Three outcomes, each written
 * differently: named (the toml at the account's home_domain lists the account
 * and gives an ORG_NAME), not-named (that read completed and named nobody: a
 * checked absence), could-not-read (no answer to judge by: the stored check
 * stays as it was).
 */
export type IssuerOfRecordRead =
	| {
			outcome: "named";
			at: string;
			sourceUrl: string;
			name: string;
			note: string | null;
	  }
	| { outcome: "not-named"; at: string; sourceUrl: string | null; why: string }
	| { outcome: "could-not-read"; why: string };

export interface MeasuredStablecoin {
	/** This run's issuer-of-record read; the writer turns it into fields with
	 *  carryIssuerOfRecord. */
	issuerOfRecordRead: IssuerOfRecordRead;
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
	/** How priceUSD was obtained. Null exactly when priceUSD is null — a basis
	 *  on an absent price would name a measurement that never happened. */
	priceBasis: PriceBasis | null;
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
	logoSource: "toml" | "toml-org" | "fallback" | "country-flag" | "none";
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
			`${host} ${RATE_LIMIT_MARK} after ${retries} attempt${retries === 1 ? "" : "s"}; not evidence the asset is gone`,
		);
		this.name = "RateLimitedError";
	}
}

async function fetchJson(
	url: string,
	{ retries = 3, timeoutMs = 10_000 } = {},
	// biome-ignore lint/suspicious/noExplicitAny: shared by three external APIs (Horizon, Stellar Expert, CoinGecko), each a different raw JSON shape
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

/** Last good market read per CoinGecko id, for one measurement cycle. Only
 *  successes are cached: a failure must not pin a null for 10 minutes. */
const marketCache = new Map<string, { price: number; at: number }>();

async function marketPriceUSD(id: string): Promise<number | null> {
	const hit = marketCache.get(id);
	if (hit && Date.now() - hit.at < 10 * 60_000) return hit.price;
	try {
		const d = await fetchJson(
			`${COINGECKO}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`,
			{ retries: 2, timeoutMs: 8000 },
		);
		const v = Number(d?.[id]?.usd);
		if (!Number.isFinite(v) || v <= 0) return null;
		marketCache.set(id, { price: v, at: Date.now() });
		return v;
	} catch {
		// A 429 or timeout is a could-not-check, never a $0 asset. Swallowed
		// here on purpose: the caller falls back to the peg and SAYS SO, and
		// letting a RateLimitedError escape would blank the whole row (supply
		// included) through measureStablecoin's outer catch.
		return null;
	}
}

/**
 * USD price of one unit, and the basis that produced it.
 *
 * The peg is the default and is right for a par-redeemable stablecoin. A row
 * that declares `marketPrice` is one whose unit is NOT 1:1 with its peg, and
 * those are priced from the market: USDY accrues (it was $1.14 on 2026-09-09
 * against a $1.00 peg — a 14% / ~$65M understatement of the largest asset on
 * the board), USDM1 is a bond trading above par. When that read fails we fall
 * back to the peg and mark the row `assumed-peg` with a note, so an
 * understated cap is never served as if it were the market's number.
 */
async function unitPriceUSD(asset: StablecoinAsset): Promise<{
	price: number | null;
	basis: PriceBasis;
	note?: string;
}> {
	if (!asset.marketPrice)
		return { price: await priceUSD(asset.peg), basis: "assumed-peg" };
	const market = await marketPriceUSD(asset.marketPrice.id);
	if (market != null) return { price: market, basis: "measured-market" };
	return {
		price: await priceUSD(asset.peg),
		basis: "assumed-peg",
		note: `Market price unavailable from ${asset.marketPrice.source} at measurement time, so this unit is priced at its peg. ${asset.code} is not a par-redeemable claim, so the cap is UNDERSTATED while this holds.`,
	};
}

const tomlCache = new Map<string, { text: string | null; at: number }>();

async function issuerToml(domain: string): Promise<string | null> {
	const hit = tomlCache.get(domain);
	if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.text;
	// Retried like every other fetch in this file (fetchJson gets three
	// attempts). This one had a single try, so one transient TLS/DNS blip on
	// the runner silently cost a row its logo for a whole six-hour cycle —
	// the first YLDS refresh served none while the same code resolved it
	// locally, and the next run resolved it fine. Only a thrown fetch is
	// retried; a real 404 is an answer and is cached as one.
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const res = await fetch(`https://${domain}/.well-known/stellar.toml`, {
				signal: AbortSignal.timeout(8000),
			});
			const text = res.ok ? await res.text() : null;
			tomlCache.set(domain, { text, at: Date.now() });
			return text;
		} catch {
			if (attempt < 2) await sleep(1000 * 2 ** attempt);
		}
	}
	return hit?.text ?? null;
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

/**
 * The issuer's own org-level mark (`[DOCUMENTATION] ORG_LOGO`), for an asset
 * whose toml declares no PER-CURRENCY image (e.g. APS Money's 13 currencies
 * share one toml and none carries an `image=`). One level less specific than
 * `logoFromToml` — a company mark standing in for a coin mark — so it is
 * exported as a distinct `logoSource` ("toml-org"), never folded into "toml".
 */
export function orgLogoFromToml(toml: string, domain: string): string | null {
	const img = toml.match(/^\s*ORG_LOGO\s*=\s*["']([^"']+)/im)?.[1];
	if (!img) return null;
	return img.startsWith("http") ? img : `https://${domain}${img}`;
}

/**
 * The issuer of record a toml states for one asset: its [DOCUMENTATION]
 * ORG_NAME, counted only when the toml lists the issuing account, in ACCOUNTS
 * or as a [[CURRENCIES]] issuer (an address in a comment is not a listing).
 * The account's home_domain points at the toml and the toml names the account
 * back (SEP-1, both directions): an account can set any home_domain, but it
 * cannot make another org's toml list it. The match is on the account, not
 * the code, so VNX's toml names the org behind VEUR though it declares only
 * VCHF for that account.
 *
 * `note` keeps the desc of the block that declares this code AND this issuer,
 * quoted, when it names an issuing party other than the ORG_NAME (MGUSD:
 * "issued by Bridge on behalf of MoneyGram"). Pure: the caller fetches.
 */
export function issuerOfRecordFromToml(
	toml: string,
	code: string,
	issuer: string,
): { name: string; note: string | null } | { miss: string } {
	const t = parseStellarToml(toml);
	const listed =
		t.accounts.includes(issuer) ||
		t.currencies.some((c) => c.issuer === issuer);
	if (!listed) return { miss: "the toml does not list the issuer account" };
	const name = t.documentation.ORG_NAME?.trim();
	if (!name) return { miss: "the toml declares no ORG_NAME" };
	const desc =
		t.currencies.find((c) => c.code === code && c.issuer === issuer)?.desc ??
		null;
	const party = namedIssuingParty(desc);
	return {
		name,
		note:
			desc && party && !sameParty(party, name)
				? `stellar.toml desc for ${code}: "${desc}"`
				: null,
	};
}

/** The cap Stellar's own SDK puts on a stellar.toml. */
const TOML_MAX_BYTES = 100 * 1024;

/** The body, or null past `max` bytes (the rest is never downloaded). */
async function cappedText(res: Response, max: number): Promise<string | null> {
	const declared = Number(res.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > max) {
		await res.body?.cancel();
		return null;
	}
	const reader = res.body?.getReader();
	if (!reader) return "";
	const parts: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > max) {
			await reader.cancel();
			return null;
		}
		parts.push(value);
	}
	return new TextDecoder().decode(Buffer.concat(parts));
}

export type IssuerTomlRead =
	| { kind: "read"; url: string; text: string }
	| { kind: "absent"; url: string }
	| { kind: "failed"; why: string };

/**
 * Read https://<host>/.well-known/stellar.toml for the issuer of record.
 * Stricter than the logo read (issuerToml), because this one becomes a legal
 * fact: a redirect is followed only over https on the same host (to another
 * host, or down to http, it is refused and never fetched), the body is capped
 * at 100 KB, and an HTML page is not a toml. `url` is the one actually read.
 * A 404 or 410 is a checked absence; any other answer that is not a toml body
 * is a failed read, which changes nothing stored.
 */
export async function readIssuerToml(host: string): Promise<IssuerTomlRead> {
	let url = `https://${host}/.well-known/stellar.toml`;
	for (let hop = 0; hop < 4; hop++) {
		let res: Response | null = null;
		let lastError = "";
		// A thrown fetch (DNS, TLS, timeout) is retried; an HTTP answer is not.
		for (let attempt = 0; attempt < 3 && !res; attempt++) {
			try {
				res = await fetch(url, {
					redirect: "manual",
					signal: AbortSignal.timeout(8000),
					headers: { "user-agent": "stellarlight-stablecoins" },
				});
			} catch (err) {
				lastError = String((err as Error).message).slice(0, 80);
				if (attempt < 2) await sleep(500 * 2 ** attempt);
			}
		}
		if (!res) return { kind: "failed", why: `${url}: ${lastError}` };
		if (res.status >= 300 && res.status < 400) {
			let next: URL | null = null;
			try {
				next = new URL(res.headers.get("location") ?? "", url);
			} catch {
				next = null;
			}
			if (
				!next ||
				!res.headers.get("location") ||
				next.protocol !== "https:" ||
				next.hostname.toLowerCase() !== host.toLowerCase()
			)
				return {
					kind: "failed",
					why: `${url} redirects to ${next?.href ?? "nowhere"}, off the home_domain over https; not followed`,
				};
			url = next.href;
			continue;
		}
		if (res.status === 404 || res.status === 410)
			return { kind: "absent", url };
		if (!res.ok) return { kind: "failed", why: `HTTP ${res.status} at ${url}` };
		const text = await cappedText(res, TOML_MAX_BYTES);
		if (text == null)
			return { kind: "failed", why: `${url} is larger than 100 KB` };
		if (text.trimStart().startsWith("<"))
			return { kind: "failed", why: `${url} served HTML, not a toml` };
		return { kind: "read", url, text };
	}
	return { kind: "failed", why: `${url}: too many redirects` };
}

/**
 * Read the issuer of record for one asset from the toml at the ISSUER
 * ACCOUNT's home_domain, as Horizon reports it. Never the registry's curated
 * `domain` (12 of 41 rows differ from the account's home_domain, 2026-11-04)
 * and never `company`. Never throws.
 */
export async function readIssuerOfRecord(
	asset: Pick<StablecoinAsset, "code" | "issuer">,
): Promise<IssuerOfRecordRead> {
	const at = () => new Date().toISOString();
	let home: unknown;
	try {
		const account = await fetchJson(`${HORIZON}/accounts/${asset.issuer}`, {
			retries: 2,
			timeoutMs: 6000,
		});
		if (!account)
			return {
				outcome: "not-named",
				at: at(),
				sourceUrl: null,
				why: "the issuer account is not on Horizon",
			};
		home = account.home_domain;
	} catch (err) {
		return {
			outcome: "could-not-read",
			why: `could not read the issuer account: ${String((err as Error).message).slice(0, 80)}`,
		};
	}
	if (!home)
		return {
			outcome: "not-named",
			at: at(),
			sourceUrl: null,
			why: "the issuer account sets no home_domain",
		};
	// The account holder sets home_domain; fetch it only as a plain host.
	if (typeof home !== "string" || !/^[a-z0-9.-]+$/i.test(home))
		return {
			outcome: "not-named",
			at: at(),
			sourceUrl: null,
			why: "the issuer account's home_domain is not a plain host name",
		};
	const read = await readIssuerToml(home);
	if (read.kind === "failed")
		return { outcome: "could-not-read", why: read.why };
	if (read.kind === "absent")
		return {
			outcome: "not-named",
			at: at(),
			sourceUrl: read.url,
			why: `the home_domain serves no stellar.toml (${read.url} answered not found)`,
		};
	const r = issuerOfRecordFromToml(read.text, asset.code, asset.issuer);
	if ("miss" in r)
		return {
			outcome: "not-named",
			at: at(),
			sourceUrl: read.url,
			why: r.miss,
		};
	return {
		outcome: "named",
		at: at(),
		sourceUrl: read.url,
		name: r.name,
		note: r.note,
	};
}

/** A stored field as an ISO string or null (Payload may hand back a Date). */
function storedText(v: unknown): string | null {
	if (typeof v === "string") return v;
	if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
	return null;
}

/**
 * The issuer-of-record fields the writer stores for one row, per outcome:
 * named writes the new read with its date; not-named writes a dated checked
 * absence (no name, the reason in the note), so a toml that stops listing the
 * account clears the name; could-not-read writes the stored check back whole,
 * its date unchanged, so a failed read never moves a date or clears a name.
 * Null until a first check; never derived from `company`.
 */
export function carryIssuerOfRecord(
	read: IssuerOfRecordRead,
	prev?: Record<string, unknown> | null,
): IssuerOfRecordFields {
	if (read.outcome === "named")
		return {
			issuerOfRecord: read.name,
			issuerOfRecordCheck: "named",
			issuerOfRecordSourceUrl: read.sourceUrl,
			issuerOfRecordAsOf: read.at,
			issuerOfRecordNote: read.note,
		};
	if (read.outcome === "not-named")
		return {
			issuerOfRecord: null,
			issuerOfRecordCheck: "not-named",
			issuerOfRecordSourceUrl: read.sourceUrl,
			issuerOfRecordAsOf: read.at,
			issuerOfRecordNote: read.why,
		};
	const check = prev?.issuerOfRecordCheck;
	return {
		issuerOfRecord: storedText(prev?.issuerOfRecord),
		issuerOfRecordCheck:
			check === "named" || check === "not-named" ? check : null,
		issuerOfRecordSourceUrl: storedText(prev?.issuerOfRecordSourceUrl),
		issuerOfRecordAsOf: storedText(prev?.issuerOfRecordAsOf),
		issuerOfRecordNote: storedText(prev?.issuerOfRecordNote),
	};
}

/**
 * The write switch for the issuer of record: on only when the environment
 * says STABLECOIN_ISSUER_OF_RECORD_WRITE=on (the refresh workflow passes the
 * repository variable of that name). Off, the run computes and prints the
 * planned values and writes none, so the first scheduled run after a merge
 * cannot put an unreviewed legal name into production.
 */
export function issuerOfRecordWriteOn(
	env: Record<string, string | undefined>,
): boolean {
	return env.STABLECOIN_ISSUER_OF_RECORD_WRITE === "on";
}

/** The issuer-of-record keys a run writes: none while the switch is off, so
 *  the stored fields are left exactly as they are. */
export function issuerOfRecordPatch(
	read: IssuerOfRecordRead,
	prev: Record<string, unknown> | null | undefined,
	writeOn: boolean,
): Partial<IssuerOfRecordFields> {
	return writeOn ? carryIssuerOfRecord(read, prev) : {};
}

/**
 * The snapshot measured nearest `targetMs`, among those within `slackMs` of
 * it; null when none is. The baseline for a period metric has to come from
 * that period: an older snapshot would stretch "24h" or "7d" across whatever
 * gap the series has.
 */
export function nearestSnapshot<T extends { measuredAt?: unknown }>(
	snaps: T[],
	targetMs: number,
	slackMs: number,
): T | null {
	let best: T | null = null;
	let bestGap = Number.POSITIVE_INFINITY;
	for (const s of snaps) {
		const t = Date.parse(String(s.measuredAt ?? ""));
		if (!Number.isFinite(t)) continue;
		const gap = Math.abs(t - targetMs);
		if (gap <= slackMs && gap < bestGap) {
			best = s;
			bestGap = gap;
		}
	}
	return best;
}

/**
 * Confirm a candidate logo URL actually serves an image before we store it.
 * sls: APS Money's own declared ORG_LOGO 404s — a broken image is worse than
 * the flag fallback it would replace, so nothing here gets stored unverified.
 * HEAD-only (no body fetched); any non-2xx, a non-image content-type, or a
 * network failure all count as "does not resolve" — fail closed on this
 * specific check, consistent with the pipeline failing OPEN overall (an
 * asset never disappears; this candidate logo just doesn't get used).
 */
async function urlResolves(url: string): Promise<boolean> {
	try {
		const res = await fetch(url, {
			method: "HEAD",
			signal: AbortSignal.timeout(6000),
		});
		return (
			res.ok && (res.headers.get("content-type") ?? "").startsWith("image/")
		);
	} catch {
		return false;
	}
}

/** Measure one asset. Never throws: a failure comes back as an unmeasured row. */
export async function measureStablecoin(
	asset: StablecoinAsset,
): Promise<MeasuredStablecoin> {
	const now = new Date().toISOString();
	// Read for every row, whatever happens to its metrics below: who issues
	// an asset does not depend on whether its supply could be measured.
	const issuerOfRecordRead = await readIssuerOfRecord(asset);
	const base = {
		issuerOfRecordRead,
		id: stablecoinId(asset),
		code: asset.code,
		issuer: asset.issuer,
		name: asset.name ?? asset.code,
		company: asset.company,
		domain: asset.domain,
		website: `https://${asset.domain}`,
		peg: asset.peg,
		country: PEG_COUNTRY[asset.peg] ?? "Global",
		assetType: asset.assetType ?? null,
		measuredAt: now,
		// A curated caveat straight from the operator's own words, e.g. "not a
		// stablecoin, not tradable" — overridden below by an urgent measurement
		// note (unmeasured / rate-limited / hand-checked), which a reader needs
		// to see first, but otherwise carried straight to the row.
		note: asset.note,
	};

	// Logo first — cheap, cached, and useful even on an unmeasured row.
	let logoUrl: string | null = null;
	let logoSource: MeasuredStablecoin["logoSource"] = "none";
	if (asset.useCountryFlag) {
		logoUrl = `flag:${asset.peg}`;
		logoSource = "country-flag";
	} else if (asset.preferFallbackLogo && asset.fallbackImageUrl) {
		// The issuer's own image is known not to load for readers (an IPFS
		// gateway URL); our copy is served and labelled as such.
		logoUrl = asset.fallbackImageUrl;
		logoSource = "fallback";
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
		} else {
			// Same toml, no per-currency image — try its org-level mark instead,
			// but only once it's confirmed to actually serve an image. APS
			// Money's own ORG_LOGO 404s, so this correctly leaves APSUSDM/
			// APSEURM on "none" (→ the flag fallback) rather than storing a
			// broken link.
			const orgLogo = toml ? orgLogoFromToml(toml, asset.domain) : null;
			if (orgLogo && (await urlResolves(orgLogo))) {
				logoUrl = orgLogo;
				logoSource = "toml-org";
			}
		}
	}

	// An asset carrying human-checked static figures reports them as such —
	// never dressed up as a live measurement.
	if (asset.hardcodedData) {
		const { price, basis: priceBasis } = await unitPriceUSD(asset);
		return {
			...base,
			supply: asset.hardcodedData.supply,
			priceUSD: price,
			priceBasis: price == null ? null : priceBasis,
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
					priceBasis: null,
					holders: null,
					volume24hUSD: null,
					paymentsCountLifetime: null,
					logoUrl,
					logoSource,
					basis: "unmeasured",
					note: "Not confirmed on Horizon at measurement time. This is a lookup failure, not a claim the asset was retired; the row stays so its absence is never read as delisting.",
				};
			}
		}

		const { supply, holders, paymentsCountLifetime } = await supplyAndHolders(
			asset.code,
			asset.issuer,
			asset.stellarExpertSuffix ?? "",
		);
		const {
			price,
			basis: priceBasis,
			note: priceNote,
		} = await unitPriceUSD(asset);
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
			priceBasis: price == null ? null : priceBasis,
			marketCapUSD: supply != null && price != null ? supply * price : null,
			holders,
			volume24hUSD: vol,
			paymentsCountLifetime,
			logoUrl,
			logoSource,
			basis: supply == null ? "unmeasured" : "live",
			// Urgent first: a missing supply outranks a fallen-back price, and
			// either outranks the curated caveat already on `base`.
			...(supply == null
				? {
						note: "Supply unavailable from Stellar Expert at measurement time.",
					}
				: priceNote
					? { note: priceNote }
					: {}),
		};
	} catch (err) {
		return {
			...base,
			supply: null,
			marketCapUSD: null,
			priceUSD: null,
			priceBasis: null,
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
