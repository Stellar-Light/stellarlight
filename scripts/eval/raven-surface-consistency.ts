/**
 * Guard A — cross-surface consistency, measured THROUGH RAVEN.
 *
 * sls-073: `vet-idea` answered "no competitors" for an idea the directory
 * answered with four projects. Nothing caught it — we have ~30 guards and
 * every one asks "is this field present and well-formed?", never "do two of
 * our answers to the SAME question agree?". An SDF reviewer found it instead.
 *
 * This asks pairs of surfaces the same question through the real Raven
 * gateway — the path an agent actually takes — and fails when one surface
 * returns rows and its partner returns none. A disagreement is a bug in one
 * of them by definition; which one is for a human to judge, so the output
 * names both sides.
 *
 * Report-only unless --gate.
 *
 *   RAVEN_MCP=… RAVEN_TOKEN=… pnpm exec tsx scripts/eval/raven-surface-consistency.ts [--gate]
 */

const RAVEN_URL = process.env.RAVEN_MCP ?? "https://agents.stellar.buzz/mcp";
const TOKEN = process.env.RAVEN_TOKEN;
if (!TOKEN) {
	console.error(
		"raven-surface-consistency: RAVEN_TOKEN must be in the env (an OAuth bearer issued by the Raven owner).",
	);
	process.exit(1);
}
const GATE = process.argv.includes("--gate");
// Our own API, asked directly when Raven's client rejects a probe — a value
// we serve that their pinned catalog predates is lag on their side, not a
// surface disagreement (2026-09-01: catalog pinned at 1.9.1, `type=Yield`
// shipped in 1.9.13 → every wave "rejected" Yield while the API served 8 rows).
const BASE = process.env.STELLARLIGHT_BASE ?? "https://stellarlight.xyz";
const UA =
	"Mozilla/5.0 stellar-light-consistency/1.0 (+https://stellarlight.xyz)";
async function servedDirectly(type: string): Promise<boolean> {
	try {
		const res = await fetch(
			`${BASE}/api/projects/search?type=${encodeURIComponent(type)}&limit=1`,
			{ headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) },
		);
		if (!res.ok) return false;
		const j = (await res.json()) as { projects?: unknown[] };
		return (j.projects ?? []).length > 0;
	} catch {
		return false;
	}
}

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
			// Cloudflare bans the default node/python UA on this host.
			"User-Agent":
				"Mozilla/5.0 stellar-light-consistency/1.0 (+https://stellarlight.xyz)",
		},
		body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params }),
	});
	const raw = await res.text();
	if (!res.ok) throw new Error(`raven ${res.status}: ${raw.slice(0, 200)}`);
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
/** Raven appends coaching text after the JSON; take the leading object. */
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

/**
 * Each case runs ONE script in Raven's sandbox that calls both surfaces with
 * the same query, and returns just the counts plus a small identity sample —
 * the execute result is token-capped, so we never return whole rows.
 */
type Case = {
	key: string;
	q: string;
	/** what the two surfaces are, for the failure message */
	a: string;
	b: string;
	code: (q: string) => string;
};

const jsq = (s: string) => JSON.stringify(s);

