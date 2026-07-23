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
 *   WEB   website dead — the host does not resolve or refuses connections, or
 *         it answers 404/410. Everything else that ISN'T a clean response —
 *         5xx, timeout, EAI_AGAIN, invalid TLS cert — is UNVERIFIABLE and
 *         contributes NO death signal (class 32; see src/lib/probe-external).
 *         Until 2026-07-23 this counted 5xx/timeout/EAI_AGAIN/bad-cert as
 *         positive evidence of death, on a report whose entire purpose is
 *         deciding what to demote — precision over recall, so they now don't.
 *         Bot walls (403/401/429) moved from "alive" to "unverifiable" in the
 *         same change: a Cloudflare challenge proves a SERVER answers, not that
 *         the product lives. No effect on the shortlist (neither state emits a
 *         signal) — they just now show up in the unverifiable list instead of
 *         silently passing as healthy.
 *   CODE  no dated activity signal at all, or newest (lastActivityAt,
 *         tvlAsOf) older than 365d.
 *   TVL   DeFi-typed record tracked by DefiLlama at < $5,000 TVL — the
 *         Slender pattern (a "Live" lending protocol holding $93).
 *
 * API-driven (public endpoints only) — no DB credentials, run anywhere.
 */

import { probeExternal } from "../src/lib/probe-external";

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

/** Death evidence comes from probeExternal's `absent` verdict ONLY — the host
 * failing to resolve / refusing the connection, or answering 404/410. A server
 * that is broken, slow, walled or presenting a bad cert proves a server EXISTS
 * or proves nothing; either way it is `unknown` and adds no signal here. */
async function probeSite(url: string): Promise<WebResult> {
	// GET, not HEAD — a surprising number of small sites 405 on HEAD.
	const p = await probeExternal(url, {
		method: "GET",
		timeoutMs: TIMEOUT_MS,
		userAgent:
			"Mozilla/5.0 (compatible; StellarLightLivenessReport/1.0; +https://stellarlight.xyz)",
	});
	const state =
		p.verdict === "present"
			? "alive"
			: p.verdict === "absent"
				? "dead"
				: "unknown";
	return { state, detail: p.detail };
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
	// Class 32: unverifiable gets its own column so it can never be read as
	// health. These sites answered SOMETHING we couldn't classify (5xx, timeout,
	// bot wall, bad cert) — before 2026-07-23 several of these shapes silently
	// counted as death signals.
	const webUnverifiable = rows.filter(
		(r) => r.website && r.web.state === "unknown",
	);

	if (JSON_OUT) {
		console.log(
			JSON.stringify(
				{
					frame: { projects: projects.length, live: live.length },
					shortlist,
					webDeadOnly: webDeadOnly.map((r) => r.slug),
					tvlOnly: tvlOnly.map((r) => r.slug),
					webUnverifiable: webUnverifiable.map((r) => ({
						slug: r.slug,
						detail: r.web.detail,
					})),
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
	console.log(
		`\n## Unverifiable websites (${webUnverifiable.length}) — NOT a death signal\n`,
	);
	console.log(
		"Server error, timeout, bot wall or bad certificate: the probe proved nothing either way, so these contribute NO signal above. Listed so the absence is visible rather than silent.\n",
	);
	for (const r of webUnverifiable)
		console.log(`- ${r.slug} — ${r.web.detail} (${r.website})`);
}

main().catch((e) => {
	console.error("FATAL", e);
	process.exit(1);
});
