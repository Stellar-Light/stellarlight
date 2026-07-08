/**
 * Scorer diagnosis tool — full CodeDepthResult breakdown + fetch-selection
 * facts for a list of repos (default: the FRONTIER bands). Read-only; used to
 * understand WHY a labeled repo mis-scores before touching the formula.
 *
 *   GITHUB_TOKEN=… npx tsx scripts/scan/depth-diagnose.ts [owner/repo ...]
 */
import { computeCodeDepth } from "../../src/lib/code-depth";
import { DEEP_FRONTIER, SHALLOW_FRONTIER } from "./depth-labels";
import { createGh, fetchRepoCode } from "./fetch-repo-code";

const GH = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
if (!GH) {
	console.error("Set GITHUB_TOKEN.");
	process.exit(1);
}
const gh = createGh(GH);

async function main() {
	const args = process.argv.slice(2).filter((a) => a.includes("/"));
	const targets = args.length
		? args.map((fullName) => ({ fullName, why: "(cli)" }))
		: [...DEEP_FRONTIER, ...SHALLOW_FRONTIER];

	for (const { fullName } of targets) {
		try {
			const r = await fetchRepoCode(gh, fullName);
			if (!r) {
				console.log(`\n═══ ${fullName}: unfetchable`);
				continue;
			}
			const d = computeCodeDepth(r.depthInput);
			const rsBlobs = r.depthInput.blobs.filter((b) => b.path.endsWith(".rs"));
			const fetched = rsBlobs.filter((b) => b.text).length;
			const bytes = rsBlobs.reduce((n, b) => n + (b.text?.length ?? 0), 0);
			console.log(`\n═══ ${fullName}  depth=${d.codeDepth.toFixed(3)}`);
			console.log(
				`   baseline=${d.baseline.toFixed(2)} substance=${d.substance.toFixed(3)} cloneMult=${d.cloneMultiplier.toFixed(2)} nonTrivialFns(best)=${d.nonTrivialFns} crates=${d.contractCrates} sloc=${d.rustSloc}`,
			);
			console.log(
				`   fetch: ${fetched} .rs blobs (${(bytes / 1024).toFixed(0)}KB) · contractCrateDirs=${r.depthInput.contractCrateDirs.length} · tags=${r.depthInput.scalars.tagCount} · topics=[${(r.depthInput.scalars.topics ?? []).slice(0, 5).join(",")}]`,
			);
			console.log(`   reasons: ${d.reasons.join(", ") || "(none)"}`);
			console.log(
				`   files: ${rsBlobs
					.slice(0, 8)
					.map(
						(b) =>
							`${b.path.split("/").slice(-2).join("/")}(${((b.text?.length ?? 0) / 1024).toFixed(0)}k)`,
					)
					.join(" ")}`,
			);
		} catch (e) {
			console.log(`\n═══ ${fullName}: ERROR ${(e as Error).message}`);
		}
	}
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
