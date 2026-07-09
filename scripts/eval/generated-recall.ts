/**
 * Engine A — the generated recall matrix (full-surface-coverage-plan.md).
 *
 *   pnpm exec tsx scripts/eval/generated-recall.ts
 *   BASE_URL=... pnpm exec tsx scripts/eval/generated-recall.ts --json
 *
 * The eval DERIVES from the data itself: every record's structured fields
 * imply the queries that MUST retrieve it — no hand-written cases, no
 * adversarial judging (class 16). This is the mechanized form of the
 * 2026-07-09 full-surface audit's probe generators, so coverage extends to
 * EVERY category automatically (lending, RWA, stablecoins, gaming… — no
 * category list to maintain: a new record generates its own probes).
 *
 * v1 buckets (cheap keyword-lane probes; research lane sampled elsewhere —
 * each research query costs a Voyage embedding):
 *   P-KNOWN   projects known-item: exact name → top-3
 *   P-TYPE    type browse: for each type, ≥half of top-10 carries the type
 *   P-ATTR    attributes: coverage.countries / seps / supportedNetworks →
 *             the implying record in top-10
 *   PA-CAP    partners: sector/rampType capability queries → record top-10
 *   B-USER    builders: githubUsername → record returned
 *   R-SYM     repos: a codeVerified symbol → carrier repo in top-5
 *
 * Report-only: prints a per-bucket scoreboard + every failure with a
 * reproducible probe URL (the audit findings format). Exits non-zero only
 * when a bucket falls below its floor, so the weekly workflow goes red on
 * regression without gating PRs. Engine C later files issues from this.
 */

const BASE = (process.env.BASE_URL || "https://stellarlight.xyz").replace(
	/\/$/,
	"",
);
const JSON_OUT = process.argv.includes("--json");
const SAMPLE = Number(process.env.RECALL_SAMPLE || "0") || 0; // 0 = full

interface Failure {
	bucket: string;
	area: string;
	probe: string;
	expected: string;
	observed: string;
}

const failures: Failure[] = [];
const buckets = new Map<string, { ok: number; total: number }>();

function tally(bucket: string, ok: boolean, f?: Omit<Failure, "bucket">) {
	const b = buckets.get(bucket) ?? { ok: 0, total: 0 };
	b.total++;
	if (ok) b.ok++;
	else if (f) failures.push({ bucket, ...f });
	buckets.set(bucket, b);
}

async function j(path: string): Promise<any> {
	const res = await fetch(`${BASE}${path}`, {
		headers: { "User-Agent": "stellarlight-engine-a" },
	});
	if (!res.ok) throw new Error(`${res.status} ${path}`);
	return res.json();
}

/** Small concurrency pool — be polite to prod. */
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
	const q = [...items];
	await Promise.all(
		Array.from({ length: n }, async () => {
			while (q.length) {
				const it = q.shift();
				if (it !== undefined) await fn(it);
			}
		}),
	);
}

const cap = <T>(xs: T[]): T[] => (SAMPLE > 0 ? xs.slice(0, SAMPLE) : xs);

async function pageAll(
	pathBase: string,
	key: string,
	limit = 100,
): Promise<any[]> {
	const out: any[] = [];
	for (let offset = 0; ; offset += limit) {
		const d = await j(`${pathBase}&limit=${limit}&offset=${offset}`);
		const rows = d[key] ?? [];
		out.push(...rows);
		if (rows.length < limit || out.length >= 2000) break;
	}
	return out;
}

