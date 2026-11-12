/**
 * Whose deployed Soroban contract is it? The evidence stellar.expert read for
 * us until its API went paid on 2026-11-06, read directly:
 *   - mainnet RPC getLedgerEntries: the contract instance, when the RPC lists
 *     it (live, or past its live-until ledger but not yet evicted to the hot
 *     archive), and the code entry holding the WASM it runs;
 *   - SEP-55: a verifiable build writes `source_repo` ("github:owner/name")
 *     into the WASM's contractmetav0 custom section;
 *   - GitHub's build attestations for the WASM's sha256 in that repo.
 * Every reader answers null when it could not check, never an empty answer.
 * Nothing here is scanner code, so other lanes can import it.
 */
import { Contract, contract, xdr } from "@stellar/stellar-sdk";

export const MAINNET_RPC = "https://mainnet.sorobanrpc.com";

/** The ledger key of a contract's instance entry, as base64 XDR. */
export function instanceKey(contractId: string): string {
	return new Contract(contractId).getFootprint().toXDR("base64");
}

/** The ledger key of the code entry that holds the WASM with this sha256. */
export function codeKey(wasmHash: Buffer): string {
	return xdr.LedgerKey.contractCode(
		new xdr.LedgerKeyContractCode({ hash: wasmHash }),
	).toXDR("base64");
}

/** One entry of a getLedgerEntries answer; `xdr` is base64 LedgerEntryData. */
export interface LedgerEntry {
	key: string;
	xdr: string;
	lastModifiedLedgerSeq?: number;
	liveUntilLedgerSeq?: number;
}

/** getLedgerEntries over any number of keys, 100 per call. The map holds
 * every entry the RPC lists, by its key; a key it does not list has no entry.
 * The RPC serves live ledger state, so an entry evicted to the hot archive may
 * be missing. Null when any call failed: could not check. */
export async function readLedgerEntries(
	keys: string[],
	rpcUrl = MAINNET_RPC,
	fetchImpl: typeof fetch = fetch,
): Promise<Map<string, LedgerEntry> | null> {
	// The RPC refuses a request that repeats a key (two contracts can run one
	// WASM) or that has none, so ask each key once and never ask for nothing.
	const unique = [...new Set(keys)];
	const found = new Map<string, LedgerEntry>();
	for (let i = 0; i < unique.length; i += 100) {
		try {
			const res = await fetchImpl(rpcUrl, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "getLedgerEntries",
					params: { keys: unique.slice(i, i + 100) },
				}),
				signal: AbortSignal.timeout(20_000),
			});
			if (!res.ok) return null;
			const { result } = (await res.json()) as {
				result?: { latestLedger?: number; entries?: LedgerEntry[] | null };
			};
			// An answer names the ledger it read; an error answer has no result.
			if (typeof result?.latestLedger !== "number") return null;
			for (const e of result.entries ?? []) found.set(e.key, e);
		} catch {
			return null;
		}
	}
	return found;
}

/** SEP-55 meta: the key/value pairs of every contractmetav0 custom section in
 * a WASM (one build can carry several), each section a run of XDR
 * SCMetaEntry values. The bytes are the deployer's, so it never throws: a
 * malformed section ends the read with what it holds. */
