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
 * a human/re-run confirmed the fix. Only `verified` and a `cleared` carrying a
 * live re-probe stamp (`clearedBy`) count toward the closing rate — a detector
 * merely going quiet is not repair.
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
	/** Set when an auto-cleared finding was raised again — the ledger CAN show
	 *  a regression, and this is the paper trail that it did. */
	reopenedAt?: string;
	/**
	 * A `verified` finding a detector raised AGAIN. `verified` is a human's
	 * assertion that the fix landed, so a re-raise is the strongest regression
	 * signal the ledger holds — and it used to be the quietest one. Sticky: a
	 * later wave re-asserting `verified` does not erase it.
	 */
	regressedFromVerified?: boolean;
	/** Set by the detector when the finding cannot be acted on from this
	 *  repo (an upstream consumer's stale catalog: "raven-catalog-lag"; its
	 *  scorer: "raven-scorer"). Open, carried, re-classified on every run —
	 *  and counted APART from the defect backlog, never inside it. */
	blockedOn?: string;
	/** Set only by the stale sweep, which clears on a live PASS. */
	clearedBy?: string | null;
	/** memory/lesson slug that generalized this finding, if any. */
	lessonRef?: string;
	/**
	 * When the detector RUN behind `lastSeen` actually executed (the artifact's
	 * own `generatedAt`), as distinct from when the orchestrator read the file.
	 *
	 * Without this, `lastSeen` freezes the moment a detector stops running and
	 * an unchecked finding is indistinguishable from a confirmed one. Absent =
	 * the detector doesn't stamp its artifact yet; treated as NOT fresh, never
	 * as fresh — an unknown age must never read as a recent confirmation.
	 */
	evidenceAt?: string;
}

/** Status values that mean "no longer counts as an open problem". */
const CLOSED_STATUSES: ReadonlySet<FindingStatus> = new Set([
	"verified",
	"cleared",
]);
/** Status a human set deliberately. The orchestrator never overwrites these on
 *  SILENCE; a detector re-raising a `verified` finding is the one exception,
 *  and it is flagged rather than quietly kept (see upsertFindings). */
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

/**
 * A synthetic / test / probe query — NOT real demand. Mining these as findings
 * manufactures fires on our own noise: health checks, eval probes, fat-finger
 * "test", `zzzznonexistent…` smoke queries. Conservative by design — only
 * clearly-synthetic strings, never an ambiguous-but-plausibly-real term (a
 * person handle, a token pair, a short project name like `stxlm` or `8004`).
 * Shared by the ledger's demand ingestion and the raven-loop demand phase so
 * the two filter identically.
 */
export function isSyntheticQuery(q: string): boolean {
	const s = q.trim().toLowerCase();
	if (s.length < 3) return true;
	if (["test", "testing", "hello", "foo", "bar", "asdf", "qwerty"].includes(s))
		return true;
	if (/nonexistent|zzz{2,}|^z{4,}|^(?:asdf|qwer)/.test(s)) return true;
	return false;
}

const SEVERITY_WEIGHT: Record<Severity, number> = {
	high: 3,
	medium: 2,
	low: 1,
};

/** A high-severity finding open longer than this reads as neglected, not backlog. */
export const STALE_DAYS = 30;

/**
 * How long a detector's evidence stays trustworthy. The engine detectors run
 * WEEKLY, so 10 days is one full cycle plus slack for a late or retried run —
 * the same "lag is not drift" grace the Raven catalog check uses. Past this,
 * a finding isn't refuted, it's simply UNCONFIRMED.
 */
export const EVIDENCE_GRACE_DAYS = 10;

/** 2-dp rounding for published rates — the board never shows float noise. */
const round2 = (n: number) => Math.round(n * 100) / 100;

function ageDays(iso: string, now: number): number {
	const t = Date.parse(iso);
	return Number.isNaN(t) ? 0 : Math.max(0, (now - t) / 86_400_000);
}

/**
 * Was this finding confirmed by a detector run recent enough to believe?
 *
 * Unknown `evidenceAt` returns false. Absence of a timestamp is absence of
 * proof — a detector that never says when it ran cannot be credited with
 * having run just now.
 */
