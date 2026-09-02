/**
 * GET /api/quality — this service's own quality report, machine-readable.
 *
 * The /quality PAGE is for people; this is the same committed measurements
 * for the agent that has to decide how much to trust a result. It is a
 * SELF-REPORT and says so: knownLimitations is derived from our own numbers
 * (if a number improves the sentence changes or disappears), never authored
 * copy, and nothing here is a marketing claim.
 *
 * The `verdict` block is deliberately first and deliberately small. A caller
 * deciding "can I trust this answer?" should not have to read 900 lines of
 * breakdowns to find out, and the two lists it carries — what is safe to rely
 * on and what is not — are derived from the same numbers as everything below.
 *
 * No query parameters — the whole report is small and cacheable.
 */
import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { unknownParamWarning } from "@/lib/http-params";
import {
	getEntities,
	getExternalFindings,
	getGuardRows,
	getMissFunnel,
	getNorthStar,
	getOperationQuality,
	getProgress,
} from "@/lib/quality-artifacts";
import { getAppUrl } from "@/lib/utils/app-url";
import { API_VERSION } from "@/lib/version";
import qualityHistory from "../../../../improvements/quality/history.json";

export const revalidate = 3600;

const CACHE_SECONDS = 3600;
const STALE_SECONDS = 86400;

