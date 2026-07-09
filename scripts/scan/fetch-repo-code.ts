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

async function fetchBlob(
	gh: Gh,
	owner: string,
	name: string,
	sha: string,
): Promise<string | null> {
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
): { cargos: string[]; sources: string[]; tests: string[] } {
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

	const sources = rs
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
	const tests = rs
		.filter((e) => isTest(e.path))
		.sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
		.slice(0, 3)
		.map((e) => e.path);
	const cargoPaths = cargos
		.filter((c) => cargoIsSoroban.get(c.path) || !c.path.includes("/"))
		.map((c) => c.path);
	// Non-Rust relevance manifests: package.json/stellar.toml (JS/SEP-1) PLUS the
	// other-language Stellar SDK manifests (Swift/Kotlin/Flutter/Go/Python) so
	// code-signals can fire the lang-sdk proof instead of wrongly reading a
	// mobile wallet / native SDK as `none`. Kept shallow (≤3 deep) + capped.
	const OTHER_MANIFEST =
		/(^|\/)(package\.json|stellar\.toml|package\.swift|podfile|build\.gradle(\.kts)?|pubspec\.yaml|go\.mod|requirements\.txt|pyproject\.toml|setup\.py|setup\.cfg)$/i;
	const others = tree
		.filter((e) => e.type === "blob" && OTHER_MANIFEST.test(e.path))
		.filter((e) => e.path.split("/").length <= 3)
		.sort((a, b) => a.path.split("/").length - b.path.split("/").length) // prefer root manifests
		.slice(0, 8)
		.map((e) => e.path);
	return { cargos: cargoPaths, sources, tests: [...tests, ...others] };
}

export interface RepoCodeResult {
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
	pathsFetched: number;
	contractCrates: number;
}

/** Verify a README-claimed contract id actually exists on Stellar MAINNET via
 * stellar.expert. Positive-only + fail-open: any network/API problem returns
 * null (never penalizes). Guards: only strkey-shaped ids are probed, and the
 * response must ECHO the requested id — the bare /contract/ endpoint answers
 * 200 with a LIST, so status alone would false-verify an empty/garbage id. */
export async function verifyMainnetContract(
	readmeText: string | null,
): Promise<string | null> {
	const ids = [...new Set(readmeText?.match(/\bC[A-Z2-7]{55}\b/g) ?? [])].slice(
		0,
		3,
	);
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
			if (!res.ok) continue;
			// finding 6: clearing on header-arrival left the BODY read unbounded
			// (undici default 300s) — a stalling stellar.expert could hang a wave.
			const j = (await res.json()) as { contract?: string };
			clearTimeout(t);
			if (j?.contract === id) return id;
		} catch {
			// fail-open: unverifiable is not unverified-negative
		}
	}
	return null;
}

const TEMPLATE_NAME =
	/(hello[-_]?world|template|boilerplate|scaffold|quickstart|starter|example|tutorial)/i;

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
	for (const c of cargos.slice(0, 40)) {
		const txt = await fetchBlob(gh, owner, name, c.sha);
		cargoText.set(c.path, txt ?? "");
		cargoIsSoroban.set(c.path, /soroban[-_]sdk/i.test(txt ?? ""));
	}

	const sel = selectDepthPaths(tree, cargoIsSoroban);
	const shaByPath = new Map(tree.map((e) => [e.path, e.sha]));
	const blobs: DepthBlob[] = [];
	for (const p of sel.cargos)
		blobs.push({ path: p, text: cargoText.get(p) ?? null });
	for (const p of [...sel.sources, ...sel.tests]) {
		const sha = shaByPath.get(p);
		const txt = sha ? await fetchBlob(gh, owner, name, sha) : null;
		blobs.push({ path: p, text: txt });
	}
	const contractCrateDirs = cargos
		.filter((c) => cargoIsSoroban.get(c.path))
		.map((c) => c.path.replace(/\/?Cargo\.toml$/i, "") || ".");

	const readmeEntry = tree.find((e) => /^readme\.md$/i.test(e.path));
	const readmeText = readmeEntry
		? await fetchBlob(gh, owner, name, readmeEntry.sha)
		: null;
	const mainnetContractId = await verifyMainnetContract(readmeText);
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
			isFork: !!meta.fork,
			parentFullName: meta.parent?.full_name ?? null,
			releaseCount: 0,
			tagCount,
			readmeText,
			topics: Array.isArray(meta.topics) ? meta.topics : [],
		},
	};

	return {
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
			nameLooksTemplate: TEMPLATE_NAME.test(name),
		},
		// finding 4: the cargo-relevance scan fetches up to 40 manifest blobs
		// BEFORE selection — count what was actually fetched, or the call-budget
		// guard under-counts and a wave can blow the token allowance.
		pathsFetched:
			Math.min(cargos.length, 40) + sel.sources.length + sel.tests.length,
		contractCrates: contractCrateDirs.length,
	};
}
