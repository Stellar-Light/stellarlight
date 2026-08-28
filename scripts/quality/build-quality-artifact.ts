/**
 * Build the /quality entity + findings artifact.
 *
 * The page's rule is "every number read from a committed artifact", so this
 * script does the measuring and commits the result. It answers the questions
 * a scoreboard of check-counts cannot: WHAT did we find, WHAT got fixed, and
 * WHICH rows/repos are actually weak.
 *
 *   pnpm exec tsx scripts/quality/build-quality-artifact.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const UA = { "User-Agent": "stellarlight-quality-artifact" };
const api = async <T>(path: string): Promise<T> =>
	(await (
		await fetch(`https://stellarlight.xyz${path}`, { headers: UA })
	).json()) as T;

// ── findings ledger: what we found, what closed, how old the rest is ──
type Finding = {
	id: string;
	source: string;
	surface: string;
	probe: string;
	failureMode: string;
	severity: string;
	firstSeen: string;
	lastSeen: string;
	clearedAt?: string | null;
	status: "open" | "cleared" | "verified";
};
const ledger = JSON.parse(
	readFileSync(
		join(process.cwd(), "improvements/ledger/findings.json"),
		"utf8",
	),
) as Finding[] | { findings: Finding[] };
const findings: Finding[] = Array.isArray(ledger) ? ledger : ledger.findings;

const byMode = new Map<
	string,
	{ open: number; cleared: number; surface: string }
>();
for (const f of findings) {
	const cur = byMode.get(f.failureMode) ?? {
		open: 0,
		cleared: 0,
		surface: f.surface,
	};
	if (f.status === "open") cur.open++;
	else cur.cleared++;
	byMode.set(f.failureMode, cur);
}
const DAY = 86400000;
const now = Date.now();
const ageBucket = (f: Finding) => {
	const d = (now - Date.parse(f.firstSeen)) / DAY;
	return d <= 7 ? "≤7d" : d <= 30 ? "8–30d" : d <= 60 ? "31–60d" : ">60d";
};
const openAges = new Map<string, number>();
for (const f of findings.filter((x) => x.status === "open"))
	openAges.set(ageBucket(f), (openAges.get(ageBucket(f)) ?? 0) + 1);

const recentlyCleared = findings
	.filter((f) => f.status !== "open" && f.clearedAt)
	.sort((a, b) => String(b.clearedAt).localeCompare(String(a.clearedAt)))
	.slice(0, 8)
	.map((f) => ({
		probe: f.probe,
		surface: f.surface,
		failureMode: f.failureMode,
		clearedAt: String(f.clearedAt).slice(0, 10),
	}));

// ── per-entity quality ──
type Project = {
	slug: string;
	name: string;
	status?: string;
	statusBasis?: string | null;
	statusAsOf?: string | null;
	statusSourceUrl?: string | null;
	types?: string[];
	audits?: unknown;
	repos?: unknown[];
	links?: { website?: string | null; github?: string | null };
	availability?: unknown[];
	prominence?: number;
};

/** Per-row quality = how much EVIDENCE stands behind what we publish about it.
 * Five equal components, each a fact we either hold or don't — no weighting
 * opinions, so a low score always reads as a specific missing thing. */
const BASIS_RANK: Record<string, number> = {
	"human-verified": 1,
	"onchain-activity": 0.9,
	"official-record": 0.9,
	"operator-announcement": 0.7,
	"site-liveness": 0.5,
	"source-inherited": 0.2,
	unverified: 0,
};
const projectQuality = (p: Project) => {
	const parts = {
		provenance: BASIS_RANK[p.statusBasis ?? "unverified"] ?? 0,
		dated: p.statusAsOf ? 1 : 0,
		sourced: p.statusSourceUrl ? 1 : 0,
		typed: (p.types?.length ?? 0) > 0 ? 1 : 0,
		linked: p.links?.website || p.links?.github ? 1 : 0,
	};
	const score = Math.round(
		(Object.values(parts).reduce((a, b) => a + b, 0) / 5) * 100,
	);
	const missing = Object.entries(parts)
		.filter(([, v]) => v === 0)
		.map(([k]) => k);
	return { score, missing };
};

