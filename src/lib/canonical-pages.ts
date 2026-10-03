/**
 * CANONICAL_PAGES — the declarative registry of canonical SDF/stellar.org
 * pages the research corpus MUST cover, with a per-page signature contract.
 *
 * Why this exists (sls-055 / #533): sls-020 found the corpus missing SDF's
 * security-program pages and we ingested exactly those and stopped. sls-055
 * proved the CLASS: the whole canonical non-blog stellar.org organizational
 * family was absent (Mandate incl. the self-funded/pays-taxes wording, Terms
 * incl. the Delaware-nonprofit wording, Foundation, Team, Enterprise Fund
 * incl. the venture-style + portfolio-over-$100m wording, Quarterly Reports).
 * Per-query synonym patches would hide a family omission — so the family is
 * declared HERE, in one registry, and guarded as a class:
 *
 *   - scripts/ingest-sdf-org.ts ingests every `ingestedBy: "ingest-sdf-org.ts"`
 *     row into the `sdf-org` research source (rendered-page text, canonical
 *     URL, page-stated date when present).
 *   - scripts/ingest-security-program.ts imports its URLs from this registry
 *     (sls-020's pages folded in, one mechanism — the registry can't drift
 *     from the ingester).
 *   - scripts/eval/corpus-coverage-check.ts (weekly, engine-c-health.yml)
 *     asserts every row has ≥1 corpus chunk whose url matches AND whose
 *     content contains each registered signature phrase — a family member
 *     going missing, a page moving, or a renderer change that drops the
 *     quotable wording reds the weekly tracker without waiting for a
 *     downstream consumer filing.
 *
 * `signatures` are verbatim phrases verified on the LIVE page at
 * registry-write time (2026-07-13 for every row below). Keep them:
 *   - short and load-bearing (the exact claim consumers must be able to quote),
 *   - free of HTML entities/smart quotes (they're matched against the
 *     stripHtml'd chunk text, which does not decode every entity),
 *   - stable (prefer the sentence's spine over dates/figures that move —
 *     unless the figure IS the claim, e.g. the Enterprise Fund portfolio).
 *
 * Crawl-observation time: each chunk carries an explicit `observedAt`, stamped
 * every ingest run (even when content is unchanged) — distinct from
 * `publishedAt`, which is set only when the page itself states a date (see each
 * row's `dateStrategy`), and from Payload `updatedAt`, which advances only on a
 * content change. Historical pages are labeled historical in their titles
 * rather than given invented dates.
 */

import type { ResearchSource } from "./research-ingest";

export type CanonicalFamily =
	| "foundation"
	| "mandate"
	| "enterprise-fund"
	| "terms"
	| "quarterly-reports"
	| "security-program"
	| "research-grants"
	| "asset-launches"
	| "learn"
	| "use-cases"
	| "programs";

export interface CanonicalPage {
	/** Stable registry key. sdf-org rows chunk under parentDocId `sdf-org-<id>`. */
	id: string;
	/** Canonical URL — the exact `url` the ingested chunks carry. */
	url: string;
	family: CanonicalFamily;
	/** Parent-doc title for the ingested chunks (citation surface). */
	title: string;
	/** Research source whose ingester writes this page's chunks. */
	source: Extract<
		ResearchSource,
		"sdf-org" | "security-program" | "sdf-blog" | "dev-docs"
	>;
	/** Which script produces the chunks (documentation + skip accounting). */
	ingestedBy:
		| "ingest-sdf-org.ts"
		| "ingest-security-program.ts"
		| "ingest-sdf-blog.ts"
		| "ingest-developers-docs.ts";
	/**
	 * Verbatim phrases from the live page. The coverage guard requires EACH
	 * to appear (case-insensitive) in ≥1 corpus chunk whose url matches; the
	 * sdf-org ingester also refuses to write a page whose extracted text lost
	 * any of them (a renderer/JS-shell regression must fail loudly, not
	 * silently ingest navigation).
	 */
	signatures: string[];
	/** Registry contract: consumers may quote these pages verbatim. */
	quotable: true;
	/**
	 * How publishedAt derives for sdf-org rows:
	 *  - "effective-date-line": parse the page's own "EFFECTIVE DATE:
	 *    MONTH D, YYYY" line.
	 *  - "undated": the page states no date — publishedAt stays unset
	 *    (freshness falls back to neutral; no invented dates).
	 * Rows owned by other ingesters keep their owner's date logic and carry
	 * "undated" here as a no-op.
	 */
	dateStrategy: "effective-date-line" | "undated";
	/**
	 * Optional richer extraction for pages whose quotable facts live in embedded
	 * page data rather than <main> prose:
	 *  - "next-data-person-cards": also parse the page's __NEXT_DATA__ Sanity
	 *    `card` blocks into a "Name — Role" roster and append it before chunking
	 *    (the Team page renders member NAMES as bare text in <main> but their
	 *    ROLES only in the embedded cards — Tyler 2026-07-14). Undefined = the
	 *    default <main>-scrape path only.
	 */
	extractStrategy?: "next-data-person-cards";
	/** Extra topic tags beyond ["sdf-org", "sdf", family]. */
	tags?: string[];
}

