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

const out = {
	generatedAt: new Date().toISOString(),
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
			.slice(0, 12),
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
			.slice(0, 10),
	},
};
writeFileSync(
	join(process.cwd(), "improvements/quality/entities.json"),
	`${JSON.stringify(out, null, 1)}\n`,
);
console.log(
	`entities.json: ${out.projects.sampled} projects (mean ${out.projects.meanScore}) · ${out.repos.sampled} repos · ${out.findings.open} open findings`,
);