const seen = new Map<string, Project>();
for (const q of [
	"stellar",
	"wallet",
	"defi",
	"payment",
	"soroban",
	"oracle",
	"exchange",
	"lending",
	"bridge",
	"anchor",
	"nft",
	"rwa",
]) {
	try {
		const d = await api<{ projects?: Project[] }>(
			`/api/projects/search?q=${q}&limit=100`,
		);
		for (const p of d.projects ?? []) if (p.slug) seen.set(p.slug, p);
	} catch {}
}
const projects = [...seen.values()].map((p) => ({
	slug: p.slug,
	name: p.name,
	status: p.status ?? null,
	statusBasis: p.statusBasis ?? null,
	prominence: typeof p.prominence === "number" ? p.prominence : 0,
	...projectQuality(p),
}));

const basisMix = new Map<string, number>();
for (const p of seen.values())
	basisMix.set(
		p.statusBasis ?? "unverified",
		(basisMix.get(p.statusBasis ?? "unverified") ?? 0) + 1,
	);

// ── repos ──
type Repo = {
	fullName: string;
	repoScore?: number;
	repoScoreLabel?: string | null;
	tier?: string | null;
	activityState?: string | null;
	stellarEvidence?: string | null;
	knowledgeNotes?: unknown[];
	codeVerified?: { codeDepth?: number; isDeployableContract?: boolean } | null;
	codeInUse?: { contracts?: number } | null;
};
const repoSeen = new Map<string, Repo>();
for (const q of [
	"soroban contract",
	"stellar sdk",
	"wallet",
	"oracle",
	"amm",
	"anchor",
]) {
	try {
		const d = await api<{ repos?: Repo[] }>(
			`/api/repos/search?q=${encodeURIComponent(q)}&limit=50`,
		);
		for (const r of d.repos ?? []) if (r.fullName) repoSeen.set(r.fullName, r);
	} catch {}
}
const repos = [...repoSeen.values()].map((r) => ({
	fullName: r.fullName,
	repoScore: r.repoScore ?? null,
	label: r.repoScoreLabel ?? null,
	tier: r.tier ?? null,
	activity: r.activityState ?? null,
	evidence: r.stellarEvidence ?? null,
	notes: Array.isArray(r.knowledgeNotes) ? r.knowledgeNotes.length : 0,
	codeDepth:
		typeof r.codeVerified?.codeDepth === "number"
			? Math.round(r.codeVerified.codeDepth * 100)
			: null,
	mainnetContracts: r.codeInUse?.contracts ?? 0,
}));

// Per-surface rollup: the shape a CONSUMER asks about — "how healthy is the
// surface I'm calling?" — rather than our internal detector names.
const SURFACE_MEANS: Record<string, string> = {
	retrieval: "search and ranking across projects, repos, research",
	directory: "the project rows themselves — fields, types, provenance",
	contract: "the OpenAPI contract and its generated artifacts",
	corpus: "indexed research/audit documents and their chunking",
	scf: "SCF round and award data",
	consumer: "questions real consumers asked that we answered weakly",
	code: "repo scanning, code depth, symbol extraction",
};
const bySurface = new Map<string, { open: number; cleared: number }>();
for (const f of findings) {
	const cur = bySurface.get(f.surface) ?? { open: 0, cleared: 0 };
	if (f.status === "open") cur.open++;
	else cur.cleared++;
	bySurface.set(f.surface, cur);
}

