/**
 * Token integrations: which projects support each token on Stellar, how
 * (tier and kind), since when. One token-integrations row per (token, kind,
 * venue, project); the pure rules are in src/lib/token-integrations.ts.
 *
 *   pnpm exec tsx scripts/refresh-token-integrations.ts                 # dry run: the planned DB diff
 *   pnpm exec tsx scripts/refresh-token-integrations.ts --execute       # write, then read every row back
 *   pnpm exec tsx scripts/refresh-token-integrations.ts --replan        # re-plan from this run's cache, no network
 *   pnpm exec tsx scripts/refresh-token-integrations.ts --offline       # no store at all: plan against an empty one
 *   ... --tokens CCNOV6...,USDC:GA5Z...   only these tokens (every read still runs, scoped to them)
 *
 * Free sources only, read only, one generic User-Agent, paced per host:
 *   Stellar Index (api.stellarindex.io)  the protocol registry (every pool,
 *       vault and reserve of the AMMs, lending, vault, bridge and oracle
 *       protocols it indexes), contract events, prices, ledger close times,
 *       pool reserves, the public directory labels. It asks for a link when
 *       shown publicly; the API's meta names it.
 *   Soroban RPC  getLedgerEntries (contract instances, token balances) and
 *       read-only simulation of view functions; nothing is signed or sent.
 *   Horizon  classic AMM pools and their operations, asset contract counts,
 *       the balances and operations of the on-chain map's accounts.
 *   Aquarius's public pools API (rewards config), the SEP-42 list catalog
 *       and its lists, anchors' own stellar.toml files.
 *   Stellar Light's public API  projects (to tie a publisher or a labelled
 *       contract to a directory row by its website domain, and the on-chain
 *       map's accounts on each row), anchors, stablecoins, the verified
 *       contracts list with the on-chain map's attribution of each contract.
 * stellar.expert is never called (paywalled).
 *
 * Removal is explicit: a stored row this run does not produce is ended (kept,
 * dated, with the reason), and only when the read that produced it finished
 * this run; could-not-check never ends a row, and never replaces a stored
 * judged tier: a row this run reads unrated or lower only because a price,
 * a balance or an activity read could not be taken keeps its stored reading,
 * its basis marked "not refreshed <date>: why" (the plan lists it under
 * keep). A price Stellar Index withholds (price_withheld_reason) is such a
 * read; a token it has no price for at all is not. Every read is taken once
 * per run and its answer, could-not-check included, cached for the run, as
 * is what the store adds to the holder sweep; so --replan re-plans the same
 * reads against the store and must plan 0 writes after an execute.
 *
 * Exit 2: an instrument failure (the registry, the directory or the rewards
 * config could not be read): nothing written. Exit 1: a write failed or did
 * not read back as sent.
 */
// First import, hoisted: scripts/load-env must evaluate before anything that
// can reach payload.config, which is imported lazily below.
import "./load-env";
import { createHash } from "node:crypto";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Address, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import onchainMap from "../src/data/onchain-map.json";
import { RWA_REGISTRY } from "../src/data/rwa-registry";
import {
	instanceKey,
	type LedgerEntry,
	MAINNET_RPC,
	readLedgerEntries,
} from "../src/lib/contract-ownership";
import { attributionsOf } from "../src/lib/contracts-registry";
import { HORIZON } from "../src/lib/horizon-supply";
import { STELLAR_INDEX as SI } from "../src/lib/onchain-sources";
import { stellarOracleRpc } from "../src/lib/oracle-observe";
import { sacContractId } from "../src/lib/stablecoin-defi";
import {
	accountHoldings,
	addDecimals,
	aggregate,
	type Edge,
	edgeUnread,
	holderTier,
	type IntegrationRow,
	type Kind,
	mapEvidence,
	parseTokenParam,
	plannedWrites,
	planWrites,
	poolDepth,
	poolEdgeTier,
	priorHolderContracts,
	ROW_FIELDS,
	type RunCache,
	readOnce,
	registryTokenId,
	rowKey,
	type StoredRow,
	summarize,
	TIER_RANK,
	type Tier,
	type TokenIdentity,
	XLM_SAC,
} from "../src/lib/token-integrations";
import { formatMismatches, verifyWrites } from "../src/lib/utils/read-back";
import { exitAfterFlush } from "./lib/exit-after-flush";

const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const opt = (f: string) => {
	const i = argv.indexOf(f);
	return i >= 0 ? argv[i + 1] : undefined;
};
const EXECUTE = flag("--execute");
const REPLAN = flag("--replan");
const OFFLINE = flag("--offline");
const CACHE = opt("--cache") ?? join(tmpdir(), "token-integrations-cache");
const SL = "https://stellarlight.xyz/api";
const UA = "Mozilla/5.0";
const CRE = /^C[A-Z2-7]{55}$/;
const USDC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";

/** Stellar Index protocols this layer reads, by kind. A protocol the index
 * adds later is listed as not read until it is mapped here. */
const PROTOCOL_KIND: Record<string, Kind> = {
	soroswap: "dex_pool",
	aquarius: "dex_pool",
	phoenix: "dex_pool",
	comet: "dex_pool",
	sushiswap_v3: "dex_pool",
	blend: "lending_reserve",
	blnt: "lending_reserve",
	defindex: "vault",
	upshift: "vault",
	spectra: "vault",
	cctp: "bridge",
	rozo: "bridge",
	"reflector-dex": "oracle_feed",
	"reflector-cex": "oracle_feed",
	"reflector-fx": "oracle_feed",
};
/** Protocol name to directory slug, each confirmed against the directory at
 * run time. SushiSwap's row is Sushi (sushi.com); BLNT has no row. */
const PROTOCOL_SLUG: Record<string, string | null> = {
	soroswap: "soroswap",
	aquarius: "aquarius",
	phoenix: "phoenix",
	comet: "comet",
	sushiswap_v3: "sushi",
	blend: "blend",
	blnt: null,
	defindex: "defindex",
	upshift: "upshift",
	spectra: "spectra-finance",
	cctp: "circle-cctp-cross-chain-transfer-protocol",
	rozo: "rozo",
	"reflector-dex": "reflector",
	"reflector-cex": "reflector",
	"reflector-fx": "reflector",
};
const PHX_FACTORY = "CB4SVAWJA6TSRNOJZ7W2AWFW46D5VR4ZMFZKDIKXEINZCZEGZCJZCKMI";
const CCTP_TMM = "CAE2G5Z77UP7GYPYGFOWFGW7C7J6I4YP2AFGSADRKQY62SYUFLPNFTXL";
/** App domains whose stellar.toml is checked for SEP-42 ASSET_LISTS. */
const APP_DOMAINS = [
	"lobstr.co",
	"soroswap.finance",
	"aqua.network",
	"blend.capital",
	"phoenix-hub.io",
	"defindex.io",
	"xbull.app",
	"stellarx.com",
	"sushi.com",
	"hana.network",
	"upshift.finance",
	"spectra.finance",
	"rozo.ai",
	"stellarterm.com",
	"freighter.app",
	"beansapp.com",
	"vibrantapp.com",
	"stellar.org",
	"fxdao.io",
	"orbitcdp.finance",
	"ultrastellar.com",
];
/** A token whose whole event history fits in this many active ledgers is
 * swept whole for holders; larger histories use the candidate set. */
const SWEEP_LEDGERS = 20_000;
const MAX_PAGES = 200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const obj = (v: unknown): Record<string, unknown> =>
	v && typeof v === "object" && !Array.isArray(v)
		? (v as Record<string, unknown>)
		: {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null =>
	typeof v === "string" && v ? v : null;
const json = (v: unknown) =>
	JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));

// ── run clock and cache ────────────────────────────────────────────────────
// A fresh run clears the cache; --replan (and --resume, for a long local run
// that died) reuse it, so the second pass sees exactly the first one's reads.
const RUN_FILE = join(CACHE, "run.json");
if (!REPLAN && !flag("--resume") && existsSync(CACHE))
	rmSync(CACHE, { recursive: true, force: true });
mkdirSync(CACHE, { recursive: true });
if (REPLAN && !existsSync(RUN_FILE)) {
	console.error(`--replan needs this run's cache at ${CACHE}; none found.`);
	process.exit(2);
}
const RUN = existsSync(RUN_FILE)
	? (JSON.parse(readFileSync(RUN_FILE, "utf8")) as { at: string })
	: { at: new Date().toISOString().replace(/\.\d+Z$/, "Z") };
writeFileSync(RUN_FILE, JSON.stringify(RUN));
const RUN_AT = RUN.at;
const CUT = new Date(Date.parse(RUN_AT) - 90 * 86_400_000)
	.toISOString()
	.replace(/\.\d+Z$/, "Z");

const cacheFile = (kind: string, key: string) =>
	join(
		CACHE,
		kind,
		`${createHash("sha1").update(key).digest("hex").slice(0, 24)}.json`,
	);
function cached<T>(kind: string, key: string): T | undefined {
	const f = cacheFile(kind, key);
	return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as T) : undefined;
}
function store(kind: string, key: string, v: unknown) {
	const f = cacheFile(kind, key);
	mkdirSync(dirname(f), { recursive: true });
	writeFileSync(f, json(v));
}
const RUN_CACHE: RunCache = { get: cached, set: store };

const nextSlot = new Map<string, number>();
const PACE: Record<string, number> = {
	"api.stellarindex.io": 70,
	"horizon.stellar.org": 150,
	"stellarlight.xyz": 250,
	rpc: 120,
};
async function pace(host: string) {
	const now = Date.now();
	const at = Math.max(now, nextSlot.get(host) ?? 0);
	nextSlot.set(host, at + (PACE[host] ?? 200));
	if (at > now) await sleep(at - now);
}

interface Got {
	status: number | null;
	data: unknown;
	readAt: string;
}
/** GET JSON (or text), read once per run (readOnce): 404 is a checked empty;
 * anything but 2xx and 404 is could-not-check (status null or the code),
 * retried by a later run, never by this one or its --replan. */
