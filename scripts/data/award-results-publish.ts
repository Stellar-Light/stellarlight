/**
 * i³ Awards — write a round's published results file.
 *
 *   pnpm exec tsx scripts/data/award-results-publish.ts --round=i3-2026            (prints the document)
 *   pnpm exec tsx scripts/data/award-results-publish.ts --round=i3-2026 --execute  (writes awards/results/i3-2026.json)
 *
 * The lane (award-publish.yml) then commits the file to main and runs
 * tansu-anchor.ts --commit with that commit's SHA, so the round's result has
 * an on-chain record on Tansu (testnet) that points at a real commit in this
 * public repo. The tally comes from liveTally — the same code the results
 * page uses. Aggregate only; no addresses, no tx hashes.
 *
 * This script only writes the file. Git is the workflow's job.
 */
import "../load-env";
import { mkdirSync, writeFileSync } from "node:fs";
import { liveTally, resultsDocument } from "../../src/lib/awards/publish";
import { loadRoundOrThrow } from "../../src/lib/awards/round";

const args = process.argv.slice(2);
const arg = (k: string) => {
	const hit = args.find((a) => a.startsWith(`--${k}=`));
	return hit ? hit.slice(k.length + 3) : null;
};
const EXECUTE = args.includes("--execute");
const ROUND = arg("round");

async function main() {
	if (!ROUND) {
		console.error("usage: --round=<slug> [--execute]");
		return 2;
	}
	const loaded = await loadRoundOrThrow(ROUND);
	if (!loaded) {
		console.error(`no round with slug "${ROUND}"`);
		return 1;
	}
	const { tally, source } = await liveTally(loaded);
	const doc = resultsDocument(loaded, tally, source);
	const json = `${JSON.stringify(doc, null, "\t")}\n`;
	console.log(
		`\n${ROUND} (${loaded.round.status}) · source ${source} · turnout ${tally.turnout.voted}/${tally.turnout.whitelisted}`,
	);
	for (const c of doc.categories) {
		console.log(
			`  ${c.key.padEnd(17)} ${c.totalVotes} vote(s) → ${
				c.results
					.filter((r) => r.votes > 0)
					.map((r) => `${r.slug} ${r.votes}`)
					.join(", ") || "(none)"
			}`,
		);
	}
	if (!EXECUTE) {
		console.log("\nDRY RUN — file not written. Document:\n");
		console.log(json);
		return 0;
	}
	mkdirSync("awards/results", { recursive: true });
	const path = `awards/results/${ROUND}.json`;
	writeFileSync(path, json);
	console.log(`\n✓ wrote ${path} (${json.length} bytes)`);
	return 0;
}

main()
	.then((c) => process.exit(c))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
