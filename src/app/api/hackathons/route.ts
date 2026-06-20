/**
 * Public read-only Stellar hackathons endpoint.
 *
 *   GET /api/hackathons
 *   GET /api/hackathons?status=upcoming|active|completed
 *   GET /api/hackathons?organizer=stellar-development-foundation
 *   GET /api/hackathons?source=curated  // exclude DoraHacks live feed
 *
 * Returns a merged feed of:
 *   1. **Curated** hackathons from the Payload Hackathons collection
 *      (rich detail: winners, organizer, internal page).
 *   2. **Live** hackathons from DoraHacks (Stellar org IDs 3096 + 3853).
 *      Surfaces upcoming + active events that curators haven't yet
 *      mirrored into Payload.
 *
 * De-duplicated by external URL when possible. Powers the Stellar Scout
 * SKILL.md so AI agents can answer questions like "what Stellar
 * hackathons are coming up" or "who won the soroban track at Stellar
 * Hacks Agents".
 */

import { type NextRequest, NextResponse } from "next/server";
import { clampLimit } from "@/lib/http-params";
import { logApiHit } from "@/lib/api-usage";
import {
	type DoraHacksHackathon,
	fetchAllDoraHacksHackathons,
	getHackathonUrl,
} from "@/lib/integrations/dorahacks";
import { getPayloadSafe } from "@/lib/payload-client";

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface HackathonRow {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	startDate: string | null;
	endDate: string | null;
	status: string;
	externalUrl: string | null;
	organizer: { id: string; name: string; slug: string } | null;
	url: string;
	source: "curated" | "dorahacks";
	prizePoolUSD?: number;
	hackersCount?: number;
}

/** Map a DoraHacks status code + timing into our status enum. */
function doraStatus(
	h: DoraHacksHackathon,
): "upcoming" | "active" | "completed" {
	const now = Math.floor(Date.now() / 1000);
	if (h.start_time > now) return "upcoming";
	if (h.end_time < now) return "completed";
	return "active";
}

