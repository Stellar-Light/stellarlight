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
	"tokenized dollar",
	"tokenised dollar",
	"yield-bearing",
];

/** Terms that only count alongside another — too common to stand alone. */
const WEAK = ["peg", "issuer", "anchor", "circle", "paxos", "reserve", "mint"];

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
}

function decode(s: string): string {
	return s
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
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
 * A strong term in the TITLE qualifies outright — that is what the piece is
 * called. Otherwise the body must carry a strong term plus a second distinct
 * signal, which is what separates "an article about USDC" from "a weekly
 * roundup that mentions USDC in passing".
 *
 * Undated entries are dropped: a feed without dates invites the reader to
 * assume "recent", the one thing it cannot promise.
 */
export function selectStablecoinNews(
	entries: FeedEntry[],
	limit = 8,
): NewsItem[] {
	const byUrl = new Map<string, NewsItem>();

	for (const e of entries) {
		if (!e.publishedAt) continue;
		const title = e.title.toLowerCase();
		const body = `${title} ${e.description.toLowerCase()}`;

		const titleHits = STRONG.filter((t) => title.includes(t));
		const bodyStrong = STRONG.filter((t) => body.includes(t));
		const bodyWeak = WEAK.filter((t) => body.includes(t));

		const aboutIt =
			titleHits.length > 0 ||
			(bodyStrong.length > 0 && bodyStrong.length + bodyWeak.length >= 2);
		if (!aboutIt) continue;

		if (!byUrl.has(e.url))
			byUrl.set(e.url, {
				title: e.title,
				url: e.url,
				publishedAt: e.publishedAt,
				source: "lumenloop",
				matched: [...new Set([...bodyStrong, ...bodyWeak])],
			});
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

/** Corpus source ids that carry dated editorial writing. */
export const NEWS_SOURCES = ["lumenloop-research"];

/** Normalize an ingested research chunk into the same shape as a feed entry. */
export function docToEntry(d: {
	title?: string | null;
	url?: string | null;
	content?: string | null;
	publishedAt?: string | null;
}): FeedEntry | null {
	if (!d.url || !d.title) return null;
	return {
		title: d.title,
		url: d.url,
		publishedAt: d.publishedAt ?? null,
		description: d.content ?? "",
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

export function sourceLabel(source: string): string {
	return source === "lumenloop" ? "Lumen Loop" : source;
}