async function get(url: string, text = false): Promise<Got> {
	if (url.includes("stellar.expert"))
		throw new Error("stellar.expert is paywalled and never called");
	return readOnce(RUN_CACHE, "http", url, REPLAN, () => fetchGot(url, text), {
		status: null,
		data: null,
		readAt: RUN_AT,
	});
}
async function fetchGot(url: string, text: boolean): Promise<Got> {
	const host = new URL(url).host;
	let silent = 0;
	for (let a = 0; a < 6; a++) {
		await pace(host);
		try {
			const r = await fetch(url, {
				headers: { "user-agent": UA, accept: "*/*" },
				signal: AbortSignal.timeout(60_000),
			});
			if (r.status === 429) {
				await sleep((Number(r.headers.get("retry-after")) || 5) * 1000 + 500);
				continue;
			}
			if (r.status >= 500) {
				await sleep(3000 * (a + 1));
				continue;
			}
			const body = await r.text();
			const readAt = new Date().toISOString();
			if (r.status === 404) return { status: 404, data: null, readAt };
			if (!r.ok) return { status: r.status, data: null, readAt };
			let data: unknown = body;
			if (!text) {
				try {
					data = JSON.parse(body);
				} catch {
					return { status: null, data: null, readAt };
				}
			}
			return { status: r.status, data, readAt };
		} catch {
			// a host that does not answer at all (a dead toml domain) is
			// could-not-check after three tries, not six minutes of them
			if (++silent >= 3) break;
			await sleep(2000 * (a + 1));
		}
	}
	return { status: null, data: null, readAt: new Date().toISOString() };
}
/** Stellar Index: the answer's `data`, or null when it could not be read. */
async function si(path: string) {
	const r = await get(SI + path);
	return {
		status: r.status,
		ok: r.status === 200,
		data: r.status === 200 ? obj(obj(r.data).data) : null,
		readAt: r.readAt,
	};
}

/** getLedgerEntries over up to 200 keys, read once per run; null = could
 * not read. */
async function entries(
	keys: string[],
): Promise<Map<string, LedgerEntry> | null> {
	const hit = await readOnce<Array<[string, LedgerEntry]> | null>(
		RUN_CACHE,
		"rpc",
		`entries:${keys.join(",")}`,
		REPLAN,
		async () => {
			for (let a = 0; a < 4; a++) {
				await pace("rpc");
				const m = await readLedgerEntries(keys);
				if (m) return [...m];
				await sleep(2000 * (a + 1));
			}
			return null;
		},
		null,
	);
	return hit && new Map(hit);
}
async function entriesChunked(keys: string[]) {
	const out = new Map<string, LedgerEntry>();
	const failed: string[] = [];
	for (let i = 0; i < keys.length; i += 200) {
		const chunk = keys.slice(i, i + 200);
		const m = await entries(chunk);
		if (!m) failed.push(...chunk);
		else for (const [k, v] of m) out.set(k, v);
	}
	return { found: out, failed: new Set(failed) };
}

const RPC = stellarOracleRpc();
type Sim = { ok: true; value: unknown } | { ok: false; error: string } | null;
/** A read-only simulation, read once per run; an error the contract returns
 * is an answer, a call that could not run is null (could-not-check). */
async function simulate(
	contract: string,
	fn: string,
	args: xdr.ScVal[] = [],
): Promise<Sim> {
	const h = await readOnce<{
		ok: boolean;
		xdr?: string;
		error?: string;
	} | null>(
		RUN_CACHE,
		"sim",
		`${contract}|${fn}|${args.map((a) => a.toXDR("base64")).join(",")}`,
		REPLAN,
		async () => {
			try {
				await pace("rpc");
				const o = await RPC.call("mainnet", contract, fn, args);
				return o.ok
					? { ok: true, xdr: o.value.toXDR("base64") }
					: { ok: false, error: o.error.slice(0, 200) };
			} catch {
				return null;
			}
		},
		null,
	);
	if (!h) return null;
	return h.ok && h.xdr
		? { ok: true, value: scValToNative(xdr.ScVal.fromXDR(h.xdr, "base64")) }
		: { ok: false, error: h.error ?? "error" };
}
const addr = (a: string) => new Address(a).toScVal();

function native(v: xdr.ScVal): unknown {
	try {
		return scValToNative(v);
	} catch {
		return v.toXDR("base64");
	}
}
interface Instance {
	sac: boolean;
	wasm: string | null;
	storage: Map<string, unknown>;
}
function decodeInstance(e: LedgerEntry): Instance {
	const inst = xdr.LedgerEntryData.fromXDR(e.xdr, "base64")
		.contractData()
		.val()
		.instance();
	const ex = inst.executable();
	const sac = ex.switch().name === "contractExecutableStellarAsset";
	const storage = new Map<string, unknown>();
	for (const m of inst.storage() ?? []) {
		const k = native(m.key());
		const name =
			typeof k === "string"
				? k
				: Array.isArray(k) && k.length === 1
					? String(k[0])
					: json(k);
		storage.set(name, native(m.val()));
	}
	return { sac, wasm: sac ? null : ex.wasmHash().toString("hex"), storage };
}
/** Contract instances by id; an id absent from `found` has no instance;
 * ids in `failed` could not be read. */
async function instances(ids: string[]) {
	const keyOf = new Map(ids.map((id) => [instanceKey(id), id]));
	const r = await entriesChunked([...keyOf.keys()]);
	const found = new Map<string, Instance>();
	for (const [k, e] of r.found) {
		const id = keyOf.get(k);
		if (id) found.set(id, decodeInstance(e));
	}
	return {
		found,
		failed: new Set([...r.failed].map((k) => keyOf.get(k) as string)),
	};
}
const dataKey = (contract: string, key: xdr.ScVal) =>
	xdr.LedgerKey.contractData(
		new xdr.LedgerKeyContractData({
			contract: new Address(contract).toScAddress(),
			key,
			durability: xdr.ContractDataDurability.persistent(),
		}),
	).toXDR("base64");
const balanceKey = (token: string, holder: string) =>
	dataKey(
		token,
		xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Balance"), addr(holder)]),
	);
function entryValue(e: LedgerEntry): unknown {
	return native(
		xdr.LedgerEntryData.fromXDR(e.xdr, "base64").contractData().val(),
	);
}
/** Token balances held at the SAC layout key [Balance, holder]; a custom
 * token found there is confirmed by its own balance(). */
async function balances(pairs: Array<[string, string]>) {
	const keyOf = new Map(
		pairs.map(([t, h]) => [balanceKey(t, h), [t, h] as const]),
	);
	const r = await entriesChunked([...keyOf.keys()]);
	const out = new Map<string, { raw: string; liveUntil: number | null }>();
	for (const [k, e] of r.found) {
		const p = keyOf.get(k);
		if (!p) continue;
		const v = entryValue(e);
		const amount =
			v && typeof v === "object" && "amount" in v
				? (v as { amount: unknown }).amount
				: v;
		out.set(`${p[0]}|${p[1]}`, {
			raw: String(amount),
			liveUntil: e.liveUntilLedgerSeq ?? null,
		});
	}
	const failed = new Set(
		[...r.failed].map((k) => {
			const p = keyOf.get(k);
			return p ? `${p[0]}|${p[1]}` : k;
		}),
	);
	return { out, failed };
}

/** Tokens whose price this run could not take: Stellar Index withheld it or
 * could not answer. A token it has no price for at all is not here. */
const unreadPrice = new Map<string, string>();
/** One leg of an edge, as edgeUnread reads it. */
const leg = (token: string | null, code: string, balance: string | null) => ({
	code,
	balance,
	priceUnread: (token && unreadPrice.get(token)) || null,
});

const toDecimal = (raw: string, decimals: number) => {
	const neg = raw.startsWith("-");
	const s = (neg ? raw.slice(1) : raw).padStart(decimals + 1, "0");
	const out = decimals ? `${s.slice(0, -decimals)}.${s.slice(-decimals)}` : s;
	return (neg ? "-" : "") + (decimals ? out.replace(/\.?0+$/, "") : out);
};
const usdOf = (balance: string | null, price: number | undefined) =>
	balance === null || price === undefined
		? null
		: Math.round(Number(balance) * price * 100) / 100;
const domainOf = (u: string | null | undefined) => {
	if (!u) return "";
	try {
		return new URL(u.includes("//") ? u : `https://${u}`).hostname
			.toLowerCase()
			.replace(/^www\./, "");
	} catch {
		return "";
	}
};
async function pmap<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>) {
	const out: R[] = new Array(items.length);
	let i = 0;
	await Promise.all(
		Array.from({ length: Math.min(n, items.length) }, async () => {
			while (i < items.length) {
				const k = i++;
				out[k] = await fn(items[k]);
			}
		}),
	);
	return out;
}

// ── directory (Stellar Light's public API) ─────────────────────────────────
class InstrumentFailure extends Error {}
interface DirProject {
	slug: string;
	name: string;
	website: string;
	github: string;
	/** The served on-chain block (its map links), or null. */
	onchain: unknown;
}
async function searchProjects(q: string): Promise<DirProject[]> {
	const r = await get(
		`${SL}/projects/search?q=${encodeURIComponent(q)}&limit=10`,
	);
	if (r.status !== 200)
		throw new InstrumentFailure(
			`directory search q=${q} could not be read (http ${r.status})`,
		);
	return arr(obj(r.data).projects).map((p) => {
		const o = obj(p);
		const links = obj(o.links);
		return {
			slug: String(o.slug),
			name: String(o.name ?? ""),
			website: String(links.website ?? ""),
			github: String(links.github ?? ""),
			onchain: o.onchain ?? null,
		};
	});
}
const slugCache = new Map<string, DirProject | null>();
async function projectBySlug(slug: string) {
	if (!slugCache.has(slug))
		slugCache.set(
			slug,
			(await searchProjects(slug)).find((p) => p.slug === slug) ?? null,
		);
	return slugCache.get(slug) ?? null;
}
/** A directory row for a publisher or a labelled contract, only when its
 * website domain (or GitHub org) equals the publisher's: a name alone joins
 * nothing. */
async function projectByDomain(name: string, domain: string, ghOrg = "") {
	const tries = [name, domain.split(".").slice(-2, -1)[0] ?? ""].filter(
		Boolean,
	);
	for (const q of [...new Set(tries)]) {
		for (const p of await searchProjects(q)) {
			if (domain && domainOf(p.website) === domain)
				return {
					slug: p.slug,
					basis: `website domain ${domain} matches directory row ${p.slug}`,
				};
			if (
				ghOrg &&
				p.github
					.replace(/\/+$/, "")
					.toLowerCase()
					.endsWith(`/${ghOrg.toLowerCase()}`)
			)
				return {
					slug: p.slug,
					basis: `GitHub org ${ghOrg} matches directory row ${p.slug}`,
				};
		}
	}
	return {
		slug: null,
		basis: `no directory row with domain ${domain || "?"} found (searched ${tries.join(", ")})`,
	};
}
async function slPaged(path: string, key: string) {
	const out: Record<string, unknown>[] = [];
	for (let off = 0; ; off += 100) {
		const r = await get(
			`${SL}${path}${path.includes("?") ? "&" : "?"}limit=100&offset=${off}`,
		);
		if (r.status !== 200)
			throw new InstrumentFailure(
				`${path} could not be read (http ${r.status})`,
			);
		const rows = arr(obj(r.data)[key]).map(obj);
		out.push(...rows);
		if (rows.length < 100) return out;
	}
}

