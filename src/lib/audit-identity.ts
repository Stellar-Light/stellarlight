/**
 * Identity hygiene for the audit registry: the portal's free-text
 * `auditorName` / `protocolName` fields carry PDF-extraction debris —
 * homoglyphs (a Cyrillic Es in "Сoinspect"), stray whitespace
 * ("Reflector Oracle Protocol "), and inconsistent casing ("certora").
 * Everything that becomes a filterable identity string passes through
 * here so exact matching actually works.
 */

/** Cyrillic/Greek look-alikes seen (or likely) in PDF-extracted names. */
const HOMOGLYPHS: Record<string, string> = {
	А: "A",
	В: "B",
	Е: "E",
	К: "K",
	М: "M",
	Н: "H",
	О: "O",
	Р: "P",
	С: "C",
	Т: "T",
	Х: "X",
	а: "a",
	е: "e",
	о: "o",
	р: "p",
	с: "c",
	х: "x",
	Ι: "I",
	Ο: "O",
};

/** NFKC (folds ligatures like ﬁ) + homoglyph repair + whitespace collapse. */
export function normalizeIdentityText(raw: string): string {
	let s = raw.normalize("NFKC");
	s = s.replace(/./gu, (ch) => HOMOGLYPHS[ch] ?? ch);
	return s.replace(/\s+/g, " ").trim();
}

/**
 * Canonical casing for the known auditor firms. Matching is done on the
 * normalized lowercase name; unknown firms pass through normalized as-is
 * (never dropped — a new auditor must still appear in the registry).
 */
const CANONICAL_AUDITORS: Record<string, string> = {
	ottersec: "OtterSec",
	certora: "Certora",
	code4rena: "Code4rena",
	cantina: "Cantina",
	halborn: "Halborn",
	openzeppelin: "OpenZeppelin",
	"runtime verification": "Runtime Verification",
	veridise: "Veridise",
	coinfabrik: "CoinFabrik",
	coinspect: "Coinspect",
	hacken: "Hacken",
	quarkslab: "Quarkslab",
	zellic: "Zellic",
};

export function canonicalAuditor(raw: string): string {
	const norm = normalizeIdentityText(raw);
	return CANONICAL_AUDITORS[norm.toLowerCase()] ?? norm;
}

/**
 * Audited-protocol → directory-project linkage.
 *
 * Keys are `normalizeIdentityText(protocolName).toLowerCase()`. Values are
 * the canonical project slug, or null when the audited codebase has no
 * directory project (platform-level code, or a product we don't index).
 *
 * Every non-null mapping was verified against the live directory
 * (name + description + site evidence) before landing here — a wrong link
 * is worse than a missed one. Protocols absent from this map surface in
 * the ingest dry-run as "unmapped" so new reports get triaged instead of
 * silently unlinked.
 */
export type AuditLinkBasis = "name-exact" | "alias" | "unmatched";

export const AUDIT_PROJECT_ALIASES: Record<
	string,
	{ slug: string | null; basis: AuditLinkBasis }
