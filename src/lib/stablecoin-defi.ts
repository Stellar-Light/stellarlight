/**
 * DeFi context for one stablecoin: its Soroban asset contract, whether Blend
 * lists it, and how much AMM liquidity it has.
 *
 * Three sources with very different reliability, so each is reported
 * separately and an outage in one never blanks the others:
 *
 *   contract   derived locally from (code, issuer) — deterministic, no network
 *   blend      a committed pool registry — a link and a pool name, no fetch
 *   liquidity  Horizon's own liquidity-pool index — first-party and keyless,
 *              so it does not vanish the way a third-party pool index can
 *
 * `liquidity: null` therefore means NOT KNOWN, never "no liquidity". The
 * difference matters: telling someone an asset has no pools when the pool
 * index was simply unreachable is the same class of lie as a missing row
 * reading as a delisting.
 */

import { Asset, Networks } from "@stellar/stellar-sdk";

/**
 * The Stellar Asset Contract id for a classic asset. Deterministic — derived
 * from (code, issuer) and the network passphrase, so it needs no lookup and
 * is correct even for an asset nobody has wrapped yet.
 */
export function sacContractId(code: string, issuer: string): string | null {
	try {
		return new Asset(code, issuer).contractId(Networks.PUBLIC);
	} catch {
		return null;
	}
}

interface BlendPool {
	poolId: string;
	name: string;
	assets: Record<string, string>;
}

/**
 * Blend's mainnet pools and the asset contracts they list, carried over from
 * the explorer. Committed rather than discovered: it is a short, slow-moving
 * list, and a wrong "Blend supports this" is worse than a missing one.
 */
const BLEND_POOLS: BlendPool[] = [
	{
		poolId: "CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS",
		name: "YieldBlox Pool",
		assets: {
			USDC: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
			EURC: "CCLZD7VBOC2URNA27BVJPB35F2MHTFDWBMV3HP3EIJVLUXM3UJKZL3VV",
			PYUSD: "CCCRWH6Q3FNP3I2I57BDLM5AFAT7O6OF6GKQOC6SSJNDAVRZ57SPHGU2",
			USDGLO: "CB226ZOEYXTBPD3QEGABTJYSKZVBP2PASEISLG3SBMTN5CE4QZUVZ3CE",
		},
	},
];

export interface BlendListing {
	poolName: string;
	poolUrl: string;
	/** Percent, e.g. 4.31. Null = the pool state could not be read, NOT 0%. */
	supplyAPY: number | null;
	borrowAPY: number | null;
}

/** The pool that lists a ticker, plus that ticker's reserve contract. */
function poolFor(ticker: string) {
	for (const pool of BLEND_POOLS) {
		const assetId = pool.assets[ticker];
		if (assetId) return { pool, assetId };
	}
	return null;
}

/** Daily compounding, the convention Blend's own UI quotes. */
function aprToApy(apr: number): number {
	return (1 + apr / 365) ** 365 - 1;
}

/**
 * Blend's listing for a ticker, or null when no pool lists it.
 *
 * Reads live reserve state over Soroban RPC. The rates are the part that can
 * fail — an RPC hiccup leaves them null while the pool name and link still
 * render, because "Blend lists this asset" stays true regardless. A null rate
 * is never rendered as 0%: "we could not read the pool" and "this pool pays
 * nothing" are opposite claims.
 */