interface Store {
	find: (a: unknown) => Promise<{ docs: unknown[] }>;
	create: (a: unknown) => Promise<unknown>;
	update: (a: unknown) => Promise<unknown>;
}
/** The stored rows (every row-owned field), or none under --offline. */
async function readStore(): Promise<{
	payload: Store | null;
	stored: StoredRow[];
}> {
	if (OFFLINE) return { payload: null, stored: [] };
	const { getPayloadOrInconclusive } = await import("./lib/payload-connect");
	const config = (await import("../src/payload.config")).default;
	const payload: Store = await getPayloadOrInconclusive(await config);
	const res = await payload.find({
		collection: "token-integrations",
		limit: 0,
		pagination: false,
		depth: 0,
		select: Object.fromEntries(ROW_FIELDS.map((f) => [f, true])),
	});
	return { payload, stored: res.docs as StoredRow[] };
}

// ── TOML (just the parts read here) ────────────────────────────────────────
function tomlCurrencies(text: string) {
	return text
		.split(/^\s*\[\[\s*CURRENCIES\s*\]\]\s*$/m)
		.slice(1)
		.map((block) => {
			const body = block.split(/^\s*\[/m)[0];
			const kv = Object.fromEntries(
				[...body.matchAll(/^\s*([A-Za-z_]+)\s*=\s*"([^"]*)"/gm)].map((m) => [
					m[1],
					m[2],
				]),
			);
			return {
				code: kv.code ?? "",
				issuer: kv.issuer ?? "",
				contract: kv.contract ?? "",
			};
		});
}
function tomlAssetLists(text: string) {
	const m = /^\s*ASSET_LISTS\s*=\s*\[([\s\S]*?)\]/m.exec(text);
	return m ? [...m[1].matchAll(/"(https?:\/\/[^"]+)"/g)].map((x) => x[1]) : [];
}

// ── the run ────────────────────────────────────────────────────────────────
interface Raw {
	token: string;
	kind: Kind;
	venue: string;
	role: string;
	pool: string;
	method: string;
	readAt: string;
	source: string;
	projectSlug: string | null;
	attributionBasis: string;
	evidenceUrl: string;
	/** CODE:ISSUER where the source names the classic asset. */
	asset?: string;
}

