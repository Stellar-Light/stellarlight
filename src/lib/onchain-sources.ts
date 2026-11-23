/**
 * On-chain readings for directory rows, from sources that answer without a
 * key or a payment. stellar.expert's API went paid on 2026-11-06 and the
 * refresh lane froze every row at 2026-11-03.
 *
 *   Horizon /assets (horizon-supply.ts)  supply and trustlines of an asset
 *   Stellar Index, api.stellarindex.io   accounts holding a balance; per
 *                                        contract the last event, the count
 *                                        of ledgers with an event and the
 *                                        TTL state
 *   Soroban RPC + GitHub attestations    the repo a deployed WASM is attested
 *                                        to (contract-ownership.ts)
 *
 * No free source holds an asset's lifetime payment and trade counts, or a
 * contract's event total, sub-call count and storage size. Those fields are
 * gone from the row, not zeroed.
 *
 * Checked 2026-11-22 against the 41 rows frozen at 2026-11-03 (27 assets, 68
 * contracts). Horizon's supply is the sum of the balances the ledger holds
 * outside the issuer; it is within 1 percent of the explorer's last figure
 * on 18 of the 27 assets. The larger moves since are real mints and burns
 * (BENJI, GYEN, ZUSD), and on VCHF it reads 2,974 where the explorer read
 * 7,292 with no movement in between: the explorer's figure was not a balance
 * sum, so the series is not continuous there. The trustline count continues
 * the explorer's. The index counts accounts that hold a balance; the
 * explorer also counted contracts that hold one, so KALE reads 10,118 where
 * the explorer read 13,411. A contract's creation date is not read here: the
 * index's first code version is later than the creation the explorer
 * recorded on 6 of 64 contracts, so the lane keeps the date a row already
 * holds.
 *
 * What an event date can and cannot say, measured 2026-11-22 against the
 * explorer's last weekly deltas for the 68 tracked contracts: the index's
 * last event agreed with the explorer's event counter on 63 of 63 comparable
 * contracts, 13 contracts were used that week by sub-calls alone, with no
 * event (KALE's farm: 20 million calls), and for 2 contracts the explorer had
 * counted a few events (17 and 4) where the index holds none. So an event
 * proves use on its date, and no event is not proof of silence.
 *
 * Every reader returns null when it could not read, never a zero. The
 * caller passes its own fetcher (one that retries and paces), so nothing
 * here touches the network by itself.
 */
import { Asset, Networks } from "@stellar/stellar-sdk";
import {
	instanceKey,
	MAINNET_RPC,
	readLedgerEntries,
} from "./contract-ownership";
import {
	HORIZON,
	horizonAssetUrl,
	supplyOfAssetRecord,
	trustlinesOfAssetRecord,
} from "./horizon-supply";
import type { Presence } from "./onchain-map";

/** GET a URL as parsed JSON; null when it could not be read. */
export type FetchJson = (url: string) => Promise<unknown | null>;

export const STELLAR_INDEX = "https://api.stellarindex.io/v1";

/** An index answer computed longer ago than this is a frozen cache entry,
 * not a reading. The index stamps `as_of` with when an answer was computed,
 * not with the age of the data under it, so this alone does not catch a
 * stalled ingestion: indexHeadAt does. */
export const MAX_SOURCE_AGE_HOURS = 72;

/** The index is behind when its newest native-asset event is older than
 * this. Healthy, it trails the network by seconds. */
export const MAX_INDEX_LAG_MINUTES = 60;

const obj = (v: unknown): Record<string, unknown> | null =>
	v && typeof v === "object" && !Array.isArray(v)
		? (v as Record<string, unknown>)
		: null;

const isoOf = (v: unknown): string | null => {
	if (typeof v !== "string" || !v) return null;
	const t = Date.parse(v);
	return Number.isNaN(t) ? null : new Date(t).toISOString();
};

/** The `data` of an index answer, or null when the answer is not one or the
 * index says its own reading is older than MAX_SOURCE_AGE_HOURS. */
function freshData(body: unknown, now: Date): Record<string, unknown> | null {
	const envelope = obj(body);
	const data = obj(envelope?.data);
	const asOf = isoOf(envelope?.as_of);
	if (!data || !asOf) return null;
	const ageHours = (now.getTime() - Date.parse(asOf)) / 3_600_000;
	return ageHours <= MAX_SOURCE_AGE_HOURS ? data : null;
}

/** Events that change a balance. An authorization or admin event is not a
 * movement of the asset. */
const MOVEMENTS = new Set(["transfer", "mint", "burn", "clawback"]);

/** The newest balance-changing event an answer lists, or null. */
function movementAt(body: unknown): string | null {
	const events = obj(obj(body)?.data)?.events;
	if (!Array.isArray(events)) return null;
	const moved = events
		.map(obj)
		.find((e) => typeof e?.topic_0 === "string" && MOVEMENTS.has(e.topic_0));
	return isoOf(moved?.close_time);
}

export interface ContractReading {
	/** The newest event the contract emitted, or null when the index holds
	 * none: never emitted one, which is not the same as never used. */
	lastEventAt: string | null;
	/** Lifetime count of ledgers in which the contract emitted an event. */
	activeLedgers: number | null;
	/** "live", or "archived" when the contract's entry has outlived its TTL
	 * and must be restored before it can run. Null when the index gave none. */
	ttlState: string | null;
}

/** GET /contracts/{id}. Null when the answer is unreadable or stale, or the
 * index does not know the contract on mainnet. */
