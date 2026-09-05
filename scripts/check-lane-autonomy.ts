/**
 * How many intervention-free weeks has each mutating lane actually earned?
 *
 * QUALITY.md §3 promises autonomy is EARNED per lane — N consecutive
 * intervention-free weeks, then the gate opens. Until this script that count
 * existed only as a sentence. The state block said so plainly: "the count is
 * zero", because nothing measured it. A number nobody computes is a number
 * anybody can assume, and the assumption always drifts upward.
 *
 * THE RULE, and it is deliberately mean:
 *
 *   A week counts only when the lane executed ITSELF and nothing it wrote was
 *   corrected. The weeks must be CONSECUTIVE and must run up to the current
 *   week — a lane that stops running stops earning the same day.
 *
 * Each clause kills a different lie:
 *
 *   - "executed" kills the quiet lane. Time passing is not evidence. A
 *     dispatch-only backfill nobody has run since July has been trouble-free
 *     for eight weeks in exactly the way an unplugged smoke alarm has.
 *   - "ITSELF" kills the hand-flown lane. An execute a human dispatched is
 *     still a person operating the lane; it is reported (attendedExecutes)
 *     and it earns nothing. Only `schedule` runs — and dispatches whose actor
 *     GitHub marks as a Bot — count toward a week.
 *   - "CONSECUTIVE … up to the current week" kills the cherry-picked month.
 *     Four scattered good weeks out of eight is not four clean weeks; it is a
 *     lane that broke twice.
 *   - "nothing corrected" kills the unlogged fix. improvements/lanes/
 *     interventions.json is the reset: the newest entry for a lane starts its
 *     clock over, and the clock starts at the END of that day — a run on the
 *     same day as the correction is not evidence the correction worked.
 *
 * HOW A RUN IS PROVEN TO HAVE WRITTEN, and why the workflow file cannot say.
 * The first cut of this script read the lane's YAML AS IT IS NOW and, if a
 * `schedule` event reached a write step, credited every past green scheduled
 * run. That is an instrument that changes its reading of the past when you
 * edit a file today: backfill-knowledge-notes carried
 * `if: github.event_name == 'workflow_dispatch'` on its only write step, so
 * its nightlies checked out, installed, wrote nothing and reported green —
 * and the moment that gate was removed (2026-09-05) those same no-op runs
 * would have been re-read as executes and bought weeks nobody earned.
 *
 * So each candidate run is asked about ITSELF, via
 * `GET /actions/runs/{id}/jobs`, and only a WRITE STEP THAT CONCLUDED
 * `success` counts. `skipped` is a no-op and reads as such. What the jobs API
 * gives is step NAMES, not commands, which cuts three ways:
 *
 *   - an UNNAMED `- run:` step is rendered by GitHub as the fully-resolved
 *     command, so the flag is visibly there or visibly absent
 *     ("Run pnpm exec tsx scripts/data/upgrade-basis-onchain.ts " — trailing
 *     space, dry run);
 *   - an author-NAMED step that was SKIPPED is still authoritative: it did not
 *     run, so it did not write;
 *   - an author-named step that RAN hides its command, and that run is
 *     unclassifiable. The lane is then marked executesAreLowerBound — its
 *     count is a floor, never a claim.
 *
 * The match is on the FLAG and never on the word "execute", which is what
 * keeps award-import's step name, literally "Award (dry-run unless
 * execute=true)", from reading as a write on every single run.
 *
 * THE ROSTER is derived here, at run time, from .github/workflows/*.yml —
 * every workflow with an `execute`/`apply`/`prune` dispatch input or a literal
 * write flag. improvements/lanes/lanes.json supplies only the prose (what the
 * lane writes) and `since`. A workflow that writes but is absent from that
 * file is reported could-not-check: its numbers are real, but nobody has
 * written down what it puts into production, so its autonomy is not checkable.
 * (The registry had drifted: basis-from-deployment.yml was missing.)
 *
 * Rate limits are not evidence about a lane. A 403/429 stops the sweep and the
 * unmeasured lanes are reported could-not-check — never "broken", never 0.
 * Exit is always 0 (the artifact is the measurement, not a verdict); only a
 * genuine script bug exits non-zero.
 *
 *   pnpm exec tsx scripts/check-lane-autonomy.ts          # print the table
 *   pnpm exec tsx scripts/check-lane-autonomy.ts --json   # + write the artifact
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const JSON_OUT = process.argv.includes("--json");
const OUT = "improvements/audits/lane-autonomy-latest.json";
const REGISTRY = "improvements/lanes/lanes.json";
const LOG = "improvements/lanes/interventions.json";
const WORKFLOWS = join(process.cwd(), ".github/workflows");
const REPO = process.env.GITHUB_REPOSITORY ?? "Stellar-Light/stellarlight";
const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";

/** The observation window. Also the ceiling on any week count derived from it. */
const WINDOW_WEEKS = 8;
const WINDOW_MS = WINDOW_WEEKS * 7 * 86_400_000;
/** QUALITY.md §3: unattended data-execute is the 4-clean-week bar. Reaching it
 * publishes ELIGIBILITY; the promotion itself stays a human call. */
