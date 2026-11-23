/**
 * Ingest Stellar Limits Proposals (stellar/stellar-protocol limits/slp-*.md)
 * into the research corpus as source `slp` (sls-118). SLPs record the
 * network configuration votes: resource limit changes, and the Quorum Freeze
 * (CAP-0077) uses on Mainnet (SLP-0006, SLP-0008). CAPs describe the
 * mechanism; only the SLPs say it was used. Parsing: slpChunks in
 * src/lib/research-ingest.ts.
 *
 *   pnpm exec tsx scripts/ingest-slps.ts             dry run: what would change
 *   pnpm exec tsx scripts/ingest-slps.ts --execute   embed + write
 *   pnpm exec tsx scripts/ingest-slps.ts --replan    the DB diff, no writes
 */
import "./load-env";
import { getPayload } from "payload";
import {
	loadExistingChunks,
	type ResearchChunk,
	slpChunks,
	upsertChunks,
} from "../src/lib/research-ingest";
import configPromise from "../src/payload.config";

const execute = process.argv.includes("--execute");
const replan = process.argv.includes("--replan");
const REPO = "stellar/stellar-protocol";
const UA = { "User-Agent": "stellarlight-scout-ingest" };

async function run() {
	console.log(execute ? "EXECUTE MODE" : replan ? "REPLAN" : "DRY RUN MODE");
	const res = await fetch(
		`https://api.github.com/repos/${REPO}/contents/limits`,
		{
			headers: {
				...UA,
				Accept: "application/vnd.github+json",
				...(process.env.GITHUB_TOKEN
					? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
					: {}),
			},
		},
	);
	if (!res.ok) throw new Error(`GitHub list failed: ${res.status}`);
	const files = ((await res.json()) as Array<{ name: string; type: string }>)
		.filter((f) => f.type === "file" && /^slp-\d+\.md$/i.test(f.name))
		.map((f) => f.name);
	// No proposals listed is a broken read, not an empty source: limits/ has
	// held eight since 2026-11.
	if (!files.length) throw new Error("limits/ listed no slp-*.md files");
	console.log(`  ${files.length} SLP files in limits/`);

	const chunks: ResearchChunk[] = [];
	for (const name of files) {
		const r = await fetch(
			`https://raw.githubusercontent.com/${REPO}/master/limits/${name}`,
			{ headers: UA },
		);
		if (!r.ok) throw new Error(`fetch limits/${name}: ${r.status}`);
		const doc = slpChunks(await r.text(), name);
		chunks.push(...doc);
		console.log(`  ${doc[0]?.content.split("\n")[0] ?? name} (${doc.length})`);
	}
	console.log(`  ${chunks.length} chunks`);

	if (!execute && !replan) {
		console.log("\nDry run. --execute to embed + write.");
		return;
	}
	const payload = await getPayload({ config: configPromise });
	const s = await upsertChunks({
		payload,
		source: "slp",
		chunks,
		existing: await loadExistingChunks(payload, "slp"),
		dryRun: replan,
	});
	if (s.errors) throw new Error(`${s.errors} chunk write(s) failed`);
}

run()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