function doraToRow(h: DoraHacksHackathon): HackathonRow {
	const startDate = new Date(h.start_time * 1000).toISOString().slice(0, 10);
	const endDate = new Date(h.end_time * 1000).toISOString().slice(0, 10);
	const url = getHackathonUrl(h.uname);
	return {
		id: `dorahacks-${h.id}`,
		name: h.title,
		slug: h.uname,
		description: h.description ?? null,
		startDate,
		endDate,
		status: doraStatus(h),
		externalUrl: url,
		organizer: h.organization
			? {
					id: `dorahacks-org-${h.organization.id}`,
					name: h.organization.name,
					slug: h.organization.name.toLowerCase().replace(/\s+/g, "-"),
				}
			: null,
		url,
		source: "dorahacks",
		prizePoolUSD: h.bonus_price || undefined,
		hackersCount: h.hackers_count || undefined,
	};
}

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const statusFilter = sp.get("status");
	const organizerFilter = sp.get("organizer");
	const sourceFilter = sp.get("source"); // "curated" | "dorahacks" | undefined
	const limit = clampLimit(sp.get("limit"), 100, 300);

	// Validate enumerated params before doing work — silently returning the
	// unfiltered feed for `?status=garbage` confuses agents (they think the
	// filter applied + got empty results, but actually it was discarded).
	const VALID_STATUSES = ["upcoming", "active", "completed"] as const;
	if (statusFilter && !VALID_STATUSES.includes(statusFilter as never)) {
		return NextResponse.json(
			{
				error: `unknown status: '${statusFilter}'`,
				validStatuses: VALID_STATUSES,
			},
			{ status: 400 },
		);
	}
	const VALID_SOURCES = ["curated", "dorahacks"] as const;
	if (sourceFilter && !VALID_SOURCES.includes(sourceFilter as never)) {
		return NextResponse.json(
			{
				error: `unknown source: '${sourceFilter}'`,
				validSources: VALID_SOURCES,
			},
			{ status: 400 },
		);
	}

	let curated: HackathonRow[] = [];
	let dora: HackathonRow[] = [];

	// 1. Curated hackathons (Payload).
	if (sourceFilter !== "dorahacks") {
		const payload = await getPayloadSafe();
		if (payload) {
			try {
				// biome-ignore lint/suspicious/noExplicitAny: Payload Where type is awkward
				const where: any = {};
				if (
					statusFilter &&
					["upcoming", "active", "completed"].includes(statusFilter)
				) {
					where.status = { equals: statusFilter };
				}

				const result = await payload.find({
					collection: "hackathons",
					where,
					limit: 300,
					depth: 1,
					sort: "-startDate",
				});

				curated = (
					result.docs as Array<{
						id: string;
						name: string;
						slug: string;
						description?: string;
						startDate?: string;
						endDate?: string;
						status: string;
						externalUrl?: string;
						organizer?: { id: string; name: string; slug: string } | string;
					}>
				).map((h) => {
					const org =
						h.organizer && typeof h.organizer === "object"
							? {
									id: String(h.organizer.id),
									name: h.organizer.name,
									slug: h.organizer.slug,
								}
							: null;
					return {
						id: String(h.id),
						name: h.name,
						slug: h.slug,
						description: h.description ?? null,
						startDate: h.startDate ?? null,
						endDate: h.endDate ?? null,
						status: h.status,
						externalUrl: h.externalUrl ?? null,
						organizer: org,
						url: `https://stellarlight.xyz/hackathons/${h.slug}`,
						source: "curated",
					};
				});
			} catch {
				// fall through
			}
		}
	}

	// 2. Live DoraHacks feed.
	if (sourceFilter !== "curated") {
		try {
			const doraHackathons = await fetchAllDoraHacksHackathons();
			dora = doraHackathons.map(doraToRow);
		} catch {
			// fall through
		}
	}

	// 3. Merge. De-duplicate by externalUrl — if a curated entry already
	// points at a DoraHacks event, the curated one wins (richer detail).
	const curatedExternalUrls = new Set(
		curated.map((c) => c.externalUrl).filter(Boolean) as string[],
	);
	const dedupedDora = dora.filter(
		(d) => !d.externalUrl || !curatedExternalUrls.has(d.externalUrl),
	);

	let hackathons = [...curated, ...dedupedDora];

	// Apply filters that span both sources.
	if (
		statusFilter &&
		["upcoming", "active", "completed"].includes(statusFilter)
	) {
		hackathons = hackathons.filter((h) => h.status === statusFilter);
	}
	if (organizerFilter) {
		hackathons = hackathons.filter(
			(h) => h.organizer?.slug === organizerFilter,
		);
	}

	// Sort: upcoming → active → completed; within each bucket, most recent
	// startDate first.
	const bucketOrder = { upcoming: 0, active: 1, completed: 2 } as const;
	hackathons.sort((a, b) => {
		const ab = bucketOrder[a.status as keyof typeof bucketOrder] ?? 3;
		const bb = bucketOrder[b.status as keyof typeof bucketOrder] ?? 3;
		if (ab !== bb) return ab - bb;
		const at = a.startDate ? new Date(a.startDate).getTime() : 0;
		const bt = b.startDate ? new Date(b.startDate).getTime() : 0;
		return bt - at;
	});

	hackathons = hackathons.slice(0, limit);

	logApiHit({
		req,
		endpoint: "/api/hackathons",
		filters: { status: statusFilter, source: sourceFilter, limit },
	});

	// When a status-scoped query (e.g. ?status=upcoming) returns nothing,
	// tell the caller where else to look. DoraHacks publishes new Stellar
	// hackathons sporadically and our DB is curator-driven, so "0 upcoming"
	// is common between events. The agent should redirect the user to the
	// live channels rather than dead-end.
	const isForwardLookingQuery =
		statusFilter === "upcoming" || statusFilter === "active";
	const fallbackChannels =
		isForwardLookingQuery && hackathons.length === 0
			? {
					summary:
						"No upcoming or active hackathons in stellarlight's feed right now — between events. Check live channels for the next announcement.",
					channels: [
						{
							name: "@BuildOnStellar on X/Twitter",
							url: "https://x.com/BuildOnStellar",
							why: "Official Stellar Foundation builder channel — first to announce hackathons + sponsor briefs",
						},
						{
							name: "stellarlight.xyz/hackathons",
							url: "https://stellarlight.xyz/hackathons",
							why: "Live page including any curated upcoming events not yet in the API feed",
						},
						{
							name: "DoraHacks — Stellar Development Foundation",
							url: "https://dorahacks.io/org/3096",
							why: "DoraHacks org page where SDF posts new Stellar Hacks; prizes appear the moment registration opens",
						},
					],
				}
			: undefined;

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/hackathons",
				generatedAt: new Date().toISOString(),
				filters: {
					status: statusFilter,
					organizer: organizerFilter,
					source: sourceFilter,
					limit,
				},
				counts: {
					curated: curated.length,
					dorahacks: dora.length,
					returned: hackathons.length,
				},
				...(fallbackChannels ? { fallbackChannels } : {}),
			},
			hackathons,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
			},
		},
	);
}