export async function blendListing(
	ticker: string,
): Promise<BlendListing | null> {
	const match = poolFor(ticker);
	if (!match) return null;
	const { pool, assetId } = match;

	const listing: BlendListing = {
		poolName: pool.name,
		poolUrl: `https://blend.xlm.sh/supply/?poolId=${pool.poolId}&assetId=${assetId}`,
		supplyAPY: null,
		borrowAPY: null,
	};

	try {
		const { PoolV2 } = await import("@blend-capital/blend-sdk");
		const loaded = await PoolV2.load(
			{
				rpc: "https://mainnet.sorobanrpc.com",
				passphrase: "Public Global Stellar Network ; September 2015",
				opts: undefined,
			},
			pool.poolId,
		);
		const reserve = loaded.reserves.get(assetId) as
			| {
					estSupplyApy?: number;
					estBorrowApy?: number;
					supplyApr?: number;
					borrowApr?: number;
			  }
			| undefined;
		if (!reserve) return listing;

		// The SDK exposes an estimated APY directly on newer pools; older ones
		// only carry an APR, which has to be compounded before it is an APY.
		if (reserve.estSupplyApy !== undefined)
			listing.supplyAPY = Number(reserve.estSupplyApy) * 100;
		else if (reserve.supplyApr !== undefined)
			listing.supplyAPY = aprToApy(Number(reserve.supplyApr)) * 100;

		if (reserve.estBorrowApy !== undefined)
			listing.borrowAPY = Number(reserve.estBorrowApy) * 100;
		else if (reserve.borrowApr !== undefined)
			listing.borrowAPY = aprToApy(Number(reserve.borrowApr)) * 100;

		// A NaN out of the SDK must not reach the wire looking like a rate.
		if (!Number.isFinite(listing.supplyAPY as number)) listing.supplyAPY = null;
		if (!Number.isFinite(listing.borrowAPY as number)) listing.borrowAPY = null;
	} catch {
		// Pool unreadable — the listing still stands, the rates stay null.
	}
	return listing;
}

export interface LiquiditySummary {
	/** Pools holding this asset. Capped — see `capped`. */
	poolCount: number;
	/** Units of THIS asset pooled across them (its own peg, not USD). */
	assetPooled: number;
	/** assetPooled × the asset's USD price. Null when we have no price. */
	assetPooledUSD: number | null;
	/** The largest pools, biggest asset-side first. */
	topPools: Array<{
		id: string;
		counterAsset: string;
		assetAmount: number;
		trustlines: number;
	}>;
	/** True when the asset is in more pools than one page could return. */
	capped: boolean;
}

const HORIZON = "https://horizon.stellar.org";

/** "CODE:ISSUER" → "CODE", and "native" → "XLM". */
function shortAsset(a: string): string {
	if (!a || a === "native") return "XLM";
	return a.split(":")[0];
}

/**
 * AMM liquidity from Horizon's own liquidity-pool index, filtered to pools
 * that hold this exact (code, issuer).
 *
 * WHAT THIS MEASURES, precisely: the amount of THIS asset sitting in Stellar
 * AMM pools, and that amount valued at this asset's own USD price. It is NOT
 * whole-pool TVL — the other side of each pool is some arbitrary token we
 * have no price for, and inventing one to double the figure would be a guess
 * presented as a measurement. Under-stating with a stated basis beats
 * over-stating with a hidden assumption.
 *
 * Horizon is first-party and keyless, so unlike a third-party pool index it
 * does not disappear. Null still means unreachable, never "no pools".
 */
export async function fetchLiquidity(
	code: string,
	issuer: string,
	priceUSD: number | null,
): Promise<LiquiditySummary | null> {
	const reserve = `${code}:${issuer}`;
	try {
		const res = await fetch(
			`${HORIZON}/liquidity_pools?reserves=${encodeURIComponent(reserve)}&limit=200`,
			{
				headers: { accept: "application/json" },
				signal: AbortSignal.timeout(12_000),
				next: { revalidate: 900 },
			},
		);
		if (!res.ok) return null;
		const body = await res.json();
		const records: Array<{
			id: string;
			total_trustlines?: string;
			reserves?: Array<{ asset: string; amount: string }>;
		}> = body?._embedded?.records ?? [];

		let assetPooled = 0;
		const pools: LiquiditySummary["topPools"] = [];
		for (const r of records) {
			const mine = r.reserves?.find((x) => x.asset === reserve);
			if (!mine) continue;
			const amount = Number.parseFloat(mine.amount);
			if (!Number.isFinite(amount)) continue;
			assetPooled += amount;
			const other = r.reserves?.find((x) => x.asset !== reserve);
			pools.push({
				id: r.id,
				counterAsset: shortAsset(other?.asset ?? ""),
				assetAmount: amount,
				trustlines: Number.parseInt(r.total_trustlines ?? "0", 10) || 0,
			});
		}
		pools.sort((a, b) => b.assetAmount - a.assetAmount);

		return {
			poolCount: pools.length,
			assetPooled,
			assetPooledUSD:
				priceUSD != null && Number.isFinite(priceUSD)
					? assetPooled * priceUSD
					: null,
			topPools: pools.slice(0, 5),
			capped: records.length >= 200,
		};
	} catch {
		return null;
	}
}

