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
import {
	type Finding,
	MAINTENANCE_MODES,
	summarizeLedger,
} from "../../src/lib/improvement-ledger";
import { REPO_KNOWLEDGE_NOTES } from "../../src/lib/repo-knowledge";
import { censusProjects, censusRepos, FRAME_METHOD } from "./sample-frame";

const UA = { "User-Agent": "stellarlight-quality-artifact" };
const api = async <T>(path: string): Promise<T> =>
	(await (
		await fetch(`https://stellarlight.xyz${path}`, { headers: UA })
	).json()) as T;

// ── findings ledger: what we found, what closed, how old the rest is ──
const ledger = JSON.parse(
	readFileSync(
		join(process.cwd(), "improvements/ledger/findings.json"),
		"utf8",
	),
) as Finding[] | { findings: Finding[] };
const findings: Finding[] = Array.isArray(ledger) ? ledger : ledger.findings;

// cleared and verified are NEVER folded together. Two eval lanes independently
// found byFailureMode summing to 359 cleared while findings.cleared said 352,
// the difference being exactly the 7 verified rows, counted as cleared here and
// as their own state there. The three states partition the ledger exactly once.
const byMode = new Map<
	string,
	{
		open: number;
		refresh: number;
		blocked: number;
		cleared: number;
		verified: number;
		surface: string;
	}
>();
for (const f of findings) {
	const cur = byMode.get(f.failureMode) ?? {
		open: 0,
		refresh: 0,
		blocked: 0,
		cleared: 0,
		verified: 0,
		surface: f.surface,
	};
	// The refresh queue (note-stale) is open but not a defect; it must not
	// surface as an open finding while findings.open excludes it — the
	// 2026-09-05 audit found code.openFindings = 1 beside ledger code.open = 0.
	if (f.status === "open" && f.blockedOn) cur.blocked++;
	else if (f.status === "open" && MAINTENANCE_MODES.has(f.failureMode))
		cur.refresh++;
	else if (f.status === "open") cur.open++;
	else if (f.status === "verified") cur.verified++;
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
// Same predicate as findings.open: the refresh queue is not a defect and
// must not age as one — the 2026-09-05 audit found openByAge summing to 6
// beside open = 5, one artifact disagreeing with itself.
for (const f of findings.filter(
	(x) =>
		x.status === "open" &&
		!MAINTENANCE_MODES.has(x.failureMode) &&
		!x.blockedOn,
))
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

// ── the closure rule's metric (QUALITY.md §1): repeat-class rate ──
// Detectors stamp a detector-specific failureMode; the §0 classes are
// DERIVED here through a total, reviewable map instead of migrating labels
// onto 460 historical rows. A finding is a REPEAT when any earlier finding
// (by firstSeen) already carried its class — the weekly déjà vu the closure
// rule exists to end. The lifetime rate can only ratchet toward 100% as the
// ledger grows, so the number that steers is the trailing-30d rate over
// newly-first-seen findings; steady state is that rate at zero (new findings
// only ever open NEW classes).
const CLASS_OF: Record<string, string> = {
	// §0.1 identity — a name/question should find its thing
	"recall-miss": "identity",
	"routing-miss": "identity",
	"demand-routing-miss": "identity",
	"golden-fail": "identity",
	// §0.3 evidence population — the field exists, rows are empty
	"missing-field": "evidence-population",
	"population-miss": "evidence-population",
	// nightly record-completeness residuals (S1 scfRoundAwards / S2 statusBasis
	// sweeps): promised official-record fields empty on specific rows — the
	// same class as the population misses above, found by a different sweep.
	"completeness-residual": "evidence-population",
	// §0.4 taxonomy coverage — a demanded vertical that is invisible
	"demand-miss": "taxonomy-coverage",
	"coverage-gap": "taxonomy-coverage",
	// §0.5 contract completeness — spec and live surface disagree
	"api-drift": "contract-completeness",
	"ambiguous-contract": "contract-completeness",
	// nightly-claims failures are contract-surface: a published claim the live
	// surface will not support.
	"claim-blocker": "contract-completeness",
	// §0.6 cross-surface consistency — our answer vs the official record
	"scf-round-overclaim": "cross-surface-consistency",
	// A knowledge note that was true on its asOf date while the registry has
	// moved since is our record disagreeing with the upstream official one —
	// the same class, found by the nightly note-freshness sweep.
	"note-stale": "cross-surface-consistency",
	// findings about our EVAL machinery, not the product; §0 says six
	// classes cover NEARLY everything — this is the honest remainder.
	// A URL a probe PROVED dead: our record cites something the upstream world
	// no longer serves — the same disagreement as a stale note, found by the
	// daily link checker instead of the nightly sweep.
	"broken-link": "cross-surface-consistency",
	"battery-coverage-weak": "meta-eval",
	"consumer-code-shallow": "meta-eval",
};
const classOf = (f: Finding) => CLASS_OF[f.failureMode] ?? "unclassified";
{
	const unmapped = new Set(
		findings.map((f) => f.failureMode).filter((m) => !(m in CLASS_OF)),
	);
	if (unmapped.size)
		console.warn(
			`⚠ unclassified failureModes (extend CLASS_OF): ${[...unmapped].join(", ")}`,
		);
}
const repeatIds = new Set<string>();
const classAgg = new Map<
	string,
	{ total: number; open: number; firstSeen: string }
>();
for (const f of [...findings].sort((a, b) =>
	a.firstSeen.localeCompare(b.firstSeen),
)) {
	const c = classOf(f);
	const cur = classAgg.get(c);
	if (cur) {
		repeatIds.add(f.id);
		cur.total++;
		if (f.status === "open") cur.open++;
	} else {
		classAgg.set(c, {
			total: 1,
			open: f.status === "open" ? 1 : 0,
			firstSeen: f.firstSeen.slice(0, 10),
		});
	}
}
// The ledger's own numbers, so page / API / weekly row cannot disagree about
// what "closed" means. closingRate here counts verified + re-probed only.
const ledgerSummary = summarizeLedger(findings, now);

const closureWindow = (days: number) => {
	const cutoff = new Date(now - days * DAY).toISOString();
	const fresh = findings.filter((f) => f.firstSeen >= cutoff);
	const repeats = fresh.filter((f) => repeatIds.has(f.id)).length;
	return {
		newFindings: fresh.length,
		repeats,
		ratePct: fresh.length
			? Math.round((repeats / fresh.length) * 1000) / 10
			: 0,
	};
};

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
	deployment?: { network?: string | null; basis?: string | null } | null;
	onchain?: {
		assetCode?: string | null;
		contracts?: unknown[] | null;
	} | null;
};

