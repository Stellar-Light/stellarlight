/**
 * Shared repo-code fetch + path-selection — the ONE unit that production scan,
 * the calibration probe, and the eval fixtures all go through, so the scored
 * input can NEVER drift between "what we tested" and "what we ship" (review P2,
 * the fixture≡production guard). Read-only: fetches GitHub blobs, no DB, no writes.
 *
 * Layout-agnostic: recursive tree → soroban crates → global top-N .rs by size
 * (biggest files hold the real logic; thin mod/manifest lib.rs rank low),
 * Cargo.tomls on a SEPARATE budget so they never starve the source-file budget.
 */

import { StrKey, xdr } from "@stellar/stellar-sdk";
import type { DepthBlob, DepthInput } from "../../src/lib/code-depth";
import {
	type CodeFacts,
	detectStellarProof,
	type ScanInput,
	type Blob as SigBlob,
	type StellarProof,
} from "../../src/lib/code-signals";
import { contractSource, isOwnSourcePath } from "../../src/lib/code-symbols";
import type { ContractBasis } from "../../src/lib/contract-basis";
import {
	codeKey,
	contractMeta,
	countAttestations,
	instanceKey,
	ownership,
	readLedgerEntries,
	sameOwnerLinks,
	sourceMatches,
	sourceRepo,
	specFunctions,
	submoduleTargets,
} from "../../src/lib/contract-ownership";
import {
	type NotePin,
	type PinRead,
	readDeclaredValue,
} from "../../src/lib/note-pins";
import { TEMPLATE_NAME_RE } from "../../src/lib/repo-grade";
import { type DepBlob, extractStellarDeps } from "../../src/lib/stellar-deps";

export interface TreeEntry {
	path: string;
	type: "blob" | "tree" | "commit";
	size?: number;
	sha: string;
}

export type Gh = (url: string) => Promise<Response>;

/** Thrown when the GitHub token is hard rate-limited with a far-off reset —
 * the scanner catches this to STOP the wave cleanly (leaving repos pending)
 * rather than mark each throttled repo as a scan error. */
export class RateLimitError extends Error {
	constructor() {
		super("RATE_LIMIT_EXHAUSTED");
		this.name = "RateLimitError";
	}
}

/** GitHub REST fetcher with rate-limit backoff. Token from GITHUB_TOKEN/GH_TOKEN. */
export function createGh(token: string): Gh {
	return async (url: string) => {
		for (let attempt = 0; attempt < 4; attempt++) {
			const res = await fetch(`https://api.github.com${url}`, {
				headers: {
					authorization: `Bearer ${token}`,
					accept: "application/vnd.github+json",
					"user-agent": "sl-code-scan",
				},
			});
			if (res.status === 403 || res.status === 429) {
				// Distinguish a HARD rate limit (remaining=0) from a plain
				// forbidden 403 (private/blocked repo). Only the former should
				// halt the wave — a forbidden repo is a genuine per-repo error.
				const remaining = res.headers.get("x-ratelimit-remaining");
				const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0) * 1000;
				const wait = Math.max(1000, reset - Date.now());
				if (remaining === "0" || res.status === 429) {
					if (wait < 60_000) {
						await new Promise((r) => setTimeout(r, wait));
						continue;
					}
					// Reset is far off — don't error out individual repos (which
					// would burn their scan slot on a rate-limit artifact, e.g.
					// stellar/rs-soroban-sdk → blob-unreadable). Signal the wave to
					// stop cleanly; the repos stay pending and retry next wave.
					throw new RateLimitError();
				}
				// Not a rate limit → a real forbidden 403; let the caller treat it
				// as an unreadable blob (per-repo error, correctly).
			}
			return res;
		}
		throw new RateLimitError();
	};
}

/** Per-repo accounting: REST calls spend the shared 5,000/hr pool the wave
 * budget guards; raw.githubusercontent.com fetches do not. */
export interface BlobAccount {
	api: number;
	raw: number;
}

/** The raw-content URL for a blob at a pinned ref — path segments encoded,
 * separators kept. Exported so the shape can be checked without a network. */
export function rawUrl(
	owner: string,
	name: string,
	ref: string,
	path: string,
): string {
	const enc = path.split("/").map(encodeURIComponent).join("/");
	return `https://raw.githubusercontent.com/${owner}/${name}/${ref}/${enc}`;
}

/**
 * Read one blob. raw.githubusercontent.com FIRST — it serves public files
 * at a pinned commit without touching the REST pool — and the git/blobs API
 * only when raw declines (private/blocked repo, odd path, transient), so
 * nothing that worked before stops working. 2026-09-01: a wave's cost was
 * ~14 REST calls per repo, ~9 of them blob reads; the pool-aware budget
 * (4,600 calls) capped a full 500-repo wave at ~330 repos. With blobs off
 * the pool a wave costs ~5 calls per repo and the tail converges.
 */
async function fetchBlob(
	gh: Gh,
	owner: string,
	name: string,
	sha: string,
	path: string,
	ref: string,
	acct: BlobAccount,
): Promise<string | null> {
	try {
		const res = await fetch(rawUrl(owner, name, ref, path), {
			headers: { "user-agent": "sl-code-scan" },
			signal: AbortSignal.timeout(20_000),
		});
		if (res.ok) {
			acct.raw++;
			const len = Number(res.headers.get("content-length") ?? 0);
			if (len > 400_000) return null; // oversize → unreadable (never a positive proof)
			const text = await res.text();
			return text.length > 400_000 ? null : text;
		}
	} catch {
		// fall through to the API path
	}
	acct.api++;
	const res = await gh(`/repos/${owner}/${name}/git/blobs/${sha}`);
	if (!res.ok) return null;
	const j = await res.json();
	if (j.encoding !== "base64" || typeof j.content !== "string") return null;
	if ((j.size ?? 0) > 400_000) return null; // oversize → treat as unreadable (never a positive proof)
	try {
		return Buffer.from(j.content, "base64").toString("utf8");
	} catch {
		return null;
	}
}

/**
 * Read each symbol a curated note pins (repo-knowledge.ts NotePin) at the
 * scanned commit, so the note's value can be checked against the code the
 * scan describes (sls-115). The symbol is read at the note's own commit
 * first: a reading counts only when it finds the note's value there, so a
 * declaration the reader misreads is unread, never a change.
 * raw.githubusercontent.com only, off the REST pool, one fetch per file and
 * commit. A 404 at scannedRef, a commit the scan just resolved, is a file that
 * is not there (missing); any other failure is unread, never a value.
 */
