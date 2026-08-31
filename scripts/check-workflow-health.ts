/**
 * Has each guard lane actually RUN, and did it pass?
 *
 * The gap this closes, found 2026-08-30. consumption-guard.yml — the lane whose
 * entire job is to fail a build when machinery goes unconsumed — installed pnpm
 * with `npm i -g pnpm`. That resolved to pnpm 11, engines.pnpm is "^9 || ^10",
 * and the lane died at the install step. It had never completed a single run.
 * The PR was green everywhere else, the file was committed, the schedule was
 * armed, and the board showed a guard we did not have.
 *
 * This is the general form of a lesson already written down twice — "armed
 * schedule is not moved data", "a quiet detector looks identical to a live
 * fire" — and never given a detector. A prose lesson cannot fail a build. So:
 * for every workflow file in the repo, ask GitHub what its runs actually did.
 *
 * Three states are reported, and only the first two are failures:
 *
 *   NEVER-RAN   the file exists and GitHub has no conclusive run for it. Either
 *               it is broken at the setup step, or its triggers never fire.
 *   ALWAYS-RED  it has run and has never once succeeded.
 *   STALE       it last succeeded longer ago than its own cadence allows.
 *
 * Deliberately NOT a failure: a lane whose most recent run is red while an
 * older one was green. Several of ours are detectors that exit 1 BY DESIGN when
 * they find something — a red there is the guard working, and a checker that
 * called that broken would train everyone to ignore it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const JSON_OUT = process.argv.includes("--json");
const OUT = "improvements/audits/workflow-health-latest.json";
const DIR = join(process.cwd(), ".github/workflows");
const REPO = process.env.GITHUB_REPOSITORY ?? "Stellar-Light/stellarlight";
const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
let rateLimited = false;

/** How long a lane may go without a green run before it is stale. A cron says
 * its own answer; anything else is judged on a generous fixed window, because a
 * push-triggered lane is only as frequent as the paths it watches. */
function graceDays(cron: string | null): number {
	if (!cron) return 45;
	const [, , dom, , dow] = cron.trim().split(/\s+/);
	if (dom !== "*") return 75; // monthly
	if (dow !== "*") return 21; // weekly
	return 4; // daily or finer
}

/** When this workflow file was last edited. Runs older than that were produced
 * by a DIFFERENT file and say nothing about the one on disk.
 *
 * dedup-projects.yml is why this exists: 30 runs, zero successes, and every one
 * of them predates the commit that fixed it. The duplicate `with:` key those
 * runs died on is gone — judging today's file by them would have put a
 * permanent red on the board for a bug already fixed, which is precisely how a
 * board stops being read. */
function fileChangedAt(file: string): number {
	try {
		const iso = execFileSync(
			"git",
			["log", "-1", "--format=%cI", "--", `.github/workflows/${file}`],
			{ encoding: "utf8" },
		).trim();
		return iso ? Date.parse(iso) : 0;
	} catch {
		return 0; // shallow clone or no git — fall back to judging all runs
	}
}

type Row = {
	file: string;
	name: string;
	cron: string | null;
	state: "ok" | "never-ran" | "always-red" | "stale";
	lastSuccessAt: string | null;
	ageDays: number | null;
	graceDays: number;
	runs: number;
	why: string;
};

async function gh(path: string): Promise<any> {
	const res = await fetch(`https://api.github.com${path}`, {
		headers: {
			accept: "application/vnd.github+json",
			"user-agent": "stellarlight-workflow-health",
			...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
		},
	});
	if (res.status === 403 || res.status === 429) {
		// Rate limit. NOT evidence about any lane — and the honest thing is to
		// stop, because a partially-answered sweep that reports the unanswered
		// half as broken is worse than no sweep. Cost a false ALWAYS-RED on
		// dedup-projects the first time it happened.
		rateLimited = true;
		throw new Error(`ratelimit ${path}`);
	}
	if (!res.ok) throw new Error(`${res.status} ${path}`);
	return res.json();
}

/** Is the workflow file at `sha` byte-identical to the one on disk? Compares
 * git blob hashes — the API hands us one and `git hash-object` computes the
 * other, so no content is downloaded. */