async function main() {
	console.log(`Engine A — generated recall matrix → ${BASE}\n`);

	// ── frame: pull the corpus once (empty q returns nothing — page by
	// category, enumerated from the API's own honest 400 valid-list) ──
	let cats: string[] = [];
	try {
		const bad = await fetch(`${BASE}/api/projects/search?category=bogus`);
		cats =
			((await bad.json()) as { validCategories?: string[] }).validCategories ??
			[];
	} catch {
		/* fall through to fallback list */
	}
	if (!cats.length)
		cats = [
			"Infrastructure",
			"Tooling",
			"User-Facing App",
			"Asset",
			"Protocol/Contract",
			"Anchor",
			"Partner Integration",
		];
	const projects: any[] = [];
	for (const c of cats)
		projects.push(
			...(await pageAll(
				`/api/projects/search?category=${encodeURIComponent(c)}`,
				"projects",
			)),
		);
	console.log(
		`frame: ${projects.length} projects across ${cats.length} categories`,
	);

	// P-KNOWN — every record's own name must reach top-3.
	await pool(cap(projects), 4, async (p) => {
		const q = encodeURIComponent(p.name);
		try {
			const d = await j(`/api/projects/search?q=${q}&limit=3`);
			const ok = (d.projects ?? []).some((r: any) => r.slug === p.slug);
			tally("P-KNOWN", ok, {
				area: p.category ?? "?",
				probe: `${BASE}/api/projects/search?q=${q}&limit=3`,
				expected: `${p.slug} in top-3 for its own name`,
				observed:
					(d.projects ?? []).map((r: any) => r.slug).join(", ") || "empty",
			});
		} catch (e) {
			tally("P-KNOWN", false, {
				area: p.category ?? "?",
				probe: `${BASE}/api/projects/search?q=${q}`,
				expected: "response",
				observed: String(e),
			});
		}
	});

	// P-TYPE — browse queries derived from the live type taxonomy.
	const TYPE_PHRASES: Record<string, string> = {
		Wallet: "wallets on stellar",
		DEX: "decentralized exchange",
		Lending: "lending protocols",
		Bridge: "cross-chain bridge",
		Payments: "payments apps",
		Anchor: "fiat on-ramp anchor",
		SDK: "sdk",
		Indexer: "blockchain indexer",
		Explorer: "block explorer",
		Analytics: "analytics dashboard",
		AI: "ai agents",
		Gaming: "blockchain gaming",
		Education: "education",
		Security: "security audit tools",
		NFT: "nft marketplace",
		RWA: "real world assets",
		Stablecoin: "stablecoin",
		"Social Impact": "social impact projects",
		RPC: "rpc provider",
		Infrastructure: "infrastructure",
	};
	const typeCounts = new Map<string, number>();
	for (const p of projects)
		for (const t of p.types ?? [])
			typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
	for (const [type, phrase] of Object.entries(TYPE_PHRASES)) {
		const n = typeCounts.get(type) ?? 0;
		if (n < 2) continue; // too thin to grade dominance
		const q = encodeURIComponent(phrase);
		try {
			const d = await j(`/api/projects/search?q=${q}&limit=10`);
			const rows = d.projects ?? [];
			const carrying = rows.filter((r: any) =>
				(r.types ?? []).includes(type),
			).length;
			const floor = Math.min(5, Math.ceil(Math.min(n, 10) / 2));
			tally("P-TYPE", carrying >= floor, {
				area: type,
				probe: `${BASE}/api/projects/search?q=${q}&limit=10`,
				expected: `≥${floor} of top-10 carry types=${type} (${n} exist)`,
				observed: `${carrying} carry it`,
			});
		} catch (e) {
			tally("P-TYPE", false, {
				area: type,
				probe: phrase,
				expected: "response",
				observed: String(e),
			});
		}
	}

	// P-ATTR — records with structured attributes imply attribute queries.
	const attrProbes: Array<{ p: any; q: string; area: string }> = [];
	for (const p of projects) {
		const c = p.coverage ?? {};
		if (c.countries?.[0] && (p.types ?? []).includes("Anchor"))
			attrProbes.push({
				p,
				q: `${c.countries[0]} anchor`,
				area: "coverage.countries",
			});
		if (c.seps?.[0])
			attrProbes.push({ p, q: c.seps[0], area: "coverage.seps" });
		if ((p.supportedNetworks ?? []).find((n: string) => n !== "stellar"))
			attrProbes.push({
				p,
				q: `${(p.supportedNetworks ?? []).find((n: string) => n !== "stellar")} ${(p.types?.[0] ?? "").toLowerCase()}`.trim(),
				area: "supportedNetworks",
			});
	}
	// Crowded-bucket fairness: when MANY records imply the same query (10+ EVM
	// bridges), a per-record top-10 expectation over-demands — grade those at
	// set level (≥3 impliers present) and keep strict per-record grading for
	// niche attributes only.
	const attrCrowd = new Map<string, number>();
	for (const a of attrProbes) attrCrowd.set(a.q, (attrCrowd.get(a.q) ?? 0) + 1);
	const attrSlugs = new Map<string, Set<string>>();
	for (const a of attrProbes) {
		const set = attrSlugs.get(a.q) ?? new Set();
		set.add(a.p.slug);
		attrSlugs.set(a.q, set);
	}
	await pool(cap(attrProbes), 4, async ({ p, q, area }) => {
		const eq = encodeURIComponent(q);
		try {
			const d = await j(`/api/projects/search?q=${eq}&limit=10`);
			const crowd = attrCrowd.get(q) ?? 1;
			const impliers = attrSlugs.get(q) ?? new Set([p.slug]);
			const ok =
				crowd > 4
					? (d.projects ?? []).filter((r: any) => impliers.has(r.slug))
							.length >= 3
					: (d.projects ?? []).some((r: any) => r.slug === p.slug);
			tally("P-ATTR", ok, {
				area,
				probe: `${BASE}/api/projects/search?q=${eq}&limit=10`,
				expected: `${p.slug} in top-10 (its own ${area} implies '${q}')`,
				observed:
					(d.projects ?? [])
						.slice(0, 5)
						.map((r: any) => r.slug)
						.join(", ") || "empty",
			});
		} catch (e) {
			tally("P-ATTR", false, {
				area,
				probe: q,
				expected: "response",
				observed: String(e),
			});
		}
	});

	// PA-CAP — partners: their own sectors/rampTypes imply capability queries.
	const partners = (await j("/api/partners?all=1&limit=100")).partners ?? [];
	const paProbes: Array<{ pa: any; path: string; desc: string }> = [];
	for (const pa of partners) {
		if (pa.partnerType)
			paProbes.push({
				pa,
				path: `/api/partners?type=${encodeURIComponent(pa.partnerType)}&all=1&limit=50`,
				desc: `type=${pa.partnerType}`,
			});
	}
	await pool(cap(paProbes), 4, async ({ pa, path, desc }) => {
		try {
			const d = await j(path);
			const ok = (d.partners ?? []).some((r: any) => r.slug === pa.slug);
			tally("PA-CAP", ok, {
				area: pa.partnerType ?? "?",
				probe: `${BASE}${path}`,
				expected: `${pa.slug} under its own ${desc}`,
				observed: `${(d.partners ?? []).length} rows, absent`,
			});
		} catch (e) {
			tally("PA-CAP", false, {
				area: desc,
				probe: path,
				expected: "response",
				observed: String(e),
			});
		}
	});

	// B-USER — builders retrievable by their own githubUsername.
	const builders = (await j("/api/builders?limit=100")).builders ?? [];
	const withUser = builders.filter((b: any) => b.githubUsername);
	await pool(cap(withUser), 4, async (b: any) => {
		const q = encodeURIComponent(b.githubUsername);
		try {
			const d = await j(`/api/builders?q=${q}&limit=10`);
			const ok = (d.builders ?? []).some(
				(r: any) => r.githubUsername === b.githubUsername,
			);
			tally("B-USER", ok, {
				area: "builders",
				probe: `${BASE}/api/builders?q=${q}`,
				expected: `${b.githubUsername} retrievable by own username`,
				observed: `${(d.builders ?? []).length} rows, absent`,
			});
		} catch (e) {
			tally("B-USER", false, {
				area: "builders",
				probe: String(b.githubUsername),
				expected: "response",
				observed: String(e),
			});
		}
	});

	// R-SYM — scanned repos retrievable by one of their own symbols.
	const repoSeed =
		(await j("/api/repos/search?q=soroban&limit=50")).repos ?? [];
	const withSyms = repoSeed.filter(
		(r: any) => (r.codeVerified?.symbols ?? []).length > 0,
	);
	await pool(cap(withSyms).slice(0, 30), 4, async (r: any) => {
		const sym = r.codeVerified.symbols[0];
		const q = encodeURIComponent(sym);
		try {
			const d = await j(`/api/repos/search?q=${q}&limit=5`);
			const ok = (d.repos ?? []).some((x: any) => x.fullName === r.fullName);
			tally("R-SYM", ok, {
				area: "repos-symbols",
				probe: `${BASE}/api/repos/search?q=${q}&limit=5`,
				expected: `${r.fullName} in top-5 for its own symbol '${sym}'`,
				observed:
					(d.repos ?? []).map((x: any) => x.fullName).join(", ") || "empty",
			});
		} catch (e) {
			tally("R-SYM", false, {
				area: "repos-symbols",
				probe: sym,
				expected: "response",
				observed: String(e),
			});
		}
	});

	// ── scoreboard + floors ──
	const FLOORS: Record<string, number> = {
		"P-KNOWN": 0.9,
		"P-TYPE": 0.75,
		"P-ATTR": 0.7,
		"PA-CAP": 0.9,
		"B-USER": 0.85,
		"R-SYM": 0.75,
	};
	let red = false;
	const board = [...buckets.entries()].map(([k, v]) => {
		const rate = v.total ? v.ok / v.total : 1;
		const floor = FLOORS[k] ?? 0;
		const status = rate >= floor ? "OK " : "RED";
		if (rate < floor) red = true;
		return {
			bucket: k,
			ok: v.ok,
			total: v.total,
			rate: Math.round(rate * 1000) / 10,
			floor: floor * 100,
			status,
		};
	});

	if (JSON_OUT) {
		console.log(JSON.stringify({ base: BASE, board, failures }, null, 1));
	} else {
		console.log("\n── Engine A scoreboard ──");
		for (const b of board)
			console.log(
				`  ${b.status}  ${b.bucket.padEnd(8)} ${String(b.ok).padStart(4)}/${String(b.total).padEnd(4)} = ${b.rate}%  (floor ${b.floor}%)`,
			);
		console.log(`\n── failures (${failures.length}) ──`);
		for (const f of failures.slice(0, 60))
			console.log(
				`  [${f.bucket}] ${f.area}: expected ${f.expected}\n      got: ${f.observed}\n      probe: ${f.probe}`,
			);
		if (failures.length > 60)
			console.log(`  … +${failures.length - 60} more (use --json for all)`);
	}
	process.exit(red ? 1 : 0);
}

main().catch((e) => {
	console.error("FATAL", e);
	process.exit(1);
});