export async function readPinnedValues(
	full: string,
	ref: string,
	pins: NotePin[],
	get: typeof fetch = fetch,
): Promise<PinRead[]> {
	const [owner, name] = full.split("/");
	type Read =
		| { state: "read"; value: string }
		| { state: "missing" | "unread"; why: string };
	const readFile = async (
		commit: string,
		path: string,
	): Promise<{ text: string } | Read> => {
		try {
			const res = await get(rawUrl(owner, name, commit, path), {
				headers: { "user-agent": "sl-code-scan" },
				signal: AbortSignal.timeout(20_000),
			});
			if (res.status === 404)
				return { state: "missing", why: "the file is not at that commit" };
			if (!res.ok)
				return {
					state: "unread",
					why: `raw.githubusercontent.com answered ${res.status}`,
				};
			if (Number(res.headers.get("content-length") ?? 0) > 400_000)
				return { state: "unread", why: "the file is larger than 400 KB" };
			return { text: await res.text() };
		} catch (e) {
			return {
				state: "unread",
				why: `the file did not arrive (${String((e as Error).message).slice(0, 80)})`,
			};
		}
	};
	const files = new Map<string, { text: string } | Read>();
	const valueAt = async (
		commit: string,
		path: string,
		symbol: string,
	): Promise<Read> => {
		const key = `${commit}:${path}`;
		let file = files.get(key);
		if (!file) {
			file = await readFile(commit, path);
			files.set(key, file);
		}
		return "text" in file ? readDeclaredValue(file.text, symbol) : file;
	};
	const reads: PinRead[] = [];
	for (const pin of pins) {
		const at = { path: pin.path, symbol: pin.symbol, noteRef: pin.commit };
		const then = await valueAt(pin.commit, pin.path, pin.symbol);
		if (then.state !== "read" || then.value !== pin.value) {
			reads.push({
				...at,
				state: "unread",
				why: `at the note's own commit the scan reads ${then.state === "read" ? then.value : `no value (${then.why})`} where the note states ${pin.value}, so the two readings cannot be compared`,
			});
			continue;
		}
		const now = await valueAt(ref, pin.path, pin.symbol);
		reads.push(
			now.state === "read"
				? { ...at, state: "read", value: now.value }
				: { ...at, state: now.state, why: now.why },
		);
	}
	return reads;
}

/** Dirs whose manifests are read LAST under the manifest budget. */
const DEFERRED_MANIFEST_DIR =
	/(^|\/)(examples?|tests?|fixtures?|benches?|test[-_]wasms|templates?)(\/|$)/i;

/**
 * The order manifests are fetched under fetchRepoCode's 40-manifest budget:
 * product crates first (shallow before deep), example/test/fixture dirs last.
 * The tree arrives alphabetically, and `examples/` sorts before `packages/` —
 * OpenZeppelin/stellar-contracts holds 61 manifests, 53 of them under
 * examples/, so the budget was spent before a single library crate was read
 * and its sources were never sampled: the scorer graded the flagship contract
 * library on eighteen thin example wrappers (2026-09-14). Exported so the
 * selection tests can pin it.
 */
