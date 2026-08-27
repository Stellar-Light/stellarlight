/** Verify v1 slice 1 — the grammar, the verdict semantics, and the honesty
 * rules that make a verdict worth trusting. */
import { describe, expect, it } from "vitest";
import { auditVerdict, parseClaim } from "../verify-claim";

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
		const err = parseClaim({ type: "live", subject: "blend" });
		expect("error" in err && err.error).toMatch(/audit claims only/);
	});
	it("refuses claims outside the grammar instead of guessing", () => {
		const err = parseClaim({ claim: "is blend live" });
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
		expect(r.evidence[0].auditor).toBe("OtterSec");
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
