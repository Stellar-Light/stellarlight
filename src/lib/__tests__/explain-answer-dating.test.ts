import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A DeepWiki answer must never borrow the code scan's dates.
 *
 * Raven filed #1134 with three reproductions: `explainRepo` on
 * stellar/stellar-horizon answered `MaxSupportedProtocolVersion = 25` while the
 * source at our own `codeVerified.scannedRef` defines 28. The stale number is
 * DeepWiki's. Ours was that the response carried three dates — meta.generatedAt,
 * codeVerified.scannedAt, repoMeta.lastCommitAt — all describing the scan and
 * none dating the answer, so a consumer reading them beside
 * `answerSource: "deepwiki"` would reasonably conclude the answer was as fresh
 * as the scan.
 *
 * These assert the SHAPE of that honesty against the route source and the
 * published contract, because the live behaviour needs DeepWiki and a DB.
 */
const ROUTE = readFileSync(
	join(process.cwd(), "src/app/api/repos/explain/route.ts"),
	"utf8",
);
const SPEC = JSON.parse(
	readFileSync(join(process.cwd(), "specs/openapi.json"), "utf8"),
);

describe("explainRepo dates its answer, or admits it cannot (#1134)", () => {
	it("serves answerAsOf", () => {
		expect(ROUTE).toMatch(/\banswerAsOf:/);
	});

	it("answerAsOf is null on the deepwiki path — an admission, not a guess", () => {
		// The deepwiki branch must yield null. Written as a source assertion
		// because a fabricated timestamp here would be worse than the original
		// defect: it makes an unknown look measured.
		const m = /answerAsOf:\s*dwAnswer\s*\?\s*([^:]+)\s*:/.exec(ROUTE);
		expect(m, "answerAsOf must branch on dwAnswer").toBeTruthy();
		expect((m?.[1] ?? "").trim()).toBe("null");
	});

	it("the scan arm dates from the scan and nothing else", () => {
		// The audit's point: the first four tests constrained only the deepwiki
		// arm, so `dwAnswer ? null : (repoMeta?.lastCommitAt ?? null)` — dating
		// scan answers with the precise wrong timestamp #1134 was about — passed
		// every one. Pin the whole ternary.
		const m = /answerAsOf:\s*dwAnswer\s*\?\s*null\s*:\s*([^,\n]+)[,\n]/.exec(
			ROUTE,
		);
		expect(m, "the full answerAsOf ternary must be present").toBeTruthy();
		const scanArm = (m?.[1] ?? "").trim();
		expect(scanArm).toMatch(/scannedAt/);
		expect(scanArm).not.toMatch(/lastCommitAt|generatedAt/);
	});

	it("never dates a deepwiki answer from the scan", () => {
		// scannedAt may appear (the scan path legitimately uses it) but must not
		// be reachable from the deepwiki branch. Anchor on the dwAnswer ternary:
		// the unroutable envelope now carries a literal `answerAsOf: null` earlier
		// in the file, which would otherwise be the first (wrong) match.
		const line = /answerAsOf:\s*dwAnswer[^\n]*\n?[^\n]*/.exec(ROUTE)?.[0] ?? "";
		const dwBranch = line.split(":")[1] ?? "";
		expect(dwBranch).not.toMatch(/scannedAt|lastCommitAt|generatedAt/);
	});

	it("warns which dates do NOT cover the answer", () => {
		const w = /warnings: \[\s*"([^"]+)"/.exec(ROUTE)?.[1] ?? "";
		expect(w).toMatch(/answerAsOf is null/);
		for (const field of ["scannedAt", "scannedRef", "lastCommitAt"])
			expect(w, `the warning must name ${field}`).toContain(field);
	});

	it("the contract declares answerAsOf and says why it is null", () => {
		const paths = SPEC.paths ?? {};
		const explain = Object.entries(paths).find(([p]) =>
			p.includes("/repos/explain"),
		);
		expect(explain, "explain path present in the spec").toBeTruthy();
		const json = JSON.stringify(explain?.[1] ?? {});
		expect(json).toContain("answerAsOf");
		// The spec must tell a reader not to substitute the scan dates — that
		// substitution is the exact consumer error #1134 reported.
		const desc =
			/"answerAsOf":\{[^}]*"description":"([^"]+)"/.exec(json)?.[1] ?? json;
		expect(desc).toMatch(/scannedAt/);
		expect(desc).toMatch(/NULL WHENEVER|null whenever/i);
	});
});
