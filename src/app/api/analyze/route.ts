/**
 * Cross-hackathon + cross-ecosystem analytics rollup.
 *
 *   GET /api/analyze                          — full rollup
 *   GET /api/analyze?dimension=hackathons     — per-hackathon stats only
 *   GET /api/analyze?dimension=categories     — category distribution only
 *   GET /api/analyze?dimension=funding        — SCF funding distribution
 *   GET /api/analyze?dimension=tvl            — DeFi TVL rollup (DefiLlama)
 *
 * Returns the macro picture that
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
import ecData from "@/data/electric-capital-stellar.json";
import { apiError } from "@/lib/api-error";
import { logApiHit } from "@/lib/api-usage";
import { computeEcosystemGaps, GAP_VERTICALS } from "@/lib/ecosystem-gaps";
import { fetchAllDoraHacksHackathons } from "@/lib/integrations/dorahacks";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import {
	ACTIVE_PROJECT_STATUSES,
	type PopulationScope,
	populationScope,
} from "@/lib/population";
import { parseDate, TVL_FRESH_DAYS, tvlReadingOf } from "@/lib/status-checks";

export const dynamic = "force-dynamic";
export const revalidate = 600;

const VALID_DIMENSIONS = [
	"all",
	"hackathons",
	"categories",
	"funding",
	"tvl",
	"gaps",
	"developers",
	"toolchain",
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

/** sls-044: projectSetHash, the sha256 prefix of a sorted slug list, hashed
 * in the order given: a stored list is checked exactly as it was written. */
function setHashOf(sortedSlugs: readonly string[]): string {
	return createHash("sha256")
		.update(sortedSlugs.join("\n"))
		.digest("hex")
		.slice(0, 16);
}

/** A stored snapshot's slugs when it can be a baseline, else null: a list
 * that is non-empty, matches its count and total, and reproduces its own
 * hash. #1914: requests whose project read failed stored the EMPTY set
 * (e3b0c44298fc1c14, sha256 of nothing) 13 times, and the delta against one
 * listed every awarded project as added. */
function baselineSlugsOf(s: FundingSnapshotDoc): string[] | null {
	const slugs = Array.isArray(s.awardedSlugs)
		? s.awardedSlugs.filter((x): x is string => typeof x === "string")
		: [];
	return slugs.length > 0 &&
		slugs.length === s.scfAwardedProjects &&
		typeof s.scfTotalDistributedUSD === "number" &&
		setHashOf(slugs) === s.projectSetHash
		? slugs
		: null;
}

