/**
 * Coverage & freshness gap report - REPORT ONLY (the "move faster to find,
 * index and serve" metric; raven#18 / Tyler 2026-07-15).
 *
 *   pnpm exec tsx scripts/report-coverage-gaps.ts [--json]
 *
 * Cross-references EXTERNAL ecosystem rosters against what we actually serve
 * and reports two kinds of gap:
 *
 *   MISSING  a resource the ecosystem visibly has that our index doesn't
 *            serve at all (the Sentora class - hand-added 2026-07-15 only
 *            after a human noticed a Medium post; DefiLlama had been listing
 *            it at $2B TVL the whole time).
 *   STALE    a surface we DO serve whose data is old or undated (the raven#18
 *            freshness complaint: an agent asking about current capabilities
 *            can get a stale answer with no way to tell).
 *
 * Lanes (each independently useful; precision over recall - a gap report
 * that cries wolf wastes review time):
 *   defillama    Stellar-chain protocols on api.llama.fi (category != CEX)
 *                with no directory record. Match order: llamaSlugs join ->
 *                website domain -> normalized name/alias -> containment.
 *                CEXs excluded (they "support Stellar" as an asset; they are
 *                not Stellar projects).
 *   scf          delegates to scripts/eval/scf-absence-diff.ts (the existing
 *                bounded SCF-roster diff) and folds its result in.
 *   partnerDocs  curated partner doc surfaces (the raven#18 examples) probed
 *                against /api/research. Tiered verdict: "own" = the partner's
 *                OWN content is indexed; "mention" = only a stellar.org-hosted
 *                post/guide about them; "none" = nothing.
 *   freshness    /api/status source ages + per-research-source newest
 *                observation date and whether rows are date-stamped at all.
 *
 * NEVER writes. Missing entries become human-reviewed SEEDS and partner
 * surfaces become ingest-registry candidates - via the detect->verify->curate
 * flywheel (docs/directory-quality-engine.md), never auto-created.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = (process.env.BASE_URL || "https://stellarlight.xyz").replace(
	/\/$/,
	"",
);
const JSON_OUT = process.argv.includes("--json");
const TVL_REPORT_FLOOR_USD = 50_000; // below this ON STELLAR (chainTvls.Stellar, not the cross-chain total) a missing llama listing is dust - counted, not itemized
const STATUS_STALE_DAYS = 7; // collection freshness (status sources refresh daily-ish)
const RESEARCH_STALE_DAYS = 45; // research corpus: sources re-ingest on cron cadences

// -- shared helpers (same conventions as report-liveness / report-tag-mismatch) --

// biome-ignore lint/suspicious/noExplicitAny: cross-API report script
async function j(url: string): Promise<any> {
	const res = await fetch(url, {
		headers: { "User-Agent": "stellarlight-coverage-report" },
	});
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	return res.json();
}

const canon = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Hostname without www. */
function hostOf(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return null;
	}
}

interface DirRow {
	name: string;
	slug: string;
	status: string;
	llamaSlugs: string[] | null;
	website: string | null;
	aliases: string[];
}

/** Full directory frame - every status (Inactive included: a scoped-out or
 * dead record still counts as "we know about it", not a coverage gap).
 *
 * Paged PER CATEGORY, not per status: the search route bounds its candidate
 * pool (~500) per query, so status=Live alone (800+) silently truncates -
 * the first run of this report flagged Blend/Aquarius/Soroswap as "missing"
 * because they sat past the cap. Same approach as scf-absence-diff, which
 * discovers the category enum from the endpoint's own 400 response. */
async function fetchDirectory(): Promise<DirRow[]> {
	const bad = await fetch(`${BASE}/api/projects/search?category=bogus`);
	const cats: string[] =
		((await bad.json()) as { validCategories?: string[] }).validCategories ??
		[];
	if (!cats.length) throw new Error("could not discover validCategories");
	const bySlug = new Map<string, DirRow>();
	for (const c of cats) {
		for (let offset = 0; ; offset += 100) {
			const d = await j(
				`${BASE}/api/projects/search?category=${encodeURIComponent(c)}&limit=100&offset=${offset}`,
			);
			const rows = d.projects ?? [];
			for (const p of rows) {
				bySlug.set(p.slug, {
					name: p.name ?? p.slug,
					slug: p.slug,
					status: p.status,
					llamaSlugs: Array.isArray(p.llamaSlugs) ? p.llamaSlugs : null,
					website: p.links?.website ?? null,
					aliases: Array.isArray(p.identity?.aliases) ? p.identity.aliases : [],
				});
			}
			if (rows.length < 100 || offset > 2000) break;
		}
	}
	return [...bySlug.values()];
}

