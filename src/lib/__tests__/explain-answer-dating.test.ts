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

	// The answerAsOf expression now has three arms and the note arm carries
	// its own nested date-time serialization (audit C6), so positional regex
	// groups are too brittle — slice the flattened expression by its branch
	// keywords and assert each arm's CONTENT. The #1134 semantics must
	// survive every growth: deepwiki stays null, scan dates only from the
	// scan, note dates only from the note.
	const FLAT = ROUTE.replace(/\s+/g, " ");
	const exprStart = FLAT.indexOf("answerAsOf: noteAnswer ?");
	const dwSplit = FLAT.indexOf(": dwAnswer ?", exprStart);
	const scanSplit = FLAT.indexOf(": scanAnswer ?", dwSplit);
	const exprEnd = FLAT.indexOf(": null,", scanSplit);
	const noteArm = FLAT.slice(exprStart, dwSplit);
	const dwArm = FLAT.slice(dwSplit, scanSplit);
	const scanArm = FLAT.slice(scanSplit, exprEnd);

	it("answerAsOf is null on the deepwiki path — an admission, not a guess", () => {
		expect(exprStart, "the three-armed answerAsOf expression must exist").toBeGreaterThan(-1);
		expect(dwArm.replace(": dwAnswer ?", "").trim()).toMatch(/^null$/);
	});

	it("the scan arm dates from the scan, the note arm from the note, and nothing else", () => {
		expect(noteArm).toMatch(/directNote\?\.asOf/);
		expect(noteArm).not.toMatch(/scannedAt|lastCommitAt|generatedAt/);
		expect(scanArm).toMatch(/scannedAt/);
		expect(scanArm).not.toMatch(/lastCommitAt|generatedAt/);
	});

	it("never dates a deepwiki answer from the scan", () => {
		expect(dwArm).not.toMatch(/scannedAt|lastCommitAt|generatedAt|asOf/);
	});

	it("warns which dates do NOT cover the answer, on both answer paths", () => {
		const warnings = [...ROUTE.matchAll(/warnings: \[\s*"([^"]+)"/g)].map(
			(m) => m[1],
		);
		const dwWarning = warnings.find((w) => /answerAsOf is null/.test(w));
		expect(dwWarning, "the deepwiki-path warning must survive").toBeTruthy();
		for (const field of ["scannedAt", "scannedRef", "lastCommitAt"])
			expect(dwWarning, `the warning must name ${field}`).toContain(field);
		// The note path states its precedence rule instead: the dated fact leads
		// and an appended walkthrough can lag it.
		const noteWarning = warnings.find((w) => /knowledge-note/.test(w));
		expect(noteWarning, "the note-path warning must exist").toBeTruthy();
		expect(noteWarning).toMatch(/dated fact/);
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
