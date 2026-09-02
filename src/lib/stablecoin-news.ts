/**
 * Stablecoin coverage for the Latest Updates dock on /stablecoins.
 *
 * Source is Lumen Loop's RSS feed — their whole aggregation, not just their
 * own essays. Their site carries ~1,950 /news/ items against ~35 /research/
 * ones, so reading only the research corpus (as this did first) showed weekly
 * roundups instead of stablecoin news.
 *
 * DELIBERATELY NOT VECTOR SEARCH. Asked for "stablecoin" with no filter, our
 * own research endpoint returns the Stellar Consensus Protocol paper as its
 * top hit — a real semantic neighbour and a useless answer. A feed built on
 * nearest-neighbour fills with plausible noise nobody notices.
 *
 * And not a bare keyword match either: a weekly roundup that says
 * "stablecoin" once is not stablecoin news. The rule below wants the SUBJECT,
 * not a mention.
 */

const FEED_URL = "https://lumenloop.com/rss.xml";

/** Terms that name the subject itself. */
const STRONG = [
	"stablecoin",
	"usdc",
	"eurc",
	"pyusd",
	"usdy",
	"usdglo",
	// 2026-09-02: USDT0's Stellar launch was announced by SDF and matched
	// nothing here — the dock's whole subject had arrived and it stayed quiet.
	"usdt0",
	"usdt",
	"tokenized dollar",
	"tokenised dollar",
	"yield-bearing",
];

/** Titles that are digests, never coverage of one subject. */
const DIGEST = /weekly roundup|week of|ama recap|newsletter/i;

export interface NewsItem {
	title: string;
	url: string;
	publishedAt: string | null;
	source: string;
	/** Terms that made it relevant — keeps the rule inspectable. */
	matched: string[];
}

export interface FeedEntry {
	title: string;
	url: string;
	publishedAt: string | null;
	description: string;
	/** Publisher id. Defaults to the RSS feed when absent. */
	source?: string;
}

function decode(s: string): string {
	return s
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
		.replace(/&#x([0-9a-f]+);/gi, (_, h) =>
			String.fromCodePoint(Number.parseInt(h, 16)),
		)
		.replace(/&amp;/g, "&")
		.replace(/<[^>]+>/g, "")
		.trim();
}

function tag(block: string, name: string): string {
	const m = block.match(
		new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"),
	);
	return m ? decode(m[1]) : "";
}

/** Parse an RSS 2.0 body into entries. Regex, not a parser dep — one feed, one shape. */
export function parseFeed(xml: string): FeedEntry[] {
	const out: FeedEntry[] = [];
	for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
		const block = m[1];
		const url = tag(block, "link") || tag(block, "guid");
		const title = tag(block, "title");
		if (!url || !title) continue;
		const pub = tag(block, "pubDate");
		const d = pub ? new Date(pub) : null;
		out.push({
			title,
			url,
			publishedAt: d && Number.isFinite(d.getTime()) ? d.toISOString() : null,
			description: tag(block, "description"),
		});
	}
	return out;
}

/**
 * Keep only entries genuinely ABOUT stablecoins.
 *
 * THE TITLE MUST NAME THE SUBJECT. Body matching was tried first and failed
 * in the obvious way: a weekly roundup's body mentions stablecoin, USDC,
 * Circle and mint, so every roundup outscored the actual coverage and the
 * dock filled with digests. A headline is what an editor decided the piece is
 * about; a body is just what it touched.
 *
 * Digest titles are refused outright even when they do name a coin, because
 * "this week: USDC, grants, validators" is a summary of a week, not an
 * article about USDC.
 *
 * Undated entries are dropped: a feed without dates invites the reader to
 * assume "recent", the one thing it cannot promise.
 */
/** Publisher precedence when two sources carry the SAME headline. */
const SOURCE_RANK: Record<string, number> = { "sdf-blog": 2 };
const rank = (source: string) => SOURCE_RANK[source] ?? 1;

/** Same story, different publisher: compare headlines, not URLs. */
const titleKey = (t: string) =>
	t
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();