export function contractMeta(wasm: Buffer): Map<string, string> {
	const meta = new Map<string, string>();
	let i = 8; // past the magic number and the version
	const uleb = () => {
		let n = 0;
		for (let shift = 0; shift < 35; shift += 7) {
			const byte = wasm[i++] ?? 0;
			n += (byte & 0x7f) * 2 ** shift;
			if (byte < 0x80) break;
		}
		return n;
	};
	// An XDR string: a uint32 length, the bytes, zero padding to 4.
	const str = (end: number): string | null => {
		if (i + 4 > end) return null;
		const start = i + 4;
		const stop = start + wasm.readUInt32BE(i);
		if (stop > end) return null;
		i = stop + ((4 - ((stop - start) % 4)) % 4);
		return wasm.toString("utf8", start, stop);
	};
	while (i < wasm.length) {
		const id = wasm[i++];
		const size = uleb();
		const end = Math.min(i + size, wasm.length);
		if (id === 0) {
			// A name never runs past its own section: a crafted length must not
			// turn into a large string to compare.
			const nameLength = uleb(); // advances i past the length itself
			const nameEnd = Math.min(i + nameLength, end);
			const name = wasm.toString("utf8", i, nameEnd);
			i = nameEnd;
			if (name === "contractmetav0") {
				// SCMetaEntry: an int32 kind, 0 (SC_META_V0), then key and val.
				while (i + 4 <= end && wasm.readInt32BE(i) === 0) {
					i += 4;
					const key = str(end);
					const val = key === null ? null : str(end);
					if (key === null || val === null) break;
					meta.set(key, val);
				}
			}
		}
		i = end;
	}
	return meta;
}

/** The repo a build's SEP-55 `source_repo` names, as lowercase owner/name,
 * ignoring case, a ".git" suffix and trailing slashes. Null when it names
 * none in the github:owner/name form; the meta is the deployer's text, so
 * only a well-formed GitHub name ever reaches a URL. */
export function sourceRepo(meta: Map<string, string>): string | null {
	const m = /^github:([a-z0-9-]+)\/([a-z0-9._-]+)$/.exec(
		(meta.get("source_repo") ?? "")
			.trim()
			.toLowerCase()
			.replace(/\/+$/, "")
			.replace(/\.git$/, ""),
	);
	return m && !/^\.+$/.test(m[2]) ? `${m[1]}/${m[2]}` : null;
}

/** How many build attestations GitHub lists for a WASM in a repo (owner/name),
 * from its first page. A 404 is GitHub's answer for none. Null when it could
 * not check: any other status (401, 403, 429, 5xx) or no answer. The token
 * is GITHUB_TOKEN or GH_TOKEN; a public repo answers without one too. */
export async function countAttestations(
	repo: string,
	wasmHash: Buffer,
	fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
	const token =
		process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
	try {
		const res = await fetchImpl(
			`https://api.github.com/repos/${repo}/attestations/sha256:${wasmHash.toString("hex")}`,
			{
				headers: {
					accept: "application/vnd.github+json",
					"user-agent": "sl-contract-ownership",
					...(token ? { authorization: `Bearer ${token}` } : {}),
				},
				signal: AbortSignal.timeout(20_000),
			},
		);
		if (res.status === 404) return 0;
		if (res.status !== 200) return null;
		const { attestations } = (await res.json()) as { attestations?: unknown };
		return Array.isArray(attestations) ? attestations.length : null;
	} catch {
		return null;
	}
}

/** The names of the functions a deployed WASM exports, from its
 * contractspecv0 section (the interface the SDK writes at build time). [] when
 * the WASM carries no readable spec: the bytes are the deployer's, so it never
 * throws. */
export function specFunctions(wasm: Buffer): string[] {
	try {
		return contract.Spec.fromWasm(wasm)
			.funcs()
			.map((f) => f.name().toString());
	} catch {
		return [];
	}
}

/** The share of a deployed WASM's exported functions a repo's own
 * #[contractimpl] source must define for the id to be source-matched (or
 * sibling-matched, for a same-owner repo it points to). Measured 2026-11-11
 * against hand labels of the 135 registry rows, on the sources a scan
 * fetches: owners holding their contract's source defined 58% to 100% of its
 * functions, consumers at most 7%, and 19% on a full-tree read (a Blend vault
 * sharing deposit and withdraw with the pool it calls). */
export const SOURCE_MATCH_MIN = 0.5;

