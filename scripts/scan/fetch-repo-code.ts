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

import type { DepthBlob, DepthInput } from "../../src/lib/code-depth";
import {
	type CodeFacts,
	detectStellarProof,
	type ScanInput,
	type Blob as SigBlob,
	type StellarProof,
} from "../../src/lib/code-signals";
import { TEMPLATE_NAME_RE } from "../../src/lib/repo-grade";

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
				inSorobanCrate(e.path) &&
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
				inSorobanCrate(e.path) &&
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
	/** REST blob calls made for this repo (the ones that spend the pool). */
	pathsFetched: number;
	/** Blobs served by raw.githubusercontent.com (free of the REST pool). */
	rawFetched: number;
	contractCrates: number;
}

/** Verify a README-claimed contract id actually exists on Stellar MAINNET via
 * stellar.expert. Positive-only + fail-open: any network/API problem returns
 * null (never penalizes). Guards: only strkey-shaped ids are probed, and the
 * response must ECHO the requested id — the bare /contract/ endpoint answers
 * 200 with a LIST, so status alone would false-verify an empty/garbage id. */
export type MainnetContract = {
	id: string;
	/** How we know the address belongs to THIS repo.
	 *  self-validated — stellar.expert's own source validation names this repo.
	 *  published      — the repo publishes it and we ruled out the two ways it
	 *                   provably isn't theirs, but nothing proves it is. */
	basis: "self-validated" | "published";
};

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
 * Two exclusions are provable, so we apply them:
 *   - `asset` present  => a Stellar Asset Contract. A network token wrapper is
 *     shared by everyone who mentions it and is never a repo's own contract.
 *   - `validation.repository` naming someone else => provably not this repo's.
 * What survives is ranked: a self-validated match wins over a merely published
 * one, so a repo that ships a verifiable contract is never represented by an
 * unproven sibling id.
 */
export async function verifyMainnetContract(
	readmeText: string | null,
	repoFullName?: string | null,
): Promise<MainnetContract | null> {
	const ids = [...new Set(readmeText?.match(/\bC[A-Z2-7]{55}\b/g) ?? [])].slice(
		0,
		3,
	);
	const own = (repoFullName ?? "").toLowerCase();
	let fallback: MainnetContract | null = null;
	for (const id of ids) {
		try {
			const ctrl = new AbortController();
			const t = setTimeout(() => ctrl.abort(), 6000);
			const res = await fetch(
				`https://api.stellar.expert/explorer/public/contract/${id}`,
				{
					headers: { "user-agent": "sl-code-scan" },
					signal: ctrl.signal,
				},
			);
			// A 429/5xx means we could not look, not that the id is bad. Half of
			// a 137-row audit came back 429 on a burst — treating that as a
			// negative would silently promote a worse candidate id in its place.
			if (res.status === 429 || res.status >= 500) {
				clearTimeout(t);
				return null;
			}
			if (!res.ok) {
				clearTimeout(t);
				continue;
			}
			// finding 6: clearing on header-arrival left the BODY read unbounded
			// (undici default 300s) — a stalling stellar.expert could hang a wave.
			const j = (await res.json()) as {
				contract?: string;
				asset?: string;
				validation?: { repository?: string };
			};
			clearTimeout(t);
			if (j?.contract !== id) continue;
			if (j.asset) continue;
			const repo = j.validation?.repository;
			if (repo) {
				const named = repo
					.replace(/\.git$/, "")
					.replace(/\/+$/, "")
					.split("/")
					.slice(-2)
					.join("/")
					.toLowerCase();
				if (!own || named !== own) continue;
				return { id, basis: "self-validated" };
			}
			fallback ??= { id, basis: "published" };
		} catch {
			// fail-open: unverifiable is not unverified-negative
		}
	}
	return fallback;
}

/** Fetch a repo's code + derive everything the scoring/tiering needs. Read-only. */
export async function fetchRepoCode(
	gh: Gh,
	full: string,
): Promise<RepoCodeResult | null> {
	const [owner, name] = full.split("/");
	if (!owner || !name) return null;
	const meta = await (await gh(`/repos/${owner}/${name}`)).json();
	if (!meta?.default_branch) return null;
	const branch = meta.default_branch;
	const treeRes = await (
		await gh(`/repos/${owner}/${name}/git/trees/${branch}?recursive=1`)
	).json();
	// Commit SHA (not the tree sha — GitHub URLs resolve commits): one light
	// branches call so every fact this scan writes is citable at a commit.
	const scannedRef: string | null = await gh(
		`/repos/${owner}/${name}/branches/${encodeURIComponent(branch)}`,
	)
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
	for (const c of cargos.slice(0, 40)) {
		const txt = await fetchBlob(gh, owner, name, c.sha, c.path, blobRef, acct);
		cargoText.set(c.path, txt ?? "");
		cargoIsSoroban.set(c.path, /soroban[-_]sdk/i.test(txt ?? ""));
	}

	const sel = selectDepthPaths(tree, cargoIsSoroban);
	const shaByPath = new Map(tree.map((e) => [e.path, e.sha]));
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
	const mainnetContract = await verifyMainnetContract(readmeText, full);
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
	};
}
