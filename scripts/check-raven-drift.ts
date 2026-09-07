/**
 * Raven catalog drift guard — the CONSUMER-side mirror of check-api-drift.ts.
 *
 * check-api-drift asserts our own three surfaces agree (live ⇄ spec ⇄ docs).
 * This one asserts the #1 consumer's DISCOVERY INDEX agrees with our contract:
 * Raven's codemode catalog is built from our OpenAPI text (the spec IS the
 * discovery index), so an op missing there is a whole capability Raven cannot
 * route to — invisible in our own CI.
 *
 * CADENCE, NOT DEFECT: the consumer re-baselines on their own schedule, and
 * their daily drift CI already detects our additions — an op we shipped days
 * ago being absent is EXPECTED lag, not drift (lesson from over-filing
 * kalepail/stellar-raven#38 for a 2-day lag; closed as noise). So a missing op
 * younger than RAVEN_DRIFT_GRACE_DAYS (default 10, dated via /api/changelog)
 * only WARNS; it FAILS when it outlives the grace window or can't be dated
 * (i.e. it's old and should have been absorbed long ago).
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
const MCP_URL = process.env.RAVEN_MCP_URL || "https://agents.stellar.buzz/mcp";
/**
 * The token is durable at ~/.config/stellarlight/raven.token. Reading only the
 * env meant every local run skipped the catalog half — and then printed "ok".
 * Resolved lazily with a dynamic import: this file deliberately has no
 * top-level import, so that it stays in global scope (see the collision guard
 * at the bottom).
 */
let MCP_TOKEN = process.env.RAVEN_MCP_TOKEN || "";
async function resolveToken(): Promise<void> {
	if (MCP_TOKEN) return;
	try {
		const { readFileSync } = await import("node:fs");
		const { homedir } = await import("node:os");
		const { join } = await import("node:path");
		MCP_TOKEN = readFileSync(
			join(homedir(), ".config/stellarlight/raven.token"),
			"utf8",
		).trim();
	} catch {
		MCP_TOKEN = "";
	}
}
// How long a newly-shipped op may stay un-cataloged before lag becomes drift.
const GRACE_DAYS = Number(process.env.RAVEN_DRIFT_GRACE_DAYS || 10);
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
	graceDays: number;
	expectedOps: string[];
	catalogOps: string[] | null;
	/** Absent beyond the grace window (or undatable → old) — real drift. */
	missingFromCatalog: string[];
	/** In the sandbox but not surfaced by the discovery sweep — ours to fix. */
	undiscoverable: string[];
	/** Absent but recently shipped — expected re-baseline lag, warn only. */
	laggingInCatalog: { op: string; addedAt: string; ageDays: number }[];
	extraInCatalog: string[];
	claimedOpCount: number | null;
	auditArchetypeRoutesToRegistry: boolean | null;
	checked: boolean;
	notes: string[];
}

/**
 * Date each op's public introduction from /api/changelog. Entries name either
 * the operationId ("getPeople") or the path ("New GET /api/audits"), so try
 * needles most-specific-first and take the EARLIEST entry of the first needle
 * that matches at all (avoids a parent path pre-dating a newer sub-path op).
 * Undatable = predates the recent changelog window = old enough that absence
 * is drift, not lag.
 */
