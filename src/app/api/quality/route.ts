/**
 * GET /api/quality — this service's own quality report, machine-readable.
 *
 * The /quality PAGE is for people; this is the same committed measurements
 * for the agent that has to decide how much to trust a result. It is a
 * SELF-REPORT and says so: knownLimitations is derived from our own numbers
 * (if a number improves the sentence changes or disappears), never authored
 * copy, and nothing here is a marketing claim.
 *
 * No query parameters — the whole report is small and cacheable.
 */
import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { unknownParamWarning } from "@/lib/http-params";
import {
	getEntities,
	getGuardRows,
	getMissFunnel,
	getProgress,
} from "@/lib/quality-artifacts";
import { getAppUrl } from "@/lib/utils/app-url";
import { API_VERSION } from "@/lib/version";
import qualityHistory from "../../../../improvements/quality/history.json";

export const revalidate = 3600;

export async function GET(req: NextRequest) {
	const paramWarning = unknownParamWarning(req.nextUrl.searchParams, [], {
		advertise: [],
		hint: "This report takes no parameters — the whole document is returned.",
	});
	const e = getEntities();
	const guards = getGuardRows();

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
					"A SELF-REPORT built from committed artifacts: the findings ledger every detector writes to, plus live samples of project rows and indexed repos. knownLimitations is DERIVED from these numbers, not authored — weigh it before trusting a result. Counts are samples, not censuses; each carries its denominator.",
				...(paramWarning ? { warnings: [paramWarning] } : {}),
			},
			/** Where this service is against its own published quality plan.
			 * Phase state is read from QUALITY.md — it cannot show complete here
			 * without being complete there — and remaining work is served with
			 * the same weight as finished work. */
			progress: getProgress().phases,
			/** The written record behind the numbers: lesson write-ups per
			 * defect class, committed fetch receipts for human-verified
			 * corrections, and audit reports. */
			library: getProgress().library,
			/** Read this first: what we are weak at, measured, with the
			 * recommended alternative for each. */
			knownLimitations: e.knownLimitations,
			/** Every finding traced detector -> surface -> outcome, as a node/link
			 * graph. Whole-ledger counts. Read it to see which detector produces
			 * which defects, where they land, and whether they close. */
			flow: e.flow,
			/** Where known-item misses die: every open recall finding replayed
			 * live and classified at the FIRST failing stage, so the stages are
			 * mutually exclusive and each names its owner. A high "passing"
			 * share means the open count is carrying STALE findings, not debt. */
			missFunnel: getMissFunnel(),
			/** Entity × missing-field map with real identifiers — the actionable
			 * half: knownLimitations says "be careful", this says "here is the
			 * list". Counts are samples with their denominators. */
			gapMatrix: e.gapMatrix,
			/** Per-surface health in consumer terms. openFindings are defects
			 * still reproducing on that surface — not an outage, a work queue. */
			surfaces: e.surfaces,
			findings: {
				open: e.findings.open,
				cleared: e.findings.cleared,
				verifiedClosed: e.findings.verified,
				byFailureMode: e.findings.byFailureMode,
				openByAge: e.findings.openByAge,
				recentlyCleared: e.findings.recentlyCleared,
				note: "Open = still reproducing on the latest run. Cleared = a later run stopped reproducing it. Verified = re-probed after a fix.",
			},
			rowQuality: {
				sampled: e.projects.sampled,
				/** the curation queue itself — slug, score, and exactly which of
				 * the five evidence facts each row is missing */
				weakestRows: e.projects.weakest,
				meanScore: e.projects.meanScore,
				scoreDefinition:
					"Per row, the share of five evidence facts present: a provenance basis, a status date, a source URL, at least one type, and at least one link. A low score names what is missing rather than judging the project.",
				statusBasisMix: e.projects.basisMix,
				basisStrength:
					"human-verified > onchain-activity / official-record > operator-announcement > site-liveness > source-inherited > unverified. site-liveness means only that a page answered.",
				missingByField: e.projects.missingCounts,
			},
			repoQuality: {
				sampled: e.repos.sampled,
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
				value: g.value,
				holding: g.ok,
				asOf: g.asOf,
				evidence: g.artifact,
			})),
			trend: qualityHistory,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
			},
		},
	);
}
