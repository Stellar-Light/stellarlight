import { describe, expect, it } from "vitest";
import { extractFindings } from "../audit-findings";

// Fixtures are excerpts of REAL reassembled report text (probed live
// 2026-07-19) — including the PDF glue the grammars must tolerate.
describe("extractFindings — round-trip grammars", () => {
	it("OtterSec: ADV+SUG ids must equal the stated 'produced N findings'", () => {
		const md = `
OS-AXT-ADV-00 | Lack of Authorization in Upgrade Process 6
OS-AXT-ADV-01 | Inconsistency in Casting of Contract Invocation Result 7
OS-AXT-ADV-02 | Risk of Exceeding Event Size Limit 8
OS-AXT-SUG-00 | Missing Validation Logic 10
OS-AXT-SUG-01 | Code Maturity 12
We produced 5 findings throughout this audit engagement.
later prose re-mentions (OS-AXT-ADV-00) without double counting.`;
		expect(extractFindings("OtterSec", md)).toEqual({
			findingsTotal: 5,
			severityCounts: null,
		});
	});

	it("OtterSec: stated-count mismatch → null, never a guess", () => {
		const md = `OS-AXT-ADV-00 | x\nWe produced 5 findings throughout this audit engagement.`;
		expect(extractFindings("OtterSec", md)).toBeNull();
	});

	it("Veridise: VUL ids vs 'uncovered N issues' (glued TOC lines tolerated)", () => {
		const ids = Array.from(
			{ length: 11 },
			(_, i) => `V-VSPR-VUL-${String(i + 1).padStart(3, "0")}`,
		);
		const md = `${ids.join("\n")}\n....135.1.6V-VSPR-VUL-006:Potentialfront-running\nThe security assessment uncovered 11 issues, 1 of which was high severity.`;
		expect(extractFindings("Veridise", md)).toEqual({
			findingsTotal: 11,
			severityCounts: null,
		});
	});

	it("Certora: table rows with prefix-consistent severity words", () => {
		const md = `
M-01 Stranded gas tokens inside the messenger Medium Fixed
M-02 Messenger protocol changing can leave stranded Medium Fixed
L-01 Rate-limit window gets reduced by the entire Low Acknowledged
L-02 Inconsistent usage of transaction value Low Fixed`;
		expect(extractFindings("Certora", md)).toEqual({
			findingsTotal: 4,
			severityCounts: { medium: 2, low: 2 },
		});
	});

	it("Certora: a prefix↔severity mismatch means we're reading prose → null", () => {
		const md = `M-01 something something High Fixed\nL-01 other thing Low Fixed`;
		expect(extractFindings("Certora", md)).toBeNull();
	});

	it("Code4rena: glued tier headings must equal enumerated ids", () => {
		const md = `
# HighRiskFindings(1)
# [H-01]
# MediumRiskFindings(5)
# [M-01]
# [M-02]
# [M-03]
# [M-04]
# [M-05]
# LowRiskandInformational`;
		expect(extractFindings("Code4rena", md)).toEqual({
			findingsTotal: 6,
			severityCounts: { high: 1, medium: 5 },
		});
	});

	it("Code4rena: heading count ≠ enumerated ids → null", () => {
		const md = `# HighRiskFindings(2)\n# [H-01]`;
		expect(extractFindings("Code4rena", md)).toBeNull();
	});

	it("Hacken: F-ids vs the 'Findings N' stat line", () => {
		const md = `
# FindingsbySeverity
Findings 8
# F-2026-15611-Fee-on-Transfer
# F-2026-15601-Missing
# F-2026-15602-Missing
# F-2026-15603-ImmutableRoleConguration
# F-2026-15604-Outdated
# F-2026-15605-Unused
# F-2026-15607-Missing
# F-2026-15609-Missing`;
		expect(extractFindings("Hacken", md)).toEqual({
			findingsTotal: 8,
			severityCounts: null,
		});
	});

	it("auditors without a verified grammar stay null (Halborn, RV, ...)", () => {
		expect(extractFindings("Halborn", "whatever # //CRITICAL")).toBeNull();
		expect(
			extractFindings("Runtime Verification", "F-2026-1 Findings 1"),
		).toBeNull();
	});
});
