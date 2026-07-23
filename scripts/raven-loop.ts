/**
 * The through-Raven feeder — slice 2 of the improvement ledger.
 *
 * The other detectors replay against OUR API directly. This one runs through the
 * REAL Raven codemode gateway (agents.stellar.buzz/mcp) — the actual consumer
 * path: Raven's routing, our op, the response envelope, the host's coaching
 * blocks. Two phases, both `surface: consumer` for the ledger orchestrator:
 *
 *   1. GOLDEN — the curated golden questions graded against their answer key.
 *      Measures CORRECTNESS through the gateway (what the SDF agent gets).
 *   2. DEMAND parity — the REAL consumer queries Engine D mined. Engine D owns
 *      the DATA gaps (weak/empty on our API); the non-duplicative consumer
 *      question is PARITY: for a real query the API still answers RIGHT NOW,
 *      does the through-Raven path preserve the rows or dead-end? A dead-end is
 *      a consumer-path loss (routing/envelope), not a data gap.
 *
 * This is the "the engine actually USES Raven to drive improvements" piece — a
 * consumer-path failure our direct-API evals can't see becomes a ranked ledger
 * finding.
 *
 *   RAVEN_MCP=… RAVEN_TOKEN=… pnpm exec tsx scripts/raven-loop.ts
 *   # or: set -a; . <scratchpad>/raven.env; set +a; pnpm exec tsx scripts/raven-loop.ts
 *
 * LOCAL RUN ONLY. The Raven bearer token must NEVER be committed / put in CI /
 * Actions secrets (standing rule) — this script reads it from the environment
 * only, never hardcodes it, never writes it to the artifact, never logs it.
 * The emitted artifact contains only questions + grades.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GOLDEN = join(ROOT, "scripts/eval/golden-questions.json");
const DEMAND = join(
	ROOT,
	"improvements/engine/weekly/engine-d-demand-latest.json",
);
const OUT = join(ROOT, "improvements/engine/raven-loop-latest.json");

const URL = process.env.RAVEN_MCP;
const TOKEN = process.env.RAVEN_TOKEN;
// Our own public API — the parity baseline the demand phase re-verifies against.
const BASE = (process.env.BASE_URL || "https://stellarlight.xyz").replace(
	/\/$/,
	"",
);
if (!URL || !TOKEN) {
	console.error(
		"raven-loop: RAVEN_MCP and RAVEN_TOKEN must be in the env (source your scratchpad raven.env). LOCAL RUN ONLY — never commit the token.",
	);
	process.exit(2);
}

// ── minimal MCP client (streamable-HTTP, SSE-framed) ────────────────────────
// Cloudflare in front of the gateway blocks default UAs → present as curl.
let _id = 0;
async function rpc(
	method: string,
	params: unknown,
	session?: string,
): Promise<{ body: Record<string, unknown> | null; session: string | null }> {
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
	if (!raw) return { body: null, session: sid };
	// streamable-http may wrap the JSON in SSE `data:` frames
	let json = raw;
	if (
		raw.startsWith("event:") ||
		raw.includes("\ndata:") ||
		raw.startsWith("data:")
	) {
		for (const line of raw.split("\n")) {
			if (line.startsWith("data:")) {
				json = line.slice(5).trim();
				break;
			}
		}
	}
	try {
		return { body: JSON.parse(json), session: sid };
	} catch {
		return { body: null, session: sid };
	}
}

async function openSession(): Promise<string> {
	const { body, session } = await rpc("initialize", {
		protocolVersion: "2025-03-26",
		capabilities: {},
		clientInfo: { name: "sl-raven-loop", version: "1" },
	});
	const sid = session ?? "";
	// notifications/initialized may 202/400 — ignore its body
	await rpc("notifications/initialized", {}, sid).catch(() => {});
	if (!body) throw new Error("initialize returned no body");
	return sid;
}

async function execute(session: string, code: string): Promise<string> {
	const { body } = await rpc(
		"tools/call",
		{ name: "execute", arguments: { code } },
		session,
	);
	const content = (body?.result as { content?: Array<{ text?: string }> })
		?.content;
	return (content ?? []).map((c) => c.text ?? "").join("\n");
}

// ── the bank ────────────────────────────────────────────────────────────────
interface Golden {
	id: string;
	mode: "research" | "projects" | "repos" | string;
	question: string;
	expect?: { answerRegex?: string[] };
}

// mode → the scout op an agent's question routes to, and how to project the
// answer to text we can grade. We drive the op explicitly (routing accuracy is
// a separate eval); this measures whether the DATA + ENVELOPE through Raven
// answer the question the golden key expects.
const OP_FOR: Record<string, { call: string; project: string } | undefined> = {
	// Project the fields the golden answerRegex actually grades — a research
	// answer is in the chunk CONTENT (not the title); a project match is in the
	// DESCRIPTION/types (not the slug). Under-projecting manufactures false
	// misses (the grader-honesty trap). Cap content so the payload stays sane.
	research: {
		call: "scout.searchResearch",
		project:
			"r.data.results.slice(0,3).map(x=>({t:x.title,u:x.url,c:(x.content||'').slice(0,600)}))",
	},
	projects: {
		call: "scout.searchProjects",
		project:
			"r.data.projects.slice(0,5).map(p=>({s:p.slug,n:p.name,d:p.shortDescription,ty:p.types}))",
	},
	repos: {
		call: "scout.searchRepos",
		project: "r.data.repos.slice(0,5).map(x=>({f:x.fullName,d:x.description}))",
	},
};

interface Miss {
	query: string;
	mode: string;
	failureMode: "empty" | "mismatch" | "error";
	expected: string;
}

// ── demand phase ────────────────────────────────────────────────────────────
// Engine D mines REAL consumer queries and flags the ones weak/empty on OUR
// API. Those are DATA gaps it already owns — feeding them through Raven would
// just re-report the same gap (Raven calls the same API). The NON-duplicative
// consumer-path question is PARITY: for a real query the API can still answer
// RIGHT NOW, does the through-Raven path preserve the rows, or dead-end? A
// dead-end here is a consumer-path loss (routing/envelope drops data the API
// has) — distinct from a data gap. We parity-check ONLY queries whose API rows
// we re-verify live (so a since-removed record can't read as a consumer defect),
// and never on synthetic/test noise.
const DEMAND_OP: Record<
	string,
	{ call: string; rows: string; direct: (d: Record<string, unknown>) => number }
> = {
	"/api/projects/search": {
		call: "scout.searchProjects",
		rows: "r.data.projects",
		direct: (d) => (Array.isArray(d.projects) ? d.projects.length : 0),
	},
	"/api/research": {
		call: "scout.searchResearch",
		rows: "r.data.results",
		direct: (d) => (Array.isArray(d.results) ? d.results.length : 0),
	},
	"/api/repos/search": {
		call: "scout.searchRepos",
		rows: "r.data.repos",
		direct: (d) => (Array.isArray(d.repos) ? d.repos.length : 0),
	},
};

/** Drop synthetic/probe noise so a dead-end is never manufactured on junk. */
function isJunkQuery(q: string): boolean {
	const s = q.trim().toLowerCase();
	if (s.length < 3) return true;
	if (s === "test" || s === "testing" || s === "hello") return true;
	if (/nonexistent|zzz{2,}|^z{4,}/.test(s)) return true;
	return false;
}

