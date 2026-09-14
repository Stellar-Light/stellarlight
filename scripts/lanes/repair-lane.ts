/**
 * The repair lane's CLI — the impure half of src/lib/repair-lane.ts, called
 * step by step from .github/workflows/repair-lane.yml:
 *
 *   pnpm exec tsx scripts/lanes/repair-lane.ts pick [--row <id>]      → .repair/pick.json (+ prints it)
 *   pnpm exec tsx scripts/lanes/repair-lane.ts prompt <branch>         → .repair/prompt.md
 *   pnpm exec tsx scripts/lanes/repair-lane.ts record <outcome> <note> → improvements/lanes/repair-attempts.json (+ a wave manifest when fixed)
 *   pnpm exec tsx scripts/lanes/repair-lane.ts diff-guard              → exit 1 if the branch touched a protected path
 *
 * No DB, no network: it reads the committed ledger and the attempts log.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	type Attempt,
	attemptsAfter,
	buildPrompt,
	isProtectedPath,
	type LedgerRow,
	pickRow,
} from "../../src/lib/repair-lane";

const ROOT = process.cwd();
const LEDGER = join(ROOT, "improvements/ledger/findings.json");
const ATTEMPTS = join(ROOT, "improvements/lanes/repair-attempts.json");
const WAVES = join(ROOT, "improvements/waves/ledger");
const SCRATCH = join(ROOT, ".repair");
const today = new Date().toISOString().slice(0, 10);
const runId = process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`;

function readJson<T>(p: string, fallback: T): T {
	return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : fallback;
}
function attempts(): Attempt[] {
	return readJson<{ attempts: Attempt[] }>(ATTEMPTS, { attempts: [] }).attempts;
}
function slug(id: string): string {
	return id
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}

const [cmd, ...rest] = process.argv.slice(2);
mkdirSync(SCRATCH, { recursive: true });

if (cmd === "pick") {
	const rows = readJson<LedgerRow[]>(LEDGER, []);
	const forced =
		rest.indexOf("--row") >= 0 ? rest[rest.indexOf("--row") + 1] : null;
	const picked = forced
		? {
				row: rows.find((r) => r.id === forced) ?? null,
				reason: `forced by dispatch input: ${forced}`,
				considered: rows.length,
			}
		: pickRow(rows, attempts());
	const out = {
		...picked,
		slug: picked.row ? slug(picked.row.id) : null,
		date: today,
	};
	writeFileSync(
		join(SCRATCH, "pick.json"),
		`${JSON.stringify(out, null, 2)}\n`,
	);
	console.log(
		picked.row
			? `pick: ${picked.row.id} (${picked.reason})`
			: `pick: none — ${picked.reason}`,
	);
	process.exit(0);
}

if (cmd === "prompt") {
	const pick = readJson<{ row: LedgerRow | null }>(join(SCRATCH, "pick.json"), {
		row: null,
	});
	if (!pick.row) {
		console.error("prompt: no picked row");
		process.exit(2);
	}
	const p = buildPrompt(pick.row, {
		branch: rest[0] ?? "repair/unknown",
		date: today,
	});
	writeFileSync(join(SCRATCH, "prompt.md"), p);
	console.log(`prompt: ${p.length} chars → .repair/prompt.md`);
	process.exit(0);
}

if (cmd === "diff-guard") {
	const base = rest[0] ?? "origin/main";
	const changed = execSync(`git diff --name-only ${base}...HEAD`, {
		encoding: "utf8",
	})
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean);
	const bad = changed.filter(isProtectedPath);
	console.log(
		`diff-guard: ${changed.length} file(s) changed${bad.length ? `; PROTECTED: ${bad.join(", ")}` : ""}`,
	);
	process.exit(bad.length ? 1 : 0);
}

if (cmd === "record") {
	const [outcome, ...noteParts] = rest;
	const pick = readJson<{ row: LedgerRow | null }>(join(SCRATCH, "pick.json"), {
		row: null,
	});
	if (!pick.row) {
		console.error("record: no picked row");
		process.exit(2);
	}
	const result = readJson<{ total_cost_usd?: number; cost_usd?: number }>(
		join(SCRATCH, "result.json"),
		{},
	);
	const a: Attempt = {
		rowId: pick.row.id,
		date: today,
		run: runId,
		outcome: outcome as Attempt["outcome"],
		pr: process.env.REPAIR_PR_URL || null,
		costUsd: result.total_cost_usd ?? result.cost_usd ?? null,
		note: noteParts.join(" ").slice(0, 400),
	};
	const next = attemptsAfter(attempts(), a);
	writeFileSync(ATTEMPTS, `${JSON.stringify({ attempts: next }, null, 1)}\n`);
	if (a.outcome === "fixed" && a.pr) {
		const name = `${today}-repair-${slug(pick.row.id)}.json`;
		writeFileSync(
			join(WAVES, name),
			`${JSON.stringify(
				{
					wave: `repair-${slug(pick.row.id)}`,
					date: today,
					findings: [
						{
							id: pick.row.id,
							status: "in-wave",
							note: `repair lane PR ${a.pr}; closes by re-detection after merge`,
						},
					],
				},
				null,
				"\t", // the committed manifests are tab-indented (biome's JSON style)
			)}\n`,
		);
		console.log(`record: wave manifest ${name}`);
	}
	console.log(
		`record: ${a.rowId} → ${a.outcome}${a.pr ? ` (${a.pr})` : ""} cost=${a.costUsd ?? "?"}`,
	);
	process.exit(0);
}

console.error(
	"usage: repair-lane.ts pick [--row id] | prompt <branch> | diff-guard [base] | record <outcome> <note…>",
);
process.exit(2);
