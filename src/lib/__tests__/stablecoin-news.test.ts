import { describe, expect, it } from "vitest";
import { relativeTime, toNews } from "../stablecoin-news";

const day = (d: string) => `2026-08-${d}T12:00:00.000Z`;

describe("toNews", () => {
	it("keeps only docs that actually mention the subject", () => {
		const out = toNews([
			{
				title: "Stellar Is Now A Native Gateway For USDC",
				url: "https://lumenloop.com/research/usdc",
				publishedAt: day("05"),
				source: "lumenloop-research",
			},
			{
				// The exact false positive vector search produces for "stablecoin".
				title: "The Stellar Consensus Protocol",
				content: "A federated model for internet-level consensus.",
				url: "https://stellar.org/papers/scp.pdf",
				publishedAt: day("04"),
				source: "paper",
			},
		]);
		expect(out.map((n) => n.title)).toEqual([
			"Stellar Is Now A Native Gateway For USDC",
		]);
	});

	it("matches on body text when the title alone does not", () => {
		const out = toNews([
			{
				title: "Why Compliant Privacy Is a Business Requirement",
				content: "…for fintechs moving stablecoin volume across borders.",
				url: "https://lumenloop.com/research/privacy",
				publishedAt: day("06"),
				source: "lumenloop-research",
			},
		]);
		expect(out).toHaveLength(1);
		expect(out[0].matched).toContain("stablecoin");
	});

	it("dedupes the chunks of one article, keeping the fullest title", () => {
		const out = toNews([
			{
				title: "Spend the Dollar, Keep the",
				content: "stablecoin",
				url: "https://lumenloop.com/research/usst",
				publishedAt: day("07"),
				source: "lumenloop-research",
			},
			{
				title: "Spend the Dollar, Keep the Yield: USST Arrives on Stellar",
				content: "stablecoin",
				url: "https://lumenloop.com/research/usst",
				publishedAt: day("07"),
				source: "lumenloop-research",
			},
		]);
		expect(out).toHaveLength(1);
		expect(out[0].title).toBe(
			"Spend the Dollar, Keep the Yield: USST Arrives on Stellar",
		);
	});

	it("drops undated docs — a news rail must not imply recency it cannot show", () => {
		const out = toNews([
			{
				title: "A stablecoin explainer",
				url: "https://example.com/x",
				publishedAt: null,
				source: "lumenloop-research",
			},
		]);
		expect(out).toEqual([]);
	});

	it("orders newest first and respects the limit", () => {
		const mk = (n: string, d: string) => ({
			title: `stablecoin ${n}`,
			url: `https://lumenloop.com/${n}`,
			publishedAt: day(d),
			source: "lumenloop-research",
		});
		const out = toNews([mk("a", "01"), mk("c", "09"), mk("b", "05")], 2);
		expect(out.map((n) => n.title)).toEqual(["stablecoin c", "stablecoin b"]);
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