export function orderManifests<T extends { path: string }>(cargos: T[]): T[] {
	const rank = (p: string) => (DEFERRED_MANIFEST_DIR.test(p) ? 1 : 0);
	return [...cargos].sort(
		(a, b) =>
			rank(a.path) - rank(b.path) ||
			a.path.split("/").length - b.path.split("/").length ||
			(a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
	);
}

/** What one repo's manifests say it builds on.
 *  read     the tree and every chosen manifest were read; `stack` may be [].
 *  missing  the repo answered 404: deleted, renamed away, or private.
 *  error    anything else; nothing may be concluded, retry later. */
export type RepoStack =
	| { state: "read"; stack: string[] }
	| { state: "missing" }
	| { state: "error"; note: string };

/** A repo's activity: the last commit on its default branch, whether it is
 * archived, and the owner/name GitHub answers it under, lowercased (GraphQL
 * follows a rename or transfer, so after a move it is not the name asked
 * for). Absent from the result map = could not be read this time. */
export type RepoActivity =
	| {
			state: "read";
			lastCommitAt: string | null;
			archived: boolean;
			fullName?: string;
	  }
	| { state: "missing" };

const ACTIVITY_BATCH = 50;

/**
 * Activity for many repos at once over GraphQL: one query per 50 repos, so a
 * daily read of every submission repo costs a couple of dozen calls. A repo
 * GitHub reports NOT_FOUND is `missing`; a batch that fails any other way
 * leaves its repos out of the map (unknown, retried next run), never missing.
 */
export async function fetchRepoActivity(
	token: string,
	repos: string[],
	post: typeof fetch = fetch,
): Promise<Map<string, RepoActivity>> {
	const out = new Map<string, RepoActivity>();
	for (let i = 0; i < repos.length; i += ACTIVITY_BATCH) {
		const batch = repos.slice(i, i + ACTIVITY_BATCH);
		const fields = batch.map((full, j) => {
			const [owner, name] = full.split("/");
			return `r${j}: repository(owner: ${JSON.stringify(owner ?? "")}, name: ${JSON.stringify(name ?? "")}) { nameWithOwner isArchived defaultBranchRef { target { ... on Commit { committedDate } } } }`;
		});
		let body: {
			data?: Record<
				string,
				{
					nameWithOwner?: string;
					isArchived: boolean;
					defaultBranchRef: {
						target: { committedDate?: string } | null;
					} | null;
				} | null
			>;
			errors?: Array<{ type?: string; path?: string[] }>;
		};
		try {
			const res = await post("https://api.github.com/graphql", {
				method: "POST",
				headers: {
					authorization: `Bearer ${token}`,
					"content-type": "application/json",
					"user-agent": "sl-code-scan",
				},
				body: JSON.stringify({ query: `query { ${fields.join(" ")} }` }),
				signal: AbortSignal.timeout(30_000),
			});
			if (!res.ok) continue;
			body = await res.json();
		} catch {
			continue;
		}
		const notFound = new Set(
			(body.errors ?? [])
				.filter((e) => e.type === "NOT_FOUND")
				.map((e) => e.path?.[0]),
		);
		batch.forEach((full, j) => {
			const r = body.data?.[`r${j}`];
			if (r)
				out.set(full, {
					state: "read",
					lastCommitAt: r.defaultBranchRef?.target?.committedDate ?? null,
					archived: !!r.isArchived,
					...(r.nameWithOwner
						? { fullName: r.nameWithOwner.toLowerCase() }
						: {}),
				});
			else if (notFound.has(`r${j}`)) out.set(full, { state: "missing" });
		});
	}
	return out;
}

/** Vendored or built code: its manifests are someone else's dependencies. */
const VENDORED_DIR = /(^|\/)(node_modules|vendor|target)\//;
const STACK_MAX_MANIFESTS = 16;

/**
 * The Stellar packages a repo's package.json and Cargo.toml files declare
 * (extractStellarDeps' allowlist), for a repo that is not in the scan pool:
 * hackathon submissions. One REST call (the tree at HEAD); the manifests come
 * from raw.githubusercontent.com, off the REST pool. A RateLimitError from
 * `gh` propagates so the caller can stop its run cleanly.
 */
export async function fetchRepoStack(gh: Gh, full: string): Promise<RepoStack> {
	const [owner, name] = full.split("/");
	if (!owner || !name) return { state: "error", note: "not owner/name" };
	const res = await gh(`/repos/${owner}/${name}/git/trees/HEAD?recursive=1`);
	if (res.status === 404) return { state: "missing" };
	// 409 = the repository is empty: read, and it declares nothing.
	if (res.status === 409) return { state: "read", stack: [] };
	if (!res.ok) return { state: "error", note: `tree ${res.status}` };
	const body = (await res.json()) as {
		tree?: TreeEntry[];
		truncated?: boolean;
	};
	const manifests = orderManifests(
		(body.tree ?? []).filter(
			(t) =>
				t.type === "blob" &&
				/(^|\/)(package\.json|cargo\.toml)$/i.test(t.path) &&
				!VENDORED_DIR.test(t.path),
		),
	).slice(0, STACK_MAX_MANIFESTS);
	const blobs: DepBlob[] = [];
	for (const m of manifests) {
		try {
			const r = await fetch(rawUrl(owner, name, "HEAD", m.path), {
				headers: { "user-agent": "sl-code-scan" },
				signal: AbortSignal.timeout(20_000),
			});
			if (!r.ok) return { state: "error", note: `${m.path}: ${r.status}` };
			blobs.push({ path: m.path, text: await r.text() });
		} catch (e) {
			return { state: "error", note: `${m.path}: ${(e as Error).message}` };
		}
	}
	const stack = extractStellarDeps(blobs);
	// A truncated tree can hide manifests: what was found is evidence, an
	// empty result is not.
	if (body.truncated && !stack.length)
		return { state: "error", note: "tree truncated" };
	return { state: "read", stack };
}

/** THE shared, guarded path selection. Identical for probe/scanner/eval. */
export function selectDepthPaths(
	tree: TreeEntry[],
	cargoIsSoroban: Map<string, boolean>,
): {
	cargos: string[];
	sources: string[];
	tests: string[];
	jsSources: string[];
	langSources: string[];
} {
	const rs = tree.filter(
		(e) => e.type === "blob" && e.path.toLowerCase().endsWith(".rs"),
	);
	const cargos = tree.filter(
		(e) => e.type === "blob" && e.path.toLowerCase().endsWith("cargo.toml"),
	);
	const sorobanCrateDirs = cargos
		.filter((c) => cargoIsSoroban.get(c.path))
		.map((c) => c.path.replace(/\/?Cargo\.toml$/i, ""));
	const inSorobanCrate = (p: string) =>
		sorobanCrateDirs.some((d) =>
			d ? p.startsWith(`${d}/src/`) : p.startsWith("src/"),
		);
	// A repo whose crates declare NO soroban-sdk gets nothing from that gate:
	// `sorobanCrateDirs` is empty, so `inSorobanCrate` is false for every path
	// and not one source file is sampled. Measured live 2026-09-14 that is the
	// whole Rust half of the flat-0.3 population — stellar/rs-stellar-xdr,
	// rs-stellar-strkey, rs-stellar-archivist, rs-stellar-rpc-client,
	// rahul-soshte/rs-soroban-client, OpenZeppelin/openzeppelin-monitor. They
	// carry the `rust-infra` proof (stellar-xdr / soroban-client rather than
	// soroban-sdk) and the ONLY .rs the fetch returned for them were the three
	// files the TEST budget happens to pick: 4,830 lines of rs-stellar-archivist
	// and 6,635 of openzeppelin-monitor fetched, every line of it test code,
	// zero source. They are libraries and tools — exactly what depth learned to
	// grade in #1572 — and the scorer had never seen a line of them. So when
	// nothing declares soroban-sdk, fall back to every crate's src/. Repos WITH
	// a soroban crate are untouched: the narrow gate still keeps a vendored
	// example or a template under someone else's src/ out of the sample.
	const inScope = sorobanCrateDirs.length
		? inSorobanCrate
		: (p: string) => /(^|\/)src\//.test(p);
	// Test/fixture exclusion, path-segment precise. The old substring rules
	// missed test-utils/ and inline src/tests.rs (templar's generated
	// test-utils/src/pyth_price_id.rs ate a top-18 source slot) while WRONGLY
	// excluding files like latest_prices.rs (substring "test_").
	const isTest = (p: string) =>
		/(^|\/)(tests?|testing|test[-_]?utils?|fixtures?|mocks?|benches)\//i.test(
			p,
		) || // test-ish dirs
		/_tests?(\/|\.rs$)/i.test(p) || // integration_test/, foo_test(s).rs
		/(^|\/)tests?\.rs$/i.test(p) || // inline src/tests.rs
		/(^|\/)test_[^/]*\.rs$/i.test(p) || // test_foo.rs
		/\.test\./i.test(p);
	// Generated/oversize sources waste slots: >400KB blobs fetch as null anyway
	// (fetchBlob cap) and generated code isn't authored contract logic.
	const isGenerated = (p: string) =>
		/(generated|codegen|autogen)/i.test(p) || /\.pb\.rs$/i.test(p);

	const sizeRanked = rs
		.filter(
			(e) =>
				inScope(e.path) &&
				!isTest(e.path) &&
				!isGenerated(e.path) &&
				(e.size ?? 0) <= 400_000,
		)
		.sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
		.slice(0, 18)
		.map((e) => e.path);
	// Entry-file guarantee (2026-08-14, blend-contracts class): #[contractimpl]
	// blocks often live in THIN <crate>/src/contract.rs / lib.rs wrappers that
	// delegate to big logic modules — size-ranking alone never fetches them, so
	// interface extraction saw zero impl blocks on exactly the architectures
	// that separate entry from logic (blend: contract.rs 14.6KB vs 18 logic
	// files ≥15.8KB). ADDITIVE to the ranked picks (never displaces depth's
	// chosen files), ≤2 per crate, ≤12 total.
	const entryFiles = rs
		.filter(
			(e) =>
				inScope(e.path) &&
				!isTest(e.path) &&
				/\/src\/(contract|lib)\.rs$/i.test(e.path) &&
				(e.size ?? 0) <= 400_000,
		)
		.sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
		.slice(0, 12)
		.map((e) => e.path);
	const sources = [...new Set([...sizeRanked, ...entryFiles])];
	const tests = rs
		.filter((e) => isTest(e.path))
		.sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
		.slice(0, 3)
		.map((e) => e.path);
	const cargoPaths = cargos
		.filter((c) => cargoIsSoroban.get(c.path) || !c.path.includes("/"))
		.map((c) => c.path);
	// JS/TS sources (gist gap 1 phase 1): the dapp-side symbol + SDK-capability
	// facts need actual sources — previously NOTHING non-Rust was fetched. Top-8
	// by size, junk-dir/test/minified/declaration excluded, budget +8 blobs.
	const isJsJunk = (p: string) =>
		/(^|\/)(node_modules|dist|build|out|\.next|coverage|vendor|generated)\//i.test(
			p,
		) ||
		/\.(min|bundle)\.js$/i.test(p) ||
		/\.d\.ts$/i.test(p);
	// Relevance-first selection (JS calibration lesson, same class as the Rust
	// hoops case): pure top-8-by-size missed the Stellar integration files in
	// big monorepos (allbridge SDK scored zero capabilities from 20k SLOC of
	// non-Stellar files). Files whose PATH signals Stellar work rank first,
	// then size fills the rest.
	// Tiered relevance (frontier pass 2026-07-09): in a repo like
	// allbridge-core-js-sdk EVERY path contains "bridge", so a flat relevance
	// regex stops discriminating and the biggest (EVM/Tron) files displace the
	// smaller Stellar ones — 19k SLOC sampled, zero capability hits. STRONG
	// markers are unambiguous Stellar paths; WEAK are generic fintech words.
	const JS_STRONG =
		// x402/mpp added 2026-08-11: agent-payment repos keep their Stellar
		// integration under x402/mpp paths (rozo's src/routes/x402-supported.ts,
		// mpp-services/) with no "stellar" in any filename — the old markers
		// fetched admin scripts while the actual payment server went unsampled
		// (caps stayed [] even after the x402/mpp patterns shipped).
		/(stellar|soroban|srb|freighter|passkey|lobstr|albedo|xbull|sep[-_]?\d|horizon|x402|mpp)/i;
	const JS_WEAK =
		/(wallet|sign|payment|anchor|contract|bridge|tx|transaction|rpc)/i;
	const jsCandidates = tree
		.filter(
			(e) => e.type === "blob" && /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(e.path),
		)
		.filter(
			(e) => !isJsJunk(e.path) && !isTest(e.path) && (e.size ?? 0) <= 400_000,
		);
	const bySize = (a: TreeEntry, b: TreeEntry) => (b.size ?? 0) - (a.size ?? 0);
	const picked = new Set<string>();
	const take = (list: TreeEntry[], n: number) =>
		list
			.filter((e) => !picked.has(e.path))
			.sort(bySize)
			.slice(0, n)
			.map((e) => (picked.add(e.path), e.path));
	// Unused tier budget rolls forward: a repo with no strong-tier paths
	// (blend-sdk-js — no "stellar" in any filename) must still sample its
	// full 10 files, not shrink to 5.
	const strongPick = take(
		jsCandidates.filter((e) => JS_STRONG.test(e.path)),
		5,
	);
	const weakPick = take(
		jsCandidates.filter((e) => JS_WEAK.test(e.path)),
		8 - strongPick.length,
	);
	const jsSources = [
		...strongPick,
		...weakPick,
		...take(jsCandidates, 10 - strongPick.length - weakPick.length),
	];
	// Non-Rust relevance manifests: package.json/stellar.toml (JS/SEP-1) PLUS the
	// other-language Stellar SDK manifests (Swift/Kotlin/Flutter/Go/Python) so
	// code-signals can fire the lang-sdk proof instead of wrongly reading a
	// mobile wallet / native SDK as `none`. Kept shallow (≤3 deep) + capped.
	const OTHER_MANIFEST =
		/(^|\/)(package\.json|stellar\.toml|package\.swift|podfile|build\.gradle(\.kts)?|pubspec\.yaml|composer\.json|pom\.xml|libs\.versions\.toml|go\.mod|requirements\.txt|pyproject\.toml|setup\.py|setup\.cfg)$/i;
	const others = tree
		.filter((e) => e.type === "blob" && OTHER_MANIFEST.test(e.path))
		.filter((e) => e.path.split("/").length <= 3)
		.sort((a, b) => a.path.split("/").length - b.path.split("/").length) // prefer root manifests
		.slice(0, 8)
		.map((e) => e.path);
	// Language-frontier capability sources (py/go/kotlin/java): the capability
	// detector can only see text we fetch. Strong-path preference (sdk-ish
	// filenames), test-excluded, size-favored, capped — same philosophy as
	// jsSources.
	const LANG_EXT = /\.(py|go|kt|java)$/i;
	const LANG_TEST =
		/(^|\/)(tests?|testing|examples?|docs?)\/|_test\.(go|py)$|(^|\/)test_[^/]*\.py$|Tests?\.(kt|java)$/i;
	const LANG_STRONG =
		/(sep[-_]?\d+|auth|challenge|transaction|payment|soroban|rpc|client|wallet|sdk|horizon|keypair|sign|invoke|contract)/i;
	const langCandidates = tree
		.filter(
			(e) =>
				e.type === "blob" && LANG_EXT.test(e.path) && !LANG_TEST.test(e.path),
		)
		.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
	const langStrong = langCandidates
		.filter((e) => LANG_STRONG.test(e.path))
		.slice(0, 8)
		.map((e) => e.path);
	const langSources = [
		...langStrong,
		...langCandidates
			.map((e) => e.path)
			.filter((p) => !langStrong.includes(p))
			.slice(0, Math.max(0, 10 - langStrong.length)),
	];
	return {
		cargos: cargoPaths,
		sources,
		tests: [...tests, ...others],
		jsSources,
		langSources,
	};
}

