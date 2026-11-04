/**
 * The briefs SCF's RFP Track page lists as open, read from its markdown
 * source (the SCF Handbook repo GitBook publishes from), so a check can
 * compare them with the open briefs src/data/ideas.ts serves. sls-096: the
 * page dropped the Q3 briefs on 2026-10-16 and /api/rfps served them as
 * open for 17 days, with nothing to notice the change.
 */

/** Each brief's title under "Current Open RFPs": one <summary> per brief's
 * <details> block. Not briefs: a "Coming Soon" placeholder, and a brief
 * marked "No longer accepting submissions" (how the page listed Q1's after
 * they closed). null when the page has no such heading: it was not read as
 * this expects, so nothing is known about its briefs. */
export function officialOpenBriefs(markdown: string): string[] | null {
	const lines = markdown.split("\n");
	const start = lines.findIndex((l) => /^#{1,4}\s+Current Open RFPs/.test(l));
	if (start < 0) return null;
	const titles: string[] = [];
	let depth = 0;
	for (const line of lines.slice(start + 1)) {
		// The section ends at the next heading outside any brief.
		if (depth === 0 && /^#{1,4}\s/.test(line)) break;
		const summary = line.match(/<summary>(.*)<\/summary>/);
		if (depth === 1 && summary) {
			const title = summary[1]
				.replace(/<[^>]+>/g, "")
				.replace(/&#x26;|&amp;/g, "&")
				// "C-Address Tooling & Onboarding :" (2026-03-24).
				.replace(/\s*:\s*$/, "")
				.trim();
			if (
				title &&
				!/^coming soon$/i.test(title) &&
				!/no longer accepting/i.test(title)
			)
				titles.push(title);
		}
		depth +=
			(line.match(/<details>/g) ?? []).length -
			(line.match(/<\/details>/g) ?? []).length;
	}
	return titles;
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
