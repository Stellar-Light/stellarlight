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
import { overlayWinnerOf } from "@/data/winner-overlay";
import { withReadTimeout } from "@/lib/degraded-read";
import { libraryOf } from "@/lib/hackathon-analytics";
import {
	BUILD_SEARCH_MODES,
	type BuildSearchMode,
	LINK_BASES,
	type LinkBasis,
	type LinkedProject,
} from "@/lib/hackathon-build-links";
import { BUILD_SEMANTIC_FLOOR } from "@/lib/hackathon-build-semantic";
import { heldSecurity } from "@/lib/held-repos";
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
	/** Present only on a winner that a page off DoraHacks names
	 * (src/data/winner-overlay.ts): that page, the evidence of the win. */
	winnerSource?: string;
}

/** The off-DoraHacks win of a stored entry DoraHacks did not place, or null.
 * Read here, never written: the sync stays the one writer of the stored
 * isWinner, and a placement DoraHacks assigned always wins. */
function overlayWinner(
	buildId: string,
	hackathonSlug: string,
	placedByDoraHacks: boolean,
): { placement: string; winnerSource: string } | null {
	return placedByDoraHacks ? null : overlayWinnerOf(buildId, hackathonSlug);
}

/** One project type a build was sorted into; score 0 to 1 (the share of its
 * nearest directory projects that carry the type, similarity-weighted).
 * precision and recall are the type's own leave-one-out numbers on the
 * hand-typed directory at its cut: how far a count of this type can be
 * trusted (a high-precision, low-recall type undercounts). */
