/**
 * Poll until research_vector_index reaches READY state.
 * Exits 0 once queryable, 1 on failure or timeout.
 */
import { createRequire } from "node:module";
const req = createRequire(import.meta.url);
// biome-ignore lint/suspicious/noExplicitAny: dynamic require, no types
const { MongoClient } = req(
	"/Users/shubhbrar/Downloads/stellarlight-main/node_modules/.pnpm/mongodb@6.16.0_@aws-sdk+credential-providers@3.921.0/node_modules/mongodb",
) as any;

const URI = process.env.DATABASE_URI || process.env.MONGODB_URI!;
const NAME = "research_vector_index";
const TIMEOUT_MS = 5 * 60 * 1000;

async function main() {
	const client = new MongoClient(URI);
	await client.connect();
	const coll = client.db().collection("research-docs");
	const t0 = Date.now();
	while (Date.now() - t0 < TIMEOUT_MS) {
		const idx = (await coll.listSearchIndexes(NAME).toArray())[0] as
			| { status: string; queryable: boolean }
			| undefined;
		const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
		if (!idx) {
			console.log(`[${elapsed}s] index not found yet`);
		} else {
			console.log(`[${elapsed}s] status=${idx.status} queryable=${idx.queryable}`);
			if (idx.queryable) {
				console.log(`✅ READY after ${elapsed}s`);
				await client.close();
				return;
			}
		}
		await new Promise((r) => setTimeout(r, 5000));
	}
	console.error("Timed out");
	await client.close();
	process.exit(1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