// -- lane 1: DefiLlama Stellar protocols --

interface LlamaMiss {
	name: string;
	slug: string;
	category: string;
	/** TVL actually deployed ON STELLAR (chainTvls.Stellar) — the number that
	 * decides whether a listing is a real gap. Llama's headline `tvl` is the
	 * CROSS-CHAIN total: NEAR Intents showed $92M total with $11.5k on Stellar
	 * (26 chains) — boxy correctly flagged that as not-a-Stellar-gap. */
	stellarTvlUSD: number;
	totalTvlUSD: number;
	url: string | null;
}

async function laneDefillama(dir: DirRow[]) {
	// biome-ignore lint/suspicious/noExplicitAny: external API rows
	const all: any[] = await j("https://api.llama.fi/protocols");
	const stellar = all.filter(
		(p) => Array.isArray(p.chains) && p.chains.includes("Stellar"),
	);
	const candidates = stellar.filter((p) => p.category !== "CEX");
	const cexCount = stellar.length - candidates.length;

	const byLlamaSlug = new Map<string, DirRow>();
	const byDomain = new Map<string, DirRow>();
	const byCanon = new Map<string, DirRow>();
	for (const r of dir) {
		for (const ls of r.llamaSlugs ?? []) byLlamaSlug.set(ls, r);
		const d = hostOf(r.website);
		if (d) byDomain.set(d, r);
		byCanon.set(canon(r.name), r);
		byCanon.set(canon(r.slug), r);
		for (const a of r.aliases) byCanon.set(canon(a), r);
	}
	// Containment fallback for name-shape drift (llama "Balanced Exchange" vs
	// our "Balanced"/balanced-network - the first run false-positived it).
	// >=6 chars both directions keeps this precise.
	const canonKeys = [...byCanon.keys()].filter((k) => k.length >= 6);
	const containsMatch = (name: string) => {
		const c = canon(name);
		if (c.length < 6) return undefined;
		const key = canonKeys.find((k) => c.includes(k) || k.includes(c));
		return key ? byCanon.get(key) : undefined;
	};

	const missing: LlamaMiss[] = [];
	let matched = 0;
	for (const p of candidates) {
		const hit =
			byLlamaSlug.get(p.slug) ??
			byDomain.get(hostOf(p.url) ?? " ") ??
			byCanon.get(canon(p.name)) ??
			containsMatch(p.name);
		if (hit) {
			matched++;
			continue;
		}
		const stellarTvl = p.chainTvls?.Stellar;
		missing.push({
			name: p.name,
			slug: p.slug,
			category: p.category ?? "?",
			stellarTvlUSD: Math.round(
				typeof stellarTvl === "number" ? stellarTvl : 0,
			),
			totalTvlUSD: Math.round(p.tvl ?? 0),
			url: p.url ?? null,
		});
	}
	// Floor + rank on the STELLAR slice — a multichain protocol's headline TVL
	// says nothing about its Stellar footprint.
	missing.sort((a, b) => b.stellarTvlUSD - a.stellarTvlUSD);
	const itemized = missing.filter(
		(m) => m.stellarTvlUSD >= TVL_REPORT_FLOOR_USD,
	);
	return {
		stellarListed: stellar.length,
		cexExcluded: cexCount,
		matched,
		missing: itemized,
		belowFloor: missing.length - itemized.length, // no silent caps
	};
}

// -- lane 2: SCF roster (delegate to the existing bounded diff) --

function laneScf() {
	try {
		const out = join(mkdtempSync(join(tmpdir(), "scf-diff-")), "scf.json");
		execFileSync(
			"pnpm",
			["exec", "tsx", "scripts/eval/scf-absence-diff.ts", `--out=${out}`],
			{ stdio: ["ignore", "ignore", "inherit"], timeout: 240_000 },
		);
		return JSON.parse(readFileSync(out, "utf8"));
	} catch (e) {
		return { error: String((e as Error).message ?? e) };
	}
}

// -- lane 3: partner doc surfaces (the raven#18 examples) --

/** Partner-owned doc surfaces that matter to Stellar builders. Curated seed -
 * candidates for a future partner-source ingest registry. `probe` is what a
 * builder would ask; `match` is tested against result URLs only (a stellar.org
 * post that merely mentions the partner is a "mention", never "own"). */
