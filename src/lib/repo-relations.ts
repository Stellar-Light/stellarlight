/**
 * Curated repo-generation relations (sls-064 analog A, 2026-08-14).
 *
 * Repo families ship successor generations (blend-contracts →
 * blend-contracts-v2) and nothing on either row said so — an agent asking
 * for "blend contracts" got the dormant, superseded generation ranked
 * first. Same class as the audit-report relations: the relation must be
 * SERVED, and never guessed.
 *
 * DISCIPLINE (mirrors AUDIT_RELATIONS): keys are lowercase fullNames of the
 * SUPERSEDED repo; values name the successor exactly as GitHub spells it.
 * Only add pairs verified against the repos' own READMEs/org statements —
 * a name ending in -v2 is a CANDIDATE, never proof. Date every entry.
 * Enrich re-stamps wholesale each pass, so this map is the single truth.
 */
export const REPO_SUCCESSIONS: Record<string, string> = {
	// Verified 2026-08-14: blend-capital/blend-contracts README points to the
	// v2 repo as the live protocol generation; v1 dormant since 2024-05.
	"blend-capital/blend-contracts": "blend-capital/blend-contracts-v2",
};
