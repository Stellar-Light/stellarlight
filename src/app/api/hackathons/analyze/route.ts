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
	COVERAGE_VALUES,
	categoryMeasures,
	type Distribution,
	distribution,
	distributionBy,
	FACET_IDS,
	FACETS,
	type FacetId,
	GROUP_FACETS,
	type GroupFacetId,
	incompleteEvents,
	leftOutWarning,
	winnersOnlyEvents,
	winnersOnlyWarning,
	winnersVsOthers,
	withoutShares,
} from "@/lib/hackathon-analytics";
import {
	BUILD_FILTER_PARAMS,
	listedEvents,
	MEANING_NEIGHBOURS,
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
	// After the index read: a hackathon value is checked against its events.
	const parsed = await parseBuildFilters(sp, "keyword", indexed, listedEvents);
	if ("error" in parsed)
		return NextResponse.json(parsed.error, { status: 400 });
	const f = parsed.filters;

	const { scored, field, served, warnings } = await queryBuilds(indexed, f);
	warnings.unshift(...parsed.warnings);
	if (f.q && served !== "keyword")
		warnings.push(
			`Counted by meaning: at most the ${MEANING_NEIGHBOURS} submissions nearest the query that clear the similarity floor, and a neighbour in meaning is not proof a build is about the topic. For a share of a topic, keyword mode counts every build that names it.`,
		);
	// A value no stored submission carries would read as a count of zero: say
	// so, with the values that do occur. A type the method never assigns is
	// unknown, not zero.
	if (value && !distribution(indexed, facet, { value }).values[0]?.builds) {
		const seen = distribution(indexed, facet, {
			top: Number.POSITIVE_INFINITY,
		}).values.map((v) => v.value);
		const named = `${seen.slice(0, 30).join(", ") || "none"}${seen.length > 30 ? `, and ${seen.length - 30} more (omit value to list them by count)` : ""}`;
		warnings.push(
			facet === "category"
				? `No submission is sorted into '${value}': the method assigns a type only where it is right 70% of the time on the hand-typed directory, and this one never gets there. Its share is unknown, not zero; count the topic with q instead (q=${value.toLowerCase()}, facet=event). Types assigned: ${named}.`
				: `No stored submission has ${facet} '${value}', so its 0 is a value that matched nothing, not a measured count. Values seen, most submissions first: ${named}.`,
		);
	}
	// No rate over incomplete rows (incompleteRows). Beside full listings they
	// are left out of every count and share, in one line: across every event
	// 12 curated winners made the winners 80 of 1,383 (5.8%), where the full
	// listings give 68 of 1,371. Alone, they keep their counts, shares null.
	const winnersOnly = winnersOnlyEvents(indexed);
	const incompleteSet = incompleteEvents(indexed);
	const incomplete = (b: IndexedBuild) => incompleteSet.has(b.hackathon.slug);
	const mixed = field.some((b) => !incomplete(b));
	const left = mixed ? field.filter(incomplete) : [];
	const counted = left.length ? field.filter((b) => !incomplete(b)) : field;
	const matched = scored
		.map((s) => s.b)
		.filter((b) => !left.length || !incomplete(b));
	const noShares = counted.length > 0 && !mixed;
	const shares = <T extends Distribution>(d: T): T =>
		noShares ? withoutShares(d) : d;
	const opts = { top, value };
	const total = {
		field: counted.length,
		...shares(distribution(matched, facet, opts)),
	};
	// A winners-only event's group says so; it is grouped only when such
	// rows are all the set holds.
	const groups = by
		? distributionBy(matched, counted, facet, by, opts).map((g) =>
				shares(
					by === "event" && winnersOnly.has(g.value)
						? { ...g, coverage: COVERAGE_VALUES[0] }
						: g,
				),
			)
		: undefined;
	if (left.length) {
		const byEvent = new Map([...winnersOnly.keys()].map((s) => [s, 0]));
		for (const b of left)
			byEvent.set(b.hackathon.slug, (byEvent.get(b.hackathon.slug) ?? 0) + 1);
		warnings.push(leftOutWarning([...byEvent].filter(([, n]) => n > 0)));
	}
	// Alone and not named by a hackathon value (which already warned).
	const unwarned = noShares
		? [...winnersOnly].filter(
				([slug]) =>
					counted.some((b) => b.hackathon.slug === slug) &&
					!f.hackathons.includes(slug),
			)
		: [];
	if (unwarned.length) warnings.push(winnersOnlyWarning(unwarned));
	const lift = noShares ? null : winnersVsOthers(matched, facet, opts);
	// How far each reported type's count can be trusted, from the lane's own
	// measurement on the hand-typed directory.
	let measured:
		| Array<{ type: string; precision: number; recall: number }>
		| undefined;
	if (facet === "category") {
		const m = categoryMeasures(indexed);
		const reported = new Set([
			...total.values.map((v) => v.value),
			...(groups ?? []).flatMap((g) => g.values.map((v) => v.value)),
		]);
		measured = [...reported]
			.filter((t) => m.has(t))
			.map((t) => ({
				type: t,
				...(m.get(t) as { precision: number; recall: number }),
			}));
	}

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
					...(measured ? { measured } : {}),
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
