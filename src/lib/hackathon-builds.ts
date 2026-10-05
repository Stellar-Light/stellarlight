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
import {
	BUILD_SEARCH_MODES,
	type BuildSearchMode,
	LINK_BASES,
	type LinkBasis,
	type LinkedProject,
} from "@/lib/hackathon-build-links";
import { BUILD_SEMANTIC_FLOOR } from "@/lib/hackathon-build-semantic";
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
	/** Stellar packages the build's repo declares, present only when the repo
	 * was read: absent is unknown, [] is "declares none". */
	stack?: string[];
	/** Directory project types the build was sorted into, best first, present
	 * only when categorized. */
	categories?: BuildCategory[];
	/** The repo's last commit on its default branch, present only when read. */
	activity?: { lastCommitAt: string | null; archived: boolean };
	/** The repo answered not found the last time it was read. */
	repoMissing?: boolean;
}

/** One project type a build was sorted into; score 0 to 1 (the share of its
 * nearest directory projects that carry the type, similarity-weighted). */
export interface BuildCategory {
	type: string;
	score: number;
}

const isLinkBasis = (v: unknown): v is LinkBasis =>
	(LINK_BASES as readonly unknown[]).includes(v);

const isCategoryList = (v: unknown): v is BuildCategory[] =>
	Array.isArray(v) &&
	v.every(
		(c) =>
			typeof c?.type === "string" &&
			typeof (c as BuildCategory).score === "number",
	);

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

/** What a linked project is today: its directory status and whether SCF
 * funded it. */
export interface ProjectFacts {
	status: string | null;
	scfAwarded: boolean;
	factsReadAt: string;
}

/** The facts of the projects these builds link to, read fresh, or null when
 * the read failed (then the facts are unknown, never "unfunded"). */
export async function readProjectFacts(
	payload: NonNullable<Awaited<ReturnType<typeof getPayloadSafe>>>,
	slugs: string[],
): Promise<Map<string, ProjectFacts> | null> {
	if (!slugs.length) return new Map();
	try {
		const res = await withReadTimeout(
			payload.find({
				collection: "projects",
				where: { slug: { in: slugs } },
				pagination: false,
				depth: 0,
				select: { slug: true, status: true, scf: { awarded: true } },
			}),
			8_000,
		);
		const factsReadAt = new Date().toISOString();
		return new Map(
			(
				res.docs as Array<{
					slug: string;
					status?: string | null;
					scf?: { awarded?: boolean | null } | null;
				}>
			).map((p) => [
				p.slug,
				{ status: p.status ?? null, scfAwarded: !!p.scf?.awarded, factsReadAt },
			]),
		);
	} catch {
		return null;
	}
}

const linkedProject = (d: HackathonBuild, facts?: ProjectFacts) =>
	d.projectSlug
		? {
				slug: d.projectSlug,
				name: d.projectName ?? d.projectSlug,
				...(isLinkBasis(d.projectLinkBasis)
					? { basis: d.projectLinkBasis }
					: {}),
				...(facts ? facts : {}),
			}
		: null;

/** A stored row in the shape the index serves. `vision` (DoraHacks' one-line
 * summary) stays `description`, as the live read has always served it. */
export function indexedFromStored(
	d: HackathonBuild,
	facts?: ProjectFacts,
): IndexedBuild {
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
		...(d.linkCheckedAt ? { project: linkedProject(d, facts) } : {}),
		...(d.stackReadAt ? { stack: d.stack ?? [] } : {}),
		...(d.categoriesAt && isCategoryList(d.categories)
			? { categories: d.categories }
			: {}),
		...(d.activityCheckedAt
			? {
					activity: {
						lastCommitAt: d.repoLastCommitAt ?? null,
						archived: !!d.repoArchived,
					},
				}
			: {}),
		...(d.repoMissingAt && (!d.stackReadAt || d.repoMissingAt > d.stackReadAt)
			? { repoMissing: true }
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
	/** Absent = repo not read; [] = read, declares no Stellar package. */
	stack?: string[];
	stackReadAt: string | null;
	repoMissingAt: string | null;
	/** Absent = not categorized. */
	categories?: BuildCategory[];
	categoriesAt: string | null;
	/** How the categories were assigned, with its measured precision. */
	categoriesMethod: string | null;
	/** Absent = activity not read. */
	activity?: { lastCommitAt: string | null; archived: boolean };
	activityCheckedAt: string | null;
	firstSeenAt: string;
	lastSeenAt: string;
	writeUpReadAt: string | null;
}

export function buildDetailFromStored(
	d: HackathonBuild,
	facts?: ProjectFacts,
): BuildDetail {
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
		...(d.linkCheckedAt ? { project: linkedProject(d, facts) } : {}),
		...(d.stackReadAt ? { stack: d.stack ?? [] } : {}),
		stackReadAt: d.stackReadAt ?? null,
		repoMissingAt: d.repoMissingAt ?? null,
		...(d.categoriesAt && isCategoryList(d.categories)
			? { categories: d.categories }
			: {}),
		categoriesAt: d.categoriesAt ?? null,
		categoriesMethod: d.categoriesMethod ?? null,
		...(d.activityCheckedAt
			? {
					activity: {
						lastCommitAt: d.repoLastCommitAt ?? null,
						archived: !!d.repoArchived,
					},
				}
			: {}),
		activityCheckedAt: d.activityCheckedAt ?? null,
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
				select: {
					description: false,
					selfTags: false,
					embedding: false,
					embeddingTextHash: false,
				},
			}),
			8_000,
		);
		const docs = res.docs as HackathonBuild[];
		const facts = await readProjectFacts(payload, [
			...new Set(
				docs.map((d) => d.projectSlug).filter((s): s is string => !!s),
			),
		]);
		return docs.map((d) =>
			indexedFromStored(
				d,
				d.projectSlug ? facts?.get(d.projectSlug) : undefined,
			),
		);
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
	// Bump when IndexedBuild's shape changes: the cache outlives deploys, and
	// an old-shape index serves every new field as unknown for up to an hour.
	["hackathon-builds-index:v3"],
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
	/** Vector similarity to the query, when search by meaning ran. */
	similarity?: number;
}

