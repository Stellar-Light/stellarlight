/**
 * Tag-mismatch wave — REPORT ONLY (the tagging counterpart to
 * report-liveness.ts; Engine B S5 / boxy 2026-07-15).
 *
 *   pnpm exec tsx scripts/report-tag-mismatch.ts [--json]
 *
 * Where report-liveness surfaces LIKELY-DEAD projects for verification, this
 * surfaces LIKELY-MISTAGGED ones: a record whose own description names a
 * PRIMARY product function that its `types` field doesn't carry (the Templar-
 * as-Bridge / Pyth-as-Bridge / Vanna-as-Bridge class). NEVER writes — a
 * heuristic flag is a candidate, not a verdict. The verdict comes from the
 * `directory-quality-verify` workflow (agent web-check of each candidate), then
 * curation via TYPES_SET in curate-projects.ts. Precision comes from that
 * verify step, so this detector casts a reasonable (not reckless) net.
 *
 * API-driven (public endpoints only) — no DB credentials, run anywhere.
 */

const BASE = (process.env.BASE_URL || "https://stellarlight.xyz").replace(
	/\/$/,
	"",
);
const JSON_OUT = process.argv.includes("--json");

// Strong description→type signals. Each is a PRIMARY-function phrase (not a
// passing mention — "uses a stablecoin" must NOT imply the Stablecoin type).
// Keyed by the canonical `types` value the phrase implies.
const SIGNALS: Array<{ type: string; re: RegExp }> = [
	{
		type: "Lending",
		re: /\b(lending protocol|borrow(?:ing)? (?:against|dollars|usdc)|collateraliz|money market|credit (?:protocol|infrastructure)|undercollateralized)\b/i,
	},
	{
		type: "DEX",
		re: /\b(decentralized exchange|order ?book|automated market maker|\bamm\b|liquidity pool|spot trading venue|perpetual(?:s| exchange))\b/i,
	},
	{
		type: "Wallet",
		re: /\b(non-custodial wallet|self-custod\w+ wallet|mobile wallet|browser-extension wallet|hardware wallet)\b/i,
	},
	{
		type: "Bridge",
		re: /\b(cross-chain bridge|bridge assets|asset bridge|token bridge|interoperability bridge)\b/i,
	},
	{
		type: "Payments",
		re: /\b(payments? (?:platform|network|app|rail|orchestration)|remittances?|money transfer|point[- ]of[- ]sale|payroll)\b/i,
	},
	{
		type: "Stablecoin",
		re: /\b(issues? a stablecoin|stablecoin issuer|our stablecoin|mints? (?:a )?stablecoin)\b/i,
	},
	{
		type: "Anchor",
		re: /\b(sep-?(?:6|24|31)|fiat on\/?off[- ]?ramp|on-?ramp and off-?ramp|anchor (?:for|on) stellar)\b/i,
	},
	{
		type: "NFT",
		re: /\b(nft (?:marketplace|platform|collection)|non-fungible token)\b/i,
	},
	{
		type: "Gaming",
		re: /\b(game (?:studio|server|engine)|play-to-earn|gaming platform)\b/i,
	},
	{
		type: "SDK",
		re: /\b(sdk|developer (?:kit|library)|client library|connect kit)\b/i,
	},
	{
		type: "Analytics",
		re: /\b(analytics (?:platform|dashboard|terminal)|on-chain (?:data|analytics)|block explorer|charting)\b/i,
	},
	{
		type: "Infrastructure",
		re: /\b(price (?:feed|oracle)|oracle network|rpc (?:provider|node)|indexer|infrastructure (?:provider|framework)|node (?:provider|infrastructure))\b/i,
	},
];

// Aggregators / routing layers we DELIBERATELY type Bridge (sls-035): their
// corridor capability is the user-meaningful point. Never flag these.
const TYPE_LOCKED = new Set([
	"rubic",
	"rango",
	"houdiniswap",
	"wowmax",
	"estrela",
]);

async function j(path: string): Promise<any> {
	const res = await fetch(`${BASE}${path}`, {
		headers: { "User-Agent": "stellarlight-tag-mismatch-report" },
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

async function main() {
	console.error(`Tag-mismatch report → ${BASE}`);
	let cats: string[] = [];
	try {
		const bad = await fetch(`${BASE}/api/projects/search?category=bogus`);
		cats =
			((await bad.json()) as { validCategories?: string[] }).validCategories ??
			[];
	} catch {}
	const bySlug = new Map<string, any>();
	for (const c of cats)
		for (const p of await pageAll(
			`/api/projects/search?category=${encodeURIComponent(c)}`,
		))
			bySlug.set(p.slug, p);
	const projects = [...bySlug.values()].filter((p) => !p.canonicalSlug);
	console.error(`frame: ${projects.length} distinct projects`);

	const flagged: Array<{
		slug: string;
		name: string;
		status: string;
		currentTypes: string[];
		impliedTypes: string[];
		missing: string[];
		website: string | null;
		desc: string;
	}> = [];

	for (const p of projects) {
		if (TYPE_LOCKED.has(p.slug)) continue;
		const desc = String(p.shortDescription || p.description || "");
		if (desc.length < 20) continue;
		const types: string[] = Array.isArray(p.types) ? p.types : [];
		const implied = SIGNALS.filter((s) => s.re.test(desc)).map((s) => s.type);
		const impliedSet = [...new Set(implied)];
		// MISSING = a primary function the description states that types omits.
		const missing = impliedSet.filter((t) => !types.includes(t));
		// Only flag when: the record IS typed (an empty-types record is a
		// different, "untyped" problem), and at least one implied primary type is
		// absent. Oracles are a known [] convention — skip a lone Infrastructure
		// miss on an already-Infrastructure-category record.
		if (!types.length || !missing.length) continue;
		if (
			missing.length === 1 &&
			missing[0] === "Infrastructure" &&
			p.category === "Infrastructure"
		)
			continue;
		flagged.push({
			slug: p.slug,
			name: p.name,
			status: p.status,
			currentTypes: types,
			impliedTypes: impliedSet,
			missing,
			website: p.links?.website ?? null,
			desc: desc.slice(0, 140),
		});
	}

	// Rank: a record whose CURRENT types share nothing with the implied set is
	// the strongest mismatch (Templar: Bridge vs Lending). Records that merely
	// LACK a secondary type rank lower.
	flagged.sort((a, b) => {
		const aOverlap = a.currentTypes.some((t) => a.impliedTypes.includes(t));
		const bOverlap = b.currentTypes.some((t) => b.impliedTypes.includes(t));
		if (aOverlap !== bOverlap) return aOverlap ? 1 : -1; // no-overlap first
		return b.missing.length - a.missing.length;
	});

	if (JSON_OUT) {
		console.log(
			JSON.stringify({ base: BASE, count: flagged.length, flagged }, null, 2),
		);
		return;
	}
	console.error(
		`\n${flagged.length} tag-mismatch candidate(s) (verify before curating):\n`,
	);
	for (const f of flagged) {
		const strong = !f.currentTypes.some((t) => f.impliedTypes.includes(t));
		console.log(
			`  ${strong ? "‼ " : "· "}${f.slug.padEnd(26)} [${f.currentTypes.join(",")}] → +[${f.missing.join(",")}]  (${f.status})`,
		);
		if (strong) console.log(`      "${f.desc}"`);
	}
}

main().catch((e) => {
	console.error("FATAL:", e);
	process.exit(1);
});
