/**
 * codeDepth v2 empirical probe — the moment of truth.
 *
 * Fetches REAL answer-key repos via the LAYOUT-AGNOSTIC selection the P2 scanner
 * will use (recursive tree → contract crates → top-N .rs by size per crate,
 * HEAD-relative), runs the code-depth.ts v2 formula, and prints the actual
 * scores so we can SEE whether deep separates from shallow on live code before
 * building the full eval/CI harness. Read-only, no DB, no writes.
 *
 *   GITHUB_TOKEN=… npx tsx scripts/scan/depth-probe.ts
 *   … npx tsx scripts/scan/depth-probe.ts owner/name owner/name   # ad-hoc repos
 *
 * The path-selection function (selectDepthPaths) is the SHARED, guarded unit —
 * production and the eval fixtures must both go through it (review P2).
 */
import { detectStellarProof, type Blob as SigBlob, type ScanInput } from "../../src/lib/code-signals";
import { computeCodeDepth, type DepthBlob, type DepthInput } from "../../src/lib/code-depth";

const GH = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
if (!GH) {
	console.error("Set GITHUB_TOKEN.");
	process.exit(1);
}

const DEEP = [
	"blend-capital/blend-contracts",
	"soroswap/core",
	"reflector-network/reflector-contract",
	"kalepail/passkey-kit",
	"eq-lab/slender",
];
const SHALLOW = [
	"stellar/soroban-examples",
	"jamesbachini/Soroban-Hello-World",
	"dbcfd/soroban-template",
	"stellar/soroban-quickstart",
	"stellar/soroban-example-dapp",
];

interface TreeEntry {
	path: string;
	type: "blob" | "tree" | "commit";
	size?: number;
	sha: string;
}