async function main() {
	const mode = OFFLINE
		? "OFFLINE (no store)"
		: REPLAN
			? "REPLAN (cache only, no writes)"
			: EXECUTE
				? "EXECUTE"
				: "DRY RUN (no writes)";
	let subset: Set<string> | null = null;
	if (opt("--tokens")) {
		subset = new Set();
		for (const t of (opt("--tokens") ?? "").split(",")) {
			const p = parseTokenParam(t);
			if (p.type !== "id")
				throw new Error(
					`--tokens takes contract ids or CODE:ISSUER, not '${t}'`,
				);
			subset.add(p.tokenId);
		}
	}
	console.log(
		`token integrations, ${mode}, run at ${RUN_AT}, window from ${CUT}${subset ? `, tokens ${[...subset].join(",")}` : ""}\ncache ${CACHE}\n`,
	);
	const inScope = (t: string) => !subset || subset.has(t);
	const checked = new Set<string>(); // sources read completely this run
	const notes: string[] = [];

	// 1. protocol registry (Stellar Index) + the reads it leaves to the chain
	const plist = await si("/protocols");
	if (!plist.ok)
		throw new InstrumentFailure("Stellar Index /protocols could not be read");
	const protocols = arr(plist.data?.protocols).map(obj);
	const reg = new Map<
		string,
		{ category: string; contracts: Record<string, unknown>[]; readAt: string }
	>();
	for (const p of protocols) {
		const name = String(p.name);
		if (!PROTOCOL_KIND[name]) {
			if (Number(p.contract_count) > 0)
				notes.push(
					`protocol ${name} (${p.contract_count} contracts) is not mapped to a kind: not read`,
				);
			continue;
		}
		const d = await si(`/protocols/${name}`);
		if (!d.ok) {
			notes.push(`registry:${name} could not be read`);
			continue;
		}
		reg.set(name, {
			category: String(d.data?.category ?? ""),
			contracts: arr(d.data?.contracts).map(obj),
			readAt: d.readAt,
		});
	}
	const raws: Raw[] = [];
	const failedProto = new Set<string>();
	const add = (
		proto: string,
		role: string,
		pool: string,
		token: unknown,
		method: string,
		readAt: string,
	) => {
		if (typeof token !== "string" || !CRE.test(token)) return;
		raws.push({
			token,
			kind: PROTOCOL_KIND[proto],
			venue: proto,
			role,
			pool,
			method,
			readAt,
			source: `registry:${proto}`,
			projectSlug: null,
			attributionBasis: "",
			evidenceUrl: `${SI}/contracts/${pool}`,
		});
	};
	for (const [name, r] of reg)
		if (name !== "phoenix")
			// every Phoenix pool comes from its factory below
			for (const c of r.contracts)
				for (const t of arr(c.tokens))
					add(
						name,
						"pool",
						String(c.contract_id),
						t,
						"stellarindex registry tokens",
						r.readAt,
					);
	const noTok = [...reg].flatMap(([n, r]) =>
		r.contracts.filter((c) => !arr(c.tokens).length).map((c) => ({ n, c })),
	);
	const inst = await instances(noTok.map((x) => String(x.c.contract_id)));
	const blendFallback: string[] = [];
	const blntPools: string[] = [];
	for (const { n, c } of noTok) {
		const cid = String(c.contract_id);
		if (inst.failed.has(cid)) {
			failedProto.add(n);
			continue;
		}
		const i = inst.found.get(cid);
		if (!i) continue;
		const s = i.storage;
		const at = RUN_AT;
		if (n === "aquarius") {
			const toks = arr(s.get("Tokens")).length
				? arr(s.get("Tokens"))
				: [s.get("TokenA"), s.get("TokenB")];
			for (const x of toks)
				add(n, "pool", cid, x, "rpc instance TokenA/TokenB|Tokens", at);
		} else if (n === "sushiswap_v3") {
			const p = obj(s.get("params"));
			for (const x of [p.token0, p.token1])
				add(n, "pool", cid, x, "rpc instance params.token0/token1", at);
		} else if (n === "defindex") {
			if (s.has("METADATA")) {
				for (const [k, v] of s)
					if (k.startsWith('["AssetStrategySet"'))
						add(
							n,
							"vault",
							cid,
							obj(v).address,
							"rpc instance AssetStrategySet.address",
							at,
						);
			} else if (s.has("Config"))
				add(
					n,
					"strategy",
					cid,
					obj(s.get("Config")).asset,
					"rpc instance Config.asset",
					at,
				);
		} else if (n === "spectra") {
			if (s.has("Underlying")) {
				add(
					n,
					"principal_token",
					cid,
					s.get("Underlying"),
					"rpc instance Underlying",
					at,
				);
				add(n, "principal_token", cid, s.get("Ibt"), "rpc instance Ibt", at);
			} else if (s.has("AssetAddress")) {
				add(
					n,
					"wrapper",
					cid,
					s.get("AssetAddress"),
					"rpc instance AssetAddress",
					at,
				);
				add(
					n,
					"wrapper",
					cid,
					s.get("VaultShare"),
					"rpc instance VaultShare",
					at,
				);
			}
		} else if (n === "upshift")
			add(
				n,
				"vault",
				cid,
				s.get("AssetAddress"),
				"rpc instance AssetAddress",
				at,
			);
		else if (n === "rozo")
			add(n, "payment", cid, s.get("usdc"), "rpc instance usdc", at);
		else if (n.startsWith("reflector")) {
			for (const a of arr(s.get("assets")))
				if (Array.isArray(a) && a[0] === "Stellar")
					add(
						n,
						"feed",
						cid,
						a[1],
						"rpc instance assets (Stellar address)",
						at,
					);
		} else if (n === "blend" && c.kind === "instance" && s.has("Config"))
			blendFallback.push(cid);
		else if (n === "blnt" && s.has("Config")) blntPools.push(cid);
	}
	for (const cid of blendFallback) {
		const d = await si(`/lending/pools/${cid}/reserves`);
		const res = arr(d.data?.reserves).map((x) => obj(x).asset);
		if (res.length) {
			for (const x of res)
				add(
					"blend",
					"pool",
					cid,
					x,
					"stellarindex /lending/pools reserves",
					d.readAt,
				);
			continue;
		}
		const e = await entries([dataKey(cid, xdr.ScVal.scvSymbol("ResList"))]);
		if (!e) {
			failedProto.add("blend");
			continue;
		}
		for (const v of e.values())
			for (const x of arr(entryValue(v)))
				add("blend", "pool", cid, x, "rpc data ResList", RUN_AT);
	}
	for (const cid of blntPools) {
		const v = await simulate(cid, "get_reserve_list");
		if (!v) failedProto.add("blnt");
		else if (v.ok)
			for (const x of arr(v.value))
				add("blnt", "pool", cid, x, "rpc simulate get_reserve_list()", RUN_AT);
	}
	const phx = reg.has("phoenix")
		? await simulate(PHX_FACTORY, "query_all_pools_details")
		: null;
	const phxAmount = new Map<string, string>();
	if (reg.has("phoenix")) {
		if (!phx?.ok) failedProto.add("phoenix");
		else
			for (const p of arr(phx.value).map(obj)) {
				const pr = obj(p.pool_response);
				for (const side of ["asset_a", "asset_b"]) {
					const a = obj(pr[side]);
					add(
						"phoenix",
						"pool",
						String(p.pool_address),
						a.address,
						"rpc simulate factory query_all_pools_details()",
						RUN_AT,
					);
					phxAmount.set(`${p.pool_address}|${a.address}`, String(a.amount));
				}
			}
	}
	if (reg.has("cctp")) {
		const v = await simulate(CCTP_TMM, "get_max_burn_amount_per_message", [
			addr(USDC),
		]);
		if (!v) failedProto.add("cctp");
		else if (v.ok && String(v.value) !== "0")
			add(
				"cctp",
				"token_minter",
				CCTP_TMM,
				USDC,
				`rpc simulate get_max_burn_amount_per_message(USDC) = ${v.value}`,
				RUN_AT,
			);
	}
	for (const n of reg.keys())
		if (!failedProto.has(n)) checked.add(`registry:${n}`);
	for (const n of failedProto)
		notes.push(
			`registry:${n}: a token read failed, so none of its rows is ended this run`,
		);
	// one edge per (protocol, pool, token): a token can appear twice in a pool's list
	{
		const seen = new Set<string>();
		const uniq = raws.filter((r) => {
			const k = `${r.venue}|${r.pool}|${r.token}`;
			return !seen.has(k) && !!seen.add(k);
		});
		raws.splice(0, raws.length, ...uniq);
	}

	// 2. anchors, SEP-42 lists, issuers
	const anchors = await slPaged("/partners?type=anchor&all=1", "partners");
	for (const p of anchors) {
		const site = str(p.websiteUrl);
		let toml = str(p.tomlSourceUrl);
		let how =
			"anchor stellar.toml [[CURRENCIES]] (the toml the partners API cites)";
		if (!toml && domainOf(site)) {
			toml = `https://${domainOf(site)}/.well-known/stellar.toml`;
			how =
				"anchor stellar.toml [[CURRENCIES]] (website domain; the API cites no toml)";
		}
		if (!toml) continue;
		const t = await get(toml, true);
		if (t.status !== 200 || typeof t.data !== "string") {
			notes.push(
				`anchor:${p.slug} toml could not be read (http ${t.status}): its rows are not ended this run`,
			);
			continue;
		}
		checked.add(`anchor:${p.slug}`);
		const who = await projectByDomain(String(p.name), domainOf(site));
		for (const c of tomlCurrencies(t.data)) {
			const token =
				c.contract && !c.issuer
					? c.contract
					: c.code && c.issuer
						? sacContractId(c.code, c.issuer)
						: null;
			if (!token || !CRE.test(token)) continue;
			raws.push({
				asset: c.issuer ? `${c.code}:${c.issuer}` : undefined,
				token,
				kind: "anchor_asset",
				venue: String(p.slug),
				role: "currency",
				pool: toml,
				method: how,
				readAt: t.readAt,
				source: `anchor:${p.slug}`,
				projectSlug: who.slug,
				attributionBasis: who.basis,
				evidenceUrl: toml,
			});
		}
	}
	const lists = new Map<string, { found: string; provider: string }>();
	const cat = await get(
		"https://raw.githubusercontent.com/stellar-asset-lists/index/main/index.json",
	);
	if (cat.status === 200)
		for (const x of arr(cat.data).map(obj))
			lists.set(String(x.url), {
				found: "stellar-asset-lists catalog",
				provider: String(x.provider ?? ""),
			});
	else notes.push("SEP-42 list catalog could not be read");
	for (const d of APP_DOMAINS) {
		const t = await get(`https://${d}/.well-known/stellar.toml`, true);
		if (t.status === 200 && typeof t.data === "string")
			for (const u of tomlAssetLists(t.data))
				if (!lists.has(u))
					lists.set(u, { found: `${d} stellar.toml ASSET_LISTS`, provider: d });
	}
	for (const [u, { provider }] of lists) {
		if (u.includes("stellar.expert")) {
			notes.push(`asset list ${u}: not read (paywalled host, never called)`);
			continue;
		}
		const r = await get(u);
		const d = obj(r.data);
		if (r.status !== 200) {
			notes.push(
				`asset list ${u} could not be read (http ${r.status}): its rows are not ended this run`,
			);
			continue;
		}
		const publisher = String(d.provider ?? provider);
		const src = `asset-list:${u}`;
		checked.add(src);
		const gh = u.includes("raw.githubusercontent.com")
			? (u.split("/")[3] ?? "")
			: "";
		const who = await projectByDomain(publisher, gh ? "" : domainOf(u), gh);
		for (const a of arr(d.assets).map(obj)) {
			const token =
				a.code && a.issuer
					? sacContractId(String(a.code), String(a.issuer))
					: str(a.contract);
			if (!token || !CRE.test(token)) continue;
			raws.push({
				asset: a.code && a.issuer ? `${a.code}:${a.issuer}` : undefined,
				token,
				kind: "asset_list",
				venue: publisher,
				role: "listed",
				pool: u,
				method: "SEP-42 list",
				readAt: r.readAt,
				source: src,
				projectSlug: who.slug,
				attributionBasis: who.basis,
				evidenceUrl: u,
			});
		}
	}
	const stables = await get(`${SL}/stablecoins?limit=100`);
	if (stables.status !== 200)
		throw new InstrumentFailure("/api/stablecoins could not be read");
	checked.add("issuer:stablecoins");
	for (const x of arr(obj(stables.data).stablecoins).map(obj)) {
		const token = registryTokenId(str(x.ticker), str(x.issuer), null);
		if (!token) continue;
		const who = await projectByDomain(
			String(x.company ?? ""),
			domainOf(str(x.issuerDomain) ?? str(x.website)),
		);
		raws.push({
			asset: `${x.ticker}:${x.issuer}`,
			token,
			kind: "issuer",
			venue: String(x.company ?? x.ticker),
			role: "issuer",
			pool: `${x.ticker}:${x.issuer}`,
			method: "stellarlight /api/stablecoins",
			readAt: stables.readAt,
			source: "issuer:stablecoins",
			projectSlug: who.slug,
			attributionBasis: who.basis,
			evidenceUrl: str(x.issuerOfRecordSourceUrl) ?? `${SL}/stablecoins`,
		});
	}
	checked.add("issuer:rwa");
	for (const x of RWA_REGISTRY) {
		const token = registryTokenId(x.code, x.issuer, x.contract);
		if (!token) continue;
		raws.push({
			asset: x.code && x.issuer ? `${x.code}:${x.issuer}` : undefined,
			token,
			kind: "issuer",
			venue: x.issuerEntity ?? x.symbol,
			role: "issuer",
			pool: x.id,
			method: "stellarlight RWA registry",
			readAt: x.verifiedAt,
			source: "issuer:rwa",
			projectSlug: x.projectSlug,
			attributionBasis: x.projectSlug
				? "projectSlug in the RWA registry"
				: "the RWA registry names no project",
			evidenceUrl: x.evidenceUrl,
		});
	}

	// pools whose reads matter: every pool, or those holding a token in scope
	const poolsOfInterest = new Set(
		raws
			.filter((r) => inScope(r.token) && r.source.startsWith("registry:"))
			.map((r) => r.pool),
	);
	const protoRaws = raws.filter(
		(r) => r.source.startsWith("registry:") && poolsOfInterest.has(r.pool),
	);
	const otherRaws = raws.filter(
		(r) => !r.source.startsWith("registry:") && inScope(r.token),
	);

	// 3. token identity, prices, labels for every token met outside classic pools
	const rich = new Set([...protoRaws, ...otherRaws].map((r) => r.token));
	const ident = new Map<
		string,
		TokenIdentity & { decimals: number; sacDeployed: boolean | null }
	>();
	const price = new Map<string, number>();
	const tokInst = await instances([...rich]);
	const assetOf = new Map<string, [string, string]>();
	for (const r of raws)
		if (r.asset) assetOf.set(r.token, r.asset.split(":") as [string, string]);
	await pmap([...rich], 4, (t) => si(`/assets/${t}`));
	for (const t of rich) {
		const id = {
			tokenId: t,
			code: null as string | null,
			issuer: null as string | null,
			tokenKind: null as "sac" | "custom" | null,
			homeDomain: null as string | null,
			issuerLabel: null as string | null,
			decimals: 7,
			sacDeployed: null as boolean | null,
		};
		const i = tokInst.found.get(t);
		if (i) {
			id.tokenKind = i.sac ? "sac" : "custom";
			id.sacDeployed = i.sac;
			const md = obj(i.storage.get("METADATA"));
			if (i.sac) {
				const nm = String(md.name ?? "");
				if (nm === "native") [id.code, id.issuer] = ["XLM", "native"];
				else if (nm.includes(":"))
					[id.code, id.issuer] = nm.split(":") as [string, string];
			} else if (Object.keys(md).length) {
				id.code = str(md.symbol);
				id.decimals = Number(md.decimal ?? 7);
			} else {
				const [sy, de] = [
					await simulate(t, "symbol"),
					await simulate(t, "decimals"),
				];
				if (sy?.ok) id.code = String(sy.value);
				if (de?.ok) id.decimals = Number(de.value);
			}
		} else if (!tokInst.failed.has(t)) id.sacDeployed = false;
		const a = await si(`/assets/${t}`);
		if (a.ok && a.data) {
			if (
				!id.code &&
				["classic", "native"].includes(String(a.data.type)) &&
				a.data.issuer
			) {
				id.code = String(a.data.code);
				id.issuer = String(a.data.issuer);
				id.tokenKind = id.tokenKind ?? "sac";
			}
			if (!id.code && a.data.code) id.code = String(a.data.code);
			id.homeDomain = str(a.data.home_domain);
			const p = Number(a.data.price_usd);
			if (a.data.price_usd != null && Number.isFinite(p)) price.set(t, p);
			else if (str(a.data.price_withheld_reason))
				unreadPrice.set(
					t,
					`Stellar Index withheld it: ${a.data.price_withheld_reason}`,
				);
		} else if (a.status !== 404)
			unreadPrice.set(
				t,
				`Stellar Index /assets could not be read (http ${a.status})`,
			);
		if (!id.code && assetOf.has(t)) {
			[id.code, id.issuer] = assetOf.get(t) as [string, string];
			id.tokenKind = "sac";
		}
		if (t === XLM_SAC)
			Object.assign(id, { code: "XLM", issuer: "native", tokenKind: "sac" });
		ident.set(t, id);
	}
	const labelAddrs = [
		...new Set(
			[...ident.values()]
				.map((i) =>
					i.issuer?.startsWith("G")
						? i.issuer
						: i.tokenKind === "custom"
							? i.tokenId
							: null,
				)
				.filter((x): x is string => !!x),
		),
	];
	const labels = new Map<string, Record<string, unknown> | null>();
	for (let i = 0; i < labelAddrs.length; i += 100) {
		const chunk = labelAddrs.slice(i, i + 100);
		const d = await si(`/directory?addresses=${chunk.join(",")}`);
		for (const a of chunk)
			labels.set(
				a,
				d.ok
					? ((obj(d.data?.entries)[a] as Record<string, unknown>) ?? null)
					: null,
			);
	}
	for (const id of ident.values()) {
		const l = labels.get(id.issuer?.startsWith("G") ? id.issuer : id.tokenId);
		if (l)
			id.issuerLabel = `${l.name}${arr(l.tags).length ? ` (${arr(l.tags).join(", ")})` : ""}`;
		if (!id.homeDomain && id.issuer?.startsWith("G")) {
			const h = await get(`${HORIZON}/accounts/${id.issuer}`);
			id.homeDomain = str(obj(h.data).home_domain);
		}
	}

	// 4. depth and activity per pool
	// Soroswap pair reserves (the index serves most pairs; the rest are read from the chain below)
	const sorRes = new Map<string, { raw: string; decimals: number }>();
	if (protoRaws.some((r) => r.venue === "soroswap")) {
		const r = await get(`${SI}/pools/reserves?source=soroswap`);
		for (const p of arr(obj(r.data).data).map(obj))
			for (const side of ["token0", "token1"]) {
				const x = obj(p[side]);
				sorRes.set(`${p.pool}|${x.contract}`, {
					raw: String(x.reserve),
					decimals: Number(x.decimals ?? 7),
				});
			}
	}
	const bal = new Map<string, { balance: string | null; basis: string }>();
	const needSac: Raw[] = [];
	for (const r of protoRaws) {
		const k = `${r.pool}|${r.token}`;
		const dec = ident.get(r.token)?.decimals ?? 7;
		if (r.kind === "oracle_feed" || r.role === "token_minter")
			bal.set(k, { balance: null, basis: "n/a (holds nothing by design)" });
		else if (sorRes.has(k)) {
			const s = sorRes.get(k) as { raw: string; decimals: number };
			bal.set(k, {
				balance: toDecimal(s.raw, s.decimals),
				basis: "stellarindex /pools/reserves",
			});
		} else if (phxAmount.has(k))
			bal.set(k, {
				balance: toDecimal(phxAmount.get(k) as string, dec),
				basis: "phoenix factory query_all_pools_details() amount",
			});
		else needSac.push(r);
	}
	const sacPairs = needSac
		.filter(
			(r) =>
				ident.get(r.token)?.sacDeployed &&
				ident.get(r.token)?.tokenKind === "sac",
		)
		.map((r) => [r.token, r.pool] as [string, string]);
	const sacBal = await balances(sacPairs);
	for (const r of needSac) {
		const k = `${r.pool}|${r.token}`;
		const dec = ident.get(r.token)?.decimals ?? 7;
		const hit = sacBal.out.get(`${r.token}|${r.pool}`);
		if (hit) {
			bal.set(k, {
				balance: toDecimal(hit.raw, dec),
				basis: "rpc getLedgerEntries SAC Balance(pool) entry",
			});
			continue;
		}
		const v = await simulate(r.token, "balance", [addr(r.pool)]);
		bal.set(
			k,
			v?.ok
				? {
						balance: toDecimal(String(v.value), dec),
						basis: "rpc simulate token.balance(pool)",
					}
				: {
						balance: null,
						basis: `could-not-check: ${v ? v.error.slice(0, 100) : "simulation did not run"}`,
					},
		);
	}
	const act = new Map<
		string,
		{
			n: number | null;
			basis: string;
			last: string | null;
			first: string | null;
			readAt: string;
		}
	>();
	const activity = async (c: string) => {
		if (act.has(c))
			return act.get(c) as NonNullable<ReturnType<typeof act.get>>;
		const d = await si(`/contracts/${c}?limit=500`);
		const evs = arr(d.data?.events).map(obj);
		const n = evs.filter((e) => String(e.close_time ?? "") >= CUT).length;
		const known = d.ok && d.data?.exists !== false;
		const a = obj(d.data?.activity);
		const out = {
			n: known ? n : null,
			basis: known
				? n === 500
					? "lower bound: page of 500 all inside window"
					: "stellarindex /contracts events in window"
				: `could-not-check (http ${d.ok ? "200, contract unknown to the index" : "error"})`,
			last: str(evs[0]?.close_time) ?? str(a.last_seen),
			first: str(a.first_seen),
			readAt: d.readAt,
		};
		act.set(c, out);
		return out;
	};
	await pmap([...poolsOfInterest], 4, activity);
	// Aquarius rewards config: a pool it pays is the protocol's own choice
	const aqReward = new Map<string, string>();
	const aqType = new Map<string, string>();
	if (reg.has("aquarius")) {
		for (
			let url: string | null =
				"https://amm-api.aqua.network/pools/?pool_type=&sort=-liquidity&page=1&size=100";
			url;
		) {
			const r = await get(url);
			if (r.status !== 200)
				throw new InstrumentFailure(
					"Aquarius rewards config (amm-api.aqua.network/pools) could not be read",
				);
			const d = obj(r.data);
			for (const it of arr(d.items).map(obj)) {
				aqReward.set(String(it.address), String(it.reward_tps ?? "0"));
				aqType.set(String(it.address), String(it.pool_type ?? ""));
			}
			url = str(d.next);
		}
	}
	const regC = new Map<string, { name: string; c: Record<string, unknown> }>();
	for (const [name, r] of reg)
		for (const c of r.contracts) regC.set(String(c.contract_id), { name, c });
	const flCount = new Map<string, number>();
	for (const { name, c } of regC.values())
		if (c.first_ledger)
			flCount.set(
				`${name}|${c.first_ledger}`,
				(flCount.get(`${name}|${c.first_ledger}`) ?? 0) + 1,
			);
	const ledgerTime = async (seq: unknown) =>
		str((await si(`/ledgers/${Number(seq)}`)).data?.close_time);

	const edges: Edge[] = [];
	const byPool = new Map<string, Raw[]>();
	for (const r of protoRaws)
		byPool.set(r.pool, [...(byPool.get(r.pool) ?? []), r]);
	const slugOk = new Map<string, { slug: string | null; basis: string }>();
	for (const proto of new Set(protoRaws.map((r) => r.venue))) {
		const want = PROTOCOL_SLUG[proto];
		const p = want ? await projectBySlug(want) : null;
		slugOk.set(
			proto,
			p
				? {
						slug: p.slug,
						basis: `protocol ${proto} is directory row ${p.slug}`,
					}
				: {
						slug: null,
						basis: want
							? `no directory row ${want} found`
							: `no directory row for ${proto}`,
					},
		);
	}
	for (const [pool, rs] of byPool) {
		const holds = rs
			.filter((r) => r.kind !== "oracle_feed" && r.role !== "token_minter")
			.map((r) => ({
				token: r.token,
				balance: bal.get(`${pool}|${r.token}`)?.balance ?? null,
			}));
		const legs = holds.map((h) => ({
			balance: h.balance,
			usd: usdOf(h.balance, price.get(h.token)),
		}));
		const proto = rs[0].venue;
		const cp =
			proto === "soroswap" ||
			(proto === "aquarius" && aqType.get(pool) === "constant_product");
		const depth = poolDepth(legs, cp);
		const a = act.get(pool);
		const { name, c } = regC.get(pool) ?? {
			name: proto,
			c: {} as Record<string, unknown>,
		};
		let firstAt: string | null = null;
		let firstBasis = "could-not-check";
		if (c.first_ledger && flCount.get(`${name}|${c.first_ledger}`) === 1) {
			firstAt = await ledgerTime(c.first_ledger);
			firstBasis = `ledger ${c.first_ledger} close time (registry first_ledger)`;
		}
		if (!firstAt && a?.first) {
			firstAt = a.first;
			firstBasis =
				"first event of the pool (stellarindex activity.first_seen; creation can be earlier)";
		}
		const tier = poolEdgeTier(
			rs[0].kind,
			proto === "aquarius" ? (aqReward.get(pool) ?? "0") : null,
			a?.n ?? null,
			a?.basis ?? null,
			depth,
		);
		const unread = edgeUnread(
			tier.tier,
			a && a.n !== null ? null : (a?.basis ?? "not read"),
			holds.map((h) =>
				leg(h.token, ident.get(h.token)?.code ?? h.token, h.balance),
			),
		);
		const who = slugOk.get(proto) ?? { slug: null, basis: "" };
		for (const r of rs) {
			if (!inScope(r.token)) continue;
			const b = bal.get(`${pool}|${r.token}`);
			edges.push({
				token: r.token,
				kind: r.kind,
				venue: proto,
				projectSlug: who.slug,
				attributionBasis: who.basis,
				pool,
				method: r.method,
				source: r.source,
				firstAt,
				firstBasis,
				lastSeenAt: a?.last ?? null,
				events90d: a?.n ?? null,
				events90dBasis: a?.basis ?? null,
				balance: b?.balance ?? null,
				balanceUsd: usdOf(b?.balance ?? null, price.get(r.token)),
				balanceBasis: b?.basis ?? null,
				depthUsd: r.kind === "dex_pool" ? depth.usd : null,
				depthBasis: r.kind === "dex_pool" ? depth.basis : null,
				tier: tier.tier,
				tierBasis: tier.basis,
				evidenceUrl:
					r.method === "stellarindex registry tokens"
						? `${SI}/protocols/${proto}`
						: r.evidenceUrl,
				readAt: r.readAt,
				unread,
			});
		}
	}
	for (const r of otherRaws) {
		const t = poolEdgeTier(r.kind, null, null, null, {
			usd: 0,
			unknownLegs: 0,
		});
		edges.push({
			token: r.token,
			kind: r.kind,
			venue: r.venue,
			projectSlug: r.projectSlug,
			attributionBasis: r.attributionBasis,
			pool: r.pool,
			method: r.method,
			source: r.source,
			firstAt: null,
			firstBasis:
				"not read (no read dates when a toml, list or registry started carrying a token)",
			lastSeenAt: null,
			events90d: null,
			events90dBasis: null,
			balance: null,
			balanceUsd: null,
			balanceBasis: null,
			depthUsd: null,
			depthBasis: null,
			tier: t.tier,
			tierBasis: `${t.basis} (${r.venue})`,
			evidenceUrl: r.evidenceUrl,
			readAt: r.readAt,
		});
	}

	// 5. classic AMM pools: network venues, carried for tokens in the layer
	const layer = new Set([...edges.map((e) => e.token)]);
	const assetStr = (t: string) => {
		const i = ident.get(t);
		return t === XLM_SAC
			? "native"
			: i?.issuer?.startsWith("G") && i.code
				? `${i.code}:${i.issuer}`
				: null;
	};
	const urls = subset
		? [...subset]
				.map(assetStr)
				.filter((a): a is string => !!a)
				.map(
					(a) => `${HORIZON}/liquidity_pools?reserves=${a}&limit=200&order=asc`,
				)
		: [`${HORIZON}/liquidity_pools?limit=200&order=asc`];
	const classic = new Map<string, Record<string, unknown>>();
	let classicOk = true;
	for (const start of urls)
		for (let url: string | null = start; url; ) {
			const r = await get(url);
			if (r.status !== 200) {
				classicOk = false;
				notes.push(
					`classic AMM pools could not be read completely (http ${r.status}): no classic row is ended this run`,
				);
				break;
			}
			const recs = arr(obj(obj(r.data)._embedded).records).map(obj);
			for (const p of recs)
				classic.set(String(p.id), { ...p, _readAt: r.readAt });
			url =
				recs.length === 200
					? str(obj(obj(obj(r.data)._links).next).href)
					: null;
		}
	if (classicOk) checked.add("classic-amm");
	const tokenOfAsset = (a: string) =>
		a === "native" ? XLM_SAC : sacContractId(a.split(":")[0], a.split(":")[1]);
	for (const [id, p] of classic) {
		const legs = arr(p.reserves)
			.map(obj)
			.map((x) => ({
				token: tokenOfAsset(String(x.asset)),
				code: String(x.asset).split(":")[0],
				amount: String(x.amount),
			}));
		if (!legs.some((l) => l.token && layer.has(l.token))) continue;
		const priced = legs.map((l) => ({
			balance: l.amount,
			usd: l.token ? usdOf(l.amount, price.get(l.token)) : null,
		}));
		const depth = poolDepth(priced, true);
		const lastMod = str(p.last_modified_time);
		let n: number | null = null;
		let basis = "";
		if (depth.usd >= 100 && lastMod && lastMod >= CUT) {
			const h = await get(
				`${HORIZON}/liquidity_pools/${id}/operations?order=desc&limit=200`,
			);
			const recs = arr(obj(obj(h.data)._embedded).records).map(obj);
			if (h.status === 200) {
				n = recs.filter((x) => String(x.created_at ?? "") >= CUT).length;
				basis =
					n === 200
						? "lower bound: page of 200 all inside window"
						: "horizon operations touching the pool in window";
			} else basis = `could-not-check (http ${h.status})`;
		} else if (!lastMod || lastMod < CUT) {
			n = 0;
			basis = lastMod
				? "no state change in window (horizon last_modified_time)"
				: "no state change in window (last change older than Horizon's history)";
		}
		const tier = poolEdgeTier(
			"classic_amm_pool",
			null,
			n,
			basis || null,
			depth,
		);
		// activity skipped by design (priced depth under $100) is not a failed read
		const unread = edgeUnread(
			tier.tier,
			n === null && basis.startsWith("could-not-check") ? basis : null,
			legs.map((l) => leg(l.token, l.code, l.amount)),
		);
		for (const l of legs) {
			if (!l.token || !layer.has(l.token) || !inScope(l.token)) continue;
			edges.push({
				token: l.token,
				kind: "classic_amm_pool",
				venue: "stellar-classic-amm",
				projectSlug: null,
				attributionBasis: "network-owned: no project",
				pool: id,
				method: "horizon /liquidity_pools",
				source: "classic-amm",
				firstAt: null,
				firstBasis:
					"not read (Horizon history starts 2025-10-10; pool creation not read)",
				lastSeenAt: lastMod,
				events90d: n,
				events90dBasis: basis || null,
				balance: l.amount,
				balanceUsd: usdOf(l.amount, price.get(l.token)),
				balanceBasis: "horizon /liquidity_pools reserves",
				depthUsd: depth.usd,
				depthBasis: depth.basis,
				tier: tier.tier,
				tierBasis: tier.basis,
				evidenceUrl: `${HORIZON}/liquidity_pools/${id}`,
				readAt: String(p._readAt),
				unread,
			});
		}
	}

	// 6. holder sweep: any contract holding a priority token, registry or not
	const preBest = new Map<string, number>();
	for (const e of edges)
		if (e.projectSlug)
			preBest.set(
				e.token,
				Math.min(preBest.get(e.token) ?? 9, TIER_RANK[e.tier]),
			);
	// A token swept once stays swept, so its holder rows can end when a holder
	// empties. What the store adds is fixed by the run's first pass (cached):
	// --replan reads the store that pass wrote and must sweep what it swept.
	const { payload, stored } = await readStore();
	const prior = priorHolderContracts(stored, RUN_CACHE);
	const priority = [
		...new Set([
			...edges.filter((e) => e.kind === "issuer").map((e) => e.token),
			...[...preBest].filter(([, r]) => r <= TIER_RANK.used).map(([t]) => t),
			...prior.keys(),
		]),
	].filter(inScope);
	const sweeps = new Map<string, Record<string, unknown>>();
	const holderEdges = await holderSweep(
		priority,
		ident,
		price,
		protoRaws,
		reg,
		slugOk,
		checked,
		sweeps,
		notes,
		prior,
	);
	edges.push(...holderEdges);
	edges.push(...(await accountSweep(priority, ident, price, checked, notes)));

	// 7. rows, plan, write
	const rows = aggregate(
		edges.filter((e) => inScope(e.token)),
		ident,
		sweeps,
	);
	const tally = new Map<string, number>();
	for (const r of rows)
		tally.set(
			`${r.kind} ${r.tier}`,
			(tally.get(`${r.kind} ${r.tier}`) ?? 0) + 1,
		);
	console.log(
		`edges ${edges.length}, rows ${rows.length}, tokens ${new Set(rows.map((r) => r.tokenId)).size}, projects ${new Set(rows.map((r) => r.projectSlug).filter(Boolean)).size}`,
	);
	for (const [k, v] of [...tally].sort()) console.log(`  ${k.padEnd(34)} ${v}`);
	// per token, per tier, never blended (SCF is joined at read time by the API)
	for (const t of new Set(rows.map((r) => r.tokenId))) {
		const rs = rows.filter((r) => r.tokenId === t);
		const s = summarize(rs, () => false);
		const p = s.projectsByTier;
		const n = s.networkVenuePoolsByTier;
		const best = new Map<string, Tier>();
		for (const r of rs) {
			const cur = r.projectSlug ? best.get(r.projectSlug) : undefined;
			if (r.projectSlug && (!cur || TIER_RANK[r.tier] < TIER_RANK[cur]))
				best.set(r.projectSlug, r.tier);
		}
		const tiers = (rank: Tier) =>
			[...best]
				.filter(([, x]) => x === rank)
				.map(([slug]) => slug)
				.sort()
				.join(",");
		console.log(
			`  ${rs[0].code ?? "?"} ${t}: projects integrated ${p.integrated} [${tiers("integrated")}], used ${p.used} [${tiers("used")}], available ${p.available}, unrated ${p.unrated} | classic pools used ${n.used}, available ${n.available}, unrated ${n.unrated} | unattributed holders ${s.unattributedHolders.contracts}`,
		);
	}
	for (const n of notes) console.log(`  note: ${n}`);

	if (OFFLINE)
		console.log(
			"\nstore not read (--offline): the plan is against an empty store",
		);
	const judge = (s: StoredRow) => {
		if (subset && !subset.has(String(s.tokenId)))
			return "out of scope (--tokens)";
		if (!checked.has(String(s.source)))
			return `could-not-check: ${s.source} was not read completely this run`;
		return null;
	};
	const edgesOf = new Map<string, Edge[]>();
	for (const e of edges) {
		const k = rowKey(e.token, e.kind, e.venue, e.projectSlug);
		const g = edgesOf.get(k);
		if (g) g.push(e);
		else edgesOf.set(k, [e]);
	}
	const plan = planWrites(
		rows,
		stored,
		judge,
		RUN_AT,
		(k) => edgesOf.get(k) ?? [],
	);
	const line = (r: IntegrationRow) =>
		`${r.code ?? r.tokenId.slice(0, 8)} ${r.kind} ${r.venue} ${r.projectSlug ?? "(no project)"} | ${r.tier}: ${r.tierBasis} | pools ${r.pools}${r.balance ? ` | balance ${r.balance}` : ""}${r.firstDate ? ` | since ${r.firstDate} (${r.firstDateBasis})` : ""}${r.kind === "holder" ? ` | ${r.bestPool}: ${r.attributionBasis}` : ""}`;
	console.log(
		`\nplan: create ${plan.create.length}, update ${plan.update.length}, end ${plan.end.length}, keep (not judged) ${plan.keep.length}, unchanged ${plan.unchanged}`,
	);
	for (const r of plan.create) console.log(`  + ${line(r)}`);
	for (const u of plan.update)
		console.log(`  ~ ${line(u.row)} | changed: ${u.changed.join(", ")}`);
	for (const e of plan.end) console.log(`  - ${e.key} | ${e.data.endedReason}`);
	for (const k of plan.keep) console.log(`  = ${k.key} | ${k.reason}`);
	console.log(`replan: writes=${plannedWrites(plan)}`);
	summary(rows, plan, notes);

	if (!EXECUTE || REPLAN || OFFLINE || !payload) {
		if (!REPLAN)
			console.log(
				"\nDRY RUN: nothing written. Re-run with --execute to write.",
			);
		return;
	}
	const p = payload;
	const sent = new Map<string, Record<string, unknown>>();
	let failed = 0;
	const fieldsOf = (r: IntegrationRow) =>
		Object.fromEntries(ROW_FIELDS.map((f) => [f, r[f]]));
	for (const r of plan.create)
		try {
			await p.create({
				collection: "token-integrations",
				data: fieldsOf(r),
				context: { internal: true },
			});
			sent.set(r.key, fieldsOf(r));
		} catch (e) {
			failed++;
			console.error(
				`  ✗ create ${r.key}: ${String((e as Error).message).slice(0, 160)}`,
			);
		}
	for (const u of plan.update)
		try {
			await p.update({
				collection: "token-integrations",
				id: u.id,
				data: fieldsOf(u.row),
				context: { internal: true },
			});
			sent.set(u.row.key, fieldsOf(u.row));
		} catch (e) {
			failed++;
			console.error(
				`  ✗ update ${u.row.key}: ${String((e as Error).message).slice(0, 160)}`,
			);
		}
	for (const e of plan.end)
		try {
			await p.update({
				collection: "token-integrations",
				id: e.id,
				data: e.data,
				context: { internal: true },
			});
			sent.set(e.key, { ...e.data });
		} catch (err) {
			failed++;
			console.error(
				`  ✗ end ${e.key}: ${String((err as Error).message).slice(0, 160)}`,
			);
		}
	// payload.update() drops keys with no schema field and still resolves:
	// read every written row back.
	const mismatches = await verifyWrites(
		sent,
		async (keys) => {
			const res = await p.find({
				collection: "token-integrations",
				where: { key: { in: keys } },
				limit: keys.length,
				depth: 0,
			});
			return new Map(
				(res.docs as Array<Record<string, unknown>>).map((d) => [
					String(d.key),
					d,
				]),
			);
		},
		[...ROW_FIELDS],
	);
	if (mismatches.length) {
		console.error(
			`✗ ${mismatches.length} field(s) did not persist as sent:\n${formatMismatches(mismatches)}`,
		);
		process.exitCode = 1;
	} else console.log(`✓ read back ${sent.size} row(s) as written`);
	if (failed) process.exitCode = 1;
}

