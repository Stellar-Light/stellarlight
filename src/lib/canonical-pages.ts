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
 * Crawl-observation time: each chunk row's Payload `updatedAt` records when
 * its content last changed at ingest; `publishedAt` is set only when the page
 * itself states a date (see each row's `dateStrategy`). Historical pages are
 * labeled historical in their titles rather than given invented dates.
 */

import type { ResearchSource } from "./research-ingest";

export type CanonicalFamily =
	| "foundation"
	| "mandate"
	| "enterprise-fund"
	| "terms"
	| "quarterly-reports"
	| "security-program";

export interface CanonicalPage {
	/** Stable registry key. sdf-org rows chunk under parentDocId `sdf-org-<id>`. */
	id: string;
	/** Canonical URL — the exact `url` the ingested chunks carry. */
	url: string;
	family: CanonicalFamily;
	/** Parent-doc title for the ingested chunks (citation surface). */
	title: string;
	/** Research source whose ingester writes this page's chunks. */
	source: Extract<ResearchSource, "sdf-org" | "security-program" | "sdf-blog">;
	/** Which script produces the chunks (documentation + skip accounting). */
	ingestedBy:
		| "ingest-sdf-org.ts"
		| "ingest-security-program.ts"
		| "ingest-sdf-blog.ts";
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
		// Leadership-page rendering probe (sls-055): the CEO's name must
		// survive extraction — the roster renders as headings in <main>.
		signatures: ["Denelle Dixon", "Board of directors"],
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
