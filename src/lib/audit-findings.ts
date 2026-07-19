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
	// Findings-table rows: "M-01 Mutable bridge fees ... Medium Fixed".
	// The severity word must agree with the ID's prefix letter — a mismatch
	// means we're reading prose, not the table.
	const rows = md.matchAll(
		/^([CHMLI])-(\d{2})\b[^\n]*?\b(Critical|High|Medium|Low|Informational)\b/gim,
	);
	const byId = new Map<string, string>();
	for (const r of rows) {
		const id = `${r[1].toUpperCase()}-${r[2]}`;
		const sev = r[3].toLowerCase();
		if (PREFIX_SEVERITY[r[1].toUpperCase()] !== sev) return null;
		const prev = byId.get(id);
		if (prev && prev !== sev) return null;
		byId.set(id, sev);
	}
	if (byId.size < 2) return null;
	const severityCounts: Record<string, number> = {};
	for (const sev of byId.values())
		severityCounts[sev] = (severityCounts[sev] ?? 0) + 1;
	return { findingsTotal: byId.size, severityCounts };
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
