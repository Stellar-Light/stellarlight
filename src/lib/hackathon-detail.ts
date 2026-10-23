/**
 * One hackathon's detail: the body GET /api/hackathons/{slug} serves, built
 * here so the route and the event page (/hackathons/<slug>) read the same
 * answer and cannot drift. A server component never fetches its own API over
 * HTTP; it calls this. The route keeps the HTTP: the 503 when the store is
 * down, the status codes, the cache header, the usage log and the 500.
 */

import {
	CURATED_HACKATHONS,
	CURATED_WINNERS_NOTES,
} from "@/data/curated-hackathons";
import { getWinnerLink, LATEST_WINNERS } from "@/data/recent-hackathon-winners";
import { WINNER_OVERLAY } from "@/data/winner-overlay";
import {
	afterEventFields,
	eventCoverage,
	eventProfile,
	winnersOnlyNote,
} from "@/lib/hackathon-analytics";
import { CURATED_BUILD_ID } from "@/lib/hackathon-build-links";
import {
	getHackathonBuildsIndex,
	type IndexedBuild,
} from "@/lib/hackathon-builds";
import {
	hiddenWinnersNote,
	submissionCoverageNote,
} from "@/lib/hackathon-events";
import { heldSecurity } from "@/lib/held-repos";
import {
	type DoraHacksSubmission,
	fetchAllDoraHacksHackathons,
	fetchHackathonSubmissions,
	getHackathonUrl,
	parsePlacement,
	prizeCategories,
	prizeLabels,
} from "@/lib/integrations/dorahacks";
import type { getPayloadSafe } from "@/lib/payload-client";
import type { HackathonEvent } from "@/payload-types";

interface SubmissionRow {
	id: string;
	name: string;
	// null for curated winners that aren't (yet) Project records in our DB:
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
	// Curated roster rows: what this winner won in USD, the roster's figure,
	// as DoraHacks winners carry prizeUsd.
	prizeUsd?: number | null;
	hackathonPrizeTrack: string | null;
	// Curated winners: read from the linked directory project; null when the
	// winner links none, that project has no SCF record, or the read failed
	// (unknown, never "not funded").
	scfAwarded: boolean | null;
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
// unranked (instead of a 9999 sentinel) lets consumers tell "genuinely
// unranked" from a real rank, and keeps the internal magic number out of the
// public response. A downstream consumer (Raven) rejected our winner data
// because the order was scrambled and there was no numeric place field.
// Medal emoji + Spanish ordinals: many LatAm DoraHacks events label placements
// as "🥇 1er lugar" or "Primer lugar" and a category, which the English-only
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
	// "1st Runner-Up" is second place, behind a "Champion": the plain ordinal
	// below read it as first.
	const runnerUp = s.match(/\b(\d+)\s*(?:st|nd|rd|th)?\s*runner.?up/);
	if (runnerUp) return Number(runnerUp[1]) + 1;
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
	if (/grand|overall|champion|gran premio|mejor proyecto/.test(s)) return 1;
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
			// the award title: try both before declaring a winner unranked.
			placementRank:
				placementRank(w.hackathonPlacement) ?? placementRank(w.award),
		}))
		.sort((a, b) => (a.placementRank ?? 9999) - (b.placementRank ?? 9999));
}

// sls-016: per-place award amounts live only in the description markdown prose
// ("- **First Place:** $5,000 in XLM"), while the structured `award` field
// carries the pool label for every winner. Parse the prose into a structured
// `prizeTiers` array (rank → amount → asset) so consumers filter/join instead
// of string-mining; join to winners via placementRank. Empty when the
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
		/(?:\*\*)?\s*([A-Za-z]+|\d+(?:st|nd|rd|th))\s+place\s*(?:\*\*)?\s*[:\-\u2013\u2014]?\s*(?:\*\*)?\s*\$\s*([\d,]+(?:\.\d+)?)\s*(?:in\s+([A-Za-z]{2,6}))?/i;
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
 * reports `winners: []` for a hackathon that demonstrably had winners, so a
 * "did an AI-payments project win a prize?" question can't be answered from us.
 * The roster lives in src/data/recent-hackathon-winners.ts; this surfaces it
 * through the API in the same shape as DB-derived winners.
 */