const out = {
	generatedAt: new Date().toISOString(),
	surfaces: [...bySurface.entries()]
		.map(([surface, v]) => ({
			surface,
			means: SURFACE_MEANS[surface] ?? null,
			openFindings: v.open,
			clearedFindings: v.cleared,
		}))
		.sort((a, b) => b.openFindings - a.openFindings),
	findings: {
		total: findings.length,
		open: findings.filter((f) => f.status === "open").length,
		cleared: findings.filter((f) => f.status === "cleared").length,
		verified: findings.filter((f) => f.status === "verified").length,
		byFailureMode: [...byMode.entries()]
			.map(([mode, v]) => ({ mode, ...v }))
			.sort((a, b) => b.open + b.cleared - (a.open + a.cleared)),
		openByAge: ["≤7d", "8–30d", "31–60d", ">60d"].map((b) => ({
			bucket: b,
			count: openAges.get(b) ?? 0,
		})),
		recentlyCleared,
	},
	projects: {
		sampled: projects.length,
		meanScore: Math.round(
			projects.reduce((a, p) => a + p.score, 0) / Math.max(projects.length, 1),
		),
		basisMix: [...basisMix.entries()]
			.map(([basis, count]) => ({ basis, count }))
			.sort((a, b) => b.count - a.count),
		/** the gap queue: prominent rows with the weakest evidence */
		weakest: projects
			.filter((p) => p.score < 100)
			.sort((a, b) => a.score - b.score || b.prominence - a.prominence)
			.slice(0, 60),
		missingCounts: ["provenance", "dated", "sourced", "typed", "linked"].map(
			(k) => ({
				field: k,
				count: projects.filter((p) => p.missing.includes(k)).length,
			}),
		),
	},
	repos: {
		sampled: repos.length,
		withCodeDepth: repos.filter((r) => r.codeDepth != null).length,
		withNotes: repos.filter((r) => r.notes > 0).length,
		withMainnet: repos.filter((r) => r.mainnetContracts > 0).length,
		top: repos
			.filter((r) => r.repoScore != null)
			.sort((a, b) => (b.repoScore ?? 0) - (a.repoScore ?? 0))
			.slice(0, 40),
		/** the repo gap queue: indexed but thinly evidenced */
		thinnest: repos
			.filter((r) => r.notes === 0 || r.codeDepth == null)
			.sort((a, b) => (a.repoScore ?? 0) - (b.repoScore ?? 0))
			.slice(0, 40),
	},
};

/** Honest self-report, derived from the numbers above — the thing a calling
 * agent should weigh BEFORE trusting a result. Each entry states the limit,
 * the measurement behind it, and what to do instead. Never hand-written
 * copy: if the number improves, the sentence changes or disappears. */
const weakBasis =
	(out.projects.basisMix.find((b) => b.basis === "site-liveness")?.count ?? 0) +
	(out.projects.basisMix.find((b) => b.basis === "source-inherited")?.count ??
		0);
const limitations: Array<{
	area: string;
	limit: string;
	measurement: string;
	instead: string;
}> = [];
if (weakBasis / Math.max(out.projects.sampled, 1) > 0.5)
	limitations.push({
		area: "project status",
		limit:
			"Most lifecycle statuses rest on the weakest honest bases: a page answered (site-liveness) or a value inherited from a source (source-inherited).",
		measurement: `${weakBasis} of ${out.projects.sampled} sampled rows`,
		instead:
			"Weigh statusBasis and statusAsOf on every row; treat human-verified and onchain-activity as the strong tiers, and verify a Live claim against the row's statusSourceUrl before repeating it.",
	});
const untyped =
	out.projects.missingCounts.find((m) => m.field === "typed")?.count ?? 0;
if (untyped > 0)
	limitations.push({
		area: "project types",
		limit:
			"Some rows carry no type, so an exact ?type= enumeration cannot see them even when the project belongs to that vertical.",
		measurement: `${untyped} of ${out.projects.sampled} sampled rows untyped`,
		instead:
			"For discovery, combine ?type= with a q= search; an empty typed result is a statement about our tagging, not about the ecosystem.",
	});
if (out.repos.withNotes < out.repos.sampled / 2)
	limitations.push({
		area: "repo knowledge notes",
		limit:
			"Curated, dated repo facts (knowledgeNotes) exist on a minority of indexed repositories.",
		measurement: `${out.repos.withNotes} of ${out.repos.sampled} sampled repos`,
		instead:
			"Absence of notes is absence of curation, never evidence about the repo; fall back to codeVerified and activity fields.",
	});
const recallOpen =
	out.findings.byFailureMode.find((m) => m.mode === "recall-miss")?.open ?? 0;
if (recallOpen > 0)
	limitations.push({
		area: "known-item recall",
		limit:
			"Open recall findings: specific named entities that our own generated probes do not return in the top 3.",
		measurement: `${recallOpen} open recall-miss findings`,
		instead:
			"For a known name, prefer an exact slug or /api/projects/resolve over a natural-language search, and read meta.matchMode before treating rows as an answer.",
	});
(out as Record<string, unknown>).knownLimitations = limitations;

