/**
 * Lookalike home-domain classification (born 2026-08-28, the fake-issuer
 * farm found while working the sls-079 deployment queue).
 *
 * The attack shape: an account issues a well-known ticker (WTGXX, USTBL) and
 * sets a `home_domain` built to deceive — the brand as a subdomain of an
 * unrelated registrable domain (`wisdomtree.xlmhq.org`), or an institutional
 * name under a wrong TLD (`treasury.dtcc.company` — DTCC's real domain is
 * dtcc.com). Wallets and explorers render the home_domain as provenance, so
 * victims trust it; one fake WTGXX carried 98 trustlines.
 *
 * The classifier answers ONE question per (issuer home_domain, brand): is
 * this the operator's real domain, a deception referencing the brand, or
 * merely unrelated? It never decides legitimacy from an asset code alone —
 * an asset_code match proves nothing (the lesson's core rule).
 */

/** Multi-part public suffixes we actually meet; a full PSL is overkill until
 * a miss shows up in the artifact. */
const TWO_PART_TLDS = new Set([
	"co.uk",
	"org.uk",
	"ac.uk",
	"com.au",
	"com.br",
	"com.mx",
	"co.jp",
	"co.kr",
	"com.sg",
	"com.tr",
]);

/** eTLD+1, lowercased; null for empty/garbage hosts. */
export function registrableDomain(host: string): string | null {
	const h = host.trim().toLowerCase().replace(/\.$/, "");
	if (!h || !h.includes(".")) return null;
	const labels = h.split(".");
	const lastTwo = labels.slice(-2).join(".");
	if (TWO_PART_TLDS.has(lastTwo) && labels.length >= 3)
		return labels.slice(-3).join(".");
	return lastTwo;
}

/** Generic vocabulary that must never count as a brand hit — ecosystem words
 * and corporate filler appear in countless honest domains. */
const STOPWORDS = new Set([
	"stellar",
	"lumen",
	"lumens",
	"soroban",
	"crypto",
	"token",
	"tokens",
	"chain",
	"blockchain",
	"finance",
	"financial",
	"network",
	"digital",
	"money",
	"capital",
	"global",
	"group",
	"labs",
	"foundation",
	"protocol",
	"exchange",
	"wallet",
	"treasury",
	"asset",
	"assets",
	"fund",
	"funds",
	"bank",
]);

/** Brand tokens from an operator's names: lowercase alphanumeric runs, >= 4
 * chars, stopwords out. "WisdomTree" -> ["wisdomtree"], "Ondo Finance" ->
 * ["ondo"], "DTCC" -> ["dtcc"]. */
export function brandTokens(...names: Array<string | null | undefined>): string[] {
	const out = new Set<string>();
	for (const n of names) {
		if (!n) continue;
		for (const t of n.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []) {
			if (!STOPWORDS.has(t)) out.add(t);
		}
	}
	return [...out];
}

export type DomainVerdict =
	| { kind: "canonical-domain"; matchedReal: string }
	| { kind: "lookalike"; brandHit: string; registrable: string }
	| { kind: "unrelated" }
	| { kind: "no-domain" };

/**
 * Classify one issuer home_domain against a brand and its REAL registrable
 * domains. `realDomains` are registrable forms (e.g. "dtcc.com",
 * "glodollar.org") — a subdomain of a real domain is canonical
 * (app.glodollar.org), anything referencing the brand on a DIFFERENT
 * registrable domain is a lookalike, everything else is merely unrelated.
 */
export function classifyIssuerDomain(input: {
	homeDomain: string | null | undefined;
	brands: string[];
	realDomains: string[];
}): DomainVerdict {
	const host = input.homeDomain?.trim().toLowerCase() ?? "";
	if (!host) return { kind: "no-domain" };
	const reg = registrableDomain(host);
	const reals = input.realDomains
		.map((d) => registrableDomain(d) ?? d.toLowerCase())
		.filter(Boolean);
	for (const real of reals) {
		if (host === real || host.endsWith(`.${real}`))
			return { kind: "canonical-domain", matchedReal: real };
	}
	for (const b of input.brands) {
		if (b.length < 4 || STOPWORDS.has(b)) continue;
		if (host.includes(b)) {
			return { kind: "lookalike", brandHit: b, registrable: reg ?? host };
		}
	}
	return { kind: "unrelated" };
}