function staticWinnersForSlug(slug: string): SubmissionRow[] {
	if (slug !== LATEST_WINNERS.hackathonUname) return [];
	// Ids from the winner's name: `rank` is the place within a track, so
	// twelve winners carried two ids, and the old -1 and -2 are not reused
	// for a different winner.
	return LATEST_WINNERS.winners.map((w) => ({
		id: `winner-${LATEST_WINNERS.hackathonUname}-${w.projectName
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")}`,
		name: w.projectName,
		slug: projectSlugOf(getWinnerLink(w)),
		category: null,
		shortDescription: w.description,
		hackathonStatus: null,
		hackathonPlacement: w.placementLabel,
		hackathonPrize: w.prizeUsd,
		prizeUsd: w.prizeUsd,
		hackathonPrizeTrack: null,
		scfAwarded: null,
		builder: w.builder,
		url: getWinnerLink(w),
	}));
}

/** Why an ended DoraHacks event serves no winner, from DoraHacks' own
 * winner_announced flag: not announced is said as that, never as "none
 * won". With no submission read (the stored copy holds none and the live
 * roster failed or was empty), a 0 is not a count: the winners could not be
 * checked. null when the listing did not carry the flag and a roster was
 * read (not checked). */
function noWinnersNote(
	announced: boolean | null,
	rosterRead: boolean,
): string | null {
	if (announced === false)
		return `Not announced upstream: DoraHacks lists this event's winners as not announced (winner_announced false in its event listing, which Scout refreshes hourly)${rosterRead ? ", and no submission served here carries a prize" : ""}. This is not a claim that no one won: an organizer can name winners off DoraHacks.`;
	if (!rosterRead)
		return "Winners could not be checked: no submission of this event could be read (Scout's stored copy holds none, and DoraHacks' live roster failed or returned none), so this 0 is not a count.";
	if (announced === true)
		return "DoraHacks lists this event's winners as announced (winner_announced true), but no submission served here carries a prize, so its winners are not recorded here. This is not a claim that no one won.";
	return null;
}

/** The directory slug a roster link points at (a stellarlight.xyz project
 * page), or null when it points anywhere else. */
function projectSlugOf(url: string): string | null {
	return (
		/^https:\/\/(?:www\.)?stellarlight\.xyz\/project\/([a-z0-9-]+)\/?$/.exec(
			url,
		)?.[1] ?? null
	);
}

/** The curated roster with each winner's SCF award read from its directory
 * project (scf.awarded, the structured record). It said false for all twelve
 * Builder Summit winners while Trustless Work holds a $150,000 award on
 * record. A winner whose project is not on record, a project with no SCF
 * record, or a failed read stays null. */
async function curatedWinnersFor(
	payload: NonNullable<Awaited<ReturnType<typeof getPayloadSafe>>>,
	slug: string,
): Promise<SubmissionRow[]> {
	const rows = staticWinnersForSlug(slug);
	const slugs = [...new Set(rows.flatMap((r) => (r.slug ? [r.slug] : [])))];
	if (!slugs.length) return rows;
	const docs = await payload
		.find({
			collection: "projects",
			where: { slug: { in: slugs } },
			select: { slug: true, scf: true },
			limit: slugs.length,
			depth: 0,
		})
		.then((r) => r.docs)
		.catch(() => null);
	if (!docs) return rows;
	const scf = new Map(
		docs.map((d) => {
			const awarded = d.scf?.awarded;
			return [d.slug, typeof awarded === "boolean" ? awarded : null];
		}),
	);
	return rows.map((r) => ({
		...r,
		scfAwarded: r.slug ? (scf.get(r.slug) ?? null) : null,
	}));
}

/** Up to three listed slugs sharing the most distinguishing words with an
 * unknown one; listing order (current events first) breaks ties. A word more
 * than half the listing carries ("stellar") distinguishes nothing, so a slug
 * matching only such words gets none. */
