/**
 * HTML-entity decoding for titles/text pulled from scraped `<title>`/og:title
 * tags. The corpus-health S6 sweep flagged 47 research docs whose titles carry
 * raw entities — "The Stellar Development Foundation&#x27;s 2023 Strategy",
 * "Payments &amp; Anchors" — because the ingesters extracted the title text but
 * never decoded it. A title is the citation an agent SHOWS, so a raw `&#x27;`
 * is a visible defect; it also splits keyword matching ("foundation's" ≠
 * "foundation&#x27;s"). Pure + dependency-free so both the ingesters and the
 * back-fill script can share exactly one decoder.
 */

// The named entities that actually occur in scraped titles. Kept to a
// deliberately small, unambiguous set (no full HTML5 table) — anything not
// here is left verbatim rather than guessed.
const NAMED: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	hellip: "…",
	mdash: "—",
	ndash: "–",
	rsquo: "’",
	lsquo: "‘",
	rdquo: "”",
	ldquo: "“",
	times: "×",
	trade: "™",
	reg: "®",
	copy: "©",
	deg: "°",
};

/**
 * Decode HTML character references in `s`: numeric decimal (`&#39;`), numeric
 * hex (`&#x27;`), and the small named set above. `&amp;` is resolved LAST so a
 * double-encoded `&amp;#x27;` collapses correctly. Unknown references are left
 * untouched (never dropped). Returns the input unchanged when it holds no `&`.
 */
export function decodeHtmlEntities(s: string): string {
	if (!s || s.indexOf("&") === -1) return s;
	let out = s;
	// Numeric hex: &#x27; / &#X27;
	out = out.replace(/&#[xX]([0-9a-fA-F]+);/g, (_m, hex) => {
		const cp = Number.parseInt(hex, 16);
		return Number.isFinite(cp) && cp > 0 ? String.fromCodePoint(cp) : _m;
	});
	// Numeric decimal: &#39;
	out = out.replace(/&#(\d+);/g, (_m, dec) => {
		const cp = Number.parseInt(dec, 10);
		return Number.isFinite(cp) && cp > 0 ? String.fromCodePoint(cp) : _m;
	});
	// Named (case-sensitive; scraped titles use lowercase names). `amp` resolved
	// with the rest — after the numeric passes above so `&amp;#x27;` already
	// became `&#x27;`→`'` only if it was numeric; a literal `&amp;` stays a
	// single `&`.
	out = out.replace(/&([a-zA-Z]+);/g, (_m, name) =>
		Object.hasOwn(NAMED, name) ? NAMED[name] : _m,
	);
	return out;
}

/**
 * Title normalizer: decode entities, then collapse internal whitespace runs and
 * trim. This is the canonical form a title should be STORED in.
 */
export function normalizeTitleText(s: string): string {
	return decodeHtmlEntities(s).replace(/\s+/g, " ").trim();
}