export interface RepoCodeResult {
	/** Commit SHA of the default branch the tree was fetched at — pins every
	 * code fact to github.com/<full>/tree/<scannedRef>. Null if unresolvable. */
	scannedRef: string | null;
	scan: ScanInput; // → detectStellarProof
	proof: StellarProof;
	facts: CodeFacts;
	/** SAFETY-CRITICAL: error/incomplete means "could not conclude" — a proof of
	 * `none` under a non-ok outcome must never be persisted as a judgment. */
	outcome: "ok" | "error" | "incomplete";
	scanNote: string | null;
	depthInput: DepthInput; // → computeCodeDepth (v2)
	/** signals for farmScore + tier, sourced from GitHub (not the index). */
	meta: {
		isFork: boolean;
		parentFullName: string | null;
		isArchived: boolean;
		lastCommitAt: string | null;
		stars: number;
		diskUsageKb: number | null;
		tagCount: number;
		nameLooksTemplate: boolean;
	};
	/** REST calls made for this repo beyond the fixed overhead: blob reads and
	 * contract attestation checks (the ones that spend the pool). */
	pathsFetched: number;
	/** Blobs served by raw.githubusercontent.com (free of the REST pool). */
	rawFetched: number;
	contractCrates: number;
	/** The mainnet check could not run, so depthInput's contract fields are
	 * unknown, not empty: a writer keeps what it has stored. */
	mainnetContractUnread: boolean;
}