async function sameBlob(file: string, sha: string): Promise<boolean> {
	try {
		const mine = execFileSync(
			"git",
			["hash-object", `.github/workflows/${file}`],
			{ encoding: "utf8" },
		).trim();
		const theirs = await gh(
			`/repos/${REPO}/contents/.github/workflows/${file}?ref=${sha}`,
		);
		return !!theirs?.sha && theirs.sha === mine;
	} catch (e: any) {
		const msg = String(e?.message ?? "");
		// A 404 on the ref means the commit is no longer reachable — the branch
		// was deleted or force-pushed away. That is not "cannot tell": an
		// unreachable commit is one nobody can fix and nobody will run again.
		// dedup-projects.yml's whole red history sits on such a branch.
		if (msg.startsWith("404")) return false;
		// Rate-limited: we learned nothing, so claim nothing.
		if (msg.startsWith("ratelimit")) return false;
		return true; // genuinely unknown — report it and let a human look
	}
}

/** The steps every lane runs before its own logic. Failing inside this prefix
 * means the lane never got to say anything. */
const SETUP = /checkout|action-setup|setup-node|setup-python|pnpm install|npm ci/i;
const isSetupStep = (name: string) => SETUP.test(name);

async function firstFailedStep(jobRunId: number): Promise<string | null> {
	try {
		const jobs = await gh(`/repos/${REPO}/actions/runs/${jobRunId}/jobs`);
		for (const j of jobs.jobs ?? [])
			for (const st of j.steps ?? [])
				if (st.conclusion === "failure") return st.name as string;
	} catch {}
	return null;
}