/** Per-row quality = how much EVIDENCE stands behind what we publish about it.
 * Five equal components, each a fact we either hold or don't, no weighting
 * opinions, so a low score always reads as a specific missing thing. */
// ONE definition of a strong basis, used by every count in this file. Two
// eval lanes independently found 544 vs 550 for "rows on a weak basis"
// because two call sites disagreed about operator-announcement and
// unverified. Membership is now explicit and shared.
// Deployment is a meaningful question only for products whose value IS
// on-chain (the same list the deployment-evidence gap row pools on). For an
// SDK, a wallet, a security firm or an analytics site, "unknown" is the
// correct answer, not a gap.
const ONCHAIN_PRODUCT_TYPES = [
	"DEX",
	"DeFi",
	"Lending",
	"Derivatives",
	"Oracle",
	"Bridge",
	"Stablecoin",
	"RWA",
];
// "Strong" means the row cites DATED evidence someone else can re-check, as
// opposed to site-liveness (a page answered — a parked domain passes that) or
// source-inherited (another list said so). Every basis here carries a
// statusAsOf and a statusSourceUrl that opens.
//
// product-integration and repo-activity were added to the enum on 2026-09-04
// and NOT added here, so 173 rows earned dated evidence while the headline
// moved by four and the board read as though nothing had happened. A metric
// that silently ignores a new evidence tier is worse than no metric: it
// reports the work as not done.
// NOT here: "official-record". It is a value of scf.basis (award facts parsed
// from the SCF submission cards), never a statusBasis option, and it sat on
// this list serving 0 forever — the board's own definition named a tier no
// row could hold while omitting two tiers rows do hold (found by a lane agent
// on 2026-09-05; lesson 1: an enum and every aggregator that classifies it).
const STRONG_BASES = [
	"human-verified",
	"onchain-activity",
	// the live product itself was observed referencing Stellar infrastructure
	"product-integration",
	// the project's own repo committed inside a dated window — awarded only to
	// library/SDK rows, where the source moving IS the product being alive
	"repo-activity",
] as const;
const isStrongBasis = (b: string | null | undefined) =>
	!!b && (STRONG_BASES as readonly string[]).includes(b);
const projectQuality = (p: Project) => {
	// FIVE BINARY FACTS. Previously provenance contributed a fraction, so
	// published scores (64, 70) were unreachable under the published
	// definition "the share of five facts present" - the definition was a
	// lie and the mean was flattering. Every fact is now present-or-absent,
	// scores land on multiples of 20, and the definition is checkable.
	const parts: Record<string, 0 | 1> = {
		strongBasis: isStrongBasis(p.statusBasis) ? 1 : 0,
		dated: p.statusAsOf ? 1 : 0,
		sourced: p.statusSourceUrl ? 1 : 0,
		typed: (p.types?.length ?? 0) > 0 ? 1 : 0,
		linked: p.links?.website || p.links?.github ? 1 : 0,
	};
	const present = Object.values(parts).reduce<number>((a, b) => a + b, 0);
	return {
		score: present * 20,
		factsPresent: present,
		factsTotal: 5,
		missing: Object.entries(parts)
			.filter(([, v]) => v === 0)
			.map(([k]) => k),
	};
};

const { rows: censusRows, total: projectPopulation } = await censusProjects();
// The row-quality census mirrors the SERVING population: every public
// surface excludes Draft rows and folded lineage shadows (canonicalSlug
// set), so counting them here filled the weakest-rows queue with rows no
// consumer can ever hit - the 2026-08-28 triage found the 40%-score queue
// was mostly no-basis duplicates and drafts. servedPopulation is published
// beside the raw total so the exclusion is visible, never silent.
const servedRows = censusRows.filter(
	(p) =>
		p.slug &&
		p.status !== "Draft" &&
		!(p as { canonicalSlug?: string | null }).canonicalSlug,
);
const seen = new Map<string, Project>();
for (const p of servedRows) seen.set(String(p.slug), p as unknown as Project);

const projects = [...seen.values()].map((p) => ({
	slug: p.slug,
	name: p.name,
	status: p.status ?? null,
	statusBasis: p.statusBasis ?? null,
	prominence: typeof p.prominence === "number" ? p.prominence : 0,
	deploymentNetwork: p.deployment?.network ?? "unknown",
	deploymentBasis: p.deployment?.basis ?? null,
	hasOnchainFootprint:
		!!p.onchain?.assetCode ||
		(Array.isArray(p.onchain?.contracts) && p.onchain.contracts.length > 0) ||
		p.deployment?.network === "mainnet" ||
		p.deployment?.network === "testnet",
	deploymentApplies: (p.types ?? []).some((t) =>
		ONCHAIN_PRODUCT_TYPES.includes(t),
	),
	types: p.types ?? [],
	...projectQuality(p),
}));