/** Live row count from OUR API — the parity baseline, checked at loop time. */
async function directRows(endpoint: string, q: string): Promise<number | null> {
	const spec = DEMAND_OP[endpoint];
	if (!spec) return null;
	try {
		const res = await fetch(
			`${BASE}${endpoint}?q=${encodeURIComponent(q)}&limit=10`,
			{ headers: { "User-Agent": "stellarlight-raven-loop" } },
		);
		if (!res.ok) return null;
		return spec.direct((await res.json()) as Record<string, unknown>);
	} catch {
		return null;
	}
}

interface DemandDeadend {
	query: string;
	endpoint: string;
	apiRows: number;
	evidence: string;
}

async function main() {
	const raw = JSON.parse(readFileSync(GOLDEN, "utf8"));
	const bank: Golden[] = (
		Array.isArray(raw) ? raw : (raw.questions ?? [])
	).filter((q: Golden) => OP_FOR[q.mode] && q.expect?.answerRegex?.length);
	console.log(
		`raven-loop: ${bank.length} gradeable golden questions through the live gateway…`,
	);

	const session = await openSession();
	const misses: Miss[] = [];
	let graded = 0;

	for (const q of bank) {
		const op = OP_FOR[q.mode];
		if (!op) continue;
		const code = `const r = await ${op.call}({q:${JSON.stringify(q.question)},limit:5}); return r && r.ok ? JSON.stringify(${op.project}) : ("ERR:"+(r&&r.error&&r.error.message||"no-ok"));`;
		let answer = "";
		let failureMode: Miss["failureMode"] | null = null;
		try {
			answer = await execute(session, code);
		} catch {
			failureMode = "error";
		}
		graded++;
		if (!failureMode) {
			// the returned line is the projected JSON; coaching blocks are appended
			// after it and won't false-match a specific answerRegex.
			if (!answer || /"ERR:|\[\]/.test(answer) === true) {
				// empty projection ([]) or op error
				if (/\[\]/.test(answer.split("\n")[0] ?? "")) failureMode = "empty";
			}
			const regexes = q.expect?.answerRegex ?? [];
			const hit = regexes.some((re) => {
				try {
					return new RegExp(re, "i").test(answer);
				} catch {
					return answer.toLowerCase().includes(re.toLowerCase());
				}
			});
			if (!hit && !failureMode) failureMode = "mismatch";
			else if (hit) failureMode = null;
		}
		if (failureMode) {
			misses.push({
				query: q.question,
				mode: q.mode,
				failureMode,
				expected: (q.expect?.answerRegex ?? []).join(" | "),
			});
			console.log(`  ✗ [${failureMode}] ${q.mode}: ${q.question.slice(0, 60)}`);
		} else {
			process.stdout.write(".");
		}
	}

	const okRate =
		graded > 0
			? Math.round(((graded - misses.length) / graded) * 100) / 100
			: 1;

	// ── demand parity: real consumer queries through the same gateway ──────────
	let demandRaw: { misses?: Array<Record<string, unknown>> } | null = null;
	try {
		demandRaw = JSON.parse(readFileSync(DEMAND, "utf8"));
	} catch {
		demandRaw = null;
	}
	const paritySet = (demandRaw?.misses ?? [])
		.map((m) => ({
			endpoint: String(m.endpoint ?? ""),
			query: String(m.query ?? ""),
			cls: String(m.class ?? ""),
		}))
		// API returned rows (WEAK/FALLBACK) → parity-checkable; EMPTY = a data gap
		// engine-d owns, skip. Op-mapped endpoints + non-junk queries only.
		.filter(
			(m) =>
				DEMAND_OP[m.endpoint] &&
				(m.cls === "WEAK" || m.cls === "FALLBACK") &&
				!isJunkQuery(m.query),
		);

	const demandDeadends: DemandDeadend[] = [];
	let demandChecked = 0;
	let demandGone = 0;
	if (paritySet.length) {
		console.log(
			`\n\nraven-loop: demand parity — ${paritySet.length} real quer(ies) the API still answers, through the gateway…`,
		);
		for (const m of paritySet) {
			const spec = DEMAND_OP[m.endpoint];
			const apiRows = await directRows(m.endpoint, m.query);
			if (apiRows === null) continue; // endpoint hiccup — don't misreport
			if (apiRows === 0) {
				demandGone++; // data gone since engine-d's run → not a consumer defect
				continue;
			}
			demandChecked++;
			const code = `const r = await ${spec.call}({q:${JSON.stringify(m.query)},limit:10}); return r && r.ok ? String((${spec.rows}||[]).length) : ("ERR:"+(r&&r.error&&r.error.message||"no-ok"));`;
			let out = "";
			try {
				out = await execute(session, code);
			} catch {
				out = "ERR:throw";
			}
			const first = (out.split("\n")[0] ?? "").trim();
			const ravenRows = /^\d+$/.test(first)
				? Number.parseInt(first, 10)
				: first.startsWith("ERR:")
					? -1
					: 0;
			if (ravenRows <= 0) {
				demandDeadends.push({
					query: m.query,
					endpoint: m.endpoint,
					apiRows,
					evidence:
						ravenRows < 0
							? `API returns ${apiRows} row(s) now; through-Raven ${spec.call} errored (${first.slice(0, 40)})`
							: `API returns ${apiRows} row(s) now; through-Raven ${spec.call} returned 0 — consumer-path loss`,
				});
				console.log(
					`  ✗ [deadend] ${m.endpoint.replace("/api/", "")}: ${m.query.slice(0, 50)} (api ${apiRows} → raven 0)`,
				);
			} else {
				process.stdout.write(".");
			}
		}
	}

	const artifact = {
		generatedAt: new Date().toISOString(),
		gateway: URL, // the endpoint, not the token
		frame: { graded, passed: graded - misses.length, failed: misses.length },
		okRate,
		misses,
		demand: {
			checked: demandChecked,
			parityHeld: demandChecked - demandDeadends.length,
			deadends: demandDeadends.length,
			goneNow: demandGone, // API empty NOW → data gap (engine-d owns), not a consumer defect
		},
		demandDeadends,
	};
	writeFileSync(OUT, `${JSON.stringify(artifact, null, "\t")}\n`);
	console.log(
		`\n\nraven-loop: golden ${graded - misses.length}/${graded} passed through Raven (${okRate * 100}%) · ${misses.length} consumer finding(s)`,
	);
	if (demandChecked || demandGone) {
		console.log(
			`raven-loop: demand parity ${demandChecked - demandDeadends.length}/${demandChecked} held · ${demandDeadends.length} consumer-path loss · ${demandGone} data-gap now (engine-d owns)`,
		);
	}
	console.log(`  wrote → improvements/engine/raven-loop-latest.json`);
	console.log(
		"  next: pnpm exec tsx scripts/improvement-ledger.ts   (ingests these as surface:consumer)",
	);
}

main().catch((e) => {
	console.error("raven-loop failed:", e instanceof Error ? e.message : e);
	process.exit(1);
});