export function hasFreshEvidence(f: Finding, now: number): boolean {
	if (!f.evidenceAt) return false;
	const t = Date.parse(f.evidenceAt);
	if (Number.isNaN(t)) return false;
	return ageDays(f.evidenceAt, now) <= EVIDENCE_GRACE_DAYS;
}

/**
 * Rank open findings for the backlog: severity, then CONFIRMED-ness, then age.
 *
 * The middle term is the one that matters and it was missing. Ranking used to
 * be severity → oldest-first, and `lastSeen` freezes the moment a detector
 * stops running — so a dead detector's findings aged forever and floated to
 * the TOP of the backlog, presented as the most urgent fires precisely because
 * nobody had checked them. Measured 2026-07-26: 24 open highs all traced to one
 * artifact 5 days past its weekly refresh; re-probing them live showed 13 were
 * already fixed. The board was pointing at a fire that was mostly out.
 *
 * So a finding a detector confirmed THIS cycle outranks one nobody has looked
 * at, at equal severity. Unconfirmed findings are demoted, never dropped —
 * "not re-checked" is not "resolved", and only the detector may clear it.
 */
export function rankFindings(findings: Finding[], now: number): Finding[] {
	return [...findings].filter(isOpen).sort((a, b) => {
		const s = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
		if (s !== 0) return s;
		const fresh =
			Number(hasFreshEvidence(b, now)) - Number(hasFreshEvidence(a, now));
		if (fresh !== 0) return fresh; // confirmed-this-cycle first
		const age = ageDays(a.firstSeen, now) - ageDays(b.firstSeen, now);
		if (age !== 0) return -age; // older first
		return a.surface.localeCompare(b.surface);
	});
}

/** One window of "we closed without repairing, and it came back in kind". */
export interface RecurrenceWindow {
	/** Findings FIRST SEEN inside the window — the denominator. */
	newFindings: number;
	/** Of those, how many repeat a (surface, failureMode) pair already closed ON
	 *  SILENCE before this finding was first seen. */
	recurred: number;
	ratePct: number;
}

/**
 * Did closed work come back? Three distinct questions, never one number.
 *
 * The number this replaces — "repeat-class rate", which called a new finding a
 * repeat when its §0 class had ANY prior finding — answered none of them. With
 * 8 broad classes over 527 findings, every new finding lands in a class that
 * has already fired, so the trailing-30d rate sat at 235/235 = 100% and
 * structurally could not fall. A metric that cannot move measures nothing. It
 * survives in the artifact as `classRecurrence`: context, not a target.
 */
export interface Recurrence {
	/** Exact-id recurrence: a closed finding a detector raised again. The paper
	 *  trail already existed (`reopenedAt`); this counts it. */
	reopened: number;
	/** `reopened` over everything ever closed. A LOWER BOUND: re-clearing a
	 *  reopened finding wipes its stamp, so those cycles are invisible. */
	reopenedShareOfClosures: number;
	/** `verified` findings a detector raised again — a human's fix that did not
	 *  hold. No false-positive story: someone asserted it landed, the detector
	 *  disagrees. */
	regressedFromVerified: number;
	/** Recurrence IN KIND: NEW findings on a (surface, failureMode) pair that was
	 *  closed on silence before they appeared. */
	recurredAfterSilence: {
		last30d: RecurrenceWindow;
		lifetime: RecurrenceWindow;
	};
}

