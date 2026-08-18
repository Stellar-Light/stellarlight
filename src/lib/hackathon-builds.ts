/**
 * Flattened cross-hackathon buidl index (DoraHacks submissions for the most
 * recent ended events), shared by /api/hackathons/builds and the builder
 * profile pages. Cached with unstable_cache for an hour so a profile render
 * never pays the cold fan-out.
 */
import { unstable_cache } from "next/cache";
import {
	type DoraHacksSubmission,
	fetchAllDoraHacksHackathons,
	fetchHackathonSubmissions,
} from "@/lib/integrations/dorahacks";
import { generateSlug } from "@/lib/utils/normalize";

export interface IndexedBuild extends DoraHacksSubmission {
	hackathon: { title: string; slug: string; endedAt: string | null };
	haystack: string; // lowercased name + description + track + award, for matching
}

async function pool<T, R>(
	items: T[],
	n: number,
	fn: (t: T) => Promise<R>,
): Promise<R[]> {
	const out: R[] = [];
	let i = 0;
	async function worker() {
		while (i < items.length) {
			const idx = i++;
			out[idx] = await fn(items[idx]);
		}
	}
	await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
	return out;
}

export async function buildHackathonBuildsIndex(): Promise<IndexedBuild[]> {
	const hacks = await fetchAllDoraHacksHackathons();
	// Only ENDED events have a meaningful build roster; cap to the most recent
	// to bound cold-rebuild cost.
	const ended = hacks
		.filter((h) => h.status === 2 || h.winner_announced)
		.sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0))
		.slice(0, 40);
	const perHack = await pool(ended, 6, async (h) => {
		const subs = await fetchHackathonSubmissions(h);
		const endedAt = h.end_time
			? new Date(h.end_time * 1000).toISOString().slice(0, 10)
			: null;
		const hackathon = { title: h.title, slug: generateSlug(h.title), endedAt };
		return subs.map((s) => ({
			...s,
			hackathon,
			haystack:
				`${s.name} ${s.description ?? ""} ${s.track ?? ""} ${s.award ?? ""}`.toLowerCase(),
		}));
	});
	// Dedupe by buidl id AND by event+name (DoraHacks repeats submissions across
	// pages; a resubmission gets a new id with the same name in the same event).
	const seenId = new Set<string>();
	const seenKey = new Set<string>();
	const flat: IndexedBuild[] = [];
	for (const arr of perHack) {
		for (const b of arr) {
			const key = `${b.hackathon.slug}::${b.name.trim().toLowerCase()}`;
			if (seenId.has(b.id) || seenKey.has(key)) continue;
			seenId.add(b.id);
			seenKey.add(key);
			flat.push(b);
		}
	}
	return flat;
}

export const getHackathonBuildsIndex = unstable_cache(
	buildHackathonBuildsIndex,
	["hackathon-builds-index:v1"],
	{
		revalidate: 3600,
		tags: ["hackathons"],
	},
);

/** Builds whose GitHub link points at one of these repos (owner/name, any case) or at the owner's account. */
export function buildsForRepos(
	builds: IndexedBuild[],
	repoFullNames: string[],
	owners: string[],
): IndexedBuild[] {
	const repos = new Set(repoFullNames.map((r) => r.toLowerCase()));
	const own = new Set(owners.map((o) => o.toLowerCase()));
	return builds.filter((b) => {
		if (!b.githubUrl) return false;
		const m = /github\.com\/([^/#?\s]+)(?:\/([^/#?\s]+))?/i.exec(b.githubUrl);
		if (!m) return false;
		const owner = m[1].toLowerCase();
		const full = m[2]
			? `${owner}/${m[2].replace(/\.git$/i, "").toLowerCase()}`
			: null;
		return (full && repos.has(full)) || own.has(owner);
	});
}
