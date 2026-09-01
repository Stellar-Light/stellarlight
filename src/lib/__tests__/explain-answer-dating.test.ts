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

	// The ternary grew a third arm (sls-080: a curated dated note LEADS when it
	// names the exact identifier asked about). The #1134 semantics must SURVIVE
	// the growth: deepwiki still yields null, the scan arm still dates only from
	// the scan — and the new note arm dates only from the note's own asOf.
	const TERNARY =
		/answerAsOf:\s*noteAnswer\s*\?\s*([^:]+):\s*dwAnswer\s*\?\s*([^:]+):\s*scanAnswer\s*\?\s*([^:]+):\s*null/.exec(
			ROUTE.replace(/\n/g, " "),
		);

	it("answerAsOf is null on the deepwiki path — an admission, not a guess", () => {
		// A fabricated timestamp here would be worse than the original defect:
		// it makes an unknown look measured.
		expect(TERNARY, "the three-armed answerAsOf ternary must be present").toBeTruthy();
		expect((TERNARY?.[2] ?? "").trim()).toBe("null");
	});

	it("the scan arm dates from the scan, the note arm from the note, and nothing else", () => {
		// The audit's point stands: constrain EVERY arm, or the precise wrong
		// timestamp #1134 was about sneaks in through an unpinned one.
		const noteArm = (TERNARY?.[1] ?? "").trim();
		const scanArm = (TERNARY?.[3] ?? "").trim();
		expect(noteArm).toMatch(/directNote\?\.asOf/);
		expect(noteArm).not.toMatch(/scannedAt|lastCommitAt|generatedAt/);
		expect(scanArm).toMatch(/scannedAt/);
		expect(scanArm).not.toMatch(/lastCommitAt|generatedAt/);
	});

	it("never dates a deepwiki answer from the scan", () => {
		// The deepwiki arm must not be able to reach any scan date.
		const dwArm = (TERNARY?.[2] ?? "MISSING").trim();
		expect(dwArm).not.toMatch(/scannedAt|lastCommitAt|generatedAt/);
		expect(dwArm).not.toBe("MISSING");
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