/** Where to go to trade or pool this asset. */
export function tradeLinks(code: string, issuer: string) {
	return [
		{
			name: "StellarX",
			url: `https://stellarx.com/amm/analytics/${code}-${issuer}`,
		},
		{
			name: "StellarTerm",
			url: `https://stellarterm.com/exchange/${code}-${issuer}/XLM-native`,
		},
		{ name: "Aqua", url: `https://aqua.network/pools?search=${code}` },
		{ name: "Soroswap", url: "https://app.soroswap.finance/pools" },
	];
}

/* ─── AMM venues (Soroban) ───────────────────────────────────────────────── */

export interface VenueLiquidity {
	name: "SDEX" | "Aquarius" | "Soroswap" | "Phoenix";
	/** Pools on this venue that hold the asset. */
	poolCount: number;
	/** How many of those we actually read reserves from. */
	measuredPools: number;
	/** Units of THIS asset across the measured pools (its own peg). */
	assetPooled: number;
	assetPooledUSD: number | null;
	/** Largest measured pool, by this asset's side. */
	largest: { counter: string; assetAmount: number } | null;
	url: string;
}

const XLM_SAC = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";
const SOROSWAP_FACTORY =
	"CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2";
const RPC_URL = "https://mainnet.sorobanrpc.com";
const SEVEN = 10_000_000;

/**
 * Read-only contract call via simulation. A random source account is fine —
 * nothing is signed or submitted, the RPC only needs a well-formed envelope.
 * Throws on a simulation error (e.g. a pair that does not exist), which
 * callers treat as "none", never as zero liquidity.
 */
async function simulateCall(
	contractId: string,
	fn: string,
	...args: unknown[]
) {
	const sdk = await import("@stellar/stellar-sdk");
	const server = new sdk.rpc.Server(RPC_URL);
	const src = new sdk.Account(sdk.Keypair.random().publicKey(), "0");
	const tx = new sdk.TransactionBuilder(src, {
		fee: sdk.BASE_FEE,
		networkPassphrase: sdk.Networks.PUBLIC,
	})
		.addOperation(new sdk.Contract(contractId).call(fn, ...(args as never[])))
		.setTimeout(30)
		.build();
	const sim = await server.simulateTransaction(tx);
	if (sdk.rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
	return sdk.scValToNative(sim.result?.retval as never) as unknown;
}

async function mapLimited<T, R>(
	items: T[],
	limit: number,
	fn: (t: T) => Promise<R>,
): Promise<R[]> {
	const out: R[] = [];
	let i = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (i < items.length) {
				const idx = i++;
				out[idx] = await fn(items[idx]);
			}
		}),
	);
	return out;
}

interface AquaPool {
	address: string;
	tokens_addresses: string[];
	tokens_str: string[];
	pool_type: string;
	total_volume: number;
}
let aquaCache: { at: number; pools: AquaPool[] } | null = null;

