/** READ-ONLY. Dump recent ApiUsage rows so you can see who's calling the API
 * and what they ask. uaBucket tells caller type (agent/claude vs browser/curl).
 * Run: via the recent-api-usage workflow (prod creds). */
import { getPayload } from "payload";
import configPromise from "../src/payload.config";

async function main() {
	const payload = await getPayload({ config: await configPromise });
	const res = await payload.find({ collection: "api-usage", sort: "-createdAt", limit: 60, depth: 0 });
	const rows = res.docs as any[];
	console.log(`Total ApiUsage rows: ${res.totalDocs}. Showing latest ${rows.length}:\n`);
	// breakdown by caller type
	const byBucket: Record<string, number> = {};
	for (const r of rows) byBucket[r.uaBucket || "?"] = (byBucket[r.uaBucket || "?"] || 0) + 1;
	console.log("caller-type breakdown (last 60):", JSON.stringify(byBucket), "\n");
	console.log("AGENT / CLAUDE / CODEX callers (i.e. bots like Pallet), latest first:");
	const agents = rows.filter((r) => ["agent", "claude", "codex", "cursor"].includes(r.uaBucket));
	if (!agents.length) console.log("  (none in the last 60 — no agent has hit the API recently)");
	for (const r of agents.slice(0, 25)) {
		console.log(`  ${String(r.createdAt).slice(0, 19)}  [${r.uaBucket}/${r.country || "?"}]  ${r.endpoint}  q="${r.query || ""}"`);
	}
	process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
