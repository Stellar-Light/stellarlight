/**
 * The Recent Winners block on /hackathons: the most recently ended event
 * with winners on record. Three places hold winners: the builds index (every
 * event's stored rows, DoraHacks' and the curated imports'), DoraHacks' live
 * roster, and the roster kept in code (src/data/recent-hackathon-winners.ts).
 * The block read only the last two, so an event whose winners are stored
 * but not on DoraHacks (HackMeridian 2026, six winners, ended 2026-10-26)
 * lost to the August roster in code.
 */

import type { RecentHackathonWinners } from "@/data/recent-hackathon-winners";
import type { IndexedBuild } from "@/lib/hackathon-builds";
import { placementRank } from "@/lib/hackathon-detail";
import { parsePlacement } from "@/lib/integrations/dorahacks";

/** The GitHub account a repo URL names, as a build's "by" line. */
const githubOwner = (url: string | null | undefined) =>
	url ? (/github\.com\/([^/?#]+)/i.exec(url)?.[1] ?? undefined) : undefined;

/** The most recently ended event whose stored rows hold a winner, as the
 * block shows it; null when no stored row won. Each winner opens its repo,
 * else its directory project, else its own page. */
export function winnersFromIndex(
	index: Array<
		Pick<
			IndexedBuild,
			| "id"
			| "name"
			| "description"
			| "githubUrl"
			| "url"
			| "isWinner"
			| "hackathonPlacement"
			| "award"
			| "project"
			| "hackathon"
		>
	>,
): RecentHackathonWinners | null {
	const byEvent = new Map<string, typeof index>();
	for (const b of index) {
		if (!b.isWinner || !Date.parse(b.hackathon.endedAt ?? "")) continue;
		const rows = byEvent.get(b.hackathon.slug);
		if (rows) rows.push(b);
		else byEvent.set(b.hackathon.slug, [b]);
	}
	const ended = (rows: typeof index) =>
		Date.parse(rows[0].hackathon.endedAt ?? "");
	const newest = [...byEvent.values()].sort((a, b) => ended(b) - ended(a))[0];
	if (!newest) return null;
	const { hackathon } = newest[0];
	const winners = newest
		.map((b) => {
			const { label, prizeUsd } = parsePlacement(b.hackathonPlacement);
			return {
				rank:
					placementRank(b.hackathonPlacement) ?? placementRank(b.award) ?? 99,
				placementLabel: label,
				projectName: b.name,
				builder: githubOwner(b.githubUrl),
				description: b.description ?? "",
				prizeUsd: prizeUsd || null,
				dorahacksBuidlUrl:
					b.githubUrl ??
					(b.project ? `/project/${b.project.slug}` : undefined) ??
					b.url,
			};
		})
		.sort((a, b) => a.rank - b.rank);
	return {
		hackathonName: hackathon.title,
		hackathonUname: hackathon.slug,
		endedAt: new Date(ended(newest)).toISOString().slice(0, 10),
		totalPrizePool: winners.reduce((s, w) => s + (w.prizeUsd ?? 0), 0),
		// DoraHacks keeps a winners page for its own events; an event off
		// DoraHacks has none, and its name links to its page here.
		winnersPageUrl: newest.some((b) => b.id.startsWith("dorahacks-"))
			? undefined
			: null,
		winners,
	};
}

/** The candidate that ended last; the first on a tie. */
export function newestWinners(
	candidates: Array<RecentHackathonWinners | null>,
): RecentHackathonWinners | null {
	let best: RecentHackathonWinners | null = null;
	for (const c of candidates)
		if (c && (!best || Date.parse(c.endedAt) > Date.parse(best.endedAt)))
			best = c;
	return best;
}