const PARTNER_SURFACES = [
	{
		partner: "Alchemy",
		surface: "Stellar Data API docs",
		url: "https://www.alchemy.com/docs/reference/stellar-api-quickstart",
		probe: "Alchemy Stellar Data API transfers balances",
		match: /alchemy/i,
	},
	{
		partner: "OpenZeppelin",
		surface: "Stellar contracts library docs",
		url: "https://docs.openzeppelin.com/stellar-contracts/",
		probe: "OpenZeppelin Stellar contracts library",
		match: /openzeppelin/i,
	},
	{
		partner: "Sentora",
		surface: "Stellar vaults announcement/docs",
		url: "https://medium.com/sentora/sentora-launches-vaults-on-the-stellar-network-accessible-via-stellar-defi-hub-2b09749cd789",
		probe: "Sentora vaults Stellar DeFi Hub",
		match: /sentora|stellardefihub/i,
	},
	{
		partner: "Chainlink",
		surface: "Stellar Data Streams docs",
		url: "https://docs.chain.link/data-streams",
		probe: "Chainlink Data Streams Stellar",
		match: /chainlink|chain\.link/i,
	},
] as const;

type PartnerVerdict = "own" | "mention" | "none";

async function lanePartnerDocs() {
	const results: Array<{
		partner: string;
		surface: string;
		url: string;
		verdict: PartnerVerdict;
		via: string | null;
	}> = [];
	for (const s of PARTNER_SURFACES) {
		let verdict: PartnerVerdict = "none";
		let via: string | null = null;
		try {
			const d = await j(
				`${BASE}/api/research?q=${encodeURIComponent(s.probe)}&limit=5`,
			);
			const rows = d.results ?? d.data ?? [];
			for (const r of rows) {
				const u: string = r.url ?? r.sourceUrl ?? "";
				if (!s.match.test(u)) continue;
				const host = hostOf(u) ?? "";
				// stellar.org / developers.stellar.org hosting = SDF's own post or
				// guide ABOUT the partner - honest tier is "mention", not "own"
				// (the first run showed Chainlink "served" off an SDF blog post).
				const tier: PartnerVerdict = host.endsWith("stellar.org")
					? "mention"
					: "own";
				if (tier === "own") {
					verdict = "own";
					via = r.source ?? null;
					break;
				}
				if (verdict === "none") {
					verdict = "mention";
					via = r.source ?? null;
				}
			}
		} catch {
			// probe failure = "none" (loud in the report either way)
		}
		results.push({
			partner: s.partner,
			surface: s.surface,
			url: s.url,
			verdict,
			via,
		});
	}
	return results;
}

// -- lane 4: freshness --

const RESEARCH_SOURCES = [
	"sdf-blog",
	"scf-handbook",
	"sep",
	"cap",
	"dev-docs",
	"paper",
	"scf-proposal",
	"lumenloop",
	"lumenloop-research",
	"audit",
	"incident",
	"security-program",
	"sdf-org",
	"ec-developer-report",
] as const;

/** Collections whose zero/blank state is a documented serving choice, not a
 * gap - flagging them as EMPTY every month would train readers to ignore
 * the flag. */
const KNOWN_EMPTY_OK: Record<string, string> = {
	hackathons:
		"curated DB sub-count; /api/hackathons serves live DoraHacks-sourced events",
};

async function laneFreshness() {
	const now = Date.now();
	const ageDays = (iso: string | null | undefined) =>
		iso ? Math.floor((now - Date.parse(iso)) / 86_400_000) : null;

	const status = await j(`${BASE}/api/status`);
	// biome-ignore lint/suspicious/noExplicitAny: external API rows
	const collections = (status.sources ?? []).map((s: any) => ({
		name: s.name,
		count: s.count,
		lastUpdatedAt: s.lastUpdatedAt ?? null,
		ageDays: ageDays(s.lastUpdatedAt),
		stale:
			s.lastUpdatedAt != null &&
			(ageDays(s.lastUpdatedAt) ?? 0) > STATUS_STALE_DAYS,
		empty: s.count === 0 && !(s.name in KNOWN_EMPTY_OK),
		note: KNOWN_EMPTY_OK[s.name] ?? null,
	}));

	const research = [];
	for (const source of RESEARCH_SOURCES) {
		try {
			const d = await j(
				`${BASE}/api/research?q=stellar&source=${source}&limit=5`,
			);
			const rows = d.results ?? d.data ?? [];
			let newest: string | null = null;
			let stamped = 0;
			for (const r of rows) {
				const t = r.observedAt ?? r.publishedAt ?? null;
				if (t) {
					stamped++;
					if (!newest || t > newest) newest = t;
				}
			}
			research.push({
				source,
				sampled: rows.length,
				empty: rows.length === 0,
				newestSeen: newest,
				ageDays: ageDays(newest),
				dateStamped: stamped > 0,
				stale: newest != null && (ageDays(newest) ?? 0) > RESEARCH_STALE_DAYS,
			});
		} catch (e) {
			research.push({
				source,
				sampled: 0,
				empty: true,
				error: String((e as Error).message ?? e),
			});
		}
	}
	return { collections, research };
}

