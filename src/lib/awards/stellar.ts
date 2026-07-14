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

export interface HorizonAccount {
	/** Current sequence number as a string (Horizon serves it as a string). */
	sequence: string;
	/** manageData entries: key → base64-encoded value. */
	data: Record<string, string>;
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
		};
		if (typeof body.sequence !== "string") {
			return {
				funded: null,
				error: "Horizon account payload missing sequence",
			};
		}
		return {
			funded: true,
			account: { sequence: body.sequence, data: body.data ?? {} },
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