> = {
	"allbridge estrela": { slug: "estrela", basis: "name-exact" },
	"allbridge soroban bridge": { slug: "allbridge", basis: "name-exact" },
	alula: { slug: "alula", basis: "name-exact" },
	"aquarius amm": { slug: "aquarius", basis: "name-exact" },
	"axelar network": { slug: "axelar", basis: "name-exact" },
	"blend protocol": { slug: "blend", basis: "name-exact" },
	"blend protocol v1": { slug: "blend", basis: "name-exact" },
	"blend protocol v2": { slug: "blend", basis: "name-exact" },
	bondhive: { slug: "bondhive", basis: "name-exact" },
	cables: { slug: "cables", basis: "name-exact" },
	capyfi: { slug: null, basis: "unmatched" },
	"clickpesa oracle aggregator": {
		slug: "clickpesa-debt-fund",
		basis: "alias",
	},
	"comet-contracts-v1": { slug: "comet", basis: "name-exact" },
	crossmint: { slug: "crossmint", basis: "name-exact" },
	equitx: { slug: "equitx", basis: "name-exact" },
	excellar: { slug: "excellar", basis: "name-exact" },
	// "FxDAO-SC" is FxDAO's smart-contract repo name (report #? "Security Audit
	// Report FxDAO", Runtime Verification 2024-05-16); the directory row is
	// `fxdao` (name "FxDAO"). Linked 2026-09-05 after the audit served with no
	// project for four months.
	"fxdao-sc": { slug: "fxdao", basis: "alias" },
	grantpicks: { slug: "grantpicks", basis: "name-exact" },
	hiyield: { slug: "hiyield", basis: "name-exact" },
	"hot bridge": { slug: "hot-protocol", basis: "alias" },
	"huma protocol": { slug: "huma", basis: "name-exact" },
	"icon xcall": { slug: null, basis: "unmatched" },
	"normal finance": { slug: "normal", basis: "name-exact" },
	// The report's own title reads "OctoLend - Untangled - Security Audit
	// Report" (Runtime Verification 2026-03-20): OctoLend is Untangled's
	// lending product on Stellar and the directory row is `untangled`
	// (src/data/onchain-contracts.ts carries its mainnet addresses). Linked
	// 2026-09-05.
	octolend: { slug: "untangled", basis: "alias" },
	"openzeppelin stellar contracts library": {
		slug: "openzeppelin",
		basis: "alias",
	},
	orbitcdp: { slug: "orbitcdp", basis: "name-exact" },
	phoenixdefihub: { slug: "phoenix", basis: "name-exact" },
	"redstone finance": { slug: "redstone-finance", basis: "name-exact" },
	"reflector dao contract and reflector subscription contract": {
		slug: "reflector",
		basis: "name-exact",
	},
	"reflector oracle protocol": { slug: "reflector", basis: "name-exact" },
	rozo: { slug: "rozo", basis: "name-exact" },
	"scaffold registry": { slug: "stellar-registry", basis: "alias" },
	slender: { slug: "slender", basis: "name-exact" },
	"smart escrow platform": { slug: "trustless-work", basis: "alias" },
	"soroban - band standard reference contract": {
		slug: "band",
		basis: "alias",
	},
	"soroban governor": { slug: "soroban-governor", basis: "name-exact" },
	"soroswap aggregator": { slug: "soroswap", basis: "name-exact" },
	"soroswap core": { slug: "soroswap", basis: "name-exact" },
	"spectra finance": { slug: "spectra-finance", basis: "name-exact" },
	spiko: { slug: "spiko", basis: "name-exact" },
	"stellar soroban core": { slug: null, basis: "unmatched" },
	"stellar soroban integration with the tricorn bridge": {
		slug: "tricorn",
		basis: "alias",
	},
	"stellar timelock contract": {
		slug: "soroban-timelock-contract",
		basis: "alias",
	},
	stellarbroker: { slug: "stellarbroker", basis: "name-exact" },
	"token vesting factory and token vesting manager": {
		slug: null,
		basis: "unmatched",
	},
	untangled: { slug: "untangled", basis: "name-exact" },
	verseprop: { slug: "verseprop", basis: "name-exact" },
	"volta circuit": { slug: "volta-circuit", basis: "name-exact" },
	"wombat-exchange": { slug: "wombat", basis: "name-exact" },
	xycloans: { slug: "xycloans", basis: "name-exact" },
	"zkcross network": { slug: "zkcross", basis: "name-exact" },
};

/**
 * Resolve a portal protocolName to a directory slug.
 * mapped=false means the protocol has never been triaged (a NEW report) —
 * distinct from a triaged verified-no-match ({slug: null, basis: "unmatched"}).
 */
