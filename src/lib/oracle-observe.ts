/**
 * Read one oracle contract from the chain (sls-029): does it exist, which
 * feeds does it serve, and when was each last written. Used by
 * scripts/refresh-oracle-feeds.ts; the RPC is injected so every parse below
 * runs in tests against XDR built with the SDK.
 *
 * Freshness comes from each provider's own getter, simulated read-only: the
 * timestamp it returns is the provider's record of when that feed's value was
 * written, so comparing it with the check time shows whether the feed is
 * being refreshed. Trinary throughout: a value, a defined "no value" answer,
 * or could-not-check. A failed RPC call is never read as a stale feed.
 */
import {
	Account,
	Address,
	BASE_FEE,
	Contract,
	Keypair,
	Networks,
	nativeToScVal,
	rpc,
	scValToNative,
	TransactionBuilder,
	xdr,
} from "@stellar/stellar-sdk";
import type { OracleProduct } from "@/data/oracle-registry";
import type {
	OracleFeedList,
	OracleFeedObservation,
	OracleFeedState,
	OracleReading,
} from "./oracle-products";

type Network = OracleProduct["network"];

/** A simulated call's answer. `code` is set when the contract itself
 * returned an error code, which is an answer; any other host error is not. */
export type CallOutcome =
	| { ok: true; value: xdr.ScVal }
	| { ok: false; code: number | null; error: string };

export interface OracleRpc {
	/** Instance storage of each id that has a contract instance; an id left
	 * out has none. Throws when the ledger read itself failed. */
	instances(
		network: Network,
		ids: string[],
	): Promise<Map<string, xdr.ScMapEntry[]>>;
	/** Read-only simulation. Throws when the simulation could not run. */
	call(
		network: Network,
		id: string,
		fn: string,
		args: xdr.ScVal[],
	): Promise<CallOutcome>;
	/** A provider-published JSON document. Throws when it could not be read. */
	json(url: string): Promise<unknown>;
}

/** What one check found. ok=false: the check could not run or could not list
 * the feeds, so the caller must not store it over an earlier reading.
 * observation is null when not even the contract instance could be read. */
export interface ObserveResult {
	ok: boolean;
	why: string | null;
	observation: OracleReading | null;
}

/** Band publishes no Stellar update interval; this bound is ours (24 hours). */
export const BAND_MAX_AGE_SECONDS = 86_400;
/** RedStone's adapter rejects values older than this in its own checked read
 * (DATA_STALENESS, 30 hours, in its published source). */
export const REDSTONE_MAX_AGE_SECONDS = 108_000;
/** The adapter's checked read returns this code for a stale value. */
const REDSTONE_STALE = 1400;
/** Chainlink proxy: NoDataPresent. */
const CHAINLINK_NO_DATA = 50;
/** Band StandardReference: no reference data for the symbol. */
const BAND_NO_DATA = 1;

/** "HostError: Error(Contract, #1400)" -> 1400; any other error -> null. */
export function contractErrorCode(error: string): number | null {
	const m = /Error\(Contract, #(\d+)\)/.exec(error);
	return m ? Number(m[1]) : null;
}

// ponytail: unit by magnitude (below 1e11 is seconds, at or above it is
// milliseconds), exact for every timestamp between 1973 and 5138.
export function toIso(raw: unknown): string | null {
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) return null;
	return new Date(n < 1e11 ? n * 1000 : n).toISOString();
}

/** Instance storage keyed by its symbol or string keys. */
function storageValue(
	storage: xdr.ScMapEntry[],
	key: string,
): xdr.ScVal | null {
	for (const e of storage) {
		const k = e.key();
		const name =
			k.switch() === xdr.ScValType.scvSymbol()
				? k.sym().toString()
				: k.switch() === xdr.ScValType.scvString()
					? k.str().toString()
					: null;
		if (name === key) return e.val();
	}
	return null;
}

/** The contract-wide last write a Reflector or Lightecho instance keeps under
 * "last_timestamp" (milliseconds for Reflector, seconds for Lightecho). */
