/** Verify v1 slice 1 — the grammar, the verdict semantics, and the honesty
 * rules that make a verdict worth trusting. */
import { describe, expect, it } from "vitest";
import {
	auditVerdict,
	issuedVerdict,
	liveVerdict,
	maintainedVerdict,
	parseClaim,
	type RepoFacts,
} from "../verify-claim";

describe("parseClaim — closed grammar, refusal over guessing", () => {
	it("parses the three natural forms", () => {
		expect(parseClaim({ claim: "is blend audited" })).toMatchObject({
			type: "audited",
			subject: "blend",
		});
		expect(
			parseClaim({ claim: "was Soroswap audited by OtterSec?" }),
		).toMatchObject({ subject: "Soroswap", auditor: "OtterSec" });
		expect(parseClaim({ claim: "has Blend been audited" })).toMatchObject({
			subject: "Blend",
		});
	});
	it("takes structured params and validates the type", () => {
		expect(
			parseClaim({ type: "audited", subject: "blend", auditor: "veridise" }),
		).toMatchObject({ auditor: "veridise" });
		expect(parseClaim({ type: "live", subject: "blend" })).toMatchObject({
			type: "live",
		});
		const err = parseClaim({ type: "profitable", subject: "blend" });
		expect("error" in err && err.error).toMatch(/Unsupported claim type/);
	});
	it("refuses claims outside the grammar instead of guessing", () => {
		const err = parseClaim({ claim: "does blend have a token" });
		expect("error" in err).toBe(true);
	});
});

const ROWS = [
	{
		auditor: "OtterSec",
		projectSlug: "blend",
		engagementEnd: "2026-02-10",
		publishedAt: "2026-03-01",
		findingsTotal: 9,
		reportUrl: "https://x/1",
		title: "Blend v2",
		dateBasis: "report-body",
		observedAt: "2026-08-01",
	},
	{
		auditor: "Veridise",
		projectSlug: "blend",
		engagementEnd: "2025-11-05",
		publishedAt: "2025-12-01",
		findingsTotal: 14,
		reportUrl: "https://x/2",
		title: "Blend v1",
		dateBasis: "report-body",
		observedAt: "2026-08-01",
	},
];
const base = {
	resolvedSlug: "blend",
	resolvedName: "Blend",
	subjectRows: ROWS,
	corpusTotal: 58,
};

describe("auditVerdict — semantics", () => {
	it("supported with full evidence and dated statement", () => {
		const r = auditVerdict({
			claim: { type: "audited", subject: "blend" },
			...base,
		});
		expect(r.verdict).toBe("supported");
		expect(r.evidence).toHaveLength(2);
		expect(r.statement).toContain("2 audit reports");
		expect(r.statement).toContain("2026-02-10");
		expect(r.confidence?.score).toBeGreaterThan(0);
	});
	it("unsupported carries the corpus denominator and never asserts the world", () => {
		const r = auditVerdict({
			claim: { type: "audited", subject: "beans" },
			resolvedSlug: "beans",
			resolvedName: "Beans",
			subjectRows: [],
			corpusTotal: 58,
		});
		expect(r.verdict).toBe("unsupported");
		expect(r.statement).toContain("across 58 indexed reports");
		expect(r.statement).toContain("not proof no audit exists");
	});
	it("auditor-filtered miss names who DID audit", () => {
		const r = auditVerdict({
			claim: { type: "audited", subject: "blend", auditor: "Hacken" },
			...base,
		});
		expect(r.verdict).toBe("unsupported");
		expect(r.auditorsOnRecord).toEqual(["OtterSec", "Veridise"]);
		expect(r.statement).toContain("OtterSec");
	});
	it("auditor filter matches loosely but not wrongly", () => {
		const r = auditVerdict({
			claim: { type: "audited", subject: "blend", auditor: "ottersec" },
			...base,
		});
		expect(r.verdict).toBe("supported");
		expect(r.evidence).toHaveLength(1);
	});
	it("since filter narrows by engagement date", () => {
		const r = auditVerdict({
			claim: { type: "audited", subject: "blend", since: "2026-01" },
			...base,
		});
		expect(r.evidence).toHaveLength(1);
		const ev = r.evidence[0];
		expect(ev.kind === "audit-report" && ev.auditor).toBe("OtterSec");
	});
	it("currency note fires only when code moved well after the newest audit", () => {
		const fresh = auditVerdict({
			claim: { type: "audited", subject: "blend" },
			...base,
			codeLastActiveAt: "2026-08-20",
		});
		expect(fresh.currencyNote).toContain("predates");
		const near = auditVerdict({
			claim: { type: "audited", subject: "blend" },
			...base,
			codeLastActiveAt: "2026-03-01",
		});
		expect(near.currencyNote).toBeUndefined();
	});
});

