/**
 * Task lanes — the four tracks that were run by hand on 2026-09-14 (knowledge
 * note waves, Stage-2 end-state claims, verification packets, gap-matrix
 * curation), on the repair lane's skeleton: pick ONE bounded unit from
 * committed artifacts or the public API, hand it to a headless agent in a
 * checkout that holds no production secrets (packets need no agent — the
 * evidence script is mechanical), guard the diff against the task's ALLOWED
 * file set, open a PR, record the attempt, read it back. A human merges.
 *
 * Pure half. The impure half is scripts/lanes/task-lane.ts (fetches, files,
 * git) and .github/workflows/task-lane.yml (the agent, the PR).
 */
import { PROTECTED_PATHS } from "./repair-lane";

export type TaskId = "notes" | "claims" | "packets" | "gap";
export const TASK_IDS: TaskId[] = ["notes", "claims", "packets", "gap"];

export interface TaskAttempt {
	task: TaskId;
	/** The unit: notes-<date>, <lane id>, packets-<date>, sourced | typed. */
	unit: string;
	/** What the unit covered — repos, a lane, slugs — so a re-pick can skip them. */
	items: string[];
	date: string;
	run: string;
	outcome: "fixed" | "skip" | "blocked" | "error";
	pr: string | null;
	costUsd: number | null;
	note: string;
}

/** One cron per task; the workflow maps github.event.schedule back to the task. */
export const TASK_CRON: Record<TaskId, string> = {
	notes: "17 9 * * 2",
	claims: "17 9 * * 3",
	packets: "17 9 * * 4",
	gap: "17 9 * * 5",
};
export function taskForSchedule(cron: string): TaskId | null {
	return TASK_IDS.find((t) => TASK_CRON[t] === cron) ?? null;
}

/** What each task may write. A diff outside the set turns the run into
 *  `blocked` — the human gates stay human by construction. `claims` is the
 *  only task allowed into .github/workflows/, and only into the ONE lane it
 *  was handed. A trailing slash means "anything under". */
export const TASK_ALLOWED_PATHS: Record<TaskId, (unit: string) => string[]> = {
	notes: () => ["src/lib/repo-knowledge.ts"],
	claims: (lane) => [
		`.github/workflows/${lane}.yml`,
		"scripts/",
		"src/lib/utils/read-back.ts",
	],
	packets: () => ["improvements/quality/"],
	gap: () => ["scripts/data/curation-maps.ts"],
};
export function isAllowedPath(task: TaskId, unit: string, p: string): boolean {
	return TASK_ALLOWED_PATHS[task](unit).some(
		(a) => p === a || (a.endsWith("/") && p.startsWith(a)),
	);
}

/** A unit (or an item inside one) is left alone this long after an attempt:
 *  a PR still open, a skip that still stands, a blocked path a human has not
 *  moved. Merged work leaves the pool by itself (the key exists, the lane is
 *  promoted, the slug is stamped). */
export const TASK_RETRY_AFTER_DAYS = 30;

export function recentlyAttempted(
	attempts: TaskAttempt[],
	task: TaskId,
	key: string,
	now = new Date(),
): boolean {
	const cutoff = new Date(now.getTime() - TASK_RETRY_AFTER_DAYS * 86_400_000)
		.toISOString()
		.slice(0, 10);
	return attempts.some(
		(a) =>
			a.task === task &&
			a.outcome !== "error" && // an infra failure is not an attempt on the unit
			a.date >= cutoff &&
			(a.unit === key || a.items.includes(key)),
	);
}

// ── pickers (pure over already-fetched data) ─────────────────────────────

export interface RepoLite {
	fullName: string;
	repoScore?: number;
}

/** notes: curated-pool repos with no registry entry at all, best first. */
export function pickNotes(
	pool: RepoLite[],
	registryKeysLower: Set<string>,
	attempts: TaskAttempt[],
	limit = 25,
	now = new Date(),
): RepoLite[] {
	return pool
		.filter((r) => !registryKeysLower.has(r.fullName.toLowerCase()))
		.filter((r) => !recentlyAttempted(attempts, "notes", r.fullName, now))
		.sort(
			(a, b) =>
				(b.repoScore ?? 0) - (a.repoScore ?? 0) ||
				a.fullName.localeCompare(b.fullName),
		)
		.slice(0, limit);
}

export interface AuditLane {
	id: string;
	stage?: string | number;
	interventionFreeWeeks?: number;
}
export interface RegisteredLane {
	id: string;
	endStateClaim?: string | null;
}

