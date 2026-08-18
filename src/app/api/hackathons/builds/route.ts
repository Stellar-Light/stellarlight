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
 * Read-through + module-cached (buidl rosters are DoraHacks-fetch-cached 1h, and
 * the flattened index is held in-memory per instance) so search is cheap.
 */
import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import {
	getHackathonBuildsIndex,
	type IndexedBuild,
	searchHackathonBuilds,
} from "@/lib/hackathon-builds";
import {
	BOOL_FALSE_VALUES,
	BOOL_TRUE_VALUES,
	clampLimit,
	strictBoolParam,
} from "@/lib/http-params";
import {
	type DoraHacksSubmission,
	fetchAllDoraHacksHackathons,
	fetchHackathonSubmissions,
} from "@/lib/integrations/dorahacks";
import { methodNotAllowed } from "@/lib/method-not-allowed";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SUPPORTED_PARAMS = ["q", "limit", "winnersOnly", "track"] as const;

// Index shape + builder live in src/lib/hackathon-builds.ts (shared with the
// builder profile pages); the hour-long cache is unstable_cache, not per instance.
async function getIndex(): Promise<IndexedBuild[]> {
	return getHackathonBuildsIndex();
}

export async function GET(req: NextRequest) {
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

	const q = sp.get("q")?.toLowerCase().trim();
	const limit = clampLimit(sp.get("limit"), 20, 100);
	// Engine E invalid-accepted class: a garbage value silently coerced to
	// false returned the UNFILTERED list while the caller believed the filter
	// applied. 400 with the accepted forms, same treatment as partners'
	// accepting param.
	const winnersOnlyRaw = strictBoolParam(sp.get("winnersOnly"));
	if (winnersOnlyRaw === "invalid") {
		return NextResponse.json(
			{
				error: `Invalid winnersOnly value '${sp.get("winnersOnly")}'.`,
				validValues: [...BOOL_TRUE_VALUES, ...BOOL_FALSE_VALUES],
			},
			{ status: 400 },
		);
	}
	const winnersOnly = winnersOnlyRaw;
	const track = sp.get("track")?.toLowerCase().trim();

	let indexed: IndexedBuild[];
	try {
		indexed = await getIndex();
	} catch {
		indexed = [];
	}
	const indexedTotal = indexed.length;

	// Scoring lives in src/lib/hackathon-builds.ts (searchHackathonBuilds) so
	// the hackathon-brief composite can call it in-process — this route and
	// the composite share one implementation and cannot drift.
	const scored = searchHackathonBuilds(indexed, q ?? "", {
		winnersOnly,
		track,
	});

	const builds = scored.slice(0, limit).map(({ b, matched }) => ({
		name: b.name,
		description: b.description,
		hackathon: b.hackathon.title,
		hackathonSlug: b.hackathon.slug,
		endedAt: b.hackathon.endedAt,
		track: b.track,
		placement: b.hackathonPlacement,
		award: b.award,
		isWinner: b.isWinner,
		votes: b.voteCount,
		url: b.url,
		githubUrl: b.githubUrl,
		demoUrl: b.demoUrl,
		...(matched.length ? { matchedTerms: matched } : {}),
	}));

	try {
		logApiHit({ endpoint: "/api/hackathons/builds", query: q, req });
	} catch {}

	return NextResponse.json({
		meta: {
			source: "https://stellarlight.xyz/api/hackathons/builds",
			upstream: "dorahacks.io",
			generatedAt: new Date().toISOString(),
			filters: { q: q ?? null, winnersOnly, track: track ?? null, limit },
			counts: {
				indexedBuilds: indexedTotal,
				matched: scored.length,
				returned: builds.length,
			},
			note: q
				? "Prior-art over hackathon PROTOTYPES (DoraHacks buidls) — most never become directory projects. A hit means someone already built something similar at a Stellar hackathon; check `url`/`githubUrl` before rebuilding. Absence here is NOT proof it's never been tried (DoraHacks-sourced; non-winners can have thin descriptions)."
				: "No q — returning winners + most-voted builds across all Stellar hackathons. Pass q to check prior art ('has anyone built X at a hackathon?').",
		},
		builds,
	});
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
