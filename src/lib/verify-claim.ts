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

export type ClaimType = "audited" | "live" | "maintained" | "issued";
export type AuditClaim = {
	type: ClaimType;
	subject: string;
	auditor?: string;
	since?: string;
};

export type ClaimParseError = { error: string; supported: string[] };

const SUPPORTED = [
	"type=audited&subject=<name|slug> [&auditor=] [&since=YYYY-MM]",
	'type=live&subject=<name|slug>  (or claim="is X live")',
	'type=maintained&subject=<name|slug>  (or claim="is X maintained" / "is X abandoned")',
	'type=issued&subject=<ticker>&auditor=<company>  (or claim="is EURC issued by Circle")',
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
		const t = p.type ?? "audited";
		if (t !== "audited" && t !== "live" && t !== "maintained" && t !== "issued")
			return {
				error: `Unsupported claim type '${p.type}'. Supported: audited, live, maintained, issued.`,
				supported: SUPPORTED,
			};
		if (!p.subject?.trim())
			return {
				error: `subject is required with type=${t}.`,
				supported: SUPPORTED,
			};
		return {
			type: t,
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
	if (m)
		return {
			type: "audited",
			subject: m[1].trim(),
			...(m[2]?.trim() ? { auditor: m[2].trim() } : {}),
		};
	const live =
		/^(?:is|was)\s+(.+?)\s+(?:live|on\s+mainnet|launched|in\s+production)\s*\??$/i.exec(
			raw,
		);
	if (live) return { type: "live", subject: live[1].trim() };
	const issued =
		/^(?:is|was)\s+(.+?)\s+issued\s+(?:on\s+stellar\s+)?by\s+(.+?)\s*\??$/i.exec(
			raw,
		);
	if (issued)
		return {
			type: "issued",
			subject: issued[1].trim(),
			auditor: issued[2].trim(),
		};
	const issues =
		/^does\s+(.+?)\s+issue\s+(.+?)(?:\s+on\s+stellar)?\s*\??$/i.exec(raw);
	if (issues)
		return {
			type: "issued",
			subject: issues[2].trim(),
			auditor: issues[1].trim(),
		};
	const maint =
		/^(?:is|was)\s+(.+?)\s+(?:(?:still\s+)?(?:maintained|active(?:ly)?(?:\s+developed)?)|abandoned|dead)\s*\??$/i.exec(
			raw,
		);
	if (maint) return { type: "maintained", subject: maint[1].trim() };
	return {
		error: `Cannot parse '${raw}'. Supported: "is <project> audited [by <firm>]", "is <project> live", "is <project> maintained".`,
		supported: SUPPORTED,
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

export type Verdict =
	| "supported"
	| "contradicted"
	| "unsupported"
	| "unresolved";

export type EvidenceItem =
	| {
			kind: "audit-report";
			auditor: string | null;
			title: string | null;
			reportUrl: string | null;
			engagementEnd: string | null;
			publishedAt: string | null;
			findingsTotal: number | null;
			dateBasis: string | null;
			observedAt: string | null;
	  }
	| {
			/** The status-provenance trio — the SAME labeled data the directory
			 * serves, quoted as evidence rather than recomputed. */
			kind: "status-record";
			status: string | null;
			statusBasis: string | null;
			statusAsOf: string | null;
			statusSourceUrl: string | null;
	  }
	| {
			kind: "code-activity";
			repo: string;
			lastCommitAt: string | null;
			activityState: string | null;
			isArchived: boolean;
			stars: number | null;
			/** the existing repo quality label — scoring, not recomputed */
			repoScoreLabel: string | null;
	  }
	| {
			/** repo-intel knowledgeNotes: dated facts with sources, curated. */
			kind: "curated-note";
			note: string;
			source: string;
			asOf: string | null;
	  };

export interface VerifyResult {
	verdict: Verdict;
	statement: string;
	evidence: EvidenceItem[];
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

export interface SubjectFacts {
	slug: string;
	name: string;
	status: string | null;
	statusBasis: string | null;
	statusAsOf: string | null;
	statusSourceUrl: string | null;
}

/** "is X live" — answered from the status record and its provenance tier.
 * supported = status Live (confidence = factConfidence over basis×age, so a
 * site-liveness Live scores below a human-verified one). contradicted =
 * Pre-Release/Development/Inactive — we hold a dated record saying what it
 * IS instead. Never guesses past the record. */
export function liveVerdict(f: SubjectFacts): VerifyResult {
	const rec: EvidenceItem = {
		kind: "status-record",
		status: f.status,
		statusBasis: f.statusBasis,
		statusAsOf: f.statusAsOf,
		statusSourceUrl: f.statusSourceUrl,
	};
	const conf = factConfidence(f.statusBasis, f.statusAsOf);
	if (f.status === "Live")
		return {
			verdict: "supported",
			statement: `${f.name} is Live on record (basis: ${f.statusBasis ?? "unrecorded"}${f.statusAsOf ? `, as of ${f.statusAsOf.slice(0, 10)}` : ""}).`,
			evidence: [rec],
			confidence: conf,
		};
	if (
		f.status === "Pre-Release" ||
		f.status === "Development" ||
		f.status === "Inactive"
	)
		return {
			verdict: "contradicted",
			statement: `${f.name} is ${f.status} on record, not Live${f.statusAsOf ? ` (as of ${f.statusAsOf.slice(0, 10)}` : ""}${f.statusSourceUrl ? `, source: ${f.statusSourceUrl})` : f.statusAsOf ? ")" : ""}.`,
			evidence: [rec],
			confidence: conf,
		};
	return {
		verdict: "unsupported",
		statement: `${f.name} has no lifecycle status on record — this is a gap in our record, not a claim about the project.`,
		evidence: [rec],
		confidence: null,
	};
}

export interface RepoFacts {
	fullName: string;
	lastCommitAt: string | null;
	activityState: string | null;
	isArchived: boolean;
	stars: number | null;
	repoScoreLabel: string | null;
	knowledgeNotes?: Array<{ note: string; source: string; asOf: string | null }>;
}

/** "is X maintained" — answered from indexed code activity plus the repos'
 * own curated knowledgeNotes (dated facts with sources). supported = a
 * commit within 180 days on a non-archived repo. contradicted = every repo
 * archived, or newest commit over a year old. Between the two: unsupported
 * with the dates served, because staleness is a spectrum and the caller
 * gets the evidence, not our adjective. */
export function maintainedVerdict(
	name: string,
	repos: RepoFacts[],
	corpusNote?: string,
): VerifyResult {
	const ev: EvidenceItem[] = repos.map((r) => ({
		kind: "code-activity" as const,
		repo: r.fullName,
		lastCommitAt: r.lastCommitAt,
		activityState: r.activityState,
		isArchived: r.isArchived,
		stars: r.stars,
		repoScoreLabel: r.repoScoreLabel,
	}));
	for (const r of repos)
		for (const n of r.knowledgeNotes ?? [])
			ev.push({
				kind: "curated-note",
				note: n.note,
				source: n.source,
				asOf: n.asOf,
			});
	if (!repos.length)
		return {
			verdict: "unsupported",
			statement: `No indexed repository is linked to ${name}${corpusNote ? ` (${corpusNote})` : ""} — we hold no code evidence either way.`,
			evidence: [],
			confidence: null,
		};
	const liveRepos = repos.filter((r) => !r.isArchived);
	const newest = repos
		.map((r) => r.lastCommitAt)
		.filter(Boolean)
		.sort()
		.at(-1) as string | null;
	const days = newest
		? (Date.now() - Date.parse(newest)) / 86400000
		: Number.POSITIVE_INFINITY;
	if (liveRepos.length && days <= 180)
		return {
			verdict: "supported",
			statement: `${name} shows active development — newest commit ${newest?.slice(0, 10)} across ${liveRepos.length} non-archived repo(s).`,
			evidence: ev,
			confidence: factConfidence("code-scan", newest),
		};
	if (!liveRepos.length || days > 365)
		return {
			verdict: "contradicted",
			statement: !liveRepos.length
				? `Every indexed repo of ${name} is archived.`
				: `${name}'s newest indexed commit is ${newest?.slice(0, 10)} — over a year old.`,
			evidence: ev,
			confidence: factConfidence("code-scan", newest),
		};
	return {
		verdict: "unsupported",
		statement: `${name}'s newest indexed commit is ${newest?.slice(0, 10)} (${Math.round(days)} days ago) — quiet, but not provably abandoned. Judge from the dates.`,
		evidence: ev,
		confidence: factConfidence("code-scan", newest),
	};
}

export interface StablecoinIssuerRow {
	ticker?: string | null;
	company?: string | null;
	issuer?: string | null;
	issuerDomain?: string | null;
	assetId?: string | null;
	verified?: boolean | null;
	updatedAt?: string | null;
}

/** "is <ticker> issued by <company>" — answered from the curated stablecoin
 * registry. The conflation this exists to stop: "Circle issues USDC and
 * EURC" is TRUE and still must not attribute MyKobo's EURC to Circle — a
 * ticker issued by multiple companies is not an identity. supported names
 * the matching row; contradicted fires only when the ticker IS on record
 * with other issuers and the claimed company is not among them (closed
 * registry world, stated); unsupported = ticker not in the registry at all. */
export function issuedVerdict(o: {
	ticker: string;
	company: string;
	rows: StablecoinIssuerRow[];
	corpusTotal: number;
}): VerifyResult {
	const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
	const t = norm(o.ticker);
	const tickerRows = o.rows.filter((r) => norm(String(r.ticker ?? "")) === t);
	const ev = (r: StablecoinIssuerRow): EvidenceItem => ({
		kind: "curated-note",
		note: `${String(r.ticker ?? "").toUpperCase()} issued by ${r.company ?? "unknown"} — issuer account ${r.issuer ?? "?"}${r.issuerDomain ? ` (home domain ${r.issuerDomain})` : ""}`,
		source: `https://stellarlight.xyz/api/stablecoins`,
		asOf: r.updatedAt ?? null,
	});
	if (!tickerRows.length)
		return {
			verdict: "unsupported",
			statement: `${o.ticker.toUpperCase()} is not in our stablecoin registry (${o.corpusTotal} tracked issuances) — a statement about our registry, not proof the asset does not exist.`,
			evidence: [],
			confidence: null,
		};
	const match = tickerRows.filter(
		(r) =>
			norm(String(r.company ?? "")).includes(norm(o.company)) ||
			norm(o.company).includes(norm(String(r.company ?? ""))),
	);
	const others = [
		...new Set(
			tickerRows.map((r) => r.company).filter((c): c is string => !!c),
		),
	];
	if (match.length) {
		const multi = others.length > 1;
		return {
			verdict: "supported",
			statement:
				`${o.company} issues ${o.ticker.toUpperCase()} on Stellar (issuer account on record).` +
				(multi
					? ` NOTE: ${o.ticker.toUpperCase()} is also issued by ${others.filter((c) => !match.some((m) => m.company === c)).join(", ")} — attribute by issuer account, never by ticker alone.`
					: ""),
			evidence: tickerRows.map(ev),
			confidence: factConfidence("human-verified", match[0].updatedAt ?? null),
			...(multi ? { auditorsOnRecord: others } : {}),
		};
	}
	return {
		verdict: "contradicted",
		statement: `Our registry records ${o.ticker.toUpperCase()} issued by ${others.join(", ")} — not by ${o.company}. This asserts our curated registry (${o.corpusTotal} tracked issuances), which is hand-verified but not the world.`,
		evidence: tickerRows.map(ev),
		confidence: factConfidence(
			"human-verified",
			tickerRows[0].updatedAt ?? null,
		),
		auditorsOnRecord: others,
	};
}
