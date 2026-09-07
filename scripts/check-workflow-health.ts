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
 * Four states are reported, and only STALE is not an outright failure:
 *
 *   NEVER-RAN   the file exists and GitHub has no conclusive run for it. Either
 *               it is broken at the setup step, or its triggers never fire.
 *   ALWAYS-RED  it has run and has never once succeeded (within the run window).
 *   FAILING     it has an older green and has lost every run since.
 *   STALE       it last succeeded longer ago than its own cadence allows.
 *
 * SIGNAL LANES — the `# workflow-health: signal-steps: <regex>` declaration.
 *
 * Several lanes exit 1 BY DESIGN when their detector finds something — a red
 * there is the guard working, and a checker that called it broken would train
 * everyone to ignore the board. Such a lane must DECLARE that, with one comment
 * line anywhere in its own YAML naming (as a regex over step names) the steps
 * where its deliberate red happens:
 *
 *   # workflow-health: signal-steps: ^Propagate the red$
 *
 * A failed run is a SIGNAL iff its failing step's name matches the lane's
 * declared regex. Everything else — no declaration, or a failure at any other
 * step, setup included — is the lane broken. Two earlier heuristics died here:
 * step POSITION (non-setup step = signal) hid chronically broken lanes, and a
 * file-level /continue-on-error: true/ test let ONE optional step anywhere
 * launder every real failure in its lane — coverage-watch marks only "Fetch
 * previous month's artifact", yet a crash in its report step was classed
 * self-managed; api-drift marks only the drift step, yet a red
 * field-population step got the same free pass. Only a declaration says which
 * red is designed, and only the named steps inherit the exemption.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
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
		return 0; // caller treats 0 as "cannot tell" and refuses to judge
	}
}

/** When any file this lane WATCHES last changed.
 *
 * A push-triggered lane fires when its paths change and not otherwise, so
 * "last green 58 days ago" says nothing until you know whether anything it
 * watches moved in those 58 days. sync-scout-mcp.yml watches `scout-mcp/**`,
 * nobody has touched it, and the lane was correctly silent — reported as STALE
 * because the fixed 45-day window took no account of that. The comment above
 * graceDays already named this problem and then judged on the window anyway.
 *
 * Returns null when the lane has no path filter (then the window is all we
 * have) or when git cannot answer. */
function watchedPathsChangedAt(paths: string[]): number | null {
	if (paths.length === 0) return null;
	try {
		const iso = execFileSync(
			"git",
			["log", "-1", "--format=%cI", "--", ...paths],
			{ encoding: "utf8" },
		).trim();
		return iso ? Date.parse(iso) : null;
	} catch {
		return null;
	}
}