/** Holder sweep (port of the private 09/10): every contract holding a
 * priority token now, found from the token's own event history (when small
 * enough to read whole) and a candidate set, attributed where public evidence
 * ties it to one project, tiered on this holding. */
async function holderSweep(
	priority: string[],
	ident: Map<
		string,
		TokenIdentity & { decimals: number; sacDeployed: boolean | null }
	>,
	price: Map<string, number>,
	protoRaws: Raw[],
	reg: Map<string, { category: string; contracts: Record<string, unknown>[] }>,
	slugOk: Map<string, { slug: string | null; basis: string }>,
	checked: Set<string>,
	sweeps: Map<string, Record<string, unknown>>,
	notes: string[],
	prior: Map<string, Set<string>>,
): Promise<Edge[]> {
	if (!priority.length) return [];
	// Horizon's contract counts: which tokens a contract can hold at all, and
	// the completeness reference for classic tokens
	const hz = new Map<
		string,
		{ n: number; amount: string; readAt: string } | null
	>();
	for (const t of priority) {
		const i = ident.get(t);
		if (!i?.issuer?.startsWith("G") || !i.code) continue;
		const r = await get(
			`${HORIZON}/assets?asset_code=${i.code}&asset_issuer=${i.issuer}`,
		);
		const rec = obj(arr(obj(obj(r.data)._embedded).records)[0]);
		hz.set(
			t,
			r.status === 200 && rec.asset_code
				? {
						n: Number(rec.num_contracts ?? 0),
						amount: String(rec.contracts_amount ?? "0"),
						readAt: r.readAt,
					}
				: null,
		);
	}
	const live = priority.filter((t) => {
		const h = hz.get(t);
		if (h && h.n === 0) return false;
		return ident.get(t)?.sacDeployed !== false || (h?.n ?? 0) > 0;
	});
	for (const t of priority)
		if (!live.includes(t))
			sweeps.set(t, {
				sweep:
					"skipped: no contract holds it (Horizon num_contracts 0, or no token contract deployed)",
				readAt: RUN_AT,
			});
	// discovery 1: the whole event history of small tokens
	const swept = new Map<
		string,
		{
			found: Set<string>;
			first: Map<string, string>;
			pages: number;
			state: string;
		}
	>();
	const ledgers = new Map<string, number>();
	await pmap(live, 4, async (t) => {
		const d = await si(`/contracts/${t}?limit=1`);
		ledgers.set(t, Number(obj(d.data?.activity).active_ledgers_total ?? 0));
	});
	await pmap(
		live.filter((t) => (ledgers.get(t) ?? 0) <= SWEEP_LEDGERS),
		4,
		async (t) => {
			const found = new Set<string>();
			const first = new Map<string, string>();
			let url = `/contracts/${t}?limit=500`;
			let pages = 0;
			let state = `partial (stopped at ${MAX_PAGES} pages)`;
			while (pages < MAX_PAGES) {
				const d = await si(url);
				if (!d.ok) {
					state = `could-not-check at page ${pages + 1}`;
					break;
				}
				for (const e of arr(d.data?.events).map(obj))
					for (const x of arr(e.topics))
						if (typeof x === "string" && CRE.test(x) && x !== t) {
							found.add(x);
							first.set(x, String(e.close_time)); // newest first: the last write is the oldest
						}
				pages++;
				const cur = str(d.data?.next_cursor);
				if (!cur) {
					state = "complete";
					break;
				}
				url = `/contracts/${t}?limit=500&cursor=${cur}`;
			}
			swept.set(t, { found, first, pages, state });
		},
	);
	// discovery 2: candidates
	const glob = new Set<string>();
	for (const r of reg.values())
		for (const c of r.contracts) glob.add(String(c.contract_id));
	for (const r of protoRaws) glob.add(r.pool);
	const slContracts = await slPaged("/contracts", "contracts");
	for (const c of slContracts) glob.add(String(c.contractId));
	const top = await si("/contracts?days=365&limit=500");
	for (const c of arr(top.data?.contracts).map(obj))
		glob.add(String(c.contract_id));
	// Public directory labels, cached per contract (the chunk reads are cached too).
	const dirLabel = new Map<string, Record<string, unknown>>();
	const labelled = async (ids: string[]) => {
		const todo = [...new Set(ids)].filter((c) => !dirLabel.has(c)).sort();
		for (let i = 0; i < todo.length; i += 100) {
			const chunk = todo.slice(i, i + 100);
			const d = await si(`/directory?addresses=${chunk.join(",")}`);
			for (const c of chunk) dirLabel.set(c, obj(obj(d.data?.entries)[c]));
		}
	};
	// A labelled contract a whole-history sweep saw move any swept token is a
	// candidate for every token (a lending hub found through one small token
	// is checked for the large ones too).
	const sweptAll = [
		...new Set([...swept.values()].flatMap((s) => [...s.found])),
	];
	await labelled(sweptAll);
	for (const c of sweptAll) if (dirLabel.get(c)?.name) glob.add(c);
	const inter = new Map<string, Set<string>>();
	await pmap(live, 4, async (t) => {
		const d = await si(`/contracts/${t}/interactions?days=365&limit=200`);
		inter.set(
			t,
			new Set(arr(d.data?.interactions).map((x) => String(obj(x).contract_id))),
		);
	});
	// balances: the token's Balance(holder) entry
	const pairs: Array<[string, string]> = [];
	for (const t of live) {
		const cands = new Set([
			...glob,
			...(inter.get(t) ?? []),
			...(swept.get(t)?.found ?? []),
			// every contract a live holder row was read at: an absence ends a row
			// only after its own balance was read again
			...(prior.get(t) ?? []),
		]);
		for (const c of [...cands].sort())
			if (CRE.test(c) && c !== t) pairs.push([t, c]);
	}
	console.log(
		`holder sweep: ${live.length} tokens, ${glob.size} global candidates, ${pairs.length} balance keys`,
	);
	// cached like every other read, so --replan judges archived entries alike
	let latest = cached<number>("rpc", "latestLedger") ?? null;
	if (latest === null && !REPLAN) {
		latest =
			(await new rpc.Server(MAINNET_RPC).getLatestLedger().catch(() => null))
				?.sequence ?? null;
		if (latest !== null) store("rpc", "latestLedger", latest);
	}
	const got = await balances(pairs);
	const failedTokens = new Set([...got.failed].map((k) => k.split("|")[0]));
	for (const t of live) if (!failedTokens.has(t)) checked.add(`holders:${t}`);
	for (const t of failedTokens)
		notes.push(
			`holders:${t}: some balance reads failed, so none of its holder rows is ended this run`,
		);
	const regEdge = new Set(protoRaws.map((r) => `${r.pool}|${r.token}`));
	const holdings: Array<{
		t: string;
		c: string;
		balance: string;
		live: boolean;
		basis: string;
	}> = [];
	for (const [k, v] of got.out) {
		const [t, c] = k.split("|");
		if (v.raw === "0" || regEdge.has(`${c}|${t}`)) continue; // a registry pool edge is never duplicated
		let raw = v.raw;
		let basis = "SAC Balance entry";
		if (ident.get(t)?.tokenKind === "custom") {
			const s = await simulate(t, "balance", [addr(c)]);
			if (!s?.ok) continue;
			raw = String(s.value);
			basis = "token balance()";
			if (raw === "0") continue;
		}
		const isLive =
			latest === null || v.liveUntil === null || v.liveUntil >= latest;
		holdings.push({
			t,
			c,
			balance: toDecimal(raw, ident.get(t)?.decimals ?? 7),
			live: isLive,
			basis: isLive
				? basis
				: `${basis} (archived entry: evicted from live state, restorable)`,
		});
	}
	// attribution, strongest first; equal evidence for two projects attributes nothing
	const holders = [...new Set(holdings.map((h) => h.c))];
	const ev = new Map<
		string,
		Array<{ slug: string; basis: string; rank: number }>
	>();
	const push = (
		c: string,
		slug: string | null,
		basis: string,
		rank: number,
	) => {
		if (slug) ev.set(c, [...(ev.get(c) ?? []), { slug, basis, rank }]);
	};
	for (const [name, r] of reg)
		for (const c of r.contracts)
			push(
				String(c.contract_id),
				slugOk.get(name)?.slug ?? null,
				`stellarindex registry: ${name}`,
				1,
			);
	await labelled(holders);
	for (const c of holders) {
		const l = dirLabel.get(c) ?? {};
		if (!l.name || !l.domain) continue;
		const who = await projectByDomain(
			String(l.name),
			domainOf(String(l.domain)),
		);
		push(
			c,
			who.slug,
			`public directory label "${l.name}" (${l.domain}); ${who.basis}`,
			2,
		);
	}
	// The on-chain map's link as /api/contracts serves it: strong ranks with
	// the registry, labelled with a label; one the weekly check ended is
	// skipped. A row the map does not hold ranks lowest, on its project.
	for (const c of slContracts) {
		const m = mapEvidence(c.attribution);
		if (m === "ended") continue;
		if (m) push(String(c.contractId), m.slug, m.basis, m.rank);
		else
			push(
				String(c.contractId),
				str(obj(c.project).slug),
				`stellarlight /api/contracts (${c.contractBasis})`,
				3,
			);
	}
	const attribute = (c: string) => {
		const cands = ev.get(c) ?? [];
		if (!cands.length)
			return {
				slug: null as string | null,
				basis: "no attribution evidence",
				direct: false,
			};
		const best = Math.min(...cands.map((x) => x.rank));
		const top = new Set(
			cands.filter((x) => x.rank === best).map((x) => x.slug),
		);
		if (top.size > 1)
			return {
				slug: null,
				basis: `conflict: ${[...new Set(cands.map((x) => `${x.slug} (${x.basis})`))].join("; ")}`,
				direct: false,
			};
		const slug = [...top][0];
		return {
			slug,
			basis: [
				...new Set(cands.filter((x) => x.slug === slug).map((x) => x.basis)),
			].join("; "),
			direct: true,
		};
	};
	// family: the same code as exactly one project's attributed contract
	const attributed = [...ev.keys()].filter((c) => attribute(c).slug);
	const wasm = new Map<string, string | null>();
	const ins = await instances([...new Set([...holders, ...attributed])]);
	for (const [c, i] of ins.found) wasm.set(c, i.wasm);
	const fam = new Map<string, Set<string>>();
	for (const c of attributed) {
		const w = wasm.get(c);
		const s = attribute(c).slug;
		if (w && s) fam.set(w, new Set([...(fam.get(w) ?? []), `${s}|${c}`]));
	}
	const dexSlugs = new Set(
		[...reg]
			.filter(([, r]) => ["amm", "dex"].includes(r.category))
			.map(([n]) => slugOk.get(n)?.slug)
			.filter((s): s is string => !!s),
	);
	await pmap(holders, 4, (c) => si(`/contracts/${c}?limit=500`));
	const out: Edge[] = [];
	for (const h of holdings) {
		let who = attribute(h.c);
		const w = wasm.get(h.c);
		const f = w ? [...(fam.get(w) ?? [])] : [];
		if (
			!who.slug &&
			!who.basis.startsWith("conflict") &&
			f.length &&
			new Set(f.map((x) => x.split("|")[0])).size === 1
		) {
			const [s, ref] = f.sort()[0].split("|");
			who = {
				slug: s,
				basis: `family: same wasm ${w?.slice(0, 12)} as ${ref} (${s}); a shared code's instances can be run by another team`,
				direct: false,
			};
		}
		const a = await (async () => {
			const d = await si(`/contracts/${h.c}?limit=500`);
			const evs = arr(d.data?.events).map(obj);
			const n = evs.filter((e) => String(e.close_time ?? "") >= CUT).length;
			return {
				n: d.ok ? n : null,
				basis: d.ok
					? n === 500
						? "lower bound: page of 500 all inside window"
						: "stellarindex /contracts events in window"
					: "could-not-check",
				last: str(evs[0]?.close_time),
				readAt: d.readAt,
			};
		})();
		const usd = usdOf(h.balance, price.get(h.t));
		const tier = holderTier({
			projectSlug: who.slug,
			direct: who.direct,
			dexProject: !!who.slug && dexSlugs.has(who.slug),
			label: str(dirLabel.get(h.c)?.name),
			events90d: a.n,
			eventsBasis: a.basis,
			usd,
		});
		const unread = edgeUnread(tier.tier, a.n === null ? a.basis : null, [
			leg(h.t, ident.get(h.t)?.code ?? h.t, h.balance),
		]);
		const first =
			swept.get(h.t)?.state === "complete"
				? (swept.get(h.t)?.first.get(h.c) ?? null)
				: null;
		out.push({
			token: h.t,
			kind: who.slug ? "holder" : "holder_unattributed",
			venue: "holder",
			projectSlug: who.slug,
			attributionBasis: who.basis,
			pool: h.c,
			method: `holder sweep (${[swept.get(h.t)?.found.has(h.c) ? "token event history" : "", inter.get(h.t)?.has(h.c) ? "token interactions" : "", glob.has(h.c) ? "global candidate set" : ""].filter(Boolean).join("; ")})`,
			source: `holders:${h.t}`,
			firstAt: first,
			firstBasis: first
				? "first event in the token's full history naming the holder"
				: "not read (token history too large to sweep, or the holder is named in no event)",
			lastSeenAt: a.last,
			events90d: a.n,
			events90dBasis: a.basis,
			balance: h.balance,
			balanceUsd: usd,
			balanceBasis: h.basis,
			depthUsd: usd,
			depthBasis: "this holding only",
			tier: tier.tier,
			tierBasis: tier.basis,
			evidenceUrl: `${SI}/contracts/${h.c}`,
			readAt: a.readAt,
			unread,
		});
	}
	// completeness per token: live holdings found against Horizon's contract total
	for (const t of live) {
		const hs = holdings.filter((h) => h.t === t);
		const foundLive = hs.filter((h) => h.live).map((h) => h.balance);
		const exactSum = foundLive.length ? addDecimals(foundLive) : "0";
		const h = hz.get(t);
		const sw = swept.get(t);
		sweeps.set(t, {
			sweep: sw
				? sw.state
				: `candidates only (history too large to read whole: ${ledgers.get(t) ?? "?"} active ledgers)`,
			holdersFound: hs.length,
			foundAmountLive: exactSum,
			archivedHoldings: hs.filter((x) => !x.live).length,
			horizonContracts: h?.n ?? null,
			horizonContractsAmount: h?.amount ?? null,
			coveredPct:
				h && Number(h.amount) > 0
					? Math.round((Number(exactSum) / Number(h.amount)) * 10_000) / 100
					: null,
			readAt: RUN_AT,
		});
	}
	return out;
}

