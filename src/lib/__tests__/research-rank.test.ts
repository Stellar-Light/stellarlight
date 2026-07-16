import { describe, expect, it } from "vitest";
import {
	anchorDocUrls,
	hasFullLexicalCoverage,
	identifierTargets,
	queryLexTokens,
	rankResearchChunks,
	recencyContentTokens,
	selectRecencySupplement,
} from "../research-rank";

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

describe("identifierTargets", () => {
	it("normalizes every CAP/SEP variant to the canonical zero-padded slug", () => {
		expect(identifierTargets("CAP-0038")).toEqual(["cap-0038"]);
		expect(identifierTargets("cap-38")).toEqual(["cap-0038"]);
		expect(identifierTargets("cap 38")).toEqual(["cap-0038"]);
		expect(identifierTargets("CAP #38")).toEqual(["cap-0038"]);
		expect(identifierTargets("cap0038")).toEqual(["cap-0038"]);
		expect(identifierTargets("SEP-10 web auth")).toEqual(["sep-0010"]);
		expect(identifierTargets("what does sep 24 cover?")).toEqual(["sep-0024"]);
	});

	it("dedupes and keeps mention order for multi-identifier queries", () => {
		expect(identifierTargets("cap-46 vs CAP-0038 vs cap 46")).toEqual([
			"cap-0046",
			"cap-0038",
		]);
	});

	it("does not read a calendar date as a SEP identifier", () => {
		expect(identifierTargets("what happened on Sep 24, 2025?")).toEqual([]);
		expect(identifierTargets("the outage of 24 Sep 2026")).toEqual([]);
		// …but an explicit hyphen form still counts even near a date.
		expect(identifierTargets("sep-24 changes on Sep 1, 2026")).toContain(
			"sep-0024",
		);
	});

	it("names nothing for ordinary queries", () => {
		expect(identifierTargets("asset clawback")).toEqual([]);
		expect(identifierTargets("recap 38 of the meeting")).toEqual([]);
		expect(identifierTargets(undefined)).toEqual([]);
	});
});

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

	// ── sls-019: exact CAP/SEP identifier queries (upstream #510) ──

	it("pins the identifier-named CAP above higher-cosine cross-references", () => {
		// Live shape: q=CAP-0038 ranked its own doc 23rd — chunks of OTHER CAPs
		// that mention CAP-0038 carried higher cosine than the doc itself.
		const capUrl = (id: string) =>
			`https://github.com/stellar/stellar-protocol/blob/master/core/${id}.md`;
		const pool = [
			chunk({ url: capUrl("cap-0021"), score: 0.78, source: "cap" }),
			chunk({ url: capUrl("cap-0035"), score: 0.75, source: "cap" }),
			chunk({ url: capUrl("cap-0038"), score: 0.6, source: "cap" }),
		];
		const out = rankResearchChunks(pool, {
			limit: 3,
			mode: "vector",
			query: "CAP-0038",
			now: NOW,
		});
		expect(out[0].url).toContain("cap-0038.md");
		// Exact-key hit floors relevance — the confidence must agree with the
		// served order, not read "low relevance" on the rank-1 row.
		expect(out[0].confidence.relevance).toBeGreaterThanOrEqual(0.9);
	});

	it("pins every variant form of the identifier (cap-38, cap 38, CAP #0038)", () => {
		const capUrl =
			"https://github.com/stellar/stellar-protocol/blob/master/core/cap-0038.md";
		for (const q of ["cap-38", "cap 38", "CAP #0038", "what is cap0038?"]) {
			const out = rankResearchChunks(
				[
					chunk({
						url: "https://github.com/stellar/stellar-protocol/blob/master/core/cap-0021.md",
						score: 0.8,
						source: "cap",
					}),
					chunk({ url: capUrl, score: 0.6, source: "cap" }),
				],
				{ limit: 2, mode: "vector", query: q, now: NOW },
			);
			expect(out[0].url, `query: ${q}`).toBe(capUrl);
		}
	});

	it("a compare query pins BOTH named documents ahead of bystanders", () => {
		const capUrl = (id: string) =>
			`https://github.com/stellar/stellar-protocol/blob/master/core/${id}.md`;
		const out = rankResearchChunks(
			[
				chunk({ url: capUrl("cap-0021"), score: 0.9, source: "cap" }),
				chunk({ url: capUrl("cap-0038"), score: 0.6, source: "cap" }),
				chunk({ url: capUrl("cap-0046"), score: 0.65, source: "cap" }),
			],
			{
				limit: 3,
				mode: "vector",
				query: "difference between cap-38 and cap-46",
				now: NOW,
			},
		);
		expect(out.slice(0, 2).map((c) => c.url)).toEqual([
			capUrl("cap-0046"), // higher cosine of the two pinned docs
			capUrl("cap-0038"),
		]);
	});

	it("no URL is served twice while distinct documents can fill the page", () => {
		// The sls-019 dedup leak: a starved source-filtered pool let leftover
		// chunks of already-served docs fill the page. With enough distinct
		// docs in the pool, every served URL must be unique.
		const capUrl = (id: string) =>
			`https://github.com/stellar/stellar-protocol/blob/master/core/${id}.md`;
		const pool = Array.from({ length: 12 }, (_, i) => {
			const id = `cap-00${String(35 + i).padStart(2, "0")}`;
			return [
				chunk({ url: capUrl(id), score: 0.8 - i * 0.01, source: "cap" }),
				chunk({
					url: capUrl(id),
					score: 0.79 - i * 0.01,
					source: "cap",
					content: `A second distinct section of ${id} covering ledger entries, operations, thresholds, signatures, sponsorship, reserves, and upgrade semantics. ${Array.from(
						{ length: 40 },
						(_, k) => `w${i}x${k}`,
					).join(" ")}.`,
				}),
			];
		}).flat();
		const out = rankResearchChunks(pool, {
			limit: 10,
			mode: "vector",
			query: "Asset Clawback",
			now: NOW,
		});
		expect(out).toHaveLength(10);
		expect(new Set(out.map((c) => c.url)).size).toBe(10);
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

	// ── golden latest-protocol-release: recency re-sort honesty ──

	it("recency intent: a lastmod-dated dev-docs page cannot outspend a dated announcement", () => {
		// Live shape (2026-07-14): dev-docs rows carry publishedAt from the
		// page's "Last updated on …" footer. A generic Hardhat guide edited
		// 8 days ago outranked the Protocol 27 (Zipper) announcement for
		// "latest soroban release" — an edit date is not publication evidence.
		const pool = [
			chunk({
				url: "https://developers.stellar.org/docs/learn/migrate/evm/smart-contract-deployment",
				score: 0.7,
				source: "dev-docs",
				publishedAt: "2026-07-06", // lastmod, 3 days before NOW
			}),
			chunk({
				url: "https://stellar.org/blog/foundation-news/stellar-zipper-protocol-27-upgrade-guide",
				score: 0.64,
				source: "sdf-blog",
				publishedAt: "2026-06-04", // true publication date
			}),
		];
		const out = rankResearchChunks(pool, {
			limit: 2,
			mode: "vector",
			query: "latest soroban release",
			now: NOW,
		});
		expect(out[0].url).toContain("zipper-protocol-27");
	});

	it("recency intent: publication-dated sources still compete on their real dates", () => {
		// Meeting recaps (URL-dated) and blogs keep their dated freshness —
		// only maintenance-dated sources are excluded from the recency credit.
		const pool = [
			chunk({
				url: "https://stellar.org/blog/old-announcement",
				score: 0.7,
				source: "sdf-blog",
				publishedAt: "2025-01-01",
			}),
			chunk({
				url: "https://stellar.org/blog/new-announcement",
				score: 0.68,
				source: "sdf-blog",
				publishedAt: "2026-07-01",
			}),
		];
		const out = rankResearchChunks(pool, {
			limit: 2,
			mode: "vector",
			query: "latest news",
			now: NOW,
		});
		expect(out[0].url).toContain("new-announcement");
	});
});