const basisMix = new Map<string, number>();
for (const p of seen.values())
	basisMix.set(
		p.statusBasis ?? "unverified",
		(basisMix.get(p.statusBasis ?? "unverified") ?? 0) + 1,
	);

// ── repos ──
// Field names here are the RAW collection's, which differ from the search
// API's serialization: raw carries `codeDepth` as a top-level 0-1 float where
// search nests it under `codeVerified`, and raw has no `activityState` or
// `repoScoreLabel` at all (both are derived in the search route). Reading raw
// means deriving activity ourselves rather than reporting null for every row.
type Repo = {
	fullName: string;
	repoScore?: number;
	tier?: string | null;
	source?: string | null;
	knowledgeNotes?: unknown[];
	codeDepth?: number | null;
	mainnetContractId?: string | null;
	isDeployableContract?: boolean | null;
	lastCommitAt?: string | null;
	isArchived?: boolean;
	primaryLanguage?: string | null;
	projectSlug?: string | null;
};
const { rows: repoCensusRows, total: repoPopulation } = await censusRepos();
const repoSeen = new Map<string, Repo>();
for (const r of repoCensusRows)
	if (r.fullName) repoSeen.set(r.fullName, r as unknown as Repo);
// The census reads every ROW; the map holds every distinct repo. The gap is
// duplicate rows for the same fullName, up to 20 copies of one repo. That is a
// real storage defect, and the old 6-search-term sample could not see it at
// all, so it is published rather than quietly collapsed.
const repoDuplicateRows = repoCensusRows.length - repoSeen.size;

/** null when we have no commit date at all: not knowing is its own state and
 * must not collapse into "dormant". */
const activityOf = (r: Repo): string | null => {
	if (r.isArchived) return "archived";
	if (!r.lastCommitAt) return null;
	const days = (now - Date.parse(r.lastCommitAt)) / DAY;
	if (!Number.isFinite(days)) return null;
	return days <= 90 ? "active" : days <= 365 ? "slowing" : "dormant";
};

/** Registry entry exists and carries ONLY internal notes (a triage verdict). */
const triagedOnly = (r: { fullName: string }) => {
	const notes = REPO_KNOWLEDGE_NOTES[r.fullName.toLowerCase()];
	return (
		Array.isArray(notes) &&
		notes.length > 0 &&
		notes.every((n) => n.visibility === "internal")
	);
};
const repos = [...repoSeen.values()].map((r) => ({
	fullName: r.fullName,
	repoScore: r.repoScore ?? null,
	tier: r.tier ?? null,
	source: r.source ?? null,
	activity: activityOf(r),
	language: r.primaryLanguage ?? null,
	projectSlug: r.projectSlug ?? null,
	notes: Array.isArray(r.knowledgeNotes) ? r.knowledgeNotes.length : 0,
	codeDepth:
		typeof r.codeDepth === "number" ? Math.round(r.codeDepth * 100) : null,
	// The RAW collection's join field. Reading the search API's serialized
	// name (codeInUse.contracts) against raw rows returned 2 where the truth
	// was 76 — the exact raw-vs-serialized trap this repo has hit before.
	deployable: r.isDeployableContract === true,
	mainnetJoined: !!r.mainnetContractId,
}));

// Per-surface rollup: the shape a CONSUMER asks about, "how healthy is the
// surface I'm calling?", rather than our internal detector names.
const SURFACE_MEANS: Record<string, string> = {
	retrieval: "search and ranking across projects, repos, research",
	directory: "the project rows themselves, fields, types, provenance",
	contract: "the OpenAPI contract and its generated artifacts",
	corpus: "indexed research/audit documents and their chunking",
	scf: "SCF round and award data",
	consumer: "questions real consumers asked that we answered weakly",
	code: "repo scanning, code depth, symbol extraction",
};
// cleared and verified are NEVER folded together. Two eval lanes independently
// found byFailureMode summing to 359 cleared while findings.cleared said 352,
// the difference being exactly the 7 verified rows, counted as cleared here and
// as their own state there. The three states partition the ledger exactly once.
const bySurface = new Map<
	string,
	{
		open: number;
		refresh: number;
		blocked: number;
		cleared: number;
		verified: number;
	}
>();
for (const f of findings) {
	const cur = bySurface.get(f.surface) ?? {
		open: 0,
		refresh: 0,
		blocked: 0,
		cleared: 0,
		verified: 0,
	};
	// The refresh queue (note-stale) is open but not a defect; it must not
	// surface as an open finding while findings.open excludes it — the
	// 2026-09-05 audit found code.openFindings = 1 beside ledger code.open = 0.
	if (f.status === "open" && f.blockedOn) cur.blocked++;
	else if (f.status === "open" && MAINTENANCE_MODES.has(f.failureMode))
		cur.refresh++;
	else if (f.status === "open") cur.open++;
	else if (f.status === "verified") cur.verified++;
	else cur.cleared++;
	bySurface.set(f.surface, cur);
}
const surfaceMass = (k: string) => {
	const v = bySurface.get(k);
	return (v?.open ?? 0) + (v?.cleared ?? 0) + (v?.verified ?? 0);
};