export function contractReading(
	body: unknown,
	now: Date,
): ContractReading | null {
	const data = freshData(body, now);
	if (!data || data.exists !== true) return null;
	const activity = obj(data.activity);
	const events = Array.isArray(data.events) ? data.events.map(obj) : [];
	// The list is newest first and fresher than the activity rollup.
	const times = [activity?.last_seen, events[0]?.close_time]
		.map(isoOf)
		.filter((t): t is string => t !== null)
		.sort();
	const active = activity?.active_ledgers_total;
	const ttl = obj(data.ttl)?.state;
	return {
		lastEventAt: times.at(-1) ?? null,
		activeLedgers:
			typeof active === "number" && Number.isFinite(active) && active >= 0
				? active
				: null,
		ttlState: typeof ttl === "string" && ttl ? ttl : null,
	};
}

/** GET /assets/{code}-{issuer}/holders: accounts holding a balance of the
 * asset now. Null when the answer is unreadable or stale. */
export function holdersOf(body: unknown, now: Date): number | null {
	const n = freshData(body, now)?.holder_count;
	return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null;
}

/** One contract's activity and TTL state. Null when it could not be read. */
export async function readContract(
	address: string,
	fetchJson: FetchJson,
	now: Date,
): Promise<ContractReading | null> {
	return contractReading(
		await fetchJson(`${STELLAR_INDEX}/contracts/${address}?limit=1`),
		now,
	);
}

export interface AssetReading {
	/** Units outside the issuer, in whole units of the asset (Horizon). */
	supply: number;
	/** Open trustlines in every authorization state (Horizon). */
	trustlines: number;
	/** Accounts holding a balance now (Stellar Index). */
	holders: number;
	/** The newest transfer, mint, burn or clawback of the asset, classic
	 * payments included: every movement is an event of the asset's token
	 * contract. Null when the newest 100 events hold none, or the index
	 * holds no event for the asset. */
	lastMovementAt: string | null;
}

/** One issued asset, read whole from Horizon and the index. Null when any
 * part could not be read: a row is refreshed whole or left as it was. */
export async function readAsset(
	code: string,
	issuer: string,
	fetchJson: FetchJson,
	now: Date,
): Promise<AssetReading | null> {
	const horizon = obj(await fetchJson(horizonAssetUrl(code, issuer)));
	const records = obj(horizon?._embedded)?.records;
	const record = Array.isArray(records) ? records[0] : null;
	const supply = supplyOfAssetRecord(record);
	const trustlines = trustlinesOfAssetRecord(record);
	if (supply === null || trustlines === null) return null;
	const holders = holdersOf(
		await fetchJson(
			`${STELLAR_INDEX}/assets/${code}-${issuer}/holders?limit=1`,
		),
		now,
	);
	if (holders === null) return null;
	// The asset's token contract id is fixed by its code and issuer, deployed
	// or not, and the network files every movement of the asset under it.
	const token = new Asset(code, issuer).contractId(Networks.PUBLIC);
	const body = await fetchJson(`${STELLAR_INDEX}/contracts/${token}?limit=100`);
	if (freshData(body, now) === null) return null;
	return {
		supply,
		trustlines,
		holders,
		lastMovementAt: movementAt(body),
	};
}

/** When the index last saw the network move: the close time of the newest
 * event of the native asset's token contract, which moves in nearly every
 * ledger. A run compares it with the clock before it trusts any other date
 * the index gives. Null when the answer could not be read or lists no event. */
export async function indexHeadAt(
	fetchJson: FetchJson,
): Promise<string | null> {
	const native = Asset.native().contractId(Networks.PUBLIC);
	const data = obj(
		obj(await fetchJson(`${STELLAR_INDEX}/contracts/${native}?limit=1`))?.data,
	);
	const events = Array.isArray(data?.events) ? data.events.map(obj) : [];
	return isoOf(events[0]?.close_time);
}

/**
 * Whether each contract's instance is on mainnet, from one read-only
 * getLedgerEntries pass. The RPC lists an archived instance too (one evicted
 * from live state reads back with liveUntilLedgerSeq 0, checked 2026-11-23),
 * and an instance entry cannot be deleted, so an absent answer means the
 * address holds no contract. Null when the RPC could not be read, or when it
 * listed none of several contracts, which is the instrument (a wrong network
 * or a failing node), not the chain.
 */
export async function contractPresence(
	ids: string[],
	rpcUrl = MAINNET_RPC,
	fetchImpl: typeof fetch = fetch,
): Promise<Map<string, "present" | "absent"> | null> {
	const keyOf = new Map<string, string>();
	for (const id of new Set(ids)) {
		try {
			keyOf.set(id, instanceKey(id));
		} catch {
			// not a contract address: never asked
		}
	}
	if (!keyOf.size) return new Map();
	const found = await readLedgerEntries([...keyOf.values()], rpcUrl, fetchImpl);
	if (!found) return null;
	const out = new Map<string, "present" | "absent">();
	for (const [id, key] of keyOf)
		out.set(id, found.has(key) ? "present" : "absent");
	if (keyOf.size > 1 && ![...out.values()].includes("present")) return null;
	return out;
}

/** Whether an account exists on mainnet now: Horizon answers 404 for an
 * account that was merged or never funded. Null on any other failure. */
export async function accountPresence(
	address: string,
	fetchImpl: typeof fetch = fetch,
): Promise<Presence> {
	try {
		const res = await fetchImpl(`${HORIZON}/accounts/${address}`, {
			headers: { "user-agent": "stellarlight-onchain-enrich" },
			signal: AbortSignal.timeout(20_000),
		});
		if (res.status === 404) return "absent";
		if (!res.ok) return null;
		const body = (await res.json()) as { account_id?: unknown };
		return body.account_id === address ? "present" : null;
	} catch {
		return null;
	}
}
