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
 *   A week counts only when the lane EXECUTED and nothing it wrote was
 *   corrected.
 *
 * Both halves matter, and each kills a different lie:
 *
 *   - "executed" kills the quiet lane. Time passing is not evidence. A
 *     dispatch-only backfill nobody has run since July has been trouble-free
 *     for eight weeks in exactly the way an unplugged smoke alarm has. So the
 *     elapsed-week count is CAPPED at the number of distinct ISO weeks in
 *     which the lane actually completed a successful execute. A lane that did
 *     not run earns nothing.
 *   - "nothing corrected" kills the unlogged fix. improvements/lanes/
 *     interventions.json is the reset: the newest entry for a lane starts its
 *     clock over. That log is append-only and the same PR that corrects a
 *     lane's output appends to it — an unlogged correction silently buys
 *     autonomy the lane did not earn.
 *
 * WHAT THIS SCRIPT CANNOT SEE, said out loud rather than papered over.
 * GitHub's workflow-runs API does not return a dispatch run's `inputs`, so for
 * a lane whose writing is gated on an `execute` checkbox there is no
 * authoritative way to ask "did that run write?". Two detections, and the
 * artifact says which one each lane got:
 *
 *   executeDetection "schedule"  — the lane's own YAML shows a `schedule`
 *       event reaches a step that passes the write flag, so a successful
 *       scheduled run IS an execute. Authoritative.
 *   executeDetection "step-name" — dispatch runs, classified from the run's
 *       JOB STEP NAMES. This works better than it sounds and worse than it
 *       looks: for an UNNAMED `- run:` step GitHub names the step after the
 *       fully-resolved command, so `--execute` is either in the name or it is
 *       not ("Run pnpm exec tsx scripts/data/upgrade-basis-onchain.ts " —
 *       trailing space, dry run). For an explicitly NAMED step ("Upgrade",
 *       "Refresh stablecoins", "Award (dry-run unless execute=true)") the
 *       command is hidden and the run is unclassifiable. So the match is on
 *       the FLAG, never on the word "execute", and a lane that had any
 *       unclassifiable run is marked executesAreLowerBound — its count is a
 *       floor, never a claim.
 *
 * Rate limits are not evidence about a lane. A 403/429 stops the sweep and the
 * unmeasured lanes are reported could-not-check — never "broken", never 0.
 * Exit is always 0 (the artifact is the measurement, not a verdict); only a
 * genuine script bug exits non-zero.
 *
 *   pnpm exec tsx scripts/check-lane-autonomy.ts          # print the table
 *   pnpm exec tsx scripts/check-lane-autonomy.ts --json   # + write the artifact
 */
import { readFileSync, writeFileSync } from "node:fs";
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
const RULE =
	"A week counts only when the lane executed and nothing it wrote was corrected.";

let rateLimited = false;

