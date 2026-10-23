/**
 * An event named in q, for searchHackathonBuilds. Agents put event names in
 * q ("HackMeridian 2025 winners", "builds from Stellar Hacks: Blend"), and
 * the route searched the name as words in submission text: on 1.9.95,
 * q=HackMeridian 2025 served 5 builds, none from hackmeridian-2025, whose
 * curated winners hold no text to match.
 */
import { CURATED_HACKATHONS } from "@/data/curated-hackathons";
import type { IndexedBuild } from "@/lib/hackathon-builds";
import { isContentStopword } from "@/lib/repo-search";
import { GENERIC_QUERY_TOKENS } from "@/lib/search-vocabulary";

export interface NamedEvent {
	slug: string;
	title: string;
}

export type EventInQuery =
	/** One event named in full; `rest` is q without the name, "" when no
	 * topic word is left. */
	| { kind: "event"; slug: string; matched: string; rest: string }
	/** Full names of more than one event. */
	| { kind: "several"; slugs: string[]; matched: string[] }
	/** No full name, but words that start the titles of several events. */
	| { kind: "partial"; slugs: string[]; matched: string }
	| { kind: "none" };

/** Words that ask for an event's own entries rather than a topic: after an
 * event's name, "winners" or "builds from" leave nothing to search.
 * ponytail: a hand list; a rest such as "give me" is still searched as
 * text. */
const ENTRY_WORDS = new Set([
	"build",
	"builds",
	"built",
	"buidl",
	"buidls",
	"project",
	"projects",
	"submission",
	"submissions",
	"submitted",
	"entry",
	"entries",
	"team",
	"teams",
	"win",
	"wins",
	"won",
	"winner",
	"winners",
	"winning",
	"prize",
	"prizes",
	"placed",
	"finalist",
	"finalists",
	"result",
	"results",
	"hackathon",
	"hackathons",
	"event",
	"events",
	"list",
]);

interface Word {
	w: string;
	start: number;
	end: number;
}

/** A string's words as names are compared: runs of letters and digits,
 * accent-free and lowercased, each with where it sits in the string. Every
 * other character (":", "|", the dashes, ",", "+", "&") separates words. */
function wordsOf(s: string): Word[] {
	return [...s.matchAll(/[\p{L}\p{N}\p{M}]+/gu)].flatMap((m) => {
		const w = m[0].normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
		const start = m.index ?? 0;
		return w ? [{ w, start, end: start + m[0].length }] : [];
	});
}

/** Words of q the build scorer would search for a topic. */
const isTopicWord = (w: string) =>
	w.length > 1 &&
	!isContentStopword(w) &&
	!GENERIC_QUERY_TOKENS.has(w) &&
	!ENTRY_WORDS.has(w);

interface Span {
	slug: string;
	start: number;
	end: number;
}

/** Every place q holds an event's title (its words as one run of q's
 * words) or its slug as typed. A slug is matched with its hyphens: dropped,
 * build-on-stellar and stellar-latam would be "build on Stellar" and
 * "Stellar LATAM" in topic queries. */
function namesIn(q: string, qw: Word[], events: NamedEvent[]): Span[] {
	const out: Span[] = [];
	for (const { slug, title } of events) {
		const tw = wordsOf(title).map((x) => x.w);
		if (tw.length)
			for (let i = 0; i + tw.length <= qw.length; i++)
				if (tw.every((w, j) => qw[i + j].w === w))
					out.push({
						slug,
						start: qw[i].start,
						end: qw[i + tw.length - 1].end,
					});
		const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		if (slug)
			for (const m of q.matchAll(
				new RegExp(`(?<![\\p{L}\\p{N}-])${escaped}(?![\\p{L}\\p{N}-])`, "giu"),
			))
				out.push({
					slug,
					start: m.index ?? 0,
					end: (m.index ?? 0) + slug.length,
				});
	}
	return out;
}

/** q's words outside these spans, as typed, with the text between two of
 * them that no span parts; a span between them leaves one space. Built from
 * the word offsets, not a trailing-separator pattern, which retries from
 * every character of a long run (16,000 marks before a letter: 0.2 s). */
function cut(q: string, qw: Word[], spans: Span[]): string {
	let out = "";
	let last: Word | null = null;
	let parted = false;
	for (const w of qw) {
		if (spans.some((s) => w.start >= s.start && w.end <= s.end)) {
			parted = true;
			continue;
		}
		if (last) out += parted ? " " : q.slice(last.end, w.start);
		out += q.slice(w.start, w.end);
		last = w;
		parted = false;
	}
	return out.replace(/\s+/g, " ").trim();
}

/**
 * The event q names, if any. A full name is a title or a slug, compared
 * accent-free, in any case, on whole words; the longest name wins over any
 * shorter one it overlaps. Without one, the longest run of q's words that
 * starts the titles of two or more events and holds a word that is not a
 * stopword is a partial name ("HackMeridian", "Stellar Hacks"; not
 * "Stellar"). A run in the middle of a title is not read: "real world"
 * would name "Stellar Hacks: Real-World ZK" in every real-world-asset query.
 */