const THRESHOLD_WEEKS = 4;
/** How many runs of one week to ask about before giving up on that week. The
 * walk stops at a week it cannot prove (the weeks must be consecutive), so a
 * healthy lane spends ~1 call per week and a broken one spends this many, once.
 * Giving up is recorded as a floor, never as a clean zero. */
const PROBES_PER_WEEK = 5;
const RULE =
	"A week counts only when the lane executed itself and nothing it wrote was corrected, for consecutive weeks up to this one.";

let rateLimited = false;

type Lane = {
	id: string;
	workflow: string;
	cadence: string;
	writeSet: string | null;
	since: string | null;
};
type Intervention = {
	date: string;
	lane: string;
	what: string;
	source: string;
};
type Row = {
	id: string;
	workflow: string;
	cadence: string;
	writeSet: string | null;
	/** Successful runs the lane started ITSELF, in the window. A plain count of
	 * runs, not of writes: the counter stops paying for job-step reads once a
	 * week is proven, so an "executes" total here would be a number nobody
	 * measured. Which of these wrote is carried by interventionFreeWeeks. */
	unattendedRuns: number | null;
	/** Successful runs a human dispatched. Reported, never classified, worth
	 * nothing: a hand-flown lane is not an autonomous one. */
	attendedRuns: number | null;
	executesAreLowerBound: boolean;
	spanBasis: string;
	interventionFreeWeeks: number | null;
	stage: number | string;
	lastInterventionAt: string | null;
	lastInterventionWhat: string | null;
	lastInterventionSource: string | null;
	state: "ok" | "could-not-check";
	why: string;
};

async function gh(path: string): Promise<any> {
	const res = await fetch(`https://api.github.com${path}`, {
		headers: {
			accept: "application/vnd.github+json",
			"user-agent": "stellarlight-lane-autonomy",
			...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
		},
	});
	if (res.status === 403 || res.status === 429) {
		rateLimited = true;
		throw new Error("ratelimit");
	}
	if (!res.ok) throw new Error(`${res.status}`);
	return res.json();
}

/** "2026-W36". The week is the unit of the ladder, so it has to be a real,
 * boundary-stable one: two runs on the same Sunday and Monday are two weeks,
 * and four runs in one week are one. ISO-8601, Thursday decides the year. */