/** THE GAP MATRIX — one row per (entity × field) hole, with the count, the
 * denominator, why it matters to a caller, what closes it, and real examples
 * so the work is pickup-able. This is the actionable half of the report:
 * knownLimitations says "be careful", the matrix says "here is the list". */
const strongBases = new Set([
	"human-verified",
	"onchain-activity",
	"official-record",
]);
const weakBasisRows = [...seen.values()].filter(
	(p) => !strongBases.has(p.statusBasis ?? "unverified"),
);
const missing = (field: string) =>
	projects.filter((p) => p.missing.includes(field));
const sample = <T>(rows: T[], pick: (r: T) => string) =>
	rows.slice(0, 12).map(pick);

(out as Record<string, unknown>).gapMatrix = {
	definition:
		"One row per (entity type × missing field). count/of is a SAMPLE with its denominator, not a census. examples are real identifiers so the gap can be worked or independently checked.",
	rows: [
		{
			entity: "project",
			field: "statusSourceUrl",
			missing: missing("sourced").length,
			of: projects.length,
			whyItMatters:
				"A lifecycle claim with no source cannot be re-checked by a caller — it is our assertion, not evidence.",
			closedBy:
				"Curate a dated source URL, or downgrade the basis to match the evidence we actually have.",
			examples: sample(
				missing("sourced").sort((a, b) => b.prominence - a.prominence),
				(p) => p.slug,
			),
		},
		{
			entity: "project",
			field: "types",
			missing: missing("typed").length,
			of: projects.length,
			whyItMatters:
				"An untyped row is invisible to exact ?type= enumeration and to the gaps axis, even when it belongs to that vertical.",
			closedBy:
				"Add the type via the curation TYPE_ADD pass, with the row's own description as evidence.",
			examples: sample(
				missing("typed").sort((a, b) => b.prominence - a.prominence),
				(p) => p.slug,
			),
		},
		{
			entity: "project",
			field: "strong status basis",
			missing: weakBasisRows.length,
			of: projects.length,
			whyItMatters:
				"site-liveness means only that a page answered; source-inherited means the value came from elsewhere. Neither is observation of the product.",
			closedBy:
				"Human verification with a receipt, an on-chain activity reading, or an operator announcement.",
			examples: sample(
				weakBasisRows
					.filter((p) => (p.prominence ?? 0) >= 70)
					.sort((a, b) => (b.prominence ?? 0) - (a.prominence ?? 0)),
				(p) => p.slug,
			),
		},
		{
			entity: "repo",
			field: "knowledgeNotes",
			missing: repos.filter((r) => r.notes === 0).length,
			of: repos.length,
			whyItMatters:
				"Curated dated facts are what let an agent cite a repo claim; without them only raw scan fields are available.",
			closedBy:
				"The repo-intel enrich pass, which writes dated notes with sources.",
			examples: sample(
				repos.filter((r) => r.notes === 0 && (r.repoScore ?? 0) >= 60),
				(r) => r.fullName,
			),
		},
		{
			entity: "repo",
			field: "mainnet contract join",
			missing: repos.filter((r) => r.mainnetContracts === 0).length,
			of: repos.length,
			whyItMatters:
				"Without a verified contract join we can say code exists, never that it is USED on mainnet.",
			closedBy:
				"Contract attribution during the scan wave; absence is absence of a join, never proof of disuse.",
			examples: sample(
				repos.filter(
					(r) => r.mainnetContracts === 0 && (r.repoScore ?? 0) >= 70,
				),
				(r) => r.fullName,
			),
		},
		{
			entity: "repo",
			field: "code depth reading",
			missing: repos.filter((r) => r.codeDepth == null).length,
			of: repos.length,
			whyItMatters:
				"No depth reading means the repo was never scanned for real implementation signal.",
			closedBy: "A scan wave pass over the unscanned tail.",
			examples: sample(
				repos.filter((r) => r.codeDepth == null),
				(r) => r.fullName,
			),
		},
	].sort((a, b) => b.missing / b.of - a.missing / a.of),
};

writeFileSync(
	join(process.cwd(), "improvements/quality/entities.json"),
	`${JSON.stringify(out, null, 1)}\n`,
);
console.log(
	`entities.json: ${out.projects.sampled} projects (mean ${out.projects.meanScore}) · ${out.repos.sampled} repos · ${out.findings.open} open findings`,
);