export function eventInQuery(q: string, events: NamedEvent[]): EventInQuery {
	const qw = wordsOf(q);
	if (!qw.length) return { kind: "none" };
	const kept: Span[] = [];
	// Longest first. A name at the very place of a kept one is kept too: two
	// events that share a title.
	for (const m of namesIn(q, qw, events).sort(
		(a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start,
	))
		if (
			kept.every(
				(k) =>
					(k.start === m.start && k.end === m.end) ||
					m.end <= k.start ||
					m.start >= k.end,
			)
		)
			kept.push(m);
	const spans = [
		...new Map(kept.map((k) => [`${k.start}:${k.end}`, k])).values(),
	].sort((a, b) => a.start - b.start);
	const text = (s: Span) => q.slice(s.start, s.end);
	const slugs = [...new Set(kept.map((k) => k.slug))].sort();
	if (slugs.length > 1)
		return { kind: "several", slugs, matched: spans.map(text) };
	if (slugs.length === 1) {
		const rest = cut(q, qw, spans);
		return {
			kind: "event",
			slug: slugs[0],
			matched: text(kept[0]),
			rest: wordsOf(rest).some(({ w }) => isTopicWord(w)) ? rest : "",
		};
	}
	const titles = events.map((e) => ({
		slug: e.slug,
		words: wordsOf(e.title).map((x) => x.w),
	}));
	let best: { slugs: string[]; start: number; end: number; n: number } | null =
		null;
	for (let i = 0; i < qw.length; i++)
		for (let n = 1; i + n <= qw.length; n++) {
			const run = qw.slice(i, i + n).map((x) => x.w);
			const starting = [
				...new Set(
					titles
						.filter(
							(t) =>
								t.words.length >= n && run.every((w, j) => t.words[j] === w),
						)
						.map((t) => t.slug),
				),
			];
			if (starting.length < 2) break;
			if (run.some((w) => !isContentStopword(w)) && n > (best?.n ?? 0))
				best = {
					slugs: starting.sort(),
					start: qw[i].start,
					end: qw[i + n - 1].end,
					n,
				};
		}
	return best
		? {
				kind: "partial",
				slugs: best.slugs,
				matched: q.slice(best.start, best.end),
			}
		: { kind: "none" };
}

/** What searchHackathonBuilds reads into meta.inferredFilter. */
export interface InferredFilter {
	hackathon: string;
	matched: string;
}

/**
 * The builds route's request with an event named in q applied as the
 * hackathon filter, and the warnings that say so. Events: those the cached
 * index holds plus the curated events off DoraHacks (hackmeridian-2026 has
 * no stored submissions), with no read added. ponytail: a DoraHacks event
 * with no stored submissions is not inferred; read the listing if one
 * matters. Any hackathon parameter turns inference off; empty, it is the
 * opt-out that searches q's words as text in every event.
 */
export function inferEventFilter(
	sp: URLSearchParams,
	indexed: IndexedBuild[],
): {
	params: URLSearchParams;
	inferredFilter?: InferredFilter;
	warnings: string[];
} {
	const q = sp.get("q") ?? "";
	if (!q.trim()) return { params: sp, warnings: [] };
	const titles = new Map<string, string>();
	for (const b of indexed) titles.set(b.hackathon.slug, b.hackathon.title);
	for (const h of CURATED_HACKATHONS)
		if (!titles.has(h.uname)) titles.set(h.uname, h.title);
	const found = eventInQuery(
		q,
		[...titles].map(([slug, title]) => ({ slug, title })),
	);
	if (sp.has("hackathon")) {
		const pieces = (s: string) =>
			s
				.toLowerCase()
				.split(",")
				.map((p) => p.trim());
		const sent = pieces(sp.get("hackathon") ?? "");
		if (found.kind !== "event" || !sent.some(Boolean))
			return { params: sp, warnings: [] };
		// The slug, or the title as a run of the comma-separated values (a
		// title can hold commas), as parseBuildFilters reads them.
		const title = pieces(titles.get(found.slug) ?? found.slug);
		const selected =
			sent.includes(found.slug) ||
			sent.some((_, i) => title.every((p, j) => sent[i + j] === p));
		return {
			params: sp,
			warnings: selected
				? []
				: [
						`q names the event '${found.matched}' (${found.slug}), which hackathon= does not select; nothing was inferred and q was searched as text inside the selected events`,
					],
		};
	}
	if (found.kind === "none") return { params: sp, warnings: [] };
	if (found.kind === "partial")
		return {
			params: sp,
			warnings: [
				`q holds '${found.matched}', the start of the names of ${found.slugs.length} events (${found.slugs.join(", ")}); nothing was inferred and q was searched as text; to search one of them, send hackathon=<slug>`,
			],
		};
	if (found.kind === "several")
		return {
			params: sp,
			warnings: [
				`q names ${found.slugs.length} events (${found.slugs.join(", ")}); nothing was inferred and q was searched as text; to search them, send hackathon=${found.slugs.join(",")}`,
			],
		};
	const params = new URLSearchParams(sp);
	params.set("hackathon", found.slug);
	if (found.rest) params.set("q", found.rest);
	else params.delete("q");
	return {
		params,
		inferredFilter: { hackathon: found.slug, matched: found.matched },
		warnings: [
			`q holds the event name '${found.matched}', so hackathon=${found.slug} was applied and the name removed from q (meta.inferredFilter); to search q's words as text in every event instead, send hackathon= with no value`,
		],
	};
}
