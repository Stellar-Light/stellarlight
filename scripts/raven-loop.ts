/**
 * The through-Raven feeder — slice 2 of the improvement ledger.
 *
 * The other detectors replay against OUR API directly. This one runs the golden
 * questions through the REAL Raven codemode gateway (agents.stellar.buzz/mcp) —
 * the actual consumer path: Raven's routing, our op, the response envelope, the
 * host's coaching blocks. It grades each through-Raven answer against the golden
 * answer key and emits a detector artifact; the ledger orchestrator ingests it
 * as `surface: consumer`. This is the "the engine actually USES Raven to drive
 * improvements" piece — a consumer-path failure our direct-API golden eval can't
 * see becomes a ranked ledger finding.
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
const OUT = join(ROOT, "improvements/engine/raven-loop-latest.json");

const URL = process.env.RAVEN_MCP;
const TOKEN = process.env.RAVEN_TOKEN;
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
	const artifact = {
		generatedAt: new Date().toISOString(),
		gateway: URL, // the endpoint, not the token
		frame: { graded, passed: graded - misses.length, failed: misses.length },
		okRate,
		misses,
	};
	writeFileSync(OUT, `${JSON.stringify(artifact, null, "\t")}\n`);
	console.log(
		`\n\nraven-loop: ${graded - misses.length}/${graded} passed through Raven (${okRate * 100}%) · ${misses.length} consumer finding(s)`,
	);
	console.log(`  wrote → improvements/engine/raven-loop-latest.json`);
	console.log(
		"  next: pnpm exec tsx scripts/improvement-ledger.ts   (ingests these as surface:consumer)",
	);
}

main().catch((e) => {
	console.error("raven-loop failed:", e instanceof Error ? e.message : e);
	process.exit(1);
});
