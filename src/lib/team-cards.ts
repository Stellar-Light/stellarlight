/**
 * Extract SDF leadership + board-of-directors name→role pairs from a
 * stellar.org/foundation/team page's embedded Next.js data (sls-055 residual /
 * Tyler 2026-07-14).
 *
 * Why this exists: the team page renders each member's NAME as bare text in
 * <main> (so a plain scrape yields "Candace Kelly David Mazières Denelle
 * Dixon…" with no roles), while the ROLE for each ("Founder and Chief
 * Scientist", "VP of Ecosystem") lives ONLY in the Sanity `card` blocks inside
 * the page's <script id="__NEXT_DATA__"> JSON. Result: the corpus had a name
 * list disconnected from titles, so leadership-role questions ("who is the SDF
 * Chief Scientist?") could not be answered. This parser recovers the pairing
 * from the embedded card data — the "rendered equivalent" of the cards — so the
 * roster is quotable and embeddable.
 *
 * Selection is precise and fail-safe: only Sanity `_type: "card"` blocks with a
 * two-word name and a short role string qualify (person cards carry ~30-char
 * roles; page/drawer/banner blocks carry 100–200-char prose descriptions and a
 * different `_type`), and UI-placeholder cards (the client-side search widget's
 * "Sorry, no matches found." state) are dropped. If stellar.org migrates off
 * this structure the parser simply returns fewer/no pairs — the ingester's
 * signature guard then REFUSES the page (loud fail), never silently ingesting a
 * bare name list again.
 */

export interface PersonCard {
	/** Person name, e.g. "David Mazières". */
	name: string;
	/** Role/title/affiliation, e.g. "Founder and Chief Scientist". */
	role: string;
	/** Roster section the card was grouped under on the page, taken from the
	 * enclosing group's `heading` — "Leadership", "Board of directors", or
	 * "Advisors". null if the card had no ancestor heading (structure changed). */
	section: string | null;
}

/** Longest a `description` can be and still be a role, not prose. Real roles
 * (incl. board affiliations like "General Partner at Founders Fund") sit well
 * under this; page/section descriptions run 100+ chars. */
const MAX_ROLE_LEN = 80;

function isUiPlaceholder(name: string, role: string): boolean {
	// The team page's client-side member search renders placeholder "cards" for
	// its empty/error states — real people never match these.
	if (/^please try/i.test(role)) return true;
	if (/sorry|apolog|no matches|search error/i.test(name)) return true;
	// Real names don't end in sentence punctuation or carry !/?.
	if (/[!?]|\.$/.test(name)) return true;
	return false;
}

/**
 * Parse the `__NEXT_DATA__` JSON blob out of a rendered team page and return the
 * de-duplicated list of name→role pairs, in first-seen (page) order.
 */
export function extractPersonCards(html: string): PersonCard[] {
	const m = html.match(
		/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
	);
	if (!m) return [];
	let data: unknown;
	try {
		data = JSON.parse(m[1]);
	} catch {
		return [];
	}

	const out: PersonCard[] = [];
	const seen = new Set<string>();

	// `section` is the nearest ANCESTOR section container's title ("Leadership" /
	// "Board of directors" / "Advisors"): the roster nests its person cards under
	// a container object (`content[i]`) whose `title` names the section, in an
	// `items` array. A person card ALSO carries a `title` (the person's name), so
	// the section must come from the container we descended THROUGH — never the
	// card itself. It's threaded as a param that only updates when we recurse INTO
	// a non-card node that has a title.
	const visit = (node: unknown, section: string | null): void => {
		if (Array.isArray(node)) {
			for (const v of node) visit(v, section);
			return;
		}
		if (!node || typeof node !== "object") return;
		const rec = node as Record<string, unknown>;
		if (rec._type === "card") {
			const name = typeof rec.title === "string" ? rec.title.trim() : "";
			const role =
				typeof rec.description === "string" ? rec.description.trim() : "";
			// Name must look like a person (≥2 whitespace-separated word chars).
			if (
				name &&
				role &&
				role.length <= MAX_ROLE_LEN &&
				/\S\s+\S/.test(name) &&
				!isUiPlaceholder(name, role)
			) {
				const key = `${name}||${role}`;
				if (!seen.has(key)) {
					seen.add(key);
					out.push({ name, role, section });
				}
			}
		}
		// Children inherit this node's title as their section when it's a non-card
		// container with a title (`content[i].title` = the section name); cards
		// keep the section they were entered with, so a person's name never
		// becomes a section.
		const childSection =
			rec._type !== "card" && typeof rec.title === "string" && rec.title.trim()
				? rec.title.trim()
				: section;
		for (const v of Object.values(rec)) visit(v, childSection);
	};
	visit(data, null);
	return out;
}

/**
 * Render the extracted roster as a Markdown section appended to the team page's
 * scraped prose (the prose already carries the "## Leadership" / "## Board of
 * directors" headings + bare names; this adds the quotable name→role pairing).
 * Each pair is its own line so retrieval can surface a single role cleanly.
 */
export function renderRosterMarkdown(cards: PersonCard[]): string {
	if (!cards.length) return "";
	// Group by roster section in first-seen order so the corpus prose reads as
	// "## …leadership / board / advisors" instead of one flat list — a single
	// role stays a clean, quotable line under its section heading.
	const order: string[] = [];
	const bySection = new Map<string, PersonCard[]>();
	for (const c of cards) {
		const key = c.section ?? "Team";
		if (!bySection.has(key)) {
			bySection.set(key, []);
			order.push(key);
		}
		bySection.get(key)?.push(c);
	}
	const blocks = order.map((section) => {
		const lines = (bySection.get(section) ?? []).map(
			(c) => `- ${c.name} — ${c.role}`,
		);
		return `### ${section}\n${lines.join("\n")}`;
	});
	return `## SDF team — names and current roles\n\n${blocks.join("\n\n")}`;
}