export function instanceLastTimestamp(
	storage: xdr.ScMapEntry[],
): string | null {
	const v = storageValue(storage, "last_timestamp");
	return v ? toIso(scValToNative(v)) : null;
}

/** A token's own METADATA symbol; the native asset's contract says "native". */
export function metadataSymbol(storage: xdr.ScMapEntry[]): string | null {
	const v = storageValue(storage, "METADATA");
	if (!v) return null;
	const sym = (scValToNative(v) as { symbol?: unknown })?.symbol;
	if (typeof sym !== "string" || !sym) return null;
	return sym === "native" ? "XLM" : sym;
}

/** Contract instances out of getLedgerEntries rows. */
export function instancesFromEntries(
	entries: xdr.LedgerEntryData[],
): Map<string, xdr.ScMapEntry[]> {
	const out = new Map<string, xdr.ScMapEntry[]>();
	for (const e of entries) {
		const cd = e.contractData();
		const id = Address.fromScAddress(cd.contract()).toString();
		out.set(id, cd.val().instance().storage() ?? []);
	}
	return out;
}

/** A SEP-40 asset list: [Stellar(Address) | Other(Symbol)], each kept as the
 * ScVal the contract takes back. */
export function parseAssets(
	v: xdr.ScVal,
): Array<{ key: string; address: boolean; arg: xdr.ScVal }> {
	return (v.vec() ?? []).map((a) => {
		const [tag, inner] = a.vec() ?? [];
		const address = tag?.sym().toString() === "Stellar";
		const key = address
			? Address.fromScVal(inner).toString()
			: inner.sym().toString();
		return { key, address, arg: a };
	});
}

/** SEP-40 Option<PriceData>: the timestamp when Some, null when None. */
export function sep40Timestamp(v: xdr.ScVal): string | null {
	if (v.switch() === xdr.ScValType.scvVoid()) return null;
	return toIso((scValToNative(v) as { timestamp?: unknown })?.timestamp);
}

export function classify(
	lastUpdateAt: string | null,
	checkedAt: Date,
	maxAgeSeconds: number | null,
): OracleFeedState {
	if (!lastUpdateAt) return "no-value";
	if (maxAgeSeconds == null) return "could-not-check";
	const age = (checkedAt.getTime() - Date.parse(lastUpdateAt)) / 1000;
	return age <= maxAgeSeconds ? "updating" : "stale";
}

const newest = (xs: Array<string | null>) =>
	xs
		.filter((x): x is string => !!x)
		.sort()
		.at(-1) ?? null;

const feed = (
	key: string,
	state: OracleFeedState,
	extra: Partial<OracleFeedObservation> = {},
): OracleFeedObservation => ({
	feed: key,
	label: null,
	contractId: null,
	lastUpdateAt: null,
	state,
	...extra,
});

type Read = {
	feeds: OracleFeedObservation[] | null;
	/** where the feed list came from and as of when; null with feeds null */
	feedList: OracleFeedList | null;
	maxAgeSeconds: number | null;
	contractLast: string | null;
	why: string | null;
};

/** No feed was read: a pull model, a contract without a reader, or (with
 * `why`) a list that could not be read. */
const unread = (why: string | null): Read => ({
	feeds: null,
	feedList: null,
	maxAgeSeconds: null,
	contractLast: null,
	why,
});

/** A list read from the contract's own assets(): Stellar Lab's contract page
 * lets anyone call it again. */
export const contractFeedList = (
	p: Pick<OracleProduct, "network" | "contractId">,
	now: Date,
): OracleFeedList => ({
	basis: "contract",
	sourceUrl: `https://lab.stellar.org/r/${p.network}/contract/${p.contractId}`,
	asOf: now.toISOString(),
});

async function labelsFor(
	rpc: OracleRpc,
	network: Network,
	ids: string[],
): Promise<Map<string, string | null>> {
	const out = new Map<string, string | null>();
	if (!ids.length) return out;
	try {
		const inst = await rpc.instances(network, ids);
		for (const id of ids) {
			const s = inst.get(id);
			out.set(id, s ? metadataSymbol(s) : null);
		}
	} catch {
		// labels are display help; the feed keys are the facts
	}
	return out;
}