const CASES: Case[] = [
	{
		key: "vetidea-vs-directory",
		q: "perpetuals / derivatives trading protocol on Stellar",
		a: "vetIdea.competitors.projects",
		b: "searchProjects",
		// sls-073 itself. If the directory holds rows for an idea, vet-idea
		// must not tell a builder the field is empty.
		code: (q) => `
const q = ${jsq(q)};
const v = await scout.vetIdea({ q });
const d = await scout.searchProjects({ q, limit: 10 });
const a = v.ok ? (v.data.report?.competitors?.projects ?? []) : [];
const b = d.ok ? (d.data.projects ?? []) : [];
return { aCount: a.length, bCount: b.length,
  aSample: a.slice(0,4).map(x => x.slug ?? x.name),
  bSample: b.slice(0,4).map(x => x.slug ?? x.name) };`,
	},
	{
		key: "vetidea-vs-directory-wallet",
		q: "a non-custodial wallet for Stellar",
		a: "vetIdea.competitors.projects",
		b: "searchProjects",
		// Control: a query whose vertical DOES map. If this ever disagrees the
		// mapped path has broken too, not just the fallback.
		code: (q) => `
const q = ${jsq(q)};
const v = await scout.vetIdea({ q });
const d = await scout.searchProjects({ q, limit: 10 });
const a = v.ok ? (v.data.report?.competitors?.projects ?? []) : [];
const b = d.ok ? (d.data.projects ?? []) : [];
return { aCount: a.length, bCount: b.length,
  aSample: a.slice(0,4).map(x => x.slug ?? x.name),
  bSample: b.slice(0,4).map(x => x.slug ?? x.name) };`,
	},
	{
		key: "type-enum-vs-search",
		q: "Exchange",
		a: "searchProjects?type=Exchange",
		b: "searchProjects?q=exchange",
		// A type that exists in the enum must return rows for its own name.
		// Catches an enum value shipped with no members (the Card Issuing /
		// Exchange class of change).
		code: () => `
const t = await scout.searchProjects({ type: "Exchange", limit: 10 });
const s = await scout.searchProjects({ q: "centralized exchange", limit: 10 });
const a = t.ok ? (t.data.projects ?? []) : [];
const b = s.ok ? (s.data.projects ?? []) : [];
return { aCount: a.length, bCount: b.length,
  aSample: a.slice(0,4).map(x => x.slug),
  bSample: b.slice(0,4).map(x => x.slug) };`,
	},
	{
		key: "gaps-axis-vs-type-counts",
		q: "(every vertical on the gaps axis)",
		a: "analyze?dimension=gaps byType",
		b: "searchProjects?type=<same>",
		// The gaps axis claims a supply count per vertical. If a vertical it
		// reports cannot be filtered for, or returns nothing, the axis is
		// describing a category the directory cannot actually serve — which is
		// how "no Perpetuals vertical exists" stayed invisible while four perps
		// projects sat in the directory.
		code: () => `
const g = await scout.analyzeEcosystem({ dimension: "gaps" });
const byType = g.ok ? ((g.data.gaps ?? g.data).byType ?? []) : [];
const names = byType.map(x => x.type).filter(Boolean).slice(0, 8);
const empties = [];
for (const t of names) {
  const r = await scout.searchProjects({ type: t, limit: 1 });
  const n = r.ok ? (r.data.projects ?? []).length : -1;
  if (n <= 0) empties.push(t + (n < 0 ? " (rejected)" : " (0 rows)"));
}
return { aCount: names.length, bCount: names.length - empties.length,
  aSample: names.slice(0,4), bSample: empties.slice(0,4), bEmpties: empties };`,
	},
	{
		key: "typed-rows-are-reachable",
		q: "(a type that rows actually carry)",
		a: "a type present on real rows",
		b: "searchProjects?type=<that type>",
		// A type value that rows carry but the filter will not accept is an
		// enum shipped half-way. This is the shape of the live Exchange defect:
		// rows carry it, the filter rejects it, agents get silent zeros.
		code: () => `
const d = await scout.searchProjects({ q: "exchange wallet lending", limit: 25 });
const rows = d.ok ? (d.data.projects ?? []) : [];
const types = [...new Set(rows.flatMap(p => p.types ?? []))].slice(0, 6);
const unreachable = [];
for (const t of types) {
  const r = await scout.searchProjects({ type: t, limit: 1 });
  if (!r.ok || (r.data.projects ?? []).length === 0)
    unreachable.push(t + (r.ok ? " (0 rows)" : " (rejected)"));
}
return { aCount: types.length, bCount: types.length - unreachable.length,
  aSample: types.slice(0,4), bSample: unreachable.slice(0,4), bEmpties: unreachable };`,
	},
	{
		key: "partners-vs-directory-audit",
		q: "smart contract audit firms for Soroban",
		a: "getPartners",
		b: "searchProjects",
		// Two discovery lanes for the same intent. Both empty is fine; one
		// empty while the other has rows means a lane is blind.
		code: (q) => `
const q = ${jsq(q)};
const p = await scout.getPartners({ q, limit: 10 });
const d = await scout.searchProjects({ q, limit: 10 });
const a = p.ok ? (p.data.partners ?? p.data.providers ?? []) : [];
const b = d.ok ? (d.data.projects ?? []) : [];
return { aCount: a.length, bCount: b.length,
  aSample: a.slice(0,4).map(x => x.slug ?? x.name),
  bSample: b.slice(0,4).map(x => x.slug ?? x.name) };`,
	},
];

