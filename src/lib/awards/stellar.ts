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

import {
	Account,
	Keypair,
	Networks,
	type Transaction,
	xdr,
} from "@stellar/stellar-sdk";

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
 * Fund a testnet account through friendbot, server-side. Nothing in the
 * ballot path funds anyone any more — the relay pays and the voter's account
 * is never touched — so the only caller left is the Tansu lane, which
 * friendbots its own maintainer key. `already` = friendbot says the account
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
 * Callers MUST validate first — this function only ships bytes.
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
 * The most recent successful manageData op under `prefix` on an account —
 * its tx hash and ledger close time. The reconcile script uses it so a
 * backfilled mirror row carries the REAL submission (hash + when) rather
 * than "now". Null when nothing matches in the last 200 ops or Horizon
 * misbehaves; the caller degrades to an unhashed row.
 */
export async function fetchLatestBallotOp(
	address: string,
	prefix: string,
	opts: { maxPages?: number } = {},
): Promise<{ txHash: string; at: string } | null> {
	// One page is 200 ops and every ballot is 3–16 of them, so a single page
	// only ever reaches the newest few dozen ballots. Walk back until found.
	// ponytail: 25 pages = 5,000 ops ≈ 300 nomination ballots; index the
	// history once per tally instead if the relay ever carries more.
	const maxPages = Math.max(1, opts.maxPages ?? 25);
	let url = `${HORIZON_TESTNET_URL}/accounts/${encodeURIComponent(address)}/operations?order=desc&limit=200`;
	try {
		for (let page = 0; page < maxPages; page++) {
			const res = await fetch(url, {
				headers: { Accept: "application/json" },
				cache: "no-store",
			});
			if (!res.ok) return null;
			const body = (await res.json()) as {
				_links?: { next?: { href?: string } };
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
			const records = body._embedded?.records ?? [];
			for (const op of records) {
				if (op.type !== "manage_data" || !op.name?.startsWith(prefix)) continue;
				if (op.transaction_successful === false) continue;
				if (op.transaction_hash && op.created_at) {
					return { txHash: op.transaction_hash, at: op.created_at };
				}
			}
			const next = body._links?.next?.href;
			if (records.length < 200 || !next) return null;
			url = next;
		}
		return null;
	} catch {
		return null;
	}
}

// ── The relay account ────────────────────────────────────────────────────
//
// Every ballot is written to ONE account we hold, under a random ballot id,
// instead of to the voter's own account. That is the whole anonymity model:
// the chain shows N unlinkable ballots on the relay; the only address→ballot
// link is the admin-gated record. The voter never funds anything and never
// submits anything — they sign an authorization the relay checks, and the
// relay pays and writes.

/** The relay's signing key, from the environment. null = not configured. */
export function relayKeypair(): Keypair | null {
	const secret = process.env.AWARDS_RELAY_SECRET?.trim();
	if (!secret) return null;
	try {
		return Keypair.fromSecret(secret);
	} catch {
		return null;
	}
}

/**
 * Horizon's ASYNC submit: Core's verdict in ~100ms instead of holding the
 * request until a ledger closes. Two relay instances that read the same
 * sequence both get PENDING here (Core silently drops the loser later) —
 * the sync endpoint reported that loser as a 30-second timeout.
 */
export type AsyncSubmit =
	| { status: "queued"; hash: string }
	| { status: "refused"; resultCodes: string[]; detail: string }
	| { status: "busy"; detail: string }
	| { status: "unknown"; detail: string };

export async function submitToTestnetHorizonAsync(
	signedXdr: string,
): Promise<AsyncSubmit> {
	try {
		const res = await fetch(`${HORIZON_TESTNET_URL}/transactions_async`, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body: `tx=${encodeURIComponent(signedXdr)}`,
			cache: "no-store",
			signal: AbortSignal.timeout(15_000),
		});
		// biome-ignore lint/suspicious/noExplicitAny: Horizon envelope
		let body: any = null;
		try {
			body = await res.json();
		} catch {
			/* non-JSON Horizon reply */
		}
		const st = typeof body?.tx_status === "string" ? body.tx_status : null;
		if (
			(st === "PENDING" || st === "DUPLICATE") &&
			typeof body?.hash === "string"
		) {
			return { status: "queued", hash: body.hash };
		}
		if (st === "TRY_AGAIN_LATER" || res.status === 503) {
			return { status: "busy", detail: "Horizon asked to try again later" };
		}
		if (st === "ERROR") {
			const codes = decodeResultCodes(
				body?.errorResultXdr ?? body?.error_result_xdr,
			);
			return {
				status: "refused",
				resultCodes: codes,
				detail: `Horizon refused: ${codes.join(", ") || "unknown code"}`,
			};
		}
		const detail =
			typeof body?.detail === "string"
				? body.detail
				: `Horizon responded ${res.status}`;
		if (res.status >= 400 && res.status < 500) {
			return { status: "refused", resultCodes: [], detail };
		}
		return { status: "unknown", detail };
	} catch (err) {
		return { status: "unknown", detail: `Horizon unreachable: ${String(err)}` };
	}
}

