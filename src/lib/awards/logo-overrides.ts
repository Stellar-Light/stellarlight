/**
 * Awards-page logo overrides: static files shipped with the site, used in
 * place of a nominee's directory logo while that logo is missing, generic (a
 * GitHub identicon) or not servable. The directory stays the source of truth;
 * an entry here is a stopgap that says so, and comes out once the directory's
 * own media is fixed. Empty since 2026-09-23: the eight entries it carried
 * (abroad, tansu, bousol, liqvid, stellar-security-portal, rahat, tucambio,
 * swiftex) were fixed at the directory level via LOGO_SET once the curate
 * lane got R2 credentials.
 */
export const AWARD_LOGO_OVERRIDES: Record<string, string> = {};
