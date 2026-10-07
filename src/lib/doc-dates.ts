/**
 * Date extraction for the corpus sources whose documents state their own
 * dates (S7 coverage: sep/cap/paper served publishedAt null while the date
 * sat unread in the document).
 *
 * Verified against live upstream files (2026-08-28):
 *   ecosystem/sep-0006.md  → `Created: 2017-10-30` + `Updated: 2025-09-10`
 *   ecosystem/sep-0001.md  → `Created: 2017-10-30` + `Updated: 2025-01-16`
 *   core/cap-0046.md       → `Created: 2022-10-27` (CAPs carry no Updated:)
 *   stellar-consensus-protocol.pdf → page-1 footer "Draft of February 25, 2016"
 *
 * Shared by the ingesters (scripts/ingest-seps.ts / ingest-caps.ts /
 * ingest-papers.ts) and the repair pass (scripts/backfill-corpus-dates.ts)
 * so extraction and backfill can't drift apart. Null when nothing parses —
 * never guessed.
 */

/**
 * Date from the fenced `Key: Value` preamble every SEP/CAP opens with.
 * `Updated:` preferred over `Created:` — freshness is what S7 measures.
 * Guarded to the doc head (same 2500-char zone rule as parseCapPreamble)
 * AND to blocks carrying the `SEP:`/`CAP:` signature line, so an
 * "Updated: …" in body prose of an arbitrary chunk never matches.
 * Works on full markdown at ingest and on a stored preamble chunk's
 * content at backfill (the `## Preamble` section is its own chunk).
 */
export function preambleDate(md: string): string | null {
	const head = md.slice(0, 2500);
	if (!/^(?:SEP|CAP):\s*\d+/m.test(head)) return null;
	const m =
		head.match(/^Updated:\s*(\d{4}-\d{2}-\d{2})\b/m) ??
		head.match(/^Created:\s*(\d{4}-\d{2}-\d{2})\b/m);
	return m && Number.isFinite(Date.parse(m[1])) ? m[1] : null;
}

const MONTHS: Record<string, number> = {
	january: 1,
	february: 2,
	march: 3,
	april: 4,
	may: 5,
	june: 6,
	july: 7,
	august: 8,
	september: 9,
	october: 10,
	november: 11,
	december: 12,
};

const MONTH_DATE_RE =
	/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})\b/;

/**
 * Date a paper states on its own pages. The one real specimen (the SCP
 * whitepaper) carries a "Draft of February 25, 2016" page footer — that
 * phrase is matched anywhere in the text (pdf extraction order puts footers
 * wherever it likes); a bare "Month D, YYYY" is trusted only in the head so
 * a date in later prose never becomes the paper's date.
 */
export function paperDate(text: string): string | null {
	const m =
		text.match(new RegExp(`Draft of\\s+${MONTH_DATE_RE.source}`)) ??
		text.slice(0, 2000).match(MONTH_DATE_RE);
	if (!m) return null;
	const month = MONTHS[m[1].toLowerCase()];
	const day = Number(m[2]);
	if (!month || day < 1 || day > 31) return null;
	return `${m[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The corpus stores publishedAt as full ISO; docs state days. */
export function toPublishedAt(day: string): string {
	return `${day}T00:00:00.000Z`;
}
