/**
 * Query helpers over the committed SDF team/people index (src/data/sdf-people.ts).
 *
 * This is a PEOPLE/ORG reference index — the SDF leadership, board of
 * directors, and advisors roster from stellar.org/foundation/team. It is
 * deliberately distinct from /api/builders (GitHub-contributor profiles from
 * Stellar Passport): a VP of Ecosystem or a board member is not a "builder",
 * and conflating the two is exactly the miss this index closes. Kept as a pure
 * module over committed data so both the /api/people route and the /api/builders
 * person-lookup cross-link share one matcher (and it's unit-testable).
 */
import {
	SDF_PEOPLE,
	SDF_PEOPLE_OBSERVED_AT,
	SDF_PEOPLE_SOURCE,
	type SdfPerson,
} from "@/data/sdf-people";

export interface PersonResult extends SdfPerson {
	/** The roster page each row is quoted from. */
	sourceUrl: string;
	/** Date the roster was last observed from the source (YYYY-MM-DD). */
	observedAt: string;
}

export const PEOPLE_SOURCE = SDF_PEOPLE_SOURCE;
export const PEOPLE_OBSERVED_AT = SDF_PEOPLE_OBSERVED_AT;

function decorate(p: SdfPerson): PersonResult {
	return {
		...p,
		sourceUrl: SDF_PEOPLE_SOURCE,
		observedAt: SDF_PEOPLE_OBSERVED_AT,
	};
}

// Section filter aliases — a caller naturally types "board" or "advisor".
const SECTION_ALIASES: Record<string, string> = {
	leadership: "Leadership",
	lead: "Leadership",
	team: "Leadership",
	board: "Board of directors",
	"board of directors": "Board of directors",
	director: "Board of directors",
	directors: "Board of directors",
	advisor: "Advisors",
	advisors: "Advisors",
	advisory: "Advisors",
};

/** Canonical section name for a raw filter value, or null if unrecognized. */
export function normalizeSection(
	raw: string | null | undefined,
): string | null {
	if (!raw) return null;
	return SECTION_ALIASES[raw.trim().toLowerCase()] ?? null;
}

/** The distinct section names present in the index, in first-seen order. */
export function sectionsAvailable(): string[] {
	const seen: string[] = [];
	for (const p of SDF_PEOPLE)
		if (!seen.includes(p.section)) seen.push(p.section);
	return seen;
}

/**
 * Accent-fold for name matching (real-demand fix 2026-07-21): the roster
 * stores "David Mazières" but consumers type "mazieres" — 3 real asks hit
 * EMPTY while the accented form matched. Fold BOTH sides (NFD strip) so
 * either spelling resolves.
 */
function fold(s: string): string {
	return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function tokens(q: string): string[] {
	return fold(q).split(/\s+/).filter(Boolean);
}

/**
 * Search the roster. A person matches when EVERY query token appears in their
 * name, role, or org (substring, case-insensitive) — so "justin rice", "rice",
 * "vp ecosystem", and "openai" all resolve. Optional `section` narrows to
 * Leadership / Board of directors / Advisors. Results preserve roster order
 * (leadership first) so a browse is stable.
 */
export function searchPeople(
	q: string | null | undefined,
	opts: { section?: string | null; limit?: number; offset?: number } = {},
): { people: PersonResult[]; total: number } {
	const section = normalizeSection(opts.section);
	let rows = SDF_PEOPLE;
	if (section) rows = rows.filter((p) => p.section === section);
	const toks = q ? tokens(q) : [];
	if (toks.length) {
		rows = rows.filter((p) => {
			const hay = fold(`${p.name} ${p.role} ${p.org}`);
			return toks.every((t) => hay.includes(t));
		});
	}
	const total = rows.length;
	const offset = Math.max(opts.offset ?? 0, 0);
	const limit = opts.limit ?? rows.length;
	return {
		people: rows.slice(offset, offset + limit).map(decorate),
		total,
	};
}

/**
 * Name-first lookup for the /api/builders cross-link: a person matches when
 * every query token appears in their NAME (not role/org), so "justin rice"
 * resolves to Justin Rice but a skill word like "payments" does not pull in
 * anyone. Dedupes people who appear under more than one section (e.g. a founder
 * who is also on the board) to the first occurrence.
 */
export function findPeopleByName(name: string): PersonResult[] {
	const toks = tokens(name);
	if (!toks.length) return [];
	const out: PersonResult[] = [];
	const seen = new Set<string>();
	for (const p of SDF_PEOPLE) {
		const n = fold(p.name);
		if (toks.every((t) => n.includes(t)) && !seen.has(p.name)) {
			seen.add(p.name);
			out.push(decorate(p));
		}
	}
	return out;
}