export async function GET(req: NextRequest) {
	const paramWarning = unknownParamWarning(req.nextUrl.searchParams, [], {
		advertise: [],
		hint: "This report takes no parameters — the whole document is returned.",
	});
	const e = getEntities();
	const guards = getGuardRows();
	const northStar = getNorthStar();
	const external = getExternalFindings();
	const funnel = getMissFunnel();
	const ops = getOperationQuality();

	const breached = guards.filter((g) => g.state === "breached");
	const stale = guards.filter((g) => g.state === "stale");
	const holding = guards.filter((g) => g.state === "holding");

	logApiHit({ req, endpoint: "/api/quality" });
	return NextResponse.json(
		{
			meta: {
				source: `${getAppUrl()}/api/quality`,
				generatedAt: new Date().toISOString(),
				measuredAt: e.generatedAt,
				apiVersion: API_VERSION,
				humanPage: `${getAppUrl()}/quality`,
				methodology:
					"A SELF-REPORT built from committed artifacts: the findings ledger every detector writes to, plus a CENSUS of project rows and indexed repos read from the unranked listing endpoints. knownLimitations is DERIVED from these numbers, not authored. Entity counts are censuses and carry their population; guard rows are point-in-time measurements and carry their own age, so a number that has gone stale says so rather than reading as current.",
				cachePolicy: `Cached ${CACHE_SECONDS}s, and served stale for up to ${STALE_SECONDS}s while revalidating, so a response can be up to ${Math.round((CACHE_SECONDS + STALE_SECONDS) / 3600)} hours old. Use meta.measuredAt and each section's own asOf, never the time you received this.`,
				...(paramWarning ? { warnings: [paramWarning] } : {}),
			},

			/** READ THIS FIRST. Everything below is the evidence for it. */
			verdict: {
				guardsHolding: holding.length,
				guardsBreached: breached.length,
				guardsStale: stale.length,
				openFindings: e.findings.open,
				/** the ONE definition of open used everywhere in this document */
				openDefinition:
					"A finding whose probe still reproduced on the most recent run of its detector. open + cleared + verified = total, disjoint.",
				projectRows: e.projects.population,
				meanRowEvidence: e.projects.meanScore,
				safeToRelyOn: [
					...holding.map((g) => `${g.title}: ${g.promise}`),
					`Project row coverage: this report reads all ${e.projects.population} rows, not a search-mediated sample, so no row is excluded by being hard to retrieve.`,
				],
				doNotRelyOn: [
					...breached.map(
						(g) => `${g.title} is BREACHED (${g.value}): ${g.promise}`,
					),
					...stale.map(
						(g) =>
							`${g.title} is STALE: last measured ${g.ageDays} days ago, past its ${g.freshnessDays}-day window. Neither passing nor failing, unmeasured.`,
					),
					...(northStar.warning ? [`North star: ${northStar.warning}`] : []),
					...(funnel.population.unclassified
						? [
								`Miss funnel covers ${funnel.population.coveragePct}% of open recall findings; ${funnel.population.unclassified} have probe shapes it cannot replay.`,
							]
						: []),
					...(e.repos.duplicateRows
						? [`Repo storage: ${e.repos.duplicateNote}`]
						: []),
				],
			},

			/** The one number the whole engine system optimizes, with its age.
			 * `warning` is non-null whenever this number should not be read as
			 * current, and the page is required to show it. */
			northStar,

			/** Where this service is against its own published quality plan.
			 * Phase state is read from QUALITY.md and remaining work is served
			 * with the same weight as finished work. */
			progress: getProgress().phases,
			/** The written record behind the numbers: lesson write-ups per
			 * defect class, committed fetch receipts for human-verified
			 * corrections, and audit reports. */
			library: getProgress().library,
			/** Read this first: what we are weak at, measured, with the
			 * recommended alternative for each. */
			knownLimitations: e.knownLimitations,

			/** Per-OPERATION quality, keyed by the operationId a caller actually
			 * invokes. `unmeasured` means the contract probe never reached it —
			 * that is absence of measurement, not a clean bill. */
			perOperation: {
				definition:
					"One row per operationId. contractProbe is the verdict of the last contract-honesty probe: clean (reached, no violations), violations (reached, found these), skipped (the probe could not check it, with the reason), or unmeasured (the probe never reached it). An unmeasured operation is NOT a passing one.",
				probedAt: "2026-07-11",
				counts: {
					clean: ops.filter((o) => o.contractProbe === "clean").length,
					violations: ops.filter((o) => o.contractProbe === "violations").length,
					skipped: ops.filter((o) => o.contractProbe === "skipped").length,
					unmeasured: ops.filter((o) => o.contractProbe === "unmeasured").length,
				},
				operations: ops,
			},

			/** Defects filed against us by our largest agent consumer, from THEIR
			 * evaluation battery. `counts` is their answer key. `ourResponse` is
			 * our own issue state and is fenced off from it deliberately: a score
			 * computed from a variable we control is not an external grade. */
			consumerFindings: external,

			/** Every finding traced detector -> surface -> outcome, as a node/link
			 * graph. Whole-ledger counts. Links carry node ids as well as
			 * indexes, so filtering the node list cannot silently rewire it. */
			flow: e.flow,
			/** Where known-item misses die: open recall findings replayed live and
			 * classified at the FIRST failing stage, so the stages are mutually
			 * exclusive and each names its owner. Read `population.coveragePct` first — the
			 * funnel can only replay probes whose text it can parse. */
			missFunnel: funnel,
			/** Entity × missing-field map with real identifiers — the actionable
			 * half: knownLimitations says "be careful", this says "here is the
			 * list". Every row carries its population and whether the example
			 * list was truncated. */
			gapMatrix: e.gapMatrix,
			/** Per-surface health in consumer terms. openFindings are defects
			 * still reproducing on that surface — not an outage, a work queue. */
			surfaces: e.surfaces,
			findings: {
				open: e.findings.open,
				cleared: e.findings.cleared,
				verifiedClosed: e.findings.verified,
				total: e.findings.total,
				states: e.findings.states,
				byFailureMode: e.findings.byFailureMode,
				openByAge: e.findings.openByAge,
				recentlyCleared: e.findings.recentlyCleared,
				note: "Open = still reproducing on the latest run. Cleared = a later run stopped reproducing it, which is NOT confirmation the fix works. Verified = deliberately re-probed after a fix. The three are disjoint and sum to total.",
			},
			rowQuality: {
				read: e.projects.read,
				population: e.projects.population,
				coveragePct: e.projects.coveragePct,
				frame: e.projects.frame,
				/** the curation queue itself — slug, score, and exactly which of
				 * the five evidence facts each row is missing */
				weakestRows: e.projects.weakest,
				weakestTotal: e.projects.weakestTotal,
				weakestTruncated: e.projects.weakestTruncated,
				meanScore: e.projects.meanScore,
				scoreDefinition:
					"Per row, the count of five BINARY evidence facts present, times 20: a strong provenance basis, a status date, a source URL, at least one type, and at least one link. Scores therefore land only on 0/20/40/60/80/100, and factsPresent is published beside each row so the score can be checked. A low score names what is missing rather than judging the project.",
				statusBasisMix: e.projects.basisMix,
				/** weak rows split by whether ANY on-chain footprint exists — the ceiling of the strong-basis row is people, not lanes */
				strongBasisSplit: e.projects.strongBasisSplit,
				/** deployment-unknown rows split by whether the question applies to the row's product type */
				deploymentSplit: e.projects.deploymentSplit,
				strongBases: [
					"human-verified",
					"onchain-activity",
					"official-record",
				],
				basisStrength:
					"Strong = human-verified, onchain-activity, official-record. Everything else (operator-announcement, site-liveness, source-inherited, unverified) is weak and counts as the strongBasis fact being ABSENT. site-liveness means only that a page answered.",
				missingByField: e.projects.missingCounts,
			},
			repoQuality: {
				read: e.repos.read,
				population: e.repos.population,
				/** rates measured against the population each one TARGETS —
				 * whole-census withCodeDepth/withNotes/withMainnet remain below
				 * for continuity but carry no intent */
				coverage: e.repos.coverage,
				duplicateRows: e.repos.duplicateRows,
				duplicateNote: e.repos.duplicateNote,
				frame: e.repos.frame,
				topGraded: e.repos.top,
				thinnestEvidence: e.repos.thinnest,
				withCodeDepth: e.repos.withCodeDepth,
				withKnowledgeNotes: e.repos.withNotes,
				joinedToMainnetContract: e.repos.withMainnet,
			},
			guards: guards.map((g) => ({
				key: g.key,
				title: g.title,
				promise: g.promise,
				/** structured, so a consumer never parses `value` */
				measure: g.measure,
				value: g.value,
				state: g.state,
				severity: g.severity,
				/** true ONLY when state is "holding". A stale row is never green. */
				holding: g.ok,
				asOf: g.asOf,
				ageDays: g.ageDays,
				cadence: g.cadence,
				freshnessDays: g.freshnessDays,
				details: g.details,
				evidence: g.artifact,
			})),
			trend: qualityHistory,
		},
		{
			headers: {
				"Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
			},
		},
	);
}
