/**
 * The routing-accuracy eval — does Raven route a real user's NATURAL question to
 * the RIGHT scout op? The through-Raven feeder (raven-loop) DRIVES the op itself,
 * so it measures data+envelope but never Raven's routing. This asks Raven's
 * `search` tool (its codemode discovery index, built from our OpenAPI text) the
 * question a real user would type, and checks whether the op that SHOULD answer
 * it lands in the top hits — the piece that catches "our purpose-built op exists
 * but a builder's question lands on stellarDocs/lumenloop instead".
 *
 *   RAVEN_MCP=… RAVEN_TOKEN=… pnpm exec tsx scripts/raven-routing.ts
 *   # or: set -a; . <scratchpad>/raven.env; set +a; pnpm exec tsx scripts/raven-routing.ts
 *
 * CATALOG-LAG HONESTY: a newly-shipped op Raven hasn't re-baselined yet is NOT
 * routable through no fault of ours (feedback_catalog_lag_is_not_drift). So we
 * first read Raven's live catalog and only grade a question whose expected op is
 * ALREADY cataloged — a lagging op is skipped, never a finding. A miss therefore
 * means: the op is in Raven's catalog, but the natural question doesn't reach it
 * (a description/vocabulary gap on our side, the one thing WE can fix).
 *
 * LOCAL RUN ONLY — token from env only, never hardcoded/logged/written.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "improvements/engine/raven-routing-latest.json");
const URL = process.env.RAVEN_MCP;
const TOKEN = process.env.RAVEN_TOKEN;
if (!URL || !TOKEN) {
	console.error(
		"raven-routing: RAVEN_MCP and RAVEN_TOKEN must be in the env (source your scratchpad raven.env). LOCAL RUN ONLY.",
	);
	process.exit(2);
}

/** Natural questions a real SDF-agent user types → the scout op that should win.
 *  Grounded in a live interrogation of Raven's `search`. `expect` lists all ops
 *  that would be a correct route (any one in the top hits = pass). */
const BANK: Array<{ q: string; expect: string[]; note: string }> = [
	{
		q: "biggest stablecoins on Stellar by market cap",
		expect: ["getStablecoins"],
		note: "market-cap ranked stablecoins",
	},
	{
		q: "which are the largest stablecoins issued on Stellar",
		expect: ["getStablecoins"],
		note: "stablecoin supply ranking",
	},
	{
		q: "is Blend audited and by whom",
		expect: ["listAudits"],
		note: "audit registry lookup",
	},
	{
		q: "security audit reports for Soroban projects",
		expect: ["listAudits"],
		note: "audit registry",
	},
	{
		q: "who is Tyler van der Hoeven",
		expect: ["getPeople", "getBuilders"],
		note: "person/builder lookup",
	},
	{
		q: "find developers who work at the Stellar Development Foundation",
		expect: ["getPeople", "getBuilders"],
		note: "people index",
	},
	{
		q: "what wallets support Stellar",
		expect: ["getPartners"],
		note: "partner directory (wallets)",
	},
	{
		q: "on and off ramps for Stellar payments",
		expect: ["getPartners"],
		note: "anchors/ramps",
	},
	{
		q: "top Stellar projects by GitHub activity",
		expect: ["getLeaderboard"],
		note: "activity leaderboard",
	},
	{
		q: "find Soroban lending and money-market protocols",
		expect: ["searchProjects"],
		note: "project directory",
	},
	{
		q: "recent Stellar hackathon winners",
		expect: ["getHackathons", "getHackathon"],
		note: "hackathons",
	},
	{
		q: "explain the soroban examples repository",
		expect: ["explainRepo"],
		note: "repo explainer",
	},
];

const TOP_K = 3; // the op must land in the top-K scout hits to count as routed

let _id = 0;
async function rpc(method: string, params: unknown, session?: string) {
	_id += 1;
	const res = await fetch(URL as string, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			"User-Agent": "curl/8.6.0",
			Authorization: `Bearer ${TOKEN}`,
			...(session ? { "Mcp-Session-Id": session } : {}),
		},
		body: JSON.stringify({ jsonrpc: "2.0", id: _id, method, params }),
	});
	const sid = res.headers.get("Mcp-Session-Id");
	const raw = await res.text();
	let json = raw;
	if (
		raw.startsWith("event:") ||
		raw.includes("\ndata:") ||
		raw.startsWith("data:")
	) {
		for (const line of raw.split("\n"))
			if (line.startsWith("data:")) {
				json = line.slice(5).trim();
				break;
			}
	}
	try {
		return { body: JSON.parse(json) as Record<string, unknown>, sid };
	} catch {
		return { body: null, sid };
	}
}

