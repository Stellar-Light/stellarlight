/**
 * What an organizer published about a hackathon, read off the event page's
 * markdown. Pure, so the sync lane and the tests share one reading.
 *
 * Only sections the organizer wrote are served, under their own heading. On
 * 2026-10-05, 5 of 20 Stellar event pages had a requirements section and 6
 * a judging section; a missing section is reported as not published, never
 * filled in.
 */

/** The text under the first heading matching `heading`, up to the next
 * heading of the same or a higher level; null when there is none. */
export function markdownSection(
	markdown: string | null | undefined,
	heading: RegExp,
): string | null {
	if (!markdown) return null;
	const lines = markdown.split(/\r?\n/);
	const at = lines.findIndex(
		(l) => /^#{1,6}\s/.test(l) && heading.test(l.replace(/^#+\s*/, "")),
	);
	if (at < 0) return null;
	const level = (lines[at].match(/^#+/) ?? ["#"])[0].length;
	const body: string[] = [];
	for (const l of lines.slice(at + 1)) {
		const h = l.match(/^(#{1,6})\s/);
		if (h && h[1].length <= level) break;
		body.push(l);
	}
	const text = body.join("\n").trim();
	return text ? text.slice(0, 4_000) : null;
}

export const JUDGING_HEADING = /judg|criteri|evaluat|scoring/i;
export const REQUIREMENTS_HEADING = /requirement|rules|eligib|how to submit/i;