describe("recencyContentTokens", () => {
	it("keeps topic words, drops the recency ask and stopwords", () => {
		expect(recencyContentTokens("latest soroban release")).toEqual([
			"soroban",
			"release",
		]);
		expect(
			recencyContentTokens("what is new in 2026 for the ecosystem"),
		).toEqual(["ecosystem"]);
	});

	it("is empty for a pure recency ask and for no query", () => {
		expect(recencyContentTokens("what's new this month?")).toEqual([]);
		expect(recencyContentTokens(undefined)).toEqual([]);
	});
});

describe("selectRecencySupplement", () => {
	const NOW_TS = NOW; // 2026-07-09
	const cand = (over: {
		url: string;
		publishedAt: string | null;
		content?: string;
		title?: string;
	}) => ({
		url: over.url,
		publishedAt: over.publishedAt,
		title: over.title ?? "",
		content: over.content ?? "generic ecosystem paragraph",
	});

	it("keeps only dated, in-window docs sharing a topic token, newest first", () => {
		const out = selectRecencySupplement(
			[
				cand({
					url: "https://a.dev/zipper",
					publishedAt: "2026-06-04",
					content: "Protocol 27 Zipper upgrades the Soroban release process.",
				}),
				cand({
					url: "https://a.dev/yardstick",
					publishedAt: "2026-05-05",
					content: "Yardstick is the Protocol 26 soroban mainnet release.",
				}),
				cand({
					url: "https://a.dev/off-topic",
					publishedAt: "2026-07-01",
					content: "A partner spotlight about anchors and ramps.",
				}),
				cand({
					url: "https://a.dev/too-old",
					publishedAt: "2025-01-01",
					content: "An ancient soroban release note.",
				}),
				cand({ url: "https://a.dev/undated", publishedAt: null }),
			],
			"latest soroban release",
			{ now: NOW_TS },
		);
		expect(out.map((c) => c.url)).toEqual([
			"https://a.dev/zipper",
			"https://a.dev/yardstick",
		]);
	});

	it("caps chunks per document so one heavily-chunked roundup can't spend the budget", () => {
		const many = Array.from({ length: 10 }, (_, i) =>
			cand({
				url: "https://a.dev/roundup",
				publishedAt: "2026-07-01",
				content: `soroban roundup part ${i}`,
			}),
		);
		const out = selectRecencySupplement(
			[
				...many,
				cand({
					url: "https://a.dev/other",
					publishedAt: "2026-06-20",
					content: "another soroban update",
				}),
			],
			"latest soroban",
			{ now: NOW_TS },
		);
		expect(out.filter((c) => c.url.includes("roundup")).length).toBe(3);
		expect(out.some((c) => c.url.includes("other"))).toBe(true);
	});

	it("a pure recency ask admits any dated in-window doc, bounded by max", () => {
		const out = selectRecencySupplement(
			Array.from({ length: 30 }, (_, i) =>
				cand({
					url: `https://a.dev/p${i}`,
					publishedAt: "2026-07-01",
				}),
			),
			"what's new this month?",
			{ now: NOW_TS },
		);
		expect(out.length).toBe(15); // RECENCY_SUPPLEMENT_MAX
	});
});