export interface LedgerSummary {
	generatedAt: string;
	total: number;
	open: number;
	closed: number;
	verified: number;
	cleared: number;
	/** Cleared because a live re-probe PASSED — evidence, not silence. The
	 *  stale sweep stamps `clearedBy`, so this is a count of real checks. */
	clearedByReprobe: number;
	/** Cleared because a detector stopped reporting. That is NOT the same as
	 *  fixed, and conflating the two is how 3 SCF-funded projects we still do
	 *  not hold (kutana, etesia, octopos) sat in the closed column. This is the
	 *  re-probe backlog. */
	clearedOnSilence: number;
	/**
	 * Fraction of all findings ever seen that are closed ON EVIDENCE:
	 * `verified` (deliberately re-probed after a fix) plus `clearedByReprobe`
	 * (the stale sweep observed a live PASS). Silence-closes are NOT in the
	 * numerator. Measured 2026-09-05: 298 of 514 closures had never been
	 * re-checked, and folding them in printed 0.99 for a ledger where most
	 * "closed" meant "nobody asked again". They are published beside it as
	 * `silenceShare`, never hidden.
	 */
	closingRate: number;
	/** Share of ALL findings closed only because a detector went quiet — the
	 *  re-probe backlog, sized. Read next to `closingRate`, never instead. */
	silenceShare: number;
	/** Did closed work come back? See {@link Recurrence}. */
	recurrence: Recurrence;
	/** Age of the oldest still-open finding, in whole days. */
	oldestOpenDays: number;
	/** Findings a wave has picked up but not yet verified — work in progress. */
	inWave: number;
	/** Open high-severity findings — the fires. */
	highOpen: number;
	/** High-severity findings left open beyond STALE_DAYS — the real failure:
	 *  a backlog is fine, a NEGLECTED fire is not. This is the row's ok-gate. */
	staleHighOpen: number;
	/** Open-finding counts per surface — "where are we weakest right now?". */
	bySurface: Array<{ surface: Surface; open: number; total: number }>;
	/**
	 * Open findings resting on evidence older than the grace window (or with no
	 * timestamp at all) — carried, but NOT claimable as current problems.
	 */
	unverifiedOpen: number;
	/**
	 * Detectors that have gone quiet: still hold open findings, but their last
	 * run is past the grace window. A detector that stopped running is a
	 * DIFFERENT failure from data that got worse, and the board must not render
	 * them identically — one is a fire, the other is a blind spot.
	 * `days: null` = the detector has never stamped its artifact.
	 */
	quietSources: Array<{ source: string; open: number; days: number | null }>;
	/** Open rows that are a refresh, not a defect (see MAINTENANCE_MODES).
	 *  Counted separately so `open` stays a backlog someone can burn down;
	 *  never folded into it and never dropped. */
	refreshQueue: number;
	/** Open rows blocked on an upstream consumer (see Finding.blockedOn) —
	 *  counted apart from `open` so the backlog is what we can act on, and
	 *  never dropped. `blockedBy` names the blocker per count. */
	blockedUpstream: number;
	blockedBy: Record<string, number>;
	/** The current top of the ranked backlog (probe + surface + source). */
	topOpen: Array<{
		id: string;
		surface: Surface;
		source: string;
		probe: string;
		severity: Severity;
	}>;
}

/**
 * Failure modes that are a REFRESH QUEUE, not a defect backlog.
 *
 * A curated note saying "npm @bluxcc/react — 0.3.3 (asOf 2026-09-02)" is not
 * wrong when 0.3.5 ships: it is a dated claim that was true on its date, which
 * is the honesty rule this codebase applies everywhere else. What it needs is
 * a refresh, not a fix.
 *
 * 118 of 290 public notes cite a version, and upstream publishes continuously
 * — x402 shipped three releases in a day, bluxcc two in two days. Counting
 * that as an open finding means `open` can never reach zero no matter how much
 * real work is done, and a backlog that always shows red is one nobody reads.
 * So these are tracked in their own counter, never hidden: `refreshQueue`
 * carries them, `open` means defects we can actually act on.
 */
export const MAINTENANCE_MODES = new Set([
	"note-stale",
	// An archived curated-pool repo with no supersession entry yet: a curation
	// refresh (read the banner, record the successor), not a served defect.
	"supersession-unrecorded",
]);

export const isMaintenance = (f: Finding) =>
	MAINTENANCE_MODES.has(f.failureMode);

/** An open row we cannot act on here — waiting on an upstream consumer. */
export const isBlocked = (f: Finding) => isOpen(f) && !!f.blockedOn;

/** An open row that is a real defect — excludes the refresh queue. */
export const isOpenDefect = (f: Finding) =>
	isOpen(f) && !isMaintenance(f) && !f.blockedOn;

