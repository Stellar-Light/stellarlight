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
	const attempts = Math.max(1, opts.attempts ?? 5);
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
		const res = await submitToTestnetHorizon(tx.toXDR());
		if (res.ok) return { ok: true, hash: res.hash, attempts: n };
		last = { ok: false, error: res.detail, resultCodes: res.resultCodes };
		if (res.resultCodes.includes("tx_bad_seq")) {
			// another instance won this sequence; back off, re-read, retry
			if (n < attempts) await sleep(backoff(n));
			continue;
		}
		if (
			res.resultCodes.length === 0 &&
			(res.status === 0 || res.status >= 500)
		) {
			// No verdict, after the bytes may have left (Horizon's 504 is
			// literally "submitted, not yet seen in a ledger"). Poll briefly,
			// then hand the uncertainty back with the hash.
			const hash = tx.hash().toString("hex");
			if (await transactionLanded(hash, opts.pollMs ?? 8_000)) {
				return { ok: true, hash, attempts: n };
			}
			return { ...last, pending: true, hash };
		}
		return last;
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
