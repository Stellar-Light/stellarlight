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
			chunk({
				url: "https://a.com/long-doc",
				score: 0.75,
				// distinct content — a real doc's chunks differ (the ingester
				// hashes content); identical content is the mirror case, deduped
				content: `A second, different section of the same long document covering settlement, custody, liquidity, bridging, issuance, anchors, wallets, oracles, compliance, and tooling. ${Array.from(
					{ length: 40 },
					(_, i) => `other${i}`,
				).join(" ")}.`,
			}),
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

	// ── Audit R2: research-lane ranking honesty ──

	it("drops junk URLs (author archives, pagination mirrors, meetings index)", () => {
		const pool = [
			chunk({
				url: "https://developers.stellar.org/meetings/authors/carstenjacobsen/page/2",
				score: 0.9,
			}),
			chunk({
				url: "https://developers.stellar.org/meetings/authors/2",
				score: 0.88,
			}),
			chunk({ url: "https://developers.stellar.org/meetings", score: 0.87 }),
			chunk({
				url: "https://developers.stellar.org/meetings/archive",
				score: 0.86,
			}),
			chunk({ url: "https://developers.stellar.org/docs/real", score: 0.6 }),
		];
		const out = rankResearchChunks(pool, {
			limit: 5,
			mode: "vector",
			now: NOW,
		});
		expect(out.map((c) => c.url)).toEqual([
			"https://developers.stellar.org/docs/real",
		]);
	});

	it("a dated meeting recap cannot outrank the canonical doc it mentions", () => {
		// Shaped like the real failure: meetings/2024/02/01 (one-min recap,
		// stored as dev-docs → 0.95 authority + evergreen) sat at #1 above
		// CAP-0051 for the secp256r1 query. Reclassification prices it as a
		// meeting note (authority 0.5) with URL-dated freshness.
		const pool = [
			{
				// built without the helper so publishedAt stays truly null —
				// the reclass must derive the date from the URL itself
				...chunk({
					url: "https://developers.stellar.org/meetings/2024/02/01",
					score: 0.78,
					source: "dev-docs",
				}),
				publishedAt: null,
			},
			{
				...chunk({
					url: "https://github.com/stellar/stellar-protocol/blob/master/core/cap-0051.md",
					score: 0.76,
					source: "cap",
				}),
				publishedAt: null,
			},
		];
		const out = rankResearchChunks(pool, {
			limit: 2,
			mode: "vector",
			now: NOW,
		});
		expect(out[0].url).toContain("cap-0051");
		const meeting = out.find((c) => c.url.includes("/meetings/"));
		expect(meeting?.confidence.authority).toBe(0.5);
		// Freshness derived from the URL date (2024-02-01), not evergreen 1.0.
		expect(meeting?.confidence.freshness).toBeLessThan(0.6);
	});

	it("collapses exact-duplicate content mirrored across different URLs", () => {
		const mirrored = "The identical recap content served from three URLs.";
		const pool = [
			chunk({
				url: "https://developers.stellar.org/meetings/2025/02/27",
				score: 0.8,
				content: mirrored,
			}),
			chunk({
				url: "https://developers.stellar.org/blog/mirror-a",
				score: 0.79,
				content: mirrored,
			}),
			chunk({
				url: "https://developers.stellar.org/blog/mirror-b",
				score: 0.78,
				content: mirrored,
			}),
			chunk({ url: "https://other.dev/distinct", score: 0.6 }),
		];
		const out = rankResearchChunks(pool, {
			limit: 4,
			mode: "vector",
			now: NOW,
		});
		expect(
			out.filter((c) => c.content === mirrored).length,
		).toBeLessThanOrEqual(1);
	});

	it("title match boosts the doc whose title IS the query", () => {
		// 'Install the CLI' ranked 16 for q="install stellar cli" while
		// same-score chunks with unrelated titles filled the top.
		const pool = [
			{
				...chunk({
					url: "https://d.dev/docs/tools/cli/install-cli",
					score: 0.7,
				}),
				title: "Install the CLI",
			},
			{
				...chunk({ url: "https://d.dev/docs/unrelated", score: 0.7 }),
				title: "Quarterly ecosystem recap",
			},
		];
		const out = rankResearchChunks(pool, {
			limit: 2,
			mode: "vector",
			query: "install stellar cli",
			now: NOW,
		});
		expect(out[0].url).toContain("install-cli");
		expect(out[0].confidence.relevance).toBeGreaterThan(
			out[1].confidence.relevance,
		);
	});

	it("named-protocol match beats a generic title-word hit on the wrong record", () => {
		// Real-world shape (live probe 2026-07-10): BOTH titles contain
		// 'Audit Report', so the generic token 'audit' gave both rows the
		// same 0.5 boost and xycloans kept the top on a 0.01 cosine edge.
		// The protocol field naming the queried record must count as a FULL
		// match — the user asked about THIS record by name.
		const pool = [
			{
				...chunk({ url: "https://audits.dev/xycloans", score: 0.66 }),
				source: "audit",
				title: "xycLoans — OtterSec Audit Report",
				protocol: "xycloans",
			},
			{
				...chunk({ url: "https://audits.dev/hiyield", score: 0.65 }),
				source: "audit",
				title: "HiYield — Veridise Audit Report",
				protocol: "HiYield",
			},
		];
		const out = rankResearchChunks(pool, {
			limit: 2,
			mode: "vector",
			query: "hiyield audit",
			now: NOW,
		});
		expect(out[0].url).toContain("hiyield");
		expect(out[0].confidence.relevance).toBeGreaterThan(
			out[1].confidence.relevance,
		);
	});
});