/** Reduce the full ledger to the numbers /quality and the weekly row render. */
export function summarizeLedger(
	findings: Finding[],
	now: number,
	topN = 8,
): LedgerSummary {
	const total = findings.length;
	const open = findings.filter(isOpenDefect).length;
	const refreshQueue = findings.filter(
		(f) => isOpen(f) && isMaintenance(f),
	).length;
	const blockedRows = findings.filter(isBlocked);
	const blockedUpstream = blockedRows.length;
	const blockedBy: Record<string, number> = {};
	for (const f of blockedRows)
		blockedBy[f.blockedOn as string] =
			(blockedBy[f.blockedOn as string] ?? 0) + 1;
	const verified = findings.filter((f) => f.status === "verified").length;
	const clearedRows = findings.filter((f) => f.status === "cleared");
	const cleared = clearedRows.length;
	// `clearedBy` is stamped only by the stale sweep, which clears solely on a
	// PASS observed live. Its absence means the ledger's own auto-clear fired —
	// the detector went quiet, which is indistinguishable from nobody asking
	// again.
	const clearedByReprobe = clearedRows.filter((f) => !!f.clearedBy).length;
	const clearedOnSilence = cleared - clearedByReprobe;

	// ── recurrence: did closed work come back? ──
	// Earliest SILENCE-close per (surface, failureMode). A pair closed only
	// because a detector went quiet, then raised again under a NEW id, is this
	// ledger's own definition of having closed something without repairing it.
	const silenceClosedAt = new Map<string, string>();
	for (const f of clearedRows) {
		if (f.clearedBy || !f.clearedAt) continue;
		const k = `${f.surface}|${f.failureMode}`;
		const prev = silenceClosedAt.get(k);
		if (!prev || f.clearedAt < prev) silenceClosedAt.set(k, f.clearedAt);
	}
	// `windowDays === null` is the lifetime window. The silence-close must
	// predate `firstSeen`, or every row of a pair would mark every other row —
	// itself included — and the number would just count pair membership.
	const afterSilence = (windowDays: number | null): RecurrenceWindow => {
		const cutoff =
			windowDays === null
				? null
				: new Date(now - windowDays * 86_400_000).toISOString();
		const fresh =
			cutoff === null
				? findings
				: findings.filter((f) => f.firstSeen >= cutoff);
		const recurred = fresh.filter((f) => {
			const at = silenceClosedAt.get(`${f.surface}|${f.failureMode}`);
			return at !== undefined && at < f.firstSeen;
		}).length;
		return {
			newFindings: fresh.length,
			recurred,
			ratePct: fresh.length
				? Math.round((recurred / fresh.length) * 1000) / 10
				: 0,
		};
	};
	// Everything ever closed that the ledger can still tell WAS closed: rows
	// closed now, plus rows a reopen pulled back out. Re-clearing a reopened
	// finding wipes `reopenedAt` (see upsertFindings), so both are lower bounds.
	const reopened = findings.filter((f) => !!f.reopenedAt).length;
	const everClosed = findings.filter(
		(f) => !isOpen(f) || !!f.reopenedAt,
	).length;
	const recurrence: Recurrence = {
		reopened,
		reopenedShareOfClosures: everClosed > 0 ? round2(reopened / everClosed) : 0,
		regressedFromVerified: findings.filter((f) => f.regressedFromVerified)
			.length,
		recurredAfterSilence: {
			last30d: afterSilence(30),
			lifetime: afterSilence(null),
		},
	};
	const inWave = findings.filter(
		(f) => f.status === "in-wave" || f.status === "fixed",
	).length;
	const closed = verified + cleared;

	let oldestOpenDays = 0;
	let highOpen = 0;
	let staleHighOpen = 0;
	for (const f of findings) {
		if (!isOpenDefect(f)) continue;
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
			open: rows.filter(isOpenDefect).length,
			total: rows.length,
		};
	})
		.filter((s) => s.total > 0)
		.sort((a, b) => b.open - a.open);

	// Evidence freshness, per finding and rolled up per detector. A source is
	// "quiet" only if it still holds OPEN findings — a detector with nothing
	// outstanding has nothing to re-confirm, so its silence proves nothing and
	// accusing it would be noise.
	let unverifiedOpen = 0;
	const perSource = new Map<string, { open: number; newest: number | null }>();
	for (const f of findings) {
		if (!isOpen(f)) continue;
		if (!hasFreshEvidence(f, now)) unverifiedOpen++;
		const row = perSource.get(f.source) ?? { open: 0, newest: null };
		row.open++;
		const t = f.evidenceAt ? Date.parse(f.evidenceAt) : Number.NaN;
		if (!Number.isNaN(t)) row.newest = Math.max(row.newest ?? t, t);
		perSource.set(f.source, row);
	}
	const quietSources = [...perSource.entries()]
		.map(([source, r]) => ({
			source,
			open: r.open,
			days:
				r.newest === null ? null : Math.round((now - r.newest) / 86_400_000),
		}))
		.filter((s) => s.days === null || s.days > EVIDENCE_GRACE_DAYS)
		.sort(
			(a, b) =>
				(b.days ?? Number.MAX_SAFE_INTEGER) -
				(a.days ?? Number.MAX_SAFE_INTEGER),
		);

	// The ranked backlog is defects only — a refresh-queue row outranking real
	// work would put "npm published 0.3.5" at the top of the board.
	const topOpen = rankFindings(
		findings.filter((f) => !isMaintenance(f)),
		now,
	)
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
		refreshQueue,
		blockedUpstream,
		blockedBy,
		closed,
		verified,
		cleared,
		clearedByReprobe,
		clearedOnSilence,
		// An EMPTY ledger scores 0, not 1. No findings is no evidence of repair,
		// and a vacuous denominator must never render as a perfect score.
		closingRate: total > 0 ? round2((verified + clearedByReprobe) / total) : 0,
		silenceShare: total > 0 ? round2(clearedOnSilence / total) : 0,
		recurrence,
		oldestOpenDays: Math.round(oldestOpenDays),
		inWave,
		highOpen,
		staleHighOpen,
		bySurface,
		unverifiedOpen,
		quietSources,
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
 *  - a CLOSED finding the detector raises AGAIN reopens: `cleared` outright,
 *    `verified` with a sticky `regressedFromVerified` flag (the asserted fix
 *    did not hold). in-wave/fixed are work in progress and stay put.
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
	const out: Finding[] = [];
	// `seen` guarantees the OUTPUT has unique ids — the single invariant. A
	// finding id can be doubled two ways: a detector emits the same probe on two
	// endpoints (`strupey` as projects-miss AND builders-miss → identical id), or
	// an earlier buggy run already persisted a duplicate into `prior`. Either way
	// the first occurrence wins and the rest collapse.
	const seen = new Set<string>();

	// carry prior forward, updating (collapsing any pre-existing duplicate ids)
	for (const p of prior) {
		if (seen.has(p.id)) continue;
		seen.add(p.id);
		const still = detectedById.get(p.id);
		if (still) {
			// RE-RAISED. A finding the detector is reporting again is not closed.
			//
			// This branch preserved `status`, so an auto-`cleared` finding that
			// came back stayed cleared forever — the ledger could record a
			// regression but never show one. Measured 2026-08-31 before the fix:
			// 191 of 406 cleared findings had a `lastSeen` AFTER their
			// `clearedAt`, meaning the detector had re-raised them while the board
			// counted them closed. usdc-swap and stellars-finance were cleared on
			// 08-28 and re-detected on 08-31, still sitting in the closed column.
			//
			// Combined with auto-clear-on-silence, the pair made "closed" mean
			// "nobody asked recently" in both directions: silence closes, and
			// noise does not reopen.
			//
			// `cleared` reopens outright. `verified` reopens AND is flagged: it is
			// a human's assertion that the fix landed, so a detector raising it
			// again is the strongest regression signal here — and until 2026-09-05
			// it was the quietest. This branch left a re-raised `verified` wholly
			// untouched; the only trace was applyWaves' `suspectVerified` console
			// warning in the nightly run, which reaches neither the ledger, nor
			// the summary, nor the board. Every `verified` row carries a wave, so
			// applyWaves re-asserts `verified` immediately after this — the
			// durable signal is the sticky flag and the reopen stamp, both of
			// which the summary counts.
			//
			// in-wave and fixed are still never auto-changed: they say work is
			// underway, and a detector still reporting them is expected.
			const reopens = p.status === "cleared";
			const regressed = p.status === "verified";
			out.push({
				...p,
				...(reopens
					? {
							status: "open" as const,
							clearedAt: undefined,
							clearedBy: undefined,
							reopenedAt: nowIso,
						}
					: {}),
				...(regressed
					? {
							status: "open" as const,
							// keep the FIRST stamp: applyWaves restores the wave's
							// `verified` every run, so re-stamping would churn the
							// committed ledger nightly for no new information.
							reopenedAt: p.reopenedAt ?? nowIso,
							regressedFromVerified: true as const,
						}
					: {}),
				// Re-raised: take THIS run's evidence stamp. `lastSeen` alone can't
				// say whether the detector genuinely re-ran or the orchestrator just
				// re-read a stale artifact — `evidenceAt` comes from the artifact
				// itself, so it only advances when the detector actually did.
				// The blocker is re-read from THIS run's detection: a lag that clears
				// or a class that changes must move the row between buckets.
				blockedOn: still.blockedOn,
				lastSeen: nowIso,
				evidenceAt: still.evidenceAt,
			});
		} else if (runSources.has(p.source) && p.status === "open") {
			// this run covered p's detector but didn't re-raise it → soft-fixed.
			// evidenceAt must date the evidence FOR the current status — here,
			// "the detector went quiet on THIS run" — not the failing run that
			// opened the finding. And a closed row must not carry reopenedAt:
			// left in place, a reopen-then-reclear cycle reads as open-ish
			// history on a closed row.
			out.push({
				...p,
				status: "cleared",
				clearedAt: nowIso,
				evidenceAt: nowIso,
				reopenedAt: undefined,
			});
		} else {
			out.push(p); // a detector we didn't run this time, or already closed
		}
	}
	// add genuinely new findings (ids not already carried forward), deduped too
	for (const d of detected) {
		if (seen.has(d.id)) continue;
		seen.add(d.id);
		out.push({ ...d, firstSeen: nowIso, lastSeen: nowIso, status: "open" });
	}
	return out;
}

