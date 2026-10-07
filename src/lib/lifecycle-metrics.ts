/**
 * Project lifecycle metrics: how many listed projects launched, how many of
 * those are alive now under several definitions of "alive", split SCF-funded
 * vs everyone else, by cohort, and (once a dated history exists) how many
 * projects alive on one day were still alive N days later.
 *
 * Pure: it reads dated snapshots of what the directory served
 * (data/snapshots/projects/<YYYY-MM-DD>.json.gz, written daily by
 * scripts/data/snapshot-project-status.ts) and returns the report. Nothing
 * here asserts a number the snapshots do not hold: a definition that has no
 * data yet says when it will.
 */

/** One project as the directory served it on the snapshot day. */
export interface SnapshotRow {
	slug: string;
	status: string;
	/** statusBasis: what the status rests on. */
	basis: string | null;
	asOf: string | null;
	/** Ever reached live (lifecycle.wasLive), for an Inactive project. */
	wasLive: boolean | null;
	/** Latest commit across the project's linked repos (YYYY-MM-DD). */
	lastActivity: string | null;
	/** SCF-funded per the official SCF record (scfAwarded). */
	scf: boolean;
	/** SCF award rounds, ascending; may be empty for an SCF project. */
	scfRounds: number[];
	/** deployment.network and its basis. */
	network: string | null;
	networkBasis: string | null;
	category: string | null;
	repos: number;
	/** First listed in the directory (YYYY-MM-DD); null = not read. */
	listed: string | null;
}

export interface Snapshot {
	date: string;
	projects: SnapshotRow[];
}

/** Statuses that rest on the product itself, not only on a page answering. */
export const STRONG_STATUS_BASES = [
	"repo-activity",
	"onchain-activity",
	"product-integration",
	"package-release",
	"operator-announcement",
	"human-verified",
] as const;

export const ACTIVE_WINDOW_DAYS = 180;

export const DEFINITIONS = {
	launched:
		"Reached live: status Live now, or Inactive with a record that it was live before. Development and pre-release projects have not launched.",
	markedLive: "Status Live, on any evidence.",
	liveOnStrongEvidence:
		"Status Live where the status rests on the product itself (repo activity, on-chain activity, a product integration, a package release, an operator announcement or a human check), not only on its website answering.",
	observedActive: `A commit in a linked repo within ${ACTIVE_WINDOW_DAYS} days of the snapshot, or a mainnet deployment observed through on-chain activity.`,
	noActivityData:
		"Launched, with no linked repo commit and no on-chain deployment record: alive or not, we cannot observe it.",
} as const;

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) =>
	Math.round((Date.parse(b) - Date.parse(a)) / DAY);

export const isLaunched = (p: SnapshotRow) =>
	p.status === "Live" || (p.status === "Inactive" && p.wasLive === true);
export const isMarkedLive = (p: SnapshotRow) => p.status === "Live";
export const isLiveOnStrongEvidence = (p: SnapshotRow) =>
	p.status === "Live" &&
	(STRONG_STATUS_BASES as readonly string[]).includes(p.basis ?? "");
const onchainLive = (p: SnapshotRow) =>
	p.network === "mainnet" && p.networkBasis === "onchain-activity";
export const isObservedActive = (p: SnapshotRow, date: string) =>
	onchainLive(p) ||
	(p.lastActivity !== null &&
		daysBetween(p.lastActivity, date) <= ACTIVE_WINDOW_DAYS);

export interface GroupCounts {
	listed: number;
	launched: number;
	markedLive: number;
	liveOnStrongEvidence: number;
	observedActive: number;
	noActivityData: number;
}

function count(rows: SnapshotRow[], date: string): GroupCounts {
	const launched = rows.filter(isLaunched);
	return {
		listed: rows.length,
		launched: launched.length,
		markedLive: launched.filter(isMarkedLive).length,
		liveOnStrongEvidence: launched.filter(isLiveOnStrongEvidence).length,
		observedActive: launched.filter((p) => isObservedActive(p, date)).length,
		noActivityData: launched.filter(
			(p) => p.lastActivity === null && !onchainLive(p),
		).length,
	};
}

const isScf = (p: SnapshotRow) => p.scf;

export function scfEra(firstRound: number | undefined): string {
	if (firstRound === undefined) return "round unknown";
	if (firstRound <= 15) return "rounds 1-15";
	if (firstRound <= 30) return "rounds 16-30";
	if (firstRound <= 45) return "rounds 31-45";
	return "rounds 46+";
}

type AliveDef = "markedLive" | "liveOnStrongEvidence" | "observedActive";
const ALIVE: Record<AliveDef, (p: SnapshotRow, date: string) => boolean> = {
	markedLive: (p) => isMarkedLive(p),
	liveOnStrongEvidence: (p) => isLiveOnStrongEvidence(p),
	observedActive: (p, d) => isObservedActive(p, d),
};

