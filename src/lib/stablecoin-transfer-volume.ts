/**
 * How much of one classic asset moved in the last 24 hours, from its token
 * contract's events on Soroban RPC (public, no key).
 *
 * Since protocol 23 (CAP-67) every movement of a classic asset emits an
 * event under its Stellar Asset Contract id, deployed or not: `transfer`
 * between two addresses that are not the issuer (payments, each leg of a
 * path payment or crossed offer, liquidity pool deposits, withdrawals and
 * swaps, claimable balances, contract calls), `mint` when the issuer sends,
 * `burn` when it receives, and `clawback`. This sums the `transfer` amounts
 * only: issuer mints and burns are left out, DEX trade legs are in, and it is
 * gross, so units moved A to B to C count twice.
 *
 * Why the RPC: Horizon's payments take no asset filter, and Stellar Index
 * serves the same events 500 to a page, where USDC moved in about 386,000
 * events over the 24 hours to 2026-11-24 02:00Z (about 770 pages). The RPC
 * serves 10,000 a page and keeps 7 days: 39 pages, about 70 seconds. The two
 * agreed event for event on USDC ledgers 65639600 to 65639700.
 *
 * null = not measured: the window could not be fixed, a page failed, or an
 * amount could not be read. 0 = read through, and nothing was transferred.
 *
 * ponytail: every six-hourly run re-reads the whole 24 hours (about 250 MB
 * of events for USDC); keep per-run sums on the row if the RPC objects or a
 * run nears the workflow's timeout.
 */
import { Asset, Networks, scValToNative, xdr } from "@stellar/stellar-sdk";
import { MAINNET_RPC } from "./contract-ownership";

/** One JSON-RPC call: its `result`, or null when it could not be read. */
export type RpcCall = (
	method: string,
	params: Record<string, unknown>,
) => Promise<Record<string, unknown> | null>;

export const rpcCall: RpcCall = async (method, params) => {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const res = await fetch(MAINNET_RPC, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"user-agent": "stellarlight-stablecoins",
				},
				body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
				signal: AbortSignal.timeout(60_000),
			});
			if (res.ok) {
				const { result } = (await res.json()) as { result?: unknown };
				return result && typeof result === "object"
					? (result as Record<string, unknown>)
					: null;
			}
			// Only a rate limit or a server error is worth a second try.
			if (res.status !== 429 && res.status < 500) return null;
		} catch {
			// a timeout or a dropped connection: tried once more
		}
		if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
	}
	return null;
};

/** The 24 hours every row of one run is summed over: ledgers from
 *  startLedger to endLedger, events closed at or after `from`. */
export interface TransferWindow {
	startLedger: number;
	endLedger: number;
	from: string;
	to: string;
}

const DAY_S = 86_400;
// Ledgers close about every 5 seconds, so this reaches a little past 24 hours
// back; the start ledger's close time is checked, never assumed.
const LEDGERS_BACK = DAY_S / 5 + 120;
const MAX_PAGES = 100;

/** The window ending at the newest ledger the RPC holds. Null when the RPC
 *  could not be read or its first ledger in reach closed inside the 24 hours
 *  (the sum would be short). */
export async function transferWindow(
	rpc: RpcCall = rpcCall,
): Promise<TransferWindow | null> {
	const latest = await rpc("getLatestLedger", {});
	const endLedger = Number(latest?.sequence);
	const toS = Number(latest?.closeTime);
	if (!Number.isInteger(endLedger) || !Number.isFinite(toS) || toS <= 0)
		return null;
	const startLedger = endLedger - LEDGERS_BACK;
	const first = await rpc("getLedgers", {
		startLedger,
		pagination: { limit: 1 },
	});
	const ledgers = first?.ledgers;
	const startS = Number(
		Array.isArray(ledgers) ? ledgers[0]?.ledgerCloseTime : Number.NaN,
	);
	if (!Number.isFinite(startS) || startS > toS - DAY_S) return null;
	return {
		startLedger,
		endLedger,
		from: new Date((toS - DAY_S) * 1000).toISOString(),
		to: new Date(toS * 1000).toISOString(),
	};
}

/** The amount of one `transfer` event's value: a bare i128, or the map
 *  {amount, to_muxed_id} a transfer to a muxed account carries. Null when
 *  the value is neither. */
export function transferAmount(valueXdr: unknown): bigint | null {
	try {
		const v = scValToNative(xdr.ScVal.fromXDR(String(valueXdr), "base64"));
		const amount = typeof v === "bigint" ? v : v?.amount;
		return typeof amount === "bigint" && amount >= 0n ? amount : null;
	} catch {
		return null;
	}
}

function eventName(topic: unknown): string | null {
	try {
		const v = xdr.ScVal.fromXDR(String(topic), "base64");
		return v.switch().name === "scvSymbol" ? v.sym().toString() : null;
	} catch {
		return null;
	}
}

/** The ledger a getEvents cursor stands at (its TOID's top 32 bits). */
function cursorLedger(cursor: unknown): number | null {
	const toid = typeof cursor === "string" ? cursor.split("-")[0] : "";
	return /^\d+$/.test(toid) ? Number(BigInt(toid) >> 32n) : null;
}

/** Units of a classic asset (7 decimals) moved by `transfer` events of its
 *  token contract inside the window, and how many events. Null when it
 *  could not be read in full. */
export async function transferVolume(
	code: string,
	issuer: string,
	w: TransferWindow,
	rpc: RpcCall = rpcCall,
): Promise<{ units: number; transfers: number } | null> {
	const contract = new Asset(code, issuer).contractId(Networks.PUBLIC);
	const fromMs = Date.parse(w.from);
	const filters = [{ type: "contract", contractIds: [contract] }];
	const limit = 10_000;
	let stroops = 0n;
	let transfers = 0;
	let cursor: string | undefined;
	for (let page = 0; page < MAX_PAGES; page++) {
		// The RPC takes a start ledger or a cursor, never both.
		const r = await rpc("getEvents", {
			filters,
			pagination: cursor ? { cursor, limit } : { limit },
			...(cursor ? {} : { startLedger: w.startLedger }),
		});
		const events = r?.events;
		if (!Array.isArray(events)) return null;
		for (const e of events) {
			if (Number(e?.ledger) > w.endLedger)
				return { units: Number(stroops) / 1e7, transfers };
			if (e?.inSuccessfulContractCall === false) continue;
			if (Date.parse(String(e?.ledgerClosedAt)) < fromMs) continue;
			if (eventName(e?.topic?.[0]) !== "transfer") continue;
			const amount = transferAmount(e?.value);
			if (amount === null) return null;
			stroops += amount;
			transfers++;
		}
		const next = typeof r?.cursor === "string" ? r.cursor : undefined;
		const at = cursorLedger(next);
		if (!next || at === null || next === cursor) return null;
		// A short page ends where the RPC stopped looking: past the window,
		// the sum is whole. A full page may stop mid-ledger, so read on.
		if (events.length < limit && at >= w.endLedger)
			return { units: Number(stroops) / 1e7, transfers };
		cursor = next;
	}
	return null;
}
