/**
 * Single hackathon detail with full project submissions, winners, and
 * post-hackathon outcome funnel.
 *
 *   GET /api/hackathons/{slug}
 *
 * Returns the hackathon's metadata + every Project that's tagged with
 * `hackathon = {id}`, including placements, prize amounts, prize tracks,
 * and post-hack status (Built / In Progress / Abandoned).
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import {
	fetchAllDoraHacksHackathons,
	getHackathonUrl,
} from "@/lib/integrations/dorahacks";
import { getPayloadSafe } from "@/lib/payload-client";
import {
	getWinnerLink,
	LATEST_WINNERS,
} from "@/data/recent-hackathon-winners";

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface SubmissionRow {
	id: string;
	name: string;
	// null for curated winners that aren't (yet) Project records in our DB —
	// they have no internal project page, so the citable link is `url`.
	slug: string | null;
	category: string | null;
	shortDescription: string | null;
	hackathonStatus: string | null;
	hackathonPlacement: string | null;
	hackathonPrize: number | null;
	hackathonPrizeTrack: string | null;
	scfAwarded: boolean;
	// Set only for curated winners (who built it). Absent for DB submissions.
	builder?: string | null;
	url: string;
}

/**
 * Curated winner roster for hackathons whose winners aren't Project records in
 * our DB (e.g. DoraHacks-sourced events). Without this, the detail endpoint
 * reports `winners: []` for a hackathon that demonstrably had winners — so a
 * "did an AI-payments project win a prize?" question can't be answered from us.
 * The roster lives in src/data/recent-hackathon-winners.ts; this surfaces it
 * through the API in the same shape as DB-derived winners.
 */