async function addedDates(
	ops: string[],
	pathByOp: Map<string, string>,
): Promise<Map<string, string>> {
	const dated = new Map<string, string>();
	if (ops.length === 0) return dated;
	try {
		const res = await fetch(`${SCOUT_BASE}/api/changelog?limit=100`, {
			headers: { "User-Agent": UA },
		});
		if (!res.ok) return dated;
		const body = await res.json();
		const entries: { date?: string; summary?: string; detail?: string }[] =
			body.entries ?? [];
		for (const op of ops) {
			const path = pathByOp.get(op) ?? "";
			const needles = [
				op.toLowerCase(),
				...(path && !path.includes("{") ? [path.toLowerCase()] : []),
				...(path.includes("{") ? [path.split("{")[0].toLowerCase()] : []),
			];
			for (const needle of needles) {
				let earliest: string | null = null;
				for (const e of entries) {
					const text = `${e.summary ?? ""} ${e.detail ?? ""}`.toLowerCase();
					if (text.includes(needle) && e.date) earliest = e.date; // latest-first → last hit = earliest
				}
				if (earliest) {
					dated.set(op, earliest);
					break;
				}
			}
		}
	} catch {
		// changelog unreachable → treat all as undatable (drift)
	}
	return dated;
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

async function expectedFromSpec(): Promise<{
	version: string;
	ops: string[];
	pathByOp: Map<string, string>;
}> {
	const res = await fetch(`${SCOUT_BASE}/api/openapi.json`, {
		headers: { "User-Agent": UA },
	});
	if (!res.ok) throw new Error(`openapi.json → HTTP ${res.status}`);
	const spec = await res.json();
	const ops: string[] = [];
	const pathByOp = new Map<string, string>();
	for (const [path, methods] of Object.entries(spec.paths ?? {})) {
		for (const op of Object.values(methods as Record<string, unknown>)) {
			const id =
				op && typeof op === "object"
					? (op as { operationId?: string }).operationId
					: undefined;
			// Side-effecting ops (the get-listed flow: partnerOnboard,
			// submit-listing) are deliberately NOT part of the agent research
			// surface, so a discovery sweep must not expect to find them.
			// partnerOnboard was reported as a routing gap on 2026-09-06 purely
			// because this list included it.
			const sideEffecting =
				op && typeof op === "object"
					? (op as { "x-side-effecting"?: boolean })["x-side-effecting"] === true
					: false;
			if (id && !CATALOG_EXCLUDED.has(id) && !sideEffecting) {
				ops.push(id);
				pathByOp.set(id, path);
			}
		}
	}
	return {
		version: String(spec.info?.version ?? "?"),
		ops: ops.sort(),
		pathByOp,
	};
}

async function catalogOps(specOps: string[]): Promise<{
	ops: string[];
	/** Ops the vocabulary sweep missed that the sandbox still exposes — our
	 *  discoverability gap, never their absence. */
	callableButUndiscovered: string[];
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
	//
	// The query list IS the instrument's reach. On 2026-09-06 it had no
	// idea-vetting question in it, so vetIdea came back "missing beyond grace"
	// while ranking FIRST for "should i build this on stellar". A sweep can
	// only report on the vocabularies it actually asks.
	const sweep = `const qs = ["projects search directory","repos code search","builders people leaderboard","hackathons compare winners","research corpus semantic","skills marketplace list","partners anchors match","clusters topics analyze ecosystem","changelog status health","audits security reports","people person lookup identity","rfps grants open","feedback submit","explain repo deepwiki","vet a build idea competitors prior art","should i build this on stellar","scf pitch funding readiness","verify claim quality report","rwa tokenized assets"]; const rs = await Promise.all(qs.map(q => codemode.search(q, { service: "scout", limit: 20 }))); const ids = new Set(); for (const r of rs) for (const h of (r.hits ?? [])) if (h.id && h.id.startsWith("scout.")) ids.add(h.id); return [...ids].sort();`;
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
	const discovered = ids.map((id) => id.replace(/^scout\./, "")).sort();

	// An op the sweep did not surface is NOT necessarily absent. The sweep
	// measures DISCOVERABILITY through 14 vocabulary queries; the sandbox is
	// the authority on existence. vetIdea was reported "missing beyond grace"
	// on 2026-09-06 while `typeof scout.vetIdea === "function"` — callable, just
	// unreachable by those words. That distinction decides who owns the fix:
	// callable-but-undiscoverable is OUR routing vocabulary, not their catalog.
	const suspect = specOps.filter((o: string) => !discovered.includes(o));
	let callable: string[] = [];
	if (suspect.length) {
		const probe = `const names = ${JSON.stringify(suspect)}; return names.filter(n => typeof scout[n] === "function");`;
		try {
			const res = await rpc("tools/call", {
				name: "execute",
				arguments: { code: probe },
			});
			const t: string = res?.result?.content?.[0]?.text ?? "[]";
			const start = t.indexOf("[");
			callable = start >= 0 ? JSON.parse(t.slice(start, t.indexOf("]", start) + 1)) : [];
		} catch {
			callable = [];
		}
	}
	return {
		ops: discovered,
		callableButUndiscovered: callable,
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
		graceDays: GRACE_DAYS,
		expectedOps: spec.ops,
		catalogOps: null,
		missingFromCatalog: [],
		undiscoverable: [],
		laggingInCatalog: [],
		extraInCatalog: [],
		claimedOpCount: null,
		auditArchetypeRoutesToRegistry: null,
		checked: false,
		notes: [],
	};

	await resolveToken();
	if (!MCP_URL || !MCP_TOKEN) {
		// A run that skipped its only upstream probe is not "ok". This used to
		// print the warning and fall through to the success line — the same
		// shape as the truth battery reporting "0 fail" with four slices dead
		// (both 2026-09-06).
		report.notes.push(
			"no Raven credential (RAVEN_MCP_TOKEN, or ~/.config/stellarlight/raven.token) — the catalog half could not run.",
		);
		console.error(`\nINCONCLUSIVE: ${report.notes[0]}`);
		process.exit(2);
	} else {
		const cat = await catalogOps(spec.ops);
		report.checked = true;
		report.catalogOps = cat.ops;
		report.claimedOpCount = cat.claimed;
		report.auditArchetypeRoutesToRegistry = cat.auditRouted;
		const absent = spec.ops.filter((o) => !cat.ops.includes(o));
		report.extraInCatalog = cat.ops.filter((o) => !spec.ops.includes(o));

		// Split absent ops into expected re-baseline lag vs real drift.
		const dates = await addedDates(absent, spec.pathByOp);
		const now = Date.now();
		for (const op of absent) {
			const addedAt = dates.get(op);
			const ageDays = addedAt
				? Math.floor((now - new Date(addedAt).getTime()) / 86_400_000)
				: null;
			if (addedAt && ageDays !== null && ageDays <= GRACE_DAYS) {
				report.laggingInCatalog.push({ op, addedAt, ageDays });
			} else if (cat.callableButUndiscovered.includes(op)) {
				// Present in the sandbox, unreachable by our discovery
				// vocabulary. That is our routing text to fix, not their
				// catalog to chase.
				report.undiscoverable.push(op);
			} else {
				report.missingFromCatalog.push(op);
			}
		}

		console.log(
			`catalog — ${cat.ops.length} scout ops (instructions claim ${cat.claimed ?? "?"})`,
		);
		for (const l of report.laggingInCatalog)
			console.log(
				`  ⚠ lagging (expected): ${l.op} shipped ${l.ageDays}d ago — awaiting their re-baseline (grace ${GRACE_DAYS}d)`,
			);
		for (const u of report.undiscoverable)
			console.log(
				`  ⚠ callable but undiscovered: ${u} — scout.${u} exists in the sandbox; our own discovery vocabulary does not reach it (OUR fix, not theirs)`,
			);
		for (const m of report.missingFromCatalog)
			console.log(`  ✗ missing beyond grace: ${m}`);
		for (const e of report.extraInCatalog)
			console.log(`  ✗ in catalog but not in spec: ${e}`);
		if (report.auditArchetypeRoutesToRegistry === false)
			console.log(
				"  ⚠ incident/audit archetype does not route to listAudits/searchResearch",
			);
		if (
			report.missingFromCatalog.length === 0 &&
			report.laggingInCatalog.length === 0 &&
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
			`\nDRIFT: ${report.missingFromCatalog.length} op(s) absent beyond the ${GRACE_DAYS}d grace window — worth a (polite) upstream ping.`,
		);
		process.exit(1);
	}
	console.log("\nok");
}

main().catch((err) => {
	console.error("raven-drift-guard failed:", err.message ?? err);
	process.exit(2);
});

// Global-scope collision guard: with no import/export, tsc puts this file
// in the shared global scope where every script's main/BASE/PROBES collide —
// and WHICH file draws the error depends on enumeration order, which differs
// macOS vs linux (the baseline divergence of 2026-09-01). export{} makes it a
// module; tsx runtime behavior is unchanged.
export {};