const out = {
	generatedAt: new Date().toISOString(),
	surfaces: [...bySurface.entries()]
		.map(([surface, v]) => ({
			surface,
			means: SURFACE_MEANS[surface] ?? null,
			openFindings: v.open,
			clearedFindings: v.cleared,
			verifiedFindings: v.verified,
		}))
		.sort((a, b) => b.openFindings - a.openFindings),
	findings: {
		/** open + cleared + verified = total, with no double counting.
		 * "cleared" means a detector stopped reproducing it. That is NOT
		 * confirmation the fix works. "verified" means it was deliberately
		 * re-probed after the fix and the probe passed. */
		states:
			"open + refreshQueue + blockedUpstream + cleared + verified = total, disjoint. `open` is the DEFECT backlog we can act on here; `refreshQueue` is open rows that are a refresh rather than a fix (a curated note citing a version upstream has since bumped — true on its asOf date, so not a defect); `blockedUpstream` is open rows an upstream consumer decides (Raven has not re-read our text, or its scorer decides regardless of our text) — carried and re-classified every run, never folded into `open` and never dropped. Kept apart so `open` means work.",
		total: findings.length,
		open: findings.filter(
			(f) =>
				f.status === "open" &&
				!MAINTENANCE_MODES.has(f.failureMode) &&
				!f.blockedOn,
		).length,
		refreshQueue: findings.filter(
			(f) => f.status === "open" && MAINTENANCE_MODES.has(f.failureMode),
		).length,
		blockedUpstream: findings.filter(
			(f) => f.status === "open" && !!f.blockedOn,
		).length,
		blockedBy: Object.fromEntries(
			[
				...new Set(
					findings
						.filter((f) => f.status === "open" && f.blockedOn)
						.map((f) => f.blockedOn as string),
				),
			]
				.sort()
				.map((b) => [
					b,
					findings.filter((f) => f.status === "open" && f.blockedOn === b)
						.length,
				]),
		),
		cleared: findings.filter((f) => f.status === "cleared").length,
		verified: findings.filter((f) => f.status === "verified").length,
		byFailureMode: [...byMode.entries()]
			.map(([mode, v]) => ({ mode, ...v }))
			.sort(
				(a, b) =>
					b.open + b.cleared + b.verified - (a.open + a.cleared + a.verified),
			),
		openByAge: ["≤7d", "8–30d", "31–60d", ">60d"].map((b) => ({
			bucket: b,
			count: openAges.get(b) ?? 0,
		})),
		recentlyCleared,
		/** QUALITY.md §1's "metric that matters", stated honestly.
		 *
		 * `classRecurrence` used to BE this block and used to be the headline.
		 * It counts a new finding as a repeat when its §0 class already had any
		 * prior finding — with 8 broad classes over 500+ findings that is pinned
		 * near 100% and cannot fall no matter how much repair lands, so it is
		 * served as CONTEXT and carries a note saying so.
		 *
		 * The two numbers that can actually move sit above it, both from
		 * summarizeLedger so the page, the API and the weekly row cannot drift
		 * apart: recurrence in kind after a silence-close, and exact-id reopens. */
		closure: {
			definition:
				"recurredAfterSilence is the metric that steers: the share of NEW findings repeating a (surface, failureMode) pair we had already closed ON SILENCE — closed without repairing, and it came back in kind. reopened is the exact-id version: a finding a detector raised again after closure. classRecurrence is context only.",
			recurredAfterSilence: ledgerSummary.recurrence.recurredAfterSilence,
			reopened: {
				count: ledgerSummary.recurrence.reopened,
				shareOfClosures: ledgerSummary.recurrence.reopenedShareOfClosures,
				regressedFromVerified: ledgerSummary.recurrence.regressedFromVerified,
				note: "a lower bound — re-clearing a reopened finding wipes its reopenedAt stamp, so reopen→reclear cycles are invisible here. regressedFromVerified counts the strongest case: a fix a human asserted had landed that a detector raised again.",
			},
			classRecurrence: {
				note: "structurally near 100% with 8 broad classes — context, not a target",
				last30d: closureWindow(30),
				lifetime: {
					newFindings: findings.length,
					repeats: repeatIds.size,
					ratePct: findings.length
						? Math.round((repeatIds.size / findings.length) * 1000) / 10
						: 0,
				},
				byClass: [...classAgg.entries()]
					.map(([cls, v]) => ({ class: cls, ...v }))
					.sort((a, b) => b.total - a.total),
			},
		},
	},
	projects: {
		/** `read` is how many rows this run actually enumerated; `population` is
		 * how many exist. They should be equal, and a gap is a censoring bug, not
		 * a sampling choice, so both are published rather than one "sampled". */
		read: projects.length,
		population: projectPopulation,
		servedPopulation: projects.length,
		populationNote:
			"population counts every stored row; the quality census reads only the SERVED ones (Draft rows and folded lineage shadows excluded, matching every public surface).",
		coveragePct: 100,
		frame: FRAME_METHOD,
		/** retained so existing consumers keep working; equals `read` */
		sampled: projects.length,
		/** every row as one compact point for the prominence-vs-evidence
		 * scatter: the top-right of that chart (prominent, weak) IS the
		 * curation queue, and a chart over a 40-row sample would hide it */
		scatter: projects.map((p) => ({
			slug: p.slug,
			prominence: p.prominence,
			factsPresent: p.factsPresent,
			missing: p.missing,
			status: p.status,
		})),
		meanScore: Math.round(
			projects.reduce((a, p) => a + p.score, 0) / Math.max(projects.length, 1),
		),
		/** sls-079: the deployment fact's coverage. unknown is the honest
		 * default, so this mix is a WORK QUEUE reading, not a score — the
		 * mainnet/testnet counts grow only as evidence lands. */
		deploymentMix: (() => {
			const m = new Map<string, number>();
			for (const p of projects)
				m.set(p.deploymentNetwork, (m.get(p.deploymentNetwork) ?? 0) + 1);
			return [...m.entries()]
				.map(([network, count]) => ({ network, count }))
				.sort((a, b) => b.count - a.count);
		})(),
		deploymentSplit: {
			unknown: projects.filter((p) => p.deploymentNetwork === "unknown").length,
			applicableUnknown: projects.filter(
				(p) => p.deploymentNetwork === "unknown" && p.deploymentApplies,
			).length,
			notApplicable: projects.filter(
				(p) => p.deploymentNetwork === "unknown" && !p.deploymentApplies,
			).length,
			means:
				"rows with deployment unknown, split by whether the question applies: on-chain product types (DEX, DeFi, Lending, Derivatives, Oracle, Bridge, Stablecoin, RWA) vs SDKs, wallets, security, analytics and other apps where 'unknown' is the correct answer.",
		},
		// Composition of the STRONG side by basis value, so a change to what
		// counts as strong (a new evidence tier) is visible as a tier gaining
		// rows — not as the weak share silently falling. 2026-09-04: two new
		// tiers took 173 rows; the pre-existing tiers moved by 4. Both are
		// real evidence, and they must be reported as two numbers.
		strongByBasis: Object.fromEntries(
			STRONG_BASES.map((b) => [
				b,
				projects.filter((p) => p.statusBasis === b).length,
			]),
		),
		strongBasisSplit: {
			weakLiveRows: projects.filter((p) => !isStrongBasis(p.statusBasis))
				.length,
			onchainEligible: projects.filter(
				(p) => !isStrongBasis(p.statusBasis) && p.hasOnchainFootprint,
			).length,
			appOnly: projects.filter(
				(p) => !isStrongBasis(p.statusBasis) && !p.hasOnchainFootprint,
			).length,
			// Not a missing-evidence bucket in the usual sense: the DEPLOYMENT
			// record already carries a strong basis while the STATUS record
			// this board scores does not. Whether that basis is backed by a
			// citable artifact is a separate question, and it is the one
			// scripts/basis-from-deployment.ts answers per row — propagating
			// the backed ones and reporting the rest as could-not-propagate.
			deploymentStrongStatusWeak: projects.filter(
				(p) =>
					isStrongBasis(p.deploymentBasis) && !isStrongBasis(p.statusBasis),
			).length,
			means:
				"weak-basis rows split by whether any on-chain footprint exists (issued asset, joined contract, or known deployment). onchainEligible can earn onchain-activity from dated evidence; appOnly can only reach a strong basis through human verification. deploymentStrongStatusWeak is a different thing entirely: rows whose DEPLOYMENT record carries a strong basis while the STATUS record this board scores does not. scripts/basis-from-deployment.ts propagates the ones whose deployment basis is backed by a citable artifact of a kind that can support that tier, and reports the rest as could-not-propagate — so what remains here is the un-citable residue, not a queue of receipted evidence waiting to be copied.",
		},
		basisMix: [...basisMix.entries()]
			.map(([basis, count]) => ({ basis, count }))
			.sort((a, b) => b.count - a.count),
		/** the gap queue: prominent rows with the weakest evidence */
		// Sorted by facts present ASCENDING so the genuinely worst rows lead.
		// The prior sort surfaced only single-miss rows and hid every row
		// missing provenance, which are the least trustworthy rows we serve.
		weakestReturned: 40,
		weakestTotal: projects.filter((p) => p.factsPresent < 5).length,
		weakestTruncated: projects.filter((p) => p.factsPresent < 5).length > 40,
		weakest: projects
			.filter((p) => p.factsPresent < 5)
			.sort(
				(a, b) =>
					a.factsPresent - b.factsPresent ||
					b.prominence - a.prominence ||
					a.slug.localeCompare(b.slug),
			)
			.slice(0, 40),
		missingCounts: ["strongBasis", "dated", "sourced", "typed", "linked"].map(
			(k) => ({
				field: k,
				count: projects.filter((p) => p.missing.includes(k)).length,
			}),
		),
	},
	repos: {
		/** distinct repos after collapsing duplicate rows */
		read: repos.length,
		/** rows in the collection, duplicates included */
		population: repoPopulation,
		coveragePct: 100,
		duplicateRows: repoDuplicateRows,
		duplicateNote:
			repoDuplicateRows > 0
				? `${repoDuplicateRows} row(s) in the repos collection duplicate a fullName already stored, one repo appears up to 20 times. Every count below is over DISTINCT repos; the duplicate rows are storage debt, tracked separately.`
				: "no duplicate fullName rows",
		frame: FRAME_METHOD,
		sampled: repos.length,
		/** The index is TWO populations with different intent, and coverage
		 * rates only mean something against the population they target:
		 * - curated (project-link + builder-owned): rows a directory record or
		 *   tracked person claims — depth scans and curation AIM at these.
		 * - tail (ec-taxonomy): Electric Capital's public list, indexed for
		 *   completeness and scanned opportunistically — low coverage here is
		 *   a choice, not a gap, so no "higher is better" applies to it. */
		coverage: (() => {
			const curated = repos.filter((r) => r.source !== "ec-taxonomy");
			const tail = repos.filter((r) => r.source === "ec-taxonomy");
			const depth = (rs: typeof repos) =>
				rs.filter((r) => r.codeDepth != null).length;
			// notes coverage is measured against the CURATION POOL (the gap
			// matrix's own target: curated rows with repoScore >= 60), because
			// nobody intends to hand-curate ten thousand tail repos.
			// 2026-09-02: widened from >= 60 to >= 50. The >= 60 pool is fully
			// examined (with-notes + judged = pool); the 50–59 band is the next
			// set consumers reach, and batch 8 examined it the same way.
			const notesPool = curated.filter((r) => (r.repoScore ?? 0) >= 50);
			// a mainnet join is only conceivable for deployable contracts
			const deployable = repos.filter((r) => r.deployable);
			return {
				curatedIndex: {
					repos: curated.length,
					means:
						"rows a directory record or tracked builder claims (source: project-link, builder-owned)",
					withCodeDepth: depth(curated),
					depthPct: Math.round(
						(depth(curated) / Math.max(curated.length, 1)) * 100,
					),
				},
				tail: {
					repos: tail.length,
					means:
						"Electric Capital taxonomy rows, indexed for completeness, scanned opportunistically — low coverage here is intended",
					withCodeDepth: depth(tail),
				},
				knowledgeNotes: {
					pool: notesPool.length,
					poolMeans:
						"curated-index rows with repoScore >= 50, the set curation actually targets",
					withNotes: notesPool.filter((r) => r.notes > 0).length,
					// JUDGED, not unexamined: pool rows that carry only INTERNAL
					// registry notes (pool triage verdicts — examined, nothing
					// durable found). Rows serve those as zero public notes, so
					// they read from the code registry here, never from the DB.
					triaged: notesPool.filter((r) => r.notes === 0 && triagedOnly(r))
						.length,
					triagedMeans:
						"examined by the curation pass and recorded as yielding no durable, source-citable fact (internal verdict, never served) — re-examined when the repo gains a registry package or a mainnet deployment",
					// The pool members still WITHOUT a note or a verdict, by name —
					// the exact worklist for the next curation batch. Batches 3–6
					// (2026-09-01) picked "next tier by repoScore across API search"
					// and grew the registry 29 → 176 while the pool moved 41 → 47:
					// most of that tier sits outside the pool. Name the gap so the
					// next batch aims at it.
					missing: notesPool
						.filter((r) => r.notes === 0 && !triagedOnly(r))
						.map((r) => r.fullName)
						.sort(),
				},
				mainnetJoin: {
					pool: deployable.length,
					poolMeans:
						"rows the scanner marked as deployable contracts, the only rows a mainnet join applies to",
					joined: repos.filter((r) => r.mainnetJoined).length,
				},
			};
		})(),
		/** The shape of the CURATED index (the rows a project or builder
		 * claims), as distributions rather than bare ratios. The tail is kept
		 * out: mixing ten thousand opportunistically-indexed rows into these
		 * charts made the curated index look unscanned and dormant when it is
		 * neither — the same denominator mistake the coverage block fixed. */
		curatedShape: (() => {
			const curated = repos.filter((r) => r.source !== "ec-taxonomy");
			const buckets = Array.from({ length: 10 }, (_, i) => ({
				bucket: `${i * 10}–${i * 10 + 9}`,
				count: 0,
			}));
			for (const r of curated) {
				const sc = Math.max(0, Math.min(99, r.repoScore ?? 0));
				buckets[Math.floor(sc / 10)].count++;
			}
			const mix = (key: (r: (typeof repos)[number]) => string | null) => {
				const m = new Map<string, number>();
				for (const r of curated) {
					const k = key(r) ?? "unknown";
					m.set(k, (m.get(k) ?? 0) + 1);
				}
				return [...m.entries()]
					.map(([label, count]) => ({ label, count }))
					.sort((a, b) => b.count - a.count);
			};
			return {
				repos: curated.length,
				scoreHistogram: buckets,
				/** unknown = no commit date held; not knowing is its own state */
				activityMix: mix((r) => r.activity),
				languageMix: mix((r) => r.language).slice(0, 10),
				languageOther: Math.max(0, mix((r) => r.language).length - 10),
			};
		})(),
		/** retained for existing consumers — whole-census counts with NO
		 * intent attached; read `coverage` for rates that mean something */
		withCodeDepth: repos.filter((r) => r.codeDepth != null).length,
		withNotes: repos.filter((r) => r.notes > 0).length,
		withMainnet: repos.filter((r) => r.mainnetJoined).length,
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

/** Honest self-report, derived from the numbers above, the thing a calling
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
// No cliff edges: the old test was >50%, so at 49% weak-basis the warning
// silently vanished while nearly half the rows still rested on the weakest
// bases. The limitation now appears whenever the share is material and the
// sentence carries the share itself.
const weakShare = Math.round(
	(weakBasis / Math.max(out.projects.sampled, 1)) * 100,
);
if (weakShare >= 20)
	limitations.push({
		area: "project status",
		limit: `${weakShare}% of lifecycle statuses rest on the weakest honest bases: a page answered (site-liveness) or a value inherited from a source (source-inherited).`,
		measurement: `${weakBasis} of ${out.projects.sampled} rows (census)`,
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
const notesCov = out.repos.coverage.knowledgeNotes;
if (notesCov.withNotes < notesCov.pool)
	limitations.push({
		area: "repo knowledge notes",
		limit:
			"Curated, dated repo facts (knowledgeNotes) exist on a minority of indexed repositories.",
		measurement: `${notesCov.withNotes} of ${notesCov.pool} rows in the curation pool (curated index, repoScore >= 50)`,
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

/** THE GAP MATRIX, one row per (entity × field) hole, with the count, the
 * denominator, why it matters to a caller, what closes it, and real examples
 * so the work is pickup-able. This is the actionable half of the report:
 * knownLimitations says "be careful", the matrix says "here is the list". */
const strongBases = new Set<string>(STRONG_BASES);
const weakBasisRows = [...seen.values()].filter(
	(p) => !isStrongBasis(p.statusBasis),
);
const missing = (field: string) =>
	projects.filter((p) => p.missing.includes(field));
const SAMPLE_CAP = 12;
/** A silently truncated list reads as a complete one. Every caller publishes
 * the cap and whether it bit, alongside the values. */
const sample = <T>(rows: T[], pick: (r: T) => string) =>
	rows.slice(0, SAMPLE_CAP).map(pick);
const sampleMeta = (n: number) => ({
	exampleCap: SAMPLE_CAP,
	exampleTruncated: n > SAMPLE_CAP,
});

/** SANKEY FLOW, every finding traced detector -> surface -> outcome.
 * This is the "where do our defects come from and where do they end up"
 * view: which detector caught it, which surface it lives on, and whether it
 * closed. Node and link values are whole-ledger counts, not samples. */
{
	const nodeOf = new Map<string, number>();
	const nodes: Array<{
		id: string;
		label: string;
		column: number;
		value: number;
	}> = [];
	const addNode = (id: string, label: string, column: number) => {
		if (nodeOf.has(id)) return nodeOf.get(id) as number;
		nodeOf.set(id, nodes.length);
		nodes.push({ id, label, column, value: 0 });
		return nodes.length - 1;
	};
	const linkMap = new Map<string, number>();
	const bump = (from: number, to: number) => {
		const k = `${from}:${to}`;
		linkMap.set(k, (linkMap.get(k) ?? 0) + 1);
	};
	const OUTCOME: Record<string, string> = {
		open: "Open",
		cleared: "Cleared",
		verified: "Verified",
	};
	// stable ordering: biggest detectors first so the diagram does not
	// reshuffle between runs
	const bySource = new Map<string, number>();
	for (const f of findings)
		bySource.set(f.source, (bySource.get(f.source) ?? 0) + 1);
	const sources = [...bySource.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([k]) => k);
	for (const src of sources) addNode(`s:${src}`, src, 0);
	for (const surf of [...bySurface.keys()].sort(
		(a, b) => surfaceMass(b) - surfaceMass(a),
	))
		addNode(`f:${surf}`, surf, 1);
	for (const o of ["cleared", "open", "verified"])
		addNode(`o:${o}`, OUTCOME[o], 2);

	for (const f of findings) {
		const a = nodeOf.get(`s:${f.source}`);
		const b = nodeOf.get(`f:${f.surface}`);
		const c = nodeOf.get(`o:${f.status}`);
		if (a == null || b == null || c == null) continue;
		bump(a, b);
		bump(b, c);
		nodes[a].value++;
		nodes[c].value++;
	}
	for (const n of nodes) if (n.column === 1) n.value = surfaceMass(n.label);

	(out as Record<string, unknown>).flow = {
		definition:
			"Every finding traced detector -> surface -> outcome. Whole-ledger counts, not a sample. Read it to see which detector produces which defects, where they land, and whether they close.",
		nodes,
		// Links carry node IDs as well as indexes. An index-only graph rewires
		// silently the moment a consumer filters or re-sorts the node list.
		links: [...linkMap.entries()].map(([k, value]) => {
			const [source, target] = k.split(":").map(Number);
			return {
				source,
				target,
				sourceId: nodes[source].id,
				targetId: nodes[target].id,
				value,
			};
		}),
	};
}

/** One construction path for every gap row, so the count, the example pool and
 * the truncation flag can never disagree with each other. Six hand-written
 * rows had drifted: examples were drawn from a prominence-filtered subset while
 * `missing` counted the whole population, with nothing saying so. */
const gapRow = <T>(r: {
	entity: string;
	field: string;
	all: T[];
	of: number;
	pick: (x: T) => string;
	/** the examples are drawn from this narrower pool when we only want to
	 * hand a consumer the ones worth working first */
	pool?: { rows: T[]; why: string };
	whyItMatters: string;
	closedBy: string;
}) => {
	const pool = r.pool?.rows ?? r.all;
	return {
		entity: r.entity,
		field: r.field,
		missing: r.all.length,
		of: r.of,
		share: Math.round((r.all.length / Math.max(r.of, 1)) * 1000) / 10,
		whyItMatters: r.whyItMatters,
		closedBy: r.closedBy,
		exampleSource: r.pool?.why ?? "all rows missing this field",
		examplePoolSize: pool.length,
		...sampleMeta(pool.length),
		examples: sample(pool, r.pick),
	};
};

const byProminence = <T extends { prominence?: number | null }>(rows: T[]) =>
	[...rows].sort((a, b) => (b.prominence ?? 0) - (a.prominence ?? 0));
// Expected tier for the contract-join gap (see the row's comment): a
// mainnet join is a reasonable ask only where the repo shows real
// signal. Forks are negligible here (15 of 3,351) and the frame does
// not carry the flag; archived rows are cut via activity.
const expectedContractRepos = repos.filter(
	(r) =>
		r.deployable &&
		r.activity !== "archived" &&
		(r.projectSlug || (r.repoScore ?? 0) >= 60),
);
const lowSignalDeployable =
	repos.filter((r) => r.deployable).length - expectedContractRepos.length;
const byRepoScore = <T extends { repoScore?: number | null }>(rows: T[]) =>
	[...rows].sort((a, b) => (b.repoScore ?? 0) - (a.repoScore ?? 0));

(out as Record<string, unknown>).gapMatrix = {
	definition:
		"One row per (entity type x missing field). `missing` and `of` are whole-population counts over the rows this run read. `examples` are real identifiers drawn from `examplePoolSize` candidates, capped at `exampleCap`; `exampleTruncated` says whether the cap bit. Every example is a live slug or full name, so any claim here can be independently checked.",
	rows: [
		gapRow({
			entity: "project",
			field: "sourced",
			all: missing("sourced"),
			of: projects.length,
			pick: (p) => p.slug,
			pool: {
				rows: byProminence(missing("sourced")),
				why: "highest-prominence rows missing a source URL",
			},
			whyItMatters:
				"A lifecycle claim with no source cannot be re-checked by a caller. It is our assertion, not evidence.",
			closedBy:
				"Curate a dated source URL, or downgrade the basis to match the evidence we actually have.",
		}),
		gapRow({
			entity: "project",
			field: "typed",
			all: missing("typed"),
			of: projects.length,
			pick: (p) => p.slug,
			pool: {
				rows: byProminence(missing("typed")),
				why: "highest-prominence rows carrying no type",
			},
			whyItMatters:
				"An untyped row is invisible to exact ?type= enumeration and to the gaps axis, even when it belongs to that vertical.",
			closedBy:
				"Add the type via the curation TYPE_ADD pass, with the row's own description as evidence.",
		}),
		gapRow({
			entity: "project",
			field: "strongBasis",
			all: weakBasisRows,
			of: projects.length,
			pick: (p) => p.slug,
			pool: {
				rows: byProminence(
					weakBasisRows.filter((p) => (p.prominence ?? 0) >= 70),
				),
				why: "prominence >= 70 only, the rows a consumer is most likely to hit",
			},
			whyItMatters: `site-liveness means only that a page answered. source-inherited means the value came from elsewhere. Neither is observation of the product. Of the weak rows, ${projects.filter((p) => !isStrongBasis(p.statusBasis) && p.hasOnchainFootprint).length} hold an on-chain footprint (an issued asset, a joined contract, or a known deployment) and can earn onchain-activity from evidence; the other ${projects.filter((p) => !isStrongBasis(p.statusBasis) && !p.hasOnchainFootprint).length} are app-only and can only move through human verification — the ceiling of this row is people, not lanes.`,
			closedBy:
				"Human verification with a receipt, an on-chain activity reading, or an operator announcement.",
		}),
		gapRow({
			entity: "project",
			field: "deployment evidence",
			all: projects.filter((p) => p.deploymentNetwork === "unknown"),
			of: projects.length,
			pick: (p) => p.slug,
			pool: {
				// Deployment is a meaningful question for products whose value IS
				// on-chain — not for an SDK, a wallet, or a CLI (the same lesson as
				// the mainnet-join denominator). The pool leads with the rows an
				// agent will actually ask "is this on mainnet?" about.
				rows: byProminence(
					projects.filter(
						(p) =>
							p.deploymentNetwork === "unknown" &&
							p.status === "Live" &&
							(p.prominence ?? 0) >= 60 &&
							(p as { types?: string[] }).types?.some((t) =>
								[
									"DEX",
									"DeFi",
									"Lending",
									"Derivatives",
									"Oracle",
									"Bridge",
									"Stablecoin",
									"RWA",
								].includes(t),
							),
					),
				),
				why: "Live on-chain-product rows (DEX/DeFi/Lending/Derivatives/Oracle/Bridge/Stablecoin/RWA) with prominence >= 60 whose deployment is unknown — the rows an agent asks 'is this on mainnet?' about",
			},
			whyItMatters: `sls-079: 'Live' says a product operates for users somewhere; it does NOT say which network it is deployed on. Of the ${projects.filter((p) => p.deploymentNetwork === "unknown").length} unknown rows, ${projects.filter((p) => p.deploymentNetwork === "unknown" && p.deploymentApplies).length} are on-chain product types where the question applies and an agent will ask it; the other ${projects.filter((p) => p.deploymentNetwork === "unknown" && !p.deploymentApplies).length} are SDKs, wallets, security and analytics rows where unknown is the honest answer, not a gap.`,
			closedBy:
				"Evidence only: a verified mainnet contract join, an on-chain activity reading, or a human-verified operator artifact (DEPLOYMENT_VERIFIED).",
		}),
		gapRow({
			entity: "repo",
			field: "knowledgeNotes",
			all: repos.filter((r) => r.notes === 0),
			of: repos.length,
			pick: (r) => r.fullName,
			pool: {
				rows: byRepoScore(
					repos.filter((r) => r.notes === 0 && (r.repoScore ?? 0) >= 60),
				),
				why: "repoScore >= 60 only",
			},
			whyItMatters:
				"Curated dated facts are what let an agent cite a repo claim. Without them only raw scan fields are available.",
			closedBy:
				"The repo-intel enrich pass, which writes dated notes with sources.",
		}),
		gapRow({
			entity: "repo",
			field: "mainnet contract join",
			// A join is only conceivable for a deployable contract — and only
			// EXPECTED where the repo shows real signal: linked to a directory
			// project, or scored >= 60, and not archived. The measured truth
			// behind this cut (operator challenge, 2026-09-01): 86% of the
			// 3,351 scanner-deployable repos sit under repoScore 30 — hackathon
			// demos, tutorials, experiments — where a missing mainnet join is
			// the NORMAL state of a demo, not a gap (the optional-absent
			// doctrine). The excluded tail is COUNTED in whyItMatters, never
			// silently dropped.
			all: expectedContractRepos.filter((r) => !r.mainnetJoined),
			of: expectedContractRepos.length,
			pick: (r) => r.fullName,
			pool: {
				rows: byRepoScore(
					expectedContractRepos.filter((r) => !r.mainnetJoined),
				),
				why: "expected-tier deployable contracts (project-linked or repoScore >= 60, not archived) without a join",
			},
			whyItMatters: `Without a verified contract join we can say code exists, never that it is USED on mainnet. Denominator is the expected tier only — ${lowSignalDeployable} further low-signal deployable repos (demos/tutorials/experiments) are deliberately excluded: absence of a mainnet join there is expected-normal, and sweeping them in overstated this gap ~10×.`,
			closedBy:
				"Contract attribution during the scan wave. Absence is absence of a join, never proof of disuse.",
		}),
		gapRow({
			entity: "repo",
			field: "code depth reading",
			all: repos.filter((r) => r.codeDepth == null),
			of: repos.length,
			pick: (r) => r.fullName,
			whyItMatters:
				"No depth reading means the repo was never scanned for real implementation signal.",
			closedBy: "A scan wave pass over the unscanned tail.",
		}),
	].sort((a, b) => b.share - a.share),
};

writeFileSync(
	join(process.cwd(), "improvements/quality/entities.json"),
	`${JSON.stringify(out, null, 1)}\n`,
);
console.log(
	`entities.json: ${out.projects.sampled} projects (mean ${out.projects.meanScore}) · ${out.repos.sampled} repos · ${out.findings.open} open findings`,
);
