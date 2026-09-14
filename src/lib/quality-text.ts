/**
 * Board text hygiene for /quality. QUALITY.md is prose written for a reader
 * with time; the phase card is read in a glance. `plainText` drops the
 * markdown emphasis the card cannot render (`**`, backticks), and
 * `clampSentences` keeps the first sentences up to a budget so a phase
 * paragraph can grow in the document without rebuilding the wall of text
 * the board showed on 2026-09-14 (P3 ran to 3,000 characters). The full
 * text stays available behind the card's disclosure.
 */
export function plainText(s: string): string {
	return s.replace(/\*\*/g, "").replace(/`/g, "").replace(/\s+/g, " ").trim();
}

export function clampSentences(
	s: string,
	max = 300,
): { text: string; clamped: boolean } {
	const t = plainText(s);
	if (t.length <= max) return { text: t, clamped: false };
	const head = t.slice(0, max);
	// Prefer a sentence boundary, then a clause, then a word.
	const cut = Math.max(
		head.lastIndexOf(". "),
		head.lastIndexOf("; "),
		head.lastIndexOf(" — "),
	);
	const at = cut > max * 0.4 ? cut + 1 : head.lastIndexOf(" ");
	return { text: `${head.slice(0, at).trimEnd()} …`, clamped: true };
}
