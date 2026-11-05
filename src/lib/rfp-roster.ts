/**
 * The briefs SCF's RFP Track page lists as open, read from its markdown
 * source (the SCF Handbook repo GitBook publishes from), so a check can
 * compare them with the open briefs src/data/ideas.ts serves. sls-096: the
 * page dropped the Q3 briefs on 2026-10-16 and /api/rfps served them as
 * open for 17 days, with nothing to notice the change.
 */

/** A tag's text with its markup gone: tags, the entities the page uses,
 * runs of space, and a trailing colon ("C-Address Tooling & Onboarding :",
 * 2026-03-24). */
const textOf = (html: string) =>
	html
		.replace(/<[^>]+>/g, " ")
		.replace(/&#x26;|&amp;/g, "&")
		.replace(/&#x20;|&nbsp;/g, " ")
		.replace(/\s+/g, " ")
		.replace(/\s*:\s*$/, "")
		.trim();

/** What the page says when it lists no open brief: "New Q4 RFPs are coming
 * soon" (October 2026), "All Q1 RFPs are closed" (April 2026). */
const NONE_OPEN = /\bRFPs are coming soon\b|\bAll Q\d RFPs are closed\b/i;

/** Each brief the "Current Open RFPs" section lists as open, by title: one
 * <summary> per brief's <details> block, however the tags are written (an
 * attribute, any case, the block and its summary on one line or a summary
 * over several). Not briefs: a "Coming Soon" placeholder, and a brief marked
 * "No longer accepting submissions" (how the page listed Q1's after they
 * closed).
 *
 * null, could not check, unless the section reads one way only: briefs
 * found, or none found and the page saying plainly that none is open
 * (NONE_OPEN, outside the blocks). No such heading, a block with no summary,
 * a block left open or a summary outside any block is null too: a list read
 * wrong comes back empty, and empty would pass as "none open". */
export function officialOpenBriefs(markdown: string): string[] | null {
	const lines = markdown.split("\n");
	const start = lines.findIndex((l) => /^#{1,4}\s+Current Open RFPs/.test(l));
	if (start < 0) return null;
	// The section ends at the next heading outside any brief's block.
	let open = 0;
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) {
		if (open === 0 && /^#{1,4}\s/.test(lines[i])) {
			end = i;
			break;
		}
		open +=
			(lines[i].match(/<details\b[^>]*>/gi) ?? []).length -
			(lines[i].match(/<\/details\s*>/gi) ?? []).length;
	}
	const section = lines.slice(start + 1, end).join("\n");
	const titles: string[] = [];
	const outside: string[] = [];
	let depth = 0;
	let summarized = false;
	let at = 0;
	for (const m of section.matchAll(
		/<details\b[^>]*>|<\/details\s*>|<summary\b[^>]*>([\s\S]*?)<\/summary\s*>/gi,
	)) {
		if (depth === 0) outside.push(section.slice(at, m.index));
		at = (m.index ?? 0) + m[0].length;
		const tag = m[0].slice(0, 9).toLowerCase();
		if (tag.startsWith("<details")) {
			depth++;
			if (depth === 1) summarized = false;
		} else if (tag.startsWith("</details")) {
			if (depth === 1 && !summarized) return null;
			depth--;
			if (depth < 0) return null;
		} else if (depth === 0) {
			return null;
		} else if (depth === 1) {
			summarized = true;
			const title = textOf(m[1]);
			if (
				title &&
				!/^coming soon$/i.test(title) &&
				!/no longer accepting/i.test(title)
			)
				titles.push(title);
		}
	}
	if (depth !== 0) return null;
	outside.push(section.slice(at));
	if (titles.length) return titles;
	return NONE_OPEN.test(textOf(outside.join(" "))) ? [] : null;
}

/** What the official list and ours disagree on, by title, case and spacing
 * aside: briefs the page lists that we do not serve as open, and briefs we
 * serve as open that it does not list. */
export function rosterDrift(official: string[], ours: string[]) {
	const key = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
	const theirs = new Set(official.map(key));
	const mine = new Set(ours.map(key));
	return {
		notServed: official.filter((t) => !mine.has(key(t))),
		notListed: ours.filter((t) => !theirs.has(key(t))),
	};
}
