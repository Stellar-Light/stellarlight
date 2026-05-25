/**
 * L3 retrieval eval — runs a hand-curated set of queries against the
 * full /api/research pipeline (vector if Atlas index exists, keyword
 * fallback otherwise) and prints rank-1 results per query.
 *
 * Goal: catch (a) audit chunks bleeding into unrelated queries, (b)
 * non-audit queries failing to surface their source, (c) reassembled
 * audit text being unsearchable.
 */
import { getPayload } from "payload";
import configPromise from "../src/payload.config";
import { embed } from "../src/lib/embed";

interface Eval {
	q: string;
	expectSources: string[];
	why: string;
}

const EVALS: Eval[] = [
	// Audit-specific
	{ q: "what audit findings have been reported for Blend's oracle or price manipulation", expectSources: ["audit"], why: "audit chunks should dominate" },
	{ q: "self-liquidation vulnerability soroban lending", expectSources: ["audit"], why: "OS-BCL-ADV-00 (Blend OtterSec)" },
	{ q: "high severity finding in soroswap", expectSources: ["audit"], why: "soroswap audits" },
	{ q: "OctoLend collateral vault security", expectSources: ["audit"], why: "OctoLend Runtime Verification audit" },
	// SCF / grants
	{ q: "how do I structure a successful SCF submission", expectSources: ["scf-handbook", "lumenloop"], why: "playbook content" },
	{ q: "what does the SCF awards committee look for", expectSources: ["scf-handbook", "lumenloop"], why: "voter playbook" },
	// Protocol / specs
	{ q: "what does SEP-24 require for KYC", expectSources: ["sep"], why: "SEP-24 spec" },
	{ q: "stellar consensus protocol quorum slices", expectSources: ["paper"], why: "Mazieres SCP paper" },
	// Dev docs
	{ q: "how to deploy a soroban contract", expectSources: ["dev-docs"], why: "deployment guide" },
	{ q: "horizon api streaming endpoints", expectSources: ["dev-docs", "sep"], why: "horizon docs" },
	// Cross-source
	{ q: "anchors and SEP-31", expectSources: ["sep", "dev-docs"], why: "anchor + SEP-31 spec" },
	{ q: "stablecoin issuance on stellar", expectSources: ["sdf-blog", "dev-docs", "lumenloop-research"], why: "broad topic" },
];

async function main() {
	const payload = await getPayload({ config: configPromise });

	console.log("=".repeat(80));
	console.log("RETRIEVAL EVAL — 12 queries × top-3 results each");
	console.log("=".repeat(80));

	let usedVector: boolean | null = null;
	let perfectMatches = 0;
	let partialMatches = 0;
	let misses = 0;
	const sourcesSeenByQuery: string[][] = [];

	for (const e of EVALS) {
		console.log(`\n— Q: "${e.q}"`);
		console.log(`  expect: ${e.expectSources.join(" or ")} (${e.why})`);

		// Try vector search first
		let docs: Array<{ source: string; title: string; section: string | null; url: string; auditor?: string; protocol?: string; severity?: string }> = [];
		try {
			const queryEmbedding = await embed(e.q);
			const db = payload.db.collections["research-docs"];
			const raw = await db.aggregate([
				{
					$vectorSearch: {
						index: "research_vector_index",
						path: "embedding",
						queryVector: queryEmbedding,
						numCandidates: 100,
						limit: 3,
					},
				},
				{
					$project: {
						source: 1, title: 1, section: 1, url: 1, content: 1,
						auditor: 1, protocol: 1, severity: 1,
						_score: { $meta: "vectorSearchScore" },
					},
				},
			]);
			docs = raw as typeof docs;
			if (docs.length > 0) {
				if (usedVector === null) {
					usedVector = true;
					console.log("  [vector search ACTIVE]\n");
				}
			} else {
				throw new Error("vector returned 0");
			}
		} catch {
			if (usedVector === null) {
				usedVector = false;
				console.log("  [vector search unavailable — keyword fallback]\n");
			}
			const tokens = e.q.split(/\s+/).filter((t) => t.length > 2);
			const r = await payload.find({
				collection: "research-docs",
				where: { or: tokens.map((t) => ({ content: { contains: t } })) },
				limit: 3,
				depth: 0,
			});
			docs = r.docs as unknown as typeof docs;
		}

		const sources = docs.map((d) => d.source);
		sourcesSeenByQuery.push(sources);
		for (let i = 0; i < docs.length; i++) {
			const d = docs[i];
			const sevTag = d.severity ? ` sev=${d.severity}` : "";
			const auditorTag = d.auditor ? ` by=${d.auditor}` : "";
			console.log(
				`    #${i + 1} [${d.source}${sevTag}${auditorTag}] ${d.title.slice(0, 70)}`,
			);
			console.log(`        ${d.url}`);
		}

		const top = sources[0];
		const matched = top && e.expectSources.includes(top);
		const anyMatched = sources.some((s) => e.expectSources.includes(s));
		if (matched) {
			perfectMatches += 1;
			console.log("    → PASS (rank-1 source matches expected)");
		} else if (anyMatched) {
			partialMatches += 1;
			console.log("    → PARTIAL (expected source in top-3 but not rank-1)");
		} else {
			misses += 1;
			console.log("    → MISS (no expected source in top-3)");
		}
	}

	console.log("\n" + "=".repeat(80));
	console.log("SUMMARY");
	console.log("=".repeat(80));
	console.log(`Retrieval mode: ${usedVector ? "vector" : "keyword"}`);
	console.log(`Rank-1 perfect:  ${perfectMatches}/${EVALS.length}`);
	console.log(`Partial (top-3): ${partialMatches}/${EVALS.length}`);
	console.log(`Misses:          ${misses}/${EVALS.length}`);
	const acc = (perfectMatches + partialMatches) / EVALS.length;
	console.log(`Overall relevance: ${(acc * 100).toFixed(0)}%`);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