// ── Slice 3: waves close the loop ───────────────────────────────────────────
// A wave manifest DECLARES which finding-ids it resolves and to what status —
// the deliberate transitions (in-wave / fixed / verified) a human/fix asserts,
// vs the automatic `cleared`. Manifests are committed files (git-tracked paper
// trail) that reference finding-ids; the orchestrator applies them each run so
// /quality's closing rate reflects real detect→verified work, not just
// auto-clear. A wave carries an optional lesson slug so a finding links to the
// durable lesson it generalized.

export interface WaveEntry {
	id: string;
	status: "in-wave" | "fixed" | "verified";
	note?: string;
}
export interface WaveManifest {
	/** short wave id/slug, e.g. "contract-overdoc-cleanup". */
	wave: string;
	date: string;
	/** memory/lesson slug this wave produced, if any. */
	lesson?: string;
	findings: WaveEntry[];
}

/**
 * Overlay the deliberate wave statuses onto the ledger. A wave's assertion wins
 * over the detector's auto-status (a human said "this is fixed"). Returns the
 * updated findings plus:
 *  - `unmatched`: wave entries whose finding-id isn't in the ledger (typo /
 *    stale wave — surfaced, never silently dropped).
 *  - `suspectVerified`: ids a wave marked `verified` that a detector STILL
 *    reports this run — the fix didn't take; the loop must not claim victory.
 */
export function applyWaves(
	findings: Finding[],
	manifests: WaveManifest[],
	stillDetectedIds: ReadonlySet<string>,
	nowIso: string,
): { findings: Finding[]; unmatched: string[]; suspectVerified: string[] } {
	const out = findings.map((f) => ({ ...f }));
	const byId = new Map(out.map((f) => [f.id, f]));
	const unmatched: string[] = [];
	const suspectVerified: string[] = [];

	for (const m of manifests) {
		for (const e of m.findings) {
			const f = byId.get(e.id);
			if (!f) {
				unmatched.push(e.id);
				continue;
			}
			f.status = e.status;
			f.wave = m.wave;
			if (m.lesson) f.lessonRef = m.lesson;
			if (e.note) f.detail = e.note;
			if (e.status === "fixed" || e.status === "verified") {
				f.fixedAt = f.fixedAt ?? nowIso;
			}
			if (e.status === "verified") {
				// preserve the FIRST verification time (like fixedAt) — re-stamping
				// it every run is pure git churn and loses when it was confirmed.
				f.verifiedAt = f.verifiedAt ?? nowIso;
				if (stillDetectedIds.has(e.id)) suspectVerified.push(e.id);
			}
		}
	}
	return { findings: out, unmatched, suspectVerified };
}