// -- main --

async function main() {
	console.error("fetching directory frame...");
	const dir = await fetchDirectory();
	console.error(`  ${dir.length} directory records (all statuses)`);

	console.error("lane: defillama...");
	const defillama = await laneDefillama(dir);
	console.error("lane: partner docs...");
	const partnerDocs = await lanePartnerDocs();
	console.error("lane: freshness...");
	const freshness = await laneFreshness();
	console.error("lane: scf roster (delegated diff, slow)...");
	const scf = laneScf();

	const report = {
		generatedAt: new Date().toISOString(),
		base: BASE,
		directoryRecords: dir.length,
		lanes: { defillama, scf, partnerDocs, freshness },
		summary: {
			missingDefillama: defillama.missing.length,
			missingScf: typeof scf.absent === "number" ? scf.absent : null,
			partnerDocsWithoutOwnContent: partnerDocs.filter(
				(p) => p.verdict !== "own",
			).length,
			staleCollections: freshness.collections.filter(
				// biome-ignore lint/suspicious/noExplicitAny: local shape
				(c: any) => c.stale,
			).length,
			staleOrEmptyResearchSources: freshness.research.filter(
				// biome-ignore lint/suspicious/noExplicitAny: local shape
				(r: any) => r.stale || r.empty,
			).length,
			unstampedResearchSources: freshness.research.filter(
				// biome-ignore lint/suspicious/noExplicitAny: local shape
				(r: any) => !r.empty && !r.dateStamped,
			).length,
		},
	};

	if (JSON_OUT) {
		console.log(JSON.stringify(report, null, 1));
		return;
	}

	console.log(
		`# Coverage & freshness gaps - ${dir.length} directory records vs external rosters\n`,
	);

	console.log(
		`## DefiLlama (Stellar chain): ${defillama.missing.length} missing of ${defillama.stellarListed} listed (${defillama.cexExcluded} CEX excluded, ${defillama.matched} matched, ${defillama.belowFloor} below $${TVL_REPORT_FLOOR_USD / 1000}k-on-Stellar floor)\n`,
	);
	console.log(
		"| protocol | category | TVL on Stellar | total (all chains) | site |",
	);
	console.log("|---|---|---|---|---|");
	for (const m of defillama.missing)
		console.log(
			`| ${m.name} (${m.slug}) | ${m.category} | $${m.stellarTvlUSD.toLocaleString()} | $${m.totalTvlUSD.toLocaleString()} | ${m.url ?? "-"} |`,
		);

	console.log(
		`\n## SCF roster: ${scf.absent ?? "?"} unmatched (${scf.absentWithRoundBadge ?? "?"} with award badge)${scf.error ? ` - lane error: ${scf.error}` : ""}\n`,
	);

	console.log("## Partner doc surfaces (raven#18)\n");
	console.log("| partner | surface | verdict |");
	console.log("|---|---|---|");
	for (const p of partnerDocs) {
		const label =
			p.verdict === "own"
				? `own content indexed (via ${p.via})`
				: p.verdict === "mention"
					? `stellar.org mention only (via ${p.via}) - partner's own docs NOT indexed`
					: "NOT SERVED at all";
		console.log(`| ${p.partner} | ${p.surface} | ${label} |`);
	}

	console.log("\n## Freshness\n");
	console.log("| collection | count | age (days) | flag |");
	console.log("|---|---|---|---|");
	for (const c of freshness.collections)
		console.log(
			`| ${c.name} | ${c.count} | ${c.ageDays ?? "-"} | ${c.empty ? "EMPTY" : c.stale ? "STALE" : c.note ? `ok (${c.note})` : ""} |`,
		);
	console.log("\n| research source | newest seen | stamped? | flag |");
	console.log("|---|---|---|---|");
	for (const r of freshness.research)
		console.log(
			`| ${r.source} | ${r.newestSeen ?? "-"} | ${r.dateStamped ? "yes" : r.empty ? "-" : "NO DATES"} | ${r.empty ? "EMPTY" : r.stale ? "STALE" : ""} |`,
		);

	const s = report.summary;
	console.log(
		`\n**Summary:** ${s.missingDefillama} llama-missing | ${s.missingScf ?? "?"} scf-missing | ${s.partnerDocsWithoutOwnContent}/${partnerDocs.length} partner surfaces without own content | ${s.staleCollections} stale collections | ${s.staleOrEmptyResearchSources} stale/empty research sources | ${s.unstampedResearchSources} undated research sources`,
	);
}

main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("FATAL", e);
		process.exit(1);
	});
