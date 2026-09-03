/**
 * Deterministic, per-auditor findings extraction for the audit registry
 * (ideas/audit-findings-extraction.md, 2026-07-19).
 *
 * Populates findingsTotal / severityCounts ONLY when a report's format
 * round-trips — an internal consistency check each grammar must pass
 * (stated count == enumerated IDs; severity words == ID prefixes). One
 * failed check → null (= not extracted, NOT zero). No LLM, no laundering
 * of the unreliable chunk-level severity inference: a parser only claims
 * what its format guarantees.
 *
 * Formats verified against live report bodies 2026-07-19 (reassembled
 * text — the grammars tolerate the PDF glue since finding IDs survive it):
 *   OtterSec  — "OS-XXX-ADV-NN"/"OS-XXX-SUG-NN" IDs; prose states
 *               "produced N findings". No standard severity taxonomy → counts null.
 *   Veridise  — "V-XXXX-VUL-NNN" IDs; prose states "uncovered N issues".
 *   Certora   — findings-table rows "M-01 <title> Medium Fixed" — per-row
 *               severity word must agree with the ID prefix letter.
 *   Code4rena — tier headings "HighRiskFindings(N)" must equal the
 *               enumerated "[H-NN]" IDs per tier.
 *   Hacken    — "F-YYYY-NNNNN" IDs; a "Findings N" stat line.
 */

export interface FindingsExtract {
	findingsTotal: number;
	/** Per-severity counts when the format carries them; null otherwise. */
	severityCounts: Record<string, number> | null;
}

const PREFIX_SEVERITY: Record<string, string> = {
	C: "critical",
	H: "high",
	M: "medium",
	L: "low",
	I: "informational",
};

function uniq(matches: Iterable<string>): string[] {
	return [...new Set([...matches].map((m) => m.toUpperCase()))];
}

function ottersec(md: string): FindingsExtract | null {
	const ids = uniq(
		(md.match(/OS-[A-Z]{2,5}-(?:ADV|SUG)-\d{2}/g) ?? []).values(),
	);
	const stated = md.match(/produced\s+(\d+)\s+findings/i);
	if (!ids.length || !stated) return null;
	if (Number(stated[1]) !== ids.length) return null;
	return { findingsTotal: ids.length, severityCounts: null };
}

function veridise(md: string): FindingsExtract | null {
	const ids = uniq((md.match(/V-[A-Z0-9]{2,8}-VUL-\d{3}/gi) ?? []).values());
	const stated = md.match(/uncovered\s+(\d+)\s+issues/i);
	if (!ids.length || !stated) return null;
	if (Number(stated[1]) !== ids.length) return null;
	return { findingsTotal: ids.length, severityCounts: null };
}

