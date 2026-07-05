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
import { type Blob as SigBlob, type CodeFacts, detectStellarProof, type ScanInput, type StellarProof } from "../../src/lib/code-signals";
import { type DepthBlob, type DepthInput } from "../../src/lib/code-depth";

export interface TreeEntry {
	path: string;
	type: "blob" | "tree" | "commit";
	size?: number;
	sha: string;
}

export type Gh = (url: string) => Promise<Response>;

/** GitHub REST fetcher with rate-limit backoff. Token from GITHUB_TOKEN/GH_TOKEN. */
export function createGh(token: string): Gh {
	return async (url: string) => {
		for (let attempt = 0; attempt < 4; attempt++) {
			const res = await fetch(`https://api.github.com${url}`, {
				headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "sl-code-scan" },
			});
			if (res.status === 403 || res.status === 429) {
				const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0) * 1000;
				const wait = Math.max(1000, reset - Date.now());
				if (wait < 60_000) {
					await new Promise((r) => setTimeout(r, wait));
					continue;
				}
			}
			return res;
		}
		throw new Error(`gh ${url} rate-limited`);
	};
}

async function fetchBlob(gh: Gh, owner: string, name: string, sha: string): Promise<string | null> {
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
	const rs = tree.filter((e) => e.type === "blob" && e.path.toLowerCase().endsWith(".rs"));
	const cargos = tree.filter((e) => e.type === "blob" && e.path.toLowerCase().endsWith("cargo.toml"));
	const sorobanCrateDirs = cargos.filter((c) => cargoIsSoroban.get(c.path)).map((c) => c.path.replace(/\/?Cargo\.toml$/i, ""));
	const inSorobanCrate = (p: string) => sorobanCrateDirs.some((d) => (d ? p.startsWith(`${d}/src/`) : p.startsWith("src/")));
	const isTest = (p: string) => /(^|\/)tests?\//i.test(p) || /_test|test_|\.test\./i.test(p);

	const sources = rs
		.filter((e) => inSorobanCrate(e.path) && !isTest(e.path))
		.sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
		.slice(0, 18)
		.map((e) => e.path);
	const tests = rs
		.filter((e) => isTest(e.path))
		.sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
		.slice(0, 3)
		.map((e) => e.path);
	const cargoPaths = cargos.filter((c) => cargoIsSoroban.get(c.path) || !c.path.includes("/")).map((c) => c.path);
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

const TEMPLATE_NAME = /(hello[-_]?world|template|boilerplate|scaffold|quickstart|starter|example|tutorial)/i;

/** Fetch a repo's code + derive everything the scoring/tiering needs. Read-only. */
export async function fetchRepoCode(gh: Gh, full: string): Promise<RepoCodeResult | null> {
	const [owner, name] = full.split("/");
	if (!owner || !name) return null;
	const meta = await (await gh(`/repos/${owner}/${name}`)).json();
	if (!meta?.default_branch) return null;
	const branch = meta.default_branch;
	const treeRes = await (await gh(`/repos/${owner}/${name}/git/trees/${branch}?recursive=1`)).json();
	const tree: TreeEntry[] = (treeRes.tree ?? []).map((t: { path: string; type: string; size?: number; sha: string }) => ({
		path: t.path,
		type: t.type === "blob" ? "blob" : t.type === "commit" ? "commit" : "tree",
		size: t.size,
		sha: t.sha,
	}));
	if (!tree.length) return null;
	const treeComplete = treeRes.truncated !== true; // GitHub caps huge trees → incomplete, never a false "none"

	const cargos = tree.filter((e) => e.type === "blob" && e.path.toLowerCase().endsWith("cargo.toml"));
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
	for (const p of sel.cargos) blobs.push({ path: p, text: cargoText.get(p) ?? null });
	for (const p of [...sel.sources, ...sel.tests]) {
		const sha = shaByPath.get(p);
		const txt = sha ? await fetchBlob(gh, owner, name, sha) : null;
		blobs.push({ path: p, text: txt });
	}
	const contractCrateDirs = cargos.filter((c) => cargoIsSoroban.get(c.path)).map((c) => c.path.replace(/\/?Cargo\.toml$/i, "") || ".");

	const readmeEntry = tree.find((e) => /^readme\.md$/i.test(e.path));
	const readmeText = readmeEntry ? await fetchBlob(gh, owner, name, readmeEntry.sha) : null;
	const tagsRes = await (await gh(`/repos/${owner}/${name}/tags?per_page=100`)).json();
	const tagCount = Array.isArray(tagsRes) ? tagsRes.length : 0;

	const sigBlobs: SigBlob[] = blobs.map((b) => ({ path: b.path, present: true, text: b.text }));
	const scan: ScanInput = {
		fullName: full,
		blobs: sigBlobs,
		tree: tree.map((e) => ({ path: e.path, type: e.type })),
		treeComplete,
	};
	const { proof, facts } = detectStellarProof(scan);

	const depthInput: DepthInput = {
		fullName: full,
		proof,
		versionStatus: facts.versionStatus,
		isDeployableContract: facts.isDeployableContract,
		blobs,
		contractCrateDirs: contractCrateDirs.length ? contractCrateDirs : ["."],
		scalars: {
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
		pathsFetched: sel.cargos.length + sel.sources.length + sel.tests.length,
		contractCrates: contractCrateDirs.length,
	};
}
