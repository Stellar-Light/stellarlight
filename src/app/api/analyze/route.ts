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

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { fetchAllDoraHacksHackathons } from "@/lib/integrations/dorahacks";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";

export const dynamic = "force-dynamic";
export const revalidate = 600;

const VALID_DIMENSIONS = [
	"all",
	"hackathons",
	"categories",
	"funding",
	"tvl",
] as const;

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
	if (payload && (includeCategories || includeFunding || includeTvl)) {
		try {
			const r = await payload.find({
				collection: "projects",
				where: {
					status: { in: ["Development", "Pre-Release", "Live"] },
				},
				// Select only the aggregation fields + raise the cap so the
				// breakdown covers ALL active projects. Was capped at 500, which
				// both truncated the distribution and mislabeled totalProjects
				// (a downstream consumer flagged status=917 vs analyze=500). The
				// select keeps the larger fetch cheap on the M0 tier.
				limit: 5000,
				depth: 0,
				select: {
					slug: true,
					name: true,
					category: true,
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
			methodologyVersion: "funding-v2 (2026-07-05)",
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
