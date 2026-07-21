/**
 * Cross-hackathon + cross-ecosystem analytics rollup.
 *
 *   GET /api/analyze                          — full rollup
 *   GET /api/analyze?dimension=hackathons     — per-hackathon stats only
 *   GET /api/analyze?dimension=categories     — category distribution only
 *   GET /api/analyze?dimension=funding        — SCF funding distribution
 *   GET /api/analyze?dimension=tvl            — DeFi TVL rollup (DefiLlama)
 *
 * Mirrors Colosseum Copilot's /analyze. Returns the macro picture that
 * `/api/hackathons/{slug}` (single-event detail) and `/api/clusters`
 * (project clustering) can't answer alone:
 *
 *   - How many total hackathons / submissions / prize $$ to date
 *   - Which categories produce the most winners
 *   - SCF funding distribution by round + category
 *   - Build-status funnel across all post-hackathon projects
 *
 * Use this when the user asks "what's the state of Stellar hackathons /
 * grants overall" rather than "tell me about hackathon X".
 */

import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { computeEcosystemGaps } from "@/lib/ecosystem-gaps";
import { fetchAllDoraHacksHackathons } from "@/lib/integrations/dorahacks";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import {
	ACTIVE_PROJECT_STATUSES,
	type PopulationScope,
	populationScope,
} from "@/lib/population";

export const dynamic = "force-dynamic";
export const revalidate = 600;

const VALID_DIMENSIONS = [
	"all",
	"hackathons",
	"categories",
	"funding",
	"tvl",
	"gaps",
] as const;

// Buildable product verticals — the universe the `gaps` dimension measures
// coverage against, so a canonical vertical with ZERO active projects surfaces
// as whitespace rather than being invisible. EVERY entry MUST be a real value
// of the projects `types` select (this list is a subset of it); a label that
// isn't a `types` value can never appear in any project's types[] and would
// report a permanent FALSE `absent`. That is why "Oracle" is NOT here: oracles
// are typed by convention as category=Infrastructure with types=[] (Reflector/
// Band/RedStone all carry types=[]), and "Oracle" isn't a `types` option at all
// — its coverage isn't measurable on this axis (use searchProjects/category).
// The broad catch-alls (Infrastructure / SDK / Analytics) are excluded because
// they're not verticals; a caveat in the response says so.
const GAP_VERTICALS = [
	"Wallet",
	"DEX",
	"Lending",
	"Bridge",
	"Payments",
	"Anchor",
	"Indexer",
	"Explorer",
	"AI",
	"Gaming",
	"Education",
	"Security",
	"NFT",
	"RWA",
	"Stablecoin",
	"Social Impact",
	"RPC",
	"Faucet",
] as const;

// One place for the funding methodology label — it is served in the response
// AND stamped on every persisted snapshot (sls-044), so the two can't drift.
const FUNDING_METHODOLOGY_VERSION = "funding-v2 (2026-07-05)";

// sls-044 (#520): a persisted funding-v2 snapshot row (funding-snapshots
// collection) — one per observed awarded-project SET, keyed by its hash.
interface FundingSnapshotDoc {
	projectSetHash?: string;
	scfAwardedProjects?: number;
	scfTotalDistributedUSD?: number;
	methodologyVersion?: string;
	awardedSlugs?: unknown;
	computedAt?: string;
}

// Reason codes for removed-slug delta rows, per the #520 request. Derived
// mechanically from the removed record's CURRENT state — never guessed:
//   dedupe                       — the record now points at a canonical slug
//   eligibility-reclassification — the record left the active status pool
//   source-correction            — scf.awarded was corrected to false
//   unknown                      — record missing or no mechanical signal
type RemovalReason =
	| "dedupe"
	| "eligibility-reclassification"
	| "source-correction"
	| "unknown";

interface CategoryStats {
	category: string;
	projectCount: number;
	scfFundedCount: number;
	scfTotalUSD: number;
	hackathonWinnerCount: number;
}

