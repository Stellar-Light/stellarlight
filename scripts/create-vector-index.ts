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

const EXECUTE = process.argv.includes("--execute");

/**
 * `source` is a filter field so a source-scoped /api/research query is
 * filtered INSIDE the index (six small sources were absent from the generic
 * pool and answered keyword on every query, 2026-09-25). An existing index
 * whose served definition lacks a field is updated in place with --execute;
 * Atlas rebuilds in the background and keeps serving the old definition
 * until the new one is ready, and this script waits for that.
 */
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
			{ type: "filter", path: "source" },
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
			console.log(
				`    - ${idx.name} (${idx.type ?? "search"}) — ${idx.status ?? "?"}`,
			);
		}
		const current = existing.find(
			(i: { name: string }) => i.name === "research_vector_index",
		);
		if (current) {
			const served: Array<{ type?: string; path?: string }> =
				current.latestDefinition?.fields ?? [];
			const missing = INDEX_DEFINITION.definition.fields.filter(
				(want) =>
					!served.some((f) => f.type === want.type && f.path === want.path),
			);
			if (missing.length === 0) {
				console.log(
					"\n✅ research_vector_index already carries every expected field. Nothing to do.",
				);
				await client.close();
				return;
			}
			console.log(
				`\nresearch_vector_index is missing: ${missing.map((m) => `${m.type}:${m.path}`).join(", ")}`,
			);
			if (!EXECUTE) {
				console.log(
					"DRY RUN — would updateSearchIndex with the full definition. Re-run with --execute.",
				);
				await client.close();
				return;
			}
			await coll.updateSearchIndex(
				"research_vector_index",
				INDEX_DEFINITION.definition,
			);
			console.log("✓ updateSearchIndex submitted; waiting for the rebuild…");
			const deadline = Date.now() + 10 * 60 * 1000;
			while (Date.now() < deadline) {
				await new Promise((r) => setTimeout(r, 15_000));
				const now = (await coll.listSearchIndexes().toArray()).find(
					(i: { name: string }) => i.name === "research_vector_index",
				);
				const fields: Array<{ type?: string; path?: string }> =
					now?.latestDefinition?.fields ?? [];
				const has = fields.some(
					(f) => f.type === "filter" && f.path === "source",
				);
				console.log(
					`  status=${now?.status ?? "?"} queryable=${now?.queryable ?? "?"} filter:source=${has}`,
				);
				if (now?.status === "READY" && now?.queryable !== false && has) {
					console.log("✅ rebuilt and serving the new definition.");
					await client.close();
					return;
				}
			}
			console.error(
				"✗ rebuild not confirmed within 10 minutes (it may still finish; re-run to check)",
			);
			await client.close();
			process.exit(1);
		}
	} catch (e) {
		console.log(`  (listSearchIndexes failed: ${(e as Error).message})`);
	}

	if (!EXECUTE) {
		console.log(
			"\nDRY RUN — no research_vector_index; would createSearchIndex. Re-run with --execute.",
		);
		await client.close();
		return;
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