function certora(md: string): FindingsExtract | null {
	// Two independent views of the same finding set, cross-checked against
	// each other — this grammar had NO round-trip, so it silently published
	// whatever subset its regex happened to match. Blend v2 (report 40) shipped
	// as 6 findings {high:1, medium:2, low:3} when the report enumerates 10:
	// H-01/H-02, M-01/M-02, L-01..L-03, I-01..I-03. It lost H-01 because PDF
	// reflow wrapped that row's severity word onto the next line, and lost every
	// Informational because the table writes "Info", not "Informational".
	//
	//   contents — "H-01. The protocol is vulnerable to ...........  7"
	//   table    — "H-02 Users can create nearly unfillable auctions High Fixed"
	//
	// Severity comes from the ID prefix (the report's own scheme). The table is
	// the corroboration: every listed finding must appear in it, and any
	// severity word it does carry must agree. Disagreement means we are reading
	// prose rather than the report's structure -> null, never a subset.
	const contents = new Set(
		[...md.matchAll(/^\s*([CHMLI])-(\d{2})\./gim)].map(
			(m) => `${m[1].toUpperCase()}-${m[2]}`,
		),
	);

	const SEVERITY_WORD = /\b(Critical|High|Medium|Low|Informational|Info)\b/i;
	const inTable = new Set<string>();
	for (const m of md.matchAll(/^\s*([CHMLI])-(\d{2})\b([^\n]*)$/gim)) {
		const id = `${m[1].toUpperCase()}-${m[2]}`;
		const rest = m[3] ?? "";
		// The contents line ends in a dot-leader + page number; the table row
		// does not. Skip the contents view here so the two stay independent.
		if (/\.{4,}/.test(rest)) continue;
		inTable.add(id);
		const word = rest.match(SEVERITY_WORD)?.[1]?.toLowerCase();
		if (!word) continue;
		const sev = word === "info" ? "informational" : word;
		if (PREFIX_SEVERITY[m[1].toUpperCase()] !== sev) return null;
	}
	// The contents list is authoritative when the report has one, since PDF
	// reflow can break a single table row's line start (Blend v2's H-01) and
	// demanding perfect table fidelity would discard a report we can read
	// correctly. The round-trip then runs table -> contents: the table must
	// introduce NO finding the contents never listed, and the two must overlap
	// enough to prove we found the table rather than stray prose. An excerpt
	// with no contents list falls back to the table alone, where the
	// prefix<->severity agreement checked above is the only guarantee.
	const enumerated = contents.size >= 2 ? contents : inTable;
	if (contents.size >= 2) {
		for (const id of inTable) if (!contents.has(id)) return null;
		const overlap = [...inTable].filter((id) => contents.has(id)).length;
		if (overlap < Math.ceil(contents.size / 2)) return null;
	}
	if (enumerated.size < 2) return null;

	const severityCounts: Record<string, number> = {};
	for (const id of enumerated) {
		const sev = PREFIX_SEVERITY[id[0]];
		severityCounts[sev] = (severityCounts[sev] ?? 0) + 1;
	}
	return { findingsTotal: enumerated.size, severityCounts };
}

function code4rena(md: string): FindingsExtract | null {
	// Tier headings carry counts ("HighRiskFindings(1)", possibly spaced);
	// each must equal the distinct enumerated "[H-NN]" IDs of that tier.
	// QA/low sections are unenumerated in these reports and stay uncounted.
	const tiers = [
		...md.matchAll(/(Critical|High|Medium)\s*Risk\s*Findings\s*\((\d+)\)/gi),
	];
	if (!tiers.length) return null;
	const ids = uniq((md.match(/\[([CHM])-\d{2}\]/g) ?? []).values());
	const severityCounts: Record<string, number> = {};
	let total = 0;
	for (const t of tiers) {
		const sev = t[1].toLowerCase();
		const stated = Number(t[2]);
		const prefix = sev[0].toUpperCase();
		const tierIds = ids.filter((i) => i.startsWith(`[${prefix}-`));
		if (tierIds.length !== stated) return null;
		severityCounts[sev] = stated;
		total += stated;
	}
	if (total === 0) return null;
	return { findingsTotal: total, severityCounts };
}

function hacken(md: string): FindingsExtract | null {
	const ids = uniq((md.match(/F-\d{4}-\d{4,6}/g) ?? []).values());
	const stated = md.match(/Findings\s+(\d+)\b/);
	if (!ids.length || !stated) return null;
	if (Number(stated[1]) !== ids.length) return null;
	return { findingsTotal: ids.length, severityCounts: null };
}

const PARSERS: Record<string, (md: string) => FindingsExtract | null> = {
	OtterSec: ottersec,
	Veridise: veridise,
	Certora: certora,
	Code4rena: code4rena,
	Hacken: hacken,
};

/**
 * Extract findings counts for a report, or null when the auditor has no
 * verified grammar or the report fails its round-trip. `auditor` is the
 * CANONICAL name (post canonicalAuditor()).
 */
export function extractFindings(
	auditor: string,
	md: string,
): FindingsExtract | null {
	const parse = PARSERS[auditor];
	if (!parse) return null;
	try {
		return parse(md);
	} catch {
		return null;
	}
}
