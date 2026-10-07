/**
 * Cross-hackathon BUILD search — the prior-art layer for hackathon prototypes.
 *
 *   GET /api/hackathons/builds?q=recurring%20payments
 *   GET /api/hackathons/builds?q=nft%20marketplace&winnersOnly=1
 *   GET /api/hackathons/builds?track=DeFi&limit=30
 *
 * The projects directory answers "what already SHIPPED", but a builder's idea
 * should also be checked against everything ever PROTOTYPED at a Stellar
 * hackathon — most of which never becomes a directory project. DoraHacks exposes
 * every submission ("buidl") per event; this flattens them ALL into one
 * topic-searchable index so "has anyone built X at a hackathon?" is answerable in
 * one call, with the event, placement/award, and links for each hit.
 *
 * Served from our own store (the hackathon-builds collection, filled daily by
 * scripts/sync-hackathon-builds.ts), with a live DoraHacks read as the
 * fallback; the flattened index is cached for an hour, so search is cheap.
 */
import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { distribution } from "@/lib/hackathon-analytics";
import {
	BUILD_FILTER_PARAMS,
	parseBuildFilters,
	queryBuilds,
} from "@/lib/hackathon-build-query";
import {
	getHackathonBuildsIndex,
	type IndexedBuild,
} from "@/lib/hackathon-builds";
import { clampLimit } from "@/lib/http-params";
import { parsePlacement } from "@/lib/integrations/dorahacks";
import { matchModeMeta } from "@/lib/match-mode";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { serverTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SUPPORTED_PARAMS = [...BUILD_FILTER_PARAMS, "limit"] as const;

// Index shape + builder live in src/lib/hackathon-builds.ts (shared with the
// builder profile pages); the hour-long cache is unstable_cache, not per instance.
async function getIndex(): Promise<IndexedBuild[]> {
	return getHackathonBuildsIndex();
}

export async function GET(req: NextRequest) {
	const startedAt = Date.now();
	const sp = req.nextUrl.searchParams;
	const unknown = [...new Set(sp.keys())].filter(
		(k) => !(SUPPORTED_PARAMS as readonly string[]).includes(k),
	);
	if (unknown.length) {
		return NextResponse.json(
			{
				error: `Unsupported query parameter(s): ${unknown.join(", ")}.`,
				supportedParams: SUPPORTED_PARAMS,
			},
			{ status: 400 },
		);
	}

	const parsed = parseBuildFilters(sp);
	if ("error" in parsed)
		return NextResponse.json(parsed.error, { status: 400 });
	const f = parsed.filters;
	const q = f.q || undefined;
	const limit = clampLimit(sp.get("limit"), 20, 100);

	let indexed: IndexedBuild[];
	try {
		indexed = await getIndex();
	} catch {
		// A cold index that failed to build (an upstream timeout) is an outage,
		// not "no prior art": a warm instance keeps serving its last complete
		// index, a cold one asks the caller to retry.
		return NextResponse.json(
			{
				error: "hackathon builds index unavailable",
				advisory:
					"The prior-art index could not be built because the upstream roster read timed out. This is an outage, NOT a claim that nothing similar was built. Retry after a moment.",
				retryAfterSeconds: 2,
			},
			{
				status: 503,
				headers: { ...serverTiming(startedAt), "Retry-After": "2" },
			},
		);
	}
	const indexedTotal = indexed.length;

	// Filters, scoring and the meaning fallback live in
	// src/lib/hackathon-build-query.ts, shared with analyze, so the operations
	// read the same set the same way.
	const { scored, served: mode, warnings } = await queryBuilds(indexed, f);

	const builds = scored.slice(0, limit).map(({ b, matched, similarity }) => ({
		// Opens the full submission in getHackathonBuild.
		id: b.id,
		name: b.name,
		description: b.description,
		hackathon: b.hackathon.title,
		hackathonSlug: b.hackathon.slug,
		endedAt: b.hackathon.endedAt,
		track: b.track,
		placement: b.hackathonPlacement,
		award: b.award,
		// What this project actually won, parsed from its own placement string.
		// `award` is the CATEGORY title and is shared by every placement inside
		// it: DoraHacks nests prizes under an award_list entry, so all five
		// winners of Stellar Hacks: Real-World ZK carry award "$10,000 XLM
		// Prize" while placing 1st ($5,000) through 5th ($750) — the five sum
		// to that pool. Reading `award` as one winner's prize overstates 3rd
		// place by 8x and makes the winners sum to 5x the pot.
		prizeUsd: parsePlacement(b.hackathonPlacement).prizeUsd || null,
		isWinner: b.isWinner,
		votes: b.voteCount,
		url: b.url,
		githubUrl: b.githubUrl,
		demoUrl: b.demoUrl,
		// Present only when the link was checked: the directory project that
		// lists this build's exact repo, or null when none does.
		...(b.project !== undefined ? { project: b.project } : {}),
		// Present only when the repo was read: absent is unknown.
		...(b.stack ? { stack: b.stack } : {}),
		// Present only when categorized: best first.
		...(b.categories ? { categories: b.categories.map((c) => c.type) } : {}),
		...(matched.length ? { matchedTerms: matched } : {}),
		...(similarity !== undefined
			? { similarity: Math.round(similarity * 1000) / 1000 }
			: {}),
	}));

	try {
		logApiHit({
			endpoint: "/api/hackathons/builds",
			query: q,
			req,
			startedAt,
			status: 200,
		});
	} catch {}

	return NextResponse.json(
		{
			meta: {
				...matchModeMeta(
					!q
						? "all"
						: mode === "meaning"
							? "vector"
							: mode === "hybrid"
								? "hybrid"
								: "filtered",
				),
				mode: { requested: f.mode, served: mode },
				...(warnings.length ? { warnings } : {}),
				source: "https://stellarlight.xyz/api/hackathons/builds",
				upstream: "dorahacks.io",
				generatedAt: new Date().toISOString(),
				filters: {
					q: q ?? null,
					winnersOnly: f.winnersOnly,
					hackathon: f.hackathons.length ? f.hackathons : null,
					track: f.track ?? null,
					category: f.category ?? null,
					package: f.package ?? null,
					limit,
					mode: f.mode,
				},
				counts: {
					indexedBuilds: indexedTotal,
					matched: scored.length,
					returned: builds.length,
				},
				// Over every matched build, not just this page: "which SDKs do
				// winners use" is winnersOnly=1 with no q.
				stack: {
					...stackMeta(scored.map((s) => s.b)),
					note: "Stellar packages declared in each matched build's repo manifests (package.json, Cargo.toml). Counted over buildsRead; the other matched builds have no repo link, a repo that is not public, or were not read yet: unknown, not 'uses none'.",
				},
				note: q
					? "Prior art over hackathon PROTOTYPES (DoraHacks submissions); most never become directory projects. Ordered by how many of the query's concepts a build covers, then prize winners first. A hit means someone already built something similar at a Stellar hackathon: check `url` or `githubUrl` before rebuilding, and `project` for what it became. No hit is NOT proof it was never tried (DoraHacks-sourced; non-winners can have thin descriptions)."
					: "No q: prize winners first across all Stellar hackathons. Pass q to check prior art ('has anyone built X at a hackathon?').",
			},
			builds,
		},
		{ headers: serverTiming(startedAt) },
	);
}

/** meta.stack, the package facet in the shape it shipped with (spec 1.9.68). */
function stackMeta(builds: IndexedBuild[]) {
	const d = distribution(builds, "package", { top: 15 });
	return {
		buildsMatched: d.builds,
		buildsRead: d.known,
		packages: d.values.map((v) => ({
			name: v.value,
			builds: v.builds,
			winners: v.winners,
		})),
	};
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
