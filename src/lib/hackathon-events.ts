/**
 * What an organizer published about a hackathon, read off the event page's
 * markdown. Pure, so the sync lane and the tests share one reading.
 *
 * Only sections the organizer wrote are served, under their own heading. On
 * 2026-10-05, 5 of 20 Stellar event pages had a requirements section and 6
 * a judging section; a missing section is reported as not published, never
 * filled in. Since 2026-10-09 the page includes the event's custom tabs:
 * three events (Build on Stellar, Stellar Hacks: Blend, Stellar Hacks:
 * PaltaLabs) publish their judging criteria only in a tab, which the
 * description-only page reported as not published.
 */

/** The event page as the organizer published it: the description, then each
 * custom tab under its name as a top-level heading, with the tab's own
 * headings one level down. A section read from the page then ends where its
 * tab ends: a "Project Submission Requirements" tab is one section, its
 * sub-headings included, and a description's own judging section stops at
 * the next tab instead of running into it. */
export function eventPageMarkdown(
	description: string | null | undefined,
	tabs: ReadonlyArray<{ name?: string | null; body?: string | null }> = [],
): string | null {
	const parts = [description?.trim() || null];
	for (const t of tabs) {
		const body = t.body?.trim();
		if (!body) continue;
		let fenced = false;
		const nested = body
			.split("\n")
			.map((l) => {
				if (/^\s*(```|~~~)/.test(l)) fenced = !fenced;
				return !fenced && /^#{1,5}\s/.test(l) ? `#${l}` : l;
			})
			.join("\n");
		parts.push(`# ${t.name?.trim() || "More"}\n\n${nested}`);
	}
	const page = parts.filter(Boolean).join("\n\n");
	return page || null;
}

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

/** sls-092: what a reader should know when the submissions served here
 * differ from DoraHacks' own count for the event. null when they agree or
 * either count is unknown. */
export function submissionCoverageNote(
	upstream: number | null | undefined,
	served: number | null | undefined,
): string | null {
	if (
		typeof upstream !== "number" ||
		typeof served !== "number" ||
		upstream === served
	)
		return null;
	return upstream > served
		? `DoraHacks counts ${upstream} submissions for this event; ${served} are served here. The other ${upstream - served} are not: submissions their teams hid or deleted, or a resubmission counted once under its first entry.`
		: `DoraHacks counts ${upstream} submissions for this event; ${served} are served here, including ${served - upstream} DoraHacks no longer lists (a stored submission is kept).`;
}

export const JUDGING_HEADING = /judg|criteri|evaluat|scoring/i;
export const REQUIREMENTS_HEADING = /requirement|rules|eligib|how to submit/i;
