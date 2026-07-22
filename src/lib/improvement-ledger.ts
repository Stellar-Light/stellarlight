/**
 * The improvement ledger — the SPINE that ties every quality detector together.
 *
 * We have a dozen detectors (Engines A–E, the guard, golden eval, drift checks,
 * the through-Raven batteries) and a dashboard (/quality) and a paper trail
 * (improvements/) — but until now each detector just dumped its own JSON and
 * nothing carried a single finding from detection → fix wave → verified →
 * lesson with a traceable id. interlock-spec §3 designed exactly this ("the
 * findings ledger IS improvements/ — dated runs, fix waves referencing finding
 * ids") and it was never wired. This is the wiring.
 *
 * Every detector becomes a FEEDER: its findings are normalized into one shape,
 * tagged with the SURFACE they belong to (retrieval / code / directory /
 * anchors / scf / onchain / contract / consumer / corpus — the surface area is
 * large now, so "where are we weakest?" is only answerable per-surface), and
 * upserted into one status-tracked ledger. /quality renders the ledger's own
 * health as a row; waves and lessons reference finding ids.
 *
 * This module is PURE (schema + normalize/rank/summarize) so both the
 * orchestrator script AND src/lib/quality-artifacts.ts can import it. No IO,
 * no node-only APIs — quality-artifacts is server-rendered and must stay light.
 */

/** The quality surfaces our detectors span. A finding belongs to exactly one. */
export const SURFACES = [
	"retrieval", // search recall / routing / ranking
	"code", // repos, codeDepth, code-signals
	"directory", // projects: status, dupes, tags, field population
	"anchors", // corridors, stellar.toml, SEP coverage
	"scf", // funding membership / rounds cross-check
	"onchain", // TVL / supply / holders freshness + accuracy
	"contract", // OpenAPI ⇄ live behaviour (params/fields honesty)
	"consumer", // through-Raven: routing, envelope, coaching dead-ends
	"corpus", // research chunk hygiene (junk urls, titles, coverage)
] as const;
export type Surface = (typeof SURFACES)[number];

/**
 * A finding's lifecycle. `cleared` is AUTOMATIC — the detector that raised it
 * no longer reports it on a later run (soft-fixed); `verified` is DELIBERATE —
 * a human/re-run confirmed the fix. Both count toward the closing rate, but
 * `verified` is the strong signal.
 */
export type FindingStatus =
	| "open"
	| "in-wave"
	| "fixed"
	| "verified"
	| "cleared";

export type Severity = "high" | "medium" | "low";

export interface Finding {
	/** Stable, readable id: `${source}:${slug(probe)}` — dedupe key across runs. */
	id: string;
	/** The detector that raised it (golden-eval, engine-d-demand, raven-loop, …). */
	source: string;
	surface: Surface;
	/** What failed — a question, a record slug, a param, an op id. */
	probe: string;
	/** How it failed — empty / mis-routed / overstated / dupe / stale / … */
	failureMode: string;
	detail?: string;
	severity: Severity;
	/** First run that raised it (ISO). Preserved across upserts. */
	firstSeen: string;
	/** Most recent run that still raised it (ISO). */
	lastSeen: string;
	status: FindingStatus;
	/** Wave file/id once assigned; set by hand when a wave picks it up. */
	wave?: string;
	fixedAt?: string;
	verifiedAt?: string;
	/** Set automatically when a detector stops reporting it. */
	clearedAt?: string;
	/** memory/lesson slug that generalized this finding, if any. */
	lessonRef?: string;
}

/** Status values that mean "no longer counts as an open problem". */
const CLOSED_STATUSES: ReadonlySet<FindingStatus> = new Set([
	"verified",
	"cleared",
]);
/** Status a human set deliberately — the orchestrator must never overwrite it. */
export const MANUAL_STATUSES: ReadonlySet<FindingStatus> = new Set([
	"in-wave",
	"fixed",
	"verified",
]);

export function isOpen(f: Finding): boolean {
	return !CLOSED_STATUSES.has(f.status);
}

/** URL/id-safe slug of a probe string, capped so ids stay readable. */
export function slugifyProbe(probe: string): string {
	return probe
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}

export function findingId(source: string, probe: string): string {
	return `${source}:${slugifyProbe(probe)}`;
}

const SEVERITY_WEIGHT: Record<Severity, number> = {
	high: 3,
	medium: 2,
	low: 1,
};

/** A high-severity finding open longer than this reads as neglected, not backlog. */
export const STALE_DAYS = 30;

function ageDays(iso: string, now: number): number {
	const t = Date.parse(iso);
	return Number.isNaN(t) ? 0 : Math.max(0, (now - t) / 86_400_000);
}

/**
 * Rank open findings for the backlog: severity first, then age (an old open
 * finding is a worse smell than a fresh one), then surface for stable grouping.
 * `now` is passed in so callers control the clock (tests / reproducibility).
 */
