/**
 * Try to create the Atlas Vector Search index `research_vector_index`
 * on research-docs.embedding via the MongoDB driver. createSearchIndex()
 * works on Atlas M0+ clusters running MongoDB 7.0+. If the user's tier
 * doesn't support it, prints the JSON to paste into the Atlas UI.
 */
// mongodb is a transitive dep via @payloadcms/db-mongodb. Use createRequire
// so we don't need a static import (which would need `@types/mongodb`
// installed), AND so it works in both local dev (hoisted pnpm store) and
// CI (clean checkout where lockfile resolution picks the same version).
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
	name: "research_vector_index",
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
	const db = client.db();
	const coll = db.collection("research-docs");

	console.log("Checking existing search indexes…");
	try {
		const existing = await coll.listSearchIndexes().toArray();
		console.log(`  found ${existing.length} search index(es):`);
		for (const idx of existing) {
			console.log(`    - ${idx.name} (${idx.type ?? "search"}) — ${idx.status ?? "?"}`);
		}
		if (existing.find((i: { name: string }) => i.name === "research_vector_index")) {
			console.log("\n✅ research_vector_index already exists. Nothing to do.");
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
		console.log("\nIndex builds asynchronously. Poll with:");
		console.log("  db.getCollection('research-docs').getSearchIndexes()");
		console.log("Typical build time: 30s–2min on M0/M2.");
	} catch (e) {
		const msg = (e as Error).message;
		console.error(`✗ createSearchIndex failed: ${msg}`);
		console.error("\nManual fallback — paste this in Atlas UI:");
		console.error("  Atlas → Cluster → Search → Create Search Index");
		console.error("  Choose: Atlas Vector Search → JSON Editor");
		console.error("  Database: <your DB>  Collection: research-docs");
		console.error("  Index name: research_vector_index");
		console.error("  Definition:");
		console.error(JSON.stringify(INDEX_DEFINITION.definition, null, 2));
	}

	await client.close();
}

main().catch((e) => {
	console.error("FATAL:", e);
	process.exit(1);
});