type Lane = {
	id: string;
	workflow: string;
	cadence: string;
	executeInput: string;
	writeSet: string;
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
	writeSet: string;
	executeDetection: string;
	executesLast8w: number | null;
	scheduledExecutesLast8w: number | null;
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
function isoWeek(iso: string): string {
	const d = new Date(iso);
	const t = new Date(
		Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
	);
	t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
	const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
	const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
	return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const WRITE_FLAG = /--execute\b|--apply\b|--prune-logs\b/;

/**
 * Does a `schedule` event reach a step that passes the write flag?
 *
 * Read from the lane's own YAML, because the answer is not guessable from the
 * cron. backfill-triage-tags and backfill-knowledge-notes carry the SAME
 * comment ("the nightly gets its own hardcoded execute step") and only the
 * first one has that step — the second's only write step is gated
 * `if: github.event_name == 'workflow_dispatch'`, so its nightly checks out,
 * installs, and writes nothing. Trusting the cron would have credited that
 * lane a clean week every night for doing nothing at all.
 */
function scheduleExecutes(src: string): boolean {
	let doc: any;
	try {
		doc = yaml.load(src) ?? {};
	} catch {
		return false; // unparseable: claim nothing
	}
	for (const job of Object.values<any>(doc.jobs ?? {})) {
		for (const step of job?.steps ?? []) {
			const run = String(step?.run ?? "");
			if (!WRITE_FLAG.test(run)) continue;
			// A step gated to dispatch never fires on a cron.
			const gate = String(step?.if ?? "");
			if (/workflow_dispatch/.test(gate) && !/schedule/.test(gate)) continue;
			// A literal flag (no `${{ }}` on its line) always applies — it is the
			// shell-branch idiom: `if schedule || inputs.execute; then … --execute`.
			const flagLine = run
				.split("\n")
				.find((l) => WRITE_FLAG.test(l) && !/^\s*#/.test(l));
			if (flagLine && !flagLine.includes("${{")) return true;
			// Otherwise the flag is interpolated, and only naming the schedule
			// event in that expression makes a cron write.
			if (/schedule/.test(run)) return true;
		}
	}
	return false;
}

/** The two ways this repo makes a write visible in a step NAME: the resolved
 * flag itself (unnamed `- run:` steps), and the handful of steps that
 * interpolate a marker into their own name ("Detect duplicates + hide"). */
const STEP_WROTE = /--execute\b|--apply\b|--prune-logs\b|\+ write|\+ hide/;

/** Did this dispatch run write? "yes" and "no" are both real answers when the
 * step was unnamed — GitHub resolved the command into the name, so the flag is
 * there or it demonstrably is not. "unknown" is an explicitly NAMED step,
 * whose command the API never shows; those runs make the lane's count a floor
 * rather than a measurement. Matching on the FLAG and not on the word
 * "execute" is what keeps award-import's step name, literally "Award (dry-run
 * unless execute=true)", from reading as a write on every single run. */
async function dispatchExecuted(
	runId: number,
): Promise<"yes" | "no" | "unknown"> {
	const jobs = await gh(`/repos/${REPO}/actions/runs/${runId}/jobs`);
	let sawNamedStep = false;
	for (const j of jobs?.jobs ?? [])
		for (const st of j.steps ?? []) {
			const name = String(st.name ?? "");
			if (STEP_WROTE.test(name) && st.conclusion === "success") return "yes";
			// "Run <command>" is GitHub's own rendering of an unnamed step; any
			// other name is the author's, and hides what the step actually ran.
			if (!/^(Run |Post Run |Set up job$|Complete job$)/.test(name))
				sawNamedStep = true;
		}
	return sawNamedStep ? "unknown" : "no";
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
	const now = Date.now();
	const windowStart = new Date(now - WINDOW_MS).toISOString().slice(0, 10);

	const rows: Row[] = [];
	for (const lane of registry.lanes) {
		// newest logged correction for this lane — the clock's reset
		const last = log.interventions
			.filter((i) => i.lane === lane.id)
			.sort((a, b) => a.date.localeCompare(b.date))
			.at(-1);

		let src = "";
		try {
			src = readFileSync(join(WORKFLOWS, lane.workflow), "utf8");
		} catch {
			rows.push({
				...base(lane, last),
				executeDetection: "none",
				executesLast8w: null,
				scheduledExecutesLast8w: null,
				executesAreLowerBound: false,
				spanBasis: "n/a",
				interventionFreeWeeks: null,
				stage: 1,
				state: "could-not-check",
				why: `registry names .github/workflows/${lane.workflow}, which is not on disk`,
			});
			continue;
		}
		const cronWrites = scheduleExecutes(src);
		const detection = cronWrites ? "schedule" : "step-name";

		if (rateLimited) {
			rows.push({
				...base(lane, last),
				executeDetection: detection,
				executesLast8w: null,
				scheduledExecutesLast8w: null,
				executesAreLowerBound: false,
				spanBasis: "n/a",
				interventionFreeWeeks: null,
				stage: 1,
				state: "could-not-check",
				why: "GitHub rate limit hit earlier in this sweep — this lane was never asked",
			});
			continue;
		}

		// PAGINATE. A single page of 100 is ~3.5 days for scan-repo-code (2h) and
		// ~3.5 weeks for the six-hourly lanes, and the runs come back newest
		// first — so the first cut of this script silently reported the busiest,
		// most autonomous lanes as the least: refresh-stablecoins showed 3 weeks
		// on 62 executes because week 4 was over the page edge.
		const runs: any[] = [];
		let truncated = false;
		try {
			for (let page = 1; ; page++) {
				const batch: any[] =
					(
						await gh(
							`/repos/${REPO}/actions/workflows/${lane.workflow}/runs?per_page=100&page=${page}&status=completed&created=%3E%3D${windowStart}`,
						)
					).workflow_runs ?? [];
				runs.push(...batch);
				if (batch.length < 100) break;
				if (page === 10) {
					truncated = true; // 1,000 runs in 8 weeks: say so, don't guess
					break;
				}
			}
		} catch (e: any) {
			rows.push({
				...base(lane, last),
				executeDetection: detection,
				executesLast8w: null,
				scheduledExecutesLast8w: null,
				executesAreLowerBound: false,
				spanBasis: "n/a",
				interventionFreeWeeks: null,
				stage: 1,
				state: "could-not-check",
				why:
					String(e?.message) === "ratelimit"
						? "GitHub rate limit — the API refused, so nothing is known about this lane"
						: `GitHub returned ${e?.message} for this workflow's runs`,
			});
			continue;
		}

		// Which completed runs actually WROTE?
		const executedAt: string[] = [];
		// …and how many of those the lane started BY ITSELF. Both count toward a
		// week — an execute is an execute — but the split has to be visible, or
		// a lane whose 89 executes were 88 people clicking Run workflow reads as
		// eight weeks of unattended operation. It is not the same claim.
		let scheduled = 0;
		let undercounts = false;
		for (const r of runs) {
			if (r.conclusion !== "success") continue;
			if (r.event === "schedule") {
				if (cronWrites) {
					executedAt.push(r.created_at);
					scheduled++;
				}
				continue;
			}
			// dispatch / workflow_run: only the step names can answer
			try {
				const verdict = await dispatchExecuted(r.id);
				if (verdict === "yes") executedAt.push(r.created_at);
				if (verdict === "unknown") undercounts = true;
			} catch {
				// one unreadable jobs list is not evidence either way — but it is
				// also not a clean run, so the count stays a floor
				undercounts = true;
			}
		}

		// The span the counter measures over, most authoritative first.
		const spanStart = last?.date
			? `${last.date}T00:00:00Z`
			: (lane.since ?? `${windowStart}T00:00:00Z`);
		const spanBasis = last?.date
			? "last logged intervention"
			: lane.since
				? "lanes.json since"
				: `start of the ${WINDOW_WEEKS}-week observation window`;

		const after = executedAt.filter((at) => at > spanStart);
		// Elapsed weeks are the ceiling; executing weeks are the floor. The
		// smaller wins, and both are needed: an intervention two days ago must
		// not be papered over by a six-hourly lane's four distinct run-weeks.
		const elapsedWeeks = Math.floor(
			(now - Date.parse(spanStart)) / (7 * 86_400_000),
		);
		const executingWeeks = new Set(after.map(isoWeek)).size;
		const weeks = Math.max(0, Math.min(elapsedWeeks, executingWeeks));

		rows.push({
			...base(lane, last),
			executeDetection: detection,
			executesLast8w: executedAt.length,
			scheduledExecutesLast8w: scheduled,
			executesAreLowerBound: undercounts || truncated,
			spanBasis,
			interventionFreeWeeks: weeks,
			stage: weeks >= THRESHOLD_WEEKS ? "eligible-for-2" : 1,
			state: "ok",
			why: `${runs.length} completed run(s) in window · ${executedAt.length} execute(s), ${scheduled} of them unattended (schedule) · ${executingWeeks} distinct executing week(s) since ${spanStart.slice(0, 10)} (${spanBasis}), ${elapsedWeeks} elapsed${undercounts ? " · some dispatch runs were unclassifiable (named steps hide the command), so this is a floor" : ""}${truncated ? " · run list truncated at 1,000" : ""}`,
		});
	}

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
			"GitHub's workflow-runs API does not expose a dispatch run's inputs. A dispatch run is therefore classified from its job step names: an UNNAMED `- run:` step carries the resolved command (so the flag is visibly there or visibly absent), but an explicitly NAMED step hides it. Any lane with such a run is marked executesAreLowerBound — its executesLast8w and interventionFreeWeeks are floors, not measurements.",
		summary: {
			lanes: rows.length,
			ok: rows.length - couldNotCheck.length,
			couldNotCheck: couldNotCheck.length,
			eligibleForStage2: eligible.length,
			byDetection: {
				schedule: rows.filter((r) => r.executeDetection === "schedule").length,
				stepName: rows.filter((r) => r.executeDetection === "step-name").length,
			},
		},
		lanes: rows,
	};

	if (JSON_OUT) {
		writeFileSync(OUT, `${JSON.stringify(artifact, null, "\t")}\n`);
		console.log(`wrote ${OUT}`);
	}

	console.log(`\n${RULE}\n`);
	console.log(
		`${"lane".padEnd(34)}${"cadence".padEnd(20)}${"det".padEnd(11)}${"exec/8w".padEnd(9)}${"weeks".padEnd(7)}stage`,
	);
	for (const r of rows)
		console.log(
			`${r.id.padEnd(34)}${r.cadence.padEnd(20)}${r.executeDetection.padEnd(11)}${String(r.executesLast8w ?? "?").padEnd(9)}${`${r.interventionFreeWeeks ?? "?"}${r.executesAreLowerBound ? "+" : ""}`.padEnd(7)}${r.state === "could-not-check" ? "could-not-check" : r.stage}`,
		);
	console.log(
		`\n${artifact.summary.lanes} lanes · ${artifact.summary.ok} measured · ${artifact.summary.couldNotCheck} could-not-check · ${artifact.summary.eligibleForStage2} at ${THRESHOLD_WEEKS}+ intervention-free weeks`,
	);
	if (rows.some((r) => r.executesAreLowerBound))
		console.log(
			'"+" marks a floor: at least one run of that lane could not be classified (a named step hides the command it ran), so the real count is this or higher.',
		);
	for (const r of couldNotCheck)
		console.log(`  could-not-check ${r.id}: ${r.why}`);
}

/** The half of a row that needs no API call. */
function base(lane: Lane, last: Intervention | undefined) {
	return {
		id: lane.id,
		workflow: lane.workflow,
		cadence: lane.cadence,
		writeSet: lane.writeSet,
		lastInterventionAt: last?.date ?? null,
		lastInterventionWhat: last?.what ?? null,
		lastInterventionSource: last?.source ?? null,
	};
}

main().catch((e) => {
	console.error("check-lane-autonomy FAILED (script bug):", e);
	process.exit(1);
});
