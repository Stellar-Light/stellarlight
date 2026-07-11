/**
 * Shared population/scope contract for quantitative endpoints (sls-048).
 *
 * /api/status counts the FULL projects collection, /api/analyze aggregates
 * ACTIVE projects, /api/clusters buckets active projects — three locally
 * plausible totals with no answer-visible way to tell whether they're
 * comparable (sls-042's clusters truncation made the mismatch a live wrong-
 * answer: 500-project clusters vs an 841-project analyze named different
 * funded-share winners). Every quantitative response now carries the same
 * `population` block:
 *
 *   id             — stable digest of collection + filters (NOT count/time).
 *                    Identical ids ⇒ mechanically comparable populations;
 *                    different ids ⇒ different populations, do not merge/sum
 *                    without labeling the scopes.
 *   basis          — the underlying collection.
 *   statusScope    — status filter applied (null = no status filter).
 *   totalAvailable — docs matching the scope in the DB at generation time.
 *   included       — docs actually aggregated into this response.
 *   truncated      — included < totalAvailable (result is a sample, not the
 *                    population — callers must not present it as a census).
 *   generatedAt    — ISO timestamp of the computation.
 */

/** The one canonical "active project" status set — keep every quantitative
 * endpoint on this list so their populations stay comparable. */
export const ACTIVE_PROJECT_STATUSES = [
	"Development",
	"Pre-Release",
	"Live",
] as const;

export interface PopulationScope {
	id: string;
	basis: string;
	statusScope: string[] | null;
	totalAvailable: number;
	included: number;
	truncated: boolean;
	generatedAt: string;
}

export function populationScope(opts: {
	collection: string;
	statusScope?: readonly string[] | null;
	totalAvailable: number;
	included: number;
}): PopulationScope {
	const statuses = opts.statusScope ? [...opts.statusScope].sort() : null;
	return {
		id: `${opts.collection}|status:${statuses ? statuses.join("+") : "all"}`,
		basis: `${opts.collection} collection`,
		statusScope: statuses,
		totalAvailable: opts.totalAvailable,
		included: opts.included,
		truncated: opts.included < opts.totalAvailable,
		generatedAt: new Date().toISOString(),
	};
}
