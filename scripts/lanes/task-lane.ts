/**
 * The task lane's CLI — the impure half of src/lib/task-lanes.ts, called step
 * by step from .github/workflows/task-lane.yml:
 *
 *   pnpm exec tsx scripts/lanes/task-lane.ts task-for "<cron>"          → prints the task a schedule maps to
 *   pnpm exec tsx scripts/lanes/task-lane.ts pick <task>                 → .repair/pick.json (+ prints it)
 *   pnpm exec tsx scripts/lanes/task-lane.ts prompt <branch>             → .repair/prompt.md (agent tasks)
 *   pnpm exec tsx scripts/lanes/task-lane.ts diff-guard [base]           → exit 1 if the branch left the task's allowed set
 *   pnpm exec tsx scripts/lanes/task-lane.ts record <outcome> <note…>    → improvements/lanes/task-attempts.json
 *
 * Reads: the public API (notes, packets), committed artifacts (claims, gap),
 * the attempts log. No DB, no secrets, nothing written to production.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_KNOWLEDGE_NOTES } from "../../src/lib/repo-knowledge";
import {
	type AuditLane,
	attemptsAfter,
	buildTaskPrompt,
	type GapRow,
	isAllowedPath,
	pickClaimLane,
	pickGap,
	pickNotes,
	type RegisteredLane,
	type RepoLite,
	TASK_IDS,
	type TaskAttempt,
	type TaskId,
	taskForSchedule,
} from "../../src/lib/task-lanes";

const ROOT = process.cwd();
const ATTEMPTS = join(ROOT, "improvements/lanes/task-attempts.json");
const AUDIT = join(ROOT, "improvements/audits/lane-autonomy-latest.json");
const LANES = join(ROOT, "improvements/lanes/lanes.json");
const ENTITIES = join(ROOT, "improvements/quality/entities.json");
const SCRATCH = join(ROOT, ".repair");
const ORIGIN = "https://stellarlight.xyz";
const today = new Date().toISOString().slice(0, 10);
const runId = process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`;

interface Pick {
	task: TaskId;
	unit: string | null;
	slug: string | null;
	items: string[];
	payload: unknown;
	reason: string;
	date: string;
}

function readJson<T>(p: string, fallback: T): T {
	return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : fallback;
}
function attempts(): TaskAttempt[] {
	return readJson<{ attempts: TaskAttempt[] }>(ATTEMPTS, { attempts: [] })
		.attempts;
}
function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
}
function isTask(s: string | undefined): s is TaskId {
	return (TASK_IDS as string[]).includes(s ?? "");
}

/** The curated pool: every non-EC-taxonomy repo scoring ≥ 30 that is not
 *  archived, best first — the same population the hand-run waves drew from. */
async function notesPool(): Promise<RepoLite[]> {
	const pool: RepoLite[] = [];
	for (let page = 1; page <= 10; page++) {
		const qs = new URLSearchParams({
			sort: "-repoScore",
			"where[source][not_equals]": "ec-taxonomy",
			"where[repoScore][greater_than_equal]": "30",
			"where[isArchived][not_equals]": "true",
			limit: "200",
			depth: "0",
			page: String(page),
		});
		const r = await fetch(`${ORIGIN}/api/repos?${qs}`, {
			headers: { "User-Agent": "stellarlight-task-lane" },
		});
		if (!r.ok) throw new Error(`pool page ${page}: HTTP ${r.status}`);
		const d = (await r.json()) as { docs?: RepoLite[]; hasNextPage?: boolean };
		pool.push(...(d.docs ?? []));
		if (!d.hasNextPage || !d.docs?.length) break;
	}
	return pool;
}