type Row = {
	file: string;
	name: string;
	cron: string | null;
	state:
		| "ok"
		| "never-ran"
		| "always-red"
		| "failing"
		| "standing-signal"
		| "stale";
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

/** One jobs lookup, two answers about a failed run: the first failing step's
 * name, and how many jobs the run produced. `jobCount: null` means the lookup
 * itself failed (job-log retention, a transient error) — no evidence, and
 * distinct from 0, which is how Actions reports a workflow file it refused to
 * parse: registered, "failed", ran nothing. The two used to be separate
 * functions fetching the same endpoint twice — and worse, "failed run WITH
 * jobs but no step concluded failure" fell between them and was skipped
 * entirely, so a lane dying at the job level (runner death, bad `runs-on`)
 * never reached the board. */
async function failedStepInfo(
	runId: number,
): Promise<{ step: string | null; jobCount: number | null }> {
	try {
		const jobs = await gh(`/repos/${REPO}/actions/runs/${runId}/jobs`);
		if (!Array.isArray(jobs?.jobs)) return { step: null, jobCount: null };
		for (const j of jobs.jobs)
			for (const st of j.steps ?? [])
				if (st.conclusion === "failure")
					return { step: st.name as string, jobCount: jobs.jobs.length };
		return { step: null, jobCount: jobs.jobs.length };
	} catch {
		return { step: null, jobCount: null };
	}
}

/** Refuse to run in a shallow checkout.
 *
 * Every judgement in this file is relative to when a workflow file last
 * changed: which runs count as evidence about the current version, whether a
 * newly-added lane has had a chance to fire, whether a green has aged out.
 *
 * In a shallow clone `git log -1 -- <path>` does not fail — it returns the
 * date of the single commit fetched, so EVERY file looks like it changed
 * moments ago, every lane is inside its grace window, and the sweep reports
 * the whole repo healthy. That is the worst possible failure for this
 * particular guard: a false green from a lane whose entire job is to catch
 * guards that only look like they are working.
 *
 * workflow-health.yml sets fetch-depth: 0, so this is unreachable today — but
 * that correctness argument lives in a different file and would not survive
 * this script being invoked from a second lane. Cheap to assert here. */
function assertFullHistory(): void {
	try {
		const shallow = execFileSync(
			"git",
			["rev-parse", "--is-shallow-repository"],
			{ encoding: "utf8" },
		).trim();
		if (shallow === "true") {
			console.error(
				"INCONCLUSIVE: shallow checkout. Every workflow file would date to the single fetched commit, so every lane would look freshly edited and the sweep would report the repo healthy. Use `fetch-depth: 0`.",
			);
			process.exit(2);
		}
	} catch {
		// not a git repo at all — fileChangedAt returns 0 and the per-file check
		// below refuses to judge, which is the same answer by another route.
	}
}

async function main() {
	if (!TOKEN)
		console.error(
			"note: no GITHUB_TOKEN — running unauthenticated, expect rate limits",
		);

	assertFullHistory();
	const files = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));
	// One call for the whole list beats one per file, and it also tells us
	// GitHub's own id and state for each workflow.
	// 2026-09-06: the 101st workflow file tripped the guard below for three
	// runs, so the list is paged. The endpoint also returns entries for files
	// deleted from the default branch; anything past the last page would not be
	// in the map, and every one of those lanes would be reported "GitHub does
	// not know this workflow" — a partial read rendered as a confident verdict.
	const known: Array<{
		id: number;
		path: string;
		name: string;
		state: string;
	}> = [];
	let list: any = { total_count: 0 };
	for (let page = 1; page <= 10; page++) {
		list = await gh(
			`/repos/${REPO}/actions/workflows?per_page=100&page=${page}`,
		);
		const got: typeof known = list.workflows ?? [];
		known.push(...got);
		if (got.length < 100 || known.length >= (list.total_count ?? 0)) break;
	}
	if ((list.total_count ?? 0) > known.length) {
		console.error(
			`INCONCLUSIVE: GitHub reports ${list.total_count} workflows and this page carried ${known.length}. Paginate before trusting a verdict.`,
		);
		process.exit(2);
	}
	const byPath = new Map(
		known.map((w) => [w.path.replace(/^\.github\//, ""), w]),
	);

	const rows: Row[] = [];
	for (const file of files.sort()) {
		const src = readFileSync(join(DIR, file), "utf8");
		// The lane's own declaration that it reds by design, and where — see the
		// header. First declaration wins; one per file is the convention. An
		// unparseable regex is a config defect, not an absence: reading it as "no
		// declaration" would silently flip a signal lane to FAILING, the exact
		// quiet misclassification this file exists to catch. So: no verdict.
		const sigDecl =
			/^\s*#\s*workflow-health:\s*signal-steps:\s*(\S.*?)\s*$/m.exec(src);
		let signalRe: RegExp | null = null;
		if (sigDecl) {
			try {
				signalRe = new RegExp(sigDecl[1]);
			} catch {
				console.error(
					`INCONCLUSIVE: ${file} declares "workflow-health: signal-steps:" with an invalid regex: ${sigDecl[1]}`,
				);
				process.exit(2);
			}
		}
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
		const automatic = !!(
			cron ||
			on.push ||
			on.pull_request ||
			on.repository_dispatch
		);
		// The path filters this lane watches, if it is push-triggered by paths.
		const watched: string[] = !cron
			? [
					...(Array.isArray(on.push?.paths) ? on.push.paths : []),
					...(Array.isArray(on.pull_request?.paths)
						? on.pull_request.paths
						: []),
				].filter((x): x is string => typeof x === "string")
			: [];

		const changedAt = fileChangedAt(file);
		if (!changedAt) {
			console.error(
				`INCONCLUSIVE: git could not date .github/workflows/${file}. Every judgement here is relative to when the file last changed.`,
			);
			process.exit(2);
		}

		const meta = byPath.get(`workflows/${file}`);
		if (!meta) {
			if (!automatic) continue;
			// A lane added minutes ago has not had a chance yet. Same grace the
			// no-runs case gets — without it, every PR that adds a workflow
			// reports that workflow as broken.
			if (Date.now() - changedAt < grace * 86_400_000) continue;
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

		// 100, not 30. The header promises that red-latest with an older green is
		// not a failure, and a window narrower than a lane's run rate breaks that
		// promise silently: contract-gate and tests fire on every push to main
		// with no path filter, so 30 runs can be a single busy day.
		const runs: any[] =
			(
				await gh(
					`/repos/${REPO}/actions/workflows/${meta.id}/runs?per_page=100`,
				)
			).workflow_runs ?? [];
		const since = changedAt;
		// CONCLUSIVE means the lane reached a verdict of its own. A run someone
		// CANCELLED is a person changing their mind, and reading it as a failure
		// put seed-blog-posts.yml on the board for a run a human stopped on
		// 2026-08-14. `neutral` and `action_required` are equally not verdicts
		// about whether the lane works.
		const VERDICTS = new Set(["success", "failure", "timed_out"]);
		const conclusive = runs.filter(
			(r) =>
				VERDICTS.has(r.conclusion ?? "") && Date.parse(r.created_at) >= since,
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

			// SECOND: is failing what this lane DOES? Only its own declaration can
			// say so (see header): the red is a SIGNAL iff the failing step matches
			// the lane's signal-steps regex. The old rule here — skip on ANY
			// non-setup step — assumed a fail-by-design lane, and on a busy lane
			// that had been red for 100+ runs (no green left in the window) it made
			// a chronically broken lane vanish from the board entirely.
			const { step, jobCount } = await failedStepInfo(latest.id);
			if (step && signalRe?.test(step)) continue;
			// No identifiable failing step has three causes, and only one is
			// silence-worthy: jobCount null = the jobs lookup itself failed
			// (retention, transient error) — no evidence, claim nothing. 0 = how
			// Actions reports a file it refused to parse (real — sameBlob has just
			// confirmed the file on disk is the one that failed). >0 = the run HAD
			// jobs yet no step concluded failure (job-level death: runner loss, bad
			// `runs-on`) — still zero greens, still real; skipping it hid the lane.
			if (!step && jobCount === null) continue;
			// A full page means the window may have cut an older green off — say
			// so, rather than asserting a "never" the query cannot see.
			const windowNote =
				runs.length >= 100
					? " (window capped at 100 runs — any older green is beyond it)"
					: "";
			rows.push({
				file,
				name: meta.name,
				cron,
				state: "always-red",
				lastSuccessAt: null,
				ageDays: null,
				graceDays: grace,
				runs: conclusive.length,
				why: `${conclusive.length} runs since this file was last edited, zero successes — ${
					step
						? `dies at "${step}", not a declared signal step`
						: jobCount === 0
							? "runs produce no jobs, how Actions reports a workflow file it refused to parse"
							: `dies at an unknown step (${jobCount} job(s), none reports a failing step)`
				}${windowNote}`,
			});
			continue;
		}
		const age = Math.floor(
			(Date.now() - Date.parse(success.created_at)) / 86_400_000,
		);
		// A path-filtered lane is judged against its own trigger: if nothing it
		// watches has changed since its last green, it has not gone stale — it
		// has had nothing to do.
		const lastTrigger = watchedPathsChangedAt(watched);
		const hadWorkSince =
			lastTrigger === null || lastTrigger > Date.parse(success.created_at);
		// FAILING is not STALE, and conflating them buries the actionable case.
		// sync-scout-mcp has an old green and five failures after it: calling
		// that "last green 58d ago" describes the symptom and hides the fact
		// that it has been trying and losing every time since.
		const failedSinceGreen = conclusive.filter(
			(r) =>
				r.conclusion !== "success" &&
				Date.parse(r.created_at) > Date.parse(success.created_at),
		);
		// Does this lane DECLARE that its own red is a signal?
		//
		// Step position was the wrong discriminator (raven-eval-parity's truth
		// battery and sync-scout-mcp's push step both fail mid-lane; one is a
		// finding, one a missing secret). A file-level /continue-on-error: true/
		// test was too, in the other direction: ONE optional step anywhere —
		// coverage-watch's "Fetch previous month's artifact", api-drift's drift
		// step — exempted every real failure in the rest of that lane. So the
		// lane itself must NAME the steps that red by design, via the
		// signal-steps declaration (header), and only a failure at a named step
		// is a signal. No declaration, an unreadable jobs list, or a failure at
		// any other step — setup included — is the lane broken.
		const failStep = failedSinceGreen.length
			? (await failedStepInfo(failedSinceGreen[0].id)).step
			: null;
		const failing =
			failedSinceGreen.length > 0 &&
			!(signalRe && failStep && signalRe.test(failStep));
		// A red at a declared signal step is the lane WORKING — once. Three or
		// more reds in a row since the last green is a standing signal: the
		// thing it measures has failed every run and nobody has acted. Found
		// 2026-09-05: raven-eval-parity (the daily quality progression) was
		// red three days on one truth-battery probe and the board showed
		// every guard holding, because this file counted each red as a signal
		// and moved on.
		// A checker must not be evidence about itself. This lane exits 1 to
		// REPORT a standing signal, so once it had a red streak of its own it
		// counted that streak, reported itself, exited 1 again, and could never
		// reach the green run that would clear it. Nine runs deep on
		// 2026-09-07, showing as the board's one breached guard, with nothing
		// actually wrong underneath: the streak began as an INCONCLUSIVE from
		// the workflows-endpoint paging bug, which is already fixed.
		// Whether THIS lane runs is judged by whether it completed, which the
		// run conclusion carries — never by the exit code it uses to speak.
		const selfReport = file === "workflow-health.yml";
		const standingSignal =
			!selfReport && !failing && failedSinceGreen.length >= 3;
		const stale =
			automatic && age > grace && hadWorkSince && !failing && !standingSignal;
		rows.push({
			file,
			name: meta.name,
			cron,
			state: failing
				? "failing"
				: standingSignal
					? "standing-signal"
					: stale
						? "stale"
						: "ok",
			lastSuccessAt: success.created_at,
			ageDays: age,
			graceDays: grace,
			runs: conclusive.length,
			why: failing
				? `${failedSinceGreen.length} failed run(s) since its last green ${age}d ago — it is trying and losing, not idle${
						failStep ? `; dies at "${failStep}"` : ""
					}`
				: standingSignal
					? `${failedSinceGreen.length} run(s) red at its declared signal step since its last green ${age}d ago — the lane works; what it measures has failed every run and nobody has acted${
							failStep ? ` (step "${failStep}")` : ""
						}`
					: stale
						? `last green ${age}d ago, past its ${grace}d window${cron ? ` (cron "${cron}")` : ""}`
						: `last green ${age}d ago${
								automatic
									? watched.length && !hadWorkSince
										? ` (nothing under ${watched.join(", ")} has changed since — nothing to do, not stale)`
										: ""
									: " (manual tool — age not judged)"
							}`,
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
			console.log(
				`  ${r.state.toUpperCase().padEnd(10)} ${r.file.padEnd(38)} ${r.why}`,
			);
		console.log(
			`\n${rows.length - broken.length}/${rows.length} workflows have a recent green run.`,
		);
	}
	if (broken.length > 0) {
		if (!JSON_OUT)
			console.error(
				`RED: ${broken.length} lanes are armed but not working, or red at their signal step for 3+ runs unheard.`,
			);
		// --json EXITS 0 ON PURPOSE. The workflow runs this twice: once with
		// --json to write the artifact, once without to turn a finding into a
		// red. Exiting 1 here killed the job at the first step, skipping the
		// commit — so the moment this lane found anything, /quality would freeze
		// on the last committed snapshot forever, and a frozen board is
		// indistinguishable from a healthy one. The artifact is the measurement;
		// the verdict is the second run's job.
		process.exit(JSON_OUT ? 0 : 1);
	}
}

main().catch((e) => {
	// The two heaviest call sites — the workflow list and the per-workflow runs
	// query — are ~95% of the requests and do not catch. A 403, a 429, or one
	// transient 500 on run 40 of 77 used to land here and exit 1, turning a
	// sweep that measured NOTHING into a red board. Same rule as everywhere
	// else in this file: no measurement, no verdict.
	console.error("INCONCLUSIVE (sweep did not complete):", e?.message ?? e);
	process.exit(2);
});