export function rankFindings(findings: Finding[], now: number): Finding[] {
	return [...findings].filter(isOpen).sort((a, b) => {
		const s = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
		if (s !== 0) return s;
		const age = ageDays(a.firstSeen, now) - ageDays(b.firstSeen, now);
		if (age !== 0) return -age; // older first
		return a.surface.localeCompare(b.surface);
	});
}

export interface LedgerSummary {
	generatedAt: string;
	total: number;
	open: number;
	closed: number;
	verified: number;
	cleared: number;
	/** Fraction of all findings ever seen that are now closed (verified+cleared). */
	closingRate: number;
	/** Age of the oldest still-open finding, in whole days. */
	oldestOpenDays: number;
	/** Open high-severity findings — the fires. */
	highOpen: number;
	/** High-severity findings left open beyond STALE_DAYS — the real failure:
	 *  a backlog is fine, a NEGLECTED fire is not. This is the row's ok-gate. */
	staleHighOpen: number;
	/** Open-finding counts per surface — "where are we weakest right now?". */
	bySurface: Array<{ surface: Surface; open: number; total: number }>;
	/** The current top of the ranked backlog (probe + surface + source). */
	topOpen: Array<{
		id: string;
		surface: Surface;
		source: string;
		probe: string;
		severity: Severity;
	}>;
}

/** Reduce the full ledger to the numbers /quality and the weekly row render. */
export function summarizeLedger(
	findings: Finding[],
	now: number,
	topN = 8,
): LedgerSummary {
	const total = findings.length;
	const open = findings.filter(isOpen).length;
	const verified = findings.filter((f) => f.status === "verified").length;
	const cleared = findings.filter((f) => f.status === "cleared").length;
	const closed = verified + cleared;

	let oldestOpenDays = 0;
	let highOpen = 0;
	let staleHighOpen = 0;
	for (const f of findings) {
		if (!isOpen(f)) continue;
		oldestOpenDays = Math.max(oldestOpenDays, ageDays(f.firstSeen, now));
		if (f.severity === "high") {
			highOpen++;
			if (ageDays(f.firstSeen, now) > STALE_DAYS) staleHighOpen++;
		}
	}

	const bySurface = SURFACES.map((surface) => {
		const rows = findings.filter((f) => f.surface === surface);
		return {
			surface,
			open: rows.filter(isOpen).length,
			total: rows.length,
		};
	})
		.filter((s) => s.total > 0)
		.sort((a, b) => b.open - a.open);

	const topOpen = rankFindings(findings, now)
		.slice(0, topN)
		.map((f) => ({
			id: f.id,
			surface: f.surface,
			source: f.source,
			probe: f.probe,
			severity: f.severity,
		}));

	return {
		generatedAt: new Date(now).toISOString(),
		total,
		open,
		closed,
		verified,
		cleared,
		closingRate: total > 0 ? Math.round((closed / total) * 100) / 100 : 1,
		oldestOpenDays: Math.round(oldestOpenDays),
		highOpen,
		staleHighOpen,
		bySurface,
		topOpen,
	};
}

/**
 * Upsert this run's freshly-detected findings into the prior ledger.
 *  - a NEW finding is added `open` with firstSeen = now.
 *  - a finding STILL present just has lastSeen bumped (status/wave/lesson kept).
 *  - a prior `open` finding ABSENT from this run's detected set is auto-`cleared`
 *    (its detector stopped flagging it — soft-fixed). Manual statuses
 *    (in-wave/fixed/verified) are NEVER auto-changed, and already-cleared stays.
 * `detectedBySource` lets clearing be scoped per detector, so one detector's
 * run never clears another detector's findings.
 */
export function upsertFindings(
	prior: Finding[],
	detected: Finding[],
	sourcesInThisRun: string[],
	nowIso: string,
): Finding[] {
	const runSources = new Set(sourcesInThisRun);
	const detectedById = new Map(detected.map((f) => [f.id, f]));
	const priorById = new Map(prior.map((f) => [f.id, f]));
	const out: Finding[] = [];

	// carry prior forward, updating
	for (const p of prior) {
		const still = detectedById.get(p.id);
		if (still) {
			out.push({ ...p, lastSeen: nowIso });
		} else if (runSources.has(p.source) && p.status === "open") {
			// this run covered p's detector but didn't re-raise it → soft-fixed
			out.push({ ...p, status: "cleared", clearedAt: nowIso });
		} else {
			out.push(p); // a detector we didn't run this time, or already closed
		}
	}
	// add genuinely new findings
	for (const d of detected) {
		if (!priorById.has(d.id)) {
			out.push({ ...d, firstSeen: nowIso, lastSeen: nowIso, status: "open" });
		}
	}
	return out;
}
