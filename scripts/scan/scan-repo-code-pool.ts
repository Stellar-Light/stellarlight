/**
 * Selection-pool helpers for scripts/scan/scan-repo-code.ts, split out so they
 * can be unit-tested without importing the scanner (which opens a DB handle at
 * module load).
 */

/** How many already-scanned rows either selection path pulls before filtering
 *  in memory. */
export const SCANNED_POOL_CAP = 3000;

/** The line to print when a capped fetch may have hidden rows. A silent
 *  truncation is invisible in the run log and looks exactly like "the backlog
 *  is exhausted". */
export function poolWarning(fetched: number, cap: number): string | null {
	return fetched < cap
		? null
		: `WARNING: the scanned pool hit its ${cap}-row cap. Rows beyond it were never considered, so "no eligible repos" below may mean "none in the window", not "none at all". Raise SCANNED_POOL_CAP or narrow --lang.`;
}