type Counts = {
	aCount: number;
	bCount: number;
	aSample: string[];
	bSample: string[];
	/** countPair cases: every unreachable member, suffixed (rejected) / (0 rows). */
	bEmpties?: string[];
};

const rows: Array<{ c: Case; r: Counts | null; err?: string }> = [];
for (const c of CASES) {
	try {
		const txt = await tool("execute", { code: c.code(c.q) });
		rows.push({ c, r: leadingJson<Counts>(txt) });
	} catch (e) {
		rows.push({ c, r: null, err: (e as Error).message });
	}
}

console.log("\nCross-surface consistency, through Raven");
console.log("=".repeat(72));
let disagreements = 0;
let errors = 0;
for (const { c, r, err } of rows) {
	if (!r) {
		errors++;
		console.log(`\n  ERROR  ${c.key}\n         ${err}`);
		continue;
	}
	// The failure we care about: one side answers, the other says nothing.
	// Both-zero is agreement (an honest "we hold nothing" on both lanes).
	// Three failure shapes, because one test cannot see all of them:
	//  - countPair: an advertised member is unreachable (enum coverage).
	//  - overlapPair: both sides answer but name DIFFERENT things. This shape
	//    got past the first version of this guard — vet-idea returned 8 rows
	//    and the directory 10, so zero-vs-nonzero was satisfied while NONE of
	//    the actual perps venues appeared in the answer.
	//  - default: one side answers, the other says nothing.
	const countPair =
		c.key === "gaps-axis-vs-type-counts" ||
		c.key === "typed-rows-are-reachable";
	const overlapPair = c.a.startsWith("vetIdea");
	const overlap = r.aSample.filter((x) => r.bSample.includes(x)).length;
	// A member Raven's client REJECTED but our API serves is catalog lag on
	// their side (their pinned spec predates the enum value). Report it,
	// don't gate on it — the gate is for answers that disagree, not catalogs
	// that have not re-baselined yet.
	const lagged: string[] = [];
	if (countPair) {
		for (const s of r.bEmpties ?? r.bSample) {
			if (!/ \(rejected\)$/.test(s)) continue;
			const t = s.replace(/ \(rejected\)$/, "");
			if (await servedDirectly(t)) lagged.push(t);
		}
	}
	const disagree = countPair
		? r.aCount !== r.bCount + lagged.length
		: overlapPair
			? r.aCount > 0 && r.bCount > 0 && overlap === 0
			: (r.aCount === 0) !== (r.bCount === 0);
	if (disagree) disagreements++;
	console.log(`\n  ${disagree ? "DISAGREE" : "ok      "} ${c.key}   "${c.q}"`);
	console.log(`         ${c.a}: ${r.aCount}  ${JSON.stringify(r.aSample)}`);
	console.log(`         ${c.b}: ${r.bCount}  ${JSON.stringify(r.bSample)}`);
	if (lagged.length)
		console.log(
			`         catalog-lag: ${JSON.stringify(lagged)} — rejected by Raven's pinned catalog, served by ${BASE} directly; not counted as a disagreement`,
		);
	if (disagree)
		console.log(
			overlapPair && r.aCount > 0 && r.bCount > 0
				? `         ^ both surfaces answered but share NO rows — an agent gets a different set of competitors depending on which op Raven routes to.`
				: `         ^ one surface answered and the other returned none — an agent asking this gets a different answer depending on which op Raven routes to.`,
		);
}
console.log(`\n${"=".repeat(72)}`);
console.log(
	`  ${rows.length - errors - disagreements} consistent · ${disagreements} disagreeing · ${errors} errored`,
);
if (GATE && disagreements > 0) {
	console.error("\nGATE: surfaces disagree — failing.");
	process.exit(1);
}

// Global-scope collision guard: with no import/export, tsc puts this file
// in the shared global scope where every script's main/BASE/PROBES collide —
// and WHICH file draws the error depends on enumeration order, which differs
// macOS vs linux (the baseline divergence of 2026-09-01). export{} makes it a
// module; tsx runtime behavior is unchanged.
export {};
