/**
 * Stellar Ambassador Program members, keyed by GitHub login (lowercase).
 *
 * SDF launched the program on 2026-08-03 (tiers Explorer, Contributor,
 * Builder, Ecosystem Leader; regional chapters with Rise In). As of
 * 2026-08-18 there is NO public roster: not on stellar.org, the program
 * gitbook, Rise In's page, nor a field on Stellar Passport. So this list is
 * curated by hand from what SDF or the ambassadors themselves publish; every
 * row names its source. /builders shows an "Ambassadors" toggle and a tier
 * badge only when this map has entries. Extend it, do not guess.
 */
export type AmbassadorTier =
	| "Explorer"
	| "Contributor"
	| "Builder"
	| "Ecosystem Leader";

export const AMBASSADORS: Record<
	string,
	{ tier: AmbassadorTier; region?: string; since?: string; source: string }
> = {
	// example shape (remove when the first real row lands):
	// "some-login": { tier: "Builder", region: "Türkiye", since: "2026-08", source: "https://…" },
};
