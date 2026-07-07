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
	fetchHackathonSubmissions,
	getHackathonUrl,
} from "@/lib/integrations/dorahacks";
import { getPayloadSafe } from "@/lib/payload-client";
import { getWinnerLink, LATEST_WINNERS } from "@/data/recent-hackathon-winners";
import { methodNotAllowed } from "@/lib/method-not-allowed";

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
	// Numeric rank parsed from hackathonPlacement (1 = best), set by rankAndSort.
	// Lets agents sort/find winners numerically instead of string-parsing the
	// label, and guarantees winners[0] is the 1st-place entry. null = unplaced.
	placementRank?: number | null;
	hackathonPrize: number | null;
	hackathonPrizeTrack: string | null;
	scfAwarded: boolean;
	// Set only for curated winners (who built it). Absent for DB submissions.
	builder?: string | null;
	url: string;
}

// Word-ordinal placements: "First Place", "Second Place", … Some events
// (e.g. build-on-stellar) label winners with words, not digits. Without this
// they all fell through to unranked, scrambling winners[0].
const WORD_ORDINALS: Record<string, number> = {
	first: 1,
	second: 2,
	third: 3,
	fourth: 4,
	fifth: 5,
	sixth: 6,
	seventh: 7,
	eighth: 8,
	ninth: 9,
	tenth: 10,
};

// Parse a placement label → sortable rank (1 = best), or `null` when the label
// carries no ordinal (a flat "Winners" bucket, as DoraHacks emits for many
// events). Handles numeric ordinals ("1st Place", "10th"), word ordinals
// ("First Place"), grand-prize/overall, and runner-up. Returning `null` for
// unranked — instead of a 9999 sentinel — lets consumers tell "genuinely
// unranked" from a real rank, and keeps the internal magic number out of the
// public response. A downstream consumer (Raven) rejected our winner data
// because the order was scrambled and there was no numeric place field.
// Medal emoji + Spanish ordinals — many LatAm DoraHacks events label placements
// as "🥇 1er lugar" / "Primer lugar – Mejor Proyecto", which the English-only
// parser scored null (sls-005 false negatives: whole ranked events reported
// winnersRanked=false).
const MEDALS: Record<string, number> = { "🥇": 1, "🥈": 2, "🥉": 3 };
const SPANISH_ORDINALS: Record<string, number> = {
	primer: 1,
	primero: 1,
	primera: 1,
	segundo: 2,
	segunda: 2,
	tercer: 3,
	tercero: 3,
	tercera: 3,
	cuarto: 4,
	cuarta: 4,
	quinto: 5,
	quinta: 5,
	sexto: 6,
	septimo: 7,
	octavo: 8,
	noveno: 9,
	decimo: 10,
};

function placementRank(label?: string | null): number | null {
	if (!label) return null;
	for (const [m, r] of Object.entries(MEDALS)) if (label.includes(m)) return r;
	// Lowercase + strip accents so "séptimo"/"1º" match.
	const s = label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
	// English "1st" + Spanish "1er/2do/3ro/4to" + "1º/1°".
	const ordinal = s.match(
		/\b(\d+)\s*(?:st|nd|rd|th|er|do|ro|to|mo|vo|no|º|°)\b/,
	);
	if (ordinal) return Number(ordinal[1]);
	if (/runner.?up|subcampe/.test(s)) return 2;
	for (const [word, rank] of Object.entries(WORD_ORDINALS)) {
		if (new RegExp(`\\b${word}\\b`).test(s)) return rank;
	}
	for (const [word, rank] of Object.entries(SPANISH_ORDINALS)) {
		if (new RegExp(`\\b${word}\\b`).test(s)) return rank;
	}
	if (/grand|overall|gran premio|mejor proyecto/.test(s)) return 1;
	if (/track.?winner|category winner|ganador de categoria/.test(s)) return 100;
	if (/honorable|mention|finalist|mencion/.test(s)) return 900;
	// A bare "Winner"/"Winners" bucket has no ordinal → unranked, not rank 1.
	return null;
}

// Annotate each winner with placementRank and sort best-first, so winners[0] is
// the 1st-place entry *when the event has ranked placements*. Generic so it
// serves both the DoraHacks-feed shape and the DB/curated SubmissionRow shape
// (both carry hackathonPlacement). Ranked winners sort ascending; unranked
// (placementRank === null) sink to the end in stable source order.
function rankAndSort<
	T extends { hackathonPlacement?: string | null; award?: string | null },
>(winners: T[]): (T & { placementRank: number | null })[] {
	return winners
		.map((w) => ({
			...w,
			// The ordinal can live in either the prize name (hackathonPlacement) or
			// the award title — try both before declaring a winner unranked.
			placementRank:
				placementRank(w.hackathonPlacement) ?? placementRank(w.award),
		}))
		.sort((a, b) => (a.placementRank ?? 9999) - (b.placementRank ?? 9999));
}

