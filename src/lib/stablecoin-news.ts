/**
 * Stablecoin coverage for the Latest Updates rail on /stablecoins.
 *
 * DELIBERATELY NOT VECTOR SEARCH. Asked for "stablecoin" without a filter,
 * our own research endpoint returns the Stellar Consensus Protocol paper as
 * its top hit — a real semantic neighbour of the query and a completely
 * irrelevant answer. A news rail built on nearest-neighbour would quietly
 * fill with plausible-looking noise.
 *
 * So the rule here is deterministic and boring: the doc must come from a
 * dated editorial source AND its title or body must actually say one of the
 * stablecoin terms. A headline that never mentions the subject is not
 * coverage of it.
 */

/** Terms that make an article genuinely about stablecoins on Stellar. */
const TERMS = [
	"stablecoin",
	"usdc",
	"eurc",
	"pyusd",
	"usdy",
	"peg",
	"issuer",
	"anchor",
	"yield-bearing",
	"tokenized dollar",
	"tokenised dollar",
];

/** Sources that carry dated, editorial coverage — not reference docs. */
export const NEWS_SOURCES = ["lumenloop-research"];

export interface NewsItem {
	title: string;
	url: string;
	publishedAt: string | null;
	source: string;
	/** Which terms matched — kept so the rule stays inspectable. */
	matched: string[];
}

interface RawDoc {
	title?: string | null;
	url?: string | null;
	content?: string | null;
	publishedAt?: string | null;
	source?: string | null;
}

/**
 * Filter, dedupe and order editorial docs into a news list.
 *
 * The corpus is chunked, so one article appears many times — dedupe on URL
 * and keep the chunk whose title is longest (chunk titles are sometimes
 * truncated). Undated docs are dropped: a news rail without a date invites
 * the reader to assume "recent", which is the one thing we can't promise.
 */
export function toNews(docs: RawDoc[], limit = 6): NewsItem[] {
	const byUrl = new Map<string, NewsItem>();

	for (const d of docs) {
		const url = (d.url ?? "").trim();
		const title = (d.title ?? "").trim();
		if (!url || !title || !d.publishedAt) continue;

		const haystack = `${title} ${d.content ?? ""}`.toLowerCase();
		const matched = TERMS.filter((t) => haystack.includes(t));
		if (matched.length === 0) continue;

		const prev = byUrl.get(url);
		if (prev && prev.title.length >= title.length) continue;
		byUrl.set(url, {
			title,
			url,
			publishedAt: d.publishedAt,
			source: d.source ?? "",
			matched,
		});
	}

	return [...byUrl.values()]
		.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
		.slice(0, limit);
}

/** "3d ago", "5h ago", "just now" — the rail's timestamp form. */
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

/** Human label for a corpus source id. */
export function sourceLabel(source: string): string {
	return source === "lumenloop-research" ? "Lumen Loop" : source;
}
