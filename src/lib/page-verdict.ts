/**
 * Page verdict — is the thing a URL serves a PRODUCT, or a corpse wearing
 * a 200?
 *
 * The weekly link check HEAD-requests every website and `site-liveness`
 * is stamped on any row whose site answered. A HEAD cannot see what it
 * answered WITH. On 2026-08-21 an SDF reviewer caught Raven recommending
 * Kulipa first for card services: it had shut down 2026-07-29, but
 * kulipa.xyz still returned 200 with a "changing home / join our waitlist"
 * page, so we called it Live on a site-liveness basis. The same sweep found
 * GetBlockCard (lapsed domain now serving lottery spam), 0xauth (a casino),
 * stellar-battle and triiyo ("is for sale | HugeDomains"), and zilt and
 * sorosan serving an unbuilt "Create Next App" scaffold — 23 placeholders,
 * 45 off-site redirects, all `Live`. A 200 is not a business.
 *
 * Pure and deliberately conservative: "unknown" is the honest default and
 * never triggers anything. Only patterns that are close to unambiguous get
 * a non-product verdict, because this feeds a basis DOWNGRADE (never a
 * status change) and a false "parked" costs a live project its evidence.
 */

export type PageVerdict =
	| "product"
	| "placeholder"
	| "parked"
	| "spam"
	| "scaffold"
	| "offsite-redirect"
	| "unknown";

export interface PageSignals {
	title?: string | null;
	metaDescription?: string | null;
	/** First ~1–2 KB of visible body text, if the caller extracted it. */
	bodyStart?: string | null;
	/** Host the check requested. */
	requestedHost?: string | null;
	/** Host that finally answered (after redirects). */
	finalHost?: string | null;
}

const PARKED =
	/\b(domain (is )?for sale|buy this domain|this domain (is|may be) for sale|hugedomains|sedo\.com|dan\.com|afternic|parked (domain|by)|expireddomains|domain has expired|renew (this|your) domain)\b/i;
const SPAM =
	/\b(togel|toto (togel|macau)|slot gacor|situs (slot|judi|partner)|bocoran|casino|judi online|bandar|c\u1ed5ng game|rbxto|poker online|betting)\b/i;
const SCAFFOLD =
	/^(create next app|react app|vite \+ react|welcome to nginx!?|apache2 (debian|ubuntu) default page|it works!?|index of \/|default web site page|document)$/i;
const PLACEHOLDER =
	/\b(coming soon|under construction|site is under construction|we('| a)re changing home|changing home|home changing|launching soon|stay tuned|join (our|the) waitlist|waitlist only)\b/i;

function registrable(host: string | null | undefined): string {
	const h = (host ?? "")
		.toLowerCase()
		.replace(/^www\./, "")
		.replace(/:\d+$/, "");
	const parts = h.split(".").filter(Boolean);
	return parts.length >= 2 ? parts.slice(-2).join(".") : h;
}

/** Classify what a URL served. See the file header for why this exists. */
export function classifyPage(s: PageSignals): {
	verdict: PageVerdict;
	reason: string | null;
} {
	const title = (s.title ?? "").trim();
	const meta = (s.metaDescription ?? "").trim();
	const head = `${title} ${meta}`.trim();
	const body = (s.bodyStart ?? "").slice(0, 1500);

	if (
		s.requestedHost &&
		s.finalHost &&
		registrable(s.requestedHost) !== registrable(s.finalHost)
	) {
		// A rebrand and a hijack look identical here; both need a human.
		return {
			verdict: "offsite-redirect",
			reason: `${registrable(s.requestedHost)} → ${registrable(s.finalHost)}`,
		};
	}
	const parked = PARKED.exec(head) ?? PARKED.exec(body);
	if (parked) return { verdict: "parked", reason: parked[0] };
	const spam = SPAM.exec(head);
	if (spam) return { verdict: "spam", reason: spam[0] };
	if (title && SCAFFOLD.test(title))
		return { verdict: "scaffold", reason: title };
	// Placeholder needs the TITLE or META to say so — a body mention of a
	// waitlist is ordinary marketing on a live product and must not count.
	const ph = PLACEHOLDER.exec(head);
	if (ph && head.length < 160) return { verdict: "placeholder", reason: ph[0] };
	if (title || meta) return { verdict: "product", reason: null };
	return { verdict: "unknown", reason: null };
}

/** Verdicts that mean "this page is not evidence the product is alive". */
export const NON_PRODUCT_VERDICTS: ReadonlySet<PageVerdict> = new Set([
	"placeholder",
	"parked",
	"spam",
	"scaffold",
	"offsite-redirect",
]);
