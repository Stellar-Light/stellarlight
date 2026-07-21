/**
 * Ecosystem-gaps computation for GET /api/analyze?dimension=gaps.
 *
 * The Scout-skill question is "where's the whitespace / what should I build?".
 * This derives an HONEST supply-side answer from the active directory: which
 * product verticals are thin on BUILT projects and thin on PROVEN (Live) ones.
 *
 * Deliberately NOT prescriptive. A thin vertical can be under-served OR simply
 * low-demand — this measures what EXISTS, not market demand, and says so. Three
 * transparent gap kinds, each a plain fact a consumer can re-derive:
 *   - unproven:   built but nothing shipped (total > 0, live === 0)
 *   - underbuilt: very few projects (total ≤ UNDERBUILT_MAX)
 *   - absent:     a canonical vertical with zero active projects
 *
 * Pure + unit-tested; the route selects the fields and calls this.
 */

/** The minimal per-project shape the tally reads. */
export interface GapProject {
	types?: string[] | null;
	status?: string | null;
	scf?: { awarded?: boolean } | null;
	hackathonPlacement?: string | null;
}

export interface TypeCoverage {
	type: string;
	total: number;
	live: number;
	/** Active-but-not-yet-Live (Development / Pre-Release). */
	inProgress: number;
	scfFunded: number;
	hackathonWinners: number;
}

export interface EcosystemGaps {
	scope: string;
	basis: string;
	/** Every vertical (incl. absent ones) with its coverage, thinnest first. */
	byType: TypeCoverage[];
	/** The honest gap signals — each a bare fact, ranked thinnest-first. */
	signals: {
		unproven: string[];
		underbuilt: string[];
		absent: string[];
	};
	thresholds: { underbuiltMax: number };
}

const WINNER_PLACEMENTS = new Set([
	"grand-prize",
	"1st",
	"2nd",
	"3rd",
	"track-winner",
]);

/** total ≤ this counts a vertical as underbuilt. Absolute (not a quantile) so
 *  the signal is stable and re-derivable, not a moving relative bar. */
export const UNDERBUILT_MAX = 3;

/**
 * Compute the gaps view over the active-project population.
 * @param projects active directory projects (status already scoped by caller)
 * @param verticals the canonical buildable-vertical universe (so zero-project
 *   verticals surface as `absent` instead of being invisible)
 */
export function computeEcosystemGaps(
	projects: GapProject[],
	verticals: readonly string[],
): EcosystemGaps {
	const tally = new Map<string, TypeCoverage>();
	const ensure = (t: string): TypeCoverage => {
		let c = tally.get(t);
		if (!c) {
			c = {
				type: t,
				total: 0,
				live: 0,
				inProgress: 0,
				scfFunded: 0,
				hackathonWinners: 0,
			};
			tally.set(t, c);
		}
		return c;
	};
	// Seed the canonical verticals at zero so absent ones are present in byType.
	for (const v of verticals) ensure(v);

	for (const p of projects) {
		const types = Array.isArray(p.types) ? p.types : [];
		// A project counts under EACH of its types (types are multi-valued).
		for (const t of types) {
			if (typeof t !== "string" || !t) continue;
			const c = ensure(t);
			c.total += 1;
			if (p.status === "Live") c.live += 1;
			else if (p.status === "Development" || p.status === "Pre-Release")
				c.inProgress += 1;
			if (p.scf?.awarded) c.scfFunded += 1;
			if (p.hackathonPlacement && WINNER_PLACEMENTS.has(p.hackathonPlacement))
				c.hackathonWinners += 1;
		}
	}

	const byType = [...tally.values()].sort(
		(a, b) => a.total - b.total || a.live - b.live || a.type.localeCompare(b.type),
	);

	// Signals restrict to the canonical verticals — a project's stray/legacy
	// type value shouldn't read as an ecosystem gap, and the catch-alls
	// (Infrastructure/SDK/Tooling/Analytics) aren't verticals.
	const vset = new Set(verticals);
	const canonical = byType.filter((c) => vset.has(c.type));
	const unproven = canonical
		.filter((c) => c.total > 0 && c.live === 0)
		.map((c) => c.type);
	const underbuilt = canonical
		.filter((c) => c.total > 0 && c.total <= UNDERBUILT_MAX)
		.map((c) => c.type);
	const absent = canonical.filter((c) => c.total === 0).map((c) => c.type);

	return {
		scope:
			"Active directory projects (status Live / Pre-Release / Development), tallied by product TYPE (the fine vertical taxonomy, not the coarse category). A project counts under EACH of its types.",
		basis:
			"Supply-side COVERAGE of the directory — what exists, NOT market demand. A thin vertical may be genuinely under-served OR simply low-demand; validate demand (real user asks, RFPs) before treating a gap as an opportunity. Signals are restricted to canonical buildable verticals; broad catch-alls (Infrastructure/SDK/Tooling/Analytics) are excluded. `absent` = a canonical vertical with zero active projects in OUR directory (coverage, not proof none exists). Counts are as-of the response.",
		byType,
		signals: { unproven, underbuilt, absent },
		thresholds: { underbuiltMax: UNDERBUILT_MAX },
	};
}
