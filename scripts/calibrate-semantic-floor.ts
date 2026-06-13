/**
 * READ-ONLY. Prints raw $vectorSearch cosine scores for a few queries so the
 * SCORE_FLOOR in projects/search can be set on data, not a guess. Run via the
 * calibrate-semantic workflow (prod DB + VOYAGE key).
 */
import { getPayload } from "payload";
import configPromise from "../src/payload.config";
import { embed } from "../src/lib/embed";

// noise = research/security concepts (NOT projects) → should be cut.
// match = real needs phrased in non-literal words → should pass.
const QUERIES: Array<[string, string]> = [
	["NOISE", "reentrancy vulnerability"],
	["NOISE", "frontrunning protection"],
	["MATCH", "send money to family abroad"],
	["MATCH", "swap tokens at the best price"],
	["MATCH", "borrow against my crypto holdings"],
	["MATCH", "explore and monitor a soroban contract"],
];

async function main() {
	const payload = await getPayload({ config: await configPromise });
	// biome-ignore lint/suspicious/noExplicitAny: db internals
	const db = (payload.db as any)?.connection?.db;
	const col = db.collection("projects");
	for (const [kind, q] of QUERIES) {
		const qv = await embed(q);
		const docs = await col
			.aggregate([
				{ $vectorSearch: { index: "project_vector_index", path: "embedding", queryVector: qv, numCandidates: 200, limit: 8 } },
				{ $project: { name: 1, category: 1, score: { $meta: "vectorSearchScore" } } },
			])
			.toArray();
		console.log(`\n[${kind}] "${q}"`);
		for (const d of docs) console.log(`   ${(d.score ?? 0).toFixed(3)}  ${d.name}  [${d.category}]`);
	}
	process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
