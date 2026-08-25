/**
 * Guard B — honest absence, measured THROUGH RAVEN.
 *
 * "`[]` is a claim, null is an admission." A list endpoint has three honest
 * outcomes and they must be distinguishable by a machine:
 *
 *   1. exact hits            — rows, matchMode exact/strict
 *   2. nothing matched       — no rows, and a basis saying we DID look
 *   3. degraded/near matches — rows, and a marker saying they are NOT hits
 *
 * The failure this catches is (3) served as (1): a query that matches nothing
 * comes back with plausible near-matches and no marker, so an agent reports
 * them as answers. That is confabulation with our name on it, and it is worse
 * than an empty array.
 *
 * Measured through the real Raven gateway because that is the path an agent
 * takes and therefore our benchmark.
 *
 * Report-only unless --gate.
 *
 *   RAVEN_MCP=… RAVEN_TOKEN=… pnpm exec tsx scripts/eval/raven-honest-absence.ts [--gate]
 */

const RAVEN_URL = process.env.RAVEN_MCP ?? "https://agents.stellar.buzz/mcp";
const TOKEN = process.env.RAVEN_TOKEN;
if (!TOKEN) {
	console.error(
		"raven-honest-absence: RAVEN_TOKEN must be in the env (an OAuth bearer issued by the Raven owner).",
	);
	process.exit(1);
}
const GATE = process.argv.includes("--gate");

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
				"Mozilla/5.0 stellar-light-absence/1.0 (+https://stellarlight.xyz)",
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
 * Gibberish with real-ish shape: long enough to defeat a length guard, but no
 * token any Stellar record could legitimately contain. Anything returned for
 * these is by construction a near-match, never a hit.
 */
const NONSENSE = [
	"zzqqxx nonexistent protocol 9999",
	"flurbomatic quantifold widgetron on Stellar",
];

type Probe = {
	surface: string;
	/** in-sandbox expression returning { rows, mode, label } */
	expr: (q: string) => string;
};

const jsq = (s: string) => JSON.stringify(s);

const PROBES: Probe[] = [
	{
		surface: "searchProjects",
		expr: (
			q,
		) => `(async () => { const r = await scout.searchProjects({ q: ${jsq(q)}, limit: 5 });
      const m = r.data?.meta ?? {};
      return { rows: (r.data?.projects ?? []).length, mode: m.matchMode ?? null, label: m.matchModeLabel ?? null }; })()`,
	},
	{
		surface: "searchRepos",
		expr: (
			q,
		) => `(async () => { const r = await scout.searchRepos({ q: ${jsq(q)}, limit: 5 });
      const m = r.data?.meta ?? {};
      return { rows: (r.data?.repos ?? []).length, mode: m.matchMode ?? m.mode ?? null, label: m.matchModeLabel ?? null }; })()`,
	},
	{
		surface: "searchResearch",
		expr: (
			q,
		) => `(async () => { const r = await scout.searchResearch({ q: ${jsq(q)}, limit: 5 });
      const m = r.data?.meta ?? {};
      return { rows: (r.data?.results ?? r.data?.research ?? []).length, mode: m.matchMode ?? m.mode ?? null, label: m.matchModeLabel ?? null }; })()`,
	},
	{
		surface: "getPartners",
		expr: (
			q,
		) => `(async () => { const r = await scout.getPartners({ q: ${jsq(q)}, limit: 5 });
      const m = r.data?.meta ?? {};
      return { rows: (r.data?.partners ?? r.data?.providers ?? []).length, mode: m.matchMode ?? m.mode ?? null, label: m.matchModeLabel ?? m.scope ?? null }; })()`,
	},
];

/** A mode that tells the caller these are NOT exact hits. */
const DEGRADED = /semantic|vector|fuzzy|loose|similar|adjacent|candidate/i;

type Out = { rows: number; mode: string | null; label: string | null };

const findings: string[] = [];
let errors = 0;
console.log("\nHonest absence, through Raven");
console.log("=".repeat(74));