export function isoWeek(iso: string): string {
	const d = new Date(iso);
	const t = new Date(
		Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
	);
	t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
	const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
	const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
	return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** One completed run, reduced to what the counter is allowed to care about.
 * `executeStepConclusion` is the conclusion of the step PROVEN to carry the
 * write flag: "success" wrote, "skipped" did not, null means the run's steps
 * were named and nothing about it can be claimed. */
export type LaneRun = {
	at: string;
	event: string;
	actorIsBot?: boolean;
	executeStepConclusion: string | null;
};

/** A run the lane started by itself. A `schedule` run always is; a dispatch is
 * only if GitHub marks the actor a Bot (every human dispatch, including the
 * one that reruns a cron by hand, is a person operating the lane). */
const unattended = (r: LaneRun) =>
	r.event === "schedule" ||
	(r.event === "workflow_dispatch" && r.actorIsBot === true);

/**
 * THE COUNTER. Pure, so it can be shown wrong by fixtures rather than argued
 * about — see src/lib/__tests__/lane-autonomy-weeks.test.ts.
 *
 * Consecutive ISO weeks, walking back from the week `now` falls in. A week is
 * earned only when it holds an unattended run whose write step succeeded, and
 * holds no logged intervention. The first week that fails ends the count: four
 * scattered weeks are not four clean weeks.
 */
export function interventionFreeWeeks(
	runs: LaneRun[],
	interventions: { date: string }[],
	now: Date | number,
	maxWeeks = WINDOW_WEEKS,
): number {
	const nowMs = typeof now === "number" ? now : now.getTime();
	const latest = interventions
		.map((i) => i.date)
		.sort()
		.at(-1);
	// The clock restarts at the END of the intervention's day. The log records
	// a date, not a timestamp, so anything that ran that day ran alongside the
	// correction and is not evidence the correction held.
	const cutoff = latest
		? Date.parse(`${latest}T00:00:00Z`) + 86_400_000
		: Number.NEGATIVE_INFINITY;

	const earned = new Set(
		runs
			.filter(
				(r) =>
					unattended(r) &&
					r.executeStepConclusion === "success" &&
					Date.parse(r.at) >= cutoff,
			)
			.map((r) => isoWeek(r.at)),
	);
	const dirty = new Set(
		interventions.map((i) => isoWeek(`${i.date}T12:00:00Z`)),
	);

	let weeks = 0;
	for (let back = 0; back < maxWeeks; back++) {
		const w = isoWeek(new Date(nowMs - back * 7 * 86_400_000).toISOString());
		if (dirty.has(w) || !earned.has(w)) break;
		weeks++;
	}
	return weeks;
}

/** The two ways this repo makes a write visible in a step NAME: the resolved
 * flag itself (unnamed `- run:` steps), and the handful of steps that
 * interpolate a marker into their own name ("Detect duplicates + hide"). */
const STEP_WROTE = /--execute\b|--apply\b|--prune-logs\b|\+ write|\+ hide/;
/** GitHub's own step names, not the author's. */
const BOILERPLATE = /^(Run |Post Run |Set up job$|Complete job$)/;

/**
 * Did THIS run write? Asked of the run, not of today's copy of the YAML.
 *
 * "success" — a step that visibly carries the write flag concluded success.
 * "skipped" — every step that could have written was skipped (a gated step
 *   that did not fire is authoritative evidence of a no-op, which is exactly
 *   the backfill-knowledge-notes nightly).
 * null — an author-named step RAN, hiding its command. Unclassifiable.
 */
async function classifyRun(runId: number): Promise<string | null> {
	const jobs = await gh(`/repos/${REPO}/actions/runs/${runId}/jobs`);
	let opaque = false;
	for (const j of jobs?.jobs ?? [])
		for (const st of j.steps ?? []) {
			const name = String(st.name ?? "");
			if (STEP_WROTE.test(name) && st.conclusion === "success")
				return "success";
			// A named step that did not run cannot have written, whatever it hides.
			if (!BOILERPLATE.test(name) && st.conclusion !== "skipped") opaque = true;
		}
	return opaque ? null : "skipped";
}

/** Cadence straight from the workflow: its cron, or dispatch-only. */
function cadenceOf(doc: any): string {
	const on = doc?.on ?? doc?.true ?? {};
	const crons = (Array.isArray(on.schedule) ? on.schedule : [])
		.map((s: any) => String(s?.cron ?? "").trim())
		.filter(Boolean);
	return crons.length
		? crons.map((c: string) => `cron ${c}`).join(" · ")
		: "dispatch";
}

const WRITE_FLAG = /--execute\b|--apply\b|--prune-logs\b/;

/**
 * The roster, derived from the workflow files rather than from anyone's list —
 * which is what /quality has always claimed it was. A workflow is a mutating
 * lane if it takes an execute-shaped dispatch input or if any step passes a
 * literal write flag.
 */
function derivedRoster(): { workflow: string; cadence: string }[] {
	const out: { workflow: string; cadence: string }[] = [];
	for (const file of readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))) {
		let doc: any;
		try {
			doc = yaml.load(readFileSync(join(WORKFLOWS, file), "utf8")) ?? {};
		} catch {
			continue; // unparseable: claim nothing about it
		}
		// `on:` is YAML 1.1 truthy, so js-yaml hands it back under the key `true`.
		const on = doc.on ?? doc.true ?? {};
		const inputs = on?.workflow_dispatch?.inputs ?? {};
		const hasInput = Object.keys(inputs).some((k) =>
			/^(execute|apply|prune)/.test(k),
		);
		const hasFlag = Object.values<any>(doc.jobs ?? {}).some((job) =>
			(job?.steps ?? []).some((st: any) =>
				WRITE_FLAG.test(String(st?.run ?? "")),
			),
		);
		if (hasInput || hasFlag)
			out.push({ workflow: file, cadence: cadenceOf(doc) });
	}
	return out.sort((a, b) => a.workflow.localeCompare(b.workflow));
}