export function resolveAuditProjectSlug(protocolName: string): {
	slug: string | null;
	basis: AuditLinkBasis | null;
	mapped: boolean;
} {
	const key = normalizeIdentityText(protocolName).toLowerCase();
	const hit = AUDIT_PROJECT_ALIASES[key];
	if (hit) return { slug: hit.slug, basis: hit.basis, mapped: true };
	return { slug: null, basis: null, mapped: false };
}

/** Longest a research-doc title may be before the corpus sweep calls it
 * "overlong (sentence, not a title)" — same bar as engine-b-corpus.ts. */
export const MAX_TITLE_LEN = 110;

/**
 * Compose an audit report's title as `Protocol — Auditor (Report name)`.
 *
 * The parenthetical is the portal's own `name` for the report, which is often
 * the PDF's internal doc-title and mostly restates the two fields already in
 * front of it. Live examples the corpus sweep flags as overlong:
 *
 *   PhoenixDeFiHub — Veridise (Auditing Report Hardening Blockchain Security
 *     with Formal Methods for PhoenixDeFiHub)                        114 chars
 *   Stellar Timelock Contract — Veridise (Auditing Report Hardening …)     143
 *   Stellar Soroban Core — Veridise (Soroban Stellar Soroban Core V2.1 …)  128
 *
 * So the parenthetical is appended only when it EARNS its place: it must add
 * at least one word that isn't already in the protocol/auditor prefix, and it
 * must not push the title past the quality bar. A short, genuinely new name
 * ("V2.1", "Phase 2") is kept; a restatement of the prefix is dropped.
 *
 * Dropping loses nothing retrievable — the full report name stays on the row's
 * own metadata and in the body; this only decides what the TITLE says.
 */
export function composeAuditTitle(
	protocolName: string,
	auditorName: string,
	reportName?: string | null,
): string {
	const base = `${normalizeIdentityText(protocolName)} — ${canonicalAuditor(auditorName)}`;
	const name = reportName ? normalizeIdentityText(reportName) : "";
	if (!name) return base;

	const words = (s: string) =>
		new Set(
			s
				.toLowerCase()
				.split(/[^a-z0-9.]+/i)
				.filter((w) => w.length > 2),
		);
	const inBase = words(base);
	const addsSomething = [...words(name)].some((w) => !inBase.has(w));
	const withName = `${base} (${name})`;
	if (!addsSomething || withName.length > MAX_TITLE_LEN) return base;
	return withName;
}

// ── sls-064: curated audit-report relations ────────────────────────────────
// Multiple reports for one (protocol, auditor) are legitimate — a revision,
// a re-audit, and a separate yearly engagement are all normal. What a
// consumer cannot do is CLASSIFY them from the rows alone. These curated
// relations link reports of one engagement; a pair absent here is
// unclassified, never asserted independent. DISCIPLINE: only add what the
// reports themselves state, date the verification, never guess a
// supersession verdict the documents don't state.
export interface AuditRelation {
	/** Shared by every report of one engagement; distinct across engagements. */
	engagementId: string;
	/** Version the report states about itself (e.g. "V2"); null = unstated. */
	reportVersion: string | null;
	/** reportId of the report that supersedes this one; null = none stated. */
	supersededByReportId: number | null;
	/** Engagement window as stated IN the report text (YYYY-MM-DD), else null. */
	engagementStart: string | null;
	engagementEnd: string | null;
}

/** Keyed by portal reportId. Verified 2026-08-14 (sls-064 evidence: both
 * reports state the same window "From Oct. 30, 2023 to Dec. 22, 2023" and
 * carry the same critical finding at commit 2674d86; report 28's own title
 * states "V2"; neither document states a supersession — so none is claimed). */