function closestSlugs(slug: string, listed: string[]): string[] {
	const split = (s: string) =>
		new Set(
			s
				.toLowerCase()
				.split(/[^a-z0-9]+/)
				.filter(Boolean),
		);
	const sets = listed.map(split);
	const carriers = new Map<string, number>();
	for (const ws of sets)
		for (const w of ws) carriers.set(w, (carriers.get(w) ?? 0) + 1);
	const words = [...split(slug)].filter(
		(w) => (carriers.get(w) ?? 0) * 2 <= listed.length,
	);
	return listed
		.map((k, i) => ({ k, i, n: words.filter((w) => sets[i].has(w)).length }))
		.filter((x) => x.n > 0)
		.sort((a, b) => b.n - a.n || a.i - b.i)
		.slice(0, 3)
		.map((x) => x.k);
}

/** The answer for one slug: the 404 body when no event has it, else the 200
 * body and the store the event came from (the `hackathons` collection, or
 * the DoraHacks listing with the curated events). */
export async function getHackathonDetail(
	payload: NonNullable<Awaited<ReturnType<typeof getPayloadSafe>>>,
	slug: string,
) {
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
	// rows in by `uname` slug; without this, the detail endpoint 404s
	// on every uncurated event.
	if (!hackathon) {
		const listed = await fetchAllDoraHacksHackathons();
		const dora = listed.find((h) => h.uname === slug);
		if (!dora) {
			// The way forward goes in the error text itself: some agent
			// clients keep only `error` from a 404.
			const near = closestSlugs(
				slug,
				listed.map((h) => h.uname),
			);
			const hint =
				"Find the slug with getHackathons: GET /api/hackathons?q=<one word of the event's name> lists the events whose name holds it, with their slugs.";
			return {
				found: false as const,
				body: {
					error: `hackathon not found: ${slug}. ${hint}${near.length ? ` Closest known slugs: ${near.join(", ")}.` : ""}`,
					hint,
					closestSlugs: near,
				},
			};
		}
		const now = Math.floor(Date.now() / 1000);
		const status =
			dora.start_time > now
				? "upcoming"
				: dora.end_time < now
					? "completed"
					: "active";
		// Curated winner roster (if we have one for this event): even when the
		// full submission list isn't in our DB, we can still answer "who won".
		const curatedWinners = await curatedWinnersFor(payload, slug);
		const totalPrizeUSD = curatedWinners.reduce(
			(s, w) => s + (w.hackathonPrize ?? 0),
			0,
		);
		// The stored copy first: the same submissions search and analyze read,
		// refreshed daily, and the event's own stored page. A live DoraHacks
		// read only when the store holds none of this event's submissions
		// (degrades to [] if the feed is unavailable).
		const [index, storedEvent, hiddenWinners] = await Promise.all([
			getHackathonBuildsIndex().catch(() => [] as IndexedBuild[]),
			payload
				.find({
					collection: "hackathon-events",
					where: { slug: { equals: slug } },
					limit: 1,
					depth: 0,
				})
				.then((r) => r.docs[0] as HackathonEvent | undefined)
				.catch(() => undefined),
			// sls-092: winning submissions their teams hid on DoraHacks are
			// stored but not served; the record names their placements and
			// awards, never the submissions. null = the read failed, so the
			// record says nothing rather than "none".
			payload
				.find({
					collection: "hackathon-builds",
					where: {
						and: [
							{ hackathonSlug: { equals: slug } },
							{ isWinner: { equals: true } },
							{ hiddenUpstream: { equals: true } },
						],
					},
					pagination: false,
					depth: 0,
					overrideAccess: true,
					select: { buildId: true, placement: true, award: true },
				})
				.then(
					(r) =>
						r.docs as Array<{
							buildId: string;
							placement?: string | null;
							award?: string | null;
						}>,
				)
				.catch(() => null),
		]);
		const stored = index.filter((b) => b.hackathon.slug === slug);
		const fromStore = stored.length > 0;
		// Only the winners on record (a curated import): the field is
		// unknown, so no count of it is served, never the winner count.
		const winnersOnly = eventCoverage(stored) === "winners-only";
		// Served in the submission shape this endpoint has always served:
		// the stored row's other facts live on search, detail and analyze.
		// Each row's own source: a curated winner is curated, never
		// dorahacks beside a page that says it is off DoraHacks.
		const liveSubmissions: Array<
			Omit<DoraHacksSubmission, "source"> & {
				source: "dorahacks" | "curated";
			}
		> = fromStore
			? stored.map((b) => ({
					id: b.id,
					name: b.name,
					description: b.description,
					githubUrl: b.githubUrl,
					...heldSecurity(b),
					demoUrl: b.demoUrl,
					videoUrl: b.videoUrl,
					track: b.track,
					hackathonPlacement: b.hackathonPlacement,
					award: b.award,
					isWinner: b.isWinner,
					voteCount: b.voteCount,
					url: b.url,
					source: CURATED_BUILD_ID.test(b.id)
						? ("curated" as const)
						: ("dorahacks" as const),
				}))
			: // A failed live read (its winners unreadable, a timeout)
				// serves no roster; the winners note then says they could
				// not be checked.
				await fetchHackathonSubmissions(dora).catch(
					() => [] as DoraHacksSubmission[],
				);
		// Award text this event's winners of different placements share
		// names their category, never one winner's prize.
		const categories = prizeCategories(liveSubmissions);
		// Hidden winners this page does not serve. The index is cached for
		// an hour and its live fallback still lists hidden submissions, so
		// a row flagged hidden can be on this page. [] claims a stored
		// roster with none missing, so only a stored DoraHacks roster can
		// say it.
		const served = new Set(liveSubmissions.map((s) => s.id));
		const hidden =
			fromStore && dora.source !== "curated" && hiddenWinners
				? hiddenWinners
						.filter((h) => !served.has(h.buildId))
						.map((h) => ({
							placement: h.placement ?? null,
							...prizeLabels(categories, {
								award: h.award,
								hackathonPlacement: h.placement,
							}),
							placementRank:
								placementRank(h.placement) ?? placementRank(h.award),
						}))
				: null;
		const page = storedEvent?.description ?? dora.description ?? null;
		const liveWinners = liveSubmissions.filter((sub) => sub.isWinner);
		// What each winner won and became, on winner rows only (the
		// submissions list keeps its shape): prizeUsd from its own
		// placement, and from the stored row its directory project and what
		// its repo did after the event.
		const storedById = new Map(stored.map((b) => [b.id, b]));
		const winners = liveWinners.length
			? rankAndSort(liveWinners).map((w) => {
					const b = storedById.get(w.id);
					return {
						...w,
						...prizeLabels(categories, w),
						prizeUsd: parsePlacement(w.hackathonPlacement).prizeUsd || null,
						...(b?.project !== undefined ? { project: b.project } : {}),
						// A win named off DoraHacks: the page that names it.
						...(b?.winnerSource ? { winnerSource: b.winnerSource } : {}),
						...(b ? afterEventFields(b) : {}),
					};
				})
			: rankAndSort(curatedWinners);
		// Why the winners are what they are, when that needs saying: a
		// winner hidden upstream, a curated event's dated note, winners
		// named off DoraHacks, or an ended DoraHacks event with none.
		let winnersNote = hiddenWinnersNote(hidden);
		if (dora.source === "curated")
			winnersNote ??= CURATED_WINNERS_NOTES[slug] ?? null;
		else if (winners.some((w) => "winnerSource" in w))
			winnersNote ??=
				WINNER_OVERLAY.find((e) => e.hackathonSlug === slug)?.note ?? null;
		else if (!winners.length && status === "completed")
			winnersNote ??= noWinnersNote(
				dora.winner_announced,
				liveSubmissions.length > 0,
			);
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
		// An empty list says none. A full roster's tracks as before; a
		// winners-only roster's with submissionCount unknown; with neither,
		// the tracks the event's record declares, counts unknown; and null
		// when nothing tells (hackmeridian-2026 served [] beside two
		// categories and two tracks its record states).
		const record =
			dora.source === "curated"
				? CURATED_HACKATHONS.find((h) => h.uname === slug)
				: undefined;
		const servedTracks =
			liveSubmissions.length && !winnersOnly
				? liveTracks
				: winnersOnly && liveTracks.length
					? liveTracks.map((t) => ({ ...t, submissionCount: null }))
					: record?.tracks?.length
						? record.tracks.map((t) => ({
								name: t.name,
								kind: t.kind,
								description: t.description,
								submissionCount: null,
								winnerCount: null,
							}))
						: null;
		// The organizer's page itemizes prizes or not; a curated record is a
		// summary, so when it itemizes none the split is not known.
		const tiers = parsePrizeTiers(page);
		const prizeTiers =
			dora.source === "curated" && !tiers.length ? null : tiers;
		const notes = [
			...(servedTracks
				? []
				: [
						liveSubmissions.length
							? "tracks is null: only its winners are stored and none of them names a track, and no record of it declares tracks, so its tracks are not known here, not none."
							: "tracks is null: no submission roster is held for this event and no record of it declares tracks, so its tracks are not known here, not none.",
					]),
			...(prizeTiers
				? []
				: [
						"prizeTiers is null: this event's record is a summary kept off DoraHacks, not the organizer's page, and it itemizes no prize by place, so whether the organizer did is not known here.",
					]),
		];
		return {
			found: true as const,
			source: "dorahacks" as const,
			body: {
				meta: {
					source: getHackathonUrl(dora),
					generatedAt: new Date().toISOString(),
					note: winnersOnly
						? "Event off DoraHacks with only its winners on record (hackathon.coverage winners-only): submissions and winners list them, from Scout's stored copy; stats.coverageNote says what that leaves unknown."
						: fromStore
							? "DoraHacks event. Submissions, winners, tracks and profile come from Scout's stored copy, refreshed daily; the event page and rules from its stored page (hackathon.rules)."
							: liveSubmissions.length
								? "DoraHacks-sourced: submissions, winners, and tracks below are pulled live from DoraHacks."
								: curatedWinners.length
									? "DoraHacks-sourced: live submission feed unavailable; the curated winner roster below still answers 'who won'. Visit externalUrl for all submissions."
									: "DoraHacks-sourced: live submission feed unavailable; visit externalUrl for full detail.",
				},
				hackathon: {
					id: `dorahacks-${dora.id}`,
					name: dora.title,
					slug: dora.uname,
					description: page,
					startDate: new Date(dora.start_time * 1000)
						.toISOString()
						.slice(0, 10),
					endDate: new Date(dora.end_time * 1000).toISOString().slice(0, 10),
					status,
					externalUrl: getHackathonUrl(dora),
					organizer: dora.organization
						? {
								id: `dorahacks-org-${dora.organization.id}`,
								name: dora.organization.name,
								slug: dora.organization.name.toLowerCase().replace(/\s+/g, "-"),
							}
						: null,
					prizePoolUSD: dora.bonus_price || null,
					// sls-016: structured per-place split parsed from the description
					// prose (rank → amountUSD → asset); [] when the organizer's page
					// itemizes none, null when a curated summary cannot tell.
					prizeTiers,
					// What the organizer published about submitting and judging.
					// Absent = the event page was not read; a null section = the
					// page has none (most Stellar event pages have no judging
					// section: 14 of 20 on 2026-10-05). An event off DoraHacks:
					// only the judging sentence its record copies verbatim.
					...(storedEvent?.detailReadAt
						? {
								rules: {
									repoRequired: !!storedEvent.repoRequired,
									videoRequired: !!storedEvent.videoRequired,
									submissionQuestions: storedEvent.submissionQuestions ?? [],
									requirements: storedEvent.requirementsSection ?? null,
									judgingCriteria: storedEvent.judgingSection ?? null,
									readAt: storedEvent.detailReadAt,
								},
							}
						: record?.judging
							? {
									rules: {
										judgingCriteria: record.judging.text,
										source: record.judging.source,
										checkedOn: record.judging.checkedOn,
									},
								}
							: {}),
					// The engine's profile of the stored submissions: categories,
					// libraries, activity after the event, and what they became.
					...(fromStore ? { profile: eventProfile(stored) } : {}),
					hackersCount: dora.hackers_count || null,
					source: dora.source === "curated" ? "curated" : "dorahacks",
					...(winnersOnly ? { coverage: "winners-only" as const } : {}),
					stats: {
						// An empty submission roster is not a count of zero. The
						// code-curated events ride this branch too (the São Paulo
						// Builder Summit is an in-person sprint with no roster
						// anywhere), and counting its zero rows published
						// `totalSubmissions: 0` beside twelve winners. Nor is a
						// roster of winners alone: HackMeridian 2025 served 6.
						totalSubmissions: winnersOnly
							? null
							: liveSubmissions.length || null,
						// DoraHacks' own count beside ours, and why they differ
						// (sls-092: Real-World ZK serves 319 of DoraHacks' 345).
						upstreamSubmissions: storedEvent?.upstreamSubmissions ?? null,
						coverageNote: winnersOnly
							? winnersOnlyNote(stored.length)
							: submissionCoverageNote(
									storedEvent?.upstreamSubmissions,
									liveSubmissions.length || null,
								),
						hiddenWinners: hidden,
						winnersNote,
						// null, not 0, when no USD figure is known: a prize not yet
						// announced or a non-cash prize read as "no prize" (PULSO).
						totalPrizeUSD: dora.bonus_price || totalPrizeUSD || null,
						winners: winners.length,
						// Every bucket was hardcoded 0, including `unknown`, so a
						// hackathon with 300 submissions reported none built,
						// none abandoned and none unknown, which reads as "we
						// checked and nothing survived" rather than "we never
						// classified these". Zero is a measurement; absence of
						// one is not. Nothing classifies these yet, so all 300
						// are unknown, and the buckets sum to the submissions
						// they describe; with winners alone there is no field
						// to sum to.
						outcomes:
							liveSubmissions.length && !winnersOnly
								? {
										built: 0,
										inProgress: 0,
										abandoned: 0,
										unknown: liveSubmissions.length,
									}
								: null,
					},
					tracks: servedTracks,
					// Why a list above is null, present only then.
					...(notes.length ? { notes } : {}),
				},
				winners,
				// sls-005: says whether the winners ARRAY ORDER is a ranking.
				// true = ordinal placements (sorted by placementRank); false =
				// tier-labeled winners (all placementRank null, order meaningless);
				// null = no winners recorded. placementRank is the ONLY per-entry
				// ordering signal; never infer finishing order from array position.
				winnersRanked: winners.length
					? winners.some((w) => w.placementRank !== null)
					: null,
				submissions: liveSubmissions.map((s) => ({
					...s,
					...prizeLabels(categories, s),
				})),
				// Top-level `tracks` (drift report #12) so `data.tracks` isn't
				// undefined for a consumer (also present under hackathon.tracks).
				tracks: servedTracks,
			},
		};
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
		dbWinners.length ? dbWinners : await curatedWinnersFor(payload, slug),
	);

	const totalPrizeUSD = submissions.reduce(
		(sum, s) => sum + (s.hackathonPrize ?? 0),
		0,
	);

	// Derive tracks from past submissions: group every project's
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

	return {
		found: true as const,
		source: "collection" as const,
		body: {
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
					// Zero is a measurement; absence of one is not. A curated
					// in-person event (the São Paulo Builder Summit) has no
					// submission list anywhere, so counting its zero rows served
					// `totalSubmissions: 0` beside twelve winners: a hackathon
					// nobody entered and twelve people won. With no submission
					// records we hold no submission count, and the outcome funnel
					// over an unknown denominator means nothing either.
					totalSubmissions: submissions.length || null,
					// No DoraHacks roster behind a curated event.
					upstreamSubmissions: null,
					coverageNote: null,
					hiddenWinners: null,
					winnersNote: null,
					totalPrizeUSD: totalPrizeUSD || null,
					winners: winners.length,
					outcomes: submissions.length ? outcomes : null,
				},
				tracks,
			},
			winners,
			// sls-005: same contract as the DoraHacks branch above; array order
			// is only a ranking when winnersRanked is true.
			winnersRanked: winners.length
				? winners.some((w) => w.placementRank !== null)
				: null,
			submissions,
			// Top-level `tracks` (drift report #12): same data as hackathon.tracks,
			// surfaced top-level so `data.tracks` isn't undefined.
			tracks,
		},
	};
}
