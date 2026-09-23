/**
 * Awards-page logo overrides: static files shipped with the site, used in
 * place of a nominee's directory logo while that logo is missing, generic (a
 * GitHub identicon) or not servable. The directory stays the source of truth;
 * an entry here is a stopgap that says so, and comes out once the directory's
 * own media is fixed (the curate lane's LOGO_SET needs R2 credentials to
 * upload, and the repo held none on 2026-09-23).
 */
export const AWARD_LOGO_OVERRIDES: Record<string, string> = {
	abroad: "/awards/logos/abroad.png", // owner's mark; directory upload unservable
	tansu: "/awards/logos/tansu.png", // tansu.dev logo; directory upload unservable
	bousol: "/awards/logos/bousol.png", // directory held an .ico as .png
	liqvid: "/awards/logos/liqvid.png", // directory file 404
	"stellar-security-portal": "/awards/logos/stellar-security-portal.png", // directory file 404
	rahat: "/awards/logos/rahat.png", // directory held a GitHub identicon
	tucambio: "/awards/logos/tucambio.png", // directory held a GitHub identicon
	swiftex: "/awards/logos/swiftex.png", // directory held a GitHub identicon
};
