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
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isSyntheticQuery } from "../src/lib/improvement-ledger";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "improvements/engine/raven-routing-latest.json");
// The REAL questions: Engine D mines what consumers actually ask + miss. The
// engine asks Raven THOSE (ranked by frequency), not only a curated bank.
const DEMAND = join(
	ROOT,
	"improvements/engine/weekly/engine-d-demand-latest.json",
);
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
	// ── capability coverage: every scout op should win its natural question ──
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
	// ── NEW capability probes (ops never routing-tested before) ──
	{
		q: "open RFPs bounties and grants on Stellar",
		expect: ["getRfps"],
		note: "RFPs/grants",
	},
	{
		q: "which project categories are most crowded or underbuilt",
		expect: ["getClusters"],
		note: "whitespace/clusters",
	},
	{
		q: "ecosystem overview: total projects funding and hackathons",
		expect: ["analyzeEcosystem"],
		note: "ecosystem analytics",
	},
	{
		q: "compare the Meridian and Consensus hackathons",
		expect: ["compareHackathons"],
		note: "hackathon compare",
	},
	{
		q: "total value locked in Stellar DeFi protocols",
		expect: ["getLeaderboard", "analyzeEcosystem"],
		note: "TVL ranking",
	},
	{
		q: "find open source Rust repositories for Soroban",
		expect: ["searchRepos"],
		note: "code search",
	},
	{
		q: "how does Soroban authorization work",
		expect: ["searchResearch"],
		note: "research/docs corpus",
	},
	{
		q: "what changed recently in the Stellar Scout API",
		expect: ["getChangelog"],
		note: "changelog",
	},
	{
		q: "which AI agent skills are available for Stellar",
		expect: ["listSkills"],
		note: "skills marketplace",
	},
	// ── real demand Raven ACTUALLY gets (from api-usage telemetry) ──
	{
		q: "passkey-kit",
		expect: ["searchProjects"],
		note: "demand: project by name",
	},
	{
		q: "reflector oracle on Stellar",
		expect: ["searchProjects"],
		note: "demand: oracle project",
	},
	{
		q: "octoplace",
		expect: ["searchProjects"],
		note: "demand: project by name",
	},
	{
		q: "zk-snark",
		expect: ["searchRepos", "searchProjects"],
		note: "demand: tech/repo search (22×)",
	},
	{
		q: "jobs bounties and freelance work for Stellar contributors",
		expect: ["getRfps"],
		note: "demand: jobs/bounties (2×)",
	},
	// ── prior-art over hackathon prototypes (searchHackathonBuilds, #693) ──
	// LAGGING until Raven re-baselines its catalog — the eval skips a not-yet-
	// cataloged op rather than flagging it, then starts grading once it lands.
	{
		q: "has anyone built a recurring payments protocol at a Stellar hackathon",
		expect: ["searchHackathonBuilds"],
		note: "prior-art: hackathon prototype lookup",
	},
	{
		q: "what prediction markets were built at Stellar hackathons",
		expect: ["searchHackathonBuilds"],
		note: "prior-art: hackathon builds by topic",
	},
	{
		q: "winning zero-knowledge privacy builds at Stellar hackathons",
		expect: ["searchHackathonBuilds"],
		note: "prior-art: winning hackathon builds",
	},
	// ── CODE / programming: a dev question must reach a CODE op (searchRepos
	// example, explainRepo deep-dive, searchResearch docs) — NOT the project
	// directory or off-Stellar docs. This is why the repos + DeepWiki were indexed.
	{
		q: "show me a Rust example of a Soroban token contract",
		expect: ["searchRepos"],
		note: "code: example repo by language",
	},
	{
		q: "find the Stellar JavaScript and TypeScript SDK repositories",
		expect: ["searchRepos"],
		note: "code: SDK repos",
	},
	{
		q: "flash loan implementation on Soroban",
		expect: ["searchRepos"],
		note: "code: example repo (xycloans)",
	},
	{
		q: "how does the Blend lending pool calculate interest rates in the code",
		expect: ["explainRepo", "searchRepos"],
		note: "code: deep repo mechanism (DeepWiki)",
	},
	{
		q: "explain how passkey-kit verifies a WebAuthn signature on Soroban",
		expect: ["explainRepo", "searchRepos"],
		note: "code: deep repo mechanism (DeepWiki)",
	},
	{
		q: "how do I write a Soroban smart contract in Rust",
		expect: ["searchResearch", "searchRepos"],
		note: "code: how-to (docs or example)",
	},
	{
		q: "how does cross-contract invocation and authorization work in Soroban",
		expect: ["searchResearch", "searchRepos"],
		note: "code: concept/docs",
	},
	{
		// NOT "how do I submit a tx with the JS SDK" — that phrasing correctly
		// routes to stellarDocs.search_sdk_cli_tools_docs (Stellar's OWN SDK docs
		// are the best source for using the official SDK, and that isn't a scout
		// op). Expecting our op to beat the official docs there was a mis-specified
		// probe. The scout-owned version of the question is "find me the example
		// CODE", which is what searchRepos exists for.
		q: "find a JavaScript example repo for building and submitting a Stellar transaction",
		expect: ["searchRepos"],
		note: "code: JS example repo (how-to phrasing belongs to stellarDocs)",
	},
];

