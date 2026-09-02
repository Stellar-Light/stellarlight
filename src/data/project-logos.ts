/**
 * Static project marks, keyed by the project's display name.
 *
 * The `logo` field on a project is a Payload upload — a media row backed by
 * R2. CI has no R2 credentials (curate-projects.yml runs with DATABASE_URI
 * only), so a media row created from a workflow would point at a file that
 * only ever existed on the runner's disk. For an owner-supplied mark that
 * ships in this repo, a static path is the honest mechanism: the file is
 * versioned, the site serves it, and no secret is involved.
 *
 * Same shape as the stablecoin explorer's TOKEN_LOGOS and tvl-stats' issuer
 * map. Owner-supplied marks only — never a scraped favicon.
 */
export const PROJECT_LOGOS: Record<string, string> = {
	// 2026-09-02, owner-supplied: the flat square USDT0 mark.
	USDT0: "/stablecoins/logos/usdt0.png",
};