/** How many stored snapshots, newest first, the baseline search reads. */
const SNAPSHOT_WINDOW = 10;

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
	const startedAt = Date.now();
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
	const includeDevelopers =
		dimensionParam === "all" || dimensionParam === "developers";
	const includeToolchain =
		dimensionParam === "all" || dimensionParam === "toolchain";

	// #1914: a failed read is an outage, never a 200 with zero totals or a
	// missing block: say so, cache nothing, store nothing.
	const outage = (read: string) => {
		logApiHit({
			req,
			endpoint: "/api/analyze",
			filters: { dimension: dimensionParam },
			status: 503,
			startedAt,
		});
		return apiError({
			status: 503,
			error: `${read} failed`,
			advisory: `The ${read} behind this rollup failed. This is an outage, NOT a claim that any count, total or TVL is zero, and nothing was stored. Retry after Retry-After.`,
			retryAfterSeconds: 2,
			startedAt,
		});
	};
	// Blocks a dimension=all response serves as null, each with its reason:
	// that response is partial, so it is never cached as a full answer.
	const warnings: string[] = [];
	// #1914 review: a new funding snapshot is stored last, once no read whose
	// failure answers 503 (projects, repos scan) is left, so a 503 never
	// follows a write. A failed DoraHacks read under dimension=all answers 200
	// with hackathons null and does not stop it: the snapshot depends only on
	// the projects read.
	let pendingSnapshot: {
		projectSetHash: string;
		scfAwardedProjects: number;
		scfTotalDistributedUSD: number;
		methodologyVersion: string;
		awardedSlugs: string[];
		computedAt: string;
	} | null = null;

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
		let doraFailed = false;
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
			// Review 2026-11-04: this served zero events and a zero prize pool,
			// cached for 10 minutes. dimension=all keeps its other blocks.
			if (dimensionParam === "hackathons") return outage("DoraHacks read");
			doraFailed = true;
			warnings.push(
				"hackathons is null: the DoraHacks read failed this request, so its totals are unknown, not zero. Retry for the full rollup.",
			);
		}
		result.hackathons = doraFailed
			? null
			: {
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
	const needsProjects =
		includeCategories || includeFunding || includeTvl || includeGaps;
	let projects: ProjectDoc[] = [];
	let population: PopulationScope | null = null;
	if (payload && needsProjects) {
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
			// population stays null: answered below
		}
	}
	// A failed projects read fell through with [] and served zero totals, a
	// gaps list calling every vertical absent, and a stored empty funding
	// snapshot (13 since July).
	if (needsProjects && !population) return outage("projects read");

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
				"Active projects only (status Live / Pre-Release / Development). Differs from /api/status.sources.projects, which counts the FULL collection incl. Inactive/other: don't merge the two without labeling the source.",
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
		const projectSetHash = setHashOf(awardedSlugs);

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
		// #1914: only a whole, non-empty awarded set is stored or compared.
		if (!awardedSlugs.length || population?.truncated) {
			deltaUnavailable = population?.truncated
				? `This read returned ${population.included} of ${population.totalAvailable} matching projects (meta.population.truncated), so its awarded set is partial: it is not stored as a snapshot and not compared against one.`
				: "This read found no awarded project, so it is not stored as a snapshot and not compared against one.";
		} else if (payload) {
			try {
				const snapRes = await payload.find({
					collection: "funding-snapshots",
					// An empty set is never a baseline (baselineSlugsOf).
					where: { scfAwardedProjects: { greater_than: 0 } },
					sort: "-computedAt",
					limit: SNAPSHOT_WINDOW,
					depth: 0,
					overrideAccess: true,
				});
				// Rows that can be a baseline, newest first, with their slugs.
				const snaps = (snapRes.docs as FundingSnapshotDoc[]).flatMap((s) => {
					const slugs = baselineSlugsOf(s);
					return slugs ? [{ ...s, slugs }] : [];
				});
				// The unbroken run of rows holding the current set: its oldest row
				// is when the set was first observed (rows written after an empty
				// one re-record a set already held).
				let run = 0;
				while (snaps[run]?.projectSetHash === projectSetHash) run++;
				const prev = snaps[run] ?? null;
				if (run) {
					// This response IS that stored set (amounts may still drift
					// within a set: amount revisions).
					snapshotAsOf = snaps[run - 1].computedAt ?? null;
				} else {
					// New set state (or first run): record it, once every read this
					// response needs has succeeded (stored at the end of the handler).
					snapshotAsOf = new Date().toISOString();
					pendingSnapshot = {
						projectSetHash,
						scfAwardedProjects: scfProjects.length,
						scfTotalDistributedUSD: totalUSD,
						methodologyVersion: FUNDING_METHODOLOGY_VERSION,
						awardedSlugs,
						computedAt: snapshotAsOf,
					};
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
					const prevSlugs = prev.slugs;
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
					// Exactly what was read: how many rows, how many hold this set,
					// how many failed the check, and whether the window was cut.
					const read = snapRes.docs.length;
					const skipped = read - snaps.length;
					const cut =
						read >= SNAPSHOT_WINDOW ? "; older history was not read" : "";
					const reread =
						" Re-read after the awarded set changes to receive addedProjects/removedProjects; a shifted headline before then is an amount revision within the SAME set (projectSetHash unchanged).";
					deltaUnavailable = run
						? `No valid prior funding snapshot with a different project set among the ${read} most recent non-empty stored snapshots read (holding this set: ${run}${skipped ? `; skipped as empty or incomplete: ${skipped}` : ""})${cut}; snapshotAsOf is the oldest row read that holds this set.${reread}`
						: read
							? `None of the ${read} most recent non-empty stored snapshots read is a valid baseline (each is empty or incomplete)${cut}, so snapshotAsOf is this response's time.${reread}`
							: `No non-empty funding snapshot is stored yet, so snapshotAsOf is this response's time.${reread}`;
				}
			} catch {
				deltaUnavailable =
					"Snapshot store unavailable this request; the current-vs-previous comparison could not be computed. The funding totals above are unaffected.";
			}
		} else {
			deltaUnavailable =
				"Snapshot store unavailable this request; the current-vs-previous comparison could not be computed. The funding totals above are unaffected.";
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
				"snapshotAsOf = when the CURRENT projectSetHash was first observed (persisted snapshot time). previousSnapshot = the most recent stored snapshot with a DIFFERENT project set whose stored slug list is non-empty and reproduces its hash (an empty or incomplete snapshot, such as one a failed read wrote, is never a baseline, and an empty or truncated read is never stored); snapshotDelta lists the slugs added/removed between it and this response, with mechanical reason codes for removals (dedupe = record now points at a canonical slug; eligibility-reclassification = record left the active status pool; source-correction = scf.awarded corrected to false; unknown = no mechanical signal). totalUSDDelta = this response's total minus the previous snapshot's. When snapshotDelta is null, deltaUnavailable says why (no valid differing prior snapshot, an empty or truncated read, or store unavailable); never infer a cause from headline drift alone.",
			countBasis:
				"Counts distinct PROJECTS with scf.awarded=true (not awarded submissions; SDF's own counters count submissions, so totals differ by design). Dollar totals are in-house reconstructions: SCF does not publish per-award amounts for all rounds (some are XLM-denominated or undisclosed; see scfAmountStatus on project rows), so cross-source totals can legitimately disagree. Round membership comes from official award pages. byRound apportions each project's total equally across its awarded rounds because per-round amounts are unpublished. NOTE: byRound[].count is per-round MEMBERSHIP (a project is counted in each round it won), so the sum of byRound counts is intentionally GREATER than scfAwardedProjects; never add round counts to get a project total.",
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
		// #1912, review 2026-11-04: one parse dates and flags each reading (a
		// future or unparseable date dates nothing), and each figure is rounded
		// once, so the stale part, the rows and the total add up.
		const now = new Date();
		const readings = projects
			.filter((p) => typeof p.tvlUSD === "number")
			.map((p) => {
				const { at, stale } = tvlReadingOf(p.tvlUSD, p.tvlAsOf, now);
				const row = {
					slug: p.slug ?? null,
					name: p.name ?? null,
					tvlUSD: Math.round(p.tvlUSD ?? 0),
					tvlAsOf: parseDate(p.tvlAsOf),
					tvlStale: stale === true,
				};
				return { row, at };
			})
			.sort((a, b) => b.row.tvlUSD - a.row.tvlUSD);
		const stale = readings.filter((r) => r.row.tvlStale);
		const sum = (rs: typeof readings) =>
			rs.reduce((s, r) => s + r.row.tvlUSD, 0);
		const totalTvlUSD = sum(readings);
		const staleTvlUSD = sum(stale);
		// asOf alone (the newest reading) dated a total that was 84% readings
		// 7 and 12 weeks old on 2026-11-02; oldestAsOf dates the other end.
		const datesOf = (rs: typeof readings) =>
			rs.flatMap((r) => (r.at ? [r.at] : [])).sort();
		const dates = datesOf(readings);
		const oldestStale = datesOf(stale)[0]?.slice(0, 10);
		const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
		result.tvl = {
			totalTvlUSD,
			staleTvlUSD,
			trackedProjects: readings.length,
			asOf: dates.at(-1) ?? null,
			oldestAsOf: dates[0] ?? null,
			staleWarning: stale.length
				? `${stale.length} of ${readings.length} tracked projects carry a TVL reading that is not from the last ${TVL_FRESH_DAYS} days (${oldestStale ? `oldest ${oldestStale}` : "none with a usable date"}): ${usd(staleTvlUSD)}, ${totalTvlUSD ? Math.round((staleTvlUSD / totalTvlUSD) * 100) : 0}% of totalTvlUSD; the other ${usd(totalTvlUSD - staleTvlUSD)} was read within ${TVL_FRESH_DAYS} days. Only the date is checked, not why a reading is old. Cite the total with this caveat; staleProjects lists the rows.`
				: null,
			provider: "DefiLlama",
			top10: readings.slice(0, 10).map((r) => r.row),
			staleProjects: stale.map((r) => r.row),
			basis: `Sum of per-project tvlUSD across ACTIVE directory projects tracked on DefiLlama (tvlUSD != null; null = not tracked there, never zero: untracked protocols are simply absent, so this UNDERCOUNTS chain-wide TVL), each figure rounded to the dollar once, so totalTvlUSD, staleTvlUSD and the rows add up. Values are per-protocol DefiLlama totals refreshed weekly: asOf = the newest usable per-project tvlAsOf, oldestAsOf = the oldest. A reading whose tvlAsOf is more than ${TVL_FRESH_DAYS} days old, or missing, unparseable or in the future, is stale; only the date is checked, not why the reading is old. A stale reading stays in totalTvlUSD, never dropped or zeroed, and is summed in staleTvlUSD, listed in staleProjects and named in staleWarning; totalTvlUSD minus staleTvlUSD is the part read within ${TVL_FRESH_DAYS} days. CEX reserve rows excluded; a cross-chain protocol's figure follows DefiLlama's own protocol accounting. As-of dated: never an exact to-the-dollar live figure. Per-project tvlUSD/tvlAsOf/tvlStale also ride each /api/projects/search row.`,
		};
	}

	if (includeGaps) {
		// Whitespace signal (2026-07-21): the "where should I build / what's
		// under-served" question, derived from the SAME active-project fetch —
		// per-vertical coverage + three honest gap kinds (see ecosystem-gaps.ts).
		// Supply-side only; the basis field spells out that gap ≠ demand.
		result.gaps = computeEcosystemGaps(projects, GAP_VERTICALS);
	}

	if (includeDevelopers) {
		// "How many active developers on Stellar?" (2026-07-21 SDF/institution
		// battery): the fresh Electric Capital snapshot lives in the repo
		// (src/data/electric-capital-stellar.json, refreshed weekly) but had no
		// queryable API surface, so the question fell back to stale EC PDFs in
		// the research corpus. Serve the current structured number here, dated,
		// with month/year deltas so the trend is answerable — never an undated
		// count. All figures are Electric Capital's Open Dev Data methodology
		// (git-commit-derived monthly-active developers), not a headcount.
		const mad = ecData.mad;
		const pct = (from: number, to: number): number | null =>
			from > 0 ? Math.round(((to - from) / from) * 1000) / 10 : null;
		const topPeers = Array.isArray(ecData.peers)
			? [...ecData.peers]
					.sort((a, b) => (b.current ?? 0) - (a.current ?? 0))
					.slice(0, 6)
					.map((p) => ({ chain: p.name, monthlyActiveDevs: p.current }))
			: [];
		result.developers = {
			asOf: ecData.asOf,
			source: ecData.source,
			sourceUrl: ecData.sourceUrl ?? null,
			monthlyActiveDevs: {
				total: mad.total,
				// Devs building ONLY on Stellar vs. also on other chains — the
				// "exclusive" figure is the truer measure of committed builders.
				exclusive: mad.exclusive,
				multichain: mad.multichain,
				allTimePeak: mad.allTimePeak,
				allTimePeakDay: mad.allTimePeakDay,
				trend: {
					vs30dAgo: mad.thirtyDaysAgo,
					vs90dAgo: mad.ninetyDaysAgo,
					vs1yAgo: mad.oneYearAgo,
					momPct: pct(mad.thirtyDaysAgo, mad.total),
					yoyPct: pct(mad.oneYearAgo, mad.total),
				},
			},
			commits28d: ecData.commits28d?.total ?? null,
			tenure: ecData.tenure ?? null,
			geography: ecData.geo
				? {
						located: ecData.geo.located,
						unknown: ecData.geo.unknown,
						topCountries: (ecData.geo.topCountries ?? []).slice(0, 5),
					}
				: null,
			// Peer chains for scale context — Stellar's MAD next to the majors.
			peerChains: topPeers,
			basis:
				"Electric Capital Open Dev Data: monthly-active developers = distinct authors of code commits to Stellar-ecosystem open-source repos in the trailing 28 days (NOT a headcount or payroll figure; closed-source and non-committing contributors are uncounted). `exclusive` builds only on Stellar; `multichain` also commits to other ecosystems. Dated by asOf; deltas are point-in-time vs the snapshot. Peer MAD is the same methodology per chain for scale, not a quality ranking.",
		};
	}

	// ── Toolchain rollup (code-truth track): which SDK generations the
	// scanned Soroban corpus actually sits on, plus the deprecated roster —
	// the "who is on an unsupported toolchain" report internal platform/devrel
	// teams ask for. Presence facts (ciPresent/testsPresent) ride along as an
	// engineering-practice snapshot. Commit-side, as-of the last scans.
	if (includeToolchain && payload) {
		try {
			// The cap was 2000 while scannedRepos reported totalDocs (5616 on
			// 2026-09-03), so the buckets summed to exactly the limit under a
			// headline nearly 3x larger. "107 deprecated of 5616" reads as 1.9%
			// when the measured rate is 5.4% - a 2.8x understatement of the one
			// question this rollup exists to answer. The select is six small
			// fields, so the corpus fits; measuredRepos below reports what was
			// actually counted either way, so a future overflow states itself
			// instead of quietly deflating the rate.
			const TOOLCHAIN_SCAN_CAP = 20000;
			const scanned = await payload.find({
				collection: "repos",
				where: { sorobanSdkVersion: { exists: true } },
				limit: TOOLCHAIN_SCAN_CAP,
				depth: 0,
				overrideAccess: true,
				select: {
					fullName: true,
					projectSlug: true,
					sorobanSdkVersion: true,
					versionStatus: true,
					ciPresent: true,
					testsPresent: true,
				},
			});
			const byStatus: Record<string, number> = {};
			let ciCount = 0;
			let testsCount = 0;
			let practiceKnown = 0;
			const deprecated: Array<{
				fullName: string;
				projectSlug: string | null;
				sorobanSdkVersion: string | null;
			}> = [];
			// biome-ignore lint/suspicious/noExplicitAny: select-narrowed docs
			for (const r of scanned.docs as any[]) {
				const st =
					typeof r.versionStatus === "string" ? r.versionStatus : "unknown";
				byStatus[st] = (byStatus[st] ?? 0) + 1;
				if (typeof r.ciPresent === "boolean") {
					practiceKnown += 1;
					if (r.ciPresent) ciCount += 1;
					if (r.testsPresent) testsCount += 1;
				}
				if (st === "deprecated" && deprecated.length < 50)
					deprecated.push({
						fullName: String(r.fullName),
						projectSlug: r.projectSlug ?? null,
						sorobanSdkVersion: r.sorobanSdkVersion ?? null,
					});
			}
			const measuredRepos = (scanned.docs as unknown[]).length;
			result.toolchain = {
				scannedRepos: scanned.totalDocs,
				// The denominator the buckets below were actually computed over.
				// Rates must divide by THIS, not by scannedRepos: the two are equal
				// only when nothing was truncated.
				measuredRepos,
				measurementComplete: measuredRepos >= scanned.totalDocs,
				byVersionStatus: byStatus,
				deprecatedRepos: deprecated,
				deprecatedTotal: byStatus.deprecated ?? 0,
				// deprecatedRepos is a sample capped at 50; deprecatedTotal is the
				// real count, so the roster length is never mistaken for it.
				deprecatedListTruncated: (byStatus.deprecated ?? 0) > deprecated.length,
				engineeringPractice: {
					reposWithPracticeFacts: practiceKnown,
					ciPresent: ciCount,
					testsPresent: testsCount,
				},
				basis:
					"Soroban-SDK toolchain status per scanned repo (soroban-versions.ts dated table; 'unknown' = version unparsed, never a demotion). deprecatedRepos capped at 50, deprecatedTotal is the full count. engineeringPractice counts repos whose latest scan recorded tree-level CI/test presence: presence facts only, not CI results; reposWithPracticeFacts < scannedRepos until re-scans reach the corpus.",
			};
		} catch {
			// answered below: result.toolchain stays unset
		}
	}
	// The block went missing from a 200 when its read failed or the store
	// was down; a caller read the bare meta as "no toolchain data".
	if (includeToolchain && !result.toolchain) return outage("repos scan read");

	// No 503 can follow now: the projects and repos scan reads succeeded (a
	// failed DoraHacks read under dimension=all does not stop this). Best-effort:
	// a full storage tier degrades durability, never the funding numbers.
	if (pendingSnapshot && payload) {
		try {
			await payload.create({
				collection: "funding-snapshots",
				data: pendingSnapshot,
				overrideAccess: true,
			});
		} catch {
			// persistence failed (e.g. storage full); the delta above stands
		}
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
				...(warnings.length ? { warnings } : {}),
			},
			...result,
		},
		{
			headers: {
				"Cache-Control": warnings.length
					? "no-store"
					: "public, s-maxage=600, stale-while-revalidate=3600",
			},
		},
	);
}

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
