/**
 * Public read-only topic clusters across the Stellar projects directory.
 *
 *   GET /api/clusters
 *   GET /api/clusters?dimension=category   (default; coarse 7-cat split)
 *   GET /api/clusters?dimension=types      (finer subtype: Wallet, DEX, Lending, …)
 *   GET /api/clusters?minSize=3            (only clusters with ≥N projects)
 *
 * Returns a ranked list of project clusters with:
 *   - size: project count in cluster
 *   - crowdedness: 1–10 score using the formula in SKILL.md
 *     (count + 2× SCF-funded + 1× hackathon winners)
 *   - sample: up to 5 representative projects (highest scoring)
 *   - scfFundedCount, hackathonWinnerCount
 *
 * Powers two kinds of question:
 *   1. *"What's the most crowded category on Stellar?"* — sort by crowdedness
 *   2. *"Show me an underbuilt category"* — bottom of the crowdedness list
 *
 * Mirrors Colosseum Copilot's /clusters endpoint pattern.
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { getPayloadSafe } from "@/lib/payload-client";

export const dynamic = "force-dynamic";
export const revalidate = 600;

const VALID_DIMENSIONS = ["category", "types"] as const;
type Dimension = (typeof VALID_DIMENSIONS)[number];

interface ClusterRow {
	key: string;
	dimension: Dimension;
	size: number;
	scfFundedCount: number;
	scfTotalUSD: number;
	hackathonWinnerCount: number;
	crowdedness: number;
	sampleProjects: Array<{
		name: string;
		slug: string;
		shortDescription: string | null;
		scfAwarded: boolean;
		url: string;
	}>;
}

interface ProjectDoc {
	id: string;
	name: string;
	slug: string;
	category?: string;
	types?: string[] | string;
	status?: string;
	shortDescription?: string;
	scf?: { awarded?: boolean; totalAwarded?: number };
	hackathonPlacement?: string;
	hackathonPrize?: number;
}

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const dimensionParam = sp.get("dimension") ?? "category";
	const minSize = Math.max(1, Number(sp.get("minSize") || "1") || 1);

	if (!VALID_DIMENSIONS.includes(dimensionParam as never)) {
		return NextResponse.json(
			{
				error: `unknown dimension: '${dimensionParam}'`,
				validDimensions: VALID_DIMENSIONS,
			},
			{ status: 400 },
		);
	}
	const dimension = dimensionParam as Dimension;

	const payload = await getPayloadSafe();
	let clusters: ClusterRow[] = [];

	if (payload) {
		try {
			const result = await payload.find({
				collection: "projects",
				where: {
					status: { in: ["Development", "Pre-Release", "Live"] },
				},
				limit: 500,
				depth: 0,
			});

			// Build bucket map; one project contributes to N buckets if `types`
			// is a multi-valued field.
			const buckets = new Map<string, ProjectDoc[]>();
			for (const p of result.docs as unknown as ProjectDoc[]) {
				const keys: string[] = [];
				if (dimension === "category" && p.category) {
					keys.push(p.category);
				} else if (dimension === "types" && p.types) {
					if (Array.isArray(p.types)) keys.push(...p.types);
					else keys.push(p.types);
				}
				for (const k of keys) {
					if (!buckets.has(k)) buckets.set(k, []);
					buckets.get(k)?.push(p);
				}
			}

			// Score + sample each bucket
			for (const [key, projects] of buckets) {
				if (projects.length < minSize) continue;
				const scfFunded = projects.filter((p) => p.scf?.awarded);
				const scfTotal = scfFunded.reduce(
					(s, p) => s + (p.scf?.totalAwarded ?? 0),
					0,
				);
				const hackathonWinners = projects.filter(
					(p) =>
						p.hackathonPlacement === "grand-prize" ||
						p.hackathonPlacement === "1st" ||
						p.hackathonPlacement === "2nd" ||
						p.hackathonPlacement === "3rd" ||
						p.hackathonPlacement === "track-winner",
				);
				// Crowdedness 1–10. The first version used `size + 2×scfFunded
				// + winners` clipped to 10, which saturated to 10/10 for any
				// cluster larger than ~10 projects — useless for ranking.
				//
				// Log-scaled so the score *differentiates* across cluster
				// sizes:
				//   - size 6   → ~3
				//   - size 30  → ~5
				//   - size 120 → ~7
				//   - size 200 → ~8
				// SCF funding + hackathon-winner adds a smaller modifier on
				// top, so a well-funded small cluster can still outrank a
				// huge but unfunded one.
				const sizeContribution = Math.log2(projects.length + 1);
				const scfBonus = Math.log2(scfFunded.length + 1);
				const winnerBonus = Math.log2(hackathonWinners.length + 1) * 0.5;
				const crowdedness = Math.max(
					1,
					Math.min(10, Math.round(sizeContribution + scfBonus + winnerBonus)),
				);
				// Raw inputs are already exposed via .size, .scfFundedCount,
				// .hackathonWinnerCount — agents can recreate the formula.

				// Sort projects by "interestingness" — SCF-funded first, then by
				// hackathon prize, then alphabetical
				const ranked = [...projects].sort((a, b) => {
					const sa = (a.scf?.totalAwarded ?? 0) + (a.hackathonPrize ?? 0);
					const sb = (b.scf?.totalAwarded ?? 0) + (b.hackathonPrize ?? 0);
					if (sb !== sa) return sb - sa;
					return a.name.localeCompare(b.name);
				});

				clusters.push({
					key,
					dimension,
					size: projects.length,
					scfFundedCount: scfFunded.length,
					scfTotalUSD: scfTotal,
					hackathonWinnerCount: hackathonWinners.length,
					crowdedness,
					sampleProjects: ranked.slice(0, 5).map((p) => ({
						name: p.name,
						slug: p.slug,
						shortDescription: p.shortDescription ?? null,
						scfAwarded: !!p.scf?.awarded,
						url: `https://stellarlight.xyz/project/${p.slug}`,
					})),
				});
			}

			// Default sort: crowdedness desc (most crowded first)
			clusters.sort((a, b) => b.crowdedness - a.crowdedness);
		} catch {
			// fall through
		}
	}

	logApiHit({
		req,
		endpoint: "/api/clusters",
		filters: { dimension, minSize },
	});

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/directory",
				generatedAt: new Date().toISOString(),
				filters: { dimension, minSize },
				counts: { returned: clusters.length },
				dimensions: VALID_DIMENSIONS,
				notes: {
					crowdedness:
						"Score 1–10, log-scaled: round(log₂(size+1) + log₂(scfFunded+1) + 0.5×log₂(winners+1)), clipped to [1,10]. Log scaling means a cluster of 200 projects ≈ 8/10 vs 6 projects ≈ 3/10 — actually differentiates, unlike a linear formula. Use to identify saturated vs underbuilt lanes; cross-reference .size and .scfFundedCount for the raw numbers.",
				},
			},
			clusters,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
			},
		},
	);
}
