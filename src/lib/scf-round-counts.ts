/**
 * SCF round-level count check (sls-111): awards per round in our directory
 * versus the SCF site. Pure logic, no I/O; the CLI that reads both sides is
 * scripts/eval/scf-round-counts.ts.
 *
 * SCF side: the awardee listing (communityfund.stellar.org/backend/projects,
 * the list enrich-from-scf reads) gives each project's LAST awarded round.
 * For the latest numbered round that is the round's awardee count; for an
 * earlier round it is a floor, because a project awarded again later shows
 * only its later round. Our side: awarded rows whose scfAwardedRounds hold
 * the round. A round disagrees when ours is below the SCF floor, or for the
 * latest round when the two differ at all.
 *
 * Three outcomes: match, mismatch, could-not-check. A side that was not read
 * in full is could-not-check, never a count, and so is a listing of exactly
 * 500 rows (the page cap SCF served until 2026-10: every count a floor).
 */

export interface ScfListingRow {
	slug?: unknown;
	lastAwardedRound?: unknown;
}

export interface OurAwardedRow {
	scfAwardedRounds?: unknown;
	scfSourceUrl?: unknown;
}

export interface RoundCount {
	round: number;
	/** true for the latest round (an exact count); false means `scf` is a floor */
	exact: boolean;
	scf: number;
	ours: number;
	disagrees: boolean;
	/** For a disagreeing round: SCF pages last awarded in it that no row
	 *  claiming the round cites as its scfSourceUrl. */
	uncited: string[];
}

export type RoundCountReport =
	| { status: "could-not-check"; reason: string }
	| { status: "match" | "mismatch"; latest: number; rounds: RoundCount[] };

const PAGE = "https://communityfund.stellar.org/project/";

export function compareRoundCounts(
	listing: ScfListingRow[] | null,
	ours: OurAwardedRow[] | null,
): RoundCountReport {
	if (!listing?.length)
		return { status: "could-not-check", reason: "SCF listing unread or empty" };
	if (listing.length === 500)
		return {
			status: "could-not-check",
			reason: "SCF listing returned exactly 500 rows, its old page cap",
		};
	if (!ours?.length)
		return {
			status: "could-not-check",
			reason: "our awarded rows were not read in full",
		};
	const pagesByRound = new Map<number, string[]>();
	for (const p of listing) {
		const r = p.lastAwardedRound;
		// a negative code is an award SCF does not number
		if (typeof r !== "number" || !Number.isInteger(r) || r <= 0) continue;
		pagesByRound.set(r, [...(pagesByRound.get(r) ?? []), String(p.slug)]);
	}
	if (pagesByRound.size === 0)
		return {
			status: "could-not-check",
			reason: "SCF listing carries no numbered round",
		};
	const latest = Math.max(...pagesByRound.keys());
	const rounds = [...pagesByRound.entries()]
		.sort(([a], [b]) => b - a)
		.map(([round, pages]): RoundCount => {
			const claiming = ours.filter(
				(r) =>
					Array.isArray(r.scfAwardedRounds) &&
					r.scfAwardedRounds.map(Number).includes(round),
			);
			const exact = round === latest;
			const disagrees = exact
				? claiming.length !== pages.length
				: claiming.length < pages.length;
			const cited = new Set(claiming.map((r) => String(r.scfSourceUrl)));
			return {
				round,
				exact,
				scf: pages.length,
				ours: claiming.length,
				disagrees,
				uncited: disagrees ? pages.filter((s) => !cited.has(PAGE + s)) : [],
			};
		});
	return {
		status: rounds.some((r) => r.disagrees) ? "mismatch" : "match",
		latest,
		rounds,
	};
}
