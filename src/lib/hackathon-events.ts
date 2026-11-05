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

/** Accents off, so "Critérios de Avaliação" reads as "Criterios de
 * Avaliacao". */
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** A line opening with a bold label, list marker and indent allowed
 * ("**Judging criteria:** impact", "- **Requisitos:**"): its indent, the
 * label's own words and the text after it. */
const INLINE_LABEL = /^(\s*)(?:[-*+]\s+)?\*\*([^*]+?):?\*\*:?\s*(.*)$/;

/** A label line's own words: bold markers and a closing colon off. */
const labelText = (line: string) =>
	line
		.trim()
		.replace(/^\*\*(.+)\*\*:?$/, "$1")
		.replace(/:$/, "")
		.trim();

/** A line a page uses as a section title without a heading: after a blank
 * line (or first), under 60 characters, not a list item, table row, quote,
 * sentence or bold label followed by text ("Critérios de Avaliação",
 * "**Judging Criteria**"). */
function isLabelLine(lines: string[], i: number): boolean {
	const line = lines[i].trim();
	const text = labelText(line);
	return (
		!!text &&
		text.length <= 60 &&
		!INLINE_LABEL.exec(line)?.[3] &&
		!/^([-*+]\s|\d+[.)]\s|#|>|\|)/.test(line) &&
		!/[.!?,;]$/.test(text) &&
		(i === 0 || !lines[i - 1].trim())
	);
}

