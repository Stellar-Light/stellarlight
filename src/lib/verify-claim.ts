/**
 * Verify v1 — claim in, verdict + evidence + confidence out (PLAN.md §5).
 *
 * Slice 1 carries ONE claim family: audit claims ("is X audited", optionally
 * "by Y" / "since D"). The verdict enum is the product:
 *
 *   supported    — ≥1 report on record for the resolved subject (filters honored)
 *   unsupported  — NO evidence in OUR corpus. The statement carries the
 *                  denominator ("across N indexed reports") because we assert
 *                  over our corpus, never over the world — an empty result is
 *                  a claim about what we hold, not about what exists.
 *   unresolved   — the subject did not resolve to a known project; the
 *                  resolver's own note is served instead of a guess.
 *
 * `contradicted` is deliberately absent from slice 1: for audit claims we can
 * rarely PROVE the negative, and a verdict we cannot stand behind is the
 * thing this API exists to not emit.
 *
 * Pure module — the route supplies rows; everything here is unit-testable.
 */
import { factConfidence } from "./fact-confidence";

export type AuditClaim = {
	type: "audited";
	subject: string;
	auditor?: string;
	since?: string;
};

export type ClaimParseError = { error: string; supported: string[] };

const SUPPORTED = [
	"type=audited&subject=<name|slug> [&auditor=] [&since=YYYY-MM]",
];

/** Structured params first; else a tiny CLOSED grammar. Anything outside it
 * is a 400 naming what we support — refusal over guessing. */
export function parseClaim(p: {
	claim?: string | null;
	type?: string | null;
	subject?: string | null;
	auditor?: string | null;
	since?: string | null;
}): AuditClaim | ClaimParseError {
	if (p.type || p.subject) {
		if ((p.type ?? "audited") !== "audited")
			return {
				error: `Unsupported claim type '${p.type}' — slice 1 verifies audit claims only.`,
				supported: SUPPORTED,
			};
		if (!p.subject?.trim())
			return {
				error: "subject is required with type=audited.",
				supported: SUPPORTED,
			};
		return {
			type: "audited",
			subject: p.subject.trim(),
			...(p.auditor?.trim() ? { auditor: p.auditor.trim() } : {}),
			...(p.since?.trim() ? { since: p.since.trim() } : {}),
		};
	}
	const raw = (p.claim ?? "").trim();
	if (!raw)
		return { error: "Pass claim= or type=&subject=.", supported: SUPPORTED };
	const m =
		/^(?:is|was|has)\s+(.+?)\s+(?:been\s+)?audited(?:\s+by\s+(.+?))?\s*\??$/i.exec(
			raw,
		);
	if (!m)
		return {
			error: `Cannot parse '${raw}'. Slice 1 verifies audit claims only ("is <project> audited", "was <project> audited by <firm>").`,
			supported: SUPPORTED,
		};
	return {
		type: "audited",
		subject: m[1].trim(),
		...(m[2]?.trim() ? { auditor: m[2].trim() } : {}),
	};
}

export interface AuditEvidenceRow {
	reportId?: string | null;
	title?: string | null;
	reportUrl?: string | null;
	auditor?: string | null;
	projectSlug?: string | null;
	engagementStart?: string | null;
	engagementEnd?: string | null;
	publishedAt?: string | null;
	findingsTotal?: number | null;
	dateBasis?: string | null;
	observedAt?: string | null;
}

export type Verdict = "supported" | "unsupported" | "unresolved";

export interface VerifyResult {
	verdict: Verdict;
	statement: string;
	evidence: Array<{
		kind: "audit-report";
		auditor: string | null;
		title: string | null;
		reportUrl: string | null;
		engagementEnd: string | null;
		publishedAt: string | null;
		findingsTotal: number | null;
		dateBasis: string | null;
		observedAt: string | null;
	}>;
	confidence: ReturnType<typeof factConfidence>;
	/** The audits×code join: present when the newest report predates the
	 * subject's latest code activity by more than 90 days. An audit is a
	 * statement about the code AS IT WAS. */
	currencyNote?: string;
	/** On an auditor-filtered miss where OTHER reports exist: who did audit. */
	auditorsOnRecord?: string[];
}

const latest = (rows: AuditEvidenceRow[]): string | null => {
	let best: string | null = null;
	for (const r of rows) {
		const d = r.engagementEnd ?? r.publishedAt;
		if (d && (!best || d > best)) best = d;
	}
	return best;
};

export function auditVerdict(o: {
	claim: AuditClaim;
	resolvedSlug: string;
	resolvedName: string;
	/** every report on record for the subject (pre auditor/since filter) */
	subjectRows: AuditEvidenceRow[];
	/** the whole-corpus denominator for honest absence */
	corpusTotal: number;
	/** newest code activity we can date for the subject, if any */
	codeLastActiveAt?: string | null;
}): VerifyResult {
	const { claim } = o;
	const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
	let rows = o.subjectRows;
	if (claim.auditor) {
		const want = norm(claim.auditor);
		rows = rows.filter((r) => r.auditor && norm(r.auditor).includes(want));
	}
	if (claim.since)
		rows = rows.filter(
			(r) => (r.engagementEnd ?? r.publishedAt ?? "") >= claim.since!,
		);

	if (!rows.length) {
		const filters = [
			claim.auditor ? ` by ${claim.auditor}` : "",
			claim.since ? ` since ${claim.since}` : "",
		].join("");
		const others = [
			...new Set(o.subjectRows.map((r) => r.auditor).filter(Boolean)),
		] as string[];
		return {
			verdict: "unsupported",
			statement:
				`No audit${filters} on record for ${o.resolvedName} across ${o.corpusTotal} indexed reports. ` +
				`This is a statement about our corpus, not proof no audit exists.` +
				(others.length
					? ` Reports on record are by: ${others.join(", ")}.`
					: ""),
			evidence: [],
			confidence: null,
			...(others.length ? { auditorsOnRecord: others } : {}),
		};
	}

	const newest = latest(rows);
	const result: VerifyResult = {
		verdict: "supported",
		statement:
			`${o.resolvedName} has ${rows.length} audit report${rows.length === 1 ? "" : "s"} on record` +
			(claim.auditor ? ` by ${claim.auditor}` : "") +
			(newest ? `, most recent ${newest.slice(0, 10)}` : "") +
			".",
		evidence: rows.map((r) => ({
			kind: "audit-report" as const,
			auditor: r.auditor ?? null,
			title: r.title ?? null,
			reportUrl: r.reportUrl ?? null,
			engagementEnd: r.engagementEnd ?? null,
			publishedAt: r.publishedAt ?? null,
			findingsTotal: r.findingsTotal ?? null,
			dateBasis: r.dateBasis ?? null,
			observedAt: r.observedAt ?? null,
		})),
		// The report is an official record; freshness decays from the newest
		// engagement. Two independent reports do not multiply confidence — the
		// count is visible in the evidence; the score is about the FACT.
		confidence: factConfidence("official-record", newest),
	};

	if (newest && o.codeLastActiveAt) {
		const gapDays =
			(Date.parse(o.codeLastActiveAt) - Date.parse(newest)) / 86400000;
		if (Number.isFinite(gapDays) && gapDays > 90) {
			result.currencyNote = `The newest report (${newest.slice(0, 10)}) predates the subject's latest code activity (${o.codeLastActiveAt.slice(0, 10)}) by ${Math.round(gapDays)} days — an audit is a statement about the code as it was, not as it is.`;
		}
	}
	return result;
}