async function pick(task: TaskId): Promise<Pick> {
	const none = (reason: string): Pick => ({
		task,
		unit: null,
		slug: null,
		items: [],
		payload: null,
		reason,
		date: today,
	});
	if (task === "notes") {
		const pool = await notesPool();
		const keys = new Set(
			Object.keys(REPO_KNOWLEDGE_NOTES).map((k) => k.toLowerCase()),
		);
		const picked = pickNotes(pool, keys, attempts());
		if (!picked.length)
			return none(
				`every one of ${pool.length} pool repos carries a registry entry or a recent attempt`,
			);
		const unnoted = pool.filter(
			(r) => !keys.has(r.fullName.toLowerCase()),
		).length;
		return {
			task,
			unit: `notes-${today}`,
			slug: `notes-${today}`,
			items: picked.map((r) => r.fullName),
			payload: picked.map((r) => ({
				fullName: r.fullName,
				repoScore: r.repoScore,
			})),
			reason: `${picked.length} of ${unnoted} pool repos without a registry entry (pool ${pool.length}: score ≥ 30, not archived, source ≠ ec-taxonomy)`,
			date: today,
		};
	}
	if (task === "claims") {
		const audit = readJson<{ lanes: AuditLane[] }>(AUDIT, { lanes: [] }).lanes;
		const registry = readJson<{ lanes: RegisteredLane[] }>(LANES, {
			lanes: [],
		}).lanes;
		const lane = pickClaimLane(audit, registry, attempts());
		if (!lane)
			return none(
				"no eligible-for-2 lane without an end-state claim (or all attempted this month)",
			);
		return {
			task,
			unit: lane.id,
			slug: slugify(lane.id),
			items: [lane.id],
			payload: {
				audit: lane,
				registry: registry.find((l) => l.id === lane.id) ?? null,
			},
			reason: `eligible-for-2, ${lane.interventionFreeWeeks ?? "?"} intervention-free week(s), no endStateClaim in lanes.json`,
			date: today,
		};
	}
	if (task === "gap") {
		const rows =
			readJson<{ gapMatrix?: { rows?: GapRow[] } }>(ENTITIES, {}).gapMatrix
				?.rows ?? [];
		const g = pickGap(rows, attempts());
		if (!g)
			return none(
				"no curatable gap row (sourced / typed) has un-attempted examples",
			);
		return {
			task,
			unit: g.field,
			slug: g.field,
			items: g.examples,
			payload: g,
			reason: `gap row project/${g.field}: ${g.missing} of ${g.of}; ${g.examples.length} example slug(s) to work`,
			date: today,
		};
	}
	// packets: the evidence script IS the work — no agent, no prompt.
	const stem = `improvements/quality/verification-packets-${today}`;
	console.log(
		"packets: running scripts/data/verification-packets.ts --limit 40 --skip-packeted",
	);
	execSync(
		"pnpm exec tsx scripts/data/verification-packets.ts --limit 40 --skip-packeted",
		{
			stdio: ["ignore", "inherit", "inherit"],
		},
	);
	const j = readJson<{
		population?: number;
		packets?: { slug: string; proposal: string }[];
	}>(join(ROOT, `${stem}.json`), {});
	const packets = j.packets ?? [];
	if (!packets.length)
		return none(
			`the packet script found no un-packeted weak-basis row (population ${j.population ?? "?"})`,
		);
	const hist = Object.entries(
		packets.reduce<Record<string, number>>((m, p) => {
			m[p.proposal] = (m[p.proposal] ?? 0) + 1;
			return m;
		}, {}),
	)
		.map(([k, n]) => `${k} ${n}`)
		.join(" · ");
	const summary = `verification packet ${today}: ${packets.length} weak-basis Live rows (${hist})`;
	writeFileSync(
		join(SCRATCH, "verdict.json"),
		`${JSON.stringify({ outcome: "fixed", summary })}\n`,
	);
	const md = readFileSync(join(ROOT, `${stem}.md`), "utf8").split("\n");
	writeFileSync(
		join(SCRATCH, "pr-body.md"),
		[
			`Proposal counts: ${hist}.`,
			"",
			...md.slice(0, 12),
			"",
			"The human decides every row; nothing here touched the database. Approve rows by adding them to STATUS_FIX (see the packet's own header) and running curate-projects (dry-run, then execute).",
		].join("\n"),
	);
	return {
		task,
		unit: `packets-${today}`,
		slug: `packets-${today}`,
		items: packets.map((p) => p.slug),
		payload: { population: j.population, counts: hist },
		reason: summary,
		date: today,
	};
}