export interface SurvivalReading {
	from: string;
	to: string;
	days: number;
	group: "all" | "scf" | "nonScf";
	definition: AliveDef;
	aliveAtStart: number;
	stillAlive: number;
}

export interface LifecycleReport {
	latestSnapshot: string;
	historyStart: string;
	snapshots: number;
	definitions: typeof DEFINITIONS;
	groups: { all: GroupCounts; scf: GroupCounts; nonScf: GroupCounts };
	cohorts: {
		scfByFirstRound: Array<{ cohort: string } & GroupCounts>;
		nonScfByListedYear: Array<{ cohort: string } & GroupCounts>;
	};
	changes: {
		since: string;
		newlyLaunched: string[];
		newlyInactive: string[];
		revived: string[];
	};
	survival: {
		windowDays: number;
		availableFrom: string;
		readings: SurvivalReading[];
	};
}

/**
 * Pure. `history` in any order; the latest snapshot sets the current counts.
 * Survival pairs each snapshot with the one `windowDays` later (up to a week
 * late, a missed run is not a death) and follows the same slugs: a project
 * missing from the later snapshot counts as not alive, since a published
 * project that leaves the directory has ended or been merged.
 */
export function lifecycleMetrics(
	history: Snapshot[],
	windowDays = ACTIVE_WINDOW_DAYS,
): LifecycleReport {
	if (!history.length) throw new Error("no snapshots");
	const snaps = [...history].sort((a, b) => a.date.localeCompare(b.date));
	const first = snaps[0];
	const latest = snaps[snaps.length - 1];
	const rows = latest.projects;
	const scf = rows.filter(isScf);
	const nonScf = rows.filter((p) => !isScf(p));

	const byKey = <T extends string>(
		list: SnapshotRow[],
		key: (p: SnapshotRow) => T,
	) => {
		const m = new Map<T, SnapshotRow[]>();
		for (const p of list) m.set(key(p), [...(m.get(key(p)) ?? []), p]);
		return (
			[...m.entries()]
				// Known cohorts in order, the unknown bucket last.
				.sort(
					([a], [b]) =>
						Number(a.includes("unknown")) - Number(b.includes("unknown")) ||
						a.localeCompare(b, undefined, { numeric: true }),
				)
				.map(([cohort, ps]) => ({ cohort, ...count(ps, latest.date) }))
		);
	};

	const firstBySlug = new Map(first.projects.map((p) => [p.slug, p]));
	const changes = {
		since: first.date,
		newlyLaunched: rows
			.filter((p) => {
				const was = firstBySlug.get(p.slug);
				return isLaunched(p) && (!was || !isLaunched(was));
			})
			.map((p) => p.slug),
		newlyInactive: rows
			.filter(
				(p) =>
					p.status === "Inactive" && firstBySlug.get(p.slug)?.status === "Live",
			)
			.map((p) => p.slug),
		revived: rows
			.filter(
				(p) =>
					p.status === "Live" && firstBySlug.get(p.slug)?.status === "Inactive",
			)
			.map((p) => p.slug),
	};

	const readings: SurvivalReading[] = [];
	for (const start of snaps) {
		const end = snaps.find((s) => {
			const d = daysBetween(start.date, s.date);
			return d >= windowDays && d <= windowDays + 7;
		});
		if (!end) continue;
		const later = new Map(end.projects.map((p) => [p.slug, p]));
		for (const group of ["all", "scf", "nonScf"] as const) {
			const pool = start.projects.filter((p) =>
				group === "all" ? true : group === "scf" ? isScf(p) : !isScf(p),
			);
			for (const definition of Object.keys(ALIVE) as AliveDef[]) {
				const alive = pool.filter((p) => ALIVE[definition](p, start.date));
				readings.push({
					from: start.date,
					to: end.date,
					days: daysBetween(start.date, end.date),
					group,
					definition,
					aliveAtStart: alive.length,
					stillAlive: alive.filter((p) => {
						const q = later.get(p.slug);
						return !!q && ALIVE[definition](q, end.date);
					}).length,
				});
			}
		}
	}

	return {
		latestSnapshot: latest.date,
		historyStart: first.date,
		snapshots: snaps.length,
		definitions: DEFINITIONS,
		groups: {
			all: count(rows, latest.date),
			scf: count(scf, latest.date),
			nonScf: count(nonScf, latest.date),
		},
		cohorts: {
			scfByFirstRound: byKey(scf, (p) => scfEra(p.scfRounds[0])),
			nonScfByListedYear: byKey(nonScf, (p) =>
				p.listed ? p.listed.slice(0, 4) : "listed date unknown",
			),
		},
		changes,
		survival: {
			windowDays,
			availableFrom: new Date(Date.parse(first.date) + windowDays * DAY)
				.toISOString()
				.slice(0, 10),
			readings,
		},
	};
}
