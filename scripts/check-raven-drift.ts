/**
 * Raven catalog drift guard — the CONSUMER-side mirror of check-api-drift.ts.
 *
 * check-api-drift asserts our own three surfaces agree (live ⇄ spec ⇄ docs).
 * This one asserts the #1 consumer's DISCOVERY INDEX agrees with our contract:
 * Raven's codemode catalog is built from our OpenAPI text (the spec IS the
 * discovery index), so an op missing there is a whole capability Raven cannot
 * route to — invisible in our own CI. First confirmed catch: listAudits +
 * getPeople (added openapi@1.8.0/1.8.3) absent from the catalog 12 days later
 * → kalepail/stellar-raven#38.
 *
 *   RAVEN_MCP_URL=https://agents.stellar.buzz/mcp \
 *   RAVEN_MCP_TOKEN=<token> \
 *   npx tsx scripts/check-raven-drift.ts [--json out.json]
 *
 * The token is per-user (issued by the Raven side) and must NEVER be committed
 * — pass it via env. Run LOCALLY on the weekly evidence pass (Actions-minutes
 * policy: detectors run locally, not on cron). Without the token the catalog
 * half is skipped and the run reports what it could not check (exit 0).
 * With the token: exits non-zero when the catalog is missing spec ops.
 */

const SCOUT_BASE = process.env.SCOUT_BASE || "https://stellarlight.xyz";
const MCP_URL = process.env.RAVEN_MCP_URL || "";
const MCP_TOKEN = process.env.RAVEN_MCP_TOKEN || "";
// Cloudflare 1010-blocks some non-browser signatures (python-urllib); a curl
// UA passes. Keep our name in the string for their logs.
const UA = "curl/8 stellarlight-raven-drift-guard";

// Write/interactive surfaces Raven's catalog intentionally omits (observed
// policy 2026-07-21: all data GETs + the two partner POST flows are served).
const CATALOG_EXCLUDED = new Set([
	"getFeedbackSchema",
	"submitFeedback",
	"partnerAssistant",
	"submitPartnerListing",
]);

interface DriftReport {
	generatedAt: string;
	specVersion: string;
	expectedOps: string[];
	catalogOps: string[] | null;
	missingFromCatalog: string[];
	extraInCatalog: string[];
	claimedOpCount: number | null;
	auditArchetypeRoutesToRegistry: boolean | null;
	checked: boolean;
	notes: string[];
}

let rpcId = 0;
let sessionId: string | null = null;

/** POST one JSON-RPC message; parses direct-JSON or SSE-framed replies. */
// biome-ignore lint/suspicious/noExplicitAny: dynamic JSON-RPC payloads
async function rpc(method: string, params?: unknown): Promise<any> {
	rpcId += 1;
	// biome-ignore lint/suspicious/noExplicitAny: JSON-RPC envelope
	const body: any = { jsonrpc: "2.0", method };
	if (params !== undefined) body.params = params;
	if (!method.startsWith("notifications/")) body.id = rpcId;
	const res = await fetch(MCP_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			Authorization: `Bearer ${MCP_TOKEN}`,
			"User-Agent": UA,
			...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
		},
		body: JSON.stringify(body),
	});
	sessionId = res.headers.get("Mcp-Session-Id") ?? sessionId;
	const raw = await res.text();
	if (method.startsWith("notifications/")) return {};
	if (!res.ok)
		throw new Error(`${method} → HTTP ${res.status}: ${raw.slice(0, 200)}`);
	let payload = raw;
	if (raw.includes("data:")) {
		for (const line of raw.split("\n")) {
			if (line.startsWith("data:")) {
				payload = line.slice(5).trim();
				break;
			}
		}
	}
	return payload ? JSON.parse(payload) : {};
}

async function expectedFromSpec(): Promise<{ version: string; ops: string[] }> {
	const res = await fetch(`${SCOUT_BASE}/api/openapi.json`, {
		headers: { "User-Agent": UA },
	});
	if (!res.ok) throw new Error(`openapi.json → HTTP ${res.status}`);
	const spec = await res.json();
	const ops: string[] = [];
	for (const methods of Object.values(spec.paths ?? {})) {
		for (const op of Object.values(methods as Record<string, unknown>)) {
			const id =
				op && typeof op === "object"
					? (op as { operationId?: string }).operationId
					: undefined;
			if (id && !CATALOG_EXCLUDED.has(id)) ops.push(id);
		}
	}
	return { version: String(spec.info?.version ?? "?"), ops: ops.sort() };
}