/** A README-claimed contract id that runs on Stellar MAINNET (mainnet RPC
 * finds its instance), with the evidence for whose it is. */
export type MainnetContract = {
	id: string;
	/** Whose it is (src/lib/contract-basis.ts): self-validated,
	 * source-matched and sibling-matched are this repo's deployment; cited is
	 * a contract the README names that neither this repo nor a same-owner repo
	 * it points to defines; published is a case the scan could not decide. */
	basis: ContractBasis;
};

/** The mainnet check could not run: the RPC or GitHub's attestation API gave
 * no usable answer. Not a finding that the repo has no contract: when the
 * check still asked stellar.expert, its API went paid on 2026-11-06 and its
 * 402s led 169 rescans to write null over six verified ids, Reflector's and
 * Tansu's among them. */
export const CONTRACT_UNREAD = "could-not-check" as const;

/** The mainnet check did not run: the README exists but could not be read,
 * or the contract check could not answer. A repo with no README cites no id,
 * so its null is an answer. */
export function mainnetCheckUnread(
	readmeListed: boolean,
	readmeText: string | null,
	checked: MainnetContract | null | typeof CONTRACT_UNREAD,
): boolean {
	return (readmeListed && readmeText === null) || checked === CONTRACT_UNREAD;
}

/** When this scan's mainnet check could not run, score and write with the
 * stored contract fields instead of its empty ones. Returns whether it did. */
export function keepStoredContract(
	r: Pick<RepoCodeResult, "mainnetContractUnread" | "depthInput">,
	stored: {
		mainnetContractId?: string | null;
		mainnetContractBasis?: ContractBasis | null;
	},
): boolean {
	if (!r.mainnetContractUnread) return false;
	r.depthInput.scalars.mainnetContractId = stored.mainnetContractId ?? null;
	r.depthInput.scalars.mainnetContractBasis =
		stored.mainnetContractBasis ?? null;
	return true;
}

/** A read of a repo's contract source: contractSource()'s answer, and
 * `unread`: a selected Rust file of its own source could not be read, or
 * GitHub truncated its tree, so a function it lacks may only be unread. */
export type SourceRead = ReturnType<typeof contractSource> & {
	unread: boolean;
};

/** What a scan knows about the repo's own source, whether GitHub lists it
 * as a fork, and the same-owner repos it points to (submodule targets, then
 * README links), with a reader for theirs. `opaque`: a gitlink whose target
 * cannot be read. */
export type ContractSource = SourceRead & {
	isFork: boolean;
	siblings?: {
		pointed: string[];
		opaque: boolean;
		read: (repo: string) => Promise<SourceRead | null | typeof CONTRACT_UNREAD>;
	};
};

/** Same-owner repos read per contract: SEP-55's, then submodules, then README
 * links. ponytail: a README linking more same-owner repos than this keeps
 * the rest unread, so an owner's source past the fifth reads as cited; a
 * search of the owner's repos would lift it. */
const SIBLINGS_READ = 5;
/** Rust files read from each such repo. */
const SIBLING_FILES = 60;

/** Could the deployed contract be one whose trait impls take the trait's
 * defaults? Yes when such a contract type names no function the WASM lacks:
 * its source names fewer functions than it exports, so a low match proves
 * nothing. A type that names a function the WASM does not export is another
 * contract. */
function takesDefaults(deployed: string[], defaults: Set<string>[]): boolean {
	const exported = new Set(deployed);
	return defaults.some((names) => [...names].every((n) => exported.has(n)));
}

/** Whose contract is it when this repo's own source does not define it?
 *   sibling-matched  a same-owner repo it points to defines the deployed
 *                    functions (sourceMatches).
 *   published        not decidable: a repo it points to is hidden (GitHub
 *                    answers 404, so private or gone), a submodule's target
 *                    cannot be read, or a sibling's trait impls take
 *                    functions from trait defaults.
 *   cited            every repo it points to was read whole and none defines
 *                    it, or it points to none.
 * CONTRACT_UNREAD when GitHub gave no usable answer or a sibling's read was
 * not whole. `read` caches each repo's answer across the README's ids. */
