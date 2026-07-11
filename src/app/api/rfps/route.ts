/**
 * Public read-only Stellar RFPs endpoint.
 *
 *   GET /api/rfps
 *   GET /api/rfps?category=defi
 *   GET /api/rfps?quarter=q2-2026
 *   GET /api/rfps?q=stablecoin
 *
 * Returns the curated set of confirmed RFPs (Requests for Proposals) for
 * the Stellar ecosystem — sponsor briefs that will be funded by the
 * Stellar Community Fund when winners are picked. Mirrors what's on the
 * /ideas page; powers Stellar Scout so the agent can answer "what
 * upcoming RFPs match my idea?" without an external lookup.
 */

import { type NextRequest, NextResponse } from "next/server";
import {
	ACTIVE_QUARTER,
	CATEGORIES,
	CATEGORY_LABELS,
	type Category,
	IDEAS,
	type Idea,
	QUARTER_LABELS,
	QUARTERS,
	type Quarter,
	type RfpStatus,
	rfpStatus,
} from "@/data/ideas";
import { logApiHit } from "@/lib/api-usage";
import { clampLimit } from "@/lib/http-params";
import { jsonSafe } from "@/lib/json-safe";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { fetchScfRounds } from "@/lib/scf-rounds";

// force-dynamic so the query-param filters (q, category, quarter) actually
// apply — static generation collapses params at build time and would
// always return the full unfiltered set.
export const dynamic = "force-dynamic";
export const revalidate = 300;

interface RfpRow extends Idea {
	categoryLabel: string;
	quarterLabel: string;
	status: RfpStatus;
	url: string;
	/**
	 * sls-045 discriminator: "rfp" = a curated sponsor brief; "scf-round" = a
	 * SYNTHETIC row representing the live SCF round's open submission window
	 * (served as a first-class row since Emir's demo miss — row-reading agents
	 * skipped meta-only round info and concluded "nothing is open"). Synthetic
	 * rows are NOT briefs: count/render briefs by filtering rowType === "rfp".
	 */
	rowType: "rfp" | "scf-round";
	/** True only on synthetic scf-round rows — mirror of rowType for quick checks. */
	synthetic: boolean;
}

function toRow(i: Idea): RfpRow {
	return {
		...i,
		categoryLabel: CATEGORY_LABELS[i.category],
		quarterLabel: QUARTER_LABELS[i.quarter],
		status: rfpStatus(i.quarter),
		url: `https://stellarlight.xyz/ideas/${i.id}`,
		rowType: "rfp",
		synthetic: false,
	};
}