describe("vertical anchor docs (RESEARCH_ANCHORS)", () => {
	const CCTP =
		"https://developers.stellar.org/docs/tokens/cross-chain-transfers";
	const ALLBRIDGE_AUDIT = "https://stellarsecurityportal.com/report/4";

	it("fires on consumer bridge intent — any wording with intent + movement context", () => {
		for (const q of [
			"bridge assets from EVM to Stellar",
			"how do I bridge USDC to stellar",
			"cross-chain transfer from ethereum",
			"bridging tokens onto stellar",
		]) {
			expect(anchorDocUrls(q), `query: ${q}`).toEqual([CCTP, ALLBRIDGE_AUDIT]);
		}
	});

	it("does not fire without movement context, on compounds, or off-topic", () => {
		expect(anchorDocUrls("starbridge protocol verification")).toEqual([]); // compound word
		expect(anchorDocUrls("tricorn bridge audit findings")).toEqual([]); // no movement context
		expect(anchorDocUrls("soroban authorization")).toEqual([]);
		expect(anchorDocUrls(undefined)).toEqual([]);
	});

	it("floors anchor relevance so embedding myopia can't bury the canonical how-to", () => {
		// Live shape: the CCTP how-to scored below the pool cutoff while
		// contract-MIGRATION docs (higher cosine, wrong intent) filled the top.
		const pool = [
			chunk({
				url: "https://developers.stellar.org/docs/learn/migrate/evm",
				score: 0.78,
				source: "dev-docs",
			}),
			{
				...chunk({ url: CCTP, score: 0.68, source: "dev-docs" }),
				title: "Cross-Chain USDC Transfers with CCTP",
			},
		];
		const out = rankResearchChunks(pool, {
			limit: 2,
			mode: "vector",
			query: "bridge assets from EVM to Stellar",
			now: NOW,
		});
		expect(out[0].url).toBe(CCTP);
		expect(out[0].confidence.relevance).toBeGreaterThanOrEqual(0.85);
		// …and the same pool WITHOUT bridge intent keeps vector order.
		const plain = rankResearchChunks(pool, {
			limit: 2,
			mode: "vector",
			query: "migrate a solidity contract",
			now: NOW,
		});
		expect(plain[0].url).toContain("/migrate/evm");
	});

	it("an identifier pin still outranks an anchor floor", () => {
		const capUrl =
			"https://github.com/stellar/stellar-protocol/blob/master/core/cap-0049.md";
		const out = rankResearchChunks(
			[
				chunk({ url: capUrl, score: 0.6, source: "cap" }),
				{
					...chunk({ url: CCTP, score: 0.7, source: "dev-docs" }),
					title: "Cross-Chain USDC Transfers with CCTP",
				},
			],
			{
				limit: 2,
				mode: "vector",
				query: "cap-49 bridge assets from evm",
				now: NOW,
			},
		);
		expect(out[0].url).toBe(capUrl);
	});
});

