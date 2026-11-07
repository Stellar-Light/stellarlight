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
 * Resolved lazily with a dynamic import, as is every module this file reads;
 * its exports make it a module, so its names never collide in tsc's global
 * scope.
 */
// RAVEN_TOKEN is the name the repo's secret actually carries (see
// raven-category-battery.yml, raven-eval-parity.yml). Reading only
// RAVEN_MCP_TOKEN is why this guard could not be wired to CI at all: in a
// runner the ~/.config file does not exist either, so it would have skipped
// the catalog half and printed "ok" — the exact failure the comment above
// warns about, one env-var name away.
let MCP_TOKEN = process.env.RAVEN_MCP_TOKEN || process.env.RAVEN_TOKEN || "";
async function resolveToken(): Promise<void> {
	MCP_TOKEN = process.env.RAVEN_MCP_TOKEN || process.env.RAVEN_TOKEN || "";
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

// Raven's catalog omits what its own exposure policy excludes (12 operations
// at fec1c79, 2026-11-03). A list typed here on 2026-07-21 knew four of them,
// so every later exclusion read as an op Raven failed to index. The policy is
// read with the gate replica's reader, from a clone (RAVEN_DIR) or from the
// public repository's main branch, the code Raven deploys.
const RAVEN_POLICY_URL =
	"https://raw.githubusercontent.com/stellar-experimental/stellar-raven/main/src/policy/scout-exposure.ts";
export async function loadRavenExposure(): Promise<{
	source: string;
	sha256: string;
	excluded: Set<string>;
	/** Every exclusion, signature to Raven's name for it; required ones apart. */
	names: Map<string, string>;
	required: Set<string>;
}> {
	const { scoutExposure, sha256 } = await import("./eval/raven-policy");
	let source = RAVEN_POLICY_URL;
	let text: string;
	if (process.env.RAVEN_DIR) {
		const { readFileSync } = await import("node:fs");
		const { join } = await import("node:path");
		source = join(process.env.RAVEN_DIR, "src/policy/scout-exposure.ts");
		text = readFileSync(source, "utf8");
	} else {
		const res = await fetch(RAVEN_POLICY_URL, {
			headers: { "User-Agent": UA },
		});
		if (!res.ok) throw new Error(`${RAVEN_POLICY_URL}: HTTP ${res.status}`);
		text = await res.text();
	}
	const { excluded, optionalExcluded } = scoutExposure(text);
	const names = new Map([...excluded, ...optionalExcluded]);
	return {
		source,
		sha256: sha256(text),
		excluded: new Set(names.keys()),
		names,
		required: new Set(excluded.keys()),
	};
}

/** What Raven's catalog build asserts about its exclusions, as notes. */
export function policyNotes(
	spec: { paths?: Record<string, unknown> },
	policy: { names: Map<string, string>; required: Set<string> },
): string[] {
	const present = new Map<string, string>();
	for (const [path, methods] of Object.entries(spec.paths ?? {}))
		for (const [method, op] of Object.entries(
			methods as Record<string, unknown>,
		)) {
			const id = (op as { operationId?: string } | null)?.operationId;
			if (id) present.set(`${method.toUpperCase()} ${path}`, id);
		}
	const notes: string[] = [];
	for (const [sig, name] of policy.names) {
		const id = present.get(sig);
		if (id === undefined && policy.required.has(sig))
			notes.push(
				`Raven's policy excludes ${sig} (${name}), which the spec no longer lists; Raven's catalog build fails on an exclusion that resolves to nothing`,
			);
		else if (id !== undefined && id !== name)
			notes.push(
				`Raven's policy calls ${sig} ${name}, the spec calls it ${id}; Raven's catalog build fails on a renamed exclusion`,
			);
	}
	return notes;
}

/** The spec ops a discovery sweep should find, and the ones Raven excludes. */
export function classifySpecOps(
	spec: { paths?: Record<string, unknown> },
	excluded: Set<string>,
) {
	const ops: string[] = [];
	const excludedByPolicy: string[] = [];
	const pathByOp = new Map<string, string>();
	for (const [path, methods] of Object.entries(spec.paths ?? {})) {
		for (const [method, op] of Object.entries(
			methods as Record<string, unknown>,
		)) {
			const o =
				op && typeof op === "object"
					? (op as { operationId?: string; "x-side-effecting"?: boolean })
					: undefined;
			if (!o?.operationId) continue;
			if (excluded.has(`${method.toUpperCase()} ${path}`))
				excludedByPolicy.push(o.operationId);
			// Side-effecting ops (the get-listed flow: partnerOnboard,
			// submit-listing) are deliberately NOT part of the agent research
			// surface, so a discovery sweep must not expect to find them.
			// partnerOnboard was reported as a routing gap on 2026-09-06 purely
			// because this list included it.
			else if (o["x-side-effecting"] !== true) {
				ops.push(o.operationId);
				pathByOp.set(o.operationId, path);
			}
		}
	}
	return {
		ops: ops.sort(),
		excludedByPolicy: excludedByPolicy.sort(),
		pathByOp,
	};
}

interface DriftReport {
	generatedAt: string;
	specVersion: string;
	graceDays: number;
	expectedOps: string[];
	/** Spec ops Raven's own exposure policy excludes: its decision, not drift. */
	excludedByRavenPolicy: string[];
	/** Where that policy was read: a clone path or the repository URL. */
	ravenPolicySource: string;
	/** sha256 of the policy text read, to tie it to a Raven commit. */
	ravenPolicySha256: string | null;
	/** Catalog ops the policy read excludes: main ahead of Raven's deploy. */
	inCatalogButExcludedByPolicy: string[];
	catalogOps: string[] | null;
	/** Absent beyond the grace window (or undatable → old) — real drift. */
	missingFromCatalog: string[];
	/** In the CATALOG (an exact-name query id-matches it) but not surfaced by
	 *  the discovery sweep — our routing words are the gap, ours to fix. */
	undiscoverable: string[];
	/** Callable in the sandbox but with NO catalog entry: an exact-name query
	 *  returns only neighbours. No wording of ours can surface an op the index
	 *  does not hold, so an agent that does not already know the name cannot
	 *  find it. Theirs to index, once past the re-baseline grace window. */
	uncataloged: string[];
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

async function expectedFromSpec(
	policy: Awaited<ReturnType<typeof loadRavenExposure>>,
) {
	const res = await fetch(`${SCOUT_BASE}/api/openapi.json`, {
		headers: { "User-Agent": UA },
	});
	if (!res.ok) throw new Error(`openapi.json → HTTP ${res.status}`);
	const spec = await res.json();
	return {
		version: String(spec.info?.version ?? "?"),
		...classifySpecOps(spec, policy.excluded),
		policyNotes: policyNotes(spec, policy),
	};
}

async function catalogOps(specOps: string[]): Promise<{
	ops: string[];
	/** Ops the vocabulary sweep missed that the sandbox still exposes — our
	 *  discoverability gap, never their absence. */
	callableButUndiscovered: string[];
	/** Of the suspects, the ones the catalog actually holds an entry for. */
	cataloguedSuspects: string[];
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
	// Which suspects the catalog actually HOLDS. A catalogued op id-matches its
	// own name hard — listAudits scores 451 for the query "listAudits" — while
	// an op with no entry returns only neighbours at ~150. That difference is
	// what separates "our words do not reach it" from "their index does not
	// have it", and the two have different owners. Measured 2026-09-15:
	// getRwaAssets, getQualityReport and verifyClaim were all callable in the
	// sandbox and all returned zero self-hits, so every wording fix on our side
	// would have been wasted work.
	let catalogued: string[] = [];
	if (suspect.length) {
		const probe = `const names = ${JSON.stringify(suspect)}; return names.filter(n => typeof scout[n] === "function");`;
		try {
			const res = await rpc("tools/call", {
				name: "execute",
				arguments: { code: probe },
			});
			const t: string = res?.result?.content?.[0]?.text ?? "[]";
			const start = t.indexOf("[");
			callable =
				start >= 0 ? JSON.parse(t.slice(start, t.indexOf("]", start) + 1)) : [];
		} catch {
			callable = [];
		}
	}
	if (suspect.length) {
		const selfHit = `const names = ${JSON.stringify(suspect)}; const out = []; for (const n of names) { const r = await codemode.search(n, { service: "scout", limit: 5 }); if ((r.hits ?? []).some(h => h.id === "scout." + n)) out.push(n); } return out;`;
		try {
			const res = await rpc("tools/call", {
				name: "execute",
				arguments: { code: selfHit },
			});
			const t: string = res?.result?.content?.[0]?.text ?? "[]";
			const start = t.indexOf("[");
			catalogued =
				start >= 0 ? JSON.parse(t.slice(start, t.indexOf("]", start) + 1)) : [];
		} catch {
			// Probe failed → claim nothing. Every suspect stays in the
			// vocabulary bucket, which is the conservative attribution: it
			// blames us, not them.
			catalogued = suspect;
		}
	}
	return {
		ops: discovered,
		callableButUndiscovered: callable,
		cataloguedSuspects: catalogued,
		claimed,
		auditRouted,
	};
}

export async function main(argv = process.argv) {
	const jsonIdx = argv.indexOf("--json");
	const jsonOut = jsonIdx > -1 ? argv[jsonIdx + 1] : null;
	const write = async (report: DriftReport) => {
		if (!jsonOut) return;
		const { writeFileSync } = await import("node:fs");
		writeFileSync(jsonOut, `${JSON.stringify(report, null, "\t")}\n`);
		console.log(`\nartifact → ${jsonOut}`);
	};
	// A run that could not look still writes its artifact, checked: false with
	// the reason, so /api/quality stops showing the last run's verdict and date.
	const inconclusive = async (
		report: DriftReport,
		reason: string,
	): Promise<never> => {
		report.checked = false;
		report.notes.push(reason);
		console.error(`\nINCONCLUSIVE: ${reason}`);
		await write(report);
		process.exit(2);
	};

	let exposure: Awaited<ReturnType<typeof loadRavenExposure>>;
	try {
		exposure = await loadRavenExposure();
	} catch (err) {
		// Without the policy, an excluded op and a missing one look the same.
		return inconclusive(
			{
				generatedAt: new Date().toISOString(),
				specVersion: "?",
				graceDays: GRACE_DAYS,
				expectedOps: [],
				excludedByRavenPolicy: [],
				ravenPolicySource: process.env.RAVEN_DIR || RAVEN_POLICY_URL,
				ravenPolicySha256: null,
				inCatalogButExcludedByPolicy: [],
				catalogOps: null,
				missingFromCatalog: [],
				undiscoverable: [],
				uncataloged: [],
				laggingInCatalog: [],
				extraInCatalog: [],
				claimedOpCount: null,
				auditArchetypeRoutesToRegistry: null,
				checked: false,
				notes: [],
			},
			`could not read Raven's exposure policy: ${err instanceof Error ? err.message : err}`,
		);
	}
	const spec = await expectedFromSpec(exposure);
	console.log(`spec ${spec.version}: ${spec.ops.length} catalog-relevant ops`);
	console.log(
		`  excluded by Raven's own exposure policy, not drift (${exposure.source}): ${spec.excludedByPolicy.join(", ") || "none"}`,
	);

	const report: DriftReport = {
		generatedAt: new Date().toISOString(),
		specVersion: spec.version,
		graceDays: GRACE_DAYS,
		expectedOps: spec.ops,
		excludedByRavenPolicy: spec.excludedByPolicy,
		ravenPolicySource: exposure.source,
		ravenPolicySha256: exposure.sha256,
		inCatalogButExcludedByPolicy: [],
		catalogOps: null,
		missingFromCatalog: [],
		undiscoverable: [],
		uncataloged: [],
		laggingInCatalog: [],
		extraInCatalog: [],
		claimedOpCount: null,
		auditArchetypeRoutesToRegistry: null,
		checked: false,
		notes: [...spec.policyNotes],
	};
	for (const n of spec.policyNotes) console.log(`  ⚠ ${n}`);

	await resolveToken();
	if (!MCP_URL || !MCP_TOKEN) {
		// A run that skipped its only upstream probe is not "ok". This used to
		// print the warning and fall through to the success line, the same
		// shape as the truth battery reporting "0 fail" with four slices dead
		// (both 2026-09-06).
		return inconclusive(
			report,
			"no Raven credential (RAVEN_MCP_TOKEN, or ~/.config/stellarlight/raven.token); the catalog half could not run.",
		);
	} else {
		let cat: Awaited<ReturnType<typeof catalogOps>>;
		try {
			cat = await catalogOps(spec.ops);
		} catch (err) {
			return inconclusive(
				report,
				`could not read Raven's catalog: ${err instanceof Error ? err.message : err}`,
			);
		}
		report.checked = true;
		report.catalogOps = cat.ops;
		report.claimedOpCount = cat.claimed;
		report.auditArchetypeRoutesToRegistry = cat.auditRouted;
		const absent = spec.ops.filter((o) => !cat.ops.includes(o));
		report.extraInCatalog = cat.ops.filter(
			(o) => !spec.ops.includes(o) && !spec.excludedByPolicy.includes(o),
		);
		report.inCatalogButExcludedByPolicy = cat.ops.filter((o) =>
			spec.excludedByPolicy.includes(o),
		);

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
				// Present in the sandbox. Which half of the fix is ours depends
				// on whether the CATALOG holds an entry at all.
				if (cat.cataloguedSuspects.includes(op)) {
					// Indexed, just not reached by our words — our routing text.
					report.undiscoverable.push(op);
				} else {
					// No entry to rank. Nothing we write can surface it.
					report.uncataloged.push(op);
				}
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
		for (const u of report.uncataloged)
			console.log(
				`  ⚠ callable but UNCATALOGED: ${u} — scout.${u} runs in the sandbox, but an exact-name query returns no entry for it, so no agent using codemode.search can discover it and no wording of ours can change that (THEIR index, past grace)`,
			);
		for (const m of report.missingFromCatalog)
			console.log(`  ✗ missing beyond grace: ${m}`);
		for (const e of report.extraInCatalog)
			console.log(`  ✗ in catalog but not in spec: ${e}`);
		for (const e of report.inCatalogButExcludedByPolicy)
			console.log(
				`  ⚠ in catalog though Raven's policy (sha256 ${exposure.sha256.slice(0, 12)}) excludes it: ${e}; the policy read may be ahead of Raven's deploy`,
			);
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

	await write(report);

	if (report.checked && report.missingFromCatalog.length > 0) {
		console.log(
			`\nDRIFT: ${report.missingFromCatalog.length} op(s) absent beyond the ${GRACE_DAYS}d grace window — worth a (polite) upstream ping.`,
		);
		process.exit(1);
	}
	console.log("\nok");
}

// Run only as the entry script, not when a path merely contains its name.
const { isEntry } = await import("./eval/raven-policy");
if (isEntry(import.meta.url))
	main().catch((err) => {
		console.error("raven-drift-guard failed:", err.message ?? err);
		process.exit(2);
	});