describe("liveVerdict — the status record IS the evidence", () => {
	const facts = (
		status: string | null,
		basis: string | null = "human-verified",
	) => ({
		slug: "x",
		name: "X",
		status,
		statusBasis: basis,
		statusAsOf: "2026-08-27",
		statusSourceUrl: "https://src",
	});
	it("Live on record → supported, confidence from the basis tier", () => {
		const r = liveVerdict(facts("Live"));
		expect(r.verdict).toBe("supported");
		expect(r.evidence[0].kind).toBe("status-record");
		expect(r.confidence?.score).toBeGreaterThan(0);
	});
	it("Pre-Release contradicts a live claim — with the source", () => {
		const r = liveVerdict(facts("Pre-Release"));
		expect(r.verdict).toBe("contradicted");
		expect(r.statement).toContain("Pre-Release");
		expect(r.statement).toContain("https://src");
	});
	it("no status on record = a gap in OUR record, not a claim", () => {
		const r = liveVerdict(facts(null, null));
		expect(r.verdict).toBe("unsupported");
		expect(r.statement).toContain("gap in our record");
	});
});

describe("maintainedVerdict — code activity + curated notes", () => {
	const repo = (over: Partial<RepoFacts>): RepoFacts => ({
		fullName: "o/r",
		lastCommitAt: null,
		activityState: null,
		isArchived: false,
		stars: 5,
		repoScoreLabel: "solid",
		...over,
	});
	const recent = new Date(Date.now() - 30 * 86400000).toISOString();
	const stale = new Date(Date.now() - 400 * 86400000).toISOString();
	it("recent commit on a non-archived repo → supported", () => {
		const r = maintainedVerdict("X", [repo({ lastCommitAt: recent })]);
		expect(r.verdict).toBe("supported");
	});
	it("all repos archived → contradicted", () => {
		const r = maintainedVerdict("X", [
			repo({ isArchived: true, lastCommitAt: stale }),
		]);
		expect(r.verdict).toBe("contradicted");
		expect(r.statement).toContain("archived");
	});
	it("year-old newest commit → contradicted with the date", () => {
		const r = maintainedVerdict("X", [repo({ lastCommitAt: stale })]);
		expect(r.verdict).toBe("contradicted");
	});
	it("no repos on record → unsupported (no evidence either way)", () => {
		const r = maintainedVerdict("X", []);
		expect(r.verdict).toBe("unsupported");
		expect(r.statement).toContain("no code evidence");
	});
	it("knowledgeNotes ride along as curated-note evidence", () => {
		const r = maintainedVerdict("X", [
			repo({
				lastCommitAt: recent,
				knowledgeNotes: [
					{
						note: "3 audits on record",
						source: "https://s",
						asOf: "2026-08-01",
					},
				],
			}),
		]);
		expect(r.evidence.some((e) => e.kind === "curated-note")).toBe(true);
	});
});

describe("grammar covers the new claim types", () => {
	it("live forms", () => {
		expect(parseClaim({ claim: "is laina live" })).toMatchObject({
			type: "live",
			subject: "laina",
		});
		expect(parseClaim({ claim: "is Blend on mainnet?" })).toMatchObject({
			type: "live",
			subject: "Blend",
		});
	});
	it("maintained forms, including abandoned", () => {
		expect(parseClaim({ claim: "is kulipa maintained" })).toMatchObject({
			type: "maintained",
			subject: "kulipa",
		});
		expect(parseClaim({ claim: "is kulipa abandoned?" })).toMatchObject({
			type: "maintained",
			subject: "kulipa",
		});
	});
});

describe("issuedVerdict — ticker attribution over the registry (sls-066 class)", () => {
	const ROWS = [
		{
			ticker: "EURC",
			company: "Circle",
			issuer: "GDHU...",
			issuerDomain: "circle.com",
			updatedAt: "2026-08-28",
		},
		{
			ticker: "EURC",
			company: "MyKobo",
			issuer: "GAQR...",
			issuerDomain: "mykobo.co",
			updatedAt: "2026-08-28",
		},
		{
			ticker: "USDC",
			company: "Circle",
			issuer: "GA5Z...",
			issuerDomain: "circle.com",
			updatedAt: "2026-08-28",
		},
	];
	it("supported, with the multi-issuer warning attached", () => {
		const r = issuedVerdict({
			ticker: "EURC",
			company: "Circle",
			rows: ROWS,
			corpusTotal: 3,
		});
		expect(r.verdict).toBe("supported");
		expect(r.statement).toContain("also issued by MyKobo");
		expect(r.statement).toContain("never by ticker alone");
	});
	it("contradicted when the ticker is on record under OTHER issuers only", () => {
		const r = issuedVerdict({
			ticker: "USDC",
			company: "Tether",
			rows: ROWS,
			corpusTotal: 3,
		});
		expect(r.verdict).toBe("contradicted");
		expect(r.auditorsOnRecord).toEqual(["Circle"]);
		expect(r.statement).toContain("not the world");
	});
	it("unsupported for a ticker outside the registry — never 'does not exist'", () => {
		const r = issuedVerdict({
			ticker: "ZORB",
			company: "Circle",
			rows: ROWS,
			corpusTotal: 3,
		});
		expect(r.verdict).toBe("unsupported");
		expect(r.statement).toContain("not proof the asset does not exist");
	});
	it("grammar: both phrasings parse to the same claim", () => {
		expect(parseClaim({ claim: "is EURC issued by Circle" })).toMatchObject({
			type: "issued",
			subject: "EURC",
			auditor: "Circle",
		});
		expect(parseClaim({ claim: "does MyKobo issue EURC?" })).toMatchObject({
			type: "issued",
			subject: "EURC",
			auditor: "MyKobo",
		});
	});
});