export { BUILD_SEARCH_MODES, type BuildSearchMode };

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
	opts: {
		winnersOnly?: boolean;
		track?: string;
		/** Only builds whose repo declares this Stellar package. */
		package?: string;
		/** Only builds from these events (slugs). */
		hackathons?: string[];
		/** Only builds sorted into this project type. */
		category?: string;
		mode?: BuildSearchMode;
		/** buildId -> similarity from semanticBuildScores; required for
		 * meaning and hybrid, ignored for keyword. */
		semantic?: Map<string, number>;
	} = {},
): ScoredBuild[] {
	let pool = indexed;
	if (opts.winnersOnly) pool = pool.filter((b) => b.isWinner);
	if (opts.track) {
		const t = opts.track.toLowerCase();
		pool = pool.filter((b) => (b.track ?? "").toLowerCase().includes(t));
	}
	if (opts.package) {
		const p = opts.package.toLowerCase();
		pool = pool.filter((b) => b.stack?.includes(p));
	}
	if (opts.hackathons?.length) {
		const hs = new Set(opts.hackathons.map((h) => h.toLowerCase()));
		pool = pool.filter((b) => hs.has(b.hackathon.slug.toLowerCase()));
	}
	if (opts.category) {
		const c = opts.category.toLowerCase();
		pool = pool.filter((b) =>
			b.categories?.some((x) => x.type.toLowerCase() === c),
		);
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
	const mode = opts.mode ?? "keyword";
	const sem = opts.semantic;
	if (mode === "keyword" || !sem) {
		const rank = (s: ScoredBuild) =>
			s.coverage * (s.b.isWinner ? WINNER_EDGE : 1);
		scored.sort((a, b) => rank(b) - rank(a) || b.score - a.score);
		return scored;
	}
	// Meaning and hybrid: builds close in meaning join the keyword matches,
	// within the same winners/track filters. Similarity is scaled 0 to 1
	// between the floor and this query's best match; keyword coverage 0 to 1
	// by its share of the query's total weight.
	const byId = new Set(scored.map((s) => s.b.id));
	for (const b of pool)
		if (sem.has(b.id) && !byId.has(b.id))
			scored.push({ b, score: 0, matched: [], coverage: 0, share: 0 });
	const top = Math.max(BUILD_SEMANTIC_FLOOR + 0.01, ...sem.values());
	const rel = (id: string) => {
		const s = sem.get(id);
		return s == null
			? 0
			: (s - BUILD_SEMANTIC_FLOOR) / (top - BUILD_SEMANTIC_FLOOR);
	};
	const totalWeight = [...weight.values()].reduce((n, w) => n + w, 0) || 1;
	for (const s of scored) {
		const sim = sem.get(s.b.id);
		if (sim != null) s.similarity = sim;
	}
	const blend = (s: ScoredBuild) =>
		(mode === "meaning"
			? rel(s.b.id)
			: 0.5 * (s.coverage / totalWeight) + 0.5 * rel(s.b.id)) *
		(s.b.isWinner ? WINNER_EDGE : 1);
	const out =
		mode === "meaning" ? scored.filter((s) => sem.has(s.b.id)) : scored;
	out.sort((a, b) => blend(b) - blend(a) || b.score - a.score);
	return out;
}
