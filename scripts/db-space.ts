/**
 * DB space diagnostic + SAFE prune. Prod Atlas M0 hit its 512 MB cap and blocks
 * writes. This reports per-collection storage + an age breakdown of the biggest
 * prunable collection (transparency-logs — a change-audit log dominated by huge
 * `diff` JSON blobs, mostly from automated enrichment runs).
 *
 *   pnpm exec tsx scripts/db-space.ts                # report only (READ-ONLY)
 *   PRUNE_DAYS=30 pnpm exec tsx scripts/db-space.ts --prune-logs   # delete logs older than 30d
 *
 * Prunes ONLY transparency-logs older than PRUNE_DAYS. The per-project
 * transparency section on the frontend keeps its recent history; only stale
 * audit diffs are removed. NOTHING else (signals/research/repos/projects/…) is
 * touched — those are all read by live surfaces.
 */

import config from "@payload-config";
import { config as loadEnv } from "dotenv";
import { getPayload } from "payload";

loadEnv({ path: ".env.local" });

const PRUNE_LOGS = process.argv.includes("--prune-logs");
const PRUNE_DAYS = Number(process.env.PRUNE_DAYS ?? "30");

// biome-ignore lint/suspicious/noExplicitAny: reaching the raw mongo handle
function rawDb(payload: any): any {
	return (
		payload?.db?.connection?.db ?? payload?.db?.connections?.[0]?.db ?? null
	);
}

const DAY = 86_400_000;

async function main() {
	const payload = await getPayload({ config });
	const db = rawDb(payload);
	if (!db) {
		console.error("Could not reach the raw Mongo handle.");
		process.exit(1);
	}

	const names = [
		"transparency-logs",
		"research-docs",
		"projects",
		"repos",
		"signals",
		"api-usage",
		"media",
		"builders",
		"scout-feedback",
		"hackathons",
		"entities",
		"partner-accounts",
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

	// Age breakdown of the prune candidate so we see exactly what a cutoff removes.
	const logs = db.collection("transparency-logs");
	const total = await logs.countDocuments({});
	const counts: Record<string, number> = {};
	for (const d of [7, 30, 90]) {
		counts[`>${d}d`] = await logs.countDocuments({
			timestamp: { $lt: new Date(Date.now() - d * DAY) },
		});
	}
	console.log(
		`\n  transparency-logs: ${total} total · older-than: 7d=${counts[">7d"]}  30d=${counts[">30d"]}  90d=${counts[">90d"]}`,
	);
	console.log(
		`  (a --prune-logs run at PRUNE_DAYS=${PRUNE_DAYS} would delete ${counts[`>${PRUNE_DAYS}d`] ?? "?"} rows)`,
	);

	if (PRUNE_LOGS) {
		const cutoff = new Date(Date.now() - PRUNE_DAYS * DAY);
		console.log(
			`\nPruning transparency-logs older than ${PRUNE_DAYS}d (< ${cutoff.toISOString()}) ...`,
		);
		const res = await logs.deleteMany({ timestamp: { $lt: cutoff } });
		console.log(`  ✓ deleted ${res.deletedCount} transparency-log rows`);
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
