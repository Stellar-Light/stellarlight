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
import { CORE_SYNONYMS, GENERIC_QUERY_TOKENS } from "@/lib/search-vocabulary";
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

// ── Prior-art search over the index ───────────────────────────────────────
// Lifted verbatim from /api/hackathons/builds so the hackathon-brief composite
// can call it in-process (a server route must never HTTP-fetch its own API —
// self-referential SSR fetches fail on Vercel). The route calls this too, so
// the two can never drift.

/** Expand a query token with a plural/singular stem + shared vocabulary synonyms
 *  so niche phrasing matches (nft↔non-fungible, lending↔loan/credit, …). */
export function expandBuildTerm(token: string): string[] {
	const out = new Set<string>([token]);
	if (token.length > 3 && token.endsWith("s")) out.add(token.slice(0, -1));
	else if (token.length > 2) out.add(`${token}s`);
	for (const syn of CORE_SYNONYMS[token] ?? []) out.add(syn);
	return [...out];
}

export interface ScoredBuild {
	b: IndexedBuild;
	score: number;
	matched: string[];
}

/**
 * Score + rank builds for a topic query. Prior-art favors RECALL (a missed
 * existing build is the costly error): a NAME match always surfaces;
 * otherwise at least half the concepts must hit so a common token alone
 * ("payments") doesn't flood. Ranking handles precision from there. With no
 * query: browse mode — winners first, then most-voted.
 */
export function searchHackathonBuilds(
	indexed: IndexedBuild[],
	q: string,
	opts: { winnersOnly?: boolean; track?: string } = {},
): ScoredBuild[] {
	let pool = indexed;
	if (opts.winnersOnly) pool = pool.filter((b) => b.isWinner);
	if (opts.track) {
		const t = opts.track.toLowerCase();
		pool = pool.filter((b) => (b.track ?? "").toLowerCase().includes(t));
	}
	const query = q.trim().toLowerCase();
	if (!query) {
		return pool
			.map((b) => ({
				b,
				score: (b.isWinner ? 1000 : 0) + Math.min(b.voteCount, 100),
				matched: [] as string[],
			}))
			.sort((a, b) => b.score - a.score);
	}
	const tokens = query
		.split(/\s+/)
		.filter((t) => t && !GENERIC_QUERY_TOKENS.has(t));
	const scored: ScoredBuild[] = [];
	for (const b of pool) {
		let score = 0;
		let nameMatched = false;
		const matched = new Set<string>();
		for (const t of tokens) {
			for (const v of expandBuildTerm(t)) {
				if (b.name.toLowerCase().includes(v)) {
					score += 3;
					matched.add(t);
					nameMatched = true;
				} else if (b.haystack.includes(v)) {
					score += 1;
					matched.add(t);
				}
			}
		}
		if (
			score > 0 &&
			(nameMatched || matched.size >= Math.ceil(tokens.length / 2))
		) {
			score += b.isWinner ? 2 : 0;
			score += Math.min(b.voteCount, 20) * 0.05;
			scored.push({ b, score, matched: [...matched] });
		}
	}
	scored.sort((a, b) => b.score - a.score);
	return scored;
}