/**
 * Every Aquarius AMM pool.
 *
 * Their list API is hard-capped at TEN rows a page and offers no token
 * filter, so 337 pools is 34 requests. Walking `next` sequentially took ~40s
 * on a cold lambda and the DeFi panel simply never arrived. The first page
 * carries `count`, so every remaining page can be fetched at once.
 */
async function aquariusPools(): Promise<AquaPool[]> {
	if (aquaCache && Date.now() - aquaCache.at < 900_000) return aquaCache.pools;
	const base = "https://amm-api.aqua.network/api/external/v1/pools/";
	const head = await fetch(base, {
		headers: { "User-Agent": "stellar-light/1.0", accept: "application/json" },
		signal: AbortSignal.timeout(12_000),
	});
	if (!head.ok) return aquaCache?.pools ?? [];
	const first = (await head.json()) as { results?: AquaPool[]; count?: number };
	const pools = [...(first.results ?? [])];
	const per = first.results?.length || 10;
	const pages = Math.min(Math.ceil((first.count ?? per) / per), 60);
	const rest = await mapLimited(
		Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 2),
		8,
		async (page) => {
			try {
				const r = await fetch(`${base}?page=${page}`, {
					headers: {
						"User-Agent": "stellar-light/1.0",
						accept: "application/json",
					},
					signal: AbortSignal.timeout(12_000),
				});
				if (!r.ok) return [];
				return ((await r.json()) as { results?: AquaPool[] }).results ?? [];
			} catch {
				return [];
			}
		},
	);
	for (const r of rest) pools.push(...r);
	if (pools.length) aquaCache = { at: Date.now(), pools };
	return pools;
}

/* ─── Soroswap indexer (one call for every venue) ─────────────────────── */

interface SoroswapPool {
	protocol?: string;
	address?: string;
	tokenA?: string;
	tokenB?: string;
	reserveA?: string | number;
	reserveB?: string | number;
}

/**
 * Soroswap's indexer covers soroswap, phoenix, aqua AND sdex on mainnet in a
 * single authenticated call — strictly better than probing each venue, and
 * the only source that reaches Phoenix at all. Requires SOROSWAP_API_KEY;
 * without it (or if the account is not yet activated — their API answers 403
 * to every request until an admin enables it) we fall back to the per-venue
 * probes below, so the panel degrades rather than disappears.
 */
async function soroswapIndexer(): Promise<SoroswapPool[] | null> {
	const key = process.env.SOROSWAP_API_KEY?.trim();
	if (!key) return null;
	try {
		const qs = ["SOROSWAP", "PHOENIX", "AQUA", "SDEX"]
			.map((p) => `protocol=${p}`)
			.join("&");
		const r = await fetch(
			`https://api.soroswap.finance/pools?network=MAINNET&${qs}`,
			{
				headers: {
					Authorization: `Bearer ${key}`,
					accept: "application/json",
					"User-Agent": "stellar-light/1.0",
				},
				signal: AbortSignal.timeout(15_000),
			},
		);
		if (!r.ok) return null;
		const body = (await r.json()) as
			| SoroswapPool[]
			| { pools?: SoroswapPool[] };
		return Array.isArray(body) ? body : (body.pools ?? null);
	} catch {
		return null;
	}
}