async function gh(url: string): Promise<Response> {
	for (let attempt = 0; attempt < 4; attempt++) {
		const res = await fetch(`https://api.github.com${url}`, {
			headers: { authorization: `Bearer ${GH}`, accept: "application/vnd.github+json", "user-agent": "sl-depth-probe" },
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
}

/**
 * LAYOUT-AGNOSTIC path selection — the shared, guarded unit.
 * Cargo.toml files are fetched on a SEPARATE budget (needed for proof/version,
 * but they carry no logic) so they never starve the source-file budget. Source
 * files are the global top-N by SIZE across all soroban crates' src/ dirs — the
 * biggest files hold the real logic; tiny mod/manifest lib.rs naturally rank low.
 */
function selectDepthPaths(
	tree: TreeEntry[],
	cargoIsSoroban: Map<string, boolean>,
): { cargos: string[]; sources: string[]; tests: string[] } {
	const rs = tree.filter((e) => e.type === "blob" && e.path.toLowerCase().endsWith(".rs"));
	const cargos = tree.filter((e) => e.type === "blob" && e.path.toLowerCase().endsWith("cargo.toml"));
	const sorobanCrateDirs = cargos
		.filter((c) => cargoIsSoroban.get(c.path))
		.map((c) => c.path.replace(/\/?Cargo\.toml$/i, ""));

	const inSorobanCrate = (p: string) =>
		sorobanCrateDirs.some((d) => (d ? p.startsWith(`${d}/src/`) : p.startsWith("src/")));

	const isTest = (p: string) => /(^|\/)tests?\//i.test(p) || /_test|test_|\.test\./i.test(p);

	// Global top-18 source .rs by size across all soroban crates (excludes tests).
	const sources = rs
		.filter((e) => inSorobanCrate(e.path) && !isTest(e.path))
		.sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
		.slice(0, 18)
		.map((e) => e.path);

	// Up to 3 largest test files (for testScore).
	const tests = rs
		.filter((e) => isTest(e.path))
		.sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
		.slice(0, 3)
		.map((e) => e.path);

	const cargoPaths = cargos.filter((c) => cargoIsSoroban.get(c.path) || !c.path.includes("/")).map((c) => c.path);
	// Non-Rust relevance proofs: a JS wallet / frontend / anchor is a LEGIT
	// Stellar repo even with no Soroban contract — fetch package.json + stellar.toml
	// so js-sdk / stellar-toml proofs fire (else they wrongly read as proof=none).
	const others = tree
		.filter((e) => e.type === "blob" && (/(^|\/)package\.json$/i.test(e.path) || /(^|\/)stellar\.toml$/i.test(e.path)))
		.filter((e) => e.path.split("/").length <= 3)
		.slice(0, 4)
		.map((e) => e.path);
	return { cargos: cargoPaths, sources, tests: [...tests, ...others] };
}

async function fetchRepo(full: string) {
	const [owner, name] = full.split("/");
	const meta = await (await gh(`/repos/${owner}/${name}`)).json();
	if (!meta?.default_branch) return null;
	const branch = meta.default_branch;
	const treeRes = await (await gh(`/repos/${owner}/${name}/git/trees/${branch}?recursive=1`)).json();
	const tree: TreeEntry[] = (treeRes.tree ?? []).map((t: any) => ({ path: t.path, type: t.type === "blob" ? "blob" : t.type === "commit" ? "commit" : "tree", size: t.size, sha: t.sha }));
	if (!tree.length) return null;

	// Phase 1: fetch all Cargo.toml to know which crates are soroban.
	const cargos = tree.filter((e) => e.type === "blob" && e.path.toLowerCase().endsWith("cargo.toml"));
	const cargoText = new Map<string, string>();
	const cargoIsSoroban = new Map<string, boolean>();
	for (const c of cargos.slice(0, 40)) {
		const txt = await fetchBlob(owner, name, c.sha);
		cargoText.set(c.path, txt ?? "");
		cargoIsSoroban.set(c.path, /soroban[-_]sdk/i.test(txt ?? ""));
	}

	// Phase 2: select + fetch depth blobs. Cargo.tomls reuse Phase-1 content
	// (already fetched) so they don't spend more calls.
	const sel = selectDepthPaths(tree, cargoIsSoroban);
	const shaByPath = new Map(tree.map((e) => [e.path, e.sha]));
	const blobs: DepthBlob[] = [];
	for (const p of sel.cargos) blobs.push({ path: p, text: cargoText.get(p) ?? null });
	for (const p of [...sel.sources, ...sel.tests]) {
		const sha = shaByPath.get(p);
		const txt = sha ? await fetchBlob(owner, name, sha) : null;
		blobs.push({ path: p, text: txt });
	}
	const paths = [...sel.cargos, ...sel.sources, ...sel.tests];
	// contract crate dirs (full-tree breadth count)
	const contractCrateDirs = cargos
		.filter((c) => cargoIsSoroban.get(c.path))
		.map((c) => c.path.replace(/\/?Cargo\.toml$/i, "") || ".");

	// README for deployed-address probe
	const readmeEntry = tree.find((e) => /^readme\.md$/i.test(e.path));
	const readmeText = readmeEntry ? await fetchBlob(owner, name, readmeEntry.sha) : null;

	// tags count
	const tagsRes = await (await gh(`/repos/${owner}/${name}/tags?per_page=100`)).json();
	const tagCount = Array.isArray(tagsRes) ? tagsRes.length : 0;

	// proof/version/cdylib via code-signals
	const sigBlobs: SigBlob[] = blobs.map((b) => ({ path: b.path, present: true, text: b.text }));
	const scan: ScanInput = { fullName: full, blobs: sigBlobs, tree: tree.map((e) => ({ path: e.path, type: e.type })), treeComplete: true };
	const { proof, facts } = detectStellarProof(scan);

	const input: DepthInput = {
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
	return { input, paths, crates: contractCrateDirs.length };
}

async function fetchBlob(owner: string, name: string, sha: string): Promise<string | null> {
	const res = await gh(`/repos/${owner}/${name}/git/blobs/${sha}`);
	if (!res.ok) return null;
	const j = await res.json();
	if (j.encoding !== "base64" || typeof j.content !== "string") return null;
	if ((j.size ?? 0) > 400_000) return null; // oversize → treat as unreadable
	try {
		return Buffer.from(j.content, "base64").toString("utf8");
	} catch {
		return null;
	}
}

async function main() {
	const argv = process.argv.slice(2);
	const deep = argv.length ? argv : DEEP;
	const shallow = argv.length ? [] : SHALLOW;
	const rows: { full: string; band: string; depth: number; nt: number; crates: number; sloc: number; m: number; proof: string }[] = [];

	for (const [band, list] of [["DEEP", deep], ["SHALLOW", shallow]] as const) {
		for (const full of list) {
			try {
				const r = await fetchRepo(full);
				if (!r) {
					console.error(`  ! ${full}: no tree`);
					continue;
				}
				const d = computeCodeDepth(r.input);
				rows.push({ full, band, depth: d.codeDepth, nt: d.nonTrivialFns, crates: d.contractCrates, sloc: d.rustSloc, m: d.cloneMultiplier, proof: r.input.proof });
			} catch (e) {
				console.error(`  ! ${full}: ${(e as Error).message}`);
			}
		}
	}

	console.log("\nband     codeDepth  nonTriv  crates  rustSloc  cloneM  proof            repo");
	for (const r of rows.sort((a, b) => (a.band === b.band ? b.depth - a.depth : a.band < b.band ? -1 : 1))) {
		console.log(
			`${r.band.padEnd(7)} ${r.depth.toFixed(3).padStart(8)} ${String(r.nt).padStart(7)} ${String(r.crates).padStart(6)} ${String(r.sloc).padStart(8)} ${r.m.toFixed(2).padStart(6)}  ${r.proof.padEnd(15)} ${r.full}`,
		);
	}
	const deepScores = rows.filter((r) => r.band === "DEEP").map((r) => r.depth);
	const shallowScores = rows.filter((r) => r.band === "SHALLOW").map((r) => r.depth);
	if (deepScores.length && shallowScores.length) {
		const minDeep = Math.min(...deepScores);
		const maxShallow = Math.max(...shallowScores);
		console.log(`\nmin(deep)=${minDeep.toFixed(3)}  max(shallow)=${maxShallow.toFixed(3)}  margin=${(minDeep - maxShallow).toFixed(3)}`);
		console.log(`deep>0.75: ${deepScores.filter((s) => s > 0.75).length}/${deepScores.length}  shallow<0.35: ${shallowScores.filter((s) => s < 0.35).length}/${shallowScores.length}`);
	}
}

main().then(() => process.exit(0)).catch((e) => {
	console.error("FATAL", e);
	process.exit(1);
});
