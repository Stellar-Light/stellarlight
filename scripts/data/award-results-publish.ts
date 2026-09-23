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
const ACCEPT_DRIFT = args.includes("--accept-manifest-drift");
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
	if (EXECUTE && loaded.round.status !== "closed") {
		console.error(
			`REFUSED: ${ROUND} is ${loaded.round.status}, not closed — a published result is final. Close the round first (dry-run is fine anytime).`,
		);
		return 1;
	}
	const { tally, source, digest, afterClose, relayOnly } =
		await liveTally(loaded);
	// The pre-vote manifest pins the electorate and ballot shape the votes were
	// cast under. Publish only a result whose round still matches it, or say
	// in the log that the operator accepted the drift.
	const anchorRes = await fetch(
		`https://stellarlight.xyz/api/awards/anchor?round=${encodeURIComponent(ROUND)}`,
	)
		.then((r) => r.json())
		.catch(() => null);
	const manifest = anchorRes?.manifest as { matches?: boolean | null } | null;
	if (!manifest) {
		console.error(
			`${ACCEPT_DRIFT ? "WARNING" : "REFUSED"}: no pre-vote manifest is anchored for ${ROUND} (tansu-anchor.yml --manifest). Nothing pins the roster and ballot shape the votes were cast under.${ACCEPT_DRIFT ? "" : " Pass --accept-manifest-drift to publish anyway."}`,
		);
		if (!ACCEPT_DRIFT) return 1;
	} else if (manifest.matches !== true) {
		console.error(
			`${ACCEPT_DRIFT ? "WARNING" : "REFUSED"}: the round's manifest ${manifest.matches === null ? "could not be recomputed" : "changed since it was anchored"}: roster, nominees, picks or dates moved after voting opened.${ACCEPT_DRIFT ? "" : " Pass --accept-manifest-drift to publish anyway."}`,
		);
		if (!ACCEPT_DRIFT) return 1;
	} else {
		console.log("manifest: matches the anchored pre-vote digest");
	}
	if (!digest) {
		console.error(
			"REFUSED: the first-ballot record could not be read, so the digest that pins it cannot be computed. Publishing now would commit a result with no proof of the record it came from.",
		);
		return 1;
	}
	if (tally.turnout.voted === 0) {
		console.error(
			`REFUSED: ${ROUND} shows ZERO ballots (whitelist ${tally.turnout.whitelisted}). After a testnet reset an unmirrored round reads exactly like this, and the digest over an empty record is a valid hash — publishing would commit and anchor "nobody voted" as the final result.`,
		);
		return 1;
	}
	const doc = resultsDocument(
		loaded,
		tally,
		source,
		digest,
		new Date(),
		relayOnly,
	);
	const json = `${JSON.stringify(doc, null, "\t")}\n`;
	console.log(
		`\n${ROUND} (${loaded.round.status}) · source ${source} · turnout ${tally.turnout.voted}/${tally.turnout.whitelisted} · relay-only ${relayOnly}`,
	);
	if (afterClose > 0) {
		console.log(
			`  ${afterClose} out-of-band ballot(s) NOT counted — written to Horizon after the round closed`,
		);
	}
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
