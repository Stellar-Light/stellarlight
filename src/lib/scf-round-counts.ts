/**
 * SCF round-level count check (sls-111): awards per round in our directory
 * versus the SCF site. Pure logic, no I/O; the CLI that reads both sides is
 * scripts/eval/scf-round-counts.ts.
 *
 * SCF side: the awardee listing (communityfund.stellar.org/backend/projects,
 * the list enrich-from-scf reads) gives each page's LAST awarded round, one
 * count per distinct page. For the latest numbered round that is the round's
 * awardee count; for an earlier round it is a floor, because a project
 * awarded again later shows only its later round. Our side: awarded rows
 * whose scfAwardedRounds hold the round.
 *
 * Per round: agrees, short (ours below SCF), over (ours above SCF where the
 * count is exact: the latest round, and any later round we alone claim,
 * where SCF has none) or unconfirmed (ours above the floor of an earlier
 * round: the listing cannot tell a re-awarded project from a false round;
 * scf-crosscheck's roundsOverstated tests those against each page). Status:
 * mismatch when any round is short or over, else match.
 *
 * could-not-check, never a count, when a side was not read in full: an
 * empty side, a row it cannot read (a slug or round that is not one, a page
 * listed twice with two rounds), a listing of exactly 500 rows (the page cap
 * SCF served until 2026-10), or a listing that lacks a page one of our rows
 * cites for the latest round. The listing carries no total, so that witness
 * is how a cut listing shows.
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
	verdict: "agrees" | "short" | "over" | "unconfirmed";
	/** For a short or over round: SCF pages last awarded in it that no row
	 *  claiming the round cites as its scfSourceUrl. */
	uncited: string[];
}

export type RoundCountReport =
	| { status: "could-not-check"; reason: string }
	| {
			status: "match" | "mismatch";
			latest: number;
			rounds: RoundCount[];
			/** Awarded rows with no rounds and no SCF page cited: nobody read
			 *  their rounds, so they count in no round. A row with no rounds
			 *  that cites a page read it (an award SCF does not number). */
			roundsUnread: number;
			/** Listed pages whose last round is 0, which names no award: in no
			 *  round, and named rather than dropped. */
			roundZero: string[];
	  };

const PAGE = "https://communityfund.stellar.org/project/";

export function compareRoundCounts(
	listing: ScfListingRow[] | null,
	ours: OurAwardedRow[] | null,
): RoundCountReport {
	const cannot = (reason: string): RoundCountReport => ({
		status: "could-not-check",
		reason,
	});
	if (!listing?.length) return cannot("SCF listing unread or empty");
	if (listing.length === 500)
		return cannot("SCF listing returned exactly 500 rows, its old page cap");
	if (!ours?.length) return cannot("our awarded rows were not read in full");
	const lastBySlug = new Map<string, number>();
	for (const p of listing) {
		const slug = p.slug;
		const r = p.lastAwardedRound;
		if (typeof slug !== "string" || !slug || !Number.isInteger(r))
			return cannot(
				`SCF listing row unreadable: slug ${JSON.stringify(slug)}, lastAwardedRound ${JSON.stringify(r)}`,
			);
		const prev = lastBySlug.get(slug);
		if (prev !== undefined && prev !== r)
			return cannot(`SCF listing gives ${slug} two rounds: ${prev} and ${r}`);
		lastBySlug.set(slug, r as number);
	}
	const pagesByRound = new Map<number, string[]>();
	const roundZero: string[] = [];
	for (const [slug, r] of lastBySlug) {
		// a negative code is an award SCF does not number
		if (r > 0) pagesByRound.set(r, [...(pagesByRound.get(r) ?? []), slug]);
		else if (r === 0) roundZero.push(slug);
	}
	if (pagesByRound.size === 0)
		return cannot("SCF listing carries no numbered round");
	const latest = Math.max(...pagesByRound.keys());
	const roundsOf = (r: OurAwardedRow) =>
		Array.isArray(r.scfAwardedRounds) ? r.scfAwardedRounds.map(Number) : null;
	const pageOf = (r: OurAwardedRow) =>
		typeof r.scfSourceUrl === "string" && r.scfSourceUrl.startsWith(PAGE)
			? r.scfSourceUrl.slice(PAGE.length)
			: null;
	const missing = ours
		.filter((r) => roundsOf(r)?.includes(latest))
		.map(pageOf)
		.filter((s): s is string => s !== null && !lastBySlug.has(s));
	if (missing.length)
		return cannot(
			`SCF listing lacks ${missing.length} page(s) our rows cite for #${latest}: ${missing.join(", ")}`,
		);
	// Rounds only we claim count too: past the latest round SCF has none (an
	// exact 0); before it, the listing's floor there is 0.
	for (const r of ours)
		for (const round of roundsOf(r) ?? [])
			if (Number.isInteger(round) && round > 0 && !pagesByRound.has(round))
				pagesByRound.set(round, []);
	const rounds = [...pagesByRound.entries()]
		.sort(([a], [b]) => b - a)
		.map(([round, pages]): RoundCount => {
			const claiming = ours.filter((r) => roundsOf(r)?.includes(round));
			const exact = round >= latest;
			const n = claiming.length;
			const verdict =
				n === pages.length
					? "agrees"
					: n < pages.length
						? "short"
						: exact
							? "over"
							: "unconfirmed";
			const cited = new Set(claiming.map(pageOf));
			return {
				round,
				exact,
				scf: pages.length,
				ours: n,
				verdict,
				uncited:
					verdict === "short" || verdict === "over"
						? pages.filter((s) => !cited.has(s))
						: [],
			};
		});
	return {
		status: rounds.some((r) => r.verdict === "short" || r.verdict === "over")
			? "mismatch"
			: "match",
		latest,
		rounds,
		roundsUnread: ours.filter((r) => !roundsOf(r)?.length && pageOf(r) === null)
			.length,
		roundZero,
	};
}