async function listSep40(
	p: OracleProduct,
	rpc: OracleRpc,
): Promise<
	| {
			assets: ReturnType<typeof parseAssets>;
			resolution: number | null;
			labels: Map<string, string | null>;
	  }
	| string
> {
	const a = await rpc.call(p.network, p.contractId, "assets", []);
	if (!a.ok) return `assets() failed: ${a.error.slice(0, 80)}`;
	const assets = parseAssets(a.value);
	const r = await rpc.call(p.network, p.contractId, "resolution", []);
	const resolution = r.ok ? Number(scValToNative(r.value)) : null;
	const labels = await labelsFor(
		rpc,
		p.network,
		assets.filter((x) => x.address).map((x) => x.key),
	);
	return { assets, resolution, labels };
}

/** Twice the longer of the contract's own resolution() and a heartbeat the
 * provider publishes for it; null when the contract states no resolution. */
export function sep40MaxAge(
	resolution: number | null,
	heartbeatSeconds: number | undefined,
): number | null {
	return resolution ? 2 * Math.max(resolution, heartbeatSeconds ?? 0) : null;
}

async function readSep40(
	p: OracleProduct,
	rpc: OracleRpc,
	storage: xdr.ScMapEntry[],
	now: Date,
): Promise<Read> {
	const listed = await listSep40(p, rpc);
	if (typeof listed === "string") return unread(listed);
	const maxAgeSeconds = sep40MaxAge(listed.resolution, p.heartbeatSeconds);
	const feeds: OracleFeedObservation[] = [];
	for (const a of listed.assets) {
		const label = listed.labels.get(a.key) ?? null;
		try {
			const o = await rpc.call(p.network, p.contractId, "lastprice", [a.arg]);
			if (!o.ok) {
				feeds.push(feed(a.key, "could-not-check", { label }));
				continue;
			}
			const at = sep40Timestamp(o.value);
			feeds.push(
				feed(a.key, classify(at, now, maxAgeSeconds), {
					label,
					lastUpdateAt: at,
				}),
			);
		} catch {
			feeds.push(feed(a.key, "could-not-check", { label }));
		}
	}
	return {
		feeds,
		feedList: contractFeedList(p, now),
		maxAgeSeconds,
		contractLast: instanceLastTimestamp(storage),
		why: null,
	};
}

/** Beam reads need prepaid access, so a feed's own value is not public. The
 * contract's last write is: when even that is older than the bound, no feed
 * in the contract can be newer, so every feed is stale. */
async function readBeam(
	p: OracleProduct,
	rpc: OracleRpc,
	storage: xdr.ScMapEntry[],
	now: Date,
): Promise<Read> {
	const listed = await listSep40(p, rpc);
	if (typeof listed === "string") return unread(listed);
	const maxAgeSeconds = sep40MaxAge(listed.resolution, p.heartbeatSeconds);
	const contractLast = instanceLastTimestamp(storage);
	const allStale =
		!!contractLast && classify(contractLast, now, maxAgeSeconds) === "stale";
	return {
		feeds: listed.assets.map((a) =>
			feed(a.key, allStale ? "stale" : "could-not-check", {
				label: listed.labels.get(a.key) ?? null,
			}),
		),
		feedList: contractFeedList(p, now),
		maxAgeSeconds,
		contractLast,
		why: null,
	};
}

/** Chainlink's published Stellar feed list: name, data_id (hex) and heartbeat. */
export function chainlinkFeedList(
	json: unknown,
): Array<{ name: string; dataId: string; heartbeat: number }> {
	if (!Array.isArray(json)) throw new Error("feed list is not an array");
	return json.map((f: Record<string, unknown>) => {
		const dataId = String(f?.proxyAddress ?? "");
		if (!/^0x[0-9a-f]{64}$/i.test(dataId))
			throw new Error(`feed ${String(f?.name)} has no 32-byte data_id`);
		return {
			name: String(f.name),
			dataId: dataId.toLowerCase(),
			heartbeat: Number(f.heartbeat),
		};
	});
}