/** claims: ONE lane the autonomy audit calls eligible-for-2 whose lanes.json
 *  entry carries no end-state claim yet; the longest clean streak first. */
export function pickClaimLane(
	audit: AuditLane[],
	registry: RegisteredLane[],
	attempts: TaskAttempt[],
	now = new Date(),
): AuditLane | null {
	const claimed = new Set(
		registry.filter((l) => l.endStateClaim).map((l) => l.id),
	);
	const eligible = audit
		.filter((l) => String(l.stage) === "eligible-for-2")
		.filter((l) => !claimed.has(l.id))
		.filter((l) => !recentlyAttempted(attempts, "claims", l.id, now))
		.sort(
			(a, b) =>
				(b.interventionFreeWeeks ?? 0) - (a.interventionFreeWeeks ?? 0) ||
				a.id.localeCompare(b.id),
		);
	return eligible[0] ?? null;
}

export interface GapRow {
	entity: string;
	field: string;
	missing?: number;
	of?: number;
	closedBy?: string;
	examples?: string[];
}

/** The gap-matrix rows a curation entry closes (scripts/data/curation-maps.ts).
 *  The others close by a lane (scan, enrich) or by a human with a receipt. */
export const GAP_CURATION_FIELDS = ["sourced", "typed"] as const;

/** gap: the first curatable row that still has un-attempted examples. */
export function pickGap(
	rows: GapRow[],
	attempts: TaskAttempt[],
	now = new Date(),
): { field: string; examples: string[]; missing: number; of: number } | null {
	for (const field of GAP_CURATION_FIELDS) {
		const row = rows.find((r) => r.entity === "project" && r.field === field);
		const examples = (row?.examples ?? []).filter(
			(s) => !recentlyAttempted(attempts, "gap", s, now),
		);
		if (examples.length)
			return { field, examples, missing: row?.missing ?? 0, of: row?.of ?? 0 };
	}
	return null;
}

// ── prompts ──────────────────────────────────────────────────────────────

function rules(task: TaskId, unit: string, branch: string, date: string) {
	return `You are a task lane of Stellar Light (stellarlight.xyz), running unattended in CI on branch ${branch} (${date}). You do ONE bounded unit of work and open no PR yourself — the workflow opens it from what you commit, and a human merges. Nothing here can reach production: this environment holds no database secrets; never run a script with --execute, never git push, never merge, and use gh ONLY for read-only \`gh api\` GETs.

YOU MAY EDIT ONLY: ${TASK_ALLOWED_PATHS[task](unit).join(", ")}. A diff outside that set blocks the PR. Never touch ${PROTECTED_PATHS.join(", ")} beyond what that set names.

GATES before you commit: npx biome check --write <the files you touched>; npx tsc --noEmit -p tsconfig.json; if you touched scripts/: npx tsc -p tsconfig.scripts.json --noEmit 2>&1 | grep -c "error TS" must not exceed its count before your change; npx vitest run on the test files nearest what you touched. A gate you cannot pass honestly means outcome "skip" with the reason — stop there.

WHAT YOU LEAVE BEHIND: one git commit in the repo's style (type(scope): what and why; body ends with "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"); .repair/pr-body.md (what / evidence / proof / what a human still decides — plain prose, numbers over adjectives); .repair/verdict.json {"outcome": "fixed" | "skip" | "blocked", "summary": "<one line>"}. No memory files, no docs, no QUALITY.md. When done, stop.`;
}

