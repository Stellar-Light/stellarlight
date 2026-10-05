/**
 * Counts, trends and comparisons over every stored Stellar hackathon
 * submission: the analytics half of the prior-art layer.
 *
 *   GET /api/hackathons/analyze?facet=category&value=Payments&by=event
 *   GET /api/hackathons/analyze?facet=package&winnersOnly=1
 *   GET /api/hackathons/analyze?q=ai%20agents&facet=category
 *
 * One engine (src/lib/hackathon-analytics.ts) over the same filters search
 * takes (src/lib/hackathon-build-query.ts): `facet` says what to count, `by`
 * splits the count per event or year, and every answer carries winners
 * against everyone else in the same set. Shares are over the builds whose
 * value is known; unknown builds are counted apart.
 */
import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import {
	distribution,
	distributionBy,
	FACET_IDS,
	FACETS,
	type FacetId,
	GROUP_FACETS,
	type GroupFacetId,
	winnersVsOthers,
} from "@/lib/hackathon-analytics";
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
import { matchModeMeta } from "@/lib/match-mode";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { serverTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

const SUPPORTED_PARAMS = [
	...BUILD_FILTER_PARAMS,
	"facet",
	"by",
	"value",
	"top",
] as const;

export async function GET(req: NextRequest) {
	const startedAt = Date.now();
	const sp = req.nextUrl.searchParams;
	const unknown = [...new Set(sp.keys())].filter(
		(k) => !(SUPPORTED_PARAMS as readonly string[]).includes(k),
	);
	if (unknown.length)
		return NextResponse.json(
			{
				error: `Unsupported query parameter(s): ${unknown.join(", ")}.`,
				supportedParams: SUPPORTED_PARAMS,
			},
			{ status: 400 },
		);
	const facet = (sp.get("facet") ?? "category") as FacetId;
	if (!FACET_IDS.includes(facet))
		return NextResponse.json(
			{ error: `Invalid facet '${facet}'.`, validValues: FACET_IDS },
			{ status: 400 },
		);
	const byRaw = sp.get("by");
	if (byRaw && !(GROUP_FACETS as readonly string[]).includes(byRaw))
		return NextResponse.json(
			{ error: `Invalid by '${byRaw}'.`, validValues: GROUP_FACETS },
			{ status: 400 },
		);
	const by = (byRaw ?? undefined) as GroupFacetId | undefined;
	const parsed = parseBuildFilters(sp);
	if ("error" in parsed)
		return NextResponse.json(parsed.error, { status: 400 });
	const f = parsed.filters;
	const value = sp.get("value")?.trim() || undefined;
	const top = clampLimit(sp.get("top"), by ? 5 : 10, 30);

	let indexed: IndexedBuild[];
	try {
		indexed = await getHackathonBuildsIndex();
	} catch {
		return NextResponse.json(
			{
				error: "hackathon builds index unavailable",
				advisory:
					"The submissions index could not be built. This is an outage, not an empty answer. Retry after a moment.",
				retryAfterSeconds: 2,
			},
			{
				status: 503,
				headers: { ...serverTiming(startedAt), "Retry-After": "2" },
			},
		);
	}

	const { scored, field, served, warnings } = await queryBuilds(indexed, f);
	const matched = scored.map((s) => s.b);
	const opts = { top, value };
	const total = { field: field.length, ...distribution(matched, facet, opts) };
	const groups = by
		? distributionBy(matched, field, facet, by, opts)
		: undefined;
	const lift = winnersVsOthers(matched, facet, opts);

	try {
		logApiHit({
			endpoint: "/api/hackathons/analyze",
			query: f.q || undefined,
			req,
			startedAt,
			status: 200,
		});
	} catch {}

	return NextResponse.json(
		{
			meta: {
				...matchModeMeta(
					!f.q
						? "all"
						: served === "meaning"
							? "vector"
							: served === "hybrid"
								? "hybrid"
								: "filtered",
				),
				mode: { requested: f.mode, served },
				...(warnings.length ? { warnings } : {}),
				source: "https://stellarlight.xyz/api/hackathons/analyze",
				upstream: "dorahacks.io",
				generatedAt: new Date().toISOString(),
				filters: {
					q: f.q || null,
					winnersOnly: f.winnersOnly,
					hackathon: f.hackathons.length ? f.hackathons : null,
					track: f.track ?? null,
					category: f.category ?? null,
					package: f.package ?? null,
					mode: f.mode,
				},
				facet: {
					id: facet,
					counts: FACETS[facet].label,
					unknownMeans: FACETS[facet].unknown || null,
				},
				by: by ?? null,
				value: value ?? null,
				counts: { indexedBuilds: indexed.length },
				note: "Shares are over `known` (builds whose value is known); `unknown` builds are counted apart, never as none. A build can count under several categories or packages, so shares can sum past 1. `field` = builds passing every filter except q; builds / field is the share of the field that matched q. Groups by event run oldest first. winnersVsOthers compares winners with everyone else in the same set: lift above 1 = more common among winners. Small counts are noise: read `winners` and `others` before the lift.",
			},
			total,
			...(groups ? { groups } : {}),
			...(lift ? { winnersVsOthers: lift } : {}),
		},
		{ headers: serverTiming(startedAt) },
	);
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
