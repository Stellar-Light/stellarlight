/**
 * Directory quality bar — the single predicate deciding whether a partner
 * profile shows in the DEFAULT directory view (/partners page + GET
 * /api/partners without ?all=1).
 *
 * This is a DISPLAY bar, NOT a matching bar: the concierge matcher
 * (fetchEligiblePartners in partner-match.ts) keeps its own rule — a
 * tagline-less partner can still be a legitimate match for a builder need.
 * The bar exists because 28/47 seeded profiles have no tagline and read as
 * placeholder rows; showing only complete, non-archived profiles by default
 * keeps the directory presentable while ?all=1 / the "show all" toggle keeps
 * everything reachable.
 *
 * Deadness is a HUMAN call: freshnessStatus becomes "archived" only via the
 * owner-confirmed curation script (scripts/data/curate-partners.ts) — never
 * auto-detected.
 */
export function passesQualityBar(p: {
	tagline?: string | null;
	contactEmail?: string | null;
	websiteUrl?: string | null;
	freshnessStatus?: string | null;
}): boolean {
	return (
		Boolean(p.tagline) &&
		Boolean(p.contactEmail || p.websiteUrl) &&
		(p.freshnessStatus ?? "fresh") !== "archived"
	);
}