export function selectStablecoinNews(
	entries: FeedEntry[],
	limit = 8,
): NewsItem[] {
	const byUrl = new Map<string, NewsItem>();
	// An aggregator and the original publisher both carried a launch under the
	// same headline, and URL dedup let both through — the dock showed "USDT0 is
	// now live on Stellar" twice (2026-09-02). Keep one row, and prefer whoever
	// actually announced it.
	const byTitle = new Map<string, string>();

	for (const e of entries) {
		if (!e.publishedAt) continue;
		if (DIGEST.test(e.title)) continue;
		const title = e.title.toLowerCase();
		const titleHits = STRONG.filter((t) => title.includes(t));
		if (titleHits.length === 0) continue;

		const key = titleKey(e.title);
		const seenUrl = byTitle.get(key);
		if (seenUrl) {
			const seen = byUrl.get(seenUrl);
			if (seen && rank(e.source ?? "lumenloop") > rank(seen.source))
				byUrl.delete(seenUrl);
			else continue;
		}
		if (!byUrl.has(e.url)) {
			byTitle.set(key, e.url);
			byUrl.set(e.url, {
				// Decode HERE, not in the parser: corpus titles arrive straight
				// from the DB and never pass through parseFeed, which is how
				// "Ondo&#x27;s USDY" reached the dock.
				title: decode(e.title),
				url: e.url,
				publishedAt: e.publishedAt,
				// The dock reads more than one publisher now — an SDF post must
				// not be credited to Lumen Loop.
				source: e.source ?? "lumenloop",
				matched: titleHits,
			});
		}
	}

	return [...byUrl.values()]
		.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
		.slice(0, limit);
}

/** Fetch the RSS window. Returns [] on any failure — the dock is supplementary. */
export async function fetchFeedEntries(): Promise<FeedEntry[]> {
	try {
		const res = await fetch(FEED_URL, {
			headers: { accept: "application/rss+xml, application/xml, text/xml" },
			signal: AbortSignal.timeout(10_000),
			next: { revalidate: 1800 },
		});
		if (!res.ok) return [];
		return parseFeed(await res.text());
	} catch {
		return [];
	}
}

/**
 * Corpus source ids that carry dated editorial writing.
 *
 * sdf-blog joined 2026-09-02: the Foundation announces the launches this page
 * is about (USDT0's went out that morning), and the keyword rule below is what
 * keeps the rest of its output — protocol releases, grants — off the dock.
 */
export const NEWS_SOURCES = ["lumenloop-research", "sdf-blog"];

/** Normalize an ingested research chunk into the same shape as a feed entry. */
export function docToEntry(d: {
	title?: string | null;
	url?: string | null;
	content?: string | null;
	publishedAt?: string | null;
	source?: string | null;
}): FeedEntry | null {
	if (!d.url || !d.title) return null;
	return {
		title: d.title,
		url: d.url,
		publishedAt: d.publishedAt ?? null,
		description: d.content ?? "",
		source: d.source ?? undefined,
	};
}

/**
 * Merge the live RSS window with the ingested corpus.
 *
 * The feed carries only the ~10 newest items, so it supplies freshness; the
 * corpus supplies depth. Dedupe on URL, RSS winning, since its title and date
 * come straight from the publisher rather than from a chunked copy.
 */
export function mergeNews(
	feed: FeedEntry[],
	corpus: FeedEntry[],
	limit = 8,
): NewsItem[] {
	const seen = new Set(feed.map((e) => e.url));
	return selectStablecoinNews(
		[...feed, ...corpus.filter((e) => !seen.has(e.url))],
		limit,
	);
}

/** "3d ago", "5h ago", "just now". */
export function relativeTime(iso: string | null, now = Date.now()): string {
	if (!iso) return "";
	const then = new Date(iso).getTime();
	if (!Number.isFinite(then)) return "";
	const mins = Math.floor((now - then) / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months}mo ago`;
	return `${Math.floor(months / 12)}y ago`;
}

const SOURCE_LABELS: Record<string, string> = {
	lumenloop: "Lumen Loop",
	"lumenloop-research": "Lumen Loop",
	"sdf-blog": "Stellar Development Foundation",
};

export function sourceLabel(source: string): string {
	return SOURCE_LABELS[source] ?? source;
}
