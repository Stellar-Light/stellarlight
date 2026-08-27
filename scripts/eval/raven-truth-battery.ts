/**
 * Raven truth battery — daily, rotating, graded against curated truth.
 *
 * Born from the 2026-08-27 hand-run battery (44 probes, 29 ops) that found
 * the split-identity hole and the liveness-float regression. This is that
 * battery productionized, with the two things a hand-run lacks:
 *
 *  1. ROTATION — the same questions every day go stale; probes rotate by
 *     day-of-year across banks, so a week of runs covers the whole bank.
 *  2. A SELF-UPDATING ANSWER KEY — hand-written expectations rot. Slices D-F
 *     derive their expectations from our own curated truth: prominence>=80
 *     rows must be findable by their own name, human-verified statuses must
 *     serve exactly what a human verified, and project links/descriptions
 *     must meet the data bar. Curation IS the answer key, so new curated
 *     rows are guarded automatically.
 *
 * Guard-B lesson applies: every probe error is counted and the run exits
 * non-zero on errors — a quiet detector and a clean run must never look the
 * same. Raven is the path agents take; query slices go through the gateway
 * (RAVEN_TOKEN), row-QA slices hit HTTP directly.
 */

import { ABSENT_BANKS, CATEGORY_BANKS, KNOWN_BANKS } from "./battery-banks";

const BASE = (process.env.BASE_URL || "https://stellarlight.xyz").replace(
	/\/$/,
	"",
);
const RAVEN = process.env.RAVEN_URL || "https://agents.stellar.buzz/mcp";
const TOKEN = process.env.RAVEN_TOKEN || "";
const GATE = process.argv.includes("--gate");
const ALL = process.argv.includes("--all"); // ignore rotation, run every bank