/** Account holders: the on-chain map's accounts as the project rows serve
 * them (read with attributionsOf, the reader /api/contracts uses for
 * contracts, so tier, family sharing and endedAt are the lane's), holding a
 * priority classic asset on Horizon, tiered on this holding. The map file
 * only says which rows to read. */
async function accountSweep(
	priority: string[],
	ident: Map<string, TokenIdentity>,
	price: Map<string, number>,
	checked: Set<string>,
	notes: string[],
): Promise<Edge[]> {
	const wanted = new Map<string, string>();
	for (const t of priority) {
		const i = ident.get(t);
		if (i?.code && i.issuer?.startsWith("G"))
			wanted.set(`${i.code}:${i.issuer}`, t);
	}
	if (!wanted.size) return [];
	let failed = 0;
	const rows: DirProject[] = [];
	const slugs = new Set(
		onchainMap.links.filter((l) => l.kind === "account").map((l) => l.slug),
	);
	for (const s of [...slugs].sort()) {
		const p = await projectBySlug(s);
		if (p) rows.push(p);
		else {
			failed++;
			notes.push(`account holders: no directory row ${s} found`);
		}
	}
	const links = attributionsOf(rows, "accounts");
	const out: Edge[] = [];
	for (const g of [...links.keys()].sort()) {
		const m = mapEvidence(links.get(g)?.attribution);
		if (!m || m === "ended") continue;
		const r = await get(`${HORIZON}/accounts/${g}`);
		if (r.status === 404) continue; // merged away: holds nothing
		if (r.status !== 200) {
			failed++;
			continue;
		}
		const hs = accountHoldings(r.data, wanted);
		if (!hs.length) continue;
		const ops = await get(
			`${HORIZON}/accounts/${g}/operations?order=desc&limit=200`,
		);
		const recs = arr(obj(obj(ops.data)._embedded).records).map(obj);
		const n =
			ops.status === 200
				? recs.filter((x) => String(x.created_at ?? "") >= CUT).length
				: null;
		const basis =
			n === null
				? `could-not-check (http ${ops.status})`
				: n === 200
					? "lower bound: page of 200 all inside window"
					: "horizon operations affecting the account in window";
		for (const h of hs) {
			const usd = usdOf(h.balance, price.get(h.token));
			// an account is never a pool or vault: the market floors only
			const tier = holderTier({
				projectSlug: m.slug,
				direct: true,
				dexProject: false,
				label: null,
				events90d: n,
				eventsBasis: basis,
				usd,
			});
			const unread = edgeUnread(tier.tier, n === null ? basis : null, [
				leg(h.token, ident.get(h.token)?.code ?? h.token, h.balance),
			]);
			out.push({
				token: h.token,
				kind: "holder",
				venue: "account",
				projectSlug: m.slug,
				attributionBasis: m.basis,
				pool: g,
				method: "horizon /accounts balances (an on-chain map account)",
				source: `account-holders:${h.token}`,
				firstAt: null,
				firstBasis: "not read (when an account began holding is not read)",
				lastSeenAt: str(recs[0]?.created_at),
				events90d: n,
				events90dBasis: basis,
				balance: h.balance,
				balanceUsd: usd,
				balanceBasis: "horizon /accounts balance",
				depthUsd: usd,
				depthBasis: "this holding only",
				tier: tier.tier,
				tierBasis: tier.basis,
				evidenceUrl: `${HORIZON}/accounts/${g}`,
				readAt: r.readAt,
				unread,
			});
		}
	}
	if (failed)
		notes.push(
			`account holders: ${failed} read(s) failed, so no account holder row is ended this run`,
		);
	else for (const t of wanted.values()) checked.add(`account-holders:${t}`);
	return out;
}

