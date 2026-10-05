/**
 * Flattened cross-hackathon buidl index (DoraHacks submissions), shared by
 * /api/hackathons/builds, the hackathon brief and the builder profile pages.
 * Served from our own store (the hackathon-builds collection, filled by
 * scripts/sync-hackathon-builds.ts), falling back to a live DoraHacks read of
 * the most recent ended events when the store is empty or unreachable.
 * Cached with unstable_cache for an hour so a profile render never pays the
 * cold fan-out.
 */
import { unstable_cache } from "next/cache";
import { withReadTimeout } from "@/lib/degraded-read";
import type { LinkedProject } from "@/lib/hackathon-build-links";
import {
	type DoraHacksSubmission,
	doraEventRef,
	endedDoraHacksEvents,
	fetchAllDoraHacksHackathons,
	fetchHackathonSubmissions,
	parsePlacement,
} from "@/lib/integrations/dorahacks";
import { getPayloadSafe } from "@/lib/payload-client";
import { contentTokens } from "@/lib/repo-search";
import { CORE_SYNONYMS, GENERIC_QUERY_TOKENS } from "@/lib/search-vocabulary";
import type { HackathonBuild } from "@/payload-types";

export interface IndexedBuild extends DoraHacksSubmission {
	hackathon: { title: string; slug: string; endedAt: string | null };
	haystack: string; // lowercased name + description + track + award, for matching
	/** Only on rows served from the store, where the link was checked: the
	 * directory project that lists this build's exact repo, or null when none
	 * does. Absent on a live-read row: not checked, which is not "none". */
	project?: LinkedProject | null;
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

const haystackOf = (
	name: string,
	description: string | null,
	track: string | null,
	award: string | null,
) => `${name} ${description ?? ""} ${track ?? ""} ${award ?? ""}`.toLowerCase();

/** Live read of the most recent ended DoraHacks events: the fallback when the
 * store has nothing to serve. Capped to bound cold-rebuild cost; the store has
 * no cap. */
async function buildLiveIndex(): Promise<IndexedBuild[]> {
	const ended = endedDoraHacksEvents(await fetchAllDoraHacksHackathons()).slice(
		0,
		40,
	);
	const perHack = await pool(ended, 6, async (h) => {
		const subs = await fetchHackathonSubmissions(h);
		const hackathon = doraEventRef(h);
		return subs.map((s) => ({
			...s,
			hackathon,
			haystack: haystackOf(s.name, s.description, s.track, s.award),
		}));
	});
	return perHack.flat();
}

/** A stored row in the shape the index serves. `vision` (DoraHacks' one-line
 * summary) stays `description`, as the live read has always served it. */
export function indexedFromStored(d: HackathonBuild): IndexedBuild {
	const description = d.vision ?? null;
	return {
		id: d.buildId,
		name: d.name,
		description,
		githubUrl: d.githubUrl ?? null,
		demoUrl: d.demoUrl ?? null,
		videoUrl: d.videoUrl ?? null,
		track: d.track ?? null,
		hackathonPlacement: d.placement ?? null,
		award: d.award ?? null,
		isWinner: !!d.isWinner,
		voteCount: null,
		url: d.url,
		source: "dorahacks",
		hackathon: {
			title: d.hackathonTitle,
			slug: d.hackathonSlug,
			endedAt: d.endedAt ?? null,
		},
		haystack: haystackOf(d.name, description, d.track ?? null, d.award ?? null),
		...(d.linkCheckedAt
			? {
					project: d.projectSlug
						? { slug: d.projectSlug, name: d.projectName ?? d.projectSlug }
						: null,
				}
			: {}),
	};
}

/** One stored submission in full, as getHackathonBuild serves it. */
export interface BuildDetail {
	id: string;
	name: string;
	/** DoraHacks' one-line summary. */
	summary: string | null;
	/** The team's own write-up, markdown as published. A claim, not proof. */
	writeUp: string | null;
	selfTags: string[];
	hackathon: { title: string; slug: string; endedAt: string | null };
	track: string | null;
	placement: string | null;
	award: string | null;
	prizeUsd: number | null;
	isWinner: boolean;
	links: {
		dorahacks: string;
		github: string | null;
		demo: string | null;
		video: string | null;
	};
	repo: string | null;
	/** Absent = link not checked; null = checked, no project lists the repo. */
	project?: LinkedProject | null;
	firstSeenAt: string;
	lastSeenAt: string;
	writeUpReadAt: string | null;
}

export function buildDetailFromStored(d: HackathonBuild): BuildDetail {
	return {
		id: d.buildId,
		name: d.name,
		summary: d.vision ?? null,
		writeUp: d.description ?? null,
		selfTags: d.selfTags ?? [],
		hackathon: {
			title: d.hackathonTitle,
			slug: d.hackathonSlug,
			endedAt: d.endedAt ?? null,
		},
		track: d.track ?? null,
		placement: d.placement ?? null,
		award: d.award ?? null,
		prizeUsd: parsePlacement(d.placement ?? null).prizeUsd || null,
		isWinner: !!d.isWinner,
		links: {
			dorahacks: d.url,
			github: d.githubUrl ?? null,
			demo: d.demoUrl ?? null,
			video: d.videoUrl ?? null,
		},
		repo: d.repoFullName ?? null,
		...(d.linkCheckedAt
			? {
					project: d.projectSlug
						? { slug: d.projectSlug, name: d.projectName ?? d.projectSlug }
						: null,
				}
			: {}),
		firstSeenAt: d.firstSeenAt,
		lastSeenAt: d.lastSeenAt,
		writeUpReadAt: d.detailReadAt ?? null,
	};
}

/** Every stored build, or null when the store could not be read. A build
 * DoraHacks stopped listing is still served (that is the point of storing
 * it); one the team deleted or made private stays stored, not served. */
async function readStoredBuilds(): Promise<IndexedBuild[] | null> {
	const payload = await getPayloadSafe();
	if (!payload) return null;
	try {
		const res = await withReadTimeout(
			payload.find({
				collection: "hackathon-builds",
				where: { hiddenUpstream: { not_equals: true } },
				pagination: false,
				depth: 0,
				// The full write-ups run to several KB each and the index never
				// reads them; leaving them out keeps this read small.
				select: { description: false, selfTags: false },
			}),
			8_000,
		);
		return (res.docs as HackathonBuild[]).map(indexedFromStored);
	} catch (e) {
		console.error(
			"hackathon-builds store read failed; serving the live DoraHacks read",
			e,
		);
		return null;
	}
}

/** Dedupe by buidl id AND by event+name (DoraHacks repeats submissions across
 * pages; a resubmission gets a new id with the same name in the same event). */
function dedupeBuilds(rows: IndexedBuild[]): IndexedBuild[] {
	const seenId = new Set<string>();
	const seenKey = new Set<string>();
	const flat: IndexedBuild[] = [];
	for (const b of rows) {
		const key = `${b.hackathon.slug}::${b.name.trim().toLowerCase()}`;
		if (seenId.has(b.id) || seenKey.has(key)) continue;
		seenId.add(b.id);
		seenKey.add(key);
		flat.push(b);
	}
	return flat;
}

export async function buildHackathonBuildsIndex(): Promise<IndexedBuild[]> {
	const stored = await readStoredBuilds();
	return dedupeBuilds(stored?.length ? stored : await buildLiveIndex());
}

export const getHackathonBuildsIndex = unstable_cache(
	buildHackathonBuildsIndex,
	["hackathon-builds-index:v2"],
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
	/** How much of the query the build covers, each word weighted by rarity. */
	coverage: number;
	/** Share of the query's concepts the build covers, 0 to 1. */
	share: number;
}

/** A winner's edge over a build about as relevant as it: enough to put
 * winners first among near-equals, not enough to lift a winner past a build
 * that covers the idea clearly better. */
const WINNER_EDGE = 1.25;

/** Comparison filler the shared stopword list keeps: "an app like X" is a
 * question about X, so "like" must not count as a concept a build covers. */
const QUERY_FILLER = new Set(["like", "similar"]);

/** A term of three letters or fewer ("ai", "zk", "nft") matches as a whole
 * word only: as a substring, "ai" hit every "chain", "paid" and "maintain". */
function termMatcher(v: string): (hay: string) => boolean {
	if (v.length > 3) return (hay) => hay.includes(v);
	const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const re = new RegExp(`\\b${escaped}\\b`);
	return (hay) => re.test(hay);
}

/**
 * Score + rank builds for a topic query. Prior-art favors RECALL (a missed
 * existing build is the costly error): a NAME match always surfaces;
 * otherwise at least half the concepts must hit so a common token alone
 * ("payments") doesn't flood. Query filler ("for", "like") and "stellar",
 * which every submission says, are not concepts.
 *
 * Order: how much of the query a build covers, each word weighted by how
 * rare it is across the pool, with a modest edge for prize winners (winners
 * first among similarly relevant builds, the useful order for prior art),
 * then score. Score alone let a title stuffed with the query's words outrank
 * the winner that built the idea ("Stripe for AI agents": five unplaced
 * builds above TollPay, which won with "Stripe for MCP servers"). With no
 * query: browse mode, winners first, then most-voted.
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
				score: (b.isWinner ? 1000 : 0) + Math.min(b.voteCount ?? 0, 100),
				matched: [] as string[],
				coverage: 0,
				share: 0,
			}))
			.sort((a, b) => b.score - a.score);
	}
	const raw = [
		...new Set(
			contentTokens(query).filter(
				(t) => !GENERIC_QUERY_TOKENS.has(t) && !QUERY_FILLER.has(t),
			),
		),
	];
	// A hyphenated phrase is one concept: "pay-per-call" also matches
	// "pay per call" and "paypercall", and its parts stop counting on their
	// own (they made one phrase weigh three times).
	const parts = new Set(
		raw.filter((t) => t.includes("-")).flatMap((t) => t.split("-")),
	);
	const tokens = raw.filter((t) => !parts.has(t));
	const terms = tokens.map((t) => ({
		t,
		variants: [
			...expandBuildTerm(t),
			...(t.includes("-") ? [t.replace(/-/g, " "), t.replace(/-/g, "")] : []),
		].map(termMatcher),
	}));
	// Rarer words say more. In an agents hackathon "agents" is everywhere and
	// "x402" is not, so a build is weighed by WHICH words it covers, not how
	// many: counting words let descriptions padded with common ones ("per",
	// "api", "agents") outrank the winners that built the idea.
	const weight = new Map<string, number>();
	for (const { t, variants } of terms) {
		const df = pool.filter((b) =>
			variants.some((hit) => hit(b.haystack)),
		).length;
		weight.set(t, Math.log((pool.length + 1) / (df + 1)));
	}
	const scored: ScoredBuild[] = [];
	for (const b of pool) {
		let score = 0;
		let nameMatched = false;
		const matched = new Set<string>();
		const name = b.name.toLowerCase();
		for (const { t, variants } of terms) {
			for (const hit of variants) {
				if (hit(name)) {
					score += 3;
					matched.add(t);
					nameMatched = true;
				} else if (hit(b.haystack)) {
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
			score += Math.min(b.voteCount ?? 0, 20) * 0.05;
			const coverage = [...matched].reduce(
				(n, t) => n + (weight.get(t) ?? 0),
				0,
			);
			scored.push({
				b,
				score,
				matched: [...matched],
				coverage,
				share: matched.size / (tokens.length || 1),
			});
		}
	}
	const rank = (s: ScoredBuild) =>
		s.coverage * (s.b.isWinner ? WINNER_EDGE : 1);
	scored.sort((a, b) => rank(b) - rank(a) || b.score - a.score);
	return scored;
}