async function siblingBasis(
	repo: string,
	claimed: string | null,
	deployed: string[],
	sib: NonNullable<ContractSource["siblings"]>,
	read: Map<string, Promise<SourceRead | null | typeof CONTRACT_UNREAD>>,
): Promise<"sibling-matched" | "published" | "cited" | typeof CONTRACT_UNREAD> {
	const owner = repo.toLowerCase().split("/")[0];
	const pointed = [
		...(claimed &&
		claimed.split("/")[0] === owner &&
		claimed !== repo.toLowerCase()
			? [claimed]
			: []),
		...sib.pointed,
	]
		.filter(
			(r, i, all) =>
				all.findIndex((x) => x.toLowerCase() === r.toLowerCase()) === i,
		)
		.slice(0, SIBLINGS_READ);
	let undecided = sib.opaque;
	let partial = false;
	for (const r of pointed) {
		const key = r.toLowerCase();
		let answer = read.get(key);
		if (!answer) {
			answer = sib.read(r);
			read.set(key, answer);
		}
		const got = await answer;
		if (got === CONTRACT_UNREAD) return CONTRACT_UNREAD;
		if (got === null) undecided = true;
		else if (sourceMatches(deployed, got.defined)) return "sibling-matched";
		else {
			partial ||= got.unread;
			undecided ||= takesDefaults(deployed, got.defaults);
		}
	}
	if (partial) return CONTRACT_UNREAD;
	return undecided ? "published" : "cited";
}

/** A repo's contract source, read from its default branch: its contract and
 * lib entry files, then its largest other own-source Rust files,
 * SIBLING_FILES in all. A fork defines nothing of its own: its source is its
 * parent's. Null when GitHub does not show the repo (404: private or gone);
 * CONTRACT_UNREAD when it gave no usable answer. GitHub's redirect for a
 * moved repo is followed. */
