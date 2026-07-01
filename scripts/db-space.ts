/**
 * DB space diagnostic + SAFE prune. The prod Atlas M0 hit its 512 MB cap and
 * blocks writes. This reports per-collection storage and can prune ONLY the
 * api-usage telemetry logs (pure request tracking — no Raven lane reads it),
 * freeing enough headroom for pending writes (e.g. the 23-row partner seed).
 *
 *   pnpm exec tsx scripts/db-space.ts                # report sizes only (read-only)
 *   pnpm exec tsx scripts/db-space.ts --prune-usage  # + delete api-usage older than 14d
 *
 * NOTHING else is touched. `signals`, `research-docs`, `repos`, etc. are all
 * still read by live surfaces and are NEVER deleted here.
 */

import { config as loadEnv } from "dotenv";
import { getPayload } from "payload";
import config from "@payload-config";

loadEnv({ path: ".env.local" });

const PRUNE_USAGE = process.argv.includes("--prune-usage");
const RETAIN_DAYS = 14; // keep the last 14d of usage (status stats only need 7d)

// biome-ignore lint/suspicious/noExplicitAny: reaching the raw mongo handle
function rawDb(payload: any): any {
	return (
		payload?.db?.connection?.db ??
		payload?.db?.connections?.[0]?.db ??
		null
	);
}

async function main() {
	const payload = await getPayload({ config });
	const db = rawDb(payload);
	if (!db) {
		console.error("Could not reach the raw Mongo handle.");
		process.exit(1);
	}

	const names = [
		"api-usage", "research-docs", "repos", "projects", "signals",
		"transparency-logs", "media", "builders", "scout-feedback",
		"hackathons", "entities", "partner-accounts",
	];
	console.log("collection            docs        dataMB   storageMB");
	for (const n of names) {
		try {
			const s = await db.command({ collStats: n });
			console.log(
				`  ${n.padEnd(20)} ${String(s.count).padStart(8)}  ${(s.size / 1e6).toFixed(1).padStart(9)}  ${(s.storageSize / 1e6).toFixed(1).padStart(9)}`,
			);
		} catch {
			console.log(`  ${n.padEnd(20)}  (not present)`);
		}
	}
	const st = await db.stats();
	console.log(
		`\n  TOTAL  data=${(st.dataSize / 1e6).toFixed(1)}MB  storage=${(st.storageSize / 1e6).toFixed(1)}MB  index=${(st.indexSize / 1e6).toFixed(1)}MB`,
	);

	if (PRUNE_USAGE) {
		const cutoff = new Date(Date.now() - RETAIN_DAYS * 86_400_000);
		console.log(`\nPruning api-usage older than ${RETAIN_DAYS}d (< ${cutoff.toISOString()}) ...`);
		const res = await db.collection("api-usage").deleteMany({ createdAt: { $lt: cutoff } });
		console.log(`  ✓ deleted ${res.deletedCount} api-usage rows`);
		const after = await db.stats();
		console.log(
			`  after: data=${(after.dataSize / 1e6).toFixed(1)}MB  storage=${(after.storageSize / 1e6).toFixed(1)}MB`,
		);
	}
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