function staticWinnersForSlug(slug: string): SubmissionRow[] {
	if (slug !== LATEST_WINNERS.hackathonUname) return [];
	return LATEST_WINNERS.winners.map((w) => ({
		id: `winner-${LATEST_WINNERS.hackathonUname}-${w.rank}`,
		name: w.projectName,
		slug: null,
		category: null,
		shortDescription: w.description,
		hackathonStatus: null,
		hackathonPlacement: w.placementLabel,
		hackathonPrize: w.prizeUsd,
		hackathonPrizeTrack: null,
		scfAwarded: false,
		builder: w.builder,
		url: getWinnerLink(w),
	}));
}

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ slug: string }> },
) {
	const { slug } = await params;
	const payload = await getPayloadSafe();
	if (!payload) {
		return NextResponse.json({ error: "payload unavailable" }, { status: 503 });
	}

	try {
		const hackathonResult = await payload.find({
			collection: "hackathons",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 1,
		});
		const hackathon = hackathonResult.docs[0] as
			| {
					id: string;
					name: string;
					slug: string;
					description?: string;
					startDate?: string;
					endDate?: string;
					status: string;
					externalUrl?: string;
					organizer?: { id: string; name: string; slug: string } | string;
			  }
			| undefined;

		// Fallback: live DoraHacks feed. The list endpoint merges DoraHacks
		// rows in by `uname` slug — without this, the detail endpoint 404s
		// on every uncurated event.
		if (!hackathon) {
			const dora = (await fetchAllDoraHacksHackathons()).find(
				(h) => h.uname === slug,
			);
			if (!dora) {
				return NextResponse.json(
					{ error: `hackathon not found: ${slug}` },
					{ status: 404 },
				);
			}
			const now = Math.floor(Date.now() / 1000);
			const status =
				dora.start_time > now
					? "upcoming"
					: dora.end_time < now
						? "completed"
						: "active";
			logApiHit({
				req,
				endpoint: "/api/hackathons/[slug]",
				filters: { slug, source: "dorahacks" },
			});
			// Curated winner roster (if we have one for this event) — even when the
			// full submission list isn't in our DB, we can still answer "who won".
			const curatedWinners = staticWinnersForSlug(slug);
			const totalPrizeUSD = curatedWinners.reduce(
				(s, w) => s + (w.hackathonPrize ?? 0),
				0,
			);
			return NextResponse.json(
				{
					meta: {
						source: getHackathonUrl(dora.uname),
						generatedAt: new Date().toISOString(),
						note: curatedWinners.length
							? "DoraHacks-sourced — full submission list not in stellarlight DB, but the winner roster below is curated; visit externalUrl for all submissions"
							: "DoraHacks-sourced — submissions/winners/tracks not in stellarlight DB; visit externalUrl for full detail",
					},
					hackathon: {
						id: `dorahacks-${dora.id}`,
						name: dora.title,
						slug: dora.uname,
						description: dora.description ?? null,
						startDate: new Date(dora.start_time * 1000)
							.toISOString()
							.slice(0, 10),
						endDate: new Date(dora.end_time * 1000)
							.toISOString()
							.slice(0, 10),
						status,
						externalUrl: getHackathonUrl(dora.uname),
						organizer: dora.organization
							? {
									id: `dorahacks-org-${dora.organization.id}`,
									name: dora.organization.name,
									slug: dora.organization.name
										.toLowerCase()
										.replace(/\s+/g, "-"),
								}
							: null,
						prizePoolUSD: dora.bonus_price || null,
						hackersCount: dora.hackers_count || null,
						source: "dorahacks",
						stats: {
							totalSubmissions: 0,
							totalPrizeUSD: dora.bonus_price || totalPrizeUSD || 0,
							winners: curatedWinners.length,
							outcomes: { built: 0, inProgress: 0, abandoned: 0, unknown: 0 },
						},
						tracks: [],
					},
					winners: curatedWinners,
					submissions: [],
					// Top-level `tracks` (drift report #12) so `data.tracks` isn't
					// undefined for a consumer (also present under hackathon.tracks).
					tracks: [],
				},
				{
					headers: {
						"Cache-Control":
							"public, s-maxage=3600, stale-while-revalidate=7200",
					},
				},
			);
		}

		const projectsResult = await payload.find({
			collection: "projects",
			where: { hackathon: { equals: hackathon.id } },
			limit: 300,
			depth: 0,
			sort: "-hackathonPrize",
		});

		const submissions: SubmissionRow[] = (
			projectsResult.docs as Array<{
				id: string;
				name: string;
				slug: string;
				category: string;
				shortDescription?: string;
				hackathonStatus?: string;
				hackathonPlacement?: string;
				hackathonPrize?: number;
				hackathonPrizeTrack?: string;
				scf?: { awarded?: boolean };
			}>
		).map((p) => ({
			id: String(p.id),
			name: p.name,
			slug: p.slug,
			category: p.category,
			shortDescription: p.shortDescription ?? null,
			hackathonStatus: p.hackathonStatus ?? null,
			hackathonPlacement: p.hackathonPlacement ?? null,
			hackathonPrize: p.hackathonPrize ?? null,
			hackathonPrizeTrack: p.hackathonPrizeTrack ?? null,
			scfAwarded: !!p.scf?.awarded,
			url: `https://stellarlight.xyz/project/${p.slug}`,
		}));

		// Outcome funnel: how many submissions are Built / In Progress / Abandoned.
		const outcomes = {
			built: submissions.filter((s) => s.hackathonStatus === "Built").length,
			inProgress: submissions.filter((s) => s.hackathonStatus === "In Progress")
				.length,
			abandoned: submissions.filter((s) => s.hackathonStatus === "Abandoned")
				.length,
			unknown: submissions.filter((s) => !s.hackathonStatus).length,
		};

		// Prefer DB-derived winners (submissions with a placement); fall back to
		// the curated roster if a curated event made it into the DB without
		// placement-tagged submissions.
		const dbWinners = submissions.filter((s) => !!s.hackathonPlacement);
		const winners = dbWinners.length
			? dbWinners
			: staticWinnersForSlug(slug);

		const totalPrizeUSD = submissions.reduce(
			(sum, s) => sum + (s.hackathonPrize ?? 0),
			0,
		);

		// Derive tracks from past submissions — group every project's
		// `hackathonPrizeTrack` value and aggregate prize $ + winner counts.
		// Closes the "what tracks did this event have / pay out" gap for
		// the Scout SKILL.md without requiring editorial track data on the
		// Hackathons collection itself.
		const tracksMap = new Map<
			string,
			{
				name: string;
				winnerCount: number;
				submissionCount: number;
				totalPrizeUSD: number;
			}
		>();
		for (const s of submissions) {
			const name = s.hackathonPrizeTrack?.trim();
			if (!name) continue;
			const entry = tracksMap.get(name) ?? {
				name,
				winnerCount: 0,
				submissionCount: 0,
				totalPrizeUSD: 0,
			};
			entry.submissionCount += 1;
			if (s.hackathonPlacement) entry.winnerCount += 1;
			entry.totalPrizeUSD += s.hackathonPrize ?? 0;
			tracksMap.set(name, entry);
		}
		const tracks = Array.from(tracksMap.values()).sort(
			(a, b) => b.totalPrizeUSD - a.totalPrizeUSD,
		);

		const org =
			hackathon.organizer && typeof hackathon.organizer === "object"
				? {
						id: String(hackathon.organizer.id),
						name: hackathon.organizer.name,
						slug: hackathon.organizer.slug,
					}
				: null;

		logApiHit({ req, endpoint: "/api/hackathons/[slug]", filters: { slug } });

		return NextResponse.json(
			{
				meta: {
					source: `https://stellarlight.xyz/hackathons/${slug}`,
					generatedAt: new Date().toISOString(),
				},
				hackathon: {
					id: String(hackathon.id),
					name: hackathon.name,
					slug: hackathon.slug,
					description: hackathon.description ?? null,
					startDate: hackathon.startDate ?? null,
					endDate: hackathon.endDate ?? null,
					status: hackathon.status,
					externalUrl: hackathon.externalUrl ?? null,
					organizer: org,
					stats: {
						totalSubmissions: submissions.length,
						totalPrizeUSD,
						winners: winners.length,
						outcomes,
					},
					tracks,
				},
				winners,
				submissions,
				// Top-level `tracks` (drift report #12) — same data as hackathon.tracks,
				// surfaced top-level so `data.tracks` isn't undefined.
				tracks,
			},
			{
				headers: {
					"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
				},
			},
		);
	} catch (err) {
		console.error("hackathon detail failed", err);
		return NextResponse.json({ error: "internal error" }, { status: 500 });
	}
}
