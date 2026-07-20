import { describe, expect, it } from "vitest";
import { BUILDER_SYNONYMS } from "../builder-vocabulary";
import { SYNONYMS as PROJECT_SYNONYMS } from "../project-search-match";
import { SYNONYMS as REPO_SYNONYMS } from "../repo-search";
import {
	BUILDER_CORE_VERTICALS,
	CORE_SYNONYMS,
	CORE_VERTICALS,
	mergeVocabulary,
} from "../search-vocabulary";

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

// Registry phase (ideas/shared-synonym-registry.md, value merge): every
// CORE_SYNONYMS expansion must actually reach both content surfaces — not
// just the key. This is what makes "add the lesson once" true.
describe("core expansions reach every content surface", () => {
	for (const [key, values] of Object.entries(CORE_SYNONYMS)) {
		it(`'${key}' core values present on project + repo search`, () => {
			for (const v of values) {
				expect(PROJECT_SYNONYMS[key]).toContain(v);
				expect(REPO_SYNONYMS[key]).toContain(v);
			}
		});
	}
	// Builders merges only its own key subset; the skill verticals it owes
	// must carry the full core entry where one exists.
	for (const v of BUILDER_CORE_VERTICALS) {
		it(`builders '${v}' carries the core expansion`, () => {
			for (const val of CORE_SYNONYMS[v] ?? []) {
				expect(BUILDER_SYNONYMS[v]).toContain(val);
			}
		});
	}
});

// Deliberate per-surface divergence must survive the merge — an overlay
// EXTENDS core, never gets replaced by it.
describe("surface-specific vocabulary preserved", () => {
	it("project wallet keeps custody vocabulary", () => {
		for (const v of ["custody", "signer", "keystore"])
			expect(PROJECT_SYNONYMS.wallet).toContain(v);
	});
	it("repo wallet keeps keypair/passkey vocabulary", () => {
		for (const v of ["keypair", "signer", "passkey"])
			expect(REPO_SYNONYMS.wallet).toContain(v);
	});
	it("repo-only loose terms stay off the project surface", () => {
		// "client"/"proof" are safe under repo word-boundary matching but too
		// loose for project substring matching — they must not leak into core.
		expect(PROJECT_SYNONYMS.sdk).not.toContain("client");
		expect(PROJECT_SYNONYMS.zk ?? []).not.toContain("proof");
	});
	it("project sls-050 rename continuity intact", () => {
		expect(PROJECT_SYNONYMS.vibrant).toContain("vesseo");
		expect(PROJECT_SYNONYMS.vesseo).toContain("vibrant");
	});
	it("builders keeps regional payment rails", () => {
		for (const v of ["boleto", "pix", "pagamento"])
			expect(BUILDER_SYNONYMS.payments).toContain(v);
	});
});

describe("mergeVocabulary", () => {
	it("unions overlay onto core without dropping either side", () => {
		const merged = mergeVocabulary(
			{ a: ["x", "y"], b: ["z"] },
			{ a: ["y", "w"], c: ["q"] },
		);
		expect(merged.a).toEqual(["x", "y", "w"]);
		expect(merged.b).toEqual(["z"]);
		expect(merged.c).toEqual(["q"]);
	});
});
