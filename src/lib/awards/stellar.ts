/**
 * i³ Awards — Stellar TESTNET plumbing.
 *
 * Everything here is HARDCODED to testnet on purpose: the i³ Pilot vote is
 * a testnet exercise (like communityfund.stellar.org's vote), and no code
 * path in the awards feature may ever touch mainnet. There is no
 * passphrase/horizon config knob to misconfigure — the constants ARE the
 * safety rail. If the vote ever graduates to mainnet, that's a deliberate
 * code change with its own review, not an env flip.
 *
 * Horizon access is plain `fetch` (not the SDK's Server class) so unit
 * tests mock `globalThis.fetch` and nothing else.
 */

import { Networks } from "@stellar/stellar-sdk";

/** The ONLY network the awards feature speaks. */
export const AWARDS_NETWORK_PASSPHRASE: string = Networks.TESTNET;

export const HORIZON_TESTNET_URL = "https://horizon-testnet.stellar.org";

export const FRIENDBOT_URL = "https://friendbot.stellar.org";

/** stellar.expert explorer link for a submitted testnet transaction. */
export function testnetExplorerTxUrl(hash: string): string {
	return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

export function friendbotFundUrl(address: string): string {
	return `${FRIENDBOT_URL}/?addr=${encodeURIComponent(address)}`;
}

/**
 * Fund a testnet account through friendbot, server-side. The ballot UI used
 * to hand the voter a "Fund on testnet" tap; the eligibility route now does
 * this for a whitelisted address the moment it connects, so the voter's
 * whole experience is connect → sign. `already` = friendbot says the account
 * exists (funded between our lookup and this call) — that is success.
 * Bounded: friendbot waits for the ledger to close before answering.
 */
export async function fundViaFriendbot(
	address: string,
): Promise<{ ok: true; already: boolean } | { ok: false; error: string }> {
	try {
		const res = await fetch(friendbotFundUrl(address), {
			headers: { Accept: "application/json" },
			cache: "no-store",
			signal: AbortSignal.timeout(20_000),
		});
		if (res.ok) return { ok: true, already: false };
		const text = await res.text().catch(() => "");
		if (res.status === 400 && /already/i.test(text)) {
			return { ok: true, already: true };
		}
		return { ok: false, error: `friendbot responded ${res.status}` };
	} catch (err) {
		return { ok: false, error: `friendbot unreachable: ${String(err)}` };
	}
}

export interface HorizonAccount {
	/** Current sequence number as a string (Horizon serves it as a string). */
	sequence: string;
	/** manageData entries: key → base64-encoded value. */
	data: Record<string, string>;
	/**
	 * ed25519 signer keys with weight > 0.
	 *
	 * Not always just the master key: an account can set its master weight to
	 * 0 and delegate, or require several signers. The relay used to verify the
	 * master key alone, which refused those accounts outright even though
	 * Horizon would have accepted their ballot.
	 */
	signers: string[];
}

export type FetchAccountResult =
	| { funded: true; account: HorizonAccount }
	| { funded: false }
	| { funded: null; error: string };

/**
 * Fetch a testnet account. `funded:false` means Horizon 404 — the account
 * exists as a keypair but was never created on-network (friendbot fixes
 * that); `funded:null` means Horizon itself misbehaved.
 */
export async function fetchTestnetAccount(
	address: string,
): Promise<FetchAccountResult> {
	try {
		const res = await fetch(
			`${HORIZON_TESTNET_URL}/accounts/${encodeURIComponent(address)}`,
			{ headers: { Accept: "application/json" }, cache: "no-store" },
		);
		if (res.status === 404) return { funded: false };
		if (!res.ok) {
			return { funded: null, error: `Horizon responded ${res.status}` };
		}
		const body = (await res.json()) as {
			sequence?: string;
			data?: Record<string, string>;
			signers?: Array<{ key?: string; type?: string; weight?: number }>;
		};
		if (typeof body.sequence !== "string") {
			return {
				funded: null,
				error: "Horizon account payload missing sequence",
			};
		}
		return {
			funded: true,
			account: {
				sequence: body.sequence,
				data: body.data ?? {},
				signers: (body.signers ?? [])
					.filter(
						(sg) =>
							sg.type === "ed25519_public_key" &&
							typeof sg.key === "string" &&
							(sg.weight ?? 0) > 0,
					)
					.map((sg) => String(sg.key)),
			},
		};
	} catch (err) {
		return { funded: null, error: `Horizon unreachable: ${String(err)}` };
	}
}

export type SubmitTxResult =
	| { ok: true; hash: string }
	| { ok: false; status: number; resultCodes: string[]; detail: string };

/**
 * Relay an already-validated, signed XDR to testnet Horizon.
 * Callers MUST run validateSignedBallot first — this function only ships bytes.
 */
export async function submitToTestnetHorizon(
	signedXdr: string,
): Promise<SubmitTxResult> {
	try {
		const res = await fetch(`${HORIZON_TESTNET_URL}/transactions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body: `tx=${encodeURIComponent(signedXdr)}`,
			cache: "no-store",
		});
		// biome-ignore lint/suspicious/noExplicitAny: Horizon error envelope
		let body: any = null;
		try {
			body = await res.json();
		} catch {
			/* non-JSON Horizon reply */
		}
		if (res.ok && typeof body?.hash === "string") {
			return { ok: true, hash: body.hash };
		}
		const extras = body?.extras?.result_codes;
		const resultCodes: string[] = [
			...(typeof extras?.transaction === "string" ? [extras.transaction] : []),
			...(Array.isArray(extras?.operations) ? extras.operations : []),
		];
		return {
			ok: false,
			status: res.status,
			resultCodes,
			detail:
				typeof body?.detail === "string"
					? body.detail
					: `Horizon responded ${res.status}`,
		};
	} catch (err) {
		return {
			ok: false,
			status: 0,
			resultCodes: [],
			detail: `Horizon unreachable: ${String(err)}`,
		};
	}
}

/**
 * Fetch many testnet accounts with bounded concurrency. Shared by the tally
 * (results route) and the reconcile script so both walk Horizon the same way.
 */
export async function fetchTestnetAccounts(
	addresses: string[],
	concurrency = 10,
): Promise<Array<{ address: string; result: FetchAccountResult }>> {
	const out: Array<{ address: string; result: FetchAccountResult }> = new Array(
		addresses.length,
	);
	let next = 0;
	const workers = Array.from(
		{ length: Math.min(concurrency, addresses.length) },
		async () => {
			while (next < addresses.length) {
				const i = next++;
				out[i] = {
					address: addresses[i],
					result: await fetchTestnetAccount(addresses[i]),
				};
			}
		},
	);
	await Promise.all(workers);
	return out;
}

/**
 * The most recent successful manageData op under `prefix` on an account —
 * its tx hash and ledger close time. The reconcile script uses it so a
 * backfilled mirror row carries the REAL submission (hash + when) rather
 * than "now". Null when nothing matches in the last 200 ops or Horizon
 * misbehaves; the caller degrades to an unhashed row.
 */
export async function fetchLatestBallotOp(
	address: string,
	prefix: string,
): Promise<{ txHash: string; at: string } | null> {
	try {
		const res = await fetch(
			`${HORIZON_TESTNET_URL}/accounts/${encodeURIComponent(address)}/operations?order=desc&limit=200`,
			{ headers: { Accept: "application/json" }, cache: "no-store" },
		);
		if (!res.ok) return null;
		const body = (await res.json()) as {
			_embedded?: {
				records?: Array<{
					type?: string;
					name?: string;
					transaction_hash?: string;
					created_at?: string;
					transaction_successful?: boolean;
				}>;
			};
		};
		for (const op of body._embedded?.records ?? []) {
			if (op.type !== "manage_data" || !op.name?.startsWith(prefix)) continue;
			if (op.transaction_successful === false) continue;
			if (op.transaction_hash && op.created_at) {
				return { txHash: op.transaction_hash, at: op.created_at };
			}
		}
		return null;
	} catch {
		return null;
	}
}