/** Venue rows from the Soroswap indexer, when it is reachable. */
async function indexerVenues(
	code: string,
	issuer: string,
	priceUSD: number | null,
): Promise<VenueLiquidity[] | null> {
	const pools = await soroswapIndexer();
	const mine = sacContractId(code, issuer);
	if (!pools || !mine) return null;
	const byProto = new Map<
		string,
		{
			count: number;
			amount: number;
			largest: { counter: string; assetAmount: number } | null;
		}
	>();
	for (const p of pools) {
		const a = String(p.tokenA ?? ""),
			b = String(p.tokenB ?? "");
		if (a !== mine && b !== mine) continue;
		const amt = Number(a === mine ? p.reserveA : p.reserveB) / SEVEN;
		if (!Number.isFinite(amt)) continue;
		const name = (p.protocol ?? "unknown").toLowerCase();
		const row = byProto.get(name) ?? { count: 0, amount: 0, largest: null };
		row.count++;
		row.amount += amt;
		if (!row.largest || amt > row.largest.assetAmount)
			row.largest = {
				counter: (a === mine ? b : a).slice(0, 6),
				assetAmount: amt,
			};
		byProto.set(name, row);
	}
	if (!byProto.size) return null;
	const LABEL: Record<string, VenueLiquidity["name"]> = {
		soroswap: "Soroswap",
		aqua: "Aquarius",
		aquarius: "Aquarius",
		sdex: "SDEX",
		phoenix: "Phoenix",
	};
	const URLS: Record<string, string> = {
		Soroswap: "https://app.soroswap.finance/pools",
		Aquarius: `https://aqua.network/pools?search=${encodeURIComponent(code)}`,
		SDEX: `https://stellar.expert/explorer/public/asset/${code}-${issuer}`,
		Phoenix: "https://app.phoenix-hub.io/pools",
	};
	const out: VenueLiquidity[] = [];
	for (const [proto, r] of byProto) {
		const name = LABEL[proto] ?? (proto as VenueLiquidity["name"]);
		out.push({
			name,
			poolCount: r.count,
			measuredPools: r.count,
			assetPooled: r.amount,
			assetPooledUSD: priceUSD != null ? r.amount * priceUSD : null,
			largest: r.largest,
			url: URLS[name] ?? "https://app.soroswap.finance/pools",
		});
	}
	return out.sort((a, b) => b.assetPooled - a.assetPooled);
}

function shortToken(t: string): string {
	if (!t || t === "native") return "XLM";
	return t.split(":")[0];
}

/** Aquarius: pools holding the asset from its index; reserves read on-chain
 * for the busiest eight so a 44-pool asset does not cost 44 RPC calls. */
async function aquariusLiquidity(
	code: string,
	issuer: string,
	priceUSD: number | null,
): Promise<VenueLiquidity | null> {
	try {
		const key = `${code}:${issuer}`;
		const mine = (await aquariusPools()).filter((p) =>
			p.tokens_str.includes(key),
		);
		const top = [...mine]
			.sort((a, b) => (b.total_volume ?? 0) - (a.total_volume ?? 0))
			.slice(0, 8);
		const reads = await mapLimited(top, 4, async (p) => {
			try {
				const reserves = (await simulateCall(
					p.address,
					"get_reserves",
				)) as Array<bigint | number>;
				const idx = p.tokens_str.indexOf(key);
				const amt = Number(reserves[idx] ?? 0) / SEVEN;
				const counter = p.tokens_str.find((t) => t !== key) ?? "";
				return { amt, counter: shortToken(counter) };
			} catch {
				return null;
			}
		});
		const ok = reads.filter(
			(r): r is { amt: number; counter: string } =>
				!!r && Number.isFinite(r.amt),
		);
		const assetPooled = ok.reduce((s, r) => s + r.amt, 0);
		const largest = ok.sort((a, b) => b.amt - a.amt)[0];
		return {
			name: "Aquarius",
			poolCount: mine.length,
			measuredPools: ok.length,
			assetPooled,
			assetPooledUSD: priceUSD != null ? assetPooled * priceUSD : null,
			largest: largest
				? { counter: largest.counter, assetAmount: largest.amt }
				: null,
			url: `https://aqua.network/pools?search=${encodeURIComponent(code)}`,
		};
	} catch {
		return null;
	}
}

/** Soroswap has no open pool index, but its factory is readable: ask it for
 * a pair against XLM and every other asset in our registry, then read the
 * reserves of each pair that exists. */