async function readChainlink(
	p: OracleProduct,
	rpc: OracleRpc,
	now: Date,
): Promise<Read> {
	let list: ReturnType<typeof chainlinkFeedList>;
	try {
		list = chainlinkFeedList(await rpc.json(String(p.feedListUrl)));
	} catch (e) {
		return unread(
			`feed list unreadable: ${String((e as Error).message).slice(0, 80)}`,
		);
	}
	const beats = list.map((f) => f.heartbeat).filter((h) => h > 0);
	const maxAgeSeconds = beats.length ? 2 * Math.max(...beats) : null;
	const feeds: OracleFeedObservation[] = [];
	for (const f of list) {
		const args = [
			xdr.ScVal.scvBytes(Buffer.from(f.dataId.slice(2), "hex")),
			nativeToScVal(18, { type: "u32" }),
		];
		try {
			const o = await rpc.call(p.network, p.contractId, "latest_round", args);
			if (!o.ok) {
				feeds.push(
					feed(
						f.dataId,
						o.code === CHAINLINK_NO_DATA ? "no-value" : "could-not-check",
						{
							label: f.name,
						},
					),
				);
				continue;
			}
			const at = toIso(
				(scValToNative(o.value) as { timestamp?: unknown }).timestamp,
			);
			feeds.push(
				feed(
					f.dataId,
					// each feed against its own heartbeat in Chainlink's list
					classify(at, now, f.heartbeat > 0 ? 2 * f.heartbeat : maxAgeSeconds),
					{
						label: f.name,
						lastUpdateAt: at,
					},
				),
			);
		} catch {
			feeds.push(feed(f.dataId, "could-not-check", { label: f.name }));
		}
	}
	return {
		feeds,
		feedList: {
			basis: "provider-list",
			sourceUrl: String(p.feedListUrl),
			asOf: now.toISOString(),
		},
		maxAgeSeconds,
		contractLast: null,
		why: null,
	};
}

async function readBand(
	p: OracleProduct,
	rpc: OracleRpc,
	now: Date,
): Promise<Read> {
	if (!p.feedSeed || !p.feeds?.length)
		return unread("no seeded symbols with a source and date");
	const feeds: OracleFeedObservation[] = [];
	for (const { id } of p.feeds) {
		const key = `${id}/USD`;
		const pair = xdr.ScVal.scvVec([
			xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(id), xdr.ScVal.scvSymbol("USD")]),
		]);
		try {
			const o = await rpc.call(p.network, p.contractId, "get_reference_data", [
				pair,
			]);
			if (!o.ok) {
				feeds.push(
					feed(key, o.code === BAND_NO_DATA ? "no-value" : "could-not-check"),
				);
				continue;
			}
			const rows = scValToNative(o.value) as Array<{
				last_updated_base?: unknown;
			}>;
			const at = toIso(rows?.[0]?.last_updated_base);
			feeds.push(
				feed(key, classify(at, now, BAND_MAX_AGE_SECONDS), {
					lastUpdateAt: at,
				}),
			);
		} catch {
			feeds.push(feed(key, "could-not-check"));
		}
	}
	return {
		feeds,
		feedList: { basis: "seeded", ...p.feedSeed },
		maxAgeSeconds: BAND_MAX_AGE_SECONDS,
		contractLast: null,
		why: null,
	};
}

/** The newest write in a RedStone price history (Vec<PriceData>). */
function historyWrite(v: xdr.ScVal): string | null {
	const rows = scValToNative(v) as Array<{ write_timestamp?: unknown }>;
	return Array.isArray(rows) && rows.length
		? toIso(rows[rows.length - 1]?.write_timestamp)
		: null;
}

/** A RedStone relayer manifest: its feed ids and, where a feed has one, its
 * own price-feed contract. The manifest must name this adapter. */
export function redstoneManifestFeeds(
	json: unknown,
	adapter: string,
): Array<{ id: string; contract: string | null }> {
	const m = json as {
		adapterContract?: unknown;
		priceFeeds?: Record<string, { priceFeedAddress?: unknown }>;
	};
	if (m?.adapterContract !== adapter)
		throw new Error(`manifest names adapter ${String(m?.adapterContract)}`);
	if (!m.priceFeeds || typeof m.priceFeeds !== "object")
		throw new Error("manifest lists no priceFeeds");
	return Object.entries(m.priceFeeds).map(([id, f]) => {
		const c =
			typeof f?.priceFeedAddress === "string" ? f.priceFeedAddress : null;
		return { id, contract: c && c !== adapter ? c : null };
	});
}