/** "txBadSeq" → "tx_bad_seq", the spelling the sync endpoint uses. */
const snakeCode = (name: string) =>
	name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

function decodeResultCodes(b64: unknown): string[] {
	if (typeof b64 !== "string" || !b64) return [];
	try {
		const result = xdr.TransactionResult.fromXDR(b64, "base64").result();
		const codes = [snakeCode(result.switch().name)];
		if (result.switch().name === "txFailed") {
			for (const op of result.results()) {
				try {
					codes.push(snakeCode(op.tr().value().switch().name));
				} catch {
					codes.push(snakeCode(op.switch().name));
				}
			}
		}
		return codes;
	} catch {
		return [];
	}
}

export type RelaySubmitResult =
	| { ok: true; hash: string; attempts: number }
	| {
			ok: false;
			error: string;
			resultCodes: string[];
			/** Horizon gave no verdict (timeout, 5xx, unreachable): the
			 *  transaction was handed over and may still land until its time
			 *  bound. NOT "never happened" — the caller must keep whatever it
			 *  reserved and settle it later. */
			pending?: boolean;
			hash?: string;
	  };

/** Relay writes are serialised within this instance: the relay has ONE
 *  sequence number, and two builds from the same read of it always collide.
 *  Other instances still collide; that is what the retry below is for. */
let relayChain: Promise<unknown> = Promise.resolve();

const FRIENDBOT = "https://friendbot.stellar.org";

/**
 * Build, sign and submit one transaction from the relay account, retrying on
 * a sequence conflict.
 *
 * The relay serialises every voter through one sequence number, and the app
 * runs on more than one instance: two ballots arriving together both read the
 * same sequence, one lands, the other gets tx_bad_seq. That is not a failed
 * vote — it is the normal case under load — so it is retried with a fresh
 * sequence, a few times with a jittered backoff, before it is reported. Any
 * other Horizon refusal is returned as-is — except no refusal at all: a
 * timeout or 5xx after the bytes left comes back as `pending` with the hash,
 * because the transaction may still land.
 *
 * Testnet only: an unfunded relay (first use, or after a reset) is created via
 * friendbot before the first attempt.
 */
export function submitFromRelay(
	build: (relay: Account) => Transaction,
	opts: RelaySubmitOptions = {},
): Promise<RelaySubmitResult> {
	const run = relayChain.then(() => submitFromRelayUnlocked(build, opts));
	relayChain = run.catch(() => undefined);
	return run;
}

export interface RelaySubmitOptions {
	attempts?: number;
	/** ms to wait after attempt n on a sequence conflict */
	backoffMs?: (attempt: number) => number;
	/** how long to poll for a transaction Horizon gave no verdict on */
	pollMs?: number;
}

