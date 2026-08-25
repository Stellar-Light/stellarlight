/**
 * Guard C — do the golden questions still pass when asked THROUGH RAVEN?
 *
 * We already grade 53 golden questions for answer quality, but every one is
 * asked against stellarlight.xyz directly. Agents do not reach us that way.
 * The gap is not theoretical: scout.searchProjects({type:"Exchange"}) returns
 * 0 rows through Raven while GET /api/projects/search?type=Exchange returns
 * all 14, because Raven validates against a stale copy of our enum. Correct
 * over HTTP, broken for every agent — and invisible to the existing eval.
 *
 * This re-asks the SAME questions with the SAME answerRegex through the live
 * Raven gateway and reports the delta. The interesting cell is
 * "passes direct, fails via Raven": an agent-visible defect our CI cannot see.
 *
 * Grading runs INSIDE the sandbox so only booleans cross the wire — the
 * execute result is token-capped and whole rows would blow it.
 *
 * Report-only unless --gate.
 *
 *   RAVEN_MCP=… RAVEN_TOKEN=… pnpm exec tsx scripts/eval/raven-golden-parity.ts [--gate] [--limit N]
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RAVEN_URL = process.env.RAVEN_MCP ?? "https://agents.stellar.buzz/mcp";
const TOKEN = process.env.RAVEN_TOKEN;
if (!TOKEN) {
	console.error("raven-golden-parity: RAVEN_TOKEN must be in the env.");
	process.exit(1);
}
const GATE = process.argv.includes("--gate");
const LIMIT_ARG = process.argv.indexOf("--limit");
const MAX = LIMIT_ARG > -1 ? Number(process.argv[LIMIT_ARG + 1]) : Infinity;
const BASE = (process.env.BASE_URL || "https://stellarlight.xyz").replace(
	/\/$/,
	"",
);

type Golden = {
	id: string;
	mode: "research" | "projects" | "repos";
	question: string;
	category?: string;
	expect: { answerRegex?: string[]; liveSource?: boolean };
};
const all = (
	JSON.parse(
		readFileSync(join(ROOT, "scripts/eval/golden-questions.json"), "utf8"),
	) as { questions: Golden[] }
).questions;
// liveSource questions are explicitly not answerable from the corpus.
const QS = all
	.filter((q) => !q.expect?.liveSource && (q.expect?.answerRegex?.length ?? 0))
	.slice(0, MAX);

let rpcId = 0;
async function rpc(method: string, params: unknown): Promise<unknown> {
	rpcId++;
	const res = await fetch(RAVEN_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			Authorization: `Bearer ${TOKEN}`,
			"MCP-Protocol-Version": "2025-06-18",
			"User-Agent":
				"Mozilla/5.0 stellar-light-parity/1.0 (+https://stellarlight.xyz)",
		},
		body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params }),
	});
	const raw = await res.text();
	if (!res.ok) throw new Error(`raven ${res.status}: ${raw.slice(0, 160)}`);
	if (raw.trimStart().startsWith("{")) return JSON.parse(raw);
	const msgs = raw
		.split("\n")
		.filter((l) => l.startsWith("data:") && l.slice(5).trim().startsWith("{"))
		.map((l) => JSON.parse(l.slice(5).trim()));
	return msgs[msgs.length - 1];
}
async function tool(name: string, args: unknown): Promise<string> {
	const r = (await rpc("tools/call", { name, arguments: args })) as {
		result?: { content?: Array<{ type: string; text?: string }> };
	};
	return (r.result?.content ?? [])
		.filter((c) => c.type === "text")
		.map((c) => c.text ?? "")
		.join("\n");
}
function leadingJson<T>(text: string): T {
	const i = text.indexOf("{");
	let depth = 0;
	for (let j = i; j < text.length; j++) {
		if (text[j] === "{") depth++;
		else if (text[j] === "}") depth--;
		if (depth === 0) return JSON.parse(text.slice(i, j + 1)) as T;
	}
	throw new Error("unbalanced JSON in execute result");
}

const OP: Record<Golden["mode"], string> = {
	research: "searchResearch",
	projects: "searchProjects",
	repos: "searchRepos",
};

/** Grade in-sandbox: send regexes, get back booleans. */
function batchCode(batch: Golden[]): string {
	const spec = batch.map((q) => ({
		id: q.id,
		op: OP[q.mode],
		q: q.question,
		rx: q.expect.answerRegex ?? [],
	}));
	return `
const spec = ${JSON.stringify(spec)};
const out = {};
for (const s of spec) {
  try {
    const r = await scout[s.op]({ q: s.q, limit: 8 });
    if (!r.ok) { out[s.id] = { err: String(r.error?.kind ?? "err"), rows: 0, pass: false }; continue; }
    const d = r.data ?? {};
    const arr = d.projects ?? d.repos ?? d.results ?? d.research ?? [];
    const hay = JSON.stringify(arr).toLowerCase();
    // EVERY answerRegex must surface, same rule as the direct harness.
    const pass = s.rx.every(p => new RegExp(p, "i").test(hay));
    out[s.id] = { rows: arr.length, pass };
  } catch (e) { out[s.id] = { err: String(e).slice(0,60), rows: 0, pass: false }; }
}
return out;`;
}