async function readRedstone(
	p: OracleProduct,
	rpc: OracleRpc,
	now: Date,
): Promise<Read> {
	let list: ReturnType<typeof redstoneManifestFeeds>;
	try {
		list = redstoneManifestFeeds(
			await rpc.json(String(p.feedListUrl)),
			p.contractId,
		);
	} catch (e) {
		return unread(
			`feed list unreadable: ${String((e as Error).message).slice(0, 80)}`,
		);
	}
	const feeds: OracleFeedObservation[] = [];
	for (const f of list) {
		const contractId = f.contract;
		const id = nativeToScVal(f.id, { type: "string" });
		try {
			const o = await rpc.call(
				p.network,
				p.contractId,
				"read_price_data_for_feed",
				[id],
			);
			if (o.ok) {
				const at = toIso(
					(scValToNative(o.value) as { write_timestamp?: unknown })
						.write_timestamp,
				);
				feeds.push(
					feed(f.id, classify(at, now, REDSTONE_MAX_AGE_SECONDS), {
						contractId,
						lastUpdateAt: at,
					}),
				);
				continue;
			}
			if (o.code !== REDSTONE_STALE) {
				feeds.push(feed(f.id, "could-not-check", { contractId }));
				continue;
			}
			// The adapter's own check called it stale; its history (no check)
			// still says when it was last written, where the adapter has one.
			const h = await rpc.call(p.network, p.contractId, "read_price_history", [
				id,
				nativeToScVal(1, { type: "u32" }),
			]);
			feeds.push(
				feed(f.id, "stale", {
					contractId,
					lastUpdateAt: h.ok ? historyWrite(h.value) : null,
				}),
			);
		} catch {
			feeds.push(feed(f.id, "could-not-check", { contractId }));
		}
	}
	return {
		feeds,
		feedList: {
			basis: "provider-list",
			sourceUrl: String(p.feedListUrl),
			asOf: now.toISOString(),
		},
		maxAgeSeconds: REDSTONE_MAX_AGE_SECONDS,
		contractLast: null,
		why: null,
	};
}

/** Check one registry contract. Never throws. */
export async function observeOracle(
	p: OracleProduct,
	rpc: OracleRpc,
	now: Date,
): Promise<ObserveResult> {
	const base: OracleReading = {
		checkedAt: now.toISOString(),
		contract: "absent",
		method: p.read,
		maxAgeSeconds: null,
		lastUpdateAt: null,
		feeds: null,
		feedList: null,
	};
	let storage: xdr.ScMapEntry[] | undefined;
	try {
		storage = (await rpc.instances(p.network, [p.contractId])).get(
			p.contractId,
		);
	} catch (e) {
		return {
			ok: false,
			why: `instance read failed: ${String((e as Error).message).slice(0, 80)}`,
			observation: null,
		};
	}
	if (!storage) {
		// getLedgerEntries lists live state only. Before calling the address
		// empty, a simulated call must find no instance there at all: an
		// archived one answers with a restore instead, which is not absence.
		let probe: CallOutcome;
		try {
			probe = await rpc.call(p.network, p.contractId, "decimals", []);
		} catch (e) {
			return {
				ok: false,
				why: `absence check failed: ${String((e as Error).message).slice(0, 80)}`,
				observation: null,
			};
		}
		if (!probe.ok && /Error\(Storage, MissingValue\)/.test(probe.error))
			return { ok: true, why: null, observation: base };
		return {
			ok: false,
			why: `no live instance listed, and a call did not confirm absence: ${probe.ok ? "it answered" : probe.error.slice(0, 80)}`,
			observation: null,
		};
	}
	const present: OracleReading = { ...base, contract: "present" };
	let read: Read;
	try {
		read =
			p.read === "sep40-lastprice"
				? await readSep40(p, rpc, storage, now)
				: p.read === "reflector-beam-last-timestamp"
					? await readBeam(p, rpc, storage, now)
					: p.read === "chainlink-latest-round"
						? await readChainlink(p, rpc, now)
						: p.read === "band-reference-data"
							? await readBand(p, rpc, now)
							: p.read === "redstone-adapter-read"
								? await readRedstone(p, rpc, now)
								: unread(null);
	} catch (e) {
		return {
			ok: false,
			why: `feed listing failed: ${String((e as Error).message).slice(0, 80)}`,
			observation: present,
		};
	}
	const observation: OracleReading = {
		...present,
		feedList: read.feedList,
		maxAgeSeconds: read.maxAgeSeconds,
		lastUpdateAt: newest([
			read.contractLast,
			...(read.feeds ?? []).map((f) => f.lastUpdateAt),
		]),
		feeds: read.feeds,
	};
	if (read.why) return { ok: false, why: read.why, observation };
	// Most feeds unread is no reading: storing it would replace a good one
	// with could-not-check. Beam's per-asset reads are never public, so its
	// could-not-check is the answer, not a failure.
	const unreadFeeds = (read.feeds ?? []).filter(
		(f) => f.state === "could-not-check",
	).length;
	if (
		p.read !== "reflector-beam-last-timestamp" &&
		read.feeds?.length &&
		unreadFeeds > read.feeds.length / 2
	)
		return {
			ok: false,
			why: `${unreadFeeds} of ${read.feeds.length} feeds could not be read`,
			observation,
		};
	return { ok: true, why: null, observation };
}