const levelOf = (line: string) => /^(#{1,6})\s/.exec(line)?.[1].length ?? 0;
const titleOf = (line: string) => fold(line.replace(/^#+\s*/, ""));

/** The section a page's headings give for `heading`. The shallowest
 * matching heading is the event's own: a deeper one sits under a track or
 * a part. Several at that depth under different headings (one per track)
 * are served each under its track's name, so no track's reads as the
 * event's. With no matching heading, the first label line or bold label
 * that matches (a page that writes "Critérios de Avaliação" on a line of
 * its own). null when there is none. Accents do not count when matching. */
export function markdownSection(
	markdown: string | null | undefined,
	heading: RegExp,
): string | null {
	if (!markdown) return null;
	const lines = markdown.split(/\r?\n/);
	const hits = lines.flatMap((l, i) =>
		levelOf(l) && heading.test(titleOf(l)) ? [i] : [],
	);
	if (!hits.length) return labelSection(lines, heading);
	const top = Math.min(...hits.map((i) => levelOf(lines[i])));
	const tops = hits.filter((i) => levelOf(lines[i]) === top);
	// The heading each sits under (its track), if any.
	const parentOf = (i: number) => {
		for (let j = i - 1; j >= 0; j--) {
			const lv = levelOf(lines[j]);
			if (lv && lv < top) return j;
		}
		return -1;
	};
	const parents = tops.map(parentOf);
	if (new Set(parents).size === 1) return sectionAt(lines, tops[0], heading);
	const parts = tops.flatMap((at, k) => {
		const body = sectionAt(lines, at, heading);
		const track =
			parents[k] < 0 ? null : lines[parents[k]].replace(/^#+\s*/, "").trim();
		return body ? [track ? `**${track}**\n${body}` : body] : [];
	});
	return parts.length ? parts.join("\n\n").slice(0, 4_000) : null;
}

/** Both section kinds, for telling a heading that names both. */
const SECTION_HEADINGS = () => [JUDGING_HEADING, REQUIREMENTS_HEADING];

/** The text under the heading at `at`, to the next heading of its level or
 * higher. A heading that names both sections ("Entregables y Criterios de
 * Evaluación") is read for each by the part of it under a bold label that
 * names that one alone ("- **Criterios de evaluación:**"), so it is not
 * served twice. ponytail: with no such part, the whole section serves
 * both; split it when a page writes one that way. */
function sectionAt(
	lines: string[],
	at: number,
	heading: RegExp,
): string | null {
	const level = levelOf(lines[at]);
	const body: string[] = [];
	for (const l of lines.slice(at + 1)) {
		const lv = levelOf(l);
		if (lv && lv <= level) break;
		body.push(l);
	}
	const named = SECTION_HEADINGS().filter((r) => r.test(titleOf(lines[at])));
	const part = named.length > 1 ? labeledPart(body, heading) : null;
	const text = (part ?? body.join("\n")).trim();
	return text ? text.slice(0, 4_000) : null;
}

/** The part under the first bold label that names `heading`'s section and
 * no other: its own text, then the lines indented under it, dedented. */
function labeledPart(lines: string[], heading: RegExp): string | null {
	const others = SECTION_HEADINGS().filter((r) => r !== heading);
	const at = lines.findIndex((l) => {
		const m = INLINE_LABEL.exec(l);
		return (
			!!m && heading.test(fold(m[2])) && !others.some((r) => r.test(fold(m[2])))
		);
	});
	if (at < 0) return null;
	const [, indent = "", , rest] = INLINE_LABEL.exec(lines[at]) ?? [];
	const out = rest ? [rest] : [];
	for (const l of lines.slice(at + 1)) {
		if (l.trim() && l.search(/\S/) <= indent.length) break;
		out.push(l);
	}
	const shift = Math.min(
		...out.filter((l) => l.trim()).map((l) => l.search(/\S/)),
	);
	const text = out
		.map((l) => (Number.isFinite(shift) ? l.slice(shift) : l))
		.join("\n")
		.trim();
	return text || null;
}

/** With no matching heading: the first bold label that names the section
 * (the text after it and the lines of its paragraph), or the paragraph
 * under the first label line that does.
 * ponytail: one paragraph; criteria a page spreads over several paragraphs
 * under one label read as the first only. */
function labelSection(lines: string[], heading: RegExp): string | null {
	for (let i = 0; i < lines.length; i++) {
		const inline = INLINE_LABEL.exec(lines[i]);
		if (inline?.[3] && heading.test(fold(inline[2]))) {
			const body = [inline[3]];
			for (let j = i + 1; j < lines.length && lines[j].trim(); j++)
				body.push(lines[j]);
			return body.join("\n").trim().slice(0, 4_000);
		}
		if (!isLabelLine(lines, i) || !heading.test(fold(labelText(lines[i]))))
			continue;
		let j = i + 1;
		while (j < lines.length && !lines[j].trim()) j++;
		const body: string[] = [];
		for (; j < lines.length && lines[j].trim(); j++) body.push(lines[j]);
		// A heading under the label is not its paragraph.
		if (!body.length || levelOf(body[0])) return null;
		return body.join("\n").trim().slice(0, 4_000);
	}
	return null;
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
	const gap = Math.abs(upstream - served);
	return upstream > served
		? `DoraHacks counts ${upstream} submissions for this event; ${served} are served here. ${
				gap === 1
					? "The other one is not: a submission its team hid or deleted, or a resubmission counted once under its first entry."
					: `The other ${gap} are not: submissions their teams hid or deleted, or resubmissions counted once under their first entry.`
			}`
		: `DoraHacks counts ${upstream} submissions for this event; ${served} are served here, including ${gap} DoraHacks no longer lists (a stored submission is kept).`;
}

/** sls-092: a winning submission its team hid or deleted on DoraHacks is
 * stored but not served; the record names it instead of leaving a gap
 * (Build on Stellar Chile served 14 of its 15 winners). null when there is
 * none, or when the read could not say. */
export function hiddenWinnersNote(
	hidden: ReadonlyArray<{
		placement: string | null;
		award?: string | null;
		awardCategory?: string | null;
	}> | null,
): string | null {
	if (!hidden?.length) return null;
	// A category is named as what the placement sits in, never as its prize.
	const places = hidden
		.map((h) =>
			h.award
				? `${h.placement || "Winner"}, ${h.award}`
				: h.awardCategory
					? `${h.placement || "Winner"} in ${h.awardCategory}`
					: h.placement || "Winner",
		)
		.join("; ");
	return hidden.length === 1
		? `One winning submission is not served here: its team hid or deleted it on DoraHacks (${places}).`
		: `${hidden.length} winning submissions are not served here: their teams hid or deleted them on DoraHacks (${places}).`;
}

// Spanish and Portuguese too, read with accents off: "Criterios de
// evaluación", "Critérios de Avaliação", "Requisitos", "Entregáveis".
// A list of judges is not criteria: judging, judged and judgment are, and
// Prerequisites are not requirements.
export const JUDGING_HEADING =
	/judging|judged|judgment|judgement|criteri|evaluat|evaluac|avaliac|scoring/i;
export const REQUIREMENTS_HEADING =
	/requirement|rules|eligib|how to submit|\brequisitos?\b|deliverable|entregab|entregav/i;
