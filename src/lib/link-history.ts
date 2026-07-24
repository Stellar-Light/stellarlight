/** Per-URL link-check history: how one run advances the stored streaks.
 *
 * Extracted from scripts/check-links.ts (which applies it) for the same reason
 * curation-maps.ts was extracted from curate-projects.ts — that script runs
 * `main()` in its module body, so importing it from a test would connect to the
 * DB and exit the process. The logic here is pure: no fetch, no Payload, no
 * clock of its own.
 *
 * Two streaks, because a link fails two different ways (lessons class 32, see
 * ./probe-external.ts):
 *   - `error`   — PROVEN broken (404/410, host doesn't resolve, connection
 *     refused). Counts as a failure on the first run.
 *   - `blocked` — NO verdict reached (bot wall, 5xx, timeout, bad certificate).
 *     Never a failure: a single such run proves nothing. But a URL nobody has
 *     been able to verify for UNVERIFIABLE_RUNS_TO_ESCALATE consecutive runs
 *     IS a finding — that is `needsReview` — because otherwise a permanently
 *     sick origin sits at "blocked" forever and quietly leaves the dashboard.
 */

export type LinkStatus = "ok" | "redirect" | "blocked" | "error";

/** Consecutive no-verdict runs before a URL escalates to `needsReview`. The
 * cron is daily, so 3 ≈ "three days of not knowing". */
export const UNVERIFIABLE_RUNS_TO_ESCALATE = 3;

/** Prior stored state for one URL (only the history fields matter here). */
export type LinkHistory = {
	status: LinkStatus;
	consecutiveFailures?: number | null;
	firstFailedAt?: string | null;
	lastSuccessAt?: string | null;
	consecutiveUnverifiable?: number | null;
	firstUnverifiableAt?: string | null;
};

export type NextLinkHistory = {
	consecutiveFailures: number;
	firstFailedAt: string | null;
	lastSuccessAt: string | null;
	consecutiveUnverifiable: number;
	firstUnverifiableAt: string | null;
	needsReview: boolean;
};

/** Advance both histories by one run.
 *
 * Any run that reaches a verdict (ok/redirect/error) clears the unverifiable
 * streak; any non-error run clears the failure streak. `now` is injected so
 * callers — and tests — control the clock.
 */
export function nextLinkHistory(
	prev: LinkHistory | undefined,
	status: LinkStatus,
	now: Date,
	escalateAfter: number = UNVERIFIABLE_RUNS_TO_ESCALATE,
): NextLinkHistory {
	const iso = now.toISOString();

	const isFailingNow = status === "error";
	const wasFailing = prev && prev.status !== "ok";
	const consecutiveFailures = isFailingNow
		? (prev?.consecutiveFailures ?? 0) + 1
		: 0;
	const firstFailedAt = isFailingNow
		? wasFailing
			? (prev?.firstFailedAt ?? iso)
			: iso
		: null;
	const lastSuccessAt = status === "ok" ? iso : (prev?.lastSuccessAt ?? null);

	const isUnverifiableNow = status === "blocked";
	const priorUnverifiable = prev?.consecutiveUnverifiable ?? 0;
	const consecutiveUnverifiable = isUnverifiableNow ? priorUnverifiable + 1 : 0;
	const firstUnverifiableAt = isUnverifiableNow
		? priorUnverifiable > 0
			? (prev?.firstUnverifiableAt ?? iso)
			: iso
		: null;

	return {
		consecutiveFailures,
		firstFailedAt,
		lastSuccessAt,
		consecutiveUnverifiable,
		firstUnverifiableAt,
		needsReview: consecutiveUnverifiable >= escalateAfter,
	};
}
