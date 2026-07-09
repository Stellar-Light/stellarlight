import { describe, expect, it } from "vitest";
import { rankResearchChunks } from "../research-rank";

/** 2026-07-09 — fixed clock so freshness math is deterministic. */
const NOW = Date.parse("2026-07-09T00:00:00Z");

function chunk(over: {
	url: string;
	score: number;
	publishedAt?: string | null;
	source?: string;
	content?: string;
}) {
	return {
		url: over.url,
		score: over.score,
		publishedAt: over.publishedAt ?? "2026-06-01",
		source: over.source ?? "sdf-blog",
		// Enough DISTINCT words to clear the low-value-chunk filter (it counts
		// unique tokens, so repeated filler reads as a breadcrumb stub).
		content:
			over.content ??
			`This section explains how ${over.url} approaches settlement, custody, liquidity, bridging, issuance, anchors, wallets, oracles, compliance, and developer tooling across the Stellar network. ${Array.from(
				{ length: 40 },
				(_, i) => `detail${i}`,
			).join(" ")}.`,
	};
}

describe("rankResearchChunks", () => {
	it("collapses multiple chunks of the same document to the best one", () => {
		const pool = [
			chunk({ url: "https://a.com/post", score: 0.8 }),
			chunk({ url: "https://a.com/post", score: 0.79 }),
			chunk({ url: "https://a.com/post", score: 0.78 }),
			chunk({ url: "https://b.com/post", score: 0.7 }),
			chunk({ url: "https://c.com/post", score: 0.68 }),
		];
		const out = rankResearchChunks(pool, {
			limit: 5,
			mode: "vector",
			now: NOW,
		});
		// 3 distinct docs first; refill only after each doc is represented.
		expect(out.slice(0, 3).map((c) => c.url)).toEqual([
			"https://a.com/post",
			"https://b.com/post",
			"https://c.com/post",
		]);
		expect(out[0].score).toBe(0.8); // best chunk of the dup doc kept
	});

	it("the EVM-bridging case: dedupe + trust-rank beat two stale dup chunks", () => {
		// Shaped like the real failure: a 2022 research protocol's chunks
		// scored highest cosine ×2, a current 2026 doc sat just below.
		const pool = [
			chunk({
				url: "https://stale.dev/starbridge",
				score: 0.78,
				publishedAt: "2022-06-01",
			}),
			chunk({
				url: "https://stale.dev/starbridge",
				score: 0.77,
				publishedAt: "2022-06-01",
			}),
			chunk({
				url: "https://fresh.dev/cctp-live",
				score: 0.74,
				publishedAt: "2026-05-01",
			}),
			chunk({
				url: "https://other.dev/misc",
				score: 0.6,
				publishedAt: "2025-01-01",
			}),
		];
		const out = rankResearchChunks(pool, {
			limit: 3,
			mode: "vector",
			now: NOW,
		});
		const urls = out.map((c) => c.url);
		// The stale doc appears ONCE, and the fresh near-equal doc outranks it:
		// freshness 0.93 vs ~0.19 at 540d half-life outweighs a 0.04 cosine gap.
		expect(urls.filter((u) => u.includes("starbridge"))).toHaveLength(1);
		expect(urls.indexOf("https://fresh.dev/cctp-live")).toBeLessThan(
			urls.indexOf("https://stale.dev/starbridge"),
		);
	});

	it("refills from leftover chunks when distinct docs cannot fill the page", () => {
		const pool = [
			chunk({ url: "https://a.com/long-doc", score: 0.8 }),
			chunk({ url: "https://a.com/long-doc", score: 0.75 }),
			chunk({ url: "https://b.com/post", score: 0.7 }),
		];
		const out = rankResearchChunks(pool, {
			limit: 3,
			mode: "vector",
			now: NOW,
		});
		expect(out).toHaveLength(3); // 2 distinct docs + 1 leftover
		expect(out.filter((c) => c.url === "https://a.com/long-doc")).toHaveLength(
			2,
		);
	});

	it("drops low-value chunks before ranking", () => {
		const pool = [
			chunk({
				url: "https://a.com/nav",
				score: 0.9,
				content: "Docs\nTutorials",
			}),
			chunk({ url: "https://b.com/real", score: 0.6 }),
		];
		const out = rankResearchChunks(pool, {
			limit: 5,
			mode: "vector",
			now: NOW,
		});
		expect(out.map((c) => c.url)).toEqual(["https://b.com/real"]);
	});

	it("keyword mode normalizes relevance against the pool max", () => {
		const pool = [
			chunk({ url: "https://a.com/1", score: 12 }),
			chunk({ url: "https://b.com/2", score: 6 }),
		];
		const out = rankResearchChunks(pool, {
			limit: 2,
			mode: "keyword",
			now: NOW,
		});
		expect(out[0].confidence.relevance).toBe(1);
		expect(out[1].confidence.relevance).toBe(0.5);
	});
});
