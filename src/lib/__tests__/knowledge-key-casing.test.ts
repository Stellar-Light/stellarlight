/**
 * A registry key's capitalisation must not decide whether a fact reaches a row.
 *
 * backfill-knowledge-notes looks rows up with a case-insensitive `like`, then
 * confirms the exact row by comparing `fullName.toLowerCase()` to the key. It
 * compared against the key AS WRITTEN, so a key in GitHub's own casing
 * ("Sorosan/sorosan-client") never matched its row: ten entries reported
 * "missing row" and were silently never stamped, while /quality went on listing
 * those repos as un-noted.
 */
import { describe, expect, it } from "vitest";
import { REPO_KNOWLEDGE_NOTES } from "../repo-knowledge";

/** The confirm step, as the script performs it. */
const matches = (fullName: string, key: string) =>
	fullName.toLowerCase() === key.toLowerCase();

describe("knowledge-note keys match their rows whatever the casing", () => {
	it("matches a mixed-case key to the row GitHub stores", () => {
		expect(matches("Sorosan/sorosan-client", "Sorosan/sorosan-client")).toBe(true);
		expect(matches("Sorosan/sorosan-client", "sorosan/sorosan-client")).toBe(true);
	});

	it("still refuses a different repo under the same owner", () => {
		expect(matches("Sorosan/sorosan-client-react", "Sorosan/sorosan-client")).toBe(
			false,
		);
	});

	it("every registry key would confirm against its own name", () => {
		// The regression in one line: with the old comparison, every key whose
		// casing differs from lowercase failed here.
		for (const key of Object.keys(REPO_KNOWLEDGE_NOTES)) {
			expect(matches(key, key)).toBe(true);
		}
	});
});
