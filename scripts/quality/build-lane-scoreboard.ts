/**
 * The autonomy ladder's counter (QUALITY.md §3): per-lane intervention-free
 * weeks, measured — not asserted.
 *
 * Stage advancement is earned by "N consecutive intervention-free weeks
 * (human reviewed, changed nothing)". Until this script, that counter lived
 * nowhere: a quiet week was indistinguishable from a failed run, and a
 * human silently correcting the lane's stamps would never have reset
 * anything. Three facts, each from its own source of truth:
 *
 *   1. DID THE LANE RUN? GitHub API: latest completed run of
 *      curate-projects.yml and its conclusion. A missed or failed weekly
 *      run is a red week, not a clean one — silence is not success.
 *   2. WHAT DOES THE LANE HOLD? Live API: every row whose
 *      deployment.basis = operator-toml (the lane's write-set).
 *   3. DID A HUMAN CORRECT IT? Diff against the previous committed
 *      snapshot. A stamp UPGRADED to human-verified on the same network is
 *      the ladder working (recorded, still clean). A stamp REMOVED or its
 *      network CHANGED is a correction — the counter resets to zero.
 *
 * cleanWeeks increments at most once per NEW successful scheduled run
 * observed since the last snapshot (the weekly cadence is the clock), and
 * resets on any correction or failed run. Runs in the daily pipeline
 * (raven-eval-parity), which commits improvements/quality/ back to main.
 * Non-fatal there: a GitHub API hiccup must not sink the artifact step.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LANE = "operator-toml";
const SNAPSHOT = join(
	process.cwd(),
	"improvements/quality/lane-operator-toml.json",
);
const UA = { "User-Agent": "stellarlight-lane-scoreboard" };

type Stamp = { slug: string; network: string };
type Snapshot = {
	lane: string;
	generatedAt: string;
	stage: number;
	cleanWeeks: number;
	stageEntryThresholdWeeks: number;
	lastRun: {
		id: number;
		at: string;
		event: string;
		conclusion: string;
	} | null;
	lastCountedRunId: number | null;
	stamps: Stamp[];
	upgrades: string[];
	corrections: Array<{ slug: string; was: string; now: string }>;
	note: string;
};

async function main() {
	// 1. lane run history (the workflow is the lane's clock)
	const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
	let lastRun: Snapshot["lastRun"] = null;
	if (token) {
		const r = await fetch(
			"https://api.github.com/repos/Stellar-Light/stellarlight/actions/workflows/curate-projects.yml/runs?per_page=10&status=completed",
			{ headers: { ...UA, Authorization: `Bearer ${token}` } },
		);
		if (r.ok) {
			const d = (await r.json()) as {
				workflow_runs?: Array<{
					id: number;
					event: string;
					conclusion: string;
					run_started_at: string;
				}>;
			};
			const run = (d.workflow_runs ?? [])[0];
			if (run)
				lastRun = {
					id: run.id,
					at: run.run_started_at,
					event: run.event,
					conclusion: run.conclusion,
				};
		}
	} else {
		console.warn("⚠ no GH_TOKEN — lastRun unrefreshed (kept from snapshot)");
	}

	// 2. the lane's current write-set, from the live API
	const stamps: Stamp[] = [];
	for (let page = 1; ; page++) {
		const r = await fetch(
			`https://stellarlight.xyz/api/projects?where%5Bdeployment.basis%5D%5Bequals%5D=${LANE}&limit=100&page=${page}&depth=0`,
			{ headers: UA },
		);
		if (!r.ok) throw new Error(`live API ${r.status}`);
		const d = (await r.json()) as {
			docs: Array<{ slug: string; deployment?: { network?: string } }>;
			hasNextPage: boolean;
		};
		for (const doc of d.docs)
			stamps.push({
				slug: doc.slug,
				network: doc.deployment?.network ?? "unknown",
			});
		if (!d.hasNextPage) break;
	}
	stamps.sort((a, b) => a.slug.localeCompare(b.slug));

	// 3. diff against the committed previous snapshot
	let prev: Snapshot | null = null;
	try {
		prev = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Snapshot;
	} catch {
		/* first run seeds the snapshot */
	}
	if (!lastRun && prev) lastRun = prev.lastRun;

	const nowBySlug = new Map(stamps.map((s) => [s.slug, s.network]));
	const upgrades: string[] = [];
	const corrections: Snapshot["corrections"] = [];
	for (const was of prev?.stamps ?? []) {
		const now = nowBySlug.get(was.slug);
		if (now === was.network) continue;
		// disappeared from the lane's set — upgrade or correction?
		const r = await fetch(
			`https://stellarlight.xyz/api/projects?where%5Bslug%5D%5Bequals%5D=${encodeURIComponent(was.slug)}&limit=1&depth=0`,
			{ headers: UA },
		);
		const doc = ((await r.json()) as { docs: Array<Record<string, any>> })
			.docs[0];
		const dep = doc?.deployment ?? {};
		if (dep.basis === "human-verified" && dep.network === was.network) {
			upgrades.push(was.slug); // the ladder working, still a clean week
		} else {
			corrections.push({
				slug: was.slug,
				was: `${LANE}/${was.network}`,
				now: dep.basis ? `${dep.basis}/${dep.network}` : "(no deployment)",
			});
		}
	}

	// the counter
	let cleanWeeks = prev?.cleanWeeks ?? 0;
	let lastCountedRunId = prev?.lastCountedRunId ?? null;
	if (corrections.length || (lastRun && lastRun.conclusion !== "success")) {
		cleanWeeks = 0;
	} else if (
		lastRun &&
		lastRun.event === "schedule" &&
		lastRun.conclusion === "success" &&
		lastRun.id !== lastCountedRunId
	) {
		cleanWeeks++;
		lastCountedRunId = lastRun.id;
	}

	const out: Snapshot = {
		lane: LANE,
		generatedAt: new Date().toISOString(),
		stage: 1,
		cleanWeeks,
		stageEntryThresholdWeeks: 2,
		lastRun,
		lastCountedRunId,
		stamps,
		upgrades,
		corrections,
		note: "QUALITY.md §3: Stage 2 (auto-merge for bounded work) opens at 2 consecutive intervention-free weeks. A correction (stamp removed or network changed by a human) resets the counter; an upgrade to human-verified on the same network does not. Only successful SCHEDULED runs advance the counter — the weekly cadence is the clock.",
	};
	writeFileSync(SNAPSHOT, `${JSON.stringify(out, null, 1)}\n`);
	console.log(
		`lane ${LANE}: ${stamps.length} stamps · cleanWeeks ${cleanWeeks}/${out.stageEntryThresholdWeeks} · ${corrections.length} correction(s) · ${upgrades.length} upgrade(s) · lastRun ${lastRun ? `${lastRun.event}/${lastRun.conclusion} ${lastRun.at.slice(0, 10)}` : "unknown"}`,
	);
	if (corrections.length)
		for (const c of corrections)
			console.log(`  ✗ correction: ${c.slug} ${c.was} → ${c.now}`);
}

main().catch((err) => {
	console.error("lane-scoreboard FATAL:", err);
	process.exit(1);
});