const defaultBackoff = (attempt: number) =>
	250 * 2 ** (attempt - 1) + Math.random() * 250;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function submitFromRelayUnlocked(
	build: (relay: Account) => Transaction,
	opts: RelaySubmitOptions,
): Promise<RelaySubmitResult> {
	const kp = relayKeypair();
	if (!kp) {
		return {
			ok: false,
			error: "relay not configured (AWARDS_RELAY_SECRET)",
			resultCodes: [],
		};
	}
	// 4 × (read + submit + ≤8s poll) + backoffs stays inside the route's 60s
	const attempts = Math.max(1, opts.attempts ?? 4);
	const backoff = opts.backoffMs ?? defaultBackoff;
	let last: RelaySubmitResult = {
		ok: false,
		error: "no attempt made",
		resultCodes: [],
	};
	for (let n = 1; n <= attempts; n++) {
		let acct = await fetchTestnetAccount(kp.publicKey());
		if (acct.funded === false) {
			try {
				await fetch(`${FRIENDBOT}/?addr=${encodeURIComponent(kp.publicKey())}`);
			} catch {
				// fall through: the re-fetch below reports the truth
			}
			acct = await fetchTestnetAccount(kp.publicKey());
		}
		if (acct.funded !== true) {
			return {
				ok: false,
				error:
					acct.funded === null
						? `relay account unreachable: ${acct.error}`
						: "relay account is unfunded and friendbot did not create it",
				resultCodes: [],
			};
		}
		let tx: Transaction;
		try {
			tx = build(new Account(kp.publicKey(), acct.account.sequence));
		} catch (err) {
			// a build that throws is a bug, not a Horizon verdict: report it
			// rather than let it escape as a 500 with the caller's row reserved
			return {
				ok: false,
				error: `could not build the relay transaction: ${String(err)}`,
				resultCodes: [],
			};
		}
		tx.sign(kp);
		const hash = tx.hash().toString("hex");
		const sub = await submitToTestnetHorizonAsync(tx.toXDR());
		if (sub.status === "refused") {
			last = { ok: false, error: sub.detail, resultCodes: sub.resultCodes };
			if (!sub.resultCodes.includes("tx_bad_seq")) return last;
			// another instance won this sequence; back off, re-read, retry
			if (n < attempts) await sleep(backoff(n));
			continue;
		}
		if (sub.status === "busy") {
			last = { ok: false, error: sub.detail, resultCodes: [] };
			if (n < attempts) await sleep(backoff(n));
			continue;
		}
		// Queued — or no verdict after the bytes may have left. Wait for a
		// ledger or two.
		if (await transactionLanded(hash, opts.pollMs ?? 8_000)) {
			return { ok: true, hash, attempts: n };
		}
		// Not seen. If the relay's sequence has moved past ours, a concurrent
		// write took it and this transaction can never land: safe to build a
		// fresh one. This is how the loser of a collision finds out in
		// seconds rather than after a 30s timeout and a three-minute hold.
		const after = await fetchTestnetAccount(kp.publicKey());
		if (
			after.funded === true &&
			BigInt(after.account.sequence) >= BigInt(tx.sequence)
		) {
			last = {
				ok: false,
				error: "relay sequence taken by a concurrent write",
				resultCodes: ["tx_bad_seq"],
			};
			if (n < attempts) await sleep(backoff(n));
			continue;
		}
		// Genuinely unknown: it may still land until its time bound.
		return {
			ok: false,
			error: sub.status === "unknown" ? sub.detail : "not confirmed in time",
			resultCodes: [],
			pending: true,
			hash,
		};
	}
	return last;
}

/** Poll Horizon for a transaction by hash for up to `budgetMs`. */
async function transactionLanded(
	hash: string,
	budgetMs: number,
): Promise<boolean> {
	const until = Date.now() + budgetMs;
	for (;;) {
		try {
			const res = await fetch(`${HORIZON_TESTNET_URL}/transactions/${hash}`, {
				headers: { Accept: "application/json" },
				cache: "no-store",
			});
			if (res.ok) return true;
		} catch {
			// unreachable counts as not seen
		}
		if (Date.now() >= until) return false;
		await sleep(Math.min(2_000, until - Date.now()));
	}
}
