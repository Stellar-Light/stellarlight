/**
 * Title quality — ONE shared home for (a) the S6 bad-title CLASSIFIER the
 * corpus-health sweep runs (scripts/eval/engine-b-corpus.ts) and (b) the
 * DERIVER that produces a title passing that classifier. Ingest
 * (chunkMarkdown) and the back-fill repair (scripts/fix-corpus-titles.ts)
 * call the deriver; the sweep calls the classifier — so the rule and the fix
 * can never drift apart.
 *
 * A chunk's title is the citation an agent SHOWS, so the bar is
 * "citation-grade": human-readable (entities decoded), a label not a
 * sentence (no trailing sentence punctuation), short enough to display
 * (≤ TITLE_MAX), and never a bare date.
 */
import { normalizeTitleText } from "./decode-entities";

export const TITLE_MAX = 110;

export const BARE_DATE_RE =
	/^(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\w+ \d{1,2}, \d{4})$/;

/**
 * Evidence-calibrated (first live sweep run): 'starts-lowercase' false-
 * positived on CLI/RPC reference pages whose titles ARE lowercase identifiers
 * ('tx sign and tx send', 'request_trust'). Meeting recaps USED to be excused
 * as "inherently date-titled" — no longer: the dev-docs ingester synthesizes
 * "Stellar Protocol Meeting YYYY-MM-DD" titles, so a bare-date title is a
 * regression this classifier must catch (same bar as run-golden's BAD-TITLE).
 */
export function titleIssue(title: string, _url: string): string | null {
	const t = (title ?? "").trim();
	if (!t) return "empty";
	if (BARE_DATE_RE.test(t)) return "bare-date";
	if (t.length > TITLE_MAX) return "overlong (sentence, not a title)";
	// Run-3 evidence: word-count flagged 296 legit SEO-style docs titles
	// ('Issue an Asset on Stellar: Set Trustlines…'). A body fragment ENDS
	// like a sentence; length alone doesn't make one.
	if (/[.!?]$/.test(t)) return "sentence-like (body fragment?)";
	// Run-3 samples surfaced this class: '&amp;' served raw in titles —
	// scraped og:title/<title> text arrives entity-encoded.
	if (/&(amp|lt|gt|quot|#\d+|#x[0-9a-f]+);/i.test(t)) return "html-entities";
	return null;
}

/** Decode entities, drop zero-width chars, collapse whitespace, strip the
 * trailing sentence punctuation that turns a headline into a "sentence"
 * ("…now available on Stellar!" → "…now available on Stellar"). Internal
 * punctuation is untouched — only the tail is a label-vs-sentence signal. */
function normalize(raw: string): string {
	return normalizeTitleText(raw)
		.replace(/[\u200B-\u200D\uFEFF]/g, "")
		.replace(/[\s.!?]+$/, "")
		.trim();
}

const MIN_HEAD = 16;

/** First separator boundary whose head is a real title on its own — the
 * title-proper of a "Title: long subtitle" pair. Strong separators (":",
 * " — ", " – ", " | ", " - ") are tried before the weaker comma. Only
 * consulted for overlong titles, so normal "SEP-24: Hosted Deposit" titles
 * are never clamped. */
function clampAtSeparator(t: string): string | null {
	for (const re of [/:\s+|\s+[—–|-]\s+/g, /,\s+/g]) {
		for (const m of t.matchAll(re)) {
			const head = normalize(t.slice(0, m.index));
			if (head.length >= MIN_HEAD && head.length <= TITLE_MAX) return head;
		}
	}
	return null;
}

/** Last-resort candidate: the URL slug, humanized ("usdc-coming-stellar" →
 * "Usdc coming stellar"). Trailing CMS dedupe counters are kept — ugly beats
 * wrong ("protocol-23" must not become "protocol"). Letterless tail segments
 * (date/archive paths like /meetings/2024-02-09) are APPENDED to the nearest
 * worded segment — "Meetings 2024-02-09" — never returned alone, so a date
 * URL can't humanize to a bare "09". */
export function humanizeSlug(url: string): string | null {
	try {
		const segs = new URL(url).pathname
			.split("/")
			.filter(Boolean)
			.map((s) => decodeURIComponent(s).replace(/\.(md|mdx|html?|pdf)$/i, ""));
		const suffix: string[] = [];
		let i = segs.length - 1;
		while (i >= 0 && !/[a-z]/i.test(segs[i])) {
			suffix.unshift(segs[i]);
			i--;
		}
		if (i < 0) return null; // path carries no worded segment at all
		const core = segs[i].replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
		if (!core) return null;
		const words = [core, ...suffix].join(" ").trim();
		return words.charAt(0).toUpperCase() + words.slice(1);
	} catch {
		return null;
	}
}

function truncateAtWord(t: string, max: number): string {
	if (t.length <= max) return t;
	const cut = t.slice(0, max);
	const atWord = cut.slice(0, cut.lastIndexOf(" "));
	return `${normalize(atWord.length >= 20 ? atWord : cut)}…`;
}

/**
 * Derive a citation-grade title that PASSES titleIssue, from the best
 * available candidate in order of preference: the extracted page title
 * (og:title/<title>/heading — whatever the caller scraped), any extra
 * candidates the caller has (e.g. an h1), then the URL slug humanized.
 * Overlong candidates are clamped to their title-proper at a separator
 * boundary before being given up on; the final fallback is a word-boundary
 * truncation, so the result is ALWAYS non-empty and classifier-clean for
 * any non-degenerate input.
 */
export function deriveCleanTitle(
	raw: string,
	url: string,
	extraCandidates: string[] = [],
): string {
	const candidates = [raw, ...extraCandidates, humanizeSlug(url) ?? ""];
	for (const c of candidates) {
		let t = normalize(c);
		// A candidate with no letters ("09", "2.1.0" alone) is never a title.
		if (!t || !/[a-z]/i.test(t) || BARE_DATE_RE.test(t)) continue;
		if (t.length > TITLE_MAX) {
			// A leading brand segment ("Stellar | Real Title…") is dead weight on
			// an overlong title — dropping it often leaves the REAL title intact,
			// original casing and all. Only tried when overlong.
			const debranded = normalize(t.replace(/^[^|]{1,30}\|\s*/, ""));
			if (debranded.length >= MIN_HEAD && debranded.length <= TITLE_MAX) {
				t = debranded;
			} else {
				const clamped = clampAtSeparator(
					debranded.length >= MIN_HEAD ? debranded : t,
				);
				if (!clamped) continue;
				t = clamped;
			}
		}
		if (!titleIssue(t, url)) return t;
	}
	const base = candidates.map(normalize).find(Boolean);
	if (!base) return "Untitled";
	return truncateAtWord(base, TITLE_MAX - 1);
}