/** Verdicts already paid for, keyed by run id, carried in the artifact. A run
 * is immutable once completed, so this never expires — it is pruned to the
 * window each sweep so it cannot grow without bound. */
function priorCache(): Record<string, string | null> {
	if (!existsSync(OUT)) return {};
	try {
		return JSON.parse(readFileSync(OUT, "utf8")).runCache ?? {};
	} catch {
		return {};
	}
}

async function main() {
	if (!TOKEN)
		console.error(
			"note: no GITHUB_TOKEN — unauthenticated, expect rate limits and could-not-check rows",
		);

	const registry = JSON.parse(readFileSync(REGISTRY, "utf8")) as {
		lanes: Lane[];
	};
	const log = JSON.parse(readFileSync(LOG, "utf8")) as {
		interventions: Intervention[];
	};
	const byWorkflow = new Map(registry.lanes.map((l) => [l.workflow, l]));
	const now = Date.now();
	const windowStart = new Date(now - WINDOW_MS).toISOString().slice(0, 10);

	const cache = priorCache();
	const seen: Record<string, string | null> = {};
	/** Every run id still inside the window, so the cache can be pruned to it
	 * rather than to "what this sweep happened to look at" — the walk skips a
	 * week once it is proven, and dropping those verdicts would make the next
	 * sweep pay for them again. */
	const inWindow = new Set<string>();
	let calls = 0;

	const rows: Row[] = [];
	for (const { workflow, cadence } of derivedRoster()) {
		const lane = byWorkflow.get(workflow);
		const id = lane?.id ?? workflow.replace(/\.ya?ml$/, "");
		const undescribed = !lane;
		const interventions = log.interventions.filter((i) => i.lane === id);
		const last = interventions
			.sort((a, b) => a.date.localeCompare(b.date))
			.at(-1);
		const stub = {
			id,
			workflow,
			cadence,
			writeSet: lane?.writeSet ?? null,
			lastInterventionAt: last?.date ?? null,
			lastInterventionWhat: last?.what ?? null,
			lastInterventionSource: last?.source ?? null,
		};
		const cantCheck = (why: string): Row => ({
			...stub,
			unattendedRuns: null,
			attendedRuns: null,
			executesAreLowerBound: false,
			spanBasis: "n/a",
			interventionFreeWeeks: null,
			stage: 1,
			state: "could-not-check",
			why,
		});

		if (rateLimited) {
			rows.push(
				cantCheck(
					"GitHub rate limit hit earlier in this sweep — this lane was never asked",
				),
			);
			continue;
		}

		// PAGINATE. A single page of 100 is ~3.5 days for scan-repo-code (2h) and
		// ~3.5 weeks for the six-hourly lanes, and the runs come back newest
		// first — so the first cut of this script silently reported the busiest,
		// most autonomous lanes as the least: refresh-stablecoins showed 3 weeks
		// on 62 executes because week 4 was over the page edge.
		const apiRuns: any[] = [];
		let truncated = false;
		try {
			for (let page = 1; ; page++) {
				const batch: any[] =
					(
						await gh(
							`/repos/${REPO}/actions/workflows/${workflow}/runs?per_page=100&page=${page}&status=completed&created=%3E%3D${windowStart}`,
						)
					).workflow_runs ?? [];
				apiRuns.push(...batch);
				if (batch.length < 100) break;
				if (page === 10) {
					truncated = true; // 1,000 runs in 8 weeks: say so, don't guess
					break;
				}
			}
		} catch (e: any) {
			rows.push(
				cantCheck(
					String(e?.message) === "ratelimit"
						? "GitHub rate limit — the API refused, so nothing is known about this lane"
						: `GitHub returned ${e?.message} for this workflow's runs`,
				),
			);
			continue;
		}

		for (const r of apiRuns) inWindow.add(String(r.id));
		const runs: (LaneRun & { id: number })[] = apiRuns
			.filter((r) => r.conclusion === "success")
			.map((r) => ({
				at: r.created_at,
				event: String(r.event),
				actorIsBot: r.actor?.type === "Bot",
				executeStepConclusion: null as string | null,
				id: r.id as number,
			}));

		// Only unattended runs can earn anything, so only they are worth an API
		// call — and because the weeks must be CONSECUTIVE up to this one, the walk
		// stops dead at the first week it cannot prove. A lane whose runs are all
		// human dispatches, or whose current week is empty, costs zero calls.
		const byWeek = new Map<string, (LaneRun & { id: number })[]>();
		for (const r of runs)
			if (unattended(r)) {
				const w = isoWeek(r.at);
				const bucket = byWeek.get(w);
				if (bucket) bucket.push(r);
				else byWeek.set(w, [r]);
			}
		let undercounts = truncated;
		try {
			for (let back = 0; back < WINDOW_WEEKS; back++) {
				const week = isoWeek(
					new Date(now - back * 7 * 86_400_000).toISOString(),
				);
				// Newest first, and only the first few: if the top PROBES_PER_WEEK runs
				// of a week cannot be shown to have written, the week is unproven and
				// the chain ends. That may undercount a week whose only successful
				// execute is older than its failures — which is why the lane is then
				// marked a floor rather than reported as a clean zero.
				const candidates = (byWeek.get(week) ?? []).slice(0, PROBES_PER_WEEK);
				let proven = false;
				let opaque = false;
				for (const r of candidates) {
					const key = String(r.id);
					let verdict = key in cache ? cache[key] : undefined;
					if (verdict === undefined) {
						verdict = await classifyRun(r.id);
						calls++;
					}
					seen[key] = verdict ?? null;
					r.executeStepConclusion = verdict ?? null;
					if (verdict === null) opaque = true;
					if (verdict === "success") {
						proven = true;
						break;
					}
				}
				if (proven) continue;
				// Unproven ends the chain. It is a FLOOR rather than a fact only when
				// something was hidden from us: an opaque run, or more runs in the week
				// than we probed. A week of visibly-skipped steps is a plain zero.
				if (opaque || (byWeek.get(week) ?? []).length > candidates.length)
					undercounts = true;
				break;
			}
		} catch (e: any) {
			rows.push(
				cantCheck(
					String(e?.message) === "ratelimit"
						? "GitHub rate limit while reading this lane's job steps — no week is claimed"
						: `GitHub returned ${e?.message} for a run's jobs`,
				),
			);
			continue;
		}

		const weeks = interventionFreeWeeks(runs, interventions, now);
		const unattendedRuns = runs.filter(unattended).length;
		const attendedRuns = runs.length - unattendedRuns;
		const spanBasis = last?.date
			? "last logged intervention"
			: lane?.since
				? "lanes.json since"
				: `start of the ${WINDOW_WEEKS}-week observation window`;

		rows.push({
			...stub,
			unattendedRuns,
			attendedRuns,
			executesAreLowerBound: undercounts,
			spanBasis,
			interventionFreeWeeks: weeks,
			stage: !undescribed && weeks >= THRESHOLD_WEEKS ? "eligible-for-2" : 1,
			state: undescribed ? "could-not-check" : "ok",
			why: `${apiRuns.length} completed run(s) in window · ${unattendedRuns} successful run(s) the lane started itself, ${attendedRuns} a human dispatched (they earn nothing) · ${weeks} consecutive intervention-free week(s) up to this one, each proven from a run's own job steps · reset basis: ${spanBasis}${last ? ` (${last.date})` : ""}${undercounts ? " · at least one run was unclassifiable (a named step that ran hides its command) or the classify budget was reached, so this is a floor" : ""}${truncated ? " · run list truncated at 1,000" : ""}${undescribed ? ` · NOT IN ${REGISTRY}: nobody has written down what this lane writes, so its autonomy is not checkable` : ""}`,
		});
	}

	// A lanes.json entry whose workflow no longer writes (or no longer exists)
	// is drift in the other direction, and is worth saying out loud too.
	const rostered = new Set(rows.map((r) => r.workflow));
	for (const lane of registry.lanes)
		if (!rostered.has(lane.workflow))
			rows.push({
				id: lane.id,
				workflow: lane.workflow,
				cadence: lane.cadence,
				writeSet: lane.writeSet,
				unattendedRuns: null,
				attendedRuns: null,
				executesAreLowerBound: false,
				spanBasis: "n/a",
				interventionFreeWeeks: null,
				stage: 1,
				lastInterventionAt: null,
				lastInterventionWhat: null,
				lastInterventionSource: null,
				state: "could-not-check",
				why: `${REGISTRY} lists .github/workflows/${lane.workflow}, which is not on disk or no longer carries a write flag`,
			});

	const couldNotCheck = rows.filter((r) => r.state === "could-not-check");
	const eligible = rows.filter((r) => r.stage === "eligible-for-2");
	const artifact = {
		generatedAt: new Date().toISOString(),
		source: "scripts/check-lane-autonomy.ts",
		registry: REGISTRY,
		interventionLog: LOG,
		windowWeeks: WINDOW_WEEKS,
		thresholdWeeks: THRESHOLD_WEEKS,
		rule: RULE,
		limitation:
			"Every counted execute is proven from the run's OWN job steps, never from today's copy of the workflow file. GitHub's jobs API exposes step names, not commands: an unnamed `- run:` step carries the resolved flag, and a named step that was SKIPPED is still proof of a no-op, but a named step that RAN hides what it ran. A lane with such a run — or one that hit the per-lane classify budget — is marked executesAreLowerBound: its numbers are floors. Attended (human-dispatched) runs are reported and never classified, because they cannot earn a week; unattendedRuns/attendedRuns are counts of RUNS, not of writes, because the counter stops paying for job-step reads as soon as a week is proven. The current ISO week is partial by definition, so a weekly-cron lane reads zero until its run for this week lands. The upgrade path for the opaque runs, if the floors ever matter enough to pay for it, is to read each run's workflow file AT ITS OWN head_sha and match the step name there — the file as it was for that run, which is honest, unlike the file as it is today.",
		summary: {
			lanes: rows.length,
			ok: rows.length - couldNotCheck.length,
			couldNotCheck: couldNotCheck.length,
			eligibleForStage2: eligible.length,
			jobsApiCalls: calls,
		},
		lanes: rows,
		runCache: Object.fromEntries(
			Object.entries({ ...cache, ...seen }).filter(([id]) => inWindow.has(id)),
		),
	};

	if (JSON_OUT) {
		writeFileSync(OUT, `${JSON.stringify(artifact, null, "\t")}\n`);
		console.log(`wrote ${OUT}`);
	}

	console.log(`\n${RULE}\n`);
	console.log(
		`${"lane".padEnd(34)}${"cadence".padEnd(22)}${"self-run".padEnd(10)}${"human".padEnd(7)}${"weeks".padEnd(7)}stage`,
	);
	for (const r of rows)
		console.log(
			`${r.id.padEnd(34)}${r.cadence.slice(0, 21).padEnd(22)}${String(r.unattendedRuns ?? "?").padEnd(10)}${String(r.attendedRuns ?? "?").padEnd(7)}${`${r.interventionFreeWeeks ?? "?"}${r.executesAreLowerBound ? "+" : ""}`.padEnd(7)}${r.state === "could-not-check" ? "could-not-check" : r.stage}`,
		);
	console.log(
		`\n${artifact.summary.lanes} lanes · ${artifact.summary.ok} measured · ${artifact.summary.couldNotCheck} could-not-check · ${artifact.summary.eligibleForStage2} at ${THRESHOLD_WEEKS}+ consecutive intervention-free weeks · ${calls} jobs-API call(s)`,
	);
	if (rows.some((r) => r.executesAreLowerBound))
		console.log(
			'"+" marks a floor: at least one run of that lane could not be classified (a named step that ran hides the command), so the real count is this or higher.',
		);
	for (const r of couldNotCheck)
		console.log(`  could-not-check ${r.id}: ${r.why}`);
}

if (process.argv[1]?.includes("check-lane-autonomy"))
	main().catch((e) => {
		console.error("check-lane-autonomy FAILED (script bug):", e);
		process.exit(1);
	});