export interface BuildCategory {
	type: string;
	score: number;
	precision?: number;
	recall?: number;
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

/** Libraries declared by more than a tenth of the repos read, never matched
 * as packages: they say how a build was made, not what it is, and their
 * names hold sdk, soroban, api, wallet and x402 (2026-10-23, of 1,013 repos
 * read: Stellar JS SDK 77%, Soroban Rust SDK 66%, Freighter API 36%, Stellar
 * Wallets Kit 27%, x402 12%; the next, @stellar/design-system, 5%). With
 * x402 kept, x402 Stellar MCP, graded the same idea as "AI agent that pays
 * for API calls with USDC using x402", left that idea's keyword top 20. */
const COMMON_LIBRARIES = new Set([
	"Stellar JS SDK",
	"Soroban Rust SDK",
	"Freighter API",
	"Stellar Wallets Kit",
	"x402",
]);

/** A build's matched text with the packages its read repo declares, common
 * libraries left out. */
const withPackages = (b: IndexedBuild) =>
	`${b.haystack} ${(b.stack ?? [])
		.filter((p) => !COMMON_LIBRARIES.has(libraryOf(p)))
		.join(" ")
		.toLowerCase()}`;

/** Live read of the most recent ended DoraHacks events: the fallback when the
 * store has nothing to serve. Capped to bound cold-rebuild cost; the store has
 * no cap. Each event settles on its own: one that cannot be read (its winner
 * list unreadable, a timeout) is left out and named in the log, never served
 * with its winners unplaced, and the rest are served. Routes treat a left-out
 * event as one whose submissions are not held: getHackathon reads it live or
 * says its winners could not be checked, and a hackathon filter naming it
 * warns that 0 matched from it is not evidence. None read: the index is
 * empty, and buildHackathonBuildsIndex throws. */
async function buildLiveIndex(): Promise<IndexedBuild[]> {
	const ended = endedDoraHacksEvents(await fetchAllDoraHacksHackathons()).slice(
		0,
		40,
	);
	const unread: string[] = [];
	// Settled per event inside the 6-wide pool: Promise.allSettled over all 40
	// at once would drop the cap and invite the rate limits that fail reads.
	const perHack = await pool(ended, 6, async (h) => {
		let subs: DoraHacksSubmission[];
		try {
			subs = await fetchHackathonSubmissions(h);
		} catch (e) {
			unread.push(`${h.uname} (${(e as Error).message})`);
			return [];
		}
		const hackathon = doraEventRef(h);
		return subs.map((s) => {
			const won = overlayWinner(s.id, hackathon.slug, s.isWinner);
			return {
				...s,
				...(won
					? {
							isWinner: true,
							hackathonPlacement: won.placement,
							winnerSource: won.winnerSource,
						}
					: {}),
				hackathon,
				haystack: haystackOf(s.name, s.description, s.track, s.award),
			};
		});
	});
	if (unread.length)
		console.error(
			`hackathon builds live read: ${unread.length} of ${ended.length} events could not be read and are left out: ${unread.join("; ")}`,
		);
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
	const won = overlayWinner(d.buildId, d.hackathonSlug, !!d.isWinner);
	return {
		id: d.buildId,
		name: d.name,
		description,
		githubUrl: d.githubUrl ?? null,
		...heldSecurity(d),
		demoUrl: d.demoUrl ?? null,
		videoUrl: d.videoUrl ?? null,
		track: d.track ?? null,
		hackathonPlacement: won?.placement ?? d.placement ?? null,
		award: d.award ?? null,
		isWinner: !!d.isWinner || !!won,
		...(won ? { winnerSource: won.winnerSource } : {}),
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
	/** Present only when the repo is held for malware: links.github and repo
	 * are then withheld (null) and this says why. */
	security?: { held: true; note: string };
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
	/** Present only when the best entry's win is named off DoraHacks. */
	winnerSource?: string;
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
	/** Every event this submission entered, best first, each with its own
	 * track, placement and award. The top-level event fields are entries[0]. */
	entries: BuildEntry[];
}

/** One event a submission entered (sls-092). */
export interface BuildEntry {
	hackathon: { title: string; slug: string; endedAt: string | null };
	track: string | null;
	placement: string | null;
	award: string | null;
	prizeUsd: number | null;
	isWinner: boolean;
	/** Present only when a page off DoraHacks names this entry's win. */
	winnerSource?: string;
}

/** A submission's event entries, best first: a placed one, then the latest
 * event. The detail's top level, search across events and review all show
 * this entry, so they never disagree about which event a submission is in. */
function entryOrder(
	a: { isWinner?: boolean | null; endedAt?: string | null },
	b: { isWinner?: boolean | null; endedAt?: string | null },
): number {
	return (
		Number(!!b.isWinner) - Number(!!a.isWinner) ||
		(b.endedAt ?? "").localeCompare(a.endedAt ?? "")
	);
}

/** One row per submission, its best entry, in index order (sls-092: the
 * index holds a row per submission and event). */
export function onePerSubmission(builds: IndexedBuild[]): IndexedBuild[] {
	const key = (b: IndexedBuild) => ({
		isWinner: b.isWinner,
		endedAt: b.hackathon.endedAt,
	});
	const best = new Map<string, IndexedBuild>();
	for (const b of builds) {
		const cur = best.get(b.id);
		if (!cur || entryOrder(key(b), key(cur)) < 0) best.set(b.id, b);
	}
	return builds.filter((b) => best.get(b.id) === b);
}

function entryOf(d: HackathonBuild): BuildEntry {
	const won = overlayWinner(d.buildId, d.hackathonSlug, !!d.isWinner);
	const placement = won?.placement ?? d.placement ?? null;
	return {
		hackathon: {
			title: d.hackathonTitle,
			slug: d.hackathonSlug,
			endedAt: d.endedAt ?? null,
		},
		track: d.track ?? null,
		placement,
		award: d.award ?? null,
		prizeUsd: parsePlacement(placement).prizeUsd || null,
		isWinner: !!d.isWinner || !!won,
		...(won ? { winnerSource: won.winnerSource } : {}),
	};
}

/** One submission from its stored rows, one per event it entered (sls-092:
 * a submission entered in two events is two rows). The top-level event
 * fields are its best entry: a placed one first, then the latest event. */
export function buildDetailFromStored(
	rows: HackathonBuild[],
	facts?: ProjectFacts,
): BuildDetail {
	// Ordered by the entries as served, so a win named off DoraHacks counts.
	const key = (r: HackathonBuild) => ({
		isWinner: entryOf(r).isWinner,
		endedAt: r.endedAt,
	});
	const sorted = [...rows].sort((a, b) => entryOrder(key(a), key(b)));
	const d = sorted[0];
	// Submission-level dates span every row: an entry restored later must not
	// make the submission look new.
	const first = rows.map((r) => r.firstSeenAt).sort();
	const last = rows.map((r) => r.lastSeenAt).sort();
	return {
		id: d.buildId,
		name: d.name,
		summary: d.vision ?? null,
		writeUp: d.description ?? null,
		selfTags: d.selfTags ?? [],
		...entryOf(d),
		entries: sorted.map(entryOf),
		links: {
			dorahacks: d.url,
			github: d.githubUrl ?? null,
			demo: d.demoUrl ?? null,
			video: d.videoUrl ?? null,
		},
		repo: d.repoFullName ?? null,
		...heldSecurity(rows.find((r) => heldSecurity(r).security) ?? d),
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
		firstSeenAt: first[0],
		lastSeenAt: last[last.length - 1],
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

/** Dedupe by event+buidl id AND by event+name (DoraHacks repeats submissions
 * across pages; a resubmission gets a new id with the same name in the same
 * event). A submission entered in two events keeps both rows, each with its
 * own placement (sls-092: keying on the id alone dropped Blend's 1st place). */
export function dedupeBuilds(rows: IndexedBuild[]): IndexedBuild[] {
	const seenId = new Set<string>();
	const seenKey = new Set<string>();
	const flat: IndexedBuild[] = [];
	for (const b of rows) {
		const id = `${b.hackathon.slug}::${b.id}`;
		const key = `${b.hackathon.slug}::${b.name.trim().toLowerCase()}`;
		if (seenId.has(id) || seenKey.has(key)) continue;
		seenId.add(id);
		seenKey.add(key);
		flat.push(b);
	}
	return flat;
}

export async function buildHackathonBuildsIndex(): Promise<IndexedBuild[]> {
	const stored = await readStoredBuilds();
	const index = dedupeBuilds(stored?.length ? stored : await buildLiveIndex());
	// Never return an empty index: unstable_cache would store it for an hour
	// in place of the last good one; a throw stores nothing. Search, analyze
	// and review answer the throw with a 503, vetIdea and the brief with null,
	// compare with a note. The event detail and builder pages still show an
	// unreadable index as no submissions, as they did an empty one.
	if (!index.length) throw new Error("hackathon builds index came back empty");
	return index;
}

export const getHackathonBuildsIndex = unstable_cache(
	buildHackathonBuildsIndex,
	// Bump when IndexedBuild's shape changes: the cache outlives deploys, and
	// an old-shape index serves every new field as unknown for up to an hour.
	// v4: an empty index is no longer cached, so one cached before this
	// deploy must not outlive it. v5: winners named off DoraHacks
	// (winnerSource), which a v4 index serves as unplaced.
	["hackathon-builds-index:v5"],
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

/** A query token and its plural or singular. */
/** A hyphenated phrase's two numbers vary on its last part only: forms of
 * the whole token stripped a short last part's s ("stellar-ens" became
 * "stellar en", which matched prose). */
function phraseForms(token: string): string[] {
	const cut = token.lastIndexOf("-") + 1;
	return wordForms(token.slice(cut)).map((f) => token.slice(0, cut) + f);
}

function wordForms(token: string): string[] {
	if (token.length > 3 && token.endsWith("s"))
		return [token, token.slice(0, -1)];
	return token.length > 2 ? [token, `${token}s`] : [token];
}

/** Expand a query token with a plural/singular stem + shared vocabulary synonyms
 *  so niche phrasing matches (nft↔non-fungible, lending↔loan/credit, …). */
export function expandBuildTerm(token: string): string[] {
	const out = new Set<string>(wordForms(token));
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
	/** Share of the query's concepts the build's own name or description
	 * uses as typed (or in the plural or singular), 0 to 1; set on word
	 * matches. A synonym does not count ("usdc" is not "stablecoin"), nor does
	 * track or award text, which names a category every entry in it shares
	 * ("Best Stablecoin Integration"). */
	textShare?: number;
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

/** A form as a whole word in any script, edge punctuation dropped ("agents,"
 * is agents), or null for a form with no letter or digit. `\b` is ASCII-only
 * and needs a word character beside the form, so it called "agents," and
 * "café" in no build while the scorer, matching them by substring, listed
 * builds that hold them (review, 2026-10-23). The warning reads this; the
 * scorer's own matching is unchanged. */
function anyScriptWord(v: string): ((hay: string) => boolean) | null {
	const core = wordCore(v);
	if (!core) return null;
	const escaped = core.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u");
	return (hay) => re.test(hay);
}

/** A token without its edge punctuation: "(rosca," is rosca. */
const wordCore = (v: string) =>
	v.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/** The plural or singular wordForms leaves out: charities is charity, family
 * is families, taxes is tax. Read only by wordsNoBuildUses: on 140 labeled
 * ideas, charities and family were called in no submission while charity
 * and families were there. */
const otherNumber = (w: string) =>
	w.endsWith("ies")
		? [`${w.slice(0, -3)}y`]
		: // Only where es is the plural ending: notes is not not, uses not us.
			/(ss|x|z|ch|sh)es$/.test(w)
			? [w.slice(0, -2)]
			: /[^aeiou]y$/.test(w)
				? [`${w.slice(0, -1)}ies`]
				: /(ss|x|z|ch|sh)$/.test(w)
					? [`${w}es`]
					: [];

/** The concepts a query is searched by: its words less query filler and the
 * generic words every submission says, each with the forms it matches. */
function queryTerms(query: string) {
	const raw = [
		...new Set(
			contentTokens(query).filter(
				(t) => !GENERIC_QUERY_TOKENS.has(t) && !QUERY_FILLER.has(t),
			),
		),
	];
	// A hyphenated phrase is one concept: "pay-per-call" also matches
	// "pay per call", "paypercall" and the plural, and its parts stop
	// counting on their own (they made one phrase weigh three times).
	const parts = new Set(
		raw.filter((t) => t.includes("-")).flatMap((t) => t.split("-")),
	);
	return raw
		.filter((t) => !parts.has(t))
		.map((t) => {
			const joined = t.includes("-")
				? phraseForms(t).flatMap((f) => [
						f.replace(/-/g, " "),
						f.replace(/-/g, ""),
					])
				: [];
			const forms = [...expandBuildTerm(t), ...joined];
			return {
				t,
				forms,
				variants: forms.map(termMatcher),
				// The word as typed, without synonyms: what textShare reads.
				own: [...wordForms(t), ...joined].map(termMatcher),
			};
		});
}

/**
 * The concepts of `q` that no build in `indexed` uses as a whole word in any
 * form (plural or singular, synonym, phrase spaced or joined) in its text or
 * declared packages, and how many concepts `q` has. When they are most of
 * q, a name alone no longer lists a build (rule L, searchHackathonBuilds);
 * when there is any, the builds route names them in a warning. On 140
 * labeled ideas (2026-10-23) the warning fires for 30 in keyword mode, each
 * named word checked unused in the stored text, and rule L drops one build,
 * graded not the idea.
 */
export function wordsNoBuildUses(
	indexed: IndexedBuild[],
	q: string,
): { absent: string[]; concepts: number } {
	// A token with no letter or digit ("!!!") is not a word: it neither counts
	// as one nor reads as absent.
	const terms = queryTerms(q.trim().toLowerCase()).filter(({ t }) =>
		/[\p{L}\p{N}]/u.test(t),
	);
	const { hays } = usedHays(indexed);
	const absent = terms
		.filter(({ t, forms }) => {
			const hits = [...forms, ...otherNumber(wordCore(t))].flatMap(
				(f) => anyScriptWord(f) ?? [],
			);
			return (
				hits.length > 0 && !hays.some((hay) => hits.some((hit) => hit(hay)))
			);
		})
		.map(({ t }) => wordCore(t));
	return { absent, concepts: terms.length };
}

/** A build's text and every package it declares, the common libraries too:
 * a word only soroban-sdk holds is a word submissions use, though matching
 * leaves that library out. */
const usedText = (b: IndexedBuild) =>
	`${b.haystack} ${(b.stack ?? []).join(" ").toLowerCase()}`;

// ponytail: keyed on the index array, so an index changed in place would
// read stale; the served index never is. A builds request read the corpus
// about three times before this.
const usedCache = new WeakMap<
	IndexedBuild[],
	{ hays: string[]; words?: Map<string, number> }
>();

/** Every build's used text, read once per index. */
function usedHays(indexed: IndexedBuild[]) {
	const hit = usedCache.get(indexed);
	if (hit) return hit;
	const c = { hays: indexed.map(usedText) };
	usedCache.set(indexed, c);
	return c;
}

/** How often each word occurs in the used text, counted once per index. */
function usedCounts(indexed: IndexedBuild[]): Map<string, number> {
	const c: { hays: string[]; words?: Map<string, number> } = usedHays(indexed);
	if (c.words) return c.words;
	const words = new Map<string, number>();
	for (const h of c.hays)
		for (const w of h.match(/[\p{L}\p{N}]+/gu) ?? [])
			words.set(w, (words.get(w) ?? 0) + 1);
	c.words = words;
	return words;
}

/** Endings stripped to find a word's stem, and the endings each kind of
 * stem takes back, for the related forms the warning names: cashing is
 * cash, hedging is hedge, shops is shopping, renting is rental, delegate is
 * delegation, algorithmic is algorithms, generator is generate. The word
 * itself takes back only inflections (port is not portal, mill not
 * million, strip not stripe), a stem ending er or or drops takes back no
 * bare stem (center is not cent, wither not with, tractor not traction), a
 * doubled consonant undone takes back no e (stalling is not stale), es is
 * dropped only after ss, x, z, ch or sh and a dropped e is not left off
 * (themes and theme are not them), er is never grown (stick is not
 * sticker) and ers never stripped (vouchers is not vouch). Review,
 * 2026-10-23. */
/** What a stem takes back, by the ending stripped to find it. An
 * inflection's stem takes back inflections only, e only after ing or ed
 * (staking is stake, hedging hedge; strips is not stripe) and es only after
 * ss, x, z, ch or sh (planning is not planes): with al, ic or ion it named
 * portal for ports, million for mills and formal for forming (re-check,
 * 2026-10-23). */
function growsFor(suffix: string, stem: string): string[] {
	if (suffix === "e") return ["ed", "ing", "al", "als", "ic", "ion"];
	if (suffix === "ic") return ["", "s"];
	if (suffix === "er" || suffix === "or") return ["e", "es", "ed", "ing"];
	return [
		"",
		"s",
		"ed",
		"ing",
		...(suffix === "ing" || suffix === "ed" ? ["e"] : []),
		...(/(ss|x|z|ch|sh)$/.test(stem) ? ["es"] : []),
	];
}
const STRIPPED = ["ing", "est", "ed", "es", "s", "e", "er", "or", "ic"];
const GROW_WORD = ["s", "es", "ed", "ing"];

/** Forms of `w` some build uses, most used first, at most 3: a stem of at
 * least four letters with a suffix grown back, never `w`'s own plural or
 * singular, all of which are unused when this is asked. */
function relatedUsed(w: string, used: Map<string, number>): string[] {
	if (!/^\p{L}+$/u.test(w)) return [];
	const stems = new Map<string, string[]>();
	for (const suffix of STRIPPED) {
		const stem = w.slice(0, -suffix.length);
		if (!w.endsWith(suffix) || stem.length < 4) continue;
		if (suffix === "es" && !/(ss|x|z|ch|sh)es$/.test(w)) continue;
		stems.set(stem, growsFor(suffix, stem));
		// shopping is shop.
		if (stem.length > 4 && /([^aeiou])\1$/.test(stem)) {
			const undone = stem.slice(0, -1);
			stems.set(
				undone,
				growsFor(suffix, undone).filter((g) => g !== "e"),
			);
		}
	}
	if (w.length >= 4) stems.set(w, GROW_WORD);
	const own = new Set([w, ...wordForms(w), ...otherNumber(w)]);
	const out = new Set<string>();
	for (const [stem, grows] of stems)
		for (const grow of grows)
			for (const form of [
				stem + grow,
				// shop is shopping.
				...(/^(ed|ing)$/.test(grow) && /[^aeiou]$/.test(stem)
					? [stem + stem.slice(-1) + grow]
					: []),
			])
				if (!own.has(form) && used.has(form)) out.add(form);
	return [...out]
		.sort((a, b) => (used.get(b) ?? 0) - (used.get(a) ?? 0))
		.slice(0, 3);
}

/** One edit apart: a letter added, dropped or changed, or two adjacent
 * letters swapped (exchnage, exchange). A swap is two edits counted one at
 * a time, so this stays within the two edits a suggestion may be. */
function oneEdit(a: string, b: string): boolean {
	if (a.length < b.length) [a, b] = [b, a];
	let i = 0;
	while (i < b.length && a[i] === b[i]) i++;
	if (a.length === b.length + 1) return a.slice(i + 1) === b.slice(i);
	if (a.length !== b.length || i === a.length) return false;
	return (
		a.slice(i + 1) === b.slice(i + 1) ||
		(a[i] === b[i + 1] &&
			a[i + 1] === b[i] &&
			a.slice(i + 2) === b.slice(i + 2))
	);
}

/** The one word some build uses that `w` looks like a typo of, or null: one
 * edit away, the same first letter, neither a prefix of the other (sleepy
 * and sleep are two words, not a typo), and no second such word unless the
 * first is used at least five times as often (submissions misspell too:
 * remmitance beside remittance). On the 2026-10-23 batteries, any word
 * within two edits named summarise for submarine and royalty for loyalty;
 * this rule names neither. */
function oneSpelling(w: string, used: Map<string, number>): string | null {
	if (!/^\p{L}{5,}$/u.test(w)) return null;
	const found = [...used.keys()]
		.filter(
			(u) =>
				u[0] === w[0] &&
				/^\p{L}{4,}$/u.test(u) &&
				!u.startsWith(w) &&
				!w.startsWith(u) &&
				oneEdit(w, u),
		)
		.sort((a, b) => (used.get(b) ?? 0) - (used.get(a) ?? 0));
	const [first, second] = found.map((u) => used.get(u) ?? 0);
	return found.length && (second === undefined || first >= 5 * second)
		? found[0]
		: null;
}

const andList = (xs: string[], and = "and") =>
	xs.length < 2
		? xs.join("")
		: `${xs.slice(0, -1).join(", ")} ${and} ${xs[xs.length - 1]}`;

/**
 * The builds route's line when any word of `q` occurs as a whole word in no
 * submission (wordsNoBuildUses), or null. It never changes rows. It names
 * the words; says what the rows are (one listed by its words matches only
 * q's other words, one found by meaning is close to q as a whole); names a
 * related form submissions do use (cash for cashing), so the line is not
 * read as nobody building for cash-out; and, when nothing is listed, asks to
 * check the spelling, naming a used word only when it is the one oneSpelling
 * finds and the word has no related form.
 */
export function unusedWordsWarning(
	indexed: IndexedBuild[],
	q: string,
	scored: ScoredBuild[],
	/** Builds rule L held back: their name matched, most of q is unused. */
	withheld: { b: IndexedBuild; matched: string[] }[] = [],
): string | null {
	const { absent, concepts } = wordsNoBuildUses(indexed, q);
	if (!absent.length) return null;
	const used = usedCounts(indexed);
	const one = absent.length === 1;
	const all = absent.length === concepts;
	const words = `searched in q (${absent.join(", ")})`;
	const head = !all
		? `${absent.length} of the ${concepts} words ${words} ${one ? "occurs" : "occur"} as a whole word in no submission in the index`
		: one
			? `the word ${words} occurs as a whole word in no submission in the index`
			: `none of the ${concepts} words ${words} occurs as a whole word in any submission in the index`;
	const byWords = scored.some((s) => s.matched.length);
	const byMeaning = scored.some((s) => s.similarity !== undefined);
	const those = one ? "that word" : "those words";
	const inside = one
		? "it only inside a longer word"
		: "them only inside longer words";
	const named = one ? "it" : "one of them";
	const related = absent.map((w) => [w, relatedUsed(w, used)] as const);
	const spelling = scored.length
		? []
		: related.flatMap(([w, r]) => {
				const s = r.length ? null : oneSpelling(w, used);
				return s ? [`${s} is a used word one edit from ${w}`] : [];
			});
	// Withheld by name, never "no match": church tithe donations app held
	// back Donation Management, and the line asked to check the spelling.
	// A word only inside a longer word of every name it matched is said so
	// (llama in MellaMate), as the listed-row sentence does.
	const n = withheld.length;
	const byName: string[] = [];
	const inLonger: string[] = [];
	for (const { t, forms } of queryTerms(q.trim().toLowerCase())) {
		// Only names the word hit at all: a word a held build matched in its
		// description alone (tracker in "gifts tracker") is not named.
		const inName = forms.map(termMatcher);
		const names = withheld
			.filter((w) => w.matched.includes(t))
			.map((w) => w.b.name.toLowerCase())
			.filter((nm) => inName.some((hit) => hit(nm)));
		if (!names.length) continue;
		const hits = forms.flatMap((f) => anyScriptWord(f) ?? []);
		const whole = names.some((nm) => hits.some((hit) => hit(nm)));
		(whole ? byName : inLonger).push(wordCore(t));
	}
	const how = [
		...(byName.length ? [`by name for ${andList(byName, "or")}`] : []),
		...(inLonger.length
			? [`inside a longer word for ${andList(inLonger, "or")}`]
			: []),
	];
	const heldText = n
		? `; ${n === 1 ? "1 build" : `${n} builds`} matched ${how.length > 1 ? `${how.join(", or ")},` : how.join("")} ${n === 1 ? "is" : "are"} not listed, because most of the words searched in q occur in no submission`
		: "";
	// Conditional: a dictionary sweep of the first wording named corrections
	// for 70 words spelled right (gamer, routine, discard).
	const body = !scored.length
		? `, and no build is listed${heldText}; if ${one ? "it is" : "one of them is"} misspelled, correct it${spelling.length ? ` (${spelling.join("; ")})` : ""}`
		: !byMeaning
			? all
				? `: a build listed by its words alone, with no similarity, holds ${inside} and is not evidence that this idea was built`
				: `, so a build listed by its words alone, with no similarity, matches only the other words of q; where its matchedTerms names ${named}, it was found inside a longer word`
			: !byWords
				? `: every build listed was found by meaning (similarity, no matchedTerms) and is close to q as a whole, not to ${those}`
				: all
					? `: a build listed by its words holds ${inside}, and a build with similarity is close to q as a whole, not to ${those}; neither is evidence that this idea was built`
					: `: a build listed by its words matches only the other words of q (where its matchedTerms names ${named}, it was found inside a longer word), and a build with similarity is close to q as a whole, not to ${those}`;
	const forms = related.filter(([, r]) => r.length);
	const formCount = forms.reduce((n, [, r]) => n + r.length, 0);
	const relatedText = forms.length
		? `; ${formCount === 1 ? "a related form is" : "related forms are"} used: ${forms.map(([w, r]) => `${andList(r)} for ${w}`).join("; ")}`
		: "";
	return head + body + (scored.length ? heldText : "") + relatedText;
}

/**
 * Score + rank builds for a topic query. Prior-art favors RECALL (a missed
 * existing build is the costly error): a NAME match surfaces (on
 * 2026-10-23, holding every name match to the half-of-concepts rule dropped
 * 8 builds graded the same idea from labeled ideas' keyword matches, three
 * of them MCP servers for "MCP server that lets AI agents use Stellar"),
 * except when most of the query's concepts occur as a whole word in no
 * build (rule L): then "quantum llama sandwich" listed a build named for
 * quantum and one with llama inside its name. Rule L lost no labeled build
 * on 140 ideas and emptied that query; on a fresh 24-query nonsense battery
 * it cut builds by 19% (538 to 436, keyword), short of the half it was held
 * to, and the owner chose to ship it. Otherwise at least half the concepts
 * must hit so a common token alone ("payments") doesn't flood. Query filler ("for", "like") and "stellar",
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
		/** One result per submission across events, its best entry
		 * (sls-092). Off for counting: analyze counts every event entry. */
		perSubmission?: boolean;
		/** Also match the packages a build's read repo declares (common
		 * libraries left out), so "passkey" finds the winner Tukar, built on
		 * passkey-kit. Only searchHackathonBuilds' own route passes it: a
		 * package says what a build was made with, not what it does, and
		 * matched for vetIdea it put 3 builds graded not prior art in its five
		 * for 3 of 140 labeled ideas and pushed a same-idea build to sixth. */
		packages?: boolean;
		/** Filled with the builds rule L held back: the name matched, but
		 * most of q is in no submission. The builds route says so. */
		withheld?: { b: IndexedBuild; matched: string[] }[];
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
	// Inside an event filter every row is that event's own entry.
	if (opts.perSubmission && !opts.hackathons?.length)
		pool = onePerSubmission(pool);
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
	const terms = queryTerms(query);
	const unused = wordsNoBuildUses(indexed, query);
	const namesAdmit = unused.absent.length * 2 <= unused.concepts;
	const hay = new Map(
		opts.packages ? pool.map((b) => [b, withPackages(b)] as const) : [],
	);
	const haystack = (b: IndexedBuild) => hay.get(b) ?? b.haystack;
	// Rarer words say more. In an agents hackathon "agents" is everywhere and
	// "x402" is not, so a build is weighed by WHICH words it covers, not how
	// many: counting words let descriptions padded with common ones ("per",
	// "api", "agents") outrank the winners that built the idea.
	const weight = new Map<string, number>();
	for (const { t, variants } of terms) {
		const df = pool.filter((b) =>
			variants.some((hit) => hit(haystack(b))),
		).length;
		weight.set(t, Math.log((pool.length + 1) / (df + 1)));
	}
	const scored: ScoredBuild[] = [];
	for (const b of pool) {
		let score = 0;
		let nameMatched = false;
		const matched = new Set<string>();
		// Concepts the build's own name or description uses as typed.
		const inText = new Set<string>();
		const name = b.name.toLowerCase();
		const text = `${name} ${b.description ?? ""}`.toLowerCase();
		for (const { t, variants, own } of terms) {
			for (const hit of variants) {
				if (hit(name)) {
					score += 3;
					matched.add(t);
					nameMatched = true;
				} else if (hit(haystack(b))) {
					score += 1;
					matched.add(t);
				}
			}
			if (own.some((hit) => hit(text))) inText.add(t);
		}
		if (
			score > 0 &&
			((nameMatched && namesAdmit) ||
				matched.size >= Math.ceil(terms.length / 2))
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
				share: matched.size / (terms.length || 1),
				textShare: inText.size / (terms.length || 1),
			});
		} else if (score > 0 && nameMatched)
			opts.withheld?.push({ b, matched: [...matched] });
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
