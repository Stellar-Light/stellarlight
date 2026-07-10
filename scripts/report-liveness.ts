/**
 * Liveness wave — REPORT ONLY (audit Part-3; Engine B S4's pool).
 *
 *   pnpm exec tsx scripts/report-liveness.ts [--json]
 *
 * Joins three independent death signals for every Live project and emits a
 * ranked review shortlist. NEVER writes — repo staleness ≠ product death
 * (lessons class 18: bidali/bitwage/yieldblox are alive with stale repos),
 * so status flips happen only via owner-reviewed STATUS_FIX rows in
 * curate-projects.ts, grounded in each project's own materials.
 *
 * Signals (each independently weak; the shortlist requires ≥2):
 *   WEB   website dead — DNS failure, timeout, HTTP 404/410/5xx.
 *         403/401/429 count as ALIVE (bot walls prove a server exists).
 *   CODE  no dated activity signal at all, or newest (lastActivityAt,
 *         tvlAsOf) older than 365d.
 *   TVL   DeFi-typed record tracked by DefiLlama at < $5,000 TVL — the
 *         Slender pattern (a "Live" lending protocol holding $93).
 *
 * API-driven (public endpoints only) — no DB credentials, run anywhere.
 */

const BASE = (process.env.BASE_URL || "https://stellarlight.xyz").replace(
	/\/$/,
	"",
);
const JSON_OUT = process.argv.includes("--json");
const CONCURRENCY = 8;
const TIMEOUT_MS = 12_000;
const STALE_DAYS = 365;
const TVL_FLOOR_USD = 5_000;
const DEFI_TYPES = new Set([
	"DeFi",
	"DEX",
	"AMM",
	"Lending",
	"Yield",
	"Protocol/Contract",
]);

async function j(path: string): Promise<any> {
	const res = await fetch(`${BASE}${path}`, {
		headers: { "User-Agent": "stellarlight-liveness-report" },
	});
	if (!res.ok) throw new Error(`${res.status} ${path}`);
	return res.json();
}

async function pageAll(pathBase: string): Promise<any[]> {
	const out: any[] = [];
	for (let offset = 0; ; offset += 100) {
		const d = await j(`${pathBase}&limit=100&offset=${offset}`);
		const rows = d.projects ?? [];
		out.push(...rows);
		if (rows.length < 100 || out.length >= 3000) break;
	}
	return out;
}

type WebResult = { state: "alive" | "dead" | "unknown"; detail: string };

async function probeSite(url: string): Promise<WebResult> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
	try {
		// GET, not HEAD — a surprising number of small sites 405 on HEAD.
		const res = await fetch(url, {
			method: "GET",
			redirect: "follow",
			signal: ctrl.signal,
			headers: {
				"User-Agent":
					"Mozilla/5.0 (compatible; StellarLightLivenessReport/1.0; +https://stellarlight.xyz)",
			},
		});
		if (
			res.ok ||
			res.status === 403 ||
			res.status === 401 ||
			res.status === 429
		)
			return { state: "alive", detail: `HTTP ${res.status}` };
		if (res.status === 404 || res.status === 410 || res.status >= 500)
			return { state: "dead", detail: `HTTP ${res.status}` };
		return { state: "unknown", detail: `HTTP ${res.status}` };
	} catch (e) {
		const msg = String((e as Error).cause ?? (e as Error).message);
		// DNS death is the strongest dead signal; timeout slightly weaker but
		// after 12s with redirects followed, still a real signal.
		if (/ENOTFOUND|EAI_AGAIN|certificate/i.test(msg))
			return { state: "dead", detail: "DNS/TLS failure" };
		if (/abort/i.test(msg)) return { state: "dead", detail: "timeout" };
		return { state: "unknown", detail: msg.slice(0, 60) };
	} finally {
		clearTimeout(timer);
	}
}

