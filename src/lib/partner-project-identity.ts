/**
 * Partner→project identity: the hand-verified link map + the domain
 * cross-check plumbing that keeps it honest.
 *
 * Identity matching is the Spectra-near-miss class: a partner and a project
 * with similar names are NOT automatically the same entity. Every map entry
 * was verified (name + description agreement, fan-out pass 2026-07-20)
 * before landing; partners absent from the map stay unlinked on purpose.
 * And identities DRIFT after verification: either side's website can change,
 * and a lapsed domain can be re-registered by a stranger (boss-pay's old
 * bossmoney.africa has 301'd to a gambling site, then a streaming site).
 * The daily self-audit lane + scripts/data/check-partner-project-identity.ts
 * re-assert every pair against the live API using registrableDomain().
 *
 * Lives in src/lib (same placement as AUDIT_PROJECT_ALIASES in
 * audit-identity.ts) so the unit tests cover it and consumers never import
 * Payload-coupled script modules. Keep this module import-free.
 */

/** partnerSlug → directory projectSlug. Verified-only; see header. */
export const PARTNER_PROJECT_LINKS: Record<string, string> = {
	albedo: "albedo",
	"anchor-alfred-pay": "alfred",
	"anchor-anclap": "anclap",
	"anchor-bitso": "bitso",
	"anchor-blox-global": "blox",
	"anchor-boss-pay": "boss-pay",
	"anchor-cash-abroad": "cash-abroad",
	"anchor-clickspesa": "clickspesa",
	"anchor-coca-wallet": "coca",
	"anchor-coins-ph": "coins-ph",
	"anchor-elroy-app": "elroy",
	"anchor-fonbnk": "fonbnk",
	"anchor-honey-coin": "honey-coin",
	"anchor-moneygram": "moneygram",
	"anchor-mykobo": "mykobo",
	"anchor-ping": "ping",
	"anchor-ripe-money": "ripe",
	"anchor-trace-finance": "trace",
	"anchor-wallet-guru": "wallet-guru",
	"anchor-yellow-card": "yellow-card",
	aquarius: "aquarius",
	audd: "audd",
	blend: "blend",
	certora: "certora",
	defindex: "defindex",
	etherfuse: "etherfuse",
	"franklin-templeton": "benji",
	freighter: "freighter",
	"gmo-zcom-trust": "gyen",
	halborn: "halborn",
	"hana-wallet": "hana",
	lobstr: "lobstr",
	ntokens: "brl",
	ottersec: "ottersec",
	"phoenix-protocol": "phoenix",
	reflector: "reflector",
	"runtime-verification": "runtime-verification",
	soroswap: "soroswap",
	stellarexpert: "stellar-expert",
	"trustless-work": "trustless-work",
	veridise: "veridise",
	"xbull-wallet": "xbull",
};

/**
 * Verified-legitimate domain mismatches. Keyed by partnerSlug AND the exact
 * live domain pair — if either side's domain changes later, the entry stops
 * matching and the pair flags again (a forever-allowlisted pair would hide
 * exactly the drift this guard exists to catch). Human-verified entries
 * ONLY; put the evidence in the reason.
 */
export const ALLOWED_DOMAIN_MISMATCHES: Record<
	string,
	{ partner: string; project: string; reason: string }
> = {
	"franklin-templeton": {
		partner: "franklintempleton.com",
		project: "benjiinvestments.com",
		reason:
			"Company vs product: Benji is Franklin Templeton's tokenized-fund product; both are Franklin Templeton properties (verified 2026-07-20)",
	},
	"hana-wallet": {
		partner: "hana.money",
		project: "hanawallet.io",
		reason:
			"Same product, dual domains: hanawallet.io 301-redirects to hana.money and Hana's support center lives on support.hanawallet.io (verified 2026-07-20)",
	},
};

/**
 * Two-label public suffixes seen (or plausible) in partner/project domains.
 * NOT the full PSL — just enough that foo.com.ng vs bar.com.ng never
 * "match" on com.ng. Extend when a new ccTLD shows up in the data.
 */
const TWO_LABEL_SUFFIXES = new Set([
	"com.br",
	"com.mx",
	"com.ph",
	"co.uk",
	"co.ke",
	"com.ng",
	"com.ar",
	"co.jp",
	"com.au",
]);

/** Registrable domain (eTLD+1): lowercase, strip scheme/path/port/^www. */
export function registrableDomain(url?: string | null): string {
	if (!url) return "";
	const host =
		url
			.toLowerCase()
			.split("//")
			.pop()
			?.split("/")[0]
			?.split(":")[0]
			?.replace(/^www\./, "") ?? "";
	const labels = host.split(".");
	if (labels.length <= 2) return host;
	const take = TWO_LABEL_SUFFIXES.has(labels.slice(-2).join(".")) ? 3 : 2;
	return labels.slice(-take).join(".");
}