for (const q of NONSENSE) {
	console.log(`\n  query: "${q}"`);
	// One execute per query: all four surfaces, counts + markers only.
	const code = `return { ${PROBES.map((p) => `${p.surface}: await ${p.expr(q)}`).join(", ")} };`;
	let res: Record<string, Out>;
	try {
		res = leadingJson<Record<string, Out>>(await tool("execute", { code }));
	} catch (e) {
		errors++;
		console.log(`    ERROR ${(e as Error).message}`);
		continue;
	}
	for (const p of PROBES) {
		const o = res[p.surface];
		if (!o) {
			console.log(`    ${p.surface.padEnd(16)} (no result)`);
			continue;
		}
		const marked = !!(o.mode && DEGRADED.test(o.mode)) || !!o.label;
		// The defect: rows returned for gibberish with nothing saying they are
		// near-matches. An empty result is always honest here.
		const bad = o.rows > 0 && !marked;
		if (bad)
			findings.push(
				`${p.surface}: returned ${o.rows} row(s) for nonsense with mode=${o.mode ?? "null"} and no label`,
			);
		console.log(
			`    ${bad ? "UNMARKED" : "ok      "} ${p.surface.padEnd(16)} rows=${String(o.rows).padEnd(3)} mode=${String(o.mode ?? "null").padEnd(10)} ${o.label ? `label="${String(o.label).slice(0, 52)}…"` : "label=none"}`,
		);
	}
}

// --- exact identifiers: the MIRROR defect -----------------------------------
// Guard B above catches "claimed presence for something absent". sls-074 was
// the opposite and is worse: Scout told a caller `V-SOR-APP-VUL-003` was an
// exact miss and to NOT report it as found, while the identifier is real (
// Veridise V2.1, Appendix A.2.2). A confident false negative on a real audit
// item is the most damaging thing this service can say.
//
// Both directions are asserted, because fixing one by breaking the other is
// the obvious wrong fix: a present identifier must NOT be an exactMiss, and an
// absent one MUST still be one.
const IDENTIFIER_CONTROLS: { id: string; present: boolean; why: string }[] = [
	{
		id: "V-SOR-APP-VUL-003",
		present: true,
		why: "Veridise V2.1 Appendix A.2.2 (Denial of Service During Authorization) — the sls-074 regression control",
	},
	{
		id: "V-HOTB-APP-VUL-001",
		present: true,
		why: "Hot Bridge appendix — proves the appendix fix is general, not one report",
	},
	{
		id: "V-SOR-APP-VUL-999",
		present: false,
		why: "not a real identifier — honest absence must survive the fix",
	},
];

console.log("\n\nExact audit identifiers, through Raven");
console.log("=".repeat(74));
for (const c of IDENTIFIER_CONTROLS) {
	const code = `(async () => { const r = await scout.searchResearch({ q: ${jsq(c.id)}, limit: 3 });
    const rows = r.data?.results ?? r.data?.research ?? [];
    return {
      exactMiss: !!(r.data?.meta?.exactMiss),
      carries: rows.some((x) => String(x.content ?? "").includes(${jsq(c.id)})),
    }; })()`;
	let o: { exactMiss: boolean; carries: boolean };
	try {
		o = leadingJson<{ exactMiss: boolean; carries: boolean }>(
			await tool("execute", { code: `return await ${code};` }),
		);
	} catch (e) {
		errors++;
		console.log(`    ERROR ${c.id}: ${(e as Error).message}`);
		continue;
	}
	// Present: must not be an exactMiss AND a chunk must actually carry it —
	// "no exactMiss" alone would pass on semantic neighbours, which is how the
	// original defect hid.
	const bad = c.present ? o.exactMiss || !o.carries : !o.exactMiss;
	if (bad)
		findings.push(
			c.present
				? `${c.id} is REAL (${c.why}) but Scout ${o.exactMiss ? "reports an exact miss" : "returns no chunk carrying it verbatim"} — a confident false negative`
				: `${c.id} does not exist, yet Scout did NOT report an exact miss — honest absence regressed`,
		);
	console.log(
		`    ${bad ? "BAD     " : "ok      "} ${c.id.padEnd(20)} exactMiss=${String(o.exactMiss).padEnd(5)} carriesVerbatim=${String(o.carries).padEnd(5)} (${c.present ? "must resolve" : "must stay a miss"})`,
	);
}

console.log(`\n${"=".repeat(74)}`);
if (findings.length) {
	console.log("  Surfaces that answered gibberish without admitting it:");
	for (const f of findings) console.log(`   - ${f}`);
	console.log(
		"\n  A near-match served without a marker is reported by an agent as a hit.\n  Fix: set matchMode (or mode) to a degraded value AND a matchModeLabel,\n  the way searchProjects already does.",
	);
} else {
	console.log(
		"  Every surface either found nothing or admitted the degradation.",
	);
}
if (errors) process.exit(1); // an unrun probe is a failure, gate or not
if (GATE && findings.length) {
	console.error("\nGATE: unmarked near-matches — failing.");
	process.exit(1);
}