// sls-016: per-place award amounts live only in the description markdown prose
// ("- **First Place:** $5,000 in XLM"), while the structured `award` field
// carries the pool label for every winner. Parse the prose into a structured
// `prizeTiers` array (rank → amount → asset) so consumers filter/join instead
// of string-mining — join to winners via placementRank. Empty when the
// description has no itemized split (returns [], never guesses).
interface PrizeTier {
	place: string;
	rank: number | null;
	amountUSD: number | null;
	asset: string | null;
}
function parsePrizeTiers(description?: string | null): PrizeTier[] {
	if (!description) return [];
	// "First Place" | "1st Place" ... then "$5,000" then optional "in XLM".
	const re =
		/(?:\*\*)?\s*([A-Za-z]+|\d+(?:st|nd|rd|th))\s+place\s*(?:\*\*)?\s*[:\-–—]?\s*(?:\*\*)?\s*\$\s*([\d,]+(?:\.\d+)?)\s*(?:in\s+([A-Za-z]{2,6}))?/i;
	const out: PrizeTier[] = [];
	const seen = new Set<number>();
	for (const line of description.split(/\r?\n/)) {
		const m = re.exec(line);
		if (!m) continue;
		const rank = placementRank(`${m[1]} Place`);
		if (rank != null) {
			if (seen.has(rank)) continue;
			seen.add(rank);
		}
		out.push({
			place: `${m[1].charAt(0).toUpperCase()}${m[1].slice(1)} Place`,
			rank,
			amountUSD: Number(m[2].replace(/,/g, "")) || null,
			asset: m[3] ? m[3].toUpperCase() : null,
		});
	}
	return out.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
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
			// Pull the live submission roster from DoraHacks (read-through; degrades
			// to [] if the feed is unavailable). Populates submissions/winners/tracks
			// for events that aren't curated in our DB.
			const liveSubmissions = await fetchHackathonSubmissions(dora.uname);
			const liveWinners = liveSubmissions.filter((sub) => sub.isWinner);
			const winners = liveWinners.length
				? rankAndSort(liveWinners)
				: rankAndSort(curatedWinners);
			const trackMap = new Map<
				string,
				{ name: string; submissionCount: number; winnerCount: number }
			>();
			for (const sub of liveSubmissions) {
				if (!sub.track) continue;
				const e = trackMap.get(sub.track) ?? {
					name: sub.track,
					submissionCount: 0,
					winnerCount: 0,
				};
				e.submissionCount += 1;
				if (sub.isWinner) e.winnerCount += 1;
				trackMap.set(sub.track, e);
			}
			const liveTracks = [...trackMap.values()].sort(
				(a, b) => b.submissionCount - a.submissionCount,
			);
			return NextResponse.json(
				{
					meta: {
						source: getHackathonUrl(dora.uname),
						generatedAt: new Date().toISOString(),
						note: liveSubmissions.length
							? "DoraHacks-sourced — submissions, winners, and tracks below are pulled live from DoraHacks."
							: curatedWinners.length
								? "DoraHacks-sourced — live submission feed unavailable; the curated winner roster below still answers 'who won'. Visit externalUrl for all submissions."
								: "DoraHacks-sourced — live submission feed unavailable; visit externalUrl for full detail.",
					},
					hackathon: {
						id: `dorahacks-${dora.id}`,
						name: dora.title,
						slug: dora.uname,
						description: dora.description ?? null,
						startDate: new Date(dora.start_time * 1000)
							.toISOString()
							.slice(0, 10),
						endDate: new Date(dora.end_time * 1000).toISOString().slice(0, 10),
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
						// sls-016: structured per-place split parsed from the description
						// prose (rank → amountUSD → asset); [] when not itemized.
						prizeTiers: parsePrizeTiers(dora.description),
						hackersCount: dora.hackers_count || null,
						source: "dorahacks",
						stats: {
							totalSubmissions: liveSubmissions.length,
							totalPrizeUSD: dora.bonus_price || totalPrizeUSD || 0,
							winners: winners.length,
							outcomes: { built: 0, inProgress: 0, abandoned: 0, unknown: 0 },
						},
						tracks: liveTracks,
					},
					winners,
					// sls-005: says whether the winners ARRAY ORDER is a ranking.
					// true = ordinal placements (sorted by placementRank); false =
					// tier-labeled winners (all placementRank null, order meaningless);
					// null = no winners recorded. placementRank is the ONLY per-entry
					// ordering signal — never infer finishing order from array position.
					winnersRanked: winners.length
						? winners.some((w) => w.placementRank !== null)
						: null,
					submissions: liveSubmissions,
					// Top-level `tracks` (drift report #12) so `data.tracks` isn't
					// undefined for a consumer (also present under hackathon.tracks).
					tracks: liveTracks,
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
		const winners = rankAndSort(
			dbWinners.length ? dbWinners : staticWinnersForSlug(slug),
		);

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
				// sls-005: same contract as the DoraHacks branch above — array order
				// is only a ranking when winnersRanked is true.
				winnersRanked: winners.length
					? winners.some((w) => w.placementRank !== null)
					: null,
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

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