async function main() {
	if (!TOKEN)
		console.error(
			"note: no GITHUB_TOKEN — running unauthenticated, expect rate limits",
		);

	const files = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));
	// One call for the whole list beats one per file, and it also tells us
	// GitHub's own id and state for each workflow.
	const known: Array<{ id: number; path: string; name: string; state: string }> =
		(await gh(`/repos/${REPO}/actions/workflows?per_page=100`)).workflows ?? [];
	const byPath = new Map(known.map((w) => [w.path.replace(/^\.github\//, ""), w]));

	const rows: Row[] = [];
	for (const file of files.sort()) {
		const src = readFileSync(join(DIR, file), "utf8");
		let doc: any = {};
		try {
			doc = yaml.load(src) ?? {};
		} catch {
			// the duplicate-key test owns this failure; don't double-report it
			continue;
		}
		// `on:` parses as the boolean true under YAML 1.1 — a footgun this repo
		// has hit before, so read both spellings. JS coerces the key to the
		// string "true", which is also the only spelling TypeScript will index.
		const on = doc.on ?? doc.true ?? {};
		const sched = on.schedule;
		const cron: string | null = Array.isArray(sched)
			? (sched[0]?.cron ?? null)
			: null;
		const grace = graceDays(cron);
		// A workflow_dispatch-only file is a TOOL, not a lane. The repo has ~19 of
		// them — one-shot backfills and patches (fix-zenex, patch-rozo,
		// migrate-research-url-host) that ran when they were needed and are
		// finished. "Last green 77d ago" is the correct state for a job that is
		// done, and reporting it as broken is how a board teaches people to skip
		// it. Judged only on whether it works WHEN dispatched, never on age.
		const automatic = !!(cron || on.push || on.pull_request || on.repository_dispatch);

		const meta = byPath.get(`workflows/${file}`);
		if (!meta) {
			if (!automatic) continue;
			// A lane added minutes ago has not had a chance yet. Same grace the
			// no-runs case gets — without it, every PR that adds a workflow
			// reports that workflow as broken.
			if (Date.now() - fileChangedAt(file) < grace * 86_400_000) continue;
			rows.push({
				file,
				name: doc.name ?? file,
				cron,
				state: "never-ran",
				lastSuccessAt: null,
				ageDays: null,
				graceDays: grace,
				runs: 0,
				why: "GitHub does not know this workflow — it has never been registered by a run",
			});
			continue;
		}
		// `disabled_manually` is a person's decision, not a defect.
		if (meta.state !== "active") continue;

		const runs: any[] =
			(await gh(`/repos/${REPO}/actions/workflows/${meta.id}/runs?per_page=30`))
				.workflow_runs ?? [];
		const since = fileChangedAt(file);
		const conclusive = runs.filter(
			(r) =>
				r.conclusion &&
				r.conclusion !== "skipped" &&
				Date.parse(r.created_at) >= since,
		);
		const success = conclusive.find((r) => r.conclusion === "success");

		if (conclusive.length === 0) {
			// A manual tool nobody has dispatched yet is not a defect — and after
			// an edit, neither is an automatic lane whose triggers have not come
			// round again.
			if (!automatic) continue;
			if (Date.now() - since < graceDays(cron) * 86_400_000) continue;
			rows.push({
				file,
				name: meta.name,
				cron,
				state: "never-ran",
				lastSuccessAt: null,
				ageDays: null,
				graceDays: grace,
				runs: 0,
				why: "no conclusive run since this file was last edited — armed but never executed",
			});
			continue;
		}
		if (!success) {
			// Two questions stand between "every run failed" and "this lane is
			// broken", and getting either wrong puts a red on the board that
			// nobody can act on.
			//
			// FIRST: is it even this file that failed? Timestamps are not enough.
			// dedup-projects.yml's runs all postdate the commit that fixed it, yet
			// they ran on feature branches that had never merged that commit — the
			// sha is not an ancestor of main. Comparing the git BLOB of the
			// workflow at the failing run against the blob on disk answers exactly
			// the question asked: did THIS text fail?
			const latest = conclusive[0];
			const ranSameFile = await sameBlob(file, latest.head_sha);
			if (!ranSameFile) continue;

			// SECOND: is failing what this lane DOES? Several of ours end in a
			// deliberate `exit 1` that propagates a finding — generated-recall.yml
			// has a step literally named "Propagate the red". A checker that calls
			// those broken is telling people to silence their own detectors. The
			// line is where the failure happens: a lane that dies in checkout,
			// pnpm setup, node setup or install never reached its own logic and is
			// broken infrastructure; one that dies later is doing its job.
			const step = await firstFailedStep(latest.id);
			if (step && !isSetupStep(step)) continue;
			// No identifiable failing step means the run produced no jobs at all —
			// how Actions reports a file it refused to parse. Real when the file on
			// disk is the one that failed, which sameBlob has just confirmed.
			rows.push({
				file,
				name: meta.name,
				cron,
				state: "always-red",
				lastSuccessAt: null,
				ageDays: null,
				graceDays: grace,
				runs: conclusive.length,
				why: `${conclusive.length} runs since this file was last edited, zero successes — dies at "${step ?? "an unknown step"}", before its own logic runs`,
			});
			continue;
		}
		const age = Math.floor(
			(Date.now() - Date.parse(success.created_at)) / 86_400_000,
		);
		const stale = automatic && age > grace;
		rows.push({
			file,
			name: meta.name,
			cron,
			state: stale ? "stale" : "ok",
			lastSuccessAt: success.created_at,
			ageDays: age,
			graceDays: grace,
			runs: conclusive.length,
			why: stale
				? `last green ${age}d ago, past its ${grace}d window${cron ? ` (cron "${cron}")` : ""}`
				: `last green ${age}d ago${automatic ? "" : " (manual tool — age not judged)"}`,
		});
	}

	const broken = rows.filter((r) => r.state !== "ok");
	// A sweep that ran out of API budget did not measure the repo; publishing
	// its partial count as the board's number would quietly overstate health.
	if (rateLimited) {
		console.error(
			"INCONCLUSIVE: GitHub rate limit hit mid-sweep — no artifact written, no verdict.",
		);
		process.exit(2);
	}
	const artifact = {
		asOf: new Date().toISOString(),
		source: "scripts/check-workflow-health.ts",
		checked: rows.length,
		healthy: rows.length - broken.length,
		broken: broken.map((r) => ({
			file: r.file,
			state: r.state,
			why: r.why,
		})),
		rows,
	};

	if (JSON_OUT) {
		writeFileSync(OUT, `${JSON.stringify(artifact, null, "\t")}\n`);
		console.log(`wrote ${OUT}`);
	} else {
		for (const r of rows.filter((x) => x.state !== "ok"))
			console.log(`  ${r.state.toUpperCase().padEnd(10)} ${r.file.padEnd(38)} ${r.why}`);
		console.log(
			`\n${rows.length - broken.length}/${rows.length} workflows have a recent green run.`,
		);
	}
	if (broken.length > 0) {
		if (!JSON_OUT)
			console.error(`RED: ${broken.length} lanes are armed but not working.`);
		process.exit(1);
	}
}

main().catch((e) => {
	console.error("FATAL:", e?.message ?? e);
	process.exit(1);
});
