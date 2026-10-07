/**
 * Repo triage tags — the structured labeling layer over the long tail.
 *
 * knowledgeNotes(internal) hold prose judgments; triage tags are the
 * MACHINE-READABLE version: a controlled vocabulary derived from signals we
 * already store, so "which of the ~12k repos merit a deep code scan / any
 * surfacing" is a queryable label, not a re-litigated argument. The
 * labeling loop is propose-then-confirm: derivation proposes from signals
 * each enrich pass; curator lanes (phases 2/4) add human-confirmed tags
 * later. Tags are INTERNAL — never served to unauthenticated readers
 * (collection afterRead hook) — because they're triage verdicts about
 * someone's repo, not published facts. Public surfaces express the same
 * reality neutrally via tier + activityState.
 *
 * DISCIPLINE: every tag must be derivable from stored signals or curated
 * with evidence. No LLM vibes. Allowlisted canonical repos are never
 * tagged (soroban-examples is a "template" by name and canon by fact).
 */

import { isAllowlisted } from "./repo-allowlist";

export const TRIAGE_TAGS = [
	/** Hackathon-judged/placed repo with no commits for 12+ months. */
	"dead-hackathon-project",
	/** farmScore >= 2 — airdrop/metric-farming signal cluster. */
	"farm-signals",
	/** Fork with no stars and no recent activity — mirror, not a project. */
	"inert-fork",
	/** Archived on GitHub by its own maintainers. */
	"archived-upstream",
	/** EC long-tail row: 24+ months stale and effectively unstarred. */
	"dead-long-tail",
	/** Name/description self-describes as tutorial/example/starter/demo,
	 * unlinked to any project and without traction. */
	"tutorial-or-template",
] as const;

export type TriageTag = (typeof TRIAGE_TAGS)[number];

const YEAR_MS = 365 * 86_400_000;
const STALE_MS = 730 * 86_400_000; // ~24 months, mirrors tierOf

export interface TriageSignals {
	fullName: string;
	lastCommitAt?: string | Date | null;
	stars?: number | null;
	isFork?: boolean | null;
	isArchived?: boolean | null;
	farmScore?: number | null;
	judgedHackathon?: string | null;
	hackathonWinner?: boolean | null;
	source?: string | null;
	projectSlug?: string | null;
	description?: string | null;
	name?: string | null;
	commits90d?: number | null;
}

/** Derive triage tags from stored signals. Pure; rebuilt wholesale each
 * enrich pass (self-healing — a repo that comes back to life untags). */
export function deriveTriageTags(s: TriageSignals): TriageTag[] {
	if (isAllowlisted(s.fullName)) return [];
	const tags: TriageTag[] = [];
	const ageMs = s.lastCommitAt
		? Date.now() - new Date(s.lastCommitAt).getTime()
		: Number.POSITIVE_INFINITY;

	if ((s.judgedHackathon || s.hackathonWinner) && ageMs > YEAR_MS)
		tags.push("dead-hackathon-project");
	if ((s.farmScore ?? 0) >= 2) tags.push("farm-signals");
	if (s.isFork && (s.stars ?? 0) <= 1 && (s.commits90d ?? 0) === 0)
		tags.push("inert-fork");
	if (s.isArchived) tags.push("archived-upstream");
	if (s.source === "ec-taxonomy" && ageMs > STALE_MS && (s.stars ?? 0) < 3)
		tags.push("dead-long-tail");
	if (
		!s.projectSlug &&
		(s.stars ?? 0) < 5 &&
		/\b(tutorial|example|examples|starter|template|boilerplate|demo|playground|workshop)\b/i.test(
			`${s.name ?? ""} ${s.description ?? ""}`,
		)
	)
		tags.push("tutorial-or-template");
	return tags;
}