function summary(
	rows: IntegrationRow[],
	plan: ReturnType<typeof planWrites>,
	notes: string[],
) {
	const f = process.env.GITHUB_STEP_SUMMARY;
	if (!f) return;
	const by = new Map<string, number>();
	for (const r of rows)
		by.set(`${r.kind}|${r.tier}`, (by.get(`${r.kind}|${r.tier}`) ?? 0) + 1);
	appendFileSync(
		f,
		[
			`### Token integrations ${EXECUTE ? "execute" : REPLAN ? "re-plan" : "dry run"} (${RUN_AT})`,
			`rows ${rows.length}; plan: create ${plan.create.length}, update ${plan.update.length}, end ${plan.end.length}, kept unjudged ${plan.keep.length}, unchanged ${plan.unchanged}`,
			"",
			"| kind | tier | rows |",
			"|---|---|---|",
			...[...by]
				.sort()
				.map(([k, v]) => `| ${k.split("|")[0]} | ${k.split("|")[1]} | ${v} |`),
			"",
			...notes.map((n) => `- ${n}`),
			"",
		].join("\n"),
	);
}

// exitCode, never exit(0): a stomped exitCode reads as green. The exit waits
// for stdout and stderr to drain: process.exit() dropped the tail of a dry
// run's plan on the runner (run 45443354264) and still exited 0.
main()
	.then(() => exitAfterFlush(process.exitCode ?? 0))
	.catch((e) => {
		if (e instanceof InstrumentFailure) {
			console.error(
				`✗ instrument failure, nothing written (exit 2): ${e.message}`,
			);
			exitAfterFlush(2);
			return;
		}
		console.error("Fatal:", e);
		exitAfterFlush(1);
	});
