/**
 * Backfill Voyage embeddings onto every project for semantic search.
 *
 * Text embedded = name + shortDescription + category (voyage-3, 1024-dim,
 * via src/lib/embed.ts). Stored in the `embedding` field. Writes go through
 * the raw Mongo driver (fast bulk; the field is defined on the collection so
 * Payload preserves it across syncs, and the search route reads it raw via
 * $vectorSearch).
 *
 * DRY RUN by default — reports counts and verifies the pipeline on one sample
 * without writing. Pass --execute to write. --force re-embeds everything.
 *
 * Run:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/embed-projects.ts [--execute] [--force]
 */
import { createRequire } from "node:module";
import { getPayload } from "payload";
import { embed, embedBatch } from "../src/lib/embed";
import configPromise from "../src/payload.config";

const req = createRequire(import.meta.url);
// biome-ignore lint/suspicious/noExplicitAny: dynamic require, no types
const { MongoClient, ObjectId } = req("mongodb") as any;

const EXECUTE = process.argv.includes("--execute");
const FORCE = process.argv.includes("--force");
const DIMS = 1024;
const BATCH = 100; // under Voyage's 128 hard limit

const projectText = (p: any): string =>
	[p.name, p.shortDescription, p.category]
		.filter(Boolean)
		.join(". ")
		.slice(0, 4000);

async function main() {
	const payload = await getPayload({ config: await configPromise });
	const res = await payload.find({
		collection: "projects",
		pagination: false,
		depth: 0,
	});
	const docs = res.docs as any[];
	console.log(
		`Mode: ${EXECUTE ? "EXECUTE (writes)" : "DRY RUN (read-only)"}${FORCE ? " --force" : ""}`,
	);
	console.log(`Loaded ${docs.length} projects (totalDocs=${res.totalDocs}).`);

	const todo = docs.filter(
		(d) => FORCE || !Array.isArray(d.embedding) || d.embedding.length !== DIMS,
	);
	console.log(
		`${todo.length} need embeddings · ${docs.length - todo.length} already embedded.`,
	);
	if (todo.length === 0) {
		console.log("Nothing to do.");
		process.exit(0);
	}

	if (!EXECUTE) {
		// Verify the pipeline end-to-end on one sample, no writes.
		const v = await embed(projectText(todo[0]));
		console.log(
			`DRY RUN ok — sample "${todo[0].name}" → ${v.length}-dim vector. ${todo.length} would be written.`,
		);
		process.exit(0);
	}

	const URI = process.env.DATABASE_URI || process.env.MONGODB_URI;
	if (!URI) throw new Error("DATABASE_URI/MONGODB_URI not set");
	const client = new MongoClient(URI);
	await client.connect();
	const col = client.db().collection("projects");

	let done = 0;
	for (let i = 0; i < todo.length; i += BATCH) {
		const slice = todo.slice(i, i + BATCH);
		const vecs = await embedBatch(slice.map(projectText));
		const ops = slice.map((p, j) => ({
			updateOne: {
				filter: { _id: new ObjectId(String(p.id)) },
				update: { $set: { embedding: vecs[j] } },
			},
		}));
		await col.bulkWrite(ops);
		done += slice.length;
		console.log(`  embedded ${done}/${todo.length}`);
	}
	await client.close();
	console.log(`DONE: wrote ${done} project embeddings.`);
	process.exit(0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
