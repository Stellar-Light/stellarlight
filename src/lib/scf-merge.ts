/**
 * Duplicate-merge SCF absorb — pure record logic (no I/O), so it's
 * unit-testable. The CLI wrapper is scripts/data/curate-projects.ts
 * (DUPE_MERGES `copyScf`).
 *
 * When two rows are one project, the award sits on the row the merge parks as
 * a shadow. `copyScf` moves it to the canonical — and used to move THREE of
 * the record's nine fields (awarded / totalAwarded / awardedRounds), stranding
 * the per-round official records and the whole citation trio on a Draft row
 * nothing serves. The canonical then served an award with no source, no basis,
 * no date and no reconciling basis: lulpay after the 2026-09-08 lul→lulpay
 * merge (scfAwarded true, $58,000, rounds [29,38], scfRoundAwards [],
 * scfSourceUrl null) — caught the next night by record-completeness S1.
 *
 * Two rules, both of which the field-by-field copy broke:
 *   1. The record moves WHOLE. Anything the shadow knows about the award and
 *      the canonical does not is part of the award.
 *   2. Fill-if-empty only, and a canonical that already cites an SCF page of
 *      its own absorbs NOTHING — so no row ever ends up citing page A for
 *      page B's awards. Its gaps belong to enrich-from-scf, which reads them
 *      off that row's own page.
 */

export interface ScfRoundAward {
	round?: number | null;
	awardName?: string | null;
	amountUSD?: number | null;
	awardType?: string | null;
	/** Payload array-row id — belongs to the shadow's document, never copied. */
	id?: string | null;
}

/** The projects.scf group (src/collections/Projects.ts), all fields optional. */
export interface ScfRecord {
	awarded?: boolean | null;
	lastAwardedRound?: number | null;
	slug?: string | null;
	totalAwarded?: number | null;
	awardedRounds?: number[] | null;
	roundAwards?: ScfRoundAward[] | null;
	basis?: string | null;
	asOf?: string | null;
	sourceUrl?: string | null;
}

const isEmpty = (v: unknown): boolean =>
	v === null || v === undefined || (Array.isArray(v) && v.length === 0);

const FIELDS = [
	"lastAwardedRound",
	"totalAwarded",
	"awardedRounds",
	"slug",
	"sourceUrl",
	"basis",
	"asOf",
] as const;

/**
 * The canonical's SCF record after absorbing the shadow's, or null when there
 * is nothing to absorb (so an idempotent re-run plans no write).
 * `filled` names the fields that moved — the dry run's only evidence.
 */
export function fillScfFromDupe(
	canon: ScfRecord | null | undefined,
	dupe: ScfRecord | null | undefined,
): { scf: ScfRecord; filled: string[] } | null {
	if (!dupe?.awarded) return null;
	// Rule 2: a canonical that cites an SCF page of its own is not the shadow's
	// award record — one row, one citation. Its gaps are enrich-from-scf's to
	// fill from that page, never this lane's from another.
	if (!isEmpty(canon?.slug) || !isEmpty(canon?.sourceUrl)) return null;
	const out: ScfRecord = { ...(canon ?? {}) };
	const filled: string[] = [];
	const record = out as Record<string, unknown>;

	if (out.awarded !== true) {
		out.awarded = true;
		filled.push("awarded");
	}
	for (const k of FIELDS) {
		if (isEmpty(record[k]) && !isEmpty(dupe[k])) {
			record[k] = dupe[k];
			filled.push(k);
		}
	}
	if (isEmpty(out.roundAwards) && !isEmpty(dupe.roundAwards)) {
		out.roundAwards = (dupe.roundAwards ?? []).map((r) => ({
			round: r.round ?? null,
			awardName: r.awardName ?? null,
			amountUSD: r.amountUSD ?? null,
			awardType: r.awardType ?? null,
		}));
		filled.push("roundAwards");
	}
	return filled.length ? { scf: out, filled } : null;
}