export async function GET(req: NextRequest) {
	// Live SCF round state (sls-014) — 6h-revalidated fetch of the awards page.
	// null on failure so the fallback below can obey the invariant.
	const scfLive = await fetchScfRounds();
	const sp = req.nextUrl.searchParams;
	const q = sp.get("q")?.toLowerCase().trim();
	const categoryFilter = sp.get("category") as Category | null;
	const quarterFilter = sp.get("quarter") as Quarter | null;
	const statusFilter = sp.get("status") as RfpStatus | null;
	const limit = clampLimit(sp.get("limit"), 100, 200);
	const offset = Math.max(Number(sp.get("offset") || "0") || 0, 0);

	// Reject an unrecognized category instead of silently returning ALL rows
	// (a footgun — the caller believes they filtered). Matches the 400+validX
	// pattern used by /api/hackathons, /api/research, /api/skills.
	if (
		categoryFilter &&
		!(CATEGORIES as readonly string[]).includes(categoryFilter)
	) {
		return NextResponse.json(
			{
				error: `Invalid category '${categoryFilter}'.`,
				validCategories: CATEGORIES,
			},
			{ status: 400 },
		);
	}
	if (statusFilter && statusFilter !== "open" && statusFilter !== "closed") {
		return NextResponse.json(
			{
				error: `Invalid status '${statusFilter}'.`,
				validStatuses: ["open", "closed"],
			},
			{ status: 400 },
		);
	}
	if (
		quarterFilter &&
		!(QUARTERS as readonly string[]).includes(quarterFilter)
	) {
		return NextResponse.json(
			{ error: `Invalid quarter '${quarterFilter}'.`, validQuarters: QUARTERS },
			{ status: 400 },
		);
	}

	let rfps: RfpRow[] = IDEAS.map(toRow);

	// Emir's demo miss (2026-07-09): the live open round existed ONLY in
	// meta.scfRound while every idea row read status=closed — a row-reading
	// agent concluded "nothing is open" and missed the single most important
	// funding fact. An open SCF round IS the top funding opportunity: serve
	// Submission-phase rounds as first-class OPEN rows, not just metadata.
	const roundRows: RfpRow[] = (scfLive?.roundsInProgress ?? [])
		.filter((r) => /submission/i.test(r.phase ?? ""))
		.map((r) => ({
			id: `scf-round-${r.round}`,
			title: `SCF Round #${r.round} — submissions OPEN${r.submissionDeadline ? ` until ${r.submissionDeadline}` : ""}`,
			description: `Stellar Community Fund round #${r.round} is currently accepting submissions${r.submissionDeadline ? ` (deadline ${r.submissionDeadline})` : ""}. The Build Award funds Stellar/Soroban projects — eligibility, rules and the application flow are in the SCF Handbook (https://stellar.gitbook.io/scf-handbook). Apply via https://communityfund.stellar.org.`,
			technicalRequirements: null,
			category: "scf",
			authorName: "Stellar Community Fund",
			quarter: ACTIVE_QUARTER,
			categoryLabel: CATEGORY_LABELS.scf,
			quarterLabel: "Live round",
			status: "open",
			url: "https://communityfund.stellar.org/awards",
			rowType: "scf-round",
			synthetic: true,
		}));
	rfps = [...roundRows, ...rfps];

	if (
		categoryFilter &&
		(CATEGORIES as readonly string[]).includes(categoryFilter)
	) {
		rfps = rfps.filter((r) => r.category === categoryFilter);
	}
	if (
		quarterFilter &&
		(QUARTERS as readonly string[]).includes(quarterFilter)
	) {
		rfps = rfps.filter((r) => r.quarter === quarterFilter);
	}
	if (statusFilter === "open" || statusFilter === "closed") {
		rfps = rfps.filter((r) => r.status === statusFilter);
	}
	if (q) {
		const tokens = q.split(/\s+/).filter(Boolean);
		rfps = rfps.filter((r) => {
			const hay =
				`${r.title} ${r.description} ${r.technicalRequirements ?? ""} ${r.categoryLabel}`.toLowerCase();
			return tokens.every((t) => hay.includes(t));
		});
	}

	// Matched count is post-filter, pre-slice — paging consumers compare it
	// against offset+returned to know when they've reached the end.
	const matchedCount = rfps.length;
	rfps = rfps.slice(offset, offset + limit);

	const allRows = IDEAS.map(toRow);
	const openCount = allRows.filter((r) => r.status === "open").length;
	const closedCount = allRows.length - openCount;

	logApiHit({
		req,
		endpoint: "/api/rfps",
		query: q,
		filters: {
			category: categoryFilter,
			quarter: quarterFilter,
			status: statusFilter,
			limit,
		},
	});

	return NextResponse.json(
		jsonSafe({
			meta: {
				source: "https://stellarlight.xyz/ideas",
				generatedAt: new Date().toISOString(),
				filters: {
					q: q ?? null,
					category: categoryFilter,
					quarter: quarterFilter,
					status: statusFilter,
					limit,
					offset,
				},
				counts: {
					total: IDEAS.length,
					open: openCount,
					closed: closedCount,
					matched: matchedCount,
					returned: rfps.length,
					// sls-045: synthetic scf-round rows in the returned page.
					// total/open/closed count curated BRIEFS only; matched/returned
					// count ROWS incl. synthetic ones — so open=5 with returned=6 is
					// consistent, not a discrepancy. Count briefs via rowType==="rfp".
					syntheticRounds: rfps.filter((r) => r.synthetic).length,
				},
				countBasis:
					"total/open/closed = curated RFP briefs only. matched/returned = result rows, which ALSO include synthetic 'scf-round' rows (rowType: 'scf-round', synthetic: true) representing the live SCF round's open submission window. To count or render briefs, filter rowType === 'rfp'; round context is also in meta.scfRound.",
				activeQuarter: ACTIVE_QUARTER,
				activeQuarterLabel: QUARTER_LABELS[ACTIVE_QUARTER],
				// SCF round identity + submission window (sls-007, LIVE since sls-014).
				// Populated from communityfund.stellar.org/awards' embedded
				// award_rounds payload on a 6h revalidate — the sls-007 "no
				// machine-readable feed" assumption was wrong, and the hand-curated
				// constant went stale at birth (asserted "no round open" while the
				// page showed SCF #45 in Submission). INVARIANT: on fetch failure we
				// say the live check failed and point at verifyAt — we never assert
				// a negative the cited source might contradict.
				scfRound: scfLive
					? {
							currentRound: scfLive.currentRound,
							currentPhase: scfLive.currentPhase,
							lastConfirmedRound: scfLive.lastConcludedRound,
							lastConfirmedRoundNote: scfLive.roundsInProgress.length
								? `In progress: ${scfLive.roundsInProgress
										.map(
											(r) =>
												`SCF #${r.round} (${r.phase}${r.submissionDeadline ? `, submission deadline ${r.submissionDeadline}` : ""})`,
										)
										.join(
											"; ",
										)}. SCF #${scfLive.lastConcludedRound} is the last concluded round.`
								: `No round in progress; SCF #${scfLive.lastConcludedRound} is the last concluded round.`,
							submissionWindow: scfLive.submissionWindow,
							roundsInProgress: scfLive.roundsInProgress,
							asOf: scfLive.fetchedAt.slice(0, 10),
							source: "live",
							verifyAt: "https://communityfund.stellar.org/awards",
						}
					: {
							currentRound: null,
							currentPhase: null,
							lastConfirmedRound: null,
							lastConfirmedRoundNote:
								"Live verification against communityfund.stellar.org/awards failed at request time — do NOT read this as 'no round open'; check verifyAt directly.",
							submissionWindow: { opens: null, closes: null },
							roundsInProgress: [],
							asOf: new Date().toISOString().slice(0, 10),
							source: "unavailable",
							verifyAt: "https://communityfund.stellar.org/awards",
						},
				categories: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
					value,
					label,
				})),
				quarters: Object.entries(QUARTER_LABELS).map(([value, label]) => ({
					value,
					label,
				})),
				submitNewBriefAt: "https://stellarlight.xyz/ideas",
			},
			funding:
				"Stellar Community Fund (SCF) — winners of open RFPs (status: open) are eligible for SCF grant funding in the current round. Closed RFPs are past rounds, surfaced for context but no longer fundable.",
			rfps,
		}),
		{
			headers: {
				"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
			},
		},
	);
}

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