/** Same grading, straight at our HTTP API — the control. */
async function direct(q: Golden): Promise<{ rows: number; pass: boolean }> {
	const path =
		q.mode === "research"
			? `/api/research?q=${encodeURIComponent(q.question)}&limit=8`
			: q.mode === "projects"
				? `/api/projects/search?q=${encodeURIComponent(q.question)}&limit=8`
				: `/api/repos/search?q=${encodeURIComponent(q.question)}&limit=8`;
	try {
		const r = await fetch(`${BASE}${path}`, {
			signal: AbortSignal.timeout(30_000),
		});
		const j = (await r.json()) as Record<string, unknown>;
		const arr = (j.projects ??
			j.repos ??
			j.results ??
			j.research ??
			[]) as unknown[];
		const hay = JSON.stringify(arr).toLowerCase();
		return {
			rows: arr.length,
			pass: (q.expect.answerRegex ?? []).every((p) =>
				new RegExp(p, "i").test(hay),
			),
		};
	} catch {
		return { rows: 0, pass: false };
	}
}

type Cell = { rows: number; pass: boolean; err?: string };
const viaRaven: Record<string, Cell> = {};
const BATCH = 6;
let batchErrors = 0;
for (let i = 0; i < QS.length; i += BATCH) {
	const batch = QS.slice(i, i + BATCH);
	try {
		Object.assign(
			viaRaven,
			leadingJson<Record<string, Cell>>(
				await tool("execute", { code: batchCode(batch) }),
			),
		);
	} catch (e) {
		batchErrors++;
		console.error(`  batch ${i / BATCH} failed: ${(e as Error).message}`);
	}
}

const rows = await Promise.all(
	QS.map(async (q) => ({ q, d: await direct(q), r: viaRaven[q.id] })),
);

console.log("\nGolden questions: direct HTTP vs through Raven");
console.log("=".repeat(78));
const regressions: typeof rows = [];
let bothPass = 0;
let bothFail = 0;
let ravenOnly = 0;
let unmeasured = 0;
for (const row of rows) {
	if (!row.r) {
		unmeasured++;
		continue;
	}
	if (row.d.pass && row.r.pass) bothPass++;
	else if (!row.d.pass && !row.r.pass) bothFail++;
	else if (row.d.pass && !row.r.pass) regressions.push(row);
	else ravenOnly++;
}
if (regressions.length) {
	console.log(
		"\n  PASSES DIRECT, FAILS THROUGH RAVEN — agent-visible defects:",
	);
	for (const { q, d, r } of regressions)
		console.log(
			`   - ${q.id} (${q.mode})\n       "${q.question.slice(0, 70)}"\n       direct rows=${d.rows} pass=true · raven rows=${r?.rows} pass=false${r?.err ? ` err=${r.err}` : ""}`,
		);
}
// Both-fail is not parity noise — it is a real gap in what we hold, and the
// only place this eval surfaces missing DATA rather than a broken path.
const bothFailRows = rows.filter((x) => x.r && !x.d.pass && !x.r.pass);
if (bothFailRows.length) {
	console.log("\n  FAILS BOTH — the content is missing, not the plumbing:");
	for (const { q, d, r } of bothFailRows)
		console.log(
			`   - ${q.id} (${q.mode}, ${q.category ?? "?"})\n       "${q.question.slice(0, 74)}"\n       wanted: ${JSON.stringify(q.expect.answerRegex)}\n       direct rows=${d.rows} · raven rows=${r?.rows}`,
		);
}
console.log(`\n${"=".repeat(78)}`);
console.log(
	`  ${bothPass} pass both · ${regressions.length} RAVEN-ONLY FAILURES · ${bothFail} fail both (data gaps) · ${ravenOnly} pass only via Raven · ${unmeasured} unmeasured`,
);
if (batchErrors)
	console.error(
		`  ${batchErrors} batch(es) failed to run — those questions prove nothing.`,
	);
if (batchErrors) process.exit(1);
if (GATE && regressions.length) {
	console.error("\nGATE: questions that work over HTTP fail for agents.");
	process.exit(1);
}