interface Hit {
	id: string;
	service: string;
	score: number;
}
function hitsOf(body: Record<string, unknown> | null): Hit[] {
	const text = (
		(body?.result as { content?: Array<{ text?: string }> })?.content ?? []
	)
		.map((c) => c.text ?? "")
		.join("\n");
	try {
		return (JSON.parse(text).hits ?? []) as Hit[];
	} catch {
		return [];
	}
}

async function main() {
	const init = await rpc("initialize", {
		protocolVersion: "2025-03-26",
		capabilities: {},
		clientInfo: { name: "sl-raven-routing", version: "1" },
	});
	const sid = init.sid ?? "";
	await rpc("notifications/initialized", {}, sid).catch(() => {});

	// Raven's live scout catalog (same vocabulary-union sweep as the drift guard)
	// — an op absent here is LAGGING, and questions expecting it are skipped.
	const sweepCode = `const qs=["projects search directory","repos code search","builders people leaderboard","hackathons compare winners","research corpus semantic","skills marketplace list","partners anchors match","clusters topics analyze ecosystem","changelog status health","audits security reports stablecoins market cap","people person lookup identity","rfps grants open","feedback submit","explain repo deepwiki"];const rs=await Promise.all(qs.map(q=>codemode.search(q,{service:"scout",limit:20})));const ids=new Set();for(const r of rs)for(const h of (r.hits??[]))if(h.id&&h.id.startsWith("scout."))ids.add(h.id);return [...ids].sort();`;
	const sweep = await rpc(
		"tools/call",
		{ name: "execute", arguments: { code: sweepCode } },
		sid,
	);
	const sweepText =
		((sweep.body?.result as { content?: Array<{ text?: string }> })?.content ??
			[])[0]?.text ?? "[]";
	let catalog = new Set<string>();
	try {
		catalog = new Set(
			(JSON.parse(sweepText) as string[]).map((id) =>
				id.replace(/^scout\./, ""),
			),
		);
	} catch {}
	console.log(
		`raven-routing: Raven catalog has ${catalog.size} scout ops; grading ${BANK.length} natural questions…\n`,
	);

	const misses: Array<{
		query: string;
		expect: string[];
		topScout: string[];
		note: string;
	}> = [];
	const lagging: Array<{ query: string; expect: string[] }> = [];
	let graded = 0;

	for (const item of BANK) {
		const cataloged = item.expect.filter((op) => catalog.has(op));
		if (cataloged.length === 0) {
			lagging.push({ query: item.q, expect: item.expect });
			console.log(
				`  · [lag] "${item.q}" — ${item.expect.join("/")} not yet in Raven's catalog, skipped`,
			);
			continue;
		}
		graded++;
		const r = await rpc(
			"tools/call",
			{ name: "search", arguments: { query: item.q } },
			sid,
		);
		const scoutHits = hitsOf(r.body)
			.filter((h) => h.service === "scout")
			.map((h) => h.id.replace(/^scout\./, ""));
		const topScout = scoutHits.slice(0, TOP_K);
		const routed = cataloged.some((op) => topScout.includes(op));
		if (routed) {
			process.stdout.write(".");
		} else {
			misses.push({
				query: item.q,
				expect: item.expect,
				topScout,
				note: item.note,
			});
			console.log(
				`\n  ✗ [routing] "${item.q}"\n      want ${cataloged.join("/")} · got top-${TOP_K} scout: ${topScout.join(", ") || "none"}`,
			);
		}
	}

	const okRate =
		graded > 0
			? Math.round(((graded - misses.length) / graded) * 100) / 100
			: 1;
	const artifact = {
		generatedAt: new Date().toISOString(),
		gateway: URL,
		frame: {
			graded,
			passed: graded - misses.length,
			failed: misses.length,
			lagging: lagging.length,
		},
		okRate,
		misses,
		lagging, // cataloged-lag skips — surfaced for context, NOT findings
	};
	writeFileSync(OUT, `${JSON.stringify(artifact, null, "\t")}\n`);
	console.log(
		`\n\nraven-routing: ${graded - misses.length}/${graded} questions routed to the right scout op (${okRate * 100}%) · ${misses.length} routing gap(s) · ${lagging.length} skipped (catalog lag)`,
	);
	console.log("  wrote → improvements/engine/raven-routing-latest.json");
	console.log(
		"  next: pnpm exec tsx scripts/improvement-ledger.ts   (ingests misses as surface:consumer)",
	);
}

main().catch((e) => {
	console.error("raven-routing failed:", e instanceof Error ? e.message : e);
	process.exit(1);
});
