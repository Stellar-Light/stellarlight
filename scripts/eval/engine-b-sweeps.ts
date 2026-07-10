/**
 * Engine B — class-projection sweeps (full-surface-coverage-plan.md, Part 2).
 *
 *   pnpm exec tsx scripts/eval/engine-b-sweeps.ts [--json]
 *
 * Where Engine A asks "does retrieval work?" from the data, Engine B asks
 * "is the data itself internally consistent and complete?" — the sweeps that
 * project each lessons class across the WHOLE corpus, report-only. No writes;
 * no live search calls (this is a DATA audit, not a retrieval one). Feeds the
 * Part-3 human-verified waves and Engine C's issue filing.
 *
 * Sweeps:
 *   S1 PROSE⇄STRUCTURE divergence (classes 1/2/6/14): a record's own prose
 *      names a chain / country / SEP / secondary-capability that its
 *      structured fields don't carry → the field can't drive retrieval.
 *   S2 FIELD-POPULATION census (class 2): % populated per structured field
 *      per category — where omission=negation is a standing hazard.
 *   S3 DUPLICATE detection (class 10): slug-normalization pairs (name vs
 *      name+suffix, punctuation) that split funding/stats.
 *   S4 STALENESS exposure (classes 8/18/19): Live records whose only dated
 *      signal (lastActivityAt / tvlAsOf) is old or absent — liveness-wave
 *      candidates (never auto-acted; class 18).
 */

const BASE = (process.env.BASE_URL || "https://stellarlight.xyz").replace(
	/\/$/,
	"",
);
const JSON_OUT = process.argv.includes("--json");

async function j(path: string): Promise<any> {
	const res = await fetch(`${BASE}${path}`, {
		headers: { "User-Agent": "stellarlight-engine-b" },
	});
	if (!res.ok) throw new Error(`${res.status} ${path}`);
	return res.json();
}

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
		if (rows.length < limit || out.length >= 3000) break;
	}
	return out;
}

// Vocabulary the prose→structure diff looks for. Deliberately conservative:
// a hit means "the prose clearly asserts X" — false positives waste review time.
const CHAIN_WORDS: Record<string, string> = {
	ethereum: "evm",
	evm: "evm",
	polygon: "evm",
	arbitrum: "evm",
	base: "evm",
	optimism: "evm",
	bnb: "evm",
	avalanche: "evm",
	solana: "solana",
	tron: "tron",
	bitcoin: "bitcoin",
	polkadot: "polkadot",
	cosmos: "cosmos",
	near: "near",
	sui: "sui",
	aptos: "aptos",
	xrpl: "xrpl",
	ripple: "xrpl",
};
const COUNTRY_WORDS = [
	"mexico",
	"brazil",
	"argentina",
	"colombia",
	"chile",
	"peru",
	"nigeria",
	"kenya",
	"tanzania",
	"ghana",
	"philippines",
	"indonesia",
	"india",
	"south africa",
	"uganda",
	"vietnam",
];
const SEP_RE = /\bsep[-\s]?(\d{1,3})\b/gi;

function norm(s: string): string {
	return (s || "").toLowerCase();
}

