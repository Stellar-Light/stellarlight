import { describe, expect, it } from "vitest";
import {
	type FeedEntry,
	mergeNews,
	parseFeed,
	relativeTime,
	selectStablecoinNews,
} from "../stablecoin-news";

const day = (d: string) => `2026-08-${d}T12:00:00.000Z`;
const entry = (o: Partial<FeedEntry>): FeedEntry => ({
	title: "",
	url: "https://lumenloop.com/news/x",
	publishedAt: day("10"),
	description: "",
	...o,
});

describe("parseFeed", () => {
	it("reads title, link, date and description out of RSS", () => {
		const out = parseFeed(`<rss><channel>
      <item>
        <title>Stellar Is Now A Native Gateway For USDC</title>
        <link>https://lumenloop.com/news/usdc-gateway</link>
        <pubDate>Tue, 18 Aug 2026 11:00:00 GMT</pubDate>
        <description><![CDATA[Circle's <b>USDC</b> lands natively.]]></description>
      </item>
    </channel></rss>`);
		expect(out).toHaveLength(1);
		expect(out[0].title).toBe("Stellar Is Now A Native Gateway For USDC");
		expect(out[0].url).toBe("https://lumenloop.com/news/usdc-gateway");
		expect(out[0].publishedAt).toBe("2026-08-18T11:00:00.000Z");
		// CDATA unwrapped and inline tags stripped.
		expect(out[0].description).toBe("Circle's USDC lands natively.");
	});

	it("skips items with no link or no title rather than emitting blanks", () => {
		expect(
			parseFeed("<rss><item><title>Orphan</title></item></rss>"),
		).toHaveLength(0);
	});
});

describe("selectStablecoinNews", () => {
	it("takes a piece whose TITLE names the subject", () => {
		const out = selectStablecoinNews([
			entry({ title: "Stellar Is Now A Native Gateway For USDC" }),
		]);
		expect(out).toHaveLength(1);
	});

	it("rejects a roundup that only mentions it in passing", () => {
		// One strong term, no second signal — a mention, not the subject.
		const out = selectStablecoinNews([
			entry({
				title: "Stellar Weekly Roundup: week of Aug 7, 2026",
				description: "Grants, a hackathon, validator news, and a stablecoin.",
			}),
		]);
		expect(out).toEqual([]);
	});

	it("takes a body that carries the subject plus a second signal", () => {
		const out = selectStablecoinNews([
			entry({
				title: "A new dollar lands",
				description: "The USDC issuer, Circle, expands its reserve reporting.",
			}),
		]);
		expect(out).toHaveLength(1);
		expect(out[0].matched).toContain("usdc");
	});

	it("rejects the consensus paper — the vector-search false positive", () => {
		const out = selectStablecoinNews([
			entry({
				title: "The Stellar Consensus Protocol",
				description: "A federated model for internet-level consensus.",
			}),
		]);
		expect(out).toEqual([]);
	});

	it("drops undated entries — a feed must not imply recency it cannot show", () => {
		const out = selectStablecoinNews([
			entry({ title: "A stablecoin explainer", publishedAt: null }),
		]);
		expect(out).toEqual([]);
	});

	it("orders newest first and respects the limit", () => {
		const mk = (n: string, d: string) =>
			entry({
				title: `stablecoin ${n}`,
				url: `https://lumenloop.com/news/${n}`,
				publishedAt: day(d),
			});
		const out = selectStablecoinNews(
			[mk("a", "01"), mk("c", "09"), mk("b", "05")],
			2,
		);
		expect(out.map((n) => n.title)).toEqual(["stablecoin c", "stablecoin b"]);
	});
});

describe("mergeNews", () => {
	it("prefers the RSS copy of an article the corpus also holds", () => {
		const url = "https://lumenloop.com/news/usdc";
		const out = mergeNews(
			[entry({ url, title: "Stellar Is Now A Native Gateway For USDC" })],
			[entry({ url, title: "Stellar Is Now A Native Gateway For" })],
		);
		expect(out).toHaveLength(1);
		expect(out[0].title).toBe("Stellar Is Now A Native Gateway For USDC");
	});

	it("keeps corpus items the feed window has scrolled past", () => {
		const out = mergeNews(
			[entry({ url: "https://lumenloop.com/news/new", title: "USDC today" })],
			[
				entry({
					url: "https://lumenloop.com/research/old",
					title: "USDC last year",
					publishedAt: day("01"),
				}),
			],
		);
		expect(out.map((n) => n.title)).toEqual(["USDC today", "USDC last year"]);
	});
});

describe("relativeTime", () => {
	const now = new Date("2026-08-19T12:00:00.000Z").getTime();
	it("scales the unit to the age", () => {
		expect(relativeTime("2026-08-19T11:58:00.000Z", now)).toBe("2m ago");
		expect(relativeTime("2026-08-19T07:00:00.000Z", now)).toBe("5h ago");
		expect(relativeTime("2026-08-16T12:00:00.000Z", now)).toBe("3d ago");
		expect(relativeTime("2026-06-19T12:00:00.000Z", now)).toBe("2mo ago");
	});
	it("is empty for a missing date rather than guessing", () => {
		expect(relativeTime(null, now)).toBe("");
		expect(relativeTime("not-a-date", now)).toBe("");
	});
});