export const CANONICAL_PAGES: CanonicalPage[] = [
	// ── sdf-org: canonical non-blog stellar.org organizational pages ──
	{
		id: "foundation",
		url: "https://stellar.org/foundation",
		family: "foundation",
		title:
			"Stellar Development Foundation — Built for a mission (stellar.org/foundation)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: ["nonprofit organization created and structured"],
		quotable: true,
		dateStrategy: "undated",
		tags: ["foundation", "mission", "nonprofit"],
	},
	{
		id: "foundation-team",
		url: "https://stellar.org/foundation/team",
		family: "foundation",
		title:
			"SDF Team — leadership and board of directors (stellar.org/foundation/team)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		// Leadership-rendering probe (sls-055 / Tyler 2026-07-14): names render as
		// bare text in <main> but ROLES live only in the embedded __NEXT_DATA__
		// cards. next-data-person-cards recovers the pairing; these role
		// signatures force the guard to red if that extraction ever silently
		// regresses to a role-less name list again.
		extractStrategy: "next-data-person-cards",
		signatures: [
			"Denelle Dixon",
			"Board of directors",
			"Founder and Chief Scientist",
			"VP of Ecosystem",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["team", "leadership", "board"],
	},
	{
		id: "mandate",
		url: "https://stellar.org/foundation/mandate",
		family: "mandate",
		title:
			"SDF Mandate (current) — mission, structure, and funding (stellar.org/foundation/mandate)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		// The sls-055 q-org-sdf-structure-mandate wording, verbatim from the
		// live page: "It is self-funded, pays taxes, and has no shareholders."
		signatures: ["self-funded, pays taxes, and has no shareholders"],
		quotable: true,
		dateStrategy: "undated",
		tags: ["mandate", "structure", "self-funded", "taxes"],
	},
	{
		id: "mandate-2019",
		url: "https://stellar.org/foundation/mandate/2019",
		family: "mandate",
		title:
			"SDF Mandate (2019, historical) (stellar.org/foundation/mandate/2019)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		// Historical-mandate wording verified live 2026-07-13: lumen holdings
		// "to pay taxes as we do so" + the enterprise-fund account described
		// as a venture-style fund.
		signatures: ["pay taxes as we do so", "venture-style fund"],
		quotable: true,
		dateStrategy: "undated",
		tags: ["mandate", "historical", "2019"],
	},
	{
		id: "mandate-2017",
		// stellar.org/foundation/previous-mandate serves this same document —
		// the /mandate/2017 path is the canonical one in the sitemap.
		url: "https://stellar.org/foundation/mandate/2017",
		family: "mandate",
		title:
			"SDF Mandate (2017, historical) (stellar.org/foundation/mandate/2017)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: ["outlines the previous goals"],
		quotable: true,
		dateStrategy: "undated",
		tags: ["mandate", "historical", "2017"],
	},
	{
		id: "enterprise-fund",
		url: "https://stellar.org/enterprise-fund",
		family: "enterprise-fund",
		title:
			"Stellar Enterprise Fund — venture-style fund (stellar.org/enterprise-fund)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		// The sls-055 q-org-sdf-enterprise-fund wording, verbatim from the
		// live page. The $100m figure IS the claim consumers were missing.
		signatures: ["venture-style fund", "portfolio totaling over $100m"],
		quotable: true,
		dateStrategy: "undated",
		tags: ["enterprise-fund", "investments"],
	},
	{
		id: "research-grants",
		url: "https://research.stellar.org/research-grants",
		family: "research-grants",
		title:
			"Stellar Academic Research Grants — eligibility, deadlines, budget cap (research.stellar.org)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		// sls-055 recurrence (2026-08-04 evals): q-scf-academic-research-grant
		// searched exact research-grant vocabulary and retrieved nothing — the
		// research.stellar.org family was never ingested. Signatures verbatim
		// from the live page 2026-08-14.
		signatures: [
			"Budget not to exceed $150,000",
			"We review grant proposals quarterly",
			"paid to academic institutions only",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["research-grants", "academic", "funding"],
	},
	{
		id: "terms-of-service",
		url: "https://stellar.org/terms-of-service",
		family: "terms",
		title:
			"stellar.org Terms of Service (SDF, a Delaware non-profit corporation)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		// The sls-055 legal-structure wording, verbatim from the live page.
		signatures: ["a Delaware non-profit corporation"],
		quotable: true,
		dateStrategy: "effective-date-line",
		tags: ["terms", "legal", "delaware"],
	},
	{
		id: "quarterly-reports",
		url: "https://stellar.org/quarterly-reports",
		family: "quarterly-reports",
		title:
			"SDF Quarterly Reports — index of every quarterly report since 2020 (stellar.org/quarterly-reports)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		// Report-discovery probe: the index page's own framing prose.
		signatures: ["Every quarter, we report"],
		quotable: true,
		dateStrategy: "undated",
		tags: ["quarterly-reports", "transparency"],
	},

	// ── quarterly-reports: the latest report itself (sdf-blog owns it) ──
	{
		// The report BODY is a blog post ingest-sdf-blog.ts already covers
		// (sls-006). Registering it here makes the guard assert the current
		// report's content actually survives in the corpus — report discovery
		// (the index above) AND report content are both class-guarded. When a
		// new quarter publishes, update this row to the new canonical URL.
		id: "quarterly-report-latest",
		url: "https://stellar.org/blog/foundation-news/q1-2026-execution-at-network-scale",
		family: "quarterly-reports",
		title: "Q1 2026: Execution at network scale (latest SDF quarterly report)",
		source: "sdf-blog",
		ingestedBy: "ingest-sdf-blog.ts",
		signatures: ["execution at network scale"],
		quotable: true,
		dateStrategy: "undated",
		tags: ["quarterly-reports"],
	},

	// ── security-program: sls-020's pages, folded into the one registry ──
	{
		// Ingested by ingest-security-program.ts from HackerOne's public
		// GraphQL (the rendered hackerone.com/stellar page is a JS shell);
		// publishedAt parses from the policy's own "Effective 7 MAY 2026" line.
		id: "security-program-hackerone",
		url: "https://hackerone.com/stellar",
		family: "security-program",
		title:
			"Stellar Bug Bounty Program — SDF consolidated HackerOne program policy",
		source: "security-program",
		ingestedBy: "ingest-security-program.ts",
		signatures: ["consolidated"],
		quotable: true,
		dateStrategy: "undated",
		tags: ["bug-bounty", "hackerone"],
	},
	{
		// Curated supersession record for the stale SDF landing page (still
		// lists the deprecated general Immunefi program) — see
		// ingest-security-program.ts for the full dated record.
		id: "security-program-supersession",
		url: "https://stellar.org/grants-and-funding/bug-bounty",
		family: "security-program",
		title: "SDF bug-bounty consolidation — stellar.org landing page superseded",
		source: "security-program",
		ingestedBy: "ingest-security-program.ts",
		signatures: ["superseded"],
		quotable: true,
		dateStrategy: "undated",
		tags: ["bug-bounty", "supersession"],
	},

	// ── asset-launches: a live asset's official launch pages. USDT0
	// (2026-09-02): the developer launch page is NOT in the dev-docs sitemap
	// (ingest-developers-docs.ts EXTRA_PAGES carries it); the announcement
	// arrives through the sitemap-driven blog ingest. Both guarded so a
	// "is USDT on Stellar / what is the USDT0 contract" answer can never
	// silently lose its source.
	{
		id: "usdt0-launch-page",
		url: "https://developers.stellar.org/launch/usdt0",
		family: "asset-launches",
		title:
			"USDT0 on Stellar — developer launch page (asset, SAC + OFT contracts)",
		source: "dev-docs",
		ingestedBy: "ingest-developers-docs.ts",
		signatures: [
			"GATISXX6BZ6NC7IKQBY37CJD4SOZL3CYZJWXEDG6JVIY4WBS6KXJHN6Q",
			"CBSJZEIO5C7KC2SF3MKSNXXJSW5G3VTNBX4ATMKUI3B2MR4JKM4R26YF",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["asset-launches", "stablecoins", "usdt0"],
	},
	{
		id: "usdt0-launch-announcement",
		url: "https://stellar.org/blog/foundation-news/usdt0-is-now-live-on-stellar",
		family: "asset-launches",
		title: "USDT0 is now live on Stellar (SDF announcement, 2026-09-02)",
		source: "sdf-blog",
		ingestedBy: "ingest-sdf-blog.ts",
		signatures: [
			"unified supply backed 1:1 by USDT",
			"OFT interoperability standard",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["asset-launches", "stablecoins", "usdt0"],
	},
	// ── 2026-10-03: stellar.org /learn and /use-cases, and the ambassador
	// program. Raven's public golden cards cite these as the source of correct
	// answers (lumen supply and inflation history, SCP, remittances, aid
	// disbursement, regional ambassador chapters), and none was in the corpus:
	// 0 of the 33 sitemap pages answered a URL probe. Registered as whole
	// families, not the 7 pages the cards happened to cite. Three sitemap
	// entries serve identical text under a second slug and are left out:
	// compostability-in-defi (its canonical link names composability-in-defi),
	// how-does-defi-work-for-lending-and-borrowing-markets and
	// what-are-stablecoins. Every signature was read off the page with this
	// ingester's own extraction (main element, stripHtml) and is unique to its
	// page.
	{
		id: "learn-anchor-basics",
		url: "https://stellar.org/learn/anchor-basics",
		family: "learn",
		title: "Learn More About Stellar Anchors (stellar.org/learn/anchor-basics)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"These systems were built to serve specific jurisdictions rather",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-blockchain-basics",
		url: "https://stellar.org/learn/blockchain-basics",
		family: "learn",
		title:
			"Blockchain Basics: An Introduction to Blockchain (stellar.org/learn/blockchain-basics)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: ["As the scope of human activity has expanded"],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-blockchain-privacy",
		url: "https://stellar.org/learn/blockchain-privacy",
		family: "learn",
		title:
			"Public Yet Private | How Blockchain Privacy Will Shape The Next Financial System (stellar.org/learn/blockchain-privacy)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"Early cryptocurrency developers sacrificed privacy in pursuit of a fair",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-composability-in-defi",
		url: "https://stellar.org/learn/composability-in-defi",
		family: "learn",
		title:
			"DeFi Composability: Building Financial Legos for Cross-Border Payments (stellar.org/learn/composability-in-defi)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"Composability is the ability to combine different components or building",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-composability-vs-interoperability",
		url: "https://stellar.org/learn/composability-vs-interoperability",
		family: "learn",
		title:
			"Composability vs Interoperability: Building Web3 DeFi Solutions (stellar.org/learn/composability-vs-interoperability)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"Though both are essential in the blockchain world, they have different roles",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-cross-border-payments",
		url: "https://stellar.org/learn/cross-border-payments",
		family: "learn",
		title:
			"Cross-Border Payments: Revolutionizing Global Payments (stellar.org/learn/cross-border-payments)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"Cross-border payments are financial transactions that occur between parties located",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-crypto-smart-contract-wallets",
		url: "https://stellar.org/learn/crypto-smart-contract-wallets",
		family: "learn",
		title:
			"Smart Wallets with Passkeys, Web3, Crypto and Advanced Security (stellar.org/learn/crypto-smart-contract-wallets)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"Smart wallets, or smart contract wallets, are digital cryptocurrency (crypto)",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-defi",
		url: "https://stellar.org/learn/defi",
		family: "learn",
		title:
			"Unlocking DeFi's Potential: A Comprehensive Guide to Blockchain-Based Decentralized Finance (stellar.org/learn/defi)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: ["Much has been written about DeFi to date"],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-intro-to-stellar",
		url: "https://stellar.org/learn/intro-to-stellar",
		family: "learn",
		title:
			"Intro to Stellar | Blockchain for Real World Applications (stellar.org/learn/intro-to-stellar)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"Its global ecosystem of innovators leverages the decentralized Stellar network",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-lending-and-borrowing-markets",
		url: "https://stellar.org/learn/lending-and-borrowing-markets",
		family: "learn",
		title:
			"How DeFi Works for Lending and Borrowing Markets (stellar.org/learn/lending-and-borrowing-markets)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"Instead, transactions occur directly between users: lenders deposit funds",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-lumens",
		url: "https://stellar.org/learn/lumens",
		family: "learn",
		title: "Stellar Lumens (stellar.org/learn/lumens)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: ["The lumen fulfills a special role in the network"],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-payfi",
		url: "https://stellar.org/learn/payfi",
		family: "learn",
		title:
			"PayFi: Transform On-chain Payments & Access Near Instant Financing (stellar.org/learn/payfi)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"PayFi, short for Payment Financing, integrates payments with onchain financing",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-proof-of-agreement",
		url: "https://stellar.org/learn/proof-of-agreement",
		family: "learn",
		title:
			"Understanding Stellar's Proof-of-Agreement (PoA) Consensus Mechanism (stellar.org/learn/proof-of-agreement)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"Bob trusts his friends Cal and Cam, and his mother-in-law Deb",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-smart-contract-basics",
		url: "https://stellar.org/learn/smart-contract-basics",
		family: "learn",
		title: "Smart Contract Basics (stellar.org/learn/smart-contract-basics)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"Smart contracts are a key component of many blockchain-based ecosystems",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-smart-contract-basics-oracles",
		url: "https://stellar.org/learn/smart-contract-basics-oracles",
		family: "learn",
		title:
			"What are Oracles on Smart Contracts? (stellar.org/learn/smart-contract-basics-oracles)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"By sourcing, verifying, and transmitting external information to smart contracts",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-smart-contract-building-blocks",
		url: "https://stellar.org/learn/smart-contract-building-blocks",
		family: "learn",
		title:
			"Smart Contract Building Blocks (stellar.org/learn/smart-contract-building-blocks)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"The interrelatedness of components in the ecosystem means that builders",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-stablecoins",
		url: "https://stellar.org/learn/stablecoins",
		family: "learn",
		title: "Stablecoins (stellar.org/learn/stablecoins)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"Native platform features like speed, low cost, scalability and built",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-stellar-consensus-protocol",
		url: "https://stellar.org/learn/stellar-consensus-protocol",
		family: "learn",
		title:
			"Stellar Consensus Protocol (stellar.org/learn/stellar-consensus-protocol)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"The term blockchain generally refers to distributed ledger technologies (DLTs)",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-swap-functionality-and-amms",
		url: "https://stellar.org/learn/swap-functionality-and-amms",
		family: "learn",
		title:
			"Swap Functionality and AMMs (stellar.org/learn/swap-functionality-and-amms)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"Digital asset swaps, especially those conducted through decentralized platforms, provide",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-the-power-of-stellar",
		url: "https://stellar.org/learn/the-power-of-stellar",
		family: "learn",
		title: "The Power of Stellar (stellar.org/learn/the-power-of-stellar)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"This technology and its game-changing capabilities are enhancing the financial",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-tokenization-basics",
		url: "https://stellar.org/learn/tokenization-basics",
		family: "learn",
		title: "Stellar Asset Tokenization (stellar.org/learn/tokenization-basics)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: ["Any asset can be tokenized (or minted) on the network"],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-tokenized-investment-assets",
		url: "https://stellar.org/learn/tokenized-investment-assets",
		family: "learn",
		title:
			"Tokenized Investment Assets (stellar.org/learn/tokenized-investment-assets)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"By tokenizing securities on the Stellar blockchain issuers can benefit",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-wallets-to-store-send-and-receive-lumens",
		url: "https://stellar.org/learn/wallets-to-store-send-and-receive-lumens",
		family: "learn",
		title:
			"Wallets to Store and Send XLM (Lumens) (stellar.org/learn/wallets-to-store-send-and-receive-lumens)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: ["Modern wallets make it easy to manage your digital assets"],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "learn-zero-knowledge-proof",
		url: "https://stellar.org/learn/zero-knowledge-proof",
		family: "learn",
		title:
			"Zero-Knowledge Proofs on Stellar: Enhancing Privacy, Scalability, and Interoperability (stellar.org/learn/zero-knowledge-proof)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"Zero-knowledge proofs (ZK Proofs) make this possible, ensuring that privacy",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["learn"],
	},
	{
		id: "use-case-defi",
		url: "https://stellar.org/use-cases/defi",
		family: "use-cases",
		title:
			"Build DeFi with Soroban: Rust-Based Smart Contracts on Stellar (stellar.org/use-cases/defi)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: ["learn the mechanics of Blend along with chain abstraction"],
		quotable: true,
		dateStrategy: "undated",
		tags: ["use-cases"],
	},
	{
		id: "use-case-exchanges",
		url: "https://stellar.org/use-cases/exchanges",
		family: "use-cases",
		title: "Stellar for Exchanges (stellar.org/use-cases/exchanges)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"Exchanges act as important on/off ramps for users participating",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["use-cases"],
	},
	{
		id: "use-case-payments",
		url: "https://stellar.org/use-cases/payments",
		family: "use-cases",
		title:
			"Stellar for Blockchain-Powered Cross-Border Payments (stellar.org/use-cases/payments)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"Harness the versatility of cross border payments that can power remittances, meet payroll, invoice suppliers, maintain treasury balances and more",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["use-cases"],
	},
	{
		id: "use-case-ramps",
		url: "https://stellar.org/use-cases/ramps",
		family: "use-cases",
		title: "Stellar Network On and Off-Ramps (stellar.org/use-cases/ramps)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: ["On and off-ramps are payment services that enable users"],
		quotable: true,
		dateStrategy: "undated",
		tags: ["use-cases"],
	},
	{
		id: "use-case-stellar-for-aid",
		url: "https://stellar.org/use-cases/stellar-for-aid",
		family: "use-cases",
		title: "Stellar Aid Assist (stellar.org/use-cases/stellar-for-aid)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"Organizations can review eligibility and then upload recipient information",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["use-cases"],
	},
	{
		id: "use-case-tokenization",
		url: "https://stellar.org/use-cases/tokenization",
		family: "use-cases",
		title:
			"Tokenize Real-World Assets: Secure, Compliant, Global (stellar.org/use-cases/tokenization)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: ["The Stellar blockchain has been trusted for over a decade"],
		quotable: true,
		dateStrategy: "undated",
		tags: ["use-cases"],
	},
	{
		id: "ambassador-program",
		url: "https://stellar.gitbook.io/ambassador-program",
		family: "programs",
		title: "Stellar Ambassador Program (stellar.gitbook.io/ambassador-program)",
		source: "sdf-org",
		ingestedBy: "ingest-sdf-org.ts",
		signatures: [
			"The program exists to empower credible regional leaders and contributors",
		],
		quotable: true,
		dateStrategy: "undated",
		tags: ["programs"],
	},
];

/** Registry lookup used by ingesters so URLs can never drift from the guard. */
export function canonicalPage(id: string): CanonicalPage {
	const row = CANONICAL_PAGES.find((p) => p.id === id);
	if (!row) throw new Error(`canonical-pages: no registry row with id "${id}"`);
	return row;
}

const MONTHS: Record<string, string> = {
	jan: "01",
	feb: "02",
	mar: "03",
	apr: "04",
	may: "05",
	jun: "06",
	jul: "07",
	aug: "08",
	sep: "09",
	oct: "10",
	nov: "11",
	dec: "12",
};

/**
 * The "effective-date-line" dateStrategy: parse a page-stated
 * "EFFECTIVE DATE: MARCH 23, 2026" line → "2026-03-23". Returns undefined
 * when the wording changes — an unproven date must not be served (freshness
 * falls back to neutral; same policy as the sls-020 ingester's
 * parseEffectiveDate for the HackerOne policy's "Effective 7 MAY 2026" line).
 */
export function parseEffectiveDateLine(text: string): string | undefined {
	const m = text.match(
		/EFFECTIVE\s+DATE:?\s+([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/i,
	);
	if (!m) return undefined;
	const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
	if (!month) return undefined;
	return `${m[3]}-${month}-${m[2].padStart(2, "0")}`;
}
