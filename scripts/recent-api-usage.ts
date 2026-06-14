/** READ-ONLY. Shows AGENT-type API calls (agent/claude/codex/cursor) across the
 * whole history — i.e. bots like Pallet hitting the API — independent of human
 * curl/browser noise. Run via the recent-api-usage workflow (prod creds). */
import { getPayload } from "payload";
import configPromise from "../src/payload.config";

async function main() {
	const payload = await getPayload({ config: await configPromise });
	const total = await payload.count({ collection: "api-usage" });
	console.log(`Total ApiUsage rows ever: ${total.totalDocs}`);

	const agents = await payload.find({
		collection: "api-usage",
		where: { uaBucket: { in: ["agent", "claude", "codex", "cursor"] } },
		sort: "-createdAt",
		limit: 60,
		depth: 0,
	});
	const rows = agents.docs as any[];
	console.log(`AGENT-type calls (agent/claude/codex/cursor) ever: ${agents.totalDocs}\n`);
	if (!rows.length) {
		console.log("==> ZERO agent/bot calls in the entire log. No agent (incl. Pallet) has ever hit the public API.");
		process.exit(0);
	}
	// endpoint + bucket breakdown
	const byEp: Record<string, number> = {};
	const byBucket: Record<string, number> = {};
	for (const r of rows) {
		byEp[r.endpoint] = (byEp[r.endpoint] || 0) + 1;
		byBucket[r.uaBucket] = (byBucket[r.uaBucket] || 0) + 1;
	}
	console.log("by caller-type:", JSON.stringify(byBucket));
	console.log("by endpoint:", JSON.stringify(byEp));
	console.log(`\nlatest agent calls (newest first):`);
	for (const r of rows.slice(0, 40)) {
		console.log(`  ${String(r.createdAt).slice(0, 19)}  [${r.uaBucket}/${r.country || "?"}]  ${r.endpoint}  q="${r.query || ""}"`);
	}
	process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