interface ProjectDoc {
	id: string;
	slug?: string;
	name?: string;
	category?: string;
	types?: string[];
	status?: string;
	hackathonStatus?: string;
	hackathonPlacement?: string;
	hackathonPrize?: number;
	scf?: { awarded?: boolean; totalAwarded?: number; awardedRounds?: number[] };
	// DefiLlama TVL facts (scripts/enrich-tvl.ts): null = not tracked there,
	// never "zero TVL". Every value is dated via tvlAsOf.
	tvlUSD?: number | null;
	tvlAsOf?: string | null;
}

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const dimensionParam = sp.get("dimension") ?? "all";
	if (!VALID_DIMENSIONS.includes(dimensionParam as never)) {
		return NextResponse.json(
			{
				error: `unknown dimension: '${dimensionParam}'`,
				validDimensions: VALID_DIMENSIONS,
			},
			{ status: 400 },
		);
	}

	const includeHackathons =
		dimensionParam === "all" || dimensionParam === "hackathons";
	const includeCategories =
		dimensionParam === "all" || dimensionParam === "categories";
	const includeFunding =
		dimensionParam === "all" || dimensionParam === "funding";
	const includeTvl = dimensionParam === "all" || dimensionParam === "tvl";
	const includeGaps = dimensionParam === "all" || dimensionParam === "gaps";

	const payload = await getPayloadSafe();

	const result: Record<string, unknown> = {};

	// ── Hackathon rollup
	if (includeHackathons) {
		let hackCount = 0;
		let totalPrizeUSD = 0;
		let totalHackersCount = 0;
		let upcomingCount = 0;
		let activeCount = 0;
		let completedCount = 0;
		try {
			const dora = await fetchAllDoraHacksHackathons();
			const now = Math.floor(Date.now() / 1000);
			hackCount = dora.length;
			for (const h of dora) {
				totalPrizeUSD += h.bonus_price || 0;
				totalHackersCount += h.hackers_count || 0;
				if (h.start_time > now) upcomingCount += 1;
				else if (h.end_time < now) completedCount += 1;
				else activeCount += 1;
			}
		} catch {
			// fall through with zeros
		}
		result.hackathons = {
			totalEvents: hackCount,
			byStatus: {
				upcoming: upcomingCount,
				active: activeCount,
				completed: completedCount,
			},
			totalPrizePoolUSD: totalPrizeUSD,
			totalRegisteredHackers: totalHackersCount,
		};
	}

	// ── Categories + funding + tvl share a projects fetch
	let projects: ProjectDoc[] = [];
	let population: PopulationScope | null = null;
	if (
		payload &&
		(includeCategories || includeFunding || includeTvl || includeGaps)
	) {
		try {
			const r = await payload.find({
				collection: "projects",
				where: {
					status: { in: [...ACTIVE_PROJECT_STATUSES] },
				},
				// Select only the aggregation fields + raise the cap so the
				// breakdown covers ALL active projects. Was capped at 500, which
				// both truncated the distribution and mislabeled totalProjects
				// (a downstream consumer flagged status=917 vs analyze=500). The
				// select keeps the larger fetch cheap on the M0 tier.
				limit: 5000,
				depth: 0,
				select: {
					// sls-044: slug also feeds the funding projectSetHash — a stable
					// identity digest of WHICH projects are in the awarded set.
					slug: true,
					name: true,
					category: true,
					// sls-gaps: the fine product-type taxonomy the `gaps` dimension
					// measures vertical coverage against (the actionable verticals,
					// vs the coarse 7-category `category`).
					types: true,
					scf: true,
					hackathonPlacement: true,
					// sls-013: the funnel read hackathonStatus without selecting it —
					// every project counted as "Unknown" no matter what the DB held.
					hackathonStatus: true,
					status: true,
					// sls-038: TVL facts for the tvl rollup (null = not DefiLlama-tracked).
					tvlUSD: true,
					tvlAsOf: true,
				},
			});
			projects = r.docs as unknown as ProjectDoc[];
			// sls-048: answer-visible scope digest, same shape as /api/clusters —
			// identical `population.id` ⇒ the two responses aggregated the same
			// population and their numbers are mechanically comparable.
			population = populationScope({
				collection: "projects",
				statusScope: ACTIVE_PROJECT_STATUSES,
				totalAvailable: r.totalDocs ?? projects.length,
				included: projects.length,
			});
		} catch {
			// fall through with empty
		}
	}

	if (includeCategories) {
		const map = new Map<string, CategoryStats>();
		for (const p of projects) {
			const cat = p.category ?? "Uncategorized";
			if (!map.has(cat)) {
				map.set(cat, {
					category: cat,
					projectCount: 0,
					scfFundedCount: 0,
					scfTotalUSD: 0,
					hackathonWinnerCount: 0,
				});
			}
			const s = map.get(cat) as CategoryStats;
			s.projectCount += 1;
			if (p.scf?.awarded) {
				s.scfFundedCount += 1;
				s.scfTotalUSD += p.scf.totalAwarded ?? 0;
			}
			if (
				p.hackathonPlacement === "grand-prize" ||
				p.hackathonPlacement === "1st" ||
				p.hackathonPlacement === "2nd" ||
				p.hackathonPlacement === "3rd" ||
				p.hackathonPlacement === "track-winner"
			) {
				s.hackathonWinnerCount += 1;
			}
		}
		const sorted = [...map.values()].sort(
			(a, b) => b.projectCount - a.projectCount,
		);
		result.categories = {
			totalProjects: projects.length,
			scope:
				"Active projects only (status Live / Pre-Release / Development). Differs from /api/status.sources.projects, which counts the FULL collection incl. Inactive/other — don't merge the two without labeling the source.",
			distribution: sorted,
		};
	}

	if (includeFunding) {
		const scfProjects = projects.filter((p) => p.scf?.awarded);
		const totalUSD = scfProjects.reduce(
			(s, p) => s + (p.scf?.totalAwarded ?? 0),
			0,
		);
		// Post-hackathon outcome funnel — scoped to projects that actually came
		// through a hackathon (sls-013: previously counted EVERY project, so 890
		// non-hackathon projects landed in "Unknown" and the funnel read as
		// zeroed placeholders).
		const funnel: Record<string, number> = {
			Built: 0,
			"In Progress": 0,
			Abandoned: 0,
			Unknown: 0,
		};
		const hackathonProjects = projects.filter(
			(p) => p.hackathonStatus || p.hackathonPlacement,
		);
		for (const p of hackathonProjects) {
			const k = p.hackathonStatus ?? "Unknown";
			funnel[k] = (funnel[k] ?? 0) + 1;
		}
		// Per-round funding (sls-013: read the wrong field name — scf.rounds
		// instead of scf.awardedRounds — so byRound shipped empty forever).
		// Per-round award amounts are not published by SCF, so a project's
		// total is apportioned EQUALLY across its awarded rounds rather than
		// double-counted into each (sls-011: totals are reconstructions).
		const byRound = new Map<string, { count: number; totalUSD: number }>();
		for (const p of scfProjects) {
			const rounds = p.scf?.awardedRounds ?? [];
			if (!rounds.length) continue;
			const share = (p.scf?.totalAwarded ?? 0) / rounds.length;
			for (const r of rounds) {
				const key = String(r);
				if (!byRound.has(key)) byRound.set(key, { count: 0, totalUSD: 0 });
				const stat = byRound.get(key) as { count: number; totalUSD: number };
				stat.count += 1;
				stat.totalUSD += share;
			}
		}
		// sls-044: a stable identity digest of WHICH awarded projects are in this
		// snapshot (sha256 of the sorted slug set, truncated). The cumulative
		// total and project count can legitimately move between reads (award
		// corrections, dupe merges, status reclassification) — the hash lets a
		// consumer distinguish "same project set, amounts corrected" from "the
		// set itself changed", and detect set changes across their own snapshots
		// without diffing full payloads.
		const awardedSlugs = scfProjects
			.map((p) => p.slug ?? p.id)
			.sort((a, b) => a.localeCompare(b));
		const projectSetHash = createHash("sha256")
			.update(awardedSlugs.join("\n"))
			.digest("hex")
			.slice(0, 16);

		// sls-044 (#520): answer-visible set-delta provenance. The hash alone
		// says WHETHER the awarded set changed; consumers also need WHAT changed
		// and WHY. We persist one snapshot per observed set state (best-effort;
		// a new row only when the hash is new — ~weekly, not per-request) and
		// serve current-vs-previous added/removed slug lists with mechanical
		// reason codes. Empty history degrades to an explicit deltaUnavailable
		// note — never a silent omission.
		let snapshotAsOf: string | null = null;
		let previousSnapshot: {
			projectSetHash: string;
			computedAt: string | null;
			scfAwardedProjects: number | null;
			scfTotalDistributedUSD: number | null;
		} | null = null;
		let snapshotDelta: {
			addedProjects: string[];
			removedProjects: string[];
			addedCount: number;
			removedCount: number;
			totalUSDDelta: number;
			removedReasons: Array<{ slug: string; reason: RemovalReason }>;
		} | null = null;
		let deltaUnavailable: string | null = null;
		if (payload) {
			try {
				const snapRes = await payload.find({
					collection: "funding-snapshots",
					sort: "-computedAt",
					limit: 2,
					depth: 0,
					overrideAccess: true,
				});
				const snaps = snapRes.docs as FundingSnapshotDoc[];
				const latest = snaps[0] ?? null;
				let prev: FundingSnapshotDoc | null = null;
				if (!latest || latest.projectSetHash !== projectSetHash) {
					// New set state (or first run): record it. Best-effort — a full
					// storage tier must degrade the delta, never the funding numbers.
					snapshotAsOf = new Date().toISOString();
					try {
						await payload.create({
							collection: "funding-snapshots",
							data: {
								projectSetHash,
								scfAwardedProjects: scfProjects.length,
								scfTotalDistributedUSD: totalUSD,
								methodologyVersion: FUNDING_METHODOLOGY_VERSION,
								awardedSlugs,
								computedAt: snapshotAsOf,
							},
							overrideAccess: true,
						});
					} catch {
						// persistence failed (e.g. storage full) — delta still computes
						// against the last stored state; only durability is affected.
					}
					prev = latest;
				} else {
					// Same set as the stored latest — this response IS that snapshot
					// (amounts may still drift within a set: amount revisions).
					snapshotAsOf = latest.computedAt ?? null;
					prev = snaps[1] ?? null;
				}
				if (prev?.projectSetHash) {
					previousSnapshot = {
						projectSetHash: prev.projectSetHash,
						computedAt: prev.computedAt ?? null,
						scfAwardedProjects:
							typeof prev.scfAwardedProjects === "number"
								? prev.scfAwardedProjects
								: null,
						scfTotalDistributedUSD:
							typeof prev.scfTotalDistributedUSD === "number"
								? prev.scfTotalDistributedUSD
								: null,
					};
					const prevSlugs = Array.isArray(prev.awardedSlugs)
						? (prev.awardedSlugs as unknown[]).filter(
								(s): s is string => typeof s === "string",
							)
						: [];
					const prevSet = new Set(prevSlugs);
					const curSet = new Set(awardedSlugs);
					const added = awardedSlugs.filter((s) => !prevSet.has(s));
					const removed = prevSlugs.filter((s) => !curSet.has(s)).sort();
					// Mechanical reason codes from the removed records' CURRENT state.
					let removedReasons: Array<{ slug: string; reason: RemovalReason }> =
						removed.map((slug) => ({ slug, reason: "unknown" as const }));
					if (removed.length) {
						try {
							const rres = await payload.find({
								collection: "projects",
								where: { slug: { in: removed } },
								limit: removed.length,
								depth: 0,
								overrideAccess: true,
								select: {
									slug: true,
									status: true,
									canonicalSlug: true,
									scf: true,
								},
							});
							const bySlug = new Map(
								(
									rres.docs as Array<{
										slug?: string;
										status?: string;
										canonicalSlug?: string | null;
										scf?: { awarded?: boolean };
									}>
								).map((d) => [d.slug, d]),
							);
							removedReasons = removed.map((slug) => {
								const d = bySlug.get(slug);
								let reason: RemovalReason = "unknown";
								if (d?.canonicalSlug) reason = "dedupe";
								else if (
									d?.status &&
									!(ACTIVE_PROJECT_STATUSES as readonly string[]).includes(
										d.status,
									)
								)
									reason = "eligibility-reclassification";
								else if (d && d.scf?.awarded === false)
									reason = "source-correction";
								return { slug, reason };
							});
						} catch {
							// classification is best-effort; "unknown" rows already set
						}
					}
					snapshotDelta = {
						addedProjects: added,
						removedProjects: removed,
						addedCount: added.length,
						removedCount: removed.length,
						totalUSDDelta:
							typeof prev.scfTotalDistributedUSD === "number"
								? Math.round((totalUSD - prev.scfTotalDistributedUSD) * 100) /
									100
								: 0,
						removedReasons,
					};
				} else {
					deltaUnavailable =
						"No prior funding snapshot with a different project set is recorded yet — snapshot history starts at snapshotAsOf. Re-read after the awarded set changes to receive addedProjects/removedProjects; a shifted headline before then is an amount revision within the SAME set (projectSetHash unchanged).";
				}
			} catch {
				deltaUnavailable =
					"Snapshot store unavailable this request — the current-vs-previous comparison could not be computed. The funding totals above are unaffected.";
			}
		} else {
			deltaUnavailable =
				"Snapshot store unavailable this request — the current-vs-previous comparison could not be computed. The funding totals above are unaffected.";
		}

		result.funding = {
			scfAwardedProjects: scfProjects.length,
			scfTotalDistributedUSD: totalUSD,
			meanAwardUSD: scfProjects.length
				? Math.round(totalUSD / scfProjects.length)
				: 0,
			// sls-013: stamp the computation so consumers can tell drift from
			// re-indexing from methodology change instead of watching the
			// headline swing unexplained.
			computedAt: new Date().toISOString(),
			methodologyVersion: FUNDING_METHODOLOGY_VERSION,
			// sls-044: compare across your own snapshots — same hash ⇒ same
			// project SET (only amounts/labels can differ); different hash ⇒ the
			// membership changed (projects added/removed/reclassified), which is
			// the honest explanation for a shrinking cumulative total under an
			// unchanged methodology.
			projectSetHash,
			// sls-044 (#520): answer-visible set-delta provenance vs the preceding
			// PERSISTED snapshot (stored snapshots differ by set, so the delta is
			// always a membership change; amount drift within one set shows up as
			// totalUSDDelta against that older set).
			snapshotAsOf,
			previousSnapshot,
			snapshotDelta,
			deltaUnavailable,
			deltaBasis:
				"snapshotAsOf = when the CURRENT projectSetHash was first observed (persisted snapshot time). previousSnapshot = the most recent stored snapshot with a DIFFERENT project set; snapshotDelta lists the slugs added/removed between it and this response, with mechanical reason codes for removals (dedupe = record now points at a canonical slug; eligibility-reclassification = record left the active status pool; source-correction = scf.awarded corrected to false; unknown = no mechanical signal). totalUSDDelta = this response's total minus the previous snapshot's. When snapshotDelta is null, deltaUnavailable says why (no differing prior snapshot yet, or store unavailable) — never infer a cause from headline drift alone.",
			countBasis:
				"Counts distinct PROJECTS with scf.awarded=true (not awarded submissions — SDF's own counters count submissions, so totals differ by design). Dollar totals are in-house reconstructions: SCF does not publish per-award amounts for all rounds (some are XLM-denominated or undisclosed — see scfAmountStatus on project rows), so cross-source totals can legitimately disagree. Round membership comes from official award pages. byRound apportions each project's total equally across its awarded rounds because per-round amounts are unpublished. NOTE: byRound[].count is per-round MEMBERSHIP (a project is counted in each round it won), so the sum of byRound counts is intentionally GREATER than scfAwardedProjects — never add round counts to get a project total.",
			postHackathonStatusFunnel: {
				scope: `hackathon-linked projects only (${hackathonProjects.length} of ${projects.length} active)`,
				...funnel,
			},
			byRound: [...byRound.entries()]
				.map(([round, stat]) => ({
					round,
					count: stat.count,
					totalUSD: Math.round(stat.totalUSD),
				}))
				.sort((a, b) => b.totalUSD - a.totalUSD),
		};
	}

	// ── DeFi TVL rollup (sls-038): the catalog description promised an
	// ecosystem TVL rollup that dimension=all never served — a caller couldn't
	// tell unavailable from soft-empty. Serve it, dated and provenance-labeled,
	// from the per-project DefiLlama facts (scripts/enrich-tvl.ts).
	if (includeTvl) {
		const tracked = projects.filter((p) => typeof p.tvlUSD === "number");
		const totalTvlUSD = Math.round(
			tracked.reduce((s, p) => s + (p.tvlUSD ?? 0), 0),
		);
		const top10 = [...tracked]
			.sort((a, b) => (b.tvlUSD ?? 0) - (a.tvlUSD ?? 0))
			.slice(0, 10)
			.map((p) => ({
				slug: p.slug ?? null,
				name: p.name ?? null,
				tvlUSD: Math.round(p.tvlUSD ?? 0),
				tvlAsOf: p.tvlAsOf ?? null,
			}));
		// Most recent per-project refresh date = the rollup's as-of.
		const asOf = tracked.reduce<string | null>(
			(m, p) => (p.tvlAsOf && (!m || p.tvlAsOf > m) ? p.tvlAsOf : m),
			null,
		);
		result.tvl = {
			totalTvlUSD,
			trackedProjects: tracked.length,
			asOf,
			provider: "DefiLlama",
			top10,
			basis:
				"Sum of per-project tvlUSD across ACTIVE directory projects tracked on DefiLlama (tvlUSD != null; null = not tracked there, never zero — untracked protocols are simply absent, so this UNDERCOUNTS chain-wide TVL). Values are per-protocol DefiLlama totals refreshed on a curated cadence (asOf = most recent per-project tvlAsOf), CEX reserve rows excluded; a cross-chain protocol's figure follows DefiLlama's own protocol accounting. As-of dated — never an exact to-the-dollar live figure. Per-project tvlUSD/tvlAsOf also ride each /api/projects/search row.",
		};
	}

	if (includeGaps) {
		// Whitespace signal (2026-07-21): the "where should I build / what's
		// under-served" question, derived from the SAME active-project fetch —
		// per-vertical coverage + three honest gap kinds (see ecosystem-gaps.ts).
		// Supply-side only; the basis field spells out that gap ≠ demand.
		result.gaps = computeEcosystemGaps(projects, GAP_VERTICALS);
	}

	logApiHit({
		req,
		endpoint: "/api/analyze",
		filters: { dimension: dimensionParam },
	});

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz",
				generatedAt: new Date().toISOString(),
				dimension: dimensionParam,
				validDimensions: VALID_DIMENSIONS,
				// sls-048: the population the categories/funding aggregations ran
				// over (null when neither dimension was requested). Same shape as
				// /api/clusters — identical `population.id` ⇒ comparable numbers.
				...(population ? { population } : {}),
			},
			...result,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
			},
		},
	);
}

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
