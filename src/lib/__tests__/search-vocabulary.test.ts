import { describe, expect, it } from "vitest";
import { BUILDER_SYNONYMS } from "../builder-vocabulary";
import { SYNONYMS as PROJECT_SYNONYMS } from "../project-search-match";
import { SYNONYMS as REPO_SYNONYMS } from "../repo-search";
import { BUILDER_CORE_VERTICALS, CORE_VERTICALS } from "../search-vocabulary";

// The shared-synonym-registry guard: a vocabulary lesson taught to one
// surface and not the others is the standing retrieval-miss generator.
// These tests make the omission a CI failure instead of a future incident.
describe("search-vocabulary key coverage", () => {
	for (const v of CORE_VERTICALS) {
		it(`project search expands core vertical '${v}'`, () => {
			expect(PROJECT_SYNONYMS[v]).toBeDefined();
			expect(PROJECT_SYNONYMS[v].length).toBeGreaterThan(0);
		});
		it(`repo search expands core vertical '${v}'`, () => {
			expect(REPO_SYNONYMS[v]).toBeDefined();
			expect(REPO_SYNONYMS[v].length).toBeGreaterThan(0);
		});
	}
	for (const v of BUILDER_CORE_VERTICALS) {
		it(`builders search expands skill vertical '${v}'`, () => {
			expect(BUILDER_SYNONYMS[v]).toBeDefined();
			expect(BUILDER_SYNONYMS[v].length).toBeGreaterThan(0);
		});
	}
});