export async function readContractFns(
	gh: Gh,
	repo: string,
	acct: BlobAccount,
): Promise<SourceRead | null | typeof CONTRACT_UNREAD> {
	acct.api++;
	const metaRes = await gh(`/repos/${repo}`);
	if (metaRes.status === 404) return null;
	if (!metaRes.ok) return CONTRACT_UNREAD;
	const meta = await metaRes.json();
	const none = { defined: new Set<string>(), defaults: [], unread: false };
	if (meta?.fork) return none;
	const full = String(meta?.full_name ?? "");
	const branch = meta?.default_branch;
	if (!full.includes("/") || !branch) return CONTRACT_UNREAD;
	acct.api++;
	const treeRes = await gh(
		`/repos/${full}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
	);
	// An empty repository has no tree: nothing it could define.
	if (treeRes.status === 404 || treeRes.status === 409) return none;
	if (!treeRes.ok) return CONTRACT_UNREAD;
	const treeBody = await treeRes.json();
	const tree: TreeEntry[] = treeBody.tree ?? [];
	const entry = (p: string) =>
		/\/src\/(contract|lib)\.rs$|^src\/(contract|lib)\.rs$/.test(p);
	const files = tree
		// fetchBlob reads a file over 400 KB as unreadable, which would leave
		// every check of this repo unread: such a file is generated, not source.
		.filter(
			(e) =>
				e.type === "blob" &&
				isOwnSourcePath(e.path) &&
				(e.size ?? 0) <= 400_000,
		)
		.sort(
			(a, b) =>
				Number(entry(b.path)) - Number(entry(a.path)) ||
				(b.size ?? 0) - (a.size ?? 0),
		)
		.slice(0, SIBLING_FILES);
	const [owner, name] = full.split("/");
	const blobs: DepthBlob[] = [];
	for (const f of files)
		blobs.push({
			path: f.path,
			text: await fetchBlob(gh, owner, name, f.sha, f.path, branch, acct),
		});
	return {
		...contractSource(blobs),
		unread: treeBody.truncated === true || blobs.some((b) => b.text === null),
	};
}

/** Resolve the mainnet contract a repo actually OWNS from the ids in its README.
 *
 * This used to accept any id that stellar.expert could resolve, which only ever
 * proved the address exists — not whose it is. A README that names the USDC SAC
 * as a config value, or the Reflector oracle it reads prices from, got that
 * address stamped in as the repo's own deployment and then published as the
 * `verified-contract-id` trust signal. Measured 2026-09-03 over the 137 live
 * rows: 19 were shared token contracts (XLM/USDC/BLND) and 8 were contracts
 * stellar.expert independently attributes to a DIFFERENT repo — 27 provably
 * wrong against 4 provably right.
 *
 * stellar.expert's API went paid on 2026-11-06, so the same rules now run on
 * evidence read directly (src/lib/contract-ownership.ts), in README order:
 *   - the RPC lists no instance => not a mainnet contract; next id. The one
 *     exception is the id this repo already holds (storedId): a contract
 *     cannot be deleted, and the RPC serves live state only, so its absence
 *     more likely means eviction to the hot archive. That reads as a check
 *     that did not run, and the scan keeps the stored id.
 *   - a Stellar Asset Contract executable => a network token wrapper, shared
 *     by everyone who mentions it and never a repo's own contract; next id.
 *   - the WASM's SEP-55 source_repo names another repo, and that repo holds
 *     a GitHub attestation for the WASM's hash => provably not this repo's:
 *     cited (the Blend pools six repos cite are attested to Blend's repo).
 *   - source_repo names this repo and this repo holds an attestation =>
 *     self-validated, and it wins at once.
 *   - anything else (no source_repo, or one nothing attests) is judged on
 *     the WASM's exported functions (contractspecv0) against the functions
 *     this repo's own #[contractimpl] source defines (`source.defined`):
 *     source-matched when it defines at least half of them and the repo is
 *     not a fork, else cited. A README cites the contracts it calls as
 *     readily as the ones it deployed: on 2026-11-11 Reflector's connector
 *     held the SushiSwap factory it reads prices from, lumenmap held
 *     Soroswap's factory, six repos held two Blend pools.
 * The answer is the first source-matched id, else the first cited one, so a
 * repo that ships a contract is never represented by an id it only cites,
 * and a cited id is kept with its basis rather than dropped.
 * A check that could not run (the RPC failed or did not answer, or GitHub
 * answered an attestation request other than 200 or 404) returns
 * CONTRACT_UNREAD at once: a later id must not stand in for one that could
 * not be read. Each attestation request counts in acct.api, the scan's
 * GitHub budget.
 */
export async function verifyMainnetContract(
	readmeText: string | null,
	repoFullName?: string | null,
	acct?: BlobAccount,
	storedId?: string | null,
	source: ContractSource = {
		defined: new Set(),
		defaults: [],
		unread: false,
		isFork: false,
	},
): Promise<MainnetContract | null | typeof CONTRACT_UNREAD> {
	// A shape with a bad checksum is no contract id: never probe it, so a typo
	// can neither end the check as unread nor take one of the three slots.
	const named = [
		...new Set(readmeText?.match(/\bC[A-Z2-7]{55}\b/g) ?? []),
	].filter((id) => StrKey.isValidContract(id));
	const ids = named.slice(0, 3);
	// The id this repo holds is judged again wherever its README still names
	// it: Kryon-Protocol/Kryon's README grew a table of eleven ids above its
	// mainnet one, and a rescan would have erased the held id unread.
	if (storedId && named.includes(storedId) && !ids.includes(storedId))
		ids.push(storedId);
	try {
		const keys = ids.map((id) => instanceKey(id));
		const instances = await readLedgerEntries(keys);
		if (!instances) return CONTRACT_UNREAD;
		const wasm = new Map<string, Buffer>();
		for (const [n, id] of ids.entries()) {
			const entry = instances.get(keys[n]);
			if (!entry) {
				if (storedId && id === storedId) return CONTRACT_UNREAD;
				continue; // not a mainnet contract
			}
			const executable = xdr.LedgerEntryData.fromXDR(entry.xdr, "base64")
				.contractData()
				.val()
				.instance()
				.executable();
			if (executable.switch().name === "contractExecutableStellarAsset")
				continue;
			wasm.set(id, executable.wasmHash());
		}
		const codes = await readLedgerEntries(
			[...wasm.values()].map((hash) => codeKey(hash)),
		);
		if (!codes) return CONTRACT_UNREAD;
		let matched: MainnetContract | null = null;
		let unjudged: MainnetContract | null = null;
		let cited: MainnetContract | null = null;
		const read = new Map<
			string,
			Promise<SourceRead | null | typeof CONTRACT_UNREAD>
		>();
		for (const [id, hash] of wasm) {
			// The instance runs this WASM, so a missing code entry is an answer
			// that is not whole, not evidence about the contract.
			const code = codes.get(codeKey(hash));
			if (!code) return CONTRACT_UNREAD;
			const bytes = xdr.LedgerEntryData.fromXDR(code.xdr, "base64")
				.contractCode()
				.code();
			const claimed = sourceRepo(contractMeta(bytes));
			let attested = 0;
			if (claimed) {
				if (acct) acct.api++;
				const n = await countAttestations(claimed, hash);
				if (n === null) return CONTRACT_UNREAD;
				attested = n;
			}
			const deployed = specFunctions(bytes);
			const basis = ownership(repoFullName ?? "", claimed, attested, {
				deployed,
				defined: source.defined,
				isFork: source.isFork,
			});
			if (basis === "self-validated") return { id, basis };
			if (basis === "source-matched") {
				matched ??= { id, basis };
				continue;
			}
			// Provably not this team's: a fork, whose source and pointers are
			// its parent's, or a build attested to another owner's repo.
			const owner = (repoFullName ?? "").toLowerCase().split("/")[0];
			if (
				source.isFork ||
				(basis === "other-repo" && claimed?.split("/")[0] !== owner)
			) {
				cited ??= { id, basis: "cited" };
				continue;
			}
			// Not this repo's source. A team's frontend or SDK repo points to
			// the repo its contract lives in: the build's SEP-55 source_repo, a
			// git submodule, or a README link, under the same GitHub owner.
			const side = source.siblings
				? await siblingBasis(
						repoFullName ?? "",
						claimed,
						deployed,
						source.siblings,
						read,
					)
				: "cited";
			if (side === CONTRACT_UNREAD) return CONTRACT_UNREAD;
			if (side === "sibling-matched") {
				matched ??= { id, basis: side };
				continue;
			}
			// Nothing matched. Only a whole read of this repo's source can say
			// cited, and trait defaults leave its functions unnamed.
			if (source.unread) return CONTRACT_UNREAD;
			if (side === "published" || takesDefaults(deployed, source.defaults))
				unjudged ??= { id, basis: "published" };
			else cited ??= { id, basis: "cited" };
		}
		return matched ?? unjudged ?? cited;
	} catch {
		// An answer that does not decode is a check that did not run.
		return CONTRACT_UNREAD;
	}
}

/** Fetch a repo's code + derive everything the scoring/tiering needs. Read-only. */
export async function fetchRepoCode(
	gh: Gh,
	full: string,
	/** Read the code at this commit instead of the default branch's head. The
	 * eval pins a fixture whose upstream repo moved on (its label describes
	 * code that is gone from HEAD); production scans never pass it. The repo's
	 * own metadata (fork, tags, topics) is still read as it is today. */
	opts: {
		ref?: string;
		/** The repo's stored mainnetContractId: an id it already holds is never
		 * cleared because the RPC no longer lists its instance. */
		storedMainnetContractId?: string | null;
	} = {},
): Promise<RepoCodeResult | null> {
	const [owner, name] = full.split("/");
	if (!owner || !name) return null;
	const meta = await (await gh(`/repos/${owner}/${name}`)).json();
	if (!meta?.default_branch) return null;
	const branch = meta.default_branch;
	const treeRes = await (
		await gh(
			`/repos/${owner}/${name}/git/trees/${opts.ref ?? branch}?recursive=1`,
		)
	).json();
	// Commit SHA (not the tree sha — GitHub URLs resolve commits): one light
	// branches call so every fact this scan writes is citable at a commit.
	const scannedRef: string | null = opts.ref
		? opts.ref
		: await gh(`/repos/${owner}/${name}/branches/${encodeURIComponent(branch)}`)
				.then((r) => r.json())
				.then((b) => (typeof b?.commit?.sha === "string" ? b.commit.sha : null))
				.catch(() => null);
	const tree: TreeEntry[] = (treeRes.tree ?? []).map(
		(t: { path: string; type: string; size?: number; sha: string }) => ({
			path: t.path,
			type:
				t.type === "blob" ? "blob" : t.type === "commit" ? "commit" : "tree",
			size: t.size,
			sha: t.sha,
		}),
	);
	if (!tree.length) return null;
	const treeComplete = treeRes.truncated !== true; // GitHub caps huge trees → incomplete, never a false "none"

	const cargos = tree.filter(
		(e) => e.type === "blob" && e.path.toLowerCase().endsWith("cargo.toml"),
	);
	const cargoText = new Map<string, string>();
	const cargoIsSoroban = new Map<string, boolean>();
	const blobRef = scannedRef ?? branch;
	const acct: BlobAccount = { api: 0, raw: 0 };
	for (const c of orderManifests(cargos).slice(0, 40)) {
		const txt = await fetchBlob(gh, owner, name, c.sha, c.path, blobRef, acct);
		cargoText.set(c.path, txt ?? "");
		cargoIsSoroban.set(c.path, /soroban[-_]sdk/i.test(txt ?? ""));
	}

	const sel = selectDepthPaths(tree, cargoIsSoroban);
	const shaByPath = new Map(tree.map((e) => [e.path, e.sha]));
	const sizeByPath = new Map(tree.map((e) => [e.path, e.size]));
	const blobs: DepthBlob[] = [];
	for (const p of sel.cargos)
		blobs.push({ path: p, text: cargoText.get(p) ?? null });
	for (const p of [
		...sel.sources,
		...sel.tests,
		...sel.jsSources,
		...sel.langSources,
	]) {
		const sha = shaByPath.get(p);
		const txt = sha
			? await fetchBlob(gh, owner, name, sha, p, blobRef, acct)
			: null;
		blobs.push({ path: p, text: txt });
	}
	const contractCrateDirs = cargos
		.filter((c) => cargoIsSoroban.get(c.path))
		.map((c) => c.path.replace(/\/?Cargo\.toml$/i, "") || ".");

	const readmeEntry = tree.find((e) => /^readme\.md$/i.test(e.path));
	const readmeText = readmeEntry
		? await fetchBlob(
				gh,
				owner,
				name,
				readmeEntry.sha,
				readmeEntry.path,
				blobRef,
				acct,
			)
		: null;
	// The repo's own contract functions, read from the sources this scan
	// fetched: a contract id is this repo's only if its source, or a
	// same-owner repo it points to, defines it.
	const gitlinks = tree.filter((e) => e.type === "commit").map((e) => e.path);
	const gitmodulesEntry = gitlinks.length
		? tree.find((e) => e.path === ".gitmodules")
		: undefined;
	const submodules = submoduleTargets(
		full,
		gitlinks,
		gitmodulesEntry
			? await fetchBlob(
					gh,
					owner,
					name,
					gitmodulesEntry.sha,
					gitmodulesEntry.path,
					blobRef,
					acct,
				)
			: null,
	);
	const checked = await verifyMainnetContract(
		readmeText,
		full,
		acct,
		opts.storedMainnetContractId,
		{
			...contractSource(blobs),
			// A Rust file of its own source it could not read, or a truncated
			// tree, leaves a missing function unknown, not absent. A file over
			// fetchBlob's 400 KB cap is generated, not source: it never could be.
			unread:
				!treeComplete ||
				blobs.some(
					(b) =>
						b.text === null &&
						isOwnSourcePath(b.path) &&
						(sizeByPath.get(b.path) ?? 0) <= 400_000,
				),
			isFork: !!meta.fork,
			siblings: {
				pointed: [...submodules.targets, ...sameOwnerLinks(full, readmeText)],
				opaque: submodules.opaque,
				read: (repo) => readContractFns(gh, repo, acct),
			},
		},
	);
	const mainnetContractUnread = mainnetCheckUnread(
		!!readmeEntry,
		readmeText,
		checked,
	);
	const mainnetContract =
		mainnetContractUnread || checked === CONTRACT_UNREAD ? null : checked;
	const mainnetContractId = mainnetContract?.id ?? null;
	const mainnetContractBasis = mainnetContract?.basis ?? null;
	const tagsRes = await (
		await gh(`/repos/${owner}/${name}/tags?per_page=100`)
	).json();
	const tagCount = Array.isArray(tagsRes) ? tagsRes.length : 0;

	const sigBlobs: SigBlob[] = blobs.map((b) => ({
		path: b.path,
		present: true,
		text: b.text,
	}));
	const scan: ScanInput = {
		fullName: full,
		blobs: sigBlobs,
		tree: tree.map((e) => ({ path: e.path, type: e.type })),
		treeComplete,
	};
	const { proof, facts, outcome, scanNote } = detectStellarProof(scan);

	const depthInput: DepthInput = {
		fullName: full,
		proof,
		versionStatus: facts.versionStatus,
		isDeployableContract: facts.isDeployableContract,
		blobs,
		contractCrateDirs: contractCrateDirs.length ? contractCrateDirs : ["."],
		scalars: {
			mainnetContractId,
			mainnetContractBasis,
			isFork: !!meta.fork,
			parentFullName: meta.parent?.full_name ?? null,
			releaseCount: 0,
			tagCount,
			readmeText,
			topics: Array.isArray(meta.topics) ? meta.topics : [],
		},
	};

	return {
		scannedRef,
		scan,
		proof,
		facts,
		outcome,
		scanNote: scanNote ?? null,
		depthInput,
		meta: {
			isFork: !!meta.fork,
			parentFullName: meta.parent?.full_name ?? null,
			isArchived: !!meta.archived,
			lastCommitAt: meta.pushed_at ?? null,
			stars: meta.stargazers_count ?? 0,
			diskUsageKb: typeof meta.size === "number" ? meta.size : null,
			tagCount,
			nameLooksTemplate: TEMPLATE_NAME_RE.test(name),
		},
		// finding 4: the cargo-relevance scan fetches up to 40 manifest blobs
		// BEFORE selection — count what was actually fetched, or the call-budget
		// guard under-counts and a wave can blow the token allowance.
		// finding 4 (2026-08): count what was actually fetched, or the
		// call-budget guard under-counts. Now only REST blob calls count —
		// raw.githubusercontent reads never touch the pool the guard protects.
		pathsFetched: acct.api,
		rawFetched: acct.raw,
		contractCrates: contractCrateDirs.length,
		mainnetContractUnread,
	};
}