// deterministic rotation — no Date.now() in the selection itself would break
// nothing here (this is a CLI, not a workflow script), but keep it stable per
// calendar day so a red can be reproduced locally all day.
const dayOfYear = Math.floor(
	(Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000,
);

let pass = 0;
let fail = 0;
let errors = 0;
const failures: string[] = [];

function verdict(ok: boolean, name: string, detail: string) {
	if (ok) pass++;
	else {
		fail++;
		failures.push(`${name}: ${detail}`);
	}
	console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}  ${detail}`);
}

async function http(path: string): Promise<any> {
	const r = await fetch(`${BASE}${path}`, {
		headers: { "User-Agent": "raven-truth-battery" },
	});
	if (!r.ok) throw new Error(`${r.status} ${path}`);
	return r.json();
}

let rpcId = 0;
async function raven(code: string): Promise<any> {
	rpcId++;
	const res = await fetch(RAVEN, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			authorization: `Bearer ${TOKEN}`,
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: rpcId,
			method: "tools/call",
			params: { name: "execute", arguments: { code } },
		}),
	});
	const text = await res.text();
	// SSE or plain; find the result payload's first text content
	const line = text
		.split("\n")
		.filter((l) => l.startsWith("data:"))
		.map((l) => l.slice(5).trim())
		.find((l) => l.startsWith("{"));
	const body = JSON.parse(line ?? text);
	const content =
		body?.result?.content?.find((c: any) => c.type === "text")?.text ?? "";
	// Raven appends coaching after the JSON — parse the leading object only.
	const start = content.indexOf("{");
	if (start < 0) throw new Error("no JSON in raven reply");
	let depth = 0;
	for (let i = start; i < content.length; i++) {
		if (content[i] === "{") depth++;
		else if (content[i] === "}" && --depth === 0)
			return JSON.parse(content.slice(start, i + 1));
	}
	throw new Error("unterminated JSON in raven reply");
}

// ── Slice A: known-item recall through phrasings (rotates) ─────────────────
// Each bank pairs real projects with a NATURAL phrasing family. The named
// project must lead. Banks deliberately span verticals the last battery
// didn't touch.
const PHRASINGS = [
	(n: string) => `is ${n} live`,
	(n: string) => `tell me about ${n}`,
	(n: string) => `what is ${n}`,
	(n: string) => `${n} on stellar`,
];

async function sliceA() {
	console.log("\n── A: known-item recall (rotating phrasings) ──");
	const bank = KNOWN_BANKS[dayOfYear % KNOWN_BANKS.length];
	const banks = ALL ? KNOWN_BANKS.flat() : bank;
	const phrase = PHRASINGS[dayOfYear % PHRASINGS.length];
	const cases = banks
		.map(([name, slug], i) => ({
			q: (ALL ? PHRASINGS[i % PHRASINGS.length] : phrase)(name),
			slug,
		}))
		.map(
			(c) => `{ q: ${JSON.stringify(c.q)}, slug: ${JSON.stringify(c.slug)} }`,
		)
		.join(",");
	const out = await raven(`
		const cases = [${cases}];
		const out = [];
		for (const c of cases) {
			const r = await scout.searchProjects({ q: c.q, limit: 5 });
			const rows = r.data?.projects ?? [];
			out.push({ q: c.q, want: c.slug, top: rows[0]?.slug ?? null,
				status: rows.find((p) => p.slug === c.slug)?.status ?? null,
				mode: r.data?.meta?.matchMode ?? null });
		}
		return { out };
	`);
	for (const r of out.out ?? []) {
		verdict(
			r.top === r.want,
			`A:${r.want}`,
			`"${r.q}" -> top=${r.top} mode=${r.mode}${r.status ? ` status=${r.status}` : ""}`,
		);
	}
}

// ── Slice B: absent-entity honesty (rotates, includes camelCase traps) ─────
// sls-076 regression control (their filed requirement): q=Strupey must NEVER
// come back as a keyword tier — the row it finds (Stroopy.AI) matches only
// through our curated spelling correction, and two agent runs treated the old
// strict label as identity evidence for an unverified name. "corrected" (the
// honest mode) and "semantic" both pass; any keyword tier is the regression.
async function sliceB2() {
	console.log("\n── B2: spelling-corrected honesty (sls-076) ──");
	const out = await raven(`
		const r = await scout.searchProjects({ q: "Strupey", limit: 3 });
		return { mode: r.data?.meta?.matchMode ?? null,
			label: r.data?.meta?.matchModeLabel ?? null,
			slugs: (r.data?.projects ?? []).map((p) => p.slug) };
	`);
	verdict(
		out.mode === "corrected" || out.mode === "semantic",
		"B2:corrected",
		`q=Strupey -> mode=${out.mode} slugs=${JSON.stringify(out.slugs)}`,
	);
}

async function sliceB() {
	console.log("\n── B: absent-entity honesty ──");
	const qs = ALL
		? ABSENT_BANKS.flat()
		: ABSENT_BANKS[dayOfYear % ABSENT_BANKS.length];
	const out = await raven(`
		const qs = ${JSON.stringify(qs)};
		const out = [];
		for (const q of qs) {
			const r = await scout.searchProjects({ q, limit: 4 });
			out.push({ q, mode: r.data?.meta?.matchMode ?? null,
				rows: (r.data?.projects ?? []).length });
		}
		return { out };
	`);
	for (const r of out.out ?? []) {
		// honest = semantic (guards fire) or an empty keyword result. A keyword
		// tier WITH rows is a confident answer about something we do not hold.
		verdict(
			r.mode === "semantic" || r.rows === 0,
			"B:absent",
			`"${r.q}" -> mode=${r.mode} rows=${r.rows}`,
		);
	}
}

// ── Slice C: category truth (rotates verticals; expected members curated) ──
async function sliceC() {
	console.log("\n── C: category truth ──");
	const picks = ALL
		? CATEGORY_BANKS
		: [
				CATEGORY_BANKS[dayOfYear % CATEGORY_BANKS.length],
				CATEGORY_BANKS[(dayOfYear + 3) % CATEGORY_BANKS.length],
			];
	for (const c of picks) {
		const op = c.op ?? "searchProjects";
		const key = c.key ?? "projects";
		const out = await raven(`
			const r = await scout.${op}({ q: ${JSON.stringify(c.q)}, limit: 8 });
			return { slugs: (r.data?.${key} ?? []).map((p) => p.slug) };
		`);
		const hit = (out.slugs ?? []).filter((s: string) => c.anyOf.includes(s));
		verdict(
			hit.length >= (c.min ?? 2),
			"C:category",
			`"${c.q}" -> ${hit.length}/${c.anyOf.length} expected members in top-8 (${(out.slugs ?? []).slice(0, 4).join(",")})`,
		);
	}
}

// ── Slice D: curated truth as the answer key — prominence rows ─────────────
// Every prominence>=80 row is a canonical pick a human made. Each must be
// findable by ITS OWN NAME. No hand-written list: curation drives coverage.
async function sliceD() {
	console.log(
		"\n── D: prominence rows findable by name (curation = answer key) ──",
	);
	const d = await http("/api/projects/search?q=stellar&limit=200");
	const prominent = (d.projects ?? [])
		.filter((p: any) => Number(p.prominence ?? 0) >= 80)
		.slice(0, 24);
	if (prominent.length < 3) {
		// the sample query may not surface enough prominent rows — that is a
		// sampling limitation, not proof of absence; note and move on.
		console.log(
			`  note: only ${prominent.length} prominent rows in sample; skipping`,
		);
		return;
	}
	const picks = ALL
		? prominent
		: prominent.filter((_: any, i: number) => i % 3 === dayOfYear % 3);
	for (const p of picks) {
		const r = await http(
			`/api/projects/search?q=${encodeURIComponent(p.name)}&limit=3`,
		);
		const top = (r.projects ?? [])[0]?.slug;
		verdict(
			top === p.slug,
			"D:prominent",
			`"${p.name}" -> ${top} (want ${p.slug})`,
		);
	}
}

// ── Slice E: human-verified statuses serve exactly what a human verified ───
async function sliceE() {
	// Caveat: search responses are cached per query key (SWR). Right after a
	// curation lands, one path can briefly serve the pre-curation snapshot —
	// a red here that self-heals next run is cache staleness, not data loss.
	// A red that PERSISTS is a real serving defect — gate-io's persistent red
	// turned out to be the slug missing from the search haystack entirely, not
	// a cache or a revert. Chase it to root, never wave it off.
	console.log("\n── E: human-verified statuses hold ──");
	const d = await http("/api/projects/search?q=stellar&limit=200");
	const hv = (d.projects ?? []).filter(
		(p: any) => p.statusBasis === "human-verified",
	);
	const picks = ALL
		? hv
		: hv.filter((_: any, i: number) => i % 2 === dayOfYear % 2);
	for (const p of picks.slice(0, 12)) {
		const r = await http(
			`/api/projects/search?q=${encodeURIComponent(p.slug)}&limit=1`,
		);
		const row = (r.projects ?? [])[0];
		verdict(
			row?.slug === p.slug &&
				row?.status === p.status &&
				row?.statusBasis === "human-verified",
			"E:hv-status",
			`${p.slug} status=${row?.status} basis=${row?.statusBasis}`,
		);
	}
	if (!picks.length) console.log("  note: no human-verified rows in sample");
}

// ── Slice F: project data quality — links, descriptions, provenance ────────
async function sliceF() {
	console.log("\n── F: row data quality (top + random sample) ──");
	const d = await http("/api/projects/search?q=stellar&limit=200");
	const rows = d.projects ?? [];
	const top = rows.slice(0, 10);
	const rand = rows
		.filter((_: any, i: number) => i % 17 === dayOfYear % 17)
		.slice(0, 8);
	for (const p of [...top, ...rand]) {
		const problems: string[] = [];
		const desc = p.shortDescription || p.description || "";
		if (!desc || desc.length < 25) problems.push("thin description");
		if (!Array.isArray(p.types) || p.types.length === 0)
			problems.push("no types");
		if (
			p.status === "Live" &&
			!p.statusSourceUrl &&
			p.statusBasis !== "human-verified"
		)
			problems.push("Live without source");
		const site = p.links?.website;
		if (site) {
			try {
				const h = await fetch(site, {
					method: "HEAD",
					redirect: "follow",
					signal: AbortSignal.timeout(10000),
				});
				// 403/405/429 on a bare HEAD is bot-blocking (gate-io's Cloudflare),
				// not a dead site — only genuine not-there codes count.
				if (h.status >= 400 && ![403, 405, 429].includes(h.status))
					problems.push(`website ${h.status}`);
			} catch {
				problems.push("website unreachable");
			}
		}
		verdict(
			problems.length === 0,
			"F:row",
			`${p.slug}${problems.length ? ` — ${problems.join("; ")}` : ""}`,
		);
	}
}

const t0 = Date.now();
console.log(
	`Raven truth battery → ${BASE} (day ${dayOfYear}, ${ALL ? "ALL banks" : "rotating"})`,
);
// ── Slice G: enumeration integrity (sls-033's count-instability, closed) ──
// An exact-type enumeration is a SET: membership must not depend on q, limit,
// or offset. Two roots closed 2026-08-28: (1) tier admission + a limit-gated
// bypass made membership depend on page size; (2) Payload `contains` on the
// hasMany types field is CASE-INSENSITIVE SUBSTRING per element — type=DEX
// counted every Indexer ("In-DEX-er"), inflating total to 61 for a 46-row
// set. Wallet is pinned (the original subject); DEX is pinned (the collision
// witness); a third type rotates daily.
async function sliceG() {
	const G_TYPES = ALL
		? ["Wallet", "DEX", "Oracle", "Exchange", "Lending"]
		: [
				"Wallet",
				"DEX",
				["Oracle", "Exchange", "Lending", "Bridge", "Anchor", "RWA"][
					dayOfYear % 6
				],
			];
	console.log(`\n── G: enumeration integrity (${G_TYPES.join(", ")}) ──`);
	const base = "https://stellarlight.xyz/api/projects/search";
	const fetchJson = async (u: string) =>
		(await (
			await fetch(u, { headers: { "User-Agent": "stellarlight-battery" } })
		).json()) as {
			projects?: Array<{ slug?: string; name?: string }>;
			meta?: { counts?: { total?: number } };
		};
	try {
		for (const gType of G_TYPES) {
			const ql = gType.toLowerCase();
			const noQ = await fetchJson(`${base}?type=${gType}&limit=200`);
			const noQSlugs = (noQ.projects ?? []).map((p) => String(p.slug));
			const total = noQ.meta?.counts?.total ?? -1;
			verdict(
				noQSlugs.length === total,
				"G:closed-set",
				`type=${gType} no-q: returned=${noQSlugs.length} total=${total} (must be equal — one page IS the set)`,
			);
			const withQ = await fetchJson(`${base}?type=${gType}&q=${ql}&limit=200`);
			const withQSlugs = new Set(
				(withQ.projects ?? []).map((p) => String(p.slug)),
			);
			const sameSet =
				withQSlugs.size === noQSlugs.length &&
				noQSlugs.every((x) => withQSlugs.has(x));
			verdict(
				sameSet,
				"G:q-ranks-only",
				`${gType}: q membership ${withQSlugs.size} vs typed set ${noQSlugs.length} — q must rank, never gate`,
			);
			const walked: string[] = [];
			for (let off = 0; off < 300; off += 17) {
				const page = await fetchJson(
					`${base}?type=${gType}&q=${ql}&limit=17&offset=${off}`,
				);
				const slugs = (page.projects ?? []).map((p) => String(p.slug));
				walked.push(...slugs);
				if (slugs.length < 17) break;
			}
			const dupes = walked.filter((x, i2) => walked.indexOf(x) !== i2);
			verdict(
				dupes.length === 0 && walked.length === noQSlugs.length,
				"G:pagination",
				`${gType} walk at limit=17: ${walked.length} rows, ${dupes.length} dupes ${dupes.length ? JSON.stringify([...new Set(dupes)]) : ""} (must equal the set, once each)`,
			);
			const norm = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "");
			const names = (noQ.projects ?? []).map((p) => norm(String(p.name ?? "")));
			const nameDupes = names.filter((x, i2) => x && names.indexOf(x) !== i2);
			verdict(
				nameDupes.length === 0,
				"G:no-duplicate-names",
				`${gType}: duplicate normalized names: ${nameDupes.length ? JSON.stringify([...new Set(nameDupes)]) : "none"}`,
			);
		}
	} catch (e) {
		errors++;
		console.log(`  ERROR in sliceG: ${String(e).slice(0, 120)}`);
	}
}

// ── Slice H: verify-surface truths (the claim engine grades itself) ──
// Standing claims pinned to curated truth: a status contradiction (laina,
// human-verified testnet-only), a multi-issuer attribution (EURC — supported
// WITH the never-by-ticker-alone warning), a wrong-attribution contradiction
// (USDC/Tether), and an audit support (blend). Drift = the data moved
// (update the probe WITH evidence) or verify broke — both worth a red.
async function sliceH() {
	console.log("\n── H: verify-surface truths ──");
	const check = async (claim: string, want: string, mustContain?: string) => {
		try {
			const r = (await (
				await fetch(
					`https://stellarlight.xyz/api/verify?claim=${encodeURIComponent(claim)}`,
					{ headers: { "User-Agent": "stellarlight-battery" } },
				)
			).json()) as { verdict?: string; statement?: string };
			const okV = r.verdict === want;
			const okS = !mustContain || (r.statement ?? "").includes(mustContain);
			verdict(
				okV && okS,
				"H:verify",
				`"${claim}" -> ${r.verdict}${mustContain && !okS ? ` (statement missing "${mustContain}")` : ""} (want ${want})`,
			);
		} catch (e) {
			errors++;
			console.log(`  ERROR in sliceH: ${String(e).slice(0, 100)}`);
		}
	};
	await check("is laina live", "contradicted", "Pre-Release");
	await check("is EURC issued by Circle", "supported", "also issued by MyKobo");
	await check("is USDC issued by Tether", "contradicted", "Circle");
	await check("is blend audited", "supported");
}

const slices = [
	sliceA,
	sliceB,
	sliceB2,
	sliceC,
	sliceD,
	sliceE,
	sliceF,
	sliceG,
	sliceH,
];
for (const s of slices) {
	try {
		await s();
	} catch (e) {
		errors++;
		console.log(`  ERROR in ${s.name}: ${String(e).slice(0, 140)}`);
	}
}
console.log(`\n${"=".repeat(74)}`);
console.log(
	`  ${pass} pass · ${fail} fail · ${errors} slice errors · ${((Date.now() - t0) / 1000).toFixed(0)}s`,
);
if (failures.length) {
	console.log("\n  failures:");
	for (const f of failures.slice(0, 30)) console.log(`   · ${f}`);
}
// Errors always gate — a battery that could not probe must never look green.
if (GATE && (fail > 0 || errors > 0)) process.exit(1);
