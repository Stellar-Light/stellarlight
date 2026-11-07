/**
 * sls-113 (#1905): venueRole null means "not yet classified", and the spec
 * tells callers to count independent venues by venueRole, so every Live DEX
 * row with no role is missing from that count without a word. On 2026-11-07
 * that was 26 of 38 rows.
 *
 * Each Live DEX row must end in one recorded state: a cited role (VENUE_ROLE),
 * a type that is not DEX (TYPES_SET), a status that is not Live (STATUS_FIX),
 * or a dated reason it stays null (VENUE_ROLE_UNRESOLVED), all in
 * scripts/data/curation-maps.ts. This returns the rows that have none of
 * them; the nightly record-completeness sweep (S4) files each one.
 *
 * Status and type are checked here as well as in the sweep's query, so a
 * route that stopped honouring either filter cannot pass a row.
 */
export function unclassifiedLiveDexRows<
	T extends {
		slug: string;
		status?: string | null;
		types?: readonly string[] | null;
		venueRole?: string | null;
	},
>(rows: readonly T[], unresolved: Readonly<Record<string, string>>): T[] {
	return rows.filter(
		(r) =>
			r.status === "Live" &&
			!!r.types?.includes("DEX") &&
			!r.venueRole &&
			!(Object.hasOwn(unresolved, r.slug) && unresolved[r.slug].trim()),
	);
}
