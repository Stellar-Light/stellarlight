import { describe, expect, it } from "vitest";
import { MATCH_MODE_LABEL, type RepoMatchMode } from "../repo-search";

/**
 * Guard B, pinned as a unit test.
 *
 * Measured through the live Raven gateway, searchRepos answered the nonsense
 * query "zzqqxx nonexistent protocol 9999" with a real repo and NO marker
 * saying it was a neighbour rather than a hit — so an agent would report it as
 * a finding. searchProjects had already solved this with matchMode +
 * matchModeLabel; these assert repo search carries the same contract.
 */
describe("honest absence — repo search match modes", () => {
	it("every mode has a label", () => {
		const modes: RepoMatchMode[] = ["strict", "partial", "weak", "all", "none"];
		for (const m of modes) {
			expect(MATCH_MODE_LABEL[m], m).toBeTruthy();
		}
	});

	it("'weak' states plainly that these are NOT matches", () => {
		const l = MATCH_MODE_LABEL.weak.toLowerCase();
		// The whole point: an agent reading this must not treat rows as hits.
		expect(l).toContain("not");
		expect(l).toMatch(/neighbour|neighbor/);
		expect(l).toContain("verify");
	});

	it("'none' refuses to imply absence — a failure is not evidence", () => {
		expect(MATCH_MODE_LABEL.none.toLowerCase()).toContain("not evidence");
	});

	it("'strict' and 'weak' can never read the same to a caller", () => {
		expect(MATCH_MODE_LABEL.strict).not.toBe(MATCH_MODE_LABEL.weak);
	});
});
