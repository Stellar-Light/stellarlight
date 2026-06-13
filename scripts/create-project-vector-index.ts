/**
 * Create the Atlas Vector Search index `project_vector_index` on
 * projects.embedding (1024-dim cosine), mirroring create-vector-index.ts.
 * Idempotent — skips if it already exists. Prints the JSON for the Atlas UI
 * if the cluster tier can't create it programmatically.
 *
 * Run:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/create-project-vector-index.ts
 */
import { createRequire } from "node:module";
const req = createRequire(import.meta.url);
// biome-ignore lint/suspicious/noExplicitAny: dynamic require, no types
const { MongoClient } = req("mongodb") as any;

const URI = process.env.DATABASE_URI || process.env.MONGODB_URI;
if (!URI) {
	console.error("DATABASE_URI/MONGODB_URI not set");
	process.exit(1);
}

const INDEX_DEFINITION = {
	name: "project_vector_index",
	type: "vectorSearch" as const,
	definition: {
		fields: [
			{
				type: "vector",
				path: "embedding",
				numDimensions: 1024,
				similarity: "cosine",
			},
		],
	},
};

async function main() {
	const client = new MongoClient(URI as string);
	await client.connect();
	const coll = client.db().collection("projects");

	console.log("Checking existing search indexes on `projects`…");
	try {
		const existing = await coll.listSearchIndexes().toArray();
		for (const idx of existing) {
			console.log(`  - ${idx.name} (${idx.type ?? "search"}) — ${idx.status ?? "?"}`);
		}
		if (existing.find((i: { name: string }) => i.name === "project_vector_index")) {
			console.log("\n✅ project_vector_index already exists. Nothing to do.");
			await client.close();
			return;
		}
	} catch (e) {
		console.log(`  (listSearchIndexes failed: ${(e as Error).message})`);
	}

	console.log("\nAttempting createSearchIndex…");
	try {
		const result = await coll.createSearchIndex(INDEX_DEFINITION);
		console.log(`✅ Created: ${result}`);
		console.log("Index builds asynchronously (typical 30s–2min).");
	} catch (e) {
		console.error(`✗ createSearchIndex failed: ${(e as Error).message}`);
		console.error("\nManual fallback — Atlas → Search → Create → Vector Search → JSON:");
		console.error("  Collection: projects · Index name: project_vector_index");
		console.error(JSON.stringify(INDEX_DEFINITION.definition, null, 2));
	}

	await client.close();
}

main().catch((e) => {
	console.error("FATAL:", e);
	process.exit(1);
});
