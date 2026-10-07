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

/**
 * WHAT KIND OF EVIDENCE stands behind a project's status — the same
 * hand-copied-into-many-files problem as the statuses above, and it has already
 * cost once: "official-record" sat on the quality board's strong list while
 * being a value of `scf.basis` that no status row could ever hold, so the
 * board's own definition named a tier serving 0 and omitted two tiers rows did
 * hold (2026-09-05). One list, imported.
 */
export const STATUS_BASES = [
	"operator-announcement",
	"site-liveness",
	"repo-activity",
	"package-release",
	"product-integration",
	"onchain-activity",
	"human-verified",
	"source-inherited",
	"unverified",
] as const;

export type StatusBasis = (typeof STATUS_BASES)[number];

/**
 * Bases that count as EARNED: dated evidence about the product itself, not a
 * page that answered and not a label inherited from a seed source.
 *
 * `package-release` joined on 2026-09-08. A registry-verified package is
 * distinct from `repo-activity` and stronger for a library: repo-activity says
 * the SOURCE moved, this says a versioned ARTIFACT shipped to a registry that
 * names this repo as its origin — the backlink npm and jsr.io serve, which
 * cannot be produced without controlling both the repo and the namespace.
 * Reusing repo-activity for it would make the basis label lie about its own
 * evidence, which is the one thing this field exists to prevent.
 *
 * It is awarded only with a RECENT publish. Of 16 weak-basis Live rows whose
 * repo publishes a verified package, 6 last published more than a year ago —
 * one in 2021 — and a 2021 artifact is not evidence a product is live now.
 */
export const STRONG_STATUS_BASES = [
	"human-verified",
	"onchain-activity",
	"product-integration",
	"repo-activity",
	"package-release",
] as const satisfies readonly StatusBasis[];

export const isStrongStatusBasis = (b: string | null | undefined): boolean =>
	!!b && (STRONG_STATUS_BASES as readonly string[]).includes(b);