async function soroswapLiquidity(
	code: string,
	issuer: string,
	priceUSD: number | null,
): Promise<VenueLiquidity | null> {
	const mine = sacContractId(code, issuer);
	if (!mine) return null;
	try {
		const sdk = await import("@stellar/stellar-sdk");
		const counters: Array<{ label: string; id: string }> = [
			{ label: "XLM", id: XLM_SAC },
		];
		// ponytail: counters limited to XLM until the registry exports its
		// asset list; add the stablecoin cross-pairs when it does.
		const pairs = await mapLimited(counters, 4, async (c) => {
			try {
				const pair = (await simulateCall(
					SOROSWAP_FACTORY,
					"get_pair",
					new sdk.Address(mine).toScVal(),
					new sdk.Address(c.id).toScVal(),
				)) as string;
				if (!pair) return null;
				const [t0, reserves] = await Promise.all([
					simulateCall(pair, "token_0") as Promise<string>,
					simulateCall(pair, "get_reserves") as Promise<Array<bigint | number>>,
				]);
				const amt = Number(reserves[t0 === mine ? 0 : 1] ?? 0) / SEVEN;
				return { amt, counter: c.label };
			} catch {
				return null;
			}
		});
		const ok = pairs.filter(
			(r): r is { amt: number; counter: string } =>
				!!r && Number.isFinite(r.amt) && r.amt > 0,
		);
		const assetPooled = ok.reduce((s, r) => s + r.amt, 0);
		const largest = [...ok].sort((a, b) => b.amt - a.amt)[0];
		return {
			name: "Soroswap",
			poolCount: ok.length,
			measuredPools: ok.length,
			assetPooled,
			assetPooledUSD: priceUSD != null ? assetPooled * priceUSD : null,
			largest: largest
				? { counter: largest.counter, assetAmount: largest.amt }
				: null,
			url: "https://app.soroswap.finance/pools",
		};
	} catch {
		return null;
	}
}

/**
 * Per-venue liquidity for the asset: SDEX (Horizon), Aquarius (index + RPC),
 * Soroswap (factory + RPC). Same measurement rule as fetchLiquidity — the
 * asset's OWN side of each pool, valued at its own price; never whole-pool
 * TVL. A venue that could not be read is omitted and named in `unreadable`,
 * never shown as zero. Phoenix and Sushi have no readable index yet and are
 * named in `notIndexed` so their absence is not mistaken for absence of pools.
 */
export async function fetchVenues(
	code: string,
	issuer: string,
	priceUSD: number | null,
): Promise<{
	venues: VenueLiquidity[];
	unreadable: string[];
	notIndexed: string[];
}> {
	// One authenticated call covers every venue including Phoenix. Only when
	// that is unavailable do we fan out to the per-venue probes.
	const indexed = await indexerVenues(code, issuer, priceUSD);
	if (indexed) return { venues: indexed, unreadable: [], notIndexed: [] };

	const [sdex, aqua, soro] = await Promise.all([
		fetchLiquidity(code, issuer, priceUSD),
		aquariusLiquidity(code, issuer, priceUSD),
		soroswapLiquidity(code, issuer, priceUSD),
	]);
	const venues: VenueLiquidity[] = [];
	const unreadable: string[] = [];
	if (sdex) {
		const largest = sdex.topPools[0];
		venues.push({
			name: "SDEX",
			poolCount: sdex.poolCount,
			measuredPools: sdex.poolCount,
			assetPooled: sdex.assetPooled,
			assetPooledUSD: sdex.assetPooledUSD,
			largest: largest
				? { counter: largest.counterAsset, assetAmount: largest.assetAmount }
				: null,
			url: `https://stellar.expert/explorer/public/asset/${code}-${issuer}`,
		});
	} else unreadable.push("SDEX");
	if (aqua) venues.push(aqua);
	else unreadable.push("Aquarius");
	if (soro) venues.push(soro);
	else unreadable.push("Soroswap");
	venues.sort((a, b) => b.assetPooled - a.assetPooled);
	return { venues, unreadable, notIndexed: ["Phoenix", "Sushi"] };
}
