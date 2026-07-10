/**
 * Prune crawl-artifact rows from the research corpus (audit R2, class 10).
 *
 * F5a taught the dev-docs ingester to EXCLUDE junk URLs (author archives,
 * pagination mirrors, tag/date indexes) going forward — but ingest is
 * upsert-only, so rows crawled before that fix are still served: the audit
 * found /meetings/authors/<name>/page/2-3 mirrors of one recap filling three
 * result slots. The serve path now also drops them (research-rank JUNK_URL_RE);
 * this removes them from the corpus so they stop matching $vectorSearch
 * candidates at all.
 *
 * Deletes ONLY rows whose url matches the same JUNK_URL_RE the ranker and
 * ingester use — no heuristics, no content inspection. Dry-run by default.
 *
 *   npx tsx scripts/prune-research-junk.ts             # dry run (list only)
 *   npx tsx scripts/prune-research-junk.ts --execute   # delete
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import { JUNK_URL_RE } from "../src/lib/research-rank";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");

async function main() {
	const payload = await getPayload({ config: await configPromise });

	// Payload `where` has no regex operator — page through urls and filter
	// locally with the EXACT pattern the ranker uses (one source of truth).
	const junk: Array<{ id: string; url: string }> = [];
	for (let page = 1; ; page++) {
		const r = await payload.find({
			collection: "research-docs",
			limit: 500,
			page,
			depth: 0,
			select: { url: true },
		});
		for (const d of r.docs as Array<{ id: string; url: string }>) {
			if (JUNK_URL_RE.test(String(d.url))) junk.push(d);
		}
		if (!r.hasNextPage) break;
	}

	const byUrl = new Map<string, number>();
	for (const d of junk) byUrl.set(d.url, (byUrl.get(d.url) ?? 0) + 1);
	console.log(`${junk.length} junk chunk(s) across ${byUrl.size} URL(s):`);
	for (const [url, n] of [...byUrl.entries()].slice(0, 30))
		console.log(`  ${url} (${n} chunk${n > 1 ? "s" : ""})`);
	if (byUrl.size > 30) console.log(`  …and ${byUrl.size - 30} more URLs`);

	if (!EXECUTE) {
		console.log("\nDry run — re-run with --execute to delete.");
		return;
	}

	// Per-row isolation: one failed delete can't torch the batch.
	let deleted = 0;
	let errors = 0;
	for (const d of junk) {
		try {
			await payload.delete({ collection: "research-docs", id: d.id });
			deleted += 1;
		} catch (err) {
			errors += 1;
			console.error(`  ✗ ${d.url}: ${(err as Error).message}`);
		}
	}
	console.log(`\nDone. Deleted ${deleted}, errors ${errors}.`);
	if (errors > 0) process.exitCode = 1;
}

main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