/** The public RPCs answer 429 under load: back off and try again before a
 * read counts as failed. Only a thrown request is retried; an answer is not. */
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
	for (let i = 1; ; i++) {
		try {
			return await fn();
		} catch (e) {
			if (i >= tries) throw e;
			await new Promise((r) => setTimeout(r, 2000 * i));
		}
	}
}

const PASSPHRASE: Record<Network, string> = {
	mainnet: Networks.PUBLIC,
	testnet: Networks.TESTNET,
};

/** The live RPC: getLedgerEntries for instances, simulateTransaction for
 * calls (a random source account; nothing is signed or sent). */
export function stellarOracleRpc(
	urls: Record<Network, string> = {
		mainnet: "https://mainnet.sorobanrpc.com",
		testnet: "https://soroban-testnet.stellar.org",
	},
): OracleRpc {
	const servers = {
		mainnet: new rpc.Server(urls.mainnet),
		testnet: new rpc.Server(urls.testnet),
	};
	return {
		async instances(network, ids) {
			// ponytail: one request; getLedgerEntries takes 200 keys and the
			// largest list here (Reflector's DEX assets) is 52.
			const res = await withRetry(() =>
				servers[network].getLedgerEntries(
					...ids.map((id) => new Contract(id).getFootprint()),
				),
			);
			return instancesFromEntries(res.entries.map((e) => e.val));
		},
		async call(network, id, fn, args) {
			const tx = new TransactionBuilder(
				new Account(Keypair.random().publicKey(), "0"),
				{ fee: BASE_FEE, networkPassphrase: PASSPHRASE[network] },
			)
				.addOperation(new Contract(id).call(fn, ...args))
				.setTimeout(30)
				.build();
			return callOutcome(
				await withRetry(() => servers[network].simulateTransaction(tx)),
			);
		},
		async json(url) {
			const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
			if (!r.ok) throw new Error(`${url} answered ${r.status}`);
			return r.json();
		},
	};
}

/** A simulation response as an answer or an error. A footprint that needs a
 * restore is archived state the getter cannot read: an error, not an answer. */
export function callOutcome(
	sim: rpc.Api.SimulateTransactionResponse,
): CallOutcome {
	if (rpc.Api.isSimulationError(sim))
		return { ok: false, code: contractErrorCode(sim.error), error: sim.error };
	if (rpc.Api.isSimulationRestore(sim))
		return { ok: false, code: null, error: "archived state needs a restore" };
	const value = sim.result?.retval;
	return value
		? { ok: true, value }
		: { ok: false, code: null, error: "simulation returned no value" };
}
