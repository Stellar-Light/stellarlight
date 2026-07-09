/** One-off calibration probe: score the JS answer key with the real fetch path. */
import { computeJsDepth } from "../../src/lib/js-depth";
import { JS_DEEP, JS_SHALLOW } from "./depth-labels";
import { createGh, fetchRepoCode } from "./fetch-repo-code";

const gh = createGh(process.env.GITHUB_TOKEN?.trim() ?? "");
async function main() {
	for (const [band, list] of [
		["DEEP", JS_DEEP],
		["SHALLOW", JS_SHALLOW],
	] as const) {
		for (const { fullName } of list) {
			try {
				const r = await fetchRepoCode(gh, fullName);
				if (!r) {
					console.log(`${band} ?????  ${fullName} unfetchable`);
					continue;
				}
				const d = computeJsDepth({
					fullName,
					blobs: r.depthInput.blobs,
					stellarJsDep: r.facts.stellarJsDep,
					scalars: {
						isFork: r.meta.isFork,
						tagCount: r.meta.tagCount,
						readmeText: r.depthInput.scalars.readmeText,
						topics: r.depthInput.scalars.topics ?? [],
						nameLooksTemplate: r.meta.nameLooksTemplate,
					},
				});
				console.log(
					`${band} ${d.jsDepth.toFixed(3)}  ${fullName}  caps=[${d.capabilities.join(",")}] syms=${d.jsSymbols} sloc=${d.jsSloc} ${d.reasons.join(",")}`,
				);
			} catch (e) {
				console.log(`${band} ERROR  ${fullName} ${(e as Error).message}`);
			}
		}
	}
}
main();