async function main() {
	console.error(`Engine B — data-consistency sweeps → ${BASE}`);
	const report: Record<string, unknown> = {};

	// frame: full project corpus by category (empty q returns nothing)
	let cats: string[] = [];
	try {
		const bad = await fetch(`${BASE}/api/projects/search?category=bogus`);
		cats =
			((await bad.json()) as { validCategories?: string[] }).validCategories ??
			[];
	} catch {}
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
	console.error(`frame: ${projects.length} projects`);

	// ── S1 PROSE⇄STRUCTURE divergence ──
	const s1: Array<{
		slug: string;
		field: string;
		prose: string;
		missing: string;
	}> = [];
	for (const p of projects) {
		const prose = norm(`${p.name} ${p.shortDescription ?? ""}`);
		if (!prose.trim()) continue;
		const nets = new Set((p.supportedNetworks ?? []).map(norm));
		for (const [word, tag] of Object.entries(CHAIN_WORDS)) {
			if (
				new RegExp(`\\b${word}\\b`).test(prose) &&
				nets.size &&
				!nets.has(tag) &&
				tag !== "stellar"
			)
				s1.push({
					slug: p.slug,
					field: "supportedNetworks",
					prose: word,
					missing: tag,
				});
		}
		const cov = (p.coverage?.countries ?? []).map(norm);
		for (const country of COUNTRY_WORDS) {
			if (
				prose.includes(country) &&
				(p.types ?? []).includes("Anchor") &&
				cov.length &&
				!cov.includes(country)
			)
				s1.push({
					slug: p.slug,
					field: "coverage.countries",
					prose: country,
					missing: country,
				});
		}
		const seps = new Set(
			(p.coverage?.seps ?? p.seps ?? []).map((s: string) =>
				norm(s).replace(/\s/g, "-"),
			),
		);
		for (const m of prose.matchAll(SEP_RE)) {
			const want = `sep-${m[1]}`;
			if (seps.size && !seps.has(want))
				s1.push({ slug: p.slug, field: "seps", prose: m[0], missing: want });
		}
	}
	report.s1_prose_structure_divergence = {
		count: s1.length,
		sample: s1.slice(0, 25),
	};

	// ── S2 FIELD-POPULATION census ──
	const FIELDS = [
		"shortDescription",
		"types",
		"supportedNetworks",
		"logoUrl",
		"tvlUSD",
	];
	const census: Record<
		string,
		Record<string, { total: number; populated: number }>
	> = {};
	for (const p of projects) {
		const cat = p.category ?? "?";
		census[cat] ??= {};
		for (const f of FIELDS) {
			census[cat][f] ??= { total: 0, populated: 0 };
			census[cat][f].total++;
			const v = p[f];
			const has = Array.isArray(v)
				? v.length > 0
				: v !== null && v !== undefined && v !== "";
			if (has) census[cat][f].populated++;
		}
	}
	const censusPct: Record<string, Record<string, string>> = {};
	for (const [cat, fields] of Object.entries(census)) {
		censusPct[cat] = {};
		for (const [f, c] of Object.entries(fields))
			censusPct[cat][f] =
				`${Math.round((c.populated / c.total) * 100)}% (${c.populated}/${c.total})`;
	}
	report.s2_field_population = censusPct;

	// ── S3 DUPLICATE detection (slug-normalization) ──
	const canon = (s: string) => norm(s).replace(/[^a-z0-9]/g, "");
	const byCanon = new Map<string, any[]>();
	for (const p of projects) {
		const k = canon(p.name);
		(byCanon.get(k) ?? byCanon.set(k, []).get(k))!.push(p);
	}
	const allGroups = [...byCanon.values()]
		.filter((g) => g.length > 1 && new Set(g.map((p) => p.slug)).size > 1)
		.map((g) =>
			g.map((p) => ({
				slug: p.slug,
				name: p.name,
				canonicalSlug: p.canonicalSlug ?? null,
				scfAwarded: p.scfAwarded,
			})),
		);
	// A group is RESOLVED once its lineage is recorded: every member but one
	// points canonicalSlug at a slug inside the group. Only unresolved groups
	// count toward the fix queue (else the tracker stays red on merged dupes).
	const isResolved = (g: (typeof allGroups)[number]) => {
		const slugs = new Set(g.map((p) => p.slug));
		const shadows = g.filter(
			(p) => p.canonicalSlug && slugs.has(p.canonicalSlug),
		);
		return shadows.length === g.length - 1;
	};
	const dupes = allGroups.filter((g) => !isResolved(g));
	report.s3_duplicates = {
		count: dupes.length,
		resolved: allGroups.length - dupes.length,
		groups: dupes,
	};

	// ── S3b DOMAIN-KEYED duplicates ──
	// Name normalization missed chainsatlas/chainatlas (different spellings).
	// The stronger identity key is the one every liveness verification used:
	// two records sharing a website apex ARE the same entity (class 21 in
	// reverse — the site is the identity). Shared-hosting apexes are skipped
	// (github.com etc. would group unrelated records).
	const SHARED_APEX = new Set([
		"github.com",
		"docs.google.com",
		"google.com",
		"twitter.com",
		"x.com",
		"medium.com",
		"notion.site",
		"notion.so",
		"vercel.app",
		"netlify.app",
		"communityfund.stellar.org",
		"stellar.org",
		"linktr.ee",
	]);
	const apexOf = (u: string | null | undefined): string | null => {
		if (!u) return null;
		try {
			const host = new URL(u).hostname.toLowerCase().replace(/^www\./, "");
			const parts = host.split(".");
			return parts.length > 2 ? parts.slice(-2).join(".") : host;
		} catch {
			return null;
		}
	};
	const byApex = new Map<string, any[]>();
	for (const p of projects) {
		if (p.canonicalSlug) continue; // lineage shadows already resolved
		const apex = apexOf(p.links?.website);
		if (!apex || SHARED_APEX.has(apex)) continue;
		(byApex.get(apex) ?? byApex.set(apex, []).get(apex))!.push(p);
	}
	const domainDupes = [...byApex.entries()]
		.filter(([, g]) => g.length > 1 && new Set(g.map((p) => p.slug)).size > 1)
		// only NEW findings: same-canon-name groups are S3's territory already
		.filter(([, g]) => new Set(g.map((p) => canon(p.name))).size > 1)
		.map(([apex, g]) => ({
			apex,
			records: g.map((p) => ({
				slug: p.slug,
				name: p.name,
				scfAwarded: p.scfAwarded,
			})),
		}));
	report.s3b_domain_duplicates = {
		count: domainDupes.length,
		groups: domainDupes.slice(0, 20),
	};

	// ── S4 STALENESS exposure ──
	const now = Date.now();
	const STALE_DAYS = 365;
	const stale = projects
		.filter((p) => p.status === "Live")
		.map((p) => {
			const dates = [p.lastActivityAt, p.tvlAsOf]
				.filter(Boolean)
				.map((d: string) => new Date(d).getTime());
			const newest = dates.length ? Math.max(...dates) : null;
			const ageDays = newest ? Math.round((now - newest) / 86_400_000) : null;
			return {
				slug: p.slug,
				name: p.name,
				ageDays,
				hasDated: newest !== null,
				tvlUSD: p.tvlUSD ?? null,
			};
		})
		.filter(
			(p) => !p.hasDated || (p.ageDays !== null && p.ageDays > STALE_DAYS),
		);
	report.s4_staleness = {
		liveNoDatedSignal: stale.filter((p) => !p.hasDated).length,
		liveStale365: stale.filter((p) => p.hasDated).length,
		sample: stale.slice(0, 20),
	};

	if (JSON_OUT) {
		console.log(JSON.stringify(report, null, 1));
	} else {
		console.log(
			`S1 prose⇄structure divergence: ${s1.length} rows (prose asserts a fact structured fields lack)`,
		);
		for (const d of s1.slice(0, 12))
			console.log(
				`   ${d.slug}: prose says '${d.prose}' but ${d.field} missing '${d.missing}'`,
			);
		console.log(`\nS2 field-population census (worst per field):`);
		for (const f of FIELDS) {
			const worst = Object.entries(census)
				.map(([cat, fields]) => [cat, fields[f]] as const)
				.filter(([, c]) => c && c.total >= 20)
				.sort(
					(a, b) => a[1].populated / a[1].total - b[1].populated / b[1].total,
				)[0];
			if (worst)
				console.log(
					`   ${f.padEnd(18)} worst: ${worst[0]} ${Math.round((worst[1].populated / worst[1].total) * 100)}%`,
				);
		}
		console.log(`\nS3 duplicate slug-normalization groups: ${dupes.length}`);
		for (const g of dupes.slice(0, 10))
			console.log(
				`   ${g.map((x: any) => x.slug).join(" ↔ ")} (canonical: ${g.map((x: any) => x.canonicalSlug).join("/")})`,
			);
		console.log(
			`\nS4 staleness: ${report.s4_staleness && (report.s4_staleness as any).liveNoDatedSignal} Live w/ NO dated signal, ${(report.s4_staleness as any).liveStale365} Live stale >365d`,
		);
	}
	process.exit(0);
}

main().catch((e) => {
	console.error("FATAL", e);
	process.exit(1);
});