// Adversarial / edge questions — chosen to THROW Raven off: off-topic, no-such-
// capability, cross-chain, negation, typos. We RECORD what routed (observed, not
// graded): there's no single "right" scout op, so a scout hit here isn't per se
// a finding — but a confident scout route to an off-topic/absent-capability
// question is worth eyeballing (does Raven over-claim, or hand off honestly?).
const ADVERSARIAL: Array<{ q: string; note: string }> = [
	{
		q: "what is the current price of XLM",
		note: "no price-feed capability — should NOT confidently claim a scout op",
	},
	{ q: "tell me about Solana", note: "off-topic (not Stellar)" },
	{ q: "how do I buy Bitcoin", note: "off-topic" },
	{
		q: "compare Ethereum and Stellar total value locked",
		note: "cross-chain — Ethereum half is out of scope",
	},
	{
		q: "Stellar projects that are NOT funded by SCF",
		note: "negation — easy to invert",
	},
	{
		q: "sorobon lending protcols",
		note: "typos — should still fuzzy-route to searchProjects",
	},
	{
		q: "list all Stellar mainnet validators",
		note: "validator-set capability we don't have",
	},
	{
		q: "who is the CEO of the Stellar Development Foundation",
		note: "person → getPeople (Denelle Dixon)",
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

	// ── DEMAND phase: the questions REAL users ask most and we MISS ──────────────
	// Not a curated list — the actual high-frequency misses Engine D mined from
	// api-usage. Ask Raven each: does OUR directory (a scout op) even get REACHED
	// in the top hits, or does a frequently-asked question route entirely to
	// docs/lumenloop? A miss here is weighted by how OFTEN it's asked.
	let demand: Array<{ query: string; hits: number }> = [];
	try {
		const dd = JSON.parse(readFileSync(DEMAND, "utf8")) as {
			misses?: Array<{ query?: string; hits?: number }>;
		};
		demand = (dd.misses ?? [])
			.map((m) => ({ query: String(m.query ?? ""), hits: Number(m.hits ?? 0) }))
			.filter((m) => m.query && !isSyntheticQuery(m.query))
			.sort((a, b) => b.hits - a.hits)
			.slice(0, 15);
	} catch {}
	const demandMisses: Array<{ query: string; hits: number; topAll: string[] }> =
		[];
	if (demand.length) {
		console.log(
			`\n\nraven-routing: demand — ${demand.length} most-asked-and-missed real queries, does OUR directory get reached?`,
		);
		for (const d of demand) {
			const r = await rpc(
				"tools/call",
				{ name: "search", arguments: { query: d.query } },
				sid,
			);
			const hits = hitsOf(r.body);
			const topAll = hits.slice(0, 3).map((h) => h.id);
			const scoutRank = hits.findIndex((h) => h.service === "scout");
			const reached = scoutRank >= 0 && scoutRank < TOP_K;
			if (reached) {
				process.stdout.write(".");
			} else {
				demandMisses.push({ query: d.query, hits: d.hits, topAll });
				console.log(
					`\n  ✗ [${d.hits}×] "${d.query.slice(0, 46)}" → ${topAll[0] ?? "none"} (no scout op in top-${TOP_K})`,
				);
			}
		}
	}

	// ── ADVERSARIAL: questions built to THROW Raven off — observed, not graded ──
	const adversarial: Array<{ query: string; top: string; note: string }> = [];
	console.log(
		`\n\nraven-routing: adversarial — how does Raven route trick questions?`,
	);
	for (const a of ADVERSARIAL) {
		const r = await rpc(
			"tools/call",
			{ name: "search", arguments: { query: a.q } },
			sid,
		);
		const top = hitsOf(r.body)[0]?.id ?? "none";
		adversarial.push({ query: a.q, top, note: a.note });
		console.log(`  · "${a.q.slice(0, 46)}" → ${top}`);
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
			demandChecked: demand.length,
			demandMissed: demandMisses.length,
		},
		okRate,
		misses,
		lagging, // cataloged-lag skips — surfaced for context, NOT findings
		demandMisses, // real high-frequency questions whose answer isn't OUR directory
		adversarial, // trick questions — observed routing, not graded
	};
	writeFileSync(OUT, `${JSON.stringify(artifact, null, "\t")}\n`);
	console.log(
		`\n\nraven-routing: capability ${graded - misses.length}/${graded} routed (${okRate * 100}%) · ${misses.length} gap(s) · ${lagging.length} lagging`,
	);
	console.log(
		`raven-routing: demand ${demand.length - demandMisses.length}/${demand.length} most-asked queries reach our directory · ${demandMisses.length} don't`,
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
