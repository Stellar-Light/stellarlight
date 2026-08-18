/**
 * The project status vocabulary, in ONE place, with the two tiers that
 * every query in the codebase actually means when it filters by status.
 *
 * Why this exists: the list was hand-copied into ~25 files, and the project
 * DETAIL route's copy omitted "Inactive" — so all 96 archived projects
 * 404'd, and marking Keybase Inactive deleted its page overnight. A status we
 * can WRITE must be a status the page can RENDER. `project-status.test.ts`
 * holds that line against the collection's own option list.
 *
 *   ACTIVE   — shown, ranked, listed: directory, home, leaderboard, feeds
 *   RESOLVABLE — has a public page: everything a reader may hold a link to,
 *              including archived projects (with the archived badge)
 *
 * "Draft" is admin-only and appears in neither.
 */

export const PROJECT_STATUSES = [
	"Draft",
	"Development",
	"Pre-Release",
	"Live",
	"Inactive",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Listed and ranked on discovery surfaces. */
export const ACTIVE_PROJECT_STATUSES = [
	"Development",
	"Pre-Release",
	"Live",
] as const satisfies readonly ProjectStatus[];

/** Reachable at /project/{slug}. Superset of ACTIVE. */
export const RESOLVABLE_PROJECT_STATUSES = [
	...ACTIVE_PROJECT_STATUSES,
	"Inactive",
] as const satisfies readonly ProjectStatus[];

/** Never public. */
export const HIDDEN_PROJECT_STATUSES = [
	"Draft",
] as const satisfies readonly ProjectStatus[];