export const AUDIT_RELATIONS: Record<number, AuditRelation> = {
	// Veridise / Soroban Core. 42 SUPERSEDES 28 — read off the documents on
	// 2026-08-19, not inferred from the dates (which mislead: the V2 report is
	// the OLDER of the two, published 2024-01-02, while the unversioned-looking
	// row is the 2025-09-26 revision).
	//
	// Report 42's own title is "Soroban Stellar Soroban Core V2.1 (Intended
	// Behavior and Invalid Issues moved to the Appendix)" — our stored title had
	// lost the version. Its finding list is report 28's eight minus "Possible
	// Unmetered Clones", exactly the reclassification the title describes.
	// Highest severity in either document is Medium; neither carries a critical.
	28: {
		engagementId: "veridise-soroban-core-2023q4",
		reportVersion: "V2",
		supersededByReportId: 42,
		engagementStart: "2023-10-30",
		engagementEnd: "2023-12-22",
	},
	42: {
		engagementId: "veridise-soroban-core-2023q4",
		reportVersion: "V2.1",
		supersededByReportId: null,
		engagementStart: "2023-10-30",
		engagementEnd: "2023-12-22",
	},

	// ── sls-064 recurrence (2026-08-18): the three remaining pairs, read from
	// the report texts on stellarsecurityportal.com/api/v1/reports/{id}.

	// Blend V2 / Certora — ONE engagement, TWO deliverables. Report 40 (manual
	// assessment): "The work was undertaken from February 03, 2025, to March 27,
	// 2025" and "wrote a set of formal rules ... We share those findings in a
	// separate report." Report 51 (formal verification): "undertaken from
	// February 03, 2025, to March 13, 2025" and "the team performed a manual
	// audit ... We share those findings in a separate report." Each cites the
	// other; same start date, same repo. Not a revision, so no supersession.
	// Version is what each title states about itself.
	40: {
		engagementId: "certora-blend-v2-2025q1",
		reportVersion: "DRAFT v3",
		supersededByReportId: null,
		engagementStart: "2025-02-03",
		engagementEnd: "2025-03-27",
	},
	51: {
		engagementId: "certora-blend-v2-2025q1",
		reportVersion: "Draft v2",
		supersededByReportId: null,
		engagementStart: "2025-02-03",
		engagementEnd: "2025-03-13",
	},

	// OpenZeppelin Stellar Contracts Library — TWO engagements. Report 2:
	// "Timeline From 20250203 To 20250207", commit 01dbcb5, library 0.1.0.
	// Report 35: "Timeline From 20250604 To 20250618", "a differential audit
	// ... at commit cf05a5d against commit d3741c3", library v0.3.0-rc.2. Four
	// months apart, different versions; 35 is differential against a later
	// baseline, not against report 2's commit — neither states supersession.
	2: {
		engagementId: "openzeppelin-stellar-contracts-0.1.0-2025q1",
		reportVersion: "0.1.0",
		supersededByReportId: null,
		engagementStart: "2025-02-03",
		engagementEnd: "2025-02-07",
	},
	35: {
		engagementId: "openzeppelin-stellar-contracts-0.3.0-rc.2-2025q2",
		reportVersion: "v0.3.0-rc.2",
		supersededByReportId: null,
		engagementStart: "2025-06-04",
		engagementEnd: "2025-06-18",
	},

	// Allbridge Estrela / Quarkslab — TWO engagements, and report 16 says so:
	// "Quarkslab had already performed an audit of an earlier version of these
	// smart contracts, with support for only 2 tokens per pool." Report 15:
	// proposal 24-03-1559-PRO, commit 56be1f0, document version 1.1
	// (2024/04/23). Report 16: reference 25-01-1969-REP, commit dd8d678,
	// document version 1.1 (2025-02-05). Neither report states an engagement
	// window — only report/revision dates — so start/end stay null rather than
	// borrowing the portal date. Not a revision of the same document, so no
	// supersession is claimed.
	15: {
		engagementId: "quarkslab-allbridge-estrela-2024",
		reportVersion: "1.1",
		supersededByReportId: null,
		engagementStart: null,
		engagementEnd: null,
	},
	16: {
		engagementId: "quarkslab-allbridge-estrela-2025",
		reportVersion: "1.1",
		supersededByReportId: null,
		engagementStart: null,
		engagementEnd: null,
	},
};