export function buildTaskPrompt(
	task: TaskId,
	unit: string,
	payload: unknown,
	opts: { branch: string; date: string; workflowsPushable?: boolean },
): string {
	const head = rules(task, unit, opts.branch, opts.date);
	const p = JSON.stringify(payload, null, 1);
	switch (task) {
		case "notes": {
			const n = (payload as RepoLite[]).length;
			return `${head}

THE WORK — knowledge notes for ${n} curated-pool repos that carry none (REPO_KNOWLEDGE_NOTES in src/lib/repo-knowledge.ts). For EACH repo read the facts today and cite only what you read: gh api repos/<owner>/<repo> (archived, pushed_at, stargazers_count, language, license, homepage, description); gh api repos/<owner>/<repo>/releases/latest (404 = no releases); the README head (gh api repos/<owner>/<repo>/readme --jq .content | base64 -d | head -60); the package registry when the README names one (npm registry JSON, crates.io API with a User-Agent, jsr meta.json) — a package counts ONLY if its repository field points back at this repo. Copy the newest "wave" block in the file exactly: one or two sentences of durable public fact, versions with dates, "(README read ${opts.date}; <license>; last push <date>)", source "curated", asOf "${opts.date}", optional triggers of ≥2 distinctive words. A repo with an empty or template README, or nothing Stellar-specific, gets an INTERNAL triage note (visibility "internal") saying why. Never state a fact you did not read. Then run npx vitest run src/lib/__tests__/repo-knowledge.test.ts src/lib/__tests__/knowledge-key-casing.test.ts src/lib/__tests__/repo-relations.test.ts, and pnpm exec tsx scripts/check-note-freshness.ts (GITHUB_TOKEN is set) — quote its summary line for your keys in the PR body; a cited registry ref that reads stale is a note you rewrite before committing.

REPOS (fullName, repoScore):
${p}`;
		}
		case "claims":
			return `${head}

THE WORK — make the lane \`${unit}\` (.github/workflows/${unit}.yml and the script it runs) assert its own end state so it can be promoted to Stage 2 (QUALITY.md §3, "A second condition"). Read the three shipped precedents first: the endStateClaim entries in improvements/lanes/lanes.json for enrich-tvl, scan-repo-code and refresh-research-corpus, and how scripts/scan/scan-repo-code.ts uses verifyWrites from src/lib/utils/read-back.ts (sentById.set(String(doc.id), data) after each payload.update; process.exit(process.exitCode ?? 0) at the end). After the execute pass the lane must read back EVERY row it wrote against the exact payload sent, count what it skipped and why, and exit 2 (could-not-look: no token, upstream down, DB unreachable) distinctly from 1 (a finding). A run that wrote nothing must say so and must not read an empty map back as "verified". Mind scripts/check-writer-conformance.ts (no bare process.exit(0) where process.exitCode is set; steps that pipe through tee need shell: bash) and declare the by-design red step in the workflow header: # workflow-health: signal-steps: ^<Step name>$. Do NOT edit improvements/lanes/lanes.json — put the proposed endStateClaim sentence and the exit-code table in .repair/pr-body.md; promotion is a human decision after the lane's next CI run proves the claim in its own log.

${
	opts.workflowsPushable
		? ""
		: `
THIS RUN CANNOT PUSH WORKFLOW FILES (the token has no workflows permission): do NOT edit .github/workflows/. Put the exact workflow change you would make — the signal-steps header line and any step edit — in .repair/pr-body.md under a "Workflow change for a human" heading, and deliver the read-back and the exit-code split in the script alone.
`
}
LANE (the autonomy audit's row and the registry's row):
${p}`;
		case "gap": {
			const g = payload as { field: string; examples: string[] };
			const how =
				g.field === "typed"
					? `add a TYPE_ADD entry in scripts/data/curation-maps.ts in the file's existing shape, with the row's own description as the evidence quoted in the note; a row whose description supports no type is "skip" for that slug, said in the PR body`
					: `find the dated source the current basis claims — an operator announcement, an on-chain reading, a receipt — with read-only requests (the site, gh api, the Wayback Machine). If found, add a STATUS_FIX entry in scripts/data/curation-maps.ts in the file's existing shape (same status from and to, basis unchanged, asOf = ${opts.date}, sourceUrl, one dated factual sentence as the note). If not found, propose the DOWNGRADE as a STATUS_FIX entry (basis → the strongest thing you observed, dated) and say so in the note. Never claim a verification you did not perform`;
			return `${head}

THE WORK — the gap-matrix row "project / ${g.field}" (improvements/quality/entities.json → gapMatrix.rows; ${(payload as { missing: number }).missing} of ${(payload as { of: number }).of} today). For each slug below, read its current row from the public REST first (curl -sg 'https://stellarlight.xyz/api/projects?where[slug][equals]=<slug>&depth=0'), then ${how}. Gates: npx biome check --write scripts/data/curation-maps.ts; the scripts type count; npx vitest run on the test files that import curation-maps.

SLUGS:
${JSON.stringify(g.examples, null, 1)}`;
		}
		case "packets":
			throw new Error(
				"packets need no agent: scripts/data/verification-packets.ts is the work",
			);
	}
}

export function attemptsAfter(
	attempts: TaskAttempt[],
	a: TaskAttempt,
): TaskAttempt[] {
	return [
		...attempts.filter(
			(x) => !(x.task === a.task && x.unit === a.unit && x.run === a.run),
		),
		a,
	];
}