async function main() {
	console.error(`Liveness report → ${BASE}`);
	let cats: string[] = [];
	try {
		const bad = await fetch(`${BASE}/api/projects/search?category=bogus`);
		cats =
			((await bad.json()) as { validCategories?: string[] }).validCategories ??
			[];
	} catch {}
	const projects: any[] = [];
	for (const c of cats)
		projects.push(
			...(await pageAll(
				`/api/projects/search?category=${encodeURIComponent(c)}`,
			)),
		);
	const live = projects.filter(
		(p) => p.status === "Live" && !p.canonicalSlug, // shadows excluded
	);
	console.error(`frame: ${projects.length} projects, ${live.length} Live`);

	const now = Date.now();
	const rows: Array<{
		slug: string;
		name: string;
		website: string | null;
		web: WebResult;
		ageDays: number | null;
		hasDated: boolean;
		tvlUSD: number | null;
		tvlZombie: boolean;
		signals: string[];
		scfAwarded: boolean;
	}> = [];

	// probe websites with a small worker pool
	let idx = 0;
	async function worker() {
		for (;;) {
			const i = idx++;
			if (i >= live.length) return;
			const p = live[i];
			const website: string | null = p.links?.website ?? null;
			const web: WebResult = website
				? await probeSite(website)
				: { state: "unknown", detail: "no website on record" };

			const dates = [p.lastActivityAt, p.tvlAsOf]
				.filter(Boolean)
				.map((d: string) => new Date(d).getTime())
				.filter(Number.isFinite);
			const newest = dates.length ? Math.max(...dates) : null;
			const ageDays = newest ? Math.round((now - newest) / 86_400_000) : null;
			const hasDated = newest !== null;
			const tvlUSD = typeof p.tvlUSD === "number" ? p.tvlUSD : null;
			const isDefi = (p.types ?? []).some((t: string) => DEFI_TYPES.has(t));
			const tvlZombie = isDefi && tvlUSD !== null && tvlUSD < TVL_FLOOR_USD;

			const signals: string[] = [];
			if (web.state === "dead") signals.push(`WEB ${web.detail}`);
			if (!hasDated) signals.push("CODE no dated signal");
			else if (ageDays !== null && ageDays > STALE_DAYS)
				signals.push(`CODE stale ${ageDays}d`);
			if (tvlZombie) signals.push(`TVL $${tvlUSD}`);

			rows.push({
				slug: p.slug,
				name: p.name,
				website,
				web,
				ageDays,
				hasDated,
				tvlUSD,
				tvlZombie,
				signals,
				scfAwarded: !!p.scfAwarded,
			});
			if (rows.length % 50 === 0)
				console.error(`  …${rows.length}/${live.length} probed`);
		}
	}
	await Promise.all(Array.from({ length: CONCURRENCY }, worker));

	// Shortlist = ≥2 independent signals (precision over recall). A dead
	// website alone can be a lapsed domain on a live product; a stale repo
	// alone is the bidali class. Two together is worth a human look.
	const shortlist = rows
		.filter((r) => r.signals.length >= 2)
		.sort((a, b) => b.signals.length - a.signals.length);
	const webDeadOnly = rows.filter(
		(r) => r.web.state === "dead" && r.signals.length === 1,
	);
	const tvlOnly = rows.filter((r) => r.tvlZombie && r.signals.length === 1);

	if (JSON_OUT) {
		console.log(
			JSON.stringify(
				{
					frame: { projects: projects.length, live: live.length },
					shortlist,
					webDeadOnly: webDeadOnly.map((r) => r.slug),
					tvlOnly: tvlOnly.map((r) => r.slug),
				},
				null,
				1,
			),
		);
		return;
	}

	console.log(
		`# Liveness review shortlist — ${new Date().toISOString().slice(0, 10)}`,
	);
	console.log(
		`\nFrame: ${live.length} Live records (lineage shadows excluded). Shortlist = ≥2 independent death signals. REPORT ONLY — flips go through owner review into curate-projects STATUS_FIX (never bulk; class 18).\n`,
	);
	console.log(`## Review candidates (${shortlist.length}) — ≥2 signals\n`);
	console.log("| project | signals | website | activity | TVL | SCF |");
	console.log("|---|---|---|---|---|---|");
	for (const r of shortlist)
		console.log(
			`| ${r.slug} | ${r.signals.join(" + ")} | ${r.web.detail} | ${r.hasDated ? `${r.ageDays}d ago` : "none"} | ${r.tvlUSD === null ? "—" : `$${r.tvlUSD}`} | ${r.scfAwarded ? "✓" : ""} |`,
		);
	console.log(
		`\n## Single-signal watch lists (NOT candidates — context only)\n`,
	);
	console.log(
		`- website dead only (${webDeadOnly.length}): ${webDeadOnly.map((r) => r.slug).join(", ")}`,
	);
	console.log(
		`- TVL < $${TVL_FLOOR_USD} only (${tvlOnly.length}): ${tvlOnly.map((r) => r.slug).join(", ")}`,
	);
}

main().catch((e) => {
	console.error("FATAL", e);
	process.exit(1);
});