async function catalogOps(): Promise<{
	ops: string[];
	claimed: number | null;
	auditRouted: boolean | null;
}> {
	const init = await rpc("initialize", {
		protocolVersion: "2025-03-26",
		capabilities: {},
		clientInfo: { name: "stellarlight-raven-drift-guard", version: "1" },
	});
	const instructions: string = init?.result?.instructions ?? "";
	const claimedMatch = instructions.match(/Scout \(scout; (\d+) ops\)/);
	const claimed = claimedMatch ? Number(claimedMatch[1]) : null;
	// Does the incident/audit workflow archetype route to the structured
	// registry (listAudits) or at least cited research? (#38's second finding)
	const auditArch = instructions
		.split("\n")
		.find((l) => /Incident\/audit claim/i.test(l));
	const auditRouted = auditArch
		? /listAudits|searchResearch/.test(auditArch)
		: null;
	await rpc("notifications/initialized", {});

	// Vocabulary sweep — the catalog search caps hits per query, so union
	// several targeted queries inside ONE execute (same technique as #38).
	const sweep = `const qs = ["projects search directory","repos code search","builders people leaderboard","hackathons compare winners","research corpus semantic","skills marketplace list","partners anchors match","clusters topics analyze ecosystem","changelog status health","audits security reports","people person lookup identity","rfps grants open","feedback submit","explain repo deepwiki"]; const rs = await Promise.all(qs.map(q => codemode.search(q, { service: "scout", limit: 20 }))); const ids = new Set(); for (const r of rs) for (const h of (r.hits ?? [])) if (h.id && h.id.startsWith("scout.")) ids.add(h.id); return [...ids].sort();`;
	const out = await rpc("tools/call", {
		name: "execute",
		arguments: { code: sweep },
	});
	const text: string = out?.result?.content?.[0]?.text ?? "[]";
	let ids: string[] = [];
	try {
		ids = JSON.parse(text);
	} catch {
		throw new Error(
			`execute returned unparseable payload: ${text.slice(0, 160)}`,
		);
	}
	return {
		ops: ids.map((id) => id.replace(/^scout\./, "")).sort(),
		claimed,
		auditRouted,
	};
}

async function main() {
	const jsonIdx = process.argv.indexOf("--json");
	const jsonOut = jsonIdx > -1 ? process.argv[jsonIdx + 1] : null;

	const spec = await expectedFromSpec();
	console.log(`spec ${spec.version} — ${spec.ops.length} catalog-relevant ops`);

	const report: DriftReport = {
		generatedAt: new Date().toISOString(),
		specVersion: spec.version,
		expectedOps: spec.ops,
		catalogOps: null,
		missingFromCatalog: [],
		extraInCatalog: [],
		claimedOpCount: null,
		auditArchetypeRoutesToRegistry: null,
		checked: false,
		notes: [],
	};

	if (!MCP_URL || !MCP_TOKEN) {
		report.notes.push(
			"RAVEN_MCP_URL/RAVEN_MCP_TOKEN not set — catalog half SKIPPED (local-only credentials).",
		);
		console.log(`\n⚠ ${report.notes[0]}`);
	} else {
		const cat = await catalogOps();
		report.checked = true;
		report.catalogOps = cat.ops;
		report.claimedOpCount = cat.claimed;
		report.auditArchetypeRoutesToRegistry = cat.auditRouted;
		report.missingFromCatalog = spec.ops.filter((o) => !cat.ops.includes(o));
		report.extraInCatalog = cat.ops.filter((o) => !spec.ops.includes(o));

		console.log(
			`catalog — ${cat.ops.length} scout ops (instructions claim ${cat.claimed ?? "?"})`,
		);
		for (const m of report.missingFromCatalog)
			console.log(`  ✗ missing from catalog: ${m}`);
		for (const e of report.extraInCatalog)
			console.log(`  ✗ in catalog but not in spec: ${e}`);
		if (report.auditArchetypeRoutesToRegistry === false)
			console.log(
				"  ⚠ incident/audit archetype does not route to listAudits/searchResearch",
			);
		if (
			report.missingFromCatalog.length === 0 &&
			report.extraInCatalog.length === 0
		)
			console.log("  ✓ catalog op list matches the contract");
	}

	if (jsonOut) {
		const { writeFileSync } = await import("node:fs");
		writeFileSync(jsonOut, `${JSON.stringify(report, null, "\t")}\n`);
		console.log(`\nartifact → ${jsonOut}`);
	}

	if (report.checked && report.missingFromCatalog.length > 0) {
		console.log(
			`\nDRIFT: ${report.missingFromCatalog.length} op(s) invisible to Raven (tracking: kalepail/stellar-raven#38)`,
		);
		process.exit(1);
	}
	console.log("\nok");
}

main().catch((err) => {
	console.error("raven-drift-guard failed:", err.message ?? err);
	process.exit(2);
});