const [cmd, ...rest] = process.argv.slice(2);
mkdirSync(SCRATCH, { recursive: true });

if (cmd === "task-for") {
	const t = taskForSchedule(rest[0] ?? "");
	if (!t) {
		console.error(`task-for: no task maps to schedule "${rest[0] ?? ""}"`);
		process.exit(2);
	}
	console.log(t);
	process.exit(0);
}

if (cmd === "pick") {
	if (!isTask(rest[0])) {
		console.error(
			`pick: unknown task "${rest[0] ?? ""}" (${TASK_IDS.join(" | ")})`,
		);
		process.exit(2);
	}
	const out = await pick(rest[0]);
	writeFileSync(
		join(SCRATCH, "pick.json"),
		`${JSON.stringify(out, null, 2)}\n`,
	);
	console.log(
		out.unit
			? `pick: ${out.task} ${out.unit} (${out.reason})`
			: `pick: none — ${out.reason}`,
	);
	process.exit(0);
}

const current = readJson<Pick | null>(join(SCRATCH, "pick.json"), null);

if (cmd === "prompt") {
	if (!current?.unit) {
		console.error("prompt: no picked unit");
		process.exit(2);
	}
	const p = buildTaskPrompt(current.task, current.unit, current.payload, {
		branch: rest[0] ?? "task/unknown",
		date: today,
	});
	writeFileSync(join(SCRATCH, "prompt.md"), p);
	console.log(`prompt: ${p.length} chars → .repair/prompt.md`);
	process.exit(0);
}

if (cmd === "diff-guard") {
	if (!current?.unit) {
		console.error("diff-guard: no picked unit");
		process.exit(2);
	}
	const base = rest[0] ?? "origin/main";
	const changed = execSync(`git diff --name-only ${base}...HEAD`, {
		encoding: "utf8",
	})
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean);
	const task = current.task;
	const unit = current.unit;
	const bad = changed.filter((p) => !isAllowedPath(task, unit, p));
	console.log(
		`diff-guard: ${changed.length} file(s) changed${bad.length ? `; OUTSIDE ${task}'s allowed set: ${bad.join(", ")}` : ""}`,
	);
	process.exit(bad.length ? 1 : 0);
}

if (cmd === "record") {
	if (!current?.unit) {
		console.error("record: no picked unit");
		process.exit(2);
	}
	const [outcome, ...noteParts] = rest;
	const result = readJson<{ total_cost_usd?: number; cost_usd?: number }>(
		join(SCRATCH, "result.json"),
		{},
	);
	const a: TaskAttempt = {
		task: current.task,
		unit: current.unit,
		items: current.items,
		date: today,
		run: runId,
		outcome: outcome as TaskAttempt["outcome"],
		pr: process.env.TASK_PR_URL || null,
		costUsd: result.total_cost_usd ?? result.cost_usd ?? null,
		note: noteParts.join(" ").slice(0, 400),
	};
	const next = attemptsAfter(attempts(), a);
	// tab-indented like the other committed manifests, so biome never objects
	writeFileSync(
		ATTEMPTS,
		`${JSON.stringify({ attempts: next }, null, "\t")}\n`,
	);
	console.log(
		`record: ${a.task} ${a.unit} → ${a.outcome}${a.pr ? ` (${a.pr})` : ""} cost=${a.costUsd ?? "?"}`,
	);
	process.exit(0);
}

console.error(
	"usage: task-lane.ts task-for <cron> | pick <notes|claims|packets|gap> | prompt <branch> | diff-guard [base] | record <outcome> <note…>",
);
process.exit(2);