/** Whose contract is it, on the evidence a scan holds. `claimed` is
 * sourceRepo()'s answer for the WASM and `attested` how many attestations the
 * claimed repo holds for it (0 when nothing is claimed); `deployed` is
 * specFunctions() of the WASM, `defined` the functions this repo's own
 * #[contractimpl] blocks export, and `isFork` whether GitHub lists the repo
 * as a fork.
 *   self-validated  the build names this repo, and this repo attested it.
 *   other-repo      the build names another repo, and that repo attested
 *                   it: provably not this repo's.
 *   source-matched  this repo's source defines at least SOURCE_MATCH_MIN of
 *                   the deployed functions, and the repo is not a fork (a
 *                   fork's source and README are its parent's).
 *   cited           anything else: the README names a contract this repo's
 *                   source does not define, usually one it calls.
 * ponytail: function names, not a reproducible build; a copy of the owner's
 * source under another name still matches. A WASM hash rebuilt from the
 * repo's source would close that. */
export function ownership(
	repo: string,
	claimed: string | null,
	attested: number,
	source: { deployed: string[]; defined: Set<string>; isFork: boolean },
): "self-validated" | "other-repo" | "source-matched" | "cited" {
	if (claimed && attested >= 1)
		return claimed === repo.toLowerCase() ? "self-validated" : "other-repo";
	return !source.isFork && sourceMatches(source.deployed, source.defined)
		? "source-matched"
		: "cited";
}

/** Does a source define at least SOURCE_MATCH_MIN of the deployed functions?
 * Every one of them when the WASM exports fewer than four: 18 of the 125
 * deployed specs on 2026-11-11 had three or fewer, and half of
 * `initialize` + `execute` is any contract's. Never for a WASM that exports
 * none. */
export function sourceMatches(
	deployed: string[],
	defined: Set<string>,
): boolean {
	const hits = deployed.filter((f) => defined.has(f)).length;
	if (deployed.length < 4)
		return deployed.length > 0 && hits === deployed.length;
	return hits / deployed.length >= SOURCE_MATCH_MIN;
}

/** The owner/name pairs a README links on github.com under the same owner as
 * `repo` (any case), other than `repo` itself, in README order: the team's
 * own repos it points to. */
export function sameOwnerLinks(repo: string, text: string | null): string[] {
	const [owner, name] = repo.toLowerCase().split("/");
	const out: string[] = [];
	for (const m of (text ?? "").matchAll(
		/(?<![\w.])(?:www\.)?github\.com[/:]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)/g,
	)) {
		const linked = `${m[1]}/${m[2].replace(/\.git$/, "").replace(/\.+$/, "")}`;
		const [o, n] = linked.toLowerCase().split("/");
		if (
			o === owner &&
			n &&
			n !== name &&
			// `.github` holds an owner's profile and community files, not code.
			n !== ".github" &&
			!out.some((x) => x.toLowerCase() === linked.toLowerCase())
		)
			out.push(linked);
	}
	return out;
}

/** A repo's git submodules (gitlink paths in its tree, and its .gitmodules
 * text): the same-owner GitHub repos they point to, and whether any gitlink
 * points where nothing can be read (no .gitmodules entry for it, or a URL
 * off github.com). A submodule of another owner's repo is that owner's
 * code, never a target. */
export function submoduleTargets(
	repo: string,
	gitlinks: string[],
	gitmodules: string | null,
): { targets: string[]; opaque: boolean } {
	const urlByPath = new Map<string, string>();
	for (const section of (gitmodules ?? "").split(/^\s*\[submodule\b/m)) {
		const path = /^\s*path\s*=\s*(.+?)\s*$/m.exec(section)?.[1];
		const url = /^\s*url\s*=\s*(.+?)\s*$/m.exec(section)?.[1];
		if (path && url) urlByPath.set(path, url);
	}
	const targets: string[] = [];
	let opaque = false;
	for (const path of gitlinks) {
		const url = urlByPath.get(path);
		if (!url || !/(?<![\w.])github\.com[/:]/.test(url)) {
			opaque = true;
			continue;
		}
		for (const t of sameOwnerLinks(repo, url))
			if (!targets.includes(t)) targets.push(t);
	}
	return { targets, opaque };
}
