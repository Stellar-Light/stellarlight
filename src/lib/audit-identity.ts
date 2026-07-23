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
	"fxdao-sc": { slug: null, basis: "unmatched" },
	grantpicks: { slug: "grantpicks", basis: "name-exact" },
	hiyield: { slug: "hiyield", basis: "name-exact" },
	"hot bridge": { slug: "hot-protocol", basis: "alias" },
	"huma protocol": { slug: "huma", basis: "name-exact" },
	"icon xcall": { slug: null, basis: "unmatched" },
	"normal finance": { slug: "normal", basis: "name-exact" },
	octolend: { slug: null, basis: "unmatched" },
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
