/**
 * Public read-only topic clusters across the Stellar projects directory.
 *
 *   GET /api/clusters
 *   GET /api/clusters?dimension=category   (default; coarse 7-cat split)
 *   GET /api/clusters?dimension=types      (finer subtype: Wallet, DEX, Lending, …)
 *   GET /api/clusters?minSize=3            (only clusters with ≥N projects)
 *   GET /api/clusters?key=RWA             (just one cluster, resolved across BOTH
 *                                          dimensions — RWA/Wallet are *types*,
 *                                          Infrastructure is a *category*)
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
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import {
	ACTIVE_PROJECT_STATUSES,
	type PopulationScope,
	populationScope,
} from "@/lib/population";

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

function buildClusters(
	docs: ProjectDoc[],
	dimension: Dimension,
	minSize: number,
): ClusterRow[] {
	const buckets = new Map<string, ProjectDoc[]>();
	for (const p of docs) {
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

	const clusters: ClusterRow[] = [];
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
		// Crowdedness 1–10, log-scaled so the score *differentiates* across cluster
		// sizes (size 6 → ~3, 30 → ~5, 120 → ~7, 200 → ~8); SCF funding + winners
		// add a smaller modifier so a well-funded small cluster can outrank a huge
		// unfunded one.
		const sizeContribution = Math.log2(projects.length + 1);
		const scfBonus = Math.log2(scfFunded.length + 1);
		const winnerBonus = Math.log2(hackathonWinners.length + 1) * 0.5;
		const crowdedness = Math.max(
			1,
			Math.min(10, Math.round(sizeContribution + scfBonus + winnerBonus)),
		);

		// Sort projects by "interestingness" — SCF-funded first, then prize, then name
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
	return clusters;
}

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const rawDimension = sp.get("dimension")?.trim() ?? "";
	const minSize = Math.max(1, Number(sp.get("minSize") || "1") || 1);

	// Value filter: "give me THE RWA cluster", not the whole list. Accept
	// key/category/type/q as aliases. RWA/Wallet/etc. are *types* while
	// Infrastructure/Tooling are *categories*, so a value is resolved across BOTH
	// dimensions rather than requiring the caller to know which one it lives in.
	const valueFilter = (
		sp.get("key") ??
		sp.get("category") ??
		sp.get("type") ??
		sp.get("q") ??
		""
	).trim();

	// Resolve the clustering dimension. Declared as an enum [category, types] in
	// the OpenAPI, so an unrecognized value is a 400 (matches the 400+validX pattern
	// on the other endpoints). To target one cluster, use `key`/`category`/`type`.
	let dimension: Dimension = "category";
	if (rawDimension === "category" || rawDimension === "types") {
		dimension = rawDimension;
	} else if (rawDimension) {
		return NextResponse.json(
			{
				error: `Invalid dimension '${rawDimension}'.`,
				validDimensions: VALID_DIMENSIONS,
			},
			{ status: 400 },
		);
	}

	const payload = await getPayloadSafe();
	let clusters: ClusterRow[] = [];
	let availableKeys: string[] = [];
	let matchedDimension: Dimension | null = null;
	let population: PopulationScope | null = null;

	if (payload) {
		try {
			const result = await payload.find({
				collection: "projects",
				where: { status: { in: [...ACTIVE_PROJECT_STATUSES] } },
				// sls-042: this was `limit: 500` with no pagination, so the cluster
				// input silently truncated at 500 of ~840 active projects — and the
				// missing tail wasn't category-neutral, so /api/clusters and
				// /api/analyze?dimension=categories named DIFFERENT funded-share
				// winners from what looked like the same population. Mirror
				// analyze's fetch: positive `select` of only the aggregation fields
				// (cheap on the M0 tier — the old `embedding:false` exclusion still
				// dragged every other heavy field) + a cap far above the collection
				// size. `population.truncated` (below) makes any future overflow
				// answer-visible instead of silent.
				limit: 5000,
				depth: 0,
				select: {
					name: true,
					slug: true,
					category: true,
					types: true,
					status: true,
					shortDescription: true,
					scf: true,
					hackathonPlacement: true,
					hackathonPrize: true,
				},
			});
			const docs = result.docs as unknown as ProjectDoc[];
			// sls-048: answer-visible scope digest — same shape as /api/analyze,
			// so callers can verify the two populations are mechanically
			// comparable before merging/summing their numbers.
			population = populationScope({
				collection: "projects",
				statusScope: ACTIVE_PROJECT_STATUSES,
				totalAvailable: result.totalDocs ?? docs.length,
				included: docs.length,
			});

			if (valueFilter) {
				// Resolve the value across both dimensions, prefer an exact
				// (case-insensitive) key match, fall back to substring.
				const all = [
					...buildClusters(docs, "category", minSize),
					...buildClusters(docs, "types", minSize),
				];
				availableKeys = all.map((c) => c.key);
				const vf = valueFilter.toLowerCase();
				let matches = all.filter((c) => c.key.toLowerCase() === vf);
				if (matches.length === 0)
					matches = all.filter((c) => c.key.toLowerCase().includes(vf));
				matches.sort((a, b) => b.crowdedness - a.crowdedness);
				clusters = matches;
				matchedDimension = matches[0]?.dimension ?? null;
			} else {
				clusters = buildClusters(docs, dimension, minSize);
				clusters.sort((a, b) => b.crowdedness - a.crowdedness);
			}
		} catch {
			// fall through
		}
	}

	logApiHit({
		req,
		endpoint: "/api/clusters",
		filters: { dimension, minSize, valueFilter: valueFilter || undefined },
	});

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/directory",
				generatedAt: new Date().toISOString(),
				filters: {
					dimension: valueFilter ? matchedDimension : dimension,
					minSize,
					...(valueFilter ? { valueFilter, matchedDimension } : {}),
				},
				counts: { returned: clusters.length },
				// sls-042/048: the population this clustering aggregated. Compare
				// `population.id` with other quantitative endpoints before merging
				// numbers; `truncated: true` would mean the clusters are a sample,
				// not the full population. NOTE: category clusters bucket only
				// projects that HAVE the dimension value, so the sum of cluster
				// sizes can be ≤ population.included (analyze buckets the remainder
				// as "Uncategorized").
				population,
				dimensions: VALID_DIMENSIONS,
				notes: {
					crowdedness:
						"Score 1–10, log-scaled: round(log₂(size+1) + log₂(scfFunded+1) + 0.5×log₂(winners+1)), clipped to [1,10]. Log scaling means a cluster of 200 projects ≈ 8/10 vs 6 projects ≈ 3/10 — actually differentiates, unlike a linear formula. Use to identify saturated vs underbuilt lanes; cross-reference .size and .scfFundedCount for the raw numbers.",
				},
				// When a value filter matched nothing, tell the caller what IS
				// available instead of returning a bare empty list.
				...(valueFilter && clusters.length === 0
					? {
							advisory: {
								summary: `No cluster matches '${valueFilter}'. Pass one of the available keys, or omit the filter to list all clusters for a dimension.`,
								availableKeys,
							},
						}
					: {}),
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

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
