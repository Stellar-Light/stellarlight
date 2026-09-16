/**
 * i³ Awards — Tansu on MAINNET as the notary of a published result.
 *
 * The vote itself is classic manageData on TESTNET: one signature, tallied
 * from Horizon, mirrored to award-ballots and reconciled daily. Testnet is
 * reset 2–4× a year, so nothing on that chain is permanent — the mirror is
 * what survives. This gives the PUBLISHED RESULT a permanent, third-party-
 * verifiable home on mainnet without touching a voter: Tansu (tansu.dev,
 * Tupui's project-versioning contract) records "the latest commit hash of a
 * project". We register `stellarlight` there once and, when a round's results
 * file is committed to this public repo, `commit()` that git SHA. Anyone can
 * read `get_commit(keccak256("stellarlight"))` and open the commit on GitHub.
 *
 * Deployed-contract facts, read via Soroban RPC on 2026-09-16: 41 functions;
 * `register(maintainer, name, maintainers, url, ipfs)` (the older 5-arg form,
 * 5 XLM collateral, name ≤ 30 chars of [A-Za-z0-9]); `commit(maintainer,
 * project_key, hash)` with hash = 40 or 64 lowercase hex; `get_commit
 * (project_key) → String`. Tansu keeps only the LATEST hash per project — an
 * older round's proof is the anchoring transaction itself, which mainnet
 * history keeps forever; that is why the tx hash is recorded next to the SHA.
 */

import { keccak_256 } from "@noble/hashes/sha3";
import { contract } from "@stellar/stellar-sdk";

export const TANSU_MAINNET_CONTRACT =
	"CDXINK2T3P46M4LWK35FVIXXHJ2XHAS4FOVCGVPJ63YV5OVTM24IY5BI";
export const MAINNET_PASSPHRASE =
	"Public Global Stellar Network ; September 2015";
export const MAINNET_RPC_URL = "https://mainnet.sorobanrpc.com";
export const TANSU_PROJECT_NAME = "stellarlight";
export const TANSU_PROJECT_URL =
	"https://github.com/Stellar-Light/stellarlight";

/** What commit() accepts: a git object name, SHA-1 or SHA-256, lowercase hex. */
export const COMMIT_HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
/** register() panics outside this. */
export const TANSU_PROJECT_NAME_RULE = /^[A-Za-z0-9]{1,30}$/;

/** Tansu's project key: keccak256 of the name (NOT sha3-256 — see the test). */
export function tansuProjectKey(name: string = TANSU_PROJECT_NAME): Buffer {
	if (!TANSU_PROJECT_NAME_RULE.test(name)) {
		throw new Error(
			`invalid Tansu project name "${name}" — 1–30 chars of [A-Za-z0-9]`,
		);
	}
	return Buffer.from(keccak_256(name));
}

/**
 * Stored on award-rounds.anchor (a Payload `json` field) by the tansu-anchor
 * lane. A type alias, not an interface: aliases carry an implicit index
 * signature, which is what lets it be written into the json column as-is.
 */
export type AnchorRecord = {
	project: string;
	/** hex of tansuProjectKey(project) */
	projectKey: string;
	commitSha: string;
	/** Mainnet tx that made the commit — null only if recorded after the fact. */
	txHash: string | null;
	at: string;
};

export function tansuProjectPageUrl(name: string = TANSU_PROJECT_NAME): string {
	return `https://tansu.dev/project?name=${encodeURIComponent(name)}`;
}
export function mainnetExplorerTxUrl(hash: string): string {
	return `https://stellar.expert/explorer/public/tx/${hash}`;
}
export function mainnetExplorerContractUrl(
	id: string = TANSU_MAINNET_CONTRACT,
): string {
	return `https://stellar.expert/explorer/public/contract/${id}`;
}

export type ChainState = "ok" | "unregistered" | "error";

export type AnchorVerdict =
	| { anchored: true; sha: string }
	| {
			anchored: false;
			reason: "not-anchored" | "not-registered" | "superseded" | "unreadable";
	  };

/**
 * Pure: what we recorded vs what the chain says now. `superseded` = the
 * project's latest hash has moved past this round's; the anchoring tx (kept
 * on the record) is still the permanent proof.
 */
export function anchorVerdict(
	expected: string | null,
	onChain: string | null,
	state: ChainState,
): AnchorVerdict {
	if (state === "error") return { anchored: false, reason: "unreadable" };
	if (state === "unregistered")
		return { anchored: false, reason: "not-registered" };
	if (!expected) return { anchored: false, reason: "not-anchored" };
	if (onChain === expected) return { anchored: true, sha: expected };
	return { anchored: false, reason: "superseded" };
}

/** A contract-level error (the contract said no) vs RPC/network trouble. */
export function classifyChainError(err: unknown): ChainState {
	return /Error\(Contract, #\d+\)/.test(String(err)) ? "unregistered" : "error";
}

/**
 * The spec-driven client hands a CONTRACT error back as an `Err` wrapper on
 * `.result` (the deployed get_project / get_commit do this for an unknown
 * project) rather than throwing; a plain value or an `Ok` wrapper is success.
 * Normalise all three so callers never touch the wrapper classes.
 */
export function unwrapResult<T>(
	r: unknown,
): { ok: true; value: T } | { ok: false; err: unknown } {
	if (typeof contract.Err === "function" && r instanceof contract.Err) {
		return { ok: false, err: r.error };
	}
	if (typeof contract.Ok === "function" && r instanceof contract.Ok) {
		return { ok: true, value: r.unwrap() as T };
	}
	if (
		r &&
		typeof r === "object" &&
		"error" in r &&
		typeof (r as { unwrap?: unknown }).unwrap === "function"
	) {
		return { ok: false, err: (r as { error: unknown }).error };
	}
	return { ok: true, value: r as T };
}

export interface TansuProject {
	name: string;
	maintainers: string[];
	config: { url: string; ipfs: string };
}

/**
 * The spec-driven client has no static types; this is the slice we call.
 * Methods resolve to an AssembledTransaction (simulated); `.result` is the
 * simulated return value, `.signAndSend()` submits.
 */
export interface TansuClient {
	get_project(a: {
		project_key: Buffer;
	}): Promise<contract.AssembledTransaction<TansuProject>>;
	get_commit(a: {
		project_key: Buffer;
	}): Promise<contract.AssembledTransaction<string>>;
	register(a: {
		maintainer: string;
		name: string;
		maintainers: string[];
		url: string;
		ipfs: string;
	}): Promise<contract.AssembledTransaction<Buffer>>;
	commit(a: {
		maintainer: string;
		project_key: Buffer;
		hash: string;
	}): Promise<contract.AssembledTransaction<null>>;
}

export async function tansuClient(
	opts: { publicKey?: string } & Partial<contract.ClientOptions> = {},
): Promise<TansuClient> {
	const c = await contract.Client.from({
		contractId: TANSU_MAINNET_CONTRACT,
		rpcUrl: MAINNET_RPC_URL,
		networkPassphrase: MAINNET_PASSPHRASE,
		...opts,
	});
	return c as unknown as TansuClient;
}