describe("full lexical coverage (brand/lookup queries)", () => {
	// 2026-07-16 live probes: "Alchemy Stellar Data API transfers balances"
	// ranked the chunk that literally documents Alchemy's Data API below
	// top-15 behind pages merely TITLED "Balances"/"Token Transfers", and bare
	// q=Alchemy returned 0. Full token coverage now floors relevance at 0.8.
	const ALCHEMY = "https://developers.stellar.org/docs/data/indexers";
	const coverageContent = `Portfolio APIs are offered by well-known companies. Alchemy is a widely-used data provider now live on Stellar. Its Stellar Data API serves indexed transfer history, account balances, and NFT holdings across assets and contract tokens, with pageKey pagination and RPC access. ${Array.from(
		{ length: 40 },
		(_, i) => `detail${i}`,
	).join(" ")}.`;

	it("queryLexTokens: tokenizes short queries, refuses degenerate ones", () => {
		expect(queryLexTokens("Alchemy")).toEqual(["alchemy"]);
		expect(queryLexTokens("Alchemy Stellar Data API")).toEqual([
			"alchemy",
			"stellar",
			"data",
			"api",
		]);
		// trailing-s de-plural: "transfers" must match a chunk saying
		// "transfer history" (the real Alchemy chunk's wording)
		expect(queryLexTokens("transfers balances")).toEqual([
			"transfer",
			"balance",
		]);
		// 9+ distinct tokens → semantic territory, no coverage floor
		expect(
			queryLexTokens("one two three four five six seven eight nine"),
		).toEqual([]);
		expect(queryLexTokens("")).toEqual([]);
		expect(queryLexTokens(undefined)).toEqual([]);
	});

	it("hasFullLexicalCoverage: every token verbatim, else false", () => {
		const c = { title: "Indexers Overview", content: coverageContent };
		expect(hasFullLexicalCoverage(c, ["alchemy", "stellar", "data"])).toBe(
			true,
		);
		expect(hasFullLexicalCoverage(c, ["alchemy", "nonexistenttoken"])).toBe(
			false,
		);
		expect(hasFullLexicalCoverage(c, [])).toBe(false);
	});

	it("full-coverage chunk outranks a semantically-closer chunk without the tokens", () => {
		const out = rankResearchChunks(
			[
				// cosine 0.75 → relevance ~0.67, no coverage ("balances" page noise)
				{
					...chunk({ url: "https://x/balances", score: 0.75 }),
					title: "Balances",
				},
				// cosine 0.62 → relevance ~0.23, but EVERY query token verbatim →
				// floored at 0.8
				{
					...chunk({ url: ALCHEMY, score: 0.62 }),
					title: "Indexers Overview",
					content: coverageContent,
				},
			],
			{
				limit: 2,
				mode: "vector",
				query: "Alchemy Stellar Data API transfers balances",
				now: NOW,
			},
		);
		expect(out[0].url).toBe(ALCHEMY);
	});

	it("a genuinely stronger embedding still wins over the floor", () => {
		const out = rankResearchChunks(
			[
				// cosine 0.88 → relevance 1.0 — stronger than the 0.8 floor
				{
					...chunk({ url: "https://x/strong", score: 0.88 }),
					title: "Strong Semantic Match",
				},
				{
					...chunk({ url: ALCHEMY, score: 0.6 }),
					title: "Indexers Overview",
					content: coverageContent,
				},
			],
			{
				limit: 2,
				mode: "vector",
				query: "alchemy stellar data",
				now: NOW,
			},
		);
		expect(out[0].url).toBe("https://x/strong");
	});
});

describe("full lexical coverage — discriminating gate", () => {
	// Golden regression (first deploy, 2026-07-16): "SCF handbook link" served
	// seven uniform-floored pages that merely CONTAIN scf/handbook/link,
	// crowding out the actual handbook root. When many chunks cover the token
	// set, the tokens are generic vocabulary — floor nothing.
	it("floors nothing when >5 chunks cover the tokens (generic vocabulary)", () => {
		const generic = (i: number) => ({
			...chunk({ url: `https://x/generic-${i}`, score: 0.6 }),
			title: `Tool ${i}`,
			content: `The scf handbook link and related resources. ${Array.from(
				{ length: 40 },
				(_, j) => `filler${j}`,
			).join(" ")}.`,
		});
		const out = rankResearchChunks(
			[
				// six full-coverage generic chunks at cosine 0.6...
				...Array.from({ length: 6 }, (_, i) => generic(i)),
				// ...and the genuinely-closer doc WITHOUT the word "link"
				{
					...chunk({ url: "https://gitbook/root", score: 0.78 }),
					title: "Welcome to the SCF Handbook",
					content: `Welcome to the SCF Handbook, the guide to the Stellar Community Fund. ${Array.from(
						{ length: 40 },
						(_, j) => `detail${j}`,
					).join(" ")}.`,
				},
			],
			{ limit: 3, mode: "vector", query: "SCF handbook link", now: NOW },
		);
		// with the gate, no floor fires — the strongest embedding wins
		expect(out[0].url).toBe("https://gitbook/root");
	});
});
