import type { CollectionConfig } from "payload";

/**
 * ResearchDocs — chunked, embedded primary-source content for the
 * Stellar Scout research corpus. Each row is one chunk of a longer
 * document, with its Voyage AI `voyage-3` embedding (1024 dims,
 * Anthropic-recommended) and metadata for source attribution.
 *
 * Sources:
 *   - sdf-blog       : posts from stellar.org/blog
 *   - scf-handbook   : pages from stellar.gitbook.io/scf-handbook
 *   - sep            : SEPs from stellar/stellar-protocol GitHub repo
 *   - dev-docs       : pages from developers.stellar.org
 *   - paper          : Stellar whitepaper + SCP papers (Mazieres et al.)
 *   - scf-proposal   : past SCF grant proposals from communityfund.stellar.org
 *   - lumenloop      : community SCF playbooks + companion AI skills from
 *                      github.com/lumenloop/awesome-stellar-community-fund
 *   - audit          : Soroban protocol audit reports from
 *                      sorobansecurity.com/api/v1/reports (Certora, OtterSec,
 *                      Halborn, OpenZeppelin, Code4rena, etc.) — chunked by
 *                      severity heading, tagged with auditor + protocol
 *   - sdf-org        : canonical non-blog stellar.org organizational pages
 *                      (Mandate current+historical, Terms of Service,
 *                      Foundation, Team, Enterprise Fund, Quarterly Reports
 *                      index) — the CANONICAL_PAGES registry family
 *                      (sls-055), ingested by scripts/ingest-sdf-org.ts and
 *                      class-guarded by scripts/eval/corpus-coverage-check.ts
 *   - ec-developer-report : Annual + geographic developer reports published
 *                      by Electric Capital (github.com/electric-capital/
 *                      developer-reports) — macro ecosystem stats, peer-L1
 *                      comparisons, geographic developer concentration.
 *                      PDFs 2019–2023; 2024+ are web-only and not yet ingested.
 *
 * Retrieval: /api/research?q={query} does Atlas $vectorSearch over
 * `embedding` and returns the top-K chunks with content + sourceUrl.
 *
 * Access:
 *  - Read: admin only via Payload admin (the public /api/research route
 *    uses the Local API so it bypasses these access rules)
 *  - Create/update/delete: forbidden via REST/GraphQL — Local API only
 *    (ingestion scripts call payload.create / .update through the SDK)
 */
export const ResearchDocs: CollectionConfig = {
	slug: "research-docs",
	admin: {
		useAsTitle: "title",
		defaultColumns: [
			"title",
			"source",
			"chunkIndex",
			"publishedAt",
			"updatedAt",
		],
		group: "Research",
		description:
			"Embedded primary-source chunks powering Stellar Scout's /api/research endpoint. Append-only — managed by ingestion scripts in /scripts.",
	},
	access: {
		read: ({ req }) => !!req.user,
		create: () => false,
		update: () => false,
		delete: ({ req }) => !!req.user,
	},
	fields: [
		{
			name: "source",
			type: "select",
			required: true,
			index: true,
			options: [
				{ label: "SDF Blog", value: "sdf-blog" },
				{ label: "SCF Handbook", value: "scf-handbook" },
				{ label: "SEP", value: "sep" },
				{ label: "CAP", value: "cap" },
				{ label: "Developers docs", value: "dev-docs" },
				{ label: "Paper (whitepaper / SCP)", value: "paper" },
				{ label: "SCF proposal", value: "scf-proposal" },
				{
					label: "Lumenloop (community SCF playbooks + AI skills)",
					value: "lumenloop",
				},
				{
					label: "Lumenloop Research (ecosystem analyses + weekly roundups)",
					value: "lumenloop-research",
				},
				{
					label: "Audit (sorobansecurity.com)",
					value: "audit",
				},
				{
					label: "Incident (security exploit / post-mortem)",
					value: "incident",
				},
				{
					label: "Security program (bug-bounty / disclosure policy)",
					value: "security-program",
				},
				{
					label:
						"SDF organizational pages (mandate, terms, foundation, team, enterprise fund)",
					value: "sdf-org",
				},
				{
					label: "Electric Capital Developer Report",
					value: "ec-developer-report",
				},
			],
		},
		{
			name: "auditor",
			type: "text",
			index: true,
			admin: {
				description:
					"Audit firm name (Certora, OtterSec, Halborn, …). Only set when source='audit'.",
			},
		},
		{
			name: "protocol",
			type: "text",
			index: true,
			admin: {
				description:
					"Protocol the chunk is about (Blend, Soroswap, …). Set when source='audit' or source='incident'.",
			},
		},
		{
			name: "severity",
			type: "select",
			options: [
				{ label: "Critical", value: "critical" },
				{ label: "High", value: "high" },
				{ label: "Medium", value: "medium" },
				{ label: "Low", value: "low" },
				{ label: "Informational", value: "informational" },
				{ label: "Unknown / Mixed", value: "unknown" },
			],
			admin: {
				description:
					"Severity bucket. For audits, inferred from the chunk's section heading; for incidents, the impact of the exploit. Set when source='audit' or source='incident'.",
			},
		},
		{
			name: "title",
			type: "text",
			required: true,
			admin: {
				description:
					"Parent doc title (e.g. SEP name, blog post title, paper title)",
			},
		},
		{
			name: "section",
			type: "text",
			admin: {
				description:
					"Section heading this chunk lives under (H2/H3) — used to scope citations",
			},
		},
		{
			name: "url",
			type: "text",
			required: true,
			index: true,
			admin: {
				description: "Canonical source URL for citation",
			},
		},
		{
			name: "parentDocId",
			type: "text",
			required: true,
			index: true,
			admin: {
				description:
					"Stable ID for the parent document (used to dedupe + delete obsolete chunks)",
			},
		},
		{
			name: "chunkIndex",
			type: "number",
			required: true,
			admin: {
				description: "0-based index of this chunk within its parent document",
			},
		},
		{
			name: "content",
			type: "textarea",
			required: true,
			admin: {
				description:
					"The actual text content of this chunk (≤ 1500 tokens, markdown preserved)",
			},
		},
		{
			name: "contentHash",
			type: "text",
			index: true,
			admin: {
				description:
					"SHA-256 of `content` — used by ingestion scripts to skip re-embedding unchanged chunks",
			},
		},
		{
			name: "tags",
			type: "array",
			fields: [{ name: "tag", type: "text" }],
			admin: {
				description:
					"Topic tags inferred from the source (e.g. soroban, anchor, sep-24)",
			},
		},
		{
			name: "publishedAt",
			type: "date",
			admin: {
				description: "Original publish date of the parent doc, if known",
			},
		},
		{
			name: "embedding",
			type: "json",
			admin: {
				description:
					"Voyage AI voyage-3 vector (1024 floats). Atlas $vectorSearch is configured on this field.",
				readOnly: true,
			},
		},
	],
	timestamps: true,
};
